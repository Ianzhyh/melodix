import { motion, AnimatePresence, Reorder } from 'framer-motion';
import { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import type { CSSProperties } from 'react';
import { usePlaybackStore } from '../stores/playbackStore';
import { useToastStore } from '../stores/toastStore';
import { useConfigStore } from '../stores/configStore';
import { getSongCoverUrl } from '../utils/cover';

interface QueuePanelProps {
  isOpen: boolean;
  onClose: () => void;
}

// 单个队列项占用高度：padding 8*2 + 封面 40 + marginBottom 2 = 58
const ITEM_HEIGHT = 58;
const BUFFER = 10;
const VIRTUALIZATION_THRESHOLD = 50;

// 拖拽排序的单元素移动 diff：返回 [from, to]（相对位置），顺序未变或多元素变化返回 null
function diffSingleMove(oldValues: string[], newValues: string[]): [number, number] | null {
  const n = oldValues.length;
  if (n === 0 || newValues.length !== n) return null;
  let first = 0;
  while (first < n && oldValues[first] === newValues[first]) first++;
  if (first >= n) return null; // 顺序相同
  let last = n - 1;
  while (last >= 0 && oldValues[last] === newValues[last]) last--;
  // 向下移（from=first, to=last）：新区间末位是旧区间首位
  if (newValues[last] === oldValues[first]) return [first, last];
  // 向上移（from=last, to=first）：新区间首位是旧区间末位
  if (newValues[first] === oldValues[last]) return [last, first];
  return null;
}

export function QueuePanel({ isOpen, onClose }: QueuePanelProps) {
  const queue = usePlaybackStore((s) => s.queue);
  const currentIndex = usePlaybackStore((s) => s.currentIndex);
  const current = usePlaybackStore((s) => s.current);
  const isPlaying = usePlaybackStore((s) => s.isPlaying);
  const setQueueIndex = usePlaybackStore((s) => s.setQueueIndex);
  const moveQueueItem = usePlaybackStore((s) => s.moveQueueItem);
  const clearQueue = usePlaybackStore((s) => s.clearQueue);
  const { showToast } = useToastStore();
  const enableTransparency = useConfigStore((s) => s.enableTransparency);

  // Show only songs after current index
  const upNext = queue.slice(currentIndex + 1);
  // 注意：QQ 音乐图片服务器不支持 80x80 等任意尺寸（会 404），此处请求 300 由 CSS 缩小显示
  const currentCoverUrl = current ? getSongCoverUrl(current, 300) : '';

  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const shouldVirtualize = upNext.length > VIRTUALIZATION_THRESHOLD;

  // 全队列出现次序稳定键：同 id 第 k 次出现记为 `${id}#${k}`。
  // 纯重排/切歌时键保持稳定且唯一，避免整列表重挂载与拖拽中断
  const queueKeys = useMemo(() => {
    const counts = new Map<string, number>();
    return queue.map((song) => {
      const c = counts.get(song.id) ?? 0;
      counts.set(song.id, c + 1);
      return `${song.id}#${c}`;
    });
  }, [queue]);

  // Reorder 受控值：取 up-next 段的出现次序键（与 queueKeys 同源，切歌时稳定）
  const upNextValues = useMemo(
    () => queueKeys.slice(currentIndex + 1),
    [queueKeys, currentIndex]
  );

  const handleReorder = useCallback((newValues: string[]) => {
    const move = diffSingleMove(upNextValues, newValues);
    if (!move) return;
    const [from, to] = move;
    moveQueueItem(currentIndex + 1 + from, currentIndex + 1 + to);
  }, [upNextValues, moveQueueItem, currentIndex]);

  const handleScroll = useCallback(() => {
    if (scrollRef.current) {
      setScrollTop(scrollRef.current.scrollTop);
    }
  }, []);

  // 测量视口高度并监听尺寸变化（仅在虚拟化开启时）
  useEffect(() => {
    if (!isOpen || !shouldVirtualize) return;
    const el = scrollRef.current;
    if (!el) return;

    setViewportHeight(el.clientHeight);
    setScrollTop(el.scrollTop);

    const ro = new ResizeObserver(() => {
      setViewportHeight(el.clientHeight);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [shouldVirtualize, isOpen]);

  // 计算可见范围 + 上下缓冲
  const { startIndex, endIndex, offsetY, totalHeight } = useMemo(() => {
    if (!shouldVirtualize) {
      return { startIndex: 0, endIndex: upNext.length, offsetY: 0, totalHeight: 0 };
    }
    const total = upNext.length * ITEM_HEIGHT;
    const start = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - BUFFER);
    const visibleCount = Math.ceil(viewportHeight / ITEM_HEIGHT);
    const end = Math.min(upNext.length, start + visibleCount + BUFFER * 2);
    return {
      startIndex: start,
      endIndex: end,
      offsetY: start * ITEM_HEIGHT,
      totalHeight: total,
    };
  }, [shouldVirtualize, upNext.length, scrollTop, viewportHeight]);

  // 序号列：hover 行时序号隐藏、显示播放图标（对齐 PlaylistView 的 pv-track-index/pv-play-icon 模式）
  const renderIndexCol = (actualIndex: number) => (
    <div style={{ width: 22, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
      <span className="qp-index" style={{ fontSize: 12, color: 'var(--color-text-faint)' }}>{actualIndex + 1}</span>
      <span className="qp-play-icon" style={{ display: 'none', color: 'var(--color-text)' }}>
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2l10 6-10 6V2z"/></svg>
      </span>
    </div>
  );

  const rowStyle: CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
    borderRadius: 8, cursor: 'pointer', transition: 'background 0.2s',
    marginBottom: 2,
  };

  const renderRowContent = (song: typeof upNext[number], actualIndex: number) => {
    const coverUrl = getSongCoverUrl(song, 300);
    return (
      <>
        {renderIndexCol(actualIndex)}
        {coverUrl ? (
          <img
            src={coverUrl}
            alt=""
            loading="lazy"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
            style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', background: 'var(--color-bg-placeholder)', flexShrink: 0 }}
          />
        ) : (
          <div style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--color-bg-placeholder)', flexShrink: 0 }} />
        )}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{song.name}</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-faint)', marginTop: 2 }}>{song.artist}</div>
        </div>
      </>
    );
  };

  const renderItem = (
    song: typeof upNext[number],
    actualIndex: number,
    enterAnim: boolean,
    delay: number
  ) => {
    return (
      <motion.div
        key={queueKeys[actualIndex]}
        className="qp-row"
        initial={enterAnim ? { opacity: 0, x: 20 } : false}
        animate={{ opacity: 1, x: 0 }}
        transition={enterAnim ? { delay } : undefined}
        whileHover={{ background: 'var(--color-hover)' }}
        whileTap={{ scale: 0.995 }}
        onClick={() => setQueueIndex(actualIndex)}
        style={rowStyle}
      >
        {renderRowContent(song, actualIndex)}
      </motion.div>
    );
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* 背景遮罩（规格对齐 DownloadPanel） */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.4)',
              zIndex: 'var(--z-overlay)',
            }}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="播放队列"
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
              background: enableTransparency ? 'var(--acrylic-noise), var(--acrylic-tint)' : 'var(--color-bg-elevated)',
              backdropFilter: enableTransparency ? 'var(--acrylic-blur) var(--acrylic-saturate)' : 'none',
              WebkitBackdropFilter: enableTransparency ? 'var(--acrylic-blur) var(--acrylic-saturate)' : 'none',
              borderLeft: '1px solid var(--glass-border)',
              zIndex: 'var(--z-modal)',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '-8px 0 40px rgba(0,0,0,0.15)',
              borderTopLeftRadius: 16,
              borderBottomLeftRadius: 16,
            }}
          >
            <style>{`
              .qp-row:hover .qp-index { display: none !important; }
              .qp-row:hover .qp-play-icon { display: inline-flex !important; }
              .qp-reorder-item:active { cursor: grabbing; }
              .qp-track-dragging {
                background: var(--color-surface-active, rgba(128,128,128,0.08)) !important;
                box-shadow: 0 8px 24px rgba(0,0,0,0.12), 0 0 0 1px var(--color-border, rgba(128,128,128,0.1)) !important;
                z-index: 10 !important;
                cursor: grabbing !important;
                border-radius: 8px !important;
              }
            `}</style>
            {/* Header */}
            <div style={{
              padding: '20px 24px 14px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              borderBottom: '1px solid var(--color-border)',
              flexShrink: 0,
            }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: 'var(--color-text)', letterSpacing: 0.3 }}>播放队列</h2>
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
                    清空
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
                <div style={{ fontSize: 10, color: 'var(--color-text-faint)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 600 }}>正在播放</div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px',
                  borderRadius: 8, background: 'var(--color-surface-hover)',
                  border: '1px solid var(--color-border)',
                }}>
                  {/* 当前播放标记：播放中显示暂停态图标，暂停显示播放态（对齐 PlaylistView） */}
                  <span style={{ color: 'var(--color-primary)', display: 'inline-flex', flexShrink: 0 }}>
                    {isPlaying ? (
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="2" width="3" height="12" rx="0.5"/><rect x="10" y="2" width="3" height="12" rx="0.5"/></svg>
                    ) : (
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2l10 6-10 6V2z"/></svg>
                    )}
                  </span>
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
                    <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-primary)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{current.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-faint)', marginTop: 2 }}>{current.artist}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Up Next List */}
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              style={{ flex: 1, padding: '8px 12px', overflowY: 'auto', overflowX: 'hidden' }}
            >
              {upNext.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-text-faint)', fontSize: 14 }}>
                  队列为空
                </div>
              ) : shouldVirtualize ? (
                // 超长队列走虚拟化渲染（不支持拖拽，保证滚动性能）
                <div style={{ height: totalHeight, position: 'relative' }}>
                  <div style={{ position: 'absolute', top: offsetY, left: 0, right: 0 }}>
                    {upNext.slice(startIndex, endIndex).map((song, i) => {
                      const actualIndex = currentIndex + 1 + startIndex + i;
                      return renderItem(song, actualIndex, false, 0);
                    })}
                  </div>
                </div>
              ) : (
                <Reorder.Group
                  axis="y"
                  values={upNextValues}
                  onReorder={handleReorder}
                  as="div"
                  style={{ margin: 0, padding: 0 }}
                >
                  {upNext.map((song, i) => {
                    const actualIndex = currentIndex + 1 + i;
                    return (
                      <Reorder.Item
                        key={upNextValues[i]}
                        value={upNextValues[i]}
                        layout
                        className={`qp-row qp-reorder-item ${draggingId === upNextValues[i] ? 'qp-track-dragging' : ''}`}
                        dragElastic={0}
                        dragMomentum={false}
                        dragTransition={{ bounceStiffness: 600, bounceDamping: 40 }}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.03, layout: { duration: 0.15 } }}
                        whileHover={{ background: 'var(--color-hover)' }}
                        whileTap={{ scale: 0.995 }}
                        onDragStart={() => setDraggingId(upNextValues[i])}
                        onDragEnd={() => setDraggingId(null)}
                        onClick={() => setQueueIndex(actualIndex)}
                        style={{ ...rowStyle, cursor: 'grab', position: 'relative' }}
                      >
                        {renderRowContent(song, actualIndex)}
                      </Reorder.Item>
                    );
                  })}
                </Reorder.Group>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
