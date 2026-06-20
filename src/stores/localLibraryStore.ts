import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { Song } from '../types/playback';
import { useConfigStore } from './configStore';

export interface ScanProgress {
  scanned: number;
  total: number;
  currentFile: string;
}

export interface ScanResult {
  scanned: number;
  imported: number;
  skipped: number;
  failed: number;
}

export interface EnrichProgress {
  current: number;
  total: number;
  currentSong: string;
}

interface LocalLibraryState {
  songs: Song[];           // 当前加载的歌曲列表
  totalCount: number;      // 数据库总歌曲数
  loading: boolean;        // 加载中
  searchQuery: string;     // 搜索关键词
  scanProgress: ScanProgress | null;  // 扫描进度（null 表示未在扫描）
  scanning: boolean;       // 是否正在扫描
  enriching: boolean;      // 是否正在批量补齐
  enrichProgress: EnrichProgress | null;  // 补齐进度（null 表示未在补齐）
  hasMore: boolean;        // 是否还有更多数据可加载
  page: number;            // 当前页码
  pageSize: number;        // 每页数量（固定 50）
  loadSongs: (reset?: boolean) => Promise<void>;
  search: (query: string) => Promise<void>;
  scanDirectory: (dir: string) => Promise<ScanResult>;
  importFiles: (filePaths: string[]) => Promise<ScanResult>;
  deleteSong: (id: string) => Promise<void>;
  refreshCount: () => Promise<void>;
  enrichSong: (id: string) => Promise<void>;
  enrichAllSongs: () => Promise<void>;
  startWatchingLocalMusicUpdates: () => Promise<UnlistenFn>;
}

const PAGE_SIZE = 50;

export const useLocalLibraryStore = create<LocalLibraryState>((set, get) => ({
  songs: [],
  totalCount: 0,
  loading: false,
  searchQuery: '',
  scanProgress: null,
  scanning: false,
  enriching: false,
  enrichProgress: null,
  hasMore: false,
  page: 0,
  pageSize: PAGE_SIZE,

  // 加载本地歌曲列表，reset=true 时从第一页开始重新加载
  loadSongs: async (reset?: boolean) => {
    const { page, pageSize, searchQuery, songs } = get();
    const currentPage = reset ? 0 : page;
    set({ loading: true });
    try {
      const result = await invoke<Song[]>('get_local_songs', {
        offset: currentPage * pageSize,
        limit: pageSize,
        search: searchQuery || null,
      });
      set({
        songs: reset ? result : [...songs, ...result],
        page: currentPage + 1,
        hasMore: result.length === pageSize,
        loading: false,
      });
    } catch (err) {
      console.error('加载本地歌曲失败:', err);
      set({ loading: false });
    }
  },

  // 搜索本地歌曲，设置关键词后重新加载
  search: async (query: string) => {
    set({ searchQuery: query });
    await get().loadSongs(true);
  },

  // 扫描本地音乐目录，监听进度事件，完成后刷新列表
  scanDirectory: async (dir: string) => {
    set({ scanning: true, scanProgress: { scanned: 0, total: 0, currentFile: '' } });
    let unlisten: UnlistenFn | null = null;
    try {
      unlisten = await listen<ScanProgress>('scan-progress', (event) => {
        set({ scanProgress: event.payload });
      });
      const result = await invoke<ScanResult>('scan_local_music', { dir });
      if (unlisten) {
        unlisten();
        unlisten = null;
      }
      set({ scanning: false, scanProgress: null });
      await get().refreshCount();
      await get().loadSongs(true);
      return result;
    } catch (err) {
      if (unlisten) {
        unlisten();
        unlisten = null;
      }
      console.error('扫描本地音乐失败:', err);
      set({ scanning: false, scanProgress: null });
      throw err;
    }
  },

  // 导入指定文件路径列表，完成后刷新列表
  importFiles: async (filePaths: string[]) => {
    const result = await invoke<ScanResult>('import_files', { filePaths });
    await get().refreshCount();
    await get().loadSongs(true);
    return result;
  },

  // 删除指定 id 的本地歌曲，并从当前列表中移除
  deleteSong: async (id: string) => {
    await invoke('delete_local_song', { id: parseInt(id) });
    set((state) => ({ songs: state.songs.filter((s) => s.id !== id) }));
    await get().refreshCount();
  },

  // 刷新数据库总歌曲数
  refreshCount: async () => {
    try {
      const count = await invoke<number>('get_local_song_count');
      set({ totalCount: count });
    } catch (err) {
      console.error('获取本地歌曲总数失败:', err);
    }
  },

  // 在线补齐单首本地歌曲的封面和歌词，传入 QQ 音乐 Cookie
  enrichSong: async (id: string) => {
    try {
      const { cookies } = useConfigStore.getState();
      const tencentCookie = cookies?.tencent || '';
      await invoke('enrich_local_song', { id: parseInt(id), cookie: tencentCookie });
      await get().refreshCount();
      await get().loadSongs(true);
    } catch (e) {
      console.error('补齐失败:', e);
    }
  },

  // 批量在线补齐所有需要补齐的本地歌曲，监听进度事件，传入 QQ 音乐 Cookie
  enrichAllSongs: async () => {
    if (get().enriching) return;
    set({ enriching: true, enrichProgress: { current: 0, total: 0, currentSong: '' } });
    let unlisten: UnlistenFn | null = null;
    try {
      const { cookies } = useConfigStore.getState();
      const tencentCookie = cookies?.tencent || '';
      unlisten = await listen<EnrichProgress>('enrich-progress', (event) => {
        set({ enrichProgress: event.payload });
      });
      await invoke('enrich_all_local_songs', { cookie: tencentCookie });
      await get().refreshCount();
      await get().loadSongs(true);
    } catch (e) {
      console.error('批量补齐失败:', e);
    } finally {
      if (unlisten) {
        unlisten();
        unlisten = null;
      }
      set({ enriching: false, enrichProgress: null });
    }
  },

  // 监听本地音乐更新事件（文件监控导入成功时触发），返回取消监听函数
  startWatchingLocalMusicUpdates: async () => {
    const unlisten = await listen('local-music-updated', () => {
      void get().refreshCount();
      void get().loadSongs(true);
    });
    return unlisten;
  },
}));
