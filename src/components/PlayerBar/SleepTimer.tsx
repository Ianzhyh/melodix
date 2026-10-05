import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSleepTimerStore } from '../../stores/sleepTimerStore';
import { usePlaybackStore } from '../../stores/playbackStore';
import { useToastStore } from '../../stores/toastStore';
import { useConfigStore } from '../../stores/configStore';

const TIME_OPTIONS = [15, 30, 45, 60, 90];

function formatRemaining(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export function SleepTimerButton() {
  const { active, endsAt, startTimeTimer, startSongEndTimer, cancelTimer } = useSleepTimerStore();
  const current = usePlaybackStore((s) => s.current);
  const showToast = useToastStore((s) => s.showToast);
  const enableTransparency = useConfigStore((s) => s.enableTransparency);
  const [menuOpen, setMenuOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const containerRef = useRef<HTMLDivElement | null>(null);

  // 定时模式：每秒刷新剩余时间显示
  useEffect(() => {
    if (active !== 'time') return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);

  // 全局 Escape 广播关闭菜单（与 App 的 melodix-close-popups 机制一致）
  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    window.addEventListener('melodix-close-popups', close);
    return () => window.removeEventListener('melodix-close-popups', close);
  }, [menuOpen]);

  // 外点关闭
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const remaining = active === 'time' && endsAt ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : 0;

  const handleSongEnd = () => {
    setMenuOpen(false);
    if (!current) {
      showToast('当前没有正在播放的歌曲', 'info');
      return;
    }
    startSongEndTimer();
  };

  const menuItemStyle = (danger = false): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 13,
    color: danger ? 'var(--color-danger)' : 'var(--color-text-dim)',
    transition: 'background 0.15s',
  });

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <motion.button
        whileHover={{ scale: 1.1, color: active !== 'off' ? 'var(--color-primary)' : 'var(--color-text)' }}
        whileTap={{ scale: 0.9 }}
        onClick={() => setMenuOpen((v) => !v)}
        aria-label="睡眠定时"
        title="睡眠定时"
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          color: active !== 'off' ? 'var(--color-primary, #6366f1)' : 'var(--color-icon)',
        }}
      >
        {active === 'time' ? (
          <span style={{ fontSize: 11, fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
            {formatRemaining(remaining)}
          </span>
        ) : active === 'songEnd' ? (
          <span style={{ fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>本曲</span>
        ) : (
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        )}
      </motion.button>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            style={{
              position: 'absolute',
              bottom: '100%',
              right: 0,
              marginBottom: 8,
              minWidth: 200,
              background: enableTransparency ? 'var(--acrylic-noise), var(--acrylic-tint)' : 'var(--color-bg-elevated)',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              padding: 4,
              backdropFilter: enableTransparency ? 'var(--acrylic-blur) var(--acrylic-saturate)' : 'none',
              WebkitBackdropFilter: enableTransparency ? 'var(--acrylic-blur) var(--acrylic-saturate)' : 'none',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              zIndex: 'var(--z-modal)',
            }}
          >
            <div style={{ padding: '6px 12px 4px', fontSize: 11, fontWeight: 600, color: 'var(--color-text-faint)', letterSpacing: '0.6px', textTransform: 'uppercase' }}>
              睡眠定时
            </div>

            <div
              onClick={handleSongEnd}
              style={menuItemStyle()}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--color-surface-hover)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
            >
              <span>播完当前歌曲</span>
              {active === 'songEnd' && (
                <span style={{ fontSize: 11, color: 'var(--color-primary)' }}>✓</span>
              )}
            </div>

            <div style={{ height: 1, background: 'var(--color-border)', margin: '4px 8px' }} />

            {TIME_OPTIONS.map((m) => (
              <div
                key={m}
                onClick={() => { setMenuOpen(false); startTimeTimer(m); }}
                style={menuItemStyle()}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--color-surface-hover)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
              >
                <span>{m} 分钟后停止</span>
              </div>
            ))}

            {active !== 'off' && (
              <>
                <div style={{ height: 1, background: 'var(--color-border)', margin: '4px 8px' }} />
                <div
                  onClick={() => { setMenuOpen(false); cancelTimer(); }}
                  style={menuItemStyle(true)}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--color-surface-hover)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
                >
                  取消定时
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
