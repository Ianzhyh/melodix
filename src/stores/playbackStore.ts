import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { Song, LyricLine, RepeatMode } from '../types/playback';

export const DEFAULT_THEME_COLOR = '#6366f1';

// ===== 播放状态持久化（断点续播）=====
const PLAYBACK_STATE_KEY = 'melodix-playback-state';
const LAST_PROGRESS_KEY = 'melodix-last-progress';
const MAX_PERSISTED_QUEUE = 500;

// 持久化前剥离 lyrics 大字段（播放时按需重新获取）
function stripForPersist(song: Song): Song {
  if (!song.lyrics) return song;
  const { lyrics, ...rest } = song;
  return rest as Song;
}

interface PersistedPlayback {
  queue: Song[];
  currentIndex: number;
  pendingSeek: number | null;
}

function loadPersistedPlayback(): PersistedPlayback {
  try {
    const saved = localStorage.getItem(PLAYBACK_STATE_KEY);
    if (!saved) return { queue: [], currentIndex: -1, pendingSeek: null };
    const parsed = JSON.parse(saved) as any;
    const rawQueue = Array.isArray(parsed?.queue) ? parsed.queue : [];
    const queue: Song[] = rawQueue.filter((s: any) => s && typeof s.id === 'string');
    let currentIndex = typeof parsed?.currentIndex === 'number' ? parsed.currentIndex : -1;
    // 区分两种非法/特殊值：
    //   -1 是合法的"无选中曲目"状态（只排了队没点播放），必须原样保留，
    //      否则重启后第 0 首会被误标成正在播放（写入侧 persistPlaybackQueue 已同步修正）；
    //   >= queue.length 才是真正的越界（持久化期间队列被截断），此时回落到第 0 首。
    if (!Number.isInteger(currentIndex)) {
      currentIndex = queue.length > 0 ? 0 : -1;
    } else if (currentIndex >= queue.length) {
      currentIndex = queue.length > 0 ? 0 : -1;
    } else if (currentIndex < -1) {
      currentIndex = -1;
    }
    // 恢复上次播放进度（仅当与恢复出的当前歌曲匹配）
    let pendingSeek: number | null = null;
    try {
      const prog = JSON.parse(localStorage.getItem(LAST_PROGRESS_KEY) || 'null');
      if (
        prog &&
        currentIndex >= 0 &&
        prog.songId === queue[currentIndex]?.id &&
        typeof prog.time === 'number' &&
        prog.time > 0
      ) {
        pendingSeek = prog.time;
      }
    } catch {}
    return { queue, currentIndex, pendingSeek };
  } catch {
    return { queue: [], currentIndex: -1, pendingSeek: null };
  }
}

function persistPlaybackQueue(queue: Song[], currentIndex: number) {
  try {
    if (queue.length === 0) {
      localStorage.removeItem(PLAYBACK_STATE_KEY);
      return;
    }
    const persistedQueue = queue.slice(0, MAX_PERSISTED_QUEUE);
    // currentIndex = -1 表示"队列里还没有选中曲目"，这是合法状态（例如只排了队但没点播放）。
    // 原写法 Math.max(currentIndex, 0) 会把 -1 钳成 0，于是重启后第 0 首被当成"正在播放的
    // 那一首"高亮出来 —— 用户从没点过它。这里区分开"没有选中"与"选中的是第一首"。
    const cappedIndex =
      currentIndex < 0 ? -1 : Math.min(currentIndex, persistedQueue.length - 1);
    const payload = {
      queue: persistedQueue.map(stripForPersist),
      currentIndex: cappedIndex,
    };
    localStorage.setItem(PLAYBACK_STATE_KEY, JSON.stringify(payload));
  } catch {}
}

/** 记录当前歌曲的播放进度（供AudioEngine 节流调用）*/
export function persistLastProgress(songId: string | null, time: number) {
  try {
    if (!songId) return;
    localStorage.setItem(LAST_PROGRESS_KEY, JSON.stringify({ songId, time, savedAt: Date.now() }));
  } catch {}
}

// 启动时恢复上次的队列与当前歌曲
const restored = loadPersistedPlayback();

interface PlaybackState {
  current: Song | null;
  isPlaying: boolean;
  isBuffering: boolean;
  progress: number;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  lastVolumeBeforeMute: number;
  queue: Song[];
  currentIndex: number;
  syncLyrics: boolean;
  lyricsOpen: boolean;
  lyrics: LyricLine[];
  activeLine: number;
  isChineseLyric: boolean;
  hasTranslation: boolean;
  themeColor: string;
  themeColors: string[];
  bgIsLight: boolean;
  playbackError: string | null;
  shuffle: boolean;
  repeatMode: RepeatMode;
  shuffleHistory: number[];
  /** 启动恢复时待 seek 的位置（秒）；PlayerBar 加载完成后消费一次*/
  pendingSeek: number | null;
  /** 本次会话是否为恢复态（启动时恢复了队列/当前歌曲）：首个加载完成后清除*/
  isRestoredSession: boolean;
  markSessionRestored: () => void;
  /** 电台模式：队列无法继续时自动续播同歌手热门歌曲*/
  radioMode: boolean;

  // Actions
  setCurrent: (song: Song | null) => void;
  setPlaying: (isPlaying: boolean) => void;
  setBuffering: (isBuffering: boolean) => void;
  /** 清掉加载态（超时兜底 / 出错时用），避免转圈卡死 */
  clearBuffering: () => void;
  setPlaybackError: (error: string | null) => void;
  setProgress: (progress: number) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  setSyncLyrics: (sync: boolean) => void;
  setLyricsOpen: (open: boolean) => void;
  setLyrics: (lines: LyricLine[], meta?: { isChineseLyric?: boolean; hasTranslation?: boolean }) => void;
  setActiveLine: (index: number) => void;
  setThemeColor: (color: string, bgIsLight?: boolean, themeColors?: string[]) => void;
  
  // Volume fading
  fadeTo: (targetVolume: number, steps?: number) => Promise<number[]>;

  // Queue actions
  getCurrentSong: () => Song | null;
  addSong: (song: Song) => void;
  addSongNext: (song: Song) => void;
  setQueue: (songs: Song[], startIndex?: number) => void;
  next: () => void;
  prev: () => void;
  skipNext: () => void;
  clearQueue: () => void;
  setQueueIndex: (index: number) => void;
  moveQueueItem: (from: number, to: number) => void;
  toggleShuffle: () => void;
  setRepeatMode: (mode: RepeatMode) => void;
  cycleRepeatMode: () => void;
  /** 取走并清除待 seek 位置（仅消费一次） */
  consumePendingSeek: () => number | null;
  /** 开关电台模式（持久化） */
  toggleRadioMode: () => void;
}

let fadeAbortController: AbortController | null = null;

export const usePlaybackStore = create<PlaybackState>()(subscribeWithSelector((set, get) => ({
  current: restored.currentIndex >= 0 ? restored.queue[restored.currentIndex] : null,
  isPlaying: false,
  isBuffering: false,
  progress: 0,
  currentTime: 0,
  duration: 0,
  volume: 0.5,
  isMuted: false,
  lastVolumeBeforeMute: 0.5,
  queue: restored.queue,
  currentIndex: restored.currentIndex,
  syncLyrics: false,
  lyricsOpen: false,
  lyrics: [], activeLine: -1, isChineseLyric: false, hasTranslation: false,
  themeColor: DEFAULT_THEME_COLOR, bgIsLight: false,
  themeColors: [DEFAULT_THEME_COLOR],
  playbackError: null,
  shuffle: (() => { try { return localStorage.getItem('melodix-shuffle') === 'true'; } catch { return false; } })(),
  repeatMode: (() => { try { const v = localStorage.getItem('melodix-repeat-mode'); return (v === 'off' || v === 'all' || v === 'one') ? v : 'off'; } catch { return 'off' as RepeatMode; } })(),
  shuffleHistory: [],
  pendingSeek: restored.pendingSeek,
  isRestoredSession: restored.currentIndex >= 0,
  radioMode: (() => { try { return localStorage.getItem('melodix-radio-mode') === 'true'; } catch { return false; } })(),

  setCurrent: (song) => set({ current: song, lyrics: [], isChineseLyric: false, hasTranslation: false, activeLine: -1, themeColor: DEFAULT_THEME_COLOR, bgIsLight: false, themeColors: [DEFAULT_THEME_COLOR], playbackError: null, isBuffering: true }),
  setPlaying: (isPlaying) => set({ isPlaying, isBuffering: false }),
  setBuffering: (isBuffering) => set({ isBuffering }),
  /** 清掉加载态（超时兜底 / 出错时用），避免转圈卡死 */
  clearBuffering: () => set({ isBuffering: false }),
  setProgress: (progress) => set({ progress }),
  setCurrentTime: (currentTime) => set({ currentTime }),
  setDuration: (duration) => set({ duration }),
  
  setVolume: (val) => {
    const clamped = Math.min(Math.max(val, 0), 1);
    // 静音期间改音量只更新 volume，不取消静音、不覆盖记忆音量（取消静音时恢复 lastVolumeBeforeMute）
    set((state) => ({
      volume: clamped,
      lastVolumeBeforeMute: state.isMuted ? state.lastVolumeBeforeMute : clamped,
    }));
  },

  toggleMute: () => {
    set((state) => {
      if (state.isMuted) {
        return {
          isMuted: false,
          volume: state.lastVolumeBeforeMute,
        };
      } else {
        return {
          lastVolumeBeforeMute: state.volume,
          isMuted: true,
          volume: 0,
        };
      }
    });
  },

  setSyncLyrics: (syncLyrics) => set({ syncLyrics }),
  setLyricsOpen: (lyricsOpen) => set({ lyricsOpen }),
  setLyrics: (lines, meta) => set((state) => ({ lyrics: lines, isChineseLyric: meta?.isChineseLyric ?? state.isChineseLyric, hasTranslation: meta?.hasTranslation ?? state.hasTranslation })),
  setActiveLine: (index) => set({ activeLine: index }),
  setThemeColor: (themeColor, bgIsLight, themeColors) => set((state) => ({ 
    themeColor, 
    bgIsLight: bgIsLight !== undefined ? bgIsLight : state.bgIsLight,
    themeColors: themeColors || state.themeColors || [themeColor]
  })),
  setPlaybackError: (error) => set({ playbackError: error }),

  fadeTo: async (targetVolume, steps = 5) => {
    // 取消之前的淡入淡出
    if (fadeAbortController) {
      fadeAbortController.abort();
    }
    fadeAbortController = new AbortController();
    const signal = fadeAbortController.signal;

    const targetClamped = Math.min(Math.max(targetVolume, 0), 1);
    const startVolume = get().volume;
    const volumeLevels: number[] = [];

    for (let i = 1; i <= steps; i++) {
      if (signal.aborted) return volumeLevels;
      const progress = i / steps;
      const current = startVolume + (targetClamped - startVolume) * progress;
      get().setVolume(current);
      volumeLevels.push(Number(current.toFixed(2)));
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    return volumeLevels;
  },

  getCurrentSong: () => {
    const { queue, currentIndex } = get();
    if (currentIndex >= 0 && currentIndex < queue.length) {
      return queue[currentIndex];
    }
    return null;
  },

  addSong: (song) => {
    set((state) => {
      const newQueue = [...state.queue, song];
      const newIndex = state.currentIndex === -1 ? 0 : state.currentIndex;
      const currentSong = newQueue[newIndex];
      return {
        queue: newQueue,
        currentIndex: newIndex,
        current: currentSong,
      };
    });
  },

  addSongNext: (song) => {
    set((state) => {
      const newQueue = [...state.queue];
      let newIndex = state.currentIndex;
      if (newIndex === -1) {
        newQueue.push(song);
        newIndex = 0;
      } else {
        newQueue.splice(newIndex + 1, 0, song);
      }
      return {
        queue: newQueue,
        currentIndex: newIndex,
        current: newQueue[newIndex],
      };
    });
  },

  setQueue: (songs, startIndex) => {
    const idx = startIndex ?? 0;
    const safeIndex = songs.length > 0 ? Math.min(idx, songs.length - 1) : -1;
    const nextSong = safeIndex >= 0 ? songs[safeIndex] : null;
    set((state) => ({
      queue: songs,
      currentIndex: safeIndex,
      current: nextSong,
      isPlaying: false,
      // 点歌立即进入加载态：真正取播放地址要等 PlayerBar 的effect 的getUrl
      //（实测点击到 audio 开始加载约 340ms，冷启动/慢网更久）。若不在这里置位，
      // 这段时间内界面完全没有反馈，用户会以为点了没反应）
      // 只在选中歌曲确实变化时置位：同一首歌重复点击，current 不变，
      // PlayerBar 的effect 会提前return 不做任何加载，置位将无人清除（转圈卡死）。
      isBuffering: nextSong != null && nextSong.id !== state.current?.id,
      progress: 0,
      currentTime: 0,
      duration: 0,
      lyrics: [], isChineseLyric: false, hasTranslation: false,
      activeLine: -1,
      themeColor: DEFAULT_THEME_COLOR, bgIsLight: false,
      shuffleHistory: [],
    }));
  },

  next: () => {
    set((state) => {
      // 空队列守卫：此前 repeat='all' 时兜底分支会把current 置为 queue[0]（undefined）
      // 且currentIndex 变成 0，产生非法状态
      if (state.queue.length === 0) return {};

      // Repeat one: replay current
      if (state.repeatMode === 'one') {
        return {
          progress: 0,
          currentTime: 0,
          lyrics: [], isChineseLyric: false, hasTranslation: false,
          activeLine: -1,
          themeColor: DEFAULT_THEME_COLOR, bgIsLight: false,
        };
      }

      // BUG-2: Single song in queue with repeat all - reset state, AudioEngine will replay
      if (state.queue.length === 1 && state.repeatMode === 'all') {
        return {
          progress: 0,
          currentTime: 0,
          lyrics: [], isChineseLyric: false, hasTranslation: false,
          activeLine: -1,
          themeColor: DEFAULT_THEME_COLOR, bgIsLight: false,
        };
      }

      // Shuffle mode
      if (state.shuffle && state.queue.length > 1) {
        const available = state.queue
          .map((_, i) => i)
          .filter(i => i !== state.currentIndex && !state.shuffleHistory.includes(i));

        if (available.length > 0) {
          const nextIndex = available[Math.floor(Math.random() * available.length)];
          return {
            currentIndex: nextIndex,
            current: state.queue[nextIndex],
            isBuffering: true,
            progress: 0,
            currentTime: 0,
            lyrics: [], isChineseLyric: false, hasTranslation: false,
            activeLine: -1,
            themeColor: DEFAULT_THEME_COLOR, bgIsLight: false,
            shuffleHistory: [...state.shuffleHistory, nextIndex],
          };
        }
        // All songs played, reset history if repeat all
        if (state.repeatMode === 'all') {
          const candidates = state.queue.map((_, i) => i).filter(i => i !== state.currentIndex);
          const nextIndex = candidates[Math.floor(Math.random() * candidates.length)];
          return {
            currentIndex: nextIndex,
            current: state.queue[nextIndex],
            isBuffering: true,
            progress: 0,
            currentTime: 0,
            lyrics: [], isChineseLyric: false, hasTranslation: false,
            activeLine: -1,
            themeColor: DEFAULT_THEME_COLOR, bgIsLight: false,
            shuffleHistory: [nextIndex],
          };
        }
        // No more songs to shuffle
        return {};
      }

      // Normal sequential mode
      if (state.currentIndex < state.queue.length - 1) {
        const nextIndex = state.currentIndex + 1;
        return {
          currentIndex: nextIndex,
          current: state.queue[nextIndex],
          isBuffering: true,
          progress: 0,
          currentTime: 0,
          lyrics: [], isChineseLyric: false, hasTranslation: false,
          activeLine: -1,
          themeColor: DEFAULT_THEME_COLOR, bgIsLight: false,
        };
      }

      // At the end of queue
      if (state.repeatMode === 'all') {
        const nextIndex = 0;
        return {
          currentIndex: nextIndex,
          current: state.queue[nextIndex],
          isBuffering: true,
          progress: 0,
          currentTime: 0,
          lyrics: [], isChineseLyric: false, hasTranslation: false,
          activeLine: -1,
          themeColor: DEFAULT_THEME_COLOR, bgIsLight: false,
        };
      }

      return {};
    });
  },

  prev: () => {
    set((state) => {
      // 空队列守卫：避免对空队列的无效状态操作
      if (state.queue.length === 0) return {};

      // In shuffle mode, go back through shuffle history
      if (state.shuffle) {
        // BUG-5: If shuffle history has <= 1 entry, stop (don't fall through to sequential)
        if (state.shuffleHistory.length <= 1) {
          return {};
        }
        const newHistory = [...state.shuffleHistory];
        newHistory.pop(); // remove current
        const prevIndex = newHistory[newHistory.length - 1];
        return {
          currentIndex: prevIndex,
          current: state.queue[prevIndex],
          isBuffering: true,
          progress: 0,
          currentTime: 0,
          lyrics: [], isChineseLyric: false, hasTranslation: false,
          activeLine: -1,
          themeColor: DEFAULT_THEME_COLOR, bgIsLight: false,
          shuffleHistory: newHistory,
        };
      }

      // Normal sequential mode
      if (state.currentIndex > 0) {
        const prevIndex = state.currentIndex - 1;
        return {
          currentIndex: prevIndex,
          current: state.queue[prevIndex],
          isBuffering: true,
          progress: 0,
          currentTime: 0,
          lyrics: [], isChineseLyric: false, hasTranslation: false,
          activeLine: -1,
          themeColor: DEFAULT_THEME_COLOR, bgIsLight: false,
        };
      }
      return {};
    });
  },

  skipNext: () => {
    get().next();
  },

  clearQueue: () => {
    set({
      queue: [],
      currentIndex: -1,
      current: null,
      isPlaying: false,
      progress: 0,
      currentTime: 0,
      duration: 0,
      lyrics: [], isChineseLyric: false, hasTranslation: false,
      activeLine: -1,
      themeColor: DEFAULT_THEME_COLOR, bgIsLight: false,
    });
  },

  setQueueIndex: (index) => {
    set((state) => {
      if (index >= 0 && index < state.queue.length) {
        return {
          currentIndex: index,
          current: state.queue[index],
          progress: 0,
          currentTime: 0,
          lyrics: [], isChineseLyric: false, hasTranslation: false,
          activeLine: -1,
          themeColor: DEFAULT_THEME_COLOR, bgIsLight: false,
          // 随机模式下点击队列项会打断随机遍历路径：
          // 重置历史为[index]，避免prev() 按旧历史回退到无关歌曲
          shuffleHistory: state.shuffle ? [index] : state.shuffleHistory,
        };
      }
      return {};
    });
  },

  moveQueueItem: (from, to) => {
    set((state) => {
      const { queue, currentIndex, shuffleHistory } = state;
      if (queue.length === 0) return {};
      if (from === to) return {};
      if (from < 0 || to < 0 || from >= queue.length || to >= queue.length) return {};

      const newQueue = [...queue];
      const [moved] = newQueue.splice(from, 1);
      newQueue.splice(to, 0, moved);

      // 单元素移动后，受影响区间内的索引按同一规则平移校正
      const adjust = (idx: number): number => {
        if (idx === from) return to;
        if (from < idx && idx <= to) return idx - 1;
        if (to <= idx && idx < from) return idx + 1;
        return idx;
      };

      return {
        queue: newQueue,
        currentIndex: adjust(currentIndex),
        shuffleHistory: shuffleHistory.map(adjust),
        // current 引用不变，播放不中断
      };
    });
  },

  toggleShuffle: () => set((state) => {
    const newShuffle = !state.shuffle;
    try { localStorage.setItem('melodix-shuffle', String(newShuffle)); } catch {}
    return {
      shuffle: newShuffle,
      // 仅在存在当前歌曲时播种历史；currentIndex 为-1 时播种[-1] 会导致
      // 后续 prev() 回退到queue[-1]（undefined）
      shuffleHistory: newShuffle && state.currentIndex >= 0 ? [state.currentIndex] : [],
    };
  }),

  setRepeatMode: (mode) => {
    try { localStorage.setItem('melodix-repeat-mode', mode); } catch {}
    set({ repeatMode: mode });
  },

  cycleRepeatMode: () => set((state) => {
    const modes: RepeatMode[] = ['off', 'all', 'one'];
    const currentIdx = modes.indexOf(state.repeatMode);
    const newMode = modes[(currentIdx + 1) % modes.length];
    try { localStorage.setItem('melodix-repeat-mode', newMode); } catch {}
    return { repeatMode: newMode };
  }),

  consumePendingSeek: () => {
    const v = get().pendingSeek;
    if (v !== null) set({ pendingSeek: null });
    return v;
  },

  markSessionRestored: () => set({ isRestoredSession: false }),

  toggleRadioMode: () => {
    const next = !get().radioMode;
    try { localStorage.setItem('melodix-radio-mode', String(next)); } catch {}
    set({ radioMode: next });
  },
})));

// 队列/当前曲目变化时（防抖）持久化，重启后恢复
let persistTimer: ReturnType<typeof setTimeout> | null = null;
usePlaybackStore.subscribe(
  (s) => ({ queue: s.queue, currentIndex: s.currentIndex }),
  ({ queue, currentIndex }) => {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => persistPlaybackQueue(queue, currentIndex), 400);
  },
  { equalityFn: (a, b) => a.queue === b.queue && a.currentIndex === b.currentIndex }
);
