/**
 * QQ音乐直连 API 模块
 * 不依赖 @meting/core，直接调用 QQ音乐开放接口
 */

const https = require('https');

// ============================================
// HTTPS 请求辅助函数
// ============================================

function httpsGet(urlStr, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
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
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

// ============================================
// 标准化歌曲对象
// ============================================

function normalizeSong(song) {
  // 兼容两种格式：
  // 1. 搜索结果：songmid/songname/singer[].name/albumname/albummid/albumid
  // 2. 歌手/专辑详情：mid/name/singer[].name/album.mid/album.name/album.mid
  const songmid = song.songmid || song.mid || '';
  const songname = song.songname || song.name || song.title || '';
  const singerArr = song.singer || [];
  const artistName = Array.isArray(singerArr)
    ? singerArr.map(s => s.name).join('/')
    : (singerArr || '');
  const artistMid = Array.isArray(singerArr) && singerArr[0]
    ? (singerArr[0].mid || '')
    : '';
  const albumObj = song.album || {};
  const albumName = song.albumname || albumObj.name || albumObj.title || '';
  const albumMid = song.albummid || albumObj.mid || '';
  const albumId = albumObj.id ? String(albumObj.id) : (song.albumid ? String(song.albumid) : '');

  return {
    id: songmid || String(song.id || song.songid || ''),
    title: songname,
    artist: artistName,
    artistId: artistMid,
    album: albumName,
    albumId: albumMid || albumId,
    pic: albumMid ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${albumMid}.jpg` : '',
    picId: albumMid || '',
    duration: song.interval || 0,
    lyricId: songmid || '',
    source: 'tencent',
  };
}

// ============================================
// API 函数
// ============================================

/**
 * 搜索歌曲
 * @param {string} keyword - 搜索关键词
 * @param {object} options - { page, limit }
 * @param {string} [cookie] - 可选 Cookie
 * @returns {Promise<Array>} 标准化歌曲列表
 */
async function search(keyword, { page = 1, limit = 30 } = {}, cookie) {
  try {
    const url = `https://c.y.qq.com/soso/fcgi-bin/client_search_cp?w=${encodeURIComponent(keyword)}&format=json&p=${page}&n=${limit}&cr=1`;
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://y.qq.com/',
    };
    if (cookie) headers['Cookie'] = cookie;

    const result = await httpsGet(url, headers);
    const json = JSON.parse(result);

    const songList = json?.data?.song?.list || [];
    return songList.map(normalizeSong);
  } catch (e) {
    console.warn('[tencent/search] 失败:', e.message);
    return null;
  }
}

/**
 * 歌曲详情
 * @param {string} songMid - 歌曲 mid
 * @param {string} [cookie] - 可选 Cookie
 * @returns {Promise<object|null>} 标准化歌曲详情
 */
async function song(songMid, cookie) {
  try {
    const url = `https://c.y.qq.com/v8/fcg-bin/fcg_play_single_song.fcg?songmid=${encodeURIComponent(songMid)}&platform=yqq&format=json`;
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://y.qq.com/',
    };
    if (cookie) headers['Cookie'] = cookie;

    const result = await httpsGet(url, headers);
    const json = JSON.parse(result);

    if (json.code === 0 && json.data && json.data.length > 0) {
      return normalizeSong(json.data[0]);
    }
    return null;
  } catch (e) {
    console.warn('[tencent/song] 失败:', e.message);
    return null;
  }
}

/**
 * 歌手详情 + 热门歌曲
 * @param {string} singerMid - 歌手 mid
 * @param {number} [limit=30] - 返回歌曲数量
 * @param {string} [cookie] - 可选 Cookie
 * @returns {Promise<object|null>} 歌手信息
 */
async function artist(singerMid, limit = 30, cookie) {
  try {
    // 使用 musicu.fcg 统一网关获取歌手信息
    const data = {
      comm: { ct: 24, cv: 0 },
      singer: {
        method: 'get_singer_detail_info',
        param: { sort: 5, singermid: singerMid, sin: 0, num: limit },
        module: 'music.web_singer_info_svr',
      },
    };
    const url = `https://u.y.qq.com/cgi-bin/musicu.fcg?format=json&loginUin=0&hostUin=0&inCharset=utf8&outCharset=utf-8&platform=yqq.json&needNewCode=0&data=${encodeURIComponent(JSON.stringify(data))}`;
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://y.qq.com/',
    };
    if (cookie) headers['Cookie'] = cookie;

    const result = await httpsGet(url, headers);
    const json = JSON.parse(result);

    const d = json?.singer?.data;
    if (!d) return null;

    const songList = d.songlist || [];
    const singerInfo = d.singer_info || {};
    const singerBrief = d.singer_brief || {};
    // 歌手封面：使用 mid 拼接
    const sMid = singerInfo.mid || singerMid;
    const singerAvatar = sMid ? `https://y.gtimg.cn/music/photo_new/T001R300x300M000${sMid}.jpg` : '';

    let description = (typeof singerBrief.desc === 'string' ? singerBrief.desc : '') || (typeof d.show_singer_desc === 'string' ? d.show_singer_desc : '');

    // 获取歌手 Wiki 简介（singer_brief.desc 通常为空）
    try {
      const wikiData = {
        comm: { ct: 24, cv: 0 },
        singer: {
          method: 'get_singer_desc_info',
          param: { singermid: singerMid, start: 0, num: 1 },
          module: 'music.web_singer_info_svr',
        },
      };
      const wikiUrl = `https://u.y.qq.com/cgi-bin/musicu.fcg?format=json&data=${encodeURIComponent(JSON.stringify(wikiData))}`;
      const wikiResult = await httpsGet(wikiUrl, headers);
      const wikiJson = JSON.parse(wikiResult);
      const wikiDesc = wikiJson?.singer?.data?.singer_desc || '';
      if (wikiDesc) description = wikiDesc;
    } catch (e) {
      // Wiki 获取失败不影响主流程
    }

    // 如果 Wiki API 未获取到，尝试 fcg_get_singer_desc 端点
    if (!description) {
      try {
        const descUrl = `https://c.y.qq.com/v8/fcg-bin/fcg_get_singer_desc.fcg?singer_mid=${singerMid}&format=json`;
        const descResult = await httpsGet(descUrl, headers);
        const descJson = JSON.parse(descResult);
        const descText = descJson?.data?.desc || descJson?.result?.desc || '';
        if (descText) description = descText;
      } catch (e) {
        // 回退端点获取失败不影响主流程
      }
    }

    return {
      id: sMid,
      name: singerInfo.name || singerBrief.name || '',
      cover: singerAvatar,
      description,
      songs: songList.map(normalizeSong),
      songCount: songList.length,
    };
  } catch (e) {
    console.warn('[tencent/artist] 失败:', e.message);
    return null;
  }
}

/**
 * 专辑详情 + 曲目列表
 * @param {string|number} albumId - 专辑 ID（数字）
 * @param {string} [cookie] - 可选 Cookie
 * @returns {Promise<object|null>} 专辑信息
 */
async function album(albumId, cookie) {
  // 判断 albumId 是 mid（纯字母数字，长度约14）还是数字 id
  const isMid = /^[a-zA-Z0-9]{10,20}$/.test(albumId) && /[a-zA-Z]/.test(albumId);

  if (isMid) {
    return await _albumByMid(albumId, cookie);
  } else {
    return await _albumById(albumId, cookie);
  }
}

// 使用 albummid 参数获取专辑信息
async function _albumByMid(albumId, cookie) {
  try {
    const data = {
      comm: { ct: 24, cv: 0 },
      album: {
        method: 'get_album_detail',
        param: { albummid: String(albumId) },
        module: 'music.web_album_info_svr',
      },
    };
    const url = `https://u.y.qq.com/cgi-bin/musicu.fcg?format=json&loginUin=0&hostUin=0&inCharset=utf8&outCharset=utf-8&platform=yqq.json&needNewCode=0&data=${encodeURIComponent(JSON.stringify(data))}`;
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://y.qq.com/',
    };
    if (cookie) headers['Cookie'] = cookie;

    const result = await httpsGet(url, headers);
    const json = JSON.parse(result);

    const d = json?.album?.data;
    if (!d) {
      return await _albumFallback(albumId, cookie);
    }

    const songList = d.songlist || d.list || [];
    const albumInfo = d.album_info || d;
    const albummid = albumInfo.albummid || albumInfo.mid || '';

    return {
      id: String(albumId),
      name: albumInfo.albumname || albumInfo.name || '',
      artist: albumInfo.singername || (albumInfo.singer ? albumInfo.singer.map(s => s.name).join('/') : ''),
      cover: albummid ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${albummid}.jpg` : (albumInfo.album_pic || ''),
      publishDate: albumInfo.publish_date || albumInfo.aDate || '',
      company: albumInfo.company || albumInfo.publish_company || '',
      description: albumInfo.desc || albumInfo.description || '',
      songs: songList.map(normalizeSong),
      songCount: songList.length,
    };
  } catch (e) {
    console.warn('[tencent/album] 失败:', e.message);
    return null;
  }
}

// 使用数字 id 参数获取专辑信息
async function _albumById(albumId, cookie) {
  try {
    const url = `https://i.y.qq.com/v8/fcg-bin/fcg_v8_album_info_cp.fcg?platform=h5page&albumid=${albumId}&g_tk=938407465&uin=0&format=json&inCharset=utf-8&outCharset=utf-8&notice=0&platform=h5&needNewCode=1`;
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://y.qq.com/',
    };
    if (cookie) headers['Cookie'] = cookie;

    const result = await httpsGet(url, headers);
    const json = JSON.parse(result);

    if (json.code !== 0 || !json.data) return null;

    const d = json.data;
    const songList = d.list || d.songlist || [];
    const albummid = d.albummid || d.mid || '';

    return {
      id: String(albumId),
      name: d.albumname || d.name || '',
      artist: d.singername || (d.singer ? d.singer.map(s => s.name).join('/') : ''),
      cover: albummid ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${albummid}.jpg` : '',
      publishDate: d.publish_date || d.aDate || '',
      company: d.company || d.publish_company || '',
      description: d.desc || d.description || '',
      songs: songList.map(normalizeSong),
      songCount: songList.length,
    };
  } catch (e) {
    console.warn('[tencent/album by id] 失败:', e.message);
    return null;
  }
}

// 旧版专辑 API 回退（使用 albummid）
async function _albumFallback(albumId, cookie) {
  try {
    const url = `https://i.y.qq.com/v8/fcg-bin/fcg_v8_album_info_cp.fcg?platform=h5page&albummid=${albumId}&g_tk=938407465&uin=0&format=json&inCharset=utf-8&outCharset=utf-8&notice=0&platform=h5&needNewCode=1`;
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://y.qq.com/',
    };
    if (cookie) headers['Cookie'] = cookie;

    const result = await httpsGet(url, headers);
    const json = JSON.parse(result);

    if (json.code !== 0 || !json.data) return null;

    const d = json.data;
    const songList = d.list || d.songlist || [];
    const albummid = d.albummid || d.mid || '';

    return {
      id: String(albumId),
      name: d.albumname || d.name || '',
      artist: d.singername || (d.singer ? d.singer.map(s => s.name).join('/') : ''),
      cover: albummid ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${albummid}.jpg` : '',
      publishDate: d.publish_date || d.aDate || '',
      company: d.company || d.publish_company || '',
      description: d.desc || d.description || '',
      songs: songList.map(normalizeSong),
      songCount: songList.length,
    };
  } catch (e) {
    console.warn('[tencent/album fallback] 失败:', e.message);
    return null;
  }
}

/**
 * 获取歌词
 * @param {string} songMid - 歌曲 mid
 * @param {string} [cookie] - 可选 Cookie
 * @returns {Promise<object|null>} { lrc: '原文歌词' }
 */
async function lyric(songMid, cookie) {
  try {
    const url = `https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_yqq.fcg?songmid=${encodeURIComponent(songMid)}&format=json`;
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://y.qq.com/',
    };
    if (cookie) headers['Cookie'] = cookie;

    const result = await httpsGet(url, headers);
    const json = JSON.parse(result);

    let lrc = '';

    // 歌词可能是 base64 编码
    if (json.lyric) {
      try {
        lrc = Buffer.from(json.lyric, 'base64').toString('utf-8');
      } catch (_) {
        lrc = json.lyric;
      }
    } else if (json.orig) {
      try {
        lrc = Buffer.from(json.orig, 'base64').toString('utf-8');
      } catch (_) {
        lrc = json.orig;
      }
    }

    return { lrc };
  } catch (e) {
    console.warn('[tencent/lyric] 失败:', e.message);
    return null;
  }
}

/**
 * 获取播放 URL
 * @param {string} songMid - 歌曲 mid
 * @param {number} [bitrate=320] - 比特率
 * @param {string} [cookie] - 可选 Cookie
 * @returns {Promise<object|null>} { url: '播放URL' }
 */
async function url(songMid, bitrate = 320, cookie) {
  const headers = {
    'Referer': 'https://y.qq.com',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': '*/*',
  };
  if (cookie) headers["Cookie"] = cookie;

  let uin = "0";
  let authst = "";
  if (cookie) {
    const uinM = cookie.match(/(?:^|;\s*)(?:p_)?uin=([^;]+)/);
    if (uinM) uin = uinM[1].replace(/^o/, "").replace(/\D/g, "");
    const keyM = cookie.match(/(?:^|;\s*)qm_keyst=([^;]+)/);
    if (keyM) authst = keyM[1];
    if (!authst) {
      const qqM = cookie.match(/(?:^|;\s*)qqmusic_key=([^;]+)/);
      if (qqM) authst = qqM[1];
    }
  }

  try {
    const detailUrl = 'https://c.y.qq.com/v8/fcg-bin/fcg_play_single_song.fcg?songmid=' + encodeURIComponent(songMid) + '&platform=yqq&format=json';
    const detailResult = await httpsGet(detailUrl, headers);
    const detailJson = JSON.parse(detailResult);
    if (!detailJson.data || detailJson.data.length === 0) {
      console.warn("[tencent/url] song not found"); return null;
    }
    const song = detailJson.data[0];
    const mediaMid = (song.file && song.file.media_mid) || song.mid;
    const songType = song.type || 0;

    const qualityList = [
      ['size_flac',   'F000', 'flac'],
      ['size_320mp3', 'M800', 'mp3'],
      ['size_192aac', 'C600', 'm4a'],
      ['size_128mp3', 'M500', 'mp3'],
      ['size_96aac',  'C400', 'm4a'],
    ];

    const songmidArr = [];
    const filenameArr = [];
    const songtypeArr = [];
    for (const q of qualityList) {
      songmidArr.push(song.mid);
      filenameArr.push(q[1] + mediaMid + '.' + q[2]);
      songtypeArr.push(songType);
    }

    const comm = { uin: String(uin), format: "json", ct: 24, cv: 0 };
    if (authst) { comm.authst = authst; comm.tmeLoginType = 2; }

    const payload = {
      req_0: {
        module: 'vkey.GetVkeyServer',
        method: 'CgiGetVkey',
        param: { guid: "10000", songmid: songmidArr, filename: filenameArr, songtype: songtypeArr, uin: String(uin), loginflag: 1, platform: "20" },
      },
      comm,
    };

    const vkeyUrl = "https://u.y.qq.com/cgi-bin/musicu.fcg?data=" + encodeURIComponent(JSON.stringify(payload));
    const vkeyResult = await httpsGet(vkeyUrl, headers);
    const vkeyJson = JSON.parse(vkeyResult);
    const vkeyData = vkeyJson.req_0 && vkeyJson.req_0.data;

    if (vkeyData && vkeyData.midurlinfo) {
      const sip = vkeyData.sip && vkeyData.sip[0];
      const midurlinfo = vkeyData.midurlinfo;
      for (let i = 0; i < midurlinfo.length; i++) {
        const info = midurlinfo[i];
        if (info.purl && info.purl.length > 0) {
          const playUrl = (sip || "https://ws.stream.qqmusic.qq.com/") + info.purl;
          console.log("[tencent/url] Got " + qualityList[i][0] + " URL via media_mid");
          return { url: playUrl };
        }
      }
      console.warn("[tencent/url] all purls empty (VIP required)");
    } else {
      console.warn("[tencent/url] vkey response invalid");
    }
  } catch (e) {
    console.warn("[tencent/url] vkey failed:", e.message);
  }

  return null;
}

async function pic(albumMid) {
  return `https://y.gtimg.cn/music/photo_new/T002R300x300M000${albumMid}.jpg`;
}

module.exports = {
  search,
  song,
  artist,
  album,
  lyric,
  url,
  pic,
};
