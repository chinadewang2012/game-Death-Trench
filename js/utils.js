const GameUtils = (() => {
    function clamp(value, min, max) {
        return Math.max(min, Math.min(value, max));
    }

    function distance(x1, y1, x2, y2) {
        return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
    }

    function angleBetween(x1, y1, x2, y2) {
        return Math.atan2(y2 - y1, x2 - x1);
    }

    function randomRange(min, max) {
        return Math.random() * (max - min) + min;
    }

    function randomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function lerp(start, end, t) {
        return start + (end - start) * t;
    }

    function formatNumber(num) {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num.toString();
    }

    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    function throttle(func, limit) {
        let inThrottle;
        return function executedFunction(...args) {
            if (!inThrottle) {
                func(...args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    function normalizeAngle(angle) {
        // 防御：非有限输入或 NaN 直接返回 0，避免下游无限循环/计算错误
        if (typeof angle !== 'number' || !Number.isFinite(angle)) return 0;
        // 使用数学取模代替 while 循环，避免极端大角度的死循环风险
        const twoPi = Math.PI * 2;
        let a = ((angle % twoPi) + twoPi) % twoPi;
        if (a > Math.PI) a -= twoPi;
        return a;
    }

    function rotatePoint(x, y, angle) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        return {
            x: x * cos - y * sin,
            y: x * sin + y * cos
        };
    }

    function createUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    function deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    function mergeDeep(target, source) {
        const output = { ...target };
        if (typeof target === 'object' && typeof source === 'object') {
            Object.keys(source).forEach(key => {
                if (source[key] instanceof Object && key in target) {
                    output[key] = mergeDeep(target[key], source[key]);
                } else {
                    output[key] = source[key];
                }
            });
        }
        return output;
    }

    function getRandomItem(array) {
        return array[Math.floor(Math.random() * array.length)];
    }

    function shuffle(array) {
        const arr = [...array];
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    function wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    return {
        clamp,
        distance,
        angleBetween,
        randomRange,
        randomInt,
        lerp,
        formatNumber,
        debounce,
        throttle,
        normalizeAngle,
        rotatePoint,
        createUUID,
        deepClone,
        mergeDeep,
        getRandomItem,
        shuffle,
        wait
    };
})();