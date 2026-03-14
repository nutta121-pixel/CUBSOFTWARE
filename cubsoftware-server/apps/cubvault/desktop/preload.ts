/**
 * CubVault - Electron Preload Script
 * Secure bridge between main and renderer processes
 */

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
    // Window controls
    minimizeWindow: () => ipcRenderer.send('window-minimize'),
    maximizeWindow: () => ipcRenderer.send('window-maximize'),
    closeWindow: () => ipcRenderer.send('window-close'),

    // Clipboard
    copyToClipboard: (text: string, clearAfter: number = 30) => {
        ipcRenderer.send('copy-to-clipboard', { text, clearAfter });
    },

    // Event listeners
    onLockVault: (callback: () => void) => {
        ipcRenderer.on('lock-vault', callback);
    },
    onClipboardCleared: (callback: () => void) => {
        ipcRenderer.on('clipboard-cleared', callback);
    }
});
