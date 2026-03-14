const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to renderer
contextBridge.exposeInMainWorld('electronAPI', {
    // Store operations
    getStore: (key) => ipcRenderer.invoke('get-store', key),
    setStore: (key, value) => ipcRenderer.invoke('set-store', key, value),

    // Auth
    login: (data) => ipcRenderer.invoke('login', data),
    logout: () => ipcRenderer.invoke('logout'),
    getApiBase: () => ipcRenderer.invoke('get-api-base'),

    // Presence
    togglePresence: (enabled) => ipcRenderer.invoke('toggle-presence', enabled),
    refreshPresence: () => ipcRenderer.invoke('refresh-presence'),

    // Settings
    setAutoStart: (enabled) => ipcRenderer.invoke('set-auto-start', enabled),
    getAutoStart: () => ipcRenderer.invoke('get-auto-start'),

    // Window controls
    minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
    closeWindow: () => ipcRenderer.invoke('close-window'),

    // External links
    openExternal: (url) => ipcRenderer.invoke('open-external', url),

    // Event listeners
    onPresenceToggled: (callback) => {
        ipcRenderer.on('presence-toggled', (event, enabled) => callback(enabled));
    }
});
