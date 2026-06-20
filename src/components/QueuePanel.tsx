import { motion, AnimatePresence } from 'framer-motion';
import { usePlaybackStore } from '../stores/playbackStore';
import { useToastStore } from '../stores/toastStore';
import { getSongCoverUrl } from '../utils/cover';

interface QueuePanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function QueuePanel({ isOpen, onClose }: QueuePanelProps) {
  const queue = usePlaybackStore((s) => s.queue);
  const currentIndex = usePlaybackStore((s) => s.currentIndex);
  const current = usePlaybackStore((s) => s.current);
  const setQueueIndex = usePlaybackStore((s) => s.setQueueIndex);
  const clearQueue = usePlaybackStore((s) => s.clearQueue);
  const { showToast } = useToastStore();

  // Show only songs after current index
  const upNext = queue.slice(currentIndex + 1);
  const currentCoverUrl = current ? getSongCoverUrl(current, 80) : '';

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 260 }}
          style={{
            position: 'fixed',
            top: 'var(--titlebar-height, 40px)',
            right: 0,
            bottom: 'var(--player-bar-height, 88px)',
            width: 340,
            background: 'var(--glass-bg)',
            backdropFilter: 'var(--glass-blur) var(--glass-saturate)',
            WebkitBackdropFilter: 'var(--glass-blur) var(--glass-saturate)',
            borderLeft: '1px solid var(--glass-border)',
            zIndex: 'var(--z-modal)',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '-8px 0 40px rgba(0,0,0,0.15)',
            borderTopLeftRadius: 16,
            borderBottomLeftRadius: 16,
          }}
        >
          {/* Header */}
          <div style={{
            padding: '20px 24px 14px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            borderBottom: '1px solid var(--color-border)',
            flexShrink: 0,
          }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: 'var(--color-text)', letterSpacing: 0.3 }}>Up Next</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {upNext.length > 0 && (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    clearQueue();
                    showToast('已清空播放列表', 'info');
                  }}
                  style={{
                    background: 'var(--color-surface-hover)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text-faint)',
                    cursor: 'pointer', fontSize: 12, padding: '5px 12px',
                    borderRadius: 8, transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text)'; e.currentTarget.style.background = 'var(--color-surface-active)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-faint)'; e.currentTarget.style.background = 'var(--color-surface-hover)'; }}
                >
                  Clear
                </motion.button>
              )}
              <motion.button
                whileHover={{ scale: 1.1, rotate: 90 }}
                whileTap={{ scale: 0.9 }}
                onClick={onClose}
                style={{ background: 'var(--color-surface-hover)', border: 'none', color: 'var(--color-icon)', cursor: 'pointer', width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </motion.button>
            </div>
          </div>

          {/* Now Playing */}
          {current && (
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
              <div style={{ fontSize: 10, color: 'var(--color-text-faint)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 600 }}>Now Playing</div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px',
                borderRadius: 10, background: 'var(--color-surface-hover)',
                border: '1px solid var(--color-border)',
              }}>
                {currentCoverUrl ? (
                  <img
                    src={currentCoverUrl}
                    alt=""
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    style={{ width: 42, height: 42, borderRadius: 8, objectFit: 'cover', background: 'var(--color-bg-placeholder)' }}
                  />
                ) : (
                  <div style={{ width: 42, height: 42, borderRadius: 8, background: 'var(--color-bg-placeholder)' }} />
                )}
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{current.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-faint)', marginTop: 2 }}>{current.artist}</div>
                </div>
              </div>
            </div>
          )}

          {/* Up Next List */}
          <div style={{ flex: 1, padding: '8px 12px', overflowY: 'auto', overflowX: 'hidden' }}>
            {upNext.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-text-faint)', fontSize: 14 }}>
                Queue is empty
              </div>
            ) : (
              upNext.map((song, i) => {
                const actualIndex = currentIndex + 1 + i;
                const coverUrl = getSongCoverUrl(song, 80);
                return (
                  <motion.div
                    key={`${song.id}-${actualIndex}`}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                    whileHover={{ background: 'var(--color-surface-hover)' }}
                    onClick={() => setQueueIndex(actualIndex)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px',
                      borderRadius: 10, cursor: 'pointer', transition: 'background 0.2s',
                      marginBottom: 2,
                    }}
                  >
                    {coverUrl ? (
                      <img
                        src={coverUrl}
                        alt=""
                        loading="lazy"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', background: 'var(--color-bg-placeholder)' }}
                      />
                    ) : (
                      <div style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--color-bg-placeholder)' }} />
                    )}
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{song.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--color-text-faint)', marginTop: 2 }}>{song.artist}</div>
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
