const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cubpresence', {
    // Connection
    connect:        (clientId, activity) => ipcRenderer.invoke('connect', { clientId, activity }),
    disconnect:     () => ipcRenderer.invoke('disconnect'),
    updateActivity: (activity) => ipcRenderer.invoke('update-activity', activity),
    getStatus:      () => ipcRenderer.invoke('get-status'),

    // Settings
    getSettings:    () => ipcRenderer.invoke('get-settings'),
    saveSettings:   (s) => ipcRenderer.invoke('save-settings', s),
    getSavedPresence: () => ipcRenderer.invoke('get-saved-presence'),
    getTimestamps:  () => ipcRenderer.invoke('get-timestamps'),

    // Profiles
    getProfiles:      () => ipcRenderer.invoke('get-profiles'),
    saveProfile:      (name, data) => ipcRenderer.invoke('save-profile', { name, data }),
    deleteProfile:    (name) => ipcRenderer.invoke('delete-profile', name),
    renameProfile:    (oldName, newName) => ipcRenderer.invoke('rename-profile', { oldName, newName }),
    duplicateProfile: (name, newName) => ipcRenderer.invoke('duplicate-profile', { name, newName }),
    exportProfiles:   () => ipcRenderer.invoke('export-profiles'),
    importProfiles:   () => ipcRenderer.invoke('import-profiles'),

    // History
    getHistory:   () => ipcRenderer.invoke('get-history'),
    clearHistory: () => ipcRenderer.invoke('clear-history'),

    // Rotation
    startRotation: (config) => ipcRenderer.invoke('start-rotation', config),
    stopRotation:  () => ipcRenderer.invoke('stop-rotation'),

    // Window
    setAlwaysOnTop: (v) => ipcRenderer.invoke('set-always-on-top', v),
    setOpacity:     (v) => ipcRenderer.invoke('set-opacity', v),

    // Dialogs
    showMessageBox: (options) => ipcRenderer.invoke('show-message-box', options),

    // Updates
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    installUpdate:   () => ipcRenderer.invoke('install-update'),
    getVersion:      () => ipcRenderer.invoke('get-version'),

    // External
    openExternal: (url) => ipcRenderer.invoke('open-external', url),

    // Events
    onStatus:          (cb) => ipcRenderer.on('status',           (e, d) => cb(d)),
    onUpdateStatus:    (cb) => ipcRenderer.on('update-status',    (e, d) => cb(d)),
    onTimestamps:      (cb) => ipcRenderer.on('timestamps',       (e, d) => cb(d)),
    onQuickConnect:    (cb) => ipcRenderer.on('quick-connect',    (e, d) => cb(d)),
    onRotationAdvance: (cb) => ipcRenderer.on('rotation-advance', (e, d) => cb(d)),
    onHistoryUpdated:  (cb) => ipcRenderer.on('history-updated',  (e, d) => cb(d))
});
