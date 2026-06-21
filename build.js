const fs = require('fs');
const path = require('path');

const root = __dirname;

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

function copyResources(outDir, appDir, mainJsFile, includeTools) {
    console.log('>>> 复制 Electron 运行时...');
    const electronDist = path.join(root, 'node_modules', 'electron', 'dist');
    copyDir(electronDist, outDir);

    console.log('>>> 复制游戏资源到 resources/app...');
    if (!fs.existsSync(appDir)) fs.mkdirSync(appDir, { recursive: true });

    fs.copyFileSync(path.join(root, 'index.html'), path.join(appDir, 'index.html'));
    fs.copyFileSync(path.join(root, mainJsFile), path.join(appDir, 'main.js'));
    fs.copyFileSync(path.join(root, 'preload.js'), path.join(appDir, 'preload.js'));
    const pkgJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    pkgJson.main = 'main.js';
    fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify(pkgJson, null, 2));

    ['css', 'js', 'picure'].forEach(dir => {
        const src = path.join(root, dir);
        if (fs.existsSync(src)) copyDir(src, path.join(appDir, dir), ['node_modules']);
    });

    // 仅开发版复制 tools 目录
    if (includeTools) {
        const toolsSrc = path.join(root, 'tools');
        if (fs.existsSync(toolsSrc)) {
            console.log('>>> 复制编辑器工具...');
            copyDir(toolsSrc, path.join(appDir, 'tools'), ['node_modules']);
        }
    }
}

function buildVersion(outDir, exeName, mainJsFile, includeTools) {
    console.log('\n=== 构建 ' + exeName + ' ===');
    console.log('>>> 清理输出目录...');
    rimraf(outDir);

    const appDir = path.join(outDir, 'resources', 'app');
    copyResources(outDir, appDir, mainJsFile, includeTools);

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

// 版本1：标准版（无编辑器）
const normalOut = path.join(root, 'dist', 'DeathTrench2D-win-x64');
const normalExe = buildVersion(normalOut, '死亡战壕.exe', 'main.js', false);

// 版本2：开发版（带编辑器）
const devOut = path.join(root, 'dist', 'DeathTrench2D-Dev-win-x64');
const devExe = buildVersion(devOut, '死亡战壕[开发版].exe', 'main-dev.js', true);

console.log('\n========================================');
console.log('  构建完成！');
console.log('========================================');
console.log('📦 标准版（无编辑器）:');
console.log('   ' + normalOut);
console.log('📦 开发版（带编辑器，F12打开DevTools）:');
console.log('   ' + devOut);
console.log('========================================');
