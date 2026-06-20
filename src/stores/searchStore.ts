import { create } from 'zustand';
import type { Song } from '../types/playback';
import { search as apiSearch } from '../api/client';

interface SearchState {
  isLoading: boolean;
  searchResults: Song[];
  error: string | null;
  platform: string;
  setPlatform: (platform: string) => void;
  search: (keywords: string) => Promise<void>;
  clearResults: () => void;
}

// 用于取消上一次未完成的搜索请求，防止快速搜索时旧请求覆盖新结果（race condition）
let searchAbortController: AbortController | null = null;

export const useSearchStore = create<SearchState>((set, get) => ({
  isLoading: false,
  searchResults: [],
  error: null,
  platform: (() => {
    try {
      return localStorage.getItem('melodix-search-platform') || 'tencent';
    } catch { return 'tencent'; }
  })(),
  setPlatform: (platform: string) => {
    try { localStorage.setItem('melodix-search-platform', platform); } catch {}
    set({ platform });
  },
  search: async (keywords: string) => {
    if (!keywords.trim()) {
      set({ searchResults: [], error: null });
      return;
    }
    // 取消上一次未完成的请求
    searchAbortController?.abort();
    const controller = new AbortController();
    searchAbortController = controller;
    set({ isLoading: true, error: null });
    try {
      const result = await apiSearch(keywords, get().platform, 1, controller.signal);
      set({ searchResults: result.songs, isLoading: false });
    } catch (err: any) {
      // 被新请求取消（race condition），不设置 error 状态，直接返回
      if (err?.name === 'AbortError') return;
      set({ error: err.message || 'Search failed', isLoading: false, searchResults: [] });
    }
  },
  clearResults: () => set({ searchResults: [], error: null, isLoading: false }),
}));
