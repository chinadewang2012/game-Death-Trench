const fs = require('fs');
const path = require('path');

const DataCenter = (() => {
    let saveDir = null;
    let lotteryData = {
        totalDraws: 0,
        pityCounter: 0,
        lastResults: [],
        totalRewards: { common: 0, rare: 0, epic: 0, legendary: 0 },
        rewardHistory: []
    };
    let playerData = {
        coins: 500,
        totalKills: 0,
        totalScore: 0,
        equippedArmor: '',
        selectedMap: 'desert',
        inventory: {
            medkits: 3,
            armor: '',
            grenades: 2,
            ammoBox: 5,
            speedBoost: 1
        }
    };

    let lotteryLock = { held: false, holder: null, timeout: null };
    const LOCK_TIMEOUT_MS = 8000;

    const listeners = new Set();

    function init(dir) {
        saveDir = dir;
        loadAll();
    }

    function getSavePath() {
        return path.join(saveDir || __dirname, 'game-sync-data.json');
    }

    function loadAll() {
        try {
            const p = getSavePath();
            if (fs.existsSync(p)) {
                const raw = fs.readFileSync(p, 'utf8');
                const data = JSON.parse(raw);
                if (data.lotteryData) lotteryData = deepMerge(lotteryData, data.lotteryData);
                if (data.playerData) playerData = deepMerge(playerData, data.playerData);
            }
        } catch (e) {
            console.error('[DataCenter] load error:', e.message);
        }
    }

    function saveAll() {
        try {
            const p = getSavePath();
            fs.writeFileSync(p, JSON.stringify({
                lotteryData,
                playerData,
                timestamp: Date.now()
            }, null, 2));
        } catch (e) {
            console.error('[DataCenter] save error:', e.message);
        }
    }

    function deepMerge(target, source) {
        const out = Array.isArray(target) ? [...target] : { ...target };
        for (const k of Object.keys(source || {})) {
            const sv = source[k];
            if (sv && typeof sv === 'object' && !Array.isArray(sv)) {
                out[k] = deepMerge(target[k] || {}, sv);
            } else if (Array.isArray(sv)) {
                out[k] = [...sv];
            } else {
                out[k] = sv;
            }
        }
        return out;
    }

    function acquireLotteryLock(holderId) {
        if (lotteryLock.held) {
            return { success: false, reason: 'lock_held', holder: lotteryLock.holder };
        }
        lotteryLock.held = true;
        lotteryLock.holder = holderId || ('client_' + Date.now());
        if (lotteryLock.timeout) clearTimeout(lotteryLock.timeout);
        lotteryLock.timeout = setTimeout(() => {
            if (lotteryLock.held && lotteryLock.holder === lotteryLock.holder) {
                console.warn('[DataCenter] lottery lock timeout, force release');
                releaseLotteryLock(lotteryLock.holder);
            }
        }, LOCK_TIMEOUT_MS);
        return { success: true, holder: lotteryLock.holder };
    }

    function releaseLotteryLock(holderId) {
        if (!lotteryLock.held) return { success: true };
        if (lotteryLock.holder !== holderId) {
            return { success: false, reason: 'not_holder' };
        }
        lotteryLock.held = false;
        lotteryLock.holder = null;
        if (lotteryLock.timeout) {
            clearTimeout(lotteryLock.timeout);
            lotteryLock.timeout = null;
        }
        return { success: true };
    }

    function getLotteryLockStatus() {
        return { held: lotteryLock.held, holder: lotteryLock.holder };
    }

    function getLotteryData() {
        return JSON.parse(JSON.stringify(lotteryData));
    }

    function getPlayerData() {
        return JSON.parse(JSON.stringify(playerData));
    }

    function getAllData() {
        return {
            lotteryData: getLotteryData(),
            playerData: getPlayerData(),
            lockStatus: getLotteryLockStatus()
        };
    }

    function updateLotteryData(holderId, patch) {
        if (lotteryLock.held && lotteryLock.holder !== holderId) {
            return { success: false, reason: 'lock_mismatch' };
        }
        lotteryData = deepMerge(lotteryData, patch);
        if (lotteryData.rewardHistory && lotteryData.rewardHistory.length > 100) {
            lotteryData.rewardHistory = lotteryData.rewardHistory.slice(0, 100);
        }
        saveAll();
        notifyListeners('lottery', lotteryData);
        return { success: true, data: getLotteryData() };
    }

    function updatePlayerData(patch) {
        playerData = deepMerge(playerData, patch);
        saveAll();
        notifyListeners('player', playerData);
        return { success: true, data: getPlayerData() };
    }

    function commitLotteryDraw(holderId, drawResult) {
        if (!lotteryLock.held || lotteryLock.holder !== holderId) {
            return { success: false, reason: 'lock_required' };
        }
        const cost = drawResult.cost || 0;
        if (playerData.coins < cost) {
            return { success: false, reason: 'insufficient_coins' };
        }

        const snapshot = {
            coins: playerData.coins,
            totalDraws: lotteryData.totalDraws,
            pityCounter: lotteryData.pityCounter,
            totalRewards: JSON.parse(JSON.stringify(lotteryData.totalRewards))
        };

        try {
            playerData.coins -= cost;
            lotteryData.totalDraws += drawResult.count || 0;
            lotteryData.pityCounter = drawResult.finalPity ?? lotteryData.pityCounter;
            lotteryData.lastResults = drawResult.results || [];

            for (const r of drawResult.results || []) {
                if (r && r.rarity && lotteryData.totalRewards[r.rarity] !== undefined) {
                    lotteryData.totalRewards[r.rarity]++;
                }
                if (r && r.type === 'gold' || r?.type === 'coins') {
                    playerData.coins += r.value || 0;
                }
                lotteryData.rewardHistory.unshift({
                    ...r,
                    time: new Date().toLocaleString()
                });
            }
            if (lotteryData.rewardHistory.length > 100) {
                lotteryData.rewardHistory = lotteryData.rewardHistory.slice(0, 100);
            }

            saveAll();
            notifyListeners('lottery', lotteryData);
            notifyListeners('player', playerData);

            return {
                success: true,
                data: {
                    lotteryData: getLotteryData(),
                    playerData: getPlayerData()
                }
            };
        } catch (e) {
            playerData.coins = snapshot.coins;
            lotteryData.totalDraws = snapshot.totalDraws;
            lotteryData.pityCounter = snapshot.pityCounter;
            lotteryData.totalRewards = snapshot.totalRewards;
            return { success: false, reason: 'commit_error', error: e.message };
        }
    }

    function rollbackLottery(holderId, snapshot) {
        if (snapshot) {
            if (snapshot.playerData) playerData = deepMerge(playerData, snapshot.playerData);
            if (snapshot.lotteryData) lotteryData = deepMerge(lotteryData, snapshot.lotteryData);
            saveAll();
            notifyListeners('lottery', lotteryData);
            notifyListeners('player', playerData);
        }
        return { success: true };
    }

    function subscribe(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
    }

    function notifyListeners(type, data) {
        for (const fn of listeners) {
            try { fn(type, JSON.parse(JSON.stringify(data))); } catch (e) {}
        }
    }

    return {
        init,
        acquireLotteryLock,
        releaseLotteryLock,
        getLotteryLockStatus,
        getLotteryData,
        getPlayerData,
        getAllData,
        updateLotteryData,
        updatePlayerData,
        commitLotteryDraw,
        rollbackLottery,
        subscribe
    };
})();

module.exports = DataCenter;
