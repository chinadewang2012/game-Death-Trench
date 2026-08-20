/**
 * AntiCheat Module
 * 客户端反作弊与数据完整性保护
 * 注意：网页端无法 100% 阻止作弊，本模块仅提高门槛并检测常见异常。
 */

// ============================================================
// Cookie 存档层（最先安装，确保后续 localStorage 访问都走 cookie）
// 透明替换 window.localStorage 为基于 cookie 的实现；
// 业务代码（loadPlayerData / loadPlayerMods / safeSetItem 等）零改动。
// cookie 单条约 4KB，故对大 value 做分片存储（key__0/key__1/...）。
// ============================================================
(function installCookieStorage() {
    const COOKIE_PREFIX = 'dt_';
    const SHARD_BYTES = 3000;
    const EXPIRE_DAYS = 365;

    function enc(str) {
        return encodeURIComponent(str).replace(/[!'()*~]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
    }
    function dec(str) {
        try { return decodeURIComponent(str); } catch (e) { return str; }
    }
    function writeCookie(name, value, days) {
        const d = new Date();
        d.setTime(d.getTime() + (days || EXPIRE_DAYS) * 24 * 60 * 60 * 1000);
        document.cookie = COOKIE_PREFIX + enc(name) + '=' + enc(value) + ';expires=' + d.toUTCString() + ';path=/;SameSite=Lax';
    }
    function readAllCookies() {
        const map = {};
        (document.cookie || '').split(';').forEach(pair => {
            const idx = pair.indexOf('=');
            if (idx < 0) return;
            map[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
        });
        return map;
    }

    const CookieStorage = {
        getItem(key) {
            const all = readAllCookies();
            const base = COOKIE_PREFIX + enc(key);
            if (all[base] === undefined) {
                if (all[key] !== undefined) return dec(all[key]); // 旧版无前缀兼容
                return null;
            }
            let out = '', i = 0;
            while (all[base + '__' + i] !== undefined) { out += dec(all[base + '__' + i]); i++; }
            return out || null;
        },
        setItem(key, value) {
            const str = String(value);
            const base = COOKIE_PREFIX + enc(key);
            const all = readAllCookies();
            let i = 0;
            while (all[base + '__' + i] !== undefined) { writeCookie(base + '__' + i, '', -1); i++; }
            if (str.length <= SHARD_BYTES) { writeCookie(base, str); return; }
            for (let s = 0; s < str.length; s += SHARD_BYTES) {
                writeCookie(base + '__' + (s / SHARD_BYTES), str.slice(s, s + SHARD_BYTES));
            }
        },
        removeItem(key) {
            const base = COOKIE_PREFIX + enc(key);
            const all = readAllCookies();
            writeCookie(base, '', -1);
            let i = 0;
            while (all[base + '__' + i] !== undefined) { writeCookie(base + '__' + i, '', -1); i++; }
        },
        clear() {
            const all = readAllCookies();
            Object.keys(all).forEach(k => { if (k.indexOf(COOKIE_PREFIX) === 0) writeCookie(k.replace(COOKIE_PREFIX, ''), '', -1); });
        },
        key() { return null; },
        get length() { return 0; }
    };

    try {
        Object.defineProperty(window, 'localStorage', { configurable: true, get() { return CookieStorage; } });
        window.__cookieStorage = CookieStorage;
        console.log('[STORAGE] localStorage 已透明替换为 cookie 存储');
    } catch (e) {
        console.warn('[STORAGE] 无法覆盖 localStorage，回退原生', e);
    }
})();

const AntiCheat = (() => {
    // 通过简单编码隐藏关键字符串，避免明文搜索即可定位
    const _b64 = (s) => btoa(unescape(encodeURIComponent(s)));
    const _str = (s) => { try { return decodeURIComponent(escape(atob(s))); } catch (e) { return ''; } };

    const KEY_PREFIX = _b64('deathTrench_');
    const SIG_KEY = _b64('dt2d_integrity_salt_v2026');

    // 常见作弊扩展在 DOM 中留下的痕迹（CSS 选择器，base64 编码）
    const CHEAT_INDICATORS = [
        'ZGl2W2lkXj1jaGVhdF0=',      // div[id^=cheat]
        'LmluamVjdGVkLWNvbnNvbGU=',   // .injected-console
        'I2h4LW1lbnU=',               // #hx-menu
        'LndlLW1vZGU=',               // .we-mode
        'LmdhbWUtY2hlYXQt',           // .game-cheat-
        'LndnLWVkaXQ=',               // .wg-edit
        'I2ZyZWV6ZS1lbGVtZW50'       // #freeze-element
    ].map(_str);

    let _devtoolsOpen = false;
    let _suspiciousScore = 0;
    let _lastScoreDecay = _now();
    let _lastFlagReason = '';
    let _lastFlagTime = 0;
    let _lastPlayerHash = null;
    let _playerDataHistory = [];
    const MAX_HISTORY = 10;
    let _selfScriptSrc = '';

    // ========== 工具函数 ==========
    function _bytesToHex(bytes) {
        return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    async function _hmacSha256(message, secret) {
        try {
            const enc = new TextEncoder();
            const keyData = enc.encode(secret);
            const msgData = enc.encode(message);
            const cryptoKey = await crypto.subtle.importKey(
                'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
            );
            const signature = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
            return _bytesToHex(new Uint8Array(signature));
        } catch (e) {
            // 在不支持 Web Crypto 的环境下回退到简单哈希
            return _fallbackHash(message + secret);
        }
    }

    function _fallbackHash(str) {
        let h = 0xdeadbeef;
        for (let i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i);
            h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
            h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
        }
        return (h ^ (h >>> 16)) >>> 0;
    }

    function _now() {
        return Date.now();
    }

    // ========== DevTools / 插件检测 ==========
    function _verboseLog(reason, details) {
        if (typeof console !== 'undefined' && console.warn) {
            console.warn('[AntiCheat debug]', reason, details);
        }
    }

    function _checkDevTools() {
        // 仅保留窗口尺寸差检测；需要宽高同时异常才判定，避免滚动条/工具栏误触发
        const threshold = 200;
        const widthDiff = window.outerWidth - window.innerWidth;
        const heightDiff = window.outerHeight - window.innerHeight;
        const widthThreshold = widthDiff > threshold;
        const heightThreshold = heightDiff > threshold;
        const detected = widthThreshold && heightThreshold;
        if (detected) {
            _verboseLog('devtools dimension diff', { widthDiff, heightDiff });
        }
        return detected;
    }

    function _checkCheatIndicators() {
        try {
            for (const selector of CHEAT_INDICATORS) {
                if (!selector) continue;
                if (document.querySelector(selector)) {
                    _verboseLog('cheat indicator selector matched', selector);
                    return true;
                }
            }
            // 检测 common cheat globals；仅当值为对象/函数时才视为高危，避免普通变量名冲突
            const cheatGlobals = [
                'cheat', 'hack', 'modMenu', 'gameHook', 'memoryJs', 'ce',
                'CheatEngine', 'GameGuardian', 'WeMod', 'Infinity', 'Trainer',
                'AimAssist', 'AutoClicker', 'speedHack', 'wallHack',
                'UnknownCheats', 'FearlessRevolution', 'MrAntiFun', 'FLiNG',
                'GameCopyWorld', 'ArtMoney', 'SBGameHacker', 'LuckyPatcher',
                'GameGuardian', 'GameKiller', 'iGameGuardian'
            ];
            for (const g of cheatGlobals) {
                if (typeof window[g] !== 'undefined') {
                    const t = typeof window[g];
                    if (t === 'object' || t === 'function') {
                        _verboseLog('cheat global found', { key: g, type: t });
                        return true;
                    }
                }
            }
        } catch (e) {}
        return false;
    }

    function _checkConsoleTampering() {
        // 浏览器扩展（React/Vue DevTools 等）或开发者工具打开时，console 方法常被
        // 正常包装，属常规行为，不应判为作弊。仅在方法被重写为明显作弊代码时报警。
        try {
            const methods = ['log', 'warn', 'error', 'info', 'debug'];
            for (const method of methods) {
                if (typeof console[method] !== 'function') continue;
                const str = console[method].toString();
                if (str.indexOf('cheat') !== -1 || str.indexOf('hack') !== -1 ||
                    str.indexOf('modmenu') !== -1 || str.indexOf('trainer') !== -1) {
                    _verboseLog('console method contains cheat code', method);
                    return true;
                }
            }
        } catch (e) {}
        return false;
    }

    function _checkWindowTampering() {
        try {
            // 仅检测明确的作弊/调试全局变量；浏览器扩展（React/Vue DevTools 等）不再计入
            const cheatOnlyKeys = [
                'cheat', 'hack', 'modMenu', 'gameHook', 'memoryJs', 'ce',
                'CheatEngine', 'GameGuardian', 'WeMod', 'Infinity', 'Trainer',
                'AimAssist', 'AutoClicker', 'speedHack', 'wallHack',
                'UnknownCheats', 'FearlessRevolution', 'MrAntiFun', 'FLiNG',
                'GameCopyWorld', 'ArtMoney', 'SBGameHacker', 'LuckyPatcher',
                'GameGuardian', 'GameKiller', 'iGameGuardian'
            ];
            for (const key of cheatOnlyKeys) {
                if (key in window) {
                    const t = typeof window[key];
                    // 仅当值为对象或函数时才视为可疑，避免字符串/布尔值变量名冲突
                    if (t === 'object' || t === 'function') {
                        _verboseLog('window tampering key', { key, type: t });
                        return true;
                    }
                }
            }
            return false;
        } catch (e) {
            return false;
        }
    }

    function _isSuspiciousScriptSrc(src) {
        if (!src) return false;
        const s = src.toLowerCase();
        // 排除游戏自身文件（anti-cheat.js 等文件名本身含 cheat）
        if (s.indexOf('anti-cheat') !== -1 || s.indexOf('/js/anti-cheat') !== -1) return false;
        return s.indexOf('cheat') !== -1 || s.indexOf('hack') !== -1 ||
               s.indexOf('modmenu') !== -1 || s.indexOf('trainer') !== -1;
    }

    function _isTampermonkeyScript(text) {
        if (!text || text.length < 30) return false;
        const t = text.toLowerCase();
        // 仅匹配明确的油猴脚本头部特征
        return t.indexOf('==userscript==') !== -1 ||
               t.indexOf('// @grant') !== -1 ||
               (t.indexOf('tampermonkey') !== -1 && t.indexOf('// @') !== -1) ||
               (t.indexOf('userscript') !== -1 && t.indexOf('// @') !== -1);
    }

    function _checkScriptInjection() {
        try {
            const scripts = document.querySelectorAll('script');
            for (const script of scripts) {
                const src = script.src || '';
                // 跳过反作弊脚本自身，避免文件名含 cheat 导致自检测
                if (_selfScriptSrc && src === _selfScriptSrc) continue;
                if (_isSuspiciousScriptSrc(src)) {
                    _verboseLog('suspicious script src', src);
                    return true;
                }
                const text = script.textContent || '';
                if (_isTampermonkeyScript(text)) {
                    _verboseLog('tampermonkey/userscript inline script detected');
                    return true;
                }
            }
            // 仅当 iframe/object/embed 同时匹配作弊标识或可疑域名/隐藏样式时才判定异常
            const foreign = document.querySelectorAll('iframe, object, embed');
            for (const el of foreign) {
                const src = (el.src || '').toLowerCase();
                if (src.indexOf('cheat') !== -1 || src.indexOf('hack') !== -1 || src.indexOf('modmenu') !== -1) {
                    _verboseLog('suspicious foreign element src', el.src);
                    return true;
                }
                const style = window.getComputedStyle(el);
                if ((style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') &&
                    (src.indexOf('http') !== -1 || (el.name || '').toLowerCase().indexOf('cheat') !== -1)) {
                    _verboseLog('hidden foreign element detected', { src: el.src, name: el.name });
                    return true;
                }
            }
        } catch (e) {}
        return false;
    }

    function _checkNativeFunctionTampering() {
        try {
            // eval / Function 被替换风险较高；定时器类函数很多扩展会包装，误报极高，不再纳入
            const natives = ['eval', 'Function'];
            const tampered = [];
            for (const name of natives) {
                const fn = window[name];
                if (typeof fn !== 'function') continue;
                const str = fn.toString();
                if (str.indexOf('[native code]') === -1 && str.indexOf('native code') === -1) {
                    tampered.push(name);
                }
            }
            if (tampered.length) {
                _verboseLog('native function tampering', tampered);
            }
            return tampered.length > 0;
        } catch (e) {}
        return false;
    }

    function _startMutationObserver() {
        try {
            if (typeof MutationObserver === 'undefined') return;
            const observer = new MutationObserver((mutations) => {
                for (const m of mutations) {
                    for (const node of m.addedNodes) {
                        if (node.nodeType !== 1) continue;
                        const tag = node.tagName ? node.tagName.toLowerCase() : '';
                        if (tag === 'script') {
                            const src = node.src || '';
                            const text = node.textContent || '';
                            if (_isSuspiciousScriptSrc(src) || _isTampermonkeyScript(text)) {
                                _verboseLog('mutation suspicious script', { src: src.slice(0, 120), textPreview: text.slice(0, 80) });
                                _flagSuspicious('dom_injection_detected');
                            }
                        } else if (tag === 'iframe' || tag === 'object' || tag === 'embed') {
                            const src = (node.src || '').toLowerCase();
                            // 仅对含作弊标识或隐藏的外部 iframe 告警
                            const style = window.getComputedStyle(node);
                            const isHidden = style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0';
                            const isSuspiciousSrc = src.indexOf('cheat') !== -1 || src.indexOf('hack') !== -1 || src.indexOf('modmenu') !== -1;
                            if (isSuspiciousSrc || (isHidden && src.indexOf('http') !== -1)) {
                                _verboseLog('mutation suspicious foreign element', { tag, src: node.src, isHidden });
                                _flagSuspicious('dom_injection_detected');
                            }
                        }
                    }
                }
            });
            observer.observe(document.documentElement || document.body, { childList: true, subtree: true });
        } catch (e) {}
    }

    function _blockShortcuts() {
        // 不再拦截 F12 / Ctrl+Shift+I / Ctrl+U 等开发者快捷键：
        // 正常玩家打开浏览器控制台不应被阻断或判为作弊。
        // 反作弊仅聚焦于真正的作弊插件（注入脚本、作弊全局对象、油猴篡改等）。
    }

    function _blockContextMenu() {
        document.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            // 右键菜单阻断不再加分，仅阻止默认行为
            return false;
        }, true);
    }

    function _startDevToolsWatcher() {
        // 需求：游戏中打开浏览器控制台（开发者工具）即停止运行。
        // 仅在真正检测到 DevTools 打开时派发事件，由游戏侧暂停主循环。
        let wasOpen = false;
        setInterval(() => {
            const open = _checkDevTools();
            if (open && !wasOpen) {
                wasOpen = true;
                _verboseLog('devtools panel open -> request game stop');
                try { window.dispatchEvent(new CustomEvent('dt:devtools-opened')); } catch (e) {}
                if (typeof window.onDevToolsOpened === 'function') {
                    try { window.onDevToolsOpened(); } catch (e) {}
                }
            } else if (!open) {
                wasOpen = false;
            }
        }, 1000);
    }

    function _startCheatWatcher() {
        setInterval(() => {
            // 分数衰减：长时间无新的可疑行为时逐步降低分数
            const now = _now();
            if (now - _lastScoreDecay > 10000) {
                _suspiciousScore = Math.max(0, _suspiciousScore - 1);
                _lastScoreDecay = now;
            }

            if (_checkCheatIndicators()) {
                _flagSuspicious('cheat_indicator_found');
            }
            if (_checkConsoleTampering()) {
                _flagSuspicious('console_tampering_detected');
            }
            if (_checkWindowTampering()) {
                _flagSuspicious('window_tampering_detected');
            }
            if (_checkScriptInjection()) {
                _flagSuspicious('script_injection_detected');
            }
            if (_checkNativeFunctionTampering()) {
                _flagSuspicious('native_function_tampering');
            }
        }, 5000);
    }

    // ========== localStorage 防篡改包装 ==========
    function _protectLocalStorage() {
        try {
            const originalSetItem = localStorage.setItem.bind(localStorage);
            const originalRemoveItem = localStorage.removeItem.bind(localStorage);

            localStorage.setItem = function(key, value) {
                if (typeof key === 'string' && key.startsWith(_str(KEY_PREFIX))) {
                    // 允许白名单内的写入，但记录操作
                    // 实际拦截会在更上层完成
                }
                try {
                    return originalSetItem(key, value);
                } catch (e) {
                    // 配额不足时静默失败，交由上层 safeSetItem 做清理重试
                    if (e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014)) {
                        return;
                    }
                    throw e;
                }
            };

            localStorage.removeItem = function(key) {
                if (typeof key === 'string' && key.startsWith(_str(KEY_PREFIX))) {
                    _flagSuspicious('localStorage_remove_' + key);
                }
                return originalRemoveItem(key);
            };
        } catch (e) {}
    }

    // ========== 玩家数据完整性 ==========
    async function signPlayerData(data) {
        const payload = JSON.stringify(data);
        const sig = await _hmacSha256(payload, _str(SIG_KEY));
        return { payload, sig, ts: _now() };
    }

    async function verifyPlayerData(data, signature) {
        if (!data || !signature) return false;
        const expected = await _hmacSha256(JSON.stringify(data), _str(SIG_KEY));
        return expected === signature;
    }

    // 同步签名（用于快速存档路径，避免 async 导致页面关闭时丢失）
    // 以下字段仅作客户端记录，不计入验证码，避免玩家正常使用功能后被误判为篡改
    const NON_SIGNED_FIELDS = ['redeemedCodes'];

    function _stripNonSignedFields(data) {
        if (!data || typeof data !== 'object') return data;
        try {
            const clone = JSON.parse(JSON.stringify(data));
            for (const key of NON_SIGNED_FIELDS) {
                delete clone[key];
            }
            return clone;
        } catch (e) {
            return data;
        }
    }

    function signPlayerDataSync(data) {
        const signedData = _stripNonSignedFields(data);
        const payload = JSON.stringify(signedData);
        const sig = _syncHash(payload + _str(SIG_KEY));
        return { payload, sig, ts: _now() };
    }

    function verifyPlayerDataSync(data, signature) {
        if (!data || !signature) return false;
        const signedData = _stripNonSignedFields(data);
        const expected = _syncHash(JSON.stringify(signedData) + _str(SIG_KEY));
        return expected === signature;
    }

    function _syncHash(str) {
        let h1 = 0xdeadbeef;
        let h2 = 0x41c64e6d;
        for (let i = 0; i < str.length; i++) {
            const c = str.charCodeAt(i);
            h1 = Math.imul(h1 ^ c, 0x85ebca6b);
            h1 ^= (h1 >>> 16);
            h2 = Math.imul(h2 ^ c, 0xc2b2ae35);
            h2 ^= (h2 >>> 13);
        }
        h1 ^= (h1 >>> 16);
        h2 ^= (h2 >>> 16);
        return ((h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0'));
    }

    function _clone(obj) {
        try { return JSON.parse(JSON.stringify(obj)); } catch (e) { return null; }
    }

    function detectAnomaly(previous, current) {
        if (!previous || !current) return { anomaly: false };

        const checks = [
            {
                key: 'coins',
                maxDelta: 100000,
                reason: '金币异常增长'
            },
            {
                key: 'totalKills',
                maxDelta: 500,
                reason: '击杀数异常增长'
            },
            {
                key: 'totalScore',
                maxDelta: 1000000,
                reason: '得分异常增长'
            }
        ];

        for (const c of checks) {
            const prevVal = previous[c.key] || 0;
            const currVal = current[c.key] || 0;
            const delta = currVal - prevVal;
            if (delta > c.maxDelta) {
                return {
                    anomaly: true,
                    reason: c.reason,
                    key: c.key,
                    delta: delta,
                    maxAllowed: c.maxDelta
                };
            }
            if (currVal < 0 || (typeof currVal !== 'number')) {
                return { anomaly: true, reason: c.reason + ' 数值非法', key: c.key, delta: delta };
            }
        }

        return { anomaly: false };
    }

    function recordPlayerSnapshot(data) {
        const clone = _clone(data);
        if (!clone) return;
        _playerDataHistory.push({ ts: _now(), data: clone });
        if (_playerDataHistory.length > MAX_HISTORY) {
            _playerDataHistory.shift();
        }
    }

    function getLastSnapshot() {
        if (_playerDataHistory.length === 0) return null;
        return _playerDataHistory[_playerDataHistory.length - 1].data;
    }

    // ========== 异常处理 ==========
    const _flaggedReasons = new Set();

    function _flagSuspicious(reason) {
        const now = _now();
        if (_lastFlagReason === reason && now - _lastFlagTime < 10000) {
            return; // 同一原因 10 秒内只加一次分
        }
        _lastFlagReason = reason;
        _lastFlagTime = now;
        _suspiciousScore += 1;
        _flaggedReasons.add(reason);
        console.warn('[AntiCheat] suspicious:', reason, 'score:', _suspiciousScore, 'distinctReasons:', _flaggedReasons.size);

        // 需要较高分数且至少两种不同原因才会触发严重响应，显著降低单一误报导致退出的概率
        if (_suspiciousScore >= 8 && _flaggedReasons.size >= 2) {
            _onCheatDetected(reason);
        }
    }

    function _onCheatDetected(reason) {
        console.error('[AntiCheat] Cheat detected:', reason);
        // 发送给游戏层处理（如果存在）
        if (typeof window.onCheatDetected === 'function') {
            try { window.onCheatDetected(reason); } catch (e) {}
        }
    }

    // ========== 初始化 ==========
    function init() {
        try {
            // 记录反作弊脚本自身地址，避免自检测
            try {
                _selfScriptSrc = document.currentScript ? document.currentScript.src : '';
            } catch (e) { _selfScriptSrc = ''; }

            _blockShortcuts();
            _blockContextMenu();
            _startDevToolsWatcher();
            _startCheatWatcher();
            _startMutationObserver();
            _protectLocalStorage();

            // 检测 iframe 嵌入
            if (window.self !== window.top) {
                _flagSuspicious('iframe_embedded');
            }

            console.log('[AntiCheat] initialized');
        } catch (e) {
            console.error('[AntiCheat] init error:', e);
        }
    }

    return {
        init,
        signPlayerData,
        verifyPlayerData,
        signPlayerDataSync,
        verifyPlayerDataSync,
        detectAnomaly,
        recordPlayerSnapshot,
        getLastSnapshot,
        isDevToolsOpen: () => _devtoolsOpen,
        getSuspiciousScore: () => _suspiciousScore,
        flagSuspicious: _flagSuspicious
    };
})();

// 立即初始化
if (typeof window !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => AntiCheat.init());
    } else {
        AntiCheat.init();
    }
}
