import { create } from 'zustand';
import {
  readStored,
  writeStored,
  parseEnum,
  parseBool,
  parseIntClamped,
  parseString,
  parseJSONObject,
} from './persisted';

export interface PlatformCookies {
  tencent?: string;
  netease?: string;
  kugou?: string;
  kuwo?: string;
}

interface ConfigState {
  sidecarPort: number;
  setSidecarPort: (port: number) => void;
  sidecarStatus: 'idle' | 'starting' | 'running' | 'error';
  setSidecarStatus: (status: 'idle' | 'starting' | 'running' | 'error') => void;
  sidecarError: string | null;
  setSidecarError: (err: string | null) => void;
  cookies: PlatformCookies;
  setCookie: (platform: keyof PlatformCookies, cookie: string) => void;
  streamingQuality: 'standard' | 'high' | 'lossless';
  setStreamingQuality: (quality: 'standard' | 'high' | 'lossless') => void;
  downloadPath: string;
  setDownloadPath: (path: string) => void;
  autoDownload: boolean;
  setAutoDownload: (auto: boolean) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  theme: 'dark' | 'light' | 'system';
  setTheme: (theme: 'dark' | 'light' | 'system') => void;
  enableTransparency: boolean;
  setEnableTransparency: (enable: boolean) => void;
  showTranslationButton: boolean;
  setShowTranslationButton: (show: boolean) => void;
  autoTranslateLyrics: boolean;
  setAutoTranslateLyrics: (auto: boolean) => void;
  maxConcurrentDownloads: number;
  setMaxConcurrentDownloads: (v: number) => void;
  localLibraryPath: string;
  setLocalLibraryPath: (path: string) => void;
  autoImportOnDownload: boolean;
  setAutoImportOnDownload: (value: boolean) => void;
  importMode: 'copy' | 'index';
  setImportMode: (mode: 'copy' | 'index') => void;
  closeAction: 'ask' | 'minimize' | 'exit';
  setCloseAction: (action: 'ask' | 'minimize' | 'exit') => void;
  playerBackgroundType: 'static' | 'dynamic';
  setPlayerBackgroundType: (type: 'static' | 'dynamic') => void;
}

// ===== 存储键：集中声明，避免"键名打错一个字就静默失效" =====
const KEYS = {
  cookies: 'melodix-cookies',
  streamingQuality: 'melodix-streaming-quality',
  downloadPath: 'melodix-download-path',
  autoDownload: 'melodix-auto-download',
  theme: 'melodix-theme',
  transparency: 'melodix-transparency',
  showTranslationButton: 'melodix-show-translation-button',
  autoTranslateLyrics: 'melodix-auto-translate-lyrics',
  maxConcurrentDownloads: 'melodix-max-concurrent-downloads',
  localLibraryPath: 'melodix-local-library-path',
  autoImportOnDownload: 'melodix-auto-import-on-download',
  importMode: 'melodix-import-mode',
  closeAction: 'melodix-close-action',
  playerBackgroundType: 'melodix-player-bg-type',
} as const;

const QUALITIES = ['standard', 'high', 'lossless'] as const;
const THEMES = ['dark', 'light', 'system'] as const;
const IMPORT_MODES = ['copy', 'index'] as const;
const CLOSE_ACTIONS = ['ask', 'minimize', 'exit'] as const;
const BG_TYPES = ['static', 'dynamic'] as const;

const MIN_CONCURRENT_DOWNLOADS = 1;
const MAX_CONCURRENT_DOWNLOADS = 10;

/** 持久化的配置项：读取走统一的 readStored（绝不抛），写入走 writeStored（失败也不阻断 set） */
function persist<T>(key: string, value: T) {
  writeStored(key, value);
}

export const useConfigStore = create<ConfigState>((set, get) => ({
  sidecarPort: 3000,
  setSidecarPort: (port) => set({ sidecarPort: port }),
  sidecarStatus: 'idle',
  setSidecarStatus: (status) => set({ sidecarStatus: status }),
  sidecarError: null,
  setSidecarError: (err) => set({ sidecarError: err }),

  cookies: readStored<PlatformCookies>(KEYS.cookies, {}, (raw) =>
    parseJSONObject<PlatformCookies>(raw, {}),
  ),
  setCookie: (platform, cookie) => {
    const newCookies = { ...get().cookies, [platform]: cookie };
    persist(KEYS.cookies, newCookies);
    set({ cookies: newCookies });
  },

  streamingQuality: readStored(KEYS.streamingQuality, 'high' as const, (raw) =>
    parseEnum(raw, QUALITIES, 'high'),
  ),
  setStreamingQuality: (quality) => {
    persist(KEYS.streamingQuality, quality);
    set({ streamingQuality: quality });
  },

  downloadPath: readStored(KEYS.downloadPath, '', (raw) => parseString(raw, '')),
  setDownloadPath: (path) => {
    persist(KEYS.downloadPath, path);
    set({ downloadPath: path });
  },

  autoDownload: readStored(KEYS.autoDownload, false, (raw) => parseBool(raw, false)),
  setAutoDownload: (auto) => {
    persist(KEYS.autoDownload, auto);
    set({ autoDownload: auto });
  },

  // 侧栏开合不持久化：每次启动都从展开态开始
  sidebarOpen: false,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  theme: readStored(KEYS.theme, 'system' as const, (raw) => parseEnum(raw, THEMES, 'system')),
  setTheme: (theme) => {
    persist(KEYS.theme, theme);
    set({ theme });
  },

  enableTransparency: readStored(KEYS.transparency, true, (raw) => parseBool(raw, true)),
  setEnableTransparency: (enable) => {
    persist(KEYS.transparency, enable);
    set({ enableTransparency: enable });
  },

  showTranslationButton: readStored(KEYS.showTranslationButton, true, (raw) => parseBool(raw, true)),
  setShowTranslationButton: (show) => {
    persist(KEYS.showTranslationButton, show);
    set({ showTranslationButton: show });
  },

  autoTranslateLyrics: readStored(KEYS.autoTranslateLyrics, false, (raw) => parseBool(raw, false)),
  setAutoTranslateLyrics: (auto) => {
    persist(KEYS.autoTranslateLyrics, auto);
    set({ autoTranslateLyrics: auto });
  },

  maxConcurrentDownloads: readStored(KEYS.maxConcurrentDownloads, 3, (raw) =>
    parseIntClamped(raw, 3, MIN_CONCURRENT_DOWNLOADS, MAX_CONCURRENT_DOWNLOADS),
  ),
  setMaxConcurrentDownloads: (v) => {
    const clamped = parseIntClamped(String(v), 3, MIN_CONCURRENT_DOWNLOADS, MAX_CONCURRENT_DOWNLOADS);
    persist(KEYS.maxConcurrentDownloads, clamped);
    set({ maxConcurrentDownloads: clamped });
  },

  localLibraryPath: readStored(KEYS.localLibraryPath, '', (raw) => parseString(raw, '')),
  setLocalLibraryPath: (path) => {
    persist(KEYS.localLibraryPath, path);
    set({ localLibraryPath: path });
  },

  autoImportOnDownload: readStored(KEYS.autoImportOnDownload, false, (raw) => parseBool(raw, false)),
  setAutoImportOnDownload: (value) => {
    persist(KEYS.autoImportOnDownload, value);
    set({ autoImportOnDownload: value });
  },

  importMode: readStored(KEYS.importMode, 'index' as const, (raw) => parseEnum(raw, IMPORT_MODES, 'index')),
  setImportMode: (mode) => {
    persist(KEYS.importMode, mode);
    set({ importMode: mode });
  },

  closeAction: readStored(KEYS.closeAction, 'ask' as const, (raw) => parseEnum(raw, CLOSE_ACTIONS, 'ask')),
  setCloseAction: (action) => {
    persist(KEYS.closeAction, action);
    set({ closeAction: action });
  },

  playerBackgroundType: readStored(KEYS.playerBackgroundType, 'dynamic' as const, (raw) =>
    parseEnum(raw, BG_TYPES, 'dynamic'),
  ),
  setPlayerBackgroundType: (type) => {
    persist(KEYS.playerBackgroundType, type);
    set({ playerBackgroundType: type });
  },
}));
