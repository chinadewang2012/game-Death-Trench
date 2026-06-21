const { app, BrowserWindow, screen, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

function createWindow() {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;

    const mainWindow = new BrowserWindow({
        width: Math.min(width - 100, 1280),
        height: Math.min(height - 100, 720),
        minWidth: 800,
        minHeight: 600,
        title: '死亡战壕 - Death Trench 2D [开发版]',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false,
            sandbox: true,
            devTools: true,
            preload: path.join(__dirname, 'preload.js')
        },
        autoHideMenuBar: false,
        resizable: true
    });

    // 创建开发版菜单
    const template = [
        {
            label: '视图',
            submenu: [
                {
                    label: '切换开发者工具',
                    accelerator: 'F12',
                    click: () => {
                        mainWindow.webContents.toggleDevTools();
                    }
                },
                {
                    label: '重新加载',
                    accelerator: 'CmdOrCtrl+R',
                    click: () => {
                        mainWindow.reload();
                    }
                },
                { type: 'separator' },
                { role: 'togglefullscreen', label: '全屏切换' }
            ]
        },
        {
            label: '窗口',
            submenu: [
                { role: 'minimize', label: '最小化' },
                { role: 'close', label: '关闭' }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);

    // 启用编辑器功能
    mainWindow.webContents.executeJavaScript('window.ENABLE_TOOLS = true;');

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
    return true;
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
