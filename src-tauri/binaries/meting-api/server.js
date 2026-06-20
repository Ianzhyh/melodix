/**
 * ============================================================
 *  🎵 Meting Music API - 自建音乐 API 服务
 * ============================================================
 * 
 *  基于 metowolf/Meting (Node.js) 的多平台音乐 API
 *  支持：网易云 / QQ音乐(腾讯) / 酷狗 / 酷我 / 百度
 *  
 *  用法：
 *    node server.js          # 生产模式（默认端口 3300）
 *    PORT=3000 node server.js # 自定义端口
 *    
 *  API 路由：
 *    GET /search?server=netease&id=关键词&page=1&limit=30     搜索
 *    GET /url?server=netease&id=歌曲ID&r=320                 获取播放URL
 *    GET /lyric?server=netease&id=歌曲ID                       获取歌词
 *    GET /pic?server=netease&id=图片ID&size=300               获取封面
 *    GET /song?server=netease&id=歌曲ID                        歌曲详情
 *    GET /album?server=netease&id=专辑ID                       专辑信息
 *    GET /artist?server=netease&id=歌手ID                      歌手列表
 *    GET /playlist?server=netease&id=歌单ID                    歌单内容
 *    GET /health                                               健康检查
 * 
 * ============================================================
 */

const http = require('http');
const https = require('https');
const url = require('url');
const crypto = require('crypto');
const qrcDecrypt = require('./qrc-decrypt.js');
const { StringDecoder } = require('string_decoder');
const fs = require('fs');
const path = require('path');

const QRCodeCore = require('./lib/qrcode/lib/core/qrcode');

function generateQRMatrix(text) {
  try {
    const qrData = QRCodeCore.create(text, { errorCorrectionLevel: 'L' });
    const modules = qrData.modules;
    const size = modules.size;
    const rows = [];
    for (let r = 0; r < size; r++) {
      let val = 0;
      for (let c = 0; c < size; c++) {
        if (modules.get(r, c)) val |= (1 << (c % 32));
        if (c % 32 === 31 || c === size - 1) {
          rows.push(val);
          val = 0;
        }
      }
    }
    return { matrix: rows, size };
  } catch (e) {
    console.error('[QR/Gen] Matrix generation failed:', e.message);
    return null;
  }
}

let STATIC_ROOT = path.resolve(__dirname, '..');
if (process.env.APP_STATIC_ROOT && fs.existsSync(process.env.APP_STATIC_ROOT)) {
  STATIC_ROOT = process.env.APP_STATIC_ROOT;
} else if (!fs.existsSync(path.join(STATIC_ROOT, 'index.html'))) {
  const asarRoot = path.resolve(__dirname, '..', 'app');
  if (fs.existsSync(path.join(asarRoot, 'index.html'))) {
    STATIC_ROOT = asarRoot;
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.flac': 'audio/flac',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
};
// 延迟导入 @meting/core（ESM 模块，不能用 require）
let Meting;
async function getMeting() {
    if (!Meting) {
        const mod = await import('@meting/core');
        Meting = mod.default || mod;
    }
    return Meting;
}

// 创建带超时的 Meting 实例
async function createMetingInstance(server) {
  const M = await getMeting();
  const m = new M(server);
  if (typeof m.format === 'function') m.format(true);
  return m;
}

// 安全解析 JSON
function safeJSONParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}

// ============================================
// 📋 配置项
// ============================================
const CONFIG = {
  port: parseInt(process.env.PORT) || 3300,
  
  // 请求超时（毫秒）
  timeout: 12000,
  
  // 请求限流：同一 IP 每 windowMs 内最多 maxRequests 次
  rateLimit: {
    enabled: true,
    windowMs: 60 * 1000, // 1分钟窗口
    maxRequests: 120,     // 每分钟最大请求数
  },

  // CORS 允许的来源（* 表示全部允许）
  corsOrigins: '*',

  // 平台映射（兼容前端代码中的平台名称）
  platformMap: {
    'netease': 'netease',   // 网易云
    'tencent': 'tencent',   // QQ音乐
    'kugou':   'kugou',     // 酷狗
    'kuwo':    'kuwo',      // 酷我
    'baidu':   'baidu',     // 百度
  },

  // 平台 Cookie（可选，用于获取 VIP 歌曲链接等高级功能）
  // 优先级：环境变量 METING_COOKIES > cookies.json 文件
  // 网易云：登录 https://music.163.com 后从浏览器 F12 → Application → Cookies 获取 MUSIC_U
  // QQ音乐：登录 y.qq.com 后 F12 → Console → document.cookie
  // 格式：{ netease: 'MUSIC_U=xxx;', tencent: 'xxx' }
  cookies: null,
};

let _cookieCache = null;

async function asyncReadCookies() {
  if (process.env.METING_COOKIES) {
    try {
      _cookieCache = JSON.parse(process.env.METING_COOKIES);
      CONFIG.cookies = _cookieCache;
      return;
    } catch(e) {}
  }
  if (process.env.USER_DATA_PATH) {
    try {
      const cookiePath = path.join(process.env.USER_DATA_PATH, 'cookies.json');
      await fs.promises.access(cookiePath);
      const raw = await fs.promises.readFile(cookiePath, 'utf-8');
      _cookieCache = JSON.parse(raw);
      CONFIG.cookies = _cookieCache;
      console.log('[Config] ✓ 从用户数据目录加载平台 Cookie');
      return;
    } catch(e) {
      if (e.code !== 'ENOENT') {
        console.warn('[Config] ⚠ 读取用户数据目录 cookies.json 失败:', e.message);
      }
    }
  }
  try {
    const cookiePath = path.join(__dirname, 'cookies.json');
    await fs.promises.access(cookiePath);
    const raw = await fs.promises.readFile(cookiePath, 'utf-8');
    _cookieCache = JSON.parse(raw);
    CONFIG.cookies = _cookieCache;
    console.log('[Config] ✓ 从 cookies.json 加载平台 Cookie');
    return;
  } catch(e) {
    if (e.code !== 'ENOENT') {
      console.warn('[Config] ⚠ 读取 cookies.json 失败:', e.message);
    }
  }
  console.log('[Config] ℹ 未配置平台 Cookie，VIP歌曲可能无法获取真实链接');
}

// ============================================
// 🔒 简易内存限流器
// ============================================
const rateLimitStore = new Map();

function checkRateLimit(ip) {
  if (!CONFIG.rateLimit.enabled) return { allowed: true };
  
  const now = Date.now();
  const record = rateLimitStore.get(ip);
  
  if (!record || now - record.resetTime > CONFIG.rateLimit.windowMs) {
    rateLimitStore.set(ip, { count: 1, resetTime: now + CONFIG.rateLimit.windowMs });
    return { allowed: true, remaining: CONFIG.rateLimit.maxRequests - 1 };
  }
  
  if (record.count >= CONFIG.rateLimit.maxRequests) {
    return { allowed: false, retryAfter: Math.ceil((record.resetTime - now) / 1000) };
  }
  
  record.count++;
  return { allowed: true, remaining: CONFIG.rateLimit.maxRequests - record.count };
}

// 定期清理过期记录
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of rateLimitStore.entries()) {
    if (now - record.resetTime > CONFIG.rateLimit.windowMs) {
      rateLimitStore.delete(ip);
    }
  }
}, 60 * 1000);

// ============================================
// 🛠️ 工具函数
// ============================================

// 解析查询参数
function parseQuery(queryString) {
  const params = new URLSearchParams(queryString);
  const result = {};
  for (const [key, value] of params.entries()) {
    result[key] = value;
  }
  return result;
}

// 获取客户端 IP
function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() 
    || req.headers['x-real-ip'] 
    || req.socket?.remoteAddress 
    || '127.0.0.1';
}

// CORS 头设置
function setCORSHeaders(res, origin) {
  res.setHeader('Access-Control-Allow-Origin', CONFIG.corsOrigins === '*' ? '*' : origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Netease-Cookie, X-Tencent-Cookie, X-Kugou-Cookie, X-Kuwo-Cookie, X-Baidu-Cookie');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
}

// 统一响应格式
function jsonResponse(res, statusCode, data, headers = {}) {
  setCORSHeaders(res);
  
  Object.entries(headers).forEach(([key, val]) => res.setHeader(key, val));
  
  const body = typeof data === 'string' ? data : JSON.stringify(data);
  res.writeHead(statusCode);
  res.end(body);
}

// 错误响应
function errorResponse(res, code, message, details = null) {
  jsonResponse(res, code, {
    success: false,
    code,
    message,
    details,
    timestamp: new Date().toISOString(),
  });
}

// 带超时控制的异步执行
async function withTimeout(promise, ms = CONFIG.timeout) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Request timeout')), ms);
  });
  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timer);
    return result;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// 安全解析 JSON
function safeJSONParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}

// ============================================
// 🎯 API 路由处理器
// ============================================

// GET /health — 健康检查
function handleHealth(req, res) {
  const cookieStatus = {};
  const platforms = [...Object.keys(CONFIG.platformMap), 'migu'];
  platforms.forEach(p => {
    const hasConfig = !!(CONFIG.cookies && CONFIG.cookies[p]);
    const hasEnv = !!process.env.METING_COOKIES && (() => { try { return !!JSON.parse(process.env.METING_COOKIES)[p]; } catch { return false; } })();
    cookieStatus[p] = hasConfig || hasEnv;
  });
  jsonResponse(res, 200, {
    success: true,
    service: 'Meting Music API',
    version: '1.1.0',
    status: 'running',
    uptime: process.uptime(),
    platforms: platforms,
    cookies: cookieStatus,
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString(),
  });
}

// 从请求头获取平台 Cookie（优先级：请求头 > 配置文件/环境变量）
function getPlatformCookie(req, platform) {
  const cookieHeaders = {
    'netease': req.headers['x-netease-cookie'],
    'tencent': req.headers['x-tencent-cookie'],
    'kugou': req.headers['x-kugou-cookie'],
    'kuwo': req.headers['x-kuwo-cookie'],
    'baidu': req.headers['x-baidu-cookie'],
  };
  if (cookieHeaders[platform]) return cookieHeaders[platform];
  if (_cookieCache && _cookieCache[platform]) return _cookieCache[platform];
  return (CONFIG.cookies && CONFIG.cookies[platform]) || null;
}

// GET /search — 搜索歌曲
async function handleSearch(req, res, query) {
  const { server: platform, id: keyword, page = '1', limit = '30', type = '1' } = query;
  if (!platform || !keyword) return errorResponse(res, 400, 'Missing required parameters');

  let m;
  try {
    m = await createMetingInstance(platform);
    
    const platformCookie = getPlatformCookie(req, platform);
    if (platformCookie) m.cookie(platformCookie);

    const rawResult = await withTimeout(m.search(decodeURIComponent(keyword), {
      type: parseInt(type),
      page: parseInt(page),
      limit: Math.min(parseInt(limit), 50),
    }));
    
    const data = safeJSONParse(rawResult);
    const resultCount = Array.isArray(data) ? data.length : (data?.data?.length || 0);

    jsonResponse(res, 200, {
      success: true, platform, keyword: decodeURIComponent(keyword),
      page: parseInt(page), count: resultCount,
      data: Array.isArray(data) ? data : (data?.data || data || []),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error(`[Search Error] ${platform}:`, err.message);
    errorResponse(res, 502, `Search failed on ${platform}`, err.message);
  }
}

// GET /url — 获取播放地址
async function handleUrl(req, res, query) {
  const { server: platform, id: songId, r = '320' } = query;
  if (!platform || !songId) return errorResponse(res, 400, 'Missing required parameters');

  let m;
  try {
    m = await createMetingInstance(platform);
    
    const platformCookie = getPlatformCookie(req, platform);
    if (platformCookie) m.cookie(platformCookie);

    const bitrate = parseInt(r);
    const rawResult = await withTimeout(m.url(songId, bitrate));
    const data = safeJSONParse(rawResult);

    let response;
    if (typeof data === 'string') {
      response = { url: data };
    } else if (data && data.url) {
      response = data;
      if (!data.url) {
        return errorResponse(res, 403, 'Empty URL — the song may require VIP or login', data);
      }
    } else {
      response = { url: null, raw: data };
    }

    jsonResponse(res, 200, {
      success: true, platform, song_id: songId, bitrate: r,
      data: response, timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error(`[URL Error] ${platform}/${songId}:`, err.message);
    errorResponse(res, 502, `Failed to get URL from ${platform}`, err.message);
  }
}

// GET /lyric — 获取歌词
async function handleLyric(req, res, query) {
  const { server: platform, id: lyricId } = query;
  if (!platform || !lyricId) return errorResponse(res, 400, 'Missing required parameters');

  let m;
  try {
    m = await createMetingInstance(platform);
    
    const platformCookie = getPlatformCookie(req, platform);
    if (platformCookie) m.cookie(platformCookie);

    const rawResult = await withTimeout(m.lyric(lyricId));
    const data = safeJSONParse(rawResult);

    jsonResponse(res, 200, {
      success: true, platform, lyric_id: lyricId,
      data, timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error(`[Lyric Error] ${platform}/${lyricId}:`, err.message);
    errorResponse(res, 502, `Failed to get lyrics from ${platform}`, err.message);
  }
}

// GET /pic — 获取封面图片（代理模式，解决 CORS 问题）
async function handlePic(req, res, query) {
  const { server: platform, id: picId, size = '300', proxy = 'true' } = query;
  if (!platform || !picId) return errorResponse(res, 400, 'Missing required parameters');

  try {
    const m = await createMetingInstance(platform);
    
    const platformCookie = getPlatformCookie(req, platform);
    if (platformCookie) m.cookie(platformCookie);

    const rawResult = await withTimeout(m.pic(picId, parseInt(size)));
    const picUrl = safeJSONParse(rawResult);

    let finalUrl = typeof picUrl === 'string' ? picUrl : (picUrl?.url || null);
    if (!finalUrl || !(finalUrl.startsWith('http://') || finalUrl.startsWith('https://'))) {
      return errorResponse(res, 404, 'Picture URL not found');
    }

    if (proxy !== 'false') {
      try {
        let fetch;
        try { fetch = (await import('node-fetch')).default; } catch(_) {}
        const picRes = await fetch(finalUrl, { timeout: 10000 });
        const buffer = await picRes.buffer();
        const contentType = picRes.headers.get('content-type') || 'image/jpeg';
        
        setCORSHeaders(res);
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.writeHead(200);
        res.end(buffer);
        return;
      } catch (proxyErr) {
        console.warn(`[Pic Proxy Error] ${proxyErr.message}, fallback to redirect`);
      }
    }

    setCORSHeaders(res);
    res.writeHead(302, { Location: finalUrl });
    res.end();
  } catch (err) {
    console.error(`[Pic Error] ${platform}/${picId}:`, err.message);
    errorResponse(res, 502, `Failed to get picture from ${platform}`, err.message);
  }
}

// GET /proxy-image — 通用图片代理（解决前端 CORS/file:// 协议问题）
async function handleProxyImage(req, res, query) {
  const { url: imageUrl } = query;
  if (!imageUrl || !(imageUrl.startsWith('http://') || imageUrl.startsWith('https://'))) {
    return errorResponse(res, 400, 'Missing or invalid url parameter');
  }
  try {
    const picRes = await fetch(imageUrl, { signal: AbortSignal.timeout(15000) });
    if (!picRes.ok) return errorResponse(res, picRes.status, 'Upstream fetch failed');
    const buffer = Buffer.from(await picRes.arrayBuffer());
    setCORSHeaders(res);
    res.setHeader('Content-Type', picRes.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.writeHead(200);
    res.end(buffer);
  } catch (e) {
    console.warn('[ProxyImage Error]', e.message);
    errorResponse(res, 502, 'Proxy fetch error', e.message);
  }
}

// GET /song — 获取歌曲详情
async function handleSong(req, res, query) {
  const { server: platform, id: songId } = query;
  if (!platform || !songId) return errorResponse(res, 400, 'Missing required parameters');

  let m;
  try {
    m = await createMetingInstance(platform);
    const rawResult = await withTimeout(m.song(songId));
    const data = safeJSONParse(rawResult);

    jsonResponse(res, 200, {
      success: true, platform, song_id: songId,
      data, timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error(`[Song Error] ${platform}/${songId}:`, err.message);
    errorResponse(res, 502, `Failed to get song detail from ${platform}`, err.message);
  }
}

// GET /album — 获取专辑信息
async function handleAlbum(req, res, query) {
  const { server: platform, id: albumId } = query;
  if (!platform || !albumId) return errorResponse(res, 400, 'Missing required parameters');

  let m;
  try {
    m = await createMetingInstance(platform);
    const rawResult = await withTimeout(m.album(albumId));
    const data = safeJSONParse(rawResult);

    jsonResponse(res, 200, {
      success: true, platform, album_id: albumId,
      data, timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error(`[Album Error] ${platform}/${albumId}:`, err.message);
    errorResponse(res, 502, `Failed to get album info from ${platform}`, err.message);
  }
}

// GET /artist — 获取歌手歌曲列表
async function handleArtist(req, res, query) {
  const { server: platform, id: artistId, limit = '30' } = query;
  if (!platform || !artistId) return errorResponse(res, 400, 'Missing required parameters');

  let m;
  try {
    m = await createMetingInstance(platform);
    const rawResult = await withTimeout(m.artist(artistId, Math.min(parseInt(limit), 100)));
    const data = safeJSONParse(rawResult);

    jsonResponse(res, 200, {
      success: true, platform, artist_id: artistId,
      data, timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error(`[Artist Error] ${platform}/${artistId}:`, err.message);
    errorResponse(res, 502, `Failed to get artist songs from ${platform}`, err.message);
  }
}

// GET /playlist — 获取歌单内容
async function handlePlaylist(req, res, query) {
  const { server: platform, id: playlistId } = query;
  if (!platform || !playlistId) return errorResponse(res, 400, 'Missing required parameters');

  let m;
  try {
    m = await createMetingInstance(platform);
    const rawResult = await withTimeout(m.playlist(playlistId));
    const data = safeJSONParse(rawResult);

    jsonResponse(res, 200, {
      success: true, platform, playlist_id: playlistId,
      data, timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error(`[Playlist Error] ${platform}/${playlistId}:`, err.message);
    errorResponse(res, 502, `Failed to get playlist from ${platform}`, err.message);
  }
}

// ============================================
// 🎚️ GET /aggregate/search — CeruMusic 风格聚合搜索
//    并发搜索所有平台 → 轮转交错合并 → 智能去重
// ============================================
async function handleAggregateSearch(req, res, query) {
  const keyword = query.id || query.keyword || '';
  const page = parseInt(query.page) || 1;
  const limit = parseInt(query.limit) || 30;
  if (!keyword) return errorResponse(res, 400, 'Missing keyword');
  
  const decodedKeyword = decodeURIComponent(keyword);
  const platforms = ['tencent', 'kugou', 'kuwo', 'netease'];
  
  console.log(`[AGGREGATE] 聚合搜索 "${decodedKeyword}" → ${platforms.join(', ')} + migu + bilibili`);

  // 1. 并发搜索直连 API 平台
  const tasks = platforms.map(async (platform) => {
    try {
      const m = await createMetingInstance(platform);
      const rawResult = await withTimeout(m.search(decodedKeyword, { page: 1, limit: Math.min(limit, 50) }), 8000);
      const data = safeJSONParse(rawResult);
      const list = Array.isArray(data) ? data : (data?.data || data || []);
      return (list || []).map(item => ({ ...item, _source: platform }));
    } catch (err) {
      console.warn(`[AGGREGATE] ${platform} 搜索失败:`, err.message);
      return [];
    }
  });

  // 咪咕独立搜索（不走直连 API）
  tasks.push((async () => {
    try {
      const time = Date.now().toString();
      const deviceId = '963B7AA0D21511ED807EE5846EC87D20';
      const signStr = `${decodedKeyword}6cdc72a439cef99a3418d2a78aa28c73yyapp2d16148780a1dcc7408e06336b98cfd50${deviceId}${time}`;
      const sign = crypto.createHash('md5').update(signStr).digest('hex');
      const apiUrl = `https://jadeite.migu.cn/music_search/v3/search/searchAll?isCorrect=0&isCopyright=1&searchSwitch=%7B%22song%22%3A1%2C%22album%22%3A0%2C%22singer%22%3A0%2C%22tagSong%22%3A1%2C%22mvSong%22%3A0%2C%22bestShow%22%3A1%2C%22songlist%22%3A0%2C%22lyricSong%22%3A0%7D&pageSize=${Math.min(limit, 50)}&text=${encodeURIComponent(decodedKeyword)}&pageNo=1&sort=0&sid=USS`;
      const result = await withTimeout(httpsGet(apiUrl, {
        'User-Agent': 'Mozilla/5.0 (Linux; U; Android 11; zh-cn; MI 11) AppleWebKit/534.30',
        'uiVersion': 'A_music_3.6.1', 'deviceId': deviceId,
        'timestamp': time, 'sign': sign, 'channel': '0146921',
      }), 8000);
      const body = JSON.parse(result);
      if (body.code !== '000000') return [];
      const ids = new Set(); const list = [];
      (body.songResultData?.resultList || []).forEach(group => {
        (group || []).forEach(item => {
          if (!item.copyrightId || ids.has(item.copyrightId)) return;
          ids.add(item.copyrightId);
          let img = item.img3 || item.img2 || item.img1 || null;
          if (img && !/^https?:/.test(img)) img = 'http://d.musicapp.migu.cn' + img;
          list.push({
            id: item.copyrightId, songid: item.songId, title: item.name, name: item.name,
            artist: (item.singerList || []).map(s => s.name).join(','),
            author: (item.singerList || []).map(s => s.name).join(','),
            album_id: item.albumId, pic: img, img: img,
            duration: item.duration, interval: fmtDuration(item.duration),
            lrc: item.lrcUrl || '', lyric_id: item.lrcUrl || '',
            _source: 'migu'
          });
        });
      });
      return list;
    } catch { return []; }
  })());

  // Bilibili 搜索
  tasks.push((async () => {
    try {
      return await handleBilibiliSearchInternal(decodedKeyword, limit);
    } catch { return []; }
  })());
  
  const allPlatforms = [...platforms, 'migu', 'bilibili'];
  const results = await Promise.all(tasks);
  
  // 2. CeruMusic 风格轮转交错合并
  const lists = results.filter(arr => arr && arr.length > 0);
  const interleaved = interleave(lists);

  // 3. 智能去重（歌名+歌手相似度）
  const deduped = deduplicate(interleaved);

  console.log(`[AGGREGATE] 结果: ${lists.length} 个平台返回数据, 合并 ${interleaved.length} → 去重后 ${deduped.length} 首`);

  jsonResponse(res, 200, {
    success: true, platform: 'aggregate', keyword: decodedKeyword, page,
    sources: lists.map((_, i) => allPlatforms[i] || 'unknown'),
    sourceCounts: lists.map(arr => arr.length),
    count: deduped.length, data: deduped,
    timestamp: new Date().toISOString(),
  });
}

// CeruMusic 风格轮转交错算法
function interleave(arrays) {
  const result = [];
  const filtered = arrays.filter(a => Array.isArray(a) && a.length > 0);
  if (!filtered.length) return result;
  const max = Math.max(...filtered.map(a => a.length));
  for (let i = 0; i < max; i++) {
    for (const arr of filtered) {
      if (i < arr.length) result.push(arr[i]);
    }
  }
  return result;
}

// 智能去重：歌名 + 歌手名相似度检测
function deduplicate(list) {
  const seen = new Set();
  return list.filter(item => {
    const title = (item.title || item.name || '').toLowerCase().replace(/[（(][^)）]*[)）]/g, '').replace(/\s+/g, '').trim();
    const artist = (item.artist || item.author || item.singer || '').toString().toLowerCase().replace(/\s+/g, '').trim();
    const key = title + '|' + artist;
    if (key.length < 3) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ============================================
async function handleBilibiliSearchInternal(decodedKeyword, limit) {
  const apiUrl = `https://api.bilibili.com/audio/music-service-c/s?search_type=music&page=1&pagesize=${Math.min(limit, 50)}&keyword=${encodeURIComponent(decodedKeyword)}`;
  const result = await httpsGet(apiUrl, {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Referer': 'https://www.bilibili.com/',
  });
  const body = JSON.parse(result);
  if (body.code !== 0 || !body.data || !body.data.result) return [];
  return body.data.result.map(item => ({
    id: String(item.id),
    title: item.title || '',
    name: item.title || '',
    artist: item.author || '',
    author: item.author || '',
    cover: item.cover || '',
    pic: item.cover || '',
    lrc: '',
    lyric_id: '',
    duration: item.duration || 0,
    bvid: item.bvid || '',
    up_id: item.up_id || '',
    _source: 'bilibili',
  }));
}

async function handleBilibiliSearch(req, res, query) {
  const keyword = query.id || query.keyword || '';
  const page = parseInt(query.page) || 1;
  const pagesize = Math.min(parseInt(query.pagesize) || 30, 50);
  if (!keyword) return errorResponse(res, 400, 'Missing keyword');

  const decoded = decodeURIComponent(keyword);

  try {
    const list = await handleBilibiliSearchInternal(decoded, pagesize);
    jsonResponse(res, 200, {
      success: true,
      platform: 'bilibili',
      keyword: decoded,
      page,
      count: list.length,
      data: list,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Bilibili Search Error]:', err.message);
    errorResponse(res, 502, 'Bilibili search failed', err.message);
  }
}

async function handleBilibiliUrl(req, res, query) {
  const bvid = query.bvid || query.id || '';
  if (!bvid) return errorResponse(res, 400, 'Missing bvid parameter');

  try {
    const apiUrl = `https://api.bilibili.com/audio/music-service-c/url?bvid=${encodeURIComponent(bvid)}&qn=2&fnver=0&fnval=16`;
    const result = await httpsGet(apiUrl, {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://www.bilibili.com/',
    });
    const body = JSON.parse(result);
    if (body.code !== 0 || !body.data || !body.data.cdns || body.data.cdns.length === 0) {
      return errorResponse(res, 404, 'No playable URL found for bvid: ' + bvid);
    }
    const url = body.data.cdns[0];
    jsonResponse(res, 200, { success: true, url, bvid });
  } catch (err) {
    console.error('[Bilibili URL Error]:', err.message);
    errorResponse(res, 502, 'Bilibili URL failed', err.message);
  }
}

// GET /migu/search — 咪咕音乐搜索（直连，不经过 Meting）
// ============================================
async function handleMiguSearch(req, res, query) {
  const keyword = query.id || query.keyword || '';
  const page = parseInt(query.page) || 1;
  const limit = Math.min(parseInt(query.limit) || 20, 50);
  if (!keyword) return errorResponse(res, 400, 'Missing keyword');

  const decoded = decodeURIComponent(keyword);
  const time = Date.now().toString();
  const deviceId = '963B7AA0D21511ED807EE5846EC87D20';
  const signStr = `${decoded}6cdc72a439cef99a3418d2a78aa28c73yyapp2d16148780a1dcc7408e06336b98cfd50${deviceId}${time}`;
  const sign = crypto.createHash('md5').update(signStr).digest('hex');

  const apiUrl = `https://jadeite.migu.cn/music_search/v3/search/searchAll?isCorrect=0&isCopyright=1&searchSwitch=%7B%22song%22%3A1%2C%22album%22%3A0%2C%22singer%22%3A0%2C%22tagSong%22%3A1%2C%22mvSong%22%3A0%2C%22bestShow%22%3A1%2C%22songlist%22%3A0%2C%22lyricSong%22%3A0%7D&pageSize=${limit}&text=${encodeURIComponent(decoded)}&pageNo=${page}&sort=0&sid=USS`;

  try {
    const result = await httpsGet(apiUrl, {
      'User-Agent': 'Mozilla/5.0 (Linux; U; Android 11; zh-cn; MI 11) AppleWebKit/534.30',
      'uiVersion': 'A_music_3.6.1',
      'deviceId': deviceId,
      'timestamp': time,
      'sign': sign,
      'channel': '0146921',
    });

    const body = JSON.parse(result);
    if (body.code !== '000000') return errorResponse(res, 502, 'Migu error: ' + (body.info || ''));

    const songData = body.songResultData || {};
    const rawList = songData.resultList || [];
    const ids = new Set();
    const list = [];

    rawList.forEach(group => {
      (group || []).forEach(item => {
        if (!item.songId || !item.copyrightId || ids.has(item.copyrightId)) return;
        ids.add(item.copyrightId);

        let img = item.img3 || item.img2 || item.img1 || null;
        if (img && !/^https?:/.test(img)) img = 'http://d.musicapp.migu.cn' + img;

        const types = [];
        const _types = {};
        (item.audioFormats || []).forEach(fmt => {
          if (fmt.formatType === 'PQ') { types.push({ type: '128k' }); _types['128k'] = {}; }
          if (fmt.formatType === 'HQ') { types.push({ type: '320k' }); _types['320k'] = {}; }
          if (fmt.formatType === 'SQ') { types.push({ type: 'flac' }); _types.flac = {}; }
          if (fmt.formatType === 'ZQ24') { types.push({ type: 'hires' }); _types.hires = {}; }
        });

        list.push({
          id: item.copyrightId, songid: item.songId,
          title: item.name, name: item.name,
          artist: (item.singerList || []).map(s => s.name).join(','),
          author: (item.singerList || []).map(s => s.name).join(','),
          album_id: item.albumId, album: item.album,
          pic: img, img: img,
          duration: item.duration, interval: fmtDuration(item.duration),
          lrc: item.lrcUrl || '', lyric_id: item.lrcUrl || '',
          types, _types,
          _source: 'migu'
        });
      });
    });

    jsonResponse(res, 200, {
      success: true, platform: 'migu', keyword: decoded, page,
      count: list.length, data: list,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Migu Search Error]:', err.message);
    errorResponse(res, 502, 'Migu search failed', err.message);
  }
}

// GET /migu/url — 咪咕获取播放地址
async function handleMiguUrl(req, res, query) {
  const copyrightId = query.id || '';
  const type = query.type || 'SQ';
  if (!copyrightId) return errorResponse(res, 400, 'Missing copyrightId');

  try {
    const audioRes = await httpsGet(
      `https://c.musicapp.migu.cn/MIGUM2.0/v1.0/content/resourceinfo.do?resourceType=2&resourceId=${copyrightId}`,
      { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'channel': '0146921' }
    );
    const audioJson = JSON.parse(audioRes);
    const resources = audioJson?.resource || [];
    
    // 找最高音质
    const rateMap = { 'ZQ24': 4, 'SQ': 3, 'HQ': 2, 'PQ': 1 };
    let bestUrl = '', bestRate = -1;
    resources.forEach(r => {
      const rate = rateMap[r.rateFormats || type] || 0;
      if (r.newRateFormats?.[0]?.url && rate > bestRate) {
        bestUrl = r.newRateFormats[0].url || r.androidUrl || r.iosUrl || '';
        bestRate = rate;
      }
    });
    if (!bestUrl && resources[0]) {
      bestUrl = resources[0].newRateFormats?.[0]?.url || resources[0].androidUrl || resources[0].iosUrl || '';
    }

    if (!bestUrl) return errorResponse(res, 404, 'No playable URL found');
    jsonResponse(res, 200, { success: true, url: bestUrl });
  } catch (err) {
    console.error('[Migu URL Error]:', err.message);
    errorResponse(res, 502, 'Migu URL failed', err.message);
  }
}

function fmtDuration(sec) {
  if (!sec) return '00:00';
  const s = parseInt(sec);
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

// GET /migu/lyric — 咪咕歌词（优先 lrcUrl 直链，回退 MRC）
async function handleMiguLyric(req, res, query) {
  const lrcUrl = query.lrcUrl || '';
  const copyrightId = query.id || '';
  if (!lrcUrl && !copyrightId) return errorResponse(res, 400, 'Missing lrcUrl or copyrightId');

  try {
    if (lrcUrl) {
      const lrc = await httpsGet(lrcUrl, {});
      jsonResponse(res, 200, { success: true, platform: 'migu', lyric: lrc, type: 'lrc' });
    } else {
      const lyricRes = await httpsGet(
        `https://music.migu.cn/v3/api/music/audioPlayer/getLyric?copyrightId=${copyrightId}`,
        { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      );
      const j = JSON.parse(lyricRes);
      const lyric = (j && j.lyric) || (j && j.data && j.data.lyric) || '';
      jsonResponse(res, 200, { success: true, platform: 'migu', lyric, type: 'lrc' });
    }
  } catch (err) {
    console.error('[Migu Lyric Error]:', err.message);
    errorResponse(res, 502, 'Migu lyric failed', err.message);
  }
}

// QRC 解析：解密后的 XML/QRC 文本 → 结构化 JSON (每行时间戳 + 每字精确时间)
function parseQrcToStructured(qrcText) {
  if (!qrcText) return [];

  let content = qrcText;
  const lycMatch = content.match(/LyricContent="([\s\S]*?)"\/?>/);
  if (lycMatch) content = lycMatch[1];
  content = content.replace(/&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

  const lines = [];

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || /^\[(ti|ar|al|by|offset|la):/.test(line)) continue;

    // 格式: [line_start_ms,line_dur_ms]text1(start1,dur1)text2(start2,dur2)...
    const lineMatch = line.match(/^\[(\d+),(\d+)\](.*)/);
    if (!lineMatch) continue;

    const lineTime = parseInt(lineMatch[1]) / 1000;
    const remain = lineMatch[3]; // text(start,dur)text(start,dur)...

    // 用 (start,dur) 分割，保留分隔符（捕获组），文字在括号前面
    const parts = remain.split(/(\(\d+,\d+\))/);
    const chars = [];

    for (let i = 0; i < parts.length; i += 2) {
      const text = parts[i] || '';
      const stampPart = parts[i + 1]; // next is (start,dur)
      let charStart = 0, charDur = 0.3; // defaults

      if (stampPart) {
        const stampMatch = stampPart.match(/\((\d+),(\d+)\)/);
        if (stampMatch) {
          charStart = parseInt(stampMatch[1]) / 1000;
          charDur = parseInt(stampMatch[2]) / 1000;
        }
      }

      if (text.length > 0) {
        const perCharDur = charDur / text.length;
        for (let j = 0; j < text.length; j++) {
          // QRC 格式的 (start,dur) 已是相对于歌曲开头的绝对时间，无需再加 lineTime
          chars.push({
            c: text[j],
            t: +(charStart + j * perCharDur).toFixed(3),
            d: +perCharDur.toFixed(3)
          });
        }
      }
    }

    if (chars.length > 0) {
      lines.push({ time: lineTime, chars });
    }
  }

  return lines;
}

// GET /tencent/lyric-raw — QQ音乐 QRC 逐字歌词 (直接调API + Triple DES解密)
async function handleTencentLyricRaw(req, res, query) {
  const songId = query.id || query.songid || '';
  const songMid = query.songmid || '';

  console.log(`[QQ/LyricRaw] 📥 请求: id="${songId}" songmid="${songMid}"`);

  if (!songId && !songMid) return errorResponse(res, 400, 'Missing song ID (id or songmid)');

  const cookie = getPlatformCookie(req, 'tencent');
  if (!cookie) {
    return errorResponse(res, 403, '需要 QQ音乐 Cookie 才能获取逐字歌词。请将 Cookie 写入 cookies.json 的 tencent 字段');
  }

  try {
    // 🔒 修复：parseInt('002eCtZn2FfsqL') 会返回 2（错误！）
    // 必须用正则严格验证字符串是否为纯数字
    const isPureNumber = /^\d+$/.test(songId);
    let numericSongId = isPureNumber ? parseInt(songId) : NaN;

    // 🔒 优先使用 songmid 转换，比数字ID更可靠
    // 因为前端传来的 id 可能是 Meting 内部ID，不一定对应正确的QQ音乐歌曲
    if (songMid) {
      console.log(`[QQ/LyricRaw] 🔄 使用 songmid 转换 → songId: ${songMid}`);
      try {
        const infoResult = await httpsGet(
          `https://c.y.qq.com/v8/fcg-bin/fcg_play_single_song.fcg?songmid=${songMid}&platform=yqq&format=json`,
          { 'Referer': 'https://y.qq.com', 'Cookie': cookie }
        );
        const infoJson = JSON.parse(infoResult);
        if (infoJson.code === 0 && infoJson.data && infoJson.data.length > 0) {
          numericSongId = infoJson.data[0].id || infoJson.data[0].songid;
          console.log(`[QQ/LyricRaw] ✅ songmid 转换成功: ${songMid} → ${numericSongId}`);
        } else {
          console.warn(`[QQ/LyricRaw] ⚠️ songmid 转换失败:`, JSON.stringify(infoJson).slice(0, 200));
          // 转换失败时回退到使用原始 songId（如果它是纯数字）
          if (isPureNumber) {
            console.log(`[QQ/LyricRaw] ℹ️ 回退使用原始数字ID: ${numericSongId}`);
          } else {
            return errorResponse(res, 502, '无法将 songmid 转换为 songId: ' + songMid + ' (API返回空或格式错误)');
          }
        }
      } catch (parseErr) {
        console.error(`[QQ/LyricRaw] ❌ songmid 转换异常:`, parseErr.message);
        if (!isPureNumber) {
          return errorResponse(res, 502, 'songmid 转换请求失败: ' + parseErr.message);
        }
      }
    } else if (!isPureNumber) {
      // 没有 songmid 且 id 不是纯数字，尝试用 id 作为 songmid 转换
      const mid = songId;
      console.log(`[QQ/LyricRaw] 🔄 尝试用 id 作为 songmid 转换: ${mid}`);
      try {
        const infoResult = await httpsGet(
          `https://c.y.qq.com/v8/fcg-bin/fcg_play_single_song.fcg?songmid=${mid}&platform=yqq&format=json`,
          { 'Referer': 'https://y.qq.com', 'Cookie': cookie }
        );
        const infoJson = JSON.parse(infoResult);
        if (infoJson.code === 0 && infoJson.data && infoJson.data.length > 0) {
          numericSongId = infoJson.data[0].id || infoJson.data[0].songid;
          console.log(`[QQ/LyricRaw] ✅ 转换成功: ${mid} → ${numericSongId}`);
        } else {
          return errorResponse(res, 502, '无法将 songmid 转换为 songId: ' + mid);
        }
      } catch (parseErr) {
        return errorResponse(res, 502, 'songmid 转换请求失败: ' + parseErr.message);
      }
    }

    if (!numericSongId || isNaN(numericSongId)) {
      return errorResponse(res, 502, '无法获取有效的歌曲数字ID (id=' + songId + ', songmid=' + songMid + ')');
    }

    console.log(`[QQ/LyricRaw] 🎵 请求歌曲ID: ${numericSongId}`);

    const body = JSON.stringify({
      comm: { ct: '19', cv: '1859', uin: '0' },
      req: {
        method: 'GetPlayLyricInfo',
        module: 'music.musichallSong.PlayLyricInfo',
        param: {
          format: 'json', crypt: 1, ct: 19, cv: 1873,
          interval: 0, lrc_t: 0, qrc: 1, qrc_t: 0,
          roma: 1, roma_t: 0, songID: numericSongId,
          trans: 1, trans_t: 0, type: -1
        }
      }
    });

    let result;
    try {
      result = await httpsPost('https://u.y.qq.com/cgi-bin/musicu.fcg', body, {
        'Content-Type': 'application/json',
        'Referer': 'https://y.qq.com',
        'Cookie': cookie,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      });
    } catch (postErr) {
      console.error(`[QQ/LyricRaw] ❌ API请求失败:`, postErr.message);
      return errorResponse(res, 502, 'QQ音乐歌词API请求失败: ' + postErr.message);
    }

    // 验证响应是否为空或非JSON
    if (!result || result.trim().length === 0) {
      console.error('[QQ/LyricRaw] ❌ API返回空响应');
      return errorResponse(res, 502, 'QQ音乐API返回空响应（可能Cookie无效或IP被限制）');
    }

    let data;
    try {
      data = JSON.parse(result);
    } catch (parseErr) {
      console.error('[QQ/LyricRaw] ❌ 响应解析失败:', result.slice(0, 300));
      return errorResponse(res, 502, 'QQ音乐API响应解析失败（可能需要更新Cookie或API已变更）', {
        rawPreview: result.slice(0, 500),
        parseError: parseErr.message
      });
    }

    // 验证API返回状态码
    if (data.code !== 0) {
      console.error(`[QQ/LyricRaw] ❌ API错误码: ${data.code}`, JSON.stringify(data).slice(0, 300));
      const errMsg = data.errorMessage || data.msg || `未知错误(code=${data.code})`;
      return errorResponse(res, 502, 'QQ音乐API返回错误: ' + errMsg, { code: data.code });
    }

    if (!data.req || data.req.code !== 0) {
      console.error('[QQ/LyricRaw] ❌ 歌词请求失败:', JSON.stringify(data.req).slice(0, 300));
      const reqErrMsg = (data.req && data.req.errorMessage) || (data.req && data.req.msg) || '未知错误';
      return errorResponse(res, 502, 'QQ音乐歌词获取失败: ' + reqErrMsg, {
        reqCode: data.req ? data.req.code : 'no req field'
      });
    }

    const lyricData = data.req.data;
    if (!lyricData) {
      console.error('[QQ/LyricRaw] ❌ 歌词数据为空');
      return errorResponse(res, 502, 'QQ音乐返回的歌词数据为空');
    }

    let lrc = '', qrc = '', trans = '';
    const hasQrcFlag = lyricData.qrc === 1 || lyricData.qrc === '1';

    // 安全解密：lyric 字段包含实际的 QRC 加密数据
    if (lyricData.lyric && typeof lyricData.lyric === 'string' && lyricData.lyric.length > 20) {
      try {
        const decrypted = qrcDecrypt(lyricData.lyric);
        if (hasQrcFlag) {
          qrc = decrypted;
        } else {
          lrc = decrypted;
        }
        console.log(`[QQ/LyricRaw] ✅ 歌词解密成功: ${decrypted.length}字 qrc_flag=${hasQrcFlag}`);
      } catch (decryptErr) {
        console.warn('[QQ/LyricRaw] ⚠️ 歌词解密失败:', decryptErr.message);
        lrc = '';
      }
    }

    if (lyricData.trans && typeof lyricData.trans === 'string' && lyricData.trans.length > 20) {
      try {
        trans = qrcDecrypt(lyricData.trans);
        console.log(`[QQ/LyricRaw] ✅ 翻译解密成功: ${trans.length}字`);
      } catch (decryptErr) {
        console.warn('[QQ/LyricRaw] ⚠️ 翻译解密失败:', decryptErr.message);
        trans = '';
      }
    }

    if (lyricData.qrc && typeof lyricData.qrc === 'string' && lyricData.qrc.length > 20) {
      try {
        qrc = qrcDecrypt(lyricData.qrc);
        console.log(`[QQ/LyricRaw] ✅ QRC单独字段解密成功: ${qrc.length}字`);
      } catch (decryptErr) {
        console.warn('[QQ/LyricRaw] ⚠️ QRC解密失败:', decryptErr.message);
      }
    }

    // 如果 qrc 返回空/未加密，尝试用 lyric 字段
    if (!qrc && lrc) {
      console.log('[QQ/LyricRaw] ℹ️ QRC为空，使用LRC作为备选');
      qrc = lrc;
    }

    // 最终验证：至少要有一种歌词
    if (!qrc && !lrc) {
      console.error('[QQ/LyricRaw] ❌ 所有歌词字段均为空或解密失败');
      return errorResponse(res, 502, '歌词解密全部失败（LRC/QRC均为空），可能是：1.Cookie过期 2.歌曲无歌词 3.地区限制');
    }

    const parsedLyrics = parseQrcToStructured(qrc || lrc);

    console.log(`[QQ/LyricRaw] 🎉 解密完成 - ${parsedLyrics.length}行歌词 | 翻译:${trans ? '有' : '无'}`);

    jsonResponse(res, 200, {
      success: true,
      platform: 'tencent',
      lyrics: parsedLyrics,
      trans: trans || '',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[QQ/LyricRaw Error]:', err.stack || err.message);
    // 确保错误总是返回JSON格式
    try {
      errorResponse(res, 502, 'QQ音乐歌词解密异常: ' + err.message, {
        stack: err.stack ? err.stack.split('\n').slice(0, 5) : null
      });
    } catch (jsonErr) {
      // 如果连错误响应都失败了，返回纯文本JSON
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.writeHead(502);
      res.end(JSON.stringify({
        success: false,
        code: 502,
        message: 'QQ音乐歌词解密异常: ' + err.message,
        timestamp: new Date().toISOString()
      }));
    }
  }
}

// HTTPS POST 辅助
function httpsPost(urlStr, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const opts = {
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method: 'POST',
      headers: { 'Accept': 'application/json', ...headers },
      timeout: 15000,
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.setEncoding('utf-8');
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(body);
    req.end();
  });
}

// HTTPS GET 辅助
function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method: 'GET',
      headers: { 'Accept': 'application/json', ...headers },
      timeout: 10000,
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.setEncoding('utf-8');
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

function httpGetRaw(urlStr, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const isHttps = u.protocol === 'https:';
    const lib = isHttps ? https : http;
    const opts = {
      hostname: u.hostname,
      port: u.port || (isHttps ? 443 : 80),
      path: u.pathname + u.search,
      method: 'GET',
      headers: { ...headers },
      timeout: 10000,
    };
    const req = lib.request(opts, (resp) => {
      const setCookies = resp.headers['set-cookie'] || [];
      const chunks = [];
      resp.on('data', d => chunks.push(d));
      resp.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf-8');
        resolve({ body, cookies: setCookies, statusCode: resp.statusCode, location: resp.headers.location || '' });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

function httpPostRaw(urlStr, headers = {}, body = '') {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const isHttps = u.protocol === 'https:';
    const lib = isHttps ? https : http;
    const opts = {
      hostname: u.hostname,
      port: u.port || (isHttps ? 443 : 80),
      path: u.pathname + u.search,
      method: 'POST',
      headers: { ...headers },
      timeout: 10000,
    };
    const req = lib.request(opts, (resp) => {
      const setCookies = resp.headers['set-cookie'] || [];
      const chunks = [];
      resp.on('data', d => chunks.push(d));
      resp.on('end', () => {
        const respBody = Buffer.concat(chunks).toString('utf-8');
        resolve({ body: respBody, cookies: setCookies, statusCode: resp.statusCode, location: resp.headers.location || '' });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    if (body) req.write(body);
    req.end();
  });
}

async function followRedirectsWithCookies(urlStr, headers = {}, maxRedirects = 8) {
  const allCookies = [];
  let currentUrl = urlStr;
  let currentHeaders = { ...headers };

  for (let i = 0; i <= maxRedirects; i++) {
    const result = await httpGetRaw(currentUrl, currentHeaders);
    allCookies.push(...result.cookies);

    if ([301, 302, 303, 307, 308].includes(result.statusCode) && result.location) {
      let nextUrl = result.location;
      if (!nextUrl.startsWith('http')) {
        if (nextUrl.startsWith('//')) {
          const u = new URL(currentUrl);
          nextUrl = `${u.protocol}${nextUrl}`;
        } else {
          const u = new URL(currentUrl);
          nextUrl = `${u.protocol}//${u.host}${nextUrl}`;
        }
      }
      const cookieMap = {};
      for (const c of allCookies) {
        const kv = c.split(';')[0];
        const eqIdx = kv.indexOf('=');
        if (eqIdx > 0) cookieMap[kv.slice(0, eqIdx).trim()] = kv.slice(eqIdx + 1).trim();
      }
      currentHeaders['Cookie'] = Object.entries(cookieMap).map(([k, v]) => `${k}=${v}`).join('; ');
      currentUrl = nextUrl;
    } else {
      return { body: result.body, cookies: allCookies, statusCode: result.statusCode };
    }
  }
  throw new Error('Too many redirects');
}

// ============================================
// 🔐 网易云 weapi 加密模块
// ============================================
const NC = {
  nonce: '0CoJUm6Qyw8W8jud',
  iv: Buffer.from('0102030405060708'),
  pubKey: BigInt('0x010001'),
  modulus: BigInt('0x00e0b509f6259df8642dbc35662901477df22677ec152b5ff68ace615bb7b725152b3ab17a876aea8a5aa76d2e417629ec4ee341f56135fccf695280104e0312ecbda92557c93870114af6c9d05c4f7f0c3685b7a46bee255932575cce10b424d813cfe4875d3e82047b97ddef52741d546b8e289dc6935b3ece0462db0a22b8e7'),

  aesEncrypt(text, key) {
    const cipher = crypto.createCipheriv('aes-128-cbc', key, this.iv);
    return Buffer.concat([cipher.update(text), cipher.final()]);
  },

  rsaEncrypt(text) {
    const reversed = text.split('').reverse().join('');
    const hex = Buffer.from(reversed).toString('hex');
    const biText = BigInt('0x' + hex);
    const result = (biText ** this.pubKey) % this.modulus;
    return result.toString(16).padStart(256, '0');
  },

  createSecretKey() {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let key = '';
    for (let i = 0; i < 16; i++) {
      key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return key;
  },

  weapi(object) {
    const text = JSON.stringify(object);
    const secKey = this.createSecretKey();
    const encText = this.aesEncrypt(
      this.aesEncrypt(Buffer.from(text), Buffer.from(this.nonce)).toString('base64'),
      Buffer.from(secKey)
    ).toString('base64');
    const encSecKey = this.rsaEncrypt(secKey);
    return { params: encText, encSecKey };
  }
};

function neteaseWeapiPost(apiPath, data) {
  return new Promise((resolve, reject) => {
    const encrypted = NC.weapi(data);
    const body = new URLSearchParams(encrypted).toString();
    const opts = {
      hostname: 'music.163.com',
      port: 443,
      path: '/weapi/' + apiPath,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Referer': 'https://music.163.com/',
        'Cookie': 'os=pc; osver=Microsoft-Windows-10; appver=2.10.11; channel=netease;',
      },
      timeout: 10000,
    };
    const req = https.request(opts, (res) => {
      let result = '';
      const cookies = res.headers['set-cookie'] || [];
      res.setEncoding('utf-8');
      res.on('data', chunk => result += chunk);
      res.on('end', () => {
        try {
          resolve({ data: JSON.parse(result), cookies });
        } catch (_) {
          resolve({ data: result, cookies });
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(body);
    req.end();
  });
}

// ============================================
// 📱 扫码登录 API 端点
// ============================================

async function handleNeteaseQRKey(req, res) {
  try {
    const result = await neteaseWeapiPost('login/qrcode/unikey', { type: 1 });
    const unikey = result.data.unikey || result.data.data?.unikey;
    if (!unikey) return errorResponse(res, 502, '获取 unikey 失败', result.data);
    console.log('[Netease/QR] unikey:', unikey);

    const loginUrl = `https://music.163.com/login?codekey=${unikey}`;
    const m = generateQRMatrix(loginUrl);
    jsonResponse(res, 200, { success: true, code: 200, data: { unikey, qrurl: loginUrl, qrmatrix: m?.matrix, qrsize: m?.size } });
  } catch (err) {
    console.error('[Netease/QR/Key Error]:', err.message);
    errorResponse(res, 502, '获取网易云二维码 key 失败', err.message);
  }
}

async function handleNeteaseQRCheck(req, res, query) {
  const key = query.key;
  if (!key) return errorResponse(res, 400, 'Missing key parameter');
  try {
    const result = await neteaseWeapiPost('login/qrcode/client/login', { key, type: 1 });
    const code = result.data.code;
    console.log('[Netease/QR] check code:', code, '| cookies count:', (result.cookies||[]).length, '| data keys:', Object.keys(result.data||{}));
    if (code === 803) console.log('[Netease/QR] 803 raw data:', JSON.stringify(result.data).slice(0, 200));
    const response = { success: true, code, data: result.data };

    if (code === 803) {
      let cookie = '';
      if (result.data.cookie) cookie = result.data.cookie;
      if (!cookie && result.data.token) cookie = `MUSIC_U=${result.data.token}`;
      if (!cookie && result.cookies && result.cookies.length > 0) {
        const cookieMap = {};
        for (const c of result.cookies) {
          const kv = c.split(';')[0];
          const eqIdx = kv.indexOf('=');
          if (eqIdx > 0) cookieMap[kv.slice(0, eqIdx)] = kv;
        }
        cookie = Object.values(cookieMap).join('; ');
      }
      if (cookie) {
        response.cookie = cookie;
        console.log('[Netease/QR] cookie extracted, length:', cookie.length);
      } else {
        console.warn('[Netease/QR] 803 but NO cookie! Body:', JSON.stringify(result.data).slice(0, 300));
        console.warn('[Netease/QR] Set-Cookie headers:', JSON.stringify(result.cookies||[]));
      }
    }
    jsonResponse(res, 200, response);
  } catch (err) {
    console.error('[Netease/QR/Check Error]:', err.message);
    errorResponse(res, 502, '检查网易云扫码状态失败', err.message);
  }
}

const qqLoginSessions = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [id, s] of qqLoginSessions.entries()) {
    if (now - s.createdAt > 5 * 60 * 1000) qqLoginSessions.delete(id);
  }
}, 60 * 1000);

function _extractQQCookies(raw) {
  let uin = (raw.uin || raw.wxuin || '').replace(/\D/g, '');
  const pSkey = raw.p_skey || '';
  const skey = raw.skey || '';
  const pt4Token = raw.pt4_token || '';
  const qmKeyst = raw.qm_keyst || '';
  const qqmusicKey = raw.qqmusic_key || pSkey || qmKeyst;
  const parts = [];
  if (uin) parts.push(`uin=${uin}`);
  if (skey) parts.push(`skey=${skey}`);
  if (pSkey) parts.push(`p_skey=${pSkey}`);
  if (pt4Token) parts.push(`pt4_token=${pt4Token}`);
  if (qqmusicKey) parts.push(`qqmusic_key=${qqmusicKey}`);
  if (qmKeyst) parts.push(`qm_keyst=${qmKeyst}`);
  return parts.join('; ');
}

// Shared: js/utils.js ptHash33
function _calcPtqrtoken(qrsig) {
  let e = 0;
  for (let i = 0, len = qrsig.length; i < len; ++i) {
    e += (e << 5) + qrsig.charCodeAt(i);
  }
  return (e & 0x7fffffff).toString();
}

// g_tk 计算：hash33 算法，初始值 5381（用于 graph.qq.com OAuth 授权）
function _calcGtk(skey) {
  let hash = 5381;
  for (let i = 0; i < skey.length; i++) {
    hash += (hash << 5) + skey.charCodeAt(i);
  }
  return hash & 0x7fffffff;
}

function _extractJsVer(html) {
  const m = html.match(/ptui_version\s*[=:]\s*(?:encodeURIComponent\s*\(\s*["']|["'])(\d{6,10})/);
  if (m) return m[1];
  const m2 = html.match(/js_ver\s*[=:]\s*["']?(\d{6,10})/);
  if (m2) return m2[1];
  const m3 = html.match(/\/ver\/(\d{6,10})\//);
  if (m3) return m3[1];
  return '';
}

async function handleTencentQRShow(req, res, query) {
  try {
    // QQ音乐 appid=716027609, daid=383, pt_3rd_aid=100497308（QQ互联音乐应用）
    // s_url 指向 graph.qq.com/oauth2.0/login_jump，扫码后走 OAuth 流程拿 code 换 musickey
    const S_URL = 'https://graph.qq.com/oauth2.0/login_jump';
    const xloginUrl = `https://xui.ptlogin2.qq.com/cgi-bin/xlogin?appid=716027609&daid=383&style=33&login_text=%E7%99%BB%E5%BD%95&hide_title_bar=1&hide_border=1&target=self&s_url=${encodeURIComponent(S_URL)}&pt_3rd_aid=100497308&pt_feedback_link=${encodeURIComponent('https://support.qq.com/products/77942?customInfo=.appid100497308')}&theme=2&verify_theme=`;
    const xloginResult = await new Promise((resolve, reject) => {
      const u = new URL(xloginUrl);
      const r = https.request({
        hostname: u.hostname, port: 443, path: u.pathname + u.search, method: 'GET',
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', 'Referer': 'https://xui.ptlogin2.qq.com/' },
        timeout: 10000,
      }, (resp) => {
        const chunks = [];
        resp.on('data', d => chunks.push(d));
        resp.on('end', () => {
          const setCookies = resp.headers['set-cookie'] || [];
          const cookies = [];
          let ptLoginSig = '';
          for (const c of setCookies) {
            const kv = c.split(';')[0];
            cookies.push(kv);
            const m = c.match(/pt_login_sig=([^;]+)/);
            if (m) ptLoginSig = m[1];
          }
          const html = Buffer.concat(chunks).toString('utf-8');
          const jsVer = _extractJsVer(html);
          resolve({ ptLoginSig, cookies, cookiesStr: cookies.join('; '), jsVer, html });
        });
      });
      r.on('error', reject);
      r.on('timeout', () => { r.destroy(); reject(new Error('Timeout')); });
      r.end();
    });
    const jsVer = xloginResult.jsVer || '26050114';
    console.log('[Tencent/QR] xlogin pt_login_sig:', xloginResult.ptLoginSig.slice(0, 20), '| js_ver:', jsVer, '| cookies:', xloginResult.cookies.length);

    const qrUrl = `https://ssl.ptlogin2.qq.com/ptqrshow?appid=716027609&e=2&l=M&s=3&d=72&v=4&t=${Math.random()}&daid=383&pt_3rd_aid=100497308&u1=${encodeURIComponent(S_URL)}`;
    const result = await new Promise((resolve, reject) => {
      const u = new URL(qrUrl);
      const opts = {
        hostname: u.hostname, port: 443, path: u.pathname + u.search, method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://xui.ptlogin2.qq.com/',
          'Cookie': xloginResult.cookiesStr,
        },
        timeout: 10000,
      };
      const r = https.request(opts, (resp) => {
        const chunks = [];
        resp.on('data', d => chunks.push(d));
        resp.on('end', () => {
          const buf = Buffer.concat(chunks);
          const base64 = buf.toString('base64');
          const ct = resp.headers['content-type'] || 'image/png';
          const setCookies = resp.headers['set-cookie'] || [];
          let qrsigValue = '';
          const allCookies = [...xloginResult.cookies];
          for (const c of setCookies) {
            const kv = c.split(';')[0];
            allCookies.push(kv);
            const m = c.match(/qrsig=([^;]+)/);
            if (m) qrsigValue = m[1];
          }
          const ptqrtoken = qrsigValue ? _calcPtqrtoken(qrsigValue) : Date.now().toString();
          resolve({
            base64: `data:${ct};base64,${base64}`,
            qrsig: qrsigValue,
            ptqrtoken,
            ptLoginSig: xloginResult.ptLoginSig,
            cookiesStr: allCookies.join('; '),
          });
        });
      });
      r.on('error', reject);
      r.on('timeout', () => { r.destroy(); reject(new Error('Timeout')); });
      r.end();
    });

    const sessionId = crypto.randomBytes(16).toString('hex');
    qqLoginSessions.set(sessionId, {
      qrsig: result.qrsig,
      ptqrtoken: result.ptqrtoken,
      ptLoginSig: result.ptLoginSig,
      cookiesStr: result.cookiesStr,
      jsVer,
      createdAt: Date.now(),
    });

    console.log('[Tencent/QR] show qrsig:', result.qrsig.slice(0, 20), '| ptqrtoken:', result.ptqrtoken, '| session:', sessionId.slice(0, 12));
    jsonResponse(res, 200, {
      success: true,
      base64: result.base64,
      session_id: sessionId,
      qrsig: result.qrsig,
      ptqrtoken: result.ptqrtoken,
      ptLoginSig: result.ptLoginSig,
      cookies: result.cookiesStr,
    });
  } catch (err) {
    console.error('[Tencent/QR/Show Error]:', err.message);
    errorResponse(res, 502, '获取QQ音乐二维码失败', err.message);
  }
}

async function handleTencentQRCheck(req, res, query) {
  const sessionId = query.session_id || '';
  let ptqrtoken, qrsig, ptLoginSig, cookiesStr, jsVer;

  if (sessionId) {
    const session = qqLoginSessions.get(sessionId);
    if (!session) return errorResponse(res, 400, 'Session已过期，请重新获取二维码');
    ptqrtoken = session.ptqrtoken;
    qrsig = session.qrsig;
    ptLoginSig = session.ptLoginSig;
    cookiesStr = session.cookiesStr;
    jsVer = session.jsVer || '26050114';
  } else {
    ptqrtoken = query.ptqrtoken;
    qrsig = query.qrsig || '';
    ptLoginSig = query.pt_login_sig || '';
    cookiesStr = query.cookies || '';
    jsVer = '26050114';
  }

  if (!ptqrtoken) return errorResponse(res, 400, 'Missing ptqrtoken parameter');
  const ts = Math.floor(Date.now() / 1000);
  const loginSigParam = ptLoginSig || '';
  // QQ音乐 appid=716027609, daid=383, pt_3rd_aid=100497308, u1=graph.qq.com/oauth2.0/login_jump
  const checkUrl = `https://ssl.ptlogin2.qq.com/ptqrlogin?u1=${encodeURIComponent('https://graph.qq.com/oauth2.0/login_jump')}&ptqrtoken=${ptqrtoken}&ptredirect=0&h=1&t=1&g=1&from_ui=1&ptlang=2052&action=0-0-${ts}&js_ver=${jsVer}&js_type=1&login_sig=${encodeURIComponent(loginSigParam)}&pt_uistyle=40&aid=716027609&daid=383&pt_3rd_aid=100497308&has_resolve=1`;
  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://xui.ptlogin2.qq.com/',
      'Accept': '*/*',
      'Accept-Language': 'zh-CN,zh;q=0.9',
    };
    if (cookiesStr) {
      headers['Cookie'] = cookiesStr;
    } else if (qrsig) {
      headers['Cookie'] = `qrsig=${qrsig}`;
      if (ptLoginSig) headers['Cookie'] += `; pt_login_sig=${ptLoginSig}`;
    }

    const checkResult = await httpGetRaw(checkUrl, headers);
    const text = checkResult.body || '';
    if (!text || text.length < 10) {
      console.log('[Tencent/QR] ⚠ check response is empty or too short! statusCode:', checkResult.statusCode, '| body:', JSON.stringify(text).slice(0, 300));
      jsonResponse(res, 200, {
        success: false,
        status: 'error',
        code: String(checkResult.statusCode || '0'),
        data: text,
        message: `QQ返回空响应(statusCode=${checkResult.statusCode})`,
      });
      return;
    }
    const codeMatch = text.match(/ptuiCB\('(\d+)'/);
    const ptCode = codeMatch ? codeMatch[1] : '';
    if (!ptCode && text.length >= 10) {
      console.log('[Tencent/QR] ⚠ regex not match! raw text:', text.slice(0, 500));
    }
    const msgMatch = text.match(/ptuiCB\('[^']*','[^']*','[^']*','[^']*','[^']*','([^']*)'/);
    const ptMsg = msgMatch ? msgMatch[1] : '';
    const ptCodeToStatus = { '0': 'confirmed', '65': 'expired', '66': 'waiting', '67': 'scanned' };
    const status = ptCodeToStatus[ptCode] || 'waiting';
    console.log('[Tencent/QR] check ptCode:', ptCode, '| status:', status, '| msg:', ptMsg, '| via_session:', !!sessionId);
    if (ptCode === '0') console.log('[Tencent/QR] 0 raw text:', text.slice(0, 500));

    const response = {
      success: true,
      status,
      code: ptCode || '66',
      data: text,
      message: ptMsg,
    };

    if (ptCode === '0') {
      // 登录成功，开始 5 步流程换取 QQ音乐 musickey
      // Step 2 完成：ptqrlogin 返回 checkSigUrl 和 pt2gguin/skey/uin 等 cookie
      const loginCookieMap = {};
      for (const c of checkResult.cookies) {
        const kv = c.split(';')[0];
        const eqIdx = kv.indexOf('=');
        if (eqIdx > 0) loginCookieMap[kv.slice(0, eqIdx).trim()] = kv.slice(eqIdx + 1).trim();
      }
      console.log('[Tencent/QR] ptqrlogin Set-Cookie keys:', Object.keys(loginCookieMap).join(', '));

      const redirectMatch = text.match(/ptuiCB\('[^']*','[^']*','([^']+)'/);
      const checkSigUrl = redirectMatch ? redirectMatch[1] : '';
      if (!checkSigUrl) {
        console.warn('[Tencent/QR] ptCode=0 but no checkSigUrl! text:', text.slice(0, 300));
      }

      // 合并初始 cookiesStr（含 qrsig/pt_login_sig）和 ptqrlogin 新增 cookie
      const initialCookieMap = {};
      if (cookiesStr) {
        for (const part of cookiesStr.split(';')) {
          const eqIdx = part.indexOf('=');
          if (eqIdx > 0) initialCookieMap[part.slice(0, eqIdx).trim()] = part.slice(eqIdx + 1).trim();
        }
      }
      const mergedCookieMap = { ...initialCookieMap, ...loginCookieMap };
      let fullCookieStr = Object.entries(mergedCookieMap).map(([k, v]) => `${k}=${v}`).join('; ');

      // Step 3: 访问 check_sig URL，跟随重定向，获取 p_skey 等完整 cookie
      if (checkSigUrl) {
        try {
          const checkSigResult = await followRedirectsWithCookies(checkSigUrl, {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://xui.ptlogin2.qq.com/',
            'Cookie': fullCookieStr,
          });
          for (const c of checkSigResult.cookies) {
            const kv = c.split(';')[0];
            const eqIdx = kv.indexOf('=');
            if (eqIdx > 0) {
              const k = kv.slice(0, eqIdx).trim();
              const v = kv.slice(eqIdx + 1).trim();
              if (v) mergedCookieMap[k] = v;
            }
          }
          fullCookieStr = Object.entries(mergedCookieMap).map(([k, v]) => `${k}=${v}`).join('; ');
          console.log('[Tencent/QR] check_sig done, cookie keys:', Object.keys(mergedCookieMap).join(', '));
        } catch (checkSigErr) {
          console.warn('[Tencent/QR] check_sig failed:', checkSigErr.message);
        }
      }

      const pSkey = mergedCookieMap.p_skey || '';
      const uinFromCookie = (mergedCookieMap.uin || '').replace(/\D/g, '');

      // Step 4: POST graph.qq.com/oauth2.0/authorize，从 Location 中截取 code
      // 必须先访问 oauth2.0/show 页面设置 graph.qq.com cookie，否则 authorize 返回 error=100046
      let authCode = '';
      try {
        const gtk = pSkey ? _calcGtk(pSkey) : 5381;
        const redirectUri = 'https://y.qq.com/portal/wx_redirect.html?login_type=1&surl=' + encodeURIComponent('https://y.qq.com/?ADTAG=myqq#type=index');
        const state = Math.random().toString(36).slice(2);
        const showUrl = 'https://graph.qq.com/oauth2.0/show?' + new URLSearchParams({
          which: 'Login',
          display: 'pc',
          response_type: 'code',
          client_id: '100497308',
          redirect_uri: redirectUri,
          state,
          scope: 'get_user_info,get_app_friends',
        }).toString();

        // 先 GET show 页面，设置 graph.qq.com cookie
        const showResult = await httpGetRaw(showUrl, {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://graph.qq.com/',
          'Cookie': fullCookieStr,
        });
        // 合并 show 页面返回的 cookie
        for (const c of (showResult.cookies || [])) {
          const kv = c.split(';')[0];
          const eqIdx = kv.indexOf('=');
          if (eqIdx > 0) {
            const k = kv.slice(0, eqIdx).trim();
            const v = kv.slice(eqIdx + 1).trim();
            if (v) mergedCookieMap[k] = v;
          }
        }
        fullCookieStr = Object.entries(mergedCookieMap).map(([k, v]) => `${k}=${v}`).join('; ');
        console.log('[Tencent/QR] oauth2.0/show statusCode:', showResult.statusCode);

        const oauthBody = new URLSearchParams({
          response_type: 'code',
          client_id: '100497308',
          redirect_uri: redirectUri,
          scope: 'get_user_info,get_app_friends',
          state,
          switch: '',
          from_ptlogin: '1',
          src: '1',
          update_auth: '1',
          openapi: '1010_1030',
          g_tk: String(gtk),
          auth_time: String(Date.now()),
          ui: crypto.randomUUID(),
        }).toString();
        const oauthResult = await httpPostRaw('https://graph.qq.com/oauth2.0/authorize', {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': showUrl,
          'Origin': 'https://graph.qq.com',
          'Cookie': fullCookieStr,
        }, oauthBody);
        console.log('[Tencent/QR] oauth2.0/authorize statusCode:', oauthResult.statusCode, '| location:', (oauthResult.location || '').slice(0, 150));
        const codeMatch = (oauthResult.location || '').match(/code=([^&]+)/);
        if (codeMatch) authCode = codeMatch[1];
      } catch (oauthErr) {
        console.warn('[Tencent/QR] oauth2.0/authorize failed:', oauthErr.message);
      }

      // Step 5: POST u.y.qq.com/cgi-bin/musicu.fcg，用 code 调用 QQConnectLogin.LoginServer.QQLogin 换 musickey
      let musickey = '';
      let musicid = '';
      let refreshToken = '';
      if (authCode) {
        try {
          const payload = {
            comm: { g_tk: 5381, platform: 'yqq', ct: 24, cv: 0 },
            req: { module: 'QQConnectLogin.LoginServer', method: 'QQLogin', param: { code: authCode } },
          };
          const musicResult = await httpPostRaw('https://u.y.qq.com/cgi-bin/musicu.fcg', {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://y.qq.com/',
            'Origin': 'https://y.qq.com',
          }, JSON.stringify(payload));
          console.log('[Tencent/QR] musicu.fcg statusCode:', musicResult.statusCode, '| body:', (musicResult.body || '').slice(0, 300));
          const musicJson = JSON.parse(musicResult.body);
          if (musicJson && musicJson.code === 0 && musicJson.req && musicJson.req.code === 0 && musicJson.req.data) {
            musickey = musicJson.req.data.musickey || '';
            musicid = String(musicJson.req.data.musicid || '');
            refreshToken = musicJson.req.data.refresh_token || '';
            console.log('[Tencent/QR] got musickey! musicid:', musicid, '| musickey length:', musickey.length);
          } else {
            console.warn('[Tencent/QR] musicu.fcg returned non-zero:', JSON.stringify(musicJson).slice(0, 500));
          }
        } catch (musicErr) {
          console.warn('[Tencent/QR] musicu.fcg failed:', musicErr.message);
        }
      } else {
        console.warn('[Tencent/QR] no authCode, skip musicu.fcg');
      }

      // 组装最终 cookie
      let cookie = '';
      if (musickey && musicid) {
        // 完整 QQ音乐 cookie：uin + qm_keyst + qqmusic_key（musickey 即 qm_keyst）
        cookie = `uin=${musicid}; qm_keyst=${musickey}; qqmusic_key=${musickey}`;
      } else if (uinFromCookie) {
        // fallback：用 check_sig 拿到的 cookie
        cookie = _extractQQCookies(mergedCookieMap);
      }

      if (cookie) {
        response.cookie = cookie;
        console.log('[Tencent/QR] cookie extracted, length:', cookie.length, '| has musickey:', !!musickey);
        if (sessionId) qqLoginSessions.delete(sessionId);
      } else {
        console.warn('[Tencent/QR] ptCode=0 but no cookie! mergedCookieMap keys:', Object.keys(mergedCookieMap).join(', '));
      }
    }
    jsonResponse(res, 200, response);
  } catch (err) {
    console.error('[Tencent/QR/Check Error]:', err.message);
    errorResponse(res, 502, '检查QQ音乐扫码状态失败', err.message);
  }
}

const KUGOU_MID = crypto.randomBytes(16).toString('hex');
const KUGOU_DIID = crypto.randomBytes(16).toString('hex');

function kugouSignature(params) {
  const sigStr = 'NVPh5oo715z5DIWAeQlhMDsWXXQV4hwt';
  const paramsString = Object.keys(params).map(k => `${k}=${params[k]}`).sort().join('');
  return crypto.createHash('md5').update(`${sigStr}${paramsString}${sigStr}`).digest('hex');
}

function kugouDefaultParams(overrides) {
  const clienttime = Math.floor(Date.now() / 1000);
  return Object.assign({
    dfid: KUGOU_DIID,
    mid: KUGOU_MID,
    uuid: '-',
    appid: 1005,
    clientver: 20489,
    clienttime,
  }, overrides);
}

function kugouHeaders() {
  const clienttime = Math.floor(Date.now() / 1000);
  return {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Referer': 'https://www.kugou.com/',
    'dfid': KUGOU_DIID,
    'clienttime': String(clienttime),
    'mid': KUGOU_MID,
    'kg-rc': '1',
    'kg-thash': '5d816a0',
    'kg-rec': '1',
    'kg-rf': 'B9EDA08A64250DEFFBCADDEE00F8F25F',
  };
}

async function handleKugouQRGet(req, res) {
  try {
    const params = kugouDefaultParams({
      appid: 1001,
      type: 1,
      plat: 4,
      qrcode_txt: 'https://h5.kugou.com/apps/loginQRCode/html/index.html?appid=1005&',
      srcappid: 2919,
    });
    params.signature = kugouSignature(params);
    const qs = new URLSearchParams(params).toString();
    const apiUrl = `https://login-user.kugou.com/v2/qrcode?${qs}`;
    const result = await httpsGet(apiUrl, kugouHeaders());
    const data = JSON.parse(result);
    console.log('[Kugou/QR] get FULL:', JSON.stringify(data));
    if (data.data && data.data.qrcode) {
      const sessionKey = data.data.qrcode;
      const loginUrl = `https://h5.kugou.com/apps/loginQRCode/html/index.html?qrcode=${encodeURIComponent(sessionKey)}`;
      const m = generateQRMatrix(loginUrl);
      jsonResponse(res, 200, {
        success: true,
        data: { key: sessionKey, qrcode: loginUrl, qrurl: loginUrl, qrmatrix: m?.matrix, qrsize: m?.size },
      });
    } else {
      errorResponse(res, 502, '获取酷狗二维码失败', data);
    }
  } catch (err) {
    console.error('[Kugou/QR/Get Error]:', err.message);
    errorResponse(res, 502, '获取酷狗二维码失败', err.message);
  }
}

async function handleKugouQRCheck(req, res, query) {
  const key = query.key;
  if (!key) return errorResponse(res, 400, 'Missing key parameter');
  try {
    const params = kugouDefaultParams({
      plat: 4,
      appid: 1005,
      srcappid: 2919,
      qrcode: key,
    });
    params.signature = kugouSignature(params);
    const qs = new URLSearchParams(params).toString();
    const apiUrl = `https://login-user.kugou.com/v2/get_userinfo_qrcode?${qs}`;
    const result = await httpsGet(apiUrl, kugouHeaders());
    const data = JSON.parse(result);
    const status = data.data?.status;
    const errorCode = data.data?.error_code;
    console.log('[Kugou/QR] check: status=', status, 'error_code=', errorCode, '| keys:', Object.keys(data.data||{}).join(','));
    if (status === 4) console.log('[Kugou/QR] 4 FULL:', JSON.stringify(data.data).slice(0, 300));
    if (status === 0) console.warn('[Kugou/QR] expired! error_code=', errorCode, '| keys:', Object.keys(data.data||{}));

    if (status === 4 && !data.data?.token) {
      console.warn('[Kugou/QR] status=4 but no token! data keys:', Object.keys(data.data||{}));
    }

    const response = {
      success: true,
      data: data.data || data,
      rawStatus: data.status,
    };
    if (data.data?.status === 4) {
      response.cookie = `token=${data.data.token}; userid=${data.data.userid}`;
    }
    jsonResponse(res, 200, response);
  } catch (err) {
    console.error('[Kugou/QR/Check Error]:', err.message);
    errorResponse(res, 502, '检查酷狗扫码状态失败', err.message);
  }
}

// ============================================
// 🌐 HTTP 服务器 & 路由分发
// ============================================

function serveStatic(res, urlPath) {
  let filePath = path.join(STATIC_ROOT, urlPath);

  if (urlPath === '/') filePath = path.join(STATIC_ROOT, 'index.html');
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return errorResponse(res, 404, 'Not Found: ' + urlPath);
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME[ext] || 'application/octet-stream';

  setCORSHeaders(res);
  if (ext === '.html' || ext === '.json' || ext === '.js' || ext === '.css' || ext === '.svg') {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  } else {
    res.setHeader('Cache-Control', 'public, max-age=86400');
  }

  try {
    const stream = fs.createReadStream(filePath);
    stream.on('error', () => {
      if (!res.headersSent) {
        errorResponse(res, 404, 'Not Found');
      } else {
        res.end();
      }
    });
    res.writeHead(200, { 'Content-Type': contentType });
    stream.pipe(res);
  } catch (e) {
    errorResponse(res, 500, 'File read error');
  }
}

function handleCookieSave(req, res) {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', async () => {
    try {
      const data = JSON.parse(body);
      const { platform, cookie } = data;
      const validPlatforms = ['netease', 'tencent', 'kugou', 'kuwo', 'baidu'];
      if (!platform || !validPlatforms.includes(platform)) {
        return errorResponse(res, 400, 'Invalid platform');
      }
      const cookieDir = process.env.USER_DATA_PATH || path.join(__dirname, '..');
      const cookiePath = path.join(cookieDir, 'cookies.json');
      let cookies = {};
      if (_cookieCache) {
        cookies = JSON.parse(JSON.stringify(_cookieCache));
      } else {
        try { cookies = JSON.parse(await fs.promises.readFile(cookiePath, 'utf-8')); } catch(_) {}
      }
      if (cookie && cookie.trim()) {
        cookies[platform] = cookie.trim();
      } else {
        delete cookies[platform];
      }
      fs.writeFileSync(cookiePath, JSON.stringify(cookies, null, 2));
      _cookieCache = cookies;
      CONFIG.cookies = cookies;
      console.log(`[Cookie] ✓ ${platform} Cookie 已保存 (长度=${(cookie||'').length})`);
      jsonResponse(res, 200, { success: true, message: `${platform} cookie saved` });
    } catch (e) {
      errorResponse(res, 400, 'Invalid JSON body');
    }
  });
}

// GET /tencent/search — QQ音乐直接搜索（绕过 Meting）
async function handleTencentSearch(req, res, query) {
  const { id: keyword, page = '1', limit = '30' } = query;
  if (!keyword) return errorResponse(res, 400, 'Missing keyword');

  const cookie = getPlatformCookie(req, 'tencent') || '';

  try {
    const p = parseInt(page);
    const n = Math.min(parseInt(limit), 50);
    // Use QQ Music search API directly (no Cookie required for search)
    const searchUrl = `https://c.y.qq.com/soso/fcgi-bin/search_for_qq_cp?p=${p}&n=${n}&w=${encodeURIComponent(keyword)}&format=json`;
    
    const result = await httpsGet(searchUrl, {
      'Referer': 'https://y.qq.com',
      'Cookie': cookie,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    });
    
    const data = JSON.parse(result);
    const songList = data?.data?.song?.list || [];
    const songs = songList.map(item => ({
      id: item.songmid || item.media_mid,
      songid: item.songid || item.id || '',
      name: item.songname || item.name,
      artist: (item.singer || []).map(s => s.name).join(', '),
      album: item.albumname || '',
      pic_id: item.albummid || item.songmid,
      url_id: item.songmid || item.media_mid,
      lyric_id: item.songmid || item.media_mid,
      source: 'tencent',
      duration: item.interval || 0,
    }));

    jsonResponse(res, 200, {
      success: true,
      platform: 'tencent',
      keyword: decodeURIComponent(keyword),
      page: p,
      count: songs.length,
      data: songs,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Tencent Search Error]:', err.message);
    errorResponse(res, 502, 'Tencent search failed', err.message);
  }
}

// GET /tencent/recommend — QQ音乐推荐歌单
async function handleTencentRecommend(req, res, query) {
  const num = Math.min(parseInt(query.num) || 12, 30);
  const lastIndex = parseInt(query.last_index) || 0;
  const cookie = getPlatformCookie(req, 'tencent') || '';

  try {
    const data = JSON.stringify({
      comm: { g_tk: 5381, platform: 'yqq', ct: 24, cv: 0 },
      req_1: {
        module: 'music.recommend.RecommendFeed',
        method: 'get_recommend_feed',
        param: { last_index: lastIndex, num }
      }
    });
    const result = await httpsGet(
      `https://u.y.qq.com/cgi-bin/musicu.fcg?data=${encodeURIComponent(data)}`,
      {
        'Referer': 'https://y.qq.com',
        'Cookie': cookie,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      }
    );
    const json = JSON.parse(result);
    const shelfList = json?.req_1?.data?.v_shelf || [];
    const playlists = [];
    for (const shelf of shelfList) {
      for (const niche of (shelf.v_niche || [])) {
        for (const card of (niche.v_card || [])) {
          if (card.type === 500) {
            playlists.push({
              id: String(card.id || card.dissId || ''),
              name: card.title || card.dissName || '',
              cover: card.cover || card.imgUrl || '',
              trackCount: card.cnt || card.listenNum || 0,
              creator: card.miscellany?.rcmdtemplate || '',
              source: 'tencent',
            });
          }
        }
      }
    }
    jsonResponse(res, 200, {
      success: true,
      platform: 'tencent',
      count: playlists.length,
      data: playlists,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Tencent Recommend Error]:', err.message);
    errorResponse(res, 502, 'Tencent recommend failed', err.message);
  }
}

// GET /tencent/toplist — QQ音乐排行榜列表
async function handleTencentToplist(req, res, query) {
  const cookie = getPlatformCookie(req, 'tencent') || '';

  try {
    const data = JSON.stringify({
      comm: { g_tk: 5381, platform: 'yqq', ct: 24, cv: 0 },
      req_1: {
        module: 'musicToplist.ToplistInfoServer',
        method: 'GetAll',
        param: {}
      }
    });
    const result = await httpsGet(
      `https://u.y.qq.com/cgi-bin/musicu.fcg?data=${encodeURIComponent(data)}`,
      {
        'Referer': 'https://y.qq.com',
        'Cookie': cookie,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      }
    );
    const json = JSON.parse(result);
    const groups = json?.req_1?.data?.group || [];
    const toplists = [];
    for (const group of groups) {
      for (const item of (group.toplist || [])) {
        const topSongs = (item.song || []).slice(0, 3).map(s => ({
          name: s.title || s.songName || '',
          artist: s.singerName || '',
        }));
        toplists.push({
          id: String(item.topId || ''),
          name: item.topName || item.title || '',
          cover: item.mbFrontPicUrl || item.frontPicUrl || '',
          updateKey: item.updateKey || '',
          songs: topSongs,
          source: 'tencent',
        });
      }
    }
    jsonResponse(res, 200, {
      success: true,
      platform: 'tencent',
      count: toplists.length,
      data: toplists,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Tencent Toplist Error]:', err.message);
    errorResponse(res, 502, 'Tencent toplist failed', err.message);
  }
}

// GET /tencent/new-songs — QQ音乐新歌/排行榜详情
async function handleTencentNewSongs(req, res, query) {
  const topId = parseInt(query.topid) || 27;
  const songNum = Math.min(parseInt(query.song_num) || 30, 100);
  const cookie = getPlatformCookie(req, 'tencent') || '';

  try {
    const apiUrl = `https://c.y.qq.com/v8/fcg-bin/fcg_v8_toplist_cp.fcg?tpl=3&page=detail&topid=${topId}&type=top&song_begin=0&song_num=${songNum}&g_tk=5381&format=json&inCharset=utf8&outCharset=utf-8&platform=yqq.json`;
    const result = await httpsGet(apiUrl, {
      'Referer': 'https://y.qq.com',
      'Cookie': cookie,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    });
    const json = JSON.parse(result);
    const songList = json?.songlist || [];
    const songs = songList.map(item => {
      const data = item.data || item;
      return {
        id: data.songmid || data.mid || '',
        name: data.songname || data.title || '',
        artist: (data.singer || []).map(s => s.name).join(', '),
        album: data.albumname || data.album?.name || '',
        pic_id: data.albummid || data.album?.mid || data.songmid || '',
        url_id: data.songmid || data.mid || '',
        lyric_id: data.songmid || data.mid || '',
        source: 'tencent',
        duration: data.interval || 0,
      };
    });
    jsonResponse(res, 200, {
      success: true,
      platform: 'tencent',
      topId,
      count: songs.length,
      data: songs,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Tencent NewSongs Error]:', err.message);
    errorResponse(res, 502, 'Tencent new songs failed', err.message);
  }
}

// GET /tencent/playlist — QQ音乐歌单详情
async function handleTencentPlaylist(req, res, query) {
  const disstid = query.id || query.disstid || '';
  const page = Math.max(parseInt(query.page) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit) || 30, 1), 100);
  if (!disstid) return errorResponse(res, 400, 'Missing playlist id (disstid)');
  const cookie = getPlatformCookie(req, 'tencent') || '';

  try {
    // Use the public qzone playlist API (no login required)
    const qzoneUrl = `https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?format=json&type=1&disstid=${encodeURIComponent(disstid)}&utf8=1`;
    const qzoneResult = await httpsGet(qzoneUrl, {
      'Referer': 'https://c.y.qq.com/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    const qzoneJson = JSON.parse(qzoneResult);
    if (qzoneJson.code !== 0 || !qzoneJson.cdlist || qzoneJson.cdlist.length === 0) {
      return errorResponse(res, 502, 'Tencent playlist not found', JSON.stringify(qzoneJson).slice(0, 200));
    }
    const cd = qzoneJson.cdlist[0];
    const playlistName = cd.dissname || '';
    const playlistCover = cd.logo || '';
    const playlistDesc = cd.desc || '';
    const allSongs = cd.songlist || [];
    const total = allSongs.length;
    const start = (page - 1) * limit;
    const songList = allSongs.slice(start, start + limit);
    const tracks = songList.map(item => ({
      id: item.songmid || '',
      name: item.songname || '',
      artist: (item.singer || []).map(s => s.name).join(', '),
      album: item.albumname || '',
      pic_id: item.albummid || '',
      url_id: item.songmid || '',
      lyric_id: item.songmid || '',
      songid: String(item.songid || ''),
      source: 'tencent',
      duration: item.interval || 0,
    }));
    jsonResponse(res, 200, {
      success: true,
      platform: 'tencent',
      id: disstid,
      name: playlistName,
      cover: playlistCover,
      description: playlistDesc,
      trackCount: total,
      page,
      limit,
      total,
      data: tracks,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Tencent Playlist Error]:', err.message);
    errorResponse(res, 502, 'Tencent playlist detail failed', err.message);
  }
}

// GET /tencent/comment — QQ音乐评论
async function handleTencentComment(req, res, query) {
  const songId = query.id || '';
  const songMid = query.songmid || '';
  const num = Math.min(parseInt(query.num) || 20, 50);
  const page = parseInt(query.page) || 1;
  if (!songId && !songMid) return errorResponse(res, 400, 'Missing song id or songmid');
  const cookie = getPlatformCookie(req, 'tencent') || '';

  try {
    let numericId = songId;
    // 如果不是纯数字，需要转换
    if (!numericId || !/^\d+$/.test(numericId)) {
      // 用搜索 API 获取 songid（搜索歌名比搜索 songmid 更可靠）
      // 但 songmid 本身不是歌名，所以需要通过 fcg_play_single_song 转换
      // 如果有 Cookie，用 musicu.fcg 获取
      if (cookie) {
        try {
          const infoResult = await httpsGet(
            `https://c.y.qq.com/v8/fcg-bin/fcg_play_single_song.fcg?songmid=${songMid || songId}&platform=yqq&format=json`,
            { 'Referer': 'https://y.qq.com', 'Cookie': cookie, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
          );
          const infoJson = JSON.parse(infoResult);
          if (infoJson.code === 0 && infoJson.data && infoJson.data.length > 0) {
            numericId = String(infoJson.data[0].id || infoJson.data[0].songid || '');
          }
        } catch (e) {
          console.warn('[Tencent Comment] Cookie方式转换失败:', e.message);
        }
      }
    }

    if (!numericId || !/^\d+$/.test(numericId)) {
      return jsonResponse(res, 200, {
        success: true, platform: 'tencent', count: 0, total: 0, data: [],
        message: '无法获取歌曲数字ID，请配置QQ Cookie后重试',
        timestamp: new Date().toISOString(),
      });
    }

    const apiUrl = `https://c.y.qq.com/base/fcgi-bin/fcg_global_comment_h5.fcg?biztype=1&topid=${numericId}&cmd=8&pagenum=${page}&pagesize=${num}&reqtype=2`;
    const result = await httpsGet(apiUrl, {
      'Referer': 'https://y.qq.com',
      'Cookie': cookie,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    });
    const json = JSON.parse(result);
    const commentList = json?.comment?.commentlist || [];
    const comments = (Array.isArray(commentList) ? commentList : []).map(c => ({
      id: c.commentid || '',
      avatar: c.avatarurl || '',
      nickname: c.nick || '',
      content: c.rootcommentcontent || c.content || '',
      time: c.time || 0,
      likedCount: c.praisenum || 0,
    }));
    jsonResponse(res, 200, {
      success: true,
      platform: 'tencent',
      count: comments.length,
      total: json?.comment?.commenttotal || 0,
      data: comments,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Tencent Comment Error]:', err.message);
    errorResponse(res, 502, 'Tencent comment failed', err.message);
  }
}

// GET /download — 代理下载音频
async function handleDownload(req, res, query) {
  const { server: platform, id: songId, quality } = query;
  if (!platform || !songId) return errorResponse(res, 400, 'Missing required parameters');

  try {
    let m = await createMetingInstance(platform);
    const platformCookie = getPlatformCookie(req, platform);
    if (platformCookie) m.cookie(platformCookie);
    const bitrate = quality ? parseInt(quality) : 320;
    const rawResult = await withTimeout(m.url(songId, bitrate));
    const data = safeJSONParse(rawResult);
    const audioUrl = typeof data === 'string' ? data : (data?.url || null);

    if (!audioUrl) return errorResponse(res, 404, 'No audio URL available');

    const ext = audioUrl.includes('.flac') ? 'flac' : 'mp3';
    const contentType = ext === 'flac' ? 'audio/flac' : 'audio/mpeg';
    const filename = `${platform}_${songId}.${ext}`;

    let fetch;
    try { fetch = (await import('node-fetch')).default; } catch(_) {}
    const audioRes = await fetch(audioUrl, { timeout: 30000 });

    if (!audioRes.ok) return errorResponse(res, 502, 'Failed to fetch audio');

    setCORSHeaders(res);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', audioRes.headers.get('content-length') || '');

    audioRes.body.pipe(res);
  } catch (err) {
    console.error('[Download Error]:', err.message);
    errorResponse(res, 502, 'Download failed', err.message);
  }
}

const ROUTES = {
  '/health':             { handler: handleHealth,             method: 'GET' },
  '/search':             { handler: handleSearch,             method: 'GET' },
  '/tencent/search':     { handler: handleTencentSearch,      method: 'GET' },
  '/tencent/recommend':  { handler: handleTencentRecommend,   method: 'GET' },
  '/tencent/toplist':    { handler: handleTencentToplist,     method: 'GET' },
  '/tencent/new-songs':  { handler: handleTencentNewSongs,    method: 'GET' },
  '/tencent/playlist':   { handler: handleTencentPlaylist,    method: 'GET' },
  '/tencent/comment':    { handler: handleTencentComment,     method: 'GET' },
  '/aggregate/search':   { handler: handleAggregateSearch,    method: 'GET' },
  '/tencent/lyric-raw':  { handler: handleTencentLyricRaw,     method: 'GET' },
  '/tencent/qr/show':    { handler: handleTencentQRShow,      method: 'GET' },
  '/tencent/qr/check':   { handler: handleTencentQRCheck,     method: 'GET' },
  '/netease/qr/key':     { handler: handleNeteaseQRKey,       method: 'GET' },
  '/netease/qr/check':   { handler: handleNeteaseQRCheck,     method: 'GET' },
  '/kugou/qr/get':       { handler: handleKugouQRGet,         method: 'GET' },
  '/kugou/qr/check':     { handler: handleKugouQRCheck,       method: 'GET' },
  '/migu/search':        { handler: handleMiguSearch,          method: 'GET' },
  '/migu/lyric':         { handler: handleMiguLyric,           method: 'GET' },
  '/migu/url':           { handler: handleMiguUrl,             method: 'GET' },
  '/bilibili/search':    { handler: handleBilibiliSearch,      method: 'GET' },
  '/bilibili/url':       { handler: handleBilibiliUrl,         method: 'GET' },
  '/url':                { handler: handleUrl,                method: 'GET' },
  '/lyric':              { handler: handleLyric,              method: 'GET' },
  '/pic':                { handler: handlePic,                method: 'GET' },
  '/proxy-image':        { handler: handleProxyImage,        method: 'GET' },
  '/song':               { handler: handleSong,               method: 'GET' },
  '/album':              { handler: handleAlbum,              method: 'GET' },
  '/artist':             { handler: handleArtist,             method: 'GET' },
  '/playlist':           { handler: handlePlaylist,           method: 'GET' },
  '/download':           { handler: handleDownload,           method: 'GET' },
  '/api/cookie':         { handler: handleCookieSave,          method: 'POST' },
};

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  let pathname = parsedUrl.pathname.replace(/\/+$/, '') || '/';
  const clientIP = getClientIP(req);

  // OPTIONS 预检请求
  if (req.method === 'OPTIONS') {
    setCORSHeaders(res);
    res.writeHead(204);
    res.end();
    return;
  }

  // 限流检查
  const rateCheck = checkRateLimit(clientIP);
  if (!rateCheck.allowed) {
    res.setHeader('X-RateLimit-Limit', CONFIG.rateLimit.maxRequests);
    res.setHeader('X-RateLimit-Remaining', 0);
    res.setHeader('X-RateLimit-Reset', rateCheck.retryAfter);
    return errorResponse(res, 429, 'Too Many Requests', `Retry after ${rateCheck.retryAfter} seconds`);
  }

  // 设置速率限制头
  res.setHeader('X-RateLimit-Limit', CONFIG.rateLimit.maxRequests);
  res.setHeader('X-RateLimit-Remaining', rateCheck.remaining);

  // 路由匹配：支持路径式 /search?... 和 查询参数式 ?type=search&... 两种格式
  let route = ROUTES[pathname];
  
  // 如果根路径有 type 参数，按 type 分发（兼容前端旧版调用方式）
  if (!route && pathname === '/' && parsedUrl.query.type) {
    pathname = '/' + parsedUrl.query.type;
    route = ROUTES[pathname];
    console.log(`[Route] 类型分发: ?type=${parsedUrl.query.type} → ${pathname}`);
  }
  
  if (route) {
    if (route.method && route.method !== req.method) {
      return errorResponse(res, 405, `Method ${req.method} not allowed for ${pathname}`);
    }
    try {
      await route.handler(req, res, parsedUrl.query);
    } catch (handlerErr) {
      console.error('[Handler Error]', handlerErr.stack || handlerErr.message);
      errorResponse(res, 500, 'Internal Server Error');
    }
  } else if (pathname === '/' && !parsedUrl.query.type) {
    serveStatic(res, '/');
  } else if (pathname === '/') {
    // 根路径显示 API 文档
    setCORSHeaders(res);
    res.writeHead(200);
    res.end(JSON.stringify({
      service: '🎵 Meting Music API v1.1',
      description: '自建多平台音乐 API 服务 — 基于 metowolf/Meting (Node.js)',
      author: 'metowolf/Meting',
      github: 'https://github.com/metowolf/Meting',
      
      // 支持的平台
      platforms: {
        netease: { name: '网易云音乐', features: ['搜索', '歌曲', '专辑', '歌手', '歌单', 'URL', '歌词', '封面'] },
        tencent:  { name: 'QQ音乐(腾讯)', features: ['搜索', '歌曲', '专辑', '歌手', '歌单', 'URL', '歌词', '封面'] },
        kugou:    { name: '酷狗音乐',       features: ['搜索', '歌曲', '专辑', '歌手', '歌单', 'URL', '歌词', '封面'] },
        kuwo:     { name: '酷我音乐',       features: ['搜索', '歌曲', '专辑', '歌手', '歌单', 'URL', '歌词', '封面'] },
        baidu:    { name: '百度音乐',       features: ['搜索', '歌曲', '专辑', '歌手', '歌单', 'URL', '歌词', '封面'] },
      },

      // 所有端点
      endpoints: [
        { path: '/search',   method: 'GET', params: 'server, id(keyword), page?, limit?, type?', example: '/search?server=netease&id=周杰伦&page=1&limit=10' },
        { path: '/url',      method: 'GET', params: 'server, id(songID), r?(bitrate:128/192/320/999)', example: '/url?server=netease&id=35847388&r=320' },
        { path: '/lyric',    method: 'GET', params: 'server, id(lyricID)', example: '/lyric?server=netease&id=35847388' },
        { path: '/pic',      method: 'GET', params: 'server, id(picID), size?(px)', example: '/pic?server=netease&id=1407374890649284&size=300' },
        { path: '/song',     method: 'GET', params: 'server, id(songID)', example: '/song?server=netease&id=35847388' },
        { path: '/album',    method: 'GET', params: 'server, id(albumID)', example: '/album?server=netease&id=12345' },
        { path: '/artist',   method: 'GET', params: 'server, id(artistID), limit?', example: '/artist?server=netease&id=6452&limit=30' },
        { path: '/playlist', method: 'GET', params: 'server, id(playlistID)', example: '/playlist?server=netease&id=71384714' },
        { path: '/health',   method: 'GET', params: '-', description: '服务状态 & 运行信息' },
      ],

      // 环境变量配置
      env_config: {
        PORT: `端口（默认 ${CONFIG.port}）`,
        METING_COOKIES: '{"netease":"MUSIC_U=xxx;","tencent":"xxx"} — 平台Cookie（获取VIP链接等）',
      },

      usage_example: `${req.headers.host}/search?server=netease&id=周杰伦&page=1&limit=5`,
      health_check: `${req.headers.host}/health`,
    }, null, 2));
  } else {
    serveStatic(res, pathname);
  }
});

// ============================================
// 🚀 启动服务
// ============================================

(async () => {
  await asyncReadCookies();

  server.listen(CONFIG.port, '127.0.0.1', () => {
  console.log('');
  console.log('╔════════════════════════════════════════╗');
  console.log('║   🎵 Meting Music API 已启动            ║');
  console.log('╠════════════════════════════════════════╣');
  console.log(`║  地址:  http://localhost:${CONFIG.port}           ║`);
  console.log(`║  端口:  ${CONFIG.port}                            ║`);
  console.log('║                                        ║');
  if (CONFIG.cookies) {
    const platforms = Object.keys(CONFIG.cookies).join(', ');
    console.log(`║  Cookie: ${platforms.padEnd(28)}║`);
  } else {
    console.log('║  Cookie: 未配置 (VIP歌曲受限)        ║');
  }
  console.log('║                                        ║');
  console.log('║  可用接口:                              ║');
  console.log('║  /search  - 搜索歌曲                    ║');
  console.log('║  /url     - 获取播放地址               ║');
  console.log('║  /lyric   - 获取歌词                   ║');
  console.log('║  /pic     - 获取封面                   ║');
  console.log('║  /song    - 歌曲详情                   ║');
  console.log('║  /album   - 专辑信息                   ║');
  console.log('║  /artist  - 歌手列表                   ║');
  console.log('║  /playlist- 歌单内容                   ║');
  console.log('║  /health  - 健康检查                   ║');
  console.log('║  /netease/qr/* - 网易云扫码登录        ║');
  console.log('║  /tencent/qr/* - QQ音乐扫码登录        ║');
  console.log('║  /kugou/qr/*  - 酷狗扫码登录           ║');
  console.log('╚════════════════════════════════════════╝');
  console.log('');
});
})();

module.exports = server;

// 优雅关闭 — 仅在独立运行时退出进程
process.on('SIGTERM', () => {
  console.log('\n⏳ 收到 SIGTERM，正在关闭...');
  server.close(() => {
    console.log('✅ 服务已安全关闭');
    if (!process.env.ELECTRON_RUN_AS_NODE) process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\n⏳ 收到 Ctrl+C，正在关闭...');
  server.close(() => {
    console.log('✅ 服务已安全关闭');
    if (!process.env.ELECTRON_RUN_AS_NODE) process.exit(0);
  });
});
