import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Song {
  name: string;
  artist: string;
  coverUrl: string;
  id: string;
}

interface TrackInfoProps {
  song: Song | null;
  isFavorited: boolean;
  onToggleFavorite: () => void;
  onCoverClick: () => void;
  lyricsOpen: boolean;
  showComments: boolean;
  onToggleComments: () => void;
  showMoreMenu: boolean;
  onToggleMoreMenu: () => void;
  onCloseMoreMenu: () => void;
  onAddToQueue: () => void;
  onDownload: () => void;
  onCopySongName: () => void;
}

export const TrackInfo: React.FC<TrackInfoProps> = ({
  song,
  isFavorited,
  onToggleFavorite,
  onCoverClick,
  lyricsOpen,
  showComments,
  onToggleComments,
  showMoreMenu,
  onToggleMoreMenu,
  onCloseMoreMenu,
  onAddToQueue,
  onDownload,
  onCopySongName,
}) => {
  if (!song) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, height: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, color: 'var(--color-icon)', marginLeft: 8 }}>
            <motion.button whileHover={{ scale: 1.1, color: 'var(--color-danger)' }} whileTap={{ scale: 0.9 }} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
            </motion.button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, height: '100%' }}>
        {!lyricsOpen && (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            style={{ display: 'flex', alignItems: 'center', gap: 12 }}
          >
            <motion.div
              layoutId="album-cover"
              style={{ width: 48, height: 48, borderRadius: 8, overflow: 'hidden', cursor: 'pointer', position: 'relative' }}
              onClick={onCoverClick}
              title="展开播放页"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            >
              <AnimatePresence mode="popLayout">
                <motion.img
                  key={song.id}
                  src={song.coverUrl}
                  alt={song.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                />
              </AnimatePresence>
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.2s' }} className="cover-hover-overlay">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-text)" strokeWidth="2"><polyline points="6 15 12 9 18 15" /></svg>
              </div>
            </motion.div>
            <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 150 }}>
              <motion.span layoutId="track-title" style={{ fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} transition={{ type: 'spring', stiffness: 300, damping: 25 }}>{song.name}</motion.span>
              <motion.span layoutId="track-artist" style={{ fontSize: 12, opacity: 0.6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} transition={{ type: 'spring', stiffness: 300, damping: 25 }}>{song.artist}</motion.span>
            </div>
          </motion.div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, color: 'var(--color-icon)', marginLeft: lyricsOpen ? 16 : 8 }}>
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={onToggleFavorite}
            style={{ background: 'none', border: 'none', color: isFavorited ? 'var(--color-danger)' : 'inherit', cursor: 'pointer', padding: 0 }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill={isFavorited ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
          </motion.button>
          <motion.button whileHover={{ scale: 1.1, color: 'var(--color-text)' }} whileTap={{ scale: 0.9 }} onClick={onToggleComments} style={{ background: 'none', border: 'none', color: showComments ? 'var(--color-primary, #6366f1)' : 'inherit', cursor: 'pointer', padding: 0 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
          </motion.button>
          <div style={{ position: 'relative' }}>
            <motion.button whileHover={{ scale: 1.1, color: 'var(--color-text)' }} whileTap={{ scale: 0.9 }} onClick={onToggleMoreMenu} style={{ background: 'none', border: 'none', color: showMoreMenu ? 'var(--color-primary, #6366f1)' : 'inherit', cursor: 'pointer', padding: 0 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg>
            </motion.button>
            <AnimatePresence>
              {showMoreMenu && (
                <>
                  <div onClick={onCloseMoreMenu} style={{ position: 'fixed', inset: 0, zIndex: 'var(--z-overlay)' }} />
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    style={{
                      position: 'absolute', bottom: '100%', left: 0, marginBottom: 8,
                      background: 'var(--color-bg-elevated)',
                      border: '1px solid var(--glass-border)',
                      borderRadius: 8, padding: 4, minWidth: 180,
                      backdropFilter: 'blur(40px)',
                      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                      zIndex: 'var(--z-modal)',
                    }}
                  >
                    {[
                      { label: 'Add to Queue', action: () => { onCloseMoreMenu(); onAddToQueue(); } },
                      { label: 'Download', action: () => { onCloseMoreMenu(); onDownload(); } },
                      { label: 'Copy Song Name', action: () => { onCloseMoreMenu(); onCopySongName(); } },
                    ].map(item => (
                      <div
                        key={item.label}
                        onClick={item.action}
                        style={{
                          padding: '8px 12px', borderRadius: 6, cursor: 'pointer',
                          fontSize: 13, color: 'var(--color-text-dim)',
                          transition: 'background 0.15s',
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--color-surface-hover)'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
                      >
                        {item.label}
                      </div>
                    ))}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
};
