import { create } from 'zustand';

export interface PlatformCookies {
  tencent?: string;
  netease?: string;
  kugou?: string;
  kuwo?: string;
}

interface ConfigState {
  sidecarPort: number;
  setSidecarPort: (port: number) => void;
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
}

export const useConfigStore = create<ConfigState>((set) => ({
  sidecarPort: 3000,
  setSidecarPort: (port) => set({ sidecarPort: port }),
  cookies: ((): PlatformCookies => {
    try {
      const saved = localStorage.getItem('melodix-cookies');
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  })(),
  setCookie: (platform, cookie) => set((state) => {
    const newCookies = { ...state.cookies, [platform]: cookie };
    localStorage.setItem('melodix-cookies', JSON.stringify(newCookies));
    return { cookies: newCookies };
  }),
  streamingQuality: ((): 'standard' | 'high' | 'lossless' => {
    try {
      const saved = localStorage.getItem('melodix-streaming-quality');
      if (saved === 'standard' || saved === 'high' || saved === 'lossless') return saved;
      return 'high';
    } catch { return 'high'; }
  })(),
  setStreamingQuality: (quality) => {
    localStorage.setItem('melodix-streaming-quality', quality);
    set({ streamingQuality: quality });
  },
  downloadPath: ((): string => {
    try {
      return localStorage.getItem('melodix-download-path') || '';
    } catch { return ''; }
  })(),
  setDownloadPath: (path) => {
    localStorage.setItem('melodix-download-path', path);
    set({ downloadPath: path });
  },
  autoDownload: ((): boolean => {
    try {
      return localStorage.getItem('melodix-auto-download') === 'true';
    } catch { return false; }
  })(),
  setAutoDownload: (auto) => {
    localStorage.setItem('melodix-auto-download', String(auto));
    set({ autoDownload: auto });
  },
  sidebarOpen: false,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  theme: ((): 'dark' | 'light' | 'system' => {
    try {
      const saved = localStorage.getItem('melodix-theme');
      if (saved === 'dark' || saved === 'light' || saved === 'system') return saved;
      return 'system';
    } catch { return 'system'; }
  })(),
  setTheme: (theme) => {
    localStorage.setItem('melodix-theme', theme);
    set({ theme });
  },
  enableTransparency: ((): boolean => {
    try {
      const saved = localStorage.getItem('melodix-transparency');
      return saved !== 'false'; // default true
    } catch { return true; }
  })(),
  setEnableTransparency: (enable) => {
    localStorage.setItem('melodix-transparency', String(enable));
    set({ enableTransparency: enable });
  },
  showTranslationButton: ((): boolean => {
    try {
      const saved = localStorage.getItem('melodix-show-translation-button');
      return saved !== 'false'; // default true
    } catch { return true; }
  })(),
  setShowTranslationButton: (show) => {
    localStorage.setItem('melodix-show-translation-button', String(show));
    set({ showTranslationButton: show });
  },
  autoTranslateLyrics: ((): boolean => {
    try {
      return localStorage.getItem('melodix-auto-translate-lyrics') === 'true';
    } catch { return false; }
  })(),
  setAutoTranslateLyrics: (auto) => {
    localStorage.setItem('melodix-auto-translate-lyrics', String(auto));
    set({ autoTranslateLyrics: auto });
  },
  maxConcurrentDownloads: ((): number => {
    try {
      const saved = localStorage.getItem('melodix-max-concurrent-downloads');
      if (saved === null) return 3;
      const n = Number(saved);
      if (Number.isNaN(n)) return 3;
      return Math.min(10, Math.max(1, Math.floor(n)));
    } catch { return 3; }
  })(),
  setMaxConcurrentDownloads: (v) => {
    const clamped = Math.min(10, Math.max(1, Math.floor(v)));
    localStorage.setItem('melodix-max-concurrent-downloads', String(clamped));
    set({ maxConcurrentDownloads: clamped });
  },
  localLibraryPath: ((): string => {
    try {
      return localStorage.getItem('melodix-local-library-path') || '';
    } catch { return ''; }
  })(),
  setLocalLibraryPath: (path) => {
    localStorage.setItem('melodix-local-library-path', path);
    set({ localLibraryPath: path });
  },
  autoImportOnDownload: ((): boolean => {
    try {
      return localStorage.getItem('melodix-auto-import-on-download') === 'true';
    } catch { return false; }
  })(),
  setAutoImportOnDownload: (value) => {
    localStorage.setItem('melodix-auto-import-on-download', String(value));
    set({ autoImportOnDownload: value });
  },
  importMode: ((): 'copy' | 'index' => {
    try {
      const saved = localStorage.getItem('melodix-import-mode');
      if (saved === 'copy' || saved === 'index') return saved;
      return 'index';
    } catch { return 'index'; }
  })(),
  setImportMode: (mode) => {
    localStorage.setItem('melodix-import-mode', mode);
    set({ importMode: mode });
  },
}));
