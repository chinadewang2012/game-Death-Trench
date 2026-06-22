const http = require('http');
const fs = require('fs');
const path = require('path');

// 允许通过环境变量覆盖端口，避免多人/多实例共享开发机时的端口抢占
const PORT = parseInt(process.env.DELTA_FORCE_PORT, 10) || 8080;
// 安全地获取根目录：优先使用 __dirname（CommonJS），否则回退到 process.cwd()
// 这样即使在某些运行方式下 __dirname 未定义也不会抛出异常（避免类死锁挂起）
let __rootDir = (typeof __dirname !== 'undefined') ? __dirname : process.cwd();
const DIST_DIR = path.resolve(__rootDir);
// 预先规范化为以 '/' 结尾的绝对路径字符串（跨平台一致比较）
const DIST_DIR_NORM = path.normalize(DIST_DIR + path.sep);

const contentTypeMap = {
    '.html': 'text/html; charset=utf-8',
    '.htm': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
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
    '.txt': 'text/plain; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8'
};

function getContentType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return contentTypeMap[ext] || 'application/octet-stream';
}

// 安全解析：规范化后验证不允许跳出 DIST_DIR，防止路径穿越攻击
function safeResolve(requestPath) {
    try {
        if (typeof requestPath !== 'string') return null;
        // 安全手动解码：支持百分号编码（如 %2e%2e 绕过）
        let clean = requestPath;
        // 最多解码 3 次，防止 %25%32%65 形式的多层编码绕过
        for (let i = 0; i < 3; i++) {
            const before = clean;
            try { clean = decodeURIComponent(clean); } catch (e) { break; }
            if (clean === before) break;
        }
        // 额外的硬拦截：解码后仍含 ".." 或 "/\\" 的话拒绝（避免 edge case）
        if (clean.indexOf('..') !== -1) return null;
        if (clean.indexOf('\x00') !== -1) return null;
        // 去除 query / hash
        clean = clean.split('?')[0].split('#')[0];
        // 去除开头的斜杠以便 path.join 正确拼接
        while (clean.startsWith('/') || clean.startsWith('\\')) clean = clean.slice(1);
        if (clean.length === 0) clean = '.';
        const absolute = path.resolve(DIST_DIR, clean);
        // 校验结果必须仍位于 DIST_DIR 内（跨平台一致比较）
        const absNorm = path.normalize(absolute);
        if (absNorm !== DIST_DIR && !(absNorm + path.sep).startsWith(DIST_DIR_NORM)) {
            return null;
        }
        return absNorm;
    } catch (e) {
        return null;
    }
}

function serveFile(res, filePath) {
    fs.stat(filePath, (err, stat) => {
        if (err || !stat.isFile()) {
            if (!res.headersSent) {
                res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            }
            if (!res.destroyed) res.end('404 Not Found');
            return;
        }
        // 限制单个请求的最大体积，避免超大文件撑爆事件循环（类死锁）
        const MAX_BYTES = 64 * 1024 * 1024; // 64MB
        // 关键修复：size 必须是 fs.createReadStream 实际读取的字节数，
        // 否则 Content-Length 与实际传输字节数不匹配，浏览器会等待剩余字节，造成连接挂起（类死锁）
        const fileSize = stat.size || 0;
        const size = Math.min(fileSize, MAX_BYTES);
        res.writeHead(200, {
            'Content-Type': getContentType(filePath),
            'Content-Length': size,
            'Cache-Control': 'no-cache',
            'Connection': 'close'
        });
        // 空文件直接结束，避免 stream "end" 永不触发（类死锁）
        if (size === 0) {
            try { if (!res.destroyed) res.end(); } catch (e) {}
            return;
        }
        // 使用 [0, size - 1] 正好读取 size 字节，与 Content-Length 严格匹配
        const stream = fs.createReadStream(filePath, { start: 0, end: size - 1 });
        // 文件流超时保护：超过10秒未完成则关闭连接，防止挂起
        let streamTimer = null;
        const done = { finished: false }; // 对象而非布尔，确保闭包引用一致
        const safeMarkDone = () => {
            if (done.finished) return false;
            done.finished = true;
            if (streamTimer) {
                clearTimeout(streamTimer);
                streamTimer = null;
            }
            return true;
        };
        streamTimer = setTimeout(() => {
            streamTimer = null;
            if (!safeMarkDone()) return;
            try { if (!res.destroyed) res.destroy(new Error('Stream timeout')); } catch (e) {}
        }, 10000);
        stream.on('error', () => {
            if (!safeMarkDone()) return;
            try { if (!res.destroyed) res.destroy(); } catch (e) {}
        });
        stream.on('end', () => { safeMarkDone(); });
        stream.on('close', () => { safeMarkDone(); });
        // 关键修复：监听 res 的 finish/close，在响应已完成后阻止 stream 继续
        const onResDone = () => {
            if (!safeMarkDone()) return;
            try { stream.destroy(); } catch (e) {}
        };
        res.on('finish', onResDone);
        res.on('close', onResDone);
        stream.pipe(res);
    });
}

const server = http.createServer((req, res) => {
    // 关键修复：使用 Node 原生 setDefaultTimeout 等效的 req.setTimeout，
    // 确保无论请求体还是响应阶段都有读/写超时兜底，
    // 防止恶意慢速客户端占用连接（Slowloris 类死锁）。
    try {
        req.setTimeout(30000, () => {
            try { req.destroy(new Error('Request read timeout')); } catch (e) {}
        });
        res.setTimeout(30000, () => {
            try { res.destroy(new Error('Response write timeout')); } catch (e) {}
        });
    } catch (e) {}

    // 为每个请求设置30秒的整体超时兜底，避免任何未考虑到的路径导致连接挂起（类死锁）
    let overallTimer = null;
    let overallTimerCleared = false;
    const clearOverallTimer = () => {
        if (overallTimerCleared) return;
        overallTimerCleared = true;
        if (overallTimer) {
            clearTimeout(overallTimer);
            overallTimer = null;
        }
    };
    overallTimer = setTimeout(() => {
        try {
            if (res.destroyed || res.finished) return;
            if (!res.headersSent) {
                res.writeHead(408, { 'Content-Type': 'text/plain; charset=utf-8', 'Connection': 'close' });
                res.end('Request Timeout');
            } else {
                res.destroy(new Error('Request timeout'));
            }
        } catch (e) {}
    }, 30000);

    // 确保请求最终都会结束（无论 finish/close/error），避免连接挂起（类死锁）
    res.on('finish', clearOverallTimer);
    res.on('close', clearOverallTimer);
    req.on('end', () => { clearOverallTimer(); /* 请求体结束，解除超时等待 */ });
    req.on('error', () => {
        clearOverallTimer();
        // 关键修复：只有在 res 尚未结束/未发送响应时才尝试写 400；
        // 否则之前的代码路径（例如 safeResolve → 403）已经 end，
        // 再次 res.end 会触发 ERR_STREAM_WRITE_AFTER_END 并使进程崩溃。
        try {
            if (res.destroyed) return;
            if (res.finished) return;
            if (!res.headersSent) {
                res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8', 'Connection': 'close' });
            }
            res.end('Bad Request');
        } catch (e) {}
    });

    // 过滤掉明显非法的请求（比如 Favicon 空路径等）
    // 使用 WHATWG URL 替代 url.parse，避免 DEP0169 警告
    let requestPath = '/';
    try {
        const parsedUrl = new URL(req.url, 'http://localhost');
        requestPath = parsedUrl.pathname || '/';
    } catch (e) {
        if (!res.headersSent) res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('400 Bad Request');
        return;
    }

    let filePath = safeResolve(requestPath);
    if (!filePath) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('403 Forbidden');
        return;
    }

    // 处理目录：自动 index.html；处理文件不存在：404
    try {
        const stat = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
        if (stat && stat.isDirectory()) {
            filePath = path.join(filePath, 'index.html');
        } else if (requestPath === '/') {
            // 根路径：回退到项目根的 index.html
            const fallback = path.join(DIST_DIR, 'index.html');
            if (fs.existsSync(fallback)) {
                filePath = fallback;
            }
        } else if (!fs.existsSync(filePath)) {
            // 具体文件不存在 → 直接返回 404，避免回退 index.html 误导
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('404 Not Found: ' + requestPath);
            return;
        }
    } catch (e) {
        // 无视错误，继续后续处理
    }

    serveFile(res, filePath);
});

// 监听错误处理：端口被占用时给出清晰提示
server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`[ERROR] 端口 ${PORT} 已被占用。请先关闭占用该端口的进程后再启动。`);
        // 尝试列出占用端口的进程（Windows netstat 风格提示）
        try {
            const { exec } = require('child_process');
            exec('netstat -ano | findstr :' + PORT, { windowsHide: true }, (_err, stdout) => {
                if (!_err && stdout && stdout.trim()) {
                    console.error('[INFO] 占用该端口的进程信息：\n' + stdout.trim());
                }
                // 关键修复：使用 gracefulShutdown 确保服务器完全关闭后再退出，
                // 避免子进程未完成或连接未释放导致的端口残留
                gracefulShutdown();
            });
            return;
        } catch (e) {
            gracefulShutdown();
        }
    } else {
        console.error('[ERROR] 服务器错误：', err.message);
        gracefulShutdown();
    }
});

// 关键修复：全局连接超时必须在 server.listen 之前注册，
// 否则在 listen 与事件注册之间建立的连接不会有超时处理，
// 会变成悬挂连接（类死锁资源耗尽）。
server.on('connection', (socket) => {
    socket.setTimeout(60000);
    socket.on('timeout', () => {
        try { socket.destroy(); } catch (e) {}
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`==================================================`);
    console.log(` Death Trench 2D 静态服务器已启动`);
    console.log(` 本地访问: http://localhost:${PORT}`);
    console.log(` 根目录  : ${DIST_DIR}`);
    console.log(`==================================================`);
    // Windows 桌面环境下尝试打开浏览器；使用 setImmediate + 显式忽略回调
    // 避免子进程阻塞事件循环或造成类死锁挂起；非桌面环境（无 START 命令）直接静默忽略。
    if (process.platform === 'win32') {
        setImmediate(() => {
            try {
                const { exec } = require('child_process');
                exec(`start "" "http://localhost:${PORT}"`, { windowsHide: true }, () => {});
            } catch (e) {}
        });
    }
});

// 关键修复：在主进程收到 SIGINT/SIGTERM 时优雅关闭服务器，
// 避免 Ctrl+C 退出后 node 进程/端口残留（这正是之前 8080 被 PID 23832 占用的原因）。
function gracefulShutdown() {
    console.log('\n[SERVER] 收到关闭信号，正在释放端口...');
    server.close(() => {
        console.log('[SERVER] HTTP 服务器已关闭，端口已释放。');
        process.exit(0);
    });
    // 兜底：如果 close 回调未触发（仍有未完成连接），3 秒后强制退出
    setTimeout(() => {
        console.log('[SERVER] 强制退出。');
        process.exit(0);
    }, 3000).unref();
}
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
