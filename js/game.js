// ================================================
// 由billbill十三闲客-Alan使用Trae编写，未经许可请勿搬走
// ================================================

// 新坐标系统：地图100x100格子，每格20像素
// 玩家坐标是格子坐标，固定在屏幕中心
// 显示区域：玩家周围61x41格子

// 编辑器功能开关（由main.js设置或通过electronAPI检测）
let ENABLE_TOOLS = typeof window !== 'undefined' && window.ENABLE_TOOLS === true;
async function checkAndUpdateToolsFlag() {
    try {
        if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.isDevMode) {
            const isDev = await window.electronAPI.isDevMode();
            ENABLE_TOOLS = isDev;
        }
    } catch (e) {
        console.log('Failed to check dev mode:', e);
    }
}
checkAndUpdateToolsFlag();

const DataBridge = (() => {
    let hasIPC = false;
    let holderId = 'client_' + Math.random().toString(36).slice(2, 10);
    let lockHolder = null;
    const subscribers = new Set();

    function init() {
        hasIPC = !!(window.electronAPI && window.electronAPI.dataCenter);
        if (hasIPC && window.electronAPI.dataCenter.onUpdate) {
            window.electronAPI.dataCenter.onUpdate((data) => {
                for (const fn of subscribers) {
                    try { fn(data); } catch (e) {}
                }
            });
        }
    }

    function isAvailable() { return hasIPC; }

    async function syncFromSource() {
        if (!hasIPC) return null;
        try {
            const all = await window.electronAPI.dataCenter.getAll();
            if (all && all.lotteryData) {
                Object.assign(lotteryData, all.lotteryData);
            }
            if (all && all.playerData) {
                Object.assign(playerData, all.playerData);
            }
            return all;
        } catch (e) {
            console.warn('[DataBridge] sync failed:', e);
            return null;
        }
    }

    async function acquireLock() {
        if (!hasIPC) return { success: true, holder: holderId };
        try {
            const r = await window.electronAPI.dataCenter.acquireLock(holderId);
            if (r && r.success) lockHolder = holderId;
            return r;
        } catch (e) {
            return { success: false, reason: 'ipc_error', error: e.message };
        }
    }

    async function releaseLock() {
        if (!hasIPC || !lockHolder) return { success: true };
        try {
            const r = await window.electronAPI.dataCenter.releaseLock(lockHolder);
            lockHolder = null;
            return r;
        } catch (e) {
            lockHolder = null;
            return { success: false, error: e.message };
        }
    }

    function getSnapshot() {
        return {
            playerData: JSON.parse(JSON.stringify(playerData)),
            lotteryData: JSON.parse(JSON.stringify(lotteryData)),
            playerMods: JSON.parse(JSON.stringify(playerMods)),
            ammoInventory: JSON.parse(JSON.stringify(ammoInventory))
        };
    }

    function restoreSnapshot(snap) {
        if (!snap) return;
        if (snap.playerData) Object.assign(playerData, snap.playerData);
        if (snap.lotteryData) Object.assign(lotteryData, snap.lotteryData);
        if (snap.playerMods) Object.assign(playerMods, snap.playerMods);
        if (snap.ammoInventory) Object.assign(ammoInventory, snap.ammoInventory);
    }

    async function commitDraw(drawResult) {
        if (!hasIPC) return { success: true };
        try {
            const r = await window.electronAPI.dataCenter.commitLottery(lockHolder || holderId, drawResult);
            if (r && r.success && r.data) {
                if (r.data.lotteryData) Object.assign(lotteryData, r.data.lotteryData);
                if (r.data.playerData) Object.assign(playerData, r.data.playerData);
            }
            return r;
        } catch (e) {
            return { success: false, reason: 'ipc_error', error: e.message };
        }
    }

    async function rollback(snapshot) {
        restoreSnapshot(snapshot);
        if (!hasIPC) return { success: true };
        try {
            return await window.electronAPI.dataCenter.rollbackLottery(lockHolder || holderId, snapshot);
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    function subscribe(fn) {
        subscribers.add(fn);
        return () => subscribers.delete(fn);
    }

    return { init, isAvailable, syncFromSource, acquireLock, releaseLock, getSnapshot, restoreSnapshot, commitDraw, rollback, subscribe };
})();

const UIAnimator = (() => {
    const EASING = {
        linear: (t) => t,
        ease: (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
        easeIn: (t) => t * t,
        easeOut: (t) => 1 - (1 - t) * (1 - t),
        easeInOut: (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
        easeOutBack: (t) => { const c1 = 1.70158; const c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
        easeOutElastic: (t) => { const c4 = (2 * Math.PI) / 3; return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1; }
    };

    let config = {
        panelEnterDuration: 280,
        panelExitDuration: 200,
        panelEasing: 'easeOutBack',
        notificationEnterDuration: 300,
        notificationExitDuration: 250,
        notificationStayDuration: 2200,
        notificationEasing: 'easeOut',
        defaultDuration: 250,
        defaultEasing: 'ease',
        reduceMotion: false
    };

    const activeAnimations = new Map();
    let animationIdCounter = 0;

    function configure(patch) {
        Object.assign(config, patch || {});
        return { ...config };
    }

    function getConfig() { return { ...config }; }

    function getEasing(name) {
        return EASING[name] || EASING[config.defaultEasing];
    }

    function animate({ element, from, to, duration, easing, onStart, onUpdate, onComplete, delay = 0 }) {
        if (!element || config.reduceMotion) {
            if (to) applyStyles(element, to);
            if (onComplete) onComplete();
            return { cancel: () => {}, promise: Promise.resolve() };
        }

        const id = ++animationIdCounter;
        const dur = duration || config.defaultDuration;
        const easeFn = getEasing(easing || config.defaultEasing);
        let rafId = null;
        let cancelled = false;

        const promise = new Promise((resolve) => {
            const start = () => {
                if (cancelled) { resolve(); return; }
                const startTime = performance.now();
                if (onStart) onStart(element);
                if (from) applyStyles(element, from);

                const tick = (now) => {
                    if (cancelled) { resolve(); return; }
                    const elapsed = now - startTime;
                    const progress = Math.min(1, elapsed / dur);
                    const eased = easeFn(progress);

                    if (to) {
                        const current = {};
                        for (const key of Object.keys(to)) {
                            const startVal = parseAnimValue(from?.[key] ?? getComputedStyle(element)[key]);
                            const endVal = parseAnimValue(to[key]);
                            current[key] = interpolateValue(startVal, endVal, eased);
                        }
                        applyStyles(element, current);
                    }

                    if (onUpdate) onUpdate(element, eased, progress);

                    if (progress >= 1) {
                        activeAnimations.delete(id);
                        if (onComplete) onComplete(element);
                        resolve();
                    } else {
                        rafId = requestAnimationFrame(tick);
                    }
                };

                rafId = requestAnimationFrame(tick);
            };

            if (delay > 0) {
                setTimeout(start, delay);
            } else {
                start();
            }
        });

        const handle = {
            id,
            cancel: () => {
                cancelled = true;
                if (rafId) cancelAnimationFrame(rafId);
                activeAnimations.delete(id);
            },
            promise
        };

        activeAnimations.set(id, handle);
        return handle;
    }

    function applyStyles(el, styles) {
        for (const key of Object.keys(styles)) {
            if (key === 'transform') {
                el.style.transform = styles[key];
            } else if (key === 'opacity') {
                el.style.opacity = styles[key];
            } else {
                el.style[key] = styles[key];
            }
        }
    }

    function parseAnimValue(v) {
        if (typeof v === 'number') return { type: 'number', value: v };
        if (typeof v === 'string') {
            const m = v.match(/^(-?[\d.]+)([a-z%]*)$/i);
            if (m) return { type: 'number', value: parseFloat(m[1]), unit: m[2] || '' };
        }
        return { type: 'string', value: v };
    }

    function interpolateValue(a, b, t) {
        if (a.type === 'number' && b.type === 'number') {
            const val = a.value + (b.value - a.value) * t;
            const unit = b.unit || a.unit || '';
            return unit ? (val.toFixed(3) + unit) : val;
        }
        return b.value;
    }

    function showPanel(element, options = {}) {
        if (!element) return Promise.resolve();

        element.style.display = options.display || 'block';
        element.style.opacity = '0';
        element.style.transform = 'translateY(12px) scale(0.96)';
        element.style.pointerEvents = 'none';

        requestAnimationFrame(() => {
            element.style.transition = `opacity ${config.panelEnterDuration}ms ${EASING[config.panelEasing]}, transform ${config.panelEnterDuration}ms ${EASING[config.panelEasing]}`;
            element.style.opacity = '1';
            element.style.transform = 'translateY(0) scale(1)';
        });

        return new Promise((resolve) => {
            setTimeout(() => {
                element.style.pointerEvents = '';
                element.style.transition = '';
                if (options.onComplete) options.onComplete();
                resolve();
            }, config.panelEnterDuration + 20);
        });
    }

    function hidePanel(element, options = {}) {
        if (!element) return Promise.resolve();

        element.style.pointerEvents = 'none';
        element.style.transition = `opacity ${config.panelExitDuration}ms ease, transform ${config.panelExitDuration}ms ease`;
        element.style.opacity = '0';
        element.style.transform = 'translateY(8px) scale(0.98)';

        return new Promise((resolve) => {
            setTimeout(() => {
                element.style.display = 'none';
                element.style.transition = '';
                element.style.transform = '';
                if (options.onComplete) options.onComplete();
                resolve();
            }, config.panelExitDuration + 20);
        });
    }

    function fadeIn(element, duration, easing) {
        return animate({
            element,
            from: { opacity: '0' },
            to: { opacity: '1' },
            duration: duration || 250,
            easing: easing || 'easeOut'
        });
    }

    function fadeOut(element, duration, easing) {
        return animate({
            element,
            from: { opacity: getComputedStyle(element).opacity },
            to: { opacity: '0' },
            duration: duration || 200,
            easing: easing || 'easeIn'
        });
    }

    function slideIn(element, direction = 'up', duration) {
        const transforms = {
            up: { from: 'translateY(20px)', to: 'translateY(0)' },
            down: { from: 'translateY(-20px)', to: 'translateY(0)' },
            left: { from: 'translateX(20px)', to: 'translateX(0)' },
            right: { from: 'translateX(-20px)', to: 'translateX(0)' }
        };
        const t = transforms[direction] || transforms.up;
        return animate({
            element,
            from: { opacity: '0', transform: t.from },
            to: { opacity: '1', transform: t.to },
            duration: duration || 300,
            easing: 'easeOut'
        });
    }

    function slideOut(element, direction = 'down', duration) {
        const transforms = {
            up: { from: 'translateY(0)', to: 'translateY(-20px)' },
            down: { from: 'translateY(0)', to: 'translateY(20px)' },
            left: { from: 'translateX(0)', to: 'translateX(-20px)' },
            right: { from: 'translateY(0)', to: 'translateX(20px)' }
        };
        const t = transforms[direction] || transforms.down;
        return animate({
            element,
            from: { opacity: '1', transform: t.from },
            to: { opacity: '0', transform: t.to },
            duration: duration || 250,
            easing: 'easeIn'
        });
    }

    function pulse(element, iterations = 1) {
        let count = 0;
        const run = () => {
            return animate({
                element,
                from: { transform: 'scale(1)' },
                to: { transform: 'scale(1.08)' },
                duration: 120,
                easing: 'easeOut'
            }).promise.then(() => {
                return animate({
                    element,
                    from: { transform: 'scale(1.08)' },
                    to: { transform: 'scale(1)' },
                    duration: 120,
                    easing: 'easeIn'
                }).promise;
            }).then(() => {
                count++;
                if (count < iterations) return run();
            });
        };
        return { promise: run(), cancel: () => {} };
    }

    function stagger(elements, animationFn, staggerMs = 60) {
        const promises = [];
        elements.forEach((el, i) => {
            promises.push(new Promise((resolve) => {
                setTimeout(() => {
                    animationFn(el, i).promise.then(resolve);
                }, i * staggerMs);
            }));
        });
        return { promise: Promise.all(promises), cancel: () => {} };
    }

    function cancelAll() {
        for (const [id, handle] of activeAnimations) {
            handle.cancel();
        }
        activeAnimations.clear();
    }

    function createNotificationEl(message) {
        const el = document.createElement('div');
        el.className = 'notification';
        el.textContent = message;
        el.style.opacity = '0';
        el.style.transform = 'translateY(-10px) scale(0.95)';
        el.style.pointerEvents = 'none';
        document.body.appendChild(el);
        return el;
    }

    function showAnimatedNotification(message, options = {}) {
        const el = createNotificationEl(message);
        const stay = options.stayDuration || config.notificationStayDuration;

        requestAnimationFrame(() => {
            el.style.transition = `opacity ${config.notificationEnterDuration}ms ease, transform ${config.notificationEnterDuration}ms ease`;
            el.style.opacity = '1';
            el.style.transform = 'translateY(0) scale(1)';
        });

        let removed = false;
        const remove = () => {
            if (removed) return;
            removed = true;
            el.style.transition = `opacity ${config.notificationExitDuration}ms ease, transform ${config.notificationExitDuration}ms ease`;
            el.style.opacity = '0';
            el.style.transform = 'translateY(-6px) scale(0.97)';
            setTimeout(() => { if (el.parentNode) el.remove(); }, config.notificationExitDuration + 20);
        };

        const timeoutId = setTimeout(remove, stay + config.notificationEnterDuration);

        return {
            element: el,
            dismiss: () => { clearTimeout(timeoutId); remove(); }
        };
    }

    function registerPanel(element, panelConfig = {}) {
        return {
            show: (opts) => showPanel(element, { ...panelConfig, ...opts }),
            hide: (opts) => hidePanel(element, { ...panelConfig, ...opts }),
            el: element
        };
    }

    return {
        configure,
        getConfig,
        EASING,
        animate,
        showPanel,
        hidePanel,
        fadeIn,
        fadeOut,
        slideIn,
        slideOut,
        pulse,
        stagger,
        cancelAll,
        showAnimatedNotification,
        registerPanel
    };
})();

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

// 游戏版本
const GAME_VERSION = '2.0.0';
const UPDATE_CHECK_URL = 'https://gitee.com/wang-zirui-from-beijing/death-trench-ai-game/raw/main/version.json';

// ==================== 武器系统 ====================
// 武器类型
const WEAPON_TYPES = {
    PISTOL: 'pistol',
    SMG: 'smg',
    RIFLE: 'rifle',
    AR: 'ar',
    LMG: 'lmg',
    SHOTGUN: 'shotgun',
    SNIPER: 'sniper',
    MELEE: 'melee'
};

// 弹药类型
const AMMO_TYPES = {
    NORMAL: 'normal',
    AP: 'ap',
    ARMOR_PIERCING: 'ap',
    EXP: 'exp',
    EXPLOSIVE: 'exp',
    FIRE: 'fire',
    INCENDIARY: 'fire'
};

// 武器定义（基础属性）
const DEFAULT_WEAPONS = [
    // 手枪
    { id: 'pistol', name: '手枪', type: WEAPON_TYPES.PISTOL, damage: 25, fireRate: 250, clipSize: 15, range: 30, icon: '🔫', ammoType: AMMO_TYPES.NORMAL, price: 0, unlocked: true, category: 'weapon', rarity: 'common' },
    // 冲锋枪
    { id: 'smg', name: '冲锋枪', type: WEAPON_TYPES.SMG, damage: 18, fireRate: 80, clipSize: 35, range: 25, icon: '⚡', ammoType: AMMO_TYPES.NORMAL, price: 800, unlocked: false, category: 'weapon', rarity: 'uncommon' },
    // 步枪
    { id: 'rifle', name: '步枪', type: WEAPON_TYPES.RIFLE, damage: 30, fireRate: 150, clipSize: 30, range: 40, icon: '🔴', ammoType: AMMO_TYPES.NORMAL, price: 0, unlocked: true, category: 'weapon', rarity: 'common' },
    // 突击步枪
    { id: 'ar', name: '突击步枪', type: WEAPON_TYPES.AR, damage: 35, fireRate: 120, clipSize: 40, range: 45, icon: '🟥', ammoType: AMMO_TYPES.AP, price: 1500, unlocked: false, category: 'weapon', rarity: 'rare' },
    // 轻机枪
    { id: 'lmg', name: '轻机枪', type: WEAPON_TYPES.LMG, damage: 28, fireRate: 60, clipSize: 100, range: 35, icon: '📦', ammoType: AMMO_TYPES.NORMAL, price: 2500, unlocked: false, category: 'weapon', rarity: 'epic' },
    // 霰弹枪
    { id: 'shotgun', name: '霰弹枪', type: WEAPON_TYPES.SHOTGUN, damage: 80, fireRate: 800, clipSize: 6, range: 15, icon: '💥', ammoType: AMMO_TYPES.NORMAL, price: 1200, unlocked: false, pellets: 5, category: 'weapon', rarity: 'rare' },
    // 狙击枪
    { id: 'sniper', name: '狙击枪', type: WEAPON_TYPES.SNIPER, damage: 120, fireRate: 1000, clipSize: 5, range: 60, icon: '🎯', ammoType: AMMO_TYPES.AP, price: 0, unlocked: true, category: 'weapon', rarity: 'rare' },
    // 近战武器
    { id: 'knife', name: '战术匕首', type: WEAPON_TYPES.MELEE, damage: 60, fireRate: 400, clipSize: 999, range: 2, icon: '🗡️', ammoType: null, price: 0, unlocked: true, isMelee: true, category: 'weapon', rarity: 'common' },
    { id: 'machete', name: '砍刀', type: WEAPON_TYPES.MELEE, damage: 90, fireRate: 600, clipSize: 999, range: 2.5, icon: '⚔️', ammoType: null, price: 800, unlocked: false, isMelee: true, category: 'weapon', rarity: 'uncommon' }
];

let WEAPONS = JSON.parse(JSON.stringify(DEFAULT_WEAPONS));

const DEFAULT_GAME_PARAMS_SCHEMA = {
    version: 1,
    ENEMY: { health: 80, damage: { easy: 8, normal: 12, hard: 18 }, moveSpeed: 0.35, fireRate: 1500, spawnInterval: 3000, count: 8 },
    PLAYER: { maxHealth: 100, moveSpeed: 100, bulletSpeed: 15, invincibilityTime: 1000 },
    MAP: { obstacleRate: 0.08, coverRate: 0.14, buildingRate: 0.18, waterRate: 0.2, MAP_SIZE: 150 },
    DROPS: { coinMin: 10, coinMax: 30, medkitHeal: 30, grenadeDamage: 150, grenadeRadius: 4, ammoRefillAll: 30, starScore: 500 },
    BUFFS: { speedBoostMultiplier: 1.5, speedBoostDuration: 30000, damageReductionMultiplier: 0.5 }
};

// 改装配件定义
const MODIFICATIONS = {
    // 瞄准镜
    scope: {
        name: '瞄准镜',
        icon: '🔭',
        effects: { rangeBonus: 1.3, damageBonus: 1.0 },
        price: 500,
        description: '增加30%射程'
    },
    // 扩容弹匣
    extendedMag: {
        name: '扩容弹匣',
        icon: '📋',
        effects: { clipSizeBonus: 1.5, fireRateBonus: 0.9 },
        price: 400,
        description: '增加50%弹容量，减少10%射速'
    },
    // 消音器
    suppressor: {
        name: '消音器',
        icon: '🔇',
        effects: { rangeBonus: 0.8, stealth: true },
        price: 600,
        description: '减少声音，射程降低20%'
    },
    // 握把
    grip: {
        name: '战术握把',
        icon: '✋',
        effects: { fireRateBonus: 1.2, spreadReduction: 0.7 },
        price: 350,
        description: '增加20%射速，减少散布'
    },
    // 穿甲弹
    apRounds: {
        name: '穿甲弹',
        icon: '🎯',
        effects: { damageBonus: 1.3, armorPenetration: true },
        price: 800,
        description: '增加30%伤害，穿透护甲'
    },
    // 枪托
    stock: {
        name: '枪托',
        icon: '🪵',
        effects: { recoilReduction: 0.6, accuracyBonus: 1.15 },
        price: 450,
        description: '大幅减少后坐力'
    }
};

// 皮肤定义
const SKINS = {
    weapons: [
        { id: 'skin_default', name: '默认', weaponId: null, color: null, price: 0, unlocked: true },
        { id: 'skin_carbon', name: '碳纤维', weaponId: null, color: '#333333', price: 300, unlocked: false, pattern: 'carbon' },
        { id: 'skin_gold', name: '黄金', weaponId: null, color: '#FFD700', price: 1000, unlocked: false, pattern: 'metallic' },
        { id: 'skin_camo', name: '迷彩', weaponId: null, color: '#4a5d23', price: 500, unlocked: false, pattern: 'camo' },
        { id: 'skin_neon', name: '霓虹', weaponId: null, color: '#00FFFF', price: 800, unlocked: false, pattern: 'neon' },
        { id: 'skin_red', name: '赤红', weaponId: null, color: '#FF4444', price: 400, unlocked: false, pattern: 'solid' },
        { id: 'skin_blue', name: '深蓝', weaponId: null, color: '#4444FF', price: 400, unlocked: false, pattern: 'solid' },
        { id: 'skin_purple', name: '紫晶', weaponId: null, color: '#9944FF', price: 600, unlocked: false, pattern: 'crystal' },
        // 抽奖限定皮肤
        { id: 'skin_thunder', name: '雷霆步枪', weaponId: null, color: '#6a6aff', price: 1400, unlocked: false, pattern: 'thunder' },
        { id: 'skin_dragon', name: '龙鳞突击', weaponId: null, color: '#cc2200', price: 2500, unlocked: false, pattern: 'dragon' },
        { id: 'skin_phoenix', name: '凤凰之刃', weaponId: null, color: '#ff6600', price: 2000, unlocked: false, pattern: 'phoenix' },
        { id: 'skin_stellar', name: '星辰猎手', weaponId: null, color: '#6a6aff', price: 2000, unlocked: false, pattern: 'stellar' },
        { id: 'skin_obsidian', name: '黑曜毁灭', weaponId: null, color: '#1a1a1a', price: 3000, unlocked: false, pattern: 'obsidian' },
        { id: 'skin_rainbow', name: '彩虹传说', weaponId: null, color: 'linear-gradient(90deg,#ff0000,#ffa500,#ffff00,#00ff00,#00ffff,#0000ff,#ff00ff)', price: 5000, unlocked: false, pattern: 'rainbow' },
        { id: 'skin_inferno', name: '炽焰霰弹', weaponId: null, color: '#ff4400', price: 900, unlocked: false, pattern: 'inferno' },
        { id: 'skin_viper', name: '毒蛇狙击', weaponId: null, color: '#2d8c2d', price: 1100, unlocked: false, pattern: 'viper' },
        { id: 'skin_platinum', name: '白金手枪', weaponId: null, color: '#e8e8e8', price: 1300, unlocked: false, pattern: 'platinum' },
        { id: 'skin_arctic', name: '极地步枪', weaponId: null, color: '#c8d8e4', price: 700, unlocked: false, pattern: 'arctic' }
    ],
    players: [
        { id: 'player_default', name: '默认', color: '#00AA55', price: 0, unlocked: true },
        { id: 'player_soldier', name: '士兵', color: '#556B2F', price: 200, unlocked: false },
        { id: 'player_mercenary', name: '佣兵', color: '#8B4513', price: 500, unlocked: false },
        { id: 'player_elite', name: '精英', color: '#2F4F4F', price: 800, unlocked: false },
        { id: 'player_ghost', name: '幽灵', color: '#1a1a1a', price: 1200, unlocked: false }
    ]
};

// 自定义皮肤加成（可被开发者工具覆盖）
let customSkinBonuses = {};

// 获取皮肤加成
function getSkinBonus(skinId) {
    return customSkinBonuses[skinId] || {
        damageBonus: 0,
        healthBonus: 0,
        speedBonus: 0,
        fireRateBonus: 0,
        armorBonus: 0
    };
}

// 获取当前装备皮肤的总加成
function getCurrentSkinBonuses() {
    const weaponBonus = getSkinBonus(playerMods.equippedWeaponSkin);
    const playerBonus = getSkinBonus(playerMods.equippedPlayerSkin);
    return {
        damageBonus: (weaponBonus.damageBonus || 0) + (playerBonus.damageBonus || 0),
        healthBonus: (weaponBonus.healthBonus || 0) + (playerBonus.healthBonus || 0),
        speedBonus: (weaponBonus.speedBonus || 0) + (playerBonus.speedBonus || 0),
        fireRateBonus: (weaponBonus.fireRateBonus || 0) + (playerBonus.fireRateBonus || 0),
        armorBonus: (weaponBonus.armorBonus || 0) + (playerBonus.armorBonus || 0)
    };
}

// 抽奖系统定义
const LOTTERY = {
    singlePrice: 100,
    tenPrice: 900,
    pityCount: 10,
    pools: [
        { id: 'skin_thunder', name: '雷霆步枪', icon: '⚡', rarity: 'legendary', weight: 2, type: 'skin', skinId: 'skin_thunder' },
        { id: 'skin_dragon', name: '龙鳞突击', icon: '🐉', rarity: 'legendary', weight: 2, type: 'skin', skinId: 'skin_dragon' },
        { id: 'skin_phoenix', name: '凤凰之刃', icon: '🔥', rarity: 'legendary', weight: 2, type: 'skin', skinId: 'skin_phoenix' },
        { id: 'skin_stellar', name: '星辰猎手', icon: '⭐', rarity: 'legendary', weight: 2, type: 'skin', skinId: 'skin_stellar' },
        { id: 'skin_obsidian', name: '黑曜毁灭', icon: '🖤', rarity: 'legendary', weight: 1, type: 'skin', skinId: 'skin_obsidian' },
        { id: 'skin_rainbow', name: '彩虹传说', icon: '🌈', rarity: 'legendary', weight: 1, type: 'skin', skinId: 'skin_rainbow' },
        { id: 'skin_gold', name: '黄金冲锋', icon: '🥇', rarity: 'epic', weight: 2, type: 'skin', skinId: 'skin_gold' },
        { id: 'skin_inferno', name: '炽焰霰弹', icon: '🌋', rarity: 'epic', weight: 2, type: 'skin', skinId: 'skin_inferno' },
        { id: 'skin_viper', name: '毒蛇狙击', icon: '🐍', rarity: 'epic', weight: 2, type: 'skin', skinId: 'skin_viper' },
        { id: 'skin_platinum', name: '白金手枪', icon: '💎', rarity: 'epic', weight: 2, type: 'skin', skinId: 'skin_platinum' },
        { id: 'mod_silencer', name: '消音器', icon: '🔇', rarity: 'epic', weight: 2, type: 'mod', modId: 'suppressor' },
        { id: 'mod_stock', name: '枪托', icon: '🪵', rarity: 'epic', weight: 2, type: 'mod', modId: 'stock' },
        { id: 'player_ghost', name: '幽灵角色', icon: '👻', rarity: 'epic', weight: 2, type: 'playerSkin', skinId: 'player_ghost' },
        { id: 'skin_neon', name: '霓虹冲锋', icon: '💜', rarity: 'rare', weight: 5, type: 'skin', skinId: 'skin_neon' },
        { id: 'skin_red', name: '赤红步枪', icon: '❤️', rarity: 'rare', weight: 5, type: 'skin', skinId: 'skin_red' },
        { id: 'skin_blue', name: '深蓝机枪', icon: '💙', rarity: 'rare', weight: 5, type: 'skin', skinId: 'skin_blue' },
        { id: 'skin_arctic', name: '极地步枪', icon: '❄️', rarity: 'rare', weight: 5, type: 'skin', skinId: 'skin_arctic' },
        { id: 'item_medkit', name: '医疗包 x5', icon: '💊', rarity: 'rare', weight: 5, type: 'item', itemId: 'medkit', value: 5 },
        { id: 'item_grenade', name: '手雷 x3', icon: '💣', rarity: 'rare', weight: 5, type: 'item', itemId: 'grenade', value: 3 },
        { id: 'mod_scope', name: '瞄准镜', icon: '🔭', rarity: 'rare', weight: 4, type: 'mod', modId: 'scope' },
        { id: 'mod_grip', name: '战术握把', icon: '✊', rarity: 'rare', weight: 4, type: 'mod', modId: 'grip' },
        { id: 'player_elite', name: '精英角色', icon: '🎖️', rarity: 'rare', weight: 3, type: 'playerSkin', skinId: 'player_elite' },
        { id: 'ammo_ap', name: '穿甲弹 x30', icon: '🎯', rarity: 'rare', weight: 5, type: 'ammo', ammoType: 'ap', value: 30 },
        { id: 'coins_100', name: '金币 x100', icon: '🪙', rarity: 'common', weight: 10, type: 'coins', value: 100 },
        { id: 'coins_50', name: '金币 x50', icon: '🪙', rarity: 'common', weight: 10, type: 'coins', value: 50 },
        { id: 'item_ammo', name: '弹药箱 x2', icon: '📦', rarity: 'common', weight: 10, type: 'item', itemId: 'ammo', value: 2 },
        { id: 'coins_200', name: '金币 x200', icon: '🪙', rarity: 'common', weight: 4, type: 'coins', value: 200 },
        { id: 'item_speed', name: '加速卡 x1', icon: '⚡', rarity: 'common', weight: 10, type: 'item', itemId: 'speed', value: 1 },
        { id: 'coins_30', name: '金币 x30', icon: '🪙', rarity: 'common', weight: 10, type: 'coins', value: 30 },
        { id: 'mod_extendedmag', name: '扩容弹匣', icon: '📎', rarity: 'common', weight: 6, type: 'mod', modId: 'extendedMag' },
        { id: 'ammo_exp', name: '爆裂弹 x20', icon: '💥', rarity: 'common', weight: 8, type: 'ammo', ammoType: 'exp', value: 20 },
        { id: 'ammo_fire', name: '燃烧弹 x20', icon: '🔥', rarity: 'common', weight: 8, type: 'ammo', ammoType: 'fire', value: 20 },
        { id: 'player_soldier', name: '士兵角色', icon: '🪖', rarity: 'common', weight: 5, type: 'playerSkin', skinId: 'player_soldier' }
    ]
};

// 自定义奖池权重（可被开发者工具覆盖）
let customLotteryWeights = {};

// 获取当前生效的奖池配置（合并默认和自定义权重）
function getActiveLotteryPool() {
    return LOTTERY.pools.map(item => {
        const customWeight = customLotteryWeights[item.id];
        if (customWeight !== undefined) {
            return { ...item, weight: customWeight };
        }
        return { ...item };
    });
}

// 玩家抽奖数据
let lotteryData = {
    totalDraws: 0,
    pityCounter: 0,
    lastResults: [],
    totalRewards: {
        common: 0,
        rare: 0,
        epic: 0,
        legendary: 0
    },
    rewardHistory: []
};

// 玩家数据扩展（改装和皮肤）
let playerMods = {
    ownedMods: {},  // 已拥有的配件 { scope: 2, grip: 1, ... }
    equippedMods: {}, // { weaponId: { scope: true, extendedMag: false, ... } }
    ownedSkins: ['skin_default'],  // 已拥有的皮肤
    equippedWeaponSkin: 'skin_default',  // 当前武器皮肤
    equippedPlayerSkin: 'player_default',  // 当前玩家皮肤
    equippedAmmoTypes: {}  // { weaponId: 'normal'|'ap'|'exp'|'fire' }
};

// 弹药库存
let ammoInventory = {
    [AMMO_TYPES.NORMAL]: 100,
    [AMMO_TYPES.AP]: 20,
    [AMMO_TYPES.EXP]: 10,
    [AMMO_TYPES.FIRE]: 15
};

// 游戏参数（由数据编辑器覆盖）
let gameParams = JSON.parse(JSON.stringify(DEFAULT_GAME_PARAMS_SCHEMA));

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

// 射击手感：后坐力、屏幕震动、枪口闪光
let recoilAngle = 0;
let screenShake = 0;
let muzzleFlashTime = 0;
const RECOIL_RECOVERY = 0.85; // 每帧后坐力恢复比例

// 撤离系统
const EXTRACT_RADIUS = 2; // 撤离区域半径（格）
const EXTRACT_DURATION = 3000; // 撤离所需时间（毫秒）
let extractX = 50, extractY = 50;
let isExtracting = false;
let extractStartTime = 0;
let extractProgress = 0;

let settings = {
    difficulty: 'normal',
    playerSpeed: 100, // 百分比，100为默认速度
    fireRate: 100 // 射速调整，100为默认，数值越小射速越快
};
window.settings = settings;

const DEFAULT_TITLES_GAME = [
    { id: 't0', name: '新兵', icon: '🎖️', color: '#ffffff', bg1: 'rgba(139,148,158,0.5)', bg2: 'rgba(139,148,158,0.3)', borderColor: '#8b949e', pattern: 'none', conditionType: 'default', threshold: 0, reqText: '初始' },
    { id: 't1', name: '士兵', icon: '⚔️', color: '#ffffff', bg1: '#58a6ff', bg2: '#1f6feb', borderColor: '#58a6ff', pattern: 'gradient', conditionType: 'kills', threshold: 10, reqText: '击杀10人' },
    { id: 't2', name: '精英', icon: '🎯', color: '#ffffff', bg1: '#00cc66', bg2: '#00aa55', borderColor: '#00ff88', pattern: 'glow', conditionType: 'kills', threshold: 50, reqText: '击杀50人' },
    { id: 't3', name: '老兵', icon: '🔥', color: '#ffffff', bg1: '#ff6b6b', bg2: '#c92a2a', borderColor: '#ff6b6b', pattern: 'border', conditionType: 'kills', threshold: 100, reqText: '击杀100人' },
    { id: 't4', name: '战场之王', icon: '👑', color: '#ffeb85', bg1: '#ff8800', bg2: '#c92a2a', borderColor: '#ffaa00', pattern: 'shimmer', conditionType: 'kills', threshold: 200, reqText: '击杀200人' },
    { id: 't5', name: '传奇战神', icon: '💎', color: '#ffffff', bg1: '#d946ef', bg2: '#7c3aed', borderColor: '#d946ef', pattern: 'glow', conditionType: 'kills', threshold: 500, reqText: '击杀500人' }
];

const MEDAL_RARITY = {
    BRONZE: 'bronze',
    SILVER: 'silver',
    GOLD: 'gold',
    PLATINUM: 'platinum',
    DIAMOND: 'diamond'
};

const DEFAULT_MEDALS = [
    {
        id: 'first_blood',
        name: '初露锋芒',
        icon: '🩸',
        description: '累计击杀10名敌人',
        rarity: MEDAL_RARITY.BRONZE,
        conditionType: 'kills',
        threshold: 10,
        reward: { coins: 100 },
        hidden: false,
        order: 1
    },
    {
        id: 'seasoned_fighter',
        name: '百战老兵',
        icon: '⚔️',
        description: '累计击杀100名敌人',
        rarity: MEDAL_RARITY.SILVER,
        conditionType: 'kills',
        threshold: 100,
        reward: { coins: 500 },
        hidden: false,
        order: 2
    },
    {
        id: 'legendary_soldier',
        name: '传奇战士',
        icon: '👑',
        description: '累计击杀1000名敌人',
        rarity: MEDAL_RARITY.DIAMOND,
        conditionType: 'kills',
        threshold: 1000,
        reward: { coins: 5000 },
        hidden: false,
        order: 3
    },
    {
        id: 'wealthy',
        name: '小有积蓄',
        icon: '💰',
        description: '拥有金币达到1000',
        rarity: MEDAL_RARITY.BRONZE,
        conditionType: 'coins',
        threshold: 1000,
        reward: { coins: 100 },
        hidden: false,
        order: 4
    },
    {
        id: 'millionaire',
        name: '腰缠万贯',
        icon: '🏦',
        description: '拥有金币达到10000',
        rarity: MEDAL_RARITY.GOLD,
        conditionType: 'coins',
        threshold: 10000,
        reward: { coins: 1000 },
        hidden: false,
        order: 5
    },
    {
        id: 'survivor',
        name: '生存专家',
        icon: '🛡️',
        description: '累计游玩时间超过1小时',
        rarity: MEDAL_RARITY.SILVER,
        conditionType: 'playtime',
        threshold: 3600,
        reward: { coins: 300 },
        hidden: false,
        order: 6
    },
    {
        id: 'sharp_shooter',
        name: '神枪手',
        icon: '🎯',
        description: 'K/D 达到3.0',
        rarity: MEDAL_RARITY.GOLD,
        conditionType: 'kd',
        threshold: 3.0,
        reward: { coins: 800 },
        hidden: false,
        order: 7
    },
    {
        id: 'mission_accomplished',
        name: '任务达人',
        icon: '📋',
        description: '累计完成10个任务',
        rarity: MEDAL_RARITY.SILVER,
        conditionType: 'missions',
        threshold: 10,
        reward: { coins: 400 },
        hidden: false,
        order: 8
    },
    {
        id: 'lucky_draw',
        name: '幸运儿',
        icon: '🎰',
        description: '累计抽奖100次',
        rarity: MEDAL_RARITY.GOLD,
        conditionType: 'lotteryDraws',
        threshold: 100,
        reward: { coins: 1000 },
        hidden: false,
        order: 9
    },
    {
        id: 'jackpot',
        name: ' Jackpot！',
        icon: '💎',
        description: '抽奖获得传说品质奖励',
        rarity: MEDAL_RARITY.PLATINUM,
        conditionType: 'legendaryOwned',
        threshold: 1,
        reward: { coins: 2000 },
        hidden: false,
        order: 10
    }
];

let medals = [];
let unlockedMedalIds = new Set();

function loadMedals() {
    try {
        const raw = localStorage.getItem('deathTrench_medals');
        if (raw) {
            const saved = JSON.parse(raw);
            medals = Array.isArray(saved.medals) ? saved.medals : JSON.parse(JSON.stringify(DEFAULT_MEDALS));
            unlockedMedalIds = new Set(Array.isArray(saved.unlockedIds) ? saved.unlockedIds : []);
        } else {
            medals = JSON.parse(JSON.stringify(DEFAULT_MEDALS));
            unlockedMedalIds = new Set();
        }
    } catch (e) {
        medals = JSON.parse(JSON.stringify(DEFAULT_MEDALS));
        unlockedMedalIds = new Set();
    }
}

function saveMedals() {
    try {
        localStorage.setItem('deathTrench_medals', JSON.stringify({
            medals,
            unlockedIds: Array.from(unlockedMedalIds),
            version: 1
        }));
    } catch (e) {}
}

function checkMedalCondition(m) {
    if (!m) return false;
    const kills = playerData.totalKills || 0;
    const coins = playerData.coins || 0;
    const playtime = playerData.playTimeSeconds || 0;
    const deaths = playerData.totalDeaths || 0;
    const kd = deaths > 0 ? (kills / deaths) : kills;
    const missions = (typeof completedMissionIds !== 'undefined' && completedMissionIds) ? completedMissionIds.length : 0;
    const draws = lotteryData.totalDraws || 0;
    const legendary = lotteryData.totalRewards ? (lotteryData.totalRewards.legendary || 0) : 0;

    switch (m.conditionType) {
        case 'kills': return kills >= (m.threshold || 0);
        case 'coins': return coins >= (m.threshold || 0);
        case 'playtime': return playtime >= (m.threshold || 0);
        case 'kd': return kd >= (m.threshold || 0);
        case 'missions': return missions >= (m.threshold || 0);
        case 'lotteryDraws': return draws >= (m.threshold || 0);
        case 'legendaryOwned': return legendary >= (m.threshold || 0);
        default: return false;
    }
}

function checkAllMedals() {
    const newlyUnlocked = [];
    for (const m of medals) {
        if (unlockedMedalIds.has(m.id)) continue;
        if (checkMedalCondition(m)) {
            unlockedMedalIds.add(m.id);
            newlyUnlocked.push(m);
            if (m.reward) {
                if (m.reward.coins) playerData.coins += m.reward.coins;
            }
        }
    }
    if (newlyUnlocked.length > 0) {
        saveMedals();
        savePlayerData();
        for (const m of newlyUnlocked) {
            showNotification(`🏅 解锁勋章：${m.icon} ${m.name}`, 'medal_unlock');
        }
    }
    return newlyUnlocked;
}

function isMedalUnlocked(id) {
    return unlockedMedalIds.has(id);
}

function getUnlockedMedals() {
    return medals.filter(m => unlockedMedalIds.has(m.id));
}

function getLockedMedals() {
    return medals.filter(m => !unlockedMedalIds.has(m.id) && !m.hidden);
}

function resetMedals() {
    unlockedMedalIds.clear();
    medals = JSON.parse(JSON.stringify(DEFAULT_MEDALS));
    saveMedals();
}

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
            const originalWeapons = WEAPONS;
            WEAPONS = params.WEAPONS.map(w => {
                const orig = originalWeapons.find(o => o.id === w.id);
                return {
                    ...w,
                    unlocked: orig ? orig.unlocked : (w.unlocked === true)
                };
            });
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
        if (params.MEDALS && Array.isArray(params.MEDALS) && params.MEDALS.length > 0) {
            medals = JSON.parse(JSON.stringify(params.MEDALS));
            saveMedals();
            console.log('[PARAMS] 已加载自定义勋章配置，共', medals.length, '个');
        }
        console.log('[PARAMS] 已加载自定义游戏参数');
    } catch (e) {
        console.warn('[PARAMS] 游戏参数加载失败，使用默认值', e);
    }
}

function applyMedalConfig(configList) {
    if (!Array.isArray(configList) || configList.length === 0) return { success: false, message: '配置为空' };
    medals = JSON.parse(JSON.stringify(configList));
    const newIds = new Set(medals.map(m => m.id));
    for (const id of Array.from(unlockedMedalIds)) {
        if (!newIds.has(id)) unlockedMedalIds.delete(id);
    }
    saveMedals();
    checkAllMedals();
    return { success: true, count: medals.length };
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

const AVATAR_CONFIG = {
    maxWidth: 256,
    maxHeight: 256,
    quality: 0.85,
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    maxFileSize: 2 * 1024 * 1024,
    defaultAvatar: '⚔️'
};

const REDEEM_CODES = [
    { code: '7S9K2P5G8', kills: 5, coins: 100 },
    { code: 'F4D7N3X2C', kills: 10, coins: 200 },
    { code: 'B8R2V5L9M', kills: 15, coins: 300 },
    { code: 'Q6T3Z7J4H', kills: 20, coins: 400 },
    { code: 'W2G9C5S7N', kills: 25, coins: 500 },
    { code: 'X5L8D2P6V', kills: 30, coins: 600 },
    { code: 'Z7J4M9R3K', kills: 35, coins: 700 },
    { code: 'H3P6B2T8F', kills: 40, coins: 800 },
    { code: 'N9V5Q7L2D', kills: 45, coins: 900 },
    { code: 'K2C8F4Z6J', kills: 50, coins: 1000 },
    { code: 'M7T3S9B5R', kills: 55, coins: 1100 },
    { code: 'P5D2H8V7Q', kills: 60, coins: 1200 },
    { code: 'R8J6N3C9W', kills: 65, coins: 1300 },
    { code: 'V4L9Z5T2X', kills: 70, coins: 1400 },
    { code: 'C7B2Q8M3S', kills: 75, coins: 1500 },
    { code: 'T3F5W7D9P', kills: 80, coins: 1600 },
    { code: 'L9X8R2J5H', kills: 85, coins: 1700 },
    { code: 'J2Z7M4N6B', kills: 90, coins: 1800 },
    { code: 'B5S3P9V8K', kills: 95, coins: 1900 },
    { code: 'D8Q2H7C4L', kills: 100, coins: 2000 },
    { code: 'F3N5T9R6M', kills: 120, coins: 2200 },
    { code: 'G7V2B8S3Z', kills: 140, coins: 2400 },
    { code: 'H2C9L5Q7J', kills: 160, coins: 2600 },
    { code: 'K5M8Z3P6D', kills: 180, coins: 2800 },
    { code: 'L9R4F7V2N', kills: 200, coins: 3000 },
    { code: 'M3P6X9B5T', kills: 220, coins: 3200 },
    { code: 'N7J2D8S4Q', kills: 240, coins: 3400 },
    { code: 'P2V5R9C7H', kills: 260, coins: 3600 },
    { code: 'Q5B8T3Z6F', kills: 280, coins: 3800 },
    { code: 'R9S4M7L2K', kills: 300, coins: 4000 },
    { code: 'S3D7N2X5V', kills: 310, coins: 4150 },
    { code: 'T8F2G5L9C', kills: 320, coins: 4300 },
    { code: 'V4H9Q7J3P', kills: 330, coins: 4450 },
    { code: 'W7K2B5M8R', kills: 340, coins: 4600 },
    { code: 'X2L5Z9S4D', kills: 350, coins: 4750 },
    { code: 'Y5M8C3V7F', kills: 360, coins: 4900 },
    { code: 'Z9N4P7T2H', kills: 370, coins: 5050 },
    { code: 'A3Q6R2L9K', kills: 380, coins: 5200 },
    { code: 'B7S2D5J8M', kills: 390, coins: 5350 },
    { code: 'C2T9F7V3N', kills: 400, coins: 5500 },
    { code: 'D5V4H9P6R', kills: 410, coins: 5650 },
    { code: 'E9W7K2C5S', kills: 420, coins: 5800 },
    { code: 'F3X2L5M8T', kills: 430, coins: 5950 },
    { code: 'G7Y5N9Q3V', kills: 440, coins: 6100 },
    { code: 'H2Z8P7B4D', kills: 450, coins: 6250 },
    { code: 'I5A3R9S7F', kills: 460, coins: 6400 },
    { code: 'J9B6T2L5H', kills: 470, coins: 6550 },
    { code: 'K3C2V5M8Q', kills: 480, coins: 6700 },
    { code: 'L7D9N7J3P', kills: 490, coins: 6850 },
    { code: 'M2E5F9R6K', kills: 500, coins: 7000 },
    { code: 'N5G8H3S7B', kills: 510, coins: 7150 },
    { code: 'P9H4J7T2C', kills: 520, coins: 7300 },
    { code: 'Q3J2K5V8D', kills: 530, coins: 7450 },
    { code: 'R7K5L9P3F', kills: 540, coins: 7600 },
    { code: 'S2L8M7Q6H', kills: 550, coins: 7750 },
    { code: 'T5M3N9R2V', kills: 560, coins: 7900 },
    { code: 'U9N6P2S5K', kills: 570, coins: 8050 },
    { code: 'V3P2Q5T8L', kills: 580, coins: 8200 },
    { code: 'W7Q5R9V3M', kills: 590, coins: 8350 },
    { code: 'X2R8S7B6N', kills: 600, coins: 8500 },
    { code: 'Y5S3T9C2P', kills: 620, coins: 8700 },
    { code: 'Z9T6V2D5J', kills: 640, coins: 8900 },
    { code: 'A3U2W5F8R', kills: 660, coins: 9100 },
    { code: 'B7W5X9G3L', kills: 680, coins: 9300 },
    { code: 'C2X8Y7H6M', kills: 700, coins: 9500 },
    { code: 'D5Y3Z9J2N', kills: 720, coins: 9700 },
    { code: 'E9Z6A2K5P', kills: 740, coins: 9900 },
    { code: 'F3A2B5L8Q', kills: 760, coins: 10100 },
    { code: 'G7B5C9M3R', kills: 780, coins: 10300 },
    { code: 'H2C8D7N6S', kills: 800, coins: 10500 },
    { code: 'I5D3E9P2T', kills: 820, coins: 10700 },
    { code: 'J9E6F2Q5V', kills: 840, coins: 10900 },
    { code: 'K3F2G5R8W', kills: 860, coins: 11100 },
    { code: 'L7G5H9S3X', kills: 880, coins: 11300 },
    { code: 'M2H8I7T6Y', kills: 900, coins: 11500 },
    { code: 'N5I3J9U2Z', kills: 920, coins: 11700 },
    { code: 'P9J6K2V5A', kills: 940, coins: 11900 },
    { code: 'Q3K2L5W8B', kills: 960, coins: 12100 },
    { code: 'R7L5M9X3C', kills: 980, coins: 12300 },
    { code: 'S2M8N7Y6D', kills: 1000, coins: 12500 },
    { code: 'T5N3P9Z2E', kills: 1030, coins: 12750 },
    { code: 'U9P6Q2A5F', kills: 1060, coins: 13000 },
    { code: 'V3Q2R5B8G', kills: 1090, coins: 13250 },
    { code: 'W7R5S9C3H', kills: 1120, coins: 13500 },
    { code: 'X2S8T7D6I', kills: 1150, coins: 13750 },
    { code: 'Y5T3U9E2J', kills: 1180, coins: 14000 },
    { code: 'Z9U6V2F5K', kills: 1210, coins: 14250 },
    { code: 'A3V2W5G8L', kills: 1240, coins: 14500 },
    { code: 'B7W5X9H3M', kills: 1270, coins: 14750 },
    { code: 'C2X8Y7I6N', kills: 1300, coins: 15000 },
    { code: 'D5Y3Z9J2P', kills: 1340, coins: 15300 },
    { code: 'E9Z6A2K5Q', kills: 1380, coins: 15600 },
    { code: 'F3A2B5L8R', kills: 1420, coins: 15900 },
    { code: 'G7B5C9M3S', kills: 1460, coins: 16200 },
    { code: 'H2C8D7N6T', kills: 1500, coins: 16500 },
    { code: 'I5D3E9P2V', kills: 1550, coins: 16850 },
    { code: 'J9E6F2Q5W', kills: 1600, coins: 17200 },
    { code: 'K3F2G5R8X', kills: 1650, coins: 17550 },
    { code: 'L7G5H9S3Y', kills: 1700, coins: 17900 },
    { code: 'M2H8I7T6Z', kills: 1750, coins: 18250 },
    { code: 'N5I3J9U2A', kills: 1800, coins: 18600 },
    { code: 'P9J6K2V5B', kills: 1860, coins: 19000 },
    { code: 'Q3K2L5W8C', kills: 1920, coins: 19400 },
    { code: 'R7L5M9X3D', kills: 1980, coins: 19800 },
    { code: 'S2M8N7Y6E', kills: 2050, coins: 20250 }
];

let playerData = {
    playerName: '战壕战士',
    coins: 1000,
    totalKills: 0,
    totalDeaths: 0,
    totalScore: 0,
    playTimeSeconds: 0,
    title: '新兵',
    equippedArmor: '',
    selectedMap: 'desert',
    avatar: {
        source: 'default', // 'default' | 'file' | 'url'
        dataUrl: '',
        fileName: '',
        updatedAt: 0
    },
    inventory: {
        medkits: 3,
        armor_light: 0,
        armor_heavy: 0,
        grenades: 2,
        ammoBox: 5,
        speedBoost: 1
    },
    backpack: {
        capacity: 36,
        items: []
    },
    redeemedCodes: []
};

function loadPlayerData() {
    try {
        const raw = localStorage.getItem('deathTrench_player');
        if (raw) {
            const parsed = JSON.parse(raw);

            // 新版签名格式：{ data, sig, ts }
            if (parsed && parsed.data && parsed.sig !== undefined) {
                const valid = AntiCheat.verifyPlayerDataSync(parsed.data, parsed.sig);
                if (!valid) {
                    AntiCheat.flagSuspicious('player_data_signature_invalid');
                    showNotification('检测到存档数据异常，已拒绝加载');
                    return;
                }
                Object.assign(playerData, parsed.data);
            } else {
                // 旧版无签名格式：直接迁移
                Object.assign(playerData, parsed);
            }
        }

        // 兼容旧版 / 面板使用的 deathTrench_playerData，合并关键字段
        const legacyRaw = localStorage.getItem('deathTrench_playerData');
        if (legacyRaw) {
            const legacy = JSON.parse(legacyRaw);
            const legacyFields = ['equippedWeapons', 'ammo', 'ownedSkins', 'equippedSkin', 'weaponAmmoSlots'];
            for (const key of legacyFields) {
                if (legacy[key] !== undefined && playerData[key] === undefined) {
                    playerData[key] = legacy[key];
                }
            }
        }

        savePlayerData();
        AntiCheat.recordPlayerSnapshot(playerData);
    } catch (e) {}
}

function savePlayerData() {
    try {
        const snapshot = AntiCheat.getLastSnapshot();
        const anomaly = AntiCheat.detectAnomaly(snapshot, playerData);
        if (anomaly.anomaly) {
            AntiCheat.flagSuspicious('anomaly_' + anomaly.reason);
            showNotification('检测到数据异常变动：' + anomaly.reason);
        }

        const signed = AntiCheat.signPlayerDataSync(playerData);
        localStorage.setItem('deathTrench_player', JSON.stringify(signed));
        AntiCheat.recordPlayerSnapshot(playerData);

        // 同步一份无签名的 legacy 数据到 deathTrench_playerData，供旧版面板兼容读取
        const legacy = JSON.parse(localStorage.getItem('deathTrench_playerData') || '{}');
        const syncFields = ['playerName', 'coins', 'totalKills', 'totalDeaths', 'totalScore', 'playTimeSeconds', 'title', 'equippedArmor', 'selectedMap', 'avatar', 'inventory', 'backpack', 'equippedWeapons', 'ammo', 'ownedSkins', 'equippedSkin', 'weaponAmmoSlots'];
        for (const key of syncFields) {
            if (playerData[key] !== undefined) legacy[key] = playerData[key];
        }
        localStorage.setItem('deathTrench_playerData', JSON.stringify(legacy));
    } catch (e) {}
}

function loadSettings() {
    try {
        const raw = localStorage.getItem('deathTrench_settings');
        if (!raw) return;
        const saved = JSON.parse(raw);
        if (saved.difficulty) settings.difficulty = saved.difficulty;
        if (typeof saved.playerSpeed === 'number') settings.playerSpeed = Math.max(50, Math.min(200, saved.playerSpeed));
        if (typeof saved.fireRate === 'number') settings.fireRate = Math.max(50, Math.min(200, saved.fireRate));
    } catch (e) {}
}

function saveSettings() {
    try {
        localStorage.setItem('deathTrench_settings', JSON.stringify({
            difficulty: settings.difficulty,
            playerSpeed: settings.playerSpeed,
            fireRate: settings.fireRate
        }));
    } catch (e) {}
}

const AvatarManager = (() => {
    let cropState = { startX: 0, startY: 0, size: 0 };

    function getAvatarHtml(sizeClass) {
        const avatar = playerData.avatar || { source: 'default' };
        if (avatar.source !== 'default' && avatar.dataUrl) {
            return `<img src="${avatar.dataUrl}" class="${sizeClass || 'avatar-img'}" alt="头像" onerror="this.style.display='none'">`;
        }
        return `<div class="${sizeClass || 'avatar-default'}">${AVATAR_CONFIG.defaultAvatar}</div>`;
    }

    function getAvatarStyleUrl() {
        const avatar = playerData.avatar || {};
        if (avatar.source !== 'default' && avatar.dataUrl) {
            return `url('${avatar.dataUrl}')`;
        }
        return null;
    }

    async function validateImageFile(file) {
        if (!file) return { success: false, reason: 'no_file' };
        if (!AVATAR_CONFIG.allowedTypes.includes(file.type)) {
            return { success: false, reason: 'invalid_type', message: '仅支持 JPG/PNG/WebP/GIF 格式' };
        }
        if (file.size > AVATAR_CONFIG.maxFileSize) {
            return { success: false, reason: 'too_large', message: '文件大小不能超过 2MB' };
        }
        return { success: true, file };
    }

    function readFileAsDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('读取文件失败'));
            reader.readAsDataURL(file);
        });
    }

    function loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('图片加载失败'));
            img.src = src;
        });
    }

    function resizeAndCropToSquare(img, maxSize) {
        const canvas = document.createElement('canvas');
        const size = Math.min(img.width, img.height, maxSize);
        canvas.width = size;
        canvas.height = size;

        const sx = (img.width - size) / 2;
        const sy = (img.height - size) / 2;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, sx, sy, size, size, 0, 0, size, size);

        return canvas.toDataURL('image/jpeg', AVATAR_CONFIG.quality);
    }

    async function processFile(file) {
        const validation = await validateImageFile(file);
        if (!validation.success) return validation;

        try {
            const dataUrl = await readFileAsDataUrl(file);
            const img = await loadImage(dataUrl);
            const processed = resizeAndCropToSquare(img, AVATAR_CONFIG.maxWidth);
            return { success: true, dataUrl: processed, originalName: file.name };
        } catch (e) {
            return { success: false, reason: 'process_error', message: e.message };
        }
    }

    function setAvatar(dataUrl, fileName) {
        playerData.avatar = {
            source: dataUrl ? 'file' : 'default',
            dataUrl: dataUrl || '',
            fileName: fileName || '',
            updatedAt: Date.now()
        };
        savePlayerData();
        updateAvatarDisplay();
        if (window.electronAPI && window.electronAPI.dataCenter) {
            window.electronAPI.dataCenter.updatePlayer({ avatar: playerData.avatar });
        }
        return { success: true };
    }

    function resetAvatar() {
        return setAvatar('', '');
    }

    function openAvatarEditor() {
        if (!isDevToolsEnabled()) {
            showNotification('游玩版仅支持本地文件头像，请在设置中选择头像文件');
            openFileAvatarPicker();
            return;
        }
        const modal = document.getElementById('avatarEditorModal') || createAvatarEditorModal();
        modal.style.display = 'flex';
        UIAnimator.showPanel(modal, { display: 'flex' });
    }

    function createAvatarEditorModal() {
        const modal = document.createElement('div');
        modal.id = 'avatarEditorModal';
        modal.className = 'modal-overlay';
        modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:9999;display:none;justify-content:center;align-items:center;';
        modal.innerHTML = `
            <div class="panel" style="max-width:420px;width:90%;padding:24px;">
                <h3 style="margin-bottom:16px;">自定义头像</h3>
                <div id="avatarPreviewArea" style="width:200px;height:200px;margin:0 auto 16px;background:#1a1d24;border-radius:12px;overflow:hidden;display:flex;align-items:center;justify-content:center;">
                    <span style="font-size:64px;">⚔️</span>
                </div>
                <input type="file" id="avatarFileInput" accept="image/jpeg,image/png,image/webp,image/gif" style="display:none;">
                <div style="display:flex;gap:10px;justify-content:center;margin-bottom:16px;">
                    <button class="menu-btn" onclick="AvatarManager.pickFile()">选择图片</button>
                    <button class="menu-btn tertiary" onclick="AvatarManager.resetAndClose()">恢复默认</button>
                </div>
                <div id="avatarEditHint" style="text-align:center;color:#8b949e;font-size:12px;margin-bottom:16px;">支持 JPG/PNG/WebP/GIF，最大 2MB</div>
                <div style="display:flex;gap:10px;justify-content:flex-end;">
                    <button class="menu-btn tertiary" onclick="AvatarManager.closeEditor()">取消</button>
                    <button class="menu-btn" id="avatarConfirmBtn" onclick="AvatarManager.confirmAvatar()" disabled>确认使用</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const input = modal.querySelector('#avatarFileInput');
        input.addEventListener('change', (e) => handleFileSelection(e.target.files[0]));

        return modal;
    }

    async function pickFile() {
        const input = document.getElementById('avatarFileInput');
        if (input) input.click();
    }

    let pendingAvatar = null;

    async function handleFileSelection(file) {
        const previewArea = document.getElementById('avatarPreviewArea');
        const confirmBtn = document.getElementById('avatarConfirmBtn');
        const hint = document.getElementById('avatarEditHint');
        if (!file || !previewArea) return;

        const result = await processFile(file);
        if (!result.success) {
            if (hint) hint.textContent = result.message || '处理失败';
            if (confirmBtn) confirmBtn.disabled = true;
            return;
        }

        pendingAvatar = { dataUrl: result.dataUrl, fileName: result.originalName || file.name };
        previewArea.innerHTML = `<img src="${pendingAvatar.dataUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:12px;">`;
        if (hint) hint.textContent = '已自动裁剪为正方形，点击确认使用';
        if (confirmBtn) confirmBtn.disabled = false;
    }

    function confirmAvatar() {
        if (!pendingAvatar) return;
        setAvatar(pendingAvatar.dataUrl, pendingAvatar.fileName);
        pendingAvatar = null;
        closeEditor();
        showNotification('头像已更新');
    }

    function resetAndClose() {
        resetAvatar();
        closeEditor();
        showNotification('已恢复默认头像');
    }

    function closeEditor() {
        const modal = document.getElementById('avatarEditorModal');
        if (modal) UIAnimator.hidePanel(modal);
        pendingAvatar = null;
    }

    function openFileAvatarPicker() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/jpeg,image/png,image/webp,image/gif';
        input.style.display = 'none';
        input.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const result = await processFile(file);
            if (result.success) {
                setAvatar(result.dataUrl, file.name);
                showNotification('头像已更新');
            } else {
                showNotification(result.message || '头像设置失败');
            }
        });
        document.body.appendChild(input);
        input.click();
        setTimeout(() => { if (input.parentNode) input.remove(); }, 5000);
    }

    function updateAvatarDisplay() {
        const avatar = playerData.avatar || { source: 'default' };
        const html = avatar.source !== 'default' && avatar.dataUrl
            ? `<img src="${avatar.dataUrl}" class="avatar-img" alt="头像">`
            : `<div class="avatar-default">${AVATAR_CONFIG.defaultAvatar}</div>`;

        document.querySelectorAll('.lobby-avatar, .pi-avatar').forEach(el => {
            el.innerHTML = html;
            el.classList.add('has-avatar');
        });

        document.querySelectorAll('.mini-avatar').forEach(el => {
            el.innerHTML = avatar.source !== 'default' && avatar.dataUrl
                ? `<img src="${avatar.dataUrl}" class="mini-avatar-img" alt="">`
                : AVATAR_CONFIG.defaultAvatar;
        });
    }

    function isDevToolsEnabled() {
        return typeof ENABLE_TOOLS !== 'undefined' && ENABLE_TOOLS === true;
    }

    return {
        getAvatarHtml,
        getAvatarStyleUrl,
        processFile,
        setAvatar,
        resetAvatar,
        openAvatarEditor,
        closeEditor,
        pickFile,
        confirmAvatar,
        resetAndClose,
        updateAvatarDisplay,
        isDevToolsEnabled,
        openFileAvatarPicker
    };
})();

const ITEM_TYPES = {
    CONSUMABLE: 'consumable',   // 医疗包、手雷等可消耗
    AMMO: 'ammo',               // 弹药
    MATERIAL: 'material',       // 摸金材料
    WEAPON: 'weapon',           // 武器
    ARMOR: 'armor',             // 护甲
    MOD: 'mod',                 // 改装配件
    SKIN: 'skin',               // 皮肤
    CURRENCY: 'currency',       // 货币
    QUEST: 'quest'              // 任务物品
};

const ITEM_RARITY = {
    COMMON: 'common',
    UNCOMMON: 'uncommon',
    RARE: 'rare',
    EPIC: 'epic',
    LEGENDARY: 'legendary'
};

const DEFAULT_ITEM_REGISTRY = {
    medkit: {
        id: 'medkit',
        name: '医疗包',
        icon: '💊',
        type: ITEM_TYPES.CONSUMABLE,
        rarity: ITEM_RARITY.UNCOMMON,
        stackable: true,
        maxStack: 10,
        weight: 1,
        description: '回复一定生命值',
        usableInRaid: true,
        effect: { heal: 50 }
    },
    grenade: {
        id: 'grenade',
        name: '手雷',
        icon: '💣',
        type: ITEM_TYPES.CONSUMABLE,
        rarity: ITEM_RARITY.RARE,
        stackable: true,
        maxStack: 5,
        weight: 2,
        description: '投掷造成范围伤害',
        usableInRaid: true,
        effect: { damage: 120, radius: 4 }
    },
    ammoBox: {
        id: 'ammoBox',
        name: '弹药箱',
        icon: '📦',
        type: ITEM_TYPES.AMMO,
        rarity: ITEM_RARITY.COMMON,
        stackable: true,
        maxStack: 20,
        weight: 1,
        description: '补充普通弹药',
        usableInRaid: true,
        effect: { ammoNormal: 50 }
    },
    speedBoost: {
        id: 'speedBoost',
        name: '加速针剂',
        icon: '⚡',
        type: ITEM_TYPES.CONSUMABLE,
        rarity: ITEM_RARITY.RARE,
        stackable: true,
        maxStack: 5,
        weight: 1,
        description: '短时间内提升移动速度',
        usableInRaid: true,
        effect: { speedMultiplier: 1.5, duration: 30000 }
    },
    armor_light: {
        id: 'armor_light',
        name: '轻型护甲',
        icon: '🦺',
        type: ITEM_TYPES.ARMOR,
        rarity: ITEM_RARITY.UNCOMMON,
        stackable: false,
        maxStack: 1,
        weight: 5,
        description: '提供基础防护',
        usableInRaid: false,
        effect: { damageReduction: 0.15 }
    },
    armor_heavy: {
        id: 'armor_heavy',
        name: '重型护甲',
        icon: '🛡️',
        type: ITEM_TYPES.ARMOR,
        rarity: ITEM_RARITY.RARE,
        stackable: false,
        maxStack: 1,
        weight: 10,
        description: '提供强力防护但降低移动速度',
        usableInRaid: false,
        effect: { damageReduction: 0.35, speedPenalty: 0.1 }
    },
    copper_wire: {
        id: 'copper_wire',
        name: '铜线',
        icon: '🔌',
        type: ITEM_TYPES.MATERIAL,
        rarity: ITEM_RARITY.COMMON,
        stackable: true,
        maxStack: 50,
        weight: 0.2,
        description: '常见电子材料',
        usableInRaid: false
    },
    circuit_board: {
        id: 'circuit_board',
        name: '电路板',
        icon: '🧩',
        type: ITEM_TYPES.MATERIAL,
        rarity: ITEM_RARITY.UNCOMMON,
        stackable: true,
        maxStack: 20,
        weight: 0.5,
        description: '中等价值电子元件',
        usableInRaid: false
    },
    gold_watch: {
        id: 'gold_watch',
        name: '金表',
        icon: '⌚',
        type: ITEM_TYPES.MATERIAL,
        rarity: ITEM_RARITY.EPIC,
        stackable: true,
        maxStack: 5,
        weight: 0.3,
        description: '高价值战利品',
        usableInRaid: false
    },
    classified_docs: {
        id: 'classified_docs',
        name: '机密文件',
        icon: '📁',
        type: ITEM_TYPES.MATERIAL,
        rarity: ITEM_RARITY.LEGENDARY,
        stackable: true,
        maxStack: 1,
        weight: 0.1,
        description: '极其稀有的情报',
        usableInRaid: false
    }
};

let itemRegistry = JSON.parse(JSON.stringify(DEFAULT_ITEM_REGISTRY));

function loadItemRegistry() {
    try {
        const raw = localStorage.getItem('deathTrench_item_registry');
        if (raw) itemRegistry = JSON.parse(raw);
    } catch (e) { itemRegistry = JSON.parse(JSON.stringify(DEFAULT_ITEM_REGISTRY)); }
}

function saveItemRegistry() {
    try { localStorage.setItem('deathTrench_item_registry', JSON.stringify(itemRegistry)); }
    catch (e) {}
}

function applyItemRegistry(config) {
    if (!config || typeof config !== 'object') return { success: false, message: '无效配置' };
    itemRegistry = JSON.parse(JSON.stringify(config));
    saveItemRegistry();
    return { success: true, count: Object.keys(itemRegistry).length };
}

function getItemDef(itemId) {
    return itemRegistry[itemId] || DEFAULT_ITEM_REGISTRY[itemId] || null;
}

const BackpackManager = (() => {
    function getBackpack() {
        if (!playerData.backpack) {
            playerData.backpack = { capacity: 36, items: [] };
        }
        if (!Array.isArray(playerData.backpack.items)) {
            playerData.backpack.items = [];
        }
        return playerData.backpack;
    }

    function save() {
        savePlayerData();
        if (window.electronAPI && window.electronAPI.dataCenter) {
            window.electronAPI.dataCenter.updatePlayer({ backpack: getBackpack() });
        }
    }

    function getUsedCapacity() {
        const bp = getBackpack();
        return bp.items.reduce((sum, slot) => sum + (slot.count || 0), 0);
    }

    function getRemainingCapacity() {
        return getBackpack().capacity - getUsedCapacity();
    }

    function findStackSlot(itemId) {
        const def = getItemDef(itemId);
        if (!def || !def.stackable) return -1;
        const bp = getBackpack();
        return bp.items.findIndex(slot => slot.itemId === itemId && (slot.count || 0) < def.maxStack);
    }

    function addItem(itemId, count = 1, metadata) {
        const def = getItemDef(itemId);
        if (!def) return { success: false, reason: 'unknown_item', message: '未知物品: ' + itemId };
        if (count <= 0) return { success: false, reason: 'invalid_count' };

        const bp = getBackpack();
        let remaining = count;

        if (def.stackable) {
            let slotIdx = findStackSlot(itemId);
            while (remaining > 0 && slotIdx !== -1) {
                const slot = bp.items[slotIdx];
                const canAdd = Math.min(remaining, def.maxStack - slot.count);
                slot.count += canAdd;
                remaining -= canAdd;
                if (remaining > 0) slotIdx = findStackSlot(itemId);
            }

            while (remaining > 0) {
                if (bp.items.length >= bp.capacity) {
                    save();
                    return { success: false, reason: 'capacity_full', added: count - remaining, remaining };
                }
                const canAdd = Math.min(remaining, def.maxStack);
                bp.items.push({ itemId, count: canAdd, metadata: metadata || null });
                remaining -= canAdd;
            }
        } else {
            for (let i = 0; i < count; i++) {
                if (bp.items.length >= bp.capacity) {
                    save();
                    return { success: false, reason: 'capacity_full', added: i, remaining: count - i };
                }
                bp.items.push({ itemId, count: 1, metadata: metadata || null });
            }
        }

        save();
        return { success: true, added: count, remaining: 0 };
    }

    function removeItem(itemId, count = 1) {
        const bp = getBackpack();
        let remaining = count;
        for (let i = bp.items.length - 1; i >= 0; i--) {
            if (bp.items[i].itemId !== itemId) continue;
            const slot = bp.items[i];
            if (slot.count > remaining) {
                slot.count -= remaining;
                remaining = 0;
                break;
            } else {
                remaining -= slot.count;
                bp.items.splice(i, 1);
            }
            if (remaining <= 0) break;
        }
        save();
        return { success: remaining <= 0, removed: count - remaining, remaining };
    }

    function getItemCount(itemId) {
        return getBackpack().items
            .filter(slot => slot.itemId === itemId)
            .reduce((sum, slot) => sum + (slot.count || 0), 0);
    }

    function hasItem(itemId, count = 1) {
        return getItemCount(itemId) >= count;
    }

    function useItem(itemId, count = 1) {
        const def = getItemDef(itemId);
        if (!def) return { success: false, reason: 'unknown_item' };
        if (!hasItem(itemId, count)) return { success: false, reason: 'not_enough' };

        const result = removeItem(itemId, count);
        if (!result.success) return result;

        return { success: true, used: count, item: def };
    }

    function mergeStacks() {
        const bp = getBackpack();
        const groups = {};
        bp.items.forEach(slot => {
            if (!groups[slot.itemId]) groups[slot.itemId] = [];
            groups[slot.itemId].push(slot);
        });

        const merged = [];
        for (const itemId of Object.keys(groups)) {
            const def = getItemDef(itemId);
            if (!def || !def.stackable) {
                merged.push(...groups[itemId]);
                continue;
            }
            let total = groups[itemId].reduce((sum, s) => sum + (s.count || 0), 0);
            while (total > 0) {
                const chunk = Math.min(total, def.maxStack);
                merged.push({ itemId, count: chunk, metadata: null });
                total -= chunk;
            }
        }
        bp.items = merged.slice(0, bp.capacity);
        save();
        return { success: true };
    }

    function dropItem(itemId, count = 1) {
        return removeItem(itemId, count);
    }

    function sortItems(sortBy = 'type') {
        const bp = getBackpack();
        const typeOrder = { weapon: 0, armor: 1, consumable: 2, ammo: 3, material: 4, mod: 5, skin: 6, currency: 7, quest: 8 };
        bp.items.sort((a, b) => {
            const defA = getItemDef(a.itemId) || {};
            const defB = getItemDef(b.itemId) || {};
            if (sortBy === 'type') {
                const ta = typeOrder[defA.type] ?? 99;
                const tb = typeOrder[defB.type] ?? 99;
                if (ta !== tb) return ta - tb;
            }
            if (sortBy === 'rarity') {
                const rarityOrder = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 };
                const ra = rarityOrder[defA.rarity] ?? 0;
                const rb = rarityOrder[defB.rarity] ?? 0;
                if (ra !== rb) return rb - ra;
            }
            return (defA.name || '').localeCompare(defB.name || '');
        });
        save();
        return { success: true };
    }

    function setCapacity(capacity) {
        getBackpack().capacity = Math.max(1, Math.min(999, capacity));
        save();
    }

    function toLegacyInventory() {
        const legacy = { medkits: 0, armor_light: 0, armor_heavy: 0, grenades: 0, ammoBox: 0, speedBoost: 0 };
        for (const slot of getBackpack().items) {
            const def = getItemDef(slot.itemId);
            if (!def) continue;
            switch (slot.itemId) {
                case 'medkit': legacy.medkits += slot.count; break;
                case 'grenade': legacy.grenades += slot.count; break;
                case 'ammoBox': legacy.ammoBox += slot.count; break;
                case 'speedBoost': legacy.speedBoost += slot.count; break;
                case 'armor_light': legacy.armor_light += slot.count; break;
                case 'armor_heavy': legacy.armor_heavy += slot.count; break;
            }
        }
        return legacy;
    }

    function fromLegacyInventory(legacy) {
        if (!legacy) return;
        const bp = getBackpack();
        bp.items = [];
        for (const key of Object.keys(legacy)) {
            const count = legacy[key] || 0;
            if (count > 0) {
                const itemId = key === 'medkits' ? 'medkit'
                    : key === 'grenades' ? 'grenade'
                    : key === 'ammoBox' ? 'ammoBox'
                    : key === 'speedBoost' ? 'speedBoost'
                    : key;
                if (getItemDef(itemId)) addItem(itemId, count);
            }
        }
    }

    return {
        getBackpack,
        getUsedCapacity,
        getRemainingCapacity,
        addItem,
        removeItem,
        getItemCount,
        hasItem,
        useItem,
        mergeStacks,
        dropItem,
        sortItems,
        setCapacity,
        toLegacyInventory,
        fromLegacyInventory
    };
})();

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

// ==================== 改装系统函数 ====================

// 计算武器改装后的实际属性
function getModifiedWeapon(weapon) {
    if (!weapon) {
        console.warn('[MOD] getModifiedWeapon called with undefined weapon');
        return { damage: 0, fireRate: 1000, clipSize: 0, range: 0, id: 'unknown', name: '未知武器', icon: '❓' };
    }
    const equippedMods = (playerMods && playerMods.equippedMods) 
        ? (playerMods.equippedMods[weapon.id] || {}) 
        : {};
    let modified = { ...weapon };

    for (const [modId, isActive] of Object.entries(equippedMods)) {
        if (!isActive) continue;
        const mod = MODIFICATIONS[modId];
        if (!mod) continue;

        if (mod.effects.rangeBonus) modified.range = Math.round(modified.range * mod.effects.rangeBonus);
        if (mod.effects.damageBonus) modified.damage = Math.round(modified.damage * mod.effects.damageBonus);
        if (mod.effects.clipSizeBonus) modified.clipSize = Math.round(modified.clipSize * mod.effects.clipSizeBonus);
        if (mod.effects.fireRateBonus) modified.fireRate = Math.round(modified.fireRate * mod.effects.fireRateBonus);
        if (mod.effects.recoilReduction) modified.recoilReduction = mod.effects.recoilReduction;
    }

    return modified;
}

// 购买改装配件（数量制）
function buyMod(modId) {
    const mod = MODIFICATIONS[modId];
    if (!mod) return { success: false, message: '配件不存在' };

    if (playerData.coins < mod.price) return { success: false, message: '金币不足' };

    playerData.coins -= mod.price;
    playerMods.ownedMods[modId] = (playerMods.ownedMods[modId] || 0) + 1;
    savePlayerMods();
    updatePlayerStats();

    return { success: true, message: `获得 ${mod.name}！` };
}

// 装备/卸下改装配件（装配从库存扣，拆卸加回库存）
function toggleMod(weaponId, modId) {
    if (!playerMods.equippedMods[weaponId]) playerMods.equippedMods[weaponId] = {};
    const current = playerMods.equippedMods[weaponId][modId];

    if (!current) {
        // 装配：检查库存
        if (!playerMods.ownedMods[modId] || playerMods.ownedMods[modId] <= 0) {
            return { success: false, message: '库存不足' };
        }
        // 近战武器不能安装任何配件
        const weapon = WEAPONS.find(w => w.id === weaponId);
        if (weapon && (weapon.type === WEAPON_TYPES.MELEE || weapon.isMelee)) {
            return { success: false, message: '近战武器无法安装配件' };
        }
        // 霰弹枪和狙击枪不能装消音器
        if (weapon && (weapon.type === WEAPON_TYPES.SHOTGUN || weapon.type === WEAPON_TYPES.SNIPER) && modId === 'suppressor') {
            return { success: false, message: '该武器无法安装消音器' };
        }
        playerMods.ownedMods[modId]--;
        playerMods.equippedMods[weaponId][modId] = true;
    } else {
        // 拆卸：加回库存
        playerMods.ownedMods[modId] = (playerMods.ownedMods[modId] || 0) + 1;
        playerMods.equippedMods[weaponId][modId] = false;
    }
    savePlayerMods();

    const mod = MODIFICATIONS[modId];
    return { success: true, message: current ? `已卸下 ${mod.name}` : `已装备 ${mod.name}` };
}

// 保存改装数据
function savePlayerMods() {
    try {
        localStorage.setItem('deathTrench_player_mods', JSON.stringify(playerMods));
        localStorage.setItem('deathTrench_ammo_inventory', JSON.stringify(ammoInventory));
        localStorage.setItem('deathTrench_lottery_data', JSON.stringify(lotteryData));
        localStorage.setItem('deathTrench_lottery_weights', JSON.stringify(customLotteryWeights));
        localStorage.setItem('deathTrench_skin_bonuses', JSON.stringify(customSkinBonuses));
    } catch (e) {}
}

// 加载改装数据
function loadPlayerMods() {
    try {
        const raw = localStorage.getItem('deathTrench_player_mods');
        if (raw) {
            const saved = JSON.parse(raw);
            // 数据迁移：旧版 ownedMods 是数组，新版是对象
            if (Array.isArray(saved.ownedMods)) {
                const ownedObj = {};
                saved.ownedMods.forEach(modId => {
                    ownedObj[modId] = 1;
                });
                saved.ownedMods = ownedObj;
            }
            playerMods = Object.assign({}, playerMods, saved);
        }
        const ammoRaw = localStorage.getItem('deathTrench_ammo_inventory');
        if (ammoRaw) {
            const savedAmmo = JSON.parse(ammoRaw);
            ammoInventory = Object.assign({}, ammoInventory, savedAmmo);
        }
        const lotteryRaw = localStorage.getItem('deathTrench_lottery_data');
        if (lotteryRaw) {
            const savedLottery = JSON.parse(lotteryRaw);
            lotteryData = Object.assign({}, lotteryData, savedLottery);
            if (!lotteryData.totalRewards) lotteryData.totalRewards = { common: 0, rare: 0, epic: 0, legendary: 0 };
            if (!lotteryData.rewardHistory) lotteryData.rewardHistory = [];
        }
        const weightRaw = localStorage.getItem('deathTrench_lottery_weights');
        if (weightRaw) {
            customLotteryWeights = JSON.parse(weightRaw);
        }
        const skinBonusRaw = localStorage.getItem('deathTrench_skin_bonuses');
        if (skinBonusRaw) {
            customSkinBonuses = JSON.parse(skinBonusRaw);
        }

        loadItemRegistry();

        // 背包数据迁移：旧版使用 playerData.inventory 数字字段，新版使用 backpack.items 列表
        if (playerData.inventory && !playerData.backpack) {
            BackpackManager.fromLegacyInventory(playerData.inventory);
        } else if (playerData.backpack && playerData.backpack.items) {
            BackpackManager.mergeStacks();
        }
    } catch (e) {}
}

// ==================== 抽奖系统函数 ====================

let _lotteryInProgress = false;

async function drawLottery(count) {
    if (_lotteryInProgress) {
        showNotification('抽奖进行中，请稍候...');
        return null;
    }

    const price = count === 10 ? LOTTERY.tenPrice : LOTTERY.singlePrice * count;
    if (playerData.coins < price) {
        showNotification('金币不足！');
        return null;
    }

    _lotteryInProgress = true;
    const snapshot = DataBridge.getSnapshot();
    let lockAcquired = false;
    let results = [];
    let finalPity = lotteryData.pityCounter;

    try {
        const lockRes = await DataBridge.acquireLock();
        if (!lockRes || !lockRes.success) {
            showNotification('系统繁忙，请稍后再试');
            _lotteryInProgress = false;
            return null;
        }
        lockAcquired = true;

        await DataBridge.syncFromSource();

        if (playerData.coins < price) {
            showNotification('金币不足！');
            await DataBridge.rollback(snapshot);
            _lotteryInProgress = false;
            return null;
        }

        playerData.coins -= price;
        results = [];
        let curPity = lotteryData.pityCounter;

        for (let i = 0; i < count; i++) {
            curPity++;

            const activePool = getActiveLotteryPool();
            let pool = activePool;
            if (curPity >= LOTTERY.pityCount) {
                pool = activePool.filter(p => p.rarity !== 'common');
                curPity = 0;
            }

            const totalWeight = pool.reduce((sum, p) => sum + p.weight, 0);
            let random = Math.random() * totalWeight;
            let selected = pool[0];

            for (const item of pool) {
                random -= item.weight;
                if (random <= 0) {
                    selected = item;
                    break;
                }
            }

            applyLotteryReward(selected);
            results.push(selected);

            if (selected.rarity !== 'common') {
                curPity = 0;
            }
        }

        finalPity = curPity;

        const commitRes = await DataBridge.commitDraw({
            count: count,
            cost: price,
            finalPity: finalPity,
            results: results
        });

        if (!commitRes || !commitRes.success) {
            await DataBridge.rollback(snapshot);
            showNotification(commitRes?.reason || '抽奖失败，请重试');
            _lotteryInProgress = false;
            return null;
        }

        lotteryData.lastResults = results;
        savePlayerData();
        savePlayerMods();
        updatePlayerStats();

        return results;

    } catch (e) {
        console.error('[Lottery] error:', e);
        await DataBridge.rollback(snapshot);
        showNotification('抽奖异常：' + (e.message || '未知错误'));
        return null;
    } finally {
        if (lockAcquired) {
            await DataBridge.releaseLock();
        }
        _lotteryInProgress = false;
    }
}

function applyLotteryReward(item) {
    switch (item.type) {
        case 'gold':
        case 'coins':
            playerData.coins += item.value;
            break;
        case 'ammo':
            if (!playerData.ammo) playerData.ammo = {};
            playerData.ammo[item.ammoType] = (playerData.ammo[item.ammoType] || 0) + item.value;
            ammoInventory[item.ammoType] = (ammoInventory[item.ammoType] || 0) + item.value;
            break;
        case 'mod':
            playerMods.ownedMods[item.modId] = (playerMods.ownedMods[item.modId] || 0) + 1;
            break;
        case 'skin':
            if (!playerMods.ownedSkins.includes(item.skinId)) {
                playerMods.ownedSkins.push(item.skinId);
            }
            break;
        case 'playerSkin':
            if (!playerMods.ownedSkins.includes(item.skinId)) {
                playerMods.ownedSkins.push(item.skinId);
            }
            break;
        case 'weapon':
            // 解锁对应武器
            const weaponDef = WEAPONS.find(w => w.id === item.weaponId);
            if (weaponDef) {
                weaponDef.unlocked = true;
            }
            break;
        case 'item':
            if (!playerData.inventory) playerData.inventory = {};
            const itemMap = {
                medkit: 'medkits',
                grenade: 'grenades',
                ammo: 'ammoBox',
                speed: 'speedBoost'
            };
            const invKey = itemMap[item.itemId] || item.itemId;
            playerData.inventory[invKey] = (playerData.inventory[invKey] || 0) + item.value;
            // 同步到新背包系统
            const bpItemId = item.itemId === 'ammo' ? 'ammoBox' : item.itemId;
            if (getItemDef(bpItemId)) {
                BackpackManager.addItem(bpItemId, item.value || 1);
            }
            break;
    }
}

function getRarityColor(rarity) {
    const colors = {
        common: '#9ca3af',
        rare: '#3b82f6',
        epic: '#a855f7',
        legendary: '#f59e0b'
    };
    return colors[rarity] || '#9ca3af';
}

function getRarityName(rarity) {
    const names = {
        common: '普通',
        rare: '稀有',
        epic: '史诗',
        legendary: '传说'
    };
    return names[rarity] || '普通';
}

function showLotteryPanel() {
    hideAllPanels();
    ensureLobbyPanelsVisible();
    const panel = document.getElementById('lotteryPanel');
    if (panel) {
        panel.classList.add('active');
        UIAnimator.showPanel(panel);
    }
    hideLobbyBottom();
    renderLotteryUI();
}

function renderLotteryUI() {
    const goldEl = document.getElementById('lotteryGold');
    if (goldEl) goldEl.textContent = playerData.coins;

    const pityEl = document.getElementById('lotteryPity');
    if (pityEl) pityEl.textContent = lotteryData.pityCounter;

    const resultsContainer = document.getElementById('lotteryResults');
    if (!resultsContainer) return;

    if (lotteryData.lastResults.length === 0) {
        resultsContainer.innerHTML = '<div style="text-align:center;color:#8b949e;padding:40px;">点击下方按钮开始抽奖</div>';
        return;
    }

    let html = '<div class="lottery-results-grid">';
    lotteryData.lastResults.forEach((item, index) => {
        const color = getRarityColor(item.rarity);
        html += `
            <div class="lottery-result-item" style="border-color:${color}; animation-delay: ${index * 0.08}s;">
                <div class="lottery-result-icon">${item.icon}</div>
                <div class="lottery-result-name">${item.name}</div>
                <div class="lottery-result-rarity" style="color:${color}">${getRarityName(item.rarity)}</div>
            </div>
        `;
    });
    html += '</div>';
    resultsContainer.innerHTML = html;
}

async function doLottery(count) {
    const results = await drawLottery(count);
    if (results) {
        renderLotteryUI();
        showNotification(`🎰 抽奖完成！累计 ${lotteryData.totalDraws} 次，本次获得 ${count} 个奖励`, 'lottery');
    }
}

function showCumulativeRewards() {
    const overlay = document.getElementById('cumulativeRewardOverlay');
    if (!overlay) return;

    document.getElementById('totalDrawsCount').textContent = lotteryData.totalDraws;
    document.getElementById('countCommon').textContent = lotteryData.totalRewards.common;
    document.getElementById('countRare').textContent = lotteryData.totalRewards.rare;
    document.getElementById('countEpic').textContent = lotteryData.totalRewards.epic;
    document.getElementById('countLegendary').textContent = lotteryData.totalRewards.legendary;

    const historyList = document.getElementById('rewardHistoryList');
    if (!historyList) return;

    if (lotteryData.rewardHistory.length === 0) {
        historyList.innerHTML = '<div style="text-align:center;color:#8b949e;padding:20px;">暂无抽奖记录</div>';
    } else {
        let html = '';
        lotteryData.rewardHistory.forEach(item => {
            const color = getRarityColor(item.rarity);
            html += `
                <div style="display:flex; align-items:center; padding:8px; border-bottom:1px solid rgba(255,255,255,0.1);">
                    <div style="font-size:20px; margin-right:10px;">${item.icon}</div>
                    <div style="flex:1;">
                        <div style="color:${color}; font-weight:bold;">${item.name}</div>
                        <div style="font-size:11px; color:#888;">${item.time}</div>
                    </div>
                    <div style="color:${color}; font-size:12px;">${getRarityName(item.rarity)}</div>
                </div>
            `;
        });
        historyList.innerHTML = html;
    }

    UIAnimator.showPanel(overlay, { display: 'flex' });
}

function closeCumulativeRewards() {
    const overlay = document.getElementById('cumulativeRewardOverlay');
    if (overlay) UIAnimator.hidePanel(overlay);
}

// ==================== 皮肤系统函数 ====================

// 购买皮肤
function buySkin(skinId, type) {
    const skinList = type === 'weapon' ? SKINS.weapons : SKINS.players;
    const skin = skinList.find(s => s.id === skinId);
    if (!skin) return { success: false, message: '皮肤不存在' };
    if (playerMods.ownedSkins.includes(skinId)) return { success: false, message: '已拥有该皮肤' };

    if (playerData.coins < skin.price) return { success: false, message: '金币不足' };

    playerData.coins -= skin.price;
    playerMods.ownedSkins.push(skinId);
    savePlayerMods();
    updatePlayerStats();

    // 购买成功后刷新皮肤界面和预览
    renderSkinGrid();
    updateSkinPreview(skinId, type);
    updateSkinEquippedInfo();

    return { success: true, message: `获得 ${skin.name}皮肤！` };
}

// 装备皮肤
function equipSkin(skinId, type) {
    if (!playerMods.ownedSkins.includes(skinId)) return { success: false, message: '未拥有该皮肤' };

    if (type === 'weapon') {
        playerMods.equippedWeaponSkin = skinId;
    } else {
        playerMods.equippedPlayerSkin = skinId;
    }
    savePlayerMods();

    // 装备成功后刷新皮肤界面和预览
    renderSkinGrid();
    updateSkinPreview(skinId, type);
    updateSkinEquippedInfo();

    return { success: true, message: '皮肤已装备' };
}

// 更新皮肤预览显示
function updateSkinPreview(skinId, type) {
    const skinList = type === 'weapon' ? SKINS.weapons : SKINS.players;
    const skin = skinList.find(s => s.id === skinId);
    if (!skin) return;

    const previewContainer = document.getElementById('skinPreviewWeapon');
    const previewName = document.getElementById('skinPreviewName');
    if (!previewContainer) return;

    if (type === 'weapon') {
        // 武器皮肤预览 - 显示武器轮廓并应用颜色
        previewContainer.innerHTML = `
            <div class="weapon-silhouette" style="filter: drop-shadow(0 0 8px ${skin.color || '#4a5d23'});">
                <div class="ws-stock" style="background: ${skin.color || '#6366f1'};"></div>
                <div class="ws-body" style="background: ${skin.color || '#6366f1'};"></div>
                <div class="ws-barrel" style="background: ${skin.color || '#6366f1'};"></div>
                <div class="ws-magazine" style="background: ${skin.color || '#6366f1'};"></div>
                <div class="ws-grip" style="background: ${skin.color || '#6366f1'};"></div>
                <div class="ws-sight" style="background: ${skin.color || '#6366f1'};"></div>
            </div>
        `;
    } else {
        // 角色皮肤预览 - 显示角色图标
        previewContainer.innerHTML = `
            <div class="player-skin-preview" style="
                width: 80px;
                height: 80px;
                background: ${skin.color || '#00AA55'};
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 40px;
                box-shadow: 0 0 12px ${skin.color || '#00AA55'};
            ">👤</div>
        `;
    }

    if (previewName) {
        previewName.textContent = skin.name;
    }
}

// 获取当前皮肤颜色
function getPlayerSkinColor() {
    const skin = SKINS.players.find(s => s.id === playerMods.equippedPlayerSkin);
    return skin ? skin.color : '#00AA55';
}

// 获取武器皮肤样式
function getWeaponSkinStyle() {
    const skin = SKINS.weapons.find(s => s.id === playerMods.equippedWeaponSkin);
    if (!skin || !skin.color) return null;
    return { color: skin.color, pattern: skin.pattern || 'solid' };
}

// ==================== 弹药系统函数 ====================

// 获取弹药图标
function getAmmoIcon(ammoType) {
    const icons = {
        [AMMO_TYPES.NORMAL]: '🔵',
        [AMMO_TYPES.AP]: '🔴',
        [AMMO_TYPES.EXP]: '🟠',
        [AMMO_TYPES.FIRE]: '🔥'
    };
    return icons[ammoType] || '🔵';
}

// 获取弹药名称
function getAmmoName(ammoType) {
    const names = {
        [AMMO_TYPES.NORMAL]: '普通弹',
        [AMMO_TYPES.AP]: '穿甲弹',
        [AMMO_TYPES.EXP]: '爆破弹',
        [AMMO_TYPES.FIRE]: '燃烧弹'
    };
    return names[ammoType] || '普通弹';
}

// 检查并消耗弹药
function consumeAmmo(weapon, count = 1) {
    // 获取武器装备的弹药类型，如果没有则使用默认
    const equippedType = playerMods.equippedAmmoTypes?.[weapon.id];
    const ammoType = equippedType || weapon.ammoType || AMMO_TYPES.NORMAL;
    if (ammoInventory[ammoType] >= count) {
        ammoInventory[ammoType] -= count;
        return true;
    }
    // 如果专用弹药不足，消耗普通弹药
    if (ammoType !== AMMO_TYPES.NORMAL && ammoInventory[AMMO_TYPES.NORMAL] >= count) {
        ammoInventory[AMMO_TYPES.NORMAL] -= count;
        return true;
    }
    return false;
}

// 切换武器弹药类型
function switchWeaponAmmo(weaponId, ammoType) {
    if (!playerMods.equippedAmmoTypes) playerMods.equippedAmmoTypes = {};
    playerMods.equippedAmmoTypes[weaponId] = ammoType;
    savePlayerMods();
}

// 获取武器当前使用的弹药类型
function getWeaponAmmoType(weaponId) {
    const weapon = WEAPONS.find(w => w.id === weaponId);
    if (!weapon) return AMMO_TYPES.NORMAL;
    if (weapon.isMelee || weapon.type === WEAPON_TYPES.MELEE) return null;
    return playerMods.equippedAmmoTypes?.[weaponId] || weapon.ammoType || AMMO_TYPES.NORMAL;
}

// 补充弹药
function refillAmmo(ammoType, count) {
    if (ammoInventory[ammoType] !== undefined) {
        ammoInventory[ammoType] += count;
    }
}

// 弹药背包上限（开发版无上限）
const AMMO_BACKPACK_MAX = 20;
const AMMO_BACKPACK_SLOTS = 5;

// 弹药背包数据
let ammoBackpack = [
    { type: AMMO_TYPES.NORMAL, count: 0 },
    { type: AMMO_TYPES.AP, count: 0 },
    { type: AMMO_TYPES.EXP, count: 0 },
    { type: AMMO_TYPES.FIRE, count: 0 },
    { type: null, count: 0 }
];

let selectedAmmoSlotIndex = -1;

// 检查是否为开发版（无上限）
function isDevModeNoLimit() {
    return ENABLE_TOOLS;
}

// 获取弹药背包上限
function getAmmoBackpackLimit() {
    return isDevModeNoLimit() ? Infinity : AMMO_BACKPACK_MAX;
}

// 更新弹药背包显示
function updateAmmoBackpackDisplay() {
    const slots = document.querySelectorAll('#ammoBackpackSlots .ammo-slot');
    if (!slots) return;

    slots.forEach((slot, index) => {
        const ammo = ammoBackpack[index];
        const iconEl = slot.querySelector('.ammo-icon');
        const nameEl = slot.querySelector('.ammo-name');
        const countEl = slot.querySelector('.ammo-count');

        if (ammo.type) {
            iconEl.textContent = getAmmoIcon(ammo.type);
            nameEl.textContent = getAmmoName(ammo.type);
            countEl.textContent = ammo.count;
        } else {
            iconEl.textContent = '➕';
            nameEl.textContent = '空槽';
            countEl.textContent = '-';
        }

        slot.classList.toggle('selected', index === selectedAmmoSlotIndex);
    });
}

// 添加弹药到背包
function addAmmoToBackpack(ammoType, count) {
    const limit = getAmmoBackpackLimit();

    for (let i = 0; i < AMMO_BACKPACK_SLOTS; i++) {
        if (!ammoBackpack[i].type) {
            ammoBackpack[i].type = ammoType;
            ammoBackpack[i].count = Math.min(count, limit);
            count -= ammoBackpack[i].count;
        } else if (ammoBackpack[i].type === ammoType && ammoBackpack[i].count < limit) {
            const addAmount = Math.min(count, limit - ammoBackpack[i].count);
            ammoBackpack[i].count += addAmount;
            count -= addAmount;
        }
        if (count <= 0) break;
    }

    updateAmmoBackpackDisplay();
    saveAmmoBackpack();
}

// 同步弹药数据到各存储并刷新 UI
function syncAmmoUI() {
    try {
        if (!playerData.ammo) playerData.ammo = {};
        playerData.ammo[AMMO_TYPES.NORMAL] = ammoInventory[AMMO_TYPES.NORMAL] || 0;
        playerData.ammo[AMMO_TYPES.AP] = ammoInventory[AMMO_TYPES.AP] || 0;
        playerData.ammo[AMMO_TYPES.EXP] = ammoInventory[AMMO_TYPES.EXP] || 0;
        playerData.ammo[AMMO_TYPES.FIRE] = ammoInventory[AMMO_TYPES.FIRE] || 0;
        savePlayerData();

        const legacy = JSON.parse(localStorage.getItem('deathTrench_playerData') || '{}');
        legacy.ammo = { ...playerData.ammo };
        localStorage.setItem('deathTrench_playerData', JSON.stringify(legacy));

        renderAmmoBackpack();
        updateAmmoBackpackDisplay();
    } catch (e) {}
}

// 选择弹药槽
function selectAmmoSlot(index) {
    selectedAmmoSlotIndex = index;
    updateAmmoBackpackDisplay();
}

// 拆分弹药
function splitAmmo() {
    if (selectedAmmoSlotIndex < 0 || selectedAmmoSlotIndex >= 4) {
        showNotification('请先选择一个有弹药的槽位');
        return;
    }

    const sourceSlot = ammoBackpack[selectedAmmoSlotIndex];
    if (!sourceSlot.type || sourceSlot.count < 2) {
        showNotification('该槽位弹药不足，无法拆分');
        return;
    }

    // 找一个空槽或同类型槽
    let targetIndex = -1;
    for (let i = 0; i < AMMO_BACKPACK_SLOTS; i++) {
        if (i !== selectedAmmoSlotIndex) {
            if (!ammoBackpack[i].type) {
                targetIndex = i;
                break;
            } else if (ammoBackpack[i].type === sourceSlot.type && ammoBackpack[i].count < getAmmoBackpackLimit()) {
                targetIndex = i;
                break;
            }
        }
    }

    if (targetIndex < 0) {
        showNotification('没有可用的目标槽位');
        return;
    }

    const splitCount = Math.floor(sourceSlot.count / 2);
    sourceSlot.count -= splitCount;

    if (!ammoBackpack[targetIndex].type) {
        ammoBackpack[targetIndex].type = sourceSlot.type;
        ammoBackpack[targetIndex].count = splitCount;
    } else {
        ammoBackpack[targetIndex].count += splitCount;
    }

    // 应用上限
    if (!isDevModeNoLimit()) {
        ammoBackpack[targetIndex].count = Math.min(ammoBackpack[targetIndex].count, AMMO_BACKPACK_MAX);
    }

    updateAmmoBackpackDisplay();
    saveAmmoBackpack();
    showNotification(`拆分了 ${splitCount} 发弹药`);
}

// 合并弹药
function mergeAmmo() {
    if (selectedAmmoSlotIndex < 0 || selectedAmmoSlotIndex >= 4) {
        showNotification('请先选择一个槽位');
        return;
    }

    const sourceSlot = ammoBackpack[selectedAmmoSlotIndex];
    if (!sourceSlot.type || sourceSlot.count === 0) {
        showNotification('该槽位没有弹药');
        return;
    }

    // 找同类型的其他槽
    for (let i = 0; i < AMMO_BACKPACK_SLOTS; i++) {
        if (i !== selectedAmmoSlotIndex && ammoBackpack[i].type === sourceSlot.type) {
            const total = sourceSlot.count + ammoBackpack[i].count;
            const limit = getAmmoBackpackLimit();

            if (total <= limit) {
                ammoBackpack[i].count = total;
                sourceSlot.count = 0;
                sourceSlot.type = null;
                updateAmmoBackpackDisplay();
                saveAmmoBackpack();
                showNotification('弹药已合并');
                return;
            } else {
                const overflow = total - limit;
                ammoBackpack[i].count = limit;
                sourceSlot.count = overflow;
                updateAmmoBackpackDisplay();
                saveAmmoBackpack();
                showNotification(`合并完成，剩余 ${overflow} 发`);
                return;
            }
        }
    }

    showNotification('没有相同类型的弹药槽可合并');
}

// 保存弹药背包
function saveAmmoBackpack() {
    try {
        localStorage.setItem('deathTrench_ammo_backpack', JSON.stringify(ammoBackpack));
    } catch (e) {}
}

// 加载弹药背包
function loadAmmoBackpack() {
    try {
        const raw = localStorage.getItem('deathTrench_ammo_backpack');
        if (raw) {
            const saved = JSON.parse(raw);
            if (Array.isArray(saved)) {
                ammoBackpack = saved;
            }
        }
    } catch (e) {}
}

// 根据武器类型获取推荐弹药
function getRecommendedAmmo(weaponType) {
    switch (weaponType) {
        case WEAPON_TYPES.SNIPER:
        case WEAPON_TYPES.AR:
            return AMMO_TYPES.AP;
        case WEAPON_TYPES.SHOTGUN:
            return AMMO_TYPES.EXP;
        default:
            return AMMO_TYPES.NORMAL;
    }
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
        desert: { ground: '#c2b280', obstacle: '#8b6f47', cover: '#a08b5b', building: '#6b5344', water: '#4a90a4' },
        city: { ground: '#4a4a4a', obstacle: '#2a2a2a', cover: '#3a3a5a', building: '#5a5a6a', water: '#1e3a5f' },
        factory: { ground: '#3a3a3a', obstacle: '#1a1a1a', cover: '#4a5a6a', building: '#5a5a7a', water: '#1e3a3f' },
        jungle: { ground: '#2d5a2d', obstacle: '#1a3a1a', cover: '#1a4a3a', building: '#3a3a4a', water: '#2a7a9a' },
        snow: { ground: '#e0e8f0', obstacle: '#9aa5b1', cover: '#7a8a9a', building: '#aab7c4', water: '#3a5a7a' },
        volcano: { ground: '#3a1a1a', obstacle: '#1a0a0a', cover: '#4a1a1a', building: '#6b3a3a', water: '#5a1515' },
        ruins: { ground: '#c9b896', obstacle: '#8a7a5a', cover: '#a89a7a', building: '#6b6b5a', water: '#4a7a9a' },
        base: { ground: '#3a3a4a', obstacle: '#1a1a2a', cover: '#2a3a4a', building: '#4a5a6a', water: '#1e3a5f' }
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
            } else if (rand < waterRate && theme !== 'snow' && theme !== 'volcano') {
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

            const tile = { type, color };

            // 为各种地块添加随机装饰细节，增强地图层次感
            const detailRand = ((seed + x * 17417 + y * 31051) % 233280) / 233280;
            if (type === 'ground') {
                if (detailRand < 0.05) {
                    if (theme === 'jungle' || theme === 'ruins') {
                        tile.detail = 'grass';
                        tile.detailColor = theme === 'jungle' ? 'rgba(0,80,0,0.35)' : 'rgba(80,70,40,0.3)';
                    } else if (theme === 'snow') {
                        tile.detail = 'rock';
                        tile.detailColor = 'rgba(255,255,255,0.35)';
                    } else if (theme === 'volcano') {
                        tile.detail = 'rock';
                        tile.detailColor = 'rgba(255,80,0,0.35)';
                    } else {
                        tile.detail = detailRand < 0.025 ? 'rock' : 'debris';
                        tile.detailColor = 'rgba(0,0,0,0.2)';
                    }
                }
            } else if (type === 'obstacle') {
                if (detailRand < 0.35) {
                    tile.detail = detailRand < 0.15 ? 'crack' : 'rock';
                    tile.detailColor = 'rgba(0,0,0,0.35)';
                }
            } else if (type === 'building') {
                if (detailRand < 0.18) {
                    tile.detail = 'window';
                    tile.detailColor = 'rgba(20,30,40,0.6)';
                }
            } else if (type === 'cover') {
                if (detailRand < 0.45) {
                    tile.detail = 'sandbags';
                    tile.detailColor = 'rgba(60,50,35,0.5)';
                }
            } else if (type === 'water') {
                tile.detail = 'ripple';
                tile.detailColor = 'rgba(255,255,255,0.12)';
            }

            mapData[`${x}_${y}`] = tile;
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

function getEnemyRadius(enemy) {
    return (enemy && enemy.isBoss) ? 0.9 : 0.45;
}

function hasLineOfSight(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.1) return true;
    const steps = Math.ceil(dist * 2);
    for (let i = 1; i < steps; i++) {
        const t = i / steps;
        const cx = x1 + dx * t;
        const cy = y1 + dy * t;
        if (isBlocked(cx, cy)) return false;
    }
    return true;
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
    // 检查弹药是否充足
    const unlockedWeapons = WEAPONS.filter(w => w.unlocked);
    const lowAmmoWeapons = [];
    
    unlockedWeapons.forEach(w => {
        if (w.isMelee || w.type === WEAPON_TYPES.MELEE) return;
        const ammoType = getWeaponAmmoType(w.id);
        const totalAmmo = ammoInventory[ammoType] || 0;
        const clipSize = getModifiedWeapon(w).clipSize || w.clipSize || 30;
        if (totalAmmo < clipSize) {
            lowAmmoWeapons.push({ name: w.name, totalAmmo, clipSize });
        }
    });
    
    if (lowAmmoWeapons.length > 0) {
        const weaponList = lowAmmoWeapons.map(w => `${w.name}(${w.totalAmmo}/${w.clipSize})`).join('、');
        showConfirm(
            '⚠️ 弹药不足',
            `以下武器弹药不足：\n${weaponList}\n\n是否仍要进入战斗？`,
            function(confirmed) {
                if (confirmed) {
                    hideAllPanels();
                    showLoadingScreen(() => {
                        actuallyStartGame();
                    });
                }
            }
        );
    } else {
        hideAllPanels();
        showLoadingScreen(() => {
            actuallyStartGame();
        });
    }
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
    canvas = document.getElementById('gameCanvas');
    if (canvas) {
        const rect = canvas.parentElement.getBoundingClientRect();
        canvas.width = rect.width || window.innerWidth;
        canvas.height = rect.height || window.innerHeight;
        ctx = canvas.getContext('2d');
        canvas.style.display = 'block';
    } else {
        console.error('[START] gameCanvas not found');
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

    // 构造出战武器列表：优先使用装备槽，其次取前 4 把已解锁武器，保底给手枪+步枪
    const unlockedWeapons = WEAPONS.filter(w => w.unlocked);
    let battleWeapons = [];
    const equipped = playerData.equippedWeapons || {};
    if (equipped.primary) {
        const pw = WEAPONS.find(w => w.id === equipped.primary && w.unlocked);
        if (pw) battleWeapons.push(pw);
    }
    if (equipped.secondary) {
        const sw = WEAPONS.find(w => w.id === equipped.secondary && w.unlocked);
        if (sw && sw.id !== equipped.primary) battleWeapons.push(sw);
    }
    // 补充已解锁武器直到最多 4 把（避免超过 HUD 按钮数量）
    for (const w of unlockedWeapons) {
        if (battleWeapons.some(bw => bw.id === w.id)) continue;
        if (battleWeapons.length >= 4) break;
        battleWeapons.push(w);
    }
    if (battleWeapons.length === 0) {
        battleWeapons = WEAPONS.filter(w => w.id === 'pistol' || w.id === 'rifle');
        console.warn('[START] No unlocked weapons found, using defaults');
    }

    player = {
        x: startX,
        y: startY,
        health: playerMaxHealth,
        maxHealth: playerMaxHealth,
        score: 0,
        kills: 0,
        angle: -Math.PI / 2,
        currentWeapon: 0,
        weapons: battleWeapons.map(w => ({ ...w, currentAmmo: getModifiedWeapon(w).clipSize || w.clipSize || 30 })),
        buffs: { speedBoostUntil: 0, damageReduction: 0 }
    };

    // 渲染武器按钮，与 player.weapons 保持同步
    renderWeaponButtons();

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

    // 清空按键状态与冲刺状态
    keys.clear();
    shiftHeld = false;
    ctrlHeld = false;
    sprintMultiplier = 1.0;
    lastSprintUpdate = Date.now();

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

    // Ctrl + WASD 冲刺：每秒增加 5% 移速，最高 150%（即 sprintMultiplier 最大 1.5）
    const moving = (keys.has('KeyW') && keys.get('KeyW')) ||
                   (keys.has('KeyS') && keys.get('KeyS')) ||
                   (keys.has('KeyA') && keys.get('KeyA')) ||
                   (keys.has('KeyD') && keys.get('KeyD')) ||
                   (keys.has('ArrowUp') && keys.get('ArrowUp')) ||
                   (keys.has('ArrowDown') && keys.get('ArrowDown')) ||
                   (keys.has('ArrowLeft') && keys.get('ArrowLeft')) ||
                   (keys.has('ArrowRight') && keys.get('ArrowRight'));
    const dt = Math.min(0.1, (now - lastSprintUpdate) / 1000);
    lastSprintUpdate = now;
    if (ctrlHeld && moving) {
        sprintMultiplier = Math.min(1.5, sprintMultiplier + 0.05 * dt);
    } else {
        sprintMultiplier = Math.max(1.0, sprintMultiplier - 0.15 * dt);
    }
    speedMultiplier *= sprintMultiplier;

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

        // 独立轴滑动：分别尝试 X / Y 方向，碰到墙时另一方向仍可移动，手感更顺滑
        const radius = PLAYER_SIZE * 0.5;
        if (!isBlockedCircle(player.x + dx, player.y, radius)) {
            player.x += dx;
        } else {
            // 完全阻挡时尝试部分滑动，减少贴墙顿挫感
            for (let s = 0.5; s >= 0.1; s -= 0.2) {
                if (!isBlockedCircle(player.x + dx * s, player.y, radius)) {
                    player.x += dx * s;
                    break;
                }
            }
        }

        if (!isBlockedCircle(player.x, player.y + dy, radius)) {
            player.y += dy;
        } else {
            for (let s = 0.5; s >= 0.1; s -= 0.2) {
                if (!isBlockedCircle(player.x, player.y + dy * s, radius)) {
                    player.y += dy * s;
                    break;
                }
            }
        }
    }

    // 后坐力与屏幕震动衰减
    recoilAngle *= RECOIL_RECOVERY;
    if (Math.abs(recoilAngle) < 0.001) recoilAngle = 0;
    screenShake *= 0.85;
    if (screenShake < 0.5) screenShake = 0;
    if (muzzleFlashTime > 0) muzzleFlashTime--;

    // 计算瞄准角度（鼠标位置相对于屏幕中心），并叠加当前后坐力
    const screenCenterX = canvas.width / 2;
    const screenCenterY = canvas.height / 2;
    player.angle = Math.atan2(mouseY - screenCenterY, mouseX - screenCenterX) + recoilAngle;

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
                    const ammoType = bullet.type || 'normal';
                    let damage = bullet.damage;
                    if (ammoType === 'ap') {
                        damage = Math.floor(damage * 1.5);
                        poolPushExplosion({ x: enemy.x, y: enemy.y, radius: 5, alpha: 1, color: '#ff4444' });
                    } else if (ammoType === 'exp') {
                        damage = Math.floor(damage * 1.2);
                        poolPushExplosion({ x: enemy.x, y: enemy.y, radius: 6, alpha: 1, color: '#ff8800' });
                    } else if (ammoType === 'fire') {
                        damage = Math.floor(damage * 0.8);
                        enemy.burnUntil = now + 2000;
                        enemy.burnDamage = Math.max(enemy.burnDamage || 0, 10);
                        enemy.burnInterval = 500;
                        enemy.lastBurn = now;
                        poolPushExplosion({ x: enemy.x, y: enemy.y, radius: 4, alpha: 1, color: '#ff4400' });
                    } else {
                        poolPushExplosion({ x: enemy.x, y: enemy.y, radius: 4, alpha: 1, color: '#ff0044' });
                    }
                    enemy.health -= damage;
                    enemy.hitFlash = 5; // 受击闪烁帧数

                    // 爆裂弹：范围伤害
                    if (ammoType === 'exp') {
                        const blastRadius = 2.5;
                        const blastRadiusSq = blastRadius * blastRadius;
                        const blastDamage = Math.floor(bullet.damage * 0.6);
                        for (let k = 0; k < enemies.length; k++) {
                            const other = enemies[k];
                            if (!other.alive || other === enemy) continue;
                            const odx = other.x - enemy.x;
                            const ody = other.y - enemy.y;
                            if (odx * odx + ody * ody < blastRadiusSq) {
                                other.health -= blastDamage;
                                poolPushExplosion({ x: other.x, y: other.y, radius: 3, alpha: 1, color: '#ff8800' });
                                if (other.health <= 0) {
                                    other.alive = false;
                                    player.kills++;
                                    player.score += 100;
                                    spawnDrop(other.x, other.y);
                                    updateMissionProgress('kill', player.kills);
                                    updateMissionProgress('score', player.score);
                                }
                            }
                        }
                    }

                    if (enemy.health <= 0) {
                        enemy.alive = false;
                        player.kills++;
                        // 击杀视觉特效
                        poolPushExplosion({ x: enemy.x, y: enemy.y, radius: enemy.isBoss ? 14 : 8, alpha: 1, color: '#ffcc00' });
                        poolPushExplosion({ x: enemy.x, y: enemy.y, radius: enemy.isBoss ? 8 : 4, alpha: 1, color: '#ff4400' });
                        if (enemy.isBoss) {
                            player.score += 500;
                            playerData.coins += 50;
                            spawnDrop(enemy.x, enemy.y);
                            spawnDrop(enemy.x, enemy.y);
                            spawnDrop(enemy.x, enemy.y);
                            showNotification('Boss 被消灭！奖励 +50 金币', 'success');
                        } else {
                            player.score += 100;
                            spawnDrop(enemy.x, enemy.y);
                        }
                        updateMissionProgress('kill', player.kills);
                        updateMissionProgress('score', player.score);
                        if (enemy.isBoss) updateMissionProgress('boss', 1);
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

        if (sX < 0 || sX >= MAP_SIZE || sY < 0 || sY >= MAP_SIZE ||
            eX < 0 || eX >= MAP_SIZE || eY < 0 || eY >= MAP_SIZE) return null;

        const startTile = getTile(sX, sY);
        const endTile = getTile(eX, eY);
        const isBlockedTile = (t) => (t.type === 'obstacle' || t.type === 'building' || t.type === 'water');
        if (isBlockedTile(startTile) || isBlockedTile(endTile)) return null;
        if (sX === eX && sY === eY) return [{x: sX, y: sY}];

        const manhattan = Math.abs(sX - eX) + Math.abs(sY - eY);
        if (manhattan <= 2 && hasLineOfSight(sX + 0.5, sY + 0.5, eX + 0.5, eY + 0.5)) {
            return [{x: sX, y: sY}, {x: eX, y: eY}];
        }

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
        // 加入微小 tie-breaking，使搜索更趋向目标方向，减少不必要节点探索
        function h(x, y) {
            const dx = Math.abs(x - eX);
            const dy = Math.abs(y - eY);
            const manhattan = dx + dy;
            const tie = 1.0 + 1.0 / (manhattan + 1);
            return manhattan * tie;
        }

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

        if (typeof enemy.speedMul === 'undefined') {
            enemy.speedMul = 0.85 + Math.random() * 0.3;
        }
        const curEnemySpeed = enemyMoveSpeed * enemy.speedMul;

        if (dist < 30) {
            enemy.angle = Math.atan2(dyE, dxE);

            const directChase = dist < 10 && hasLineOfSight(enemy.x, enemy.y, player.x, player.y);

            if (!directChase) {
                const dynamicInterval = dist < 8 ? 400 : (dist < 15 ? 700 : 1200);
                const pathInterval = typeof enemy.pathUpdateInterval === 'number'
                    ? enemy.pathUpdateInterval
                    : dynamicInterval;
                const timeOk = (now - (enemy.lastPathUpdate || 0)) > pathInterval;
                const isSelected = (i === pathfinderIndex) || !enemy.path;
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
                }
            } else {
                enemy.path = null;
            }

            // 沿路径移动
            if (enemy.path && enemy.pathIndex < enemy.path.length) {
                const lookAhead = Math.min(4, enemy.path.length - enemy.pathIndex);
                let targetX = 0, targetY = 0;
                for (let k = 0; k < lookAhead; k++) {
                    targetX += enemy.path[enemy.pathIndex + k].x + 0.5;
                    targetY += enemy.path[enemy.pathIndex + k].y + 0.5;
                }
                targetX /= lookAhead;
                targetY /= lookAhead;

                const dxPath = targetX - enemy.x;
                const dyPath = targetY - enemy.y;
                const distToTarget = Math.sqrt(dxPath * dxPath + dyPath * dyPath);
                const nextNode = enemy.path[enemy.pathIndex];
                const distToNext = Math.sqrt(
                    (nextNode.x + 0.5 - enemy.x) ** 2 +
                    (nextNode.y + 0.5 - enemy.y) ** 2
                );

                if (typeof enemy.stuckTimer === 'undefined') {
                    enemy.stuckTimer = 0;
                    enemy.lastPosX = enemy.x;
                    enemy.lastPosY = enemy.y;
                }
                const movedDist = Math.sqrt(
                    (enemy.x - enemy.lastPosX) ** 2 + (enemy.y - enemy.lastPosY) ** 2
                );
                if (movedDist < 0.02) {
                    enemy.stuckTimer++;
                    if (enemy.stuckTimer > 30) {
                        enemy.pathIndex++;
                        enemy.stuckTimer = 0;
                    }
                } else {
                    enemy.stuckTimer = 0;
                }
                enemy.lastPosX = enemy.x;
                enemy.lastPosY = enemy.y;

                if (distToNext < 0.4) {
                    enemy.pathIndex++;
                    enemy.stuckTimer = 0;
                } else if (distToTarget > 0.01) {
                    const stepX = (dxPath / distToTarget) * curEnemySpeed;
                    const stepY = (dyPath / distToTarget) * curEnemySpeed;
                    const enemyRadius = getEnemyRadius(enemy);
                    let movedAny = false;
                    const testX = enemy.x + stepX;
                    if (!isBlockedCircle(testX, enemy.y, enemyRadius)) {
                        enemy.x = testX;
                        movedAny = true;
                    }
                    const testY = enemy.y + stepY;
                    if (!isBlockedCircle(enemy.x, testY, enemyRadius)) {
                        enemy.y = testY;
                        movedAny = true;
                    }
                    if (!movedAny) {
                        const tryOffsets = [
                            [stepY, -stepX], [-stepY, stepX]
                        ];
                        for (const [ox, oy] of tryOffsets) {
                            const altX = enemy.x + ox;
                            const altY = enemy.y + oy;
                            if (!isBlockedCircle(altX, altY, enemyRadius)) {
                                enemy.x = altX;
                                enemy.y = altY;
                                movedAny = true;
                                break;
                            }
                        }
                        if (!movedAny) enemy.path = null;
                    }
                }
            } else {
                // 无路径：根据玩家武器与敌人状态决定移动方向
                const healthPercent = enemy.health / enemy.maxHealth;
                if (typeof enemy.aiState !== 'string') { enemy.aiState = 'chase'; enemy.aiStateTimer = 0; }
                if (enemy.aiState === 'flee' && now > enemy.aiStateTimer) enemy.aiState = 'chase';
                if (enemy.aiState !== 'flee' && healthPercent < 0.25 && !enemy.isBoss && Math.random() < 0.02) {
                    enemy.aiState = 'flee';
                    enemy.aiStateTimer = now + 2000 + Math.random() * 2000;
                }

                const playerWeapon = player.weapons[player.currentWeapon];
                const pwt = playerWeapon ? playerWeapon.type : WEAPON_TYPES.RIFLE;
                const isPlayerMelee = pwt === WEAPON_TYPES.MELEE;
                const isPlayerShotgun = pwt === WEAPON_TYPES.SHOTGUN;
                const isPlayerSniper = pwt === WEAPON_TYPES.SNIPER;

                let desiredAngle;
                if (enemy.aiState === 'flee') {
                    desiredAngle = Math.atan2(-dyE, -dxE);
                } else if (isPlayerMelee) {
                    if (dist < 5) desiredAngle = Math.atan2(-dyE, -dxE);
                    else if (dist > 9) desiredAngle = Math.atan2(dyE, dxE);
                    else desiredAngle = Math.atan2(dyE, dxE) + Math.PI / 2;
                } else if (isPlayerShotgun) {
                    if (dist < 7) desiredAngle = Math.atan2(-dyE, -dxE);
                    else desiredAngle = Math.atan2(dyE, dxE) + (Math.sin(now * 0.003 + i) > 0 ? 1 : -1) * Math.PI / 3;
                } else if (isPlayerSniper) {
                    if (dist > 14) desiredAngle = Math.atan2(dyE, dxE);
                    else desiredAngle = Math.atan2(dyE, dxE) + (Math.sin(now * 0.006 + i) > 0 ? 1 : -1) * Math.PI / 2.2;
                } else {
                    desiredAngle = Math.atan2(dyE, dxE);
                }

                let moveX = 0, moveY = 0;
                if (enemy.aiState === 'flee') {
                    moveX = Math.cos(desiredAngle) * curEnemySpeed * 1.3;
                    moveY = Math.sin(desiredAngle) * curEnemySpeed * 1.3;
                } else if (isPlayerMelee) {
                    if (dist > 12 || dist < 5) {
                        moveX = Math.cos(desiredAngle) * curEnemySpeed;
                        moveY = Math.sin(desiredAngle) * curEnemySpeed;
                    } else {
                        moveX = Math.cos(desiredAngle) * curEnemySpeed * 0.4;
                        moveY = Math.sin(desiredAngle) * curEnemySpeed * 0.4;
                    }
                } else if (isPlayerShotgun && dist < 10) {
                    moveX = Math.cos(desiredAngle) * curEnemySpeed;
                    moveY = Math.sin(desiredAngle) * curEnemySpeed;
                } else if (isPlayerSniper) {
                    moveX = Math.cos(desiredAngle) * curEnemySpeed * 1.1;
                    moveY = Math.sin(desiredAngle) * curEnemySpeed * 1.1;
                } else {
                    if (dist > 12) {
                        moveX = Math.cos(desiredAngle) * curEnemySpeed;
                        moveY = Math.sin(desiredAngle) * curEnemySpeed;
                    } else if (dist < 3) {
                        moveX = -(dxE / dist) * curEnemySpeed;
                        moveY = -(dyE / dist) * curEnemySpeed;
                    } else {
                        const perp = Math.sin(now * 0.002 + i) > 0 ? 1 : -1;
                        moveX = -dyE / dist * curEnemySpeed * 0.3 * perp;
                        moveY = dxE / dist * curEnemySpeed * 0.3 * perp;
                    }
                }
                const enemyRadius = getEnemyRadius(enemy);
                let movedAny = false;
                const testX = enemy.x + moveX;
                if (!isBlockedCircle(testX, enemy.y, enemyRadius)) {
                    enemy.x = testX;
                    movedAny = true;
                }
                const testY = enemy.y + moveY;
                if (!isBlockedCircle(enemy.x, testY, enemyRadius)) {
                    enemy.y = testY;
                    movedAny = true;
                }
                if (!movedAny) {
                    const tryOffsets = [[moveY, -moveX], [-moveY, moveX]];
                    for (const [ox, oy] of tryOffsets) {
                        const altX = enemy.x + ox;
                        const altY = enemy.y + oy;
                        if (!isBlockedCircle(altX, altY, enemyRadius)) {
                            enemy.x = altX;
                            enemy.y = altY;
                            break;
                        }
                    }
                }
            }

            // 敌人分离：避免重叠；Boss 体积大、分离半径也更大
            const enemyRadius = getEnemyRadius(enemy);
            const sepRadius = enemy.isBoss ? 2.5 : 1.2;
            const sepForce = enemyMoveSpeed * 0.4;
            for (let j = 0; j < enemies.length; j++) {
                if (j === i) continue;
                const other = enemies[j];
                if (!other.alive) continue;
                const sdx = enemy.x - other.x;
                const sdy = enemy.y - other.y;
                const sdist = Math.sqrt(sdx * sdx + sdy * sdy);
                if (sdist > 0 && sdist < sepRadius) {
                    const push = (sepRadius - sdist) / sepRadius * sepForce;
                    const pdx = (sdx / sdist) * push;
                    const pdy = (sdy / sdist) * push;
                    if (!isBlockedCircle(enemy.x + pdx, enemy.y, enemyRadius)) enemy.x += pdx;
                    if (!isBlockedCircle(enemy.x, enemy.y + pdy, enemyRadius)) enemy.y += pdy;
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

            // 受击闪烁逐帧衰减
            if (enemy.hitFlash > 0) enemy.hitFlash--;
        }
    }

    // 燃烧弹：持续伤害（DOT）
    for (let i = 0; i < enemies.length; i++) {
        const enemy = enemies[i];
        if (!enemy.alive || !enemy.burnUntil) continue;
        if (now < enemy.burnUntil && now - (enemy.lastBurn || 0) >= (enemy.burnInterval || 500)) {
            enemy.health -= (enemy.burnDamage || 10);
            enemy.lastBurn = now;
            poolPushExplosion({ x: enemy.x, y: enemy.y, radius: 2, alpha: 0.8, color: '#ff6600' });
            if (enemy.health <= 0) {
                enemy.alive = false;
                player.kills++;
                if (enemy.isBoss) {
                    player.score += 500;
                    playerData.coins += 50;
                    spawnDrop(enemy.x, enemy.y);
                    spawnDrop(enemy.x, enemy.y);
                    spawnDrop(enemy.x, enemy.y);
                    showNotification('Boss 被消灭！奖励 +50 金币', 'success');
                } else {
                    player.score += 100;
                    spawnDrop(enemy.x, enemy.y);
                }
                updateMissionProgress('kill', player.kills);
                updateMissionProgress('score', player.score);
            }
        } else if (now >= enemy.burnUntil) {
            enemy.burnUntil = 0;
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
                if (enemy.isBoss) {
                    player.score += 500;
                    playerData.coins += 50;
                    spawnDrop(enemy.x, enemy.y);
                    spawnDrop(enemy.x, enemy.y);
                    spawnDrop(enemy.x, enemy.y);
                    showNotification('Boss 被消灭！奖励 +50 金币', 'success');
                } else {
                    player.score += 100;
                    spawnDrop(enemy.x, enemy.y);
                }
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
    if (!BackpackManager.hasItem('grenade', 1)) {
        showNotification('没有手雷！');
        return;
    }
    BackpackManager.useItem('grenade', 1);
    playerData.inventory.grenades = Math.max(0, (playerData.inventory.grenades || 0) - 1);
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

    // 应用屏幕震动
    ctx.save();
    if (screenShake > 0) {
        const shakeX = (Math.random() - 0.5) * screenShake;
        const shakeY = (Math.random() - 0.5) * screenShake;
        ctx.translate(shakeX, shakeY);
    }
    
    // 绘制网格背景（使用深色调避免干扰地图）
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
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
    const voidTile = { type: 'void', color: '#000000' };
    const groundFallback = { type: 'ground', color: '#2d2d1a' };

    for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
            // 内联 getTile 减少每帧函数调用与字符串拼接开销
            const tile = (x < 0 || x >= MAP_SIZE || y < 0 || y >= MAP_SIZE)
                ? voidTile
                : (mapData[x + '_' + y] || groundFallback);

            const screenX = screenCenterX + (x - player.x) * TILE_SIZE;
            const screenY = screenCenterY + (y - player.y) * TILE_SIZE;

            // 绘制基础地面与层次阴影
            ctx.fillStyle = tile.color;
            ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);

            // 绘制格子边框，增强地块边界感
            ctx.strokeStyle = 'rgba(0,0,0,0.06)';
            ctx.lineWidth = 0.5;
            ctx.strokeRect(screenX, screenY, TILE_SIZE, TILE_SIZE);

            if (tile.type === 'obstacle') {
                // 底部投影
                ctx.fillStyle = 'rgba(0,0,0,0.35)';
                ctx.fillRect(screenX + 2, screenY + 2, TILE_SIZE, TILE_SIZE);
                // 主体
                ctx.fillStyle = tile.color;
                ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);
                // 顶部高光
                ctx.fillStyle = 'rgba(255,255,255,0.12)';
                ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE * 0.35);
                // 立体边框
                ctx.strokeStyle = 'rgba(0,0,0,0.3)';
                ctx.lineWidth = 1;
                ctx.strokeRect(screenX, screenY, TILE_SIZE, TILE_SIZE);
            } else if (tile.type === 'building') {
                ctx.fillStyle = 'rgba(0,0,0,0.25)';
                ctx.fillRect(screenX + 1, screenY + 1, TILE_SIZE, TILE_SIZE);
                ctx.fillStyle = tile.color;
                ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);
                ctx.fillStyle = 'rgba(255,255,255,0.08)';
                ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE * 0.25);
                ctx.strokeStyle = 'rgba(0,0,0,0.25)';
                ctx.lineWidth = 1;
                ctx.strokeRect(screenX, screenY, TILE_SIZE, TILE_SIZE);
            } else if (tile.type === 'cover') {
                ctx.fillStyle = 'rgba(0,0,0,0.18)';
                ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);
                ctx.fillStyle = tile.color;
                ctx.fillRect(screenX + 1, screenY + 1, TILE_SIZE - 2, TILE_SIZE - 2);
                ctx.strokeStyle = 'rgba(0,0,0,0.15)';
                ctx.strokeRect(screenX + 1, screenY + 1, TILE_SIZE - 2, TILE_SIZE - 2);
            } else if (tile.type === 'water') {
                ctx.fillStyle = tile.color;
                ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);
                // 水面高光条
                ctx.fillStyle = 'rgba(255,255,255,0.12)';
                ctx.fillRect(screenX + 2, screenY + TILE_SIZE * 0.25, TILE_SIZE - 4, TILE_SIZE * 0.12);
            }

            // 绘制随机细节（碎石、草、裂缝、窗户、沙袋、波纹等）
            if (tile.detail) {
                const d = tile.detail;
                if (d === 'rock') {
                    ctx.fillStyle = tile.detailColor || 'rgba(0,0,0,0.2)';
                    ctx.beginPath();
                    ctx.arc(screenX + TILE_SIZE * 0.5, screenY + TILE_SIZE * 0.55, TILE_SIZE * 0.18, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = 'rgba(255,255,255,0.08)';
                    ctx.beginPath();
                    ctx.arc(screenX + TILE_SIZE * 0.42, screenY + TILE_SIZE * 0.48, TILE_SIZE * 0.06, 0, Math.PI * 2);
                    ctx.fill();
                } else if (d === 'grass') {
                    ctx.fillStyle = tile.detailColor || 'rgba(0,80,0,0.35)';
                    ctx.fillRect(screenX + TILE_SIZE * 0.3, screenY + TILE_SIZE * 0.6, TILE_SIZE * 0.08, TILE_SIZE * 0.25);
                    ctx.fillRect(screenX + TILE_SIZE * 0.5, screenY + TILE_SIZE * 0.55, TILE_SIZE * 0.08, TILE_SIZE * 0.3);
                    ctx.fillRect(screenX + TILE_SIZE * 0.7, screenY + TILE_SIZE * 0.6, TILE_SIZE * 0.08, TILE_SIZE * 0.25);
                } else if (d === 'debris') {
                    ctx.fillStyle = tile.detailColor || 'rgba(0,0,0,0.2)';
                    ctx.fillRect(screenX + TILE_SIZE * 0.2, screenY + TILE_SIZE * 0.7, TILE_SIZE * 0.6, TILE_SIZE * 0.12);
                    ctx.fillRect(screenX + TILE_SIZE * 0.65, screenY + TILE_SIZE * 0.55, TILE_SIZE * 0.15, TILE_SIZE * 0.15);
                } else if (d === 'crack') {
                    ctx.strokeStyle = tile.detailColor || 'rgba(0,0,0,0.35)';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(screenX + TILE_SIZE * 0.2, screenY + TILE_SIZE * 0.4);
                    ctx.lineTo(screenX + TILE_SIZE * 0.5, screenY + TILE_SIZE * 0.6);
                    ctx.lineTo(screenX + TILE_SIZE * 0.8, screenY + TILE_SIZE * 0.35);
                    ctx.stroke();
                } else if (d === 'window') {
                    ctx.fillStyle = tile.detailColor || 'rgba(20,30,40,0.6)';
                    ctx.fillRect(screenX + TILE_SIZE * 0.25, screenY + TILE_SIZE * 0.25, TILE_SIZE * 0.5, TILE_SIZE * 0.5);
                    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(screenX + TILE_SIZE * 0.25, screenY + TILE_SIZE * 0.25, TILE_SIZE * 0.5, TILE_SIZE * 0.5);
                    ctx.beginPath();
                    ctx.moveTo(screenX + TILE_SIZE * 0.5, screenY + TILE_SIZE * 0.25);
                    ctx.lineTo(screenX + TILE_SIZE * 0.5, screenY + TILE_SIZE * 0.75);
                    ctx.moveTo(screenX + TILE_SIZE * 0.25, screenY + TILE_SIZE * 0.5);
                    ctx.lineTo(screenX + TILE_SIZE * 0.75, screenY + TILE_SIZE * 0.5);
                    ctx.stroke();
                } else if (d === 'sandbags') {
                    ctx.fillStyle = tile.detailColor || 'rgba(60,50,35,0.5)';
                    ctx.fillRect(screenX + 2, screenY + TILE_SIZE * 0.55, TILE_SIZE - 4, TILE_SIZE * 0.3);
                    ctx.fillStyle = 'rgba(255,255,255,0.08)';
                    ctx.fillRect(screenX + 2, screenY + TILE_SIZE * 0.55, TILE_SIZE - 4, TILE_SIZE * 0.08);
                    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
                    ctx.strokeRect(screenX + 2, screenY + TILE_SIZE * 0.55, TILE_SIZE - 4, TILE_SIZE * 0.3);
                } else if (d === 'ripple') {
                    ctx.strokeStyle = tile.detailColor || 'rgba(255,255,255,0.12)';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    const waveOffset = (Date.now() / 500 + x * 0.5 + y * 0.3) % Math.PI;
                    ctx.arc(screenX + TILE_SIZE * 0.5, screenY + TILE_SIZE * 0.5, TILE_SIZE * 0.15 + Math.sin(waveOffset) * 2, 0, Math.PI * 2);
                    ctx.stroke();
                }
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

    // 绘制 Boss 顶部血条
    drawBossHealthBar();

    // 绘制撤离区域
    drawExtractionZone();

    // 恢复屏幕震动前的绘制状态
    ctx.restore();
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

    const skinColor = getPlayerSkinColor();
    const skin = SKINS.players.find(s => s.id === playerMods.equippedPlayerSkin);
    const glowColor = skin && skin.color ? lightenColor(skin.color, 30) : '#00ff88';

    ctx.fillStyle = skinColor;
    ctx.beginPath();
    ctx.moveTo(PLAYER_SIZE * TILE_SIZE, 0);
    ctx.lineTo(-PLAYER_SIZE * TILE_SIZE * 0.7, -PLAYER_SIZE * TILE_SIZE * 0.7);
    ctx.lineTo(-PLAYER_SIZE * TILE_SIZE * 0.5, 0);
    ctx.lineTo(-PLAYER_SIZE * TILE_SIZE * 0.7, PLAYER_SIZE * TILE_SIZE * 0.7);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = glowColor;
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(0, 0, PLAYER_SIZE * TILE_SIZE * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // 枪口闪光
    if (muzzleFlashTime > 0) {
        const flashLen = PLAYER_SIZE * TILE_SIZE * 1.8;
        const flashWidth = PLAYER_SIZE * TILE_SIZE * 0.6;
        const gradient = ctx.createLinearGradient(flashLen, 0, -flashLen * 0.3, 0);
        gradient.addColorStop(0, 'rgba(255, 255, 200, 0.95)');
        gradient.addColorStop(0.4, 'rgba(255, 200, 50, 0.6)');
        gradient.addColorStop(1, 'rgba(255, 100, 0, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.ellipse(flashLen * 0.5, 0, flashLen * 0.5, flashWidth * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    // 近战挥砍特效
    if (player.meleeSwing) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(PLAYER_SIZE * TILE_SIZE * 1.2, 0, PLAYER_SIZE * TILE_SIZE * 1.5, -Math.PI / 3, Math.PI / 3);
        ctx.stroke();
    }

    ctx.restore();
}

function lightenColor(color, percent) {
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) + amt;
    const G = (num >> 8 & 0x00FF) + amt;
    const B = (num & 0x0000FF) + amt;
    return '#' + (0x1000000 +
        (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
        (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
        (B < 255 ? B < 1 ? 0 : B : 255)
    ).toString(16).slice(1);
}

function drawEnemy(enemy) {
    const screenX = canvas.width / 2 + (enemy.x - player.x) * TILE_SIZE;
    const screenY = canvas.height / 2 + (enemy.y - player.y) * TILE_SIZE;

    const sizeMul = enemy.isBoss ? 1.6 : 1.0;
    ctx.save();
    ctx.translate(screenX, screenY);
    ctx.rotate(enemy.angle);

    ctx.fillStyle = enemy.isBoss ? '#aa00aa' : '#cc3333';
    ctx.beginPath();
    ctx.moveTo(ENEMY_SIZE * TILE_SIZE * sizeMul, 0);
    ctx.lineTo(-ENEMY_SIZE * TILE_SIZE * 0.7 * sizeMul, -ENEMY_SIZE * TILE_SIZE * 0.7 * sizeMul);
    ctx.lineTo(-ENEMY_SIZE * TILE_SIZE * 0.5 * sizeMul, 0);
    ctx.lineTo(-ENEMY_SIZE * TILE_SIZE * 0.7 * sizeMul, ENEMY_SIZE * TILE_SIZE * 0.7 * sizeMul);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = enemy.isBoss ? '#ff66ff' : '#ff4444';
    ctx.shadowColor = enemy.isBoss ? '#ff66ff' : '#ff4444';
    ctx.shadowBlur = enemy.isBoss ? 16 : 8;
    ctx.beginPath();
    ctx.arc(0, 0, ENEMY_SIZE * TILE_SIZE * 0.4 * sizeMul, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // 受击白色闪烁
    if (enemy.hitFlash > 0) {
        ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(0.7, enemy.hitFlash / 5)})`;
        ctx.beginPath();
        ctx.moveTo(ENEMY_SIZE * TILE_SIZE * sizeMul, 0);
        ctx.lineTo(-ENEMY_SIZE * TILE_SIZE * 0.7 * sizeMul, -ENEMY_SIZE * TILE_SIZE * 0.7 * sizeMul);
        ctx.lineTo(-ENEMY_SIZE * TILE_SIZE * 0.5 * sizeMul, 0);
        ctx.lineTo(-ENEMY_SIZE * TILE_SIZE * 0.7 * sizeMul, ENEMY_SIZE * TILE_SIZE * 0.7 * sizeMul);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.arc(0, 0, ENEMY_SIZE * TILE_SIZE * 0.4 * sizeMul, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();

    const healthPercent = enemy.health / enemy.maxHealth;
    const barW = enemy.isBoss ? 50 : 30;
    const barH = enemy.isBoss ? 6 : 4;
    ctx.fillStyle = '#333';
    ctx.fillRect(screenX - barW / 2, screenY - 25, barW, barH);
    ctx.fillStyle = healthPercent > 0.5 ? '#00cc66' : '#ff4444';
    ctx.fillRect(screenX - barW / 2, screenY - 25, barW * healthPercent, barH);
}

function drawBossHealthBar() {
    const boss = enemies.find(e => e.alive && e.isBoss);
    if (!boss) return;
    const healthPercent = Math.max(0, boss.health / boss.maxHealth);
    const barW = Math.min(600, canvas.width * 0.6);
    const barH = 16;
    const x = (canvas.width - barW) / 2;
    const y = 30;

    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x - 4, y - 4, barW + 8, barH + 8);
    ctx.fillStyle = '#330033';
    ctx.fillRect(x, y, barW, barH);
    ctx.fillStyle = healthPercent > 0.5 ? '#ff33ff' : '#ff0044';
    ctx.fillRect(x, y, barW * healthPercent, barH);
    ctx.strokeStyle = '#ff66ff';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, barW, barH);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('BOSS', canvas.width / 2, y - 8);
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

    let bulletColor;
    if (bullet.owner === 'player') {
        switch (bullet.type) {
            case 'ap': bulletColor = '#ff4444'; break;
            case 'exp': bulletColor = '#ff8800'; break;
            case 'fire': bulletColor = '#ff4400'; break;
            default: bulletColor = '#00ff88';
        }
    } else {
        bulletColor = '#ff4444';
    }
    // 子弹拖尾
    const tailLen = Math.min(18, bullet.speed * TILE_SIZE * 4);
    const tailX = screenX - Math.cos(bullet.angle) * tailLen;
    const tailY = screenY - Math.sin(bullet.angle) * tailLen;
    const tailGradient = ctx.createLinearGradient(tailX, tailY, screenX, screenY);
    tailGradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
    tailGradient.addColorStop(1, bulletColor);
    ctx.strokeStyle = tailGradient;
    ctx.lineWidth = BULLET_SIZE * TILE_SIZE * 1.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.lineTo(screenX, screenY);
    ctx.stroke();

    ctx.fillStyle = bulletColor;
    ctx.shadowColor = bulletColor;
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
    if (!gameRunning || !player || !player.weapons) return false;
    const now = Date.now();
    const weapon = player.weapons[player.currentWeapon];
    if (!weapon) return false;
    // 射速调整：fireRate值越大射速越快（冷却时间 = 原冷却 * 100 / settings.fireRate）
    const actualFireRate = weapon.fireRate * (100 / settings.fireRate);
    // 近战武器不需要弹药
    const hasAmmo = (weapon.isMelee || weapon.type === WEAPON_TYPES.MELEE) ? true : weapon.currentAmmo > 0;
    return now - lastShot > actualFireRate && hasAmmo;
}

function shoot() {
    if (!gameRunning || !player) return;
    if (player.isReloading) {
        showNotification('换弹中无法射击');
        return;
    }
    const weapon = player.weapons[player.currentWeapon];
    const modifiedWeapon = getModifiedWeapon(weapon);

    // 近战武器
    if (weapon.isMelee || weapon.type === WEAPON_TYPES.MELEE) {
        meleeAttack(modifiedWeapon);
        lastShot = Date.now();
        return;
    }

    // 检查弹药
    if (!consumeAmmo(weapon)) {
        showNotification('弹药不足！');
        return;
    }

    // 根据武器类型计算基础后坐力
    const recoilTable = {
        pistol: 0.02, smg: 0.025, rifle: 0.03, ar: 0.035,
        lmg: 0.04, shotgun: 0.06, sniper: 0.05
    };
    const baseRecoil = recoilTable[weapon.type] || 0.03;
    const recoilReduction = modifiedWeapon.recoilReduction || 0;
    const recoilAmount = baseRecoil * (1 - recoilReduction) * (Math.random() < 0.5 ? -1 : 1);
    recoilAngle = Math.max(-0.25, Math.min(0.25, recoilAngle + recoilAmount));

    // 屏幕震动与枪口闪光
    const shakeTable = { pistol: 2, smg: 2.5, rifle: 3, ar: 3.5, lmg: 4, shotgun: 6, sniper: 5 };
    screenShake = Math.max(screenShake, shakeTable[weapon.type] || 3);
    muzzleFlashTime = 3;

    // 霰弹枪多弹丸
    const pellets = weapon.pellets || 1;
    const fireAngle = player.angle + recoilAngle;

    for (let i = 0; i < pellets; i++) {
        const spread = pellets > 1 ? (Math.random() - 0.5) * 0.3 : 0;
        poolPushBullet({
            x: player.x + Math.cos(player.angle) * 0.5,
            y: player.y + Math.sin(player.angle) * 0.5,
            angle: fireAngle + spread,
            speed: 1,
            damage: modifiedWeapon.damage,
            range: modifiedWeapon.range,
            distance: 0,
            owner: 'player',
            type: getWeaponAmmoType(weapon.id) || 'normal',
            weaponType: weapon.type
        });
    }

    weapon.currentAmmo--;
    lastShot = Date.now();
}

function meleeAttack(weapon) {
    const range = weapon.range || 2;
    const damage = weapon.damage || 50;
    const arcAngle = Math.PI / 2;

    // 近战挥砍特效标记
    player.meleeSwing = true;
    setTimeout(() => { if (player) player.meleeSwing = false; }, 150);

    // 检测范围内的敌人
    if (typeof enemies !== 'undefined' && enemies) {
        for (const enemy of enemies) {
            if (!enemy || enemy.health <= 0) continue;
            const dx = enemy.x - player.x;
            const dy = enemy.y - player.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > range) continue;

            const angleToEnemy = Math.atan2(dy, dx);
            let angleDiff = angleToEnemy - player.angle;
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

            if (Math.abs(angleDiff) <= arcAngle / 2) {
                // 命中敌人
                if (typeof damageEnemy === 'function') {
                    damageEnemy(enemy, damage);
                } else {
                    enemy.health -= damage;
                }
                player.kills = player.kills || 0;
                if (enemy.health <= 0 && enemy.alive !== false) {
                    enemy.alive = false;
                    player.kills++;
                    if (enemy.isBoss) {
                        player.score += 500;
                        playerData.coins += 50;
                        spawnDrop(enemy.x, enemy.y);
                        spawnDrop(enemy.x, enemy.y);
                        spawnDrop(enemy.x, enemy.y);
                        showNotification('Boss 被消灭！奖励 +50 金币', 'success');
                    } else {
                        player.score += enemy.scoreValue || 100;
                        spawnDrop(enemy.x, enemy.y);
                    }
                    updateMissionProgress('kill', player.kills);
                    updateMissionProgress('score', player.score);
                }
            }
        }
    }
}

function reload() {
    if (!gameRunning || !player) return;
    const weapon = player.weapons[player.currentWeapon];
    // 近战武器不需要换弹
    if (weapon.isMelee || weapon.type === WEAPON_TYPES.MELEE) {
        showNotification('近战武器无需换弹');
        return;
    }
    if (player.isReloading) {
        showNotification('正在换弹中...');
        return;
    }
    const modifiedWeapon = getModifiedWeapon(weapon);
    if (weapon.currentAmmo >= modifiedWeapon.clipSize) {
        showNotification('弹药已满');
        return;
    }

    // 换弹耗时：根据武器类型（秒）
    const reloadDurations = {
        pistol: 1.0,
        smg: 1.5,
        rifle: 1.8,
        ar: 2.0,
        lmg: 3.0,
        shotgun: 2.2,
        sniper: 2.8
    };
    const durationMs = (reloadDurations[weapon.type] || 1.5) * 1000;

    player.isReloading = true;
    player.reloadWeaponIndex = player.currentWeapon;
    player.reloadEndTime = Date.now() + durationMs;
    showNotification('开始换弹...');

    setTimeout(() => {
        if (!gameRunning || !player) return;
        const idx = player.reloadWeaponIndex;
        if (idx === undefined || idx === null) {
            player.isReloading = false;
            return;
        }
        const w = player.weapons[idx];
        if (w) {
            const mw = getModifiedWeapon(w);
            w.currentAmmo = mw.clipSize;
        }
        player.isReloading = false;
        player.reloadEndTime = 0;
        player.reloadWeaponIndex = null;
        showNotification('换弹完成');
        updateHUD();
    }, durationMs);
}

function renderWeaponButtons() {
    const selector = document.getElementById('weaponSelector');
    if (!selector || !player || !player.weapons) return;
    selector.innerHTML = '';
    player.weapons.forEach((weapon, index) => {
        const btn = document.createElement('button');
        btn.className = 'weapon-btn' + (index === player.currentWeapon ? ' active' : '');
        btn.onclick = () => switchWeapon(index);
        btn.innerHTML = `<span class="weapon-icon">${weapon.icon || '🔫'}</span><span class="weapon-name">${weapon.name || '武器'}</span>`;
        selector.appendChild(btn);
    });
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

    // 死亡时清除所有已装备的配件（不返回库存）
    playerMods.equippedMods = {};
    savePlayerMods();

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

    const fs = document.getElementById('finalScore');
    const fk = document.getElementById('finalKills');
    const ce = document.getElementById('coinsEarned');
    const go = document.getElementById('gameOver');
    if (fs) fs.textContent = player.score || 0;
    if (fk) fk.textContent = player.kills || 0;
    if (ce) ce.textContent = Math.floor((player.score || 0) / 10);

    hideGameUI();
    if (go) go.style.display = 'block';
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

    const fs = document.getElementById('finalScore');
    const fk = document.getElementById('finalKills');
    const ce = document.getElementById('coinsEarned');
    if (fs) fs.textContent = player.score || 0;
    if (fk) fk.textContent = player.kills || 0;
    if (ce) ce.textContent = Math.floor((player.score || 0) / 5);

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
    savePlayerMods(); // 保存弹药库存

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

    const weapon = player.weapons ? player.weapons[player.currentWeapon] : null;
    if (!weapon) return;
    const modifiedWeapon = getModifiedWeapon(weapon);

    // 弹药大数字（武器栏上方）- 近战武器特殊显示
    const ammoCurrentEl = document.getElementById('ammoCurrent');
    const ammoMaxEl = document.getElementById('ammoMax');
    const ammoSlashEl = document.querySelector('.ammo-slash');
    const isMelee = weapon.isMelee || weapon.type === WEAPON_TYPES.MELEE;
    const currentAmmoType = getWeaponAmmoType(weapon.id);
    if (ammoCurrentEl) ammoCurrentEl.textContent = isMelee ? '∞' : (weapon.currentAmmo || 0);
    if (ammoMaxEl) {
        if (isMelee) {
            ammoMaxEl.textContent = '';
        } else {
            const totalAmmo = ammoInventory[currentAmmoType] || 0;
            const clipSize = modifiedWeapon.clipSize || 0;
            // 弹药不足时显示 枪膛弹药/总弹药，充足时显示 枪膛弹药/弹匣容量
            ammoMaxEl.textContent = totalAmmo < clipSize ? totalAmmo : clipSize;
        }
    }
    if (ammoSlashEl) ammoSlashEl.style.display = isMelee ? 'none' : '';
    const weaponNameBigEl = document.getElementById('weaponNameBig');
    if (weaponNameBigEl) {
        weaponNameBigEl.textContent = weapon.name + (isMelee ? '' : getAmmoIcon(currentAmmoType));
    }

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

// Shift 按住显示物资圆盘；Ctrl 按住冲刺
let shiftHeld = false;
let ctrlHeld = false;
let sprintMultiplier = 1.0;
let lastSprintUpdate = Date.now();
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

let gamePaused = false;
function pauseGame() {
    if (!gameRunning) {
        showNotification('⚠️ 当前不在游戏中');
        return;
    }
    gamePaused = !gamePaused;
    if (gamePaused) {
        if (animationId) { cancelAnimationFrame(animationId); animationId = null; }
        showNotification('⏸️ 游戏已暂停');
    } else {
        animationId = requestAnimationFrame(gameLoop);
        showNotification('▶️ 游戏已继续');
    }
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
    document.querySelectorAll('.panel').forEach(p => {
        p.classList.remove('active');
        p.style.display = 'none';
    });
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

// 确保lobby-panels容器可见（子面板才能显示）
function ensureLobbyPanelsVisible() {
    const lp = document.querySelector('.lobby-panels');
    if (lp) {
        lp.classList.add('active');
        lp.style.display = 'block';
    }
    const lobby = document.getElementById('lobby');
    if (lobby) {
        lobby.classList.remove('hidden');
        lobby.style.display = 'flex';
    }
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
    const panel = document.getElementById('settingsPanel');
    if (panel) UIAnimator.showPanel(panel);
}
window.showSettings = showSettings;

function hideSettings() {
    const panel = document.getElementById('settingsPanel');
    if (panel) UIAnimator.hidePanel(panel);
    if (gameRunning) {
    } else {
        showLobby();
    }
}
window.hideSettings = hideSettings;

// 右侧侧边栏控制
let sidebarOpen = false;

function toggleSidebar() {
    sidebarOpen = !sidebarOpen;
    const sidebar = document.getElementById('rightSidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (sidebar) {
        sidebar.classList.toggle('open', sidebarOpen);
    }
    if (overlay) {
        overlay.classList.toggle('active', sidebarOpen);
    }
    if (sidebarOpen) {
        updateSidebarStats();
        updateSidebarItems();
    }
}
window.toggleSidebar = toggleSidebar;

function switchSidebarTab(tabName) {
    // 更新标签按钮状态
    document.querySelectorAll('.sidebar-tab').forEach((btn, i) => {
        const tabs = ['settings', 'stats', 'items'];
        btn.classList.toggle('active', tabs[i] === tabName);
    });
    // 更新面板显示
    document.querySelectorAll('.sidebar-panel').forEach(panel => {
        panel.classList.remove('active');
    });
    const targetPanel = document.getElementById('sidebar-' + tabName);
    if (targetPanel) targetPanel.classList.add('active');
    // 刷新数据
    if (tabName === 'stats') updateSidebarStats();
    if (tabName === 'items') updateSidebarItems();
}
window.switchSidebarTab = switchSidebarTab;

function updateSidebarStats() {
    if (!player) return;
    const scoreEl = document.getElementById('sidebarScore');
    const killsEl = document.getElementById('sidebarKills');
    const timeEl = document.getElementById('sidebarTime');
    const coinsEl = document.getElementById('sidebarCoins');
    const accuracyEl = document.getElementById('sidebarAccuracy');
    
    if (scoreEl) scoreEl.textContent = player.score;
    if (killsEl) killsEl.textContent = player.kills;
    if (timeEl) timeEl.textContent = Math.floor(player.survivalTime || 0) + 's';
    if (coinsEl) coinsEl.textContent = playerData.coins;
    if (accuracyEl) {
        const shots = player.shotsFired || 0;
        const hits = player.shotsHit || 0;
        accuracyEl.textContent = shots > 0 ? Math.round((hits / shots) * 100) + '%' : '--';
    }
}

function updateSidebarItems() {
    const medkitEl = document.getElementById('sidebarMedkits');
    const ammoBoxEl = document.getElementById('sidebarAmmoBox');
    const grenadesEl = document.getElementById('sidebarGrenades');
    const speedBoostEl = document.getElementById('sidebarSpeedBoost');
    
    if (medkitEl) medkitEl.textContent = playerData.inventory?.medkits || 0;
    if (ammoBoxEl) ammoBoxEl.textContent = playerData.inventory?.ammoBox || 0;
    if (grenadesEl) grenadesEl.textContent = playerData.inventory?.grenades || 0;
    if (speedBoostEl) speedBoostEl.textContent = playerData.inventory?.speedBoost || 0;
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

// ==================== 改装面板函数 ====================

let selectedWeaponForMod = null;
let selectedWeaponForMarket = 'rifle';
let selectedLoadoutSlot = 'primary';

function getAvailableWeapons() {
    if (player && player.weapons && player.weapons.length > 0) {
        return player.weapons;
    }
    return WEAPONS.filter(w => w.unlocked);
}

function showModification() {
    document.querySelectorAll('.panel').forEach(p => { p.classList.remove('active'); p.style.display = 'none'; });
    ensureLobbyPanelsVisible();
    const panel = document.getElementById('modificationPanel');
    if (panel) { panel.classList.add('active'); panel.style.display = 'block'; }
    document.querySelectorAll('.func-btn').forEach(b => b.classList.remove('active'));
    const weapons = getAvailableWeapons();
    selectedWeaponForMod = weapons[0]?.id || null;
    renderModWeaponSelect();
    renderModShop();
    renderModEquipped();
    hideLobbyBottom();
}

function renderModWeaponSelect() {
    const grid = document.getElementById('modWeaponGrid');
    if (!grid) return;
    grid.innerHTML = '';

    const weapons = getAvailableWeapons();
    weapons.forEach(weapon => {
        const btn = document.createElement('div');
        btn.className = 'mod-weapon-btn' + (weapon.id === selectedWeaponForMod ? ' selected' : '');
        btn.innerHTML = `<span class="weapon-icon">${weapon.icon}</span><span class="weapon-name">${weapon.name}</span>`;
        btn.onclick = () => {
            selectedWeaponForMod = weapon.id;
            renderModWeaponSelect();
            renderModShop();
            renderModEquipped();
        };
        grid.appendChild(btn);
    });
}

function renderModShop() {
    const grid = document.getElementById('modShopGrid');
    if (!grid) return;
    grid.innerHTML = '';

    const selectedWeapon = selectedWeaponForMod ? WEAPONS.find(w => w.id === selectedWeaponForMod) : null;
    const isMelee = selectedWeapon && (selectedWeapon.type === WEAPON_TYPES.MELEE || selectedWeapon.isMelee);

    for (const [modId, mod] of Object.entries(MODIFICATIONS)) {
        const ownedCount = playerMods.ownedMods[modId] || 0;
        const equipped = selectedWeaponForMod && playerMods.equippedMods[selectedWeaponForMod]?.[modId];
        const canEquip = ownedCount > 0 && !equipped && !isMelee;

        const item = document.createElement('div');
        item.className = 'mod-item' + (equipped ? ' equipped' : (ownedCount > 0 ? ' owned' : '')) + (isMelee ? ' disabled' : '');
        item.innerHTML = `
            <span class="mod-icon">${mod.icon}</span>
            <span class="mod-name">${mod.name}</span>
            <span class="mod-desc">${mod.description}</span>
            <span class="mod-price">库存: ${ownedCount}</span>
        `;
        item.onclick = () => {
            if (!selectedWeaponForMod) {
                showNotification('请先选择武器');
                return;
            }
            if (isMelee) {
                showNotification('近战武器无法安装配件');
                return;
            }
            if (ownedCount <= 0 && !equipped) {
                showNotification('库存不足，请前往黑市购买');
                return;
            }
            const result = toggleMod(selectedWeaponForMod, modId);
            showNotification(result.message);
            renderModShop();
            renderModEquipped();
        };
        grid.appendChild(item);
    }
}

function renderModEquipped() {
    const list = document.getElementById('modEquippedList');
    if (!list) return;
    list.innerHTML = '';

    if (!selectedWeaponForMod) {
        list.innerHTML = '<span style="color:#8b949e;font-size:12px;">请先选择武器</span>';
        return;
    }

    const equipped = playerMods.equippedMods[selectedWeaponForMod] || {};
    const equippedList = Object.entries(equipped).filter(([_, v]) => v);

    if (equippedList.length === 0) {
        list.innerHTML = '<span style="color:#8b949e;font-size:12px;">该武器暂无配件</span>';
        return;
    }

    const container = document.createElement('div');
    container.className = 'mod-equipped-list';

    equippedList.forEach(([modId]) => {
        const mod = MODIFICATIONS[modId];
        const tag = document.createElement('span');
        tag.className = 'mod-equipped-tag';
        tag.innerHTML = `${mod.icon} ${mod.name}`;
        container.appendChild(tag);
    });

    list.appendChild(container);
}

function disableAllMods() {
    if (!playerMods || !playerMods.equippedMods) {
        showNotification('没有已装备的配件');
        return;
    }

    const equippedWeapons = Object.entries(playerMods.equippedMods).filter(([_, mods]) => {
        return Object.values(mods || {}).some(v => v);
    });

    if (equippedWeapons.length === 0) {
        showNotification('当前没有装备任何配件');
        return;
    }

    if (!confirm('确定要禁用所有武器上已装备的配件吗？拆卸后的配件将返还库存。')) {
        return;
    }

    let totalReturned = 0;
    for (const [weaponId, mods] of Object.entries(playerMods.equippedMods)) {
        for (const [modId, isActive] of Object.entries(mods || {})) {
            if (!isActive) continue;
            playerMods.ownedMods[modId] = (playerMods.ownedMods[modId] || 0) + 1;
            playerMods.equippedMods[weaponId][modId] = false;
            totalReturned++;
        }
    }

    savePlayerMods();
    renderModShop();
    renderModEquipped();
    updatePlayerStats();
    showNotification(`已禁用所有配件，共返还 ${totalReturned} 个配件到库存`);
}

// ==================== 皮肤面板函数 ====================

let currentSkinTab = 'weapon';

function showSkinTab(tab) {
    currentSkinTab = tab;
    document.querySelectorAll('.skin-tabs .tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.textContent.includes(tab === 'weapon' ? '武器' : '角色'));
    });
    document.getElementById('weaponSkinGrid').style.display = tab === 'weapon' ? 'grid' : 'none';
    document.getElementById('playerSkinGrid').style.display = tab === 'player' ? 'grid' : 'none';
    renderSkinGrid();

    // 切换 Tab 时更新预览区域显示当前装备的皮肤
    const equippedId = tab === 'weapon' ? playerMods.equippedWeaponSkin : playerMods.equippedPlayerSkin;
    if (equippedId) {
        updateSkinPreview(equippedId, tab);
    } else {
        // 显示默认皮肤预览
        const defaultSkin = tab === 'weapon' ? SKINS.weapons[0] : SKINS.players[0];
        if (defaultSkin) {
            updateSkinPreview(defaultSkin.id, tab);
        }
    }
}

function showSkins() {
    document.querySelectorAll('.panel').forEach(p => { p.classList.remove('active'); p.style.display = 'none'; });
    ensureLobbyPanelsVisible();
    const panel = document.getElementById('skinPanel');
    if (panel) { panel.classList.add('active'); panel.style.display = 'block'; }
    document.querySelectorAll('.func-btn').forEach(b => b.classList.remove('active'));
    showSkinTab('weapon');
    renderWeaponSkins();
    renderSkinGrid();
    updateSkinEquippedInfo();
    hideLobbyBottom();
}

function renderSkinGrid() {
    const gridId = currentSkinTab === 'weapon' ? 'weaponSkinGrid' : 'playerSkinGrid';
    const grid = document.getElementById(gridId);
    if (!grid) return;
    grid.innerHTML = '';

    const skins = currentSkinTab === 'weapon' ? SKINS.weapons : SKINS.players;
    const equippedId = currentSkinTab === 'weapon' ? playerMods.equippedWeaponSkin : playerMods.equippedPlayerSkin;

    skins.forEach(skin => {
        const owned = playerMods.ownedSkins.includes(skin.id);
        const equipped = skin.id === equippedId;

        const item = document.createElement('div');
        item.className = 'skin-item' + (equipped ? ' equipped' : (owned ? ' owned' : ''));

        const previewBg = skin.color || '#6366f1';
        item.innerHTML = `
            <div class="skin-preview" style="background: ${previewBg}; ${skin.pattern === 'metallic' ? 'background: linear-gradient(135deg, ' + previewBg + ', #fff5);' : ''}">
                ${currentSkinTab === 'weapon' ? '🔫' : '👤'}
            </div>
            <span class="skin-name">${skin.name}</span>
            ${equipped ? '<span class="skin-status">已装备 ✓</span>' : (owned ? '<span class="skin-status">已拥有</span>' : `<span class="skin-price">🪙 ${skin.price}</span>`)}
        `;

        item.onclick = () => {
            if (!owned) {
                const result = buySkin(skin.id, currentSkinTab);
                showNotification(result.message);
            } else {
                const result = equipSkin(skin.id, currentSkinTab);
                if (result.success) {
                    showNotification(result.message);
                    renderSkinGrid();
                    updateSkinEquippedInfo();
                } else {
                    showNotification(result.message);
                }
            }
        };

        grid.appendChild(item);
    });
}

function updateSkinEquippedInfo() {
    const wName = document.getElementById('currentWeaponSkinName');
    const pName = document.getElementById('currentPlayerSkinName');
    if (wName) {
        const wSkin = SKINS.weapons.find(s => s.id === playerMods.equippedWeaponSkin);
        wName.textContent = wSkin ? wSkin.name : '默认';
    }
    if (pName) {
        const pSkin = SKINS.players.find(s => s.id === playerMods.equippedPlayerSkin);
        pName.textContent = pSkin ? pSkin.name : '默认';
    }
}

// ==================== 弹药面板函数 ====================

function showAmmoPanel() {
    document.querySelectorAll('.panel').forEach(p => { p.classList.remove('active'); p.style.display = 'none'; });
    ensureLobbyPanelsVisible();
    const panel = document.getElementById('ammoPanel');
    if (panel) { panel.classList.add('active'); panel.style.display = 'block'; }
    document.querySelectorAll('.func-btn').forEach(b => b.classList.remove('active'));
    renderAmmoGrid();
    hideLobbyBottom();
}

function renderAmmoGrid() {
    const grid = document.getElementById('ammoGrid');
    if (!grid) return;
    grid.innerHTML = '';

    const ammoTypes = [
        { type: AMMO_TYPES.NORMAL, name: '普通弹', icon: '🔵' },
        { type: AMMO_TYPES.AP, name: '穿甲弹', icon: '🔴' },
        { type: AMMO_TYPES.EXP, name: '爆破弹', icon: '🟠' },
        { type: AMMO_TYPES.FIRE, name: '燃烧弹', icon: '🔥' }
    ];

    ammoTypes.forEach(({ type, name, icon }) => {
        const count = ammoInventory[type] || 0;
        const item = document.createElement('div');
        item.className = 'ammo-item';
        item.innerHTML = `
            <span class="ammo-icon">${icon}</span>
            <span class="ammo-name">${name}</span>
            <span class="ammo-count">${count}</span>
            <span class="ammo-type">剩余数量</span>
        `;
        grid.appendChild(item);
    });
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

    // 新版UI：大厅默认不显示面板，只显示中央角色和底部导航
    // 点击战备中心按钮才打开战备中心面板
    const readyRoom = document.getElementById('readyRoom');
    if (readyRoom) {
        readyRoom.classList.remove('active');
        readyRoom.style.display = 'none';
    }

    document.querySelectorAll('.func-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.lobby-func-btn').forEach(b => b.classList.remove('active'));

    // 确保游戏容器完全隐藏，防止遮挡大厅按钮
    hideGameUI();
    showLobbyBottom();
    updatePlayerStats();
    renderMapPreviews();
    if (!currentMission) {
        selectMissionForMap(playerData.selectedMap || 'desert');
    }
    updateReadyRoomMission();
    if (typeof showItemWheel === 'function') showItemWheel(false);
    if (typeof shiftHeld !== 'undefined') shiftHeld = false;
    if (window.lucide) lucide.createIcons();
    console.log('[LOBBY] Lobby shown');
}

function showPersonalInfo() {
    // 确保 lobby 可见（否则个人界面位于 lobby 内，隐藏会导致黑屏）
    const lobby = document.getElementById('lobby');
    if (lobby) {
        lobby.classList.remove('hidden');
        lobby.style.display = 'flex';
    }
    ensureLobbyPanelsVisible();

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

    AvatarManager.updateAvatarDisplay();
    renderMedalGrid();
    renderBadgeGrid();
}

function getMedalRarityStyle(rarity) {
    const styles = {
        bronze: 'background:linear-gradient(135deg,#cd7f32,#8b4513);box-shadow:0 0 8px #cd7f32;',
        silver: 'background:linear-gradient(135deg,#c0c0c0,#808080);box-shadow:0 0 8px #c0c0c0;',
        gold: 'background:linear-gradient(135deg,#ffd700,#b8860b);box-shadow:0 0 10px #ffd700;',
        platinum: 'background:linear-gradient(135deg,#e5e4e2,#708090);box-shadow:0 0 12px #e5e4e2;',
        diamond: 'background:linear-gradient(135deg,#b9f2ff,#00bcd4);box-shadow:0 0 14px #b9f2ff;'
    };
    return styles[rarity] || styles.bronze;
}

function renderMedalGrid() {
    const grid = document.getElementById('piMedalGrid');
    const countUnlocked = document.getElementById('piUnlockedMedalCount');
    const countTotal = document.getElementById('piTotalMedalCount');
    if (!grid) return;

    if (countUnlocked) countUnlocked.textContent = getUnlockedMedals().length;
    if (countTotal) countTotal.textContent = medals.length;

    grid.innerHTML = '';
    medals.slice().sort((a, b) => a.order - b.order).forEach(function(m) {
        const unlocked = unlockedMedalIds.has(m.id);
        const el = document.createElement('div');
        el.className = 'pi-medal' + (unlocked ? ' unlocked' : ' locked');
        el.title = m.description;
        el.innerHTML =
            '<div class="pi-medal-icon" style="' + (unlocked ? getMedalRarityStyle(m.rarity) : 'filter:grayscale(1);opacity:0.4;background:#333;') + '">' + m.icon + '</div>' +
            '<div class="pi-medal-name">' + m.name + '</div>';
        el.addEventListener('click', () => showMedalDetail(m));
        grid.appendChild(el);
    });
}

let currentDetailMedal = null;

function showMedalDetail(m) {
    if (!m) return;
    currentDetailMedal = m;
    const unlocked = unlockedMedalIds.has(m.id);
    const modal = document.getElementById('medalDetailModal') || createMedalDetailModal();
    document.getElementById('medalDetailName').textContent = (m.icon ? m.icon + ' ' : '') + m.name;
    document.getElementById('medalDetailIcon').style.cssText = getMedalRarityStyle(m.rarity);
    document.getElementById('medalDetailIcon').textContent = m.icon;
    document.getElementById('medalDetailDesc').textContent = m.description;
    document.getElementById('medalDetailStatus').textContent = unlocked ? '已解锁' : '未解锁';
    document.getElementById('medalDetailReward').textContent = m.reward && m.reward.coins ? '奖励：' + m.reward.coins + ' 金币' : '无额外奖励';
    modal.style.display = 'flex';
    UIAnimator.showPanel(modal, { display: 'flex' });
}

function createMedalDetailModal() {
    const modal = document.createElement('div');
    modal.id = 'medalDetailModal';
    modal.className = 'modal-panel';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.75);z-index:9998;display:none;justify-content:center;align-items:center;';
    modal.innerHTML = `
        <div class="modal-panel-inner" style="max-width:360px;width:90%;">
            <h2 id="medalDetailName" class="modal-title"></h2>
            <div id="medalDetailIcon" style="width:80px;height:80px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:40px;margin:0 auto 16px;"></div>
            <div class="modal-section"><div class="modal-label">描述：</div><div class="modal-value" id="medalDetailDesc"></div></div>
            <div class="modal-section"><div class="modal-label">状态：</div><div class="modal-value" id="medalDetailStatus"></div></div>
            <div class="modal-section"><div class="modal-label">奖励：</div><div class="modal-value" id="medalDetailReward"></div></div>
            <div style="text-align:center;margin-top:20px;"><button class="menu-btn" onclick="closeMedalDetail()">关闭</button></div>
        </div>
    `;
    document.body.appendChild(modal);
    return modal;
}

function closeMedalDetail() {
    const modal = document.getElementById('medalDetailModal');
    if (modal) UIAnimator.hidePanel(modal);
    currentDetailMedal = null;
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

    AvatarManager.updateAvatarDisplay();
}

function redeemCode(code) {
    if (!code) return { success: false, message: '请输入兑换码' };
    const upper = String(code).trim().toUpperCase();
    if (!upper) return { success: false, message: '请输入兑换码' };

    const entry = REDEEM_CODES.find(function(c) { return c.code === upper; });
    if (!entry) return { success: false, message: '兑换码不存在' };

    if (!Array.isArray(playerData.redeemedCodes)) {
        playerData.redeemedCodes = [];
    }
    if (playerData.redeemedCodes.indexOf(upper) !== -1) {
        return { success: false, message: '该兑换码已使用' };
    }

    playerData.redeemedCodes.push(upper);
    playerData.totalKills = (playerData.totalKills || 0) + entry.kills;
    playerData.coins = (playerData.coins || 0) + entry.coins;
    playerData.totalScore = (playerData.totalScore || 0) + entry.coins;
    savePlayerData();
    updatePlayerStats();
    return { success: true, message: '兑换成功！获得 ' + entry.kills + ' 击杀、' + entry.coins + ' 金币' };
}

function showRedeemCodePanel() {
    const modal = document.getElementById('redeemCodeModal');
    const input = document.getElementById('redeemCodeInput');
    const msg = document.getElementById('redeemCodeMessage');
    if (!modal) return;
    if (input) input.value = '';
    if (msg) msg.textContent = '';
    modal.style.display = 'flex';
    if (input) setTimeout(function() { input.focus(); }, 50);
}

function closeRedeemCodePanel() {
    const modal = document.getElementById('redeemCodeModal');
    if (modal) modal.style.display = 'none';
}

function submitRedeemCode() {
    const input = document.getElementById('redeemCodeInput');
    const msg = document.getElementById('redeemCodeMessage');
    const code = input ? input.value : '';
    const result = redeemCode(code);
    if (msg) {
        msg.textContent = result.message;
        msg.style.color = result.success ? '#00cc66' : '#ff6666';
    }
    if (result.success && input) input.value = '';
}

window.redeemCode = redeemCode;
window.showRedeemCodePanel = showRedeemCodePanel;
window.closeRedeemCodePanel = closeRedeemCodePanel;
window.submitRedeemCode = submitRedeemCode;

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
    const themes = ['desert', 'city', 'factory', 'jungle', 'snow', 'volcano', 'ruins', 'base'];
    const colors = {
        desert: { ground: '#2d2d1a', obstacle: '#8b7355', cover: '#4a3728', building: '#6b5344' },
        city: { ground: '#2a2a2a', obstacle: '#4a4a4a', cover: '#3a3a5a', building: '#5a5a6a' },
        factory: { ground: '#252525', obstacle: '#4a4a4a', cover: '#3a4a5a', building: '#5a5a7a' },
        jungle: { ground: '#1a2d1a', obstacle: '#2a4a2a', cover: '#1a3a4a', building: '#3a3a4a' },
        snow: { ground: '#4a4a5a', obstacle: '#6a6a7a', cover: '#5a6a8a', building: '#7a7a8a' },
        volcano: { ground: '#2d1a1a', obstacle: '#5a2a2a', cover: '#4a1a1a', building: '#6b3a3a' },
        ruins: { ground: '#2a2a20', obstacle: '#5a5a50', cover: '#4a4a40', building: '#6b6b5a' },
        base: { ground: '#1a1a2a', obstacle: '#3a3a4a', cover: '#2a2a3a', building: '#4a4a5a' }
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
    const themes = ['desert', 'city', 'factory', 'jungle', 'snow', 'volcano', 'ruins', 'base'];
    const colors = {
        desert: { ground: '#2d2d1a', obstacle: '#8b7355', cover: '#4a3728', building: '#6b5344' },
        city: { ground: '#2a2a2a', obstacle: '#4a4a4a', cover: '#3a3a5a', building: '#5a5a6a' },
        factory: { ground: '#252525', obstacle: '#4a4a4a', cover: '#3a4a5a', building: '#5a5a7a' },
        jungle: { ground: '#1a2d1a', obstacle: '#2a4a2a', cover: '#1a3a4a', building: '#3a3a4a' },
        snow: { ground: '#4a4a5a', obstacle: '#6a6a7a', cover: '#5a6a8a', building: '#7a7a8a' },
        volcano: { ground: '#2d1a1a', obstacle: '#5a2a2a', cover: '#4a1a1a', building: '#6b3a3a' },
        ruins: { ground: '#2a2a20', obstacle: '#5a5a50', cover: '#4a4a40', building: '#6b6b5a' },
        base: { ground: '#1a1a2a', obstacle: '#3a3a4a', cover: '#2a2a3a', building: '#4a4a5a' }
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

let currentNotificationEl = null;
let notificationTimeout = null;
let notificationMessages = [];
let notificationMergeId = null;

let _notificationHandle = null;

function showNotification(message, mergeId) {
    if (currentNotificationEl && notificationMergeId === mergeId && mergeId) {
        var prev = notificationMessages[notificationMessages.length - 1] || '';
        var merged = mergeNumericMessage(prev, message);
        notificationMessages[notificationMessages.length - 1] = merged;
        currentNotificationEl.textContent = merged;
    } else if (currentNotificationEl && !mergeId) {
        notificationMessages.push(message);
        currentNotificationEl.textContent = notificationMessages.join('\n');
    } else {
        if (_notificationHandle && _notificationHandle.dismiss) {
            _notificationHandle.dismiss();
        }
        _notificationHandle = UIAnimator.showAnimatedNotification(message);
        currentNotificationEl = _notificationHandle.element;
        notificationMessages = [message];
        notificationMergeId = mergeId || null;
    }

    clearTimeout(notificationTimeout);
    notificationTimeout = setTimeout(() => {
        if (_notificationHandle && _notificationHandle.dismiss) {
            _notificationHandle.dismiss();
            _notificationHandle = null;
        }
        if (currentNotificationEl) {
            currentNotificationEl.remove();
            currentNotificationEl = null;
        }
        notificationMessages = [];
        notificationMergeId = null;
    }, UIAnimator.getConfig().notificationStayDuration);
}

// 合并两条消息中的数字（累加同位置的数字）
function mergeNumericMessage(prev, curr) {
    // 如果两条消息模板相同（非数字部分一致），则累加数字
    var prevParts = prev.match(/(\D+)(\d+)(\D+)(\d+)(.*)/);
    var currParts = curr.match(/(\D+)(\d+)(\D+)(\d+)(.*)/);
    if (prevParts && currParts &&
        prevParts[1] === currParts[1] &&
        prevParts[3] === currParts[3] &&
        prevParts[5] === currParts[5]) {
        var num1 = parseInt(prevParts[2]) + parseInt(currParts[2]);
        var num2 = parseInt(prevParts[4]) + parseInt(currParts[4]);
        return prevParts[1] + num1 + prevParts[3] + num2 + prevParts[5];
    }
    // 模板不同则直接替换为最新消息
    return curr;
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
    ensureLobbyPanelsVisible();
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
    // 新版UI的底部导航
    const lobbyBottomNav = document.querySelector('.lobby-bottom-nav');
    if (lobbyBottomNav) {
        lobbyBottomNav.style.display = 'none';
    }
    // 隐藏中央角色展示区（面板打开时不需要显示）
    const lobbyCenter = document.querySelector('.lobby-center-area');
    if (lobbyCenter) {
        lobbyCenter.style.display = 'none';
    }
}

function showLobbyBottom() {
    const lobbyBottom = document.querySelector('.lobby-bottom');
    if (lobbyBottom) {
        lobbyBottom.style.display = '';
    }
    // 新版UI的底部导航
    const lobbyBottomNav = document.querySelector('.lobby-bottom-nav');
    if (lobbyBottomNav) {
        lobbyBottomNav.style.display = '';
    }
    // 显示中央角色展示区
    const lobbyCenter = document.querySelector('.lobby-center-area');
    if (lobbyCenter) {
        lobbyCenter.style.display = '';
    }
}

// 渲染武器库网格
function renderWeaponLibrary() {
    const grid = document.getElementById('weaponLibraryGrid');
    if (!grid) return;
    grid.innerHTML = '';
    
    // 从全局WEAPONS数组获取武器数据
    if (typeof WEAPONS !== 'undefined') {
        WEAPONS.forEach(w => {
            const card = document.createElement('div');
            const equippedPrimary = playerData.equippedWeapons && playerData.equippedWeapons.primary === w.id;
            const equippedSecondary = playerData.equippedWeapons && playerData.equippedWeapons.secondary === w.id;
            const equippedClass = equippedPrimary ? 'equipped-primary' : (equippedSecondary ? 'equipped-secondary' : '');
            card.className = `weapon-card ${w.unlocked ? 'owned' : 'locked'} ${equippedClass}`;
            const isMelee = w.isMelee || w.type === WEAPON_TYPES.MELEE;
            const currentAmmo = getWeaponAmmoType(w.id);
            
            let ammoSelectorHtml = '';
            if (w.unlocked && !isMelee) {
                const ammoTypes = [
                    { key: AMMO_TYPES.NORMAL, name: '普通', icon: '🔵' },
                    { key: AMMO_TYPES.AP, name: '穿甲', icon: '🔴' },
                    { key: AMMO_TYPES.EXP, name: '爆破', icon: '🟠' },
                    { key: AMMO_TYPES.FIRE, name: '燃烧', icon: '🔥' }
                ];
                ammoSelectorHtml = `
                    <div class="wc-ammo-selector">
                        <div class="wc-ammo-label">弹药:</div>
                        <div class="wc-ammo-btns">
                            ${ammoTypes.map(a => `
                                <button class="wc-ammo-btn ${currentAmmo === a.key ? 'active' : ''}" 
                                    onclick="event.stopPropagation(); selectWeaponAmmo('${w.id}', '${a.key}')"
                                    title="${a.name}弹">${a.icon}</button>
                            `).join('')}
                        </div>
                    </div>
                `;
            }
            
            card.innerHTML = `
                <div class="wc-icon">${w.icon || '🔫'}</div>
                <div class="wc-name">${w.name}</div>
                <div class="wc-type">${isMelee ? '近战' : w.type}</div>
                ${w.unlocked ? '<div style="color:var(--brand-accent);font-size:12px;">✓ 已拥有</div>' : '<div style="font-size:12px;">🔒</div>'}
                ${ammoSelectorHtml}
            `;
            if (w.unlocked) {
                card.onclick = () => selectWeapon(w.id);
            }
            grid.appendChild(card);
        });
    }
}

function selectWeaponAmmo(weaponId, ammoType) {
    if (ammoType !== AMMO_TYPES.NORMAL && (ammoInventory[ammoType] || 0) <= 0) {
        showNotification(`${getAmmoName(ammoType)}不足，无法切换`);
        return;
    }
    switchWeaponAmmo(weaponId, ammoType);
    renderWeaponLibrary();
    updateHUD();
    showNotification(`已切换为${getAmmoName(ammoType)}`);
}
window.selectWeaponAmmo = selectWeaponAmmo;

// 渲染弹药背包
function renderAmmoBackpack() {
    const list = document.getElementById('ammoBackpackList');
    if (!list) return;
    list.innerHTML = '';
    
    const ammoTypes = [
        { name: '普通弹', color: '#b8860b', key: 'normal' },
        { name: '穿甲弹', color: '#4a6fa5', key: 'ap' },
        { name: '爆破弹', color: '#ff6600', key: 'exp' },
        { name: '燃烧弹', color: '#ff3300', key: 'fire' }
    ];
    
    const ammo = playerData.ammo || {};

    ammoTypes.forEach(a => {
        const count = ammo[a.key] || 0;
        list.innerHTML += `
            <div class="ammo-backpack-item">
                <div class="ammo-dot" style="background:${a.color}"></div>
                <span class="ammo-name">${a.name}</span>
                <div class="ammo-qty-controls">
                    <button class="qty-btn minus" onclick="adjustAmmo('${a.key}', -10)">-</button>
                    <span class="ammo-count">x${count}</span>
                    <button class="qty-btn plus" onclick="adjustAmmo('${a.key}', 10)">+</button>
                </div>
            </div>
        `;
    });
}

function adjustAmmo(type, delta) {
    if (!playerData.ammo) playerData.ammo = {};
    const current = playerData.ammo[type] || 0;
    playerData.ammo[type] = Math.max(0, current + delta);
    savePlayerData();
    renderAmmoBackpack();
    updatePlayerStats();
}

// 渲染弹格栏
function renderAmmoSlots() {
    const row = document.getElementById('ammoSlotRow');
    if (!row) return;
    row.innerHTML = '';
    
    const slots = playerData.weaponAmmoSlots || [null, null, null, null, null, null];
    
    for (let i = 0; i < 6; i++) {
        const slot = slots[i];
        if (slot) {
            row.innerHTML += `
                <div class="ammo-slot ${i === 0 ? 'active' : ''}">
                    <span>${slot.icon || '🔵'}</span>
                    <span>x${slot.count}</span>
                </div>
            `;
        } else {
            row.innerHTML += `<div class="ammo-slot empty">空</div>`;
        }
    }
}

// 选择出战武器槽
function selectLoadoutSlot(slotType) {
    selectedLoadoutSlot = slotType === 'secondary' ? 'secondary' : 'primary';
    document.querySelectorAll('.weapon-loadout-slot').forEach(s => s.classList.remove('active'));
    const elId = selectedLoadoutSlot === 'primary' ? 'invPrimarySlot' : 'invSecondarySlot';
    const el = document.getElementById(elId);
    if (el) el.classList.add('active');
}

// 从武器库选择武器并装配到当前选中的槽位
function selectWeapon(weaponId) {
    const weapon = WEAPONS.find(w => w.id === weaponId);
    if (!weapon || !weapon.unlocked) {
        showNotification('该武器未解锁');
        return;
    }
    if (!playerData.equippedWeapons) playerData.equippedWeapons = {};

    // 如果该武器已在另一槽位，则交换或提示
    const otherSlot = selectedLoadoutSlot === 'primary' ? 'secondary' : 'primary';
    if (playerData.equippedWeapons[otherSlot] === weaponId) {
        showNotification('该武器已在另一槽位装备');
        return;
    }

    playerData.equippedWeapons[selectedLoadoutSlot] = weaponId;
    savePlayerData();
    updateInventoryWeaponInfo();
    renderWeaponLibrary();
    showNotification(`${weapon.name} 已装备为${selectedLoadoutSlot === 'primary' ? '主' : '副'}武器`);
}
window.selectWeapon = selectWeapon;

// 更新仓库武器信息
function updateInventoryWeaponInfo() {
    // 主武器
    const primaryWeapon = playerData.equippedWeapons && playerData.equippedWeapons.primary;
    if (primaryWeapon && typeof WEAPONS !== 'undefined') {
        const w = WEAPONS.find(x => x.id === primaryWeapon);
        if (w) {
            const el = document.getElementById('invPrimaryName');
            if (el) el.textContent = w.name;
        }
    }
    
    // 副武器
    const secondaryWeapon = playerData.equippedWeapons && playerData.equippedWeapons.secondary;
    if (secondaryWeapon && typeof WEAPONS !== 'undefined') {
        const w = WEAPONS.find(x => x.id === secondaryWeapon);
        if (w) {
            const el = document.getElementById('invSecondaryName');
            if (el) el.textContent = w.name;
        }
    }
}

// 渲染皮肤卡片
function renderWeaponSkins() {
    const grid = document.getElementById('weaponSkinGrid');
    if (!grid) return;
    grid.innerHTML = '';
    
    const skins = [
        { id: 'default', name: '默认', price: 0, skinClass: 'skin-default', owned: true, equipped: true },
        { id: 'carbon', name: '碳纤维', price: 500, skinClass: 'skin-carbon', owned: true, equipped: false },
        { id: 'gold', name: '黄金', price: 1000, skinClass: 'skin-gold', owned: false },
        { id: 'camo', name: '迷彩', price: 800, skinClass: 'skin-camo', owned: false },
        { id: 'neon', name: '霓虹', price: 1200, skinClass: 'skin-neon', owned: false },
        { id: 'red', name: '赤红', price: 600, skinClass: 'skin-red', owned: false },
        { id: 'blue', name: '深蓝', price: 600, skinClass: 'skin-blue', owned: false },
        { id: 'purple', name: '紫晶', price: 1500, skinClass: 'skin-purple', owned: false }
    ];
    
    const ownedSkins = playerData.ownedSkins || ['default', 'carbon'];
    const equippedSkin = playerData.equippedSkin || 'default';
    
    skins.forEach(s => {
        s.owned = ownedSkins.includes(s.id);
        s.equipped = equippedSkin === s.id;
        
        const card = document.createElement('div');
        card.className = `skin-card ${s.equipped ? 'equipped' : ''}`;
        card.innerHTML = `
            <div class="skin-preview">
                <div class="weapon-silhouette ${s.skinClass}">
                    <div class="ws-stock"></div>
                    <div class="ws-body"></div>
                    <div class="ws-barrel"></div>
                    <div class="ws-magazine"></div>
                    <div class="ws-grip"></div>
                    <div class="ws-sight"></div>
                </div>
            </div>
            <div style="padding:12px;">
                <div style="font-size:14px;color:var(--color-text-primary);font-weight:bold;">${s.name}</div>
                ${s.equipped ? '<div style="font-size:12px;color:var(--brand-accent);">使用中</div>' :
                  s.owned ? `<button class="mod-buy-btn" onclick="equipSkin('${s.id}')">装备</button>` :
                  `<div style="font-size:12px;color:var(--brand-secondary);">🪙 ${s.price}</div>
                   <button class="mod-buy-btn" onclick="buySkin('${s.id}')">购买</button>`}
            </div>
        `;
        card.onclick = () => previewSkin(s);
        grid.appendChild(card);
    });
}

// 预览皮肤
function previewSkin(skin) {
    const preview = document.getElementById('skinPreviewWeapon');
    const name = document.getElementById('skinPreviewName');
    if (preview) {
        preview.innerHTML = `
            <div class="weapon-silhouette ${skin.skinClass}">
                <div class="ws-stock"></div>
                <div class="ws-body"></div>
                <div class="ws-barrel"></div>
                <div class="ws-magazine"></div>
                <div class="ws-grip"></div>
                <div class="ws-sight"></div>
            </div>
        `;
    }
    if (name) name.textContent = skin.name;
}

// 购买皮肤
// 皮肤预览和购买由原有的 buySkin/equipSkin 函数处理

// 受击变红效果
function showDamageFlash() {
    const flash = document.getElementById('damageFlash');
    if (flash) {
        flash.style.opacity = '0.6';
        setTimeout(() => { flash.style.opacity = '0'; }, 150);
    }
}

// 血量变化时更新暗角
function updateDamageVignette(healthPercent) {
    const vignette = document.getElementById('damageVignette');
    if (vignette) {
        vignette.style.opacity = Math.max(0, (1 - healthPercent) * 0.3).toString();
    }
}

// 小地图绘制
function drawMinimap() {
    const canvas = document.getElementById('minimapCanvas');
    const minimap = document.getElementById('minimap');
    if (!canvas || !minimap) return;
    
    const ctx = canvas.getContext('2d');
    const scale = canvas.width / (typeof mapWidth !== 'undefined' ? mapWidth : 2000);
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 绘制地形底色
    ctx.fillStyle = '#1a2a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // 绘制网格
    ctx.strokeStyle = 'rgba(74, 93, 35, 0.2)';
    for (let x = 0; x < canvas.width; x += 20) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 20) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
    
    // 绘制建筑物（如果有的话）
    if (typeof buildings !== 'undefined' && buildings.length > 0) {
        buildings.forEach(b => {
            ctx.fillStyle = '#333';
            ctx.fillRect(b.x * scale, b.y * scale, Math.max(4, b.w * scale), Math.max(4, b.h * scale));
        });
    }
    
    // 绘制敌人
    if (typeof enemies !== 'undefined') {
        enemies.forEach(e => {
            if (!e.dead) {
                ctx.fillStyle = '#cc3333';
                ctx.beginPath();
                ctx.arc(e.x * scale, e.y * scale, 2, 0, Math.PI * 2);
                ctx.fill();
            }
        });
    }
    
    // 绘制玩家
    if (typeof player !== 'undefined') {
        ctx.fillStyle = '#00ff88';
        ctx.shadowColor = '#00ff88';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(player.x * scale, player.y * scale, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    }
}

// 显示/隐藏小地图
function toggleMinimap(show) {
    const minimap = document.getElementById('minimap');
    if (minimap) {
        minimap.style.display = show ? 'block' : 'none';
    }
}

function showInventory() {
    console.log('[INVENTORY] Showing inventory');
    document.querySelectorAll('.panel').forEach(p => { p.classList.remove('active'); p.style.display = 'none'; });
    ensureLobbyPanelsVisible();
    const panel = document.getElementById('inventoryPanel');
    if (panel) { panel.classList.add('active'); panel.style.display = 'block'; }
    document.querySelectorAll('.func-btn').forEach(b => b.classList.remove('active'));
    const secondBtn = document.querySelector('.func-btn:nth-child(2)');
    if (secondBtn) secondBtn.classList.add('active');
    hideLobbyBottom();
    
    // 渲染仓库内容
    renderWeaponLibrary();
    renderAmmoBackpack();
    renderAmmoSlots();
    updateInventoryWeaponInfo();
}

function showBlackMarket() {
    console.log('[MARKET] Showing black market');
    document.querySelectorAll('.panel').forEach(p => { p.classList.remove('active'); p.style.display = 'none'; });
    ensureLobbyPanelsVisible();
    const panel = document.getElementById('blackMarketPanel');
    if (panel) { panel.classList.add('active'); panel.style.display = 'block'; }
    document.querySelectorAll('.func-btn').forEach(b => b.classList.remove('active'));
    const thirdBtn = document.querySelector('.func-btn:nth-child(3)');
    if (thirdBtn) thirdBtn.classList.add('active');
    updateMarketUI();
    if (typeof updateModTreeDisplay === 'function') updateModTreeDisplay();
    if (typeof updateMarketGold === 'function') updateMarketGold();
    hideLobbyBottom();
}

function buyAttachment(modId) {
    const result = buyMod(modId);
    showNotification(result.message);
    updateMarketUI();
}

function buyWeapon(weaponId) {
    const weapon = WEAPONS.find(w => w.id === weaponId);
    if (!weapon) return;
    if (weapon.unlocked) {
        showNotification('已拥有该武器');
        return;
    }
    if (playerData.coins < weapon.price) {
        showNotification('金币不足！');
        return;
    }
    playerData.coins -= weapon.price;
    weapon.unlocked = true;
    savePlayerData();
    updatePlayerStats();
    showNotification(`解锁了 ${weapon.name}！`);
    updateMarketUI();
}

function switchMarketTab(tab) {
    const tabs = document.querySelectorAll('.mkt-tab');
    const names = ['weapon', 'attachment', 'ammo', 'armor', 'consumable', 'sell'];
    tabs.forEach((t, i) => {
        if (names[i] === tab) {
            t.classList.add('active');
        } else {
            t.classList.remove('active');
        }
    });
    
    const weaponSection = document.querySelector('.market-weapon-section');
    const attachmentSection = document.querySelector('.market-attachment-section');
    const ammoSection = document.querySelector('.market-ammo-section');
    const armorSection = document.querySelector('.market-armor-section');
    const consumableSection = document.querySelector('.market-consumable-section');
    const sellSection = document.querySelector('.market-sell-section');
    
    [weaponSection, attachmentSection, ammoSection, armorSection, consumableSection, sellSection].forEach(s => {
        if (s) s.style.display = 'none';
    });
    
    if (tab === 'weapon' && weaponSection) {
        weaponSection.style.display = 'block';
        updateMarketGold();
        renderWeaponMarketGrid();
    }
    if (tab === 'attachment' && attachmentSection) {
        attachmentSection.style.display = 'block';
        updateMarketGold();
        renderAttachmentMarketGrid();
    }
    if (tab === 'ammo' && ammoSection) {
        ammoSection.style.display = 'block';
        updateMarketGold();
        renderAmmoMarketGrid();
    }
    if (tab === 'armor' && armorSection) {
        armorSection.style.display = 'block';
        updateMarketGold();
        renderArmorMarketGrid();
    }
    if (tab === 'consumable' && consumableSection) {
        consumableSection.style.display = 'block';
        updateMarketGold();
        renderConsumableMarketGrid();
    }
    if (tab === 'sell' && sellSection) {
        sellSection.style.display = 'block';
        updateMarketGold();
        renderSellMarketGrid();
    }
}


function updateMarketGold() {
    const el = document.getElementById('marketGold');
    if (el) el.textContent = playerData.coins;
}

function renderWeaponMarketGrid() {
    const grid = document.getElementById('weaponMarketGrid');
    if (!grid) return;
    grid.innerHTML = '';

    WEAPONS.forEach(weapon => {
        if (weapon.id === 'pistol' || weapon.id === 'rifle' || weapon.id === 'sniper') return;

        const item = document.createElement('div');
        item.className = 'market-item' + (weapon.unlocked ? ' unlocked' : '');
        item.innerHTML = `
            <div class="item-icon">${weapon.icon}</div>
            <div class="item-info">
                <div class="item-name">${weapon.name}</div>
                <div class="item-desc">${weapon.description || '伤害: ' + weapon.damage + ' | 射速: ' + weapon.fireRate}</div>
            </div>
            <div class="item-price">🪙 ${weapon.price}</div>
            <button class="buy-btn" ${weapon.unlocked ? 'disabled' : ''}>${weapon.unlocked ? '已拥有' : '购买'}</button>
        `;
        item.querySelector('.buy-btn').onclick = () => buyWeapon(weapon.id);
        grid.appendChild(item);
    });
}

function renderAttachmentMarketGrid() {
    const grid = document.getElementById('attachmentMarketGrid');
    if (!grid) return;
    grid.innerHTML = '';

    for (const [modId, mod] of Object.entries(MODIFICATIONS)) {
        const ownedCount = playerMods.ownedMods[modId] || 0;

        const item = document.createElement('div');
        item.className = 'market-item';
        item.innerHTML = `
            <div class="item-icon">${mod.icon}</div>
            <div class="item-info">
                <div class="item-name">${mod.name}</div>
                <div class="item-desc">${mod.description}</div>
            </div>
            <div class="item-price">🪙 ${mod.price} | 库存: ${ownedCount}</div>
            <button class="buy-btn">购买</button>
        `;
        item.querySelector('.buy-btn').onclick = () => {
            buyAttachment(modId);
            renderAttachmentMarketGrid();
            updateMarketGold();
        };
        grid.appendChild(item);
    }
}

function getAmmoTypeFromId(id) {
    const map = {
        'ammo_normal': AMMO_TYPES.NORMAL,
        'ammo_ap': AMMO_TYPES.AP,
        'ammo_exp': AMMO_TYPES.EXP,
        'ammo_fire': AMMO_TYPES.FIRE
    };
    return map[id] || null;
}

function renderAmmoMarketGrid() {
    const grid = document.getElementById('ammoMarketGrid');
    if (!grid) return;
    grid.innerHTML = '';

    const ammoTypes = [
        { id: 'ammo_normal', name: '普通弹药', icon: '🔵', desc: '标准弹药，平衡的伤害和性价比' },
        { id: 'ammo_ap', name: '穿甲弹药', icon: '🟡', desc: '穿透护甲，对装甲目标伤害更高' },
        { id: 'ammo_exp', name: '爆破弹药', icon: '🔴', desc: '爆炸伤害，对群体目标有效' },
        { id: 'ammo_fire', name: '燃烧弹药', icon: '🟠', desc: '点燃目标，造成持续伤害' }
    ];

    ammoTypes.forEach(ammo => {
        const price = getItemPrice(ammo.id);
        const ammoType = getAmmoTypeFromId(ammo.id);
        const ownedCount = ammoInventory[ammoType] || 0;

        const item = document.createElement('div');
        item.className = 'market-item';
        item.innerHTML = `
            <div class="item-icon">${ammo.icon}</div>
            <div class="item-info">
                <div class="item-name">${ammo.name}</div>
                <div class="item-desc">${ammo.desc}</div>
            </div>
            <div class="item-price">🪙 ${price} | 库存: ${ownedCount}</div>
            <button class="buy-btn">购买</button>
        `;
        item.querySelector('.buy-btn').onclick = () => {
            buyItem(ammo.id);
            renderAmmoMarketGrid();
            updateMarketGold();
        };
        grid.appendChild(item);
    });
}

function renderArmorMarketGrid() {
    const grid = document.getElementById('armorMarketGrid');
    if (!grid) return;
    grid.innerHTML = '';

    const armors = [
        { id: 'armor_light', name: '轻型护甲', icon: '🦺', desc: '提供基础防护，不影响移动速度' },
        { id: 'armor_heavy', name: '重型护甲', icon: '🛡️', desc: '提供高级防护，略微降低移动速度' }
    ];

    armors.forEach(armor => {
        const price = getItemPrice(armor.id);
        const ownedCount = playerData.inventory[armor.id] || 0;

        const item = document.createElement('div');
        item.className = 'market-item';
        item.innerHTML = `
            <div class="item-icon">${armor.icon}</div>
            <div class="item-info">
                <div class="item-name">${armor.name}</div>
                <div class="item-desc">${armor.desc}</div>
            </div>
            <div class="item-price">🪙 ${price} | 库存: ${ownedCount}</div>
            <button class="buy-btn">购买</button>
        `;
        item.querySelector('.buy-btn').onclick = () => {
            buyItem(armor.id);
            renderArmorMarketGrid();
            updateMarketGold();
        };
        grid.appendChild(item);
    });
}

function renderConsumableMarketGrid() {
    const grid = document.getElementById('consumableMarketGrid');
    if (!grid) return;
    grid.innerHTML = '';

    const consumables = [
        { id: 'medkit', name: '医疗包', icon: '💊', desc: '恢复生命值' },
        { id: 'grenade', name: '手雷', icon: '💣', desc: '投掷爆炸物，造成范围伤害' },
        { id: 'ammoBox', name: '弹药箱', icon: '📦', desc: '补充各类弹药' },
        { id: 'speedBoost', name: '加速卡', icon: '⚡', desc: '临时提升移动速度' }
    ];

    consumables.forEach(item => {
        const price = getItemPrice(item.id);
        const itemKey = item.id === 'ammoBox' ? 'ammoBoxes' : (item.id + 's');
        const ownedCount = playerData.inventory[itemKey] || playerData.inventory[item.id] || 0;

        const div = document.createElement('div');
        div.className = 'market-item';
        div.innerHTML = `
            <div class="item-icon">${item.icon}</div>
            <div class="item-info">
                <div class="item-name">${item.name}</div>
                <div class="item-desc">${item.desc}</div>
            </div>
            <div class="item-price">🪙 ${price} | 库存: ${ownedCount}</div>
            <button class="buy-btn">购买</button>
        `;
        div.querySelector('.buy-btn').onclick = () => {
            buyItem(item.id);
            renderConsumableMarketGrid();
            updateMarketGold();
        };
        grid.appendChild(div);
    });
}

function renderSellMarketGrid() {
    const grid = document.getElementById('sellMarketGrid');
    if (!grid) return;
    grid.innerHTML = '';

    const sellItems = [
        { id: 'medkit', name: '医疗包', icon: '💊', desc: '恢复生命值' },
        { id: 'grenade', name: '手雷', icon: '💣', desc: '投掷爆炸物，造成范围伤害' },
        { id: 'ammoBox', name: '弹药箱', icon: '📦', desc: '补充各类弹药' }
    ];

    sellItems.forEach(item => {
        const sellPrice = getSellPrice(item.id);
        const itemKey = item.id === 'ammoBox' ? 'ammoBoxes' : (item.id + 's');
        const ownedCount = playerData.inventory[itemKey] || playerData.inventory[item.id] || 0;

        const div = document.createElement('div');
        div.className = 'market-item';
        div.innerHTML = `
            <div class="item-icon">${item.icon}</div>
            <div class="item-info">
                <div class="item-name">${item.name}</div>
                <div class="item-desc">${item.desc}</div>
            </div>
            <div class="item-price">出售价: 🪙 ${sellPrice} | 库存: ${ownedCount}</div>
            <button class="buy-btn" ${ownedCount <= 0 ? 'disabled' : ''}>出售</button>
        `;
        div.querySelector('.buy-btn').onclick = () => {
            sellItem(item.id);
            renderSellMarketGrid();
            updateMarketGold();
        };
        grid.appendChild(div);
    });
}

function selectModNode(modId) {
    const mod = MODIFICATIONS[modId];
    if (!mod) return;

    const weaponId = selectedWeaponForMarket || selectedWeaponForMod || 'rifle';
    const equipped = playerMods.equippedMods[weaponId]?.[modId];
    const ownedCount = playerMods.ownedMods[modId] || 0;

    if (equipped) {
        const result = toggleMod(weaponId, modId);
        showNotification(result.message);
    } else if (ownedCount > 0) {
        const result = toggleMod(weaponId, modId);
        showNotification(result.message);
    } else {
        if (playerData.coins >= mod.price) {
            const buyResult = buyMod(modId);
            if (buyResult.success) {
                const equipResult = toggleMod(weaponId, modId);
                showNotification('购买并装备了 ' + mod.name + '！');
            }
        } else {
            showNotification('金币不足！');
        }
    }

    updateModTreeDisplay();
    updatePlayerStats();
}

function updateModTreeDisplay() {
    const modNodes = [
        { id: 'scope', nodeId: 'modNodeScope', statusId: 'modNodeScopeStatus' },
        { id: 'suppressor', nodeId: 'modNodeSuppressor', statusId: 'modNodeSuppressorStatus' },
        { id: 'extendedMag', nodeId: 'modNodeExtendedMag', statusId: 'modNodeExtendedMagStatus' },
        { id: 'grip', nodeId: 'modNodeGrip', statusId: 'modNodeGripStatus' },
        { id: 'apRounds', nodeId: 'modNodeAPRounds', statusId: 'modNodeAPRoundsStatus' },
        { id: 'stock', nodeId: 'modNodeStock', statusId: 'modNodeStockStatus' }
    ];

    const weaponId = selectedWeaponForMarket || selectedWeaponForMod || 'rifle';

    modNodes.forEach(({ id, nodeId, statusId }) => {
        const node = document.getElementById(nodeId);
        const status = document.getElementById(statusId);
        if (!node) return;

        node.classList.remove('equipped', 'owned', 'locked');

        const equipped = playerMods.equippedMods[weaponId]?.[id];
        const ownedCount = playerMods.ownedMods[id] || 0;

        if (equipped) {
            node.classList.add('equipped');
            if (status) status.textContent = '已装备';
        } else if (ownedCount > 0) {
            node.classList.add('owned');
            if (status) status.textContent = '已拥有 (' + ownedCount + ')';
        } else {
            node.classList.add('locked');
            const mod = MODIFICATIONS[id];
            if (status && mod) status.textContent = '🪙 ' + mod.price;
        }
    });
}

function showMapSelect() {
    console.log('[MAP] Showing map select');
    document.querySelectorAll('.panel').forEach(p => { p.classList.remove('active'); p.style.display = 'none'; });
    ensureLobbyPanelsVisible();
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
            BackpackManager.addItem('medkit', 1);
            break;
        case 'armor_light':
            playerData.inventory.armor_light = (playerData.inventory.armor_light || 0) + 1;
            BackpackManager.addItem('armor_light', 1);
            break;
        case 'armor_heavy':
            playerData.inventory.armor_heavy = (playerData.inventory.armor_heavy || 0) + 1;
            BackpackManager.addItem('armor_heavy', 1);
            break;
        case 'grenade':
            playerData.inventory.grenades = (playerData.inventory.grenades || 0) + 1;
            BackpackManager.addItem('grenade', 1);
            break;
        case 'ammoBox':
            playerData.inventory.ammoBox = (playerData.inventory.ammoBox || 0) + 1;
            BackpackManager.addItem('ammoBox', 1);
            for (const type of Object.values(AMMO_TYPES)) {
                ammoInventory[type] = (ammoInventory[type] || 0) + 30;
                addAmmoToBackpack(type, 30);
            }
            break;
        case 'speedBoost':
            playerData.inventory.speedBoost = (playerData.inventory.speedBoost || 0) + 1;
            BackpackManager.addItem('speedBoost', 1);
            break;
        case 'ammo_normal':
            ammoInventory[AMMO_TYPES.NORMAL] = (ammoInventory[AMMO_TYPES.NORMAL] || 0) + 50;
            addAmmoToBackpack(AMMO_TYPES.NORMAL, 50);
            break;
        case 'ammo_ap':
            ammoInventory[AMMO_TYPES.AP] = (ammoInventory[AMMO_TYPES.AP] || 0) + 20;
            addAmmoToBackpack(AMMO_TYPES.AP, 20);
            break;
        case 'ammo_exp':
            ammoInventory[AMMO_TYPES.EXP] = (ammoInventory[AMMO_TYPES.EXP] || 0) + 10;
            addAmmoToBackpack(AMMO_TYPES.EXP, 10);
            break;
        case 'ammo_fire':
            ammoInventory[AMMO_TYPES.FIRE] = (ammoInventory[AMMO_TYPES.FIRE] || 0) + 15;
            addAmmoToBackpack(AMMO_TYPES.FIRE, 15);
            break;
    }

    showNotification(`购买成功！${getItemDisplayName(itemName)}`);
    updatePlayerStats();
    updateMarketUI();
    savePlayerMods(); // 保存弹药库存
    syncAmmoUI(); // 同步弹药 UI
}

function sellItem(itemName) {
    const itemKey = getItemKey(itemName);
    const price = getSellPrice(itemName);
    const bpItemId = itemName === 'ammoBox' ? 'ammoBox'
        : itemName === 'medkit' ? 'medkit'
        : itemName === 'grenade' ? 'grenade'
        : itemName === 'speedBoost' ? 'speedBoost'
        : itemName === 'armor_light' ? 'armor_light'
        : itemName === 'armor_heavy' ? 'armor_heavy'
        : itemKey;

    if (!itemKey || (!playerData.inventory[itemKey] || playerData.inventory[itemKey] <= 0) || !BackpackManager.hasItem(bpItemId, 1)) {
        showNotification('没有可出售的物品！');
        return;
    }

    playerData.inventory[itemKey]--;
    BackpackManager.removeItem(bpItemId, 1);
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
        speedBoost: 200,
        ammo_normal: 50,
        ammo_ap: 120,
        ammo_exp: 180,
        ammo_fire: 150
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
        if (save.playerData) Object.assign(playerData, save.playerData);
        if (save.settings) Object.assign(settings, save.settings);
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
        if (save.playerData) Object.assign(playerData, save.playerData);
        if (save.settings) Object.assign(settings, save.settings);
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

// ===== Announcement System =====
// 公告配置：每次更新时添加一条，只写玩家需要知道的内容
const ANNOUNCEMENTS = [
    {
        version: '2026-07-26',
        title: '7月26日更新公告',
        date: '2026-07-26',
        content: '各位战士，本次更新内容如下：\n\n' +
            '✅ 新增更新公告系统，重要内容将通过弹窗与信箱同步推送\n' +
            '✅ 地图美术全面升级，8张地图配色与细节更加鲜明\n' +
            '✅ 近战武器（匕首、砍刀）不再能装备配件\n' +
            '✅ 购买弹药后仓库与弹药库 UI 实时同步\n' +
            '✅ 新手教程改为界面导览，自动带你熟悉各个功能入口\n' +
            '✅ Boss 战斗优化：顶部血条、修复穿墙、击杀奖励提升\n' +
            '✅ 移速优化：按住 Ctrl + WASD 可持续加速，最高 150%\n' +
            '✅ 特殊子弹（穿甲/爆裂/燃烧）效果与显示修复\n' +
            '✅ 反作弊检测逻辑优化，减少正常游玩误报\n' +
            '✅ 使用物品与换弹增加冷却，避免误触连发\n\n' +
            '祝大家战斗愉快！'
    },
    {
        version: '2026-07-26-v2',
        title: '自迭代10代更新公告',
        date: '2026-07-26',
        content: '各位战士，自迭代10代已完成，本次更新内容如下：\n\n' +
            '✅ 敌人 AI 全面升级：会根据你的武器类型调整战术，残血时还会尝试逃跑\n' +
            '✅ 地图视觉再次升级：新增裂缝、窗户、沙袋、水面波纹等层次细节\n' +
            '✅ 战斗反馈增强：敌人受击闪烁、击杀爆发特效，手感更爽快\n' +
            '✅ 新增任务：丛林猎杀、Boss 猎手，挑战更多奖励\n' +
            '✅ 反作弊能力增强：覆盖更多常见作弊工具检测\n' +
            '✅ 性能优化：地图渲染热路径减少函数调用，帧率更稳定\n' +
            '✅ 新手教程高亮跟随更精准，切换面板后自动重新定位\n\n' +
            '祝大家战斗愉快！'
    }
];

function getLatestAnnouncement() {
    return ANNOUNCEMENTS[ANNOUNCEMENTS.length - 1] || null;
}

function cleanupOldAnnouncements() {
    if (_mailListCache === null) {
        try {
            const stored = localStorage.getItem('deathTrench_mails');
            _mailListCache = stored ? JSON.parse(stored) : getDefaultMails();
        } catch (e) { _mailListCache = getDefaultMails(); }
    }
    const announcementVersions = ANNOUNCEMENTS.map(a => a.version);
    _mailListCache = _mailListCache.filter(m => !m.isAnnouncement || announcementVersions.includes(m.announcementVersion));
    saveMailsToStorage();
}

function addAnnouncementToMailbox(announcement) {
    if (!announcement) return;
    if (_mailListCache === null) {
        try {
            const stored = localStorage.getItem('deathTrench_mails');
            _mailListCache = stored ? JSON.parse(stored) : getDefaultMails();
        } catch (e) { _mailListCache = getDefaultMails(); }
    }
    // 避免重复添加同一版本
    const exists = _mailListCache.some(m => m.isAnnouncement && m.announcementVersion === announcement.version);
    if (exists) return;

    const mail = {
        id: 'announcement_' + announcement.version,
        sender: '指挥部',
        subject: announcement.title,
        body: announcement.content,
        date: announcement.date + ' 00:00',
        unread: true,
        isAnnouncement: true,
        announcementVersion: announcement.version
    };
    _mailListCache.unshift(mail);
    saveMailsToStorage();
}

function showAnnouncement(announcement) {
    if (!announcement) return;
    const modal = document.getElementById('announcementModal');
    const versionEl = document.getElementById('announcementVersion');
    const dateEl = document.getElementById('announcementDate');
    const contentEl = document.getElementById('announcementContent');
    const dontShow = document.getElementById('announcementDontShow');
    if (!modal) return;

    if (versionEl) versionEl.textContent = 'v' + announcement.version;
    if (dateEl) dateEl.textContent = announcement.date;
    if (contentEl) contentEl.textContent = announcement.content;
    if (dontShow) dontShow.checked = false;

    modal.style.display = 'flex';
}

function closeAnnouncement() {
    const modal = document.getElementById('announcementModal');
    const dontShow = document.getElementById('announcementDontShow');
    if (modal) modal.style.display = 'none';

    const announcement = getLatestAnnouncement();
    if (announcement && dontShow && dontShow.checked) {
        try {
            localStorage.setItem('deathTrench_last_announcement', announcement.version);
        } catch (e) {}
    }
}
window.closeAnnouncement = closeAnnouncement;

function checkAndShowAnnouncement() {
    const announcement = getLatestAnnouncement();
    if (!announcement) return;

    // 清理旧版本公告邮件
    cleanupOldAnnouncements();
    // 添加最新公告到信箱
    addAnnouncementToMailbox(announcement);

    // 检查玩家是否已经关闭过此版本公告
    let lastSeen = '';
    try { lastSeen = localStorage.getItem('deathTrench_last_announcement') || ''; } catch (e) {}
    if (lastSeen === announcement.version) return;

    showAnnouncement(announcement);
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
    console.log('[DEBUG] tryOpenTools called, ENABLE_TOOLS:', window.ENABLE_TOOLS);
    console.log('[DEBUG] electronAPI:', window.electronAPI);
    if (typeof checkDevModeAndOpenTools === 'function') {
        checkDevModeAndOpenTools();
    } else {
        console.error('[ERROR] checkDevModeAndOpenTools not found');
    }
}

async function checkDevModeAndOpenTools() {
    console.log('[DEBUG] checkDevModeAndOpenTools started');
    let enableTools = typeof window.ENABLE_TOOLS !== 'undefined' ? window.ENABLE_TOOLS : false;
    console.log('[DEBUG] initial enableTools:', enableTools);
    if (!enableTools && window.electronAPI && window.electronAPI.isDevMode) {
        try {
            enableTools = await window.electronAPI.isDevMode();
            window.ENABLE_TOOLS = enableTools;
            console.log('[DEBUG] after isDevMode check:', enableTools);
        } catch (e) {
            console.warn('[DEBUG] Failed to check dev mode:', e);
        }
    }
    if (!enableTools) {
        console.log('[DEBUG] tools not enabled, showing notification');
        showNotification('编辑器功能仅在开发版可用');
        return;
    }
    console.log('[DEBUG] opening tools prompt');
    document.getElementById('toolsPromptError').textContent = '';
    document.getElementById('toolsPasswordInput').value = '';
    const overlay = document.getElementById('toolsPromptOverlay');
    overlay.classList.add('active');
    overlay.style.display = 'flex';
    setTimeout(function() {
        const inp = document.getElementById('toolsPasswordInput');
        if (inp) inp.focus();
    }, 30);
}
function closeToolsPrompt() {
    const overlay = document.getElementById('toolsPromptOverlay');
    overlay.classList.remove('active');
    overlay.style.display = 'none';
}
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

// ===== Mission System (任务系统）=====
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
        { id: 'task_kill3', type: 'kill', nameZh: '丛林猎杀', nameEn: 'Jungle Hunt', descZh: '在丛林地图消灭25名敌人', descEn: 'Eliminate 25 enemies in jungle', target: 25, reward: 700, map: 'jungle' },
        { id: 'task_extract', type: 'extract', nameZh: '成功撤离', nameEn: 'Successful Extraction', descZh: '活着离开战场', descEn: 'Leave the battlefield alive', target: 1, reward: 300, map: 'any' },
        { id: 'task_score', type: 'score', nameZh: '高分挑战', nameEn: 'High Score Challenge', descZh: '达到1000分', descEn: 'Reach 1000 points', target: 1000, reward: 800, map: 'any' },
        { id: 'task_boss1', type: 'boss', nameZh: 'Boss 猎手', nameEn: 'Boss Hunter', descZh: '消灭1个 Boss', descEn: 'Eliminate 1 Boss', target: 1, reward: 1000, map: 'any' }
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
        case 'boss':
            if (taskType === 'boss') currentMissionProgress += value;
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
            'volcano': '🌋 火山',
            'ruins': '🏛️ 遗迹',
            'base': '🏰 基地',
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
    ensureLobbyPanelsVisible();
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

function setMissionLanguage(lang) {
    missionLanguage = lang;
    updateMissionDisplay();
}

// ===== Init hooks =====
(function() {
    try { startAutoBackup(); } catch (e) { console.error(e); }
    try { refreshSlotUI(); refreshBackupUI(); } catch (e) { /* ignore */ }
    loadMissionSettings();
    // 版本检查（仅正式版开发版检查）
    checkForUpdates();
})();

// 版本检查函数
async function checkForUpdates() {
    try {
        let info = null;
        if (window.electronAPI && window.electronAPI.checkVersion) {
            const result = await window.electronAPI.checkVersion();
            if (result.success) {
                info = result.data;
            }
        } else {
            return; // 网页版跳过版本检查（避免CORS跨域报错）
        }
        if (info && info.version) {
            const latest = info.version;
            if (compareVersions(latest, GAME_VERSION) > 0) {
                showNotification(`发现新版本 ${latest}！请前往下载。`);
            }
        }
    } catch (e) {
        console.warn('[UPDATE] Version check failed:', e.message);
    }
}

function compareVersions(a, b) {
    const partsA = a.split('.').map(Number);
    const partsB = b.split('.').map(Number);
    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
        const pA = partsA[i] || 0;
        const pB = partsB[i] || 0;
        if (pA > pB) return 1;
        if (pA < pB) return -1;
    }
    return 0;
}

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
        'speedBoost': '加速卡',
        'ammo_normal': '普通弹×50',
        'ammo_ap': '穿甲弹×20',
        'ammo_exp': '爆破弹×10',
        'ammo_fire': '燃烧弹×15'
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
        case 'ammoBox': {
            // 随机弹药类型与数量加入全局库存
            const ammoTypes = [AMMO_TYPES.NORMAL, AMMO_TYPES.AP, AMMO_TYPES.EXP, AMMO_TYPES.FIRE];
            const randomType = ammoTypes[Math.floor(Math.random() * ammoTypes.length)];
            const randomCount = Math.floor(Math.random() * 31) + 20; // 20-50
            ammoInventory[randomType] = (ammoInventory[randomType] || 0) + randomCount;
            addAmmoToBackpack(randomType, randomCount);
            // 同时补充当前武器弹夹一部分
            player.weapons.forEach(w => {
                if (!w.isMelee && w.type !== WEAPON_TYPES.MELEE) {
                    const mw = getModifiedWeapon(w);
                    w.currentAmmo = Math.min(mw.clipSize, w.currentAmmo + Math.floor(randomCount / 2));
                }
            });
            showNotification(`使用弹药箱，获得${getAmmoName(randomType)}×${randomCount}！`);
            syncAmmoUI();
            break;
        }
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
// 反作弊回调
// ============================================================
window.onCheatDetected = function(reason) {
    try {
        console.error('[Game] 反作弊触发：', reason);
        // 触发后强制保存当前合法数据并提示玩家
        savePlayerData();
        showNotification('检测到异常行为（' + (reason || 'unknown') + '），数据已保护', 'warning');

        // 优先暂停游戏；若未在游戏中或暂停被阻断，则直接退出网页
        let paused = false;
        if (typeof gameRunning !== 'undefined' && gameRunning && typeof pauseGame === 'function') {
            const beforePause = gamePaused;
            pauseGame();
            paused = gamePaused && !beforePause;
        }
        if (!paused) {
            // 无法暂停时：先尝试关闭窗口，再跳转空白页强制退出
            try { window.open('', '_self').close(); } catch (e) {}
            setTimeout(() => {
                window.location.href = 'about:blank';
            }, 100);
        }
    } catch (e) {}
};

// ============================================================
// 初始化
// ============================================================
function init() {
    DataBridge.init();
    DataBridge.syncFromSource();
    DataBridge.subscribe((allData) => {
        if (allData && allData.lotteryData) {
            Object.assign(lotteryData, allData.lotteryData);
        }
        if (allData && allData.playerData) {
            Object.assign(playerData, allData.playerData);
        }
    });

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

    // 右键 = 单发射击（使用 mousedown 更稳定，contextmenu 仅用于阻止默认菜单）
    canvas.addEventListener('mousedown', (e) => {
        canvas.focus();
        if (e.button === 2 && gameRunning) {
            e.preventDefault();
            if (canShoot()) shoot();
        }
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

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
        keys.set(e.code, true);

        // Shift 按住：显示物资圆盘
        if (gameRunning && (e.code === 'ShiftLeft' || e.code === 'ShiftRight')) {
            shiftHeld = true;
            showItemWheel(true);
        }
        // Ctrl 按住：进入冲刺预备（仅在移动时生效）
        if (gameRunning && (e.code === 'ControlLeft' || e.code === 'ControlRight')) {
            ctrlHeld = true;
        }
        if (shiftHeld && gameRunning) {
            if (handleShiftItem(e.code)) return;
        }

        if (e.code === 'KeyR' && gameRunning) reload();
        if (e.code === 'KeyG' && gameRunning) throwGrenade();
        if (e.code === 'Digit1' && gameRunning) switchWeapon(0);
        if (e.code === 'Digit2' && gameRunning) switchWeapon(1);
        if (e.code === 'Digit3' && gameRunning) switchWeapon(2);
        if (e.code === 'Digit4' && gameRunning) switchWeapon(3);
        if (!shiftHeld && e.code === 'KeyH' && gameRunning) useItem('medkit');
        if (!shiftHeld && e.code === 'KeyJ' && gameRunning) useItem('ammoBox');
        if (!shiftHeld && e.code === 'KeyK' && gameRunning) useItem('speedBoost');
        if (e.code === 'Space' && gameRunning) {
            e.preventDefault();
            toggleAutoFire();
        }
    });

    canvas.addEventListener('keyup', e => {
        keys.set(e.code, false);
        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
            shiftHeld = false;
            showItemWheel(false);
        }
        if (e.code === 'ControlLeft' || e.code === 'ControlRight') {
            ctrlHeld = false;
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
    loadSettings();
    loadPlayerMods();
    loadCustomTitles();
    loadMedals();
    loadCompletedMissions();
    loadMissionSettings();
    syncSettingsUI();
    setupMissionPanelDrag();
    checkAllMedals();
    showMenu();

    // 玩家进入游戏时检查并显示更新公告
    setTimeout(checkAndShowAnnouncement, 300);
}

function syncSettingsUI() {
    try {
        const diffSelect = document.getElementById('difficultySelect');
        if (diffSelect) diffSelect.value = settings.difficulty || 'normal';

        const speedSlider = document.getElementById('speedSlider');
        const speedValue = document.getElementById('speedValue');
        if (speedSlider) speedSlider.value = settings.playerSpeed || 100;
        if (speedValue) speedValue.textContent = (settings.playerSpeed || 100) + '%';

        const fireRateSlider = document.getElementById('fireRateSlider');
        const fireRateValue = document.getElementById('fireRateValue');
        if (fireRateSlider) fireRateSlider.value = settings.fireRate || 100;
        if (fireRateValue) fireRateValue.textContent = (settings.fireRate || 100) + '%';
    } catch (e) {}
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

// ============================================================
// 全局UI函数挂载到window（确保HTML onclick能访问）
// ============================================================
function mountAllUIfunctions() {
    const fns = [
        'showReadyRoom', 'showInventory', 'showBlackMarket', 'showModification',
        'showSkins', 'showLotteryPanel', 'showAmmoPanel', 'showMissionPanel',
        'showFriends', 'showLobby', 'backToMenu', 'showSettings',
        'showSaveManager', 'showTutorial', 'showPersonalInfo', 'showMapSelect',
        'openMailbox', 'tryOpenTools', 'exitReadyRoom', 'startGame',
        'selectMap', 'setDifficulty', 'equipArmor', 'selectLoadoutSlot',
        'switchMarketTab', 'buyWeapon', 'buyAttachment', 'buyItem', 'sellItem',
        'toggleAutoFire', 'switchWeapon', 'doLottery', 'useItem',
        'closeAllPanels', 'closeSaveManager', 'closeTitleDetail', 'closeToolsPrompt',
        'confirmDeleteSlot', 'doManualBackup', 'equipTitle',
        'exportMailsAsJSON', 'exportSaveFile', 'hideSettings',
        'loadFromSlot', 'loadGame', 'nextTutorial',
        'pauseGame', 'prevTutorial', 'refreshMailList', 'restoreFromBackup',
        'saveComposedMail', 'saveGame', 'savePlayerName',
        'saveToSlot', 'showSkinTab', 'switchMailTab', 'switchSaveTab',
        'switchSidebarTab', 'toggleNameEdit', 'toggleSidebar',
        'triggerImportFile', 'verifyToolsPassword', 'clearComposeMail',
        'selectWeaponAmmo', 'showConfirm', 'showWarmTip', 'showToast',
        'startTutorial', 'skipTutorial', 'prevTutorialStep', 'nextTutorialStep',
        'closeConfirm', 'closeWarmTip', 'selectModNode', 'renderWeaponLibrary',
        'renderMissionLineList', 'disableAllMods', 'saveSettings', 'loadSettings', 'syncSettingsUI',
        'showRedeemCodePanel', 'closeRedeemCodePanel', 'submitRedeemCode', 'redeemCode'
    ];
    let mounted = 0;
    let missing = [];
    fns.forEach(function(fnName) {
        if (typeof window[fnName] === 'function') return;
        try {
            if (typeof eval(fnName) === 'function') {
                window[fnName] = eval(fnName);
                mounted++;
            } else {
                missing.push(fnName);
            }
        } catch(e) {
            missing.push(fnName);
        }
    });
    console.log('[INIT] Mounted ' + mounted + ' global UI functions, ' + missing.length + ' missing');
    if (missing.length > 0) {
        console.log('[INIT] Missing functions:', missing.join(', '));
    }
}

window.addEventListener('DOMContentLoaded', function() {
    mountAllUIfunctions();
    init();
});

// ====================================================================
// 皮肤数据系统（13把枪 x 20款 = 260种 + 15款刀皮）
// ====================================================================

const SKIN_TEMPLATES = [
    { id: 'default', name: '默认', rarity: 'common', price: 0, body: '#555', barrel: '#555', magazine: '#555', stock: '#555', grip: '#555', sight: '#555', glowColor: null },
    { id: 'carbon', name: '碳纤维', rarity: 'rare', price: 500, body: '#444', barrel: '#444', magazine: '#444', stock: '#444', grip: '#444', sight: '#444', glowColor: null },
    { id: 'gold', name: '黄金', rarity: 'epic', price: 1000, body: 'linear-gradient(90deg,#d4a017,#f0d060,#d4a017)', barrel: '#d4a017', magazine: '#b8860b', stock: '#b8860b', grip: '#b8860b', sight: '#b8860b', glowColor: 'rgba(212,160,23,0.5)' },
    { id: 'camo', name: '迷彩', rarity: 'rare', price: 800, body: '#5c7230', barrel: '#4a5d23', magazine: '#3a4a1b', stock: '#5c7230', grip: '#3a4a1b', sight: '#4a5d23', glowColor: null },
    { id: 'neon', name: '霓虹', rarity: 'legendary', price: 1200, body: '#00e5ff', barrel: '#00e5ff', magazine: '#00e5ff', stock: '#00e5ff', grip: '#00e5ff', sight: '#00e5ff', glowColor: 'rgba(0,229,255,0.6)' },
    { id: 'red', name: '赤红', rarity: 'rare', price: 600, body: 'linear-gradient(90deg,#cc3333,#e04545)', barrel: '#cc3333', magazine: '#cc3333', stock: '#a02828', grip: '#cc3333', sight: '#cc3333', glowColor: 'rgba(204,51,51,0.4)' },
    { id: 'blue', name: '深蓝', rarity: 'rare', price: 600, body: 'linear-gradient(90deg,#1a3a5c,#2a5a8c)', barrel: '#1a3a5c', magazine: '#1a3a5c', stock: '#1a3a5c', grip: '#1a3a5c', sight: '#1a3a5c', glowColor: 'rgba(42,90,140,0.4)' },
    { id: 'purple', name: '紫晶', rarity: 'legendary', price: 1500, body: 'linear-gradient(90deg,#7b2fbe,#a855f7)', barrel: '#7b2fbe', magazine: '#7b2fbe', stock: '#7b2fbe', grip: '#7b2fbe', sight: '#7b2fbe', glowColor: 'rgba(123,47,190,0.5)' },
    { id: 'arctic', name: '极地', rarity: 'rare', price: 700, body: '#c8d8e4', barrel: '#a8c0d4', magazine: '#88a8c0', stock: '#c8d8e4', grip: '#88a8c0', sight: '#a8c0d4', glowColor: null },
    { id: 'inferno', name: '炽焰', rarity: 'epic', price: 900, body: 'linear-gradient(90deg,#ff4400,#ff8800)', barrel: '#ff4400', magazine: '#cc3300', stock: '#ff6600', grip: '#cc3300', sight: '#ff4400', glowColor: 'rgba(255,68,0,0.4)' },
    { id: 'viper', name: '毒蛇', rarity: 'epic', price: 1100, body: 'linear-gradient(90deg,#2d8c2d,#66ff66)', barrel: '#2d8c2d', magazine: '#1a6b1a', stock: '#2d8c2d', grip: '#1a6b1a', sight: '#2d8c2d', glowColor: 'rgba(45,140,45,0.4)' },
    { id: 'shadow', name: '暗影', rarity: 'rare', price: 800, body: '#2a2a3a', barrel: '#1a1a2a', magazine: '#2a2a3a', stock: '#1a1a2a', grip: '#2a2a3a', sight: '#1a1a2a', glowColor: 'rgba(40,40,60,0.3)' },
    { id: 'stellar', name: '星辰', rarity: 'legendary', price: 2000, body: 'linear-gradient(90deg,#1a1a3a,#4a4a8a,#1a1a3a)', barrel: '#6a6aff', magazine: '#4a4a8a', stock: '#4a4a8a', grip: '#4a4a8a', sight: '#6a6aff', glowColor: 'rgba(106,106,255,0.5)' },
    { id: 'rust', name: '铁锈', rarity: 'common', price: 400, body: '#8b5e3c', barrel: '#6b4422', magazine: '#8b5e3c', stock: '#6b4422', grip: '#8b5e3c', sight: '#6b4422', glowColor: null },
    { id: 'platinum', name: '白金', rarity: 'legendary', price: 1300, body: 'linear-gradient(90deg,#c0c0c0,#e8e8e8,#c0c0c0)', barrel: '#d0d0d0', magazine: '#b0b0b0', stock: '#c0c0c0', grip: '#b0b0b0', sight: '#d0d0d0', glowColor: 'rgba(200,200,200,0.3)' },
    { id: 'forest', name: '森林', rarity: 'common', price: 500, body: '#3a5c2a', barrel: '#2a4c1a', magazine: '#3a5c2a', stock: '#2a4c1a', grip: '#3a5c2a', sight: '#2a4c1a', glowColor: null },
    { id: 'desert', name: '沙漠', rarity: 'common', price: 500, body: '#c4a86b', barrel: '#a08850', magazine: '#c4a86b', stock: '#a08850', grip: '#c4a86b', sight: '#a08850', glowColor: null },
    { id: 'ocean', name: '海洋', rarity: 'rare', price: 600, body: 'linear-gradient(90deg,#1a5c8a,#2a8cba)', barrel: '#1a5c8a', magazine: '#1a5c8a', stock: '#1a5c8a', grip: '#1a5c8a', sight: '#1a5c8a', glowColor: null },
    { id: 'thunder', name: '雷暴', rarity: 'legendary', price: 1400, body: 'linear-gradient(90deg,#2a2a4a,#6a6aff)', barrel: '#8888ff', magazine: '#4a4aff', stock: '#6a6aff', grip: '#4a4aff', sight: '#8888ff', glowColor: 'rgba(136,136,255,0.5)' },
    { id: 'dragon', name: '龙鳞', rarity: 'legendary', price: 2500, body: 'linear-gradient(90deg,#8b0000,#ff4400,#8b0000)', barrel: '#cc2200', magazine: '#8b0000', stock: '#cc2200', grip: '#8b0000', sight: '#cc2200', glowColor: 'rgba(255,68,0,0.6)' }
];

const SKIN_WEAPON_TYPES = ['手枪','冲锋枪','步枪','突击步枪','轻机枪','霰弹枪','狙击枪','战术刀','火箭筒','激光枪','加特林','双持手枪','猎枪'];

const KNIFE_SKINS = [
    { id: 'default', name: '默认', rarity: 'common', price: 0, color: '#888', glowColor: null },
    { id: 'carbon', name: '碳纤维', rarity: 'rare', price: 400, color: '#444', glowColor: null },
    { id: 'gold', name: '黄金', rarity: 'epic', price: 800, color: '#d4a017', glowColor: 'rgba(212,160,23,0.5)' },
    { id: 'camo', name: '迷彩', rarity: 'rare', price: 600, color: '#5c7230', glowColor: null },
    { id: 'neon', name: '霓虹', rarity: 'legendary', price: 1000, color: '#00e5ff', glowColor: 'rgba(0,229,255,0.6)' },
    { id: 'red', name: '赤红', rarity: 'rare', price: 500, color: '#cc3333', glowColor: 'rgba(204,51,51,0.4)' },
    { id: 'blue', name: '深蓝', rarity: 'rare', price: 500, color: '#1a3a5c', glowColor: null },
    { id: 'purple', name: '紫晶', rarity: 'legendary', price: 1200, color: '#7b2fbe', glowColor: 'rgba(123,47,190,0.5)' },
    { id: 'bloodmoon', name: '血月', rarity: 'epic', price: 700, color: '#8b1a1a', glowColor: 'rgba(139,26,26,0.4)' },
    { id: 'frost', name: '霜冻', rarity: 'rare', price: 600, color: '#a8d4e6', glowColor: null },
    { id: 'thunder', name: '雷霆', rarity: 'legendary', price: 1100, color: '#6a6aff', glowColor: 'rgba(106,106,255,0.5)' },
    { id: 'sakura', name: '樱花', rarity: 'epic', price: 800, color: '#d4a0b0', glowColor: 'rgba(212,160,176,0.3)' },
    { id: 'dragon', name: '龙牙', rarity: 'legendary', price: 1500, color: '#cc4400', glowColor: 'rgba(204,68,0,0.5)' },
    { id: 'darknight', name: '暗夜', rarity: 'epic', price: 900, color: '#2a2a3a', glowColor: 'rgba(40,40,60,0.3)' },
    { id: 'phoenix', name: '凤凰', rarity: 'legendary', price: 2000, color: '#ff6600', glowColor: 'rgba(255,102,0,0.6)' }
];

const RARITY_COLORS = {
    common: { border: '#9ca3af', text: '#9ca3af', bg: 'rgba(156,163,175,0.08)' },
    rare: { border: '#3b82f6', text: '#60a5fa', bg: 'rgba(59,130,246,0.15)' },
    epic: { border: '#a855f7', text: '#c084fc', bg: 'rgba(168,85,247,0.15)' },
    legendary: { border: '#f59e0b', text: '#fbbf24', bg: 'rgba(245,158,11,0.2)' }
};

// 生成所有武器皮肤数据
function getAllWeaponSkins() {
    const allSkins = [];
    SKIN_WEAPON_TYPES.forEach(weapon => {
        SKIN_TEMPLATES.forEach(template => {
            allSkins.push({
                weaponId: weapon,
                skinId: `${weapon}_${template.id}`,
                weaponName: weapon,
                ...template
            });
        });
    });
    return allSkins;
}

// ====================================================================
// 弹窗系统
// ====================================================================
let confirmCallback = null;

function showConfirm(title, message, callback) {
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMessage').textContent = message;
    document.getElementById('confirmModal').style.display = 'flex';
    confirmCallback = callback;
}

function closeConfirm(result) {
    document.getElementById('confirmModal').style.display = 'none';
    if (confirmCallback) confirmCallback(result);
    confirmCallback = null;
}

function showWarmTip(message) {
    document.getElementById('warmTipMessage').textContent = message;
    document.getElementById('warmTipModal').style.display = 'flex';
}

function closeWarmTip() {
    document.getElementById('warmTipModal').style.display = 'none';
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast-item ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 3000);
}

// ====================================================================
// 新手教程
// ====================================================================
const TUTORIAL_STEPS = [
    { title: '欢迎来到死亡战壕！', desc: '这是一款2D俯视角军事射击游戏。接下来带你快速熟悉各个界面。', action: () => showLobby(), target: null, position: 'center' },
    { title: '底部导航', desc: '这里是功能入口，可以快速打开战备中心、仓库、黑市、改装处等各个界面。', action: () => showLobby(), target: '.lobby-bottom-nav', position: 'top' },
    { title: '战备中心', desc: '在这里选择地图、调整难度并查看任务，准备进入战斗。', action: () => showReadyRoom(), target: '#readyRoom', position: 'center' },
    { title: '仓库', desc: '查看已拥有的武器、弹药与装备。', action: () => showInventory(), target: '#inventoryPanel', position: 'center' },
    { title: '黑市', desc: '购买武器、配件、弹药和道具。', action: () => showBlackMarket(), target: '#blackMarketPanel', position: 'center' },
    { title: '改装处', desc: '为武器安装配件，提升战斗力。近战武器无法安装配件。', action: () => showModification(), target: '#modificationPanel', position: 'center' },
    { title: '皮肤商店', desc: '购买和装备武器与角色皮肤。', action: () => showSkins(), target: '#skinPanel', position: 'center' },
    { title: '地图选择', desc: '选择想要战斗的地图，不同地图有不同主题。', action: () => showMapSelect(), target: '#mapSelectPanel', position: 'center' },
    { title: '设置', desc: '调整难度、移速、射速等游戏设置。', action: () => showSettings(), target: '#settingsPanel', position: 'center' },
    { title: '准备战斗', desc: '熟悉完界面后，点击底部“战备中心”或直接开始战斗吧！祝你好运，战士！', action: () => showLobby(), target: '.lobby-func-btn', position: 'bottom' }
];

let tutorialStep = 0;

function startTutorial() {
    tutorialStep = 0;
    document.getElementById('tutorialOverlay').style.display = 'block';
    updateTutorialStep();
}

function updateTutorialStep() {
    const step = TUTORIAL_STEPS[tutorialStep];
    if (step.action) {
        try { step.action(); } catch (e) { console.error('[Tutorial] action failed', e); }
    }

    document.getElementById('tutorialTitle').textContent = step.title;
    document.getElementById('tutorialDesc').textContent = step.desc;
    document.getElementById('tutorialPrev').style.visibility = tutorialStep === 0 ? 'hidden' : 'visible';
    document.getElementById('tutorialNext').textContent = tutorialStep === TUTORIAL_STEPS.length - 1 ? '完成' : '下一步';

    const indicator = document.getElementById('tutorialStepIndicator');
    indicator.innerHTML = '';
    TUTORIAL_STEPS.forEach((_, i) => {
        const dot = document.createElement('div');
        dot.className = `tutorial-dot ${i === tutorialStep ? 'active' : ''}`;
        indicator.appendChild(dot);
    });

    // 延迟一帧定位，确保面板切换后 DOM 已完成布局
    requestAnimationFrame(() => {
        requestAnimationFrame(() => positionTutorialHighlight(step.target, step.position));
    });
}

function positionTutorialHighlight(targetSelector, position) {
    const highlight = document.getElementById('tutorialHighlight');
    const tooltip = document.getElementById('tutorialTooltip');
    if (!highlight || !tooltip) return;

    // 默认居中
    highlight.style.display = 'none';
    tooltip.style.top = '50%';
    tooltip.style.left = '50%';
    tooltip.style.transform = 'translate(-50%, -50%)';
    tooltip.style.bottom = 'auto';
    tooltip.style.right = 'auto';

    if (!targetSelector) return;

    const target = document.querySelector(targetSelector);
    if (!target) return;

    const rect = target.getBoundingClientRect();
    const margin = 8;

    // 高亮目标元素
    highlight.style.display = 'block';
    highlight.style.top = (rect.top - margin) + 'px';
    highlight.style.left = (rect.left - margin) + 'px';
    highlight.style.width = (rect.width + margin * 2) + 'px';
    highlight.style.height = (rect.height + margin * 2) + 'px';

    // 根据位置摆放提示框
    const tooltipRect = tooltip.getBoundingClientRect();
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const gap = 16;

    let top, left;
    switch (position) {
        case 'top':
            top = rect.top - tooltipRect.height - gap;
            left = rect.left + rect.width / 2 - tooltipRect.width / 2;
            break;
        case 'bottom':
            top = rect.bottom + gap;
            left = rect.left + rect.width / 2 - tooltipRect.width / 2;
            break;
        case 'left':
            top = rect.top + rect.height / 2 - tooltipRect.height / 2;
            left = rect.left - tooltipRect.width - gap;
            break;
        case 'right':
            top = rect.top + rect.height / 2 - tooltipRect.height / 2;
            left = rect.right + gap;
            break;
        default:
            top = viewportH / 2 - tooltipRect.height / 2;
            left = viewportW / 2 - tooltipRect.width / 2;
    }

    // 边界修正
    top = Math.max(gap, Math.min(top, viewportH - tooltipRect.height - gap));
    left = Math.max(gap, Math.min(left, viewportW - tooltipRect.width - gap));

    tooltip.style.top = top + 'px';
    tooltip.style.left = left + 'px';
    tooltip.style.transform = 'none';
}

function nextTutorialStep() {
    if (tutorialStep >= TUTORIAL_STEPS.length - 1) {
        skipTutorial();
        showToast('准备就绪！祝你好运，战士！', 'success');
        return;
    }
    tutorialStep++;
    updateTutorialStep();
}

function prevTutorialStep() {
    if (tutorialStep > 0) {
        tutorialStep--;
        updateTutorialStep();
    }
}

function skipTutorial() {
    document.getElementById('tutorialOverlay').style.display = 'none';
    const highlight = document.getElementById('tutorialHighlight');
    if (highlight) highlight.style.display = 'none';
}

// ====================================================================
// 受击反馈
// ====================================================================
function showDamageFlash() {
    const flash = document.getElementById('damageFlash');
    if (!flash) return;
    flash.style.opacity = '0.6';
    setTimeout(() => { flash.style.opacity = '0'; }, 150);
}

function updateDamageVignette(healthPercent) {
    const vignette = document.getElementById('damageVignette');
    if (!vignette) return;
    vignette.style.opacity = Math.max(0, (1 - healthPercent) * 0.3).toString();
}
