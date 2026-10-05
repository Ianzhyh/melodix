import { create } from 'zustand';
import type { SearchAlbumItem, SearchArtistItem, SearchPlaylistItem, Song } from '../types/playback';
import { search as apiSearch, searchTab as apiSearchTab, type SearchTabType } from '../api/client';

interface SearchState {
  isLoading: boolean;
  searchResults: Song[];
  artists: SearchArtistItem[];
  albums: SearchAlbumItem[];
  playlists: SearchPlaylistItem[];
  error: string | null;
  platform: string;
  searchType: SearchTabType;
  // 分页相关字段（仅单曲 Tab 支持分页）
  page: number;            // 当前已加载的页码（从 1 开始）
  hasMore: boolean;        // 是否还有更多结果可加载
  loadingMore: boolean;    // 是否正在加载下一页
  currentKeywords: string; // 当前搜索关键词，供 loadMore / 切换 Tab 复用
  setPlatform: (platform: string) => void;
  setSearchType: (type: SearchTabType) => void;
  search: (keywords: string) => Promise<void>;
  loadMore: () => Promise<void>;
  clearResults: () => void;
}

// 用于取消上一次未完成的搜索请求，防止快速搜索时旧请求覆盖新结果（race condition）
let searchAbortController: AbortController | null = null;
// 用于取消上一次未完成的 loadMore 请求
let loadMoreAbortController: AbortController | null = null;

// 每页数量：API 按约定固定返回 30 条，少于 30 即视为最后一页
const PAGE_SIZE = 30;

export const useSearchStore = create<SearchState>((set, get) => ({
  isLoading: false,
  searchResults: [],
  artists: [],
  albums: [],
  playlists: [],
  error: null,
  page: 1,
  hasMore: false,
  loadingMore: false,
  currentKeywords: '',
  platform: (() => {
    try {
      return localStorage.getItem('melodix-search-platform') || 'tencent';
    } catch { return 'tencent'; }
  })(),
  searchType: (() => {
    try {
      const v = localStorage.getItem('melodix-search-type');
      return (v === 'artist' || v === 'album' || v === 'playlist') ? v : 'song';
    } catch { return 'song' as SearchTabType; }
  })(),
  setPlatform: (platform: string) => {
    try { localStorage.setItem('melodix-search-platform', platform); } catch {}
    set({ platform });
  },
  setSearchType: (searchType: SearchTabType) => {
    try { localStorage.setItem('melodix-search-type', searchType); } catch {}
    set({ searchType });
    // 已有关键词时切换 Tab 自动重新搜索
    const { currentKeywords } = get();
    if (currentKeywords.trim()) {
      get().search(currentKeywords);
    }
  },
  search: async (keywords: string) => {
    if (!keywords.trim()) {
      set({ searchResults: [], artists: [], albums: [], playlists: [], error: null, isLoading: false, page: 1, hasMore: false, loadingMore: false, currentKeywords: '' });
      return;
    }
    // 取消上一次未完成的请求（包括 search 和 loadMore）
    searchAbortController?.abort();
    loadMoreAbortController?.abort();
    const controller = new AbortController();
    searchAbortController = controller;
    // 重置分页状态并保存当前关键词
    set({ isLoading: true, error: null, page: 1, hasMore: false, loadingMore: false, currentKeywords: keywords });

    const type = get().searchType;
    try {
      if (type === 'song') {
        const result = await apiSearch(keywords, get().platform, 1, controller.signal);
        if (controller.signal.aborted) return;
        set({
          searchResults: result.songs,
          artists: [], albums: [], playlists: [],
          isLoading: false,
          hasMore: result.songs.length >= PAGE_SIZE,
        });
      } else {
        const result = await apiSearchTab(keywords, get().platform, type, 1, controller.signal);
        if (controller.signal.aborted) return;
        set({
          searchResults: [],
          artists: result.artists,
          albums: result.albums,
          playlists: result.playlists,
          isLoading: false,
          hasMore: false,
        });
      }
    } catch (err: any) {
      // 被新请求取消（race condition），不设置 error 状态，直接返回
      if (err?.name === 'AbortError') return;
      set({ error: err.message || 'Search failed', isLoading: false, searchResults: [], artists: [], albums: [], playlists: [], hasMore: false });
    }
  },
  loadMore: async () => {
    const { hasMore, loadingMore, currentKeywords, platform, page, searchType } = get();
    // 仅单曲 Tab 分页；无更多内容、正在加载、或无关键词时直接跳过
    if (searchType !== 'song' || !hasMore || loadingMore || !currentKeywords) return;
    // 取消上一次未完成的 loadMore 请求
    loadMoreAbortController?.abort();
    const controller = new AbortController();
    loadMoreAbortController = controller;
    set({ loadingMore: true });
    try {
      const result = await apiSearch(currentKeywords, platform, page + 1, controller.signal);
      if (controller.signal.aborted) return;
      const prev = get().searchResults;
      set({
        searchResults: [...prev, ...result.songs],
        page: page + 1,
        loadingMore: false,
        hasMore: result.songs.length >= PAGE_SIZE,
      });
    } catch (err: any) {
      // 被新请求取消时静默忽略
      if (err?.name === 'AbortError') return;
      set({ loadingMore: false });
      // 不强行打断用户，仅控制台提示
      console.warn('[searchStore] loadMore failed:', err?.message || err);
    }
  },
  clearResults: () => {
    searchAbortController?.abort();
    loadMoreAbortController?.abort();
    set({
      searchResults: [],
      artists: [],
      albums: [],
      playlists: [],
      error: null,
      isLoading: false,
      page: 1,
      hasMore: false,
      loadingMore: false,
      currentKeywords: '',
    });
  },
}));
