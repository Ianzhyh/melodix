import { motion, AnimatePresence } from 'framer-motion';

export interface Comment {
  avatar?: string;
  headpic?: string;
  nick?: string;
  nickname?: string;
  time?: number;
  content?: string;
  text?: string;
  likedcount?: number;
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days > 1 ? 's' : ''} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months > 1 ? 's' : ''} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years > 1 ? 's' : ''} ago`;
}

interface CommentPanelProps {
  show: boolean;
  onClose: () => void;
  comments: Comment[];
  loading: boolean;
}

export function CommentPanel({ show, onClose, comments, loading }: CommentPanelProps) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ x: 360, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 360, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 280, damping: 28 }}
          style={{
            position: 'fixed', right: 0,
            top: 'var(--titlebar-height, 40px)',
            bottom: 'var(--player-bar-height, 88px)',
            width: 360,
            background: 'var(--glass-bg)',
            backdropFilter: 'var(--glass-blur) var(--glass-saturate)',
            WebkitBackdropFilter: 'var(--glass-blur) var(--glass-saturate)',
            borderLeft: '1px solid var(--glass-border)',
            zIndex: 'var(--z-overlay)' as any,
            display: 'flex', flexDirection: 'column',
            boxShadow: '-8px 0 40px rgba(0,0,0,0.15)',
            borderTopLeftRadius: 16,
            borderBottomLeftRadius: 16,
          }}
        >
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '20px 24px 14px', borderBottom: '1px solid var(--color-border)',
            flexShrink: 0,
          }}>
            <span style={{ fontSize: 17, fontWeight: 600, color: 'var(--color-text)', letterSpacing: 0.3 }}>Comments</span>
            <motion.button
              whileHover={{ scale: 1.1, rotate: 90 }} whileTap={{ scale: 0.9 }}
              onClick={onClose}
              style={{ background: 'var(--color-surface-hover)', border: 'none', color: 'var(--color-icon)', cursor: 'pointer', width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </motion.button>
          </div>

          {/* Comment List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '12px 20px' }}>
                {Array.from({ length: 4 }).map((_, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: 10 }}>
                    <div className="shimmer-skeleton" style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <div className="shimmer-skeleton" style={{ width: '40%', height: 14, borderRadius: 4 }} />
                        <div className="shimmer-skeleton" style={{ width: '20%', height: 11, borderRadius: 4 }} />
                      </div>
                      <div className="shimmer-skeleton" style={{ width: '90%', height: 13, borderRadius: 4, marginBottom: 4 }} />
                      <div className="shimmer-skeleton" style={{ width: '60%', height: 13, borderRadius: 4 }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : comments.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-faint)', fontSize: 14 }}>No comments yet</div>
            ) : (
              comments.map((c, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  style={{ padding: '12px 20px', borderBottom: '1px solid var(--color-border)' }}
                >
                  <div style={{ display: 'flex', gap: 10 }}>
                    <img
                      src={c.avatar || c.headpic || `https://ui-avatars.com/api/?name=${encodeURIComponent(c.nick || c.nickname || '?')}&background=random&size=80`}
                      alt=""
                      style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, objectFit: 'cover' }}
                      onError={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(c.nick || c.nickname || '?')}&background=random&size=80`; }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-dim)' }}>{c.nick || c.nickname || 'Anonymous'}</span>
                        <span style={{ fontSize: 11, color: 'var(--color-text-faint)' }}>
                          {c.time ? formatRelativeTime(typeof c.time === 'number' ? (c.time > 1e12 ? c.time : c.time * 1000) : Date.now()) : ''}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--color-text-dim)', lineHeight: 1.5, wordBreak: 'break-word' }}>{c.content || c.text || ''}</div>
                      {c.likedcount !== undefined && c.likedcount > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, color: 'var(--color-text-faint)', fontSize: 11 }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path></svg>
                          {c.likedcount}
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
