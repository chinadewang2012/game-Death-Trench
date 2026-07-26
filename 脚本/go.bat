@echo off
chcp 65001 >nul
title 死亡战壕 - 上线服务器

echo ==================================================
echo   死亡战壕 2D - 上线服务器
echo ==================================================

:: 上线版本只启动普通版（无编辑器）
set PORT=8080

node -e "
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;
const DIST_DIR = process.cwd();
const DIST_DIR_NORM = path.normalize(DIST_DIR + path.sep);

const contentTypeMap = {
    '.html': 'text/html; charset=utf-8',
    '.htm': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
    '.mp3': 'audio/mpeg',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.wav': 'audio/wav',
    '.txt': 'text/plain; charset=utf-8'
};

function getContentType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return contentTypeMap[ext] || 'application/octet-stream';
}

function safeResolve(requestPath) {
    try {
        if (typeof requestPath !== 'string') return null;
        let clean = requestPath;
        for (let i = 0; i < 3; i++) {
            const before = clean;
            try { clean = decodeURIComponent(clean); } catch (e) { break; }
            if (clean === before) break;
        }
        if (clean.indexOf('..') !== -1) return null;
        clean = clean.split('?')[0].split('#')[0];
        while (clean.startsWith('/') || clean.startsWith('\\\\')) clean = clean.slice(1);
        if (clean.length === 0) clean = '.';
        const absolute = path.resolve(DIST_DIR, clean);
        const absNorm = path.normalize(absolute);
        if (absNorm !== DIST_DIR && !(absNorm + path.sep).startsWith(DIST_DIR_NORM)) {
            return null;
        }
        return absNorm;
    } catch (e) { return null; }
}

const server = http.createServer((req, res) => {
    req.setTimeout(30000);
    res.setTimeout(30000);

    let requestPath = '/';
    try {
        const parsedUrl = new URL(req.url, 'http://localhost');
        requestPath = parsedUrl.pathname || '/';
    } catch (e) {
        res.writeHead(400);
        res.end('400 Bad Request');
        return;
    }

    let filePath = safeResolve(requestPath);
    if (!filePath) {
        res.writeHead(403);
        res.end('403 Forbidden');
        return;
    }

    try {
        const stat = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
        if (stat && stat.isDirectory()) {
            filePath = path.join(filePath, 'index.html');
        } else if (requestPath === '/') {
            const fallback = path.join(DIST_DIR, 'index.html');
            if (fs.existsSync(fallback)) filePath = fallback;
        } else if (!fs.existsSync(filePath)) {
            res.writeHead(404);
            res.end('404 Not Found');
            return;
        }
    } catch (e) {}

    fs.stat(filePath, (err, stat) => {
        if (err || !stat.isFile()) {
            res.writeHead(404);
            res.end('404 Not Found');
            return;
        }
        const size = Math.min(stat.size, 64 * 1024 * 1024);
        res.writeHead(200, {
            'Content-Type': getContentType(filePath),
            'Content-Length': size,
            'Cache-Control': 'public, max-age=3600',
            'Connection': 'close'
        });
        if (size === 0) { res.end(); return; }
        fs.createReadStream(filePath, { start: 0, end: size - 1 }).pipe(res);
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log('==================================================');
    console.log('  死亡战壕 2D - 上线服务器已启动');
    console.log('  访问地址: http://localhost:' + PORT);
    console.log('==================================================');
    if (process.platform === 'win32') {
        setImmediate(() => {
            require('child_process').exec('start \"\" \"http://localhost:' + PORT + '\"', { windowsHide: true }, () => {});
        });
    }
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error('[ERROR] 端口 ' + PORT + ' 已被占用');
    } else {
        console.error('[ERROR]', err.message);
    }
    process.exit(1);
});

process.on('SIGINT', () => { server.close(() => process.exit(0)); });
process.on('SIGTERM', () => { server.close(() => process.exit(0)); });
"
