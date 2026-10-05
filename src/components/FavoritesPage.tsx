import React, { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useFavoriteStore } from '../stores/favoriteStore';
import { usePlaybackStore } from '../stores/playbackStore';
import { useDownloadStore } from '../stores/downloadStore';
import { AddToLibraryButton } from './AddToLibraryModal';
import { SelectionBar } from './SelectionBar';
import { TrackList, TrackListHeader } from './common/TrackList';
import { TrackRow } from './common/TrackRow';
import { useSongEnrichment } from '../hooks/useSongEnrichment';
import type { RouteState, Song } from '../types/playback';

const PAGE_SIZE = 50;



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

export function FavoritesPage({ onNavigate }: { onNavigate: (route: RouteState) => void }) {
  // 只订阅轻量 ID 列表，数量变化时触发重渲染
  const favoriteIds = useFavoriteStore((s) => s.favoriteIds);
  // patchSong 后的版本号：数据补全后重渲染，让链接即时生效
  const revision = useFavoriteStore((s) => s.revision);
  const getFavoritesPage = useFavoriteStore((s) => s.getFavoritesPage);
  const removeFavorites = useFavoriteStore((s) => s.removeFavorites);
  const setQueue = usePlaybackStore((s) => s.setQueue);
  const current = usePlaybackStore((s) => s.current);
  const isPlaying = usePlaybackStore((s) => s.isPlaying);
  const addTasks = useDownloadStore((s) => s.addTasks);
  const [page, setPage] = useState(1);
  // 多选模式：选中集合按当前页可见歌曲计（翻页重置）
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const total = favoriteIds.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const pageStartIndex = (currentPage - 1) * PAGE_SIZE;

  // 页码越界时回正（例如取消收藏后总页数减少）
  useEffect(() => {
    if (page !== currentPage) setPage(currentPage);
  }, [page, currentPage]);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  // 全局 Escape 广播（App.tsx 派发 melodix-close-popups）退出多选
  useEffect(() => {
    window.addEventListener('melodix-close-popups', exitSelectMode);
    return () => window.removeEventListener('melodix-close-popups', exitSelectMode);
  }, [exitSelectMode]);

  // 翻页后可见歌曲集合变化，清空选中避免残留隐藏选择
  useEffect(() => {
    setSelectedIds(new Set());
  }, [currentPage]);

  // 当前页的完整 Song 对象（按需从缓存加载，不全量持有）
  const pageSongs = total === 0 ? [] : getFavoritesPage(currentPage, PAGE_SIZE);

  // 老数据补全：为缺失 albumId/artists 的在线歌曲静默拉取元信息并写回存储
  useSongEnrichment(pageSongs, (songId, patch) => {
    useFavoriteStore.getState().patchSong(songId, patch);
  });
  void revision;

  // 播放时才读取完整队列，避免完整数组成为响应式依赖
  const handlePlay = useCallback((index: number) => {
    const allFavorites = useFavoriteStore.getState().getFavorites();
    setQueue(allFavorites, index);
  }, [setQueue]);

  const handleOpenArtist = useCallback((song: Song) => {
    const a = song.artists && song.artists.length > 0 ? song.artists[0] : null;
    if (!a || !a.id) return;
    onNavigate({ page: 'artist', id: a.id, source: song.source || 'tencent', name: a.name });
  }, [onNavigate]);

  const handleOpenAlbum = useCallback((song: Song) => {
    if (!song.albumId) return;
    onNavigate({ page: 'album', id: song.albumId, source: song.source || 'tencent', name: song.album });
  }, [onNavigate]);

  // ===== 多选 =====
  const allSelected =
    selectMode && pageSongs.length > 0 && pageSongs.every((s) => selectedIds.has(s.id));

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (pageSongs.length > 0 && pageSongs.every((s) => prev.has(s.id))) return new Set();
      return new Set(pageSongs.map((s) => s.id));
    });
  }, [pageSongs]);

  const handleBatchDownload = useCallback(() => {
    const songs = pageSongs.filter((s) => selectedIds.has(s.id));
    if (songs.length === 0) return;
    addTasks(songs);
  }, [pageSongs, selectedIds, addTasks]);

  const handleBatchRemove = useCallback(() => {
    if (selectedIds.size === 0) return;
    removeFavorites([...selectedIds]);
    setSelectedIds(new Set());
  }, [selectedIds, removeFavorites]);

  return (
    <div style={{ padding: 'clamp(20px, 3vw, 40px)', maxWidth: 1200, margin: '0 auto' }}>
      <style>{`
        .fv-pager-btn:hover:not(:disabled) {
          background: var(--color-hover, rgba(255,255,255,0.06)) !important;
        }
      `}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
        <div style={{
          width: 56,
          height: 56,
          borderRadius: 12,
          background: 'var(--color-primary, #6366f1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="var(--color-text)" stroke="none">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </div>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>收藏的音乐</h1>
          <p style={{ fontSize: 14, color: 'var(--color-text-dim, rgba(255,255,255,0.65))', margin: '4px 0 0' }}>{total} 首</p>
        </div>
        <div style={{ flex: 1 }} />
        <motion.button
          onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
          disabled={total === 0}
          whileHover={total > 0 ? { scale: 1.04 } : undefined}
          whileTap={total > 0 ? { scale: 0.96 } : undefined}
          style={{
            height: 36,
            padding: '0 16px',
            borderRadius: 18,
            background: selectMode ? 'var(--color-primary)' : 'var(--glass-2)',
            border: `1px solid ${selectMode ? 'var(--color-primary)' : 'var(--glass-border)'}`,
            color: selectMode ? '#fff' : 'var(--color-text)',
            fontSize: 13,
            fontWeight: 500,
            cursor: total > 0 ? 'pointer' : 'not-allowed',
            opacity: total > 0 ? 1 : 0.5,
            whiteSpace: 'nowrap',
          }}
        >
          {selectMode ? '退出多选' : '多选'}
        </motion.button>
      </div>

      {/* 多选操作栏：标题下方吸顶 */}
      <AnimatePresence>
        {selectMode && total > 0 && (
          <SelectionBar
            count={selectedIds.size}
            total={pageSongs.length}
            allSelected={allSelected}
            onToggleSelectAll={toggleSelectAll}
            onExit={exitSelectMode}
            horizontalPadding="clamp(20px, 3vw, 40px)"
            actions={[
              {
                key: 'download',
                label: `下载${selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}`,
                disabled: selectedIds.size === 0,
                onClick: handleBatchDownload,
              },
              {
                key: 'unfavorite',
                label: `取消收藏${selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}`,
                danger: true,
                disabled: selectedIds.size === 0,
                onClick: handleBatchRemove,
              },
            ]}
          />
        )}
      </AnimatePresence>
      {total === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--color-text-faint, rgba(255,255,255,0.45))' }}>
          <p style={{ fontSize: 16 }}>还没有收藏的歌曲</p>
          <p style={{ fontSize: 13, marginTop: 8 }}>你喜欢的歌曲会显示在这里</p>
        </div>
      ) : (
        <>
        <TrackList showCover={true} actionWidth="120px">
          <TrackListHeader showCover={true} />
          <motion.div
            variants={{ show: { transition: { staggerChildren: 0.03 } } }}
            initial="hidden"
            animate="show"
            style={{ display: 'flex', flexDirection: 'column', gap: 2 }}
          >
            {pageSongs.map((song, i) => {
              const globalIndex = pageStartIndex + i;
              return (
                <motion.div
                  key={song.id}
                  variants={{
                    hidden: { opacity: 0, y: 10 },
                    show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } }
                  }}
                  layout="position"
                >
                  <TrackRow
                    song={song}
                    index={globalIndex}
                    displayIndex={globalIndex + 1}
                    isCurrent={current?.id === song.id}
                    isPlaying={isPlaying}
                    selectMode={selectMode}
                    selected={selectedIds.has(song.id)}
                    onToggleSelect={toggleSelect}
                    onPlay={() => handlePlay(globalIndex)}
                    onOpenArtist={handleOpenArtist}
                    onOpenAlbum={handleOpenAlbum}
                    showCover={true}
                    renderAction={() => <AddToLibraryButton song={song} />}
                  />
                </motion.div>
              );
            })}
          </motion.div>
        </TrackList>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, padding: '24px 0 8px' }}>
            <button
              className="fv-pager-btn"
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
              className="fv-pager-btn"
              disabled={currentPage >= totalPages}
              onClick={() => setPage(currentPage + 1)}
              style={pagerBtnStyle(currentPage >= totalPages)}
            >
              下一页
            </button>
          </div>
        </>
      )}
    </div>
  );
}
