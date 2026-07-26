const fs = require('fs');
const path = require('path');

// 目录定义
const devDir = __dirname;                          // 开发/ 目录（main.js, preload.js 等开发文件）
const projectRoot = path.resolve(devDir, '..');    // 项目根目录（node_modules, package.json）
const webDir = path.join(projectRoot, '网页');      // 网页/ 目录（网页资源）
const exeDir = path.join(projectRoot, 'exe');      // exe/ 目录（输出目录）

function rimraf(p) {
    if (!fs.existsSync(p)) return;
    fs.readdirSync(p).forEach(f => {
        const fp = path.join(p, f);
        try {
            if (fs.lstatSync(fp).isDirectory()) rimraf(fp);
            else fs.unlinkSync(fp);
        } catch (e) {}
    });
    try { fs.rmdirSync(p); } catch (e) {}
}

function copyDir(src, dst, ignore = []) {
    if (!fs.existsSync(dst)) fs.mkdirSync(dst, { recursive: true });
    fs.readdirSync(src).forEach(f => {
        if (ignore.includes(f)) return;
        const sf = path.join(src, f);
        const df = path.join(dst, f);
        if (fs.lstatSync(sf).isDirectory()) copyDir(sf, df, ignore);
        else fs.copyFileSync(sf, df);
    });
}

function copyResources(outDir, appDir, mainJsFile, preloadFile, indexFile, includeTools) {
    console.log('>>> 复制 Electron 运行时...');
    const electronDist = path.join(projectRoot, 'node_modules', 'electron', 'dist');
    if (!fs.existsSync(electronDist)) {
        console.error('[ERROR] 未找到 Electron 运行时: ' + electronDist);
        console.error('[ERROR] 请先在项目根目录运行: npm install');
        process.exit(1);
    }
    copyDir(electronDist, outDir);

    console.log('>>> 复制游戏资源到 resources/app...');
    if (!fs.existsSync(appDir)) fs.mkdirSync(appDir, { recursive: true });

    // index.html 从 web/ 目录复制
    fs.copyFileSync(path.join(webDir, indexFile), path.join(appDir, 'index.html'));
    // main.js, preload.js, data-center.js 从 dev/ 目录复制
    fs.copyFileSync(path.join(devDir, mainJsFile), path.join(appDir, 'main.js'));
    fs.copyFileSync(path.join(devDir, preloadFile), path.join(appDir, 'preload.js'));
    const dataCenterFile = path.join(devDir, 'data-center.js');
    if (fs.existsSync(dataCenterFile)) {
        fs.copyFileSync(dataCenterFile, path.join(appDir, 'data-center.js'));
    }
    // package.json 从项目根目录读取
    const pkgJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
    pkgJson.main = 'main.js';
    fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify(pkgJson, null, 2));

    // 网页资源目录从 web/ 复制
    ['css', 'js', 'picure', 'assets', 'function-graph'].forEach(dir => {
        const src = path.join(webDir, dir);
        if (fs.existsSync(src)) copyDir(src, path.join(appDir, dir), ['node_modules']);
    });

    // 复制 api.js
    const apiFile = path.join(webDir, 'api.js');
    if (fs.existsSync(apiFile)) {
        fs.copyFileSync(apiFile, path.join(appDir, 'api.js'));
    }

    // 仅开发版复制 tools 目录
    if (includeTools) {
        const toolsSrc = path.join(webDir, 'tools');
        if (fs.existsSync(toolsSrc)) {
            console.log('>>> 复制编辑器工具...');
            copyDir(toolsSrc, path.join(appDir, 'tools'), ['node_modules']);
        }
    }
}

function buildVersion(outDir, exeName, mainJsFile, preloadFile, indexFile, includeTools) {
    console.log('\n=== 构建 ' + exeName + ' ===');
    console.log('>>> 清理输出目录...');
    rimraf(outDir);

    const appDir = path.join(outDir, 'resources', 'app');
    copyResources(outDir, appDir, mainJsFile, preloadFile, indexFile, includeTools);

    console.log('>>> 重命名 electron.exe -> ' + exeName + '...');
    const exe = path.join(outDir, 'electron.exe');
    const targetExe = path.join(outDir, exeName);
    if (fs.existsSync(targetExe)) fs.unlinkSync(targetExe);
    if (fs.existsSync(exe)) fs.renameSync(exe, targetExe);

    console.log('>>> 完成: ' + targetExe);
    return targetExe;
}

console.log('========================================');
console.log('  死亡战壕 2D - 构建工具');
console.log('========================================');
console.log('项目根目录: ' + projectRoot);
console.log('网页目录:   ' + webDir);
console.log('开发目录:   ' + devDir);
console.log('输出目录:   ' + exeDir);

// 确保 exe/ 输出目录存在
if (!fs.existsSync(exeDir)) fs.mkdirSync(exeDir, { recursive: true });

// 版本1：标准版（无编辑器）
const normalOut = path.join(exeDir, 'DeathTrench2D-win-x64');
const normalExe = buildVersion(normalOut, '死亡战壕.exe', 'main.js', 'preload.js', 'index.html', false);

// 版本2：开发版（带编辑器）
const devOut = path.join(exeDir, 'DeathTrench2D-Dev-win-x64');
const devExe = buildVersion(devOut, '死亡战壕[开发版].exe', 'main-dev.js', 'preload-dev.js', 'index-dev.html', true);

console.log('\n========================================');
console.log('  构建完成！');
console.log('========================================');
console.log('📦 标准版（无编辑器）:');
console.log('   ' + normalOut);
console.log('📦 开发版（带编辑器，F12打开DevTools）:');
console.log('   ' + devOut);
console.log('========================================');
