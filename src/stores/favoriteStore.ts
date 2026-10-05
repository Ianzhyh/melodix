import { create } from 'zustand';
import type { Song } from '../types/playback';
import { useToastStore } from './toastStore';

const STORAGE_KEY = 'melodix-favorites';

// 启动时只加载 ID 列表（轻量）：parse 一次后只保留 ID，完整对象交给 GC
function loadFavoriteIds(): string[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return [];
    const arr = JSON.parse(saved) as Song[];
    return Array.isArray(arr) ? arr.map((s) => s.id) : [];
  } catch {
    return [];
  }
}

// 完整 Song 对象按需加载（内存缓存）：首次访问时从 localStorage 读取，之后复用缓存
let fullCache: Song[] | null = null;
function loadFullFavorites(): Song[] {
  if (fullCache) return fullCache;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const arr = saved ? (JSON.parse(saved) as Song[]) : [];
    fullCache = Array.isArray(arr) ? arr : [];
  } catch {
    fullCache = [];
  }
  return fullCache;
}

function saveFavorites(favorites: Song[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
  } catch {}
}

interface FavoriteState {
  // 轻量 ID 列表，作为响应式状态
  favoriteIds: string[];
  // 数据补丁版本号：patchSong 后 +1，让页面重新读取完整对象（链接即时生效）
  revision: number;
  toggleFavorite: (song: Song) => void;
  // 批量取消收藏（多选用）：一次汇总提示
  removeFavorites: (ids: string[]) => void;
  isFavorite: (id: string) => boolean;
  getFavorites: () => Song[];
  getFavoritesPage: (page: number, pageSize: number) => Song[];
  patchSong: (songId: string, patch: Partial<Song>) => void;
}

export const useFavoriteStore = create<FavoriteState>((set, get) => ({
  favoriteIds: loadFavoriteIds(),
  revision: 0,

  toggleFavorite: (song) => {
    const exists = get().favoriteIds.includes(song.id);
    const full = loadFullFavorites();
    const newFull = exists
      ? full.filter((s) => s.id !== song.id)
      : [...full, song];
    fullCache = newFull;
    saveFavorites(newFull);
    useToastStore.getState().showToast(exists ? '已取消喜欢' : '已添加到我喜欢的音乐', 'success');
    set({ favoriteIds: newFull.map((s) => s.id) });
  },

  // 批量取消收藏（多选用）：更新 favoriteIds 即可触发页面重渲染
  removeFavorites: (ids) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const full = loadFullFavorites();
    const newFull = full.filter((s) => !idSet.has(s.id));
    const removed = full.length - newFull.length;
    if (removed === 0) return;
    fullCache = newFull;
    saveFavorites(newFull);
    useToastStore.getState().showToast(`已取消收藏 ${removed} 首`, 'info');
    set({ favoriteIds: newFull.map((s) => s.id) });
  },

  isFavorite: (id) => get().favoriteIds.includes(id),

  getFavorites: () => loadFullFavorites(),

  getFavoritesPage: (page, pageSize) => {
    if (page < 1 || pageSize < 1) return [];
    const full = loadFullFavorites();
    const start = (page - 1) * pageSize;
    if (start >= full.length) return [];
    return full.slice(start, start + pageSize);
  },

  // 就地补丁更新收藏歌曲字段（补全老数据缺失的 albumId/artists）
  patchSong: (songId, patch) => {
    const full = loadFullFavorites();
    const idx = full.findIndex((s) => s.id === songId);
    if (idx < 0) return;
    full[idx] = { ...full[idx], ...patch };
    fullCache = full;
    saveFavorites(full);
    set((state) => ({ revision: state.revision + 1 }));
  },
}));
