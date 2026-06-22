const SaveManager = (() => {
    const ENCRYPTION_KEY = 'DeathTrench2D_SaveKey_2026';
    const AUTO_SAVE_KEY = 'deathTrench_auto_save';
    const SAVE_SLOT_PREFIX = 'deathTrench_save_slot_';

    function xorEncrypt(str, key) {
        let result = '';
        for (let i = 0; i < str.length; i++) {
            result += String.fromCharCode(str.charCodeAt(i) ^ key.charCodeAt(i % key.length));
        }
        return btoa(result);
    }

    function xorDecrypt(encrypted, key) {
        try {
            const decoded = atob(encrypted);
            let result = '';
            for (let i = 0; i < decoded.length; i++) {
                result += String.fromCharCode(decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length));
            }
            return result;
        } catch (e) {
            return null;
        }
    }

    // 关键：存档写入互斥锁，防止同帧多次保存/导入时交错造成 localStorage 脏数据（类死锁）
    let _saveLockHeld = false;
    // 锁超时兜底：若锁被卡住超过 5 秒则强制释放，避免单次异常造成永久死锁
    let _saveLockTimer = null;
    function _acquireSaveLock() {
        if (_saveLockHeld) return false;
        _saveLockHeld = true;
        if (_saveLockTimer) { try { clearTimeout(_saveLockTimer); } catch (e) {} }
        _saveLockTimer = setTimeout(() => {
            // 5 秒兜底：强制释放锁，并打印警告，避免死锁
            if (_saveLockHeld) {
                console.warn('[SaveManager] Lock timeout: force-releasing save lock.');
                _saveLockHeld = false;
            }
            _saveLockTimer = null;
        }, 5000);
        return true;
    }
    function _releaseSaveLock() {
        if (!_saveLockHeld) return;
        _saveLockHeld = false;
        if (_saveLockTimer) {
            try { clearTimeout(_saveLockTimer); } catch (e) {}
            _saveLockTimer = null;
        }
    }

    function autoSave(data) {
        if (!_acquireSaveLock()) {
            console.warn('[SaveManager] autoSave skipped: another save is in progress.');
            return false;
        }
        try {
            const saveData = {
                ...data,
                timestamp: new Date().toISOString(),
                version: '1.0.0'
            };
            const jsonStr = JSON.stringify(saveData);
            const encrypted = xorEncrypt(jsonStr, ENCRYPTION_KEY);
            if (!encrypted) throw new Error('Encryption failed');
            localStorage.setItem(AUTO_SAVE_KEY, encrypted);
            return true;
        } catch (e) {
            console.error('Auto save failed:', e);
            return false;
        } finally {
            _releaseSaveLock();
        }
    }

    function loadAutoSave() {
        try {
            const savedData = localStorage.getItem(AUTO_SAVE_KEY);
            if (!savedData) {
                return { success: false, message: 'No auto save found' };
            }

            const decrypted = xorDecrypt(savedData, ENCRYPTION_KEY);
            if (!decrypted) {
                return { success: false, message: 'Save data corrupted or invalid' };
            }

            const data = JSON.parse(decrypted);
            if (!data.playerData || !data.settings) {
                return { success: false, message: 'Invalid save format' };
            }

            return { success: true, data: data };
        } catch (e) {
            return { success: false, message: 'Load failed: ' + e.message };
        }
    }

    function saveToSlot(slotIndex, data) {
        if (!_acquireSaveLock()) {
            console.warn('[SaveManager] saveToSlot skipped: another save is in progress.');
            return false;
        }
        try {
            const saveData = {
                ...data,
                timestamp: new Date().toISOString(),
                version: '1.0.0',
                slotIndex: slotIndex
            };
            const jsonStr = JSON.stringify(saveData);
            const encrypted = xorEncrypt(jsonStr, ENCRYPTION_KEY);
            if (!encrypted) throw new Error('Encryption failed');
            localStorage.setItem(SAVE_SLOT_PREFIX + slotIndex, encrypted);
            return true;
        } catch (e) {
            console.error('Save to slot failed:', e);
            return false;
        } finally {
            _releaseSaveLock();
        }
    }

    function loadFromSlot(slotIndex) {
        try {
            const savedData = localStorage.getItem(SAVE_SLOT_PREFIX + slotIndex);
            if (!savedData) {
                return { success: false, message: 'Slot ' + slotIndex + ' is empty' };
            }

            const decrypted = xorDecrypt(savedData, ENCRYPTION_KEY);
            if (!decrypted) {
                return { success: false, message: 'Save data corrupted or invalid' };
            }

            const data = JSON.parse(decrypted);
            return { success: true, data: data };
        } catch (e) {
            return { success: false, message: 'Load failed: ' + e.message };
        }
    }

    function getSlotInfo(slotIndex) {
        try {
            const savedData = localStorage.getItem(SAVE_SLOT_PREFIX + slotIndex);
            if (!savedData) {
                return null;
            }

            const decrypted = xorDecrypt(savedData, ENCRYPTION_KEY);
            if (!decrypted) {
                return null;
            }

            const data = JSON.parse(decrypted);
            return {
                slotIndex: slotIndex,
                timestamp: data.timestamp,
                coins: data.playerData?.coins || 0,
                totalKills: data.playerData?.totalKills || 0,
                totalScore: data.playerData?.totalScore || 0,
                equippedArmor: data.playerData?.equippedArmor || ''
            };
        } catch (e) {
            return null;
        }
    }

    function getAllSlots() {
        const slots = [];
        for (let i = 1; i <= 5; i++) {
            const info = getSlotInfo(i);
            slots.push(info ? info : { slotIndex: i, empty: true });
        }
        return slots;
    }

    function deleteSlot(slotIndex) {
        localStorage.removeItem(SAVE_SLOT_PREFIX + slotIndex);
    }

    function exportSave() {
        const result = loadAutoSave();
        if (!result.success) {
            return null;
        }
        return JSON.stringify(result.data, null, 2);
    }

    function validateSaveData(data) {
        const errors = [];

        if (!data) {
            return { valid: false, errors: ['数据为空'] };
        }

        if (!data.playerData) {
            errors.push('缺少玩家数据(playerData)');
        } else {
            if (typeof data.playerData.coins !== 'number') {
                errors.push('金币数据类型错误');
            }
            if (typeof data.playerData.totalKills !== 'number') {
                errors.push('击杀数数据类型错误');
            }
            if (typeof data.playerData.totalScore !== 'number') {
                errors.push('得分数据类型错误');
            }
            if (data.playerData.inventory && typeof data.playerData.inventory !== 'object') {
                errors.push('背包数据格式错误');
            }
        }

        if (!data.settings) {
            errors.push('缺少设置数据(settings)');
        } else {
            if (data.settings.difficulty && !['easy', 'normal', 'hard', 'extreme'].includes(data.settings.difficulty)) {
                errors.push('难度值无效');
            }
            if (typeof data.settings.playerSpeed !== 'number' || data.settings.playerSpeed < 50 || data.settings.playerSpeed > 150) {
                errors.push('玩家速度值无效(应为50-150)');
            }
            if (typeof data.settings.enemyCount !== 'number' || data.settings.enemyCount < 1 || data.settings.enemyCount > 20) {
                errors.push('敌人数量值无效(应为1-20)');
            }
        }

        return {
            valid: errors.length === 0,
            errors: errors
        };
    }

    function importSave(jsonString) {
        if (!_acquireSaveLock()) {
            return { success: false, message: '导入失败：正在进行保存操作，请稍后重试' };
        }
        try {
            const data = JSON.parse(jsonString);

            const validation = validateSaveData(data);
            if (!validation.valid) {
                return {
                    success: false,
                    message: '存档验证失败: ' + validation.errors.join(', ')
                };
            }

            const saveData = {
                playerData: {
                    coins: Math.max(0, Math.min(999999, data.playerData.coins || 0)),
                    totalKills: Math.max(0, data.playerData.totalKills || 0),
                    totalScore: Math.max(0, data.playerData.totalScore || 0),
                    equippedArmor: data.playerData.equippedArmor || '',
                    selectedMap: data.playerData.selectedMap || 'desert',
                    inventory: {
                        medkits: Math.max(0, Math.min(99, data.playerData.inventory?.medkits || 0)),
                        armor: data.playerData.inventory?.armor || '',
                        grenades: Math.max(0, Math.min(99, data.playerData.inventory?.grenades || 0)),
                        ammoBox: Math.max(0, Math.min(99, data.playerData.inventory?.ammoBox || 0)),
                        speedBoost: Math.max(0, Math.min(99, data.playerData.inventory?.speedBoost || 0))
                    }
                },
                settings: {
                    difficulty: data.settings?.difficulty || 'normal',
                    playerSpeed: Math.max(50, Math.min(200, data.settings?.playerSpeed || 100)),
                    enemyCount: Math.max(1, Math.min(20, data.settings?.enemyCount || 5))
                },
                timestamp: new Date().toISOString(),
                version: '1.0.0'
            };

            const jsonStr = JSON.stringify(saveData);
            const encrypted = xorEncrypt(jsonStr, ENCRYPTION_KEY);
            if (!encrypted) throw new Error('Encryption failed');
            localStorage.setItem(AUTO_SAVE_KEY, encrypted);

            return {
                success: true,
                message: '存档导入成功！',
                data: saveData
            };
        } catch (e) {
            return { success: false, message: '导入失败: ' + e.message };
        } finally {
            _releaseSaveLock();
        }
    }

    function importFromFile(file) {
        return new Promise((resolve, reject) => {
            if (!file) {
                reject({ success: false, message: '未选择文件' });
                return;
            }
            
            if (!file.name.endsWith('.json')) {
                reject({ success: false, message: '文件格式错误，请选择JSON文件' });
                return;
            }
            
            if (file.size > 1024 * 1024) {
                reject({ success: false, message: '文件过大，最大支持1MB' });
                return;
            }
            
            const reader = new FileReader();
            // 关键修复：添加超时保护，防止 FileReader 挂起导致 Promise 永不 resolve
            const READ_TIMEOUT = 5000; // 5秒超时
            const timeoutGuard = setTimeout(() => {
                try { reader.abort(); } catch (e) {}
                reject({ success: false, message: '文件读取超时' });
            }, READ_TIMEOUT);
            
            reader.onload = function(e) {
                clearTimeout(timeoutGuard);
                try {
                    const result = importSave(e.target.result);
                    if (result.success) {
                        resolve(result);
                    } else {
                        reject(result);
                    }
                } catch (e) {
                    reject({ success: false, message: '文件解析失败: ' + e.message });
                }
            };
            reader.onerror = function() {
                clearTimeout(timeoutGuard);
                reject({ success: false, message: '文件读取失败' });
            };
            reader.onabort = function() {
                clearTimeout(timeoutGuard);
                reject({ success: false, message: '文件读取被中止' });
            };
            reader.readAsText(file);
        });
    }

    function hasAutoSave() {
        return localStorage.getItem(AUTO_SAVE_KEY) !== null;
    }

    function clearAllSaves() {
        localStorage.removeItem(AUTO_SAVE_KEY);
        for (let i = 1; i <= 5; i++) {
            localStorage.removeItem(SAVE_SLOT_PREFIX + i);
        }
    }

    return {
        autoSave,
        loadAutoSave,
        saveToSlot,
        loadFromSlot,
        getSlotInfo,
        getAllSlots,
        deleteSlot,
        exportSave,
        importSave,
        importFromFile,
        validateSaveData,
        hasAutoSave,
        clearAllSaves
    };
})();
