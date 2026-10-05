import { invoke } from '@tauri-apps/api/core';
import { useConfigStore } from '../stores/configStore';
import type { Song, Playlist, PlaylistDetail, SearchResult, LyricResult, AlbumDetail, ArtistDetail, ArtistRef, SearchArtistItem, SearchAlbumItem, SearchPlaylistItem } from '../types/playback';

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

// ===== Sidecar 延迟启动 / 空闲退出管理 =====
// sidecar 不在应用启动时立即启动，而是首次请求时触发；
// 10 分钟无请求后由 App.tsx 定时器调用 stop_sidecar 退出。
let sidecarStartPromise: Promise<void> | null = null;
let lastActivity = Date.now();

export function getSidecarLastActivity(): number {
  return lastActivity;
}

// 刷新 sidecar 活动时间（用于下载等非 request() 场景保活）
export function touchSidecarActivity(): void {
  lastActivity = Date.now();
}

// 确保 sidecar 正在运行：首次调用启动，并发调用合并为同一个 Promise。
export async function ensureSidecarRunning(): Promise<void> {
  const { sidecarStatus } = useConfigStore.getState();
  if (sidecarStatus === 'running') return;
  if (sidecarStartPromise) {
    await sidecarStartPromise;
    return;
  }
  sidecarStartPromise = (async () => {
    useConfigStore.getState().setSidecarStatus('starting');
    useConfigStore.getState().setSidecarError(null);
    try {
      const port = await invoke<number>('start_sidecar');
      useConfigStore.getState().setSidecarPort(port);
      // 轮询等待 sidecar HTTP 服务就绪
      const startTime = Date.now();
      let ready = false;
      for (let i = 0; i < 60; i++) {
        if (Date.now() - startTime > 30000) break;
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 2000);
          await fetch(`http://127.0.0.1:${port}/health`, { signal: controller.signal });
          clearTimeout(timer);
          ready = true;
          break;
        } catch {
          await new Promise(r => setTimeout(r, 500));
        }
      }
      if (!ready) throw new Error('服务启动超时，请重试');
      useConfigStore.getState().setSidecarStatus('running');
      lastActivity = Date.now();
      console.log(`[Melodix] Sidecar ready on port ${port}`);
    } catch (e) {
      useConfigStore.getState().setSidecarStatus('error');
      useConfigStore.getState().setSidecarError(e instanceof Error ? e.message : String(e));
      throw e;
    } finally {
      sidecarStartPromise = null;
    }
  })();
  await sidecarStartPromise;
}

async function request<T>(path: string, options?: RequestInit & { signal?: AbortSignal }): Promise<T> {
  await ensureSidecarRunning();
  lastActivity = Date.now();
  try {
    return await doRequest<T>(path, options);
  } catch (err) {
    // sidecar 可能已崩溃（连接被拒绝）— 重启并重试一次
    if (err instanceof TypeError && useConfigStore.getState().sidecarStatus === 'running') {
      useConfigStore.getState().setSidecarStatus('idle');
      await ensureSidecarRunning();
      lastActivity = Date.now();
      return await doRequest<T>(path, options);
    }
    throw err;
  }
}

async function doRequest<T>(path: string, options?: RequestInit & { signal?: AbortSignal }): Promise<T> {
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
  // 专辑 ID：腾讯 album_id/albummid、网易 album_id、对象形态 album.id/mid
  const albumId = raw.album_id || raw.albumId || raw.albummid
    || (isAlbumObject ? (raw.album.mid || raw.album.id) : null)
    || '';
  // 歌手明细：腾讯 singer[]、网易 singer[]/ar[]
  const singersRaw = Array.isArray(raw.singer) ? raw.singer
    : Array.isArray(raw.ar) ? raw.ar
    : Array.isArray(raw.artists) ? raw.artists
    : [];
  const artists: ArtistRef[] = (singersRaw as any[])
    .map((a: any): ArtistRef => ({
      id: String((a && (a.mid || a.id)) ?? ''),
      name: (a && a.name) || '',
    }))
    .filter((a) => a.id || a.name);
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
    albumId: albumId ? String(albumId) : undefined,
    artists: artists.length > 0 ? artists : undefined,
  };
}

// 4.2: search
export async function search(keyword: string, server: string = 'netease', page: number = 1, signal?: AbortSignal): Promise<SearchResult> {
  const headers = getHeaders(server);
  // tencent uses dedicated search endpoint (Meting's tencent search is broken)
  // netease uses eapi endpoint so results carry album/artist IDs for detail pages
  let searchPath: string;
  if (server === 'tencent') {
    searchPath = `/tencent/search?id=${encodeURIComponent(keyword)}&page=${page}`;
  } else if (server === 'netease') {
    searchPath = `/netease/search?id=${encodeURIComponent(keyword)}&page=${page}&limit=30`;
  } else {
    searchPath = `/search?server=${server}&id=${encodeURIComponent(keyword)}&page=${page}`;
  }
  const json = await request<any>(searchPath, { headers, signal });
  const data = json.data || json;
  if (!Array.isArray(data)) {
    return { songs: [], total: 0, page };
  }
  const songs: Song[] = data.map((item: any) => normalizeSong(item, server));
  return { songs, total: data.length, page };
}

// 4.2b: 搜索类型（综合搜索 Tab）
export type SearchTabType = 'song' | 'artist' | 'album' | 'playlist';

export interface SearchTabResult {
  songs: Song[];
  artists: SearchArtistItem[];
  albums: SearchAlbumItem[];
  playlists: SearchPlaylistItem[];
}

export async function searchTab(
  keyword: string,
  server: string,
  type: SearchTabType,
  page: number = 1,
  signal?: AbortSignal
): Promise<SearchTabResult> {
  const empty: SearchTabResult = { songs: [], artists: [], albums: [], playlists: [] };
  try {
    const headers = getHeaders(server);
    let path: string;
    if (server === 'tencent') {
      if (type === 'artist') {
        path = `/tencent/search?id=${encodeURIComponent(keyword)}&page=${page}&t=9`;
      } else if (type === 'album') {
        path = `/tencent/search?id=${encodeURIComponent(keyword)}&page=${page}&t=8`;
      } else if (type === 'playlist') {
        return empty; // 腾讯无公开歌单搜索接口
      } else {
        path = `/tencent/search?id=${encodeURIComponent(keyword)}&page=${page}`;
      }
    } else if (server === 'netease') {
      const typeMap: Record<SearchTabType, number> = { song: 1, artist: 100, album: 10, playlist: 1000 };
      path = `/netease/search?id=${encodeURIComponent(keyword)}&page=${page}&type=${typeMap[type]}`;
    } else {
      if (type !== 'song') return empty;
      path = `/search?server=${server}&id=${encodeURIComponent(keyword)}&page=${page}`;
    }
    const json = await request<any>(path, { headers, signal });
    const data = json.data || json;
    if (!Array.isArray(data)) return empty;
    if (type === 'song') {
      return { ...empty, songs: data.map((item: any) => normalizeSong(item, server)) };
    }
    if (type === 'artist') {
      return {
        ...empty,
        artists: data.map((i: any) => ({
          id: String(i.id || ''),
          name: i.name || '',
          pic: i.pic || '',
          songCount: i.songCount || 0,
          albumCount: i.albumCount || 0,
        })),
      };
    }
    if (type === 'album') {
      return {
        ...empty,
        albums: data.map((i: any) => ({
          id: String(i.id || ''),
          name: i.name || '',
          cover: i.cover || '',
          artist: i.artist || '',
          artistId: i.artistId || '',
          date: i.date || '',
          songCount: i.songCount || 0,
        })),
      };
    }
    return {
      ...empty,
      playlists: data.map((i: any) => ({
        id: String(i.id || ''),
        name: i.name || '',
        cover: i.cover || '',
        trackCount: i.trackCount || 0,
      })),
    };
  } catch {
    return empty;
  }
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

/**
 * 判断是否为 Tauri 本地资源协议 URL（asset 协议）。
 * convertFileSrc 在 Windows 上生成 http(s)://asset.localhost/<path>，
 * 在 macOS/Linux 上生成 asset://localhost/<path>。
 * 这类地址只能在 WebView 内由 Tauri 的协议处理器解析，sidecar（Node）无法访问，
 * 交给 /proxy-audio 代理会得到 502，导致本地音乐完全无法播放。
 */
export function isTauriAssetUrl(url: string): boolean {
  return /^https?:\/\/asset\.localhost\//i.test(url) || url.startsWith('asset://');
}

export function getProxiedAudioUrl(url: string): string {
  if (!url) return '';
  if (url.includes('/proxy-audio?')) {
    return url;
  }
  // 本地文件（asset 协议）跳过代理，直接交给 WebView 播放
  if (isTauriAssetUrl(url)) {
    return url;
  }
  return `${getBaseUrl()}/proxy-audio?url=${encodeURIComponent(url)}`;
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

// 4.11: getAlbumDetail — 专辑详情（tencent/netease 走专用端点，其余平台走 meting 兜底）
export async function getAlbumDetail(
  id: string,
  server: string = 'tencent',
  opts?: { name?: string; cover?: string; signal?: AbortSignal }
): Promise<AlbumDetail | null> {
  try {
    const headers = getHeaders(server);
    let path: string;
    if (server === 'tencent') {
      path = `/tencent/album?id=${encodeURIComponent(id)}`;
    } else if (server === 'netease') {
      path = `/netease/album?id=${encodeURIComponent(id)}`;
    } else {
      path = `/album?server=${server}&id=${encodeURIComponent(id)}`;
    }
    const json = await request<any>(path, { headers, signal: opts?.signal });
    const data = json.data || json;
    if (server === 'tencent' || server === 'netease') {
      return {
        id: data.id || id,
        name: data.name || opts?.name || '未知专辑',
        cover: data.cover || opts?.cover || '',
        artist: data.artist || '',
        artistId: data.artistId || data.artist_id || '',
        date: data.date || '',
        company: data.company || '',
        desc: data.desc || '',
        tracks: Array.isArray(data.songs) ? data.songs.map((s: any) => normalizeSong(s, server)) : [],
        source: server,
      };
    }
    // 其他平台（kugou/kuwo/baidu）：meting 仅返回歌曲数组，用入口参数兜底元信息
    const rawList = Array.isArray(data) ? data : [];
    const tracks = rawList.map((s: any) => normalizeSong(s, server));
    const first = tracks[0];
    return {
      id,
      name: opts?.name || first?.album || '未知专辑',
      cover: opts?.cover || '',
      artist: first?.artist || '',
      artistId: '',
      date: '',
      company: '',
      desc: '',
      tracks,
      source: server,
    };
  } catch {
    return null;
  }
}

// 4.12: getArtistDetail — 歌手信息 + 热门歌曲（tencent/netease 专用端点，其余平台 meting 兜底）
export async function getArtistDetail(
  id: string,
  server: string = 'tencent',
  opts?: { name?: string; cover?: string; signal?: AbortSignal }
): Promise<ArtistDetail | null> {
  try {
    const headers = getHeaders(server);
    let path: string;
    if (server === 'tencent') {
      const nameParam = opts?.name ? `&name=${encodeURIComponent(opts.name)}` : '';
      path = `/tencent/artist?id=${encodeURIComponent(id)}${nameParam}&limit=100`;
    } else if (server === 'netease') {
      path = `/netease/artist?id=${encodeURIComponent(id)}&limit=100`;
    } else {
      path = `/artist?server=${server}&id=${encodeURIComponent(id)}&limit=50`;
    }
    const json = await request<any>(path, { headers, signal: opts?.signal });
    const data = json.data || json;
    if (server === 'tencent' || server === 'netease') {
      return {
        id: data.id || id,
        name: data.name || opts?.name || '未知歌手',
        cover: data.cover || opts?.cover || '',
        desc: data.desc || '',
        songs: Array.isArray(data.songs) ? data.songs.map((s: any) => normalizeSong(s, server)) : [],
        albums: Array.isArray(data.albums)
          ? data.albums.map((a: any) => ({
              id: String(a.id || a.mid || ''),
              name: a.name || '',
              cover: a.cover || '',
              date: a.date || a.pubTime || '',
            }))
          : undefined,
        source: server,
      };
    }
    const rawList = Array.isArray(data) ? data : [];
    return {
      id,
      name: opts?.name || '未知歌手',
      cover: opts?.cover || '',
      desc: '',
      songs: rawList.map((s: any) => normalizeSong(s, server)),
      albums: undefined,
      source: server,
    };
  } catch {
    return null;
  }
}

// 4.13: getArtistSongs — 歌手歌曲分页（懒加载）。
// tencent: 首次请求会构建全量曲库（服务端缓存 15 分钟），按 page 切片；
// netease: 官方 offset/limit 分页。其余平台返回空。
export async function getArtistSongs(
  id: string,
  server: string = 'tencent',
  opts: { page?: number; offset?: number; limit?: number; name?: string; signal?: AbortSignal } = {}
): Promise<{ songs: Song[]; total: number; hasMore: boolean }> {
  const headers = getHeaders(server);
  const limit = Math.min(opts.limit || 50, 100);
  try {
    let path: string;
    if (server === 'tencent') {
      const page = Math.max(opts.page || 1, 1);
      const nameParam = opts.name ? `&name=${encodeURIComponent(opts.name)}` : '';
      path = `/tencent/artist/songs?id=${encodeURIComponent(id)}&page=${page}&limit=${limit}${nameParam}`;
    } else if (server === 'netease') {
      const offset = Math.max(opts.offset || 0, 0);
      path = `/netease/artist/songs?id=${encodeURIComponent(id)}&offset=${offset}&limit=${limit}`;
    } else {
      return { songs: [], total: 0, hasMore: false };
    }
    const json = await request<any>(path, { headers, signal: opts.signal });
    const data = json.data || {};
    return {
      songs: Array.isArray(data.songs) ? data.songs.map((s: any) => normalizeSong(s, server)) : [],
      total: data.total || 0,
      hasMore: !!data.hasMore,
    };
  } catch {
    return { songs: [], total: 0, hasMore: false };
  }
}

// 4.14: getSongMetaBatch — 批量单曲元信息（补全老数据缺失的专辑/歌手 ID），仅支持 tencent/netease
// 返回补丁数组，每项含 id 用于匹配回原歌曲
export async function getSongMetaBatch(ids: string[], server: string): Promise<Partial<Song>[]> {
  if (ids.length === 0) return [];
  try {
    const headers = getHeaders(server);
    let path: string;
    if (server === 'tencent') {
      path = `/tencent/song?ids=${encodeURIComponent(ids.join(','))}`;
    } else if (server === 'netease') {
      path = `/netease/song?ids=${encodeURIComponent(ids.join(','))}`;
    } else {
      return [];
    }
    const json = await request<any>(path, { headers });
    const list = Array.isArray(json.data) ? json.data : [];
    return list.map((data: any) => {
      const patch: Partial<Song> = {};
      if (data.id) patch.id = String(data.id);
      if (data.album_id) patch.albumId = String(data.album_id);
      if (data.album) patch.album = data.album;
      if (Array.isArray(data.singer) && data.singer.length > 0) {
        patch.artists = data.singer
          .map((s: any) => ({ id: String((s && (s.id || '')) || ''), name: (s && s.name) || '' }))
          .filter((a: any) => a.id || a.name);
      }
      if (data.artist) patch.artist = data.artist;
      return patch;
    });
  } catch {
    return [];
  }
}

// 4.15: 电台：同歌手热门歌曲中随机挑一首（避开当前与最近播过的）
const recentRadioPicks: string[] = [];
const RADIO_RECENT_MAX = 10;

export async function pickRadioSong(song: Song): Promise<Song | null> {
  const artist = song.artists && song.artists.length > 0 ? song.artists[0] : null;
  const server = song.source || 'tencent';
  if (!artist || !artist.id) return null;
  try {
    const res = server === 'tencent'
      ? await getArtistSongs(artist.id, 'tencent', { page: 1, limit: 100, name: artist.name })
      : server === 'netease'
        ? await getArtistSongs(artist.id, 'netease', { offset: 0, limit: 100 })
        : null;
    if (!res) return null;
    let candidates = res.songs.filter((s) => s.id && s.id !== song.id);
    const fresh = candidates.filter((s) => !recentRadioPicks.includes(s.id));
    if (fresh.length > 0) candidates = fresh;
    if (candidates.length === 0) return null;
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    recentRadioPicks.push(pick.id);
    if (recentRadioPicks.length > RADIO_RECENT_MAX) recentRadioPicks.shift();
    return pick;
  } catch {
    return null;
  }
}

/** 开启电台时预热候选缓存（腾讯首次构建曲库较慢，提前拉取） */
export async function warmRadioCache(song: Song): Promise<void> {
  const artist = song.artists && song.artists.length > 0 ? song.artists[0] : null;
  const server = song.source || 'tencent';
  if (!artist || !artist.id) return;
  try {
    if (server === 'tencent') {
      await getArtistSongs(artist.id, 'tencent', { page: 1, limit: 50, name: artist.name });
    } else if (server === 'netease') {
      await getArtistSongs(artist.id, 'netease', { offset: 0, limit: 50 });
    }
  } catch {}
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

/** 检查本地已保存的平台 cookie，返回首个已登录的平台名（tencent → netease → kugou → kuwo），未登录返回 null */
export async function checkAuth(): Promise<string | null> {
  try {
    const saved = localStorage.getItem('melodix-cookies');
    if (!saved) return null;
    const cookies = JSON.parse(saved) as Record<string, string | undefined>;
    for (const platform of ['tencent', 'netease', 'kugou', 'kuwo']) {
      if (cookies[platform]) return platform;
    }
    return null;
  } catch {
    return null;
  }
}

/** 返回当前已登录平台的 cookie 值（作为 token），未登录返回空字符串 */
export async function getLoginStatus(): Promise<string> {
  try {
    const saved = localStorage.getItem('melodix-cookies');
    if (!saved) return '';
    const cookies = JSON.parse(saved) as Record<string, string | undefined>;
    for (const platform of ['tencent', 'netease', 'kugou', 'kuwo']) {
      if (cookies[platform]) return cookies[platform];
    }
    return '';
  } catch {
    return '';
  }
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

/**
 * 从 QQ 音乐各种分享链接中提取歌单 ID
 * 支持格式：
 *   - https://y.qq.com/n/ryqq/playlist/7425890869
 *   - https://c.y.qq.com/...?id=7425890869
 *   - https://i.y.qq.com/n2/m/share/details/taoge.html?id=7425890869
 *   - 纯数字 ID：7425890869
 */
export function extractQQPlaylistId(input: string): string | null {
  const trimmed = input.trim();
  // 纯数字 ID
  if (/^\d+$/.test(trimmed)) return trimmed;
  // y.qq.com/n/ryqq/playlist/ID
  const ryqqMatch = trimmed.match(/playlist\/(\d+)/);
  if (ryqqMatch) return ryqqMatch[1];
  // ?id=ID 或 &id=ID
  const idParamMatch = trimmed.match(/[?&]id=(\d+)/);
  if (idParamMatch) return idParamMatch[1];
  // tid=ID
  const tidMatch = trimmed.match(/[?&]tid=(\d+)/);
  if (tidMatch) return tidMatch[1];
  return null;
}

/**
 * 导入 QQ 音乐歌单：解析链接 → 分页拉取全部歌曲 → 返回完整 PlaylistDetail
 * @param input QQ 音乐歌单链接或纯数字 ID
 * @param onProgress 进度回调 (loaded, total)
 */
export async function importTencentPlaylist(
  input: string,
  onProgress?: (loaded: number, total: number, name: string) => void
): Promise<PlaylistDetail> {
  const id = extractQQPlaylistId(input);
  if (!id) throw new Error('无法识别的链接格式，请粘贴 QQ 音乐歌单链接或纯数字 ID');

  const LIMIT = 30;
  // 先取第一页，获取歌单名和总数
  const firstPage = await getTencentPlaylist(id, 1, LIMIT);
  if (!firstPage) throw new Error('获取歌单失败，请检查链接是否正确或歌单是否为公开状态');

  const total = firstPage.total || firstPage.trackCount || firstPage.tracks.length;
  const allTracks = [...firstPage.tracks];

  onProgress?.(allTracks.length, total, firstPage.name);

  // 继续拉取剩余页
  let page = 2;
  while (allTracks.length < total) {
    const nextPage = await getTencentPlaylist(id, page, LIMIT);
    if (!nextPage || nextPage.tracks.length === 0) break;
    allTracks.push(...nextPage.tracks);
    onProgress?.(allTracks.length, total, firstPage.name);
    page++;
    // 防止无限循环：最多拉取 50 页（1500 首）
    if (page > 50) break;
  }

  return {
    ...firstPage,
    tracks: allTracks,
    trackCount: allTracks.length,
    total,
  };
}

