const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    saveGameParams: (data) => ipcRenderer.invoke('save-game-params', data),
    loadGameParams: () => ipcRenderer.invoke('load-game-params'),
    isDevMode: () => ipcRenderer.invoke('is-dev-mode'),
    checkVersion: () => ipcRenderer.invoke('check-version'),
    getDevPort: () => ipcRenderer.invoke('get-dev-port'),

    dataCenter: {
        getAll: () => ipcRenderer.invoke('data-center:get-all'),
        getLottery: () => ipcRenderer.invoke('data-center:get-lottery'),
        getPlayer: () => ipcRenderer.invoke('data-center:get-player'),
        getLock: () => ipcRenderer.invoke('data-center:get-lock'),
        acquireLock: (holderId) => ipcRenderer.invoke('data-center:acquire-lock', holderId),
        releaseLock: (holderId) => ipcRenderer.invoke('data-center:release-lock', holderId),
        commitLottery: (holderId, drawResult) => ipcRenderer.invoke('data-center:commit-lottery', holderId, drawResult),
        rollbackLottery: (holderId, snapshot) => ipcRenderer.invoke('data-center:rollback-lottery', holderId, snapshot),
        updatePlayer: (patch) => ipcRenderer.invoke('data-center:update-player', patch),
        onUpdate: (callback) => {
            const listener = (_event, data) => callback(data);
            ipcRenderer.on('data-center:update', listener);
            return () => ipcRenderer.removeListener('data-center:update', listener);
        }
    }
});

contextBridge.exposeInMainWorld('ENABLE_TOOLS', true);
