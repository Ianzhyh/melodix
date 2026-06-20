import { useConfigStore } from '../stores/configStore';
import type { Song, Playlist, PlaylistDetail, SearchResult, LyricResult } from '../types/playback';

const getBaseUrl = (): string => {
  const port = useConfigStore.getState().sidecarPort;
  return `http://127.0.0.1:${port}`;
};

const getHeaders = (platform?: string): Record<string, string> => {
  const { cookies } = useConfigStore.getState();
  const headers: Record<string, string> = {};
  if (platform === 'tencent' && cookies.tencent) {
    headers['X-Tencent-Cookie'] = cookies.tencent;
  }
  // Add more platforms as needed
  return headers;
};

async function request<T>(path: string, options?: RequestInit & { signal?: AbortSignal }): Promise<T> {
  const baseUrl = getBaseUrl();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  // 如果有外部 signal，监听其取消事件
  if (options?.signal) {
    if (options.signal.aborted) {
      clearTimeout(timeoutId);
      controller.abort();
    } else {
      options.signal.addEventListener('abort', () => {
        clearTimeout(timeoutId);
        controller.abort();
      }, { once: true });
    }
  }
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      ...options,
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`API error: ${res.status} ${res.statusText}`);
    }
    return res.json();
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      // 外部 signal 主动取消时原样抛出 AbortError，便于调用方识别 race condition
      if (options?.signal?.aborted) {
        throw err;
      }
      throw new Error('请求超时，请检查网络连接或稍后重试');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 将各种 API 返回的原始歌曲数据统一映射为 Song 对象
 * @param raw 原始数据
 * @param source 数据来源（如 'netease', 'tencent'）
 * @param coverUrl 已弃用：参数保留仅为兼容，cover 字段始终来自 raw 中的原始 URL
 *                  （包装 / 代理在调用端通过 getProxyImageUrl / getProxiedCoverUrl 完成）
 */
function normalizeSong(raw: any, source: string, coverUrl?: string): Song {
  const isAlbumObject = typeof raw.album === 'object' && raw.album !== null;
  const picId = (isAlbumObject ? raw.album.picid : null) || raw.pic_id || raw.picId || '';
  const resolvedCover = (isAlbumObject ? raw.album.cover : null)
    || raw.pic
    || raw.cover
    || raw.img
    || coverUrl
    || '';
  return {
    id: String(raw.id || raw.songid || raw.mid || ''),
    name: raw.name || raw.songname || raw.title || '',
    artist: Array.isArray(raw.artist)
      ? raw.artist.map((a: any) => typeof a === 'object' ? a.name : a).join(', ')
      : (raw.artist || ''),
    album: (isAlbumObject ? raw.album.name : null) || raw.albumname || (typeof raw.album === 'string' ? raw.album : '') || '',
    cover: resolvedCover,
    picId,
    songId: String(raw.songid || raw.url_id || ''),
    source: raw.source || raw._source || source,
    duration: raw.duration || 0,
  };
}

// 4.2: search
export async function search(keyword: string, server: string = 'netease', page: number = 1, signal?: AbortSignal): Promise<SearchResult> {
  const headers = getHeaders(server);
  // tencent uses dedicated search endpoint (Meting's tencent search is broken)
  const searchPath = server === 'tencent'
    ? `/tencent/search?id=${encodeURIComponent(keyword)}&page=${page}`
    : `/search?server=${server}&id=${encodeURIComponent(keyword)}&page=${page}`;
  const json = await request<any>(searchPath, { headers, signal });
  const data = json.data || json;
  if (!Array.isArray(data)) {
    return { songs: [], total: 0, page };
  }
  const songs: Song[] = data.map((item: any) => normalizeSong(item, server));
  return { songs, total: data.length, page };
}

// 4.3: getUrl
export async function getUrl(id: string, server: string = 'netease', quality?: string, signal?: AbortSignal): Promise<{ url: string | null }> {
  const headers = getHeaders(server);
  const resolvedQuality = quality ?? (() => {
    const q = useConfigStore.getState().streamingQuality;
    switch (q) {
      case 'standard': return '128';
      case 'high': return '320';
      case 'lossless': return '999';
    }
  })();
  let path: string;
  if (server === 'migu') {
    path = `/migu/url?id=${id}`;
  } else if (server === 'bilibili') {
    path = `/bilibili/url?bvid=${id}`;
  } else {
    path = `/url?server=${server}&id=${id}`;
  }
  if (resolvedQuality) path += `&quality=${resolvedQuality}`;
  const json = await request<any>(path, { headers, signal });
  const data = json.data || json;
  return { url: data?.url || null };
}

// 4.4: getLyric
export async function getLyric(id: string, server: string = 'netease'): Promise<LyricResult> {
  const headers = getHeaders(server);
  if (server === 'tencent') {
    return request<any>(`/tencent/lyric-raw?id=${id}&songmid=${id}`, { headers });
  } else if (server === 'migu') {
    return request<any>(`/migu/lyric?id=${id}`, { headers });
  } else {
    return request<any>(`/lyric?server=${server}&id=${id}`, { headers });
  }
}

// 4.5: getPic
export function getPicUrl(id: string, server: string = 'netease', size: number = 300): string {
  return `${getBaseUrl()}/pic?server=${server}&id=${id}&size=${size}`;
}

export function getProxyImageUrl(url: string): string {
  if (!url) return '';
  // 避免重复包装：已经是代理 URL（来自 getProxiedCoverUrl）就直接返回
  if (url.includes('/proxy-image?')) {
    return url;
  }
  return `${getBaseUrl()}/proxy-image?url=${encodeURIComponent(url)}`;
}

export function getProxiedCoverUrl(picId: string, server: string = 'netease', size: number = 300): string {
  // /pic 端点本身已代理图片（直接返回二进制），无需再包 /proxy-image
  return getPicUrl(picId, server, size);
}

// 4.6: getPlaylist
export async function getPlaylist(id: string, server: string = 'netease', page: number = 1, limit: number = 30): Promise<PlaylistDetail | null> {
  try {
    if (server === 'tencent') {
      return await getTencentPlaylist(id, page, limit);
    }
    const headers = getHeaders(server);
    const json = await request<any>(`/playlist?server=${server}&id=${id}`, { headers });
    const data = json.data || json;
    return {
      id: data.id || id,
      name: data.name || data.title || 'Unknown Playlist',
      cover: data.cover || '',
      description: data.description || '',
      trackCount: data.trackCount || (Array.isArray(data.tracks) ? data.tracks.length : 0),
      tracks: Array.isArray(data.tracks) ? data.tracks.map((item: any) => normalizeSong(item, server)) : [],
      source: server,
      page: 1,
      limit: data.trackCount || (Array.isArray(data.tracks) ? data.tracks.length : 0),
      total: data.trackCount || (Array.isArray(data.tracks) ? data.tracks.length : 0),
    };
  } catch {
    return null;
  }
}

// 4.7: getRecommendations — QQ音乐推荐歌单
export async function getRecommendations(_server: string = 'netease'): Promise<Playlist[]> {
  const headers = getHeaders('tencent');
  try {
    const json = await request<any>('/tencent/recommend?num=12', { headers });
    const data = json.data || [];
    return data.map((item: any) => ({
      id: String(item.id),
      name: item.name || '',
      cover: item.cover || '',
      description: item.creator ? `by ${item.creator}` : '',
      trackCount: item.trackCount || 0,
      source: 'tencent',
    }));
  } catch {
    return [];
  }
}

// 4.8: getToplist — QQ音乐排行榜
export async function getToplist(): Promise<any[]> {
  const headers = getHeaders('tencent');
  try {
    const json = await request<any>('/tencent/toplist', { headers });
    return json.data || [];
  } catch {
    return [];
  }
}

// 4.9: getNewSongs — QQ音乐新歌/排行榜详情
export async function getNewSongs(topId: number = 27, songNum: number = 30): Promise<Song[]> {
  const headers = getHeaders('tencent');
  try {
    const json = await request<any>(`/tencent/new-songs?topid=${topId}&song_num=${songNum}`, { headers });
    const data = json.data || [];
    return data.map((item: any) => normalizeSong(item, 'tencent'));
  } catch {
    return [];
  }
}

// 4.10: getTencentPlaylist — QQ音乐歌单详情（用专用端点，支持分页）
export async function getTencentPlaylist(disstid: string, page: number = 1, limit: number = 30): Promise<PlaylistDetail | null> {
  try {
    const headers = getHeaders('tencent');
    const json = await request<any>(`/tencent/playlist?id=${disstid}&page=${page}&limit=${limit}`, { headers });
    const tracks = (json.data || []).map((item: any) => normalizeSong(item, 'tencent'));
    return {
      id: disstid,
      name: json.name || 'Unknown Playlist',
      cover: json.cover || '',
      description: json.description || '',
      trackCount: json.total || json.trackCount || tracks.length,
      tracks,
      source: 'tencent',
      page: json.page || page,
      limit: json.limit || limit,
      total: json.total || json.trackCount || tracks.length,
    };
  } catch {
    return null;
  }
}

// Download URL
export function getDownloadUrl(server: string, id: string, quality?: string): string {
  const baseUrl = getBaseUrl();
  const q = quality ?? qualityToApiParam(useConfigStore.getState().streamingQuality);
  return `${baseUrl}/download?server=${server}&id=${id}&quality=${q}`;
}

// Get comments
export async function getComments(songId: string, songMid: string, platform: string = 'tencent', num: number = 20, page: number = 1): Promise<any> {
  try {
    if (platform === 'tencent') {
      const headers = getHeaders('tencent');
      let path = `/tencent/comment?num=${num}&page=${page}`;
      // 优先用数字 ID，否则用 songmid
      if (songId && /^\d+$/.test(songId)) {
        path += `&id=${songId}`;
      } else if (songMid) {
        path += `&songmid=${songMid}`;
      } else {
        path += `&id=${songId}`;
      }
      return await request<any>(path, { headers });
    }
    return { success: false, data: [], total: 0, message: 'Comments are only supported for QQ Music' };
  } catch {
    return { success: false, data: [], total: 0 };
  }
}

// QQ Music QR Login
export async function getQRCode(): Promise<{ base64: string; session_id: string }> {
  const json = await request<any>('/tencent/qr/show');
  return { base64: json.base64, session_id: json.session_id };
}

export async function checkQRLogin(sessionId: string): Promise<{ code: string; cookie?: string; message?: string }> {
  const json = await request<any>(`/tencent/qr/check?session_id=${encodeURIComponent(sessionId)}`);
  return { code: String(json.code), cookie: json.cookie, message: json.message };
}

export function qualityToApiParam(quality: 'standard' | 'high' | 'lossless'): string {
  switch (quality) {
    case 'standard': return '128';
    case 'high': return '320';
    case 'lossless': return '999';
  }
}

export function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds === Infinity) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}
