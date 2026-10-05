import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useHistoryStore } from '../stores/historyStore';
import { usePlaybackStore } from '../stores/playbackStore';
import { useToastStore } from '../stores/toastStore';
import { AddToLibraryButton } from './AddToLibraryModal';
import { TrackList, TrackListHeader } from './common/TrackList';
import { TrackRow } from './common/TrackRow';
import { useSongEnrichment } from '../hooks/useSongEnrichment';
import type { RouteState, Song } from '../types/playback';

const PAGE_SIZE = 50;

type SortMode = 'recent' | 'frequent';

/** 相对时间：刚刚 / N 分钟前 / N 小时前 / N 天前 / 具体日期 */
function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000;
  if (diff < MIN) return '刚刚';
  if (diff < HOUR) return `${Math.floor(diff / MIN)} 分钟前`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} 小时前`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)} 天前`;
  return new Date(ts).toLocaleDateString('zh-CN');
}



function pagerBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    background: 'none',
    border: '1px solid var(--color-border, rgba(255,255,255,0.1))',
    color: disabled ? 'var(--color-text-faint, rgba(255,255,255,0.3))' : 'var(--color-text, rgba(255,255,255,0.9))',
    padding: '6px 14px',
    borderRadius: 6,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 13,
    transition: 'background 0.15s',
  };
}

export function HistoryPage({ onNavigate }: { onNavigate: (route: RouteState) => void }) {
  const entries = useHistoryStore((s) => s.entries);
  const clearHistory = useHistoryStore((s) => s.clearHistory);
  const setQueue = usePlaybackStore((s) => s.setQueue);
  const current = usePlaybackStore((s) => s.current);
  const isPlaying = usePlaybackStore((s) => s.isPlaying);
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [page, setPage] = useState(1);

  const handleOpenArtist = useCallback((song: Song) => {
    const a = song.artists && song.artists.length > 0 ? song.artists[0] : null;
    if (!a || !a.id) return;
    onNavigate({ page: 'artist', id: a.id, source: song.source || 'tencent', name: a.name });
  }, [onNavigate]);

  // 切换排序方式后回到第一页，避免页码停留在越界位置
  const handleSortChange = useCallback((mode: SortMode) => {
    setSortMode(mode);
    setPage(1);
  }, []);

  const total = entries.length;
  const totalPlays = useMemo(() => entries.reduce((sum, e) => sum + e.playCount, 0), [entries]);

  // 排序：recent = 最近播放在前（entries 本身顺序）；frequent = 播放次数优先
  const sortedEntries = useMemo(() => {
    if (sortMode === 'frequent') {
      return [...entries].sort((a, b) => b.playCount - a.playCount || b.lastPlayedAt - a.lastPlayedAt);
    }
    return entries;
  }, [entries, sortMode]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const pageStartIndex = (currentPage - 1) * PAGE_SIZE;

  // 页码越界时回正（例如删除条目后总页数减少）
  useEffect(() => {
    if (page !== currentPage) setPage(currentPage);
  }, [page, currentPage]);

  const pageEntries = total === 0 ? [] : sortedEntries.slice(pageStartIndex, pageStartIndex + PAGE_SIZE);

  // 老数据补全：为缺失 albumId/artists 的在线歌曲静默拉取元信息并写回存储
  useSongEnrichment(pageEntries.map((e) => e.song), (songId, patch) => {
    useHistoryStore.getState().patchSong(songId, patch);
  });

  // 播放时以当前排序构建队列，保证列表顺序与队列顺序一致
  const handlePlay = useCallback((index: number) => {
    setQueue(sortedEntries.map((e) => e.song), index);
  }, [setQueue, sortedEntries]);

  const handleClear = useCallback(() => {
    clearHistory();
    useToastStore.getState().showToast('已清空播放历史', 'success');
  }, [clearHistory]);

  return (
    <div style={{ padding: 'clamp(20px, 3vw, 40px)', maxWidth: 1200, margin: '0 auto' }}>
      <style>{`
        .hp-track-row:hover .hp-track-index {
          display: none !important;
        }
        .hp-track-row:hover .hp-play-icon {
          display: inline-flex !important;
        }
        .hp-track-row .cl-add-btn {
          opacity: 0;
          pointer-events: none;
        }
        .hp-track-row:hover .cl-add-btn {
          opacity: 1;
          pointer-events: auto;
        }
        .hp-pager-btn:hover:not(:disabled) {
          background: var(--color-hover, rgba(255,255,255,0.06)) !important;
        }
        .hp-sort-btn {
          background: none;
          border: 1px solid var(--color-border, rgba(255,255,255,0.1));
          color: var(--color-text-dim, rgba(255,255,255,0.65));
          padding: 5px 14px;
          border-radius: 999px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 500;
          transition: all 0.15s;
        }
        .hp-sort-btn.active {
          background: var(--color-primary-10, rgba(99,102,241,0.1));
          border-color: var(--color-primary, #6366f1);
          color: var(--color-primary, #6366f1);
        }
        .hp-sort-btn:not(.active):hover {
          background: var(--color-hover, rgba(255,255,255,0.06));
        }
        .hp-clear-btn {
          background: none;
          border: 1px solid var(--color-border, rgba(255,255,255,0.1));
          color: var(--color-text-dim, rgba(255,255,255,0.65));
          padding: 5px 14px;
          border-radius: 999px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 500;
          transition: all 0.15s;
        }
        .hp-clear-btn:hover {
          border-color: var(--color-danger, #ef4444);
          color: var(--color-danger, #ef4444);
        }
      `}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <div style={{
          width: 56,
          height: 56,
          borderRadius: 12,
          background: 'var(--color-success, #10b981)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>最近播放</h1>
          <p style={{ fontSize: 14, color: 'var(--color-text-dim, rgba(255,255,255,0.65))', margin: '4px 0 0' }}>
            {total > 0 ? `${total} 首 • 累计播放 ${totalPlays} 次` : '记录你播放过的歌曲'}
          </p>
        </div>
        {total > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <button
              className={`hp-sort-btn ${sortMode === 'recent' ? 'active' : ''}`}
              onClick={() => handleSortChange('recent')}
            >
              最近播放
            </button>
            <button
              className={`hp-sort-btn ${sortMode === 'frequent' ? 'active' : ''}`}
              onClick={() => handleSortChange('frequent')}
            >
              最常播放
            </button>
            <button className="hp-clear-btn" onClick={handleClear}>清空</button>
          </div>
        )}
      </div>
      {total === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--color-text-faint, rgba(255,255,255,0.45))' }}>
          <p style={{ fontSize: 16 }}>还没有播放记录</p>
          <p style={{ fontSize: 13, marginTop: 8 }}>播放过的歌曲会自动记录在这里，重启应用也不会丢失</p>
        </div>
      ) : (
        <>
        <TrackList showCover={true} actionWidth="120px" albumWidth="100px">
          <TrackListHeader 
            showCover={true} 
            albumContent={<>播放次数</>}
            durationContent={<>播放时间</>}
          />
          <motion.div
            variants={{ show: { transition: { staggerChildren: 0.03 } } }}
            initial="hidden"
            animate="show"
            style={{ display: 'flex', flexDirection: 'column', gap: 2 }}
          >
            {pageEntries.map((entry, i) => {
              const globalIndex = pageStartIndex + i;
              return (
                <motion.div
                  key={entry.song.id}
                  variants={{
                    hidden: { opacity: 0, y: 10 },
                    show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } }
                  }}
                  layout="position"
                >
                  <TrackRow
                    song={entry.song}
                    index={globalIndex}
                    displayIndex={globalIndex + 1}
                    isCurrent={current?.id === entry.song.id}
                    isPlaying={isPlaying}
                    selectMode={false}
                    selected={false}
                    onToggleSelect={() => {}}
                    onPlay={() => handlePlay(globalIndex)}
                    onOpenArtist={handleOpenArtist as any}
                    showCover={true}
                    albumContent={
                      <span title={`累计播放 ${entry.playCount} 次`} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7 }}>
                          <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                        </svg>
                        {entry.playCount} 次
                      </span>
                    }
                    durationContent={<span>{formatRelativeTime(entry.lastPlayedAt)}</span>}
                    renderAction={() => <AddToLibraryButton song={entry.song} />}
                  />
                </motion.div>
              );
            })}
          </motion.div>
        </TrackList>
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, padding: '24px 0 8px' }}>
              <button
                className="hp-pager-btn"
                disabled={currentPage <= 1}
                onClick={() => setPage(currentPage - 1)}
                style={pagerBtnStyle(currentPage <= 1)}
              >
                上一页
              </button>
              <span style={{ fontSize: 13, color: 'var(--color-text-dim, rgba(255,255,255,0.65))', minWidth: 90, textAlign: 'center' }}>
                第 {currentPage} / {totalPages} 页
              </span>
              <button
                className="hp-pager-btn"
                disabled={currentPage >= totalPages}
                onClick={() => setPage(currentPage + 1)}
                style={pagerBtnStyle(currentPage >= totalPages)}
              >
                下一页
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
