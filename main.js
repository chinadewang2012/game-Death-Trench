const { app, BrowserWindow, screen, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

function createWindow() {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;

    const mainWindow = new BrowserWindow({
        width: Math.min(width - 100, 1280),
        height: Math.min(height - 100, 720),
        minWidth: 800,
        minHeight: 600,
        title: '死亡战壕 - Death Trench 2D',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false,
            sandbox: true,
            devTools: false,
            preload: path.join(__dirname, 'preload.js')
        },
        autoHideMenuBar: true,
        resizable: true
    });

    // 禁用编辑器功能
    mainWindow.webContents.executeJavaScript('window.ENABLE_TOOLS = false;');

    mainWindow.loadFile('index.html');

    mainWindow.on('closed', () => {
        app.quit();
    });
}

// 保存游戏参数到文件
ipcMain.handle('save-game-params', async (event, data) => {
    try {
        const result = await dialog.showSaveDialog({
            title: '导出游戏参数',
            defaultPath: 'game_params.json',
            filters: [
                { name: 'JSON文件', extensions: ['json'] }
            ]
        });

        if (result.canceled || !result.filePath) {
            return { success: false, message: '已取消' };
        }

        fs.writeFileSync(result.filePath, JSON.stringify(data, null, 2), 'utf8');
        return { success: true, message: '参数已导出到: ' + path.basename(result.filePath) };
    } catch (error) {
        return { success: false, message: '导出失败: ' + error.message };
    }
});

// 从文件加载游戏参数
ipcMain.handle('load-game-params', async () => {
    try {
        const result = await dialog.showOpenDialog({
            title: '导入游戏参数',
            filters: [
                { name: 'JSON文件', extensions: ['json'] }
            ],
            properties: ['openFile']
        });

        if (result.canceled || result.filePaths.length === 0) {
            return { success: false, message: '已取消' };
        }

        const filePath = result.filePaths[0];
        const content = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(content);

        return { success: true, message: '参数已导入', data: data, filename: path.basename(filePath) };
    } catch (error) {
        return { success: false, message: '导入失败: ' + error.message };
    }
});

// 检查是否为开发版
ipcMain.handle('is-dev-mode', () => {
    return false;
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
