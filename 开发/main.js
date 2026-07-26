const { app, BrowserWindow, screen, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const DataCenter = require('./data-center');

let mainWindowRef = null;

function getWebRoot() {
    const localIndex = path.join(__dirname, 'index.html');
    if (fs.existsSync(localIndex)) return __dirname;
    return path.resolve(__dirname, '..', '网页');
}

function getSaveDir() {
    try { return app.getPath('userData'); }
    catch (e) { return __dirname; }
}

function broadcastDataChange() {
    if (!mainWindowRef) return;
    try {
        mainWindowRef.webContents.send('data-center:update', DataCenter.getAllData());
    } catch (e) {}
}

function createWindow() {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    const webRoot = getWebRoot();

    DataCenter.init(getSaveDir());
    DataCenter.subscribe(() => broadcastDataChange());

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

    mainWindowRef = mainWindow;

    mainWindow.webContents.executeJavaScript('window.ENABLE_TOOLS = false;');
    mainWindow.loadFile(path.join(webRoot, 'index.html'));

    mainWindow.on('closed', () => {
        mainWindowRef = null;
        app.quit();
    });
}

ipcMain.handle('save-game-params', async (event, data) => {
    try {
        const result = await dialog.showSaveDialog({
            title: '导出游戏参数',
            defaultPath: 'game_params.json',
            filters: [{ name: 'JSON文件', extensions: ['json'] }]
        });
        if (result.canceled || !result.filePath) return { success: false, message: '已取消' };
        fs.writeFileSync(result.filePath, JSON.stringify(data, null, 2), 'utf8');
        return { success: true, message: '参数已导出到: ' + path.basename(result.filePath) };
    } catch (error) {
        return { success: false, message: '导出失败: ' + error.message };
    }
});

ipcMain.handle('load-game-params', async () => {
    try {
        const result = await dialog.showOpenDialog({
            title: '导入游戏参数',
            filters: [{ name: 'JSON文件', extensions: ['json'] }],
            properties: ['openFile']
        });
        if (result.canceled || result.filePaths.length === 0) return { success: false, message: '已取消' };
        const filePath = result.filePaths[0];
        const content = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(content);
        return { success: true, message: '参数已导入', data: data, filename: path.basename(filePath) };
    } catch (error) {
        return { success: false, message: '导入失败: ' + error.message };
    }
});

ipcMain.handle('is-dev-mode', () => false);
ipcMain.handle('get-dev-port', () => null);

ipcMain.handle('data-center:get-all', () => DataCenter.getAllData());
ipcMain.handle('data-center:get-lottery', () => DataCenter.getLotteryData());
ipcMain.handle('data-center:get-player', () => DataCenter.getPlayerData());
ipcMain.handle('data-center:get-lock', () => DataCenter.getLotteryLockStatus());

ipcMain.handle('data-center:acquire-lock', (e, holderId) => {
    const r = DataCenter.acquireLotteryLock(holderId);
    broadcastDataChange();
    return r;
});
ipcMain.handle('data-center:release-lock', (e, holderId) => {
    const r = DataCenter.releaseLotteryLock(holderId);
    broadcastDataChange();
    return r;
});
ipcMain.handle('data-center:commit-lottery', (e, holderId, drawResult) => {
    const r = DataCenter.commitLotteryDraw(holderId, drawResult || {});
    broadcastDataChange();
    return r;
});
ipcMain.handle('data-center:rollback-lottery', (e, holderId, snapshot) => {
    const r = DataCenter.rollbackLottery(holderId, snapshot);
    broadcastDataChange();
    return r;
});
ipcMain.handle('data-center:update-player', (e, patch) => {
    const r = DataCenter.updatePlayerData(patch || {});
    broadcastDataChange();
    return r;
});

ipcMain.handle('check-version', async () => {
    try {
        const https = require('https');
        return new Promise((resolve) => {
            const req = https.get('https://gitee.com/wang-zirui-from-beijing/death-trench-ai-game/raw/main/version.json', (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    try { resolve({ success: true, data: JSON.parse(data) }); }
                    catch (e) { resolve({ success: false, message: 'Parse error' }); }
                });
            });
            req.on('error', (e) => { resolve({ success: false, message: e.message }); });
            req.setTimeout(5000, () => { req.destroy(); resolve({ success: false, message: 'Timeout' }); });
        });
    } catch (e) { return { success: false, message: e.message }; }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
