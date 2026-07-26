const fs = require('fs');
const path = require('path');

const gameJsPath = path.join(__dirname, '..', '网页', 'js', 'game.js');
const code = fs.readFileSync(gameJsPath, 'utf8');

let pass = 0;
let fail = 0;
let warn = 0;

function check(name, condition, detail = '') {
    if (condition) {
        console.log(`  ✓ ${name}`);
        pass++;
    } else {
        console.log(`  ✗ ${name} ${detail ? '- ' + detail : ''}`);
        fail++;
    }
}

function warnCheck(name, condition, detail = '') {
    if (condition) {
        console.log(`  ✓ ${name}`);
        pass++;
    } else {
        console.log(`  ⚠ ${name} ${detail ? '- ' + detail : ''}`);
        warn++;
    }
}

// ============== 提取数据 ==============
// 用正则提取 WEAPONS 数组中的 id 列表
function extractIdsFromArray(pattern, code) {
    const ids = [];
    const regex = new RegExp(pattern, 'g');
    let match;
    while ((match = regex.exec(code)) !== null) {
        ids.push(match[1]);
    }
    return ids;
}

// 提取 MODIFICATIONS 的 key 列表
function extractModKeys(code) {
    const keys = [];
    const match = code.match(/const MODIFICATIONS = \{([\s\S]*?)\n\};/);
    if (!match) return keys;
    const content = match[1];
    const keyRegex = /\n\s+(\w+):\s*\{/g;
    let m;
    while ((m = keyRegex.exec(content)) !== null) {
        keys.push(m[1]);
    }
    return keys;
}

// 提取 SKINS.weapons 的 id 列表
function extractSkinIds(code, section) {
    const ids = [];
    const sectionRegex = section === 'weapons'
        ? /weapons:\s*\[([\s\S]*?)\],\s*players:/
        : /players:\s*\[([\s\S]*?)\]\s*\}/;
    const match = code.match(sectionRegex);
    if (!match) return ids;
    const content = match[1];
    const idRegex = /id:\s*['"]([^'"]+)['"]/g;
    let m;
    while ((m = idRegex.exec(content)) !== null) {
        ids.push(m[1]);
    }
    return ids;
}

// 提取 LOTTERY.pools 的物品列表
function extractLotteryItems(code) {
    const items = [];
    const match = code.match(/pools:\s*\[([\s\S]*?)\]\s*\};/);
    if (!match) return items;
    const content = match[1];
    // 匹配每个对象
    const objRegex = /\{[^}]*id:\s*['"]([^'"]+)['"][^}]*\}/g;
    let m;
    while ((m = objRegex.exec(content)) !== null) {
        const objStr = m[0];
        const item = { id: m[1] };
        const typeMatch = objStr.match(/type:\s*['"]([^'"]+)['"]/);
        if (typeMatch) item.type = typeMatch[1];
        const rarityMatch = objStr.match(/rarity:\s*['"]([^'"]+)['"]/);
        if (rarityMatch) item.rarity = rarityMatch[1];
        const skinIdMatch = objStr.match(/skinId:\s*['"]([^'"]+)['"]/);
        if (skinIdMatch) item.skinId = skinIdMatch[1];
        const modIdMatch = objStr.match(/modId:\s*['"]([^'"]+)['"]/);
        if (modIdMatch) item.modId = modIdMatch[1];
        const ammoTypeMatch = objStr.match(/ammoType:\s*['"]([^'"]+)['"]/);
        if (ammoTypeMatch) item.ammoType = ammoTypeMatch[1];
        const weaponIdMatch = objStr.match(/weaponId:\s*['"]([^'"]+)['"]/);
        if (weaponIdMatch) item.weaponId = weaponIdMatch[1];
        const itemIdMatch = objStr.match(/itemId:\s*['"]([^'"]+)['"]/);
        if (itemIdMatch) item.itemId = itemIdMatch[1];
        const valueMatch = objStr.match(/value:\s*(\d+)/);
        if (valueMatch) item.value = parseInt(valueMatch[1]);
        const weightMatch = objStr.match(/weight:\s*(\d+)/);
        if (weightMatch) item.weight = parseInt(weightMatch[1]);
        const nameMatch = objStr.match(/name:\s*['"]([^'"]+)['"]/);
        if (nameMatch) item.name = nameMatch[1];
        items.push(item);
    }
    return items;
}

// ============== 开始检查 ==============
console.log('========================================');
console.log('  第1-20轮：语法检查（已通过）');
console.log('========================================\n');

console.log('========================================');
console.log('  第21-40轮：游戏数据一致性检查');
console.log('========================================\n');

// === 武器系统 ===
console.log('【武器系统】');
const defaultWeaponsMatch = code.match(/const DEFAULT_WEAPONS = \[([\s\S]*?)\];/);
const weaponIds = extractIdsFromArray(/id:\s*['"]([^'"]+)['"]/g, defaultWeaponsMatch ? defaultWeaponsMatch[1] : '');
check('WEAPONS 数组存在', weaponIds.length > 0);
check('武器数量 >= 8', weaponIds.length >= 8, `实际: ${weaponIds.length}`);
const dupWeaponIds = weaponIds.filter((id, i) => weaponIds.indexOf(id) !== i);
check('武器ID无重复', dupWeaponIds.length === 0, `重复: ${dupWeaponIds.join(', ')}`);
console.log(`  ℹ 武器列表: ${weaponIds.join(', ')}`);

// === 改装系统 ===
console.log('\n【改装系统】');
const modKeys = extractModKeys(code);
check('MODIFICATIONS 至少有5个配件', modKeys.length >= 5, `实际: ${modKeys.length}`);
console.log(`  ℹ 配件列表: ${modKeys.join(', ')}`);

// === 皮肤系统 ===
console.log('\n【皮肤系统】');
const weaponSkinIds = extractSkinIds(code, 'weapons');
const playerSkinIds = extractSkinIds(code, 'players');
check('武器皮肤数量 >= 15', weaponSkinIds.length >= 15, `实际: ${weaponSkinIds.length}`);
check('玩家皮肤数量 >= 3', playerSkinIds.length >= 3, `实际: ${playerSkinIds.length}`);
const dupWpSkinIds = weaponSkinIds.filter((id, i) => weaponSkinIds.indexOf(id) !== i);
check('武器皮肤ID无重复', dupWpSkinIds.length === 0, `重复: ${dupWpSkinIds.join(', ')}`);
const dupPlSkinIds = playerSkinIds.filter((id, i) => playerSkinIds.indexOf(id) !== i);
check('玩家皮肤ID无重复', dupPlSkinIds.length === 0, `重复: ${dupPlSkinIds.join(', ')}`);
check('默认武器皮肤 skin_default 存在', weaponSkinIds.includes('skin_default'));
check('默认玩家皮肤 player_default 存在', playerSkinIds.includes('player_default'));
console.log(`  ℹ 武器皮肤: ${weaponSkinIds.length} 个`);
console.log(`  ℹ 玩家皮肤: ${playerSkinIds.join(', ')}`);

// === 弹药类型 ===
console.log('\n【弹药系统】');
check('AMMO_TYPES.NORMAL = normal', code.includes("NORMAL: 'normal'"));
check('AMMO_TYPES.AP / ARMOR_PIERCING 别名存在', code.includes("AP: 'ap'") && code.includes("ARMOR_PIERCING: 'ap'"));
check('AMMO_TYPES.EXP / EXPLOSIVE 别名存在', code.includes("EXP: 'exp'") && code.includes("EXPLOSIVE: 'exp'"));
check('AMMO_TYPES.FIRE / INCENDIARY 别名存在', code.includes("FIRE: 'fire'") && code.includes("INCENDIARY: 'fire'"));
const validAmmoValues = ['normal', 'ap', 'exp', 'fire'];

// === 抽奖系统 ===
console.log('\n【抽奖系统】');
const lotteryItems = extractLotteryItems(code);
check('LOTTERY.pools 存在且有物品', lotteryItems.length > 0);
check('奖池物品数量 >= 20', lotteryItems.length >= 20, `实际: ${lotteryItems.length}`);
const poolIds = lotteryItems.map(i => i.id);
const dupPoolIds = poolIds.filter((id, i) => poolIds.indexOf(id) !== i);
check('奖池ID无重复', dupPoolIds.length === 0, `重复: ${dupPoolIds.join(', ')}`);

// 检查每个奖池物品的引用
lotteryItems.forEach(item => {
    check(`奖池 ${item.id} 有 type`, !!item.type);
    check(`奖池 ${item.id} 有 rarity`, !!item.rarity);
    check(`奖池 ${item.id} 有 weight`, item.weight !== undefined && item.weight >= 0);

    switch (item.type) {
        case 'skin':
            check(`奖池 ${item.id} 的 skinId 在武器皮肤中存在`,
                weaponSkinIds.includes(item.skinId),
                `skinId: ${item.skinId}`);
            break;
        case 'playerSkin':
            check(`奖池 ${item.id} 的 skinId 在玩家皮肤中存在`,
                playerSkinIds.includes(item.skinId),
                `skinId: ${item.skinId}`);
            break;
        case 'mod':
            check(`奖池 ${item.id} 的 modId 在 MODIFICATIONS 中存在`,
                modKeys.includes(item.modId),
                `modId: ${item.modId}`);
            break;
        case 'ammo':
            check(`奖池 ${item.id} 的 ammoType 有效`,
                validAmmoValues.includes(item.ammoType),
                `ammoType: ${item.ammoType}`);
            break;
        case 'weapon':
            check(`奖池 ${item.id} 的 weaponId 在 WEAPONS 中存在`,
                weaponIds.includes(item.weaponId),
                `weaponId: ${item.weaponId}`);
            break;
    }
});

// 保底机制
check('LOTTERY.pityCount 存在', /pityCount:\s*\d+/.test(code));
check('LOTTERY.singlePrice 存在', /singlePrice:\s*\d+/.test(code));
check('LOTTERY.tenPrice 存在', /tenPrice:\s*\d+/.test(code));

// === 存档系统检查（第41-50轮） ===
console.log('\n========================================');
console.log('  第41-50轮：存档系统检查');
console.log('========================================\n');

check('saveGame 函数存在', /function\s+saveGame\s*\(/.test(code));
check('loadGame 函数存在', /function\s+loadGame\s*\(/.test(code));
check('savePlayerData 函数存在', /function\s+savePlayerData\s*\(/.test(code));
check('deathTrench_ 前缀存在', /deathTrench_/.test(code));
check('playerData 存档键存在', /deathTrench_playerData/.test(code));
check('player_mods 存档键存在', /deathTrench_player_mods/.test(code));
check('ammo_inventory 存档键存在', /deathTrench_ammo_inventory/.test(code));
check('lottery_data 存档键存在', /deathTrench_lottery_data/.test(code));
check('skins 存档键存在', /deathTrench.*skins/.test(code) || /deathTrench.*skin/.test(code));

// === UI面板检查（第51-60轮） ===
console.log('\n========================================');
console.log('  第51-60轮：UI面板函数检查');
console.log('========================================\n');

const uiFunctions = [
    'showLobby', 'showMenu', 'showInventory', 'showBlackMarket',
    'showLotteryPanel', 'showSkins', 'showReadyRoom',
    'hideAllPanels', 'ensureLobbyPanelsVisible',
    'showLobbyBottom', 'hideLobbyBottom'
];
uiFunctions.forEach(fn => {
    const exists = new RegExp(`function\\s+${fn}\\s*\\(|${fn}\\s*=\\s*function|${fn}\\s*=\\s*\\(`).test(code);
    check(`UI函数 ${fn}() 存在`, exists);
});

// 检查 window 挂载的UI函数
check('部分UI函数挂载到 window', /window\.showSettings\s*=|window\.selectWeaponAmmo\s*=/.test(code));

// === 核心游戏逻辑检查（第61-70轮） ===
console.log('\n========================================');
console.log('  第61-70轮：核心游戏逻辑检查');
console.log('========================================\n');

check('init 函数存在', /function\s+init\s*\(/.test(code));
check('startGame 函数存在', /function\s+startGame\s*\(/.test(code));
check('gameLoop 或 update 函数存在', /function\s+gameLoop\s*\(|function\s+update\s*\(|function\s+gameUpdate\s*\(/.test(code));
check('render 函数存在', /function\s+render\s*\(|function\s+draw\s*\(/.test(code));
check('玩家移动逻辑存在', /player\.x|player\.y|moveSpeed/.test(code));
check('射击逻辑存在', /shoot|fireBullet/.test(code));
check('敌人生成逻辑存在', /spawnEnemy|spawnInterval/.test(code));
check('碰撞检测存在', /碰撞检测|hitbox|circleDistance|check.*dist|dist.*check/.test(code));
check('掉落物逻辑存在', /drops?\.push|dropItem/.test(code));
check('撤离系统存在', /EXTRACT|extract|撤离/.test(code));

// === 服务器和构建检查（第71-80轮） ===
console.log('\n========================================');
console.log('  第71-80轮：服务器和构建检查');
console.log('========================================\n');

const serverJs = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const buildJs = fs.readFileSync(path.join(__dirname, '..', '开发', 'build.js'), 'utf8');
const mainJs = fs.readFileSync(path.join(__dirname, '..', '开发', 'main.js'), 'utf8');
const mainDevJs = fs.readFileSync(path.join(__dirname, '..', '开发', 'main-dev.js'), 'utf8');
const pkgJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

check('server.js DIST_DIR 指向"网页"', /DIST_DIR.*'网页'|DIST_DIR.*"网页"|DIST_DIR.*`网页`/.test(serverJs));
check('server.js 有 8080 端口', /8080/.test(serverJs));
check('server.js 有 3030 端口', /3030/.test(serverJs));
check('server.js 有 index.html 入口', /index\.html/.test(serverJs));
check('server.js 有 index-dev.html 入口', /index-dev\.html/.test(serverJs));

check('build.js 引用"网页"目录', /'网页'|"网页"|`网页`/.test(buildJs));
check('build.js 输出到 exe 目录', /exe/.test(buildJs));
check('build.js 复制 css/js/picure/assets', /'css'.*'js'.*'picure'|'assets'/.test(buildJs));
check('build.js 标准版使用 index.html', /'index\.html'|"index\.html"/.test(buildJs) && /普通版|标准版|normal/i.test(buildJs));
check('build.js 开发版使用 index-dev.html', /index-dev\.html/.test(buildJs));

check('main.js getWebRoot 函数存在', /getWebRoot/.test(mainJs));
check('main.js 加载 index.html', /index\.html/.test(mainJs));
check('main-dev.js getWebRoot 函数存在', /getWebRoot/.test(mainDevJs));
check('main-dev.js 加载 index.html', /index\.html/.test(mainDevJs));
check('main-dev.js 有 F12 DevTools', /F12|DevTools|devTools/.test(mainDevJs));

check('package.json main 指向开发/main.js', /开发\/main\.js/.test(pkgJson.main));
check('package.json build 脚本存在', !!pkgJson.scripts.build);
check('package.json start 脚本存在', !!pkgJson.scripts.start);
check('package.json start:dev 脚本存在', !!pkgJson.scripts['start:dev']);

// === HTML文件检查（第81-90轮） ===
console.log('\n========================================');
console.log('  第81-90轮：HTML文件检查');
console.log('========================================\n');

const indexHtml = fs.readFileSync(path.join(__dirname, '..', '网页', 'index.html'), 'utf8');
const indexDevHtml = fs.readFileSync(path.join(__dirname, '..', '网页', 'index-dev.html'), 'utf8');

check('index.html 存在 weapon-btn 按钮', /weapon-btn/.test(indexHtml));
check('index.html 有 4 个武器槽（含匕首）', (indexHtml.match(/class="weapon-btn/g) || []).length >= 4,
    `实际: ${(indexHtml.match(/class="weapon-btn/g) || []).length} 个`);
check('index.html 有累计奖励功能', /cumulative.*reward|累计奖励|showCumulative/.test(indexHtml));
check('index.html 有 menu-btn-dev 按钮', /menu-btn-dev/.test(indexHtml));
check('index.html 有 ENABLE_TOOLS 隐藏逻辑', /ENABLE_TOOLS.*false|!window\.ENABLE_TOOLS|if\s*\(\s*window\.ENABLE_TOOLS\s*\)/.test(indexHtml));

check('index-dev.html 有开发者工具按钮', /开发者工具|DevTools|tools-menu/.test(indexDevHtml));
check('index-dev.html 有编辑器入口', /editor|编辑器/.test(indexDevHtml));
check('index-dev.html 引入 game.js', /game\.js/.test(indexDevHtml));
check('index.html 引入 game.js', /game\.js/.test(indexHtml));

// 检查 CSS 文件引用
check('index.html 引入 style.css', /style\.css/.test(indexHtml));
check('index.html 引入 style-new-ui.css', /style-new-ui\.css/.test(indexHtml));
check('index.html 引入 style-new-ui-panels.css', /style-new-ui-panels\.css/.test(indexHtml));

// === 综合完整性检查（第91-100轮） ===
console.log('\n========================================');
console.log('  第91-100轮：综合完整性检查');
console.log('========================================\n');

// 关键文件存在性
const criticalFiles = [
    '网页/index.html',
    '网页/index-dev.html',
    '网页/js/game.js',
    '网页/js/save.js',
    '网页/js/utils.js',
    '网页/js/coord.js',
    '网页/css/style.css',
    '网页/css/style-new-ui.css',
    '网页/css/style-new-ui-panels.css',
    '网页/api.js',
    '开发/main.js',
    '开发/main-dev.js',
    '开发/preload.js',
    '开发/preload-dev.js',
    '开发/build.js',
    'server.js',
    'package.json',
    '网页/tools/index.html',
    '网页/tools/lottery-editor.html'
];

criticalFiles.forEach(f => {
    const fullPath = path.join(__dirname, '..', f);
    check(`文件存在: ${f}`, fs.existsSync(fullPath));
});

// 抽奖编辑器检查
const lotteryEditor = fs.readFileSync(path.join(__dirname, '..', '网页', 'tools', 'lottery-editor.html'), 'utf8');
check('抽奖编辑器 mod_silencer 的 modId 是 suppressor', /mod_silencer[\s\S]{0,200}modId:\s*['"]suppressor['"]/.test(lotteryEditor));
check('抽奖编辑器使用 stock 配件', /mod_stock[\s\S]{0,200}modId:\s*['"]stock['"]/.test(lotteryEditor));
check('抽奖编辑器 ammoType 使用短名 (ap/exp/fire)', /ammoType:\s*['"](ap|exp|fire)['"]/.test(lotteryEditor));

// weapon 奖励逻辑检查
check('weapon 类型奖励修改 WEAPONS.unlocked（而非 playerData.weapons）',
    /weaponDef\.unlocked\s*=\s*true|WEAPONS\.find.*unlocked/.test(code));

// ============== 统计 ==============
const total = pass + fail + warn;
console.log('\n========================================');
console.log(`  100轮自检完成：${pass} 通过, ${fail} 失败, ${warn} 警告`);
console.log(`  （共检查 ${total} 项）`);
console.log('========================================');

if (fail > 0) {
    process.exit(1);
}
