import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import type { Song } from '../types/playback';
import { useCustomLibraryStore, type UserLibrary } from '../stores/customLibraryStore';

interface AddToLibraryModalProps {
  song: Song;
  onClose: () => void;
}

// 把歌曲添加到自定义音乐库的通用选择器：
// - 列出全部音乐库，点击即添加；
// - 底部支持内联新建音乐库并添加。
// 通过 portal 渲染到 body，避免被宿主组件（PlayerBar 的位移动画、行 hover 等）
// 的 transform/opacity 影响 fixed 定位。
export function AddToLibraryModal({ song, onClose }: AddToLibraryModalProps) {
  const libraries = useCustomLibraryStore((s) => s.libraries);
  const [name, setName] = useState('');

  // 全局 Escape 广播（App.tsx 派发 melodix-close-popups）：关闭选择器
  useEffect(() => {
    const close = () => onClose();
    window.addEventListener('melodix-close-popups', close);
    return () => window.removeEventListener('melodix-close-popups', close);
  }, [onClose]);

  const handleAdd = (lib: UserLibrary) => {
    useCustomLibraryStore.getState().addSong(lib.id, song);
    onClose();
  };

  const handleCreateAndAdd = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const id = useCustomLibraryStore.getState().createLibrary(trimmed);
    if (id) {
      useCustomLibraryStore.getState().addSong(id, song);
    }
    onClose();
  };

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '10px 12px',
    borderRadius: 8,
    cursor: 'pointer',
    transition: 'background 0.15s',
  };

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 'var(--z-confirm)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        // 纯色遮罩替代 backdrop-filter 模糊：避免透明度动画期间逐帧整屏重采样导致卡顿
        background: 'rgba(0,0,0,0.5)',
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 380,
          maxWidth: '90%',
          background: 'var(--color-bg-elevated, rgba(30,30,30,0.92))',
          border: '1px solid var(--glass-border, rgba(255,255,255,0.1))',
          borderRadius: 16,
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          boxShadow: '0 12px 32px rgba(0,0,0,0.35)',
          color: 'var(--color-text)',
        }}
      >
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>添加到音乐库</div>
            <div
              style={{
                fontSize: 12,
                color: 'var(--color-text-dim)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {song.name} · {song.artist || '未知艺术家'}
            </div>
          </div>

          {/* 音乐库列表 */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              maxHeight: 260,
              overflowY: 'auto',
            }}
          >
            {libraries.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: '24px 12px',
                  color: 'var(--color-text-faint)',
                  fontSize: 13,
                }}
              >
                还没有自定义音乐库，先在下方新建一个
              </div>
            ) : (
              libraries.map((lib) => (
                <div
                  key={lib.id}
                  onClick={() => handleAdd(lib)}
                  style={rowStyle}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.background =
                      'var(--color-surface-hover)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.background = 'transparent';
                  }}
                >
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 500,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {lib.name}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--color-text-faint)', flexShrink: 0 }}>
                    {lib.songs.length} 首
                  </span>
                </div>
              ))
            )}
          </div>

          {/* 内联新建并添加 */}
          <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 14 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateAndAdd();
                }}
                placeholder="新建音乐库名称..."
                maxLength={40}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  background: 'var(--color-hover)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 8,
                  color: 'var(--color-text)',
                  fontSize: 13,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--glass-border)')}
                onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--color-border)')}
              />
              <button
                onClick={handleCreateAndAdd}
                disabled={!name.trim()}
                style={{
                  padding: '0 14px',
                  borderRadius: 8,
                  border: 'none',
                  background: 'var(--color-primary, #6366f1)',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: name.trim() ? 'pointer' : 'not-allowed',
                  opacity: name.trim() ? 1 : 0.6,
                  whiteSpace: 'nowrap',
                }}
              >
                创建并添加
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={onClose}
              style={{
                padding: '8px 20px',
                borderRadius: 8,
                border: '1px solid var(--color-border)',
                background: 'transparent',
                color: 'var(--color-text)',
                fontSize: 13,
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-surface-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              取消
            </button>
          </div>
        </motion.div>
    </motion.div>,
    document.body,
  );
}

// 行内悬浮按钮：点击打开 AddToLibraryModal。
// 默认透明（配合页面 .xxx-track-row:hover .cl-add-btn 的 CSS 显示规则），
// SearchPage 行自带 isHovered 状态容器，按钮直接放入即可。
export function AddToLibraryButton({ song }: { song: Song }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <motion.button
        className="cl-add-btn"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        whileHover={{ scale: 1.05, background: 'var(--glass-3)' }}
        whileTap={{ scale: 0.95 }}
        style={{
          padding: '6px 14px',
          borderRadius: 20,
          background: 'var(--glass-2)',
          border: '1px solid var(--glass-border)',
          color: 'var(--color-text, #fff)',
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
          outline: 'none',
          whiteSpace: 'nowrap',
          transition: 'opacity 0.2s',
        }}
      >
        加入音乐库
      </motion.button>
      {open && <AddToLibraryModal song={song} onClose={() => setOpen(false)} />}
    </>
  );
}
