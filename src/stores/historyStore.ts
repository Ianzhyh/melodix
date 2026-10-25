import { create } from 'zustand';
import type { Song } from '../types/playback';
import { usePlaybackStore } from './playbackStore';

const STORAGE_KEY = 'melodix-play-history';
// 上限条目数：超出时淘汰最久未播放的，防止 localStorage 无限膨胀
const MAX_ENTRIES = 300;

export interface HistoryEntry {
  song: Song;
  playCount: number;    // 累计播放次数
  lastPlayedAt: number; // 最后一次播放的时间戳（ms）
}

// 启动加载：过滤脏数据，防止历史 localStorage 中的非法条目导致页面崩溃
function loadEntries(): HistoryEntry[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return [];
    const arr = JSON.parse(saved);
    if (!Array.isArray(arr)) return [];
    return arr.filter((e): e is HistoryEntry =>
      e != null && typeof e === 'object' && e.song != null && typeof e.song.id === 'string'
    );
  } catch {
    return [];
  }
}

function saveEntries(entries: HistoryEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {}
}

// 存储快照剔除 lyrics 大字段（歌词播放时会自动重新获取），防止历史膨胀挤爆 localStorage
function stripSong(song: Song): Song {
  if (!song.lyrics) return song;
  const { lyrics, ...rest } = song;
  return rest as Song;
}

interface HistoryState {
  /** 按 lastPlayedAt 降序（最近播放在前） */
  entries: HistoryEntry[];
  recordPlay: (song: Song) => void;
  clearHistory: () => void;
  /** 就地补丁更新历史歌曲字段（补全老数据缺失的 albumId/artists） */
  patchSong: (songId: string, patch: Partial<Song>) => void;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  entries: loadEntries(),

  recordPlay: (song) => {
    if (!song || typeof song.id !== 'string') return;
    const now = Date.now();
    const stored = stripSong(song);
    const entries = [...get().entries];
    const idx = entries.findIndex((e) => e.song.id === song.id);
    const entry: HistoryEntry = idx >= 0
      ? { song: stored, playCount: entries[idx].playCount + 1, lastPlayedAt: now }
      : { song: stored, playCount: 1, lastPlayedAt: now };
    if (idx >= 0) entries.splice(idx, 1);
    entries.unshift(entry);
    const trimmed = entries.slice(0, MAX_ENTRIES);
    saveEntries(trimmed);
    set({ entries: trimmed });
  },

  clearHistory: () => {
    saveEntries([]);
    set({ entries: [] });
  },

  patchSong: (songId, patch) => {
    const entries = get().entries.map((e) =>
      e.song.id === songId ? { ...e, song: { ...e.song, ...patch } } : e,
    );
    saveEntries(entries);
    set({ entries });
  },
}));

// 模块级订阅：切歌时记一次播放。
//
// 判定必须按 **song.id** 而不是对象引用 —— 原来写的是 `cur !== prev.current`，
// 而「本地歌曲补齐封面/歌词」这条链路会造一个同 id 的新对象写回 store：
//   PlayerBar/index.tsx  usePlaybackStore.setState({ current: { ...latest, lyrics: ... } })
// 引用变了、歌没变，却被当成换歌 → 播放次数被静默 +1（批量补齐 10 首时能 +1~+10），
// 该歌还被顶到「最近播放」首位。这是用户不会立刻察觉、但数据持续失真的问题。
//
// 单曲循环重播（next 的 repeat-one 分支）本就不更换 current，按 id 比较同样不会重复计数。
// 本模块仅被主窗口页面链路加载（tray.tsx 入口不引用），托盘窗口不会重复记录。
let lastRecordedSongId: string | null = null;

usePlaybackStore.subscribe((state) => {
  const cur = state.current;
  if (!cur) {
    // 队列清空/停止后重置，保证"再播一次同一首"仍然会记一次
    lastRecordedSongId = null;
    return;
  }
  if (cur.id === lastRecordedSongId) return;
  lastRecordedSongId = cur.id;
  useHistoryStore.getState().recordPlay(cur);
});
