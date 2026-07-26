const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const API_PORT = 3000;
const CACHE_DIR = path.join(__dirname, 'api_cache');

if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function generateMapPreview(theme, width, height) {
    const TILE_SIZE = 40;
    const COLS = Math.floor(width / TILE_SIZE);
    const ROWS = Math.floor(height / TILE_SIZE);

    const colors = {
        desert: { ground: '#2d2d1a', obstacle: '#8b7355', cover: '#4a3728', building: '#6b5344', water: '#1e3a5f' },
        city: { ground: '#2a2a2a', obstacle: '#4a4a4a', cover: '#3a3a5a', building: '#5a5a6a', water: '#1e3a5f' },
        factory: { ground: '#252525', obstacle: '#4a4a4a', cover: '#3a4a5a', building: '#5a5a7a', water: '#1e3a3f' },
        jungle: { ground: '#1a2d1a', obstacle: '#2a4a2a', cover: '#1a3a4a', building: '#3a3a4a', water: '#1e3a3f' },
        snow: { ground: '#4a4a5a', obstacle: '#6a6a7a', cover: '#5a6a8a', building: '#7a7a8a', water: '#3a5a7a' }
    };

    const c = colors[theme] || colors.desert;
    const seed = 12345;

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" style="background:${c.ground}">`;

    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
            let rand = ((seed * (x + 1) * (y + 1)) % 233280) / 233280;
            let type = 'ground';
            let color = c.ground;

            if (rand < 0.08) {
                type = 'obstacle';
                color = c.obstacle;
            } else if (rand < 0.14) {
                type = 'cover';
                color = c.cover;
            } else if (rand < 0.18) {
                type = 'building';
                color = c.building;
            } else if (rand < 0.20 && theme !== 'snow') {
                type = 'water';
                color = c.water;
            }

            if (type !== 'ground') {
                svg += `<rect x="${x * TILE_SIZE}" y="${y * TILE_SIZE}" width="${TILE_SIZE}" height="${TILE_SIZE}" fill="${color}" stroke="${c.ground}" stroke-width="1"/>`;
            }
        }
    }

    svg += '</svg>';
    return svg;
}

function generateWeaponIcon(weaponType) {
    const icons = {
        pistol: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
            <rect x="20" y="28" width="30" height="8" fill="#4a4a4a" rx="2"/>
            <rect x="16" y="30" width="8" height="4" fill="#2a2a2a" rx="1"/>
            <rect x="45" y="26" width="6" height="12" fill="#333" rx="1"/>
            <circle cx="48" cy="32" r="3" fill="#ff4444"/>
        </svg>`,
        rifle: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
            <rect x="10" y="26" width="44" height="8" fill="#4a4a4a" rx="2"/>
            <rect x="8" y="30" width="8" height="4" fill="#2a2a2a" rx="1"/>
            <rect x="48" y="24" width="8" height="12" fill="#333" rx="1"/>
            <rect x="14" y="22" width="20" height="4" fill="#666" rx="1"/>
            <circle cx="52" cy="30" r="3" fill="#ff4444"/>
        </svg>`,
        sniper: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
            <rect x="8" y="30" width="48" height="4" fill="#4a4a4a" rx="1"/>
            <rect x="6" y="31" width="6" height="2" fill="#2a2a2a"/>
            <rect x="50" y="28" width="8" height="8" fill="#333" rx="1"/>
            <circle cx="54" cy="32" r="4" fill="#4488ff" opacity="0.5"/>
            <rect x="16" y="26" width="24" height="2" fill="#666"/>
        </svg>`
    };

    return icons[weaponType] || icons.pistol;
}

function generatePlayerAvatar(style) {
    const colors = {
        default: { body: '#00cc66', glow: '#00ff88' },
        elite: { body: '#ffaa00', glow: '#ffcc00' },
        stealth: { body: '#6666ff', glow: '#8888ff' }
    };

    const c = colors[style] || colors.default;

    return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
        <defs>
            <radialGradient id="glow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" style="stop-color:${c.glow};stop-opacity:0.3"/>
                <stop offset="100%" style="stop-color:${c.glow};stop-opacity:0"/>
            </radialGradient>
        </defs>
        <circle cx="64" cy="64" r="50" fill="url(#glow)"/>
        <path d="M64 30 L90 64 L64 64 L38 64 Z" fill="url(#glow)" opacity="0.5"/>
        <path d="M64 40 L85 64 L75 64 L64 48 L53 64 L43 64 Z" fill="url(#glow)" opacity="0.7"/>
        <path d="M80 64 L55 45 L60 64 L55 83 Z" fill="url(#glow)"/>
        <circle cx="64" cy="64" r="20" fill="${c.body}"/>
        <circle cx="64" cy="64" r="15" fill="${c.glow}" opacity="0.5"/>
        <circle cx="64" cy="64" r="8" fill="#fff"/>
    </svg>`;
}

function generateRankBadge(rank) {
    const badges = {
        bronze: { color: '#cd7f32', stars: 1 },
        silver: { color: '#c0c0c0', stars: 2 },
        gold: { color: '#ffd700', stars: 3 },
        platinum: { color: '#e5e4e2', stars: 4 },
        diamond: { color: '#b9f2ff', stars: 5 }
    };

    const b = badges[rank] || badges.bronze;
    let stars = '';
    for (let i = 0; i < b.stars; i++) {
        stars += `<polygon points="${32 + i * 16 - (b.stars - 1) * 8},20 ${34 + i * 16 - (b.stars - 1) * 8},26 ${40 + i * 16 - (b.stars - 1) * 8},26 ${36 + i * 16 - (b.stars - 1) * 8},30 ${38 + i * 16 - (b.stars - 1) * 8},36 ${32 + i * 16 - (b.stars - 1) * 8},32 ${26 + i * 16 - (b.stars - 1) * 8},36 ${28 + i * 16 - (b.stars - 1) * 8},30 ${24 + i * 16 - (b.stars - 1) * 8},26 ${30 + i * 16 - (b.stars - 1) * 8},26" fill="#fff"/>`;
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r="28" fill="${b.color}" stroke="#fff" stroke-width="2"/>
        <circle cx="32" cy="32" r="22" fill="none" stroke="#fff" stroke-width="1" opacity="0.5"/>
        ${stars}
    </svg>`;
}

function parseQuery(reqUrl) {
    const parsed = url.parse(reqUrl, true);
    return parsed.query;
}

function sendJson(res, data) {
    try {
        if (!res.headersSent) {
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        }
        if (!res.destroyed) res.end(JSON.stringify(data, null, 2));
    } catch (e) {}
}

function sendSvg(res, svg) {
    try {
        if (!res.headersSent) {
            res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
        }
        if (!res.destroyed) res.end(svg);
    } catch (e) {}
}

function sendError(res, status, message) {
    try {
        if (!res.destroyed) {
            if (!res.headersSent) {
                res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Connection': 'close' });
                res.end(JSON.stringify({ error: message }, null, 2));
            } else {
                // 关键修复：头已发送但路径出问题，确保响应结束，避免挂起
                res.destroy();
            }
        }
    } catch (e) {
        try { if (!res.destroyed) res.destroy(); } catch (_) {}
    }
}

const server = http.createServer((req, res) => {
    // 默认禁用 keep-alive，避免僵尸连接（类死锁）
    res.setHeader('Connection', 'close');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // 关键修复：每个请求强制 20 秒总超时兜底，任何代码路径遗漏 res.end() 都会造成连接挂起
    // 使用布尔开关避免"错误-超时"双路径重复写入响应导致的损坏
    let overallTimer = null;
    let overallTimerCleared = false;
    const clearOverall = () => {
        if (overallTimerCleared) return;
        overallTimerCleared = true;
        if (overallTimer) { clearTimeout(overallTimer); overallTimer = null; }
    };
    overallTimer = setTimeout(() => {
        try {
            if (!res.destroyed) {
                if (!res.headersSent) {
                    res.writeHead(504, { 'Content-Type': 'application/json; charset=utf-8', 'Connection': 'close' });
                    res.end(JSON.stringify({ error: 'Gateway Timeout' }));
                } else {
                    res.destroy();
                }
            }
        } catch (e) {
            try { if (!res.destroyed) res.destroy(); } catch (_) {}
        } finally {
            clearOverall();
        }
    }, 20000);
    res.on('finish', clearOverall);
    res.on('close', clearOverall);

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    try {
        const parsedUrl = new URL(req.url, 'http://localhost');
        const pathname = parsedUrl.pathname;
        const query = parseQuery(req.url);

        switch (pathname) {
            case '/api/map': {
                const theme = query.theme || 'desert';
                const width = parseInt(query.width) || 400;
                const height = parseInt(query.height) || 400;
                const svg = generateMapPreview(theme, width, height);
                sendSvg(res, svg);
                break;
            }

            case '/api/weapon': {
                const weaponType = query.type || 'pistol';
                const svg = generateWeaponIcon(weaponType);
                sendSvg(res, svg);
                break;
            }

            case '/api/avatar': {
                const style = query.style || 'default';
                const svg = generatePlayerAvatar(style);
                sendSvg(res, svg);
                break;
            }

            case '/api/rank': {
                const rank = query.rank || 'bronze';
                const svg = generateRankBadge(rank);
                sendSvg(res, svg);
                break;
            }

            case '/api/draw': {
                if (req.method === 'POST') {
                    let body = '';
                    let bodyProcessed = false;
                    // 请求超时定时器（必须在 trySendError 之前声明，避免 TDZ 引用问题）
                    let bodyTimer = null;
                    const MAX_BODY_SIZE = 1024 * 1024; // 1MB 上限，防止超大请求耗尽内存

                    const clearBodyTimer = () => {
                        if (bodyTimer) {
                            try { clearTimeout(bodyTimer); } catch (e) {}
                            bodyTimer = null;
                        }
                    };

                    const trySendError = (status, message) => {
                        if (bodyProcessed) return;
                        bodyProcessed = true;
                        clearBodyTimer();
                        try {
                            // 关键修复：无论 req 是否已销毁，只要 res 未结束，就必须写入一个响应，
                            // 否则 res 永不 end，连接会挂起直到 socket 超时（类死锁）
                            if (!res.destroyed && !res.headersSent) {
                                res.writeHead(status, {
                                    'Content-Type': 'application/json; charset=utf-8',
                                    'Connection': 'close'
                                });
                                res.end(JSON.stringify({ error: message }));
                            } else if (!res.destroyed) {
                                // 头已发送但 body 未完成，直接销毁连接避免挂起
                                res.destroy();
                            }
                        } catch (e) {
                            try { if (!res.destroyed) res.destroy(); } catch (_) {}
                        }
                        try { req.destroy(); } catch (e) {}
                    };

                    // 请求超时保护：10秒内未完成 body 读取则终止，避免连接挂起（类死锁）
                    bodyTimer = setTimeout(() => {
                        trySendError(408, 'Request Timeout');
                    }, 10000);

                    req.on('data', chunk => {
                        if (bodyProcessed) return;
                        // 先检查累计大小，避免超大请求一次性消耗内存（类死锁/性能雪崩）
                        let chunkText;
                        if (typeof chunk === 'string') {
                            chunkText = chunk;
                        } else {
                            try {
                                chunkText = chunk.toString('utf-8');
                            } catch (e) {
                                trySendError(400, 'Invalid Request Data');
                                return;
                            }
                        }
                        // 关键修复：先判断新长度 + 分块上限检测
                        if (body.length + chunkText.length > MAX_BODY_SIZE) {
                            trySendError(413, 'Payload Too Large');
                            return;
                        }
                        body += chunkText;
                    });

                    req.on('end', () => {
                        if (bodyProcessed) return;
                        bodyProcessed = true;
                        clearBodyTimer();
                        let data;
                        try {
                            data = JSON.parse(body);
                        } catch (e) {
                            sendError(res, 400, 'Invalid JSON: ' + e.message);
                            return;
                        }
                        try {
                            const width = data.width || 400;
                            const height = data.height || 400;
                            const elements = Array.isArray(data.elements) ? data.elements : [];
                            const maxElements = 500;
                            const safeElements = elements.slice(0, maxElements);

                            let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" style="background:${data.background || '#000'}">`;

                            safeElements.forEach(el => {
                                if (!el || typeof el !== 'object') return;
                                switch (el.type) {
                                    case 'rect':
                                        svg += `<rect x="${el.x}" y="${el.y}" width="${el.w}" height="${el.h}" fill="${el.color}" rx="${el.rx || 0}"/>`;
                                        break;
                                    case 'circle':
                                        svg += `<circle cx="${el.x}" cy="${el.y}" r="${el.r}" fill="${el.color}"/>`;
                                        break;
                                    case 'text':
                                        svg += `<text x="${el.x}" y="${el.y}" fill="${el.color || '#fff'}" font-size="${el.size || 16}" font-family="Arial">${el.text || ''}</text>`;
                                        break;
                                    case 'line':
                                        svg += `<line x1="${el.x1}" y1="${el.y1}" x2="${el.x2}" y2="${el.y2}" stroke="${el.color}" stroke-width="${el.width || 1}"/>`;
                                        break;
                                }
                            });

                            svg += '</svg>';
                            sendSvg(res, svg);
                        } catch (e) {
                            sendError(res, 500, 'Render error: ' + e.message);
                        }
                    });

                    req.on('error', () => {
                        trySendError(400, 'Request Error');
                        try { req.destroy(); } catch (e) {}
                    });
                } else {
                    sendError(res, 405, 'Method not allowed. Use POST.');
                }
                break;
            }

            case '/api/info':
                sendJson(res, {
                    name: 'Death Trench 2D API',
                    version: '1.0.0',
                    endpoints: {
                        '/api/map': 'Generate map preview. Params: theme, width, height',
                        '/api/weapon': 'Generate weapon icon. Params: type (pistol/rifle/sniper)',
                        '/api/avatar': 'Generate player avatar. Params: style (default/elite/stealth)',
                        '/api/rank': 'Generate rank badge. Params: rank (bronze/silver/gold/platinum/diamond)',
                        '/api/draw': 'Custom drawing. POST JSON with elements array',
                        '/api/info': 'This info'
                    }
                });
                break;

            default:
                sendError(res, 404, 'Endpoint not found. Visit /api/info for available endpoints.');
        }
    } catch (e) {
        sendError(res, 500, 'Server error: ' + e.message);
    }
});

// 关键修复：全局连接超时必须在 server.listen 之前设置，
// 否则在 listen 与事件注册之间建立的连接不会有超时处理，
// 会变成悬挂连接（类死锁资源耗尽）。
server.on('connection', (socket) => {
    socket.setTimeout(60000);
    socket.on('timeout', () => {
        try { socket.destroy(); } catch (e) {}
    });
});

server.listen(API_PORT, () => {
    console.log(`Death Trench 2D API Server running at http://localhost:${API_PORT}`);
    console.log(`Visit http://localhost:${API_PORT}/api/info for API documentation`);
});

// 优雅关闭：收到 SIGINT/SIGTERM 时释放端口，避免端口残留占用
function gracefulShutdown() {
    console.log('\n[API] 收到关闭信号，正在释放端口...');
    server.close(() => {
        console.log('[API] API 服务器已关闭，端口已释放。');
        process.exit(0);
    });
    setTimeout(() => {
        console.log('[API] 强制退出。');
        process.exit(0);
    }, 3000).unref();
}
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

module.exports = server;
