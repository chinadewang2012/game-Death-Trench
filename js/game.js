// ================================================
// 由billbill十三闲客-Alan使用Trae编写，未经许可请勿搬走
// ================================================

// 新坐标系统：地图100x100格子，每格20像素
// 玩家坐标是格子坐标，固定在屏幕中心
// 显示区域：玩家周围61x41格子

// 编辑器功能开关（由main.js设置）
const ENABLE_TOOLS = typeof window !== 'undefined' && window.ENABLE_TOOLS === true;

const TILE_SIZE = 20;
const PLAYER_SIZE = 1.0;
const BULLET_SIZE = 0.3;
const ENEMY_SIZE = 1.2;
let MAP_SIZE = 150;
const VIEW_RANGE_X = 45; // 左右各45格（更大的可见范围）
const VIEW_RANGE_Y = 30; // 上下各30格

// 对象池大小上限
const POOL_BULLET_MAX = 500;
const POOL_EXPLOSION_MAX = 100;
const POOL_DROP_MAX = 100;

let WEAPONS = [
    { name: '手枪', damage: 25, fireRate: 250, clipSize: 15, range: 30, icon: '🔫' },
    { name: '步枪', damage: 30, fireRate: 150, clipSize: 30, range: 40, icon: '🔴' },
    { name: '狙击枪', damage: 120, fireRate: 1000, clipSize: 5, range: 60, icon: '🎯' }
];

// 游戏参数（由数据编辑器覆盖）
let gameParams = {
    ENEMY: {
        health: 80,
        damage: { easy: 8, normal: 12, hard: 18 },
        moveSpeed: 0.35,
        fireRate: 1500,
        spawnInterval: 3000,
        count: 8
    },
    PLAYER: {
        maxHealth: 100,
        moveSpeed: 100,
        bulletSpeed: 15,
        invincibilityTime: 1000
    },
    MAP: {
        obstacleRate: 0.08,
        coverRate: 0.14,
        buildingRate: 0.18,
        waterRate: 0.2,
        MAP_SIZE: 150
    },
    DROPS: {
        coinMin: 10,
        coinMax: 30,
        medkitHeal: 30,
        grenadeDamage: 150,
        grenadeRadius: 4,
        ammoRefillAll: 30,
        starScore: 500
    },
    BUFFS: {
        speedBoostMultiplier: 1.5,
        speedBoostDuration: 30000,
        damageReductionMultiplier: 0.5
    }
};

let canvas, ctx;
let player;
// 使用数组 + alive 标记实现对象池（避免频繁 filter 分配）
let bullets = [];
let enemies = [];
let drops = [];
let explosions = [];

let gameRunning = false;
let animationId;
let mouseX = 0, mouseY = 0;
let keys = new Map();
let lastShot = 0;
let lastEnemySpawn = 0;
let autoFire = false;
let lastItemUse = 0;  // 物品使用间隔记录
const ITEM_COOLDOWN = 200;  // 物品使用间隔（毫秒）
let enableItemCooldown = true;  // 是否启用物品使用间隔
let mapData = {};
let mapCanvas, mapCtx;

// 撤离系统
const EXTRACT_RADIUS = 2; // 撤离区域半径（格）
const EXTRACT_DURATION = 3000; // 撤离所需时间（毫秒）
let extractX = 50, extractY = 50;
let isExtracting = false;
let extractStartTime = 0;
let extractProgress = 0;

const settings = {
    difficulty: 'normal',
    playerSpeed: 100, // 百分比，100为默认速度
    fireRate: 100 // 射速调整，100为默认，数值越小射速越快
};

const DEFAULT_TITLES_GAME = [
    { id: 't0', name: '新兵', icon: '🎖️', color: '#ffffff', bg1: 'rgba(139,148,158,0.5)', bg2: 'rgba(139,148,158,0.3)', borderColor: '#8b949e', pattern: 'none', conditionType: 'default', threshold: 0, reqText: '初始' },
    { id: 't1', name: '士兵', icon: '⚔️', color: '#ffffff', bg1: '#58a6ff', bg2: '#1f6feb', borderColor: '#58a6ff', pattern: 'gradient', conditionType: 'kills', threshold: 10, reqText: '击杀10人' },
    { id: 't2', name: '精英', icon: '🎯', color: '#ffffff', bg1: '#00cc66', bg2: '#00aa55', borderColor: '#00ff88', pattern: 'glow', conditionType: 'kills', threshold: 50, reqText: '击杀50人' },
    { id: 't3', name: '老兵', icon: '🔥', color: '#ffffff', bg1: '#ff6b6b', bg2: '#c92a2a', borderColor: '#ff6b6b', pattern: 'border', conditionType: 'kills', threshold: 100, reqText: '击杀100人' },
    { id: 't4', name: '战场之王', icon: '👑', color: '#ffeb85', bg1: '#ff8800', bg2: '#c92a2a', borderColor: '#ffaa00', pattern: 'shimmer', conditionType: 'kills', threshold: 200, reqText: '击杀200人' },
    { id: 't5', name: '传奇战神', icon: '💎', color: '#ffffff', bg1: '#d946ef', bg2: '#7c3aed', borderColor: '#d946ef', pattern: 'glow', conditionType: 'kills', threshold: 500, reqText: '击杀500人' }
];

let customTitles = [];

function loadCustomTitles() {
    try {
        const raw = localStorage.getItem('deathTrench_titles');
        if (raw) customTitles = JSON.parse(raw);
        else customTitles = JSON.parse(JSON.stringify(DEFAULT_TITLES_GAME));
    } catch (e) { customTitles = JSON.parse(JSON.stringify(DEFAULT_TITLES_GAME)); }
}

function loadGameParams() {
    try {
        const raw = localStorage.getItem('deathTrench_game_params');
        if (!raw) return;
        const params = JSON.parse(raw);
        if (params.WEAPONS && Array.isArray(params.WEAPONS) && params.WEAPONS.length > 0) {
            WEAPONS = params.WEAPONS;
        }
        if (params.ENEMY) {
            gameParams.ENEMY = Object.assign({}, gameParams.ENEMY, params.ENEMY);
        }
        if (params.PLAYER) {
            gameParams.PLAYER = Object.assign({}, gameParams.PLAYER, params.PLAYER);
        }
        if (params.MAP) {
            gameParams.MAP = Object.assign({}, gameParams.MAP, params.MAP);
            if (typeof params.MAP.MAP_SIZE === 'number') {
                MAP_SIZE = params.MAP.MAP_SIZE;
            }
        }
        if (params.DROPS) {
            gameParams.DROPS = Object.assign({}, gameParams.DROPS, params.DROPS);
        }
        if (params.BUFFS) {
            gameParams.BUFFS = Object.assign({}, gameParams.BUFFS, params.BUFFS);
        }
        console.log('[PARAMS] 已加载自定义游戏参数');
    } catch (e) {
        console.warn('[PARAMS] 游戏参数加载失败，使用默认值', e);
    }
}

function buildTitleStyle(t) {
    if (!t) return '';
    let bg = 'linear-gradient(135deg,' + t.bg1 + ',' + t.bg2 + ')';
    let style = 'display:inline-block;padding:4px 14px;border-radius:12px;font-size:12px;font-weight:600;border:1px solid ' + t.borderColor + ';background:' + bg + ';color:' + t.color + ';';
    if (t.pattern === 'glow') style += 'box-shadow:0 0 10px ' + t.borderColor + ',0 0 18px ' + t.color + ';';
    if (t.pattern === 'shimmer') style += 'animation:shimmer 2.5s infinite;';
    if (t.pattern === 'border') style += 'border:2px solid ' + t.borderColor + ';box-shadow:inset 0 0 8px rgba(255,255,255,0.15);';
    if (t.pattern === 'stripes') style += 'background-image:repeating-linear-gradient(45deg, rgba(255,255,255,0.1) 0 4px, transparent 4px 10px),linear-gradient(135deg,' + t.bg1 + ',' + t.bg2 + ');';
    if (t.pattern === 'dots') style += 'background-image:radial-gradient(circle,rgba(255,255,255,0.15) 1px,transparent 1.5px),linear-gradient(135deg,' + t.bg1 + ',' + t.bg2 + ');background-size:8px 8px,cover;';
    return style;
}

function checkTitleCondition(t) {
    if (!t || t.conditionType === 'default') return true;
    const kills = playerData.totalKills || 0;
    const score = playerData.totalScore || 0;
    const missions = (typeof completedMissionIds !== 'undefined' && completedMissionIds) ? completedMissionIds.length : 0;
    const playtime = playerData.playTimeSeconds || 0;
    const deaths = playerData.totalDeaths || 0;
    const kd = deaths > 0 ? (kills / deaths) : kills;
    const coins = playerData.coins || 0;
    switch (t.conditionType) {
        case 'kills': return kills >= (t.threshold || 0);
        case 'score': return score >= (t.threshold || 0);
        case 'missions': return missions >= (t.threshold || 0);
        case 'playtime': return playtime >= (t.threshold || 0);
        case 'kd': return kd >= (t.threshold || 0);
        case 'coins': return coins >= (t.threshold || 0);
        default: return false;
    }
}

function updatePlayerTitle() {
    loadCustomTitles();
    // 找到最后一个满足条件的称号（列表顺序即等级顺序）
    let best = customTitles[0];
    for (let i = 0; i < customTitles.length; i++) {
        if (checkTitleCondition(customTitles[i])) best = customTitles[i];
    }
    playerData.title = best.name;
    savePlayerData();
}

const playerData = {
    playerName: '战壕战士',
    coins: 1000,
    totalKills: 0,
    totalDeaths: 0,
    totalScore: 0,
    playTimeSeconds: 0,
    title: '新兵',
    equippedArmor: '',
    selectedMap: 'desert',
    inventory: {
        medkits: 3,
        armor_light: 0,
        armor_heavy: 0,
        grenades: 2,
        ammoBox: 5,
        speedBoost: 1
    }
};

function loadPlayerData() {
    try {
        const raw = localStorage.getItem('deathTrench_player');
        if (raw) {
            const saved = JSON.parse(raw);
            Object.assign(playerData, saved);
        }
    } catch (e) {}
}

function savePlayerData() {
    try {
        localStorage.setItem('deathTrench_player', JSON.stringify(playerData));
    } catch (e) {}
}

function formatPlayTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return h + '小时' + m + '分钟';
    if (m > 0) return m + '分钟' + s + '秒';
    return s + '秒';
}

function getKD() {
    const k = playerData.totalKills || 0;
    const d = playerData.totalDeaths || 0;
    if (d === 0) return k.toFixed(1);
    return (k / d).toFixed(2);
}

// ============================================================
// 地图生成
// ============================================================
function generateMap(theme) {
    // 尝试从自定义地图加载
    if (loadCustomMapIfExists(theme)) {
        console.log('[MAP] Custom map loaded');
        return;
    }

    const colors = {
        desert: { ground: '#2d2d1a', obstacle: '#8b7355', cover: '#4a3728', building: '#6b5344', water: '#1e3a5f' },
        city: { ground: '#2a2a2a', obstacle: '#4a4a4a', cover: '#3a3a5a', building: '#5a5a6a', water: '#1e3a5f' },
        factory: { ground: '#252525', obstacle: '#4a4a4a', cover: '#3a4a5a', building: '#5a5a7a', water: '#1e3a3f' },
        jungle: { ground: '#1a2d1a', obstacle: '#2a4a2a', cover: '#1a3a4a', building: '#3a3a4a', water: '#1e3a3f' },
        snow: { ground: '#4a4a5a', obstacle: '#6a6a7a', cover: '#5a6a8a', building: '#7a7a8a', water: '#3a5a7a' }
    };
    const c = colors[theme] || colors.desert;

    mapData = {};
    const seed = Date.now();

    const obstacleRate = gameParams.MAP.obstacleRate || 0.08;
    const coverRate = gameParams.MAP.coverRate || 0.14;
    const buildingRate = gameParams.MAP.buildingRate || 0.18;
    const waterRate = gameParams.MAP.waterRate || 0.20;

    for (let y = 0; y < MAP_SIZE; y++) {
        for (let x = 0; x < MAP_SIZE; x++) {
            const rand = ((seed + x * 9301 + y * 49297) % 233280) / 233280;
            let type = 'ground';
            let color = c.ground;

            if (rand < obstacleRate) {
                type = 'obstacle';
                color = c.obstacle;
            } else if (rand < coverRate) {
                type = 'cover';
                color = c.cover;
            } else if (rand < buildingRate) {
                type = 'building';
                color = c.building;
            } else if (rand < waterRate && theme !== 'snow') {
                type = 'water';
                color = c.water;
            }

            // 出生点附近保持空地
            const centerX = MAP_SIZE / 2;
            const centerY = MAP_SIZE / 2;
            if (Math.abs(x - centerX) < 5 && Math.abs(y - centerY) < 5) {
                type = 'ground';
                color = c.ground;
            }

            mapData[`${x}_${y}`] = { type, color };
        }
    }
    
    console.log('[MAP] Generated map with', Object.keys(mapData).length, 'tiles');
}

function loadCustomMapIfExists(mapName) {
    try {
        const raw = localStorage.getItem('deathTrench_custom_maps');
        if (!raw) return false;
        const savedMaps = JSON.parse(raw);
        if (!Array.isArray(savedMaps) || savedMaps.length === 0) return false;

        // 按名称匹配；如果没有精确匹配，则检查最后保存的（优先加载最近编辑）
        let target = null;
        for (const m of savedMaps) {
            if (m.name === mapName) {
                target = m;
                break;
            }
        }
        // 如果传入的是预设主题名但也有自定义地图，则仅在名称匹配时加载
        if (!target) return false;

        if (!Array.isArray(target.data)) return false;

        mapData = {};
        const mapColors = {
            0: '#2d2d1a',  // ground
            1: '#8b7355',  // obstacle
            2: '#4a3728',  // cover
            3: '#6b5344',  // building
            4: '#1e3a5f'   // water
        };
        const typeNames = ['ground', 'obstacle', 'cover', 'building', 'water'];

        const rows = target.data.length;
        const cols = target.data[0].length;
        // 地图大小由自定义地图决定
        MAP_SIZE = Math.max(rows, cols);

        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const tileVal = target.data[y][x];
                const type = typeNames[tileVal] || 'ground';
                const color = mapColors[tileVal] || '#2d2d1a';
                // 保证地图中心5x5是空地
                const centerX = MAP_SIZE / 2;
                const centerY = MAP_SIZE / 2;
                if (Math.abs(x - centerX) < 5 && Math.abs(y - centerY) < 5) {
                    mapData[`${x}_${y}`] = { type: 'ground', color: '#2d2d1a' };
                } else {
                    mapData[`${x}_${y}`] = { type, color };
                }
            }
        }
        console.log(`[MAP] 已加载自定义地图: ${target.name} (${cols}x${rows})`);
        return true;
    } catch (e) {
        console.warn('[MAP] 自定义地图加载失败:', e);
        return false;
    }
}

function getTile(x, y) {
    // 地图边界外返回纯黑色（用于渲染）
    if (x < 0 || x >= MAP_SIZE || y < 0 || y >= MAP_SIZE) {
        return { type: 'void', color: '#000000' };
    }
    return mapData[`${x}_${y}`] || { type: 'ground', color: '#2d2d1a' };
}

// 检查周围4个角点格子 (±0.5)
function isBlocked(x, y) {
    // 地图边界外禁止进入
    if (x < 0 || x >= MAP_SIZE || y < 0 || y >= MAP_SIZE) {
        return true;
    }
    const offsets = [
        [-0.49, -0.49], [0.49, -0.49],
        [-0.49, 0.49], [0.49, 0.49]
    ];

    for (let i = 0; i < offsets.length; i++) {
        const tx = Math.floor(x + offsets[i][0]);
        const ty = Math.floor(y + offsets[i][1]);
        const tile = getTile(tx, ty);
        if (tile.type === 'obstacle' || tile.type === 'building' || tile.type === 'water') {
            return true;
        }
    }
    return false;
}

// 圆形多采样碰撞检测
function isBlockedCircle(x, y, radius) {
    // 地图边界外禁止进入
    if (x - radius < 0 || x + radius >= MAP_SIZE || y - radius < 0 || y + radius >= MAP_SIZE) {
        return true;
    }
    const samples = 8;
    for (let i = 0; i < samples; i++) {
        const angle = (i / samples) * Math.PI * 2;
        const sx = x + Math.cos(angle) * radius * 0.9;
        const sy = y + Math.sin(angle) * radius * 0.9;
        const tx = Math.floor(sx);
        const ty = Math.floor(sy);
        const tile = getTile(tx, ty);
        if (tile.type === 'obstacle' || tile.type === 'building' || tile.type === 'water') {
            return true;
        }
    }
    // 额外检查中心点
    const centerTile = getTile(Math.floor(x), Math.floor(y));
    if (centerTile.type === 'obstacle' || centerTile.type === 'building' || centerTile.type === 'water') {
        return true;
    }
    return false;
}

// ============================================================
// 对象池工具：使用 alive 标记 + 顺序复用
// ============================================================
function poolPushBullet(obj) {
    if (bullets.length >= POOL_BULLET_MAX) {
        // 超上限：找一个已死亡的槽位复用
        for (let i = 0; i < bullets.length; i++) {
            if (!bullets[i].alive) {
                Object.assign(bullets[i], obj, { alive: true });
                return;
            }
        }
        return; // 池已满且都在使用，直接丢弃
    }
    obj.alive = true;
    bullets.push(obj);
}

function poolPushExplosion(obj) {
    if (explosions.length >= POOL_EXPLOSION_MAX) {
        for (let i = 0; i < explosions.length; i++) {
            if (!explosions[i].alive) {
                Object.assign(explosions[i], obj, { alive: true });
                return;
            }
        }
        return;
    }
    obj.alive = true;
    explosions.push(obj);
}

function poolPushDrop(obj) {
    if (drops.length >= POOL_DROP_MAX) {
        for (let i = 0; i < drops.length; i++) {
            if (!drops[i].alive) {
                Object.assign(drops[i], obj, { alive: true });
                return;
            }
        }
        return;
    }
    obj.alive = true;
    drops.push(obj);
}

// ============================================================
// 加载动画
// ============================================================
function showLoadingScreen(callback) {
    const loadingDiv = document.createElement('div');
    loadingDiv.id = 'loadingScreen';
    loadingDiv.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        z-index: 9999;
        color: #fff;
        font-family: Arial, sans-serif;
    `;

    loadingDiv.innerHTML = `
        <div style="font-size: 48px; margin-bottom: 20px;">🎮</div>
        <div style="font-size: 24px; margin-bottom: 30px;">死亡战壕 2D</div>
        <div style="font-size: 18px; margin-bottom: 20px;">正在加载地图...</div>
        <div style="width: 300px; height: 20px; background: #333; border-radius: 10px; overflow: hidden;">
            <div id="loadingBar" style="width: 0%; height: 100%; background: linear-gradient(90deg, #00ff88, #00cc66); transition: width 0.3s;"></div>
        </div>
        <div id="loadingPercent" style="font-size: 16px; margin-top: 10px;">0%</div>
        <div id="loadingTip" style="font-size: 14px; margin-top: 20px; color: #888;">提示：WASD移动，鼠标瞄准射击</div>
    `;

    document.body.appendChild(loadingDiv);

    let progress = 0;
    const tips = [
        '提示：WASD移动，鼠标瞄准射击',
        '提示：1/2/3切换武器，G键投掷手雷',
        '提示：R键换弹',
        '提示：空格键自动射击',
        '提示：收集掉落物获得奖励'
    ];

    // 关键修复：先声明超时定时器，避免 TDZ 引用问题（setInterval 回调中引用）
    const LOAD_TIMEOUT = 15000; // 15秒超时
    let timeoutGuard = null;

    const loadInterval = setInterval(() => {
        progress += 10;
        if (progress > 100) progress = 100;

        document.getElementById('loadingBar').style.width = progress + '%';
        document.getElementById('loadingPercent').textContent = progress + '%';
        // 防止越界：进度为100时 index 越界
        const tipIndex = Math.min(tips.length - 1, Math.floor(progress / 25));
        document.getElementById('loadingTip').textContent = tips[tipIndex];

        if (progress >= 100) {
            clearInterval(loadInterval);
            if (timeoutGuard) clearTimeout(timeoutGuard); // 关键修复：正常完成时也清除超时定时器，避免内存泄漏
            setTimeout(() => {
                loadingDiv.remove();
                callback();
            }, 500);
        }
    }, 100);
    
    // 设置超时保护，防止 setInterval 在异常情况下永不清理导致内存泄漏
    timeoutGuard = setTimeout(() => {
        clearInterval(loadInterval);
        console.warn('[LOAD] Loading screen timeout, force removing');
        try { loadingDiv.remove(); } catch (e) {}
        callback();
    }, LOAD_TIMEOUT);
}

function startGame() {
    hideAllPanels();
    showLoadingScreen(() => {
        actuallyStartGame();
    });
}

function actuallyStartGame() {
    // 隐藏大厅和所有面板
    const lobby = document.getElementById('lobby');
    if (lobby) {
        lobby.classList.add('hidden');
        lobby.style.display = 'none';
    }
    const lobbyPanels = document.querySelector('.lobby-panels');
    if (lobbyPanels) {
        lobbyPanels.classList.remove('active');
        lobbyPanels.style.display = 'none';
    }
    
    // 确保 gameContainer 和 canvas 正确显示
    const gameContainer = document.getElementById('gameContainer');
    if (gameContainer) {
        gameContainer.style.display = 'block';
    }
    
    // 确保 canvas 存在且有上下文
    if (!canvas || !ctx) {
        canvas = document.getElementById('gameCanvas');
        if (canvas) {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            ctx = canvas.getContext('2d');
        }
    }
    
    document.getElementById('weaponSelector').style.display = 'flex';
    const _ctrlStart = document.getElementById('controls');
    if (_ctrlStart) _ctrlStart.style.display = 'block';
    document.getElementById('hud').style.display = 'block';
    document.getElementById('gameSettingsBtn').style.display = 'flex';

    generateMap(playerData.selectedMap);
    selectMissionForMap(playerData.selectedMap);

    // 玩家出生在地图中心（格子坐标）
    const startX = Math.floor(MAP_SIZE / 2);
    const startY = Math.floor(MAP_SIZE / 2);

    const armorBonus = playerData.equippedArmor === 'heavy' ? 60 : playerData.equippedArmor === 'light' ? 30 : 0;
    const playerMaxHealth = (gameParams.PLAYER.maxHealth || 100) + armorBonus;

    player = {
        x: startX,
        y: startY,
        health: playerMaxHealth,
        maxHealth: playerMaxHealth,
        score: 0,
        kills: 0,
        angle: -Math.PI / 2,
        currentWeapon: 0,
        weapons: WEAPONS.map(w => ({ ...w, currentAmmo: w.clipSize })),
        buffs: { speedBoostUntil: 0, damageReduction: 0 }
    };

    // 撤离点：玩家出生位置
    extractX = startX;
    extractY = startY;
    isExtracting = false;
    extractStartTime = 0;
    extractProgress = 0;

    // 重置撤离进度 HUD 和 GameOver 面板文字
    const extractBar = document.getElementById('extractProgressBar');
    if (extractBar) extractBar.style.display = 'none';
    const goPanel = document.getElementById('gameOver');
    if (goPanel) {
        const titleEl = goPanel.querySelector('h2');
        if (titleEl) titleEl.textContent = '游戏结束';
        const subEl = goPanel.querySelector('p');
        if (subEl) subEl.textContent = '您的英勇战斗将被铭记';
    }

    // 重置对象池数组，防止旧引用造成问题
    bullets = [];
    enemies = [];
    drops = [];
    explosions = [];
    lastEnemySpawn = Date.now();

    // 清空按键状态
    keys.clear();

    gameRunning = true;
    gameStartTime = Date.now();
    updateHUD();
    
    // 初始化自动射击 UI 状态
    const statusEl = document.getElementById('autoFireStatus');
    if (statusEl) {
        statusEl.classList.toggle('on', autoFire);
        statusEl.classList.toggle('off', !autoFire);
    }

    // 确保 canvas 获得焦点
    canvas.style.pointerEvents = 'auto';
    canvas.focus();
    console.log('[START] Canvas focused, gameRunning:', gameRunning);
    console.log('[START] Map tiles:', Object.keys(mapData).length);
    console.log('[START] Player:', player);
    console.log('[START] Game container display:', gameContainer.style.display);

    // 关键修复：游戏重新开始时，取消上一次的动画帧请求，
    // 避免多个 gameLoop 同时运行导致死循环式的性能耗尽/状态冲突
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }

    lastTickTime = performance.now();
    
    // 强制立即绘制一帧
    draw();
    
    animationId = requestAnimationFrame(gameLoop);
}

const TICK_RATE = 60;
const TICK_INTERVAL = 1000 / TICK_RATE;
let lastTickTime = 0;
let tickAccumulator = 0;
let gameStartTime = 0;

// ============================================================
// 游戏状态清理函数（防止状态残留导致的类死锁/内存泄漏）
// ============================================================
function cleanupGameState() {
    // 清理定时器
    stopAutoBackup();
    
    // 清理动画帧
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }
    
    // 重置游戏状态标志
    gameRunning = false;
    autoFire = false;
    shiftHeld = false;
    isExtracting = false;
    extractProgress = 0;
    extractStartTime = 0;
    
    // 清理按键状态
    keys.clear();
    
    // 清理对象池
    bullets = [];
    enemies = [];
    drops = [];
    explosions = [];
    
    // 重置时间相关状态
    lastTickTime = 0;
    tickAccumulator = 0;
    gameStartTime = 0;
    lastShot = 0;
    lastEnemySpawn = 0;
    lastItemUse = 0;
    
    // 清理地图缓存
    if (mapCanvas && mapCtx) {
        mapCtx.clearRect(0, 0, mapCanvas.width, mapCanvas.height);
    }
    
    // 重置敌人路径计算索引
    window.__nextEnemyPathfinder = 0;
    
    // 隐藏撤离进度条
    const extractBar = document.getElementById('extractProgressBar');
    if (extractBar) extractBar.style.display = 'none';
    
    // 隐藏物资轮盘
    showItemWheel(false);
}

function gameLoop(timestamp) {
    if (!gameRunning) {
        // 保险：游戏停止时立即取消挂起的帧，避免后续残留调用
        if (animationId) {
            cancelAnimationFrame(animationId);
            animationId = null;
        }
        return;
    }

    const deltaTime = timestamp - lastTickTime;
    // 使用累加器避免高刷新率下 update 被跳过（减少死循环风险）
    tickAccumulator += deltaTime;
    if (tickAccumulator >= TICK_INTERVAL) {
        // 限制单次最大 update 次数，防止卡顿后“雪崩”式追赶
        let safety = 3;
        while (tickAccumulator >= TICK_INTERVAL && safety > 0) {
            update();
            tickAccumulator -= TICK_INTERVAL;
            safety--;
        }
        if (tickAccumulator > TICK_INTERVAL * 10) {
            tickAccumulator = 0; // 严重丢帧时清零，避免追赶
        }
        lastTickTime = timestamp;
    } else {
        lastTickTime = timestamp;
    }

    draw();
    animationId = requestAnimationFrame(gameLoop);
}

// ============================================================
// 更新逻辑
// ============================================================
function update() {
    const now = Date.now();

    // 计算速度倍率（考虑 buff：speedBoostUntil）
    let speedMultiplier = parseFloat(settings.playerSpeed) / 100;
    if (player.buffs && player.buffs.speedBoostUntil && now < player.buffs.speedBoostUntil) {
        speedMultiplier *= 1.5;
    }
    const baseSpeed = 0.05;
    const speed = baseSpeed * speedMultiplier;

    let dx = 0, dy = 0;

    // Shift 按住时 WASD 用于物资使用，不移动
    const shiftInUse = typeof shiftHeld !== 'undefined' && shiftHeld;
    if (!shiftInUse && keys.has('KeyW') && keys.get('KeyW')) dy -= speed;
    if (!shiftInUse && keys.has('KeyS') && keys.get('KeyS')) dy += speed;
    if (!shiftInUse && keys.has('KeyA') && keys.get('KeyA')) dx -= speed;
    if (!shiftInUse && keys.has('KeyD') && keys.get('KeyD')) dx += speed;
    if (keys.has('ArrowUp') && keys.get('ArrowUp')) dy -= speed;
    if (keys.has('ArrowDown') && keys.get('ArrowDown')) dy += speed;
    if (keys.has('ArrowLeft') && keys.get('ArrowLeft')) dx -= speed;
    if (keys.has('ArrowRight') && keys.get('ArrowRight')) dx += speed;

    if (dx !== 0 || dy !== 0) {
        const length = Math.sqrt(dx * dx + dy * dy);
        dx = (dx / length) * speed;
        dy = (dy / length) * speed;

        const newX = player.x + dx;
        const newY = player.y + dy;

        if (!isBlockedCircle(newX, newY, PLAYER_SIZE * 0.5)) {
            player.x = newX;
            player.y = newY;
        }
    }

    // 计算瞄准角度（鼠标位置相对于屏幕中心）
    const screenCenterX = canvas.width / 2;
    const screenCenterY = canvas.height / 2;
    player.angle = Math.atan2(mouseY - screenCenterY, mouseX - screenCenterX);

    if (autoFire && canShoot()) {
        shoot();
    }

    // 更新子弹（包括手雷）
    for (let i = 0; i < bullets.length; i++) {
        const bullet = bullets[i];
        if (!bullet.alive) continue;

        bullet.distance += bullet.speed;

        // 手雷：按距离/时间到达后爆炸
        if (bullet.type === 'grenade') {
            if (bullet.distance > bullet.range) {
                // 到达射程 -> 爆炸
                explodeGrenade(bullet.x, bullet.y);
                bullet.alive = false;
                continue;
            }
        } else {
            if (bullet.distance > bullet.range) {
                bullet.alive = false;
                continue;
            }
        }

        const newX = bullet.x + Math.cos(bullet.angle) * bullet.speed;
        const newY = bullet.y + Math.sin(bullet.angle) * bullet.speed;

        if (isBlocked(newX, newY)) {
            if (bullet.type === 'grenade') {
                explodeGrenade(bullet.x, bullet.y);
            } else {
                poolPushExplosion({ x: newX, y: newY, radius: 3, alpha: 1, color: '#ff4444' });
            }
            bullet.alive = false;
            continue;
        }

        bullet.x = newX;
        bullet.y = newY;

        if (bullet.owner === 'player' && bullet.type !== 'grenade') {
            let hit = false;
            for (let j = 0; j < enemies.length; j++) {
                const enemy = enemies[j];
                if (!enemy.alive) continue;
                const dxh = bullet.x - enemy.x;
                const dyh = bullet.y - enemy.y;
                if (dxh * dxh + dyh * dyh < 1.0) {
                    enemy.health -= bullet.damage;
                    poolPushExplosion({ x: enemy.x, y: enemy.y, radius: 4, alpha: 1, color: '#ff0044' });
                    if (enemy.health <= 0) {
                        enemy.alive = false;
                        player.kills++;
                        player.score += 100;
                        spawnDrop(enemy.x, enemy.y);
                        updateMissionProgress('kill', player.kills);
                        updateMissionProgress('score', player.score);
                    }
                    hit = true;
                    break;
                }
            }
            if (hit) {
                bullet.alive = false;
                continue;
            }
        } else if (bullet.owner === 'enemy') {
            const dxe = bullet.x - player.x;
            const dye = bullet.y - player.y;
            if (dxe * dxe + dye * dye < 1.0) {
                // 考虑 damageReduction buff
                let damage = bullet.damage;
                if (player.buffs && player.buffs.damageReduction) {
                    damage = Math.max(1, Math.floor(damage * (1 - player.buffs.damageReduction)));
                }
                player.health -= damage;
                poolPushExplosion({ x: player.x, y: player.y, radius: 5, alpha: 1, color: '#ff0000' });
                if (player.health <= 0) {
                    gameOver();
                }
                bullet.alive = false;
                continue;
            }
        }
    }

    // 清理敌人（从后往前打标记删除）
    for (let i = enemies.length - 1; i >= 0; i--) {
        if (!enemies[i].alive) enemies.splice(i, 1);
    }

    // 生成敌人
    const difficultyMul = settings.difficulty === 'hard' ? 1.8 : settings.difficulty === 'easy' ? 0.6 : 1;
    const enemyCount = Math.floor((gameParams.ENEMY.count || 5) * difficultyMul);
    const spawnInterval = Math.floor((gameParams.ENEMY.spawnInterval || 3500) / difficultyMul);

    if (enemies.length < enemyCount && now - lastEnemySpawn > spawnInterval) {
        spawnEnemy();
        lastEnemySpawn = now;
    }

    // ==================== A* 寻路算法（替代原 DFS，避免随机分支造成的性能死锁） ====================
    // 关键优化：
    //   1) 仅允许 4 方向移动（与原 DFS 一致）
    //   2) 使用最小堆（二叉）优先级队列，距离越短越优先（确定性，避免 Math.random 抖动）
    //   3) 每次寻路使用硬迭代上限，极端大地图下也能在 O(N) 内结束
    //   4) 已访问集合记录最小代价，避免同一格反复展开造成的计算死循环
    function aStarPath(startX, startY, endX, endY) {
        const sX = Math.floor(startX);
        const sY = Math.floor(startY);
        const eX = Math.floor(endX);
        const eY = Math.floor(endY);

        // 边界 / 非法格快速拒绝
        if (sX < 0 || sX >= MAP_SIZE || sY < 0 || sY >= MAP_SIZE ||
            eX < 0 || eX >= MAP_SIZE || eY < 0 || eY >= MAP_SIZE) return null;

        const startTile = getTile(sX, sY);
        const endTile = getTile(eX, eY);
        const isBlockedTile = (t) => (t.type === 'obstacle' || t.type === 'building' || t.type === 'water');
        if (isBlockedTile(startTile) || isBlockedTile(endTile)) return null;
        if (sX === eX && sY === eY) return [{x: sX, y: sY}];

        // 最小堆：f 值升序
        const heap = [];
        function heapPush(node) {
            heap.push(node);
            let i = heap.length - 1;
            while (i > 0) {
                const p = (i - 1) >> 1;
                if (heap[p].f <= heap[i].f) break;
                [heap[p], heap[i]] = [heap[i], heap[p]];
                i = p;
            }
        }
        function heapPop() {
            if (heap.length === 0) return null;
            const top = heap[0];
            const last = heap.pop();
            if (heap.length > 0) {
                heap[0] = last;
                let i = 0;
                const n = heap.length;
                let heapIter = 0;
                const HEAP_MAX_ITER = n * 2 + 8; // 硬上限，防御性防止任何极端场景下的类死锁
                while (heapIter < HEAP_MAX_ITER) {
                    const l = i * 2 + 1, r = i * 2 + 2;
                    let m = i;
                    if (l < n && heap[l].f < heap[m].f) m = l;
                    if (r < n && heap[r].f < heap[m].f) m = r;
                    if (m === i) break;
                    [heap[m], heap[i]] = [heap[i], heap[m]];
                    i = m;
                    heapIter++;
                }
            }
            return top;
        }

        // 曼哈顿启发式（对 4 方向网格是可采纳的，保证最优）
        function h(x, y) { return Math.abs(x - eX) + Math.abs(y - eY); }

        const keyOf = (x, y) => y * MAP_SIZE + x;
        const gScore = new Map();    // key -> 当前已知最小代价
        const cameFrom = new Map();  // key -> parent key

        const startKey = keyOf(sX, sY);
        gScore.set(startKey, 0);
        heapPush({x: sX, y: sY, g: 0, f: h(sX, sY)});

        const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
        const MAX_VISITS = 800; // 硬上限：防止超大障碍物包围下的 CPU 饥饿（类死锁）
        let visits = 0;

        while (heap.length > 0 && visits < MAX_VISITS) {
            const cur = heapPop();
            const ck = keyOf(cur.x, cur.y);
            // 关键修复：使用堆节点中实际存储的 g 值（cur.g）进行比较，
            // 而非再次计算 cur.f - h(cur.x, cur.y)，避免浮点误差导致同一格反复展开。
            // 同时增加小 epsilon 容差，避免因浮点精度造成的边界抖动。
            const curG = gScore.get(ck);
            const storedG = (typeof cur.g === 'number') ? cur.g : (cur.f - h(cur.x, cur.y));
            const EPS = 1e-6;
            if (curG !== undefined && storedG > curG + EPS) { visits++; continue; }
            visits++;

            if (cur.x === eX && cur.y === eY) {
                // 回溯路径：最多回溯 MAP_SIZE*MAP_SIZE 步，防御性防止循环（理论不可能发生，但作为兜底）
                const path = [];
                let k = ck;
                let backtrackGuard = 0;
                const MAX_BACKTRACK = MAP_SIZE * MAP_SIZE;
                while (k !== undefined && backtrackGuard < MAX_BACKTRACK) {
                    const y = Math.floor(k / MAP_SIZE);
                    const x = k - y * MAP_SIZE;
                    path.push({x, y});
                    k = cameFrom.get(k);
                    backtrackGuard++;
                }
                path.reverse();
                return path;
            }

            for (const [dx, dy] of dirs) {
                const nx = cur.x + dx, ny = cur.y + dy;
                if (nx < 0 || nx >= MAP_SIZE || ny < 0 || ny >= MAP_SIZE) continue;
                const tile = getTile(nx, ny);
                if (isBlockedTile(tile)) continue;
                const tentative = (curG !== undefined ? curG : 0) + 1;
                const nk = keyOf(nx, ny);
                const curNkG = gScore.get(nk);
                // 只有当新路径严格更优时才入堆（避免堆膨胀 -> 类死锁 / 性能雪崩），
                // 加入 epsilon 防止浮点抖动造成的误判入堆。
                if (curNkG === undefined || tentative < curNkG - EPS) {
                    cameFrom.set(nk, ck);
                    gScore.set(nk, tentative);
                    heapPush({x: nx, y: ny, g: tentative, f: tentative + h(nx, ny)});
                }
            }
        }
        return null;
    }

    // ==================== 更新敌人 AI ====================
    const baseEnemyDamage = typeof gameParams.ENEMY.damage === 'object'
        ? (gameParams.ENEMY.damage[settings.difficulty] || 12)
        : (gameParams.ENEMY.damage || 12);
    const enemyDamage = Math.floor(baseEnemyDamage * difficultyMul);
    const enemyMoveSpeed = gameParams.ENEMY.moveSpeed || 0.35;

    // 关键修复：每帧最多只允许 1 个敌人进行 A* 重算（本帧内只计算一次），
    // 其余沿已缓存路径移动。避免 N 个敌人因 !enemy.path 为真而全部重算，
    // 导致 CPU 被瞬间耗尽（级联性能死锁 / 卡顿）。
    let pathfinderIndex = (typeof window.__nextEnemyPathfinder === 'number')
        ? window.__nextEnemyPathfinder : 0;
    // 防御性：窗口大小变更时 enemies 长度变化，防止索引越界
    if (pathfinderIndex >= enemies.length) pathfinderIndex = 0;
    let pathComputedThisFrame = false;

    for (let i = 0; i < enemies.length; i++) {
        const enemy = enemies[i];
        const dxE = player.x - enemy.x;
        const dyE = player.y - enemy.y;
        const distSq = dxE * dxE + dyE * dyE;
        const dist = distSq > 0 ? Math.sqrt(distSq) : 0.01;

        if (dist < 30) {
            enemy.angle = Math.atan2(dyE, dxE);

            // 路径刷新：当前敌人被轮到（轮询） + 定时
            const pathInterval = typeof enemy.pathUpdateInterval === 'number'
                ? enemy.pathUpdateInterval
                : 800;
            const timeOk = (now - (enemy.lastPathUpdate || 0)) > pathInterval;
            const isSelected = (i === pathfinderIndex) || !enemy.path;
            // 关键：本帧最多只做 1 次 A* 计算，其他延后
            if (isSelected && timeOk && !pathComputedThisFrame) {
                const enemyGridX = Math.floor(enemy.x);
                const enemyGridY = Math.floor(enemy.y);
                const playerGridX = Math.floor(player.x);
                const playerGridY = Math.floor(player.y);
                enemy.path = aStarPath(enemyGridX, enemyGridY, playerGridX, playerGridY);
                enemy.pathIndex = 1;
                enemy.lastPathUpdate = now;
                pathComputedThisFrame = true;
                window.__nextEnemyPathfinder = (pathfinderIndex + 1) % Math.max(1, enemies.length);
            } else if (!enemy.path && pathComputedThisFrame) {
                // 已经算过了，无路径的敌人这一帧退化为直接向玩家移动
                // （在下方分支已处理，无需额外操作）
            }

            // 沿路径移动
            if (enemy.path && enemy.pathIndex < enemy.path.length) {
                const target = enemy.path[enemy.pathIndex];
                const targetX = target.x + 0.5;
                const targetY = target.y + 0.5;
                const dxPath = targetX - enemy.x;
                const dyPath = targetY - enemy.y;
                const distToTarget = Math.sqrt(dxPath * dxPath + dyPath * dyPath);
                if (distToTarget < 0.5) {
                    enemy.pathIndex++;
                } else {
                    const moveX = (dxPath / distToTarget) * enemyMoveSpeed;
                    const moveY = (dyPath / distToTarget) * enemyMoveSpeed;
                    const newX = enemy.x + moveX;
                    const newY = enemy.y + moveY;
                    if (!isBlocked(newX, newY)) {
                        enemy.x = newX;
                        enemy.y = newY;
                    } else {
                        // 被挡 → 侧向试探，仍失败则标记路径作废等待下次重算
                        const tryOffsets = [
                            [moveY, -moveX], [-moveY, moveX],
                            [moveX * 0.5, 0], [0, moveY * 0.5]
                        ];
                        let moved = false;
                        for (const [ox, oy] of tryOffsets) {
                            const altX = enemy.x + ox;
                            const altY = enemy.y + oy;
                            if (!isBlocked(altX, altY)) {
                                enemy.x = altX;
                                enemy.y = altY;
                                moved = true;
                                break;
                            }
                        }
                        if (!moved) enemy.path = null;
                    }
                }
            } else {
                // 无路径：直接向玩家方向移动（保持距离）
                let moveX = 0, moveY = 0;
                if (dist > 12) {
                    moveX = (dxE / dist) * enemyMoveSpeed;
                    moveY = (dyE / dist) * enemyMoveSpeed;
                } else if (dist < 3) {
                    moveX = -(dxE / dist) * enemyMoveSpeed;
                    moveY = -(dyE / dist) * enemyMoveSpeed;
                } else {
                    const perp = Math.sin(now * 0.002 + i) > 0 ? 1 : -1;
                    moveX = -dyE / dist * enemyMoveSpeed * 0.3 * perp;
                    moveY = dxE / dist * enemyMoveSpeed * 0.3 * perp;
                }
                const newEnemyX = enemy.x + moveX;
                const newEnemyY = enemy.y + moveY;
                if (!isBlocked(newEnemyX, newEnemyY)) {
                    enemy.x = newEnemyX;
                    enemy.y = newEnemyY;
                } else {
                    const tryOffsets = [[moveY, -moveX], [-moveY, moveX]];
                    for (const [ox, oy] of tryOffsets) {
                        const altX = enemy.x + ox;
                        const altY = enemy.y + oy;
                        if (!isBlocked(altX, altY)) {
                            enemy.x = altX;
                            enemy.y = altY;
                            break;
                        }
                    }
                }
            }

            // 在 3~12 格范围内射击
            if (dist >= 3 && dist <= 12 && now - enemy.lastShot > enemy.fireRate) {
                poolPushBullet({
                    x: enemy.x + Math.cos(enemy.angle) * 0.5,
                    y: enemy.y + Math.sin(enemy.angle) * 0.5,
                    angle: enemy.angle,
                    speed: 0.5,
                    damage: enemyDamage,
                    range: 20,
                    distance: 0,
                    owner: 'enemy',
                    type: 'bullet'
                });
                enemy.lastShot = now;
            }
        }
    }

    // 更新爆炸效果
    for (let i = 0; i < explosions.length; i++) {
        const exp = explosions[i];
        if (!exp.alive) continue;
        exp.radius += 0.5;
        exp.alpha -= 0.1;
        if (exp.alpha <= 0) exp.alive = false;
    }

    // 更新掉落物
    for (let i = 0; i < drops.length; i++) {
        const drop = drops[i];
        if (!drop.alive) continue;
        const dxd = player.x - drop.x;
        const dyd = player.y - drop.y;
        if (dxd * dxd + dyd * dyd < 4) {
            collectDrop(drop);
            drop.alive = false;
        }
    }

    // 每帧检测撤离区域
    checkExtraction(now);

    updateHUD();
}

// ============================================================
// 手雷爆炸：半径由参数控制，伤害由参数控制
// ============================================================
function explodeGrenade(x, y) {
    const grenadeRadius = gameParams.DROPS.grenadeRadius || 4;
    const grenadeDamage = gameParams.DROPS.grenadeDamage || 150;
    poolPushExplosion({ x, y, radius: grenadeRadius, alpha: 1, color: '#ff8800' });
    poolPushExplosion({ x, y, radius: grenadeRadius / 2, alpha: 1, color: '#ffdd00' });

    // 对范围内敌人造成伤害
    const blastRadiusSq = grenadeRadius * grenadeRadius;
    const blastDamage = grenadeDamage;
    for (let j = 0; j < enemies.length; j++) {
        const enemy = enemies[j];
        if (!enemy.alive) continue;
        const ddx = enemy.x - x;
        const ddy = enemy.y - y;
        if (ddx * ddx + ddy * ddy < blastRadiusSq) {
            enemy.health -= blastDamage;
            poolPushExplosion({ x: enemy.x, y: enemy.y, radius: 3, alpha: 1, color: '#ff0044' });
            if (enemy.health <= 0) {
                enemy.alive = false;
                player.kills++;
                player.score += 100;
                spawnDrop(enemy.x, enemy.y);
            }
        }
    }
    // 对玩家自身也造成一定伤害（避免在脚下扔）
    const pdx = player.x - x;
    const pdy = player.y - y;
    if (pdx * pdx + pdy * pdy < blastRadiusSq) {
        player.health -= 30;
        poolPushExplosion({ x: player.x, y: player.y, radius: 4, alpha: 1, color: '#ff0000' });
        if (player.health <= 0) gameOver();
    }
}

// ============================================================
// 撤离检测（独立函数，在 update() 主循环中每帧调用）
// ============================================================
function checkExtraction(now) {
    const ddx = player.x - extractX;
    const ddy = player.y - extractY;
    const distToExtract = Math.sqrt(ddx * ddx + ddy * ddy);
    const inExtractZone = !Number.isNaN(distToExtract) && distToExtract <= EXTRACT_RADIUS;

    if (inExtractZone) {
        if (!isExtracting) {
            isExtracting = true;
            extractStartTime = now;
        }
        extractProgress = Math.min(1, (now - extractStartTime) / EXTRACT_DURATION);
        updateExtractionHUD();
        if (extractProgress >= 1) {
            extractionSuccess();
        }
    } else {
        if (isExtracting) {
            isExtracting = false;
            extractProgress = 0;
            updateExtractionHUD();
        }
    }
}

// 投掷手雷：KeyG
function throwGrenade() {
    if (!gameRunning || !player) return;
    // 物品使用间隔（全局冷却）：避免疯狂按键导致的一次性多投
    if (enableItemCooldown) {
        const now = Date.now();
        if (now - lastItemUse < ITEM_COOLDOWN) return;
        lastItemUse = now;
    }
    if (!playerData.inventory || (playerData.inventory.grenades || 0) <= 0) {
        showNotification('没有手雷！');
        return;
    }
    playerData.inventory.grenades--;
    // 以玩家位置为中心飞向鼠标方向，速度 1.5 格/帧
    poolPushBullet({
        x: player.x + Math.cos(player.angle) * 0.5,
        y: player.y + Math.sin(player.angle) * 0.5,
        angle: player.angle,
        speed: 1.5,
        damage: 0,
        range: 20, // 飞行距离后爆炸
        distance: 0,
        owner: 'player',
        type: 'grenade'
    });
    updateHUD();
}

// ============================================================
// 绘制
// ============================================================
function draw() {
    // 关键修复：每次 draw() 不要再重新设置 canvas.width / canvas.height，
    // 因为 canvas 尺寸赋值会清空整个画布并重置绘制上下文状态，
    // 在 60fps 下这样做会导致：1) 闪烁；2) 大量 GC；3) 极端情况下绘制队列积压 -> 类死锁。
    // 仅在 init / resize 时设置一次尺寸；游戏运行中只做绘制。
    if (!ctx) {
        canvas = document.getElementById('gameCanvas');
        if (!canvas) return;
        ctx = canvas.getContext('2d');
    }
    
    // 先绘制一个简单的测试图案来确认渲染正常
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // 绘制网格背景
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
    
    // 如果没有 player，显示提示
    if (!player) {
        ctx.fillStyle = '#00cc66';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('等待玩家...', canvas.width/2, canvas.height/2);
        return;
    }
    
    // 如果没有地图数据，显示提示
    if (!mapData || Object.keys(mapData).length === 0) {
        ctx.fillStyle = '#ff4444';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('地图数据为空!', canvas.width/2, canvas.height/2);
        return;
    }
    
    // 绘制地图
    const screenCenterX = canvas.width / 2;
    const screenCenterY = canvas.height / 2;
    // 渲染范围跟随玩家，允许超出地图边界
    const minX = Math.floor(player.x - VIEW_RANGE_X);
    const maxX = Math.ceil(player.x + VIEW_RANGE_X);
    const minY = Math.floor(player.y - VIEW_RANGE_Y);
    const maxY = Math.ceil(player.y + VIEW_RANGE_Y);

    for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
            const tile = getTile(x, y);

            const screenX = screenCenterX + (x - player.x) * TILE_SIZE;
            const screenY = screenCenterY + (y - player.y) * TILE_SIZE;

            ctx.fillStyle = tile.color;
            ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);

            if (tile.type === 'obstacle') {
                ctx.fillStyle = '#4b5563';
                ctx.fillRect(screenX + 2, screenY + 2, TILE_SIZE - 4, TILE_SIZE - 4);
            } else if (tile.type === 'building') {
                ctx.fillStyle = '#64748b';
                ctx.fillRect(screenX + 1, screenY + 1, TILE_SIZE - 2, TILE_SIZE - 2);
            } else if (tile.type === 'water') {
                ctx.fillStyle = '#38bdf8';
                ctx.fillRect(screenX + 1, screenY + 1, TILE_SIZE - 2, TILE_SIZE - 2);
            }
        }
    }

    // 绘制玩家
    drawPlayer();

    // 绘制敌人
    for (let i = 0; i < enemies.length; i++) {
        const enemy = enemies[i];
        if (Math.abs(enemy.x - player.x) <= VIEW_RANGE_X && Math.abs(enemy.y - player.y) <= VIEW_RANGE_Y) {
            drawEnemy(enemy);
        }
    }

    // 绘制子弹
    for (let i = 0; i < bullets.length; i++) {
        const bullet = bullets[i];
        if (!bullet.alive) continue;
        if (Math.abs(bullet.x - player.x) <= VIEW_RANGE_X && Math.abs(bullet.y - player.y) <= VIEW_RANGE_Y) {
            drawBullet(bullet);
        }
    }

    // 绘制爆炸
    for (let i = 0; i < explosions.length; i++) {
        const exp = explosions[i];
        if (!exp.alive) continue;
        if (Math.abs(exp.x - player.x) <= VIEW_RANGE_X && Math.abs(exp.y - player.y) <= VIEW_RANGE_Y) {
            drawExplosion(exp);
        }
    }

    // 绘制掉落物
    for (let i = 0; i < drops.length; i++) {
        const drop = drops[i];
        if (!drop.alive) continue;
        if (Math.abs(drop.x - player.x) <= VIEW_RANGE_X && Math.abs(drop.y - player.y) <= VIEW_RANGE_Y) {
            drawDrop(drop);
        }
    }

    // 绘制撤离区域
    drawExtractionZone();
}

function drawExtractionZone() {
    const screenX = canvas.width / 2 + (extractX - player.x) * TILE_SIZE;
    const screenY = canvas.height / 2 + (extractY - player.y) * TILE_SIZE;
    const radius = EXTRACT_RADIUS * TILE_SIZE;

    // 脉冲动画
    const pulse = 0.6 + 0.4 * Math.sin(Date.now() / 300);

    // 外圈光晕
    ctx.save();
    ctx.globalAlpha = 0.15 * pulse;
    ctx.fillStyle = '#00ff88';
    ctx.beginPath();
    ctx.arc(screenX, screenY, radius * 1.5, 0, Math.PI * 2);
    ctx.fill();

    // 主撤离区域
    ctx.globalAlpha = 0.25 * pulse;
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 4]);
    ctx.beginPath();
    ctx.arc(screenX, screenY, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);

    // 中心撤离图标
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = '#00ff88';
    ctx.font = `bold ${TILE_SIZE * 1.2}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🚁', screenX, screenY);

    // 撤离文字
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#00ff88';
    ctx.font = `bold 11px 'Segoe UI', Arial, sans-serif`;
    ctx.fillText('撤离点', screenX, screenY - radius - 8);
    ctx.restore();
}

function drawPlayer() {
    const screenX = canvas.width / 2;
    const screenY = canvas.height / 2;

    ctx.save();
    ctx.translate(screenX, screenY);
    ctx.rotate(player.angle);

    ctx.fillStyle = '#00cc66';
    ctx.beginPath();
    ctx.moveTo(PLAYER_SIZE * TILE_SIZE, 0);
    ctx.lineTo(-PLAYER_SIZE * TILE_SIZE * 0.7, -PLAYER_SIZE * TILE_SIZE * 0.7);
    ctx.lineTo(-PLAYER_SIZE * TILE_SIZE * 0.5, 0);
    ctx.lineTo(-PLAYER_SIZE * TILE_SIZE * 0.7, PLAYER_SIZE * TILE_SIZE * 0.7);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#00ff88';
    ctx.shadowColor = '#00ff88';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(0, 0, PLAYER_SIZE * TILE_SIZE * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.restore();
}

function drawEnemy(enemy) {
    const screenX = canvas.width / 2 + (enemy.x - player.x) * TILE_SIZE;
    const screenY = canvas.height / 2 + (enemy.y - player.y) * TILE_SIZE;

    ctx.save();
    ctx.translate(screenX, screenY);
    ctx.rotate(enemy.angle);

    ctx.fillStyle = enemy.isBoss ? '#aa00aa' : '#cc3333';
    ctx.beginPath();
    ctx.moveTo(ENEMY_SIZE * TILE_SIZE, 0);
    ctx.lineTo(-ENEMY_SIZE * TILE_SIZE * 0.7, -ENEMY_SIZE * TILE_SIZE * 0.7);
    ctx.lineTo(-ENEMY_SIZE * TILE_SIZE * 0.5, 0);
    ctx.lineTo(-ENEMY_SIZE * TILE_SIZE * 0.7, ENEMY_SIZE * TILE_SIZE * 0.7);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = enemy.isBoss ? '#ff66ff' : '#ff4444';
    ctx.shadowColor = enemy.isBoss ? '#ff66ff' : '#ff4444';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(0, 0, ENEMY_SIZE * TILE_SIZE * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.restore();

    const healthPercent = enemy.health / enemy.maxHealth;
    ctx.fillStyle = '#333';
    ctx.fillRect(screenX - 15, screenY - 20, 30, 4);
    ctx.fillStyle = healthPercent > 0.5 ? '#00cc66' : '#ff4444';
    ctx.fillRect(screenX - 15, screenY - 20, 30 * healthPercent, 4);
}

function drawBullet(bullet) {
    const screenX = canvas.width / 2 + (bullet.x - player.x) * TILE_SIZE;
    const screenY = canvas.height / 2 + (bullet.y - player.y) * TILE_SIZE;

    if (bullet.type === 'grenade') {
        ctx.fillStyle = '#88ff88';
        ctx.shadowColor = '#88ff00';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(screenX, screenY, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('💣', screenX, screenY);
        ctx.shadowBlur = 0;
        return;
    }

    ctx.fillStyle = bullet.owner === 'player' ? '#00ff88' : '#ff4444';
    ctx.shadowColor = bullet.owner === 'player' ? '#00ff88' : '#ff4444';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(screenX, screenY, BULLET_SIZE * TILE_SIZE, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
}

function drawExplosion(exp) {
    const screenX = canvas.width / 2 + (exp.x - player.x) * TILE_SIZE;
    const screenY = canvas.height / 2 + (exp.y - player.y) * TILE_SIZE;

    ctx.save();
    ctx.globalAlpha = Math.max(0, exp.alpha);

    const gradient = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, exp.radius * TILE_SIZE);
    gradient.addColorStop(0, exp.color);
    gradient.addColorStop(1, 'transparent');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(screenX, screenY, exp.radius * TILE_SIZE, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

function drawDrop(drop) {
    const screenX = canvas.width / 2 + (drop.x - player.x) * TILE_SIZE;
    const screenY = canvas.height / 2 + (drop.y - player.y) * TILE_SIZE;

    ctx.fillStyle = drop.color;
    ctx.shadowColor = drop.color;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(screenX, screenY, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(drop.icon, screenX, screenY);
    ctx.shadowBlur = 0;
}

// ============================================================
// 射击、换弹、切换武器
// ============================================================
function canShoot() {
    const now = Date.now();
    const weapon = player.weapons[player.currentWeapon];
    // 射速调整：fireRate值越大射速越快（冷却时间 = 原冷却 * 100 / settings.fireRate）
    const actualFireRate = weapon.fireRate * (100 / settings.fireRate);
    return now - lastShot > actualFireRate && weapon.currentAmmo > 0;
}

function shoot() {
    const weapon = player.weapons[player.currentWeapon];

    poolPushBullet({
        x: player.x + Math.cos(player.angle) * 0.5,
        y: player.y + Math.sin(player.angle) * 0.5,
        angle: player.angle,
        speed: 1,
        damage: weapon.damage,
        range: weapon.range,
        distance: 0,
        owner: 'player',
        type: 'bullet'
    });

    weapon.currentAmmo--;
    lastShot = Date.now();
}

function reload() {
    const weapon = player.weapons[player.currentWeapon];
    weapon.currentAmmo = weapon.clipSize;
    showNotification('换弹完成');
}

function switchWeapon(index) {
    if (!gameRunning || !player) return;
    if (index >= 0 && index < player.weapons.length) {
        player.currentWeapon = index;
        updateHUD();
        // 武器切换动画效果
        const weaponBtn = document.querySelector(`.weapon-btn:nth-child(${index + 1})`);
        if (weaponBtn) {
            weaponBtn.style.transform = 'scale(1.2)';
            setTimeout(() => {
                weaponBtn.style.transform = '';
            }, 150);
        }
    }
}

// ============================================================
// 敌人生成
// ============================================================
function spawnEnemy() {
    const isBoss = Math.random() < 0.1;
    let x = null;
    let y = null;
    let attempts = 0;

    // 玩家周围留出安全距离，且避免生成到不可达位置
    const SAFE_RADIUS = 22;
    const playerX = (player && typeof player.x === 'number') ? player.x : MAP_SIZE / 2;
    const playerY = (player && typeof player.y === 'number') ? player.y : MAP_SIZE / 2;

    do {
        const candidateX = Math.random() * MAP_SIZE;
        const candidateY = Math.random() * MAP_SIZE;
        attempts++;
        // 必须离玩家足够远，且不能在障碍/水里
        if (Math.abs(candidateX - playerX) < SAFE_RADIUS && Math.abs(candidateY - playerY) < SAFE_RADIUS) continue;
        if (isBlocked(candidateX, candidateY)) continue;
        x = candidateX;
        y = candidateY;
        break;
    } while (attempts < 50);

    // 兜底：若尝试都失败，选择地图的四角之一作为备用位置（避免无敌人生成，也避免卡住逻辑）
    if (x === null || y === null) {
        const fallbacks = [
            [5, 5], [MAP_SIZE - 5, 5],
            [5, MAP_SIZE - 5], [MAP_SIZE - 5, MAP_SIZE - 5]
        ];
        for (const [fx, fy] of fallbacks) {
            if (!isBlocked(fx, fy) &&
                Math.abs(fx - playerX) >= SAFE_RADIUS &&
                Math.abs(fy - playerY) >= SAFE_RADIUS) {
                x = fx;
                y = fy;
                break;
            }
        }
        // 最终兜底：从地图边缘向内搜索合法坐标（极端情况也要保证有个合法坐标）
        if (x === null || y === null) {
            const fallbackCandidates = [
                [MAP_SIZE * 0.1, MAP_SIZE * 0.1],
                [MAP_SIZE * 0.9, MAP_SIZE * 0.1],
                [MAP_SIZE * 0.1, MAP_SIZE * 0.9],
                [MAP_SIZE * 0.9, MAP_SIZE * 0.9],
                [MAP_SIZE * 0.5, MAP_SIZE * 0.1],
                [MAP_SIZE * 0.5, MAP_SIZE * 0.9],
                [MAP_SIZE * 0.1, MAP_SIZE * 0.5],
                [MAP_SIZE * 0.9, MAP_SIZE * 0.5]
            ];
            for (const [fx, fy] of fallbackCandidates) {
                if (!isBlocked(fx, fy)) {
                    x = fx;
                    y = fy;
                    break;
                }
            }
            // 终极兜底：即使被阻挡也给出合法坐标（避免 x/y 仍为 null 导致后续 NaN）
            if (x === null || y === null) {
                x = MAP_SIZE * 0.5;
                y = MAP_SIZE * 0.5;
            }
        }
    }

    const enemyHealth = gameParams.ENEMY.health || 80;
    const enemyFireRate = gameParams.ENEMY.fireRate || 2000;

    enemies.push({
        x, y,
        health: isBoss ? enemyHealth * 3 : (settings.difficulty === 'hard' ? enemyHealth * 1.2 : enemyHealth),
        maxHealth: isBoss ? enemyHealth * 3 : (settings.difficulty === 'hard' ? enemyHealth * 1.2 : enemyHealth),
        angle: Math.random() * Math.PI * 2,
        lastShot: 0,
        fireRate: isBoss ? enemyFireRate * 0.75 : enemyFireRate,
        isBoss,
        alive: true,
        // DFS 寻路相关
        path: null,
        pathIndex: 0,
        lastPathUpdate: 0,
        pathUpdateInterval: 500 // 每500ms更新一次路径
    });
}

// ============================================================
// 道具掉落与拾取
// ============================================================
function spawnDrop(x, y) {
    const rand = Math.random();
    const coinMin = gameParams.DROPS.coinMin || 10;
    const coinMax = gameParams.DROPS.coinMax || 50;
    const coinValue = Math.floor(Math.random() * (coinMax - coinMin + 1)) + coinMin;
    if (rand < 0.5) {
        poolPushDrop({ x, y, icon: '🪙', color: '#ffaa00', type: 'coin', value: coinValue });
    } else if (rand < 0.7) {
        poolPushDrop({ x, y, icon: '💊', color: '#00cc66', type: 'medkit' });
    } else if (rand < 0.82) {
        poolPushDrop({ x, y, icon: '🔋', color: '#3b82f6', type: 'ammo' });
    } else if (rand < 0.92) {
        poolPushDrop({ x, y, icon: '💣', color: '#88cc44', type: 'grenade' });
    } else {
        poolPushDrop({ x, y, icon: '⭐', color: '#ffcc00', type: 'star' });
    }
}

function collectDrop(drop) {
    switch (drop.type) {
        case 'coin':
            playerData.coins += drop.value;
            showNotification(`+${drop.value} 金币`);
            break;
        case 'medkit':
            const medkitHeal = gameParams.DROPS.medkitHeal || 30;
            player.health = Math.min(player.health + medkitHeal, player.maxHealth);
            showNotification(`+${medkitHeal} 生命值`);
            break;
        case 'ammo':
            player.weapons.forEach(w => w.currentAmmo = w.clipSize);
            showNotification('弹药已填满');
            break;
        case 'grenade':
            playerData.inventory.grenades = (playerData.inventory.grenades || 0) + 1;
            showNotification('+1 手雷');
            break;
        case 'star':
            const starScore = gameParams.DROPS.starScore || 200;
            player.score += starScore;
            showNotification(`+${starScore} 分数`);
            break;
    }
}

// ============================================================
// 游戏结束
// ============================================================
function gameOver() {
    // 先清理游戏状态，防止后续操作访问已销毁的对象
    cleanupGameState();
    
    // 确保gameRunning已设置为false（cleanupGameState已设置，这里再次确认）
    gameRunning = false;

    playerData.totalKills += player.kills;
    playerData.totalScore += player.score;
    playerData.coins += Math.floor(player.score / 10);
    playerData.totalDeaths += 1;
    if (gameStartTime > 0) {
        playerData.playTimeSeconds += Math.floor((Date.now() - gameStartTime) / 1000);
    }
    updatePlayerTitle();
    savePlayerData();

    // 对象池已在cleanupGameState中清理，这里无需重复

    document.getElementById('finalScore').textContent = player.score;
    document.getElementById('finalKills').textContent = player.kills;
    document.getElementById('coinsEarned').textContent = Math.floor(player.score / 10);

    hideGameUI();
    document.getElementById('gameOver').style.display = 'block';
}

// ============================================================
// 撤离成功
// ============================================================
function extractionSuccess() {
    // 先清理游戏状态
    cleanupGameState();
    
    // 确保gameRunning已设置为false
    gameRunning = false;

    playerData.totalKills += player.kills;
    playerData.totalScore += player.score;
    updateMissionProgress('extract', 1);
    // 撤离成功奖励翻倍！
    playerData.coins += Math.floor(player.score / 5);
    if (gameStartTime > 0) {
        playerData.playTimeSeconds += Math.floor((Date.now() - gameStartTime) / 1000);
    }
    updatePlayerTitle();
    savePlayerData();

    // 对象池已在cleanupGameState中清理，这里无需重复

    document.getElementById('finalScore').textContent = player.score;
    document.getElementById('finalKills').textContent = player.kills;
    document.getElementById('coinsEarned').textContent = Math.floor(player.score / 5);

    hideGameUI();

    const extractPanel = document.getElementById('gameOver');
    if (extractPanel) {
        const titleEl = extractPanel.querySelector('h2');
        if (titleEl) titleEl.textContent = '🎖️ 撤离成功';
        const subtitleEl = extractPanel.querySelector('p');
        if (subtitleEl) subtitleEl.textContent = `击杀 ${player.kills} 人 | 得分 ${player.score} | 获得 ${Math.floor(player.score / 5)} 金币`;
        extractPanel.style.display = 'block';
    }
}

// ============================================================
// 玩家主动结束游戏（ESC / 退出按钮）
// ============================================================
function endGame() {
    if (!gameRunning) return;
    // 玩家已经死亡：走 gameOver 结算
    if (player && player.health <= 0) {
        gameOver();
        return;
    }
    // 防御：player 可能被销毁标志，以防后续 UI 逻辑产生越界访问
    if (!player) {
        gameOver();
        return;
    }
    
    // 先清理游戏状态
    cleanupGameState();
    
    // 确保gameRunning已设置为false
    gameRunning = false;
    
    if (player) {
        playerData.totalKills += player.kills || 0;
        playerData.totalScore += player.score || 0;
        playerData.coins += Math.floor((player.score || 0) / 10);
        if (gameStartTime > 0) {
            playerData.playTimeSeconds += Math.floor((Date.now() - gameStartTime) / 1000);
        }
    }
    updatePlayerTitle();
    savePlayerData();

    // 对象池已在cleanupGameState中清理，这里无需重复

    if (player) {
        const fs = document.getElementById('finalScore');
        const fk = document.getElementById('finalKills');
        const ce = document.getElementById('coinsEarned');
        if (fs) fs.textContent = player.score || 0;
        if (fk) fk.textContent = player.kills || 0;
        if (ce) ce.textContent = Math.floor((player.score || 0) / 10);
    }

    const gameCanvas = document.getElementById('gameCanvas');
    if (gameCanvas) gameCanvas.style.pointerEvents = 'none';
    const gameContainer = document.getElementById('gameContainer');
    if (gameContainer) gameContainer.style.display = 'none';
    const weaponSelector = document.getElementById('weaponSelector');
    if (weaponSelector) weaponSelector.style.display = 'none';
    const controls = document.getElementById('controls');
    if (controls) controls.style.display = 'none';
    const hud = document.getElementById('hud');
    if (hud) hud.style.display = 'none';
    const goPanel = document.getElementById('gameOver');
    if (goPanel) {
        const titleEl = goPanel.querySelector('h2');
        if (titleEl) titleEl.textContent = '战斗结束';
        const subEl = goPanel.querySelector('p');
        if (subEl) subEl.textContent = '已安全撤离战场';
        goPanel.style.display = 'block';
    }
}

// ============================================================
// 撤离进度 HUD 更新
// ============================================================
function updateExtractionHUD() {
    const bar = document.getElementById('extractProgressBar');
    const fill = document.getElementById('extractProgressFill');
    const text = document.getElementById('extractProgressText');
    if (!bar) return;

    if (isExtracting && extractProgress > 0) {
        bar.style.display = 'block';
        if (fill) fill.style.width = `${extractProgress * 100}%`;
        if (text) text.textContent = `撤离中... ${Math.floor(extractProgress * 100)}%`;
    } else {
        bar.style.display = 'none';
    }
}

// ============================================================
// HUD 更新
// ============================================================
function updateHUD() {
    if (!player) return;

    // 血条
    const healthPercent = player.health / player.maxHealth;
    const healthBar = document.querySelector('.health-fill');
    if (healthBar) healthBar.style.width = `${healthPercent * 100}%`;

    const weapon = player.weapons[player.currentWeapon];

    // 弹药大数字（武器栏上方）
    const ammoCurrentEl = document.getElementById('ammoCurrent');
    if (ammoCurrentEl) ammoCurrentEl.textContent = weapon.currentAmmo;
    const ammoMaxEl = document.getElementById('ammoMax');
    if (ammoMaxEl) ammoMaxEl.textContent = weapon.clipSize;
    const weaponNameBigEl = document.getElementById('weaponNameBig');
    if (weaponNameBigEl) weaponNameBigEl.textContent = weapon.name;

    // 左上角：得分、击杀、金币
    const scoreEl = document.getElementById('score');
    if (scoreEl) scoreEl.textContent = player.score;
    const killEl = document.getElementById('killCount');
    if (killEl) killEl.textContent = player.kills;
    const coinEl = document.getElementById('coinCount');
    if (coinEl) coinEl.textContent = playerData.coins;

    // 武器按钮高亮
    document.querySelectorAll('.weapon-btn').forEach((btn, index) => {
        btn.classList.toggle('active', index === player.currentWeapon);
    });

    // 物资数量（圆盘显示用）
    const inv = playerData.inventory || {};
    const invMedkit = document.getElementById('invMedkit');
    if (invMedkit) invMedkit.textContent = inv.medkits || 0;
    const invAmmo = document.getElementById('invAmmo');
    if (invAmmo) invAmmo.textContent = inv.ammoBox || 0;
    const invSpeed = document.getElementById('invSpeed');
    if (invSpeed) invSpeed.textContent = inv.speedBoost || 0;
    const invGrenade = document.getElementById('invGrenade');
    if (invGrenade) invGrenade.textContent = inv.grenades || 0;
}

// Shift 按住显示物资圆盘
let shiftHeld = false;
function showItemWheel(show) {
    const wheel = document.getElementById('itemWheel');
    if (!wheel) return;
    wheel.classList.toggle('active', show);
    document.querySelectorAll('.wheel-slot').forEach(s => s.classList.remove('active'));
}
function highlightWheelSlot(slotClass) {
    document.querySelectorAll('.wheel-slot').forEach(s => s.classList.remove('active'));
    if (slotClass) {
        const el = document.querySelector('.wheel-slot.' + slotClass);
        if (el) el.classList.add('active');
    }
}

function toggleAutoFire() {
    if (!gameRunning) return;
    autoFire = !autoFire;
    const statusEl = document.getElementById('autoFireStatus');
    if (statusEl) {
        statusEl.classList.toggle('on', autoFire);
        statusEl.classList.toggle('off', !autoFire);
    }
    showNotification(autoFire ? '🔫 自动射击 已开启' : '🔫 自动射击 已关闭');
}

// ============================================================
// 菜单与面板
// ============================================================
function hideAllPanels() {
    const menu = document.getElementById('menu');
    if (menu) menu.style.display = 'none';
    const lobby = document.getElementById('lobby');
    if (lobby) {
        lobby.classList.add('hidden');
        lobby.style.display = 'none';
    }
    const lp = document.querySelector('.lobby-panels');
    if (lp) {
        lp.classList.remove('active');
        lp.style.display = 'none';
    }
    const sp = document.getElementById('settingsPanel');
    if (sp) {
        sp.classList.remove('active');
        sp.style.display = 'none';
    }
    const go = document.getElementById('gameOver');
    if (go) {
        go.classList.remove('active');
        go.style.display = 'none';
    }
    const tp = document.getElementById('tutorialPanel');
    if (tp) {
        tp.classList.remove('active');
        tp.style.display = 'none';
    }
    const mep = document.getElementById('mapEditorPanel');
    if (mep) {
        mep.classList.remove('active');
        mep.style.display = 'none';
    }
    // 隐藏所有 .panel 并移除 active 类
    document.querySelectorAll('.panel').forEach(p => {
        p.classList.remove('active');
        p.style.display = 'none';
    });
}

function showMenu() {
    hideAllPanels();
    hideGameUI();
    const menu = document.getElementById('menu');
    if (menu) menu.style.display = 'flex';
}

function backToMenu() {
    hideAllPanels();
    hideGameUI();
    document.getElementById('menu').style.display = 'flex';
}

function showTutorial() {
    hideAllPanels();
    hideGameUI();
    document.getElementById('tutorialPanel').style.display = 'block';
}

function showSettings() {
    hideAllPanels();
    document.getElementById('settingsPanel').style.display = 'block';
}

function hideSettings() {
    document.getElementById('settingsPanel').style.display = 'none';
    if (gameRunning) {
        // 游戏中关闭设置 → 游戏画面未被隐藏，直接关闭面板即可
    } else {
        // 非游戏中关闭设置 → 回大厅
        showLobby();
    }
}

function hideGameUI() {
    const gc = document.getElementById('gameContainer');
    if (gc) gc.style.display = 'none';
    const gsb = document.getElementById('gameSettingsBtn');
    if (gsb) gsb.style.display = 'none';
    const ws = document.getElementById('weaponSelector');
    if (ws) ws.style.display = 'none';
    const hud = document.getElementById('hud');
    if (hud) hud.style.display = 'none';
    const ctrl = document.getElementById('controls');
    if (ctrl) ctrl.style.display = 'none';
}

function showLobby() {
    hideAllPanels();
    const lobby = document.getElementById('lobby');
    lobby.classList.remove('hidden');
    lobby.classList.remove('lobby-in-ready');
    lobby.style.display = 'flex';

    const lobbyPanels = document.querySelector('.lobby-panels');
    if (lobbyPanels) {
        lobbyPanels.classList.add('active');
        lobbyPanels.style.display = 'block';
    }

    // hideAllPanels 已经处理了 .panel 的隐藏，这里只需显示 readyRoom
    const readyRoom = document.getElementById('readyRoom');
    if (readyRoom) {
        readyRoom.classList.add('active');
        readyRoom.style.display = 'block';
    }

    document.querySelectorAll('.func-btn').forEach(b => b.classList.remove('active'));
    const firstFuncBtn = document.querySelector('.func-btn');
    if (firstFuncBtn) {
        firstFuncBtn.classList.add('active');
    }

    // 确保游戏容器完全隐藏，防止遮挡大厅按钮
    hideGameUI();
    showLobbyBottom();
    updatePlayerStats();
    renderMapPreviews();
    if (!currentMission) {
        selectMissionForMap(playerData.selectedMap || 'desert');
    }
    updateReadyRoomMission();
    showLobbyBottom();
    if (typeof showItemWheel === 'function') showItemWheel(false);
    if (typeof shiftHeld !== 'undefined') shiftHeld = false;
    console.log('[LOBBY] Lobby shown, readyRoom active');
}

function showPersonalInfo() {
    // 确保 lobby 可见（否则个人界面位于 lobby 内，隐藏会导致黑屏）
    const lobby = document.getElementById('lobby');
    if (lobby) {
        lobby.classList.remove('hidden');
        lobby.style.display = 'flex';
    }
    const lobbyPanels = document.querySelector('.lobby-panels');
    if (lobbyPanels) lobbyPanels.classList.add('active');

    // 隐藏所有子 panel，再显示个人信息
    document.querySelectorAll('.panel').forEach(p => {
        p.classList.remove('active');
        p.style.display = 'none';
    });

    const panel = document.getElementById('personalInfoPanel');
    if (panel) {
        panel.classList.add('active');
        panel.style.display = 'block';
    }
    updatePersonalInfoDisplay();
    document.querySelectorAll('.func-btn').forEach(b => b.classList.remove('active'));
}

function updatePersonalInfoDisplay() {
    loadCustomTitles();
    document.getElementById('piNameDisplay').textContent = playerData.playerName;
    document.getElementById('piKills').textContent = playerData.totalKills || 0;
    document.getElementById('piDeaths').textContent = playerData.totalDeaths || 0;
    document.getElementById('piKD').textContent = getKD();
    document.getElementById('piPlayTime').textContent = formatPlayTime(playerData.playTimeSeconds || 0);
    document.getElementById('piScore').textContent = playerData.totalScore || 0;
    document.getElementById('piMissions').textContent = (typeof completedMissionIds !== 'undefined' && completedMissionIds) ? completedMissionIds.length : 0;
    document.getElementById('piTitle').textContent = playerData.title;
    const piBadge = document.getElementById('piTitleBadge');
    if (piBadge) {
        const currentT = customTitles.find(function(x) { return x.name === playerData.title; }) || customTitles[0];
        piBadge.textContent = (currentT.icon ? currentT.icon + ' ' : '') + playerData.title;
        piBadge.style.cssText = buildTitleStyle(currentT);
    }

    // 徽章网格
    renderBadgeGrid();
}

function renderBadgeGrid() {
    const grid = document.getElementById('piBadgeGrid');
    if (!grid) return;
    grid.innerHTML = '';
    customTitles.forEach(function(t, idx) {
        const unlocked = checkTitleCondition(t);
        const isCurrent = t.name === playerData.title;
        const badge = document.createElement('div');
        badge.className = 'pi-badge' + (isCurrent ? ' current' : unlocked ? ' unlocked' : ' locked');
        const iconText = t.icon ? t.icon : (t.name ? t.name.charAt(0) : '★');
        const badgeName = t.name;
        badge.innerHTML =
            '<div class="pi-badge-icon" style="' + (unlocked ? buildTitleStyle(t) : 'filter:grayscale(1);opacity:0.6') + '">' + iconText + '</div>' +
            '<div class="pi-badge-name">' + badgeName + '</div>' +
            '<div class="pi-badge-state">' + (isCurrent ? '当前' : unlocked ? '已解锁' : '未解锁') + '</div>';

        // 双击切换
        let clickTimer = null;
        badge.addEventListener('click', function(e) {
            if (clickTimer) {
                clearTimeout(clickTimer);
                clickTimer = null;
                // 双击
                handleBadgeDouble(t);
            } else {
                clickTimer = setTimeout(function() {
                    clickTimer = null;
                    // 单击
                    showTitleDetail(t);
                }, 250);
            }
        });
        grid.appendChild(badge);
    });
}

let currentDetailTitle = null;

function showTitleDetail(t) {
    if (!t) return;
    currentDetailTitle = t;
    const panel = document.getElementById('titleDetailModal');
    if (!panel) return;
    const name = document.getElementById('titleDetailName');
    if (name) name.textContent = (t.icon ? t.icon + ' ' : '') + t.name;
    const badgeEl = document.getElementById('titleDetailBadge');
    if (badgeEl) {
        const inner = document.createElement('div');
        inner.style.cssText = buildTitleStyle(t);
        inner.textContent = (t.icon ? t.icon : t.name.charAt(0));
        badgeEl.innerHTML = '';
        badgeEl.appendChild(inner);
    }
    const reqEl = document.getElementById('titleDetailReq');
    if (reqEl) reqEl.textContent = t.reqText || '——';
    const statusEl = document.getElementById('titleDetailStatus');
    const unlocked = checkTitleCondition(t);
    const isCurrent = t.name === playerData.title;
    if (statusEl) statusEl.textContent = isCurrent ? '当前佩戴中' : unlocked ? '已解锁（可佩戴）' : '尚未解锁';
    const descEl = document.getElementById('titleDetailDesc');
    if (descEl) descEl.textContent = t.description || '战场上的荣誉象征';
    const btn = panel.querySelector('.btn-save');
    if (btn) {
        btn.disabled = !unlocked || isCurrent;
        btn.classList.toggle('disabled', !unlocked || isCurrent);
        btn.textContent = isCurrent ? '已佩戴' : '佩戴此称号';
    }
    panel.style.display = 'flex';
}

function closeTitleDetail() {
    const panel = document.getElementById('titleDetailModal');
    if (panel) panel.style.display = 'none';
    currentDetailTitle = null;
}

function equipTitle() {
    if (!currentDetailTitle) return;
    const unlocked = checkTitleCondition(currentDetailTitle);
    if (!unlocked) return;
    playerData.title = currentDetailTitle.name;
    savePlayerData();
    closeTitleDetail();
    updatePersonalInfoDisplay();
    showNotification('已佩戴称号：' + currentDetailTitle.name);
}

function handleBadgeDouble(t) {
    const unlocked = checkTitleCondition(t);
    if (!unlocked) {
        showNotification('该称号尚未解锁');
        return;
    }
    if (t.name === playerData.title) {
        // 若已在佩戴则切换回默认
        playerData.title = '新兵';
    } else {
        playerData.title = t.name;
    }
    savePlayerData();
    updatePersonalInfoDisplay();
    showNotification('称号已切换为：' + playerData.title);
}

function toggleNameEdit() {
    const editDiv = document.getElementById('piNameEdit');
    const nameDisplay = document.getElementById('piNameDisplay');
    const input = document.getElementById('piNameInput');
    if (editDiv.style.display === 'none') {
        editDiv.style.display = 'flex';
        input.value = playerData.playerName;
        input.focus();
        input.select();
    } else {
        editDiv.style.display = 'none';
    }
}

function savePlayerName() {
    const input = document.getElementById('piNameInput');
    const name = input.value.trim();
    if (name.length === 0) {
        showNotification('名称不能为空');
        return;
    }
    if (name.length > 12) {
        showNotification('名称最多12个字符');
        return;
    }
    playerData.playerName = name;
    savePlayerData();
    updatePlayerStats();
    toggleNameEdit();
    updatePersonalInfoDisplay();
    showNotification('名称已修改为: ' + name);
}

function updatePlayerStats() {
    const coins = document.getElementById('playerCoins');
    if (coins) coins.textContent = playerData.coins;
    const kills = document.getElementById('playerKills');
    if (kills) kills.textContent = playerData.totalKills || 0;
    const score = document.getElementById('playerScore');
    if (score) score.textContent = playerData.totalScore || 0;

    const nameEl = document.getElementById('lobbyPlayerName');
    if (nameEl) nameEl.textContent = playerData.playerName;
    const titleBadge = document.getElementById('lobbyTitleBadge');
    if (titleBadge) {
        const currentT = customTitles.find(function(x) { return x.name === playerData.title; }) || customTitles[0];
        titleBadge.textContent = (currentT.icon ? currentT.icon + ' ' : '') + playerData.title;
        titleBadge.style.cssText = buildTitleStyle(currentT);
    }

    const armorText = playerData.equippedArmor === 'heavy' ? '重型护甲' : playerData.equippedArmor === 'light' ? '轻型护甲' : '无';
    const armorEl = document.getElementById('equippedArmor');
    if (armorEl) armorEl.textContent = armorText;
}

function setDifficulty(diff) {
    settings.difficulty = diff;
    document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`.diff-btn.${diff}`);
    if (btn) btn.classList.add('active');
}

function selectMap(mapName) {
    playerData.selectedMap = mapName;
    document.querySelectorAll('.map-card').forEach(c => c.classList.remove('selected'));
    const card = document.querySelector(`.map-card[data-map="${mapName}"]`);
    if (card) card.classList.add('selected');
    selectMissionForMap(mapName);
    updateReadyRoomMission();
}

function renderMapPreviews() {
    const themes = ['desert', 'city', 'factory', 'jungle', 'snow'];
    const colors = {
        desert: { ground: '#2d2d1a', obstacle: '#8b7355', cover: '#4a3728', building: '#6b5344' },
        city: { ground: '#2a2a2a', obstacle: '#4a4a4a', cover: '#3a3a5a', building: '#5a5a6a' },
        factory: { ground: '#252525', obstacle: '#4a4a4a', cover: '#3a4a5a', building: '#5a5a7a' },
        jungle: { ground: '#1a2d1a', obstacle: '#2a4a2a', cover: '#1a3a4a', building: '#3a3a4a' },
        snow: { ground: '#4a4a5a', obstacle: '#6a6a7a', cover: '#5a6a8a', building: '#7a7a8a' }
    };

    themes.forEach(theme => {
        const canvas = document.querySelector(`.map-card[data-map="${theme}"] .map-preview-canvas`);
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;
        const tileSize = 4;
        const cols = Math.floor(w / tileSize);
        const rows = Math.floor(h / tileSize);
        const seed = theme.charCodeAt(0) * 1000;

        ctx.fillStyle = colors[theme].ground;
        ctx.fillRect(0, 0, w, h);

        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const rand = ((seed + x * 93 + y * 497) % 2333) / 2333;
                const px = x * tileSize;
                const py = y * tileSize;
                if (rand < 0.08) {
                    ctx.fillStyle = colors[theme].obstacle;
                    ctx.fillRect(px, py, tileSize, tileSize);
                } else if (rand < 0.14) {
                    ctx.fillStyle = colors[theme].cover;
                    ctx.fillRect(px, py, tileSize, tileSize);
                } else if (rand < 0.18) {
                    ctx.fillStyle = colors[theme].building;
                    ctx.fillRect(px, py, tileSize, tileSize);
                }
            }
        }

        ctx.fillStyle = '#00ff88';
        ctx.beginPath();
        ctx.arc(w/2, h/2, 3, 0, Math.PI * 2);
        ctx.fill();
    });

    renderCustomMapCards();
}

function renderCustomMapCards() {
    const container = document.getElementById('customMapGrid');
    const readyContainer = document.getElementById('readyCustomMapGrid');

    let savedMaps = [];
    try {
        const raw = localStorage.getItem('deathTrench_custom_maps');
        if (raw) savedMaps = JSON.parse(raw);
    } catch (e) { savedMaps = []; }

    if (!Array.isArray(savedMaps) || savedMaps.length === 0) {
        if (container) container.innerHTML = '';
        if (readyContainer) readyContainer.innerHTML = '';
        return;
    }

    const customColors = {
        0: '#2d2d1a',
        1: '#8b7355',
        2: '#4a3728',
        3: '#6b5344',
        4: '#1e3a5f'
    };

    let html = '';
    savedMaps.forEach((mapDef, idx) => {
        if (!mapDef || !mapDef.name || !Array.isArray(mapDef.data)) return;
        html += `<div class="map-card" data-map="${mapDef.name}" onclick="selectMap('${mapDef.name}')">
            <canvas class="map-preview-canvas" id="customMapPreview_${idx}" width="160" height="100"></canvas>
            <div class="map-name-overlay">🎨 ${mapDef.name}</div>
        </div>`;
    });

    if (container) container.innerHTML = html;

    // 备战界面的自定义地图卡（更小，紧凑样式）
    let readyHtml = '';
    savedMaps.forEach((mapDef, idx) => {
        if (!mapDef || !mapDef.name || !Array.isArray(mapDef.data)) return;
        readyHtml += `<div class="map-card small" data-map="${mapDef.name}" onclick="selectMap('${mapDef.name}')">
            <canvas class="map-preview-canvas" id="readyCustomMapPreview_${idx}" width="140" height="90"></canvas>
            <div class="map-name-overlay">🎨 ${mapDef.name}</div>
        </div>`;
    });
    if (readyContainer) readyContainer.innerHTML = readyHtml;

    // 为主界面 + 备战界面都绘制 canvas
    savedMaps.forEach((mapDef, idx) => {
        if (!mapDef || !Array.isArray(mapDef.data)) return;
        ['customMapPreview_' + idx, 'readyCustomMapPreview_' + idx].forEach(cid => {
            const canvas = document.getElementById(cid);
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            const w = canvas.width;
            const h = canvas.height;
            const rows = mapDef.data.length;
            const cols = mapDef.data[0].length;
            const tileW = Math.max(1, Math.floor(w / cols));
            const tileH = Math.max(1, Math.floor(h / rows));

            ctx.fillStyle = customColors[0];
            ctx.fillRect(0, 0, w, h);

            for (let y = 0; y < rows; y++) {
                for (let x = 0; x < cols; x++) {
                    const tileVal = mapDef.data[y][x];
                    if (tileVal === 0) continue;
                    ctx.fillStyle = customColors[tileVal] || '#2d2d1a';
                    ctx.fillRect(x * tileW, y * tileH, tileW, tileH);
                }
            }
        });
    });
}

function renderReadyRoomMapPreviews() {
    // 为备战内的预设地图绘制预览
    const themes = ['desert', 'city', 'factory', 'jungle', 'snow'];
    const colors = {
        desert: { ground: '#2d2d1a', obstacle: '#8b7355', cover: '#4a3728', building: '#6b5344' },
        city: { ground: '#2a2a2a', obstacle: '#4a4a4a', cover: '#3a3a5a', building: '#5a5a6a' },
        factory: { ground: '#252525', obstacle: '#4a4a4a', cover: '#3a4a5a', building: '#5a5a7a' },
        jungle: { ground: '#1a2d1a', obstacle: '#2a4a2a', cover: '#1a3a4a', building: '#3a3a4a' },
        snow: { ground: '#4a4a5a', obstacle: '#6a6a7a', cover: '#5a6a8a', building: '#7a7a8a' }
    };

    themes.forEach(theme => {
        const card = document.querySelector(`#readyPresetMapGrid .map-card[data-map="${theme}"]`);
        if (!card) return;
        const canvas = card.querySelector('.map-preview-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;
        const tileSize = 4;
        const cols = Math.floor(w / tileSize);
        const rows = Math.floor(h / tileSize);
        const seed = theme.charCodeAt(0) * 1000;

        ctx.fillStyle = colors[theme].ground;
        ctx.fillRect(0, 0, w, h);

        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const rand = ((seed + x * 93 + y * 497) % 2333) / 2333;
                const px = x * tileSize;
                const py = y * tileSize;
                if (rand < 0.08) {
                    ctx.fillStyle = colors[theme].obstacle;
                    ctx.fillRect(px, py, tileSize, tileSize);
                } else if (rand < 0.14) {
                    ctx.fillStyle = colors[theme].cover;
                    ctx.fillRect(px, py, tileSize, tileSize);
                } else if (rand < 0.18) {
                    ctx.fillStyle = colors[theme].building;
                    ctx.fillRect(px, py, tileSize, tileSize);
                }
            }
        }

        ctx.fillStyle = '#00ff88';
        ctx.beginPath();
        ctx.arc(w/2, h/2, 3, 0, Math.PI * 2);
        ctx.fill();
    });

    // 为备战内渲染自定义地图
    renderCustomMapCards();
}

function updateSupplyUI() {
    const inv = playerData.inventory || {};
    const coinsEl = document.getElementById('supplyCoins');
    if (coinsEl) coinsEl.textContent = playerData.coins || 0;
    const medkitEl = document.getElementById('supplyMedkit');
    if (medkitEl) medkitEl.textContent = inv.medkits || 0;
    const ammoEl = document.getElementById('supplyAmmo');
    if (ammoEl) ammoEl.textContent = inv.ammoBox || 0;
    const grenadeEl = document.getElementById('supplyGrenade');
    if (grenadeEl) grenadeEl.textContent = inv.grenades || 0;
    const starEl = document.getElementById('supplyStar');
    if (starEl) starEl.textContent = inv.speedBoost || 0;

    const armorEl = document.getElementById('equippedArmor');
    if (armorEl) {
        const am = playerData.equippedArmor || 'none';
        const map = { none: '无护甲', light: '轻型', heavy: '重型' };
        armorEl.textContent = map[am] || '无护甲';
    }
}

function showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 2000);
}

function nextTutorial() {
    const current = document.querySelector('.tutorial-step.active');
    if (!current) return;
    const next = current.nextElementSibling;
    if (next && next.classList.contains('tutorial-step')) {
        current.classList.remove('active');
        next.classList.add('active');
    } else {
        showLobby();
    }
}

function prevTutorial() {
    const current = document.querySelector('.tutorial-step.active');
    if (!current) return;
    const prev = current.previousElementSibling;
    if (prev && prev.classList.contains('tutorial-step')) {
        current.classList.remove('active');
        prev.classList.add('active');
    }
}

function saveGame() {
    const saveData = {
        playerData: playerData,
        settings: settings
    };
    if (typeof SaveManager !== 'undefined' && SaveManager.autoSave) {
        SaveManager.autoSave(saveData);
    }
    showNotification('游戏已保存！');
}

function loadGame() {
    if (typeof SaveManager === 'undefined' || !SaveManager.loadAutoSave) {
        showNotification('存档加载不可用');
        return;
    }
    const result = SaveManager.loadAutoSave();
    if (result.success) {
        Object.assign(playerData, result.data.playerData);
        Object.assign(settings, result.data.settings);
        if (!playerData.inventory) {
            playerData.inventory = {
                medkits: 3,
                armor_light: 0,
                armor_heavy: 0,
                grenades: 2,
                ammoBox: 5,
                speedBoost: 1
            };
        }
        showNotification('游戏已加载！');
    } else {
        showNotification('没有找到存档');
    }
}

function triggerImportFile() {
    document.getElementById('saveFileInput').click();
}

function handleImportFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (typeof SaveManager === 'undefined' || !SaveManager.importFromFile) {
        showNotification('存档导入不可用');
        return;
    }
    SaveManager.importFromFile(file)
        .then(result => {
            Object.assign(playerData, result.data.playerData);
            Object.assign(settings, result.data.settings);
            if (!playerData.inventory) {
                playerData.inventory = {
                    medkits: 3,
                    armor_light: 0,
                    armor_heavy: 0,
                    grenades: 2,
                    ammoBox: 5,
                    speedBoost: 1
                };
            }
            showNotification('存档导入成功！');
        })
        .catch(err => {
            showNotification('导入失败：' + err.message);
        });

    event.target.value = '';
}

function showReadyRoom() {
    console.log('[READY] Showing ready room');
    document.querySelectorAll('.panel').forEach(p => {
        p.classList.remove('active');
        p.style.display = 'none';
    });
    const readyRoom = document.getElementById('readyRoom');
    if (readyRoom) {
        readyRoom.classList.add('active');
        readyRoom.style.display = 'block';
    }
    document.querySelectorAll('.func-btn').forEach(b => b.classList.remove('active'));
    const firstBtn = document.querySelector('.func-btn:nth-child(1)');
    if (firstBtn) {
        firstBtn.classList.add('active');
    }
    // 进入战备模式：隐藏底部导航，集中显示
    const lobby = document.getElementById('lobby');
    if (lobby) lobby.classList.add('lobby-in-ready');

    // 渲染备战内的地图预览卡片
    renderReadyRoomMapPreviews();
    // 渲染物资数据
    updateSupplyUI();
    // 更新任务信息
    updateReadyRoomMission();
    // 根据当前地图高亮地图卡
    if (playerData.selectedMap) {
        document.querySelectorAll('#readyPresetMapGrid .map-card, #readyCustomMapGrid .map-card').forEach(c => c.classList.remove('selected'));
        const card = document.querySelector(`#readyPresetMapGrid .map-card[data-map="${playerData.selectedMap}"]`) ||
                     document.querySelector(`#readyCustomMapGrid .map-card[data-map="${playerData.selectedMap}"]`);
        if (card) card.classList.add('selected');
    }
}

function exitReadyRoom() {
    const lobby = document.getElementById('lobby');
    if (lobby) lobby.classList.remove('lobby-in-ready');
    showLobby();
}

function hideLobbyBottom() {
    const lobbyBottom = document.querySelector('.lobby-bottom');
    if (lobbyBottom) {
        lobbyBottom.style.display = 'none';
    }
}

function showLobbyBottom() {
    const lobbyBottom = document.querySelector('.lobby-bottom');
    if (lobbyBottom) {
        lobbyBottom.style.display = '';
    }
}

function showInventory() {
    console.log('[INVENTORY] Showing inventory');
    document.querySelectorAll('.panel').forEach(p => { p.classList.remove('active'); p.style.display = 'none'; });
    const panel = document.getElementById('inventoryPanel');
    if (panel) { panel.classList.add('active'); panel.style.display = 'block'; }
    document.querySelectorAll('.func-btn').forEach(b => b.classList.remove('active'));
    const secondBtn = document.querySelector('.func-btn:nth-child(2)');
    if (secondBtn) secondBtn.classList.add('active');
    hideLobbyBottom();
}

function showBlackMarket() {
    console.log('[MARKET] Showing black market');
    document.querySelectorAll('.panel').forEach(p => { p.classList.remove('active'); p.style.display = 'none'; });
    const panel = document.getElementById('blackMarketPanel');
    if (panel) { panel.classList.add('active'); panel.style.display = 'block'; }
    document.querySelectorAll('.func-btn').forEach(b => b.classList.remove('active'));
    const thirdBtn = document.querySelector('.func-btn:nth-child(3)');
    if (thirdBtn) thirdBtn.classList.add('active');
    updateMarketUI();
    hideLobbyBottom();
}

function showMapSelect() {
    console.log('[MAP] Showing map select');
    document.querySelectorAll('.panel').forEach(p => { p.classList.remove('active'); p.style.display = 'none'; });
    const panel = document.getElementById('mapSelectPanel');
    if (panel) { panel.classList.add('active'); panel.style.display = 'block'; }
    document.querySelectorAll('.func-btn').forEach(b => b.classList.remove('active'));
    const fourthBtn = document.querySelector('.func-btn:nth-child(4)');
    if (fourthBtn) fourthBtn.classList.add('active');
}

function showLeaderboard() {
    showNotification('排行榜功能开发中...');
}

function showFriends() {
    showNotification('好友功能开发中...');
}

function buyItem(itemName) {
    const price = getItemPrice(itemName);
    if (playerData.coins < price) {
        showNotification('金币不足！');
        return;
    }

    playerData.coins -= price;

    switch (itemName) {
        case 'medkit':
            playerData.inventory.medkits = (playerData.inventory.medkits || 0) + 1;
            break;
        case 'armor_light':
            playerData.inventory.armor_light = (playerData.inventory.armor_light || 0) + 1;
            break;
        case 'armor_heavy':
            playerData.inventory.armor_heavy = (playerData.inventory.armor_heavy || 0) + 1;
            break;
        case 'grenade':
            playerData.inventory.grenades = (playerData.inventory.grenades || 0) + 1;
            break;
        case 'ammoBox':
            playerData.inventory.ammoBox = (playerData.inventory.ammoBox || 0) + 1;
            break;
        case 'speedBoost':
            playerData.inventory.speedBoost = (playerData.inventory.speedBoost || 0) + 1;
            break;
    }

    showNotification(`购买成功！${getItemDisplayName(itemName)}`);
    updatePlayerStats();
    updateMarketUI();
}

function sellItem(itemName) {
    const itemKey = getItemKey(itemName);
    const price = getSellPrice(itemName);

    if (!itemKey || (!playerData.inventory[itemKey] || playerData.inventory[itemKey] <= 0)) {
        showNotification('没有可出售的物品！');
        return;
    }

    playerData.inventory[itemKey]--;
    playerData.coins += price;
    showNotification(`出售成功！获得 ${price} 金币`);
    updatePlayerStats();
    updateMarketUI();
}

function getItemPrice(itemName) {
    const defaults = {
        medkit: 100,
        armor_light: 300,
        armor_heavy: 600,
        grenade: 150,
        ammoBox: 80,
        speedBoost: 200
    };
    try {
        const stored = localStorage.getItem('deathTrench_prices');
        if (stored) {
            const prices = JSON.parse(stored);
            if (prices[itemName] && typeof prices[itemName].price === 'number') {
                return prices[itemName].price;
            }
        }
    } catch (e) { /* fallback to defaults */ }
    return defaults[itemName] || 0;
}

function getSellPrice(itemName) {
    return Math.floor(getItemPrice(itemName) * 0.5);
}

function refreshMarketPriceDisplays() {
    const items = ['medkit', 'armor_light', 'armor_heavy', 'grenade', 'ammoBox', 'speedBoost'];
    items.forEach(key => {
        const buyEl = document.getElementById('buyPrice_' + key);
        const buyPrice = getItemPrice(key);
        if (buyEl) buyEl.textContent = '🪙 ' + buyPrice;

        const sellEl = document.getElementById('sellPrice_' + key);
        const sellPrice = getSellPrice(key);
        if (sellEl) sellEl.textContent = '🪙 ' + sellPrice;
    });
}

// ===== Panel / Overlay Helper =====
function hideOverlay(id) { const el = document.getElementById(id); if (el) el.classList.remove('active'); }
function closeOverlay(id) { hideOverlay(id); }
function showOverlay(id) { const el = document.getElementById(id); if (el) el.classList.add('active'); }
function closeAllPanels() {
    hideOverlay('saveManagerPanel');
    hideOverlay('mailPanel');
}

// ===== Save Slots (5 manual slots) =====
function showSlotPanel() { showSaveManager(); setTimeout(function() { switchSaveTab('slots'); }, 10); }
function showBackupPanel() { showSaveManager(); setTimeout(function() { switchSaveTab('backup'); }, 10); }
function saveToSlot(slotIdx) {
    try {
        const saveData = {
            playerData: JSON.parse(JSON.stringify(playerData)),
            settings: JSON.parse(JSON.stringify(settings || {}))
        };
        if (typeof SaveManager !== 'undefined' && SaveManager.saveToSlot) {
            SaveManager.saveToSlot(slotIdx, saveData);
        } else {
            localStorage.setItem('deathTrench_slot_' + slotIdx, JSON.stringify({
                ...saveData,
                timestamp: Date.now()
            }));
        }
        showNotification('已保存到槽位 ' + slotIdx);
        refreshSlotUI();
    } catch (e) { showNotification('保存失败: ' + e.message); }
}
function loadFromSlot(slotIdx) {
    try {
        let save = null;
        if (typeof SaveManager !== 'undefined' && SaveManager.loadFromSlot) {
            const result = SaveManager.loadFromSlot(slotIdx);
            if (result.success) save = result.data;
        }
        if (!save) {
            const raw = localStorage.getItem('deathTrench_slot_' + slotIdx);
            if (!raw) { showNotification('槽位 ' + slotIdx + ' 为空'); return; }
            save = JSON.parse(raw);
        }
        if (save.playerData) playerData = save.playerData;
        if (save.settings) settings = Object.assign({}, settings, save.settings);
        showNotification('已从槽位 ' + slotIdx + ' 载入存档');
        closeAllPanels();
    } catch (e) { showNotification('读取失败: ' + e.message); }
}
function confirmDeleteSlot(slotIdx) {
    if (!confirm('确定删除槽位 ' + slotIdx + ' 的存档?')) return;
    if (typeof SaveManager !== 'undefined' && SaveManager.deleteSlot) {
        SaveManager.deleteSlot(slotIdx);
    }
    localStorage.removeItem('deathTrench_slot_' + slotIdx);
    refreshSlotUI();
    showNotification('已删除槽位 ' + slotIdx);
}
function refreshSlotUI() {
    for (let i = 1; i <= 5; i++) {
        const container = document.getElementById('slotContent' + i);
        if (!container) continue;
        let s = null;
        if (typeof SaveManager !== 'undefined' && SaveManager.getSlotInfo) {
            const info = SaveManager.getSlotInfo(i);
            if (info) s = { playerData: info, timestamp: info.timestamp };
        }
        if (!s) {
            const raw = localStorage.getItem('deathTrench_slot_' + i);
            if (raw) {
                try { s = JSON.parse(raw); } catch (e) { s = null; }
            }
        }
        if (s) {
            try {
                const d = new Date(s.timestamp);
                const pad = (n) => String(n).padStart(2, '0');
                const dateStr = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
                const coins = s.playerData ? (s.playerData.coins || 0) : 0;
                const kills = s.playerData ? (s.playerData.totalKills || s.playerData.kills || 0) : 0;
                container.innerHTML = '<div class="slot-content-info" style="font-size: 13px; color: #00ff88;">已存档</div><div class="slot-content-time" style="font-size: 12px; color: #8b949e; margin-top: 4px;">保存于 ' + dateStr + '</div><div style="font-size: 12px; color: #8b949e; margin-top: 4px;">金币: ' + coins + ' · 击杀: ' + kills + '</div>';
            } catch (e) { container.innerHTML = '<span class="slot-empty">数据损坏</span>'; }
        } else {
            container.innerHTML = '<span class="slot-empty">空</span>';
        }
    }
}

// ===== Auto Backup (30s interval, rolling 5 slots) =====
let autoBackupEnabled = true;
let autoBackupTimerId = null;
let autoBackupCountdown = 30;
function startAutoBackup() {
    stopAutoBackup();
    autoBackupEnabled = true;
    autoBackupCountdown = 30;
    updateBackupStatusUI();
    autoBackupTimerId = setInterval(function() {
        autoBackupCountdown -= 1;
        if (autoBackupCountdown <= 0) {
            doManualBackup();
            autoBackupCountdown = 30;
        }
        updateBackupCountdownUI();
    }, 1000);
    const ind = document.getElementById('backupIndicator');
    if (ind) ind.classList.remove('paused');
}
function stopAutoBackup() {
    if (autoBackupTimerId) { clearInterval(autoBackupTimerId); autoBackupTimerId = null; }
    const ind = document.getElementById('backupIndicator');
    if (ind) ind.classList.add('paused');
    const t = document.getElementById('backupStatusText');
    if (t) t.textContent = '自动备份：已暂停';
}
function toggleAutoBackup(enabled) {
    if (typeof enabled === 'boolean') {
        autoBackupEnabled = enabled;
        if (!autoBackupEnabled) stopAutoBackup();
        else startAutoBackup();
        return;
    }
    if (autoBackupEnabled) {
        autoBackupEnabled = false;
        stopAutoBackup();
    } else {
        autoBackupEnabled = true;
        startAutoBackup();
    }
    const toggle = document.getElementById('autoBackupToggle');
    if (toggle) toggle.checked = autoBackupEnabled;
}
function doManualBackup() {
    try {
        // Shift existing backups: 4→5, 3→4, 2→3, 1→2
        for (let i = 5; i >= 2; i--) {
            const prev = localStorage.getItem('deathTrench_backup_' + (i - 1));
            if (prev) localStorage.setItem('deathTrench_backup_' + i, prev);
            else localStorage.removeItem('deathTrench_backup_' + i);
        }
        const save = {
            playerData: JSON.parse(JSON.stringify(playerData)),
            settings: JSON.parse(JSON.stringify(settings || {})),
            timestamp: Date.now()
        };
        localStorage.setItem('deathTrench_backup_1', JSON.stringify(save));
        refreshBackupUI();
        if (autoBackupTimerId) updateBackupCountdownUI();
    } catch (e) { console.error('Backup failed', e); }
}
function restoreFromBackup(slotIdx) {
    try {
        const raw = localStorage.getItem('deathTrench_backup_' + slotIdx);
        if (!raw) { showNotification('备份槽位为空'); return; }
        const save = JSON.parse(raw);
        if (!confirm('确定恢复备份 ' + slotIdx + ' ? 当前游戏状态将被覆盖。')) return;
        if (save.playerData) playerData = save.playerData;
        if (save.settings) settings = Object.assign({}, settings, save.settings);
        showNotification('已恢复备份 ' + slotIdx);
    } catch (e) { showNotification('恢复失败: ' + e.message); }
}
function refreshBackupUI() {
    for (let i = 1; i <= 5; i++) {
        const container = document.getElementById('backupContent' + i);
        if (!container) continue;
        const raw = localStorage.getItem('deathTrench_backup_' + i);
        if (raw) {
            try {
                const s = JSON.parse(raw);
                const d = new Date(s.timestamp);
                const pad = (n) => String(n).padStart(2, '0');
                const dateStr = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
                container.innerHTML = '<div style="font-size: 13px; color: #ffaa00;">备份 #' + i + '</div><div style="font-size: 12px; color: #8b949e; margin-top: 4px;">时间: ' + dateStr + '</div><div style="font-size: 12px; color: #8b949e; margin-top: 4px;">金币: ' + (s.playerData ? (s.playerData.coins || 0) : 0) + '</div>';
            } catch (e) { container.innerHTML = '<span class="slot-empty">数据损坏</span>'; }
        } else {
            container.innerHTML = '<span class="slot-empty">暂无备份</span>';
        }
    }
}
function updateBackupCountdownUI() {
    const el = document.getElementById('backupTimerText');
    if (el) el.textContent = '下次备份: ' + autoBackupCountdown + 's';
}
function updateBackupStatusUI() {
    const t = document.getElementById('backupStatusText');
    if (t) t.textContent = '自动备份：已启用 · 每 30 秒';
}
// ===== Save Manager Panel =====
function showSaveManager() {
    refreshSlotUI();
    refreshBackupUI();
    refreshSaveStatus();
    const toggle = document.getElementById('autoBackupToggle');
    if (toggle) toggle.checked = !!autoBackupEnabled;
    showOverlay('saveManagerPanel');
}
function closeSaveManager() {
    closeOverlay('saveManagerPanel');
}
function switchSaveTab(tabName) {
    document.querySelectorAll('.save-tab').forEach(function(t) {
        t.classList.toggle('active', t.dataset.tab === tabName);
    });
    document.querySelectorAll('.save-tab-content').forEach(function(c) { c.classList.remove('active'); });
    const targetPanel = document.getElementById('saveTab' + tabName.charAt(0).toUpperCase() + tabName.slice(1));
    if (targetPanel) targetPanel.classList.add('active');
}
function refreshSaveStatus() {
    const statusText = document.getElementById('saveStatusText');
    if (!statusText) return;
    if (typeof SaveManager !== 'undefined' && SaveManager.loadAutoSave) {
        const result = SaveManager.loadAutoSave();
        if (result.success) {
            const d = new Date(result.data.timestamp);
            const pad = (n) => String(n).padStart(2, '0');
            const dateStr = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
            statusText.innerHTML = '<span style="color: #00ff88;">已存在存档</span><div style="font-size: 12px; color: #8b949e; margin-top: 4px;">最后保存: ' + dateStr + '</div>';
            return;
        }
    }
    const raw = localStorage.getItem('deathTrench_auto_save');
    if (raw) {
        try {
            const save = JSON.parse(raw);
            const d = new Date(save.timestamp);
            const pad = (n) => String(n).padStart(2, '0');
            const dateStr = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
            statusText.innerHTML = '<span style="color: #00ff88;">已存在存档</span><div style="font-size: 12px; color: #8b949e; margin-top: 4px;">最后保存: ' + dateStr + '</div>';
        } catch (e) {
            statusText.textContent = '存档数据损坏';
        }
    } else {
        statusText.textContent = '暂无自动存档';
    }
}
function exportSaveFile() {
    try {
        if (typeof SaveManager !== 'undefined' && SaveManager.exportSave) {
            const jsonData = SaveManager.exportSave();
            if (!jsonData) {
                showNotification('没有可导出的存档');
                return;
            }
            const blob = new Blob([jsonData], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'deathtrench_save_' + Date.now() + '.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showNotification('存档已导出');
            return;
        }
        const raw = localStorage.getItem('deathTrench_auto_save');
        if (!raw) {
            showNotification('没有可导出的存档');
            return;
        }
        const save = JSON.parse(raw);
        const dataStr = JSON.stringify(save, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'deathtrench_save_' + Date.now() + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showNotification('存档已导出');
    } catch (e) {
        showNotification('导出失败: ' + e.message);
    }
}

// ===== Mail System =====
let _mailListCache = null;
let _mailSelectedIdx = -1;
function getDefaultMails() {
    return [
        { id: 'welcome', sender: '指挥部', subject: '欢迎加入死亡战壕特遣队', body: '欢迎你，新兵。本次行动代号为 "Trench Strike"。\n\n任务简报：\n1. 装备你的护甲，选择合适的武器。\n2. 进入战场，消灭敌人，收集金币与补给。\n3. 活着撤离以保存收获。\n\n祝你好运，战士。', date: '2026-06-20 10:00', unread: true },
        { id: 'brief', sender: '指挥官 · 普莱斯', subject: '行动简报：沙漠行动', body: '本次任务目标：\n- 穿越敌人防御区域，消灭敌方有生力量。\n- 收集战场金币，用于装备升级。\n- 按时撤离以获取最高奖励。\n\n注意：站在出生点（地图中心）保持不动 3 秒可撤离。\n\n撤离奖励为金币翻倍，请务必小心。', date: '2026-06-20 10:01', unread: true },
        { id: 'tip', sender: '战术支援', subject: '战术小贴士 #1', body: '\u2705 使用连发模式：按空格切换自动射击。\n\u2705 手雷在近距离战斗中效果极佳。\n\u2705 敌人被击中时会减速，这是你的重要机会。\n\u2705 补给品（💊🔋💣）可在黑市购买。\n\n保持行动，保持戒备。', date: '2026-06-20 10:02', unread: true }
    ];
}
function openMailbox() {
    if (_mailListCache === null) {
        try {
            const stored = localStorage.getItem('deathTrench_mails');
            _mailListCache = stored ? JSON.parse(stored) : getDefaultMails();
        } catch (e) { _mailListCache = getDefaultMails(); }
    }
    _mailSelectedIdx = -1;
    switchMailTab('inbox');
    refreshMailList();
    showOverlay('mailPanel');
}
function refreshMailList() {
    const container = document.getElementById('mailListContainer');
    if (!container || !_mailListCache) return;
    if (_mailListCache.length === 0) {
        container.innerHTML = '<div class="mail-empty" style="padding: 40px 16px;"><div style="font-size: 36px; margin-bottom: 10px;">📭</div><div>暂无邮件</div></div>';
        return;
    }
    container.innerHTML = _mailListCache.map(function(m, idx) {
        const classes = ['mail-list-item'];
        if (_mailSelectedIdx === idx) classes.push('active');
        classes.push(m.unread ? 'unread' : 'read');
        const safeSender = (m.sender || '未知').toString();
        const safeSubject = (m.subject || '（无主题）').toString();
        const safeBody = (m.body || '').toString().slice(0, 80);
        const safeDate = (m.date || '').toString();
        return '<div class="' + classes.join(' ') + '" onclick="selectMail(' + idx + ')">' +
                    '<div class="mail-sender">' + safeSender + '</div>' +
                    '<div class="mail-subject">' + safeSubject + '</div>' +
                    '<div class="mail-preview">' + safeBody + '</div>' +
                    '<div class="mail-date">' + safeDate + '</div>' +
                '</div>';
    }).join('');
}
function selectMail(idx) {
    if (!_mailListCache || !_mailListCache[idx]) return;
    _mailSelectedIdx = idx;
    const m = _mailListCache[idx];
    m.unread = false;
    saveMailsToStorage();
    const reader = document.getElementById('mailReader');
    if (reader) {
        const safeSender = (m.sender || '未知').toString();
        const safeSubject = (m.subject || '（无主题）').toString();
        const safeDate = (m.date || '').toString();
        const safeBody = (m.body || '').toString();
        reader.innerHTML =
            '<div class="mail-reader-sender">' + safeSender + '</div>' +
            '<div class="mail-reader-subject">' + safeSubject + '</div>' +
            '<div class="mail-reader-date">' + safeDate + '</div>' +
            '<div class="mail-reader-divider"></div>' +
            '<div class="mail-reader-body">' + safeBody + '</div>';
    }
    refreshMailList();
}
function switchMailTab(tab) {
    document.querySelectorAll('.mail-tab').forEach(function(el) {
        el.classList.toggle('active', el.dataset.tab === tab);
    });
    const inbox = document.getElementById('mailInboxPanel');
    const compose = document.getElementById('mailComposePanel');
    if (inbox) inbox.style.display = (tab === 'inbox' ? 'block' : 'none');
    if (compose) compose.style.display = (tab === 'compose' ? 'block' : 'none');
}
function clearComposeMail() {
    const s = document.getElementById('composeSender');
    const sub = document.getElementById('composeSubject');
    const b = document.getElementById('composeBody');
    if (s) s.value = '';
    if (sub) sub.value = '';
    if (b) b.value = '';
}
function saveComposedMail() {
    const sender = (document.getElementById('composeSender') || { value: '' }).value.trim() || '指挥部';
    const subject = (document.getElementById('composeSubject') || { value: '' }).value.trim() || '（无主题）';
    const body = (document.getElementById('composeBody') || { value: '' }).value.trim();
    if (!body) { showNotification('邮件正文不能为空'); return; }
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const newMail = {
        id: 'mail_' + Date.now(),
        sender: sender,
        subject: subject,
        body: body,
        date: now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes()),
        unread: true
    };
    if (!_mailListCache) _mailListCache = getDefaultMails();
    _mailListCache.unshift(newMail);
    saveMailsToStorage();
    clearComposeMail();
    switchMailTab('inbox');
    refreshMailList();
    showNotification('新邮件已保存到列表');
}
function saveMailsToStorage() {
    try { localStorage.setItem('deathTrench_mails', JSON.stringify(_mailListCache)); } catch (e) { /* ignore */ }
}
function exportMailsAsJSON() {
    if (!_mailListCache) _mailListCache = getDefaultMails();
    const blob = new Blob([JSON.stringify(_mailListCache, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'deathtrench_mails_' + Date.now() + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showNotification('邮件已导出为 JSON 文件');
}

// ===== Player Info =====
function _rankFromScore(score) {
    const r = [
        { min: 0, name: '新兵', level: 1 },
        { min: 500, name: '列兵', level: 3 },
        { min: 1500, name: '下士', level: 12 },
        { min: 4000, name: '中士', level: 23 },
        { min: 8000, name: '上士', level: 36 },
        { min: 15000, name: '少尉', level: 48 },
        { min: 25000, name: '中尉', level: 60 },
        { min: 40000, name: '上尉', level: 72 }
    ];
    let current = r[0];
    for (let i = 0; i < r.length; i++) { if (score >= r[i].min) current = r[i]; }
    return current;
}
// ===== Tools Password Gate =====
function tryOpenTools() {
    if (!ENABLE_TOOLS) {
        showNotification('编辑器功能仅在开发版可用');
        return;
    }
    document.getElementById('toolsPromptError').textContent = '';
    document.getElementById('toolsPasswordInput').value = '';
    document.getElementById('toolsPromptOverlay').classList.add('active');
    setTimeout(function() {
        const inp = document.getElementById('toolsPasswordInput');
        if (inp) inp.focus();
    }, 30);
}
function closeToolsPrompt() { document.getElementById('toolsPromptOverlay').classList.remove('active'); }
function verifyToolsPassword() {
    const input = document.getElementById('toolsPasswordInput');
    const err = document.getElementById('toolsPromptError');
    if (!input) return;
    if (input.value === 'admin9527') {
        closeToolsPrompt();
        window.location.href = 'tools/index.html';
    } else {
        err.textContent = '密码错误，请重试';
        input.value = '';
        input.focus();
    }
}

// ===== Mission System (任务系统) =====
let currentMission = null;
let currentMissionProgress = 0;
let missionLanguage = 'zh';
let completedMissionIds = [];
// 关键：防止任务完成过程中被 updateMissionProgress 重复调用造成链式死循环
let _missionCompleting = false;

function loadCompletedMissions() {
    try {
        const raw = localStorage.getItem('deathTrench_completed_missions');
        if (raw) completedMissionIds = JSON.parse(raw);
    } catch (e) { completedMissionIds = []; }
}
function saveCompletedMissions() {
    try { localStorage.setItem('deathTrench_completed_missions', JSON.stringify(completedMissionIds)); } catch (e) {}
}

function getDefaultMissions() {
    return [
        { id: 'task_kill1', type: 'kill', nameZh: '沙漠突袭', nameEn: 'Desert Assault', descZh: '消灭所有敌人，完成战术目标', descEn: 'Eliminate all enemies, complete tactical objectives', target: 15, reward: 500, map: 'desert' },
        { id: 'task_kill2', type: 'kill', nameZh: '城市清剿', nameEn: 'City Cleanup', descZh: '清理城市区域的敌人', descEn: 'Clear enemies from urban area', target: 20, reward: 600, map: 'city' },
        { id: 'task_extract', type: 'extract', nameZh: '成功撤离', nameEn: 'Successful Extraction', descZh: '活着离开战场', descEn: 'Leave the battlefield alive', target: 1, reward: 300, map: 'any' },
        { id: 'task_score', type: 'score', nameZh: '高分挑战', nameEn: 'High Score Challenge', descZh: '达到1000分', descEn: 'Reach 1000 points', target: 1000, reward: 800, map: 'any' }
    ];
}

function loadMissions() {
    try {
        const stored = localStorage.getItem('deathTrench_missions');
        if (stored) {
            const data = JSON.parse(stored);
            // 兼容两种格式：数组直接使用 / {tasks: [...] }
            if (Array.isArray(data)) return data;
            if (Array.isArray(data.tasks)) return data.tasks;
        }
    } catch (e) { /* fallback */ }
    return getDefaultMissions();
}

function loadMissionSettings() {
    try {
        const stored = localStorage.getItem('deathTrench_mission_settings');
        if (stored) {
            const settings = JSON.parse(stored);
            missionLanguage = settings.defaultLang || 'zh';
        }
    } catch (e) { /* fallback */ }
}

function selectMissionForMap(mapId) {
    const missions = loadMissions();
    const mapMissions = missions.filter(m => m.map === mapId || m.map === 'any');
    const availableMissions = mapMissions.filter(m => !completedMissionIds.includes(m.id));
    if (availableMissions.length > 0) {
        currentMission = availableMissions[0];
        currentMissionProgress = 0;
        updateMissionDisplay();
    } else if (mapMissions.length > 0) {
        currentMission = mapMissions[0];
        currentMissionProgress = 0;
        updateMissionDisplay();
    } else {
        currentMission = null;
        hideMissionPanel();
    }
}

function updateMissionProgress(taskType, value) {
    if (!currentMission) return;

    switch (currentMission.type) {
        case 'kill':
            if (taskType === 'kill') currentMissionProgress = value;
            break;
        case 'score':
            if (taskType === 'score') currentMissionProgress = value;
            break;
        case 'extract':
            if (taskType === 'extract') currentMissionProgress = 1;
            break;
        case 'collect':
            if (taskType === 'collect') currentMissionProgress += value;
            break;
        case 'survive':
            if (taskType === 'survive') currentMissionProgress = value;
            break;
    }

    updateMissionDisplay();

    // 关键死循环/链式调用防护：
    // 当一个任务完成时，completeMission 会切换到下一个任务；
    // 如果紧接着 updateMissionProgress 又被同帧调用，
    // 会因 progress >= target 残留导致 "幽灵完成"。
    // 解决：
    //   1) 仅当 target 是有效正数时允许完成；
    //   2) 使用 _missionCompleting 标志防止 completeMission 内部重复触发；
    //   3) 调用完成前先把 currentMission 置空，避免级联。
    if (_missionCompleting || !currentMission) return;
    const currentTarget = currentMission.target;
    if (typeof currentTarget === 'number' && currentTarget > 0 && currentMissionProgress >= currentTarget) {
        const finishing = currentMission;
        currentMission = null;
        _missionCompleting = true;
        try {
            // 先把 finishing 作为当前任务推入 completed 集合并保存进度，
            // 但不再调用 updateMissionDisplay/completeMission 的循环路径
            if (!completedMissionIds.includes(finishing.id)) {
                completedMissionIds.push(finishing.id);
                saveCompletedMissions();
            }
            playerData.coins += finishing.reward;
            showNotification('🎖️ 任务完成！获得 ' + finishing.reward + ' 金币');
            // 推进到下一任务（链式完成不会再触发，因为 _missionCompleting 标志）
            const missions = loadMissions();
            const currentIdx = missions.findIndex(m => m.id === finishing.id);
            if (currentIdx >= 0 && currentIdx < missions.length - 1) {
                currentMission = missions[currentIdx + 1];
                currentMissionProgress = 0;
                updateMissionDisplay();
                updateReadyRoomMission();
            } else {
                hideMissionPanel();
            }
        } finally {
            _missionCompleting = false;
        }
    }
}

function completeMission() {
    if (!currentMission) return;

    if (!completedMissionIds.includes(currentMission.id)) {
        completedMissionIds.push(currentMission.id);
        saveCompletedMissions();
    }
    playerData.coins += currentMission.reward;
    showNotification('🎖️ 任务完成！获得 ' + currentMission.reward + ' 金币');

    const missions = loadMissions();
    const currentIdx = missions.findIndex(m => m.id === currentMission.id);
    if (currentIdx < missions.length - 1) {
        currentMission = missions[currentIdx + 1];
        currentMissionProgress = 0;
        updateMissionDisplay();
        updateReadyRoomMission();
    } else {
        currentMission = null;
        hideMissionPanel();
    }
}

function updateMissionDisplay() {
    if (!currentMission) {
        hideMissionPanel();
        return;
    }
    
    const nameEl = document.getElementById('missionName');
    const descEl = document.getElementById('missionDesc');
    const rewardEl = document.getElementById('missionReward');
    const progressEl = document.getElementById('missionProgress');
    const progressTextEl = document.getElementById('missionProgressText');
    const panel = document.getElementById('missionPanel');
    
    const nameZh = currentMission.nameZh || '';
    const nameEn = currentMission.nameEn || '';
    
    if (nameEl) nameEl.innerHTML = nameZh + '<span class="mission-en-name">' + nameEn + '</span>';
    if (descEl) descEl.textContent = missionLanguage === 'zh' ? currentMission.descZh : currentMission.descEn;
    if (rewardEl) rewardEl.textContent = '奖励: 🪙 ' + currentMission.reward;
    
    const safeTarget = (typeof currentMission.target === 'number' && currentMission.target > 0)
        ? currentMission.target
        : 1;
    const progressPercent = Math.min(100, (currentMissionProgress / safeTarget) * 100);
    if (progressEl) progressEl.style.width = progressPercent + '%';
    if (progressTextEl) progressTextEl.textContent = currentMissionProgress + '/' + safeTarget;
    
    const difficulty = settings.difficulty || 'normal';
    
    if (panel) {
        panel.style.display = 'block';
        panel.classList.remove('easy', 'normal', 'hard');
        panel.classList.add(difficulty);
    }
}

function hideMissionPanel() {
    const panel = document.getElementById('missionPanel');
    if (panel) panel.style.display = 'none';
}

function updateReadyRoomMission() {
    const nameEl = document.getElementById('readyRoomMissionName');
    const descEl = document.getElementById('readyRoomMissionDesc');
    const rewardEl = document.getElementById('readyRoomMissionReward');
    const cardEl = document.getElementById('readyRoomMissionCard');

    if (!nameEl || !currentMission) {
        if (nameEl) nameEl.textContent = '暂无进行中的任务';
        if (descEl) descEl.textContent = '选择地图以开始新任务';
        if (rewardEl) rewardEl.textContent = '';
        return;
    }

    nameEl.textContent = currentMission.nameZh;
    descEl.textContent = currentMission.descZh;
    rewardEl.textContent = '奖励: 🪙 ' + currentMission.reward + ' · 目标: ' + currentMissionProgress + '/' + currentMission.target;
    if (cardEl) cardEl.style.borderColor = '#00cc66';
}

function hasMissionPrereqs(mission, missions) {
    const idx = missions.findIndex(m => m.id === mission.id);
    if (idx <= 0) return true;
    for (let i = 0; i < idx; i++) {
        const prev = missions[i];
        if (prev.map === 'any' && !completedMissionIds.includes(prev.id)) {
            return false;
        }
    }
    return true;
}

function selectMissionById(missionId) {
    const missions = loadMissions();
    const m = missions.find(x => x.id === missionId);
    if (!m) return;

    if (completedMissionIds.includes(m.id)) {
        showNotification('该任务已完成');
        return;
    }
    if (m.map !== 'any') {
        showNotification('该任务绑定特定地图，请先切换到对应地图');
        return;
    }
    if (!hasMissionPrereqs(m, missions)) {
        showNotification('前置任务未完成，无法选择');
        return;
    }

    currentMission = m;
    currentMissionProgress = 0;
    updateMissionDisplay();
    updateReadyRoomMission();
    renderMissionLineList();
    showNotification('📌 已选择任务: ' + m.nameZh);
}

function renderMissionLineList() {
    const listEl = document.getElementById('missionLineList');
    if (!listEl) return;

    const missions = loadMissions();
    const currentMapId = playerData.selectedMap || 'desert';
    const currentId = currentMission ? currentMission.id : null;

    function getMissionIcon(m) {
        switch (m.type) {
            case 'kill': return '⚔️';
            case 'score': return '🏆';
            case 'extract': return '🚁';
            case 'collect': return '📦';
            case 'survive': return '🛡️';
            default: return '📋';
        }
    }

    function getMapLabel(mapId) {
        const labels = {
            'desert': '🏜️ 沙漠',
            'city': '🏙️ 城市',
            'factory': '🏭 工厂',
            'jungle': '🌴 丛林',
            'snow': '❄️ 雪山',
            'any': '🌍 任意地图'
        };
        return labels[mapId] || mapId;
    }

    function getProgressDisplay(m) {
        if (m.id === currentId && currentMissionProgress > 0) {
            const percent = Math.min(100, (currentMissionProgress / m.target) * 100);
            return '<div class="mission-line-progress"><div class="mission-line-progress-fill" style="width:' + percent + '%"></div></div><div style="font-size:11px;color:#58a6ff;margin-top:4px;">进度: ' + currentMissionProgress + '/' + m.target + '</div>';
        }
        return '';
    }

    function isMissionAvailable(m) {
        if (m.map === 'any') return true;
        return m.map === currentMapId;
    }

    function isMissionSelectable(m) {
        if (completedMissionIds.includes(m.id)) return false;
        if (m.id === currentId) return false;
        if (m.map !== 'any') return false;
        return hasMissionPrereqs(m, missions);
    }

    listEl.innerHTML = missions.map(function(m, idx) {
        const isCompleted = completedMissionIds.includes(m.id);
        const isCurrent = m.id === currentId;
        const available = isMissionAvailable(m);
        const selectable = isMissionSelectable(m);
        let statusClass = '';
        let statusText = '';

        if (isCompleted) {
            statusClass = 'completed';
            statusText = '✅ 已完成';
        } else if (isCurrent) {
            statusClass = 'current';
            statusText = '🔥 进行中';
        } else if (!available && m.map !== 'any') {
            statusClass = 'locked';
            statusText = '🔒 需切换地图';
        } else if (selectable) {
            statusClass = 'selectable';
            statusText = '<button class="select-mission-btn" onclick="selectMissionById(\'' + m.id + '\')">选择此任务</button>';
        } else if (!hasMissionPrereqs(m, missions) && m.map === 'any') {
            statusClass = 'locked';
            statusText = '🔒 前置任务未完成';
        } else {
            statusClass = 'locked';
            statusText = '📌 待解锁';
        }

        const cardClass = selectable ? ' mission-line-card selectable' : ' mission-line-card ' + statusClass;
        const clickAttr = selectable ? ' onclick="selectMissionById(\'' + m.id + '\')" style="cursor:pointer;" ' : '';

        return '<div class="' + ('mission-line-card ' + statusClass) + '"' + clickAttr + '>' +
                    '<div class="mission-line-icon">' + getMissionIcon(m) + '</div>' +
                    '<div class="mission-line-body">' +
                        '<div class="mission-line-name">' + m.nameZh +
                            '<span class="en-name">' + m.nameEn + '</span>' +
                        '</div>' +
                        '<div class="mission-line-desc">' + m.descZh + '</div>' +
                        '<div class="mission-line-meta">' +
                            '<span class="reward">奖励: 🪙 ' + m.reward + '</span>' +
                            '<span class="map-tag">' + getMapLabel(m.map) + '</span>' +
                            '<span>目标: ' + m.target + '</span>' +
                        '</div>' +
                        getProgressDisplay(m) +
                    '</div>' +
                    '<div class="mission-line-status">' + statusText + '</div>' +
                '</div>';
    }).join('');
}

function showMissionPanel() {
    document.querySelectorAll('.panel').forEach(p => { p.classList.remove('active'); p.style.display = 'none'; });
    const panel = document.getElementById('missionLinePanel');
    if (panel) {
        panel.classList.add('active');
        panel.style.display = 'block';
    }
    document.querySelectorAll('.func-btn').forEach(b => b.classList.remove('active'));
    const fifthBtn = document.querySelectorAll('.func-btn')[4];
    if (fifthBtn) fifthBtn.classList.add('active');
    renderMissionLineList();
    hideLobbyBottom();
}

function showModification() {
    showNotification('🔧 改装处 - 正在开发中，敬请期待！');
}

function setMissionLanguage(lang) {
    missionLanguage = lang;
    updateMissionDisplay();
}

// ===== Init hooks =====
(function() {
    try { startAutoBackup(); } catch (e) { console.error(e); }
    try { refreshSlotUI(); refreshBackupUI(); } catch (e) { /* ignore */ }
    loadMissionSettings();
})();

function getItemKey(itemName) {
    const map = {
        'medkit': 'medkits',
        'armor_light': 'armor_light',
        'armor_heavy': 'armor_heavy',
        'grenade': 'grenades',
        'ammoBox': 'ammoBox',
        'speedBoost': 'speedBoost'
    };
    return map[itemName];
}

function getItemDisplayName(itemName) {
    const map = {
        'medkit': '医疗包',
        'armor_light': '轻型护甲',
        'armor_heavy': '重型护甲',
        'grenade': '手雷',
        'ammoBox': '弹药箱',
        'speedBoost': '加速卡'
    };
    return map[itemName] || itemName;
}

function updateMarketUI() {
    refreshMarketPriceDisplays();
    const sellMedkit = document.getElementById('sellMedkitCount');
    if (sellMedkit) sellMedkit.textContent = playerData.inventory.medkits || 0;
    const sellGrenade = document.getElementById('sellGrenadeCount');
    if (sellGrenade) sellGrenade.textContent = playerData.inventory.grenades || 0;
    const sellAmmo = document.getElementById('sellAmmoCount');
    if (sellAmmo) sellAmmo.textContent = playerData.inventory.ammoBox || 0;
    const sellLight = document.getElementById('sellArmorLight');
    if (sellLight) sellLight.textContent = playerData.inventory.armor_light && playerData.equippedArmor === 'light' ? '是' : '否';
    const sellHeavy = document.getElementById('sellArmorHeavy');
    if (sellHeavy) sellHeavy.textContent = playerData.inventory.armor_heavy && playerData.equippedArmor === 'heavy' ? '是' : '否';
}

function useItem(itemName) {
    if (!gameRunning) {
        showNotification('请先开始游戏！');
        return;
    }
    
    // 检查物品使用间隔
    if (enableItemCooldown) {
        const now = Date.now();
        if (now - lastItemUse < ITEM_COOLDOWN) {
            return;  // 间隔内不响应
        }
        lastItemUse = now;
    }

    // 护甲是装备型道具，不适用此处的消耗逻辑
    if (itemName === 'armor_light' || itemName === 'armor_heavy') {
        showNotification('护甲请在战备中心装备！');
        return;
    }

    const itemKey = getItemKey(itemName);
    if (!itemKey || !playerData.inventory[itemKey] || playerData.inventory[itemKey] <= 0) {
        showNotification('没有该物品！');
        return;
    }

    // 统一扣减一次；但 'grenade' 走 throwGrenade 路径（throwGrenade 自己会扣一次），
    // 为避免重复扣减，手雷这里不先扣。
    if (itemName !== 'grenade') {
        playerData.inventory[itemKey]--;
    }

    switch (itemName) {
        case 'medkit':
            const healAmount = 30;
            player.health = Math.min(player.health + healAmount, player.maxHealth);
            showNotification(`使用医疗包，恢复 ${healAmount} 生命值！`);
            break;
        case 'ammoBox':
            player.weapons.forEach(w => w.currentAmmo = w.clipSize);
            showNotification('使用弹药箱，所有武器弹药已填满！');
            break;
        case 'speedBoost':
            const now = Date.now();
            player.buffs.speedBoostUntil = now + 30000;
            showNotification('使用加速卡，速度提升50%（30秒）！');
            break;
        case 'grenade':
            throwGrenade();
            break;
        default:
            showNotification('无法使用该物品');
            return;
    }

    updateHUD();
}

// 装备护甲：只在大厅内允许（游戏中不允许直接改玩家生命）
function equipArmor(armorType) {
    if (gameRunning) {
        showNotification('游戏中无法装备护甲，请在大厅装备！');
        return;
    }
    if (playerData.equippedArmor === armorType) {
        showNotification('已经装备了该护甲！');
        return;
    }

    const inventoryKey = armorType === 'light' ? 'armor_light' : 'armor_heavy';
    if (!playerData.inventory[inventoryKey] || playerData.inventory[inventoryKey] <= 0) {
        showNotification('没有该护甲！');
        return;
    }

    const oldArmor = playerData.equippedArmor;
    if (oldArmor) {
        const oldKey = oldArmor === 'light' ? 'armor_light' : 'armor_heavy';
        playerData.inventory[oldKey] = (playerData.inventory[oldKey] || 0) + 1;
    }

    playerData.equippedArmor = armorType;
    playerData.inventory[inventoryKey]--;

    showNotification(`装备成功！${armorType === 'heavy' ? '重型护甲' : '轻型护甲'}`);
    updatePlayerStats();
    updateMarketUI();
    updateSupplyUI();
}

function showMarketTab(tab) {
    document.querySelectorAll('.market-tabs .tab-btn').forEach(b => b.classList.remove('active'));
    if (tab === 'buy') {
        const btn = document.querySelector('.market-tabs .tab-btn:nth-child(1)');
        if (btn) btn.classList.add('active');
        const buyM = document.getElementById('buyMarket');
        if (buyM) buyM.style.display = 'grid';
        const sellM = document.getElementById('sellMarket');
        if (sellM) sellM.style.display = 'none';
    } else {
        const btn = document.querySelector('.market-tabs .tab-btn:nth-child(2)');
        if (btn) btn.classList.add('active');
        const buyM = document.getElementById('buyMarket');
        if (buyM) buyM.style.display = 'none';
        const sellM = document.getElementById('sellMarket');
        if (sellM) sellM.style.display = 'grid';
    }
}



function selectCell(cell) {
    document.querySelectorAll('.grid-cell').forEach(c => c.classList.remove('selected'));
    cell.classList.add('selected');
}

// ============================================================
// 初始化
// ============================================================
function init() {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    // 测试：绘制一个简单的图案来验证 canvas 正常工作
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#00cc66';
    ctx.font = 'bold 32px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Canvas Ready!', canvas.width/2, canvas.height/2);
    console.log('[INIT] Canvas initialized:', canvas.width, 'x', canvas.height);
    
    // 初始化自动射击 UI 状态
    const statusEl = document.getElementById('autoFireStatus');
    if (statusEl) {
        statusEl.classList.toggle('on', autoFire);
        statusEl.classList.toggle('off', !autoFire);
    }

    // 设置 canvas 可聚焦
    canvas.setAttribute('tabindex', '0');
    canvas.style.outline = 'none';

    canvas.addEventListener('mousemove', e => {
        const rect = canvas.getBoundingClientRect();
        mouseX = e.clientX - rect.left;
        mouseY = e.clientY - rect.top;
    });

    canvas.addEventListener('click', () => {
        canvas.focus();
        // 左键不再射击（射击改为右键）
    });

    // 右键单击 = 单发；右键再次单击 = 如果是连发模式则切换开关
    canvas.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        canvas.focus();
        if (!gameRunning) return;
        if (autoFire) {
            // 连发模式：右键切换开/关
            toggleAutoFire();
        } else if (canShoot()) {
            shoot();
        }
    });

    canvas.addEventListener('mousedown', () => {
        canvas.focus();
    });

    // Shift + WASD 物资使用：Shift 时 WASD 不移动，只选中物资
    function handleShiftItem(code) {
        if (!gameRunning) return false;
        if (code === 'KeyW') { useItem('medkit'); highlightWheelSlot('wheel-top'); return true; }
        if (code === 'KeyA') { useItem('ammoBox'); highlightWheelSlot('wheel-left'); return true; }
        if (code === 'KeyS') { useItem('speedBoost'); highlightWheelSlot('wheel-bottom'); return true; }
        if (code === 'KeyD') { throwGrenade(); highlightWheelSlot('wheel-right'); return true; }
        return false;
    }

    // 使用 canvas 捕获按键
    canvas.addEventListener('keydown', e => {
        console.log('[KEYDOWN] Code:', e.code, 'gameRunning:', gameRunning);
        keys.set(e.code, true);

        // Shift 按住：显示物资圆盘
        if (gameRunning && (e.code === 'ShiftLeft' || e.code === 'ShiftRight')) {
            shiftHeld = true;
            showItemWheel(true);
        }
        if (shiftHeld && gameRunning) {
            if (handleShiftItem(e.code)) return;
        }

        if (e.code === 'KeyR' && gameRunning) reload();
        if (e.code === 'KeyG' && gameRunning) throwGrenade();
        if (e.code === 'Digit1' && gameRunning) switchWeapon(0);
        if (e.code === 'Digit2' && gameRunning) switchWeapon(1);
        if (e.code === 'Digit3' && gameRunning) switchWeapon(2);
        if (!shiftHeld && e.code === 'KeyH' && gameRunning) useItem('medkit');
        if (!shiftHeld && e.code === 'KeyJ' && gameRunning) useItem('ammoBox');
        if (!shiftHeld && e.code === 'KeyK' && gameRunning) useItem('speedBoost');
        if (e.code === 'Space' && gameRunning) {
            e.preventDefault();
            toggleAutoFire();
        }
    });

    canvas.addEventListener('keyup', e => {
        console.log('[KEYUP] Code:', e.code);
        keys.set(e.code, false);
        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
            shiftHeld = false;
            showItemWheel(false);
        }
    });

    // 关键修复：window 只负责 ESC / 全局 UI 操作，不再重复处理游戏按键。
    // 之前 canvas 和 window 各自监听同一按键，会导致：
    // 1) 自动射击 / 手雷 等冷却失效（被 window 再次触发）
    // 2) 部分按键被处理两次（例如自动射击被切换开关两次 -> 变回原状但消耗性能）
    // 3) 极端场景下（多按键并发 + 网络/定时器回调重叠）造成状态机错位类死锁。
    window.addEventListener('keydown', e => {
        // ESC 全局退出：先关模态，再回上级
        if (e.code === 'Escape') {
            // 1) 先尝试关闭称号详情弹窗
            const titleModal = document.getElementById('titleDetailModal');
            if (titleModal && titleModal.style.display === 'flex') {
                closeTitleDetail();
                return;
            }
            // 2) 如果正在游戏中，ESC 结束游戏
            if (gameRunning) {
                endGame();
                return;
            }
            // 3) 如果当前显示的是 lobby 内的子 panel 而非 readyRoom，回退到 lobby
            const activeSubPanel = document.querySelector('.panel.active');
            if (activeSubPanel && activeSubPanel.id !== 'readyRoom') {
                showLobby();
                return;
            }
            // 4) 其他情况回主菜单
            const lobby = document.getElementById('lobby');
            if (lobby && lobby.style.display !== 'none') {
                backToMenu();
            }
            return;
        }

        // 不再在 window 层重复处理游戏按键（交给 canvas）
    });

    window.addEventListener('keyup', e => {
        // keyup 不做重复处理，保留为空。canvas 的 keyup 已经足够。
    });

    // resize 时重新设置 canvas 尺寸是合理的（仅此一次）
    window.addEventListener('resize', () => {
        if (!canvas) return;
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    });

    loadGameParams();
    loadPlayerData();
    loadCustomTitles();
    loadCompletedMissions();
    loadMissionSettings();
    setupMissionPanelDrag();
    showMenu();
}

function setupMissionPanelDrag() {
    const panel = document.getElementById('missionPanel');
    const header = panel ? panel.querySelector('.mission-header') : null;
    if (!panel || !header) return;

    const saved = localStorage.getItem('deathTrench_missionPanel_pos');
    if (saved) {
        try {
            const pos = JSON.parse(saved);
            panel.style.right = 'auto';
            panel.style.bottom = 'auto';
            panel.style.left = pos.left + 'px';
            panel.style.top = pos.top + 'px';
        } catch (e) {}
    }

    let isDragging = false;
    let startX = 0, startY = 0;
    let origLeft = 0, origTop = 0;

    header.addEventListener('mousedown', function(e) {
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        const rect = panel.getBoundingClientRect();
        origLeft = rect.left;
        origTop = rect.top;
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
        panel.style.left = origLeft + 'px';
        panel.style.top = origTop + 'px';
        e.preventDefault();
    });

    document.addEventListener('mousemove', function(e) {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const maxLeft = window.innerWidth - panel.offsetWidth;
        const maxTop = window.innerHeight - panel.offsetHeight;
        const newLeft = Math.max(0, Math.min(maxLeft, origLeft + dx));
        const newTop = Math.max(0, Math.min(maxTop, origTop + dy));
        panel.style.left = newLeft + 'px';
        panel.style.top = newTop + 'px';
    });

    document.addEventListener('mouseup', function() {
        if (!isDragging) return;
        isDragging = false;
        const rect = panel.getBoundingClientRect();
        localStorage.setItem('deathTrench_missionPanel_pos',
            JSON.stringify({ left: rect.left, top: rect.top }));
    });
}

window.addEventListener('DOMContentLoaded', init);
