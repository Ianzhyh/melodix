/**
 * 网易云音乐直连 API 模块
 * 搜索使用非 weapi 公网接口，其他操作回退 weapi（需要时）
 */

const https = require('https');
const http = require('http');
const crypto = require('crypto');

// ============================================
// weapi 加密模块（保留给需要 weapi 的接口）
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

// ============================================
// HTTP 辅助函数
// ============================================

function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const port = u.port || (u.protocol === 'https:' ? 443 : 80);
    const opts = {
      hostname: u.hostname,
      port,
      path: u.pathname + u.search,
      method: 'GET',
      headers: { 'Accept': 'application/json', ...headers },
      timeout: 10000,
    };
    const req = lib.request(opts, (res) => {
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

function neteaseWeapiPost(apiPath, data, cookie = '') {
  return new Promise((resolve, reject) => {
    const encrypted = NC.weapi(data);
    const body = new URLSearchParams(encrypted).toString();
    const cookieHeader = cookie ? `MUSIC_U=${cookie}` : '';
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
        'Origin': 'https://music.163.com',
        'Cookie': 'os=pc; osver=Microsoft-Windows-10; appver=2.10.11; channel=netease;' + (cookieHeader ? ` ${cookieHeader};` : ''),
      },
      timeout: 10000,
    };
    const req = https.request(opts, (res) => {
      let result = '';
      res.setEncoding('utf-8');
      res.on('data', chunk => result += chunk);
      res.on('end', () => {
        try {
          const firstObjEnd = result.indexOf('}{');
          const jsonStr = firstObjEnd > 0 ? result.slice(0, firstObjEnd + 1) : result;
          resolve(JSON.parse(jsonStr));
        } catch (_) {
          resolve(result);
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
// 标准化歌曲对象
// ============================================
function normalizeSong(song) {
  const artists = song.ar || song.artists || [];
  const album = song.al || song.album || {};
  const duration = song.dt || song.duration || 0;

  let picUrl = '';
  if (album.picUrl) picUrl = album.picUrl;
  else if (album.blurPicUrl) picUrl = album.blurPicUrl;
  else if (song.picUrl) picUrl = song.picUrl;

  return {
    id: String(song.id),
    title: song.name,
    artist: artists.map(a => a.name).join('/') || '',
    artistId: artists[0]?.id ? String(artists[0].id) : '',
    album: album.name || '',
    albumId: album.id ? String(album.id) : '',
    pic: picUrl,
    picId: album.pic_str || String(album.pic || album.picId || ''),
    duration: Math.floor(duration / 1000),
    lyricId: String(song.id),
    source: 'netease',
  };
}

// ============================================
// 搜索：使用非 weapi 公网 API（不受 IP 限制）
// ============================================
async function search(keyword, { page = 1, limit = 30, type = 1 } = {}, cookie = '') {
  try {
    const offset = (page - 1) * limit;
    // 使用非 weapi 的 /api/search/get，不需要 weapi 加密
    const url = `http://music.163.com/api/search/get?s=${encodeURIComponent(keyword)}&type=${type}&limit=${limit}&offset=${offset}`;
    const raw = await httpGet(url, {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Referer': 'https://music.163.com/',
      'Cookie': cookie ? `MUSIC_U=${cookie}` : '',
    });
    const result = JSON.parse(raw);
    if (result.code !== 200 || !result.result?.songs) {
      console.warn('[netease/search] 返回异常:', result.code, result.message || '');
      return [];
    }
    return result.result.songs.map(normalizeSong);
  } catch (err) {
    console.warn('[netease/search] 请求失败:', err.message);
    // 回退 weapi
    try {
      const result = await neteaseWeapiPost('cloudsearch/get/web', {
        s: keyword,
        type,
        offset: (page - 1) * limit,
        limit,
        total: true,
      }, cookie);
      if (result.code !== 200 || !result.result?.songs) {
        console.warn('[netease/search] weapi 回退也异常:', result.code, result.message || '');
        return [];
      }
      return result.result.songs.map(normalizeSong);
    } catch (err2) {
      console.warn('[netease/search] weapi 回退失败:', err2.message);
      return [];
    }
  }
}

async function song(songId, cookie = '') {
  try {
    const result = await neteaseWeapiPost('v3/song/detail', {
      c: JSON.stringify([{ id: songId }]),
      ids: '[' + songId + ']',
    }, cookie);
    if (result.code !== 200 || !result.songs?.length) {
      console.warn('[netease/song] 返回异常:', result.code, result.message || '');
      return null;
    }
    const detail = normalizeSong(result.songs[0]);
    detail.url = result.songs[0].url || '';
    return detail;
  } catch (err) {
    console.warn('[netease/song] 请求失败:', err.message);
    return null;
  }
}

async function artist(artistId, limit = 30, cookie = '') {
  try {
    let detail = { name: '', cover: '', description: '' };

    // 方式1：weapi POST 到 artist/detail
    try {
      const detailResult = await neteaseWeapiPost('artist/detail', { id: artistId, top: 50 }, cookie);
      if (detailResult.code === 200 && detailResult.data?.artist) {
        const a = detailResult.data.artist;
        let description = '';
        if (a.briefDesc) description = a.briefDesc;
        if (a.artistDesc && Array.isArray(a.artistDesc)) {
          const fullDesc = a.artistDesc.map(seg => {
            if (seg.ti && seg.txt) return seg.ti + '\n' + seg.txt;
            return seg.txt || '';
          }).filter(Boolean).join('\n\n');
          if (fullDesc) description = fullDesc;
        }
        detail = {
          name: a.name || '',
          cover: a.cover || a.picUrl || '',
          description,
        };
      }
    } catch (_) {}

    // 方式2：GET 回退
    if (!detail.name) {
      try {
        const detailRaw = await httpGet(
          `https://music.163.com/api/artist/detail/${artistId}`,
          {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://music.163.com/',
          }
        );
        const detailJson = JSON.parse(detailRaw);
        if (detailJson.code === 200 && detailJson.data?.artist) {
          const a = detailJson.data.artist;
          let description = '';
          if (a.briefDesc) description = a.briefDesc;
          if (a.artistDesc && Array.isArray(a.artistDesc)) {
            const fullDesc = a.artistDesc.map(seg => {
              if (seg.ti && seg.txt) return seg.ti + '\n' + seg.txt;
              return seg.txt || '';
            }).filter(Boolean).join('\n\n');
            if (fullDesc) description = fullDesc;
          }
          detail = {
            name: a.name || '',
            cover: a.cover || a.picUrl || '',
            description,
          };
        }
      } catch (_) {}
    }

    // 歌手热门歌曲
    const songsResult = await neteaseWeapiPost('v1/artist/songs', {
      id: artistId,
      limit,
      offset: 0,
      total: true,
      order: 'hot',
    }, cookie);
    const songs = (songsResult.code === 200 && songsResult.songs)
      ? songsResult.songs.map(normalizeSong)
      : [];

    if (!detail.name && songs.length > 0) {
      detail.name = songs[0].artist;
    }

    return {
      id: String(artistId),
      name: detail.name,
      cover: detail.cover,
      description: detail.description,
      songs,
      songCount: songs.length,
    };
  } catch (err) {
    console.warn('[netease/artist] 请求失败:', err.message);
    return null;
  }
}

async function album(albumId, cookie = '') {
  try {
    let albumData = null;

    try {
      const weapiResult = await neteaseWeapiPost('v1/album/detail', { id: albumId }, cookie);
      if (weapiResult.code === 200 && weapiResult.album) {
        albumData = weapiResult;
      }
    } catch (_) {}

    if (!albumData) {
      try {
        const raw = await httpGet(
          `https://music.163.com/api/album/detail/dynamic?id=${albumId}`,
          {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://music.163.com/',
          }
        );
        const result = JSON.parse(raw);
        if (result.code === 200 && result.album) {
          albumData = result;
        }
      } catch (_) {}
    }

    if (!albumData) {
      console.warn('[netease/album] 所有方式均未获取到专辑数据');
      return null;
    }

    const a = albumData.album;
    const songs = (a.songs || albumData.songs || []).map(normalizeSong);
    return {
      id: String(albumId),
      name: a.name || '',
      artist: a.artist?.name || (a.artists || []).map(ar => ar.name).join('/') || '',
      cover: a.picUrl || a.blurPicUrl || '',
      publishDate: a.publishTime ? new Date(a.publishTime).toISOString().slice(0, 10) : (a.publishDate || ''),
      company: a.company || '',
      description: a.description || '',
      songs,
      songCount: songs.length,
    };
  } catch (err) {
    console.warn('[netease/album] 请求失败:', err.message);
    return null;
  }
}

// 歌词：优先非 weapi，回退 weapi
async function lyric(songId, cookie = '') {
  try {
    // 首先尝试非 weapi 端点
    const url = `http://music.163.com/api/song/lyric?id=${songId}&lv=1&tv=1`;
    const raw = await httpGet(url, {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://music.163.com/',
      'Cookie': cookie ? `MUSIC_U=${cookie}` : '',
    });
    const result = JSON.parse(raw);
    if (result.lrc || result.tlyric) {
      return {
        lrc: result.lrc?.lyric || '',
        tlyric: result.tlyric?.lyric || '',
      };
    }
  } catch (_) {}

  // 回退 weapi
  try {
    const result = await neteaseWeapiPost('song/lyric', {
      id: songId,
      lv: 1,
      tv: 1,
    }, cookie);
    if (result.code !== 200) {
      console.warn('[netease/lyric] weapi 返回异常:', result.code, result.message || '');
      return null;
    }
    return {
      lrc: result.lrc?.lyric || '',
      tlyric: result.tlyric?.lyric || '',
    };
  } catch (err) {
    console.warn('[netease/lyric] weapi 请求失败:', err.message);
    return null;
  }
}

async function url(songId, bitrate = 320, cookie = '') {
  try {
    let level;
    if (bitrate >= 999) {
      level = 'hires';
    } else if (bitrate >= 320) {
      level = 'exhigh';
    } else {
      level = 'standard';
    }
    const result = await neteaseWeapiPost('song/enhance/player/url/v1', {
      ids: [songId],
      level,
      encodeType: 'aac',
    }, cookie);
    if (result.code !== 200 || !result.data?.length) {
      console.warn('[netease/url] 返回异常:', result.code, result.message || '');
      return { url: '' };
    }
    return { url: result.data[0].url || '' };
  } catch (err) {
    console.warn('[netease/url] 请求失败:', err.message);
    return null;
  }
}

async function pic(picId) {
  try {
    if (picId) {
      return { url: `https://music.163.com/api/img/blur/${picId}` };
    }
    console.warn('[netease/pic] 缺少 picId');
    return null;
  } catch (err) {
    console.warn('[netease/pic] 请求失败:', err.message);
    return null;
  }
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