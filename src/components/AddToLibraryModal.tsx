import { useState } from 'react';
import { motion } from 'framer-motion';
import type { Song } from '../types/playback';
import { useCustomLibraryStore, type UserLibrary } from '../stores/customLibraryStore';
import { useToastStore } from '../stores/toastStore';
import { Modal, ModalButton } from './common/Modal';

interface AddToLibraryModalProps {
  song: Song;
  onClose: () => void;
}

// 把歌曲添加到自定义音乐库的通用选择器：
// - 列出全部音乐库，点击即添加；
// - 底部支持内联新建音乐库并添加。
// 弹窗外壳统一走 common/Modal（portal 到 body、纯色遮罩、延后开启玻璃、
// Escape 广播、焦点管理都在那里实现一次）。
export function AddToLibraryModal({ song, onClose }: AddToLibraryModalProps) {
  const libraries = useCustomLibraryStore((s) => s.libraries);
  const [name, setName] = useState('');

  const handleAdd = (lib: UserLibrary) => {
    useCustomLibraryStore.getState().addSong(lib.id, song);
    // 反馈：原来点击后弹窗直接消失，没有任何确认提示，用户无法判断是否加成功
    useToastStore.getState().showToast(`已添加到「${lib.name}」`, 'success');
    onClose();
  };

  const handleCreateAndAdd = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const id = useCustomLibraryStore.getState().createLibrary(trimmed);
    if (id) {
      useCustomLibraryStore.getState().addSong(id, song);
      useToastStore.getState().showToast(`已新建「${trimmed}」并添加 1 首`, 'success');
    }
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="添加到音乐库"
      description={`${song.name} · ${song.artist || '未知艺术家'}`}
      width={380}
      cardStyle={{ padding: 20, gap: 14 }}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <ModalButton onClick={onClose}>取消</ModalButton>
        </div>
      }
    >
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
              role="button"
              tabIndex={0}
              className="common-lib-pick-row"
              onClick={() => handleAdd(lib)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleAdd(lib);
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                padding: '10px 12px',
                borderRadius: 8,
                cursor: 'pointer',
                transition: 'background 0.15s',
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
            type="button"
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

      {/* 行 hover 反馈只写一次（原来每行都挂一对 onMouseEnter/onMouseLeave 改内联样式） */}
      <style>{`
        .common-lib-pick-row:hover { background: var(--color-surface-hover); }
        .common-lib-pick-row:focus-visible {
          outline: 2px solid var(--color-primary, #6366f1);
          outline-offset: -2px;
        }
      `}</style>
    </Modal>
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
