import { useEffect, useLayoutEffect, useState, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import * as api from './api/client';
import { getSongCoverUrl } from './utils/cover';
import { AnimatePresence, motion, LayoutGroup } from 'framer-motion';
import { useConfigStore } from './stores/configStore';
import { usePlaybackStore } from './stores/playbackStore';
import { TitleBar } from './components/TitleBar';
import { SearchPage } from './components/SearchPage';
import { Sidebar } from './components/Sidebar';
import { SettingsPage } from './components/SettingsPage';
import { PlayerBar } from './components/PlayerBar';
import { LyricsView } from './components/LyricsView';
import { RouteState } from './types/playback';
import { HomePage } from './components/HomePage';
import { PlaylistView } from './components/PlaylistView';
import { AlbumPage } from './components/AlbumPage';
import { ArtistPage } from './components/ArtistPage';
import { QueuePanel } from './components/QueuePanel';
import { DownloadPanel } from './components/DownloadPanel';
import { FavoritesPage } from './components/FavoritesPage';
import { HistoryPage } from './components/HistoryPage';
import { LocalLibraryPage } from './components/LocalLibraryPage';
import { CustomLibraryPage } from './components/CustomLibraryPage';
import { ToastContainer } from './components/ToastContainer';
import { CloseConfirmModal } from './components/CloseConfirmModal';
import { useUIStore } from './stores/uiStore';
import { AudioEngine } from './services/AudioEngine';
import { MiniPlayer } from './components/MiniPlayer';


export default function App() {
  const setSidecarPort = useConfigStore((state) => state.setSidecarPort);
  const lyricsOpen = usePlaybackStore((s) => s.lyricsOpen);
  const setLyricsOpen = usePlaybackStore((s) => s.setLyricsOpen);
  const current = usePlaybackStore((s) => s.current);
  const themeColor = usePlaybackStore((s) => s.themeColor);
  const themeColors = usePlaybackStore((s) => s.themeColors);
  const isLightBg = usePlaybackStore((s) => s.bgIsLight);
  const isPlaying = usePlaybackStore((s) => s.isPlaying);
  const queue = usePlaybackStore((s) => s.queue);
  const currentIndex = usePlaybackStore((s) => s.currentIndex);
  const theme = useConfigStore((s) => s.theme);
  const enableTransparency = useConfigStore((s) => s.enableTransparency);
  const playerBackgroundType = useConfigStore((s) => s.playerBackgroundType);
  const [actualTheme, setActualTheme] = useState<'dark' | 'light'>(() => {
    const t = useConfigStore.getState().theme;
    if (t === 'system') {
      return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return t as 'dark' | 'light';
  });
  const [error, setError] = useState<string | null>(null);
  const [sidecarReady, setSidecarReady] = useState(false);
  const [activePage, setActivePage] = useState<RouteState>({ page: 'home' });
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const { activePanel, closePanel, isMiniPlayer } = useUIStore();

  // 详情页返回历史栈：进入 album/artist 页时压栈，返回时弹出；
  // 通过侧边栏等导航到非详情页时清空栈（等价于"重置导航"）
  const activePageRef = useRef(activePage);
  activePageRef.current = activePage;
  const historyRef = useRef<RouteState[]>([]);

  const handleNavigate = useCallback((route: RouteState) => {
    const isDetail = route.page === 'album' || route.page === 'artist';
    if (isDetail) {
      historyRef.current.push(activePageRef.current);
    } else {
      historyRef.current = [];
    }
    setActivePage(route);
  }, []);

  const handleBack = useCallback(() => {
    const prev = historyRef.current.pop();
    setActivePage(prev || { page: 'home' });
  }, []);

  useEffect(() => {
    const handleMessage = async (e: MessageEvent) => {
      if (e.data.type === 'auth-success') {
        const u = await api.checkAuth();
        if (u) {
          useUIStore.getState().setUser(u);
          const t = await api.getLoginStatus();
          useUIStore.getState().setToken(t || '');
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [setSidecarPort]);

  useEffect(() => {
    const unlistenPromise = getCurrentWindow().onCloseRequested(async (event) => {
      const action = useConfigStore.getState().closeAction;
      if (action === 'minimize') {
        event.preventDefault();
        await getCurrentWindow().hide();
      } else if (action === 'ask') {
        event.preventDefault();
        setShowCloseConfirm(true);
      } else {
        // 'exit'：必须走 exit_app。默认 close 只关主窗口，隐藏的 tray 窗口会让进程残留
        event.preventDefault();
        invoke('exit_app');
      }
    });
    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  // 全局 Escape 分层关闭：关闭确认弹窗 > 全局面板 > 局部弹出菜单（广播 melodix-close-popups）
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (showCloseConfirm) {
        setShowCloseConfirm(false);
        return;
      }
      if (activePanel) {
        closePanel();
        return;
      }
      window.dispatchEvent(new CustomEvent('melodix-close-popups'));
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [showCloseConfirm, activePanel, closePanel]);

  // 托盘窗口双向同步：监听托盘控制命令（TrayMenu.tsx），并向其推送播放状态
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;

    const channel = new BroadcastChannel('melodix-tray-sync');

    const pushSync = () => {
      const { current, isPlaying, themeColor } = usePlaybackStore.getState();
      channel.postMessage({ type: 'sync', state: { current, isPlaying, themeColor } });
    };

    channel.onmessage = (e: MessageEvent) => {
      const { action } = e.data || {};
      switch (action) {
        case 'togglePlay': {
          const s = usePlaybackStore.getState();
          if (!s.current) break;
          if (s.isPlaying) {
            AudioEngine.pause();
            s.setPlaying(false);
          } else {
            AudioEngine.resume().then(() => s.setPlaying(true)).catch(() => {});
          }
          break;
        }
        case 'next':
          // current 变化后由 PlayerBar 的副作用自动取 URL（在线）或文件源（本地）播放
          usePlaybackStore.getState().next();
          break;
        case 'prev':
          usePlaybackStore.getState().prev();
          break;
        // show/exit 已改为托盘窗口直接 invoke Rust 命令（show_main_window / exit_app）：
        // 隐藏/挂起的主窗口 WebView 收不到广播，此前偶发"显示主界面无反应"
        case 'request-sync':
          pushSync();
          break;
      }
    };

    // 挂载后立即推送一次，覆盖托盘窗口先于主窗口建立频道的时序
    pushSync();

    const unsubscribe = usePlaybackStore.subscribe(
      (s) => ({ current: s.current, isPlaying: s.isPlaying, themeColor: s.themeColor }),
      () => pushSync(),
      { equalityFn: (a, b) => a.current === b.current && a.isPlaying === b.isPlaying && a.themeColor === b.themeColor }
    );

    return () => {
      unsubscribe();
      channel.close();
    };
  }, []);

  // Preload next track's cover image
  useEffect(() => {
    if (queue.length > 0 && currentIndex >= 0 && currentIndex < queue.length - 1) {
      const nextSong = queue[currentIndex + 1];
      const nextCoverUrl = getSongCoverUrl(nextSong, 500);
      const img = new Image();
      img.src = nextCoverUrl;
      const nextBgUrl = getSongCoverUrl(nextSong, 300);
      const bgImg = new Image();
      bgImg.src = nextBgUrl;
    }
  }, [queue, currentIndex]);

  useEffect(() => {
    const matcher = window.matchMedia('(prefers-color-scheme: dark)');
    const updateTheme = () => {
      setActualTheme(theme === 'system' ? (matcher.matches ? 'dark' : 'light') : theme as 'dark' | 'light');
    };
    updateTheme();
    matcher.addEventListener('change', updateTheme);
    return () => matcher.removeEventListener('change', updateTheme);
  }, [theme]);

  useLayoutEffect(() => {
    if (lyricsOpen) {
      document.documentElement.dataset.theme = isLightBg ? 'light' : 'dark';
    } else {
      document.documentElement.dataset.theme = actualTheme;
    }
  }, [actualTheme, lyricsOpen, isLightBg]);

  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [activePage]);

  const initSidecar = () => {
    setSidecarReady(false);
    setError(null);
    // sidecar 为懒启动：必须走 ensureSidecarRunning（内部调用 start_sidecar 并轮询就绪）。
    // 此前直接读 get_sidecar_port 只拿到初始端口 0，探测永远失败，形成启动页死锁。
    api.ensureSidecarRunning()
      .then(() => {
        setSidecarPort(useConfigStore.getState().sidecarPort);
        setSidecarReady(true);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
      });
  };

  useEffect(() => {
    initSidecar();
  }, [setSidecarPort]);

  useEffect(() => {
    const updateWindow = async () => {
      try {
        await invoke('set_mini_player', { mini: isMiniPlayer });
      } catch (e) {
        console.error("Failed to resize window:", e);
      }
    };
    updateWindow();
  }, [isMiniPlayer]);

  return (
    <LayoutGroup>
      {isMiniPlayer && (
        <div style={{ width: '100vw', height: '100vh', background: 'transparent', display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-start' }}>
          <div style={{ width: '100%', height: '100%' }}>
            <MiniPlayer />
          </div>
          <ToastContainer />
        </div>
      )}
      <div style={{ display: isMiniPlayer ? 'none' : 'contents' }}>
        {!sidecarReady ? (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          width: '100vw',
          background: 'var(--color-bg-alt)',
          color: 'var(--color-text)',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          gap: 24,
        }}>
          {!error ? (
            <>
              <style>{`@keyframes melodix-spin { to { transform: rotate(360deg); } }`}</style>
              <div style={{
                width: 40,
                height: 40,
                border: '3px solid var(--color-surface-active)',
                borderTopColor: 'var(--color-primary)',
                borderRadius: '50%',
                animation: 'melodix-spin 0.8s linear infinite',
              }} />
              <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: 2 }}>Melodix</div>
              <div style={{ fontSize: 14, color: 'var(--color-text-faint)' }}>正在启动服务...</div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: 2 }}>Melodix</div>
              <div style={{ fontSize: 14, color: 'var(--color-danger)' }}>{error}</div>
              <button
                onClick={initSidecar}
                style={{
                  padding: '8px 24px',
                  fontSize: 14,
                  fontWeight: 600,
                  color: 'var(--color-text)',
                  background: 'var(--color-primary)',
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-primary-light)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'var(--color-primary)'}
              >
                重试
              </button>
            </>
          )}
        </div>
      ) : (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        width: '100vw',
        background: enableTransparency ? (actualTheme === 'dark' ? 'rgba(0, 0, 0, 0.15)' : 'rgba(255, 255, 255, 0.3)') : 'var(--color-bg)',
        color: 'var(--color-text)',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        overflow: 'hidden',
        position: 'relative',
        borderRadius: enableTransparency ? 8 : 0,
        // 沉浸模式时全局覆盖文字颜色和弹出框背景，让侧边栏、标题栏和弹出菜单一起变色
        ...(lyricsOpen ? (
          isLightBg ? {
            '--color-text': 'rgba(0,0,0,0.85)',
            '--color-text-dim': 'rgba(0,0,0,0.6)',
            '--color-text-faint': 'rgba(0,0,0,0.4)',
            '--color-icon': 'rgba(0,0,0,0.65)',
            '--color-bg-elevated': 'rgba(255,255,255,0.85)',
            '--glass-bg': 'rgba(255,255,255,0.6)',
            '--glass-border': 'rgba(0,0,0,0.1)',
            '--color-surface-hover': 'rgba(0,0,0,0.05)',
          } : {
            '--color-text': 'rgba(255,255,255,0.95)',
            '--color-text-dim': 'rgba(255,255,255,0.7)',
            '--color-text-faint': 'rgba(255,255,255,0.4)',
            '--color-icon': 'rgba(255,255,255,0.7)',
            '--color-bg-elevated': 'rgba(0,0,0,0.6)',
            '--glass-bg': 'rgba(0,0,0,0.4)',
            '--glass-border': 'rgba(255,255,255,0.1)',
            '--color-surface-hover': 'rgba(255,255,255,0.1)',
          }
        ) : {}) as React.CSSProperties
      }}>
        {/* Subtle colored blobs — purely decorative, don't block desktop */}
        <div style={{ position: 'absolute', inset: 0, zIndex: 0, overflow: 'hidden', pointerEvents: 'none' }}>
          <motion.div
            animate={{ opacity: [0.12, 0.2, 0.12] }}
            transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              position: 'absolute',
              top: '-15%', left: '-5%',
              width: '55vw', height: '55vw',
              background: `radial-gradient(circle, ${themeColor || 'var(--color-primary)'}80 0%, transparent 65%)`,
              filter: 'blur(90px)',
              pointerEvents: 'none',
            }}
          />
          <motion.div
            animate={{ opacity: [0.08, 0.16, 0.08] }}
            transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
            style={{
              position: 'absolute',
              bottom: '-20%', right: '-10%',
              width: '50vw', height: '50vw',
              background: `radial-gradient(circle, ${themeColor || 'var(--color-accent)'}70 0%, transparent 65%)`,
              filter: 'blur(90px)',
              pointerEvents: 'none',
            }}
          />
        </div>
        
        <div style={{
          position: 'relative',
          zIndex: lyricsOpen ? 'var(--z-immersive)' : 'var(--z-titlebar)',
          background: lyricsOpen ? 'transparent' : 'var(--glass-bg)',
          backdropFilter: lyricsOpen ? 'none' : 'var(--glass-blur) var(--glass-saturate)',
          WebkitBackdropFilter: lyricsOpen ? 'none' : 'var(--glass-blur) var(--glass-saturate)',
          borderBottom: 'none',
          borderTopLeftRadius: lyricsOpen ? 0 : (enableTransparency ? 8 : 0),
          borderTopRightRadius: lyricsOpen ? 0 : (enableTransparency ? 8 : 0),
          overflow: 'hidden',
        }}>
          <TitleBar />
        </div>

        {/* Error Toast */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              style={{ overflow: 'hidden' }}
            >
              <div style={{
                padding: '8px 16px',
                fontSize: 12,
                color: 'var(--color-danger)',
                background: 'rgba(239, 68, 68, 0.1)',
                borderBottom: '1px solid rgba(239, 68, 68, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <span>Connection error: {error}</span>
                <button
                  onClick={() => setError(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--color-danger)',
                    cursor: 'pointer',
                    padding: '4px 8px',
                    fontSize: 14,
                    opacity: 0.8,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                  onMouseLeave={(e) => e.currentTarget.style.opacity = '0.8'}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Content Area: Sidebar + Main */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
          <Sidebar activePage={activePage} onNavigate={handleNavigate} />
          {/* Main Context */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative', background: enableTransparency ? (actualTheme === 'dark' ? 'transparent' : 'rgba(255, 255, 255, 0.6)') : 'var(--color-bg-elevated)', borderTopLeftRadius: 0, boxShadow: enableTransparency ? '-4px 0 24px rgba(0,0,0,0.05)' : 'none' }}>
            <main ref={mainRef} style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
              <AnimatePresence mode="wait">
                <motion.div
                  key={activePage.page + (activePage.id || '')}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.22, ease: [0.25, 1, 0.5, 1] }}
                  style={{
                    position: 'absolute',
                    width: '100%',
                    height: '100%',
                    top: 0,
                    left: 0,
                  }}
                >
                  {activePage.page === 'home' && <HomePage onNavigate={handleNavigate} />}
                  {activePage.page === 'search' && <SearchPage onNavigate={handleNavigate} />}
                  {activePage.page === 'playlist' && <PlaylistView playlistId={activePage.id} source={activePage.source} onNavigate={handleNavigate} />}
                  {activePage.page === 'album' && (
                    <AlbumPage
                      albumId={activePage.id}
                      source={activePage.source}
                      fallbackName={activePage.name}
                      fallbackCover={activePage.cover}
                      onNavigate={handleNavigate}
                      onBack={handleBack}
                    />
                  )}
                  {activePage.page === 'artist' && (
                    <ArtistPage
                      artistId={activePage.id}
                      source={activePage.source}
                      fallbackName={activePage.name}
                      fallbackCover={activePage.cover}
                      onNavigate={handleNavigate}
                      onBack={handleBack}
                    />
                  )}
                  {activePage.page === 'settings' && <SettingsPage onNavigate={handleNavigate} />}
                  {activePage.page === 'favorites' && <FavoritesPage onNavigate={handleNavigate} />}
                  {activePage.page === 'history' && <HistoryPage onNavigate={handleNavigate} />}
                  {activePage.page === 'local-library' && <LocalLibraryPage />}
                  {activePage.page === 'custom-library' && (
                    <CustomLibraryPage libraryId={activePage.id} onNavigate={handleNavigate} />
                  )}
                </motion.div>
              </AnimatePresence>
            </main>
            
            {/* Local PlayerBar and QueuePanel (Only spans right column) */}
            {/* 沉浸模式下 PlayerBar 用 fixed+高z值确保显示在面板之上 */}
            <div style={{ position: 'relative', zIndex: lyricsOpen ? 'var(--z-immersive)' : 'var(--z-playerbar)' }}>
              <PlayerBar onNavigate={handleNavigate} />
              <QueuePanel isOpen={activePanel === 'queue'} onClose={closePanel} />
              <DownloadPanel />
            </div>
          </div>
        </div>

        {/* Lyrics Panel — 左右分栏：左侧大封面+歌名作者，右侧歌词 */}
        <AnimatePresence>
          {lyricsOpen && current && (
            <motion.div
              key="lyrics-panel"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="lyrics-panel-overlay"
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 'var(--z-overlay)',
                display: 'flex',
                overflow: 'hidden',
                background: 'var(--color-bg)',
                willChange: 'opacity',
                transform: 'translateZ(0)',
              }}
            >
              <style>{`
                @media (max-width: 768px) {
                  .lyrics-panel-overlay {
                    flex-direction: column !important;
                  }
                  .lyrics-left-section {
                    width: 100% !important;
                    height: auto !important;
                    min-width: unset !important;
                    padding: 24px 24px 8px 24px !important;
                    align-items: center !important;
                  }
                  .lyrics-left-inner {
                    flex-direction: row !important;
                    align-items: center !important;
                    gap: 16px !important;
                    width: 100% !important;
                    max-width: 400px !important;
                  }
                  .cover-container {
                    width: 80px !important;
                    height: 80px !important;
                    flex-shrink: 0 !important;
                  }
                  .info-container {
                    margin-top: 0 !important;
                    flex: 1 !important;
                    min-width: 0 !important;
                  }
                  .track-title-wrapper {
                    font-size: 18px !important;
                    margin-bottom: 4px !important;
                  }
                  .track-artist-wrapper {
                    font-size: 14px !important;
                  }
                  .lyrics-right-section {
                    height: 70% !important;
                  }
                }
              `}</style>
              {/* 背景图层 */}
              <AnimatePresence mode="popLayout">
                {playerBackgroundType === 'static' ? (
                  <motion.div
                    key={`static-${current.id}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.8 }}
                    style={{
                      position: 'absolute',
                      inset: '-10%', // 放大一点避免边缘漏出清晰图像
                      backgroundImage: `url(${getSongCoverUrl(current, 300)})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      filter: isLightBg ? 'blur(50px) brightness(0.95)' : 'blur(50px) brightness(0.6)',
                      zIndex: 0,
                      pointerEvents: 'none',
                      transform: 'scale(1.1) translateZ(0)',
                      willChange: 'opacity',
                    }}
                  />
                ) : (
                  <motion.div
                    key={`dynamic-${current.id}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.8 }}
                    style={{
                      position: 'absolute',
                      inset: '-25%', // 超大边缘防止形变漏边
                      // Apple Music 风格的深色冷色底色
                      backgroundColor: isLightBg ? '#d4d8e0' : '#050912',
                      zIndex: 0,
                      pointerEvents: 'none',
                      overflow: 'hidden',
                      filter: 'blur(110px)', // 加大模糊让色块更流畅融合
                    }}
                  >
                    {/* 流光色块：提取封面多色 + 节奏感知动画速度 */}
                    {themeColors && themeColors.length > 0 && themeColors.slice(0, 5).map((color, index) => {
                      // 节弹感知：播放中稍快，暂停时慢片
                      const baseDurations = [52, 65, 45, 70, 55];
                      const playingDurations = [22, 28, 18, 30, 20];
                      const dur = isPlaying ? playingDurations[index] : baseDurations[index];

                      // 每个色块使用完全不同的形变路径
                      const paths = [
                        { x: ['0%', '25%', '-15%', '10%', '0%'], y: ['0%', '-25%', '15%', '-10%', '0%'] },
                        { x: ['0%', '-20%', '30%', '-10%', '0%'], y: ['0%', '20%', '-30%', '15%', '0%'] },
                        { x: ['0%', '15%', '-25%', '20%', '0%'], y: ['0%', '25%', '10%', '-20%', '0%'] },
                        { x: ['0%', '-30%', '10%', '-15%', '0%'], y: ['0%', '-15%', '-20%', '25%', '0%'] },
                        { x: ['0%', '20%', '15%', '-25%', '0%'], y: ['0%', '-20%', '30%', '-5%', '0%'] },
                      ];
                      const path = paths[index % paths.length];

                      const size = [68, 80, 58, 88, 72][index % 5];
                      const topPos = ['-5%', '38%', '68%', '8%', '55%'];
                      const leftPos = ['-5%', '55%', '-15%', '48%', '25%'];

                      // 深色唇偁：暗色模式下增大色块饱和度，亿写冷色系感觉
                      const saturationBoost = isLightBg ? 1 : 1.3;
                      const colorOpacity = isLightBg ? 0.5 : 0.75;

                      return (
                        <motion.div
                          key={`blob-${current.id}-${index}`}
                          animate={{
                            x: path.x,
                            y: path.y,
                            scale: [1, 1.15, 0.92, 1.08, 1],
                            rotate: [0, index % 2 === 0 ? 120 : -120, 360],
                            borderRadius: [
                              '42% 58% 68% 32% / 38% 52% 62% 48%',
                              '62% 38% 28% 72% / 58% 28% 72% 42%',
                              '48% 52% 58% 42% / 42% 58% 48% 52%',
                              '35% 65% 52% 48% / 52% 38% 68% 32%',
                              '42% 58% 68% 32% / 38% 52% 62% 48%',
                            ],
                          }}
                          transition={{ 
                            duration: dur, 
                            repeat: Infinity, 
                            ease: 'linear',
                            delay: index * -8, // 更大错开引導相位
                          }}
                          style={{
                            position: 'absolute',
                            top: topPos[index],
                            left: leftPos[index],
                            width: `${size}vw`,
                            height: `${size}vw`,
                            backgroundColor: color,
                            opacity: colorOpacity,
                            filter: `saturate(${saturationBoost})`,
                            mixBlendMode: isLightBg ? 'multiply' : 'screen',
                          }}
                        />
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* 噪点质感涂层 */}
              {playerBackgroundType === 'dynamic' && (
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'var(--acrylic-noise)',
                  opacity: 0.6,
                  mixBlendMode: 'overlay',
                  zIndex: 1,
                  pointerEvents: 'none',
                }} />
              )}

              {/* Apple Music 形式的沉浸荆珻璃 Scrim 层——带主题色渎行的边缘晶暙 */}
              <div style={{
                position: 'absolute',
                inset: 0,
                background: playerBackgroundType === 'dynamic'
                  ? `radial-gradient(ellipse at 50% 50%, transparent 20%, ${isLightBg ? 'rgba(200,205,220,0.55)' : 'rgba(2,4,15,0.6)'} 80%), 
                     radial-gradient(ellipse at 30% 70%, ${themeColor}${isLightBg ? '18' : '28'} 0%, transparent 50%)`
                  : `radial-gradient(ellipse at 30% 50%, ${themeColor}${isLightBg ? '20' : '33'} 0%, transparent 70%)`,
                zIndex: 2,
                pointerEvents: 'none',
              }} />

              {/* 文字可读性保障层 */}
              <div style={{
                position: 'absolute',
                inset: 0,
                background: isLightBg ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.28)',
                zIndex: 3,
                pointerEvents: 'none',
              }} />

              {/* 左侧：封面 + 歌曲信息；用 isolation: isolate 隔空色彩混合，封面永远不被背景污染 */}
              <div className="lyrics-left-section" style={{
                width: '50%',
                minWidth: 320,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 'clamp(16px, 4vh, 48px) clamp(16px, 2vw, 32px)',
                position: 'relative',
                zIndex: 4,
                isolation: 'isolate', // 隔空封面和流光层的 mix-blend-mode 交叉
              }}>
                <div className="lyrics-left-inner" style={{
                  width: 'clamp(280px, 45vh, 500px)',
                  display: 'flex',
                  flexDirection: 'column',
                }}>
                  <motion.div
                    layout
                    layoutId="album-cover"
                    className="cover-container"
                    style={{
                      position: 'relative',
                      width: '100%',
                      aspectRatio: '1',
                      borderRadius: 12,
                      boxShadow: `0 24px 48px rgba(0,0,0,0.5), 0 0 100px ${themeColor}60`,
                      cursor: 'pointer',
                      zIndex: 10,
                    }}
                    transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                    onClick={() => setLyricsOpen(false)}
                    title="收起播放页"
                    whileHover={{ y: -4 }}
                  >
                    <AnimatePresence mode="popLayout">
                      <motion.img
                        key={current.id}
                        src={getSongCoverUrl(current, 500)}
                        alt=""
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.4 }}
                        style={{
                          width: '100%',
                          height: '100%',
                          borderRadius: 12,
                          objectFit: 'cover',
                          background: 'var(--color-bg-placeholder)',
                          border: '1px solid var(--color-border-on-dark)',
                        }}
                      />
                    </AnimatePresence>
                  </motion.div>
                  
                  {/* 歌曲信息 (左对齐，在封面正下方) */}
                  <div className="info-container" style={{ marginTop: 32, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%' }}>
                    <motion.div
                      layout
                      layoutId="track-title"
                      className="track-title-wrapper"
                      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                      style={{
                        fontSize: 'clamp(20px, 3vh, 28px)',
                        fontWeight: 700,
                        color: 'var(--color-text)',
                        marginBottom: 8,
                        textShadow: isLightBg ? 'none' : '0 2px 8px rgba(0,0,0,0.2)',
                        width: '100%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        textAlign: 'left'
                      }}
                    >
                      {current.name || ''}
                    </motion.div>
                    <motion.div
                      layout
                      layoutId="track-artist"
                      className="track-artist-wrapper"
                      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                      style={{
                        fontSize: 'clamp(14px, 2vh, 18px)',
                        color: 'var(--color-text-dim)',
                        textShadow: isLightBg ? 'none' : '0 1px 4px rgba(0,0,0,0.2)',
                        width: '100%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        textAlign: 'left'
                      }}
                    >
                      {current.artist || ''}
                    </motion.div>
                  </div>
                </div>
              </div>

            {/* 右侧：歌词 */}
            <div className="lyrics-right-section" style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              position: 'relative',
              zIndex: 3,
            }}>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <LyricsView />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
      )}
      </div>
      {/* 面板关闭兜底遮罩：盖住 PlayerBar(50)、低于面板(--z-modal 100)。
          queue/comments 面板已自带同规格遮罩，此处排除避免双层遮罩叠加变深；
          lyricsOpen 时面板已关，排除以防误盖歌词页 */}
      {activePanel && activePanel !== 'queue' && activePanel !== 'comments' && !lyricsOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 'var(--z-overlay)' }}
          onClick={closePanel}
        />
      )}
      <ToastContainer />
      <CloseConfirmModal isOpen={showCloseConfirm} onClose={() => setShowCloseConfirm(false)} />
    </LayoutGroup>
  );
}
