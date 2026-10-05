import { create } from 'zustand';
import * as api from '../api/client';
import type { Song, Playlist } from '../types/playback';

interface ToplistItem {
  id: string;
  name: string;
  cover: string;
  songs: { name: string; artist: string }[];
  /** 期数/更新说明（服务端返回，如 "第41期"） */
  updateKey?: string;
  source: string;
}

interface HomeState {
  recommendations: Playlist[];
  toplists: ToplistItem[];
  newSongs: Song[];
  isLoading: boolean;
  loaded: boolean;
  lastFetchTime: number;
  fetchHomeData: () => Promise<void>;
  /** 按需加载榜单完整歌曲列表（带 LRU 缓存），供快捷磁贴直接播放榜单 */
  getToplistSongs: (id: string) => Promise<Song[]>;
}

const CACHE_DURATION = 5 * 60 * 1000; // 5 分钟缓存

// 榜单完整歌曲列表的模块级 LRU 缓存（上限 5 个）
const TOPLIST_SONGS_CACHE_MAX = 5;
const toplistSongsCache = new Map<string, Song[]>();

function getCachedToplistSongs(id: string): Song[] | undefined {
  const songs = toplistSongsCache.get(id);
  if (songs) {
    toplistSongsCache.delete(id);
    toplistSongsCache.set(id, songs);
  }
  return songs;
}

export const useHomeStore = create<HomeState>((set, get) => ({
  recommendations: [],
  toplists: [],
  newSongs: [],
  isLoading: false,
  loaded: false,
  lastFetchTime: 0,

  fetchHomeData: async () => {
    const { loaded, lastFetchTime, isLoading } = get();
    const now = Date.now();
    // 5 分钟内不重复请求
    if (loaded && now - lastFetchTime < CACHE_DURATION) return;
    if (isLoading) return;

    set({ isLoading: true });
    try {
      const [recs, tops, songs] = await Promise.all([
        api.getRecommendations(),
        api.getToplist(),
        api.getNewSongs(27, 12),
      ]);
      set({
        recommendations: recs,
        toplists: tops,
        newSongs: songs,
        loaded: true,
        lastFetchTime: Date.now(),
      });
    } catch {
    } finally {
      set({ isLoading: false });
    }
  },

  getToplistSongs: async (id: string) => {
    const cached = getCachedToplistSongs(id);
    if (cached) return cached;
    const numId = Number(id);
    if (!Number.isFinite(numId)) return [];
    try {
      const songs = await api.getNewSongs(numId, 30);
      if (toplistSongsCache.size >= TOPLIST_SONGS_CACHE_MAX) {
        const firstKey = toplistSongsCache.keys().next().value;
        if (firstKey !== undefined) toplistSongsCache.delete(firstKey);
      }
      toplistSongsCache.set(id, songs);
      return songs;
    } catch {
      return [];
    }
  },
}));
