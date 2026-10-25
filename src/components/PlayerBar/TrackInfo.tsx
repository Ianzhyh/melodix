import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import type { Song } from '../../types/playback';
import { getSongCoverUrl } from '../../utils/cover';
import { AddToLibraryModal } from '../AddToLibraryModal';
import { useConfigStore } from '../../stores/configStore';

/** 更多菜单宽度（用于视口内左右钳制） */
const MENU_WIDTH = 180;

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
  onOpenArtist: (id: string, name: string) => void;
  onDownload: () => void;
  onCopySongName: () => void;
  radioMode: boolean;
  onToggleRadio: () => void;
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
  onOpenArtist,
  onDownload,
  onCopySongName,
  radioMode,
  onToggleRadio,
}) => {
  // 「添加到音乐库」选择器状态：仅由更多菜单的 Add to Library 项打开，
  // 关闭后自然复位（下一次打开时初始为 false）
  const [libraryPickerOpen, setLibraryPickerOpen] = useState(false);
  const enableTransparency = useConfigStore(s => s.enableTransparency);

  // 更多菜单用 portal 渲染，需要自己算锚点位置（按钮上方、视口内钳制）。
  // 注意：这些 hook 必须在下面的 `if (!song) return` 之前，否则违反 hooks 规则。
  const moreBtnRef = useRef<HTMLDivElement | null>(null);
  // 位置在「打开」的那一刻由按钮实测得到；用 state 保存以便窗口 resize 时重算。
  // 用 bottom 而非 top 锚定：菜单高度未知，bottom 锚定天然实现"向上展开"，
  // 且不会与 framer-motion 的 animate(y) 写内联 transform 冲突。
  const [moreMenuPos, setMoreMenuPos] = useState<{ left: number; bottom: number } | null>(null);

  const measureMoreMenu = useCallback(() => {
    const el = moreBtnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // 直接算「菜单底边贴按钮上沿」所需的 top 偏移没用——菜单高度要等渲染后才知道，
    // 而 framer-motion 的 animate(y) 会覆盖 CSS transform。改用 bottom 锚定：
    // 菜单底边 = 视口高 - 按钮上沿 + 8px 间距，这样无需知道菜单高度，也不会和 motion 冲突。
    setMoreMenuPos({ left: r.left, bottom: window.innerHeight - r.top + 8 });
  }, []);

  // 打开时立即测量；关闭时清空。
  // 关键：菜单的渲染条件**不能**依赖 moreMenuPos——它在点击后的首帧还是 null，
  // 若用 `showMoreMenu && moreMenuPos` 作为条件，首帧不渲染菜单、effect 也拿不到
  // 测量结果（按钮本身是另一个元素，ref 仍然有效），会出现"点了完全没反应"。
  // 因此：条件只看 showMoreMenu，位置未就绪时先隐藏（opacity 0），下一帧再显示。
  useLayoutEffect(() => {
    if (!showMoreMenu) {
      setMoreMenuPos(null);
      return;
    }
    measureMoreMenu();
    window.addEventListener('resize', measureMoreMenu);
    return () => window.removeEventListener('resize', measureMoreMenu);
  }, [showMoreMenu, measureMoreMenu]);

  const coverUrl = song ? getSongCoverUrl(song, 300) : '';

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
    <>
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: '1 1 0', minWidth: 180, overflow: 'hidden' }}>
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
                  src={coverUrl}
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
              <motion.span layoutId="track-artist" style={{ fontSize: 12, opacity: 0.6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} transition={{ type: 'spring', stiffness: 300, damping: 25 }}>
                {song.artists && song.artists.length > 0 && song.artists[0].id ? (
                  <span
                    className="md-text-link"
                    title={`查看歌手: ${song.artists[0].name}`}
                    onClick={(e) => { e.stopPropagation(); onOpenArtist(song.artists![0].id, song.artists![0].name); }}
                  >
                    {song.artist}
                  </span>
                ) : song.artist}
              </motion.span>
            </div>
          </motion.div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, color: 'var(--color-icon)', marginLeft: lyricsOpen ? 16 : 8 }}>
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={onToggleFavorite}
            aria-label={isFavorited ? '取消收藏' : '收藏'}
            style={{ background: 'none', border: 'none', color: isFavorited ? 'var(--color-danger)' : 'inherit', cursor: 'pointer', padding: 0 }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill={isFavorited ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
          </motion.button>
          <motion.button whileHover={{ scale: 1.1, color: 'var(--color-text)' }} whileTap={{ scale: 0.9 }} onClick={onToggleComments} aria-label="评论" style={{ background: 'none', border: 'none', color: showComments ? 'var(--color-primary, #6366f1)' : 'inherit', cursor: 'pointer', padding: 0 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
          </motion.button>
          <div ref={moreBtnRef} style={{ position: 'relative' }}>
            <motion.button whileHover={{ scale: 1.1, color: 'var(--color-text)' }} whileTap={{ scale: 0.9 }} onClick={onToggleMoreMenu} aria-label="更多操作" style={{ background: 'none', border: 'none', color: showMoreMenu ? 'var(--color-primary, #6366f1)' : 'inherit', cursor: 'pointer', padding: 0 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg>
            </motion.button>
            {/* 用 portal 渲染到 body：菜单向上展开会超出播放栏上沿，
                而 TrackInfo 根节点与 App 布局层都是 overflow:hidden，就地渲染会被裁掉
                （实测菜单 y 648–836 被裁到只剩 833 以下的 3px，elementFromPoint 命不中，
                所以"更多"点了像没反应）。portal + fixed 定位可彻底绕开祖先裁剪。

                注意：这里**不能**把 createPortal 放进 AnimatePresence 的直接子节点位
                （`{show && createPortal(...)}`）——AnimatePresence 直接子节点必须是
                motion 组件或带 key 的元素，portal 包一层后它识别不到，实测整个菜单不渲染。
                改成：portal 放在 AnimatePresence 外层，内部再包 AnimatePresence 处理动效。 */}
            {createPortal(
              <AnimatePresence>
                {showMoreMenu && (
                  <>
                    <div onClick={onCloseMoreMenu} style={{ position: 'fixed', inset: 0, zIndex: 'var(--z-overlay)' }} />
                    <motion.div
                      key="more-menu"
                      initial={{ opacity: 0, y: 8, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                      style={{
                        position: 'fixed',
                        // bottom 锚定（向上展开），位置未就绪时先隐藏，下一帧再显示。
                        ...(moreMenuPos
                          ? {
                              left: Math.max(8, Math.min(moreMenuPos.left, window.innerWidth - MENU_WIDTH - 8)),
                              bottom: moreMenuPos.bottom,
                              visibility: 'visible' as const,
                            }
                          : { left: 0, bottom: 0, visibility: 'hidden' as const }),
                        background: enableTransparency ? 'var(--acrylic-noise), var(--acrylic-tint)' : 'var(--color-bg-elevated)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 8, padding: 4, minWidth: MENU_WIDTH,
                        backdropFilter: enableTransparency ? 'var(--acrylic-blur) var(--acrylic-saturate)' : 'none',
                        WebkitBackdropFilter: enableTransparency ? 'var(--acrylic-blur) var(--acrylic-saturate)' : 'none',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                        zIndex: 'var(--z-modal)',
                      }}
                    >
                    {[
                      { label: 'Add to Queue', action: () => { onCloseMoreMenu(); onAddToQueue(); } },
                      { label: 'Add to Library', action: () => { onCloseMoreMenu(); setLibraryPickerOpen(true); } },
                      { label: radioMode ? '✓ 相似歌曲电台' : '相似歌曲电台', action: () => { onCloseMoreMenu(); onToggleRadio(); } },
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
              </AnimatePresence>,
              document.body,
            )}
          </div>
        </div>
      </div>
    </div>

    {libraryPickerOpen && song && (
      <AddToLibraryModal song={song} onClose={() => setLibraryPickerOpen(false)} />
    )}
    </>
  );
};
