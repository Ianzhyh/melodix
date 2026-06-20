/**
 * 酷我音乐直连 API 模块
 * 使用 kuwo.cn 新搜索接口（无需 CSRF token）
 */
const https = require('https');
const crypto = require('crypto');

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

// ============================================
// 标准化歌曲对象
// ============================================
function normalizeSong(song) {
  // 兼容新旧两种格式
  return {
    id: String(song.rid || song.MUSICRID || song.id || '').replace('MUSIC_', ''),
    title: song.name || song.NAME || '',
    artist: song.artist || song.ARTIST || '',
    artistId: String(song.artistid || song.ARTISTID || ''),
    album: song.album || song.ALBUM || '',
    albumId: String(song.albumid || song.ALBUMID || ''),
    pic: song.albumpic || song.pic || '',
    picId: '',
    duration: Math.floor((song.duration || song.DURATION || 0) / (typeof song.DURATION !== 'undefined' && song.DURATION < 10000 ? 1 : 1000)),
    lyricId: String(song.rid || song.MUSICRID || song.id || '').replace('MUSIC_', ''),
    source: 'kuwo',
  };
}

// ============================================
// 搜索：使用 kuwo.cn 新接口（不需要 CSRF token）
// ============================================
async function search(keyword, { page = 1, limit = 30 } = {}) {
  try {
    const pn = page - 1; // 新 API 从 0 开始
    const url = `https://kuwo.cn/search/searchMusicBykeyWord?vipver=1&client=kt&ft=music&cluster=0&strategy=2012&encoding=utf8&rformat=json&mobi=1&issubtitle=1&show_copyright_off=1&pn=${pn}&rn=${limit}&all=${encodeURIComponent(keyword)}`;
    const result = await httpsGet(url, {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Referer': 'https://kuwo.cn/',
    });

    const data = JSON.parse(result);
    // 新接口返回 abslist 数组
    const list = data?.abslist || data?.data?.list || data?.data?.lists || data?.data || [];
    return list.map(song => normalizeSong(song));
  } catch (err) {
    console.warn('[Kuwo] search failed:', err.message);
    return [];
  }
}

// ============================================
// artist(artistId, limit)
// ============================================
async function artist(artistId, limit = 30) {
  try {
    // 歌手详情 - 尝试 www 接口
    let detailResult;
    try {
      detailResult = await httpsGet(
        `https://www.kuwo.cn/api/v1/www/singer/info?artistid=${artistId}`,
        {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://www.kuwo.cn/',
        }
      );
    } catch (_) {
      // 回退 kuwo.cn
      try {
        detailResult = await httpsGet(
          `https://kuwo.cn/api/v1/www/singer/info?artistid=${artistId}`,
          {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://kuwo.cn/',
          }
        );
      } catch (_) {}
    }
    const detailData = detailResult ? JSON.parse(detailResult) : {};
    const singerInfo = detailData?.data || {};

    // 歌手歌曲 - 使用新搜索接口
    let songs = [];
    try {
      const songResult = await httpsGet(
        `https://kuwo.cn/search/searchMusicBykeyWord?vipver=1&client=kt&ft=music&cluster=0&strategy=2012&encoding=utf8&rformat=json&mobi=1&issubtitle=1&show_copyright_off=1&pn=0&rn=${limit}&all=${encodeURIComponent(singerInfo.name || '')}`,
        {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://kuwo.cn/',
        }
      );
      const songData = JSON.parse(songResult);
      songs = (songData?.abslist || []).map(song => normalizeSong(song));
    } catch (_) {}

    return {
      id: String(artistId),
      name: singerInfo.name || singerInfo.artist || '',
      cover: singerInfo.pic || singerInfo.avatar || singerInfo.img || '',
      description: singerInfo.desc || singerInfo.description || singerInfo.info || '',
      songs,
      songCount: songs.length,
    };
  } catch (err) {
    console.warn('[Kuwo] artist failed:', err.message);
    return null;
  }
}

// ============================================
// album(albumId)
// ============================================
async function album(albumId) {
  try {
    let result;
    try {
      result = await httpsGet(
        `https://www.kuwo.cn/api/v1/www/album/albumInfo?albumId=${albumId}&pn=1&rn=100`,
        {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://www.kuwo.cn/',
        }
      );
    } catch (_) {
      try {
        result = await httpsGet(
          `https://kuwo.cn/api/v1/www/album/albumInfo?albumId=${albumId}&pn=1&rn=100`,
          {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://kuwo.cn/',
          }
        );
      } catch (_) {
        result = null;
      }
    }
    const data = result ? JSON.parse(result) : {};
    const albumData = data?.data || {};
    const songs = (albumData?.musicList || albumData?.songs || []).map(song => normalizeSong(song));

    return {
      id: String(albumId),
      name: albumData.album || albumData.name || '',
      artist: albumData.artist || '',
      cover: albumData.pic || albumData.cover || albumData.img || '',
      publishDate: albumData.pubDate || albumData.publishDate || albumData.releaseDate || '',
      company: albumData.company || '',
      description: albumData.desc || albumData.description || albumData.info || '',
      songs,
      songCount: songs.length,
    };
  } catch (err) {
    console.warn('[Kuwo] album failed:', err.message);
    return null;
  }
}

// ============================================
// lyric(songId)
// ============================================
async function lyric(songId) {
  try {
    const result = await httpsGet(
      `https://m.kuwo.cn/newh5/singles/songinfoandlrc?musicId=${songId}`,
      {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://m.kuwo.cn/',
      }
    );
    const data = JSON.parse(result);
    const lrclist = data?.data?.lrclist || [];

    if (lrclist.length === 0) {
      return { lrc: '' };
    }

    const lrcText = lrclist
      .map(line => {
        const min = Math.floor(line.lineLyricTime / 60);
        const sec = (line.lineLyricTime % 60).toFixed(2);
        const timeTag = `[${String(min).padStart(2, '0')}:${sec.padStart(5, '0')}]`;
        return `${timeTag}${line.lineLyric || ''}`;
      })
      .join('\n');

    return { lrc: lrcText };
  } catch (err) {
    console.warn('[Kuwo] lyric failed:', err.message);
    return null;
  }
}

// ============================================
// url(songId, bitrate)
// ============================================
async function url(songId, bitrate = 320) {
  try {
    // 使用 antiserver 接口（不需要 CSRF token）
    let format = 'mp3';
    let br = '128kmp3';
    if (bitrate >= 999) {
      format = 'flac';
      br = '2000kflac';
    } else if (bitrate >= 320) {
      br = '320kmp3';
    }

    const result = await httpsGet(
      `https://antiserver.kuwo.cn/anti.s?type=convert_url3&rid=${songId}&format=${format}&br=${br}&response=url`,
      {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://kuwo.cn/',
      }
    );
    const data = JSON.parse(result);
    const playUrl = data?.url || '';
    return { url: playUrl };
  } catch (err) {
    // 回退 www 接口
    try {
      const result = await httpsGet(
        `https://www.kuwo.cn/api/v1/www/music/playInfo?mid=${songId}&type=music&httpsStatus=1`,
        {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://www.kuwo.cn/',
        }
      );
      const data = JSON.parse(result);
      const playUrl = data?.data?.url || '';
      return { url: playUrl };
    } catch (err2) {
      console.warn('[Kuwo] url failed:', err2.message);
      return null;
    }
  }
}

module.exports = {
  search,
  artist,
  album,
  lyric,
  url,
};