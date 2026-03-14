const { app, BrowserWindow, Tray, Menu, ipcMain, shell, nativeImage } = require('electron');
const path = require('path');
const Store = require('electron-store');
const AutoLaunch = require('auto-launch');
const DiscordRPC = require('discord-rpc');

// Configuration
const API_BASE = 'https://cubsoftware.site';
const DISCORD_CLIENT_ID = '1412661083759579303'; // CUBSOFTWARE bot client ID

// Store for persistent settings
const store = new Store({
    defaults: {
        accessToken: null,
        refreshToken: null,
        user: null,
        presenceEnabled: true,
        autoStart: false,
        minimizeToTray: true
    }
});

// Auto-launch setup
const autoLauncher = new AutoLaunch({
    name: 'CUBSOFTWARE',
    path: app.getPath('exe')
});

// Global references
let mainWindow = null;
let tray = null;
let rpc = null;
let presenceInterval = null;
let isQuitting = false;

// Create main window
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 450,
        height: 700,
        minWidth: 400,
        minHeight: 600,
        resizable: true,
        frame: false,
        transparent: false,
        backgroundColor: '#0a0a1a',
        icon: path.join(__dirname, '../assets/icon.png'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    mainWindow.loadFile(path.join(__dirname, 'index.html'));

    // Handle minimize to tray
    mainWindow.on('close', (event) => {
        if (!isQuitting && store.get('minimizeToTray')) {
            event.preventDefault();
            mainWindow.hide();
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// Create system tray
function createTray() {
    const iconPath = path.join(__dirname, '../assets/icon.png');
    let trayIcon;

    try {
        trayIcon = nativeImage.createFromPath(iconPath);
        if (trayIcon.isEmpty()) {
            // Create a simple colored icon if file not found
            trayIcon = nativeImage.createFromBuffer(Buffer.alloc(256));
        }
        trayIcon = trayIcon.resize({ width: 16, height: 16 });
    } catch (e) {
        trayIcon = nativeImage.createFromBuffer(Buffer.alloc(256));
    }

    tray = new Tray(trayIcon);

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Open CUBSOFTWARE',
            click: () => {
                if (mainWindow) {
                    mainWindow.show();
                    mainWindow.focus();
                } else {
                    createWindow();
                }
            }
        },
        {
            label: 'Toggle Presence',
            type: 'checkbox',
            checked: store.get('presenceEnabled'),
            click: (menuItem) => {
                store.set('presenceEnabled', menuItem.checked);
                if (menuItem.checked) {
                    connectRPC();
                } else {
                    disconnectRPC();
                }
                if (mainWindow) {
                    mainWindow.webContents.send('presence-toggled', menuItem.checked);
                }
            }
        },
        { type: 'separator' },
        {
            label: 'Open Website',
            click: () => {
                shell.openExternal(`${API_BASE}/apps/presence`);
            }
        },
        { type: 'separator' },
        {
            label: 'Quit',
            click: () => {
                isQuitting = true;
                app.quit();
            }
        }
    ]);

    tray.setToolTip('CUBSOFTWARE');
    tray.setContextMenu(contextMenu);

    tray.on('double-click', () => {
        if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
        } else {
            createWindow();
        }
    });
}

// Discord RPC connection
async function connectRPC() {
    if (rpc) {
        try {
            rpc.destroy();
        } catch (e) {}
    }

    const user = store.get('user');
    if (!user || !store.get('presenceEnabled')) {
        return;
    }

    try {
        // Fetch user's presence config from server
        const config = await fetchPresenceConfig();
        if (!config || !config.enabled) {
            console.log('Presence disabled or no config');
            return;
        }

        const clientId = config.application_id || DISCORD_CLIENT_ID;

        rpc = new DiscordRPC.Client({ transport: 'ipc' });

        rpc.on('ready', () => {
            console.log('Discord RPC connected');
            updatePresence(config);

            // Start polling for config updates
            if (presenceInterval) clearInterval(presenceInterval);
            presenceInterval = setInterval(async () => {
                const newConfig = await fetchPresenceConfig();
                if (newConfig && newConfig.enabled) {
                    updatePresence(newConfig);
                }
            }, 15000); // Poll every 15 seconds
        });

        rpc.on('disconnected', () => {
            console.log('Discord RPC disconnected');
            if (presenceInterval) {
                clearInterval(presenceInterval);
                presenceInterval = null;
            }
        });

        await rpc.login({ clientId });
    } catch (error) {
        console.error('Failed to connect to Discord RPC:', error.message);
        // Retry after delay
        setTimeout(connectRPC, 10000);
    }
}

function disconnectRPC() {
    if (presenceInterval) {
        clearInterval(presenceInterval);
        presenceInterval = null;
    }
    if (rpc) {
        try {
            rpc.clearActivity();
            rpc.destroy();
        } catch (e) {}
        rpc = null;
    }
}

async function fetchPresenceConfig() {
    const accessToken = store.get('accessToken');
    if (!accessToken) return null;

    try {
        const response = await fetch(`${API_BASE}/api/presence/config`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (response.status === 401) {
            // Token expired, try refresh
            const refreshed = await refreshAccessToken();
            if (refreshed) {
                return fetchPresenceConfig();
            }
            return null;
        }

        if (!response.ok) return null;
        return await response.json();
    } catch (error) {
        console.error('Failed to fetch presence config:', error);
        return null;
    }
}

async function refreshAccessToken() {
    const refreshToken = store.get('refreshToken');
    if (!refreshToken) return false;

    try {
        const response = await fetch(`${API_BASE}/api/auth/refresh`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ refresh_token: refreshToken })
        });

        if (!response.ok) return false;

        const data = await response.json();
        store.set('accessToken', data.access_token);
        if (data.refresh_token) {
            store.set('refreshToken', data.refresh_token);
        }
        return true;
    } catch (error) {
        console.error('Failed to refresh token:', error);
        return false;
    }
}

function updatePresence(config) {
    if (!rpc || !config) return;

    try {
        const activity = {
            details: config.details || undefined,
            state: config.state || undefined,
            timestamps: {},
            assets: {},
            buttons: []
        };

        // Timestamps
        if (config.show_elapsed_time && config.start_timestamp) {
            activity.timestamps.start = config.start_timestamp;
        }
        if (config.end_timestamp) {
            activity.timestamps.end = config.end_timestamp;
        }

        // Assets (images)
        if (config.large_image) {
            activity.assets.large_image = config.large_image;
            if (config.large_image_text) {
                activity.assets.large_text = config.large_image_text;
            }
        }
        if (config.small_image) {
            activity.assets.small_image = config.small_image;
            if (config.small_image_text) {
                activity.assets.small_text = config.small_image_text;
            }
        }

        // Buttons (max 2)
        if (config.button1_label && config.button1_url) {
            activity.buttons.push({
                label: config.button1_label,
                url: config.button1_url
            });
        }
        if (config.button2_label && config.button2_url) {
            activity.buttons.push({
                label: config.button2_label,
                url: config.button2_url
            });
        }

        // Clean up empty objects
        if (Object.keys(activity.timestamps).length === 0) delete activity.timestamps;
        if (Object.keys(activity.assets).length === 0) delete activity.assets;
        if (activity.buttons.length === 0) delete activity.buttons;

        // Set activity type (playing, streaming, listening, watching, competing)
        if (config.activity_type === 'streaming' && config.stream_url) {
            activity.type = 1; // Streaming
            activity.url = config.stream_url;
        }

        rpc.setActivity(activity);
        console.log('Presence updated:', activity);
    } catch (error) {
        console.error('Failed to update presence:', error);
    }
}

// IPC Handlers
ipcMain.handle('get-store', (event, key) => {
    return store.get(key);
});

ipcMain.handle('set-store', (event, key, value) => {
    store.set(key, value);
    return true;
});

ipcMain.handle('login', async (event, { accessToken, refreshToken, user }) => {
    store.set('accessToken', accessToken);
    store.set('refreshToken', refreshToken);
    store.set('user', user);

    // Connect RPC after login
    connectRPC();

    return true;
});

ipcMain.handle('logout', async () => {
    store.delete('accessToken');
    store.delete('refreshToken');
    store.delete('user');
    disconnectRPC();
    return true;
});

ipcMain.handle('get-api-base', () => {
    return API_BASE;
});

ipcMain.handle('toggle-presence', async (event, enabled) => {
    store.set('presenceEnabled', enabled);
    if (enabled) {
        connectRPC();
    } else {
        disconnectRPC();
    }
    return true;
});

ipcMain.handle('set-auto-start', async (event, enabled) => {
    store.set('autoStart', enabled);
    if (enabled) {
        await autoLauncher.enable();
    } else {
        await autoLauncher.disable();
    }
    return true;
});

ipcMain.handle('get-auto-start', async () => {
    return await autoLauncher.isEnabled();
});

ipcMain.handle('minimize-window', () => {
    if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('close-window', () => {
    if (mainWindow) mainWindow.close();
});

ipcMain.handle('open-external', (event, url) => {
    shell.openExternal(url);
});

ipcMain.handle('refresh-presence', async () => {
    const config = await fetchPresenceConfig();
    if (config && config.enabled && rpc) {
        updatePresence(config);
    }
    return true;
});

// App lifecycle
app.whenReady().then(() => {
    createWindow();
    createTray();

    // Auto-connect if user is logged in and presence is enabled
    if (store.get('user') && store.get('presenceEnabled')) {
        setTimeout(connectRPC, 2000);
    }

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        // Don't quit, stay in tray
    }
});

app.on('before-quit', () => {
    isQuitting = true;
    disconnectRPC();
});

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
        }
    });
}
