/**
 * ============================================================
 *  🌐 Meting API 反向代理 - 解决国内访问 Vercel 被墙问题
 * ============================================================
 * 
 *  原理：
 *    前端 → 你的阿里云服务器(3301) → Vercel 公共 API → 音乐平台
 *    
 *    前端只访问国内 IP（畅通）
 *    服务器出网到海外 Vercel（也畅通）
 *  
 *  用法：
 *    node proxy.js              # 默认端口 3301
 *    PORT=3400 node proxy.js    # 自定义端口
 * 
 *  PM2 启动：
 *    pm2 start proxy.js --name meting-proxy
 * 
 *  API 地址（填入 config.js 的 METING_API）：
 *    http://YOUR_SERVER_IP:3301/api
 * 
 * ============================================================
 */

const http = require('http');
const https = require('https');
const url = require('url');

// ====== 配置 ======
const PORT = process.env.PORT || 3301;

// 上游公共 Meting API 列表（按优先级排列，全部为国内可访问实例）
const UPSTREAMS = [
    'https://api.injahow.cn/meting',
    'https://meting.elysium-stack.cn/api',
];

// 请求超时时间（毫秒）
const TIMEOUT = 15000;

// ====== 工具函数 ======

/**
 * 解析 Content-Type，判断是否需要转发响应体
 */
function shouldForwardBody(headers) {
    const ct = headers['content-type'] || '';
    return ct.includes('application/json') || 
           ct.includes('audio') || 
           ct.includes('image') ||
           ct.includes('text') ||
           ct.includes('octet-stream');
}

/**
 * 将前端 Meting API 路径格式转换为公共实例的查询参数格式
 * 
 * 前端格式：  /search?server=netease&id=关键词
 * 公共实例格式：?server=netease&type=search&id=关键词
 */
function convertPathToQuery(reqPath) {
    const parsed = url.parse(reqPath, true);
    const pathname = parsed.pathname;   // e.g., "/search"
    const query = parsed.query;         // e.g., { server: "netease", id: "周杰伦" }
    
    // 路径 → type 映射
    const pathToType = {
        '/search': 'search',
        '/url': 'url',
        '/lyric': 'lrc',
        '/lrc': 'lrc',
        '/pic': 'pic',
        '/song': 'single',
        '/album': 'playlist',
        '/artist': null,       // artist 暂不支持转换
        '/playlist': 'playlist',
        '/health': '__health__',
    };
    
    const type = pathToType[pathname];
    if (!type) {
        // 不认识的路径，原样返回（可能是 /health 或其他）
        return reqPath;
    }
    if (type === '__health__') {
        return reqPath;
    }
    
    // 构建新查询字符串：去掉路径，把操作类型放入 type 参数
    const newQuery = { ...query, type };
    delete newQuery[''];  // 清除可能的空键
    
    const searchStr = Object.entries(newQuery)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
    
    return '?' + searchStr;
}

/**
 * 转发 HTTP 请求到上游
 */
function proxyRequest(upstream, reqPath, reqMethod, reqHeaders, reqBody, res) {
    const targetUrl = upstream + reqPath;
    const parsedUrl = url.parse(targetUrl);
    
    const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || 443,
        path: parsedUrl.path,
        method: reqMethod,
        headers: {
            // 转发原始请求头（过滤掉连接相关的）
            'Accept': reqHeaders['accept'] || '*/*',
            'Accept-Encoding': 'identity',  // 不用 gzip，避免解压问题
            'Accept-Language': reqHeaders['accept-language'] || 'zh-CN,zh;q=0.9',
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        },
        timeout: TIMEOUT,
    };

    const proxyReq = https.request(options, (proxyRes) => {
        // 写入状态码和响应头
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        
        // 直接 pipe 响应体（流式传输，不占内存）
        proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
        console.error(`[PROXY] 上游 ${upstream} 请求失败: ${err.message}`);
        if (!res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'application/json' });
        }
        res.end(JSON.stringify({
            success: false,
            code: 502,
            message: `Upstream failed: ${err.message}`,
            upstream: upstream,
        }));
    });

    proxyReq.on('timeout', () => {
        console.error(`[PROXY] 上游 ${upstream} 超时 (${TIMEOUT}ms)`);
        proxyReq.destroy();
        if (!res.headersSent) {
            res.writeHead(504, { 'Content-Type': 'application/json' });
        }
        res.end(JSON.stringify({
            success: false,
            code: 504,
            message: `Upstream timeout after ${TIMEOUT}ms`,
            upstream: upstream,
        }));
    });

    // 发送请求体（如果有）
    if (reqBody && reqBody.length > 0) {
        proxyReq.write(reqBody);
    }

    proxyReq.end();
}

/**
 * 带自动切换的代理：尝试每个上游，直到有一个成功
 */
function proxyWithFallback(reqPath, reqMethod, reqHeaders, reqBody, res, upstreamIndex = 0) {
    if (upstreamIndex >= UPSTREAMS.length) {
        // 所有上游都失败了
        console.error(`[PROXY] ❌ 所有 ${UPSTREAMS.length} 个上游都失败了: ${reqPath}`);
        if (!res.headersSent) {
            res.writeHead(503, { 'Content-Type': 'application/json' });
        }
        res.end(JSON.stringify({
            success: false,
            code: 503,
            message: 'All upstream servers unavailable',
            upstreams: UPSTREAMS,
        }));
        return;
    }

    const upstream = UPSTREAMS[upstreamIndex];
    
    // 转换路径格式：前端 /search?server=xx&id=yy → 上游 ?server=xx&type=search&id=yy
    const convertedPath = convertPathToQuery(reqPath);
    console.log(`[PROXY] ➡️ [${upstreamIndex + 1}/${UPSTREAMS.length}] ${upstream} | ${reqPath} → ${convertedPath}`);

    const targetUrl = upstream + convertedPath;
    const parsedUrl = url.parse(targetUrl);

    const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || 443,
        path: parsedUrl.path,
        method: reqMethod,
        headers: {
            'Accept': '*/*',
            'Accept-Encoding': 'identity',
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
        },
        timeout: TIMEOUT,
    };

    const proxyReq = https.request(options, (proxyRes) => {
        // 如果返回 5xx 错误，尝试下一个上游
        if (proxyRes.statusCode >= 500 && proxyRes.statusCode < 600 && upstreamIndex + 1 < UPSTREAMS.length) {
            console.warn(`[PROXY] ⚠️ [${upstreamIndex + 1}] 返回 ${proxyRes.statusCode}，切换下一个...`);
            proxyRes.resume();  // 消费掉响应，防止内存泄漏
            proxyWithFallback(reqPath, reqMethod, reqHeaders, reqBody, res, upstreamIndex + 1);
            return;
        }

        // 成功或非 5xx 错误，直接返回给客户端
        console.log(`[PROXY] ✅ [${upstreamIndex + 1}] 成功 → ${proxyRes.statusCode} ${reqPath}`);
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
        console.error(`[PROXY] ❌ [${upstreamIndex + 1}] 错误: ${err.message}，切换下一个...`);
        if (upstreamIndex + 1 < UPSTREAMS.length) {
            proxyWithFallback(reqPath, reqMethod, reqHeaders, reqBody, res, upstreamIndex + 1);
        } else {
            if (!res.headersSent) {
                res.writeHead(502, { 'Content-Type': 'application/json' });
            }
            res.end(JSON.stringify({ success: false, code: 502, message: err.message }));
        }
    });

    proxyReq.on('timeout', () => {
        console.error(`[PROXY] ⏰ [${upstreamIndex + 1}] 超时，切换下一个...`);
        proxyReq.destroy();
        if (upstreamIndex + 1 < UPSTREAMS.length) {
            proxyWithFallback(reqPath, reqMethod, reqHeaders, reqBody, res, upstreamIndex + 1);
        } else {
            if (!res.headersSent) {
                res.writeHead(504, { 'Content-Type': 'application/json' });
            }
            res.end(JSON.stringify({ success: false, code: 504, message: `Timeout after ${TIMEOUT}ms` }));
        }
    });

    if (reqBody && reqBody.length > 0) {
        proxyReq.write(reqBody);
    }
    proxyReq.end();
}

// ====== 创建 HTTP 服务器 ======

const server = http.createServer((req, res) => {
    const reqUrl = url.parse(req.url);

    // CORS 预检请求
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': '*',
            'Access-Control-Max-Age': '86400',
        });
        res.end();
        return;
    }

    // 健康检查接口
    if (reqUrl.pathname === '/health' || reqUrl.pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({
            success: true,
            status: 'running',
            service: 'Meting Reverse Proxy',
            version: '1.0.0',
            port: PORT,
            upstreams: UPSTREAMS,
            timestamp: new Date().toISOString(),
        }, null, 2));
        return;
    }

    // 收集请求体（POST 可能有 body）
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
        const body = Buffer.concat(chunks);
        
        // 设置 CORS 头
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', '*');
        res.setHeader('X-Proxied-By', 'Meting-Proxy/v1.0');

        // 代理请求到上游（带自动故障转移）
        proxyWithFallback(reqUrl.pathname + (reqUrl.search || ''), req.method, req.headers, body, res);
    });
});

// ====== 启动服务 ======

server.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('╔══════════════════════════════════════════╗');
    console.log('║   🌐 Meting API 反向代理已启动              ║');
    console.log('╠══════════════════════════════════════════╣');
    console.log(`║   地址：http://localhost:${PORT.toString().padEnd(22)}║`);
    console.log(`║   端口：${PORT.toString().padEnd(32)}║`);
    console.log(`║   上游：${UPSTREAMS[0].padEnd(28)}║`);
    console.log(`║   备用：${UPSTREAMS[1].padEnd(28)}║`);
    console.log('╚══════════════════════════════════════════╝');
    console.log('');
    console.log('📡 前端配置地址：http://你的IP:' + PORT + '/api');
    console.log('⏱️  请求超时：' + (TIMEOUT / 1000) + '秒');
    console.log('🔄 自动切换：上游失败时自动切换到备用');
});
