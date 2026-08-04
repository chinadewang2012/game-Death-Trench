const http = require('http');
const fs = require('fs');
const path = require('path');

let __rootDir = (typeof __dirname !== 'undefined') ? __dirname : process.cwd();
// 网页目录同时包含普通版与开发版（带编辑器），作为唯一正式网页副本
const DIST_DIR = path.resolve(__rootDir, '网页');
const DIST_DIR_NORM = path.normalize(DIST_DIR + path.sep);

const contentTypeMap = {
    '.html': 'text/html; charset=utf-8',
    '.htm': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
    '.mp3': 'audio/mpeg',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.wav': 'audio/wav',
    '.txt': 'text/plain; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8'
};

function getContentType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return contentTypeMap[ext] || 'application/octet-stream';
}

function safeResolve(requestPath) {
    try {
        if (typeof requestPath !== 'string') return null;
        let clean = requestPath;
        for (let i = 0; i < 3; i++) {
            const before = clean;
            try { clean = decodeURIComponent(clean); } catch (e) { break; }
            if (clean === before) break;
        }
        if (clean.indexOf('..') !== -1) return null;
        if (clean.indexOf('\x00') !== -1) return null;
        clean = clean.split('?')[0].split('#')[0];
        while (clean.startsWith('/') || clean.startsWith('\\')) clean = clean.slice(1);
        if (clean.length === 0) clean = '.';
        const absolute = path.resolve(DIST_DIR, clean);
        const absNorm = path.normalize(absolute);
        if (absNorm !== DIST_DIR && !(absNorm + path.sep).startsWith(DIST_DIR_NORM)) {
            return null;
        }
        return absNorm;
    } catch (e) {
        return null;
    }
}

function serveFile(res, filePath) {
    fs.stat(filePath, (err, stat) => {
        if (err || !stat.isFile()) {
            if (!res.headersSent) {
                res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            }
            if (!res.destroyed) res.end('404 Not Found');
            return;
        }
        const MAX_BYTES = 64 * 1024 * 1024;
        const fileSize = stat.size || 0;
        const size = Math.min(fileSize, MAX_BYTES);
        res.writeHead(200, {
            'Content-Type': getContentType(filePath),
            'Content-Length': size,
            'Cache-Control': 'no-cache',
            'Connection': 'close'
        });
        if (size === 0) {
            try { if (!res.destroyed) res.end(); } catch (e) {}
            return;
        }
        const stream = fs.createReadStream(filePath, { start: 0, end: size - 1 });
        let streamTimer = null;
        const done = { finished: false };
        const safeMarkDone = () => {
            if (done.finished) return false;
            done.finished = true;
            if (streamTimer) {
                clearTimeout(streamTimer);
                streamTimer = null;
            }
            return true;
        };
        streamTimer = setTimeout(() => {
            streamTimer = null;
            if (!safeMarkDone()) return;
            try { if (!res.destroyed) res.destroy(new Error('Stream timeout')); } catch (e) {}
        }, 10000);
        stream.on('error', () => {
            if (!safeMarkDone()) return;
            try { if (!res.destroyed) res.destroy(); } catch (e) {}
        });
        stream.on('end', () => { safeMarkDone(); });
        stream.on('close', () => { safeMarkDone(); });
        const onResDone = () => {
            if (!safeMarkDone()) return;
            try { stream.destroy(); } catch (e) {}
        };
        res.on('finish', onResDone);
        res.on('close', onResDone);
        stream.pipe(res);
    });
}

const GAME_CONFIG = {
    version: 1,
    AMMO_TYPES: { NORMAL: 'normal', AP: 'ap', EXP: 'exp', FIRE: 'fire' },
    WEAPON_TYPES: { PISTOL: 'pistol', SMG: 'smg', RIFLE: 'rifle', AR: 'ar', LMG: 'lmg', SHOTGUN: 'shotgun', SNIPER: 'sniper', MELEE: 'melee' },
    ITEM_TYPES: { CONSUMABLE: 'consumable', AMMO: 'ammo', MATERIAL: 'material', WEAPON: 'weapon', ARMOR: 'armor', MOD: 'mod', SKIN: 'skin', CURRENCY: 'currency', QUEST: 'quest' },
    WEAPONS: [
        { id: 'pistol', name: '手枪', type: 'pistol', damage: 25, fireRate: 250, clipSize: 15, range: 30, icon: '🔫', ammoType: 'normal', price: 0, unlocked: true, category: 'weapon', rarity: 'common' },
        { id: 'smg', name: '冲锋枪', type: 'smg', damage: 18, fireRate: 80, clipSize: 35, range: 25, icon: '⚡', ammoType: 'normal', price: 800, unlocked: false, category: 'weapon', rarity: 'uncommon' },
        { id: 'rifle', name: '步枪', type: 'rifle', damage: 30, fireRate: 150, clipSize: 30, range: 40, icon: '🔴', ammoType: 'normal', price: 0, unlocked: true, category: 'weapon', rarity: 'common' },
        { id: 'ar', name: '突击步枪', type: 'ar', damage: 35, fireRate: 120, clipSize: 40, range: 45, icon: '🟥', ammoType: 'ap', price: 1500, unlocked: false, category: 'weapon', rarity: 'rare' },
        { id: 'lmg', name: '轻机枪', type: 'lmg', damage: 28, fireRate: 60, clipSize: 100, range: 35, icon: '📦', ammoType: 'normal', price: 2500, unlocked: false, category: 'weapon', rarity: 'epic' },
        { id: 'shotgun', name: '霰弹枪', type: 'shotgun', damage: 80, fireRate: 800, clipSize: 6, range: 15, icon: '💥', ammoType: 'normal', price: 1200, unlocked: false, pellets: 5, category: 'weapon', rarity: 'rare' },
        { id: 'sniper', name: '狙击枪', type: 'sniper', damage: 120, fireRate: 1000, clipSize: 5, range: 60, icon: '🎯', ammoType: 'ap', price: 0, unlocked: true, category: 'weapon', rarity: 'rare' },
        { id: 'knife', name: '战术匕首', type: 'melee', damage: 60, fireRate: 400, clipSize: 999, range: 2, icon: '🗡️', ammoType: null, price: 0, unlocked: true, isMelee: true, category: 'weapon', rarity: 'common' },
        { id: 'machete', name: '砍刀', type: 'melee', damage: 90, fireRate: 600, clipSize: 999, range: 2.5, icon: '⚔️', ammoType: null, price: 800, unlocked: false, isMelee: true, category: 'weapon', rarity: 'uncommon' }
    ],
    ITEM_REGISTRY: {
        medkit: { id: 'medkit', name: '医疗包', icon: '💊', type: 'consumable', rarity: 'uncommon', stackable: true, maxStack: 10, weight: 1, description: '回复一定生命值', usableInRaid: true, effect: { heal: 50 } },
        grenade: { id: 'grenade', name: '手雷', icon: '💣', type: 'consumable', rarity: 'rare', stackable: true, maxStack: 5, weight: 2, description: '投掷造成范围伤害', usableInRaid: true, effect: { damage: 120, radius: 4 } },
        ammoBox: { id: 'ammoBox', name: '弹药箱', icon: '📦', type: 'ammo', rarity: 'common', stackable: true, maxStack: 20, weight: 1, description: '补充普通弹药', usableInRaid: true, effect: { ammoNormal: 50 } },
        speedBoost: { id: 'speedBoost', name: '加速针剂', icon: '⚡', type: 'consumable', rarity: 'rare', stackable: true, maxStack: 5, weight: 1, description: '短时间内提升移动速度', usableInRaid: true, effect: { speedMultiplier: 1.5, duration: 30000 } },
        armor_light: { id: 'armor_light', name: '轻型护甲', icon: '🦺', type: 'armor', rarity: 'uncommon', stackable: false, maxStack: 1, weight: 5, description: '提供基础防护', usableInRaid: false, effect: { damageReduction: 0.15 } },
        armor_heavy: { id: 'armor_heavy', name: '重型护甲', icon: '🛡️', type: 'armor', rarity: 'rare', stackable: false, maxStack: 1, weight: 10, description: '提供强力防护但降低移动速度', usableInRaid: false, effect: { damageReduction: 0.35, speedPenalty: 0.1 } },
        copper_wire: { id: 'copper_wire', name: '铜线', icon: '🔌', type: 'material', rarity: 'common', stackable: true, maxStack: 50, weight: 0.2, description: '常见电子材料', usableInRaid: false },
        circuit_board: { id: 'circuit_board', name: '电路板', icon: '🧩', type: 'material', rarity: 'uncommon', stackable: true, maxStack: 20, weight: 0.5, description: '中等价值电子元件', usableInRaid: false },
        gold_watch: { id: 'gold_watch', name: '金表', icon: '⌚', type: 'material', rarity: 'epic', stackable: true, maxStack: 5, weight: 0.3, description: '高价值战利品', usableInRaid: false },
        classified_docs: { id: 'classified_docs', name: '机密文件', icon: '📁', type: 'material', rarity: 'legendary', stackable: true, maxStack: 1, weight: 0.1, description: '极其稀有的情报', usableInRaid: false }
    },
    GAME_PARAMS: {
        ENEMY: { health: 80, damage: { easy: 8, normal: 12, hard: 18 }, moveSpeed: 0.35, fireRate: 1500, spawnInterval: 3000, count: 8 },
        PLAYER: { maxHealth: 100, moveSpeed: 100, bulletSpeed: 15, invincibilityTime: 1000 },
        MAP: { obstacleRate: 0.08, coverRate: 0.14, buildingRate: 0.18, waterRate: 0.2, MAP_SIZE: 150 },
        DROPS: { coinMin: 10, coinMax: 30, medkitHeal: 30, grenadeDamage: 150, grenadeRadius: 4, ammoRefillAll: 30, starScore: 500 },
        BUFFS: { speedBoostMultiplier: 1.5, speedBoostDuration: 30000, damageReductionMultiplier: 0.5 }
    },
    MODIFICATIONS: {
        scope: { name: '瞄准镜', icon: '🔭', effects: { rangeBonus: 1.3, damageBonus: 1.0 }, price: 500, description: '增加30%射程' },
        extendedMag: { name: '扩容弹匣', icon: '📋', effects: { clipSizeBonus: 1.5, fireRateBonus: 0.9 }, price: 400, description: '增加50%弹容量，减少10%射速' },
        suppressor: { name: '消音器', icon: '🔇', effects: { rangeBonus: 0.8, stealth: true }, price: 600, description: '减少声音，射程降低20%' },
        grip: { name: '战术握把', icon: '✋', effects: { fireRateBonus: 1.2, spreadReduction: 0.7 }, price: 350, description: '增加20%射速，减少散布' },
        apRounds: { name: '穿甲弹', icon: '🎯', effects: { damageBonus: 1.3, armorPenetration: true }, price: 800, description: '增加30%伤害，穿透护甲' },
        stock: { name: '枪托', icon: '🪵', effects: { recoilReduction: 0.6, accuracyBonus: 1.15 }, price: 450, description: '大幅减少后坐力' }
    },
    MEDALS: [
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
    ]
};

function sendJson(res, data, status = 200) {
    try {
        if (!res.headersSent) {
            res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Connection': 'close', 'Access-Control-Allow-Origin': '*' });
        }
        if (!res.destroyed) res.end(JSON.stringify(data, null, 2));
    } catch (e) {}
}

function setCorsHeaders(res) {
    try {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    } catch (e) {}
}

function handleConfigApi(req, res, requestPath) {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
        res.writeHead(204, { 'Connection': 'close' });
        res.end();
        return true;
    }

    if (req.method !== 'GET') {
        return false;
    }

    switch (requestPath) {
        case '/api/config':
            sendJson(res, { success: true, data: GAME_CONFIG });
            return true;
        case '/api/config/weapons':
            sendJson(res, { success: true, data: GAME_CONFIG.WEAPONS });
            return true;
        case '/api/config/items':
            sendJson(res, { success: true, data: GAME_CONFIG.ITEM_REGISTRY });
            return true;
        case '/api/config/params':
            sendJson(res, { success: true, data: GAME_CONFIG.GAME_PARAMS });
            return true;
        case '/api/config/modifications':
            sendJson(res, { success: true, data: GAME_CONFIG.MODIFICATIONS });
            return true;
        case '/api/config/medals':
            sendJson(res, { success: true, data: GAME_CONFIG.MEDALS });
            return true;
        case '/api/config/ammo-types':
            sendJson(res, { success: true, data: GAME_CONFIG.AMMO_TYPES });
            return true;
        case '/api/config/weapon-types':
            sendJson(res, { success: true, data: GAME_CONFIG.WEAPON_TYPES });
            return true;
        case '/api/config/item-types':
            sendJson(res, { success: true, data: GAME_CONFIG.ITEM_TYPES });
            return true;
        default:
            return false;
    }
}

function createServer(port, label, indexFile) {
    const server = http.createServer((req, res) => {
        try {
            req.setTimeout(30000, () => {
                try { req.destroy(new Error('Request read timeout')); } catch (e) {}
            });
            res.setTimeout(30000, () => {
                try { res.destroy(new Error('Response write timeout')); } catch (e) {}
            });
        } catch (e) {}

        let overallTimer = null;
        let overallTimerCleared = false;
        const clearOverallTimer = () => {
            if (overallTimerCleared) return;
            overallTimerCleared = true;
            if (overallTimer) {
                clearTimeout(overallTimer);
                overallTimer = null;
            }
        };
        overallTimer = setTimeout(() => {
            try {
                if (res.destroyed || res.finished) return;
                if (!res.headersSent) {
                    res.writeHead(408, { 'Content-Type': 'text/plain; charset=utf-8', 'Connection': 'close' });
                    res.end('Request Timeout');
                } else {
                    res.destroy(new Error('Request timeout'));
                }
            } catch (e) {}
        }, 30000);

        res.on('finish', clearOverallTimer);
        res.on('close', clearOverallTimer);
        req.on('end', () => { clearOverallTimer(); });
        req.on('error', () => {
            clearOverallTimer();
            try {
                if (res.destroyed) return;
                if (res.finished) return;
                if (!res.headersSent) {
                    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8', 'Connection': 'close' });
                }
                res.end('Bad Request');
            } catch (e) {}
        });

        let requestPath = '/';
        try {
            const parsedUrl = new URL(req.url, 'http://localhost');
            requestPath = parsedUrl.pathname || '/';
        } catch (e) {
            if (!res.headersSent) res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('400 Bad Request');
            return;
        }

        if (requestPath.startsWith('/api/config')) {
            if (handleConfigApi(req, res, requestPath)) return;
        }

        let filePath = safeResolve(requestPath);
        if (!filePath) {
            res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('403 Forbidden');
            return;
        }

        try {
            const stat = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
            if (stat && stat.isDirectory()) {
                filePath = path.join(filePath, indexFile);
            } else if (requestPath === '/') {
                const fallback = path.join(DIST_DIR, indexFile);
                if (fs.existsSync(fallback)) {
                    filePath = fallback;
                }
            } else if (!fs.existsSync(filePath)) {
                res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('404 Not Found: ' + requestPath);
                return;
            }
        } catch (e) {
            // 无视错误，继续后续处理
        }

        serveFile(res, filePath);
    });

    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error(`[ERROR] [${label}] 端口 ${port} 已被占用。`);
            try {
                const { exec } = require('child_process');
                exec('netstat -ano | findstr :' + port, { windowsHide: true }, (_err, stdout) => {
                    if (!_err && stdout && stdout.trim()) {
                        console.error(`[INFO] [${label}] 占用该端口的进程信息：\n` + stdout.trim());
                    }
                });
            } catch (e) {}
        } else {
            console.error(`[ERROR] [${label}] 服务器错误：`, err.message);
        }
    });

    server.on('connection', (socket) => {
        socket.setTimeout(60000);
        socket.on('timeout', () => {
            try { socket.destroy(); } catch (e) {}
        });
    });

    return server;
}

const servers = [];

const normalServer = createServer(8080, '普通版', 'index.html');
normalServer.listen(8080, '0.0.0.0', () => {
    console.log(`✅ [普通版] http://localhost:8080`);
});
servers.push(normalServer);

const devServer = createServer(3030, '开发版', 'index-dev.html');
devServer.listen(3030, '0.0.0.0', () => {
    console.log(`✅ [开发版] http://localhost:3030`);
});
servers.push(devServer);

console.log(`\n==================================================`);
console.log(`  死亡战壕 2D - 双版本服务器`);
console.log(`==================================================`);
console.log(`  普通版 (无编辑器): http://localhost:8080`);
console.log(`  开发版 (带编辑器): http://localhost:3030`);
console.log(`  根目录: ${DIST_DIR}`);
console.log(`==================================================\n`);

if (process.platform === 'win32') {
    setImmediate(() => {
        try {
            const { exec } = require('child_process');
            exec(`start "" "http://localhost:8080"`, { windowsHide: true }, () => {});
        } catch (e) {}
    });
}

function gracefulShutdown() {
    console.log('\n[SERVER] 收到关闭信号，正在释放端口...');
    let closed = 0;
    const total = servers.length;
    servers.forEach((s, i) => {
        try {
            s.close(() => {
                closed++;
                if (closed >= total) {
                    console.log('[SERVER] 所有服务器已关闭，端口已释放。');
                    process.exit(0);
                }
            });
        } catch (e) {
            closed++;
            if (closed >= total) {
                console.log('[SERVER] 所有服务器已关闭，端口已释放。');
                process.exit(0);
            }
        }
    });
    setTimeout(() => {
        console.log('[SERVER] 强制退出。');
        process.exit(0);
    }, 3000).unref();
}
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
