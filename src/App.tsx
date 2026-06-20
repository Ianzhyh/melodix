import { useEffect, useState, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
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
import { QueuePanel } from './components/QueuePanel';
import { DownloadPanel } from './components/DownloadPanel';
import { FavoritesPage } from './components/FavoritesPage';
import { LocalLibraryPage } from './components/LocalLibraryPage';
import { ToastContainer } from './components/ToastContainer';
import { useUIStore } from './stores/uiStore';


export default function App() {
  const setSidecarPort = useConfigStore((state) => state.setSidecarPort);
  const lyricsOpen = usePlaybackStore((s) => s.lyricsOpen);
  const setLyricsOpen = usePlaybackStore((s) => s.setLyricsOpen);
  const current = usePlaybackStore((s) => s.current);
  const themeColor = usePlaybackStore((s) => s.themeColor);
  const isLightBg = usePlaybackStore((s) => s.bgIsLight);
  const queue = usePlaybackStore((s) => s.queue);
  const currentIndex = usePlaybackStore((s) => s.currentIndex);
  const theme = useConfigStore((s) => s.theme);
  const enableTransparency = useConfigStore((s) => s.enableTransparency);
  const [actualTheme, setActualTheme] = useState<'dark' | 'light'>('dark');
  const [error, setError] = useState<string | null>(null);
  const [sidecarReady, setSidecarReady] = useState(false);
  const [activePage, setActivePage] = useState<RouteState>({ page: 'home' });
  const { activePanel, closePanel } = useUIStore();

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

  useEffect(() => {
    document.body.dataset.theme = actualTheme;
  }, [actualTheme]);

  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [activePage]);

  const initSidecar = () => {
    setSidecarReady(false);
    setError(null);
    invoke<number>('get_sidecar_port')
      .then(async (p) => {
        setSidecarPort(p);
        const startTime = Date.now();
        // Wait for sidecar to be ready
        for (let i = 0; i < 30; i++) {
          if (Date.now() - startTime > 30000) {
            setError('服务启动超时，请检查网络连接或重试');
            return;
          }
          try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 2000);
            await fetch(`http://127.0.0.1:${p}/search?server=netease&id=test&page=1&limit=1`, { signal: controller.signal });
            clearTimeout(timer);
            console.log(`[Melodix] Sidecar ready on port ${p}`);
            setSidecarReady(true);
            break;
          } catch {
            await new Promise(r => setTimeout(r, 500));
          }
        }
      })
      .catch((err) => {
        setError(String(err));
        setSidecarPort(3000);
      });
  };

  useEffect(() => {
    initSidecar();
  }, [setSidecarPort]);

  return (
    <LayoutGroup>
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
          zIndex: lyricsOpen ? 95 : 'var(--z-titlebar)',
          background: lyricsOpen ? 'transparent' : 'var(--glass-bg)',
          backdropFilter: lyricsOpen ? 'none' : 'var(--glass-blur) var(--glass-saturate)',
          WebkitBackdropFilter: lyricsOpen ? 'none' : 'var(--glass-blur) var(--glass-saturate)',
          borderBottom: lyricsOpen ? 'none' : '1px solid var(--glass-border)',
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
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                  onMouseLeave={(e) => e.currentTarget.style.opacity = '0.8'}
                >
                  ✕
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Content Area: Sidebar + Main */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
          <Sidebar activePage={activePage} onNavigate={setActivePage} />
          {/* Main Context */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative', background: enableTransparency ? (actualTheme === 'dark' ? 'rgba(0, 0, 0, 0.4)' : 'rgba(255, 255, 255, 0.4)') : 'var(--color-bg-elevated)', borderTopLeftRadius: 16 }}>
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
                  {activePage.page === 'home' && <HomePage onNavigate={setActivePage} />}
                  {activePage.page === 'search' && <SearchPage />}
                  {activePage.page === 'playlist' && <PlaylistView playlistId={activePage.id} source={activePage.source} />}
                  {activePage.page === 'settings' && <SettingsPage />}
                  {activePage.page === 'favorites' && <FavoritesPage />}
                  {activePage.page === 'local-library' && <LocalLibraryPage />}
                </motion.div>
              </AnimatePresence>
            </main>
            
            {/* Local PlayerBar and QueuePanel (Only spans right column) */}
            {/* 沉浸模式下 PlayerBar 用 fixed+高z值确保显示在面板之上 */}
            <div style={{ position: 'relative', zIndex: lyricsOpen ? 95 : 50 }}>
              <PlayerBar />
              {activePanel && (
                <div
                  style={{ position: 'fixed', inset: 0, zIndex: 40 }}
                  onClick={closePanel}
                />
              )}
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
              {/* 真正的模糊背景图层：交叉淡入淡出动画避免白屏闪烁 */}
              <AnimatePresence mode="popLayout">
                <motion.div
                  key={current.id}
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
              </AnimatePresence>
              {/* 主题色发光叠加层 */}
              <div style={{
                position: 'absolute',
                inset: 0,
                background: `radial-gradient(ellipse at 30% 50%, ${themeColor}${isLightBg ? '20' : '33'} 0%, transparent 70%)`,
                zIndex: 1,
                pointerEvents: 'none',
              }} />
              {/* 暗色遮罩确保文字可读（如果是亮色背景，则减弱遮罩让黑色文字清晰可见） */}
              <div style={{
                position: 'absolute',
                inset: 0,
                background: isLightBg ? 'rgba(255,255,255,0.15)' : 'rgba(0, 0, 0, 0.4)',
                zIndex: 2,
                pointerEvents: 'none',
              }} />

              {/* 左侧：封面 + 歌曲信息 */}
              <div className="lyrics-left-section" style={{
                width: '50%',
                minWidth: 320,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 'clamp(16px, 4vh, 48px) clamp(16px, 2vw, 32px)',
                position: 'relative',
                zIndex: 3,
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
      <ToastContainer />
    </LayoutGroup>
  );
}
