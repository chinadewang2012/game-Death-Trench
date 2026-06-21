const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // 保存游戏参数到文件
    saveGameParams: (data) => ipcRenderer.invoke('save-game-params', data),
    // 加载游戏参数从文件
    loadGameParams: () => ipcRenderer.invoke('load-game-params'),
    // 检查是否为开发版
    isDevMode: () => ipcRenderer.invoke('is-dev-mode')
});
