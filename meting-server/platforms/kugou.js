/**
 * 酷狗音乐直连 API 模块
 * 使用 songsearch.kugou.com 端点
 */
const https = require('https');
const crypto = require('crypto');

// ============================================
// 签名机制
// ============================================
const KUGOU_SIG = 'NVPh5oo715z5DIWAeQlhMDsWXXQV4hwt';

function kugouSignature(params) {
  const paramsString = Object.keys(params).map(k => `${k}=${params[k]}`).sort().join('');
  return crypto.createHash('md5').update(`${KUGOU_SIG}${paramsString}${KUGOU_SIG}`).digest('hex');
}

function kugouDefaultParams(overrides) {
  const clienttime = Math.floor(Date.now() / 1000);
  return Object.assign({
    dfid: crypto.randomBytes(16).toString('hex'),
    mid: crypto.randomBytes(16).toString('hex'),
    uuid: '-',
    appid: 1005,
    clientver: 20489,
    clienttime,
  }, overrides);
}

function kugouHeaders() {
  return {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Referer': 'https://www.kugou.com/',
    'kg-rc': '1',
  };
}

// ============================================
// HTTPS 请求辅助
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
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        ...headers,
      },
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
    req.write(body);
    req.end();
  });
}

// ============================================
// 标准化歌曲对象
// ============================================
function normalizeSong(song) {
  return {
    id: String(song.id || song.hash || ''),
    title: song.name || song.songname || song.SongName || '',
    artist: song.singername || song.SingerName || '',
    artistId: String(song.singerid || song.SingerId || ''),
    album: song.album_name || song.AlbumName || '',
    albumId: String(song.album_id || song.AlbumID || ''),
    pic: song.img || '',
    picId: '',
    duration: song.duration || 0,
    lyricId: song.hash || song.FileHash || '',
    source: 'kugou',
  };
}

// ============================================
// 搜索：使用 songsearch.kugou.com（不需要签名）
// ============================================
async function search(keyword, { page = 1, limit = 30 } = {}) {
  try {
    // songsearch.kugou.com 不需要复杂签名，直接用 GET 请求
    const url = `https://songsearch.kugou.com/song_search_v2?keyword=${encodeURIComponent(keyword)}&page=${page}&pagesize=${limit}&platform=WebFilter`;
    const result = await httpsGet(url, {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://www.kugou.com/',
    });

    const data = JSON.parse(result);
    // song_search_v2 返回格式：data.lists 数组，每个元素有 FileHash, SongName, SingerName 等
    const list = data?.data?.lists || data?.data?.list || [];
    return list.map(song => normalizeSong(song));
  } catch (err) {
    console.warn('[Kugou] search failed:', err.message);
    return [];
  }
}

// ============================================
// artist(singerId, limit)
// ============================================
async function artist(singerId, limit = 30) {
  try {
    const detailParams = kugouDefaultParams({ singerid: singerId });
    detailParams.signature = kugouSignature(detailParams);
    const detailQs = new URLSearchParams(detailParams).toString();
    const detailResult = await httpsGet(
      `https://singer.kugou.com/get/singer/info?${detailQs}`,
      kugouHeaders()
    );
    const detailData = JSON.parse(detailResult);
    const singerInfo = detailData?.data || {};

    const songParams = kugouDefaultParams({ singer: singerId, page: 1, pagesize: limit });
    songParams.signature = kugouSignature(songParams);
    const songQs = new URLSearchParams(songParams).toString();
    const songResult = await httpsGet(
      `https://songsearch.kugou.com/song_search_v2?${songQs}`,
      kugouHeaders()
    );
    const songData = JSON.parse(songResult);
    const songs = (songData?.data?.lists || []).map(song => normalizeSong(song));

    return {
      id: String(singerId),
      name: singerInfo.singername || singerInfo.name || '',
      cover: singerInfo.imgurl || singerInfo.avatar || '',
      description: singerInfo.intro || singerInfo.desc || '',
      songs,
      songCount: songs.length,
    };
  } catch (err) {
    console.warn('[Kugou] artist failed:', err.message);
    return null;
  }
}

// ============================================
// album(albumId)
// ============================================
async function album(albumId) {
  try {
    const params = kugouDefaultParams({ album_id: albumId });
    params.signature = kugouSignature(params);
    const qs = new URLSearchParams(params).toString();
    const result = await httpsGet(
      `https://kmr.service.kugou.com/v2/album/info?${qs}`,
      kugouHeaders()
    );
    const data = JSON.parse(result);
    const albumData = data?.data || {};
    const songs = (albumData?.songlist || albumData?.songs || []).map(song => normalizeSong(song));

    return {
      id: String(albumId),
      name: albumData.album_name || albumData.name || '',
      artist: albumData.singername || albumData.artist || '',
      cover: albumData.imgurl || albumData.cover || '',
      publishDate: albumData.publish_date || albumData.publishtime || '',
      company: albumData.publish_company || albumData.company || '',
      description: albumData.intro || albumData.desc || albumData.description || '',
      songs,
      songCount: songs.length,
    };
  } catch (err) {
    console.warn('[Kugou] album failed:', err.message);
    return null;
  }
}

// ============================================
// lyric(hash)
// ============================================
async function lyric(hash) {
  try {
    const searchResult = await httpsGet(
      `https://krcs.kugou.com/search?ver=1&hash=${hash}&man=yes&client=pc`,
      {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.kugou.com/',
      }
    );
    const searchData = JSON.parse(searchResult);
    const candidates = searchData?.candidates || [];
    if (candidates.length === 0) {
      return { lrc: '' };
    }

    const lyricId = candidates[0].id;
    const accesskey = candidates[0].accesskey;

    const downloadResult = await httpsGet(
      `https://krcs.kugou.com/download?ver=1&client=pc&id=${lyricId}&accesskey=${accesskey}&fmt=lrc&charset=utf8`,
      {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.kugou.com/',
      }
    );
    const downloadData = JSON.parse(downloadResult);
    const lrcContent = downloadData?.content || '';

    if (lrcContent && downloadData?.fmt === 'krc') {
      try {
        return { lrc: Buffer.from(lrcContent, 'base64').toString('utf-8') };
      } catch (_) {
        return { lrc: lrcContent };
      }
    }

    return { lrc: lrcContent };
  } catch (err) {
    console.warn('[Kugou] lyric failed:', err.message);
    return null;
  }
}

// ============================================
// url(hash, albumId)
// ============================================
async function url(hash, albumId) {
  try {
    const params = kugouDefaultParams({
      hash,
      album_id: albumId || 0,
    });
    params.signature = kugouSignature(params);
    const qs = new URLSearchParams(params).toString();
    const result = await httpsGet(
      `https://wwwapi.kugou.com/yy/index.php?r=play/getdata&${qs}`,
      kugouHeaders()
    );
    const data = JSON.parse(result);
    const playUrl = data?.data?.play_url || data?.data?.url || '';
    return { url: playUrl };
  } catch (err) {
    console.warn('[Kugou] url failed:', err.message);
    return null;
  }
}

module.exports = {
  search,
  artist,
  album,
  lyric,
  url,
};