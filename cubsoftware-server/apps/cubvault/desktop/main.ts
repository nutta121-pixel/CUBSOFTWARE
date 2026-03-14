/**
 * CubVault - Electron Main Process
 * Desktop password manager by CUB Software
 */

import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, clipboard } from 'electron';
import * as path from 'path';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let clipboardClearTimer: NodeJS.Timeout | null = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        frame: false,
        titleBarStyle: 'hidden',
        backgroundColor: '#0a0a1a',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        },
        icon: path.join(__dirname, '../../assets/icon.png')
    });

    mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    mainWindow.on('minimize', (event: Event) => {
        // Could add lock-on-minimize feature here
    });
}

function createTray() {
    const iconPath = path.join(__dirname, '../../assets/icon.png');
    tray = new Tray(iconPath);

    const contextMenu = Menu.buildFromTemplate([
        { label: 'Show CubVault', click: () => mainWindow?.show() },
        { label: 'Lock Vault', click: () => mainWindow?.webContents.send('lock-vault') },
        { type: 'separator' },
        { label: 'Quit', click: () => app.quit() }
    ]);

    tray.setToolTip('CubVault - Password Manager');
    tray.setContextMenu(contextMenu);

    tray.on('click', () => {
        mainWindow?.show();
    });
}

app.whenReady().then(() => {
    createWindow();
    createTray();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// IPC Handlers for window controls
ipcMain.on('window-minimize', () => {
    mainWindow?.minimize();
});

ipcMain.on('window-maximize', () => {
    if (mainWindow?.isMaximized()) {
        mainWindow.unmaximize();
    } else {
        mainWindow?.maximize();
    }
});

ipcMain.on('window-close', () => {
    mainWindow?.close();
});

// Clipboard handling with auto-clear
ipcMain.on('copy-to-clipboard', (event, { text, clearAfter }) => {
    clipboard.writeText(text);

    if (clipboardClearTimer) {
        clearTimeout(clipboardClearTimer);
    }

    if (clearAfter && clearAfter > 0) {
        clipboardClearTimer = setTimeout(() => {
            clipboard.clear();
            mainWindow?.webContents.send('clipboard-cleared');
        }, clearAfter * 1000);
    }
});
