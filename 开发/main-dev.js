const { app, BrowserWindow, screen, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const DataCenter = require('./data-center');

const DEV_PORT = 3030;

const DEFAULT_MEDALS = [
    { id: 'first_blood', name: '初露锋芒', icon: '🩸', description: '累计击杀10名敌人', rarity: 'bronze', conditionType: 'kills', threshold: 10, reward: { coins: 100 }, hidden: false, order: 1 },
    { id: 'seasoned_fighter', name: '百战老兵', icon: '⚔️', description: '累计击杀100名敌人', rarity: 'silver', conditionType: 'kills', threshold: 100, reward: { coins: 500 }, hidden: false, order: 2 },
    { id: 'legendary_soldier', name: '传奇战士', icon: '👑', description: '累计击杀1000名敌人', rarity: 'diamond', conditionType: 'kills', threshold: 1000, reward: { coins: 5000 }, hidden: false, order: 3 },
    { id: 'wealthy', name: '小有积蓄', icon: '💰', description: '拥有金币达到1000', rarity: 'bronze', conditionType: 'coins', threshold: 1000, reward: { coins: 100 }, hidden: false, order: 4 },
    { id: 'millionaire', name: '腰缠万贯', icon: '🏦', description: '拥有金币达到10000', rarity: 'gold', conditionType: 'coins', threshold: 10000, reward: { coins: 1000 }, hidden: false, order: 5 },
    { id: 'survivor', name: '生存专家', icon: '🛡️', description: '累计游玩时间超过1小时', rarity: 'silver', conditionType: 'playtime', threshold: 3600, reward: { coins: 300 }, hidden: false, order: 6 },
    { id: 'sharp_shooter', name: '神枪手', icon: '🎯', description: 'K/D 达到3.0', rarity: 'gold', conditionType: 'kd', threshold: 3.0, reward: { coins: 800 }, hidden: false, order: 7 },
    { id: 'mission_accomplished', name: '任务达人', icon: '📋', description: '累计完成10个任务', rarity: 'silver', conditionType: 'missions', threshold: 10, reward: { coins: 400 }, hidden: false, order: 8 },
    { id: 'lucky_draw', name: '幸运儿', icon: '🎰', description: '累计抽奖100次', rarity: 'gold', conditionType: 'lotteryDraws', threshold: 100, reward: { coins: 1000 }, hidden: false, order: 9 },
    { id: 'jackpot', name: 'Jackpot！', icon: '💎', description: '抽奖获得传说品质奖励', rarity: 'platinum', conditionType: 'legendaryOwned', threshold: 1, reward: { coins: 2000 }, hidden: false, order: 10 }
];
let devServer = null;
let mainWindowRef = null;

function getWebRoot() {
    const localIndex = path.join(__dirname, 'index.html');
    if (fs.existsSync(localIndex)) return __dirname;
    return path.resolve(__dirname, '..', '网页');
}

function getSaveDir() {
    try {
        return app.getPath('userData');
    } catch (e) {
        return __dirname;
    }
}

const contentTypeMap = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.mp3': 'audio/mpeg',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf'
};

function getContentType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return contentTypeMap[ext] || 'application/octet-stream';
}

function sendJson(res, data, status = 200) {
    try {
        if (!res.headersSent) {
            res.writeHead(status, {
                'Content-Type': 'application/json; charset=utf-8',
                'Access-Control-Allow-Origin': '*',
                'Connection': 'close'
            });
        }
        if (!res.destroyed) res.end(JSON.stringify(data, null, 2));
    } catch (e) {}
}

function serveStaticFile(res, webRoot, requestPath) {
    let clean = requestPath.split('?')[0].split('#')[0];
    while (clean.startsWith('/')) clean = clean.slice(1);
    if (clean.length === 0) clean = 'index-dev.html';

    if (clean.indexOf('..') !== -1) {
        res.writeHead(403); res.end('Forbidden'); return;
    }

    const filePath = path.resolve(webRoot, clean);
    if (!filePath.startsWith(path.resolve(webRoot))) {
        res.writeHead(403); res.end('Forbidden'); return;
    }

    fs.stat(filePath, (err, stat) => {
        if (err || !stat.isFile()) {
            if (!res.headersSent) res.writeHead(404);
            if (!res.destroyed) res.end('Not Found');
            return;
        }
        res.writeHead(200, {
            'Content-Type': getContentType(filePath),
            'Content-Length': stat.size,
            'Cache-Control': 'no-cache'
        });
        fs.createReadStream(filePath).pipe(res);
    });
}

function startDevServer(webRoot) {
    devServer = http.createServer((req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
            res.writeHead(204); res.end(); return;
        }

        try {
            const parsedUrl = new URL(req.url, 'http://localhost');
            const pathname = parsedUrl.pathname;

            if (pathname.startsWith('/api/lottery/')) {
                handleLotteryApi(req, res, pathname, parsedUrl);
                return;
            }

            if (pathname === '/api/status') {
                sendJson(res, {
                    mode: 'dev',
                    port: DEV_PORT,
                    dataCenter: true,
                    lotteryLock: DataCenter.getLotteryLockStatus()
                });
                return;
            }

            if (pathname === '/api/medals') {
                sendJson(res, { success: true, medals: DEFAULT_MEDALS });
                return;
            }

            if (pathname.startsWith('/api/')) {
                sendJson(res, { error: 'Unknown API endpoint: ' + pathname }, 404);
                return;
            }

            serveStaticFile(res, webRoot, pathname);
        } catch (e) {
            sendJson(res, { error: 'Server error: ' + e.message }, 500);
        }
    });

    devServer.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error(`[DevServer] 端口 ${DEV_PORT} 已被占用`);
        } else {
            console.error('[DevServer] 错误:', err.message);
        }
    });

    devServer.listen(DEV_PORT, '127.0.0.1', () => {
        console.log(`[DevServer] 开发版服务已启动: http://localhost:${DEV_PORT}`);
    });
}

function handleLotteryApi(req, res, pathname, parsedUrl) {
    const endpoint = pathname.replace('/api/lottery/', '');

    if (req.method === 'GET') {
        switch (endpoint) {
            case 'data':
                sendJson(res, { success: true, data: DataCenter.getLotteryData() });
                return;
            case 'player':
                sendJson(res, { success: true, data: DataCenter.getPlayerData() });
                return;
            case 'all':
                sendJson(res, { success: true, data: DataCenter.getAllData() });
                return;
            case 'lock':
                sendJson(res, { success: true, data: DataCenter.getLotteryLockStatus() });
                return;
            default:
                sendJson(res, { error: 'Unknown GET endpoint: ' + endpoint }, 404);
                return;
        }
    }

    if (req.method === 'POST') {
        let body = '';
        let processed = false;
        const timer = setTimeout(() => {
            if (!processed) {
                processed = true;
                sendJson(res, { error: 'Request timeout' }, 408);
            }
        }, 10000);

        req.on('data', (chunk) => {
            if (processed) return;
            body += chunk.toString('utf8');
            if (body.length > 1024 * 1024) {
                processed = true;
                clearTimeout(timer);
                sendJson(res, { error: 'Payload too large' }, 413);
            }
        });

        req.on('end', () => {
            if (processed) return;
            processed = true;
            clearTimeout(timer);

            let data = {};
            try {
                if (body.trim()) data = JSON.parse(body);
            } catch (e) {
                sendJson(res, { error: 'Invalid JSON: ' + e.message }, 400);
                return;
            }

            switch (endpoint) {
                case 'lock': {
                    const result = DataCenter.acquireLotteryLock(data.holderId);
                    sendJson(res, result);
                    broadcastDataChange();
                    return;
                }
                case 'unlock': {
                    const result = DataCenter.releaseLotteryLock(data.holderId);
                    sendJson(res, result);
                    broadcastDataChange();
                    return;
                }
                case 'commit': {
                    const result = DataCenter.commitLotteryDraw(data.holderId, data.drawResult || {});
                    sendJson(res, result);
                    broadcastDataChange();
                    return;
                }
                case 'rollback': {
                    const result = DataCenter.rollbackLottery(data.holderId, data.snapshot);
                    sendJson(res, result);
                    broadcastDataChange();
                    return;
                }
                case 'update-player': {
                    const result = DataCenter.updatePlayerData(data.patch || {});
                    sendJson(res, result);
                    broadcastDataChange();
                    return;
                }
                default:
                    sendJson(res, { error: 'Unknown POST endpoint: ' + endpoint }, 404);
                    return;
            }
        });

        req.on('error', () => {
            if (!processed) {
                processed = true;
                clearTimeout(timer);
                sendJson(res, { error: 'Request error' }, 400);
            }
        });
        return;
    }

    sendJson(res, { error: 'Method not allowed' }, 405);
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

    DataCenter.subscribe((type, data) => {
        broadcastDataChange();
    });

    startDevServer(webRoot);

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
            preload: path.join(__dirname, 'preload-dev.js')
        },
        autoHideMenuBar: false,
        resizable: true
    });

    mainWindowRef = mainWindow;

    const template = [
        {
            label: '视图',
            submenu: [
                {
                    label: '切换开发者工具',
                    accelerator: 'F12',
                    click: () => { mainWindow.webContents.toggleDevTools(); }
                },
                {
                    label: '重新加载',
                    accelerator: 'CmdOrCtrl+R',
                    click: () => { mainWindow.reload(); }
                },
                {
                    label: '打开3030管理面板',
                    click: () => {
                        const { shell } = require('electron');
                        shell.openExternal('http://localhost:3030');
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

    mainWindow.loadFile(path.join(webRoot, 'index.html'));

    mainWindow.on('closed', () => {
        mainWindowRef = null;
        if (devServer) {
            try { devServer.close(); } catch (e) {}
            devServer = null;
        }
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

ipcMain.handle('is-dev-mode', () => true);

ipcMain.handle('get-dev-port', () => DEV_PORT);

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
    if (devServer) { try { devServer.close(); } catch (e) {} }
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
