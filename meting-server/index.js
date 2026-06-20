import express from 'express';
import cors from 'cors';
import Meting from '@meting/core';

const app = express();
app.use(cors());
app.use(express.json());

// Initialize meting
let meting;
try {
  meting = new Meting();
} catch (e) {
  console.error("Failed to initialize Meting:", e);
}

// Helper to extract uin from cookie
function extractUin(cookie) {
  if (!cookie) return '0';
  const match = cookie.match(/(?:^|;)\s*uin=([^;]*)/);
  if (match) {
    let uin = match[1].trim();
    if (uin.startsWith('o')) {
      uin = uin.substring(1);
    }
    return uin;
  }
  return '0';
}

// Custom QQ Music search
async function qqSearch(keywords) {
  const url = `https://c.y.qq.com/soso/fcgi-bin/client_search_cp?w=${encodeURIComponent(keywords)}&p=1&n=20&format=json`;
  const resp = await fetch(url, {
    headers: {
      'Referer': 'https://y.qq.com/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });
  const text = await resp.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    const firstParen = text.indexOf('(');
    const lastParen = text.lastIndexOf(')');
    if (firstParen !== -1 && lastParen !== -1 && lastParen > firstParen) {
      const jsonStr = text.substring(firstParen + 1, lastParen);
      data = JSON.parse(jsonStr);
    } else {
      throw e;
    }
  }

  const list = (data.data && data.data.song && data.data.song.list) || [];
  return list.map(song => {
    const artist = song.singer ? song.singer.map(s => s.name).join(', ') : '';
    const album = song.albumname || (song.album ? song.album.name : '');
    const albummid = song.albummid || (song.album ? song.album.mid : '');
    const pic = albummid ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${albummid}.jpg` : '';
    return {
      id: song.songmid || song.mid,
      name: song.songname || song.title || song.name,
      artist: artist,
      album: album,
      pic: pic,
      source: 'tencent'
    };
  });
}

// Custom QQ Music url
async function qqUrl(id, cookie = '', name = '', artist = '') {
  let songmid = id;
  if (/^\d+$/.test(id)) {
    const detailUrl = `https://c.y.qq.com/v8/fcg-bin/fcg_play_single_song.fcg?songid=${id}&platform=yqq&format=json`;
    const detailResp = await fetch(detailUrl, {
      headers: {
        'Referer': 'https://y.qq.com/',
        'Cookie': cookie,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    const detailJson = await detailResp.json();
    if (detailJson && detailJson.data && detailJson.data[0]) {
      songmid = detailJson.data[0].mid;
    } else {
      throw new Error(`Failed to resolve songid to songmid for: ${id}`);
    }
  }

  const uin = extractUin(cookie);
  const body = JSON.stringify({
    comm: { ct: '19', cv: '1859', uin: uin },
    req: {
      method: 'CgiGetVkey',
      module: 'vkey.GetVkeyServer',
      param: {
        filename: [`M500${songmid}.mp3`],
        guid: '10000',
        songmid: songmid,
        songtype: [0],
        uin: uin,
        loginflag: 1,
        platform: '20'
      }
    }
  });

  const resp = await fetch('https://u.y.qq.com/cgi-bin/musicu.fcg', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Referer': 'https://y.qq.com/',
      'Cookie': cookie,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    body
  });
  const json = await resp.json();
  const data = json.req && json.req.data;
  if (data && data.midurlinfo && data.midurlinfo[0] && data.midurlinfo[0].purl) {
    const sip = data.sip && data.sip[0] ? data.sip[0] : 'https://dl.stream.qqmusic.qq.com/';
    const purl = data.midurlinfo[0].purl;
    return [{ url: sip + purl }];
  }
  // Fallback: try NetEase with song name + artist
  if (name || artist) {
    try {
      const searchQuery = [name, artist].filter(Boolean).join(' ');
      const neteaseRes = await fetch(`https://music.163.com/api/search/get/web?s=${encodeURIComponent(searchQuery)}&type=1&limit=1`, {
        headers: {
          'Referer': 'https://music.163.com/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      const neteaseData = await neteaseRes.json();
      const songs = neteaseData.result && neteaseData.result.songs;
      if (songs && songs.length > 0) {
        const neteaseId = String(songs[0].id);
        // Try Meting first, then direct API
        let urlResult = null;
        if (meting) {
          try {
            urlResult = await meting.url(neteaseId, { server: 'netease' });
          } catch (e) {
            console.error('Meting NetEase url failed:', e);
          }
        }
        if (urlResult && urlResult[0] && urlResult[0].url) {
          console.log(`QQ URL empty, fallback to NetEase (Meting) for: ${searchQuery}`);
          return urlResult;
        }
        // Direct NetEase API fallback
        try {
          const directUrl = `https://music.163.com/api/song/enhance/player/url?id=${neteaseId}&ids=%5B${neteaseId}%5D&br=320000`;
          const directRes = await fetch(directUrl, {
            headers: {
              'Referer': 'https://music.163.com/',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          });
          const directData = await directRes.json();
          if (directData.data && directData.data[0] && directData.data[0].url) {
            console.log(`QQ URL empty, fallback to NetEase (direct) for: ${searchQuery}`);
            return [{ url: directData.data[0].url }];
          }
        } catch (directErr) {
          console.error('NetEase direct URL failed:', directErr);
        }
      }
    } catch (fallbackErr) {
      console.error('NetEase fallback failed:', fallbackErr);
    }
  }
  return [{ url: '' }];
}

// Custom QQ Music lrc (converting hex QRC to base64)
async function qqLrc(id, cookie = '') {
  let songId = id;
  if (!/^\d+$/.test(id)) {
    const detailUrl = `https://c.y.qq.com/v8/fcg-bin/fcg_play_single_song.fcg?songmid=${id}&platform=yqq&format=json`;
    const detailResp = await fetch(detailUrl, {
      headers: {
        'Referer': 'https://y.qq.com/',
        'Cookie': cookie,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    const detailJson = await detailResp.json();
    if (detailJson && detailJson.data && detailJson.data[0]) {
      songId = detailJson.data[0].id;
    } else {
      throw new Error(`Failed to resolve songmid to songId for: ${id}`);
    }
  }

  const uin = extractUin(cookie);
  const body = JSON.stringify({
    comm: { ct: '19', cv: '1859', uin: uin },
    req: {
      method: 'GetPlayLyricInfo',
      module: 'music.musichallSong.PlayLyricInfo',
      param: {
        format: 'json', crypt: 1, ct: 19, cv: 1873,
        interval: 0, lrc_t: 0, qrc: 1, qrc_t: 0,
        roma: 1, roma_t: 0, songID: parseInt(songId, 10),
        trans: 1, trans_t: 0, type: -1,
        uin: uin
      }
    }
  });

  const lyricResp = await fetch('https://u.y.qq.com/cgi-bin/musicu.fcg', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Referer': 'https://y.qq.com/',
      'Cookie': cookie,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    body
  });
  const lyricJson = await lyricResp.json();
  const data = lyricJson.req && lyricJson.req.data;
  const encryptedHex = data && data.lyric;
  if (encryptedHex) {
    return Buffer.from(encryptedHex, 'hex').toString('base64');
  }
  return '';
}

// Custom QQ Music pic stream proxying
async function qqPic(id, size = '800', cookie = '') {
  let albummid = '';
  const paramName = /^\d+$/.test(id) ? 'songid' : 'songmid';
  const detailUrl = `https://c.y.qq.com/v8/fcg-bin/fcg_play_single_song.fcg?${paramName}=${id}&platform=yqq&format=json`;
  const detailResp = await fetch(detailUrl, {
    headers: {
      'Referer': 'https://y.qq.com/',
      'Cookie': cookie,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });
  const detailJson = await detailResp.json();
  if (detailJson && detailJson.data && detailJson.data[0] && detailJson.data[0].album) {
    albummid = detailJson.data[0].album.mid;
  }

  if (!albummid) {
    throw new Error(`Could not resolve albummid for: ${id}`);
  }

  const picUrl = `https://y.gtimg.cn/music/photo_new/T002R${size}x${size}M000${albummid}.jpg`;
  const response = await fetch(picUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch image from gtimg: ${response.statusText}`);
  }
  return {
    contentType: response.headers.get('content-type') || 'image/jpeg',
    buffer: Buffer.from(await response.arrayBuffer())
  };
}

// Fallback search for NetEase
async function neteaseSearchFallback(keywords) {
  const url = `https://music.163.com/api/search/get/web?s=${encodeURIComponent(keywords)}&type=1&limit=30`;
  const resp = await fetch(url, {
    headers: {
      'Referer': 'https://music.163.com/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });
  const data = await resp.json();
  const songs = (data.result && data.result.songs) || [];
  return songs.map(song => {
    const artist = song.artists ? song.artists.map(a => a.name).join(', ') : '';
    const album = song.album ? song.album.name : '';
    const pic = (song.album && song.album.picUrl) || '';
    return {
      id: String(song.id),
      name: song.name,
      artist: artist,
      album: album,
      pic: pic,
      source: 'netease'
    };
  });
}

// Handler
app.get('/', async (req, res) => {
  const { server, type, id, keywords, size } = req.query;
  const cookie = req.headers.cookie || '';

  try {
    if (server === 'tencent') {
      if (type === 'search') {
        const result = await qqSearch(keywords);
        return res.json(result);
      } else if (type === 'url') {
        const { name, artist } = req.query;
        const result = await qqUrl(id, cookie, name, artist);
        return res.json(result);
      } else if (type === 'lrc') {
        const result = await qqLrc(id, cookie);
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.send(result);
      } else if (type === 'pic') {
        const picResult = await qqPic(id, size || '800', cookie);
        res.setHeader('Content-Type', picResult.contentType);
        return res.send(picResult.buffer);
      } else {
        return res.status(400).json({ error: `Unknown type: ${type}` });
      }
    } else {
      if (!meting) {
        return res.status(500).json({ error: 'Meting fallback is not available' });
      }

      let metingPromise;
      if (type === 'search') {
        if (server === 'netease') {
          metingPromise = (async () => {
            try {
              const res = await meting.search(keywords, { server });
              if (!Array.isArray(res) || res.length === 0) {
                console.warn("NetEase search returned non-array or empty, falling back...");
                return await neteaseSearchFallback(keywords);
              }
              return res;
            } catch (err) {
              console.warn("NetEase search failed, using fallback API:", err);
              return await neteaseSearchFallback(keywords);
            }
          })();
        } else {
          metingPromise = meting.search(keywords, { server });
        }
      } else if (type === 'url') {
        metingPromise = meting.url(id, { server });
      } else if (type === 'lrc') {
        metingPromise = meting.lyric(id, { server });
      } else if (type === 'pic') {
        metingPromise = meting.pic(id, { server });
      } else {
        return res.status(400).json({ error: `Unknown type: ${type}` });
      }

      const result = await metingPromise;
      return res.json(result);
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
});

const portArg = process.argv.find(arg => arg.startsWith('--port='));
const port = portArg ? parseInt(portArg.split('=')[1], 10) : (parseInt(process.argv[2], 10) || 3000);

app.listen(port, () => {
  console.log(`Meting server listening on port ${port}`);
});
