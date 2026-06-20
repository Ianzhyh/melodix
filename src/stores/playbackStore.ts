import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { Song, LyricLine, RepeatMode } from '../types/playback';

export const DEFAULT_THEME_COLOR = '#6366f1';

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
  bgIsLight: boolean;
  playbackError: string | null;
  shuffle: boolean;
  repeatMode: RepeatMode;
  shuffleHistory: number[];

  // Actions
  setCurrent: (song: Song | null) => void;
  setPlaying: (isPlaying: boolean) => void;
  setBuffering: (isBuffering: boolean) => void;
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
  setThemeColor: (color: string, bgIsLight?: boolean) => void;
  
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
  toggleShuffle: () => void;
  setRepeatMode: (mode: RepeatMode) => void;
  cycleRepeatMode: () => void;
}

let fadeAbortController: AbortController | null = null;

export const usePlaybackStore = create<PlaybackState>()(subscribeWithSelector((set, get) => ({
  current: null,
  isPlaying: false,
  isBuffering: false,
  progress: 0,
  currentTime: 0,
  duration: 0,
  volume: 0.5,
  isMuted: false,
  lastVolumeBeforeMute: 0.5,
  queue: [],
  currentIndex: -1,
  syncLyrics: false,
  lyricsOpen: false,
  lyrics: [], isChineseLyric: false, hasTranslation: false,
  activeLine: -1,
  themeColor: DEFAULT_THEME_COLOR, bgIsLight: false,
  playbackError: null,
  shuffle: (() => { try { return localStorage.getItem('melodix-shuffle') === 'true'; } catch { return false; } })(),
  repeatMode: (() => { try { const v = localStorage.getItem('melodix-repeat-mode'); return (v === 'off' || v === 'all' || v === 'one') ? v : 'off'; } catch { return 'off' as RepeatMode; } })(),
  shuffleHistory: [],

  setCurrent: (song) => set({ current: song, lyrics: [], isChineseLyric: false, hasTranslation: false, activeLine: -1, themeColor: DEFAULT_THEME_COLOR, bgIsLight: false, playbackError: null, isBuffering: true }),
  setPlaying: (isPlaying) => set({ isPlaying, isBuffering: false }),
  setBuffering: (isBuffering) => set({ isBuffering }),
  setProgress: (progress) => set({ progress }),
  setCurrentTime: (currentTime) => set({ currentTime }),
  setDuration: (duration) => set({ duration }),
  
  setVolume: (val) => {
    const clamped = Math.min(Math.max(val, 0), 1);
    set((state) => {
      // BUG-13: If muted and user sets volume > 0, auto-unmute
      if (state.isMuted && clamped > 0) {
        return {
          volume: clamped,
          isMuted: false,
          lastVolumeBeforeMute: clamped,
        };
      }
      // If we set the volume, update lastVolumeBeforeMute if not muted
      return {
        volume: clamped,
        lastVolumeBeforeMute: state.isMuted ? state.lastVolumeBeforeMute : clamped,
      };
    });
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
  setLyrics: (lyrics, meta) => set({
    lyrics,
    isChineseLyric: meta?.isChineseLyric ?? false,
    hasTranslation: meta?.hasTranslation ?? false,
  }),
  setActiveLine: (activeLine) => set({ activeLine }),
  setThemeColor: (themeColor, bgIsLight) => set((state) => ({ themeColor, bgIsLight: bgIsLight !== undefined ? bgIsLight : state.bgIsLight })),
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
    set({
      queue: songs,
      currentIndex: safeIndex,
      current: safeIndex >= 0 ? songs[safeIndex] : null,
      isPlaying: false,
      progress: 0,
      currentTime: 0,
      duration: 0,
      lyrics: [], isChineseLyric: false, hasTranslation: false,
      activeLine: -1,
      themeColor: DEFAULT_THEME_COLOR, bgIsLight: false,
      shuffleHistory: [],
    });
  },

  next: () => {
    set((state) => {
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
          const nextIndex = Math.floor(Math.random() * state.queue.length);
          return {
            currentIndex: nextIndex,
            current: state.queue[nextIndex],
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
        };
      }
      return {};
    });
  },

  toggleShuffle: () => set((state) => {
    const newShuffle = !state.shuffle;
    try { localStorage.setItem('melodix-shuffle', String(newShuffle)); } catch {}
    return {
      shuffle: newShuffle,
      shuffleHistory: newShuffle ? [state.currentIndex] : [],
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
})));
