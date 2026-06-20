import { create } from 'zustand';
import * as api from '../api/client';
import type { Song, Playlist } from '../types/playback';

interface ToplistItem {
  id: string;
  name: string;
  cover: string;
  songs: { name: string; artist: string }[];
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
}

const CACHE_DURATION = 5 * 60 * 1000; // 5 分钟缓存

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
}));
