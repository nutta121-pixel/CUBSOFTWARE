const { app, BrowserWindow, ipcMain, Tray, Menu, dialog, shell, Notification, globalShortcut, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const DiscordRPC = require('discord-rpc');
const { autoUpdater } = require('electron-updater');

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
    process.exit(0);
}

app.on('second-instance', () => {
    if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
    }
});

// Ensure Discord IPC socket is discoverable on Linux (including Flatpak/Snap installs)
if (process.platform === 'linux') {
    if (!process.env.XDG_RUNTIME_DIR) {
        process.env.XDG_RUNTIME_DIR = `/run/user/${process.getuid()}`;
    }
}

function ensureLinuxDiscordSockets() {
    if (process.platform !== 'linux') return;
    const xdgDir = process.env.XDG_RUNTIME_DIR;
    const altPrefixes = [
        path.join(xdgDir, 'app', 'com.discordapp.Discord'),
        path.join(xdgDir, 'app', 'com.discordapp.DiscordPTB'),
        path.join(xdgDir, 'app', 'com.discordapp.DiscordCanary'),
        path.join(xdgDir, 'snap.discord'),
    ];
    for (let i = 0; i < 10; i++) {
        const socketName = `discord-ipc-${i}`;
        const standardPath = path.join(xdgDir, socketName);
        try { fs.accessSync(standardPath); continue; } catch (e) {}
        for (const prefix of altPrefixes) {
            const altPath = path.join(prefix, socketName);
            try {
                fs.accessSync(altPath);
                try { fs.unlinkSync(standardPath); } catch (e) {}
                fs.symlinkSync(altPath, standardPath);
                break;
            } catch (e) {}
        }
    }
}

let mainWindow = null;
let tray = null;
let rpcClient = null;
let currentActivity = null;
let isConnected = false;

// Reconnect state
let reconnectTimer = null;
let reconnectAttempts = 0;
let isManualDisconnect = false;
let isConnecting = false;
const MAX_RECONNECT_ATTEMPTS = 10;

// Keepalive
let keepaliveTimer = null;
const KEEPALIVE_INTERVAL = 60000;

// Party state
let currentPartyId = null;

// Rotation state
let rotationTimer = null;
let rotationIndex = 0;
let rotationProfiles = [];

// Timestamps
const appStartTime = Date.now();
let connectionTime = null;
let lastUpdateTime = null;

// File paths
const settingsPath     = path.join(app.getPath('userData'), 'settings.json');
const presencePath     = path.join(app.getPath('userData'), 'saved-presence.json');
const profilesPath     = path.join(app.getPath('userData'), 'profiles.json');
const historyPath      = path.join(app.getPath('userData'), 'history.json');
const windowBoundsPath = path.join(app.getPath('userData'), 'window-bounds.json');

// Default settings
const defaultSettings = {
    runOnStartup: false,
    startMinimized: false,
    autoConnect: false,
    checkUpdatesOnStartup: true,
    autoDownloadUpdates: false,
    minimizeToTray: true,
    showNotifications: true,
    savePresenceOnClose: true,
    savedClientId: '',
    theme: 'dark',
    // New in 1.3.2
    autoReconnect: true,
    globalHotkeyConnect: 'Ctrl+Shift+C',
    globalHotkeyDisconnect: 'Ctrl+Shift+D',
    alwaysOnTop: false,
    trayOnlyMode: false,
    compactMode: false,
    fontSize: 'normal',
    accentColor: '#5865f2',
    opacity: 100,
    collapsedSections: [],
    previewAppName: ''
};

let settings = { ...defaultSettings };

// ─── Settings ─────────────────────────────────────────────────────────────────

function loadSettings() {
    try {
        if (fs.existsSync(settingsPath)) {
            const data = fs.readFileSync(settingsPath, 'utf8');
            settings = { ...defaultSettings, ...JSON.parse(data) };
        }
    } catch (e) {
        console.error('Failed to load settings:', e);
        settings = { ...defaultSettings };
    }
    app.setLoginItemSettings({ openAtLogin: settings.runOnStartup, path: app.getPath('exe') });
    return settings;
}

function saveSettings() {
    try {
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
        app.setLoginItemSettings({ openAtLogin: settings.runOnStartup, path: app.getPath('exe') });
    } catch (e) {
        console.error('Failed to save settings:', e);
    }
}

// ─── Persistence helpers ───────────────────────────────────────────────────────

function loadSavedPresence() {
    try {
        if (fs.existsSync(presencePath)) return JSON.parse(fs.readFileSync(presencePath, 'utf8'));
    } catch (e) {}
    return null;
}

function savePresence(clientId, activity) {
    try { fs.writeFileSync(presencePath, JSON.stringify({ clientId, activity }, null, 2)); } catch (e) {}
}

function loadProfiles() {
    try {
        if (fs.existsSync(profilesPath)) return JSON.parse(fs.readFileSync(profilesPath, 'utf8'));
    } catch (e) {}
    return {};
}

function saveProfiles(profiles) {
    try { fs.writeFileSync(profilesPath, JSON.stringify(profiles, null, 2)); } catch (e) {}
}

function loadHistory() {
    try {
        if (fs.existsSync(historyPath)) return JSON.parse(fs.readFileSync(historyPath, 'utf8'));
    } catch (e) {}
    return [];
}

function addToHistory(entry) {
    let history = loadHistory();
    // Dedupe by clientId + details
    history = history.filter(h =>
        !(h.clientId === entry.clientId &&
          h.activity?.details === entry.activity?.details &&
          h.activity?.state === entry.activity?.state)
    );
    history.unshift({ ...entry, timestamp: Date.now() });
    history = history.slice(0, 10);
    try { fs.writeFileSync(historyPath, JSON.stringify(history, null, 2)); } catch (e) {}
    return history;
}

function loadWindowBounds() {
    try {
        if (fs.existsSync(windowBoundsPath)) return JSON.parse(fs.readFileSync(windowBoundsPath, 'utf8'));
    } catch (e) {}
    return null;
}

function saveWindowBounds() {
    if (!mainWindow || mainWindow.isMaximized() || mainWindow.isMinimized()) return;
    try { fs.writeFileSync(windowBoundsPath, JSON.stringify(mainWindow.getBounds(), null, 2)); } catch (e) {}
}

// ─── Auto-updater ─────────────────────────────────────────────────────────────

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.verifyUpdateCodeSignature = false;

autoUpdater.on('checking-for-update', () => {
    sendToRenderer('update-status', { status: 'checking' });
});

autoUpdater.on('update-available', (info) => {
    sendToRenderer('update-status', { status: 'available', version: info.version });
    if (settings.autoDownloadUpdates) {
        autoUpdater.downloadUpdate().catch(e => sendToRenderer('update-status', { status: 'error', message: e.message }));
        sendToRenderer('update-status', { status: 'downloading', version: info.version });
    } else {
        const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
        dialog.showMessageBox(win, {
            type: 'info',
            title: 'Update Available',
            message: `CubPresence v${info.version} is available!`,
            detail: 'Would you like to download and install it now?',
            buttons: ['Download', 'Later'],
            defaultId: 0
        }).then(result => {
            if (result.response === 0) {
                autoUpdater.downloadUpdate().catch(e => sendToRenderer('update-status', { status: 'error', message: e.message }));
                sendToRenderer('update-status', { status: 'downloading', version: info.version });
            }
        });
    }
});

autoUpdater.on('update-not-available', () => {
    sendToRenderer('update-status', { status: 'up-to-date' });
});

autoUpdater.on('download-progress', (progress) => {
    sendToRenderer('update-status', { status: 'downloading', percent: Math.round(progress.percent) });
});

autoUpdater.on('update-downloaded', (info) => {
    sendToRenderer('update-status', { status: 'ready', version: info.version });
    const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
    dialog.showMessageBox(win, {
        type: 'info',
        title: 'Update Ready',
        message: 'Update downloaded!',
        detail: 'The update will be installed when you restart CubPresence. Restart now?',
        buttons: ['Restart Now', 'Later'],
        defaultId: 0
    }).then(async result => {
        if (result.response === 0) {
            app.isQuitting = true;
            if (rpcClient) { try { await rpcClient.destroy(); } catch (e) {} rpcClient = null; }
            setImmediate(() => autoUpdater.quitAndInstall(false, true));
        }
    });
});

autoUpdater.on('error', (error) => {
    sendToRenderer('update-status', { status: 'error', message: error.message });
});

// ─── Tray ─────────────────────────────────────────────────────────────────────

function getTrayIconPath(connected) {
    const connectedIcon = path.join(__dirname, 'assets', 'icon-connected.png');
    const defaultIcon   = path.join(__dirname, 'assets', 'icon.png');
    return (connected && fs.existsSync(connectedIcon)) ? connectedIcon : defaultIcon;
}

function updateTrayIcon(connected) {
    if (!tray) return;
    try {
        tray.setImage(getTrayIconPath(connected));
        tray.setToolTip(connected ? 'CubPresence — Connected' : 'CubPresence');
    } catch (e) {}
}

function updateTray() {
    if (!tray) return;
    const contextMenu = Menu.buildFromTemplate([
        { label: 'Open CubPresence', click: () => mainWindow && mainWindow.show() },
        { type: 'separator' },
        { label: isConnected ? '● Connected' : '○ Not Connected', enabled: false },
        { type: 'separator' },
        {
            label: 'Quick Connect',
            click: () => {
                if (!settings.trayOnlyMode) mainWindow && mainWindow.show();
                sendToRenderer('quick-connect', { savedClientId: settings.savedClientId });
            },
            enabled: !isConnected && !!settings.savedClientId
        },
        { label: 'Disconnect', click: async () => { await disconnect(); }, enabled: isConnected },
        { type: 'separator' },
        { label: 'Check for Updates', click: () => autoUpdater.checkForUpdates().catch(() => {}) },
        { type: 'separator' },
        { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } }
    ]);
    tray.setContextMenu(contextMenu);
}

function createTray() {
    try {
        tray = new Tray(getTrayIconPath(false));
    } catch (e) {
        console.log('Tray icon not found, skipping tray');
        return;
    }
    updateTray();
    tray.setToolTip('CubPresence');
    tray.on('click', () => {
        if (mainWindow) {
            if (mainWindow.isVisible()) mainWindow.hide();
            else mainWindow.show();
        }
    });
}

// ─── Window ───────────────────────────────────────────────────────────────────

function createWindow() {
    loadSettings();

    const savedBounds = loadWindowBounds();
    let bounds = savedBounds || { width: 1000, height: 750 };
    if (savedBounds) {
        const onScreen = screen.getAllDisplays().some(d =>
            savedBounds.x >= d.bounds.x - 50 &&
            savedBounds.y >= d.bounds.y - 50 &&
            savedBounds.x < d.bounds.x + d.bounds.width &&
            savedBounds.y < d.bounds.y + d.bounds.height
        );
        if (!onScreen) bounds = { width: 1000, height: 750 };
    }

    mainWindow = new BrowserWindow({
        ...bounds,
        minWidth: 700,
        minHeight: 550,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        },
        icon: path.join(__dirname, 'assets', 'icon.png'),
        title: 'CubPresence',
        autoHideMenuBar: true,
        backgroundColor: '#0a0a1a',
        show: !settings.startMinimized && !settings.trayOnlyMode,
        alwaysOnTop: settings.alwaysOnTop || false,
        opacity: (settings.opacity || 100) / 100
    });

    mainWindow.loadFile('renderer/index.html');


    mainWindow.once('ready-to-show', () => {
        if (!settings.startMinimized && !settings.trayOnlyMode) mainWindow.show();
    });

    mainWindow.on('resize', saveWindowBounds);
    mainWindow.on('move', saveWindowBounds);

    mainWindow.on('close', (event) => {
        saveWindowBounds();
        if (!app.isQuitting) {
            if (settings.minimizeToTray || settings.trayOnlyMode) {
                event.preventDefault();
                mainWindow.hide();
            }
            if (settings.savePresenceOnClose && currentActivity && settings.savedClientId) {
                savePresence(settings.savedClientId, currentActivity);
            }
        }
    });
}

// ─── Keepalive ────────────────────────────────────────────────────────────────

function startKeepalive() {
    stopKeepalive();
    keepaliveTimer = setInterval(async () => {
        if (!isConnected || !rpcClient || isManualDisconnect || app.isQuitting) return;
        try {
            const activity = (rotationProfiles.length > 0 && rotationProfiles[rotationIndex]?.activity)
                ? rotationProfiles[rotationIndex].activity
                : currentActivity;
            if (activity) await setActivity(activity);
        } catch (e) {
            // Connection is dead — trigger reconnect
            isConnected = false;
            rpcClient = null;
            updateTray();
            if (settings.autoReconnect) scheduleReconnect();
            else sendToRenderer('status', { state: 'disconnected', message: 'Lost connection to Discord' });
            stopKeepalive();
        }
    }, KEEPALIVE_INTERVAL);
}

function stopKeepalive() {
    if (keepaliveTimer) { clearInterval(keepaliveTimer); keepaliveTimer = null; }
}

// ─── Auto-reconnect ───────────────────────────────────────────────────────────

function scheduleReconnect() {
    if (reconnectTimer || !settings.autoReconnect || app.isQuitting) return;
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        sendToRenderer('status', { state: 'error', message: `Auto-reconnect failed after ${MAX_RECONNECT_ATTEMPTS} attempts` });
        reconnectAttempts = 0;
        return;
    }
    reconnectAttempts++;
    const delay = Math.min(5000 * reconnectAttempts, 30000);
    sendToRenderer('status', {
        state: 'connecting',
        message: `Disconnected — reconnecting in ${delay / 1000}s (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`
    });
    reconnectTimer = setTimeout(async () => {
        reconnectTimer = null;
        if (!isConnected && settings.savedClientId && settings.autoReconnect) {
            const saved = loadSavedPresence();
            if (saved) await connect(settings.savedClientId, saved.activity || {});
        }
    }, delay);
}

// ─── Discord RPC ──────────────────────────────────────────────────────────────

async function connect(clientId, activity) {
    if (isConnecting) return;
    isConnecting = true;
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    currentPartyId = null;

    try {
        if (rpcClient) {
            isManualDisconnect = true;
            try { await rpcClient.destroy(); } catch (e) {}
            rpcClient = null;
            isManualDisconnect = false;
        }

        settings.savedClientId = clientId;
        saveSettings();

        sendToRenderer('status', { state: 'connecting', message: 'Connecting to Discord...' });

        rpcClient = new DiscordRPC.Client({ transport: 'ipc' });

        rpcClient.on('ready', async () => {
            isConnected = true;
            connectionTime = Date.now();
            reconnectAttempts = 0;
            currentActivity = activity;

            await setActivity(activity);
            startKeepalive();

            sendToRenderer('status', { state: 'connected', message: 'Connected to Discord!', connectionTime });
            sendToRenderer('timestamps', { connectionTime, appStartTime });
            updateTray();
            updateTrayIcon(true);

            if (activity) {
                const history = addToHistory({ clientId, activity });
                sendToRenderer('history-updated', history);
            }

            if (settings.showNotifications && Notification.isSupported()) {
                new Notification({ title: 'CubPresence', body: 'Connected to Discord!' }).show();
            }
        });

        rpcClient.on('disconnected', () => {
            const wasConnected = isConnected;
            isConnected = false;
            connectionTime = null;
            currentPartyId = null;
            rpcClient = null;
            stopKeepalive();
            updateTrayIcon(false);
            updateTray();
            // If we were never fully connected, the catch block handles reconnect — don't double-schedule
            if (!wasConnected) return;
            if (settings.autoReconnect && !app.isQuitting && !isManualDisconnect) {
                scheduleReconnect();
            } else {
                sendToRenderer('status', { state: 'disconnected', message: 'Disconnected from Discord' });
            }
        });

        ensureLinuxDiscordSockets();
        await rpcClient.login({ clientId });

    } catch (error) {
        isConnected = false;
        connectionTime = null;
        rpcClient = null;
        updateTrayIcon(false);
        updateTray();
        if (settings.autoReconnect && !app.isQuitting && !isManualDisconnect) {
            scheduleReconnect();
        } else {
            sendToRenderer('status', { state: 'error', message: error.message || 'Failed to connect. Make sure Discord is running.' });
        }
    } finally {
        isConnecting = false;
    }
}

const PLACEHOLDER_MAP = {
    '{time}':    () => new Date().toLocaleTimeString(),
    '{date}':    () => new Date().toLocaleDateString(),
    '{day}':     () => new Date().toLocaleDateString('en', { weekday: 'long' }),
    '{month}':   () => new Date().toLocaleDateString('en', { month: 'long' }),
    '{year}':        () => new Date().getFullYear().toString(),
    '{day_num}':     () => { const d = new Date().getDate(); const s = ['th','st','nd','rd']; const v = d % 100; return d + (s[(v-20)%10] || s[v] || s[0]); },
    '{day_short}':   () => new Date().toLocaleDateString('en', { weekday: 'short' }),
    '{month_short}': () => new Date().toLocaleDateString('en', { month: 'short' }),
    '{month_num}':   () => (new Date().getMonth() + 1).toString(),
    '{timezone}':    () => new Date().toLocaleTimeString('en', { timeZoneName: 'short' }).split(' ').pop(),
    '{ampm}':        () => new Date().getHours() >= 12 ? 'PM' : 'AM',
    '{hour}':        () => (new Date().getHours() % 12 || 12).toString(),
    '{hour24}':      () => new Date().getHours().toString(),
    '{weeknum}': () => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() + 4 - (d.getDay() || 7));
        const yearStart = new Date(d.getFullYear(), 0, 1);
        return Math.ceil((((d - yearStart) / 86400000) + 1) / 7).toString();
    }
};

function resolvePlaceholders(text) {
    if (!text) return text;
    let out = text;
    for (const [k, fn] of Object.entries(PLACEHOLDER_MAP)) out = out.split(k).join(fn());
    return out;
}

async function setActivity(activity) {
    if (!activity) return false;
    if (!rpcClient || !isConnected) return false;
    try {
        const rpcActivity = {};
        rpcActivity.type = activity.type || 0;
        if (activity.type === 1 && activity.stream_url) rpcActivity.url = activity.stream_url;
        if (activity.details) rpcActivity.details = resolvePlaceholders(activity.details);
        if (activity.state) rpcActivity.state = resolvePlaceholders(activity.state);

        const tsType = activity.timestamps_type;
        if (tsType === 'elapsed' || tsType === 'since_update') {
            rpcActivity.startTimestamp = Date.now();
        } else if (tsType === 'since_connection' && connectionTime) {
            rpcActivity.startTimestamp = connectionTime;
        } else if (tsType === 'since_app_start') {
            rpcActivity.startTimestamp = appStartTime;
        } else if (tsType === 'local_time') {
            const now = new Date();
            rpcActivity.startTimestamp = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        } else if (tsType === 'countdown') {
            const countdownEnd = activity.countdown_end;
            rpcActivity.endTimestamp = (countdownEnd && countdownEnd > Date.now())
                ? countdownEnd
                : (Date.now() + 3600000);
        } else if (tsType === 'custom') {
            if (activity.start_timestamp) rpcActivity.startTimestamp = activity.start_timestamp * 1000;
            if (activity.end_timestamp) rpcActivity.endTimestamp = activity.end_timestamp * 1000;
        }

        if (activity.large_image_key) {
            rpcActivity.largeImageKey = activity.large_image_key;
            if (activity.large_image_text) rpcActivity.largeImageText = activity.large_image_text;
        }
        if (activity.small_image_key) {
            rpcActivity.smallImageKey = activity.small_image_key;
            if (activity.small_image_text) rpcActivity.smallImageText = activity.small_image_text;
        }

        const buttons = [];
        if (activity.button1_label && activity.button1_url) buttons.push({ label: activity.button1_label, url: activity.button1_url });
        if (activity.button2_label && activity.button2_url) buttons.push({ label: activity.button2_label, url: activity.button2_url });
        if (buttons.length > 0) rpcActivity.buttons = buttons;

        if (activity.party_size > 0 && activity.party_max > 0) {
            if (!currentPartyId) currentPartyId = 'cubpresence_' + Date.now();
            rpcActivity.partyId = currentPartyId;
            rpcActivity.partySize = activity.party_size;
            rpcActivity.partyMax = activity.party_max;
        }

        await rpcClient.setActivity(rpcActivity);
        currentActivity = activity;
        lastUpdateTime = Date.now();

        if (settings.savePresenceOnClose) savePresence(settings.savedClientId, activity);

    } catch (error) {
        // Use 'activity-error' state so the renderer shows the message but does NOT
        // call setDisconnectedUI() — the RPC connection is still alive.
        sendToRenderer('status', { state: 'activity-error', message: 'Failed to set activity: ' + error.message });
        return false;
    }
    return true;
}

async function disconnect() {
    isManualDisconnect = true;
    try {
        stopKeepalive();
        if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
        reconnectAttempts = 0;
        if (rpcClient) {
            try { await rpcClient.clearActivity(); await rpcClient.destroy(); } catch (e) {}
            rpcClient = null;
        }
        isConnected = false;
        connectionTime = null;
        currentActivity = null;
        currentPartyId = null;
    } finally {
        isManualDisconnect = false;
        updateTrayIcon(false);
        sendToRenderer('status', { state: 'disconnected', message: 'Disconnected from Discord' });
        updateTray();
    }
}

// ─── Rotation ─────────────────────────────────────────────────────────────────

function stopRotation() {
    if (rotationTimer) { clearInterval(rotationTimer); rotationTimer = null; }
    rotationProfiles = [];
    rotationIndex = 0;
}

// ─── Global hotkeys ───────────────────────────────────────────────────────────

function registerHotkeys() {
    unregisterHotkeys();
    if (settings.globalHotkeyConnect) {
        try {
            globalShortcut.register(settings.globalHotkeyConnect, async () => {
                if (!isConnected && settings.savedClientId) {
                    const saved = loadSavedPresence();
                    if (saved) await connect(settings.savedClientId, saved.activity || {});
                }
            });
        } catch (e) { console.log('Could not register connect hotkey:', settings.globalHotkeyConnect); }
    }
    if (settings.globalHotkeyDisconnect) {
        try {
            globalShortcut.register(settings.globalHotkeyDisconnect, async () => {
                if (isConnected) await disconnect();
            });
        } catch (e) { console.log('Could not register disconnect hotkey:', settings.globalHotkeyDisconnect); }
    }
}

function unregisterHotkeys() {
    try { globalShortcut.unregisterAll(); } catch (e) {}
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function sendToRenderer(channel, data) {
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
        mainWindow.webContents.send(channel, data);
    }
}

// ─── IPC Handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('connect', async (event, { clientId, activity }) => { await connect(clientId, activity); });
ipcMain.handle('disconnect', async () => { await disconnect(); });
ipcMain.handle('update-activity', async (event, activity) => { if (isConnected) return await setActivity(activity); return false; });

ipcMain.handle('get-status', () => ({ connected: isConnected, activity: currentActivity, connectionTime, appStartTime, lastUpdateTime }));
ipcMain.handle('get-timestamps', () => ({ appStartTime, connectionTime, lastUpdateTime }));

ipcMain.handle('get-settings', () => settings);
ipcMain.handle('save-settings', (event, newSettings) => {
    settings = { ...settings, ...newSettings };
    saveSettings();
    if (newSettings.globalHotkeyConnect !== undefined || newSettings.globalHotkeyDisconnect !== undefined) registerHotkeys();
    if (newSettings.alwaysOnTop !== undefined && mainWindow && !mainWindow.isDestroyed()) mainWindow.setAlwaysOnTop(newSettings.alwaysOnTop);
    if (newSettings.opacity !== undefined && mainWindow && !mainWindow.isDestroyed()) mainWindow.setOpacity(newSettings.opacity / 100);
    if (newSettings.autoReconnect === false && reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
        reconnectAttempts = 0;
        sendToRenderer('status', { state: 'disconnected', message: 'Disconnected from Discord' });
    }
    return settings;
});

ipcMain.handle('get-saved-presence', () => loadSavedPresence());

// Profiles
ipcMain.handle('get-profiles', () => loadProfiles());
ipcMain.handle('save-profile', (event, { name, data }) => {
    const profiles = loadProfiles();
    profiles[name] = { ...data, savedAt: Date.now() };
    saveProfiles(profiles);
    return profiles;
});
ipcMain.handle('delete-profile', (event, name) => {
    const profiles = loadProfiles();
    delete profiles[name];
    saveProfiles(profiles);
    return profiles;
});
ipcMain.handle('rename-profile', (event, { oldName, newName }) => {
    const profiles = loadProfiles();
    if (!profiles[oldName]) return profiles;
    profiles[newName] = profiles[oldName];
    delete profiles[oldName];
    saveProfiles(profiles);
    return profiles;
});
ipcMain.handle('duplicate-profile', (event, { name, newName }) => {
    const profiles = loadProfiles();
    if (!profiles[name]) return profiles;
    profiles[newName] = { ...JSON.parse(JSON.stringify(profiles[name])), savedAt: Date.now() };
    saveProfiles(profiles);
    return profiles;
});
ipcMain.handle('export-profiles', async () => {
    if (!mainWindow || mainWindow.isDestroyed()) return { success: false, error: 'Window not available' };
    const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Export Profiles',
        defaultPath: 'cubpresence-profiles.json',
        filters: [{ name: 'JSON Files', extensions: ['json'] }]
    });
    if (!result.canceled && result.filePath) {
        try {
            fs.writeFileSync(result.filePath, JSON.stringify(loadProfiles(), null, 2));
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }
    return { success: false };
});
ipcMain.handle('import-profiles', async () => {
    if (!mainWindow || mainWindow.isDestroyed()) return { success: false, error: 'Window not available' };
    const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Import Profiles',
        filters: [{ name: 'JSON Files', extensions: ['json'] }],
        properties: ['openFile']
    });
    if (!result.canceled && result.filePaths[0]) {
        try {
            const imported = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf8'));
            const merged = { ...loadProfiles(), ...imported };
            saveProfiles(merged);
            return { success: true, profiles: merged };
        } catch (e) { return { success: false, error: e.message }; }
    }
    return { success: false };
});

// History
ipcMain.handle('get-history', () => loadHistory());
ipcMain.handle('clear-history', () => {
    try { fs.writeFileSync(historyPath, '[]'); } catch (e) {}
    return [];
});

// Rotation
ipcMain.handle('start-rotation', async (event, { profiles: profileNames, interval }) => {
    if (!isConnected) return false;
    stopRotation();
    const allProfiles = loadProfiles();
    rotationProfiles = profileNames.map(n => allProfiles[n]).filter(Boolean);
    rotationIndex = 0;
    if (rotationProfiles.length < 2) return false;
    // Apply first profile immediately
    const first = rotationProfiles[0];
    if (first && first.activity) await setActivity(first.activity);
    sendToRenderer('rotation-advance', { activity: first.activity, clientId: first.clientId, index: 0, total: rotationProfiles.length });
    rotationTimer = setInterval(async () => {
        rotationIndex = (rotationIndex + 1) % rotationProfiles.length;
        const profile = rotationProfiles[rotationIndex];
        if (profile) {
            if (isConnected && profile.activity) await setActivity(profile.activity);
            sendToRenderer('rotation-advance', { activity: profile.activity, clientId: profile.clientId, index: rotationIndex, total: rotationProfiles.length });
        }
    }, interval * 1000);
    return true;
});
ipcMain.handle('stop-rotation', () => { stopRotation(); return true; });

// Window controls
ipcMain.handle('set-always-on-top', (event, value) => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setAlwaysOnTop(value); });
ipcMain.handle('set-opacity', (event, value) => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setOpacity(value / 100); });

// Dialogs
ipcMain.handle('show-message-box', async (event, options) => {
    const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
    return dialog.showMessageBox(win, options);
});

// Updates
ipcMain.handle('check-for-updates', async () => {
    try { await autoUpdater.checkForUpdates(); return { success: true }; }
    catch (error) { return { success: false, error: error.message }; }
});
ipcMain.handle('install-update', () => {
    app.isQuitting = true;
    setImmediate(() => autoUpdater.quitAndInstall(true, true));
});
ipcMain.handle('get-version', () => app.getVersion());

// External links
ipcMain.handle('open-external', (event, url) => { return shell.openExternal(url).catch(() => {}); });

// DevTools (password checked in renderer)
ipcMain.handle('open-devtools', () => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.toggleDevTools(); });

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
    if (app.getLoginItemSettings().wasOpenedAtLogin) {
        await new Promise(resolve => setTimeout(resolve, 3000));
    }

    createWindow();
    createTray();
    registerHotkeys();

    if (settings.checkUpdatesOnStartup) {
        setTimeout(() => autoUpdater.checkForUpdates().catch(e => console.log('Update check failed:', e.message)), 3000);
    }

    if (settings.autoConnect && settings.savedClientId) {
        const saved = loadSavedPresence();
        if (saved && saved.activity) setTimeout(() => connect(settings.savedClientId, saved.activity), 2000);
    }

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
        else if (mainWindow) mainWindow.show();
    });
});

app.on('window-all-closed', () => { /* keep running in tray */ });

app.on('before-quit', async () => {
    app.isQuitting = true;
    unregisterHotkeys();
    stopRotation();
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    if (tray) { tray.destroy(); tray = null; }
    await disconnect();
});
