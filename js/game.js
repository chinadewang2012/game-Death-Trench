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
const ENEMY_SIZE = 1.8;
let MAP_SIZE = 150;
const VIEW_RANGE_X = 45; // 左右各45格（更大的可见范围）
const VIEW_RANGE_Y = 30; // 上下各30格

// 对象池大小上限
const POOL_BULLET_MAX = 500;
const POOL_EXPLOSION_MAX = 100;
const POOL_DROP_MAX = 100;

// 搜打撤实验参数
const TEAM_MAX_SIZE = 3;                 // 队伍上限（含玩家）
const LOOT_CRATE_SEARCH_TIME = 1500;     // 开箱时间（毫秒）
const LOOT_CRATE_NOISE_RADIUS = 18;      // 开箱吸引敌人的半径
const LOOT_CRATE_LOOT_COUNT = 3;         // 每个箱子掉落物数量
const LOOT_CRATE_RARITY = {
    COMMON: { id: 'common', chance: 0.70, color: '#b8860b', glow: '#daa520', icon: '🧰', lootMul: 1, label: '普通' },
    RARE:   { id: 'rare',   chance: 0.25, color: '#4dabf7', glow: '#91d5ff', icon: '💼', lootMul: 1.5, label: '稀有' },
    LEGENDARY: { id: 'legendary', chance: 0.05, color: '#ff6b00', glow: '#ffaa00', icon: '👑', lootMul: 2.5, label: '传说' }
};
const LOOT_CRATE_DROP_TABLE = {
    common: [
        { type: 'coins',  weight: 30, min: 15, max: 35 },
        { type: 'heal',   weight: 20, min: 20, max: 35 },
        { type: 'item',   weight: 16, itemId: 'grenade',  value: 1 },
        { type: 'item',   weight: 12, itemId: 'speedBoost', value: 1 },
        { type: 'item',   weight: 8,  itemId: 'smoke',  value: 1 },
        { type: 'item',   weight: 7,  itemId: 'energy', value: 1 },
        { type: 'sellable', weight: 20 }
    ],
    rare: [
        { type: 'coins',  weight: 24, min: 40, max: 80 },
        { type: 'heal',   weight: 16, min: 40, max: 60 },
        { type: 'ammo',   weight: 20, min: 30, max: 60 },
        { type: 'item',   weight: 11, itemId: 'grenade', value: 2 },
        { type: 'item',   weight: 9,  itemId: 'adrenaline', value: 1 },
        { type: 'item',   weight: 8,  itemId: 'plate', value: 1 },
        { type: 'item',   weight: 7,  itemId: 'scanner', value: 1 },
        { type: 'armor',  weight: 8, value: 30 },
        { type: 'sellable', weight: 22 }
    ],
    legendary: [
        { type: 'coins',  weight: 18, min: 100, max: 200 },
        { type: 'fullHeal', weight: 12 },
        { type: 'ammo',   weight: 15, min: 80, max: 150, special: true },
        { type: 'item',   weight: 12, itemId: 'ammoBox', value: 1 },
        { type: 'item',   weight: 10, itemId: 'medkit', value: 2 },
        { type: 'item',   weight: 8,  itemId: 'repair', value: 1 },
        { type: 'item',   weight: 7,  itemId: 'adrenaline', value: 1 },
        { type: 'mod',    weight: 9 },
        { type: 'skin',   weight: 5 },
        { type: 'sellable', weight: 24 }
    ]
};

// 摸金变卖物：游戏中拾取，回到仓库后可出售换取金币（非即时消耗品）
const SELLABLE_TYPES = {
    goldbar:    { id: 'goldbar',    name: '金条',     icon: '🪙', img: 'sell-goldbar',    baseValue: 120, rarity: 'rare' },
    diamond:    { id: 'diamond',    name: '钻石',     icon: '💎', img: 'sell-diamond',    baseValue: 260, rarity: 'epic' },
    watch:      { id: 'watch',      name: '名表',     icon: '⌚', img: 'sell-watch',      baseValue: 180, rarity: 'epic' },
    antique:    { id: 'antique',    name: '古董',     icon: '🏺', img: 'sell-antique',    baseValue: 90,  rarity: 'uncommon' },
    intel:      { id: 'intel',      name: '情报文件', icon: '📜', img: 'sell-intel',      baseValue: 150, rarity: 'rare' },
    painting:   { id: 'painting',   name: '名画',     icon: '🖼️', img: 'sell-painting',   baseValue: 320, rarity: 'legendary' },
    jewelry:    { id: 'jewelry',    name: '珠宝',     icon: '📿', img: 'sell-jewelry',    baseValue: 200, rarity: 'epic' },
    goldcoin:   { id: 'goldcoin',   name: '金币袋',   icon: '💰', img: 'sell-goldcoin',   baseValue: 75,  rarity: 'uncommon' },
    wine:       { id: 'wine',       name: '名酒',     icon: '🍷', img: 'sell-wine',       baseValue: 110, rarity: 'rare' },
    harddrive:  { id: 'harddrive',  name: '加密硬盘', icon: '💽', img: 'sell-harddrive',  baseValue: 230, rarity: 'epic' },
    weaponpart: { id: 'weaponpart', name: '军械零件', icon: '🔧', img: 'sell-weaponpart', baseValue: 140, rarity: 'rare' },
    jewelry2:   { id: 'jewelry2',   name: '黄金首饰', icon: '💍', img: 'sell-jewelry2',   baseValue: 160, rarity: 'rare' },
    artifact:   { id: 'artifact',   name: '古币',     icon: '🥇', img: 'sell-artifact',   baseValue: 100, rarity: 'uncommon' },
    cigar:      { id: 'cigar',      name: '雪茄',     icon: '🚬', img: 'sell-cigar',      baseValue: 60,  rarity: 'common' },
    statue:     { id: 'statue',     name: '雕像',     icon: '🗿', img: 'sell-statue',     baseValue: 280, rarity: 'legendary' },
    crown:      { id: 'crown',      name: '王冠',     icon: '👑', img: 'sell-crown',      baseValue: 400, rarity: 'legendary' },
    relic:      { id: 'relic',      name: '文明遗物', icon: '🛸', img: 'sell-relic',      baseValue: 360, rarity: 'legendary' },
    serum:      { id: 'serum',      name: '黑潮血清', icon: '🧪', img: 'sell-serum',      baseValue: 300, rarity: 'epic' },
    chip:       { id: 'chip',       name: '控制芯片', icon: '🔌', img: 'sell-chip',       baseValue: 250, rarity: 'epic' },
    pearl:      { id: 'pearl',      name: '黑珍珠',   icon: '⚪', img: 'sell-pearl',      baseValue: 190, rarity: 'rare' },
    coin2:      { id: 'coin2',      name: '古银币',   icon: '🪙', img: 'sell-coin2',      baseValue: 85,  rarity: 'uncommon' },
    stamp:      { id: 'stamp',      name: '绝版邮票', icon: '📮', img: 'sell-stamp',      baseValue: 130, rarity: 'rare' },
    bone:       { id: 'bone',       name: '史前化石', icon: '🦴', img: 'sell-bone',       baseValue: 210, rarity: 'epic' }
};
function getSellableDef(id) { return SELLABLE_TYPES[id] || { id, name: id, icon: '📦', img: null, baseValue: 50, rarity: 'common' }; }
// 变卖物图标：优先使用真实精灵图，缺失时回退到 emoji
function sellableIconHtml(def) {
    if (def && def.img) return '<img class="px-icon sell-icon" src="assets/art/' + def.img + '.png" alt="' + (def.name || '变卖物') + '">';
    return '<span class="px-icon-fallback">' + (def && def.icon ? def.icon : '📦') + '</span>';
}

// 游戏版本
const GAME_VERSION = '2.3.0';
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
    DMR: 'dmr',
    BOW: 'bow',
    LAUNCHER: 'launcher',
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
    { id: 'machete', name: '砍刀', type: WEAPON_TYPES.MELEE, damage: 90, fireRate: 600, clipSize: 999, range: 2.5, icon: '⚔️', ammoType: null, price: 800, unlocked: false, isMelee: true, category: 'weapon', rarity: 'uncommon' },
    // 高射速冲锋枪
    { id: 'vector', name: '维克托冲锋枪', type: WEAPON_TYPES.SMG, damage: 22, fireRate: 40, clipSize: 35, range: 25, icon: '🔫', ammoType: AMMO_TYPES.NORMAL, price: 1800, unlocked: false, category: 'weapon', rarity: 'epic' },
    // 紧凑冲锋枪
    { id: 'mp5', name: 'MP5冲锋枪', type: WEAPON_TYPES.SMG, damage: 26, fireRate: 90, clipSize: 30, range: 22, icon: '🔫', ammoType: AMMO_TYPES.NORMAL, price: 1300, unlocked: false, category: 'weapon', rarity: 'rare' },
    // 大威力手枪
    { id: 'deagle', name: '沙漠之鹰', type: WEAPON_TYPES.PISTOL, damage: 55, fireRate: 320, clipSize: 7, range: 28, icon: '🔫', ammoType: AMMO_TYPES.AP, price: 900, unlocked: false, category: 'weapon', rarity: 'rare' },
    // DMR精确射手步枪
    { id: 'mk14', name: 'MK14射手步枪', type: WEAPON_TYPES.DMR, damage: 70, fireRate: 260, clipSize: 20, range: 45, icon: '🔫', ammoType: AMMO_TYPES.AP, price: 2200, unlocked: false, category: 'weapon', rarity: 'epic' },
    // 重型狙击
    { id: 'awp', name: 'AWP重型狙', type: WEAPON_TYPES.SNIPER, damage: 200, fireRate: 1300, clipSize: 5, range: 75, icon: '🎯', ammoType: AMMO_TYPES.AP, price: 3000, unlocked: false, category: 'weapon', rarity: 'legendary' },
    // 战术霰弹枪
    { id: 'spas', name: 'SPAS霰弹枪', type: WEAPON_TYPES.SHOTGUN, damage: 95, fireRate: 700, clipSize: 8, range: 16, icon: '💥', ammoType: AMMO_TYPES.NORMAL, price: 1400, unlocked: false, pellets: 7, category: 'weapon', rarity: 'epic' },
    // 重机枪
    { id: 'pkp', name: 'PKP通用机枪', type: WEAPON_TYPES.LMG, damage: 34, fireRate: 65, clipSize: 150, range: 38, icon: '📦', ammoType: AMMO_TYPES.NORMAL, price: 3200, unlocked: false, category: 'weapon', rarity: 'legendary' },
    // 突击步枪
    { id: 'qbz', name: 'QBZ突击步枪', type: WEAPON_TYPES.RIFLE, damage: 38, fireRate: 120, clipSize: 35, range: 40, icon: '🔫', ammoType: AMMO_TYPES.NORMAL, price: 2000, unlocked: false, category: 'weapon', rarity: 'epic' },
    // 弩
    { id: 'crossbow', name: '战术弩', type: WEAPON_TYPES.BOW, damage: 110, fireRate: 900, clipSize: 1, range: 50, icon: '🏹', ammoType: null, price: 1600, unlocked: false, isMelee: false, category: 'weapon', rarity: 'epic' },
    // 火箭筒
    { id: 'rpg', name: 'RPG火箭筒', type: WEAPON_TYPES.LAUNCHER, damage: 300, fireRate: 1500, clipSize: 1, range: 55, icon: '🚀', ammoType: null, price: 4000, unlocked: false, isExplosive: true, category: 'weapon', rarity: 'legendary' }
];

let WEAPONS = JSON.parse(JSON.stringify(DEFAULT_WEAPONS));

// 像素风配图映射（assets/art 下 32px 风格图，冷色主题）
const WEAPON_ICON_MAP = {
    pistol: 'weapon-pistol', smg: 'weapon-smg', rifle: 'weapon-rifle', ar: 'weapon-ar',
    lmg: 'weapon-lmg', shotgun: 'weapon-shotgun', sniper: 'weapon-sniper',
    knife: 'weapon-knife', machete: 'weapon-machete',
    vector: 'weapon-vector', mp5: 'weapon-mp5', deagle: 'weapon-deagle', mk14: 'weapon-mk14',
    awp: 'weapon-awp', spas: 'weapon-spas', pkp: 'weapon-pkp', qbz: 'weapon-qbz',
    crossbow: 'weapon-crossbow', rpg: 'weapon-rpg'
};
const MOD_ICON_MAP = {
    scope: 'mod-scope', extendedMag: 'mod-extendedMag', suppressor: 'mod-suppressor',
    grip: 'mod-grip', apRounds: 'mod-apRounds', stock: 'mod-stock', laser: 'mod-laser', flashlight: 'mod-flashlight',
    redDot: 'mod-redDot', holo: 'mod-holo', drumMag: 'mod-drumMag', bipod: 'mod-bipod',
    muzzleBrake: 'mod-muzzleBrake', suppressor2: 'mod-suppressor'
};
function weaponIconHtml(w) {
    const key = w && WEAPON_ICON_MAP[w.id];
    if (key) return '<img class="px-icon" src="assets/art/' + key + '.png" alt="' + (w.name || '武器') + '">';
    return '<span class="px-icon-fallback">' + (w && w.icon ? w.icon : '🔫') + '</span>';
}
function modIconHtml(modId, m) {
    const key = MOD_ICON_MAP[modId];
    if (key) return '<img class="px-icon" src="assets/art/' + key + '.png" alt="' + (m && m.name ? m.name : '配件') + '">';
    return '<span class="px-icon-fallback">' + (m && m.icon ? m.icon : '🔧') + '</span>';
}

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
    },
    // 镭射指示器
    laser: {
        name: '镭射指示器',
        icon: '🔦',
        effects: { trajectory: true, penetrationBonus: true },
        price: 700,
        description: '显示弹道线，子弹可穿透1名敌人'
    },
    // 战术手电
    flashlight: {
        name: '战术手电',
        icon: '🔦',
        effects: { accuracyBonus: 1.1, spreadReduction: 0.85, visionBonus: 1.15 },
        price: 300,
        description: '提升精度与视野，散布更小'
    },
    // 红点瞄准镜
    redDot: {
        name: '红点镜',
        icon: '🔴',
        effects: { accuracyBonus: 1.2, spreadReduction: 0.75, reloadBonus: 1.1 },
        price: 550,
        description: '提升精度，换弹更快'
    },
    // 全息瞄准镜
    holo: {
        name: '全息镜',
        icon: '🟢',
        effects: { accuracyBonus: 1.3, spreadReduction: 0.65, trajectory: true },
        price: 900,
        description: '高精度，显示弹道线'
    },
    // 弹鼓
    drumMag: {
        name: '扩容弹鼓',
        icon: '🥁',
        effects: { clipBonus: 2.0, reloadBonus: 0.9 },
        price: 1000,
        description: '弹夹容量翻倍，换弹略慢'
    },
    // 双脚架
    bipod: {
        name: '战术脚架',
        icon: '🦿',
        effects: { recoilReduction: 0.4, accuracyBonus: 1.25, spreadReduction: 0.6 },
        price: 650,
        description: '蹲射时大幅稳定，精度极高'
    },
    // 枪口制退器
    muzzleBrake: {
        name: '枪口制退器',
        icon: '🛑',
        effects: { recoilReduction: 0.7, spreadReduction: 0.8 },
        price: 600,
        description: '强力抑制后坐力与散布'
    },
    // 消音器
    suppressor: {
        name: '消音器',
        icon: '🔇',
        effects: { damageBonus: 0.9, spreadReduction: 0.9, silent: true, accuracyBonus: 1.1 },
        price: 750,
        description: '降低伤害但隐蔽射击，精度提升'
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
        { id: 'skin_arctic', name: '极地步枪', weaponId: null, color: '#c8d8e4', price: 700, unlocked: false, pattern: 'arctic' },
        { id: 'skin_void', name: '虚空行者', weaponId: null, color: '#2a0a3a', price: 1600, unlocked: false, pattern: 'crystal' },
        { id: 'skin_frost', name: '霜冻之刃', weaponId: null, color: '#7fd8ff', price: 1000, unlocked: false, pattern: 'arctic' },
        { id: 'skin_ember', name: '余烬狙击', weaponId: null, color: '#b5532a', price: 1200, unlocked: false, pattern: 'inferno' }
    ],
    players: [
        { id: 'player_default', name: '默认', color: '#00AA55', price: 0, unlocked: true, portrait: 'npc-reyes' },
        { id: 'player_soldier', name: '士兵', color: '#556B2F', price: 200, unlocked: false, portrait: 'npc-merchant' },
        { id: 'player_mercenary', name: '佣兵', color: '#8B4513', price: 500, unlocked: false, portrait: 'npc-price' },
        { id: 'player_elite', name: '精英', color: '#2F4F4F', price: 800, unlocked: false, portrait: 'npc-eileen' },
        { id: 'player_ghost', name: '幽灵', color: '#1a1a1a', price: 1200, unlocked: false, portrait: 'npc-ghost' },
        { id: 'player_ronin', name: '浪人', color: '#3a2a4a', price: 1500, unlocked: false, portrait: 'npc-reyes' },
        { id: 'player_warden', name: '狱长', color: '#5a3210', price: 1800, unlocked: false, portrait: 'npc-merchant' },
        { id: 'player_spectre', name: '幽影特工', color: '#102030', price: 2200, unlocked: false, portrait: 'npc-ghost' }
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
let teammates = [];
let drops = [];
let explosions = [];
let smokeZones = [];      // 烟雾弹区域 {x,y,radius,until}
let lootCrates = [];
let activeCrate = null;

let gameRunning = false;
let animationId;
let mouseX = 0, mouseY = 0;
let keys = new Map();
let lastShot = 0;
let lastEnemySpawn = 0;
let autoFire = false;
let mouseFiring = false;   // 左键按住持续开火
let aiming = false;        // 右键狙击开镜状态
let viewScale = 1;         // 当前镜头缩放（狙击开镜时放大）
let aimAngle = 0;          // 瞄准方向（鼠标角度）
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
    difficulty: 'advanced',
    playerSpeed: 100, // 百分比，100为默认速度
    fireRate: 100, // 射速调整，100为默认，数值越小射速越快
    mobileMode: false // 移动端适配开关，默认关闭（实验性功能）
};
window.settings = settings;

// 移动端适配：仅在设置中手动开启时挂载 .mobile-mode class。
// 所有移动端样式均限定在 .mobile-mode 父级下，未开启时完全不影响主界面布局。
function applyMobileModeClass() {
    try {
        if (settings.mobileMode) document.body.classList.add('mobile-mode');
        else document.body.classList.remove('mobile-mode');
    } catch (e) { /* 防御：body 不存在时静默 */ }
}
window.applyMobileModeClass = applyMobileModeClass;

// ====================================================================
// 移动端触屏控制（实验性）：虚拟摇杆 + 射击键 + 战斗物品面板
// 仅在 settings.mobileMode 开启、且战斗进行中（gameRunning）时绑定/生效。
// 全部独立于键盘逻辑，不影响 PC 端主界面。
// ====================================================================
window.__mobileMove = { dx: 0, dy: 0 };   // 实际施加到移动的方向（经平滑）
window.__mobileMoveTarget = { dx: 0, dy: 0 }; // 摇杆原始目标方向

function initMobileControls() {
    try {
        const joystick = document.getElementById('mobileJoystick');
        const stick = document.getElementById('mobileJoystickStick');
        const fireBtn = document.getElementById('mobileFireBtn');
        const itemBtn = document.getElementById('mobileItemBtn');
        const itemPanel = document.getElementById('mobileItemPanel');
        const reloadBtn = document.getElementById('mobileReloadBtn');
        const packBtn = document.getElementById('mobileBackpackBtn');
        if (!joystick || !stick || !fireBtn || !itemBtn || !itemPanel) return;

        // --- 虚拟摇杆 ---
        let joyId = null;
        const joyRadius = 55;
        function joyStart(e) {
            if (!settings.mobileMode) return;
            const t = e.changedTouches ? e.changedTouches[0] : e;
            joyId = t.identifier !== undefined ? t.identifier : 'mouse';
            joyMove(e);
            e.preventDefault();
        }
        function joyMove(e) {
            if (!settings.mobileMode) return;
            const rect = joystick.getBoundingClientRect();
            const t = (e.changedTouches)
                ? Array.from(e.changedTouches).find(x => (x.identifier === joyId)) || e.changedTouches[0]
                : e;
            let cx = t.clientX - rect.left - rect.width / 2;
            let cy = t.clientY - rect.top - rect.height / 2;
            const dist = Math.sqrt(cx * cx + cy * cy);
            const max = joyRadius;
            if (dist > max) { cx = cx / dist * max; cy = cy / dist * max; }
            stick.style.transform = 'translate(' + cx + 'px,' + cy + 'px)';
            window.__mobileMoveTarget.dx = cx / max;
            window.__mobileMoveTarget.dy = cy / max;
            e.preventDefault();
        }
        function joyEnd(e) {
            if (!settings.mobileMode) return;
            joyId = null;
            stick.style.transform = 'translate(0px,0px)';
            window.__mobileMoveTarget.dx = 0;
            window.__mobileMoveTarget.dy = 0;
            e.preventDefault();
        }
        joystick.addEventListener('touchstart', joyStart, { passive: false });
        joystick.addEventListener('touchmove', joyMove, { passive: false });
        joystick.addEventListener('touchend', joyEnd, { passive: false });
        joystick.addEventListener('touchcancel', joyEnd, { passive: false });
        // 鼠标兜底（桌面测试用）
        joystick.addEventListener('mousedown', joyStart);
        window.addEventListener('mousemove', (e) => { if (joyId !== null) joyMove(e); });
        window.addEventListener('mouseup', (e) => { if (joyId !== null) joyEnd(e); });

        // --- 射击键 ---
        function fireOn(e) { if (settings.mobileMode) { mouseFiring = true; e.preventDefault(); } }
        function fireOff(e) { if (settings.mobileMode) { mouseFiring = false; e.preventDefault(); } }
        fireBtn.addEventListener('touchstart', fireOn, { passive: false });
        fireBtn.addEventListener('touchend', fireOff, { passive: false });
        fireBtn.addEventListener('touchcancel', fireOff, { passive: false });
        fireBtn.addEventListener('mousedown', fireOn);
        fireBtn.addEventListener('mouseup', fireOff);
        fireBtn.addEventListener('mouseleave', fireOff);

        // --- 物品面板开关 ---
        itemBtn.addEventListener('click', function() {
            if (!settings.mobileMode) return;
            const open = itemPanel.style.display === 'block';
            itemPanel.style.display = open ? 'none' : 'block';
        });

        // --- 独立换弹键（开火键左下角） ---
        if (reloadBtn) {
            const doReload = function(e) { if (settings.mobileMode) { try { reload(); showNotification('🔄 换弹中…'); } catch (err) { showNotification('无法换弹'); } if (e) e.preventDefault(); } };
            reloadBtn.addEventListener('touchstart', doReload, { passive: false });
            reloadBtn.addEventListener('mousedown', doReload);
        }

        // --- 独立背包键：raid 显示局内背包，普通战斗显示主库存概览 ---
        if (packBtn) {
            packBtn.addEventListener('click', function() {
                if (!settings.mobileMode) return;
                try { toggleMobileBackpack(); } catch (err) { showNotification('背包暂不可用'); }
            });
        }

        // --- 物品面板内按钮（动态绑定） ---
        itemPanel.querySelectorAll('[data-item]').forEach(btn => {
            btn.addEventListener('click', function() {
                const id = btn.getAttribute('data-item');
                if (id === 'grenade') { try { throwGrenade(); showNotification('💣 手雷已投掷'); } catch (err) { showNotification('无法投掷手雷'); } }
                else {
                    const r = useItem(id);
                    if (r && r.success) showNotification('✅ 已使用 ' + (r.item && r.item.name ? r.item.name : id));
                    else showNotification('❌ 无法使用 ' + id);
                }
                itemPanel.style.display = 'none';
            });
        });
    } catch (e) {
        console.warn('[MOBILE] 控件初始化失败（不影响主游戏）:', e.message);
    }
}
window.initMobileControls = initMobileControls;

// 游戏模式：mission 普通任务 / raid 搜打撤
let gameMode = 'mission';
window.gameMode = gameMode;

// 搜打撤临时数据：战利品背包、当前出战配装、局内消耗品
let raidLoot = [];
let currentRaidLoadout = null;
let battleConsumables = null;
// 搜打撤局内背包（三角洲式：搜到的战利品暂存在此，撤离成功才带回，死亡清空）
let raidBackpack = null;
const RAID_BACKPACK_CAPACITY = 24; // 6x4 网格
const RAID_BACKPACK_COLS = 6;
function getRaidBackpack() {
    if (!raidBackpack) {
        raidBackpack = { capacity: RAID_BACKPACK_CAPACITY, items: [] };
    }
    return raidBackpack;
}
function raidBackpackUsed() {
    return getRaidBackpack().items.length;
}

// Round 3：地图事件与 AI 埋伏
let mapEvents = [];
let nextMapEventAt = 0;

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
    } catch (e) { console.warn('[MEDAL] 保存失败:', e.message); }
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
        // 恢复已购买武器的解锁状态，避免被 game_params 默认值覆盖
        if (playerData && Array.isArray(playerData.ownedWeapons)) {
            playerData.ownedWeapons.forEach(function(id) {
                const w = WEAPONS.find(function(x) { return x.id === id; });
                if (w) w.unlocked = true;
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
    // 若玩家当前佩戴的称号仍满足条件，则保留玩家手动选择，不被自动覆盖
    const current = customTitles.find(function(t) { return t.name === playerData.title; });
    if (current && checkTitleCondition(current)) return;
    // 否则（当前称号不再满足条件，或从未手动选择）自动选取满足条件的最高称号
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

// 兑换码配置：每个账号限用一次，redeemedCodes 不计入存档验证码
// 注意：兑换码采用无规律随机串（字母+数字混合，区分大小写），避免被轻易枚举破译。
// 使用 generateRedeemCode() 生成随机码，code 无递增规律。
function generateRedeemCode(seed) {
    // 大小写字母 + 数字，排除易混淆字符（0/O、1/I/L）
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    let s = '';
    let x = seed >>> 0;
    for (let i = 0; i < 12; i++) {
        x = (x * 1103515245 + 12345) & 0x7fffffff;
        s += chars[x % chars.length];
        x = (x * 1103515245 + 12345) & 0x7fffffff;
    }
    // 插入分隔段，进一步打乱结构
    return s.slice(0, 4) + '-' + s.slice(4, 8) + '-' + s.slice(8, 12);
}

const REDEEM_CODES = [
    { code: generateRedeemCode(0x9f3a21c7), kills: 5, coins: 100 },
    { code: generateRedeemCode(0x1c8b4e92), kills: 10, coins: 200 },
    { code: generateRedeemCode(0x7d2f66a1), kills: 15, coins: 300 },
    { code: generateRedeemCode(0xa4e0c135), kills: 20, coins: 400 },
    { code: generateRedeemCode(0x3b91d7f0), kills: 25, coins: 500 },
    { code: generateRedeemCode(0xe62a4b88), kills: 30, coins: 600 },
    { code: generateRedeemCode(0x5c7f09a3), kills: 35, coins: 700 },
    { code: generateRedeemCode(0x8b1d3e64), kills: 40, coins: 800 },
    { code: generateRedeemCode(0x2f4a9c17), kills: 45, coins: 900 },
    { code: generateRedeemCode(0x6e8b2d50), kills: 50, coins: 1000 },
    { code: generateRedeemCode(0xc13f7a29), kills: 55, coins: 1100 },
    { code: generateRedeemCode(0x4a90be63), kills: 60, coins: 1200 },
    { code: generateRedeemCode(0x9d6c1f84), kills: 65, coins: 1300 },
    { code: generateRedeemCode(0x1e7b3a05), kills: 70, coins: 1400 },
    { code: generateRedeemCode(0x7a2c9d46), kills: 75, coins: 1500 },
    { code: generateRedeemCode(0xb5e1f8a2), kills: 80, coins: 1600 },
    { code: generateRedeemCode(0x3c60d917), kills: 85, coins: 1700 },
    { code: generateRedeemCode(0x8f2b4c78), kills: 90, coins: 1800 },
    { code: generateRedeemCode(0xd147e0a3), kills: 95, coins: 1900 },
    { code: generateRedeemCode(0x5b8f3c26), kills: 100, coins: 2000 },
    { code: generateRedeemCode(0xa9c2e7d1), kills: 120, coins: 2200 },
    { code: generateRedeemCode(0x2d7e4b90), kills: 140, coins: 2400 },
    { code: generateRedeemCode(0x6f1a8c53), kills: 160, coins: 2600 },
    { code: 'DT2026A24', kills: 180, coins: 2800 },
    { code: 'DT2026A25', kills: 200, coins: 3000 },
    { code: 'DT2026A26', kills: 220, coins: 3200 },
    { code: 'DT2026A27', kills: 240, coins: 3400 },
    { code: 'DT2026A28', kills: 260, coins: 3600 },
    { code: 'DT2026A29', kills: 280, coins: 3800 },
    { code: 'DT2026A30', kills: 300, coins: 4000 }
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
    selectedMode: 'mission',
    teammateCount: 0,
    equippedWeapons: { primary: 'rifle', secondary: 'pistol' },
    raidLoadout: {
        consumables: { medkits: 0, grenades: 0, speedBoost: 0 }
    },
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
        speedBoost: 1,
        adrenaline: 1,
        smoke: 2,
        energy: 2,
        plate: 1,
        scanner: 1,
        repair: 1
    },
    backpack: {
        capacity: 36,
        items: []
    },
    redeemedCodes: [],
    ownedWeapons: [],
    sellItems: []
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

        // 初始化搜打撤出战配装
        if (!playerData.raidLoadout) {
            playerData.raidLoadout = { consumables: { medkits: 0, grenades: 0, speedBoost: 0, adrenaline: 0, smoke: 0, energy: 0, plate: 0, scanner: 0, repair: 0 } };
        }
        if (!playerData.raidLoadout.consumables) {
            playerData.raidLoadout.consumables = { medkits: 0, grenades: 0, speedBoost: 0, adrenaline: 0, smoke: 0, energy: 0, plate: 0, scanner: 0, repair: 0 };
        }

        // 根据已拥有武器列表恢复 WEAPONS 的 unlocked 状态（merge，不清除默认解锁）
        if (!Array.isArray(playerData.ownedWeapons)) playerData.ownedWeapons = [];
        playerData.ownedWeapons.forEach(function(id) {
            const w = WEAPONS.find(function(x) { return x.id === id; });
            if (w) w.unlocked = true;
        });

        savePlayerData();
        AntiCheat.recordPlayerSnapshot(playerData);
    } catch (e) { console.warn('[PLAYER] 状态保存失败:', e.message); }
}

function safeSetItem(key, value) {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch (e) {
        if (!(e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014))) {
            console.warn('[STORAGE] 写入失败 ' + key + ':', e.message);
            return false;
        }
        // 配额不足：按从旧到新顺序清理自动备份与存档槽位，腾出空间后重试
        const purgeKeys = [];
        for (let i = 5; i >= 1; i--) purgeKeys.push('deathTrench_backup_' + i);
        for (let i = 5; i >= 1; i--) purgeKeys.push('deathTrench_slot_' + i);
        for (const k of purgeKeys) {
            try { localStorage.removeItem(k); } catch (e2) {}
            try { localStorage.setItem(key, value); return true; } catch (e3) {}
        }
        // 仍失败则尝试删除冗余 legacy 副本
        try { localStorage.removeItem('deathTrench_playerData'); } catch (e2) {}
        try { localStorage.setItem(key, value); return true; } catch (e3) {}
        console.warn('[STORAGE] 配额不足，' + key + ' 写入失败');
        return false;
    }
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
        safeSetItem('deathTrench_player', JSON.stringify(signed));
        AntiCheat.recordPlayerSnapshot(playerData);

        // 同步一份无签名的 legacy 数据到 deathTrench_playerData，供旧版面板兼容读取
        syncLegacyPlayerData();
    } catch (e) { console.warn('[PLAYER] 保存失败:', e.message); }
}

// 同步关键字段到 legacy 兼容副本；带变化检测，避免无变化时重复全量写入（减少 localStorage 配额压力）
function syncLegacyPlayerData() {
    const syncFields = ['playerName', 'coins', 'totalKills', 'totalDeaths', 'totalScore', 'playTimeSeconds', 'title', 'equippedArmor', 'selectedMap', 'teammateCount', 'avatar', 'inventory', 'backpack', 'equippedWeapons', 'ammo', 'ownedSkins', 'equippedSkin', 'weaponAmmoSlots', 'ownedWeapons', 'redeemedCodes'];
    const legacy = {};
    for (const key of syncFields) {
        if (playerData[key] !== undefined) legacy[key] = playerData[key];
    }
    const json = JSON.stringify(legacy);
    if (localStorage.getItem('deathTrench_playerData') === json) return; // 无变化则跳过写入
    safeSetItem('deathTrench_playerData', json);
}

function loadSettings() {
    try {
        const raw = localStorage.getItem('deathTrench_settings');
        if (!raw) return;
        const saved = JSON.parse(raw);
        if (saved.difficulty) settings.difficulty = saved.difficulty;
        if (typeof saved.playerSpeed === 'number') settings.playerSpeed = Math.max(50, Math.min(350, saved.playerSpeed));
        if (typeof saved.fireRate === 'number') settings.fireRate = Math.max(50, Math.min(200, saved.fireRate));
        if (typeof saved.mobileMode === 'boolean') settings.mobileMode = saved.mobileMode;
    } catch (e) { console.warn('[SETTINGS] 读取失败:', e.message); }
}

function saveSettings() {
    try {
        safeSetItem('deathTrench_settings', JSON.stringify({
            difficulty: settings.difficulty,
            playerSpeed: settings.playerSpeed,
            fireRate: settings.fireRate,
            mobileMode: settings.mobileMode
        }));
    } catch (e) { console.warn('[SETTINGS] 保存失败:', e.message); }
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
        maxStack: 999,
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
        effect: { damage: 120, radius: 4 },
        maxStack: 999
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
        effect: { ammoNormal: 50 },
        maxStack: 999
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
        effect: { speedMultiplier: 1.5, duration: 30000 },
        maxStack: 999
    },
    adrenaline: {
        id: 'adrenaline',
        name: '肾上腺素',
        icon: '💉',
        type: ITEM_TYPES.CONSUMABLE,
        rarity: ITEM_RARITY.EPIC,
        stackable: true,
        maxStack: 3,
        weight: 1,
        description: '15秒极速+伤害提升，并回血15',
        usableInRaid: true,
        effect: { speedMultiplier: 1.5, damageBoost: 1.5, heal: 15, duration: 15000 },
        maxStack: 999
    },
    smoke: {
        id: 'smoke',
        name: '烟雾弹',
        icon: '🌫️',
        type: ITEM_TYPES.CONSUMABLE,
        rarity: ITEM_RARITY.UNCOMMON,
        stackable: true,
        maxStack: 5,
        weight: 2,
        description: '投掷后生成烟雾，遮挡敌人视线12秒',
        usableInRaid: true,
        effect: { smoke: 12 },
        maxStack: 999
    },
    energy: {
        id: 'energy',
        name: '能量饮料',
        icon: '🥤',
        type: ITEM_TYPES.CONSUMABLE,
        rarity: ITEM_RARITY.COMMON,
        stackable: true,
        maxStack: 5,
        weight: 1,
        description: '20秒内持续小幅回血',
        usableInRaid: true,
        effect: { regen: 1.5, duration: 20000 },
        maxStack: 999
    },
    plate: {
        id: 'plate',
        name: '防弹插板',
        icon: '🟦',
        type: ITEM_TYPES.CONSUMABLE,
        rarity: ITEM_RARITY.RARE,
        stackable: true,
        maxStack: 3,
        weight: 3,
        description: '30秒减伤40%',
        usableInRaid: true,
        effect: { damageReduction: 0.4, duration: 30000 },
        maxStack: 999
    },
    scanner: {
        id: 'scanner',
        name: '战术探测器',
        icon: '📡',
        type: ITEM_TYPES.CONSUMABLE,
        rarity: ITEM_RARITY.EPIC,
        stackable: true,
        maxStack: 3,
        weight: 1,
        description: '10秒内标记所有敌人位置',
        usableInRaid: true,
        effect: { scanner: 10000 },
        maxStack: 999
    },
    repair: {
        id: 'repair',
        name: '维修包',
        icon: '🔧',
        type: ITEM_TYPES.CONSUMABLE,
        rarity: ITEM_RARITY.RARE,
        stackable: true,
        maxStack: 3,
        weight: 2,
        description: '回血25并将所有武器弹夹补满',
        usableInRaid: true,
        effect: { heal: 25, refill: true },
        maxStack: 999
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
        usableInRaid: false,
        maxStack: 999
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
        usableInRaid: false,
        maxStack: 999
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
        usableInRaid: false,
        maxStack: 999
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
    try { safeSetItem('deathTrench_item_registry', JSON.stringify(itemRegistry)); }
    catch (e) { console.warn('[ITEM] 物品注册表保存失败:', e.message); }
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
        return bp.items.length;
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
        const RARITY_ORDER = { legendary: 4, epic: 3, rare: 2, uncommon: 1, common: 0 };
        // 先放置不可堆叠物品（按稀有度从高到低），尽量优先保留高价值物品，避免被容量截断静默丢弃
        const stackableGroups = [];
        for (const itemId of Object.keys(groups)) {
            const def = getItemDef(itemId);
            if (!def || !def.stackable) {
                const rarity = RARITY_ORDER[def.rarity] ?? 0;
                groups[itemId].forEach(s => s.__rarity = rarity);
                merged.push(...groups[itemId]);
                continue;
            }
            stackableGroups.push({ itemId, def, total: groups[itemId].reduce((sum, s) => sum + (s.count || 0), 0) });
        }
        stackableGroups.sort((a, b) => (RARITY_ORDER[b.def.rarity] ?? 0) - (RARITY_ORDER[a.def.rarity] ?? 0));
        for (const g of stackableGroups) {
            let total = g.total;
            while (total > 0) {
                const chunk = Math.min(total, g.def.maxStack);
                merged.push({ itemId: g.itemId, count: chunk, metadata: null });
                total -= chunk;
            }
        }
        // 仅在确实超出容量时保留高价值物品，并给出警告（不静默丢弃高价值物）
        if (merged.length > bp.capacity) {
            console.warn('[背包] 合并后格数超出容量，已优先保留高价值物品，部分低价值堆叠物品被截断');
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
        if (mod.effects.clipBonus) modified.clipSize = Math.round(modified.clipSize * mod.effects.clipBonus);
        if (mod.effects.fireRateBonus) modified.fireRate = Math.round(modified.fireRate * mod.effects.fireRateBonus);
        if (mod.effects.recoilReduction) modified.recoilReduction = mod.effects.recoilReduction;
        if (mod.effects.reloadBonus) modified.reloadBonus = (modified.reloadBonus || 1) * mod.effects.reloadBonus;
        if (mod.effects.spreadReduction !== undefined) modified.spreadReduction = (modified.spreadReduction !== undefined ? modified.spreadReduction : 1) * mod.effects.spreadReduction;
        if (mod.effects.accuracyBonus) modified.accuracyBonus = (modified.accuracyBonus || 1) * mod.effects.accuracyBonus;
        if (mod.effects.visionBonus) modified.visionBonus = (modified.visionBonus || 1) * mod.effects.visionBonus;
        if (mod.effects.armorPenetration) modified.armorPenetration = true;
        if (mod.effects.silent) modified.silent = true;
        if (mod.effects.isExplosive) modified.isExplosive = true;
        // 标记类效果（镭射弹道线、穿透等）直接继承到改装结果
        if (mod.effects.trajectory) modified.trajectory = true;
        if (mod.effects.penetrationBonus) modified.penetrationBonus = true;
    }

    // 缓存计算结果，updateHUD 每帧调用时直接复用（改装/换弹切换时失效）
    weapon._modifiedCache = modified;
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

    // 改装变更后失效武器属性缓存（updateHUD 每帧读取该缓存）
    const w = player && player.weapons && player.weapons.find(x => x.id === weaponId);
    if (w) w._modifiedCache = null;

    const mod = MODIFICATIONS[modId];
    return { success: true, message: current ? `已卸下 ${mod.name}` : `已装备 ${mod.name}` };
}

// 保存改装数据
function savePlayerMods() {
    try {
        safeSetItem('deathTrench_player_mods', JSON.stringify(playerMods));
        safeSetItem('deathTrench_ammo_inventory', JSON.stringify(ammoInventory));
        safeSetItem('deathTrench_lottery_data', JSON.stringify(lotteryData));
        safeSetItem('deathTrench_lottery_weights', JSON.stringify(customLotteryWeights));
        safeSetItem('deathTrench_skin_bonuses', JSON.stringify(customSkinBonuses));
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
    // 跨武器/角色两个列表查找，避免 currentSkinTab 同步异常导致"皮肤不存在"
    const skin = SKINS.weapons.find(s => s.id === skinId) || SKINS.players.find(s => s.id === skinId);
    if (!skin) return { success: false, message: '皮肤不存在' };
    const resolvedType = SKINS.weapons.includes(skin) ? 'weapon' : 'player';
    if (playerMods.ownedSkins.includes(skinId)) return { success: false, message: '已拥有该皮肤' };

    if (playerData.coins < skin.price) return { success: false, message: '金币不足' };

    playerData.coins -= skin.price;
    playerMods.ownedSkins.push(skinId);
    savePlayerMods();
    updatePlayerStats();

    // 购买成功后刷新皮肤界面和预览
    renderSkinGrid();
    updateSkinPreview(skinId, resolvedType);
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
        // 角色皮肤预览 - 显示角色立绘
        const portrait = skin.portrait ? 'assets/art/' + skin.portrait + '.png' : '';
        previewContainer.innerHTML = `
            <div class="player-skin-preview" style="
                background: ${skin.color || '#00AA55'};
                border-radius: 12px;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 8px;
                box-shadow: 0 0 12px ${skin.color || '#00AA55'};
            ">${portrait ? `<img src="${portrait}" alt="${skin.name}" style="max-width:160px;max-height:160px;object-fit:contain;">` : '👤'}</div>
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
    // 普通任务模式不消耗子弹（冷兵器/弩/火箭筒等无需弹药）
    if (gameMode !== 'raid') return true;

    // 无弹药类型武器（弩、火箭筒等）不消耗弹药
    if (!weapon.ammoType) return true;

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

// 从弹药背包扣除指定数量（用于搜打撤换弹消耗）
function removeAmmoFromBackpack(ammoType, count) {
    let remaining = count;
    for (let i = 0; i < AMMO_BACKPACK_SLOTS; i++) {
        if (ammoBackpack[i].type === ammoType) {
            const remove = Math.min(remaining, ammoBackpack[i].count);
            ammoBackpack[i].count -= remove;
            remaining -= remove;
            if (ammoBackpack[i].count <= 0) {
                ammoBackpack[i].type = null;
                ammoBackpack[i].count = 0;
            }
            if (remaining <= 0) break;
        }
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
        syncLegacyPlayerData();

        renderAmmoBackpack();
        updateAmmoBackpackDisplay();
    } catch (e) {}
}

// 选择弹药槽
function selectAmmoSlot(index) {
    selectedAmmoSlotIndex = index;
    updateAmmoBackpackDisplay();
}

// 搜打撤局内弹药补充面板状态
let raidAmmoPanelOpen = false;
let raidAmmoSelectedCount = 30;
const RAID_AMMO_PRICES = {
    normal: 5,
    ap: 15,
    exp: 25,
    fire: 20
};

function toggleRaidAmmoPanel(e) {
    if (e) e.stopPropagation();
    const panel = document.getElementById('raidAmmoPanel');
    if (!panel) return;
    raidAmmoPanelOpen = !raidAmmoPanelOpen;
    panel.style.display = raidAmmoPanelOpen ? 'block' : 'none';
    if (raidAmmoPanelOpen) {
        raidAmmoSelectedCount = 30;
        document.getElementById('raidAmmoCount').textContent = raidAmmoSelectedCount;
        updateRaidAmmoCost();
    }
}

function closeRaidAmmoPanel(e) {
    if (e) e.stopPropagation();
    const panel = document.getElementById('raidAmmoPanel');
    if (!panel) return;
    raidAmmoPanelOpen = false;
    panel.style.display = 'none';
}

function adjustRaidAmmo(delta) {
    raidAmmoSelectedCount = Math.max(10, raidAmmoSelectedCount + delta);
    document.getElementById('raidAmmoCount').textContent = raidAmmoSelectedCount;
    updateRaidAmmoCost();
}

function updateRaidAmmoCost() {
    const type = document.getElementById('raidAmmoType').value;
    const price = RAID_AMMO_PRICES[type] || 5;
    const cost = raidAmmoSelectedCount * price;
    const costEl = document.getElementById('raidAmmoCost');
    if (costEl) costEl.textContent = cost;
    const buyBtn = document.getElementById('raidAmmoBuyBtn');
    if (buyBtn) buyBtn.disabled = playerData.coins < cost;
}

function buyRaidAmmo() {
    const type = document.getElementById('raidAmmoType').value;
    const price = RAID_AMMO_PRICES[type] || 5;
    const cost = raidAmmoSelectedCount * price;
    if (playerData.coins < cost) {
        showNotification('金币不足！');
        return;
    }
    playerData.coins -= cost;
    ammoInventory[type] = (ammoInventory[type] || 0) + raidAmmoSelectedCount;
    addAmmoToBackpack(type, raidAmmoSelectedCount);
    syncAmmoUI();
    updateHUD();
    showNotification(`购买 ${getAmmoName(type)}×${raidAmmoSelectedCount}，花费 ${cost} 🪙`);
    closeRaidAmmoPanel();
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
        base: { ground: '#3a3a4a', obstacle: '#1a1a2a', cover: '#2a3a4a', building: '#4a5a6a', water: '#1e3a5f' },
        forest: { ground: '#3a5a2a', obstacle: '#1a2f12', cover: '#2a4a1a', building: '#4a3a2a', water: '#2a6a8a' },
        wasteland: { ground: '#8a7a5a', obstacle: '#5a4a3a', cover: '#6a5a4a', building: '#4a3a2a', water: '#3a5a6a' },
        swamp: { ground: '#2d3a22', obstacle: '#1a2412', cover: '#3a4a2a', building: '#3a3a2a', water: '#2a4a3a' }
    };
    const c = colors[theme] || colors.desert;

    mapData = {};
    const seed = Date.now();
    let rngState = seed % 2147483647;
    function rand() {
        rngState = (rngState * 16807) % 2147483647;
        return rngState / 2147483647;
    }
    function randInt(min, max) {
        return Math.floor(rand() * (max - min + 1)) + min;
    }

    const obstacleRate = gameParams.MAP.obstacleRate || 0.08;
    const coverRate = gameParams.MAP.coverRate || 0.14;
    const buildingRate = gameParams.MAP.buildingRate || 0.18;
    const waterRate = gameParams.MAP.waterRate || 0.20;

    // 初始化全地图为地面
    for (let y = 0; y < MAP_SIZE; y++) {
        for (let x = 0; x < MAP_SIZE; x++) {
            mapData[`${x}_${y}`] = { type: 'ground', color: c.ground };
        }
    }

    const centerX = Math.floor(MAP_SIZE / 2);
    const centerY = Math.floor(MAP_SIZE / 2);

    function setTile(x, y, type, color) {
        if (x < 0 || x >= MAP_SIZE || y < 0 || y >= MAP_SIZE) return;
        mapData[`${x}_${y}`] = { type, color };
    }

    function fillRect(x, y, w, h, type, color) {
        for (let dy = 0; dy < h; dy++) {
            for (let dx = 0; dx < w; dx++) {
                setTile(x + dx, y + dy, type, color);
            }
        }
    }

    function drawRoad(x1, y1, x2, y2, width, color) {
        const dist = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
        for (let i = 0; i <= dist; i++) {
            const t = dist === 0 ? 0 : i / dist;
            const cx = Math.round(x1 + (x2 - x1) * t);
            const cy = Math.round(y1 + (y2 - y1) * t);
            for (let dy = -Math.floor(width / 2); dy <= Math.floor(width / 2); dy++) {
                for (let dx = -Math.floor(width / 2); dx <= Math.floor(width / 2); dx++) {
                    const tile = mapData[`${cx + dx}_${cy + dy}`];
                    if (tile && tile.type !== 'building' && tile.type !== 'obstacle') {
                        setTile(cx + dx, cy + dy, 'ground', color);
                    }
                }
            }
        }
    }

    function drawRiver(x1, y1, x2, y2, width) {
        let cx = x1, cy = y1;
        while (Math.abs(cx - x2) > 1 || Math.abs(cy - y2) > 1) {
            for (let dy = -Math.floor(width / 2); dy <= Math.floor(width / 2); dy++) {
                for (let dx = -Math.floor(width / 2); dx <= Math.floor(width / 2); dx++) {
                    if (rand() < 0.85) setTile(cx + dx, cy + dy, 'water', c.water);
                }
            }
            if (rand() < 0.5) cx += Math.sign(x2 - cx);
            else cy += Math.sign(y2 - cy);
        }
    }

    function distToCenter(x, y) {
        return Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
    }

    // 1. 道路/河流骨架：让地图有“街区”感，而不是随机后室
    const roadColor = theme === 'desert' ? '#d4c49a' : (theme === 'jungle' ? '#3a6a3a' : '#555555');
    drawRoad(0, randInt(20, MAP_SIZE - 20), MAP_SIZE - 1, randInt(20, MAP_SIZE - 20), 3, roadColor);
    drawRoad(randInt(20, MAP_SIZE - 20), 0, randInt(20, MAP_SIZE - 20), MAP_SIZE - 1, 3, roadColor);
    if (rand() < waterRate && theme !== 'snow' && theme !== 'volcano') {
        drawRiver(randInt(10, MAP_SIZE - 10), 0, randInt(10, MAP_SIZE - 10), MAP_SIZE - 1, randInt(2, 4));
    }

    // 2. 建筑区：生成若干矩形建筑群，内部为空地，边缘为建筑/掩体
    const buildingCount = Math.floor(buildingRate * 45) + 10;
    for (let i = 0; i < buildingCount; i++) {
        const bx = randInt(8, MAP_SIZE - 18);
        const by = randInt(8, MAP_SIZE - 18);
        const bw = randInt(5, 10);
        const bh = randInt(5, 10);
        if (distToCenter(bx, by) < 12) continue; // 避开出生点

        // 建筑外墙
        for (let dy = 0; dy < bh; dy++) {
            for (let dx = 0; dx < bw; dx++) {
                if (dx === 0 || dx === bw - 1 || dy === 0 || dy === bh - 1) {
                    setTile(bx + dx, by + dy, 'building', c.building);
                } else {
                    setTile(bx + dx, by + dy, 'ground', c.ground);
                }
            }
        }
        // 建筑周围加掩体
        for (let dy = -1; dy <= bh; dy++) {
            for (let dx = -1; dx <= bw; dx++) {
                if (dx === -1 || dx === bw || dy === -1 || dy === bh) {
                    if (rand() < 0.6 && distToCenter(bx + dx, by + dy) > 8) {
                        setTile(bx + dx, by + dy, 'cover', c.cover);
                    }
                }
            }
        }
    }

    // 3. 自然障碍物集群（岩石/废墟/树木）
    const clusterCount = Math.floor(obstacleRate * 90) + 8;
    for (let i = 0; i < clusterCount; i++) {
        const cx = randInt(5, MAP_SIZE - 6);
        const cy = randInt(5, MAP_SIZE - 6);
        if (distToCenter(cx, cy) < 10) continue;
        const radius = randInt(2, 4);
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                if (dx * dx + dy * dy <= radius * radius && rand() < 0.7) {
                    const tile = mapData[`${cx + dx}_${cy + dy}`];
                    if (tile && tile.type === 'ground') {
                        setTile(cx + dx, cy + dy, 'obstacle', c.obstacle);
                    }
                }
            }
        }
    }

    // 4. 零散掩体（沙袋/矮墙/灌木）
    const coverCount = Math.floor(coverRate * 120) + 14;
    for (let i = 0; i < coverCount; i++) {
        const cx = randInt(3, MAP_SIZE - 4);
        const cy = randInt(3, MAP_SIZE - 4);
        if (distToCenter(cx, cy) < 8) continue;
        const len = randInt(2, 5);
        const horizontal = rand() < 0.5;
        for (let k = 0; k < len; k++) {
            const tx = horizontal ? cx + k : cx;
            const ty = horizontal ? cy : cy + k;
            const tile = mapData[`${tx}_${ty}`];
            if (tile && tile.type === 'ground') {
                setTile(tx, ty, 'cover', c.cover);
            }
        }
    }

    // 5. 主题特色区域
    if (theme === 'base') {
        // 军事基地：外围围墙
        for (let x = 4; x < MAP_SIZE - 4; x++) {
            if (rand() < 0.9) setTile(x, 4, 'building', c.building);
            if (rand() < 0.9) setTile(x, MAP_SIZE - 5, 'building', c.building);
        }
        for (let y = 4; y < MAP_SIZE - 4; y++) {
            if (rand() < 0.9) setTile(4, y, 'building', c.building);
            if (rand() < 0.9) setTile(MAP_SIZE - 5, y, 'building', c.building);
        }
    } else if (theme === 'ruins') {
        // 废墟：散落的断墙
        for (let i = 0; i < 20; i++) {
            const rx = randInt(5, MAP_SIZE - 6);
            const ry = randInt(5, MAP_SIZE - 6);
            const len = randInt(3, 8);
            const horizontal = rand() < 0.5;
            for (let k = 0; k < len; k++) {
                const tx = horizontal ? rx + k : rx;
                const ty = horizontal ? ry : ry + k;
                if (rand() < 0.7) setTile(tx, ty, 'obstacle', c.obstacle);
            }
        }
    } else if (theme === 'factory') {
        // 工厂：大型中央厂房
        fillRect(centerX - 12, centerY - 8, 24, 16, 'ground', c.ground);
        for (let dy = 0; dy < 16; dy++) {
            for (let dx = 0; dx < 24; dx++) {
                if (dx === 0 || dx === 23 || dy === 0 || dy === 15) {
                    setTile(centerX - 12 + dx, centerY - 8 + dy, 'building', c.building);
                }
            }
        }
    }

    // 6. 确保出生点 7x7 完全为空地
    fillRect(centerX - 3, centerY - 3, 7, 7, 'ground', c.ground);

    // 7. 为各种地块添加随机装饰细节，增强地图层次感
    for (let y = 0; y < MAP_SIZE; y++) {
        for (let x = 0; x < MAP_SIZE; x++) {
            const tile = mapData[`${x}_${y}`];
            if (!tile) continue;
            const detailRand = ((seed + x * 17417 + y * 31051) % 233280) / 233280;
            if (tile.type === 'ground') {
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
            } else if (tile.type === 'obstacle') {
                if (detailRand < 0.35) {
                    tile.detail = detailRand < 0.15 ? 'crack' : 'rock';
                    tile.detailColor = 'rgba(0,0,0,0.35)';
                }
            } else if (tile.type === 'building') {
                if (detailRand < 0.18) {
                    tile.detail = 'window';
                    tile.detailColor = 'rgba(20,30,40,0.6)';
                }
            } else if (tile.type === 'cover') {
                if (detailRand < 0.45) {
                    tile.detail = 'sandbags';
                    tile.detailColor = 'rgba(60,50,35,0.5)';
                }
            } else if (tile.type === 'water') {
                tile.detail = 'ripple';
                tile.detailColor = 'rgba(255,255,255,0.12)';
            }
        }
    }

    console.log('[MAP] Generated structured map with', Object.keys(mapData).length, 'tiles');
    buildBlockedGrid();
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
        buildBlockedGrid();
        return true;
    } catch (e) {
        console.warn('[MAP] 自定义地图加载失败:', e);
        return false;
    }
}

// 预计算的实体阻挡网格（一维布尔数组，索引 y*MAP_SIZE+x），避免每帧字符串拼接与对象分配
let blockedGrid = null;
function buildBlockedGrid() {
    blockedGrid = new Uint8Array(MAP_SIZE * MAP_SIZE);
    const n = MAP_SIZE * MAP_SIZE;
    for (let i = 0; i < n; i++) {
        const x = i % MAP_SIZE;
        const y = (i / MAP_SIZE) | 0;
        const tile = mapData[x + '_' + y];
        // 自定义非正方形地图时，未填充的越界格子视为"虚空=阻挡"，防止走入碰撞/渲染不一致区域
        if (!tile) {
            blockedGrid[i] = 1;
            continue;
        }
        const t = tile.type;
        if (t === 'obstacle' || t === 'building' || t === 'water' || t === 'brick') {
            blockedGrid[i] = 1;
        }
    }
}
function isBlockedRaw(x, y) {
    if (x < 0 || x >= MAP_SIZE || y < 0 || y >= MAP_SIZE) return true;
    return blockedGrid[y * MAP_SIZE + x] === 1;
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
        if (isBlockedRaw(tx, ty)) return true;
    }
    return false;
}

// 圆形多采样碰撞检测
function isBlockedCircle(x, y, radius) {
    // 地图边界外禁止进入（使用 > 允许实体刚好贴边，避免贴墙时误拦截）
    if (x - radius < 0 || x + radius > MAP_SIZE || y - radius < 0 || y + radius > MAP_SIZE) {
        return true;
    }
    const samples = 8;
    for (let i = 0; i < samples; i++) {
        const angle = (i / samples) * Math.PI * 2;
        const sx = x + Math.cos(angle) * radius * 0.95;
        const sy = y + Math.sin(angle) * radius * 0.95;
        const tx = Math.floor(sx);
        const ty = Math.floor(sy);
        if (isBlockedRaw(tx, ty)) return true;
    }
    // 额外检查中心点
    if (isBlockedRaw(Math.floor(x), Math.floor(y))) return true;
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
        if (isBlockedRaw(Math.floor(cx), Math.floor(cy))) return false;
    }
    return true;
}

// 判断两点连线是否被任一烟雾区遮挡（用于敌人失去视野）
function lineBlockedBySmoke(x1, y1, x2, y2) {
    if (!smokeZones.length) return false;
    const dx = x2 - x1, dy = y2 - y1;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.1) return false;
    const steps = Math.ceil(dist * 2);
    for (let i = 0; i < smokeZones.length; i++) {
        const z = smokeZones[i];
        for (let s = 1; s < steps; s++) {
            const t = s / steps;
            const px = x1 + dx * t, py = y1 + dy * t;
            const ddx = px - z.x, ddy = py - z.y;
            if (ddx * ddx + ddy * ddy <= z.radius * z.radius) return true;
        }
    }
    return false;
}

// ============================================================
// 对象池工具：使用 alive 标记 + 顺序复用
// ============================================================
function poolPushBullet(obj) {
    obj.hitEnemies = obj.hitEnemies || [];
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
    // 若当前任务有未查看的剧情简报，优先弹出
    if (currentMission && (playerData.selectedMode || 'mission') === 'mission' &&
        hasMissionBriefing(currentMission.id) &&
        !storyState.seenBriefings.includes(currentMission.id)) {
        showMissionBriefing();
        return;
    }

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
    // 确定当前游戏模式
    gameMode = playerData.selectedMode || 'mission';
    window.gameMode = gameMode;

    // 重置搜打撤临时数据
    raidLoot = [];
    currentRaidLoadout = null;
    raidBackpack = { capacity: RAID_BACKPACK_CAPACITY, items: [] };

    if (gameMode === 'raid') {
        // 记录本局出战配装（武器、护甲、消耗品）
        currentRaidLoadout = {
            weapons: { ...(playerData.equippedWeapons || { primary: 'rifle', secondary: 'pistol' }) },
            armor: playerData.equippedArmor || '',
            consumables: { ...(playerData.raidLoadout && playerData.raidLoadout.consumables ? playerData.raidLoadout.consumables : { medkits: 0, grenades: 0, speedBoost: 0 }) }
        };

        // 扣除带入的消耗品（护甲在 equipArmor 时已扣除，这里不再重复）
        const inv = playerData.inventory;
        const rc = currentRaidLoadout.consumables;
        for (const key of Object.keys(rc)) {
            const take = rc[key] || 0;
            if (take > 0) {
                inv[key] = Math.max(0, (inv[key] || 0) - take);
            }
        }
        savePlayerData();
        updateSupplyUI();
    }

    // 初始化局内消耗品：键名与对应使用函数一致（medkits/grenades 用复数）
    if (gameMode === 'raid') {
        const c = (currentRaidLoadout && currentRaidLoadout.consumables) || {};
        battleConsumables = {
            medkits: c.medkits || 0,
            grenades: c.grenades || 0,
            speedBoost: c.speedBoost || 0,
            ammoBox: c.ammoBox || 0,
            adrenaline: c.adrenaline || 0,
            smoke: c.smoke || 0,
            energy: c.energy || 0,
            plate: c.plate || 0,
            scanner: c.scanner || 0,
            repair: c.repair || 0
        };
        // 同步玩家库存计数（用单数键，与 useItem 一致）
        playerData.inventory.medkit = c.medkits || 0;
        playerData.inventory.grenade = c.grenades || 0;
        playerData.inventory.speedBoost = c.speedBoost || 0;
        playerData.inventory.ammoBox = c.ammoBox || 0;
        playerData.inventory.adrenaline = c.adrenaline || 0;
        playerData.inventory.smoke = c.smoke || 0;
        playerData.inventory.energy = c.energy || 0;
        playerData.inventory.plate = c.plate || 0;
        playerData.inventory.scanner = c.scanner || 0;
        playerData.inventory.repair = c.repair || 0;
    } else {
        // 普通模式：医疗/加速/弹药箱 generous，手雷与战术道具每局固定数量
        battleConsumables = { medkits: 99999, grenades: 10, speedBoost: 99999, ammoBox: 99999, adrenaline: 99999, smoke: 5, energy: 99999, plate: 99999, scanner: 5, repair: 99999 };
        playerData.inventory.medkit = 99999;
        playerData.inventory.grenade = 10;
        playerData.inventory.speedBoost = 99999;
        playerData.inventory.ammoBox = 99999;
        playerData.inventory.adrenaline = 99999;
        playerData.inventory.smoke = 5;
        playerData.inventory.energy = 99999;
        playerData.inventory.plate = 99999;
        playerData.inventory.scanner = 5;
        playerData.inventory.repair = 99999;
    }

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
    updateRaidBackpackBadge();

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

    // 撤离点：地图边缘随机位置（与出生点保持一定距离，营造搜打撤体验）
    const edgePositions = [
        { x: 5, y: Math.floor(MAP_SIZE / 2) },
        { x: MAP_SIZE - 5, y: Math.floor(MAP_SIZE / 2) },
        { x: Math.floor(MAP_SIZE / 2), y: 5 },
        { x: Math.floor(MAP_SIZE / 2), y: MAP_SIZE - 5 }
    ];
    const farEdges = edgePositions.filter(function(p) {
        return Math.abs(p.x - startX) + Math.abs(p.y - startY) > MAP_SIZE / 3;
    });
    const extractPos = farEdges.length > 0
        ? farEdges[Math.floor(Math.random() * farEdges.length)]
        : edgePositions[0];
    extractX = extractPos.x;
    extractY = extractPos.y;
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
    teammates = [];
    drops = [];
    explosions = [];
    lootCrates = [];
    activeCrate = null;
    lastEnemySpawn = Date.now();

    // 生成队友（双模式均可用）
    spawnTeammates(playerData.teammateCount || 0);

    // 摸金箱子与地图事件仅在搜打撤模式生成
    if (gameMode === 'raid') {
        const difficultyCrateBonus = getDiffConfig(settings.difficulty).crateBonus;
        const crateCount = Math.max(6, 10 + Math.floor(Math.random() * 5) + difficultyCrateBonus);
        generateLootCrates(crateCount);
    }

    // Round 3：初始化搜打撤地图事件
    if (gameMode === 'raid') {
        initMapEvents();
    }

    // 清空按键状态与冲刺状态
    keys.clear();
    shiftHeld = false;
    ctrlHeld = false;
    sprintMultiplier = 1.0;
    lastSprintUpdate = Date.now();

    // 进入战斗后显示小地图
    toggleMinimap(true);

    gameRunning = true;
    gameStartTime = Date.now();
    updateHUD();

    // 游戏开始时启动自动备份（仅在游戏进行中备份）
    try { startAutoBackup(); } catch (e) { console.error(e); }
    // 启动天气随机事件系统
    try { startWeatherSystem(); } catch (e) { console.error(e); }

    // 搜打撤模式显示局内弹药补充入口
    const raidAmmoToggle = document.getElementById('raidAmmoToggle');
    if (raidAmmoToggle) raidAmmoToggle.style.display = gameMode === 'raid' ? 'block' : 'none';
    const raidAmmoPanel = document.getElementById('raidAmmoPanel');
    if (raidAmmoPanel) {
        raidAmmoPanel.style.display = 'none';
        raidAmmoPanelOpen = false;
    }

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
    // 清理未触发的剧情对话定时器，防止跨局误弹
    if (typeof _pendingStoryTimers !== 'undefined' && _pendingStoryTimers.length) {
        _pendingStoryTimers.forEach(function (t) { clearTimeout(t); });
        _pendingStoryTimers = [];
    }
    // 停止天气随机事件系统
    try { stopWeatherSystem(); } catch (e) {}
    
    // 清理动画帧
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }
    
    // 重置游戏状态标志
    gameRunning = false;
    autoFire = false;
    // 隐藏游戏内任务追踪 HUD
    try { updateMissionTracker(); } catch (e) {}
    shiftHeld = false;
    isExtracting = false;
    extractProgress = 0;
    extractStartTime = 0;

    // 隐藏小地图
    toggleMinimap(false);
    
    // 清理按键状态
    keys.clear();
    
    // 清理对象池
    bullets = [];
    enemies = [];
    teammates = [];
    drops = [];
    explosions = [];
    lootCrates = [];
    activeCrate = null;
    mapEvents = [];
    nextMapEventAt = 0;

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
            try {
                update();
            } catch (e) {
                // 单帧逻辑异常不应阻断主循环，避免整局卡死白屏
                if (!window.__updateErrLogged) {
                    console.error('[gameLoop] update 异常已隔离:', e);
                    window.__updateErrLogged = true;
                }
            }
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

    try {
        draw();
    } catch (e) {
        if (!window.__drawErrLogged) {
            console.error('[gameLoop] draw 异常已隔离:', e);
            window.__drawErrLogged = true;
        }
    }
    animationId = requestAnimationFrame(gameLoop);
}

// ============================================================
// 更新逻辑
// ============================================================
function update() {
    // 暂停或非游戏中状态不处理移动输入，避免菜单打开/暂停时角色持续移动
    if (gamePaused || !gameRunning) return;
    const now = Date.now();

    // 计算速度倍率（考虑 buff：speedBoostUntil / 肾上腺素）
    let speedMultiplier = parseFloat(settings.playerSpeed) / 100;
    const b = player.buffs || {};
    if (b.speedBoostUntil && now < b.speedBoostUntil) speedMultiplier *= 1.5;
    if (b.adrenalineUntil && now < b.adrenalineUntil) speedMultiplier *= 1.5;

    // 持续回血（能量饮料）
    if (b.regenUntil && now < b.regenUntil && b.regenPerTick) {
        player.health = Math.min(player.maxHealth, player.health + b.regenPerTick);
    }
    // 防弹插板过期清理
    if (b.armorPlateUntil && now >= b.armorPlateUntil) {
        b.armorPlateUntil = 0;
        b.damageReduction = 0;
    }
    // 肾上腺素增益过期清理
    if (b.adrenalineUntil && now >= b.adrenalineUntil) b.adrenalineUntil = 0;

    // 清理过期的烟雾区域
    if (smokeZones.length) {
        smokeZones = smokeZones.filter(z => z.until > now);
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
    const speed = baseSpeed * speedMultiplier * getWeatherSpeedMul();

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

    // 移动端虚拟摇杆：平滑插值到目标方向，避免转身瞬间抖动；独立于键盘逻辑
    if (settings.mobileMode && window.__mobileMove) {
        const mv = window.__mobileMove, tgt = window.__mobileMoveTarget;
        mv.dx += (tgt.dx - mv.dx) * 0.25;
        mv.dy += (tgt.dy - mv.dy) * 0.25;
        if (mv.dx || mv.dy) {
            dx += mv.dx * speed;
            dy += mv.dy * speed;
        }
    }

    if (dx !== 0 || dy !== 0) {
        const length = Math.sqrt(dx * dx + dy * dy);
        dx = (dx / length) * speed;
        dy = (dy / length) * speed;

        // 碰撞处理：优先尝试组合移动，卡在拐角时 fallback 到单轴滑动
        const radius = PLAYER_SIZE * 0.5;
        let movedX = false, movedY = false;

        // 1) 组合移动（对角线方向优先，减少墙角卡顿）
        if (!isBlockedCircle(player.x + dx, player.y + dy, radius)) {
            player.x += dx;
            player.y += dy;
            movedX = true;
            movedY = true;
        }

        // 2) 单轴滑动：X 方向
        if (!movedX) {
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
        }

        // 3) 单轴滑动：Y 方向
        if (!movedY) {
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
    if (settings.mobileMode) {
        // 移动端无鼠标：枪口朝向跟随虚拟摇杆方向（移动即开火方向），叠加后坐力
        if (window.__mobileMove && (window.__mobileMove.dx || window.__mobileMove.dy)) {
            player.angle = Math.atan2(window.__mobileMove.dy, window.__mobileMove.dx) + recoilAngle;
        }
        // 无摇杆输入时保持当前朝向（recoilAngle 已自然衰减，不重复叠加）
    } else {
        player.angle = Math.atan2(mouseY - screenCenterY, mouseX - screenCenterX) + recoilAngle;
    }

    // 更新瞄准方向与镜头缩放
    // 狙击枪开镜：缩小镜头以观察全图（配合黑色遮罩只露出枪口方向）
    // 其余枪开镜：保持放大（原行为）
    if (aiming) {
        aimAngle = Math.atan2(mouseY - screenCenterY, mouseX - screenCenterX);
        const cw = player.weapons && player.weapons[player.currentWeapon];
        viewScale = (cw && cw.type === 'sniper') ? 0.5 : 2.2;
    } else {
        viewScale = Math.max(1, viewScale - 0.15); // 平滑回弹
        if (viewScale <= 1.01) viewScale = 1;
    }

    // 左键按住持续开火（由 canShoot 节流）；空格 autoFire 同理
    if ((autoFire || mouseFiring) && !aiming && canShoot()) {
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

        // 远离屏幕的子弹仅累计距离，跳过碰撞与渲染级计算
        if (Math.abs(bullet.x - player.x) > VIEW_RANGE_X + 8 || Math.abs(bullet.y - player.y) > VIEW_RANGE_Y + 8) {
            continue;
        }

        const newX = bullet.x + Math.cos(bullet.angle) * bullet.speed;
        const newY = bullet.y + Math.sin(bullet.angle) * bullet.speed;

        // 手雷使用小半径圆形碰撞，避免靠近墙体时提前引爆
        const bulletRadius = bullet.type === 'grenade' ? 0.15 : 0;
        const blocked = bulletRadius > 0 ? isBlockedCircle(newX, newY, bulletRadius) : isBlocked(newX, newY);

        if (blocked) {
            if (bullet.type === 'grenade') {
                explodeGrenade(bullet.x, bullet.y);
            } else if (bullet.isExplosive) {
                detonateRocket(bullet.x, bullet.y, bullet.damage);
            } else {
                poolPushExplosion({ x: newX, y: newY, radius: 3, alpha: 1, color: '#ff4444' });
            }
            bullet.alive = false;
            continue;
        }

        bullet.x = newX;
        bullet.y = newY;

        if ((bullet.owner === 'player' || bullet.owner === 'teammate') && bullet.type !== 'grenade') {
            let hit = false;
            for (let j = 0; j < enemies.length; j++) {
                const enemy = enemies[j];
                if (!enemy.alive) continue;
                const dxh = bullet.x - enemy.x;
                const dyh = bullet.y - enemy.y;
                if (dxh * dxh + dyh * dyh < 1.0) {
                    if (bullet.hitEnemies && bullet.hitEnemies.indexOf(enemy) !== -1) continue;
                    const ammoType = bullet.type || 'normal';
                    if (bullet.isExplosive) {
                        detonateRocket(enemy.x, enemy.y, bullet.damage);
                        bullet.hitEnemies.push(enemy);
                        bullet.alive = false;
                        break;
                    }
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
                    bullet.hitEnemies.push(enemy);
                    enemy.hitFlash = 5; // 受击闪烁帧数
                    // 敌人受击会提醒周围同伴前来协防/调查
                    alertNearbyEnemies(enemy.x, enemy.y, 10);

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
                // 穿透：仍有剩余穿透次数则继续飞行，否则销毁
                if (bullet.penetration > 0) bullet.penetration--;
                else bullet.alive = false;
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
                // 受到伤害中断搜索物资箱
                if (activeCrate && activeCrate.state === 'opening') {
                    activeCrate.state = 'closed';
                    activeCrate.searchStart = 0;
                    activeCrate.progress = 0;
                    activeCrate = null;
                    showNotification('受到伤害，搜索中断！', 'warning');
                    const fill = document.getElementById('lootProgressFill');
                    if (fill) fill.style.width = '0%';
                }
                poolPushExplosion({ x: player.x, y: player.y, radius: 5, alpha: 1, color: '#ff0000' });
                if (player.health <= 0) {
                    gameOver();
                }
                bullet.alive = false;
                continue;
            }
            // 敌人子弹也会命中队友
            for (let k = 0; k < teammates.length; k++) {
                const tm = teammates[k];
                if (!tm.alive) continue;
                const dxm = bullet.x - tm.x;
                const dym = bullet.y - tm.y;
                if (dxm * dxm + dym * dym < 1.0) {
                    tm.health -= bullet.damage;
                    tm.hitFlash = 5;
                    poolPushExplosion({ x: tm.x, y: tm.y, radius: 4, alpha: 1, color: '#ff0000' });
                    if (tm.health <= 0) {
                        tm.alive = false;
                        showNotification(tm.name + ' 阵亡');
                    }
                    bullet.alive = false;
                    break;
                }
            }
            if (!bullet.alive) continue;
        }
    }

    // 清理敌人（从后往前打标记删除）
    for (let i = enemies.length - 1; i >= 0; i--) {
        if (!enemies[i].alive) enemies.splice(i, 1);
    }

    // 生成敌人：根据难度和队友数量调整上限与间隔
    const difficultyMul = settings.difficulty === 'topsecret' ? 2.4 : (settings.difficulty === 'confidential' ? 1.8 : (settings.difficulty === 'advanced' ? 1.2 : 0.8));
    const teammateMul = 1 + (teammates ? teammates.length : 0) * 0.35;
    const enemyCount = Math.floor((gameParams.ENEMY.count || 5) * difficultyMul * teammateMul);
    const spawnInterval = Math.floor((gameParams.ENEMY.spawnInterval || 3500) / (difficultyMul * teammateMul));

    if (enemies.length < enemyCount && now - lastEnemySpawn > spawnInterval) {
        spawnEnemy();
        lastEnemySpawn = now;
    }

    // Round 3：搜打撤地图事件与 AI 埋伏
    if (gameMode === 'raid') {
        updateMapEvents(now);
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
    let pathComputedThisFrame = 0;
    const MAX_PATHS_PER_FRAME = 4; // 每帧最多计算的寻路数，兼顾响应速度与性能

    for (let i = 0; i < enemies.length; i++) {
        const enemy = enemies[i];

        // 状态字段初始化与清理
        if (typeof enemy.speedMul === 'undefined') {
            enemy.speedMul = 0.85 + Math.random() * 0.3;
        }
        const curEnemySpeed = enemyMoveSpeed * enemy.speedMul;
        if (typeof enemy.aiState !== 'string') {
            enemy.aiState = 'chase';
            enemy.aiStateTimer = 0;
        }
        if (typeof enemy.aiStateTimer !== 'number') enemy.aiStateTimer = 0;
        if (!enemy.investigateTarget) enemy.investigateTarget = null;
        if (!enemy.coverTarget) enemy.coverTarget = null;

        // 1. 目标选择：玩家或最近的威胁（队友）
        let target = player;
        if (typeof getNearestEnemyThreat === 'function') {
            const t = getNearestEnemyThreat(enemy);
            if (t) target = t;
        }

        const dxE = target.x - enemy.x;
        const dyE = target.y - enemy.y;
        const distSq = dxE * dxE + dyE * dyE;
        const dist = distSq > 0 ? Math.sqrt(distSq) : 0.01;

        // 远距离敌人：不做完整 AI，仅直接向目标靠近，减少每帧计算
        if (dist >= 30 && dist < 70) {
            enemy.angle = Math.atan2(dyE, dxE);
            const stepX = (dxE / dist) * curEnemySpeed * 0.6;
            const stepY = (dyE / dist) * curEnemySpeed * 0.6;
            const enemyRadius = getEnemyRadius(enemy);
            if (!isBlockedCircle(enemy.x + stepX, enemy.y, enemyRadius)) enemy.x += stepX;
            if (!isBlockedCircle(enemy.x, enemy.y + stepY, enemyRadius)) enemy.y += stepY;
            continue;
        }
        if (dist >= 70) continue;

        const hasVisibleTarget = hasLineOfSight(enemy.x, enemy.y, target.x, target.y) &&
            !lineBlockedBySmoke(enemy.x, enemy.y, target.x, target.y);
        enemy.angle = Math.atan2(dyE, dxE);

        const healthPercent = enemy.health / enemy.maxHealth;

        // flee 超时恢复 chase
        if (enemy.aiState === 'flee' && now > enemy.aiStateTimer) {
            enemy.aiState = 'chase';
            enemy.coverTarget = null;
            enemy.path = null;
        }
        // investigate 超时清理
        if (enemy.investigateTarget && now > enemy.investigateTarget.until) {
            enemy.investigateTarget = null;
            if (enemy.aiState === 'investigate') {
                enemy.aiState = 'chase';
                enemy.path = null;
            }
        }

        // 状态切换
        if (hasVisibleTarget) {
            enemy.investigateTarget = null;
            if (enemy.aiState === 'investigate') {
                enemy.aiState = 'chase';
                enemy.path = null;
            }

            // 3. 低血量非 Boss 概率寻找掩体 flee
            if (enemy.aiState !== 'flee' && enemy.aiState !== 'investigate' &&
                healthPercent < 0.30 && !enemy.isBoss && Math.random() < 0.02) {
                enemy.aiState = 'flee';
                enemy.aiStateTimer = now + 2000 + Math.random() * 2000;
                enemy.path = null;
                const cover = findNearestCover(enemy.x, enemy.y, target.x, target.y, 12);
                enemy.coverTarget = cover ? { x: cover.x, y: cover.y } : null;
                if (!enemy.coverTarget) {
                    // 找不到掩体时向远离目标的方向跑
                    enemy.coverTarget = { x: enemy.x - dxE * 5, y: enemy.y - dyE * 5 };
                }
            }
        } else if (enemy.investigateTarget && enemy.aiState !== 'flee') {
            // 2. 没有可见目标且存在噪音源时进入 investigate
            if (enemy.aiState !== 'investigate') {
                enemy.aiState = 'investigate';
                enemy.path = null;
            }
        }

        // 5. A* 目标：chase 时追目标，flee 时去掩体，investigate 时去噪音源
        let destX = target.x;
        let destY = target.y;
        if (enemy.aiState === 'flee' && enemy.coverTarget) {
            destX = enemy.coverTarget.x;
            destY = enemy.coverTarget.y;
        } else if (enemy.aiState === 'investigate' && enemy.investigateTarget) {
            destX = enemy.investigateTarget.x;
            destY = enemy.investigateTarget.y;
        }

        const directChase = (enemy.aiState !== 'flee' && enemy.aiState !== 'investigate')
            && dist < 10 && hasVisibleTarget;

        if (!directChase) {
            const dynamicInterval = dist < 8 ? 400 : (dist < 15 ? 700 : 1200);
            const pathInterval = typeof enemy.pathUpdateInterval === 'number'
                ? enemy.pathUpdateInterval
                : dynamicInterval;
            const timeOk = (now - (enemy.lastPathUpdate || 0)) > pathInterval;
            const isSelected = (i === pathfinderIndex) || !enemy.path;
            if (isSelected && timeOk && pathComputedThisFrame < MAX_PATHS_PER_FRAME) {
                const enemyGridX = Math.floor(enemy.x);
                const enemyGridY = Math.floor(enemy.y);
                const destGridX = Math.floor(destX);
                const destGridY = Math.floor(destY);
                enemy.path = aStarPath(enemyGridX, enemyGridY, destGridX, destGridY);
                enemy.pathIndex = 1;
                enemy.lastPathUpdate = now;
                pathComputedThisFrame++;
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
            // 4. 武器类型战术：目标是玩家时读取其当前武器，目标是队友时按步枪默认处理
            const targetWeapon = (target === player && player.weapons && player.weapons[player.currentWeapon])
                ? player.weapons[player.currentWeapon]
                : null;
            const twt = targetWeapon ? targetWeapon.type : WEAPON_TYPES.RIFLE;
            const isTargetMelee = twt === WEAPON_TYPES.MELEE;
            const isTargetShotgun = twt === WEAPON_TYPES.SHOTGUN;
            const isTargetSniper = twt === WEAPON_TYPES.SNIPER;

            let desiredAngle;
            if (enemy.aiState === 'flee' && enemy.coverTarget) {
                const cdx = enemy.coverTarget.x - enemy.x;
                const cdy = enemy.coverTarget.y - enemy.y;
                desiredAngle = Math.atan2(cdy, cdx);
            } else if (enemy.aiState === 'flee') {
                desiredAngle = Math.atan2(-dyE, -dxE);
            } else if (enemy.aiState === 'investigate' && enemy.investigateTarget) {
                const idx = enemy.investigateTarget.x - enemy.x;
                const idy = enemy.investigateTarget.y - enemy.y;
                desiredAngle = Math.atan2(idy, idx);
            } else if (isTargetMelee) {
                if (dist < 5) desiredAngle = Math.atan2(-dyE, -dxE);
                else if (dist > 9) desiredAngle = Math.atan2(dyE, dxE);
                else desiredAngle = Math.atan2(dyE, dxE) + Math.PI / 2;
            } else if (isTargetShotgun) {
                if (dist < 7) desiredAngle = Math.atan2(-dyE, -dxE);
                else desiredAngle = Math.atan2(dyE, dxE) + (Math.sin(now * 0.003 + i) > 0 ? 1 : -1) * Math.PI / 3;
            } else if (isTargetSniper) {
                if (dist > 14) desiredAngle = Math.atan2(dyE, dxE);
                else desiredAngle = Math.atan2(dyE, dxE) + (Math.sin(now * 0.006 + i) > 0 ? 1 : -1) * Math.PI / 2.2;
            } else {
                desiredAngle = Math.atan2(dyE, dxE);
            }

            let moveX = 0, moveY = 0;
            if (enemy.aiState === 'flee') {
                moveX = Math.cos(desiredAngle) * curEnemySpeed * 1.3;
                moveY = Math.sin(desiredAngle) * curEnemySpeed * 1.3;
            } else if (enemy.aiState === 'investigate') {
                moveX = Math.cos(desiredAngle) * curEnemySpeed;
                moveY = Math.sin(desiredAngle) * curEnemySpeed;
            } else if (isTargetMelee) {
                if (dist > 12 || dist < 5) {
                    moveX = Math.cos(desiredAngle) * curEnemySpeed;
                    moveY = Math.sin(desiredAngle) * curEnemySpeed;
                } else {
                    moveX = Math.cos(desiredAngle) * curEnemySpeed * 0.4;
                    moveY = Math.sin(desiredAngle) * curEnemySpeed * 0.4;
                }
            } else if (isTargetShotgun && dist < 10) {
                moveX = Math.cos(desiredAngle) * curEnemySpeed;
                moveY = Math.sin(desiredAngle) * curEnemySpeed;
            } else if (isTargetSniper) {
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

        // 2/3. 到达/超时后的状态清理
        if (enemy.aiState === 'investigate' && enemy.investigateTarget) {
            const ix = enemy.investigateTarget.x - enemy.x;
            const iy = enemy.investigateTarget.y - enemy.y;
            if (Math.sqrt(ix * ix + iy * iy) < 2 || now > enemy.investigateTarget.until) {
                enemy.aiState = 'chase';
                enemy.investigateTarget = null;
                enemy.path = null;
            }
        }
        if (enemy.aiState === 'flee' && enemy.coverTarget) {
            const cx = enemy.coverTarget.x - enemy.x;
            const cy = enemy.coverTarget.y - enemy.y;
            if (Math.sqrt(cx * cx + cy * cy) < 1) {
                enemy.aiState = 'chase';
                enemy.coverTarget = null;
                enemy.path = null;
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

        // 6. 在 3~12 格范围内射击（需要视线）
        if (dist >= 3 && dist <= 12 && now - enemy.lastShot > enemy.fireRate && hasVisibleTarget) {
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

    // 更新队友 AI 与摸金箱子
    updateTeammates(now);
    updateLootCrates(now);

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
        // 远离屏幕的爆炸效果快速淡出，减少无效计算
        if (Math.abs(exp.x - player.x) > VIEW_RANGE_X + 5 || Math.abs(exp.y - player.y) > VIEW_RANGE_Y + 5) {
            exp.alive = false;
            continue;
        }
        exp.radius += 0.5;
        exp.alpha -= 0.1;
        if (exp.alpha <= 0) exp.alive = false;
    }

    // 更新掉落物
    for (let i = 0; i < drops.length; i++) {
        const drop = drops[i];
        if (!drop.alive) continue;
        if (Math.abs(drop.x - player.x) > VIEW_RANGE_X + 3 || Math.abs(drop.y - player.y) > VIEW_RANGE_Y + 3) continue;
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
    // 爆炸声会吸引远处敌人
    alertNearbyEnemies(x, y, grenadeRadius * 4 + 8);
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
        if (ddx * ddx + ddy * ddy <= blastRadiusSq) {
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
    if (pdx * pdx + pdy * pdy <= blastRadiusSq) {
        player.health -= 30;
        poolPushExplosion({ x: player.x, y: player.y, radius: 4, alpha: 1, color: '#ff0000' });
        if (player.health <= 0) gameOver();
    }
}

// 火箭筒爆炸：大范围高伤害，对敌人、boss 与玩家自身均生效
function detonateRocket(x, y, baseDamage) {
    const r = 4.5;
    const rSq = r * r;
    const dmg = baseDamage || 300;
    alertNearbyEnemies(x, y, r * 4 + 8);
    poolPushExplosion({ x, y, radius: r, alpha: 1, color: '#ff6600' });
    poolPushExplosion({ x, y, radius: r / 2, alpha: 1, color: '#ffdd00' });
    for (let j = 0; j < enemies.length; j++) {
        const enemy = enemies[j];
        if (!enemy.alive) continue;
        const ddx = enemy.x - x, ddy = enemy.y - y;
        if (ddx * ddx + ddy * ddy <= rSq) {
            const falloff = 1 - Math.sqrt(ddx * ddx + ddy * ddy) / r * 0.5;
            enemy.health -= Math.floor(dmg * falloff);
            poolPushExplosion({ x: enemy.x, y: enemy.y, radius: 3, alpha: 1, color: '#ff0044' });
            if (enemy.health <= 0) {
                enemy.alive = false;
                player.kills++;
                if (enemy.isBoss) {
                    player.score += 500; playerData.coins += 50;
                    spawnDrop(enemy.x, enemy.y); spawnDrop(enemy.x, enemy.y); spawnDrop(enemy.x, enemy.y);
                    showNotification('Boss 被消灭！奖励 +50 金币', 'success');
                } else {
                    player.score += 100; spawnDrop(enemy.x, enemy.y);
                }
            }
        }
    }
    const pdx = player.x - x, pdy = player.y - y;
    if (pdx * pdx + pdy * pdy <= rSq) {
        const falloff = 1 - Math.sqrt(pdx * pdx + pdy * pdy) / r * 0.5;
        player.health -= Math.floor(60 * falloff);
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

    // 局内消耗品检查
    if (battleConsumables && (battleConsumables.grenades || 0) <= 0) {
        const modeHint = gameMode === 'raid' ? '携带的手雷已用完！' : '本局手雷已用完！';
        showNotification(modeHint);
        return;
    }
    if (battleConsumables) {
        battleConsumables.grenades--;
    }

    // 兼容旧版背包系统：仅在大厅或需要持久化时扣减全局库存
    if (BackpackManager.hasItem('grenade', 1)) {
        BackpackManager.useItem('grenade', 1);
    }
    if ((playerData.inventory.grenades || 0) > 0) {
        playerData.inventory.grenades = Math.max(0, (playerData.inventory.grenades || 0) - 1);
    }
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

// 投掷烟雾弹：在落点生成烟雾云，持续一段时间，降低范围内敌人命中率
function throwSmoke() {
    if (!gameRunning || !player) return;
    if (enableItemCooldown) {
        const now = Date.now();
        if (now - lastItemUse < ITEM_COOLDOWN) return;
        lastItemUse = now;
    }
    if (battleConsumables && (battleConsumables.smoke || 0) <= 0) {
        showNotification(gameMode === 'raid' ? '携带的烟雾弹已用完！' : '本局烟雾弹已用完！');
        return;
    }
    if (battleConsumables) battleConsumables.smoke--;
    if ((playerData.inventory.smoke || 0) > 0) {
        playerData.inventory.smoke = Math.max(0, (playerData.inventory.smoke || 0) - 1);
    }
    const tx = player.x + Math.cos(player.angle) * 6;
    const ty = player.y + Math.sin(player.angle) * 6;
    smokeZones.push({ x: tx, y: ty, radius: 4.5, until: Date.now() + 12000 });
    showNotification('🌫️ 烟雾弹已投掷，12秒内掩盖视野！');
    updateHUD();
}

// 激活探测器：短时间内在雷达/画面上显示所有敌人轮廓
function activateScanner() {
    if (!gameRunning || !player) return;
    if (enableItemCooldown) {
        const now = Date.now();
        if (now - lastItemUse < ITEM_COOLDOWN) return;
        lastItemUse = now;
    }
    if (battleConsumables && (battleConsumables.scanner || 0) <= 0) {
        showNotification(gameMode === 'raid' ? '携带的探测器已用完！' : '本局探测器已用完！');
        return;
    }
    if (battleConsumables) battleConsumables.scanner--;
    if ((playerData.inventory.scanner || 0) > 0) {
        playerData.inventory.scanner = Math.max(0, (playerData.inventory.scanner || 0) - 1);
    }
    player.buffs.scannerUntil = Date.now() + 10000;
    showNotification('📡 探测器已激活，10秒内显示所有敌人！');
    updateHUD();
}

// ============================================================
// 绘制
// ============================================================
// 世界坐标→屏幕坐标投影（替代 draw 系列中 9 处重复公式）
function worldToScreen(x, y) {
    return {
        x: canvas.width / 2 + (x - player.x) * TILE_SIZE,
        y: canvas.height / 2 + (y - player.y) * TILE_SIZE
    };
}

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

    // 镜头缩放：放大（普通开镜）或缩小（狙击开镜看全图）
    if (viewScale > 1) {
        const cx = canvas.width / 2, cy = canvas.height / 2;
        const off = (viewScale - 1) * 240; // 朝瞄准方向推近视点
        ctx.translate(Math.cos(aimAngle) * off, Math.sin(aimAngle) * off);
        ctx.translate(cx, cy);
        ctx.scale(viewScale, viewScale);
        ctx.translate(-cx, -cy);
    } else if (viewScale < 1) {
        const cx = canvas.width / 2, cy = canvas.height / 2;
        ctx.translate(cx, cy);
        ctx.scale(viewScale, viewScale);
        ctx.translate(-cx, -cy);
    }
    
    // 绘制网格背景（使用深色调避免干扰地图）— 合并为单次路径，减少 stroke 调用
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < canvas.width; x += 40) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
    }
    for (let y = 0; y < canvas.height; y += 40) {
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
    }
    ctx.stroke();
    
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

    // 绘制队友
    drawTeammates();

    // 绘制队友离屏方向指示箭头
    drawTeammateIndicators();

    // 绘制摸金箱子
    drawLootCrates();

    // 绘制地图事件标记（搜打撤）
    drawMapEvents();

    // 绘制敌人
    const scannerOn = player.buffs && player.buffs.scannerUntil && Date.now() < player.buffs.scannerUntil;
    for (let i = 0; i < enemies.length; i++) {
        const enemy = enemies[i];
        if (Math.abs(enemy.x - player.x) <= VIEW_RANGE_X && Math.abs(enemy.y - player.y) <= VIEW_RANGE_Y) {
            drawEnemy(enemy);
            if (scannerOn) {
                const s = worldToScreen(enemy.x, enemy.y);
                ctx.save();
                ctx.strokeStyle = 'rgba(80,255,120,0.9)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(s.x, s.y, enemy.isBoss ? 34 : 18, 0, Math.PI * 2);
                ctx.stroke();
                ctx.fillStyle = 'rgba(80,255,120,0.9)';
                ctx.font = '12px monospace';
                ctx.textAlign = 'center';
                ctx.fillText('▲', s.x, s.y - 22);
                ctx.restore();
            }
        }
    }

    // 绘制烟雾区
    for (let i = 0; i < smokeZones.length; i++) {
        const z = smokeZones[i];
        if (Math.abs(z.x - player.x) > VIEW_RANGE_X + z.radius || Math.abs(z.y - player.y) > VIEW_RANGE_Y + z.radius) continue;
        const s = worldToScreen(z.x, z.y);
        const rad = z.radius * TILE_SIZE;
        const grad = ctx.createRadialGradient(s.x, s.y, rad * 0.2, s.x, s.y, rad);
        grad.addColorStop(0, 'rgba(200,200,200,0.78)');
        grad.addColorStop(1, 'rgba(200,200,200,0)');
        ctx.save();
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(s.x, s.y, rad, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
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

    // 狙击开镜：全屏黑遮罩，仅保留枪口正对方向可视区域，并显示弹道线
    if (aiming && player.weapons && player.weapons[player.currentWeapon] && player.weapons[player.currentWeapon].type === 'sniper') {
        const cw = canvas.width, ch = canvas.height;
        const cx = cw / 2, cy = ch / 2;
        const ang = player.angle;
        const len = Math.hypot(cw, ch);
        ctx.save();
        // 全屏黑遮罩
        ctx.fillStyle = 'rgba(0,0,0,0.97)';
        ctx.fillRect(0, 0, cw, ch);
        // 沿枪口方向挖出可视光束（擦除黑色）
        ctx.globalCompositeOperation = 'destination-out';
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(ang);
        const beamHalf = 70;
        ctx.beginPath();
        ctx.moveTo(0, -beamHalf * 0.25);
        ctx.lineTo(len, -beamHalf);
        ctx.lineTo(len, beamHalf);
        ctx.lineTo(0, beamHalf * 0.25);
        ctx.closePath();
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.restore();
        ctx.globalCompositeOperation = 'source-over';
        ctx.restore();
        // 弹道线（红色虚线，沿枪口方向贯穿全图）
        ctx.save();
        ctx.strokeStyle = 'rgba(255,60,60,0.95)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([10, 8]);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(ang) * len, cy + Math.sin(ang) * len);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
    }

    // 天气色调叠加（覆盖世界，不影响 UI）
    applyWeatherOverlay();

    // 绘制小地图（在屏幕震动恢复后绘制，避免震动影响）
    drawMinimap();
}

function drawExtractionZone() {
    const screenX = worldToScreen(extractX, extractY).x;
    const screenY = worldToScreen(extractX, extractY).y;
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
    const screenX = worldToScreen(player.x, player.y).x;
    const screenY = worldToScreen(player.x, player.y).y;

    ctx.save();
    ctx.translate(screenX, screenY);
    ctx.rotate(player.angle);

    const skinColor = getPlayerSkinColor();
    const skin = SKINS.players.find(s => s.id === playerMods.equippedPlayerSkin);
    const glowColor = skin && skin.color ? lightenColor(skin.color, 30) : '#00ff88';

    // 身体：应用皮肤颜色，带发光描边，确保深色皮肤在战场上也能看清
    ctx.fillStyle = skinColor;
    ctx.strokeStyle = glowColor;
    ctx.lineWidth = 2;
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(PLAYER_SIZE * TILE_SIZE, 0);
    ctx.lineTo(-PLAYER_SIZE * TILE_SIZE * 0.7, -PLAYER_SIZE * TILE_SIZE * 0.7);
    ctx.lineTo(-PLAYER_SIZE * TILE_SIZE * 0.5, 0);
    ctx.lineTo(-PLAYER_SIZE * TILE_SIZE * 0.7, PLAYER_SIZE * TILE_SIZE * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 核心：高亮发光，突出皮肤主题色
    ctx.fillStyle = glowColor;
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(0, 0, PLAYER_SIZE * TILE_SIZE * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // 手持武器：朝向鼠标方向（ctx 已 rotate 到 player.angle，+x 为枪口方向）
    const u = PLAYER_SIZE * TILE_SIZE;
    const wlen = u * 1.7;
    const wwid = u * 0.42;
    const wx = u * 0.15;
    ctx.fillStyle = '#2a2f33';
    ctx.strokeStyle = '#6a7280';
    ctx.lineWidth = 1;
    ctx.fillRect(wx, -wwid / 2, wlen, wwid);
    ctx.strokeRect(wx, -wwid / 2, wlen, wwid);
    // 枪管/枪口
    ctx.fillStyle = '#15181b';
    ctx.fillRect(wx + wlen, -wwid * 0.35, u * 0.28, wwid * 0.7);
    // 握把
    ctx.fillStyle = '#3a3f44';
    ctx.fillRect(wx + wlen * 0.35, wwid / 2, u * 0.28, u * 0.5);

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

    // 装配镭射指示器：显示弹道线（沿枪口 +x 方向贯穿一段距离）
    const cWeap = player.weapons[player.currentWeapon];
    const modW = getModifiedWeapon(cWeap);
    if (modW && modW.trajectory) {
        const beamLen = 24 * TILE_SIZE;
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 50, 50, 0.6)';
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.moveTo(wx + wlen, 0);
        ctx.lineTo(wx + wlen + beamLen, 0);
        ctx.stroke();
        ctx.setLineDash([]);
        // 激光红点
        ctx.fillStyle = 'rgba(255, 50, 50, 0.9)';
        ctx.beginPath();
        ctx.arc(wx + wlen + beamLen, 0, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
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

// 敌人立绘全局预加载缓存：启动时一次性加载，drawEnemy 直接引用，避免每帧 new Image
const ENEMY_SPRITE_URLS = [
    'assets/art/enemy-grunt.png', 'assets/art/enemy-grunt2.png',
    'assets/art/enemy-sniper.png', 'assets/art/enemy-sniper2.png',
    'assets/art/enemy-heavy.png', 'assets/art/enemy-heavy2.png'
];
const ENEMY_SPRITES = {};
ENEMY_SPRITE_URLS.forEach(function (url) {
    try {
        const img = new Image();
        img.src = url;
        ENEMY_SPRITES[url] = img;
    } catch (e) { /* 忽略加载失败 */ }
});
function getEnemySprite(url) {
    return ENEMY_SPRITES[url] || null;
}

function drawEnemy(enemy) {
    const _ws = worldToScreen(enemy.x, enemy.y);
    const screenX = _ws.x;
    const screenY = _ws.y;

    const sizeMul = enemy.isBoss ? 2.2 : 1.0;
    const r = ENEMY_SIZE * TILE_SIZE * sizeMul;
    const now = performance.now();

    // ---- Boss：程序化动作绘制（已移除静态背景立绘） ----
    if (enemy.isBoss) {
        const pulse = 1 + 0.08 * Math.sin(now / 250);          // 呼吸缩放
        const spin = (now / 600) % (Math.PI * 2);              // 旋转光环
        const rr = r * pulse;
        ctx.save();
        ctx.translate(screenX, screenY);

        // 外层旋转能量环
        ctx.strokeStyle = 'rgba(255,80,255,0.55)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const a0 = spin + i * Math.PI / 3;
            const a1 = a0 + Math.PI / 6;
            ctx.moveTo(Math.cos(a0) * rr, Math.sin(a0) * rr);
            ctx.lineTo(Math.cos(a1) * rr * 1.25, Math.sin(a1) * rr * 1.25);
        }
        ctx.stroke();

        // 主体（紫色脉冲圆 + 攻击预兆）
        const charging = (now % 2000) < 400; // 每 2s 有 0.4s “蓄力”动作
        ctx.fillStyle = charging ? '#ff99ff' : '#aa00aa';
        ctx.shadowColor = '#ff66ff';
        ctx.shadowBlur = charging ? 28 : 16;
        ctx.beginPath();
        ctx.arc(0, 0, rr * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // 朝向玩家的“眼”
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(Math.cos(enemy.angle) * rr * 0.3, Math.sin(enemy.angle) * rr * 0.3, rr * 0.12, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // 受击白色闪烁
        if (enemy.hitFlash > 0) {
            const a = Math.min(0.7, enemy.hitFlash / 5);
            ctx.fillStyle = `rgba(255, 255, 255, ${a})`;
            ctx.beginPath();
            ctx.arc(screenX, screenY, rr * 0.9, 0, Math.PI * 2);
            ctx.fill();
        }

        const healthPercent = enemy.health / enemy.maxHealth;
        const barW = 50, barH = 6;
        ctx.fillStyle = '#333';
        ctx.fillRect(screenX - barW / 2, screenY - 25, barW, barH);
        ctx.fillStyle = healthPercent > 0.5 ? '#00cc66' : '#ff4444';
        ctx.fillRect(screenX - barW / 2, screenY - 25, barW * healthPercent, barH);
        return;
    }

    // ---- 普通小怪：两态图片交替（动作感），直接取全局预加载缓存 ----
    // 帧计时：每 360ms 切换一帧（仅切换索引，不重建 Image）
    enemy._frameT = (enemy._frameT || 0) + 16;
    if (enemy._frameT >= 360) {
        enemy._frameT = 0;
        enemy._frame = enemy._frame === 0 ? 1 : 0;
    }
    const curUrl = (enemy._frame === 0) ? enemy.img : enemy.imgAlt;
    const curImg = getEnemySprite(curUrl);

    ctx.save();
    ctx.translate(screenX, screenY);
    ctx.rotate(enemy.angle);

    if (curImg && curImg.complete && curImg.naturalWidth > 0) {
        ctx.save();
        ctx.rotate(-enemy.angle);
        ctx.translate(-r, -r);
        ctx.drawImage(enemy._imgEl, 0, 0, r * 2, r * 2);
        ctx.restore();
    } else {
        // 回退：纯色三角
        ctx.fillStyle = '#cc3333';
        ctx.beginPath();
        ctx.moveTo(r, 0);
        ctx.lineTo(-r * 0.7, -r * 0.7);
        ctx.lineTo(-r * 0.5, 0);
        ctx.lineTo(-r * 0.7, r * 0.7);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#ff4444';
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.4, 0, Math.PI * 2);
        ctx.fill();
    }

    // 受击白色闪烁
    if (enemy.hitFlash > 0) {
        const a = Math.min(0.7, enemy.hitFlash / 5);
        ctx.fillStyle = `rgba(255, 255, 255, ${a})`;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.9, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();

    const healthPercent = enemy.health / enemy.maxHealth;
    const barW = 30, barH = 4;
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
    const screenX = worldToScreen(bullet.x, bullet.y).x;
    const screenY = worldToScreen(bullet.x, bullet.y).y;

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
    const screenX = worldToScreen(exp.x, exp.y).x;
    const screenY = worldToScreen(exp.x, exp.y).y;

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
    const screenX = worldToScreen(drop.x, drop.y).x;
    const screenY = worldToScreen(drop.x, drop.y).y;

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
        pistol: 0.02, smg: 0.025, rifle: 0.03, ar: 0.035, dmr: 0.045,
        lmg: 0.04, shotgun: 0.06, sniper: 0.05, bow: 0.01, launcher: 0.0
    };
    const baseRecoil = recoilTable[weapon.type] || 0.03;
    const recoilReduction = modifiedWeapon.recoilReduction || 0;
    const recoilAmount = baseRecoil * (1 - recoilReduction) * (Math.random() < 0.5 ? -1 : 1);
    recoilAngle = Math.max(-0.25, Math.min(0.25, recoilAngle + recoilAmount));

    // 屏幕震动与枪口闪光
    const shakeTable = { pistol: 2, smg: 2.5, rifle: 3, ar: 3.5, dmr: 4, lmg: 4, shotgun: 6, sniper: 5, bow: 1, launcher: 8 };
    screenShake = Math.max(screenShake, shakeTable[weapon.type] || 3);
    muzzleFlashTime = 3;

    // 火箭筒爆炸弹
    const isExplosive = modifiedWeapon.isExplosive;
    // 霰弹枪多弹丸
    const pellets = weapon.pellets || 1;
    const fireAngle = player.angle + recoilAngle;

    for (let i = 0; i < pellets; i++) {
        const spread = pellets > 1 ? (Math.random() - 0.5) * 0.3 : (weapon.type === 'bow' ? (Math.random() - 0.5) * 0.08 : 0);
        // 穿透：狙击枪自带穿透3个敌人，装配镭射指示器额外穿透1个
        const isSniper = weapon.type === 'sniper';
        const penetration = isSniper ? 3 : (modifiedWeapon.penetrationBonus ? 1 : 0);
        poolPushBullet({
            x: player.x + Math.cos(player.angle) * 0.5,
            y: player.y + Math.sin(player.angle) * 0.5,
            angle: fireAngle + spread,
            speed: weapon.type === 'bow' ? 0.8 : 1,
            damage: modifiedWeapon.damage,
            range: modifiedWeapon.range,
            distance: 0,
            owner: 'player',
            type: getWeaponAmmoType(weapon.id) || 'normal',
            weaponType: weapon.type,
            penetration,
            isExplosive: !!isExplosive,
            hitEnemies: []
        });
    }

    weapon.currentAmmo--;
    lastShot = Date.now();

    // 玩家枪声会吸引附近敌人前来调查（不同武器声音半径不同）
    const noiseRadiusTable = { pistol: 14, smg: 16, rifle: 20, ar: 20, dmr: 22, lmg: 22, shotgun: 24, sniper: 26, bow: 6, launcher: 30 };
    alertNearbyEnemies(player.x, player.y, noiseRadiusTable[weapon.type] || 16);
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
        pistol: 1.0, smg: 1.5, rifle: 1.8, ar: 2.0, lmg: 3.0,
        shotgun: 2.2, sniper: 2.8, dmr: 2.4, bow: 1.2, launcher: 3.2
    };
    let durationMs = (reloadDurations[weapon.type] || 1.5) * 1000;
    if (modifiedWeapon.reloadBonus) durationMs = Math.max(300, Math.round(durationMs / modifiedWeapon.reloadBonus));

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
            const need = mw.clipSize - (w.currentAmmo || 0);
            if (gameMode === 'raid') {
                // 搜打撤模式：从库存消耗弹药填满弹夹
                const ammoType = getWeaponAmmoType(w.id) || AMMO_TYPES.NORMAL;
                const available = ammoInventory[ammoType] || 0;
                const take = Math.min(need, available);
                if (take > 0) {
                    ammoInventory[ammoType] -= take;
                    w.currentAmmo = (w.currentAmmo || 0) + take;
                    removeAmmoFromBackpack(ammoType, take); // 同步背包显示
                    showNotification(`换弹完成 (+${take})`);
                } else {
                    showNotification('库存弹药不足，无法换弹');
                }
            } else {
                // 普通模式：无限弹药，直接补满
                w.currentAmmo = mw.clipSize;
                showNotification('换弹完成');
            }
        }
        player.isReloading = false;
        player.reloadEndTime = 0;
        player.reloadWeaponIndex = null;
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
        btn.innerHTML = `<span class="weapon-icon">${weaponIconHtml(weapon)}</span><span class="weapon-name">${weapon.name || '武器'}</span>`;
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
const MAX_ENEMIES = 80;
function spawnEnemy() {
    if (enemies.length >= MAX_ENEMIES) return;
    const isBoss = Math.random() < 0.16;
    const enemyHealth = gameParams.ENEMY.health || 80;
    const enemyFireRate = gameParams.ENEMY.fireRate || 2000;
    const difficultyHealthMul = settings.difficulty === 'topsecret' ? 1.6 : (settings.difficulty === 'confidential' ? 1.3 : (settings.difficulty === 'advanced' ? 1.0 : 0.8));

    // 在玩家安全距离外寻找合法出生点
    const SAFE_RADIUS = 22;
    const playerX = (player && typeof player.x === 'number') ? player.x : MAP_SIZE / 2;
    const playerY = (player && typeof player.y === 'number') ? player.y : MAP_SIZE / 2;
    function findSpot() {
        let attempts = 0;
        while (attempts < 50) {
            attempts++;
            const cx = Math.random() * MAP_SIZE;
            const cy = Math.random() * MAP_SIZE;
            if (Math.abs(cx - playerX) < SAFE_RADIUS && Math.abs(cy - playerY) < SAFE_RADIUS) continue;
            if (isBlocked(cx, cy)) continue;
            return { x: cx, y: cy };
        }
        // 兜底：四角优先，再边缘，最后中心
        const fallbacks = [
            [5, 5], [MAP_SIZE - 5, 5], [5, MAP_SIZE - 5], [MAP_SIZE - 5, MAP_SIZE - 5],
            [MAP_SIZE * 0.5, MAP_SIZE * 0.1], [MAP_SIZE * 0.5, MAP_SIZE * 0.9],
            [MAP_SIZE * 0.1, MAP_SIZE * 0.5], [MAP_SIZE * 0.9, MAP_SIZE * 0.5]
        ];
        for (const [fx, fy] of fallbacks) {
            if (!isBlocked(fx, fy) && Math.abs(fx - playerX) >= SAFE_RADIUS && Math.abs(fy - playerY) >= SAFE_RADIUS) return { x: fx, y: fy };
        }
        return { x: MAP_SIZE * 0.5, y: MAP_SIZE * 0.5 };
    }
    function pushOne(x, y, boss) {
        // 小怪按类型分配两态像素立绘（交替切换呈现动作）
        const typePairs = [
            ['assets/art/enemy-grunt.png', 'assets/art/enemy-grunt2.png'],
            ['assets/art/enemy-sniper.png', 'assets/art/enemy-sniper2.png'],
            ['assets/art/enemy-heavy.png', 'assets/art/enemy-heavy2.png']
        ];
        const pair = typePairs[Math.floor(Math.random() * typePairs.length)];
        enemies.push({
            x, y,
            health: boss ? enemyHealth * 3 * difficultyHealthMul : enemyHealth * difficultyHealthMul,
            maxHealth: boss ? enemyHealth * 3 * difficultyHealthMul : enemyHealth * difficultyHealthMul,
            angle: Math.random() * Math.PI * 2,
            lastShot: 0,
            fireRate: boss ? enemyFireRate * 0.75 : enemyFireRate,
            isBoss: boss,
            alive: true,
            // Boss 不再使用静态背景立绘，改用程序化动作绘制（drawEnemy 内处理）
            img: boss ? null : pair[0],
            imgAlt: boss ? null : pair[1],
            // 小怪两态交替：每 360ms 切换一帧
            _frameT: Math.random() * 360,
            _frame: 0,
            path: null, pathIndex: 0, lastPathUpdate: 0, pathUpdateInterval: 500
        });
    }

    // 主单位
    const spot = findSpot();
    pushOne(spot.x, spot.y, isBoss);

    // Boss 以小组形式刷新：主 Boss 带 1~3 名副 Boss（避免一次只刷一只）
    if (isBoss) {
        const squad = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < squad; i++) {
            const s = findSpot();
            pushOne(s.x, s.y, true);
        }
    }
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
            const r = BackpackManager.addItem('medkit', 1);
            if (r.success) {
                showNotification('医疗包 +1（已存入背包）');
            } else {
                showNotification('背包已满，无法拾取医疗包');
            }
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

    // 搜打撤模式死亡惩罚：丢失出战装备与本次战利品
    if (gameMode === 'raid' && currentRaidLoadout) {
        playerData.equippedWeapons = { primary: 'rifle', secondary: 'pistol' };
        playerData.equippedArmor = '';
        raidLoot = [];
        raidBackpack = { capacity: RAID_BACKPACK_CAPACITY, items: [] };
        closeContainerPanel();
        showNotification('⚠️ 搜打撤行动失败：出战装备与战利品全部丢失', 'error');
    }

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

    // 搜打撤模式：成功撤离时结算战利品
    if (gameMode === 'raid') {
        applyRaidLoot();
    }

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
        if (subtitleEl) {
            if (gameMode === 'raid') {
                subtitleEl.textContent = `搜打撤撤离成功！装备与战利品已安全带回仓库`;
            } else {
                subtitleEl.textContent = `击杀 ${player.kills} 人 | 得分 ${player.score} | 获得 ${Math.floor(player.score / 5)} 金币`;
            }
        }
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

    // 搜打撤模式必须撤离，不能 ESC 直接安全退出
    if (gameMode === 'raid') {
        showNotification('搜打撤模式无法主动退出，请前往撤离点撤离');
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
// HUD 缓存：仅当值变化时才写入 DOM，避免每帧全量重排导致 FPS 下降
let _hudCache = {};
let _hudRefs = null;
function _hudSet(cacheKey, el, value) {
    if (!el) return;
    if (_hudCache[cacheKey] !== value) {
        el.textContent = value;
        _hudCache[cacheKey] = value;
    }
}

function updateHUD() {
    if (!player) return;

    updateRaidBackpackBadge();

    // 血条
    const healthPercent = player.health / player.maxHealth;
    if (!_hudRefs) {
        _hudRefs = {
            healthBar: document.querySelector('.health-fill'),
            ammoCurrent: document.getElementById('ammoCurrent'),
            ammoMax: document.getElementById('ammoMax'),
            ammoSlash: document.querySelector('.ammo-slash'),
            weaponNameBig: document.getElementById('weaponNameBig'),
            score: document.getElementById('score'),
            killCount: document.getElementById('killCount'),
            coinCount: document.getElementById('coinCount'),
            invMedkit: document.getElementById('invMedkit'),
            invAmmo: document.getElementById('invAmmo'),
            invSpeed: document.getElementById('invSpeed'),
            invGrenade: document.getElementById('invGrenade'),
            weaponBtns: Array.from(document.querySelectorAll('.weapon-btn'))
        };
    }
    const R = _hudRefs;
    if (R.healthBar) R.healthBar.style.width = `${healthPercent * 100}%`;

    const weapon = player.weapons ? player.weapons[player.currentWeapon] : null;
    if (!weapon) return;
    // 优先使用缓存的改装结果（改装/换弹时失效），避免每帧重复计算
    const modifiedWeapon = weapon._modifiedCache || getModifiedWeapon(weapon);

    const isMelee = weapon.isMelee || weapon.type === WEAPON_TYPES.MELEE;
    const currentAmmoType = getWeaponAmmoType(weapon.id);
    _hudSet('ammoCur', R.ammoCurrent, isMelee ? '∞' : (weapon.currentAmmo || 0));
    if (R.ammoMax) {
        if (isMelee) {
            if (_hudCache.ammoMax !== '') { R.ammoMax.textContent = ''; _hudCache.ammoMax = ''; }
        } else {
            const totalAmmo = ammoInventory[currentAmmoType] || 0;
            const clipSize = modifiedWeapon.clipSize || 0;
            // 弹匣容量始终显示武器实际弹匣（含扩容），与背包总弹药无关，
            // 避免搜打撤模式下总弹药不足时把弹匣上限误显示为较小值（如显示30实为45）
            const ammoMaxVal = clipSize;
            _hudSet('ammoMax', R.ammoMax, ammoMaxVal);
        }
    }
    if (R.ammoSlash) R.ammoSlash.style.display = isMelee ? 'none' : '';
    _hudSet('wName', R.weaponNameBig, weapon.name + (isMelee ? '' : getAmmoIcon(currentAmmoType)));

    // 左上角：得分、击杀、金币
    _hudSet('score', R.score, player.score);
    _hudSet('kills', R.killCount, player.kills);
    _hudSet('coins', R.coinCount, playerData.coins);

    // 武器按钮高亮（仅在切换武器时变更）
    if (_hudCache.activeWeapon !== player.currentWeapon) {
        R.weaponBtns.forEach((btn, index) => btn.classList.toggle('active', index === player.currentWeapon));
        _hudCache.activeWeapon = player.currentWeapon;
    }

    // 物资数量（圆盘显示用）
    const inv = playerData.inventory || {};
    const bc = gameRunning && battleConsumables ? battleConsumables : null;
    _hudSet('invMed', R.invMedkit, bc ? (bc.medkits || 0) : (inv.medkits || 0));
    _hudSet('invAmmo', R.invAmmo, bc ? (bc.ammoBox || 0) : (inv.ammoBox || 0));
    _hudSet('invSpd', R.invSpeed, bc ? (bc.speedBoost || 0) : (inv.speedBoost || 0));
    _hudSet('invGr', R.invGrenade, bc ? (bc.grenades || 0) : (inv.grenades || 0));
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
    const raidAmmoToggle = document.getElementById('raidAmmoToggle');
    if (raidAmmoToggle) raidAmmoToggle.style.display = 'none';
    const raidAmmoPanel = document.getElementById('raidAmmoPanel');
    if (raidAmmoPanel) {
        raidAmmoPanel.style.display = 'none';
        raidAmmoPanelOpen = false;
    }
}

// ==================== 改装面板函数 ====================

let selectedWeaponForMod = null;
let selectedWeaponForMarket = 'rifle';
let selectedLoadoutSlot = 'primary';

function getAvailableWeapons() {
    // 改装面板属于大厅功能，应基于玩家已解锁的全部武器，
    // 而非某次战斗携带的临时武器子集（player.weapons 最多 4 把且会随战局变化）
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
        btn.innerHTML = `<span class="weapon-icon">${weaponIconHtml(weapon)}</span><span class="weapon-name">${weapon.name}</span>`;
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
            <span class="mod-icon">${modIconHtml(modId, mod)}</span>
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
            try {
                const result = toggleMod(selectedWeaponForMod, modId);
                showNotification(result.message);
            } catch (err) {
                console.error('[MOD] 装配失败:', err);
                showNotification('装配失败：' + err.message);
            }
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
        tag.innerHTML = `${modIconHtml(modId, mod)} ${mod.name}`;
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
        const thumbSrc = currentSkinTab === 'weapon' ? 'assets/art/weapon-rifle.png' : 'assets/art/' + (skin.portrait || 'npc-reyes') + '.png';
        const patternClass = skin.pattern ? ' skin-pattern-' + skin.pattern : '';
        const previewStyle = currentSkinTab === 'weapon'
            ? `background: ${previewBg};`
            : `background: ${previewBg};`;
        const thumbClass = currentSkinTab === 'player' ? 'skin-thumb skin-thumb-portrait' : 'skin-thumb';
        const previewBoxClass = currentSkinTab === 'player' ? ' player-skin-preview-box' : '';
        item.innerHTML = `
            <div class="skin-preview${patternClass}${previewBoxClass}" style="${previewStyle}">
                <img class="${thumbClass}" src="${thumbSrc}" alt="${skin.name}" style="${skin.pattern === 'metallic' ? 'filter: drop-shadow(0 0 4px #fff8) brightness(1.1);' : ''}">
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

    // 首次进入大厅触发剧情对话
    if (storyState.chapter === 1 && !isDialogueCompleted('intro_price')) {
        showDialogue('intro_price');
    }

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
    updatePlayerStats();
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
    updatePlayerStats();
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
    const btn = document.querySelector(`.diff-btn[data-diff="${diff}"]`);
    if (btn) btn.classList.add('active');
    renderDifficultyDetail(diff);
}

function renderDifficultyDetail(diff) {
    var p = getDifficultyPreset(diff);
    var box = document.getElementById('diffDetailBox');
    if (!box || !p) return;
    box.innerHTML =
        '<div class="diff-detail-name">' + p.tag + ' ' + p.name + '</div>' +
        '<div class="diff-detail-desc">' + p.desc + '</div>' +
        '<div class="diff-detail-grid">' +
            '<div><span class="dd-k">敌情</span><span class="dd-v">' + p.enemy + '</span></div>' +
            '<div><span class="dd-k">资源</span><span class="dd-v">' + p.loot + '</span></div>' +
            '<div><span class="dd-k">撤离</span><span class="dd-v">' + p.extract + '</span></div>' +
            '<div><span class="dd-k">风险</span><span class="dd-v">' + p.risk + '</span></div>' +
        '</div>';
}

function setGameMode(mode) {
    if (mode !== 'mission' && mode !== 'raid') return;
    playerData.selectedMode = mode;
    gameMode = mode;
    savePlayerData();
    updateGameModeUI();
    updateReadyRoomMission();
    updateRaidLoadoutUI();
}

function updateGameModeUI() {
    const mode = playerData.selectedMode || 'mission';
    document.querySelectorAll('#modeSelectRow .mode-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.mode === mode);
    });
}

// ============================================================
// 地图档案库（模仿三角洲行动：每张地图含背景、规模、地形、资源、敌情、撤离点、推荐装备）
// ============================================================
var MAP_DETAILS = {
    desert: {
        name: '沙漠战场', emoji: '🏜️',
        img: 'assets/art/map-desert.jpg',
        bg: '曾经的绿洲贸易站，如今被风沙吞没。一支运输车队在撤离途中失联，敌方的游骑兵小队占据制高点，试图封锁唯一的水源补给点。',
        scale: '中型 · 约 1.2km²',
        terrain: '开阔沙丘、岩石掩体、零星废墟，视野极佳但缺乏遮蔽。',
        intel: '敌方以精确射手与巡逻兵为主，夜间会收缩至营地。建议抢占高地建立狙击位。',
        loot: '高概率刷新弹药箱、医疗包；废墟中藏有军械箱。',
        extract: '东侧沙丘撤离点、西南废弃哨塔（需清除守军）。',
        loadout: '推荐：中远距离步枪 + 倍镜；携带 2 个医疗包、1 个烟雾弹。'
    },
    city: {
        name: '城市巷战', emoji: '🏙️',
        img: 'assets/art/map-city.jpg',
        bg: '沦陷的边境城市，街区被改造成迷宫般的火力网。情报显示敌方指挥官藏身于中央写字楼，携带高价值情报芯片。',
        scale: '大型 · 约 1.8km²',
        terrain: '密集楼宇、断壁残垣、地下车库，近距离交火频繁。',
        intel: '敌方步兵密度高，配备破门与火力小组；楼道转角伏击风险大。',
        loot: '写字楼保险柜刷新电子元件；便利店有概率出急救物资。',
        extract: '地铁站出口、天台直升机坪（需清除楼顶警戒）。',
        loadout: '推荐：冲锋枪/霰弹枪 + 防弹衣；多带手雷与破片弹清角。'
    },
    factory: {
        name: '废弃工厂', emoji: '🏭',
        bg: '停摆的重工业厂区，传送带与反应罐间游荡着走私武装。传闻三号车间封存了一批未登记的装备。',
        scale: '中型 · 约 1.0km²',
        terrain: '钢结构厂房、集装箱堆场、传送带夹层，垂直空间复杂。',
        intel: '敌方以轻机枪火力点与游动哨为主，机械噪音掩盖脚步。',
        loot: '车间工具箱刷新零件；集装箱内有概率出武器配件。',
        extract: '厂区北门、货运站台（需避开巡逻车队）。',
        loadout: '推荐：均衡型步枪 + 听觉强化；携带 1 个闪光弹。'
    },
    jungle: {
        name: '丛林突袭', emoji: '🌴',
        bg: '热带雨林深处的秘密补给线，植被茂密难以侦察。一支侦察连在此失踪，搜索队只找到残破的通讯设备。',
        scale: '大型 · 约 1.6km²',
        terrain: '密林、沼泽浅滩、藤蔓遮蔽，能见度极低。',
        intel: '敌方擅长伏击与陷阱，狙击手藏身树冠；移动缓慢但致命。',
        loot: '营地箱刷新野外补给；瀑布后洞穴藏有稀有物资。',
        extract: '河边木筏点、高地观测台。',
        loadout: '推荐：消音武器 + 近距离利器；多带医疗包与解毒剂。'
    },
    snow: {
        name: '雪山阵地', emoji: '❄️',
        bg: '极地前哨基地因暴风雪与外界失联，守军士气崩溃，部分人员倒戈成为掠夺者。雷达站仍有重要数据。',
        scale: '中型 · 约 1.1km²',
        terrain: '雪原、冰裂缝、岩石隘口，移动受限且易留足迹。',
        intel: '敌方穿戴白色伪装，远距离点射精准；低温会加速体力流失。',
        loot: '哨所柜子刷新保暖装备；坠机点有概率出高级护甲。',
        extract: '缆车站、冰湖冻结出口。',
        loadout: '推荐：高稳定步枪 + 防冻护甲；携带 2 个医疗包。'
    },
    volcano: {
        name: '火山熔岩', emoji: '🌋',
        bg: '活火山脚下的采矿平台，熔岩通道随时可能改道。非法开采集团在此构筑了重火力防线。',
        scale: '中型 · 约 1.0km²',
        terrain: '熔岩裂隙、矿道、钢架平台，环境伤害（灼烧）持续。',
        intel: '敌方据守火力塔，压制性强；熔岩区会持续削减生命。',
        loot: '矿洞刷新稀有矿石；控制室保险箱出强化模块。',
        extract: '升降机平台、外侧矿车轨道（需快速通过熔岩区）。',
        loadout: '推荐：防爆护甲 + 持续回复；携带抗灼药剂。'
    },
    ruins: {
        name: '古代遗迹', emoji: '🏛️',
        img: 'assets/art/map-ruins.jpg',
        bg: '被黄沙半掩的文明遗迹，考古队触发了未知的防御机制。敌方雇佣兵已先一步进入，争夺地下的远古遗物。',
        scale: '中型 · 约 1.1km²',
        terrain: '石柱回廊、陷阱密室、坍塌神殿，机关与伏击并存。',
        intel: '敌方配备无人机侦察；遗迹机关会对双方造成无差别伤害。',
        loot: '祭坛宝箱刷新遗物碎片；密室有概率出传说级物品。',
        extract: '神殿正门、地下暗道出口。',
        loadout: '推荐：全能武器 + 陷阱感知；携带 1 个闪光弹与医疗包。'
    },
    base: {
        name: '军事基地', emoji: '🏰',
        bg: '戒备森严的敌方主力基地，囤积着本次冲突的核心物资。攻入核心区即可瓦解其补给链，但防御体系极为完善。',
        scale: '大型 · 约 2.0km²',
        terrain: '围墙、哨塔、机库与指挥中枢，多层防御工事。',
        intel: '敌方重装兵与装甲单位协同，警报触发后增援快速抵达。',
        loot: '军械库刷新顶级武器；指挥室保险箱出战略物资。',
        extract: '基地侧门、直升机停机坪（需压制防空火力）。',
        loadout: '推荐：重型武器 + 重甲；满配消耗品，组队更佳。'
    },
    forest: {
        name: '密林猎场', emoji: '🌲',
        img: 'assets/art/map-forest.jpg',
        bg: '北境针叶林，猎人与猎物界限模糊。一支走私队利用林海转运违禁品，巡逻队装备精良。',
        scale: '中型 · 约 1.2km²',
        terrain: '针叶密林、木屋据点、溪流浅滩，遮蔽良好。',
        intel: '敌方狩猎小队机动灵活，擅长包抄；听觉侦察强。',
        loot: '木屋储物箱刷新补给；树洞藏有走私物资。',
        extract: '林间小径、溪流出河口。',
        loadout: '推荐：消音步枪 + 轻甲；携带 1 个烟雾弹。'
    },
    wasteland: {
        name: '废土荒野', emoji: '🪨',
        img: 'assets/art/map-wasteland.jpg',
        bg: '核战后的荒芜之地，残存势力在废铁堆中争夺最后资源。辐射区与掠夺者同样致命。',
        scale: '大型 · 约 1.7km²',
        terrain: '废铁残骸、塌陷公路、辐射坑，开阔且危险。',
        intel: '敌方掠夺者集团游荡，载具火力凶猛；辐射区持续掉血。',
        loot: '废车残骸刷新零件；地堡有概率出末日装备。',
        extract: '公路加油站、地下避难所入口。',
        loadout: '推荐：抗辐射护甲 + 持续火力；多带回复道具。'
    },
    swamp: {
        name: '沼泽迷踪', emoji: '🌿',
        bg: '终年潮湿的沼泽地带，瘴气与淤泥让一切行动迟缓。失落的科研站仍亮着微弱的灯光。',
        scale: '中型 · 约 1.1km²',
        terrain: '泥沼、朽木栈道、浅水滩，移动受阻且视野受阻。',
        intel: '敌方沼泽游击队神出鬼没，水下伏击常见。',
        loot: '科研站柜子刷新试剂；沉船有概率出实验装备。',
        extract: '木栈道尽头、高地瞭望塔。',
        loadout: '推荐：轻量武器 + 防毒面具；携带抗毒药剂。'
    },
    lab: {
        name: '废弃地下实验室', emoji: '🧪',
        img: 'assets/art/map-lab.jpg',
        bg: '黑潮军团在此进行人体强化实验，「造神计划」的产物至今仍在下层游荡。实验日志暗示普莱斯早年曾在此任职。',
        scale: '大型 · 约 1.6km²（三层结构）',
        terrain: '混凝土通道、玻璃隔间、坍塌的培养舱，照明时断时续，掩体密集但通道狭窄。',
        intel: '变异守卫（实验体）对声音敏感，闪光会致其短暂失明；固定炮塔由中枢控制。',
        loot: '加密数据芯片（推动真相线）、实验血清（恢复上限+20）、军用级配件箱。',
        extract: '顶层货运电梯、B2 紧急排气井。',
        loadout: '推荐：消音武器 + 夜视 + 肾上腺素；避免正面冲突。'
    }
};

// 当前查看详情的地图
var _detailMapName = null;

function openMapDetail(mapName) {
    var d = MAP_DETAILS[mapName];
    if (!d) { selectMap(mapName); return; }
    _detailMapName = mapName;
    var el = document.getElementById('mapDetailBody');
    if (el) {
        el.innerHTML =
            (d.img ? '<div class="md-cover" style="background-image:url(\'' + d.img + '\')"></div>' : '') +
            '<div class="md-head"><span class="md-emoji">' + d.emoji + '</span><span class="md-title">' + d.name + '</span></div>' +
            '<div class="md-row"><span class="md-label">📖 背景</span><span class="md-val">' + d.bg + '</span></div>' +
            '<div class="md-row"><span class="md-label">📐 规模</span><span class="md-val">' + d.scale + '</span></div>' +
            '<div class="md-row"><span class="md-label">⛰️ 地形</span><span class="md-val">' + d.terrain + '</span></div>' +
            '<div class="md-row"><span class="md-label">🎯 敌情</span><span class="md-val">' + d.intel + '</span></div>' +
            '<div class="md-row"><span class="md-label">💎 资源</span><span class="md-val">' + d.loot + '</span></div>' +
            '<div class="md-row"><span class="md-label">🚁 撤离</span><span class="md-val">' + d.extract + '</span></div>' +
            '<div class="md-row"><span class="md-label">🎒 推荐</span><span class="md-val">' + d.loadout + '</span></div>';
    }
    showOverlay('mapDetailPanel');
}

function closeMapDetail() {
    hideOverlay('mapDetailPanel');
}

function selectMapFromDetail() {
    if (_detailMapName) selectMap(_detailMapName);
    hideOverlay('mapDetailPanel');
}

// ============================================================
// 难度档位（模仿三角洲行动：标准 / 进阶 / 机密 / 绝密）
// ============================================================
var DIFFICULTY_PRESETS = {
    standard: {
        name: '标准', tag: '★',
        desc: '敌方巡逻稀疏、火力温和，资源充裕，适合熟悉地图与练枪。',
        enemy: 'AI 反应慢、命中低，增援少',
        loot: '资源刷新率 +20%',
        extract: '撤离点开放、无额外守军',
        risk: '失败惩罚低'
    },
    advanced: {
        name: '进阶', tag: '★★',
        desc: '敌方开始协同作战，火力点增多，推荐有一定经验的干员进入。',
        enemy: 'AI 反应正常、会包抄',
        loot: '资源刷新率 标准',
        extract: '部分撤离点需清场',
        risk: '失败损失部分装备'
    },
    confidential: {
        name: '机密', tag: '★★★',
        desc: '高强度对抗，敌方重装与狙击手就位，高价值物资伴随高风险。',
        enemy: 'AI 精准、增援快、有装甲',
        loot: '稀有物资概率 +30%',
        extract: '撤离点常驻守军',
        risk: '失败损失全部带入装备'
    },
    topsecret: {
        name: '绝密', tag: '★★★★',
        desc: '极限压迫：敌方如老兵般致命，环境威胁叠加，只为最强者准备的修罗场。',
        enemy: 'AI 极致精准、压制强、载具支援',
        loot: '传说级掉落率显著提升',
        extract: '仅 1 个隐秘撤离点、时限严苛',
        risk: '失败重创：装备与等级收益双扣'
    }
};

function getDifficultyPreset(key) {
    return DIFFICULTY_PRESETS[key] || DIFFICULTY_PRESETS.standard;
}

// 统一难度数值配置（替代散落的嵌套三元链）
var DIFFICULTY_CONFIG = {
    standard:    { enemyMul: 0.8, healthMul: 0.8, crateBonus: -2, rewardMul: 0.8,  label: '标准' },
    advanced:    { enemyMul: 1.2, healthMul: 1.0, crateBonus: 0,  rewardMul: 1.0,  label: '进阶' },
    confidential:{ enemyMul: 1.8, healthMul: 1.3, crateBonus: 4,  rewardMul: 1.25, label: '机密' },
    topsecret:   { enemyMul: 2.4, healthMul: 1.6, crateBonus: 6,  rewardMul: 1.6,  label: '绝密' }
};
function getDiffConfig(key) {
    return DIFFICULTY_CONFIG[key] || DIFFICULTY_CONFIG.advanced;
}
// 难度→任务奖励倍率（升级十轮与任务追踪共用，确保一致）
var DIFFICULTY_REWARD_MUL = { standard: 0.8, advanced: 1.0, confidential: 1.25, topsecret: 1.6 };
function getMissionReward(base, difficulty) {
    return Math.max(1, Math.round(base * (DIFFICULTY_REWARD_MUL[difficulty] || 1.0)));
}

// ============================================================
// 随机事件：天气系统（轻量表现层，仅影响色调与移速系数）
// ============================================================
var WEATHER_TYPES = {
    clear:  { name: '晴',  speedMul: 1.0,  tint: 'rgba(0,0,0,0)' },
    rain:   { name: '小雨', speedMul: 0.92, tint: 'rgba(40,60,90,0.12)' },
    sand:   { name: '沙暴', speedMul: 0.85, tint: 'rgba(120,90,40,0.18)' },
    fog:    { name: '浓雾', speedMul: 0.95, tint: 'rgba(180,190,200,0.20)' },
    night:  { name: '夜幕', speedMul: 1.0,  tint: 'rgba(10,15,40,0.28)' }
};
var currentWeather = 'clear';
var _weatherTimer = null;
function getWeatherSpeedMul() {
    const w = WEATHER_TYPES[currentWeather] || WEATHER_TYPES.clear;
    return w.speedMul;
}
function setWeather(type) {
    if (!WEATHER_TYPES[type]) return;
    currentWeather = type;
    showNotification('🌤️ 天气变化：' + WEATHER_TYPES[type].name);
}
function startWeatherSystem() {
    stopWeatherSystem();
    // 每 45~75 秒随机切换一次天气，增加战场变数
    _weatherTimer = setInterval(function () {
        if (!gameRunning) return;
        const keys = Object.keys(WEATHER_TYPES);
        const next = keys[Math.floor(Math.random() * keys.length)];
        if (next !== currentWeather) setWeather(next);
        // 低概率触发隐藏商人随机事件（表现层提示）
        if (Math.random() < 0.18) {
            showNotification('🛒 隐藏商人出现在战场边缘，可前往交易稀有物资');
        }
    }, 45000 + Math.floor(Math.random() * 30000));
}
function stopWeatherSystem() {
    if (_weatherTimer) { clearInterval(_weatherTimer); _weatherTimer = null; }
}
// 在 draw 末尾叠加天气色调（在 draw() 调用）
function applyWeatherOverlay() {
    const w = WEATHER_TYPES[currentWeather] || WEATHER_TYPES.clear;
    if (w.tint && w.tint !== 'rgba(0,0,0,0)') {
        ctx.fillStyle = w.tint;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
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
    const themes = ['desert', 'city', 'factory', 'jungle', 'snow', 'volcano', 'ruins', 'base', 'forest', 'wasteland', 'swamp'];
    const colors = {
        desert: { ground: '#2d2d1a', obstacle: '#8b7355', cover: '#4a3728', building: '#6b5344' },
        city: { ground: '#2a2a2a', obstacle: '#4a4a4a', cover: '#3a3a5a', building: '#5a5a6a' },
        factory: { ground: '#252525', obstacle: '#4a4a4a', cover: '#3a4a5a', building: '#5a5a7a' },
        jungle: { ground: '#1a2d1a', obstacle: '#2a4a2a', cover: '#1a3a4a', building: '#3a3a4a' },
        snow: { ground: '#4a4a5a', obstacle: '#6a6a7a', cover: '#5a6a8a', building: '#7a7a8a' },
        volcano: { ground: '#2d1a1a', obstacle: '#5a2a2a', cover: '#4a1a1a', building: '#6b3a3a' },
        ruins: { ground: '#2a2a20', obstacle: '#5a5a50', cover: '#4a4a40', building: '#6b6b5a' },
        base: { ground: '#1a1a2a', obstacle: '#3a3a4a', cover: '#2a2a3a', building: '#4a4a5a' },
        forest: { ground: '#1a2a12', obstacle: '#0f1f0a', cover: '#2a3a1a', building: '#3a2a1a' },
        wasteland: { ground: '#4a3a2a', obstacle: '#2a1f15', cover: '#3a2a1a', building: '#2a1a10' },
        swamp: { ground: '#1a2412', obstacle: '#0f1a0a', cover: '#2a3a15', building: '#2a2515' }
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
        html += `<div class="map-card" data-map="${mapDef.name}" onclick="openMapDetail('${mapDef.name}')">
            <canvas class="map-preview-canvas" id="customMapPreview_${idx}" width="160" height="100"></canvas>
            <div class="map-name-overlay">🎨 ${mapDef.name}</div>
        </div>`;
    });

    if (container) container.innerHTML = html;

    // 备战界面的自定义地图卡（更小，紧凑样式）
    let readyHtml = '';
    savedMaps.forEach((mapDef, idx) => {
        if (!mapDef || !mapDef.name || !Array.isArray(mapDef.data)) return;
        readyHtml += `<div class="map-card small" data-map="${mapDef.name}" onclick="openMapDetail('${mapDef.name}')">
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

// ============================================================
// 搜打撤：战前配装 UI
// ============================================================
function updateRaidLoadoutUI() {
    const isRaid = (playerData.selectedMode || 'mission') === 'raid';
    const title = document.getElementById('raidConsumablesTitle');
    const panel = document.getElementById('raidConsumablesPanel');
    if (title) title.style.display = isRaid ? 'block' : 'none';
    if (panel) panel.style.display = isRaid ? 'block' : 'none';
    if (!isRaid) return;

    const inv = playerData.inventory || {};
    const loadout = playerData.raidLoadout && playerData.raidLoadout.consumables ? playerData.raidLoadout.consumables : { medkits: 0, grenades: 0, speedBoost: 0, adrenaline: 0, smoke: 0, energy: 0, plate: 0, scanner: 0, repair: 0 };

    const fields = [
        { key: 'medkits', ui: 'raidMedkits', owned: 'ownedMedkits' },
        { key: 'grenades', ui: 'raidGrenades', owned: 'ownedGrenades' },
        { key: 'speedBoost', ui: 'raidSpeedBoost', owned: 'ownedSpeedBoost' },
        { key: 'adrenaline', ui: 'raidAdrenaline', owned: 'ownedAdrenaline' },
        { key: 'smoke', ui: 'raidSmoke', owned: 'ownedSmoke' },
        { key: 'energy', ui: 'raidEnergy', owned: 'ownedEnergy' },
        { key: 'plate', ui: 'raidPlate', owned: 'ownedPlate' },
        { key: 'scanner', ui: 'raidScanner', owned: 'ownedScanner' },
        { key: 'repair', ui: 'raidRepair', owned: 'ownedRepair' }
    ];
    for (const f of fields) {
        const uiEl = document.getElementById(f.ui);
        const ownedEl = document.getElementById(f.owned);
        if (uiEl) uiEl.textContent = loadout[f.key] || 0;
        if (ownedEl) ownedEl.textContent = inv[f.key] || 0;
    }
}

function adjustRaidConsumable(key, delta) {
    if (!playerData.raidLoadout) playerData.raidLoadout = { consumables: { medkits: 0, grenades: 0, speedBoost: 0 } };
    if (!playerData.raidLoadout.consumables) playerData.raidLoadout.consumables = { medkits: 0, grenades: 0, speedBoost: 0 };
    const loadout = playerData.raidLoadout.consumables;
    const inv = playerData.inventory || {};
    const current = loadout[key] || 0;
    const owned = inv[key] || 0;
    let next = current + delta;
    if (next < 0) next = 0;
    if (next > owned) next = owned;
    if (next > 5) next = 5; // 单种消耗品最多带 5 个
    loadout[key] = next;
    savePlayerData();
    updateRaidLoadoutUI();
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
    // 更新模式选择按钮
    updateGameModeUI();
    // 渲染难度档位说明
    renderDifficultyDetail(settings.difficulty || 'standard');
    // 更新任务信息
    updateReadyRoomMission();
    // 更新战备中心武器装备显示
    updateReadyRoomLoadout();
    // 更新搜打撤出战补给面板
    updateRaidLoadoutUI();
    // 更新队友配置显示
    updateTeammateCountUI();
    updateTeammateLoadoutPreview();
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

function updateReadyRoomLoadout() {
    if (!playerData.equippedWeapons) {
        playerData.equippedWeapons = { primary: 'rifle', secondary: 'pistol' };
    }
    const primary = WEAPONS.find(function(w) { return w.id === playerData.equippedWeapons.primary; }) || WEAPONS.find(function(w) { return w.id === 'rifle'; });
    const secondary = WEAPONS.find(function(w) { return w.id === playerData.equippedWeapons.secondary; }) || WEAPONS.find(function(w) { return w.id === 'pistol'; });

    const pIcon = document.getElementById('readyPrimaryIcon');
    const pName = document.getElementById('readyPrimaryName');
    const sIcon = document.getElementById('readySecondaryIcon');
    const sName = document.getElementById('readySecondaryName');

    if (pIcon) pIcon.innerHTML = weaponIconHtml(primary);
    if (pName) pName.textContent = primary ? primary.name : '主武器';
    if (sIcon) sIcon.innerHTML = weaponIconHtml(secondary);
    if (sName) sName.textContent = secondary ? secondary.name : '副武器';
}

let _loadoutSelectingSlot = 'primary';

function openLoadoutWeaponSelector(slot) {
    _loadoutSelectingSlot = slot || 'primary';
    const modal = document.getElementById('loadoutWeaponModal');
    const label = document.getElementById('loadoutWeaponSlotLabel');
    const grid = document.getElementById('loadoutWeaponGrid');
    if (!modal || !grid) return;

    if (label) label.textContent = slot === 'secondary' ? '副武器' : '主武器';
    grid.innerHTML = '';

    // 列出所有非近战枪械
    WEAPONS.forEach(function(weapon) {
        if (weapon.type === WEAPON_TYPES.MELEE) return;

        const isOwned = weapon.unlocked;
        const isEquipped = playerData.equippedWeapons && playerData.equippedWeapons[_loadoutSelectingSlot] === weapon.id;
        const priceText = isOwned ? (isEquipped ? '当前装备' : '已拥有') : '🪙 ' + weapon.price;
        const btnText = isOwned ? (isEquipped ? '已装备' : '装备') : '购买并装备';

        const item = document.createElement('div');
        item.className = 'market-item' + (isEquipped ? ' equipped' : '') + (isOwned ? ' unlocked' : '');
        item.innerHTML = '<div class="item-icon">' + weaponIconHtml(weapon) + '</div>' +
            '<div class="item-info"><div class="item-name">' + weapon.name + '</div>' +
            '<div class="item-desc">伤害: ' + weapon.damage + ' | 射速: ' + weapon.fireRate + '</div></div>' +
            '<div class="item-price">' + priceText + '</div>' +
            '<button class="buy-btn">' + btnText + '</button>';

        const btn = item.querySelector('.buy-btn');
        btn.onclick = function() {
            if (isOwned) {
                selectLoadoutWeapon(_loadoutSelectingSlot, weapon.id);
            } else {
                buyAndEquipWeapon(weapon.id, _loadoutSelectingSlot);
            }
        };
        grid.appendChild(item);
    });

    modal.style.display = 'flex';
}

function closeLoadoutWeaponSelector() {
    const modal = document.getElementById('loadoutWeaponModal');
    if (modal) modal.style.display = 'none';
}

function selectLoadoutWeapon(slot, weaponId) {
    if (!playerData.equippedWeapons) playerData.equippedWeapons = { primary: 'rifle', secondary: 'pistol' };
    playerData.equippedWeapons[slot] = weaponId;
    savePlayerData();
    updateReadyRoomLoadout();
    closeLoadoutWeaponSelector();
    showNotification(slot === 'secondary' ? '副武器已切换' : '主武器已切换');
}

function buyAndEquipWeapon(weaponId, slot) {
    const result = buyWeapon(weaponId);
    if (result && result.success) {
        selectLoadoutWeapon(slot, weaponId);
    } else {
        showNotification(result && result.message ? result.message : '购买失败');
    }
}

window.updateReadyRoomLoadout = updateReadyRoomLoadout;
window.openLoadoutWeaponSelector = openLoadoutWeaponSelector;
window.closeLoadoutWeaponSelector = closeLoadoutWeaponSelector;
window.selectLoadoutWeapon = selectLoadoutWeapon;
window.buyAndEquipWeapon = buyAndEquipWeapon;
window.setTeammateCount = setTeammateCount;
window.updateTeammateCountUI = updateTeammateCountUI;
window.setGameMode = setGameMode;
window.updateGameModeUI = updateGameModeUI;
window.updateRaidLoadoutUI = updateRaidLoadoutUI;
window.adjustRaidConsumable = adjustRaidConsumable;
window.toggleRaidAmmoPanel = toggleRaidAmmoPanel;
window.closeRaidAmmoPanel = closeRaidAmmoPanel;
window.adjustRaidAmmo = adjustRaidAmmo;
window.updateRaidAmmoCost = updateRaidAmmoCost;
window.buyRaidAmmo = buyRaidAmmo;

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
                <div class="wc-icon">${weaponIconHtml(w)}</div>
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
            const iconEl = document.querySelector('#invPrimarySlot .slot-weapon-icon');
            if (iconEl) iconEl.innerHTML = weaponIconHtml(w);
        }
    }
    
    // 副武器
    const secondaryWeapon = playerData.equippedWeapons && playerData.equippedWeapons.secondary;
    if (secondaryWeapon && typeof WEAPONS !== 'undefined') {
        const w = WEAPONS.find(x => x.id === secondaryWeapon);
        if (w) {
            const el = document.getElementById('invSecondaryName');
            if (el) el.textContent = w.name;
            const iconEl = document.querySelector('#invSecondarySlot .slot-weapon-icon');
            if (iconEl) iconEl.innerHTML = weaponIconHtml(w);
        }
    }
}

// 渲染皮肤卡片
// 皮肤卡片由 renderSkinGrid() 统一渲染（基于 SKINS 真实数据），此处不再保留旧的硬编码列表。

// 小地图绘制（搜打撤风格）
let __minimapStaticCache = null;
let __minimapStaticKey = '';
let __minimapCanvas = null;
let __minimapCtx = null;

function drawMinimap() {
    if (!__minimapCanvas) {
        __minimapCanvas = document.getElementById('minimapCanvas');
        if (__minimapCanvas) __minimapCtx = __minimapCanvas.getContext('2d');
    }
    const canvas = __minimapCanvas;
    const minimap = document.getElementById('minimap');
    if (!canvas || !minimap || minimap.style.display === 'none') return;

    const mctx = __minimapCtx;
    const mapSize = typeof MAP_SIZE !== 'undefined' ? MAP_SIZE : 150;
    const scale = canvas.width / mapSize;

    // —— 性能优化：静态层（背景/网格/建筑轮廓）缓存到离屏 canvas，仅在地图变化时重建 ——
    const mapKey = (typeof mapData !== 'undefined' && mapData) ? (canvas.width + 'x' + mapSize) : '';
    if (!__minimapStaticCache || __minimapStaticKey !== mapKey) {
        const sc = document.createElement('canvas');
        sc.width = canvas.width; sc.height = canvas.height;
        const sctx = sc.getContext('2d');
        // 深色战术背景
        sctx.fillStyle = '#0d140d';
        sctx.fillRect(0, 0, sc.width, sc.height);
        // 战术网格
        sctx.strokeStyle = 'rgba(74, 93, 35, 0.12)';
        sctx.lineWidth = 0.5;
        const gridCount = 6;
        const gridStep = sc.width / gridCount;
        for (let i = 1; i < gridCount; i++) {
            const x = i * gridStep;
            sctx.beginPath(); sctx.moveTo(x, 0); sctx.lineTo(x, sc.height); sctx.stroke();
            const y = i * gridStep;
            sctx.beginPath(); sctx.moveTo(0, y); sctx.lineTo(sc.width, y); sctx.stroke();
        }
        // 建筑/障碍轮廓（降采样）
        if (typeof mapData !== 'undefined' && mapData) {
            sctx.fillStyle = 'rgba(60, 55, 45, 0.55)';
            const step = Math.max(2, Math.floor(mapSize / 30));
            for (let y = 0; y < mapSize; y += step) {
                for (let x = 0; x < mapSize; x += step) {
                    const tile = mapData[x + '_' + y];
                    if (tile && (tile.type === 'obstacle' || tile.type === 'building' || tile.type === 'cover')) {
                        sctx.fillRect(x * scale, y * scale, Math.max(2, step * scale), Math.max(2, step * scale));
                    }
                }
            }
        }
        __minimapStaticCache = sc;
        __minimapStaticKey = mapKey;
    }

    mctx.clearRect(0, 0, canvas.width, canvas.height);
    mctx.drawImage(__minimapStaticCache, 0, 0);

    // 动态扫描线
    const scanOffset = (Date.now() / 25) % canvas.height;
    mctx.fillStyle = 'rgba(0, 255, 136, 0.06)';
    mctx.fillRect(0, scanOffset, canvas.width, 1);

    const px = player ? player.x : mapSize / 2;
    const py = player ? player.y : mapSize / 2;

    // 绘制撤离点（蓝色光圈）
    if (typeof extractX !== 'undefined' && typeof extractY !== 'undefined') {
        const ex = extractX * scale;
        const ey = extractY * scale;
        mctx.strokeStyle = '#00ccff';
        mctx.lineWidth = 1.5;
        mctx.beginPath();
        mctx.arc(ex, ey, 5, 0, Math.PI * 2);
        mctx.stroke();
        mctx.fillStyle = 'rgba(0, 204, 255, 0.35)';
        mctx.beginPath();
        mctx.arc(ex, ey, 3, 0, Math.PI * 2);
        mctx.fill();
        const pulse = (Math.sin(Date.now() / 300) + 1) * 0.5;
        mctx.strokeStyle = 'rgba(0, 204, 255, ' + (0.2 + pulse * 0.3) + ')';
        mctx.beginPath();
        mctx.arc(ex, ey, 5 + pulse * 4, 0, Math.PI * 2);
        mctx.stroke();
    }

    // 绘制摸金箱子（按稀有度着色）
    if (typeof lootCrates !== 'undefined') {
        for (let i = 0; i < lootCrates.length; i++) {
            const c = lootCrates[i];
            if (!c || c.state === 'opened') continue;
            const rarityInfo = LOOT_CRATE_RARITY[c.rarity.toUpperCase()] || LOOT_CRATE_RARITY.COMMON;
            const cx = c.x * scale;
            const cy = c.y * scale;
            mctx.fillStyle = rarityInfo.color;
            mctx.shadowColor = rarityInfo.glow;
            mctx.shadowBlur = c.rarity === 'legendary' ? 5 : 3;
            mctx.beginPath();
            mctx.arc(cx, cy, c.rarity === 'legendary' ? 2.5 : 2, 0, Math.PI * 2);
            mctx.fill();
            mctx.shadowBlur = 0;
        }
    }

    // 绘制掉落物/物资（黄色小点）
    if (typeof drops !== 'undefined') {
        mctx.fillStyle = '#ffcc00';
        for (let i = 0; i < drops.length; i++) {
            const d = drops[i];
            if (!d || !d.alive) continue;
            mctx.beginPath();
            mctx.arc(d.x * scale, d.y * scale, 1.8, 0, Math.PI * 2);
            mctx.fill();
        }
    }

    // 绘制敌人（红色光点）
    if (typeof enemies !== 'undefined') {
        for (let i = 0; i < enemies.length; i++) {
            const e = enemies[i];
            if (!e || e.dead) continue;
            mctx.fillStyle = e.isBoss ? '#ff00ff' : '#ff3333';
            mctx.shadowColor = e.isBoss ? '#ff00ff' : '#ff3333';
            mctx.shadowBlur = e.isBoss ? 6 : 3;
            mctx.beginPath();
            mctx.arc(e.x * scale, e.y * scale, e.isBoss ? 3.5 : 2, 0, Math.PI * 2);
            mctx.fill();
            mctx.shadowBlur = 0;
        }
    }

    // 绘制玩家（带视野扇形与朝向箭头，颜色跟随当前皮肤）
    if (player) {
        const x = px * scale;
        const y = py * scale;
        mctx.save();
        mctx.translate(x, y);
        mctx.rotate(player.angle || 0);

        const pSkinColor = getPlayerSkinColor();
        const pSkin = SKINS.players.find(s => s.id === playerMods.equippedPlayerSkin);
        const pGlowColor = pSkin && pSkin.color ? lightenColor(pSkin.color, 30) : '#00ff88';

        mctx.fillStyle = pSkinColor;
        mctx.globalAlpha = 0.12;
        mctx.beginPath();
        mctx.moveTo(0, 0);
        mctx.arc(0, 0, 28, -Math.PI / 5, Math.PI / 5);
        mctx.closePath();
        mctx.fill();
        mctx.globalAlpha = 1.0;

        mctx.fillStyle = pSkinColor;
        mctx.shadowColor = pGlowColor;
        mctx.shadowBlur = 8;
        mctx.beginPath();
        mctx.arc(0, 0, 3.5, 0, Math.PI * 2);
        mctx.fill();
        mctx.shadowBlur = 0;

        mctx.strokeStyle = pGlowColor;
        mctx.lineWidth = 1.5;
        mctx.beginPath();
        mctx.moveTo(0, 0);
        mctx.lineTo(7, 0);
        mctx.stroke();

        mctx.restore();
    }

    // 外框
    mctx.strokeStyle = 'rgba(0, 255, 136, 0.25)';
    mctx.lineWidth = 1;
    mctx.strokeRect(0, 0, canvas.width, canvas.height);
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
    renderBackpackGrid();
}

function renderBackpackGrid() {
    const grid = document.getElementById('backpackGrid');
    const capEl = document.getElementById('backpackCapText');
    if (!grid) return;
    const items = playerData.backpack.items || [];
    if (capEl) capEl.textContent = BackpackManager.getUsedCapacity() + '/' + (playerData.backpack.capacity || 36);
    grid.innerHTML = '';
    const rarityClass = { common: '', uncommon: 'r-uncommon', rare: 'r-rare', epic: 'r-epic', legendary: 'r-legendary' };
    const total = playerData.backpack.capacity || 36;
    for (let i = 0; i < total; i++) {
        const cell = document.createElement('div');
        cell.className = 'grid-cell';
        const it = items[i];
        if (it) {
            cell.classList.add('filled');
            const def = getItemDef(it.itemId);
            const rc = rarityClass[def && def.rarity ? def.rarity : 'common'] || '';
            if (rc) cell.classList.add(rc);
            const icon = (def && def.icon) || '📦';
            const name = (it.count > 1 ? it.count + '× ' : '') + (def ? def.name : it.itemId);
            cell.innerHTML = `<span class="cell-icon">${icon}</span><span class="cell-name">${name}</span>`;
            cell.title = name;
        }
        grid.appendChild(cell);
    }
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
    const weapon = WEAPONS.find(function(w) { return w.id === weaponId; });
    if (!weapon) return { success: false, message: '武器不存在' };
    if (weapon.unlocked) {
        return { success: false, message: '已拥有该武器' };
    }
    if (playerData.coins < weapon.price) {
        return { success: false, message: '金币不足！' };
    }
    playerData.coins -= weapon.price;
    weapon.unlocked = true;
    if (!Array.isArray(playerData.ownedWeapons)) playerData.ownedWeapons = [];
    if (playerData.ownedWeapons.indexOf(weaponId) === -1) {
        playerData.ownedWeapons.push(weaponId);
    }
    savePlayerData();
    updatePlayerStats();
    showNotification('解锁了 ' + weapon.name + '！');
    updateMarketUI();
    return { success: true, message: '解锁成功' };
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
        // 跳过近战武器，近战武器在专属商店/任务奖励中获取
        if (weapon.type === WEAPON_TYPES.MELEE) return;

        const isOwned = weapon.unlocked;
        const isFree = weapon.price === 0;
        const priceText = isOwned ? '已拥有' : (isFree ? '免费' : '🪙 ' + weapon.price);
        const btnText = isOwned ? '已拥有' : (isFree ? '领取' : '购买');
        const canBuy = !isOwned;

        const item = document.createElement('div');
        item.className = 'market-item' + (isOwned ? ' unlocked' : '');
        item.innerHTML = `
            <div class="item-icon">${weaponIconHtml(weapon)}</div>
            <div class="item-info">
                <div class="item-name">${weapon.name}</div>
                <div class="item-desc">${weapon.description || '伤害: ' + weapon.damage + ' | 射速: ' + weapon.fireRate}</div>
            </div>
            <div class="item-price">${priceText}</div>
            <button class="buy-btn" ${!canBuy ? 'disabled' : ''}>${btnText}</button>
        `;
        if (canBuy) {
            item.querySelector('.buy-btn').onclick = function() { buyWeapon(weapon.id); };
        }
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
            <div class="item-icon">${modIconHtml(modId, mod)}</div>
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
        { id: 'speedBoost', name: '肾上激素', icon: '⚡', desc: '临时提升移动速度' }
    ];

    consumables.forEach(item => {
        const price = getItemPrice(item.id);
        const itemKey = getItemKey(item.id);
        const ownedCount = playerData.inventory[itemKey] || 0;

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
        const itemKey = getItemKey(item.id);
        const ownedCount = playerData.inventory[itemKey] || 0;

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

    // 摸金变卖物：游戏中拾取，回到仓库出售换取金币（固定独立分区，始终显示）
    const sep = document.createElement('div');
    sep.className = 'market-section-label';
    sep.style.gridColumn = '1 / -1';
    sep.textContent = '摸金变卖物 —— 搜打撤战利品';
    grid.appendChild(sep);

    const sellables = playerData.sellItems || [];
    if (sellables.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'market-empty-hint';
        empty.style.gridColumn = '1 / -1';
        empty.textContent = '暂无可变卖的战利品，进入搜打撤行动拾取后即可在此出售。';
        grid.appendChild(empty);
    } else {
        sellables.forEach((entry, index) => {
            const def = getSellableDef(entry.id);
            const price = (entry.value || 1) * def.baseValue;
            const div = document.createElement('div');
            div.className = 'market-item r-' + def.rarity;
            div.innerHTML = `
                <div class="item-icon">${sellableIconHtml(def)}</div>
                <div class="item-info">
                    <div class="item-name">${def.name}${entry.value > 1 ? ' ×' + entry.value : ''}</div>
                    <div class="item-desc">搜打撤战利品，可出售换取金币</div>
                </div>
                <div class="item-price">出售价: 🪙 ${price}</div>
                <button class="buy-btn">出售</button>
            `;
            div.querySelector('.buy-btn').onclick = () => {
                sellSellable(index);
            };
            grid.appendChild(div);
        });

        const allBtn = document.createElement('button');
        allBtn.className = 'buy-btn sell-all-btn';
        allBtn.style.gridColumn = '1 / -1';
        allBtn.textContent = '一键全部变卖';
        allBtn.onclick = sellAllSellables;
        grid.appendChild(allBtn);
    }
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
        case 'adrenaline':
            playerData.inventory.adrenaline = (playerData.inventory.adrenaline || 0) + 1;
            BackpackManager.addItem('adrenaline', 1);
            break;
        case 'smoke':
            playerData.inventory.smoke = (playerData.inventory.smoke || 0) + 1;
            BackpackManager.addItem('smoke', 1);
            break;
        case 'energy':
            playerData.inventory.energy = (playerData.inventory.energy || 0) + 1;
            BackpackManager.addItem('energy', 1);
            break;
        case 'plate':
            playerData.inventory.plate = (playerData.inventory.plate || 0) + 1;
            BackpackManager.addItem('plate', 1);
            break;
        case 'scanner':
            playerData.inventory.scanner = (playerData.inventory.scanner || 0) + 1;
            BackpackManager.addItem('scanner', 1);
            break;
        case 'repair':
            playerData.inventory.repair = (playerData.inventory.repair || 0) + 1;
            BackpackManager.addItem('repair', 1);
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

    // 以 playerData.inventory 为权威来源（raid 拾取、黑市购买、物资箱均会同步它），
    // 不再依赖 BackpackManager 的堆叠计数，避免"卖到 N 个后提示库存不够"的误判。
    const owned = itemKey ? (playerData.inventory[itemKey] || 0) : 0;
    if (!itemKey || owned <= 0) {
        showNotification('没有可出售的物品！');
        return;
    }

    playerData.inventory[itemKey]--;
    // 若背包中存在对应物品则同步移除（背包与 inventory 双系统保持一致）
    if (BackpackManager.hasItem(bpItemId, 1)) {
        BackpackManager.removeItem(bpItemId, 1);
    }
    playerData.coins += price;
    showNotification(`出售成功！获得 ${price} 金币`);
    updatePlayerStats();
    updateMarketUI();
}

// 出售摸金变卖物（按类型基础价值结算）
function sellSellable(index) {
    playerData.sellItems = playerData.sellItems || [];
    if (index < 0 || index >= playerData.sellItems.length) return;
    const entry = playerData.sellItems[index];
    const def = getSellableDef(entry.id);
    const value = (entry.value || 1) * def.baseValue;
    playerData.sellItems.splice(index, 1);
    playerData.coins += value;
    showNotification(`出售${def.name}成功！获得 ${value} 金币`);
    updatePlayerStats();
    updateMarketUI();
    savePlayerData();
    renderSellMarketGrid();
}

// 一键出售全部摸金变卖物
function sellAllSellables() {
    playerData.sellItems = playerData.sellItems || [];
    if (playerData.sellItems.length === 0) { showNotification('没有可出售的变卖物'); return; }
    let total = 0;
    playerData.sellItems.forEach(e => { total += (e.value || 1) * getSellableDef(e.id).baseValue; });
    playerData.sellItems = [];
    playerData.coins += total;
    showNotification(`全部变卖成功！获得 ${total} 金币`);
    updatePlayerStats();
    updateMarketUI();
    savePlayerData();
    renderSellMarketGrid();
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
    hideOverlay('feedbackPanel');
    hideOverlay('announcementPanel');
    hideOverlay('mapDetailPanel');
    var an = document.getElementById('announcementPanel'); if (an) an.style.display = 'none';
    var md = document.getElementById('mapDetailPanel'); if (md) md.style.display = 'none';
}

// 点击补充弹药面板外部时关闭（面板内部点击已 stopPropagation，不会触发）
document.addEventListener('click', function (e) {
    if (!raidAmmoPanelOpen) return;
    const panel = document.getElementById('raidAmmoPanel');
    const toggle = document.getElementById('raidAmmoToggle');
    if (!panel) return;
    if (panel.contains(e.target) || (toggle && toggle.contains(e.target))) return;
    closeRaidAmmoPanel();
});

// ===== 意见反馈（纯前端 Web3Forms，发往管理员邮箱）=====
// 注意：Web3Forms 为免费第三方表单服务，需在 https://web3forms.com 注册获取 access_key 后替换下方常量。
// 纯前端无法获取真实 IP，故「同 IP 超 10 次禁用」无法可靠实现；此处仅做「每周每玩家限 1 次」的弱限制。
var WEB3FORMS_ACCESS_KEY = '0f995ca5-3ab0-4762-b2bf-010fe0d7b8f9';
var FEEDBACK_TARGET_EMAIL = '15901485498@139.com';
var FEEDBACK_STORAGE_KEY = 'deathTrench_feedback_last';
var FEEDBACK_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function openFeedback() {
    closeAllPanels();
    var msgEl = document.getElementById('feedbackMsg');
    if (msgEl) msgEl.textContent = '';
    var last = parseInt(localStorage.getItem(FEEDBACK_STORAGE_KEY) || '0', 10);
    var remain = FEEDBACK_WEEK_MS - (Date.now() - last);
    if (last && remain > 0) {
        var days = Math.ceil(remain / (24 * 60 * 60 * 1000));
        if (msgEl) {
            msgEl.style.color = '#e9b94a';
            msgEl.textContent = '本周已发送过反馈，请 ' + days + ' 天后再试。';
        }
        var btn = document.getElementById('feedbackSubmitBtn');
        if (btn) btn.disabled = true;
    } else {
        var btn2 = document.getElementById('feedbackSubmitBtn');
        if (btn2) btn2.disabled = false;
    }
    showOverlay('feedbackPanel');
}

function closeFeedback() {
    hideOverlay('feedbackPanel');
}

function submitFeedback() {
    var contentEl = document.getElementById('feedbackContent');
    var contactEl = document.getElementById('feedbackContact');
    var msgEl = document.getElementById('feedbackMsg');
    var btn = document.getElementById('feedbackSubmitBtn');
    var content = contentEl ? contentEl.value.trim() : '';
    if (!content) {
        if (msgEl) { msgEl.style.color = '#e98'; msgEl.textContent = '反馈内容不能为空。'; }
        return;
    }
    if (WEB3FORMS_ACCESS_KEY === 'YOUR_WEB3FORMS_ACCESS_KEY') {
        if (msgEl) {
            msgEl.style.color = '#e98';
            msgEl.textContent = '反馈功能未配置：请在 js/game.js 中填入 Web3Forms access_key。';
        }
        showNotification('反馈发送失败：access_key 未配置');
        return;
    }
    var last = parseInt(localStorage.getItem(FEEDBACK_STORAGE_KEY) || '0', 10);
    if (last && (FEEDBACK_WEEK_MS - (Date.now() - last)) > 0) {
        if (msgEl) { msgEl.style.color = '#e9b94a'; msgEl.textContent = '本周已发送过反馈，请稍后再试。'; }
        if (btn) btn.disabled = true;
        return;
    }
    if (btn) { btn.disabled = true; btn.textContent = '发送中...'; }
    if (msgEl) { msgEl.style.color = '#7fd'; msgEl.textContent = '正在发送...'; }

    var contact = contactEl ? contactEl.value.trim() : '';
    var payload = {
        access_key: WEB3FORMS_ACCESS_KEY,
        subject: '[DeathTrench 反馈] 来自玩家的意见',
        from_name: 'DeathTrench 游戏反馈',
        reply_to: contact || FEEDBACK_TARGET_EMAIL,
        message: '联系方式：' + (contact || '匿名') + '\n\n反馈内容：\n' + content
    };

    fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
        if (data.success) {
            localStorage.setItem(FEEDBACK_STORAGE_KEY, String(Date.now()));
            if (msgEl) { msgEl.style.color = '#6f6'; msgEl.textContent = '✅ 反馈已发送，感谢你的支持！'; }
            showNotification('反馈已发送，感谢支持');
            if (contentEl) contentEl.value = '';
            if (contactEl) contactEl.value = '';
            if (btn) { btn.textContent = '已发送'; }
        } else {
            throw new Error(data.message || '发送失败');
        }
    })
    .catch(function(e) {
        if (msgEl) { msgEl.style.color = '#e98'; msgEl.textContent = '发送失败：' + e.message; }
        showNotification('反馈发送失败');
        if (btn) { btn.disabled = false; btn.textContent = '发送反馈'; }
    });
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
        // 仅在游戏进行中才执行自动备份，避免大厅/未加载状态下用空数据覆盖真实存档
        if (!gameRunning) {
            autoBackupCountdown = 30;
            updateBackupCountdownUI();
            return;
        }
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
        // Shift existing backups: 4→5, 3→4, 2→3, 1→2 (逐个容错，避免单槽溢出中断整轮)
        for (let i = 5; i >= 2; i--) {
            try {
                const prev = localStorage.getItem('deathTrench_backup_' + (i - 1));
                if (prev) localStorage.setItem('deathTrench_backup_' + i, prev);
                else localStorage.removeItem('deathTrench_backup_' + i);
            } catch (e) {
                // 该槽位空间不足，直接丢弃旧备份以腾出空间
                try { localStorage.removeItem('deathTrench_backup_' + i); } catch (e2) {}
            }
        }
        const save = {
            playerData: JSON.parse(JSON.stringify(playerData)),
            settings: JSON.parse(JSON.stringify(settings || {})),
            timestamp: Date.now()
        };
        const payload = JSON.stringify(save);
        try {
            safeSetItem('deathTrench_backup_1', payload);
        } catch (e) {
            // 配额不足：逐级删除最旧备份后重试
            for (let i = 5; i >= 2; i--) {
                try { localStorage.removeItem('deathTrench_backup_' + i); } catch (e2) {}
                try {
                    safeSetItem('deathTrench_backup_1', payload);
                    break;
                } catch (e3) { /* 继续清理 */ }
            }
        }
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
        // 持久化恢复结果，避免被旧数据覆盖
        try { savePlayerData(); saveSettings(); } catch (e) {}
        // 刷新相关 UI
        try {
            if (typeof renderPlayerInfo === 'function') renderPlayerInfo();
            if (typeof updateHUD === 'function') updateHUD();
            refreshBackupUI();
            refreshSaveStatus();
        } catch (e) {}
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
        { id: 'tip', sender: '战术支援', subject: '战术小贴士 #1', body: '\u2705 使用连发模式：按空格切换自动射击。\n\u2705 手雷在近距离战斗中效果极佳。\n\u2705 敌人被击中时会减速，这是你的重要机会。\n\u2705 补给品（💊🔋💣）可在黑市购买。\n\n保持行动，保持戒备。', date: '2026-06-20 10:02', unread: true },
        { id: 'lore1', sender: '历史学家 · 艾琳', subject: '黑潮纪事：我们如何走到今天', body: '战壕之下埋着旧世界的残骸。\n\n二十年前，"黑潮"只是一种网络传说——直到第一座城市在午夜熄灭灯火。它们不是军队，更像潮汐：退去时留下满地金属与寂静，涨起时吞噬一切。\n\n特遣队的雏形，正是那群在废墟里捡到武器的幸存者。你手中的每一发子弹，都来自某段被遗忘的历史。', date: '2026-06-21 09:30', unread: true },
        { id: 'lore2', sender: '情报官 · 幽灵', subject: '关于"铁砧"的最新研判', body: '目标代号"铁砧"，黑潮前线指挥官。\n\n它不是普通士兵——动力装甲让它的冲锋能撞穿混凝土墙。但我们截获的通讯显示，它似乎在"等待"什么。\n\n我的直觉：它手里握着旧世界的核心数据。击溃它，也许能让我们第一次听懂黑潮在说什么。', date: '2026-06-22 14:12', unread: true },
        { id: 'tip2', sender: '后勤 · 商人', subject: '摸金变卖物收购清单更新', body: '特遣队注意：近期黑市对"高价值战利品"的需求暴涨。\n\n金条、钻石、名画、加密硬盘、军械零件——带得出来就能换成金币。背包按格计算，同种物资可堆叠至 999，记得把空间留给最值钱的东西。\n\n——你的老朋友，商人', date: '2026-06-23 18:45', unread: true },
        { id: 'event1', sender: '指挥部', subject: '特别行动：废墟撤离点', body: '【新行动预告】\n\n情报显示，森林深处的撤离点近期异常活跃。我们怀疑黑潮在那里建立了中转仓库。\n\n行动将于本周末开放，奖励翻倍。请提前检修装备，备足医疗包与弹药。\n\n——活着回来，比什么都重要。', date: '2026-06-24 20:00', unread: true },
        { id: 'tip3', sender: '铁匠铺', subject: '武器改装指南', body: '战士，配件决定生死。\n\n· 瞄准镜：提升命中与射程\n· 扩容弹匣：减少换弹频率\n· 消音器：降低暴露风险\n· 握把：提升稳定性\n· 穿甲弹：撕裂重甲\n· 枪托：提升机动\n· 镭射指示器：弹道可视 + 子弹穿透\n\n合理搭配，方能以一当十。', date: '2026-06-25 11:20', unread: true }
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
    const replies = document.getElementById('mailRepliesPanel');
    if (inbox) inbox.style.display = (tab === 'inbox' ? 'block' : 'none');
    if (compose) compose.style.display = (tab === 'compose' ? 'block' : 'none');
    if (replies) replies.style.display = (tab === 'replies' ? 'block' : 'none');
    if (tab === 'replies') loadReplies(false);
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

// ===== 官方回复（来自 GitHub 仓库 replies/ 目录下的 txt）=====
// 你在仓库根目录 replies/ 中放置 txt 文件，并在 replies/manifest.json 登记，
// 游戏会从 Pages 站点拉取并展示在信箱「📢 官方回复」分区。
// manifest 格式: [{ "file": "xxx.txt", "title": "标题", "date": "2026-08-04" }, ...]
var _replyCache = null;
function loadReplies(forceRefresh) {
    const container = document.getElementById('replyListContainer');
    if (!container) return;
    if (forceRefresh) _replyCache = null;
    if (_replyCache) { renderReplyList(); return; }
    container.innerHTML = '<div class="mail-empty" style="padding:30px 12px;">⏳ 加载中...</div>';
    fetch('replies/manifest.json', { cache: 'no-store' })
        .then(function(r) {
            if (!r.ok) throw new Error('未找到 manifest（请先创建 replies/manifest.json）');
            return r.json();
        })
        .then(function(list) {
            _replyCache = Array.isArray(list) ? list : [];
            renderReplyList();
        })
        .catch(function(e) {
            container.innerHTML = '<div class="mail-empty" style="padding:30px 12px;">' +
                '<div style="font-size:28px;margin-bottom:8px;">📂</div>' +
                '<div>暂无官方回复</div>' +
                '<div style="font-size:11px;color:#8b949e;margin-top:8px;">' + e.message + '</div></div>';
        });
}
function renderReplyList() {
    const container = document.getElementById('replyListContainer');
    if (!container) return;
    if (!_replyCache || _replyCache.length === 0) {
        container.innerHTML = '<div class="mail-empty" style="padding:30px 12px;">📭 暂无官方回复</div>';
        return;
    }
    container.innerHTML = _replyCache.map(function(m, idx) {
        const safeTitle = (m.title || m.file || '（无标题）').toString();
        const safeDate = (m.date || '').toString();
        return '<div class="mail-list-item" onclick="openReply(' + idx + ')">' +
                    '<div class="mail-sender">📢 官方</div>' +
                    '<div class="mail-subject">' + safeTitle + '</div>' +
                    '<div class="mail-date">' + safeDate + '</div>' +
                '</div>';
    }).join('');
}
function openReply(idx) {
    if (!_replyCache || !_replyCache[idx]) return;
    const m = _replyCache[idx];
    const reader = document.getElementById('replyReader');
    fetch('replies/' + encodeURIComponent(m.file), { cache: 'no-store' })
        .then(function(r) {
            if (!r.ok) throw new Error('文件读取失败: ' + m.file);
            return r.text();
        })
        .then(function(text) {
            if (reader) {
                const safeTitle = (m.title || m.file || '（无标题）').toString();
                const safeDate = (m.date || '').toString();
                const safeBody = (text || '').toString();
                reader.innerHTML =
                    '<div class="mail-reader-sender">📢 官方回复</div>' +
                    '<div class="mail-reader-subject">' + safeTitle + '</div>' +
                    '<div class="mail-reader-date">' + safeDate + '</div>' +
                    '<div class="mail-reader-divider"></div>' +
                    '<div class="mail-reader-body">' + safeBody + '</div>';
            }
        })
        .catch(function(e) {
            if (reader) {
                reader.innerHTML = '<div class="mail-empty"><div style="font-size:36px;margin-bottom:10px;">⚠️</div><div>' + e.message + '</div></div>';
            }
        });
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
// 记录剧情对话定时器，游戏结束时清理，避免跨局误弹
let _pendingStoryTimers = [];

function loadCompletedMissions() {
    try {
        const raw = localStorage.getItem('deathTrench_completed_missions');
        if (raw) completedMissionIds = JSON.parse(raw);
    } catch (e) { completedMissionIds = []; }
}
function saveCompletedMissions() {
    try { localStorage.setItem('deathTrench_completed_missions', JSON.stringify(completedMissionIds)); }
    catch (e) { console.warn('[MISSION] 保存已完成任务失败:', e.message); }
}

// 持久化当前进行中的任务与进度，避免刷新/重开丢失
function saveActiveMission() {
    try {
        if (currentMission) {
            localStorage.setItem('deathTrench_active_mission', JSON.stringify({
                id: currentMission.id,
                progress: currentMissionProgress
            }));
        } else {
            localStorage.removeItem('deathTrench_active_mission');
        }
    } catch (e) { console.warn('[MISSION] 保存当前任务失败:', e.message); }
}

function loadActiveMission() {
    try {
        const raw = localStorage.getItem('deathTrench_active_mission');
        if (!raw) return;
        const data = JSON.parse(raw);
        const missions = loadMissions();
        const m = missions.find(x => x.id === data.id);
        if (m && !completedMissionIds.includes(m.id) && hasMissionPrereqs(m, missions)) {
            currentMission = m;
            currentMissionProgress = typeof data.progress === 'number' ? data.progress : 0;
            updateMissionDisplay();
            updateReadyRoomMission();
        } else {
            localStorage.removeItem('deathTrench_active_mission');
        }
    } catch (e) { console.warn('[MISSION] 读取当前任务失败:', e.message); }
}

function getDefaultMissions() {
    return [
        { id: 'task_kill1', type: 'kill', nameZh: '沙漠突袭', nameEn: 'Desert Assault', chapter: 1, descZh: '【第一章·新兵第一课】黑潮军团在东部沙海带建立了前哨。普莱斯命令你清除这里的敌军巡逻队，让死亡战壕的旗帜第一次插上沙丘。', descEn: 'Ch.1 — Clear the Black Tide outpost in the desert dunes and prove yourself to Price.', target: 15, reward: 500, map: 'desert' },
        { id: 'task_kill2', type: 'kill', nameZh: '城市清剿', nameEn: 'City Cleanup', chapter: 1, descZh: '【第一章·断壁城】黑潮占领了断壁城废墟，把平民当成了人肉盾牌。在保护平民与完成任务之间，你的每一次扣扳机都在书写自己的立场。', descEn: 'Ch.1 — Sweep the urban ruins held by Black Tide; civilians are trapped inside.', target: 20, reward: 600, map: 'city' },
        { id: 'task_kill3', type: 'kill', nameZh: '丛林猎杀', nameEn: 'Jungle Hunt', chapter: 2, descZh: '【第二章·幽灵的线索】丛林深处藏着黑潮的通讯节点。幽灵截获的录音显示，有人正冒用普莱斯的旧频道。肃清这里的守军，逼出幕后操纵者。', descEn: 'Ch.2 — Hunt down the jungle garrison guarding Black Tide comms nodes.', target: 25, reward: 700, map: 'jungle' },
        { id: 'task_extract', type: 'extract', nameZh: '成功撤离', nameEn: 'Successful Extraction', chapter: 2, descZh: '【第二章·活着才有答案】情报到手后，撤离点会向你开放。记住：在搜打撤中，死亡意味着一切归零——带着战利品活着离开，才算是真正的胜利。', descEn: 'Ch.2 — Reach the extraction point alive; in raid mode, death loses everything.', target: 1, reward: 300, map: 'any' },
        { id: 'task_score', type: 'score', nameZh: '高分挑战', nameEn: 'High Score Challenge', chapter: 3, descZh: '【第三章·名声鹊起】总部开始关注这个不听命令却总能完成任务的新人。用一场漂亮的战斗证明死亡战壕不可小觑，让黑潮记住你的代号。', descEn: 'Ch.3 — Make a name for yourself with a high-score assault.', target: 1000, reward: 800, map: 'any' },
        { id: 'task_boss1', type: 'boss', nameZh: 'Boss 猎手', nameEn: 'Boss Hunter', chapter: 3, descZh: '【第三章·猎杀首脑】黑潮前线指挥官「铁颚」现身。击败他，不仅是一枚勋章，更是撬开真相之门的钥匙——他认识的，远比他肯说的多。', descEn: 'Ch.3 — Eliminate the Black Tide commander "Ironjaw" to unlock the truth.', target: 1, reward: 1000, map: 'any' }
    ];
}

// 内存缓存：任务列表不常变，避免每次调用都读 localStorage + 重新合并分线任务
let _missionsCache = null;

function loadMissions() {
    if (_missionsCache) return _missionsCache;
    let missions = [];
    try {
        const stored = localStorage.getItem('deathTrench_missions');
        if (stored) {
            const data = JSON.parse(stored);
            // 兼容两种格式：数组直接使用 / {tasks: [...] }
            if (Array.isArray(data)) missions = data;
            else if (Array.isArray(data.tasks)) missions = data.tasks;
        }
    } catch (e) { /* fallback */ }

    if (!missions || missions.length === 0) {
        missions = getDefaultMissions();
    }

    // 合并分线剧情任务，避免重复
    const storyMissions = getStoryMissions();
    const existingIds = new Set(missions.map(m => m.id));
    for (const sm of storyMissions) {
        if (!existingIds.has(sm.id)) {
            missions.push(sm);
            existingIds.add(sm.id);
        }
    }
    _missionsCache = missions;
    return missions;
}

// 任务数据变更后调用以刷新缓存
function invalidateMissionsCache() {
    _missionsCache = null;
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
    saveActiveMission();

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
        // 统一走 finishCurrentMission，避免与 completeMission 的完成逻辑重复
        finishCurrentMission();
    }
}

function completeMission() {
    if (!currentMission) return;
    // 统一完成逻辑（含剧情触发、推进、面板收尾），并记录定时器以便清理
    finishCurrentMission();
}

// 统一的任务完成处理：标记完成、发奖、触发分线剧情、推进到下一任务、收尾面板
function finishCurrentMission() {
    if (_missionCompleting || !currentMission) return;
    const finishing = currentMission;
    const finishedId = finishing.id;
    _missionCompleting = true;
    try {
        if (!completedMissionIds.includes(finishedId)) {
            completedMissionIds.push(finishedId);
            saveCompletedMissions();
        }
        // 难度影响奖励：机密 +25%、绝密 +60%、进阶 +10%、标准 -20%（最低 1）
        const gained = getMissionReward(finishing.reward, settings.difficulty);
        playerData.coins += gained;
        showNotification('🎖️ 任务完成！获得 ' + gained + ' 金币（' + getDiffConfig(settings.difficulty).label + '难度加成）');

        // 分线剧情触发（定时器记录到集合，便于游戏结束时清理，避免跨局弹窗）
        const storyTimers = [];
        function scheduleStory(dialogueId, mailId, delay) {
            if (mailId) sendStoryMail(mailId);
            if (dialogueId && !isDialogueCompleted(dialogueId)) {
                storyTimers.push(setTimeout(() => showDialogue(dialogueId), delay));
            }
        }
        if (finishedId === 'task_kill2') {
            sendStoryMail('price_after_city');
            if (storyState.branch === 'truth' || storyState.branch === 'mercy') {
                sendStoryMail('ghost_warning_mail');
            }
            advanceChapter();
        }
        if (finishedId === 'task_kill3' && storyState.branch === 'truth' && storyState.chapter < 3) {
            advanceChapter();
        }
        if (finishedId === 'task_truth_lab') scheduleStory('ch4_truth_confront', 'ch4_truth_meeting', 800);
        if (finishedId === 'task_loyalty_convoy') scheduleStory('ch4_loyalty_order', 'ch4_loyalty_directive', 800);
        if (finishedId === 'task_mercy_rescue') scheduleStory('ch4_mercy_civilian', 'ch4_mercy_eileen', 800);
        if (finishedId === 'task_boss1') scheduleStory('ch5_final_choice', null, 1000);
        // 记录定时器以便清理
        if (storyTimers.length) _pendingStoryTimers.push(...storyTimers);

        // 推进到下一任务
        const missions = loadMissions();
        const currentIdx = missions.findIndex(m => m.id === finishedId);
        if (currentIdx >= 0 && currentIdx < missions.length - 1) {
            currentMission = missions[currentIdx + 1];
            currentMissionProgress = 0;
            updateMissionDisplay();
            updateReadyRoomMission();
        } else {
            currentMission = null;
            hideMissionPanel();
        }
        saveActiveMission();
    } finally {
        _missionCompleting = false;
    }
}

// 任务面板 DOM 引用缓存，避免每次更新重复查询
var _missionPanelRefs = null;
function getMissionPanelRefs() {
    if (_missionPanelRefs) return _missionPanelRefs;
    _missionPanelRefs = {
        name: document.getElementById('missionName'),
        desc: document.getElementById('missionDesc'),
        reward: document.getElementById('missionReward'),
        progress: document.getElementById('missionProgress'),
        progressText: document.getElementById('missionProgressText'),
        panel: document.getElementById('missionPanel')
    };
    return _missionPanelRefs;
}

function updateMissionDisplay() {
    if (!currentMission) {
        hideMissionPanel();
        return;
    }

    const nameEl = getMissionPanelRefs().name;
    const descEl = getMissionPanelRefs().desc;
    const rewardEl = getMissionPanelRefs().reward;
    const progressEl = getMissionPanelRefs().progress;
    const progressTextEl = getMissionPanelRefs().progressText;
    const panel = getMissionPanelRefs().panel;

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
    
    const difficulty = settings.difficulty || 'advanced';

    if (panel) {
        panel.style.display = 'block';
        panel.classList.remove('standard', 'advanced', 'confidential', 'topsecret');
        panel.classList.add(difficulty);
    }

    updateMissionTracker();
}

// 游戏内任务追踪 HUD：实时显示当前任务名称与进度
function updateMissionTracker() {
    const tracker = document.getElementById('missionTracker');
    if (!tracker) return;
    if (!currentMission || !gameRunning) {
        tracker.classList.add('hidden');
        return;
    }
    tracker.classList.remove('hidden');
    const nameEl = document.getElementById('mtName');
    const fillEl = document.getElementById('mtFill');
    const progEl = document.getElementById('mtProgress');
    const safeTarget = (typeof currentMission.target === 'number' && currentMission.target > 0) ? currentMission.target : 1;
    const pct = Math.min(100, (currentMissionProgress / safeTarget) * 100);
    if (nameEl) nameEl.textContent = (currentMission.nameZh || '') + ' · 🪙' + getMissionReward(currentMission.reward, settings.difficulty);
    if (fillEl) fillEl.style.width = pct + '%';
    if (progEl) progEl.textContent = currentMissionProgress + '/' + safeTarget;
}

function hideMissionPanel() {
    const panel = getMissionPanelRefs().panel;
    if (panel) panel.style.display = 'none';
}

function updateReadyRoomMission() {
    const nameEl = document.getElementById('readyRoomMissionName');
    const descEl = document.getElementById('readyRoomMissionDesc');
    const rewardEl = document.getElementById('readyRoomMissionReward');
    const cardEl = document.getElementById('readyRoomMissionCard');

    if (!nameEl) return;

    if ((playerData.selectedMode || 'mission') === 'raid') {
        nameEl.textContent = '搜打撤行动';
        descEl.textContent = '进入地图搜索物资、击败敌人，并在撤离点安全撤离。成功撤离才能带走战利品！';
        rewardEl.textContent = '奖励: 战利品可带回仓库并出售';
        if (cardEl) cardEl.style.borderColor = '#ffaa00';
        return;
    }

    if (!currentMission) {
        nameEl.textContent = '暂无进行中的任务';
        if (descEl) descEl.textContent = '选择地图以开始新任务';
        if (rewardEl) rewardEl.textContent = '';
        return;
    }

    nameEl.textContent = currentMission.nameZh;
    descEl.textContent = currentMission.descZh;
    rewardEl.textContent = '奖励: 🪙 ' + currentMission.reward + ' · 目标: ' + currentMissionProgress + '/' + currentMission.target;
    if (cardEl) cardEl.style.borderColor = '#00cc66';

    toggleMissionBriefingButton();
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
    saveActiveMission();
    showNotification('📌 已选择任务: ' + m.nameZh);
}

// 任务线列表的地图筛选状态（'any' 表示全部）
let _missionLineFilter = 'any';

function renderMissionLineList() {
    const listEl = document.getElementById('missionLineList');
    if (!listEl) return;

    const missions = loadMissions();
    const currentMapId = playerData.selectedMap || 'desert';
    const currentId = currentMission ? currentMission.id : null;

    // 预计算每个任务的解锁状态，避免渲染时 O(n²) 重复查找
    const unlockedSet = new Set();
    missions.forEach(function (m) {
        if (completedMissionIds.includes(m.id) || m.id === currentId) return;
        if (hasMissionPrereqs(m, missions)) unlockedSet.add(m.id);
    });

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
            const safeTarget = (typeof m.target === 'number' && m.target > 0) ? m.target : 1;
            const percent = Math.min(100, (currentMissionProgress / safeTarget) * 100);
            return '<div class="mission-line-progress"><div class="mission-line-progress-fill" style="width:' + percent + '%"></div></div><div style="font-size:11px;color:#58a6ff;margin-top:4px;">进度: ' + currentMissionProgress + '/' + safeTarget + '</div>';
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
        return unlockedSet.has(m.id);
    }

    function buildCard(m) {
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
        } else if (!unlockedSet.has(m.id) && m.map === 'any') {
            statusClass = 'locked';
            statusText = '🔒 前置任务未完成';
        } else {
            statusClass = 'locked';
            statusText = '📌 待解锁';
        }

        const cardClass = selectable ? 'mission-line-card selectable' : 'mission-line-card ' + statusClass;
        const clickAttr = selectable ? ' onclick="selectMissionById(\'' + m.id + '\')" style="cursor:pointer;" ' : '';

        return '<div class="' + cardClass + '"' + clickAttr + '>' +
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
    }

    // 地图筛选 chips
    const mapChips = [
        { id: 'any', label: '🌍 全部' },
        { id: 'desert', label: '🏜️ 沙漠' },
        { id: 'city', label: '🏙️ 城市' },
        { id: 'factory', label: '🏭 工厂' },
        { id: 'jungle', label: '🌴 丛林' },
        { id: 'snow', label: '❄️ 雪山' },
        { id: 'volcano', label: '🌋 火山' },
        { id: 'ruins', label: '🏛️ 遗迹' },
        { id: 'base', label: '🏰 基地' }
    ];
    const chipHtml = '<div class="mission-filter-chips">' + mapChips.map(function(c) {
        const active = (c.id === _missionLineFilter) ? ' active' : '';
        return '<button class="filter-chip' + active + '" onclick="setMissionLineFilter(\'' + c.id + '\')">' + c.label + '</button>';
    }).join('') + '</div>';

    // 总体进度摘要
    const totalCount = missions.length;
    const doneCount = missions.filter(function(m) { return completedMissionIds.includes(m.id); }).length;
    const overallPercent = totalCount ? Math.round((doneCount / totalCount) * 100) : 0;
    const summaryHtml =
        '<div class="mission-summary">' +
            '<div class="mission-summary-text">任务线进度 <b>' + doneCount + '/' + totalCount + '</b></div>' +
            '<div class="mission-summary-bar"><div class="mission-summary-fill" style="width:' + overallPercent + '%"></div></div>' +
        '</div>';

    // 按 chapter 分组（缺失 chapter 的归为「主线任务」）
    const groups = {};
    missions.forEach(function(m) {
        const key = (m.chapter != null ? ('第' + m.chapter + '章') : '主线任务');
        if (!groups[key]) groups[key] = [];
        groups[key].push(m);
    });
    const groupOrder = Object.keys(groups).sort(function(a, b) {
        const na = parseInt(a.replace('第', '').replace('章', ''), 10);
        const nb = parseInt(b.replace('第', '').replace('章', ''), 10);
        if (!isNaN(na) && !isNaN(nb)) return na - nb;
        return 0;
    });

    let cardsHtml = '';
    groupOrder.forEach(function(g) {
        const filtered = g === '主线任务'
            ? groups[g]
            : groups[g].filter(function(m) { return _missionLineFilter === 'any' || m.map === _missionLineFilter || m.map === 'any'; });
        if (filtered.length === 0) return;
        cardsHtml += '<div class="mission-group-title">' + g + '</div>';
        cardsHtml += filtered.map(buildCard).join('');
    });

    if (!cardsHtml) {
        cardsHtml = '<div style="padding:20px;text-align:center;color:#8b949e;">当前筛选下没有可显示的任务</div>';
    }

    listEl.innerHTML = summaryHtml + chipHtml + cardsHtml;
}

function setMissionLineFilter(mapId) {
    _missionLineFilter = mapId;
    renderMissionLineList();
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
    // 首次进入自动弹出更新公告（10 秒后自动关闭）
    autoShowAnnouncement();
})();

// 版本检查函数（仅桌面版弹窗提示，网页版跳过自动弹窗）
async function checkForUpdates() {
    try {
        let latest = null;
        if (window.electronAPI && window.electronAPI.checkVersion) {
            const result = await window.electronAPI.checkVersion();
            if (result.success && result.data && result.data.version) latest = result.data.version;
        } else {
            // 网页版：同源 fetch version.json 检测新版本（GitHub Pages 同目录）
            try {
                const res = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
                if (res.ok) {
                    const data = await res.json();
                    if (data && data.version) latest = data.version;
                }
            } catch (fe) { /* 网络失败静默 */ }
        }
        if (latest && compareVersions(latest, GAME_VERSION) > 0) {
            showNotification(`发现新版本 ${latest}！`, 'success');
            // 高亮公告入口，引导玩家查看更新内容
            const ab = document.getElementById('announcementBtn');
            if (ab) { ab.classList.add('has-update'); ab.title = '发现新版本 ' + latest; }
        }
    } catch (e) {
        console.warn('[UPDATE] Version check failed:', e.message);
    }
}

// ============================================================
// 更新公告（常驻入口，点击查看固定公告内容）
// ============================================================
var ANNOUNCE_VERSION_KEY = 'deathTrench_announcement_seen';
var announcementTimer = null;

// 从 version.json 动态读取 changelog 填充公告面板（失败则保留 HTML 静态内容作为兜底）
async function loadAnnouncementContent() {
    try {
        const res = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
        if (!res.ok) return false;
        const data = await res.json();
        if (!data) return false;
        const titleEl = document.querySelector('#announcementPanel .un-title');
        const dateEl = document.querySelector('#announcementPanel .un-date');
        const listEl = document.querySelector('#announcementPanel .un-list');
        if (dateEl && data.version) {
            dateEl.textContent = 'v' + data.version + (data.releaseDate ? ' · ' + data.releaseDate : '');
        }
        if (listEl && Array.isArray(data.changelog) && data.changelog.length) {
            listEl.innerHTML = data.changelog.map(function (line) {
                return '<li>' + escapeHtml(line) + '</li>';
            }).join('');
        }
        return true;
    } catch (e) {
        console.warn('[ANNOUNCE] 动态加载公告失败，使用静态内容兜底：', e.message);
        return false;
    }
}

async function openAnnouncement(autoClose) {
    showOverlay('announcementPanel');
    // 首次自动弹出时记录已读，避免再次自动弹出
    try { localStorage.setItem(ANNOUNCE_VERSION_KEY, GAME_VERSION); } catch (e) {}
    if (announcementTimer) { clearTimeout(announcementTimer); announcementTimer = null; }
    // 动态加载公告内容（version.json 的 changelog），失败则保留 HTML 静态内容
    try { await loadAnnouncementContent(); } catch (e) {}
    if (autoClose) {
        announcementTimer = setTimeout(function () {
            closeAnnouncement();
        }, 10000);
    }
}

function closeAnnouncement() {
    if (announcementTimer) { clearTimeout(announcementTimer); announcementTimer = null; }
    hideOverlay('announcementPanel');
    var el = document.getElementById('announcementPanel');
    if (el) el.style.display = 'none';
}

// 首次进入自动弹出公告（仅当未看过当前版本）
function autoShowAnnouncement() {
    var seen = null;
    try { seen = localStorage.getItem(ANNOUNCE_VERSION_KEY); } catch (e) {}
    if (seen !== GAME_VERSION) {
        setTimeout(function () {
            // 若已有其他遮罩打开，则跳过本次自动弹出，避免叠加遮挡
            var anyOpen = false;
            ['mapDetailPanel', 'missionLinePanel', 'saveManagerPanel', 'mailPanel', 'personalInfoPanel'].forEach(function (id) {
                var el = document.getElementById(id);
                if (el && (el.classList.contains('active') || el.style.display === 'flex' || el.style.display === 'block')) anyOpen = true;
            });
            if (!anyOpen) openAnnouncement(true);
        }, 600);
    }
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
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
        'speedBoost': '肾上激素',
        'adrenaline': '肾上腺素',
        'smoke': '烟雾弹',
        'energy': '能量饮料',
        'plate': '防弹插板',
        'scanner': '探测器',
        'repair': '维修包',
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

    // 所有可在战斗中使用的消耗品统一走 inventory[itemName] 计数
    const battleItemIds = ['medkit', 'grenade', 'speedBoost', 'ammoBox', 'adrenaline', 'smoke', 'energy', 'plate', 'scanner', 'repair'];
    if (battleItemIds.indexOf(itemName) === -1) {
        showNotification('无法在战斗中使用该物品');
        return;
    }

    // 普通模式保证库存计数存在（generous）
    if (gameMode !== 'raid') {
        playerData.inventory[itemName] = playerData.inventory[itemName] || 99999;
    } else {
        playerData.inventory[itemName] = playerData.inventory[itemName] || 0;
    }

    // 局内消耗品检查
    if (battleConsumables) {
        if ((battleConsumables[itemName] || 0) <= 0) {
            const modeHint = gameMode === 'raid' ? '携带数量已用完！' : '本局已用完！';
            showNotification(`${getItemDisplayName(itemName)} ${modeHint}`);
            return;
        }
        // 手雷走 throwGrenade 路径，那里会扣减
        if (itemName !== 'grenade') {
            battleConsumables[itemName]--;
            playerData.inventory[itemName] = (playerData.inventory[itemName] || 0) - 1;
        }
    }

    switch (itemName) {
        case 'medkit': {
            const healAmount = 30;
            player.health = Math.min(player.health + healAmount, player.maxHealth);
            showNotification(`使用医疗包，恢复 ${healAmount} 生命值！`);
            break;
        }
        case 'adrenaline': {
            player.buffs.speedBoostUntil = Date.now() + 15000;
            player.buffs.damageBoostUntil = Date.now() + 15000;
            player.health = Math.min(player.maxHealth, player.health + 15);
            showNotification('💉 肾上腺素：15秒极速+伤害提升，回血15！');
            break;
        }
        case 'energy': {
            player.buffs.regenUntil = Date.now() + 20000;
            player.buffs.regenPerTick = 1.5;
            showNotification('🥤 能量饮料：20秒持续回血！');
            break;
        }
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
        case 'speedBoost': {
            player.buffs.speedBoostUntil = Date.now() + 30000;
            showNotification('注射肾上激素，速度提升50%（30秒）！');
            break;
        }
        case 'plate': {
            player.buffs.armorPlateUntil = Date.now() + 30000;
            player.buffs.damageReduction = Math.max(player.buffs.damageReduction || 0, 0.4);
            showNotification('🟦 防弹插板：30秒减伤40%！');
            break;
        }
        case 'smoke': {
            throwSmoke();
            break;
        }
        case 'scanner': {
            activateScanner();
            break;
        }
        case 'repair': {
            player.health = Math.min(player.maxHealth, player.health + 25);
            player.weapons.forEach(w => {
                if (!w.isMelee && w.type !== WEAPON_TYPES.MELEE) {
                    const mw = getModifiedWeapon(w);
                    w.currentAmmo = mw.clipSize;
                }
            });
            showNotification('🔧 维修包：回血25并将所有武器弹夹补满！');
            syncAmmoUI();
            break;
        }
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
    });

    // 左键 = 开枪（按住持续连发，由 canShoot 节流）；右键 = 狙击开镜/普通射击
    canvas.addEventListener('mousedown', (e) => {
        canvas.focus();
        if (!gameRunning) return;
        if (e.button === 0) {
            // 左键开火
            mouseFiring = true;
            if (canShoot()) shoot();
        } else if (e.button === 2) {
            e.preventDefault();
            const weapon = player.weapons[player.currentWeapon];
            // 狙击枪右键开镜放大，朝鼠标方向；其余武器右键单发射击
            if (weapon && weapon.type === WEAPON_TYPES.SNIPER) {
                aiming = true;
            } else if (canShoot()) {
                shoot();
            }
        }
    });

    canvas.addEventListener('mouseup', (e) => {
        if (e.button === 0) mouseFiring = false;
        if (e.button === 2) aiming = false;
    });

    // 鼠标移出画布时停止开火/开镜，避免卡住
    canvas.addEventListener('mouseleave', () => { mouseFiring = false; aiming = false; });
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

    // 游戏按键统一监听 window（全局），避免 canvas 焦点陷阱导致 WASD 移动失效。
    // canvas 元素默认无法获得键盘焦点，仅靠 click 聚焦不可靠，故游戏按键挂在 window 上。
    window.addEventListener('keydown', e => {
        // ESC 全局退出：先关模态，再回上级
        if (e.code === 'Escape') {
            // 1) 先关闭各类游戏内遮罩弹窗（优先于结束游戏）
            const ap = document.getElementById('announcementPanel');
            const mdp = document.getElementById('mapDetailPanel');
            const rap = document.getElementById('raidAmmoPanel');
            const cp = document.getElementById('containerPanel');
            const rbp = document.getElementById('raidBackpackPanel');
            const tdm = document.getElementById('titleDetailModal');
            if (tdm && tdm.style.display === 'flex') { closeTitleDetail(); return; }
            if (ap && (ap.classList.contains('active') || ap.style.display === 'flex')) { closeAnnouncement(); return; }
            if (mdp && (mdp.classList.contains('active') || mdp.style.display === 'flex')) { closeMapDetail(); return; }
            if (rap && rap.style.display === 'block') { closeRaidAmmoPanel(); return; }
            if (cp && cp.style.display === 'block') { closeContainerPanel(); return; }
            if (rbp && rbp.style.display === 'block') { toggleRaidBackpackPanel(); return; }
            // 2) 如果正在游戏中，ESC 结束游戏
            if (gameRunning) { endGame(); return; }
            // 3) 如果当前显示的是 lobby 内的子 panel 而非 readyRoom，回退到 lobby
            const activeSubPanel = document.querySelector('.panel.active');
            if (activeSubPanel && activeSubPanel.id !== 'readyRoom') { showLobby(); return; }
            // 4) 其他情况回主菜单
            const lobby = document.getElementById('lobby');
            if (lobby && lobby.style.display !== 'none') { backToMenu(); }
            return;
        }

        // 在输入框/文本域中时不处理游戏按键，避免误触发
        const tag = (e.target && e.target.tagName) || '';
        if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable)) return;

        // 冲刺(Ctrl)组合键拦截：阻止 Ctrl+W/R 等触发浏览器默认行为，
        // 确保 CTRL 加速只影响移动，不会误触刷新/关页等其它操作
        if ((e.ctrlKey || e.metaKey) && gameRunning) {
            e.preventDefault();
            if (e.code === 'KeyR' || e.code === 'KeyW') return; // 不再触发浏览器刷新/关闭
        }

        keys.set(e.code, true);

        // Shift 按住：显示物资圆盘
        if (gameRunning && (e.code === 'ShiftLeft' || e.code === 'ShiftRight')) {
            shiftHeld = true;
            showItemWheel(true);
        }
        // Ctrl 按住：进入冲刺预备（仅在移动时生效，不影响换弹/投掷等操作）
        if (gameRunning && (e.code === 'ControlLeft' || e.code === 'ControlRight')) {
            ctrlHeld = true;
            e.preventDefault();
        }
        if (shiftHeld && gameRunning) {
            if (handleShiftItem(e.code)) return;
        }

        // 冲刺(Ctrl)状态下不响应换弹/投掷等快捷键，避免与其它操作冲突
        if (ctrlHeld && gameRunning) return;

        if (e.code === 'KeyR' && gameRunning) reload();
        if (e.code === 'KeyG' && gameRunning) throwGrenade();
        if (e.code === 'KeyE' && gameRunning) tryInteractLootCrate();
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

    window.addEventListener('keyup', e => {
        keys.set(e.code, false);
        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
            shiftHeld = false;
            showItemWheel(false);
        }
        if (e.code === 'ControlLeft' || e.code === 'ControlRight') {
            ctrlHeld = false;
        }
    });

    // 窗口失焦时清空所有按键状态，避免 keyup 丢失导致角色持续移动
    window.addEventListener('blur', () => { keys.clear(); autoFire = false; shiftHeld = false; });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { keys.clear(); autoFire = false; shiftHeld = false; } });

    // resize 时重新设置 canvas 尺寸是合理的（仅此一次）
    window.addEventListener('resize', () => {
        if (!canvas) return;
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    });

    loadPlayerData();
    loadGameParams();
    loadSettings();
    applyMobileModeClass();
    initMobileControls();
    loadPlayerMods();
    loadCustomTitles();
    loadMedals();
    loadCompletedMissions();
    loadMissionSettings();
    loadActiveMission();
    loadStoryState();
    syncSettingsUI();
    setupMissionPanelDrag();
    checkAllMedals();
    showMenu();
}

function syncSettingsUI() {
    try {
        const diffSelect = document.getElementById('difficultySelect');
        if (diffSelect) diffSelect.value = settings.difficulty || 'advanced';

        const speedSlider = document.getElementById('speedSlider');
        const speedValue = document.getElementById('speedValue');
        if (speedSlider) speedSlider.value = settings.playerSpeed || 100;
        if (speedValue) speedValue.textContent = (settings.playerSpeed || 100) + '%';

        const fireRateSlider = document.getElementById('fireRateSlider');
        const fireRateValue = document.getElementById('fireRateValue');
        if (fireRateSlider) fireRateSlider.value = settings.fireRate || 100;
        if (fireRateValue) fireRateValue.textContent = (settings.fireRate || 100) + '%';

        const mobileToggle = document.getElementById('mobileModeToggle');
        if (mobileToggle) mobileToggle.checked = !!settings.mobileMode;
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
// 搜打撤实验：队友系统
// ============================================================
function setTeammateCount(n) {
    n = Math.max(0, Math.min(TEAM_MAX_SIZE - 1, n));
    playerData.teammateCount = n;
    updateTeammateCountUI();
    updateTeammateLoadoutPreview();
    savePlayerData();
}

function updateTeammateCountUI() {
    const count = typeof playerData.teammateCount === 'number' ? playerData.teammateCount : 0;
    document.querySelectorAll('.teammate-count-btn').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.count) === count);
    });
    const label = document.getElementById('teammateCountLabel');
    if (label) label.textContent = count === 0 ? '单人作战' : count === 1 ? '1 名队友' : '2 名队友';
}

function updateTeammateLoadoutPreview() {
    const preview = document.getElementById('teammateLoadoutPreview');
    if (!preview) return;
    const count = typeof playerData.teammateCount === 'number' ? playerData.teammateCount : 0;
    if (count <= 0) {
        preview.innerHTML = '';
        return;
    }
    const armorMap = { none: '无甲', light: '轻型护甲', heavy: '重型护甲' };
    const parts = [];
    for (let i = 0; i < count; i++) {
        const loadout = generateRandomTeammateLoadout();
        parts.push(`队友${i + 1}：${weaponIconHtml(loadout.weapon)} ${loadout.weapon.name} · ${armorMap[loadout.armor] || loadout.armor}`);
    }
    preview.innerHTML = parts.join('<br>');
}

function generateRandomTeammateLoadout() {
    let candidates = WEAPONS.filter(w => !w.isMelee && w.type !== WEAPON_TYPES.MELEE && w.unlocked);
    if (candidates.length === 0) {
        candidates = WEAPONS.filter(w => w.id === 'rifle' || w.id === 'pistol');
    }
    const baseWeapon = candidates[Math.floor(Math.random() * candidates.length)];
    const weapon = { ...baseWeapon };
    const armorRoll = Math.random();
    const armor = armorRoll < 0.5 ? 'none' : (armorRoll < 0.8 ? 'light' : 'heavy');
    const armorBonus = armor === 'heavy' ? 60 : armor === 'light' ? 30 : 0;
    return { weapon, armor, maxHealth: (gameParams.PLAYER.maxHealth || 100) + armorBonus };
}

function spawnTeammates(count) {
    teammates = [];
    if (!count || count <= 0 || !player) return;
    const startX = player.x;
    const startY = player.y;
    for (let i = 0; i < count; i++) {
        let x, y, attempts = 0;
        do {
            const angle = Math.random() * Math.PI * 2;
            const dist = 2 + Math.random() * 2.5;
            x = startX + Math.cos(angle) * dist;
            y = startY + Math.sin(angle) * dist;
            attempts++;
        } while ((isBlockedCircle(x, y, 0.45) || Math.abs(x - startX) + Math.abs(y - startY) < 1.5) && attempts < 30);
        const loadout = generateRandomTeammateLoadout();
        teammates.push({
            x, y,
            angle: Math.random() * Math.PI * 2,
            health: loadout.maxHealth,
            maxHealth: loadout.maxHealth,
            radius: 0.45,
            speedMul: 0.8 + Math.random() * 0.25,
            weapon: loadout.weapon,
            currentAmmo: loadout.weapon.clipSize || 30,
            lastShot: 0,
            alive: true,
            hitFlash: 0,
            targetEnemy: null,
            name: '队友' + (i + 1),
            armor: loadout.armor
        });
    }
}

function getNearestTeammateTarget(x, y, maxRange) {
    let best = null;
    let bestDist = maxRange * maxRange;
    for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (!e || !e.alive) continue;
        const dx = e.x - x;
        const dy = e.y - y;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestDist) {
            bestDist = d2;
            best = e;
        }
    }
    return best;
}

function updateTeammates(now) {
    if (!gameRunning || !player || teammates.length === 0) return;
    const baseSpeed = (gameParams.ENEMY && gameParams.ENEMY.moveSpeed ? gameParams.ENEMY.moveSpeed : 0.35) * 0.9;

    // 找到对玩家威胁最大的敌人，队友会优先协防
    let threatToPlayer = null;
    let threatDistSq = 20 * 20;
    for (let k = 0; k < enemies.length; k++) {
        const e = enemies[k];
        if (!e || !e.alive) continue;
        const dx = e.x - player.x;
        const dy = e.y - player.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < threatDistSq) {
            threatDistSq = d2;
            threatToPlayer = e;
        }
    }

    for (let i = 0; i < teammates.length; i++) {
        const tm = teammates[i];
        if (!tm.alive) continue;

        // 初始化换弹状态
        if (typeof tm.isReloading === 'undefined') tm.isReloading = false;
        if (typeof tm.reloadStart === 'undefined') tm.reloadStart = 0;

        // 选择目标：优先攻击对玩家威胁最大的敌人，其次才是离自己最近的敌人
        let target = threatToPlayer;
        if (!target || Math.random() < 0.4) {
            target = getNearestTeammateTarget(tm.x, tm.y, tm.weapon.range || 35);
        }
        tm.targetEnemy = target;

        const speed = baseSpeed * tm.speedMul;
        let desiredX, desiredY;

        if (target) {
            // 计算以玩家-目标连线为基准的侧翼位置，左右分散
            const angleToTarget = Math.atan2(target.y - player.y, target.x - player.x);
            const side = (i % 2 === 0) ? 1 : -1;
            const flankAngle = angleToTarget + side * (Math.PI / 3 + Math.sin(now / 1000 + i) * 0.2);
            const followDist = Math.min(7, (tm.weapon.range || 35) * 0.4);
            desiredX = player.x + Math.cos(flankAngle) * followDist;
            desiredY = player.y + Math.sin(flankAngle) * followDist;

            // 如果期望位置没有视线，尝试向目标靠近一点
            if (!hasLineOfSight(desiredX, desiredY, target.x, target.y)) {
                const approachAngle = Math.atan2(target.y - tm.y, target.x - tm.x);
                desiredX = tm.x + Math.cos(approachAngle) * speed * 2;
                desiredY = tm.y + Math.sin(approachAngle) * speed * 2;
            }
        } else {
            // 无目标时呈扇形护卫玩家
            const offsetAngle = (i / Math.max(1, teammates.length)) * Math.PI * 2 + player.angle + Math.PI / 4;
            desiredX = player.x + Math.cos(offsetAngle) * 3;
            desiredY = player.y + Math.sin(offsetAngle) * 3;
        }

        // 受击时向侧向闪避
        if (tm.hitFlash > 0 && target) {
            const dodgeAngle = Math.atan2(target.y - tm.y, target.x - tm.x) + (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
            desiredX = tm.x + Math.cos(dodgeAngle) * 1.5;
            desiredY = tm.y + Math.sin(dodgeAngle) * 1.5;
        }

        // 向期望位置移动
        const dx = desiredX - tm.x;
        const dy = desiredY - tm.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 0.3) {
            let moveX = (dx / dist) * speed;
            let moveY = (dy / dist) * speed;
            let moved = false;
            if (!isBlockedCircle(tm.x + moveX, tm.y, tm.radius)) {
                tm.x += moveX; moved = true;
            }
            if (!isBlockedCircle(tm.x, tm.y + moveY, tm.radius)) {
                tm.y += moveY; moved = true;
            }
            if (!moved) {
                const perpX = -moveY, perpY = moveX;
                if (!isBlockedCircle(tm.x + perpX, tm.y, tm.radius)) tm.x += perpX;
                else if (!isBlockedCircle(tm.x - perpX, tm.y, tm.radius)) tm.x -= perpX;
                if (!isBlockedCircle(tm.x, tm.y + perpY, tm.radius)) tm.y += perpY;
                else if (!isBlockedCircle(tm.x, tm.y - perpY, tm.radius)) tm.y -= perpY;
            }
        }

        // 与玩家/其他队友分离
        const separateTargets = [player].concat(teammates.filter((t, idx) => idx !== i && t.alive));
        for (const other of separateTargets) {
            const sdx = tm.x - other.x;
            const sdy = tm.y - other.y;
            const sd = Math.sqrt(sdx * sdx + sdy * sdy);
            if (sd > 0 && sd < 1.2) {
                const push = (1.2 - sd) / 1.2 * speed * 0.5;
                const px = (sdx / sd) * push;
                const py = (sdy / sd) * push;
                if (!isBlockedCircle(tm.x + px, tm.y, tm.radius)) tm.x += px;
                if (!isBlockedCircle(tm.x, tm.y + py, tm.radius)) tm.y += py;
            }
        }

        // 换弹逻辑
        if (tm.isReloading) {
            const reloadTime = tm.weapon.reloadTime || tm.weapon.fireRate * 4 || 1000;
            if (now - tm.reloadStart >= reloadTime) {
                tm.currentAmmo = tm.weapon.clipSize || 30;
                tm.isReloading = false;
            }
            if (tm.hitFlash > 0) tm.hitFlash--;
            continue;
        }

        // 射击
        if (target) {
            tm.angle = Math.atan2(target.y - tm.y, target.x - tm.x);
            const tdx = target.x - tm.x;
            const tdy = target.y - tm.y;
            const tdist = Math.sqrt(tdx * tdx + tdy * tdy);
            if (tdist <= (tm.weapon.range || 35) && hasLineOfSight(tm.x, tm.y, target.x, target.y) && now - tm.lastShot > (tm.weapon.fireRate || 300)) {
                if (tm.currentAmmo > 0) {
                    const pellets = tm.weapon.pellets || 1;
                    for (let p = 0; p < pellets; p++) {
                        const spread = pellets > 1 ? (Math.random() - 0.5) * 0.25 : 0;
                        poolPushBullet({
                            x: tm.x + Math.cos(tm.angle) * 0.5,
                            y: tm.y + Math.sin(tm.angle) * 0.5,
                            angle: tm.angle + spread,
                            speed: 1,
                            damage: tm.weapon.damage || 20,
                            range: tm.weapon.range || 30,
                            distance: 0,
                            owner: 'teammate',
                            type: getWeaponAmmoType(tm.weapon.id) || 'normal',
                            weaponType: tm.weapon.type
                        });
                    }
                    tm.currentAmmo--;
                    tm.lastShot = now;
                    alertNearbyEnemies(tm.x, tm.y, 12);
                }
                if (tm.currentAmmo <= 0) {
                    tm.isReloading = true;
                    tm.reloadStart = now;
                }
            }
        }

        if (tm.hitFlash > 0) tm.hitFlash--;
    }

    // 清理死亡队友
    for (let i = teammates.length - 1; i >= 0; i--) {
        if (!teammates[i].alive) teammates.splice(i, 1);
    }
}

function drawTeammates() {
    if (!player || teammates.length === 0) return;
    for (let i = 0; i < teammates.length; i++) {
        const tm = teammates[i];
        if (!tm.alive) continue;
        if (Math.abs(tm.x - player.x) > VIEW_RANGE_X + 2 || Math.abs(tm.y - player.y) > VIEW_RANGE_Y + 2) continue;
        const screenX = worldToScreen(tm.x, tm.y).x;
        const screenY = worldToScreen(tm.x, tm.y).y;
        ctx.save();
        ctx.translate(screenX, screenY);
        ctx.rotate(tm.angle);

        const bodyColor = '#4dabf7';
        const glowColor = '#91d5ff';
        if (tm.hitFlash > 0) ctx.fillStyle = '#ffffff';
        else ctx.fillStyle = bodyColor;
        ctx.strokeStyle = glowColor;
        ctx.lineWidth = 2;
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(PLAYER_SIZE * TILE_SIZE, 0);
        ctx.lineTo(-PLAYER_SIZE * TILE_SIZE * 0.7, -PLAYER_SIZE * TILE_SIZE * 0.7);
        ctx.lineTo(-PLAYER_SIZE * TILE_SIZE * 0.5, 0);
        ctx.lineTo(-PLAYER_SIZE * TILE_SIZE * 0.7, PLAYER_SIZE * TILE_SIZE * 0.7);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;

        // 生命条
        ctx.restore();
        const hpPercent = Math.max(0, tm.health / tm.maxHealth);
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(screenX - 14, screenY - 22, 28, 4);
        ctx.fillStyle = hpPercent > 0.5 ? '#00cc66' : '#ff4444';
        ctx.fillRect(screenX - 14, screenY - 22, 28 * hpPercent, 4);
        ctx.fillStyle = '#91d5ff';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(tm.name, screenX, screenY - 26);

        // 换弹提示
        if (tm.isReloading) {
            ctx.fillStyle = '#ffaa00';
            ctx.font = '9px Arial';
            ctx.fillText('换弹中', screenX, screenY - 36);
        }
    }
}

// ============================================================
// 队友离屏指示箭头
// ============================================================
function drawTeammateIndicators() {
    if (!player || teammates.length === 0 || !canvas || !ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const pad = 28;
    const maxHalfW = w / 2 - pad;
    const maxHalfH = h / 2 - pad;

    for (let i = 0; i < teammates.length; i++) {
        const tm = teammates[i];
        if (!tm.alive) continue;

        const pdx = (tm.x - player.x) * TILE_SIZE;
        const pdy = (tm.y - player.y) * TILE_SIZE;

        // 在视野内不显示指示器
        if (Math.abs(pdx) < maxHalfW && Math.abs(pdy) < maxHalfH) continue;

        const angle = Math.atan2(pdy, pdx);
        let t = Infinity;
        if (Math.abs(Math.cos(angle)) > 0.0001) {
            t = Math.min(t, maxHalfW / Math.abs(Math.cos(angle)));
        }
        if (Math.abs(Math.sin(angle)) > 0.0001) {
            t = Math.min(t, maxHalfH / Math.abs(Math.sin(angle)));
        }
        if (!isFinite(t) || t < 0) t = 0;

        const ex = cx + Math.cos(angle) * t;
        const ey = cy + Math.sin(angle) * t;
        const dist = Math.floor(Math.sqrt((tm.x - player.x) * (tm.x - player.x) + (tm.y - player.y) * (tm.y - player.y)));

        ctx.save();
        ctx.translate(ex, ey);
        ctx.rotate(angle);
        ctx.fillStyle = '#4dabf7';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#4dabf7';
        ctx.shadowBlur = 10;

        const size = 10;
        ctx.beginPath();
        ctx.moveTo(size, 0);
        ctx.lineTo(-size, -size * 0.7);
        ctx.lineTo(-size * 0.4, 0);
        ctx.lineTo(-size, size * 0.7);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(dist + 'm', 0, -size - 10);
        ctx.restore();
    }
}

// ============================================================
// 搜打撤实验：摸金箱子
// ============================================================
function generateLootCrates(count) {
    lootCrates = [];
    const startX = player.x;
    const startY = player.y;
    const rarityList = Object.values(LOOT_CRATE_RARITY);
    for (let i = 0; i < count; i++) {
        let x, y, attempts = 0;
        do {
            x = Math.floor(Math.random() * MAP_SIZE);
            y = Math.floor(Math.random() * MAP_SIZE);
            attempts++;
            const tile = getTile(x, y);
            const distStart = Math.abs(x - startX) + Math.abs(y - startY);
            const distExtract = Math.abs(x - extractX) + Math.abs(y - extractY);
            if (!tile || (tile.type !== 'ground' && tile.type !== 'cover')) continue;
            if (distStart < 10 || distExtract < 5) continue;
            // 避免与其他箱子过近
            let tooClose = false;
            for (const c of lootCrates) {
                if (Math.abs(c.x - x) + Math.abs(c.y - y) < 8) { tooClose = true; break; }
            }
            if (tooClose) continue;
            x += 0.5; y += 0.5;
            break;
        } while (attempts < 80);
        if (attempts >= 80) continue;
        const roll = Math.random();
        let cumulative = 0;
        let rarity = rarityList[0];
        for (const r of rarityList) {
            cumulative += r.chance;
            if (roll < cumulative) { rarity = r; break; }
        }
        lootCrates.push({
            x, y,
            state: 'closed',
            progress: 0,
            searchStart: 0,
            icon: rarity.icon,
            rarity: rarity.id
        });
    }
}

function tryInteractLootCrate() {
    if (!gameRunning || !player) return;
    if (activeCrate && activeCrate.state === 'opening') return;
    let nearest = null;
    let nearestDist = 2.5 * 2.5;
    for (const crate of lootCrates) {
        if (crate.state !== 'closed') continue;
        const dx = crate.x - player.x;
        const dy = crate.y - player.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < nearestDist) {
            nearestDist = d2;
            nearest = crate;
        }
    }
    if (nearest) {
        nearest.state = 'opening';
        nearest.searchStart = Date.now();
        activeCrate = nearest;
        alertNearbyEnemies(nearest.x, nearest.y, LOOT_CRATE_NOISE_RADIUS);
        showNotification('正在搜索物资箱...');
    }
}

function openLootCrate(crate) {
    crate.state = 'opened';
    crate.progress = 1;
    activeCrate = null;
    alertNearbyEnemies(crate.x, crate.y, LOOT_CRATE_NOISE_RADIUS * 1.2);

    const rarityInfo = LOOT_CRATE_RARITY[crate.rarity.toUpperCase()] || LOOT_CRATE_RARITY.COMMON;
    const drops = LOOT_CRATE_DROP_TABLE[crate.rarity] || LOOT_CRATE_DROP_TABLE.common;
    const lootCount = Math.max(1, Math.floor(LOOT_CRATE_LOOT_COUNT * rarityInfo.lootMul));
    const isRaid = gameMode === 'raid';

    function pickDrop() {
        const totalWeight = drops.reduce((sum, d) => sum + d.weight, 0);
        let roll = Math.random() * totalWeight;
        for (const drop of drops) {
            roll -= drop.weight;
            if (roll <= 0) return drop;
        }
        return drops[0];
    }

    // 生成容器内容（格子化的战利品）
    const contents = [];
    for (let i = 0; i < lootCount; i++) {
        const drop = pickDrop();
        switch (drop.type) {
            case 'coins': {
                const coins = drop.min + Math.floor(Math.random() * (drop.max - drop.min + 1));
                contents.push({ type: 'coins', value: coins, icon: '🪙', name: coins + ' 金币', rarity: 'common' });
                break;
            }
            case 'heal': {
                const heal = drop.min + Math.floor(Math.random() * (drop.max - drop.min + 1));
                contents.push({ type: 'heal', value: heal, icon: '❤️', name: '+' + heal + ' 生命', rarity: 'uncommon' });
                break;
            }
            case 'fullHeal': {
                contents.push({ type: 'fullHeal', value: player.maxHealth, icon: '💗', name: '生命全满', rarity: 'rare' });
                break;
            }
            case 'item': {
                const value = drop.value || 1;
                const def = getItemDef(drop.itemId) || { icon: '📦', name: drop.itemId, rarity: 'common' };
                contents.push({ type: 'item', itemId: drop.itemId, value: value, icon: def.icon, name: value + '× ' + def.name, rarity: def.rarity || 'common' });
                break;
            }
            case 'ammo': {
                const w = player.weapons[player.currentWeapon];
                if (w && !w.isMelee && w.type !== WEAPON_TYPES.MELEE) {
                    const ammoType = getWeaponAmmoType(w.id);
                    const amount = drop.min + Math.floor(Math.random() * (drop.max - drop.min + 1));
                    const ammoNameMap = { normal: '普通弹', ap: '穿甲弹', exp: '爆裂弹', fire: '燃烧弹' };
                    contents.push({ type: 'ammo', ammoType: ammoType, value: amount, icon: '🔫', name: '+' + amount + ' ' + (ammoNameMap[ammoType] || ammoType) + '弹药', rarity: 'common' });
                } else {
                    contents.push({ type: 'item', itemId: 'grenade', value: 1, icon: '💣', name: '1× 手雷', rarity: 'rare' });
                }
                break;
            }
            case 'armor': {
                contents.push({ type: 'armor', value: drop.value || 30, icon: '🦺', name: '+' + (drop.value || 30) + ' 护甲/生命', rarity: 'uncommon' });
                break;
            }
            case 'mod': {
                const modList = Object.keys(MODIFICATIONS || {});
                if (modList.length > 0) {
                    const modId = modList[Math.floor(Math.random() * modList.length)];
                    const mod = MODIFICATIONS[modId];
                    contents.push({ type: 'mod', modId: modId, icon: '🔧', name: '1× ' + (mod ? mod.name : modId), rarity: 'epic' });
                } else {
                    contents.push({ type: 'coins', value: 100, icon: '🪙', name: '100 金币', rarity: 'common' });
                }
                break;
            }
            case 'skin': {
                const skinTemplates = SKIN_TEMPLATES.filter(s => s.id !== 'default' && s.price > 0);
                if (skinTemplates.length > 0) {
                    const skin = skinTemplates[Math.floor(Math.random() * skinTemplates.length)];
                    const skinId = 'skin_' + skin.id;
                    if (!playerMods.ownedSkins.includes(skinId)) {
                        contents.push({ type: 'skin', skinId: skinId, icon: '🎨', name: '皮肤碎片：' + skin.name, rarity: 'legendary' });
                    } else {
                        contents.push({ type: 'coins', value: 50, icon: '🪙', name: '50 金币（重复皮肤）', rarity: 'common' });
                    }
                } else {
                    contents.push({ type: 'coins', value: 80, icon: '🪙', name: '80 金币', rarity: 'common' });
                }
                break;
            }
            case 'sellable': {
                const keys = Object.keys(SELLABLE_TYPES);
                const sid = keys[Math.floor(Math.random() * keys.length)];
                const def = SELLABLE_TYPES[sid];
                contents.push({ type: 'sellable', sellableId: sid, value: 1, icon: def.icon, name: def.name, rarity: def.rarity });
                break;
            }
            default:
                contents.push({ type: 'coins', value: 10, icon: '🪙', name: '10 金币', rarity: 'common' });
        }
    }
    crate.contents = contents;

    if (isRaid) {
        // 三角洲式：弹出容器格子面板，由玩家逐格拾取到局内背包
        showNotification(`${rarityInfo.icon} ${rarityInfo.label}物资箱已开启，点击格子拾取战利品`, 'success');
        openContainerPanel(crate);
    } else {
        // 非 raid 模式：即时结算
        applyCrateContents(contents, false);
        showNotification(`${rarityInfo.icon} ${rarityInfo.label}物资箱：${contents.map(c => c.name).join(' / ')}`, 'success');
    }
    updateHUD();
}

// 把容器内容结算到玩家（非 raid 模式即时结算，保持原有 inventory 行为）
function applyCrateContents(contents) {
    for (const c of contents) {
        switch (c.type) {
            case 'coins': playerData.coins += c.value || 0; break;
            case 'heal': player.health = Math.min(player.maxHealth, player.health + (c.value || 0)); break;
            case 'fullHeal': player.health = player.maxHealth; break;
            case 'item': {
                // 库存键名与战斗 useItem 保持一致（medkit/grenade 用单数）
                const key = c.itemId;
                playerData.inventory[key] = (playerData.inventory[key] || 0) + (c.value || 1);
                break;
            }
            case 'ammo': ammoInventory[c.ammoType] = (ammoInventory[c.ammoType] || 0) + (c.value || 0); break;
            case 'armor': player.health = Math.min(player.maxHealth, player.health + (c.value || 0)); break;
            case 'mod': playerMods.ownedMods[c.modId] = (playerMods.ownedMods[c.modId] || 0) + 1; break;
            case 'skin': if (!playerMods.ownedSkins.includes(c.skinId)) playerMods.ownedSkins.push(c.skinId); break;
            case 'sellable': {
                playerData.sellItems = playerData.sellItems || [];
                playerData.sellItems.push({ id: c.sellableId, value: c.value || 1 });
                break;
            }
        }
    }
}

// ============================================================
// 搜打撤：容器格子面板（三角洲式逐格拾取）
// ============================================================
let activeContainer = null;

function openContainerPanel(crate) {
    activeContainer = crate;
    const panel = document.getElementById('containerPanel');
    if (!panel) return;
    panel.classList.add('active');
    panel.style.display = 'block';
    renderContainerPanel();
}

function closeContainerPanel() {
    activeContainer = null;
    const panel = document.getElementById('containerPanel');
    if (panel) { panel.classList.remove('active'); panel.style.display = 'none'; }
}

function renderContainerPanel() {
    const grid = document.getElementById('containerGrid');
    const capEl = document.getElementById('containerCapacity');
    if (!grid) return;
    const crate = activeContainer;
    if (!crate || !Array.isArray(crate.contents)) { if (grid) grid.innerHTML = ''; return; }

    const bp = getRaidBackpack();
    if (capEl) capEl.textContent = `局内背包 ${raidBackpackUsed()}/${bp.capacity}`;

    grid.innerHTML = '';
    // 容器使用 6 列网格，内容按序铺格
    const cols = 6;
    const cells = [];
    crate.contents.forEach((c, idx) => {
        if (c && c.taken) return; // 已拾取
        cells.push({ idx, content: c });
    });
    const totalCells = Math.max(cells.length, 12);
    const rarityClass = { common: '', uncommon: 'r-uncommon', rare: 'r-rare', epic: 'r-epic', legendary: 'r-legendary' };
    for (let i = 0; i < totalCells; i++) {
        const cell = document.createElement('div');
        cell.className = 'grid-cell';
        const data = cells[i];
        if (data) {
            const c = data.content;
            cell.classList.add('filled');
            const rc = rarityClass[c.rarity] || '';
            if (rc) cell.classList.add(rc);
            cell.innerHTML = `<span class="cell-icon">${c.icon || '📦'}</span><span class="cell-name">${c.name}</span>`;
            cell.title = c.name + '（点击拾取）';
            cell.onclick = function () { pickFromContainer(data.idx); };
        }
        grid.appendChild(cell);
    }
    // 渲染局内背包
    renderRaidBackpackGrid();
}

function pickFromContainer(index) {
    const crate = activeContainer;
    if (!crate || !crate.contents[index]) return;
    const c = crate.contents[index];
    if (c.taken) return;
    const bp = getRaidBackpack();
    if (raidBackpackUsed() >= bp.capacity) {
        showNotification('局内背包已满，无法拾取！（撤离带回更多空间）', 'error');
        return;
    }
    // 存入局内背包
    const slot = { itemId: c.itemId || ('_ct_' + c.type), count: c.value || 1, meta: c, taken: true };
    bp.items.push(slot);
    if (c.itemId) {
        raidLoot.push({ type: c.type === 'item' ? 'item' : c.type, itemId: c.itemId, value: c.value || 1, _slot: slot });
    } else {
        raidLoot.push({ type: c.type, value: c.value, ammoType: c.ammoType, modId: c.modId, skinId: c.skinId, _slot: slot });
    }
    c.taken = true;
    showNotification('拾取：' + c.name, 'success');
    renderContainerPanel();
}

function renderRaidBackpackGrid() {
    const grid = document.getElementById('raidBackpackGrid');
    if (!grid) return;
    const bp = getRaidBackpack();
    grid.innerHTML = '';
    const cols = RAID_BACKPACK_COLS;
    const totalCells = bp.capacity;
    const rarityClass = { common: '', uncommon: 'r-uncommon', rare: 'r-rare', epic: 'r-epic', legendary: 'r-legendary' };
    for (let i = 0; i < totalCells; i++) {
        const cell = document.createElement('div');
        cell.className = 'grid-cell';
        const slot = bp.items[i];
        if (slot) {
            cell.classList.add('filled');
            const meta = slot.meta || {};
            const rc = rarityClass[meta.rarity] || '';
            if (rc) cell.classList.add(rc);
            const icon = meta.icon || (slot.itemId && getItemDef(slot.itemId) ? getItemDef(slot.itemId).icon : '📦');
            const name = meta.name || (slot.itemId ? (slot.count + '× ' + getItemDef(slot.itemId).name) : '物品');
            cell.innerHTML = `<span class="cell-icon">${icon}</span><span class="cell-name">${name}</span>`;
            cell.title = name + '（点击丢弃）';
            const idx = i;
            cell.onclick = function () { dropFromRaidBackpack(idx); };
        }
        grid.appendChild(cell);
    }
}

function dropFromRaidBackpack(index) {
    const bp = getRaidBackpack();
    if (!bp.items[index]) return;
    const slot = bp.items[index];
    // 从 raidLoot 中移除对应记录
    const mi = raidLoot.findIndex(r => r._slot === slot);
    if (mi !== -1) raidLoot.splice(mi, 1);
    bp.items.splice(index, 1);
    showNotification('丢弃：' + (slot.meta ? slot.meta.name : '物品'), 'warn');
    renderContainerPanel();
}

// 战斗中局内背包面板开关
function toggleRaidBackpackPanel() {
    const panel = document.getElementById('raidBackpackPanel');
    if (!panel) return;
    const open = panel.style.display === 'block';
    if (open) {
        panel.style.display = 'none';
    } else {
        panel.style.display = 'block';
        renderRaidBackpackPanel();
    }
}

function toggleMobileBackpack() {
    // raid 模式：显示局内战利品背包
    if (gameMode === 'raid' && raidBackpack && raidBackpack.items.length >= 0) {
        toggleRaidBackpackPanel();
        return;
    }
    // 普通任务/非 raid：显示主库存概览面板
    const view = document.getElementById('mobileBackpackView');
    if (!view) { try { toggleRaidBackpackPanel(); } catch (e) {} return; }
    const open = view.style.display === 'block';
    if (open) { view.style.display = 'none'; return; }
    renderMobileBackpackView();
    view.style.display = 'block';
}

function renderMobileBackpackView() {
    const view = document.getElementById('mobileBackpackView');
    if (!view) return;
    const inv = (playerData && playerData.inventory) || {};
    const rows = [];
    rows.push(['💰 金币', (playerData.coins || 0)]);
    rows.push(['🩹 医疗包', inv.medkits || 0]);
    rows.push(['💣 手雷', inv.grenades || 0]);
    rows.push(['⚡ 加速针', inv.speedBoost || 0]);
    rows.push(['🔋 弹药箱', inv.ammoBox || 0]);
    // 主武器与配件
    const wlist = (playerData.weapons && playerData.weapons.map(w => w.id)) || [];
    const mods = (playerMods && playerMods.ownedMods) || {};
    let html = '<div class="mbv-title">🎒 我的库存</div>';
    html += '<div class="mbv-sec">装备武器：</div>';
    html += wlist.length ? '<div class="mbv-row">' + wlist.map(id => {
        const w = WEAPONS[id]; return w ? (w.name + (w.mods && w.mods.length ? '（' + w.mods.length + '配件）' : '')) : id;
    }).join('、') + '</div>' : '<div class="mbv-row">无</div>';
    html += '<div class="mbv-sec">持有配件：</div>';
    const modNames = Object.keys(mods).filter(k => mods[k] > 0).map(k => (ATTACHMENTS[k] ? ATTACHMENTS[k].name : k) + '×' + mods[k]);
    html += '<div class="mbv-row">' + (modNames.length ? modNames.join('、') : '无') + '</div>';
    html += '<div class="mbv-sec">消耗品：</div>';
    html += rows.map(r => '<div class="mbv-row"><span>' + r[0] + '</span><b>' + r[1] + '</b></div>').join('');
    html += '<div class="mbv-close" onclick="document.getElementById(\'mobileBackpackView\').style.display=\'none\'">✕ 关闭</div>';
    view.innerHTML = html;
}

function renderRaidBackpackPanel() {
    const grid = document.getElementById('raidBackpackGrid2');
    const capEl = document.getElementById('raidBackpackCap2');
    if (!grid) return;
    const bp = getRaidBackpack();
    if (capEl) capEl.textContent = raidBackpackUsed() + '/' + bp.capacity;
    grid.innerHTML = '';
    const cols = RAID_BACKPACK_COLS;
    const rarityClass = { common: '', uncommon: 'r-uncommon', rare: 'r-rare', epic: 'r-epic', legendary: 'r-legendary' };
    for (let i = 0; i < bp.capacity; i++) {
        const cell = document.createElement('div');
        cell.className = 'grid-cell';
        const slot = bp.items[i];
        if (slot) {
            cell.classList.add('filled');
            const meta = slot.meta || {};
            const rc = rarityClass[meta.rarity] || '';
            if (rc) cell.classList.add(rc);
            const icon = meta.icon || (slot.itemId && getItemDef(slot.itemId) ? getItemDef(slot.itemId).icon : '📦');
            const name = meta.name || (slot.itemId ? (slot.count + '× ' + getItemDef(slot.itemId).name) : '物品');
            cell.innerHTML = `<span class="cell-icon">${icon}</span><span class="cell-name">${name}</span>`;
            cell.title = name;
        }
        grid.appendChild(cell);
    }
}

// 更新战斗中局内背包按钮徽标
let _raidBadgeBtn = null, _raidBadgeEl = null, _raidBadgeLast = -1;
function updateRaidBackpackBadge() {
    if (!_raidBadgeBtn) {
        _raidBadgeBtn = document.getElementById('raidBackpackBtn');
        _raidBadgeEl = document.getElementById('raidBackpackBadge');
    }
    const btn = _raidBadgeBtn;
    if (!btn) return;
    if (gameMode === 'raid') {
        btn.style.display = '';
        const used = raidBackpackUsed();
        if (_raidBadgeEl && used !== _raidBadgeLast) {
            _raidBadgeEl.textContent = used;
            _raidBadgeLast = used;
        }
    } else {
        btn.style.display = 'none';
        _raidBadgeLast = -1;
    }
}

// ============================================================
// 搜打撤：战利品结算
// ============================================================
function applyRaidLoot() {
    if (!raidLoot || raidLoot.length === 0) return;
    const summary = { coins: 0, items: [], mods: 0, skins: 0 };
    for (const loot of raidLoot) {
        switch (loot.type) {
            case 'coins':
                playerData.coins += loot.value || 0;
                summary.coins += loot.value || 0;
                break;
            case 'item':
                if (loot.itemId) {
                    BackpackManager.addItem(loot.itemId, loot.value || 1);
                    const def = getItemDef(loot.itemId);
                    summary.items.push(`${loot.value || 1} ${def ? def.name : loot.itemId}`);
                }
                break;
            case 'ammo':
                if (loot.ammoType) {
                    ammoInventory[loot.ammoType] = (ammoInventory[loot.ammoType] || 0) + (loot.value || 0);
                    summary.items.push(`+${loot.value} 弹药`);
                }
                break;
            case 'heal':
                player.health = Math.min(player.maxHealth, player.health + (loot.value || 0));
                break;
            case 'fullHeal':
                player.health = player.maxHealth;
                break;
            case 'armor':
                player.health = Math.min(player.maxHealth, player.health + (loot.value || 0));
                break;
            case 'mod':
                if (loot.modId) {
                    playerMods.ownedMods[loot.modId] = (playerMods.ownedMods[loot.modId] || 0) + 1;
                    summary.mods++;
                }
                break;
            case 'skin':
                if (loot.skinId && !playerMods.ownedSkins.includes(loot.skinId)) {
                    playerMods.ownedSkins.push(loot.skinId);
                    summary.skins++;
                }
                break;
            case 'sellable':
                if (loot.sellableId) {
                    playerData.sellItems = playerData.sellItems || [];
                    playerData.sellItems.push({ id: loot.sellableId, value: loot.value || 1 });
                    summary.items.push(getSellableDef(loot.sellableId).name);
                }
                break;
        }
    }
    raidLoot = [];
    savePlayerData();
    savePlayerMods();

    const parts = [];
    if (summary.coins > 0) parts.push(`金币 +${summary.coins}`);
    if (summary.items.length > 0) parts.push(summary.items.join('、'));
    if (summary.mods > 0) parts.push(`配件 +${summary.mods}`);
    if (summary.skins > 0) parts.push(`皮肤 +${summary.skins}`);
    if (parts.length > 0) {
        showNotification(`🎒 成功带回战利品：${parts.join(' / ')}`, 'success');
    }
}

function itemName(id) {
    const map = { ammoBox: '弹药箱', medkit: '医疗包', grenade: '手雷', speedBoost: '肾上激素' };
    return map[id] || id;
}

function updateLootCrates(now) {
    const prompt = document.getElementById('lootPrompt');
    const fill = document.getElementById('lootProgressFill');
    let nearClosed = null;
    let nearestDist = 2.5 * 2.5;
    for (const crate of lootCrates) {
        if (crate.state !== 'closed') continue;
        const dx = crate.x - player.x;
        const dy = crate.y - player.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < nearestDist) {
            nearestDist = d2;
            nearClosed = crate;
        }
    }

    if (nearClosed && (!activeCrate || activeCrate.state !== 'opening')) {
        if (prompt) prompt.classList.add('active');
        if (fill) fill.style.width = '0%';
    } else {
        if (prompt) prompt.classList.remove('active');
    }

    if (activeCrate && activeCrate.state === 'opening') {
        const dx = activeCrate.x - player.x;
        const dy = activeCrate.y - player.y;
        if (dx * dx + dy * dy > 3 * 3) {
            activeCrate.state = 'closed';
            activeCrate.searchStart = 0;
            activeCrate = null;
            showNotification('已远离物资箱，搜索取消');
            if (prompt) prompt.classList.remove('active');
            return;
        }
        const elapsed = now - activeCrate.searchStart;
        activeCrate.progress = Math.min(1, elapsed / LOOT_CRATE_SEARCH_TIME);
        if (fill) fill.style.width = (activeCrate.progress * 100) + '%';
        if (prompt) prompt.classList.add('active');
        if (activeCrate.progress >= 1) {
            openLootCrate(activeCrate);
            if (fill) fill.style.width = '0%';
        }
    }
}

function drawLootCrates() {
    if (!player || lootCrates.length === 0) return;
    const now = Date.now();
    for (let i = 0; i < lootCrates.length; i++) {
        const crate = lootCrates[i];
        if (crate.state === 'opened') continue;
        if (Math.abs(crate.x - player.x) > VIEW_RANGE_X + 2 || Math.abs(crate.y - player.y) > VIEW_RANGE_Y + 2) continue;
        const screenX = worldToScreen(crate.x, crate.y).x;
        const screenY = worldToScreen(crate.x, crate.y).y;
        const rarityInfo = LOOT_CRATE_RARITY[crate.rarity.toUpperCase()] || LOOT_CRATE_RARITY.COMMON;
        const pulse = crate.rarity === 'legendary' ? (Math.sin(now / 250) + 1) * 0.5 :
                      crate.rarity === 'rare' ? (Math.sin(now / 400) + 1) * 0.5 : 0;
        const glowBlur = 10 + pulse * 12;

        ctx.save();
        ctx.fillStyle = rarityInfo.color;
        ctx.shadowColor = rarityInfo.glow;
        ctx.shadowBlur = glowBlur;
        ctx.fillRect(screenX - 10, screenY - 10, 20, 20);
        ctx.strokeStyle = rarityInfo.glow;
        ctx.lineWidth = crate.rarity === 'legendary' ? 2 : 1;
        ctx.strokeRect(screenX - 10, screenY - 10, 20, 20);
        ctx.shadowBlur = 0;

        // 传说箱子额外旋转星芒装饰
        if (crate.rarity === 'legendary') {
            ctx.strokeStyle = rarityInfo.glow;
            ctx.lineWidth = 1.5;
            const rot = now / 800;
            for (let a = 0; a < 4; a++) {
                const angle = rot + a * Math.PI / 2;
                ctx.beginPath();
                ctx.moveTo(screenX + Math.cos(angle) * 14, screenY + Math.sin(angle) * 14);
                ctx.lineTo(screenX + Math.cos(angle) * 18, screenY + Math.sin(angle) * 18);
                ctx.stroke();
            }
        }

        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(crate.icon, screenX, screenY);
        ctx.restore();
    }
}

// ============================================================
// Round 3：地图事件与 AI 埋伏
// ============================================================
const MAP_EVENT_TYPES = [
    { id: 'patrol', weight: 40 },
    { id: 'ambush', weight: 35 },
    { id: 'supply_drop', weight: 25 }
];
const MAP_EVENT_INTERVAL_MIN = 20000;
const MAP_EVENT_INTERVAL_MAX = 45000;

function initMapEvents() {
    mapEvents = [];
    nextMapEventAt = Date.now() + 15000 + Math.random() * 10000; // 开局 15-25s 触发第一个事件
}

function updateMapEvents(now) {
    if (now < nextMapEventAt) return;
    nextMapEventAt = now + MAP_EVENT_INTERVAL_MIN + Math.random() * (MAP_EVENT_INTERVAL_MAX - MAP_EVENT_INTERVAL_MIN);

    const totalWeight = MAP_EVENT_TYPES.reduce((sum, t) => sum + t.weight, 0);
    let roll = Math.random() * totalWeight;
    let selected = MAP_EVENT_TYPES[0];
    for (const t of MAP_EVENT_TYPES) {
        roll -= t.weight;
        if (roll <= 0) { selected = t; break; }
    }
    triggerMapEvent(selected.id, now);
}

function spawnEventEnemy(x, y, target) {
    const enemyHealth = gameParams.ENEMY.health || 80;
    const enemyFireRate = gameParams.ENEMY.fireRate || 2000;
    const difficultyHealthMul = settings.difficulty === 'topsecret' ? 1.6 : (settings.difficulty === 'confidential' ? 1.3 : (settings.difficulty === 'advanced' ? 1.0 : 0.8));
    const now = Date.now();
    const e = {
        x, y,
        health: enemyHealth * difficultyHealthMul,
        maxHealth: enemyHealth * difficultyHealthMul,
        angle: Math.random() * Math.PI * 2,
        lastShot: 0,
        fireRate: enemyFireRate,
        isBoss: false,
        alive: true,
        path: null,
        pathIndex: 0,
        lastPathUpdate: 0,
        pathUpdateInterval: 500,
        aiState: 'chase',
        investigateTarget: target ? { x: target.x, y: target.y, until: now + 60000 } : null
    };
    enemies.push(e);
    return e;
}

function pickRandomGroundPos(minDistFromPlayer, maxDistFromPlayer) {
    const px = player.x;
    const py = player.y;
    for (let i = 0; i < 80; i++) {
        const x = Math.floor(Math.random() * MAP_SIZE) + 0.5;
        const y = Math.floor(Math.random() * MAP_SIZE) + 0.5;
        const tile = getTile(Math.floor(x), Math.floor(y));
        if (!tile || (tile.type !== 'ground' && tile.type !== 'cover')) continue;
        const d = Math.sqrt((x - px) * (x - px) + (y - py) * (y - py));
        if (d < minDistFromPlayer) continue;
        if (maxDistFromPlayer > 0 && d > maxDistFromPlayer) continue;
        return { x, y };
    }
    return null;
}

function triggerMapEvent(type, now) {
    if (type === 'patrol') {
        const count = 3 + Math.floor(Math.random() * 2); // 3-4
        const side = Math.floor(Math.random() * 4);
        for (let i = 0; i < count; i++) {
            let x, y;
            const offset = Math.random() * MAP_SIZE;
            switch (side) {
                case 0: x = 2 + Math.random() * 4; y = offset; break;
                case 1: x = MAP_SIZE - 2 - Math.random() * 4; y = offset; break;
                case 2: x = offset; y = 2 + Math.random() * 4; break;
                default: x = offset; y = MAP_SIZE - 2 - Math.random() * 4; break;
            }
            if (isBlocked(x, y)) continue;
            spawnEventEnemy(x, y, player);
        }
        showNotification('⚠️ 巡逻队接近！', 'warning');
        mapEvents.push({ type: 'patrol', x: player.x, y: player.y, until: now + 5000 });
    } else if (type === 'ambush') {
        const count = 4 + Math.floor(Math.random() * 3); // 4-6
        const baseAngle = Math.random() * Math.PI * 2;
        for (let i = 0; i < count; i++) {
            const angle = baseAngle + (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
            const dist = 12 + Math.random() * 8;
            let x = player.x + Math.cos(angle) * dist;
            let y = player.y + Math.sin(angle) * dist;
            x = Math.max(2, Math.min(MAP_SIZE - 2, x));
            y = Math.max(2, Math.min(MAP_SIZE - 2, y));
            if (isBlocked(x, y)) {
                const alt = pickRandomGroundPos(8, 20);
                if (alt) { x = alt.x; y = alt.y; }
            }
            spawnEventEnemy(x, y, player);
        }
        showNotification('🚨 遭遇埋伏！', 'error');
        mapEvents.push({ type: 'ambush', x: player.x, y: player.y, until: now + 6000 });
    } else if (type === 'supply_drop') {
        const pos = pickRandomGroundPos(15, 60);
        if (pos) {
            lootCrates.push({
                x: pos.x,
                y: pos.y,
                state: 'closed',
                progress: 0,
                searchStart: 0,
                icon: '📦',
                rarity: 'legendary',
                isSupplyDrop: true
            });
            alertNearbyEnemies(pos.x, pos.y, 30);
            showNotification('🪂 空投补给已降临！', 'success');
            mapEvents.push({ type: 'supply_drop', x: pos.x, y: pos.y, until: now + 60000 });
        }
    }
}

function drawMapEvents() {
    if (!player || mapEvents.length === 0) return;
    const now = Date.now();
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    ctx.save();
    for (let i = mapEvents.length - 1; i >= 0; i--) {
        const ev = mapEvents[i];
        if (now > ev.until) { mapEvents.splice(i, 1); continue; }

        const sx = cx + (ev.x - player.x) * TILE_SIZE;
        const sy = cy + (ev.y - player.y) * TILE_SIZE;
        const t = (ev.until - now) / 6000;
        const alpha = Math.max(0, Math.min(1, t));

        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(sx, sy, 18 + Math.sin(now / 200) * 3, 0, Math.PI * 2);
        ctx.strokeStyle = ev.type === 'ambush' ? '#ff4444' : (ev.type === 'patrol' ? '#ffaa00' : '#44ff44');
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        const icon = ev.type === 'ambush' ? '🚨' : (ev.type === 'patrol' ? '⚠️' : '🪂');
        ctx.fillText(icon, sx, sy);
    }
    ctx.restore();
}

// ============================================================
// 搜打撤实验：AI 增强辅助
// ============================================================
function getNearestEnemyThreat(enemy) {
    let best = player;
    let bestDist = (player.x - enemy.x) * (player.x - enemy.x) + (player.y - enemy.y) * (player.y - enemy.y);
    for (let i = 0; i < teammates.length; i++) {
        const tm = teammates[i];
        if (!tm || !tm.alive) continue;
        const d2 = (tm.x - enemy.x) * (tm.x - enemy.x) + (tm.y - enemy.y) * (tm.y - enemy.y);
        if (d2 < bestDist) {
            bestDist = d2;
            best = tm;
        }
    }
    return best;
}

function alertNearbyEnemies(x, y, radius) {
    if (!enemies || enemies.length === 0) return;
    const r2 = radius * radius;
    const now = Date.now();
    for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (!e || !e.alive) continue;
        const dx = e.x - x;
        const dy = e.y - y;
        if (dx * dx + dy * dy < r2) {
            e.investigateTarget = { x, y, until: now + 4000 + Math.random() * 2000 };
        }
    }
}

function findNearestCover(x, y, fromX, fromY, radius) {
    let best = null;
    let bestScore = Infinity;
    const r = Math.ceil(radius);
    for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
            const tx = Math.floor(x + dx);
            const ty = Math.floor(y + dy);
            if (tx < 0 || tx >= MAP_SIZE || ty < 0 || ty >= MAP_SIZE) continue;
            const tile = getTile(tx, ty);
            if (tile.type !== 'obstacle' && tile.type !== 'building') continue;
            // 需要该掩体能够遮挡来自 fromX,fromY 的视线
            if (hasLineOfSight(fromX, fromY, tx + 0.5, ty + 0.5)) continue;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < bestScore) {
                bestScore = d;
                best = { x: tx + 0.5, y: ty + 0.5 };
            }
        }
    }
    return best;
}

// ============================================================
// 全局UI函数挂载到window（确保HTML onclick能访问）
// ============================================================
// 好友面板占位（UI 挂载列表引用，避免 “Missing functions: showFriends” 警告）
// 当前版本未实装好友系统，点击时给出友好提示。
function showFriends() {
    try {
        showToast('好友系统尚未开放');
    } catch (e) {
        alert('好友系统尚未开放');
    }
}
window.showFriends = showFriends;

// 全局错误兜底：任何未捕获异常仅记录，避免整页白屏卡死
window.onerror = function(message, source, lineno, colno, error) {
    if (!window.__globalErrLogged) {
        console.error('[GLOBAL] 未捕获异常（已隔离，不影响游戏）:', message, 'at', source + ':' + lineno);
        window.__globalErrLogged = true;
    }
    return true; // 阻止默认处理（避免白屏）
};
window.addEventListener('unhandledrejection', function(e) {
    if (!window.__rejectErrLogged) {
        console.error('[GLOBAL] 未处理的 Promise 拒绝（已隔离）:', e.reason);
        window.__rejectErrLogged = true;
    }
});

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
        'showRedeemCodePanel', 'closeRedeemCodePanel', 'submitRedeemCode', 'redeemCode',
        'selectMissionById', 'completeMission', 'updateMissionProgress', 'finishCurrentMission', 'loadMissions', 'updateReadyRoomMission'
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
    const verEl = document.querySelector('.menu-banner-version');
    if (verEl) verEl.textContent = 'v' + GAME_VERSION;
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
// 剧情状态与分线系统
// ====================================================================
const STORY_STATE_KEY = 'deathTrench_story_state';

let storyState = {
    chapter: 1,
    branch: 'neutral',
    flags: {},
    completedDialogues: [],
    seenBriefings: [],
    affinity: {}
};

function loadStoryState() {
    try {
        const raw = localStorage.getItem(STORY_STATE_KEY);
        if (raw) Object.assign(storyState, JSON.parse(raw));
    } catch (e) { console.warn('[Story] load failed', e); }
}

function saveStoryState() {
    try {
        localStorage.setItem(STORY_STATE_KEY, JSON.stringify(storyState));
    } catch (e) {}
}

function setStoryFlag(key, value) {
    storyState.flags[key] = value;
    saveStoryState();
}

function hasStoryFlag(key) {
    return !!storyState.flags[key];
}

function setStoryBranch(branch) {
    storyState.branch = branch;
    saveStoryState();
}

function advanceChapter() {
    storyState.chapter++;
    saveStoryState();
}

function markDialogueCompleted(dialogueId) {
    if (!storyState.completedDialogues.includes(dialogueId)) {
        storyState.completedDialogues.push(dialogueId);
        saveStoryState();
    }
}

function isDialogueCompleted(dialogueId) {
    return storyState.completedDialogues.includes(dialogueId);
}

function markBriefingSeen(missionId) {
    if (!storyState.seenBriefings.includes(missionId)) {
        storyState.seenBriefings.push(missionId);
        saveStoryState();
    }
}

function resetStoryState() {
    storyState = { chapter: 1, branch: 'neutral', flags: {}, completedDialogues: [], seenBriefings: [], affinity: {} };
    saveStoryState();
}

// NPC 好感度系统：与主要 NPC 互动累计好感，影响分支对话与奖励
function getNpcAffinity(npc) {
    if (!storyState.affinity) storyState.affinity = {};
    return storyState.affinity[npc] || 0;
}
function addNpcAffinity(npc, delta) {
    if (!storyState.affinity) storyState.affinity = {};
    storyState.affinity[npc] = (storyState.affinity[npc] || 0) + delta;
    if (storyState.affinity[npc] > 100) storyState.affinity[npc] = 100;
    if (storyState.affinity[npc] < -100) storyState.affinity[npc] = -100;
    saveStoryState();
}
function getAffinityTier(npc) {
    const v = getNpcAffinity(npc);
    if (v >= 60) return '信赖';
    if (v >= 25) return '友好';
    if (v > -25) return '中立';
    if (v > -60) return '戒备';
    return '敌对';
}

// 结局回顾弹窗
const ENDING_INFO = {
    loyalty: { title: '结局 · 忠诚的代价', branch: '主线：忠诚', story: '你选择了任务至上。节点被摧毁，黑潮指挥链断裂，但三具友军尸体永远留在了废墟里。战争结束了，代价却刻进了每个人心里。' },
    mercy: { title: '结局 · 迟到的胜利', branch: '主线：仁慈', story: '你优先救出了阿雅。节点最终被炸毁，普莱斯说「迟到的胜利也是胜利」。至少今天，有一个人因为你活了下来。' },
    truth: { title: '结局 · 谎言到此为止', branch: '主线：真相', story: '你潜入核心节点，揭开了普莱斯旧频道控制失踪人员的真相。谎言被上传总部，普莱斯被停职。战争未止，但黑暗被照亮。' },
    neutral: { title: '战役结束', branch: '主线：未分支', story: '你走完了死亡战壕的全部战役。黑潮军团的阴影正在退去，而你的选择将决定断壁城的未来。' }
};

function showEndingScreen() {
    const modal = document.getElementById('endingScreenModal');
    if (!modal) return;
    const branch = storyState.branch || 'neutral';
    const info = ENDING_INFO[branch] || ENDING_INFO.neutral;
    const t = document.getElementById('endingTitle');
    const b = document.getElementById('endingBranch');
    const s = document.getElementById('endingStory');
    const h = document.getElementById('endingHint');
    if (t) t.textContent = info.title;
    if (b) b.textContent = info.branch + ' · 第 ' + (storyState.chapter || 1) + ' 章';
    if (s) s.textContent = info.story;
    if (h) h.textContent = '一封战地邮件已送达收件箱，可前往邮件界面查看。点击「重置剧情」可重新体验不同分支。';
    modal.style.display = 'flex';
}

function closeEndingScreen() {
    const modal = document.getElementById('endingScreenModal');
    if (modal) modal.style.display = 'none';
}

window.showEndingScreen = showEndingScreen;
window.closeEndingScreen = closeEndingScreen;


// NPC 对话数据
const DIALOGUES = {
    'intro_price': {
        speaker: '指挥官 · 普莱斯',
        avatar: '🎖️',
        avatarImg: 'assets/art/npc-price.png',
        tag: 'Death Trench 特遣队',
        lines: [
            { text: '欢迎来到死亡战壕，新兵。这里没有军衔，只有活人和死人。' },
            { text: '黑潮军团占领了东部资源带，我们的任务很简单：打乱他们的节奏，然后把情报带回来。' },
            { text: '第一课，我亲自教你。准备好了吗？', choices: [
                { text: '准备好了，长官。服从命令。', action: () => { setStoryBranch('loyalty'); setStoryFlag('intro_ready'); addNpcAffinity('price', 15); advanceChapter(); setTimeout(() => { if (!isDialogueCompleted('intro_ghost')) showDialogue('intro_ghost'); }, 700); } },
                { text: '我想先知道黑潮到底在做什么。', action: () => { setStoryBranch('truth'); setStoryFlag('intro_ready'); addNpcAffinity('ghost', 15); advanceChapter(); setTimeout(() => { if (!isDialogueCompleted('intro_ghost')) showDialogue('intro_ghost'); }, 700); } },
                { text: '只要能少死人，让我做什么都行。', action: () => { setStoryBranch('mercy'); setStoryFlag('intro_ready'); addNpcAffinity('eileen', 15); advanceChapter(); setTimeout(() => { if (!isDialogueCompleted('intro_ghost')) showDialogue('intro_ghost'); }, 700); } }
            ]}
        ]
    },
    'intro_ghost': {
        speaker: '幽灵',
        avatar: '👻',
        avatarImg: 'assets/art/npc-ghost.png',
        tag: '战术支援',
        lines: [
            { text: '规则很简单：不要相信任何人，包括我。但你可以相信数据。' },
            { text: '普通任务模式弹药无限，完成目标即可；搜打撤模式自带装备，活着撤离才能带走战利品。' },
            { text: '去战备中心吧，普莱斯在等你。', choices: [
                { text: '明白。', action: () => { setStoryFlag('intro_ready'); advanceChapter(); } }
            ]}
        ]
    },
    'city_choice': {
        speaker: '指挥官 · 普莱斯',
        avatar: '🎖️',
        avatarImg: 'assets/art/npc-price.png',
        tag: 'Death Trench 特遣队',
        lines: [
            { text: '断壁城地下有一座黑潮军火库。上级想让我们直接炸平它。' },
            { text: '但城里还有平民。你选：快速完成任务，还是优先搜救？', choices: [
                { text: '炸掉军火库，任务第一。', action: () => { setStoryFlag('city_destroyed'); setStoryBranch('loyalty'); } },
                { text: '先确认平民撤离。', action: () => { setStoryFlag('city_saved'); setStoryBranch('mercy'); } }
            ]}
        ]
    },
    'ghost_warning': {
        speaker: '幽灵',
        avatar: '👻',
        avatarImg: 'assets/art/npc-ghost.png',
        tag: '战术支援',
        lines: [
            { text: '我截获了一段录音。普莱斯一年前和黑潮有过接触。' },
            { text: '不要问他。先完成任务，证据越多，越能搞清楚他站在哪一边。', choices: [
                { text: '我会自己查。', action: () => { setStoryFlag('ghost_trust'); setStoryBranch('truth'); } }
            ]}
        ]
    },
    'ch4_truth_confront': {
        speaker: '指挥官 · 普莱斯',
        avatar: '🎖️',
        avatarImg: 'assets/art/npc-price.png',
        tag: 'Death Trench 特遣队',
        lines: [
            { text: '幽灵给你看了那段录音？……我没打算一直瞒你。' },
            { text: '一年前我确实和黑潮接触过——为了换回三个人质。这笔交易我从不后悔。' },
            { text: '但最近他们的信号变了，有人在黑潮内部用我的旧频道发指令。', choices: [
                { text: '我信你，长官。', action: () => { setStoryFlag('price_trusted'); advanceChapter(); } },
                { text: '录音里还有谁？', action: () => { setStoryFlag('price_pressed'); advanceChapter(); } }
            ]}
        ]
    },
    'ch4_loyalty_order': {
        speaker: '指挥官 · 普莱斯',
        avatar: '🎖️',
        avatarImg: 'assets/art/npc-price.png',
        tag: 'Death Trench 特遣队',
        lines: [
            { text: '总部嘉奖了你在断壁城的决断。但任务还没结束。' },
            { text: '黑潮的补给线必须切断。这是命令，不是商量。', choices: [
                { text: '收到，执行。', action: () => { setStoryFlag('convoy_ordered'); advanceChapter(); } }
            ]}
        ]
    },
    'ch4_mercy_civilian': {
        speaker: '医疗兵 · 艾琳',
        avatar: '💊',
        avatarImg: 'assets/art/npc-eileen.png',
        tag: '战地医疗',
        lines: [
            { text: '断壁城的平民大多撤离了，但有个孩子还没找到。' },
            { text: '如果你能在森林撤离点拖住敌人，我就能带她出来。', choices: [
                { text: '我掩护你们。', action: () => { setStoryFlag('civilian_promise'); advanceChapter(); } }
            ]}
        ]
    },
    'ch5_final_choice': {
        speaker: '指挥官 · 普莱斯',
        avatar: '🎖️',
        avatarImg: 'assets/art/npc-price.png',
        tag: 'Death Trench 特遣队',
        lines: [
            { text: '最后一步。黑潮的核心节点就在前面。' },
            { text: '炸掉它，战争结束；但那里面……可能有我们的人。', choices: [
                { text: '任务第一，炸掉。', action: () => { setStoryBranch('loyalty'); setStoryFlag('ending_sacrifice'); advanceChapter(); setTimeout(() => showDialogue('ending_loyalty'), 500); } },
                { text: '先救人再炸。', action: () => { setStoryBranch('mercy'); setStoryFlag('ending_rescue'); advanceChapter(); setTimeout(() => showDialogue('ending_mercy'), 500); } },
                { text: '我要进去看真相。', action: () => { setStoryBranch('truth'); setStoryFlag('ending_truth'); advanceChapter(); setTimeout(() => showDialogue('ending_truth'), 500); } }
            ]}
        ]
    },
    'ending_loyalty': {
        speaker: '指挥官 · 普莱斯',
        avatar: '🎖️',
        avatarImg: 'assets/art/npc-price.png',
        tag: 'Death Trench 特遣队',
        lines: [
            { text: '节点已摧毁。黑潮的指挥链断了。' },
            { text: '我们在废墟里找到了三具友军尸体。他们被关在里面，没来得及出来。' },
            { text: '总部说这是「可接受的损失」。……也许吧。', choices: [
                { text: '结束了吗？', action: () => { setStoryFlag('game_completed'); sendStoryMail('ch5_ending_mail'); showEndingScreen(); } }
            ]}
        ]
    },
    'ending_mercy': {
        speaker: '医疗兵 · 艾琳',
        avatar: '💊',
        avatarImg: 'assets/art/npc-eileen.png',
        tag: '战地医疗',
        lines: [
            { text: '阿雅出来了。她抱着一个布娃娃，浑身是灰，但还活着。' },
            { text: '节点最后还是炸了。普莱斯说「迟到的胜利也是胜利」。' },
            { text: '……至少今天，有一个人因为你的选择活了下来。', choices: [
                { text: '这就够了。', action: () => { setStoryFlag('game_completed'); sendStoryMail('ch5_ending_mail'); showEndingScreen(); } }
            ]}
        ]
    },
    'ending_truth': {
        speaker: '幽灵',
        avatar: '👻',
        avatarImg: 'assets/art/npc-ghost.png',
        tag: '战术支援',
        lines: [
            { text: '你进去了。核心节点里没有武器，只有一排冷冻仓。' },
            { text: '仓里的人穿着黑潮军服，但脸……是我们的失踪人员。普莱斯的旧频道一直被用来控制他们。' },
            { text: '真相已经上传到总部。普莱斯被停职调查。战争还没结束，但谎言到此为止。', choices: [
                { text: '我做了对的事。', action: () => { setStoryFlag('game_completed'); sendStoryMail('ch5_ending_mail'); showEndingScreen(); } }
            ]}
        ]
    },
    'merchant_intro': {
        speaker: '商人',
        avatar: '🧳',
        avatarImg: 'assets/art/npc-merchant.png',
        tag: '后勤补给',
        lines: [
            { text: '嘿，幸存者。看到你还活着，我的货又好卖了。' },
            { text: '战场上的战利品——金条、钻石、名画——带回来找我，金币管够。' },
            { text: '记住：背包按格算，同种可叠到 999。把空间留给最值钱的，别捡一袋子破铜烂铁。', choices: [
                { text: '明白，老规矩。', action: () => { setStoryFlag('met_merchant'); } },
                { text: '你这人真现实。', action: () => { setStoryFlag('met_merchant'); addNpcAffinity('merchant', 5); } }
            ]}
        ]
    },
    'eileen_lore': {
        speaker: '艾琳',
        avatar: '📚',
        avatarImg: 'assets/art/npc-eileen.png',
        tag: '战地医疗',
        lines: [
            { text: '我整理过黑潮的残骸，发现它们的装甲上刻着旧世界的工厂编号。' },
            { text: '这说明一件事：黑潮不是外星来的，是我们自己造的。' },
            { text: '所以……赢的可能不是消灭它们，而是弄明白是谁按下开关。', choices: [
                { text: '我会找到那个人。', action: () => { setStoryFlag('eileen_lore_seen'); addNpcAffinity('eileen', 10); } }
            ]}
        ]
    },
    'raid_treasure_tip': {
        speaker: '商人',
        avatar: '🧳',
        avatarImg: 'assets/art/npc-merchant.png',
        tag: '后勤补给',
        lines: [
            { text: '搜打撤模式下，箱子随机出变卖物。越稀有的箱子，越可能出传奇货。' },
            { text: '钻石、名画、加密硬盘——这些才是让金币滚动的硬通货。' },
            { text: '带上镭射指示器，弹道可循，穿透掩体，效率翻倍。去吧，淘金者。', choices: [
                { text: '这就出发。', action: () => { setStoryFlag('treasure_tip_seen'); } }
            ]}
        ]
    }
};

let currentDialogueId = null;
let currentDialogue = null;
let currentDialogueLineIndex = 0;

function showDialogue(dialogueId) {
    const dialogue = DIALOGUES[dialogueId];
    if (!dialogue) { console.warn('[Dialogue] not found:', dialogueId); return; }
    currentDialogueId = dialogueId;
    currentDialogue = dialogue;
    currentDialogueLineIndex = 0;

    const overlay = document.getElementById('dialogueOverlay');
    console.log('[Dialogue] showDialogue', dialogueId, 'overlay found:', !!overlay);
    if (overlay) {
        overlay.style.display = 'flex';
        overlay.classList.add('active');
    }
    renderDialogueLine();
}

function renderDialogueLine() {
    if (!currentDialogue) return;
    const line = currentDialogue.lines[currentDialogueLineIndex];
    if (!line) { closeDialogue(); return; }

    const speakerEl = document.getElementById('dialogueSpeaker');
    const avatarEl = document.getElementById('dialogueAvatar');
    const tagEl = document.getElementById('dialogueSpeakerTag');
    const textEl = document.getElementById('dialogueText');
    const choicesEl = document.getElementById('dialogueChoices');
    const nextBtn = document.getElementById('dialogueNextBtn');

    if (speakerEl) speakerEl.textContent = currentDialogue.speaker || '???';
    if (avatarEl) {
        if (currentDialogue.avatarImg) {
            avatarEl.innerHTML = '<img src="' + currentDialogue.avatarImg + '" alt="' + (currentDialogue.speaker || 'NPC') + '" class="dialogue-avatar-img">';
        } else {
            avatarEl.textContent = currentDialogue.avatar || '👤';
        }
    }
    if (tagEl) tagEl.textContent = currentDialogue.tag || '';
    if (textEl) textEl.textContent = line.text || '';
    if (choicesEl) choicesEl.innerHTML = '';

    if (line.choices && line.choices.length > 0) {
        if (nextBtn) nextBtn.style.display = 'none';
        line.choices.forEach((choice, idx) => {
            const btn = document.createElement('button');
            btn.className = 'dialogue-choice-btn';
            btn.textContent = choice.text;
            btn.onclick = () => selectDialogueChoice(idx);
            choicesEl.appendChild(btn);
        });
    } else {
        if (nextBtn) {
            nextBtn.style.display = 'inline-block';
            nextBtn.textContent = currentDialogueLineIndex >= currentDialogue.lines.length - 1 ? '结束' : '继续';
        }
    }
}

function nextDialogueLine() {
    if (!currentDialogue) return;
    currentDialogueLineIndex++;
    if (currentDialogueLineIndex >= currentDialogue.lines.length) {
        closeDialogue();
    } else {
        renderDialogueLine();
    }
}

function selectDialogueChoice(choiceIndex) {
    if (!currentDialogue) return;
    const line = currentDialogue.lines[currentDialogueLineIndex];
    const choice = line.choices[choiceIndex];
    if (!choice) return;

    if (choice.action) {
        try { choice.action(); } catch (e) { console.error('[Dialogue] choice action failed', e); }
    }

    if (choice.next && DIALOGUES[choice.next]) {
        const nextId = choice.next;
        closeDialogue();
        setTimeout(() => showDialogue(nextId), 250);
    } else {
        closeDialogue();
    }
}

function closeDialogue() {
    if (currentDialogueId) markDialogueCompleted(currentDialogueId);
    currentDialogueId = null;
    currentDialogue = null;
    currentDialogueLineIndex = 0;
    const overlay = document.getElementById('dialogueOverlay');
    if (overlay) {
        overlay.style.display = 'none';
        overlay.classList.remove('active');
    }
}

function skipDialogue() {
    closeDialogue();
}

window.showDialogue = showDialogue;
window.nextDialogueLine = nextDialogueLine;
window.selectDialogueChoice = selectDialogueChoice;
window.skipDialogue = skipDialogue;
window.resetStoryState = resetStoryState;

// 任务简报与引导数据
const MISSION_GUIDES = {
    'task_kill1': {
        title: '沙漠突袭：沙海前哨',
        story: '黑潮在沙漠边缘建立了一座前哨站，用来监视我方补给线。\n\n普莱斯说："这不是杀鸡儆猴，这是剪指甲——让他们知道我们一直在。"',
        objectives: [
            '① 选择「沙漠」地图，普通任务模式。',
            '② 消灭 15 名黑潮士兵。',
            '③ 沙漠掩体较少，保持移动，优先占据高地。'
        ]
    },
    'task_kill2': {
        title: '城市清剿：断壁城',
        story: '断壁城曾是自由贸易港，现在被黑潮改成军火中转站。\n\n情报显示地下有一座弹药库，清理敌人就是切断他们的补给线。',
        objectives: [
            '① 选择「城市」地图。',
            '② 清理 20 名敌人。',
            '③ 小心建筑物内的伏击，手雷在拐角处效果很好。'
        ],
        preDialogue: 'city_choice'
    },
    'task_kill3': {
        title: '丛林猎杀：毒藤密林',
        story: '黑潮在丛林深处设立了生物实验室，传闻他们在测试一种增强士兵体能的药剂。\n\n进去的人很少能完整出来。',
        objectives: [
            '① 选择「丛林」地图。',
            '② 消灭 25 名敌人。',
            '③ 视野受限，狙击枪和霰弹枪各有优势。'
        ]
    },
    'task_boss1': {
        title: 'Boss 猎手：斩首行动',
        story: '黑潮的一名重甲指挥官「铁砧」出现在战场上。\n\n他从不单独行动，身边总有一群精锐护卫。',
        objectives: [
            '① 任意地图均可触发。',
            '② 消灭 1 名 Boss 单位。',
            '③ 穿甲弹和爆炸物对重甲目标更有效。'
        ]
    },
    'task_truth_lab': {
        title: '真相：实验室渗透',
        story: '幽灵锁定了黑潮的生物实验室。里面有一台纳米控制原型机。\n\n她说：「销毁它，就知道普莱斯到底干了什么。」',
        objectives: ['① 选择「废墟」地图。', '② 消灭 30 名敌人。', '③ 优先使用消音武器避免触发警报。']
    },
    'task_loyalty_convoy': {
        title: '忠诚：截击补给线',
        story: '黑潮的补给车队将在荒漠中行进。总部命令：全部摧毁。\n\n普莱斯说：「没有补给，他们撑不过三天。」',
        objectives: ['① 选择「荒漠」地图。', '② 消灭 35 名敌人。', '③ 车队护卫密集，准备爆炸物。']
    },
    'task_mercy_rescue': {
        title: '仁慈：撤离难民',
        story: '森林深处有一个平民撤离点。黑潮正在逼近。\n\n艾琳说：「只要你能拖住他们三分钟，我就能把人带出来。」',
        objectives: ['① 选择「森林」地图。', '② 保护撤离点直至撤离完成。', '③ 不要恋战，以拖延为目标。']
    },
    'task_treasure_hunter': {
        title: '摸金：战利品猎手',
        story: '商人透露，战场各处散落着高价值战利品：金条、钻石、名画、加密硬盘……\n\n带得出来，就能在黑市换成金币。这不再是单纯的厮杀，而是一场淘金。',
        objectives: ['① 任意地图进入搜打撤模式。', '② 收集至少 10 件变卖物并成功撤离。', '③ 背包按格计算，优先带走最值钱的种类。']
    },
    'task_night_raid': {
        title: '夜袭：潜入与撤离',
        story: '黑潮在夜晚松懈。铁匠建议你装配消音器与镭射指示器，悄然接近、精准收割。\n\n「子弹穿透掩体，弹道可循——这才是高手的做法。」',
        objectives: ['① 装配「消音器」「镭射指示器」配件。', '② 在搜打撤中消灭 20 名敌人。', '③ 利用穿透与弹道线打出优势。']
    },
    'task_anvil_war': {
        title: '决战：铁砧之怒',
        story: '铁砧不再等待。它率领精锐小队全面压上，战壕震颤。\n\n普莱斯沉声道：「这不是任务，是战争。拿下它，故事才真正开始。」',
        objectives: ['① 任意地图，Boss 刷新概率已提升。', '② 连续消灭 3 名 Boss 单位。', '③ 准备穿甲弹、医疗包与爆炸物，不要吝啬。']
    }
};

let currentBriefingMissionId = null;

function hasMissionBriefing(missionId) {
    return !!MISSION_GUIDES[missionId];
}

function showMissionBriefing() {
    if (!currentMission) return;
    const guide = MISSION_GUIDES[currentMission.id];
    if (!guide) return;

    currentBriefingMissionId = currentMission.id;

    // 剧情对话优先触发
    if (guide.preDialogue && !isDialogueCompleted(guide.preDialogue)) {
        showDialogue(guide.preDialogue);
        return;
    }

    const modal = document.getElementById('missionBriefingModal');
    const titleEl = document.getElementById('briefingTitle');
    const storyEl = document.getElementById('briefingStory');
    const objEl = document.getElementById('briefingObjectives');

    if (titleEl) titleEl.textContent = guide.title || currentMission.nameZh;
    if (storyEl) storyEl.textContent = guide.story || '';
    if (objEl) objEl.innerHTML = (guide.objectives || []).map(o => `<div class="briefing-objective">${o}</div>`).join('');

    if (modal) modal.style.display = 'flex';
}

function closeMissionBriefing() {
    if (currentBriefingMissionId) {
        markBriefingSeen(currentBriefingMissionId);
        currentBriefingMissionId = null;
    }
    const modal = document.getElementById('missionBriefingModal');
    if (modal) modal.style.display = 'none';
}

function toggleMissionBriefingButton() {
    const btn = document.getElementById('missionBriefingBtn');
    if (!btn) return;
    const mode = playerData.selectedMode || 'mission';
    const visible = mode === 'mission' && currentMission && hasMissionBriefing(currentMission.id);
    btn.style.display = visible ? 'block' : 'none';
}

window.showMissionBriefing = showMissionBriefing;
window.closeMissionBriefing = closeMissionBriefing;

// 分线剧情任务扩展
function getStoryMissions() {
    const missions = [];
    if (storyState.branch === 'truth' && hasStoryFlag('city_saved') && storyState.chapter >= 2) {
        missions.push({
            id: 'task_truth_lab',
            type: 'kill',
            nameZh: '真相：实验室渗透',
            nameEn: 'Truth: Lab Infiltration',
            descZh: '潜入黑潮实验室，销毁纳米控制原型机',
            descEn: 'Infiltrate Black Tide lab and destroy the nano-control prototype',
            target: 30,
            reward: 1200,
            map: 'ruins'
        });
    }
    if (storyState.branch === 'loyalty' && hasStoryFlag('city_destroyed') && storyState.chapter >= 2) {
        missions.push({
            id: 'task_loyalty_convoy',
            type: 'kill',
            nameZh: '忠诚：截击补给线',
            nameEn: 'Loyalty: Supply Intercept',
            descZh: '摧毁黑潮补给车队，削弱其前线兵力',
            descEn: 'Destroy Black Tide supply convoys to weaken frontline forces',
            target: 35,
            reward: 1200,
            map: 'wasteland'
        });
    }
    if (storyState.branch === 'mercy' && hasStoryFlag('city_saved') && storyState.chapter >= 2) {
        missions.push({
            id: 'task_mercy_rescue',
            type: 'extract',
            nameZh: '仁慈：撤离难民',
            nameEn: 'Mercy: Civilian Extraction',
            descZh: '保护平民撤离点直至撤离完成',
            descEn: 'Protect the civilian extraction point until extraction is complete',
            target: 1,
            reward: 1200,
            map: 'forest'
        });
    }
    return missions;
}

window.getStoryMissions = getStoryMissions;

// 分线剧情邮件
function sendStoryMail(mailId) {
    const storyMails = {
        'ghost_warning_mail': {
            id: 'ghost_warning_mail',
            sender: '幽灵',
            subject: '关于普莱斯',
            body: '我截获了一段录音。普莱斯一年前和黑潮有过接触。\n\n不要问他。先完成任务，证据越多，越能搞清楚他站在哪一边。\n\n我会再联系你。',
            date: '2026-06-22 03:14',
            unread: true
        },
        'price_after_city': {
            id: 'price_after_city',
            sender: '指挥官 · 普莱斯',
            subject: '断壁城之后',
            body: '你今天的选择，总部会记住。\n\n在死亡战壕，没有绝对的对错，只有你能不能活到下一个黎明。\n\n活着回来。',
            date: '2026-06-22 08:00',
            unread: true
        },
        'ch4_truth_meeting': {
            id: 'ch4_truth_meeting',
            sender: '幽灵',
            subject: '该摊牌了',
            body: '普莱斯已经知道你看了录音。\n\n他约你在实验室废墟见面。我会在外围监控。\n\n如果他说的是真话，那黑潮内部有人冒用他的身份。\n\n小心。',
            date: '2026-06-24 01:33',
            unread: true
        },
        'ch4_loyalty_directive': {
            id: 'ch4_loyalty_directive',
            sender: '总部 · 参谋部',
            subject: '补给线截击令',
            body: '经确认，黑潮将通过荒漠转移三批补给。\n\n授权使用一切必要手段摧毁车队。\n\n普莱斯已知情，配合执行。',
            date: '2026-06-24 06:00',
            unread: true
        },
        'ch4_mercy_eileen': {
            id: 'ch4_mercy_eileen',
            sender: '医疗兵 · 艾琳',
            subject: '那个孩子',
            body: '她叫阿雅，九岁。\n\n她妈妈在断壁城走散了，她一个人躲在森林撤离点的废屋。\n\n如果你能拖住敌人，我就能带她出来。\n\n求你。',
            date: '2026-06-24 09:15',
            unread: true
        },
        'ch5_ending_mail': {
            id: 'ch5_ending_mail',
            sender: '？？？',
            subject: '你做了什么',
            body: '无论你今天选了什么，死亡战壕都会记住。\n\n战争没有赢家。只有活下来的人，替死去的人记住这一切。\n\n——下一章，即将开始。',
            date: '2026-06-26 00:00',
            unread: true
        }
    };
    const mail = storyMails[mailId];
    if (!mail) return;
    if (!_mailListCache) _mailListCache = getDefaultMails();
    if (_mailListCache.some(m => m.id === mailId)) return;
    _mailListCache.unshift(mail);
    saveMailsToStorage();
}

window.sendStoryMail = sendStoryMail;

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
