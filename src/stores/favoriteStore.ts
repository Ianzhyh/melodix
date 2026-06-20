import { create } from 'zustand';
import type { Song } from '../types/playback';
import { useToastStore } from './toastStore';

const STORAGE_KEY = 'melodix-favorites';

function loadFavorites(): Song[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

function saveFavorites(favorites: Song[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
  } catch {}
}

interface FavoriteState {
  favorites: Song[];
  toggleFavorite: (song: Song) => void;
  isFavorite: (id: string) => boolean;
  getFavorites: () => Song[];
}

export const useFavoriteStore = create<FavoriteState>((set, get) => ({
  favorites: loadFavorites(),

  toggleFavorite: (song) => {
    set((state) => {
      const exists = state.favorites.some((s) => s.id === song.id);
      const newFavorites = exists
        ? state.favorites.filter((s) => s.id !== song.id)
        : [...state.favorites, song];
      saveFavorites(newFavorites);
      useToastStore.getState().showToast(exists ? '已取消喜欢' : '已添加到我喜欢的音乐', 'success');
      return { favorites: newFavorites };
    });
  },

  isFavorite: (id) => {
    return get().favorites.some((s) => s.id === id);
  },

  getFavorites: () => {
    return get().favorites;
  },
}));
