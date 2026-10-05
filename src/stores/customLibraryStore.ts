import { create } from 'zustand';
import type { Song } from '../types/playback';
import { useToastStore } from './toastStore';

// 自定义音乐库：用户自建的音乐库（歌单），持久化在 localStorage。
// 与 favoriteStore 一致：整份数据随状态同步维护，每次变更后写回 localStorage。

const STORAGE_KEY = 'melodix-custom-libraries';

export interface UserLibrary {
  id: string;
  name: string;
  songs: Song[];
  // 自定义封面：图片文件绝对路径或 http(s) URL。
  // 未设置时展示第一首歌的封面；没有任何歌曲时展示默认占位（渐变 + 图标）。
  cover?: string;
  createdAt: number;
}

// 启动时从 localStorage 恢复；对损坏/不完整的数据做防御性过滤
function loadLibraries(): UserLibrary[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return [];
    const arr = JSON.parse(saved) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (l): l is UserLibrary =>
        typeof l === 'object' &&
        l !== null &&
        typeof (l as UserLibrary).id === 'string' &&
        typeof (l as UserLibrary).name === 'string' &&
        Array.isArray((l as UserLibrary).songs),
    );
  } catch {
    return [];
  }
}

function persist(libraries: UserLibrary[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(libraries));
  } catch {}
}

function makeId(): string {
  // 与 downloadStore 一致使用 crypto.randomUUID
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `lib-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

interface CustomLibraryState {
  libraries: UserLibrary[];
  createLibrary: (name: string) => string;
  renameLibrary: (id: string, name: string) => void;
  deleteLibrary: (id: string) => void;
  setLibraryCover: (id: string, cover: string) => void;
  addSong: (libraryId: string, song: Song) => void;
  addSongs: (libraryId: string, songs: Song[]) => void;
  removeSong: (libraryId: string, songId: string) => void;
  removeSongs: (libraryId: string, songIds: string[]) => void;
  updateSong: (libraryId: string, songId: string, patch: Partial<Song>) => void;
  moveLibrary: (from: number, to: number) => void;
  moveSong: (libraryId: string, from: number, to: number) => void;
  reorderSongs: (libraryId: string, songs: Song[]) => void;
}

export const useCustomLibraryStore = create<CustomLibraryState>((set, get) => ({
  libraries: loadLibraries(),

  createLibrary: (name) => {
    const trimmed = name.trim();
    if (!trimmed) return '';
    const library: UserLibrary = {
      id: makeId(),
      name: trimmed,
      songs: [],
      createdAt: Date.now(),
    };
    const libraries = [library, ...get().libraries];
    persist(libraries);
    set({ libraries });
    return library.id;
  },

  renameLibrary: (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const libraries = get().libraries.map((l) =>
      l.id === id ? { ...l, name: trimmed } : l,
    );
    persist(libraries);
    set({ libraries });
    useToastStore.getState().showToast('音乐库已重命名', 'success');
  },

  deleteLibrary: (id) => {
    const libraries = get().libraries.filter((l) => l.id !== id);
    persist(libraries);
    set({ libraries });
    useToastStore.getState().showToast('音乐库已删除', 'success');
  },

  // 设置自定义封面；传空字符串恢复默认（第一首歌封面 / 默认占位）
  setLibraryCover: (id, cover) => {
    const libraries = get().libraries.map((l) =>
      l.id === id ? { ...l, cover } : l,
    );
    persist(libraries);
    set({ libraries });
    useToastStore
      .getState()
      .showToast(cover ? '封面已更新' : '已恢复默认封面', 'success');
  },

  addSong: (libraryId, song) => {
    const lib = get().libraries.find((l) => l.id === libraryId);
    if (!lib) return;
    if (lib.songs.some((s) => s.id === song.id)) {
      useToastStore.getState().showToast(`歌曲已在「${lib.name}」中`, 'info');
      return;
    }
    const libraries = get().libraries.map((l) =>
      l.id === libraryId ? { ...l, songs: [...l.songs, song] } : l,
    );
    persist(libraries);
    set({ libraries });
    useToastStore.getState().showToast(`已添加到「${lib.name}」`, 'success');
  },

  removeSong: (libraryId, songId) => {
    const lib = get().libraries.find((l) => l.id === libraryId);
    if (!lib) return;
    const libraries = get().libraries.map((l) =>
      l.id === libraryId
        ? { ...l, songs: l.songs.filter((s) => s.id !== songId) }
        : l,
    );
    persist(libraries);
    set({ libraries });
    useToastStore.getState().showToast('已从音乐库移除', 'info');
  },

  // 批量添加（多选用）：过滤库内已存在的歌后追加，一次汇总提示
  addSongs: (libraryId, songs) => {
    const lib = get().libraries.find((l) => l.id === libraryId);
    if (!lib || songs.length === 0) return;
    const existing = new Set(lib.songs.map((s) => s.id));
    const fresh = songs.filter((s) => s && s.id && !existing.has(s.id));
    if (fresh.length === 0) {
      useToastStore.getState().showToast(`所选歌曲已在「${lib.name}」中`, 'info');
      return;
    }
    const libraries = get().libraries.map((l) =>
      l.id === libraryId ? { ...l, songs: [...l.songs, ...fresh] } : l,
    );
    persist(libraries);
    set({ libraries });
    useToastStore
      .getState()
      .showToast(
        fresh.length < songs.length
          ? `已添加 ${fresh.length} 首到「${lib.name}」（${songs.length - fresh.length} 首已存在）`
          : `已添加 ${fresh.length} 首到「${lib.name}」`,
        'success',
      );
  },

  // 批量移除（多选用）：按 id 集合过滤，一次汇总提示
  removeSongs: (libraryId, songIds) => {
    const lib = get().libraries.find((l) => l.id === libraryId);
    if (!lib || songIds.length === 0) return;
    const ids = new Set(songIds);
    const removed = lib.songs.filter((s) => ids.has(s.id)).length;
    if (removed === 0) return;
    const libraries = get().libraries.map((l) =>
      l.id === libraryId ? { ...l, songs: l.songs.filter((s) => !ids.has(s.id)) } : l,
    );
    persist(libraries);
    set({ libraries });
    useToastStore.getState().showToast(`已从音乐库移除 ${removed} 首`, 'info');
  },

  // 就地补丁更新歌曲字段（如补全老数据缺失的 albumId/artists），不改变顺序
  updateSong: (libraryId, songId, patch) => {
    const lib = get().libraries.find((l) => l.id === libraryId);
    if (!lib) return;
    if (!lib.songs.some((s) => s.id === songId)) return;
    const libraries = get().libraries.map((l) =>
      l.id === libraryId
        ? { ...l, songs: l.songs.map((s) => (s.id === songId ? { ...s, ...patch } : s)) }
        : l,
    );
    persist(libraries);
    set({ libraries });
  },

  // 拖拽调整音乐库顺序（侧边栏与音乐库列表页共用同一份顺序）
  moveLibrary: (from, to) => {
    if (from === to) return;
    const libraries = [...get().libraries];
    if (from < 0 || to < 0 || from >= libraries.length || to >= libraries.length) return;
    const [moved] = libraries.splice(from, 1);
    libraries.splice(to, 0, moved);
    persist(libraries);
    set({ libraries });
  },

  // 拖拽调整音乐库内歌曲顺序
  moveSong: (libraryId, from, to) => {
    if (from === to) return;
    const lib = get().libraries.find((l) => l.id === libraryId);
    if (!lib) return;
    if (from < 0 || to < 0 || from >= lib.songs.length || to >= lib.songs.length) return;
    const songs = [...lib.songs];
    const [moved] = songs.splice(from, 1);
    songs.splice(to, 0, moved);
    const libraries = get().libraries.map((l) =>
      l.id === libraryId ? { ...l, songs } : l,
    );
    persist(libraries);
    set({ libraries });
  },

  // 拖拽排序整表提交：按传入顺序替换该库歌曲（调用方由稳定 id 映射生成，长度不一致时忽略防误写）
  reorderSongs: (libraryId, songs) => {
    const lib = get().libraries.find((l) => l.id === libraryId);
    if (!lib || lib.songs.length !== songs.length) return;
    const libraries = get().libraries.map((l) =>
      l.id === libraryId ? { ...l, songs } : l,
    );
    persist(libraries);
    set({ libraries });
  },
}));
