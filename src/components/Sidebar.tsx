import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RouteState } from '../types/playback';
import * as api from '../api/client';
import { useConfigStore } from '../stores/configStore';
import { useFavoriteStore } from '../stores/favoriteStore';
import { useHomeStore } from '../stores/homeStore';
import { useDownloadStore } from '../stores/downloadStore';
import { useUIStore } from '../stores/uiStore';
import { useLocalLibraryStore } from '../stores/localLibraryStore';

interface SidebarProps {
  activePage: RouteState;
  onNavigate: (route: RouteState) => void;
}

const Icons = {
  home: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  ),
  search: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  settings: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  ),
  logo: (
    <img src="/app-icon.png" alt="Logo" width="28" height="28" style={{ objectFit: 'contain' }} />
  ),
  collapse: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  ),
  expand: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18l6-6-6-6" />
    </svg>
  ),
  library: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  ),
  download: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
};

export function Sidebar({ activePage, onNavigate }: SidebarProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const recommendations = useHomeStore((s) => s.recommendations);
  const { sidebarOpen, setSidebarOpen } = useConfigStore();
  const favoriteCount = useFavoriteStore((s) => s.favorites.length);
  const localLibraryCount = useLocalLibraryStore((s) => s.totalCount);
  const activeDownloadCount = useDownloadStore((s) => s.activeCount());
  const setDownloadPanelOpen = useUIStore((s) => s.setDownloadPanelOpen);

  const tabs = [
    { id: 'home', title: 'Home', icon: Icons.home },
    { id: 'search', title: 'Discover', icon: Icons.search },
    { id: 'settings', title: 'Settings', icon: Icons.settings },
  ];

  return (
    <>
      <style>{`
        /* Sidebar drawer styles */
        @media (max-width: 900px) {
          .sidebar-container {
            position: absolute !important;
            left: calc(-1 * var(--sidebar-width));
            top: 0;
            bottom: 0;
            background: var(--color-bg-elevated) !important;
            box-shadow: 8px 0 32px rgba(0,0,0,0.5) !important;
            transition: left 0.3s cubic-bezier(0.25, 1, 0.5, 1);
            width: var(--sidebar-width) !important;
          }
          .sidebar-container.open {
            left: 0 !important;
          }
          .sidebar-backdrop {
            display: block !important;
          }
        }
      `}</style>

      {sidebarOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setSidebarOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            zIndex: 'var(--z-overlay)',
            display: 'none',
          }}
        />
      )}

      <motion.div
        animate={{ width: isExpanded ? 'var(--sidebar-width)' : 72 }}
        transition={{ type: 'spring', stiffness: 400, damping: 40 }}
        className={`sidebar-container ${sidebarOpen ? 'open' : ''}`}
        style={{
          flexShrink: 0,
          background: 'var(--glass-bg)',
          backdropFilter: 'var(--glass-blur) var(--glass-saturate)',
          WebkitBackdropFilter: 'var(--glass-blur) var(--glass-saturate)',
          borderRight: '1px solid var(--glass-border)',
          transform: 'translateZ(0)',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          zIndex: 'var(--z-sidebar)',
        }}
      >
        {/* Header / Logo */}
        <div style={{ height: 80, display: 'flex', alignItems: 'center', padding: isExpanded ? '0 24px' : '0 22px', overflow: 'hidden', whiteSpace: 'nowrap', transition: 'padding 0.3s' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {Icons.logo}
            <AnimatePresence>
              {isExpanded && (
                <motion.span
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10, transition: { duration: 0.1 } }}
                  style={{
                    fontSize: 15,
                    fontWeight: 400,
                    letterSpacing: 4,
                    textTransform: 'uppercase',
                    fontFamily: '"Optima", "Segoe UI", "Helvetica Neue", sans-serif',
                    color: 'var(--color-text, #ffffff)',
                    opacity: 0.9,
                  }}
                >
                  Melodix
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Navigation Links */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, padding: '0 14px', overflow: 'hidden' }}>
          {tabs.map(tab => {
            const isActive = activePage.page === tab.id;
            return (
              <motion.button
                key={tab.id}
                onClick={() => {
                  onNavigate({ page: tab.id });
                  setSidebarOpen(false);
                }}
                style={{
                  height: 44,
                  borderRadius: 12,
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 12px',
                  position: 'relative',
                  outline: 'none',
                  color: isActive ? 'var(--color-text, #fff)' : 'var(--color-text-dim, rgba(255, 255, 255, 0.65))',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                }}
                whileHover={{ color: 'var(--color-text, #fff)' }}
                whileTap={{ scale: 0.98 }}
              >
                {isActive && (
                  <motion.div
                    layoutId="sidebar-active-indicator"
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: '20%',
                      bottom: '20%',
                      width: 4,
                      background: 'var(--color-primary, #6366f1)',
                      borderRadius: 4,
                    }}
                    transition={{ type: 'spring', stiffness: 400, damping: 40 }}
                  />
                )}
                <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20 }}>
                    {tab.icon}
                  </div>
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.span
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10, transition: { duration: 0.1 } }}
                        style={{ fontSize: 14, fontWeight: 600 }}
                      >
                        {tab.title}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>
              </motion.button>
            );
          })}

          {/* Divider */}
          <div style={{ height: 1, background: 'var(--color-border, rgba(255,255,255,0.04))', margin: '12px 0' }} />

          {/* Library Header (Only when expanded) */}
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '4px 12px', color: 'var(--color-text-dim, rgba(255,255,255,0.65))', marginBottom: 8, overflow: 'hidden' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20 }}>
                  {Icons.library}
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Your Library</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Playlists List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto', flex: 1, paddingRight: 4 }} className="hide-scrollbar">
            {/* Liked Songs Entry */}
            <motion.div
              onClick={() => {
                onNavigate({ page: 'favorites' });
                setSidebarOpen(false);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: isExpanded ? '6px 10px' : '0',
                justifyContent: isExpanded ? 'flex-start' : 'center',
                height: 48,
                borderRadius: 12,
                cursor: 'pointer',
                color: activePage.page === 'favorites' ? 'var(--color-text, #fff)' : 'var(--color-text-dim, rgba(255,255,255,0.65))',
                background: activePage.page === 'favorites' ? 'var(--color-hover, rgba(255,255,255,0.03))' : 'transparent',
                transition: 'background 0.2s',
              }}
              whileHover={{ background: 'var(--color-hover, rgba(255,255,255,0.03))', color: 'var(--color-text, #fff)' }}
              whileTap={{ scale: 0.98 }}
            >
              <div style={{
                width: isExpanded ? 32 : 28,
                height: isExpanded ? 32 : 28,
                borderRadius: 6,
                background: 'var(--color-primary, #6366f1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--color-text)" stroke="none"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
              </div>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10, transition: { duration: 0.1 } }}
                    style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', whiteSpace: 'nowrap' }}
                  >
                    <span style={{ fontSize: 14, fontWeight: 500, textOverflow: 'ellipsis', overflow: 'hidden' }}>Liked Songs</span>
                    <span style={{ fontSize: 11, color: 'var(--color-text-faint, rgba(255,255,255,0.45))' }}>Playlist • {favoriteCount} songs</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* 本地音乐入口 */}
            <motion.div
              onClick={() => {
                onNavigate({ page: 'local-library' });
                setSidebarOpen(false);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: isExpanded ? '6px 10px' : '0',
                justifyContent: isExpanded ? 'flex-start' : 'center',
                height: 48,
                borderRadius: 12,
                cursor: 'pointer',
                color: activePage.page === 'local-library' ? 'var(--color-text, #fff)' : 'var(--color-text-dim, rgba(255,255,255,0.65))',
                background: activePage.page === 'local-library' ? 'var(--color-hover, rgba(255,255,255,0.03))' : 'transparent',
                transition: 'background 0.2s',
              }}
              whileHover={{ background: 'var(--color-hover, rgba(255,255,255,0.03))', color: 'var(--color-text, #fff)' }}
              whileTap={{ scale: 0.98 }}
            >
              <div style={{
                width: isExpanded ? 32 : 28,
                height: isExpanded ? 32 : 28,
                borderRadius: 6,
                background: 'var(--color-accent, #8b5cf6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18V5l12-2v13" />
                  <circle cx="6" cy="18" r="3" />
                  <circle cx="18" cy="16" r="3" />
                </svg>
              </div>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10, transition: { duration: 0.1 } }}
                    style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', whiteSpace: 'nowrap' }}
                  >
                    <span style={{ fontSize: 14, fontWeight: 500, textOverflow: 'ellipsis', overflow: 'hidden' }}>本地音乐</span>
                    <span style={{ fontSize: 11, color: 'var(--color-text-faint, rgba(255,255,255,0.45))' }}>Library • {localLibraryCount} songs</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {recommendations.map(playlist => (
              <motion.div
                key={playlist.id}
                onClick={() => {
                  onNavigate({ page: 'playlist', id: playlist.id, source: playlist.source });
                  setSidebarOpen(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: isExpanded ? '6px 10px' : '0',
                  justifyContent: isExpanded ? 'flex-start' : 'center',
                  height: 48,
                  borderRadius: 12,
                  cursor: 'pointer',
                  color: activePage.page === 'playlist' && activePage.id === playlist.id ? 'var(--color-text, #fff)' : 'var(--color-text-dim, rgba(255,255,255,0.65))',
                  background: activePage.page === 'playlist' && activePage.id === playlist.id ? 'var(--color-hover, rgba(255,255,255,0.03))' : 'transparent',
                  transition: 'background 0.2s',
                }}
                whileHover={{ background: 'var(--color-hover, rgba(255,255,255,0.03))', color: 'var(--color-text, #fff)' }}
                whileTap={{ scale: 0.98 }}
              >
                <img
                  src={playlist.cover ? api.getProxyImageUrl(playlist.cover) : api.getProxiedCoverUrl(playlist.id, playlist.source || 'netease', 80)}
                  alt=""
                  style={{
                    width: isExpanded ? 32 : 28,
                    height: isExpanded ? 32 : 28,
                    borderRadius: 6,
                    objectFit: 'cover',
                    flexShrink: 0,
                    background: 'var(--color-img-placeholder)',
                  }}
                />
                
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10, transition: { duration: 0.1 } }}
                      style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', whiteSpace: 'nowrap' }}
                    >
                      <span style={{ fontSize: 14, fontWeight: 500, textOverflow: 'ellipsis', overflow: 'hidden' }}>{playlist.name}</span>
                      <span style={{ fontSize: 11, color: 'var(--color-text-faint, rgba(255,255,255,0.45))' }}>Playlist • {playlist.trackCount || 0} songs</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
          <style>{`.hide-scrollbar::-webkit-scrollbar { display: none; }`}</style>
        </div>

        {/* Bottom: Download entry + Collapse toggle */}
        <div style={{ padding: '20px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Download entry button */}
          <motion.button
            onClick={() => setDownloadPanelOpen(true)}
            aria-label="下载列表"
            style={{
              height: 44,
              width: isExpanded ? '100%' : 44,
              borderRadius: 12,
              border: '1px solid var(--color-border, rgba(255, 255, 255, 0.04))',
              background: 'var(--color-hover, rgba(255, 255, 255, 0.02))',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: isExpanded ? 'flex-start' : 'center',
              padding: isExpanded ? '0 12px' : 0,
              outline: 'none',
              color: 'var(--color-text-dim, rgba(255, 255, 255, 0.65))',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              position: 'relative',
            }}
            whileHover={{ color: 'var(--color-text, #fff)', background: 'var(--color-hover, rgba(255, 255, 255, 0.03))' }}
            whileTap={{ scale: 0.96 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20, position: 'relative' }}>
                {Icons.download}
                {activeDownloadCount > 0 && (
                  <motion.span
                    key={activeDownloadCount}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                    style={{
                      position: 'absolute',
                      top: -6,
                      right: -8,
                      minWidth: 16,
                      height: 16,
                      padding: '0 4px',
                      borderRadius: 9999,
                      background: 'var(--color-danger, #ef4444)',
                      color: '#fff',
                      fontSize: 10,
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      lineHeight: 1,
                      border: '2px solid var(--color-bg-elevated, #0a0a0b)',
                      boxSizing: 'border-box',
                    }}
                  >
                    {activeDownloadCount > 99 ? '99+' : activeDownloadCount}
                  </motion.span>
                )}
              </div>
              <AnimatePresence>
                {isExpanded && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: { duration: 0.1 } }}
                    style={{ fontSize: 13, fontWeight: 500 }}
                  >
                    下载列表
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          </motion.button>

          {/* Collapse toggle button */}
          <motion.button
            onClick={() => setIsExpanded(!isExpanded)}
            style={{
              height: 44,
              width: isExpanded ? '100%' : 44,
              borderRadius: 12,
              border: '1px solid var(--color-border, rgba(255, 255, 255, 0.04))',
              background: 'var(--color-hover, rgba(255, 255, 255, 0.02))',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: isExpanded ? 'flex-start' : 'center',
              padding: isExpanded ? '0 12px' : 0,
              outline: 'none',
              color: 'var(--color-text-dim, rgba(255, 255, 255, 0.65))',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
            }}
            whileHover={{ color: 'var(--color-text, #fff)', background: 'var(--color-hover, rgba(255, 255, 255, 0.03))' }}
            whileTap={{ scale: 0.96 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20 }}>
                 {isExpanded ? Icons.collapse : Icons.expand}
              </div>
              <AnimatePresence>
                {isExpanded && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: { duration: 0.1 } }}
                    style={{ fontSize: 13, fontWeight: 500 }}
                  >
                    Collapse
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          </motion.button>
        </div>
      </motion.div>
    </>
  );
}
