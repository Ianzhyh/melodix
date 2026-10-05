import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePlaybackStore } from '../stores/playbackStore';
import { useCustomLibraryStore } from '../stores/customLibraryStore';
import { useDownloadStore } from '../stores/downloadStore';
import { useToastStore } from '../stores/toastStore';
import { SelectionBar } from './SelectionBar';
import { TrackList, TrackListHeader } from './common/TrackList';
import { TrackRow } from './common/TrackRow';
import * as api from '../api/client';
import { getSongCoverUrl } from '../utils/cover';
import type { PlaylistDetail, RouteState, Song } from '../types/playback';

interface PlaylistViewProps {
  playlistId?: string;
  source?: string;
  onNavigate?: (route: RouteState) => void;
}


import { Vibrant } from 'node-vibrant/browser';

export function PlaylistView({ playlistId, source = 'netease', onNavigate }: PlaylistViewProps) {
  const [playlist, setPlaylist] = useState<PlaylistDetail | null>(null);
  const [headerTextColor, setHeaderTextColor] = useState<string>('rgba(255,255,255,0.95)');
  const allToplistSongsRef = useRef<Song[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [jumpInput, setJumpInput] = useState('');
  const PAGE_SIZE = 30;
  const { setQueue, current, isPlaying } = usePlaybackStore();
  const { libraries, createLibrary, addSongs } = useCustomLibraryStore();
  const addTasks = useDownloadStore((s) => s.addTasks);
  const [libMenuOpen, setLibMenuOpen] = useState(false);
  const [newLibName, setNewLibName] = useState('');
  const [importing, setImporting] = useState(false);
  const libMenuRef = useRef<HTMLDivElement>(null);
  // 多选模式：选中集合按当前页可见歌曲计（切歌单/翻页重置）
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  // 全局 Escape 广播（App.tsx 派发 melodix-close-popups）退出多选
  useEffect(() => {
    window.addEventListener('melodix-close-popups', exitSelectMode);
    return () => window.removeEventListener('melodix-close-popups', exitSelectMode);
  }, [exitSelectMode]);

  // Close lib menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (libMenuRef.current && !libMenuRef.current.contains(e.target as Node)) {
        setLibMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const pageTracks = useMemo(() => playlist?.tracks ?? [], [playlist]);
  const selectedSongs = useMemo(
    () => pageTracks.filter((t) => selectedIds.has(t.id)),
    [pageTracks, selectedIds],
  );
  const allSelected = selectMode && pageTracks.length > 0 && pageTracks.every((t) => selectedIds.has(t.id));

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
      if (pageTracks.length > 0 && pageTracks.every((t) => prev.has(t.id))) return new Set();
      return new Set(pageTracks.map((t) => t.id));
    });
  }, [pageTracks]);

  const handleBatchDownload = useCallback(() => {
    if (selectedSongs.length === 0) return;
    addTasks(selectedSongs);
  }, [selectedSongs, addTasks]);

  const handleAddToLibrary = useCallback(async (libraryId: string) => {
    setLibMenuOpen(false);
    setImporting(true);
    try {
      if (selectMode) {
        if (selectedSongs.length === 0) {
          useToastStore.getState().showToast('请先选择歌曲', 'info');
          return;
        }
        addSongs(libraryId, selectedSongs);
        return;
      }
      const songs = source === 'toplist' && allToplistSongsRef.current.length > 0
        ? allToplistSongsRef.current
        : playlist?.tracks ?? [];
      addSongs(libraryId, songs);
    } finally {
      setImporting(false);
    }
  }, [playlist, source, addSongs, selectMode, selectedSongs]);

  const handleAddToNewLibrary = useCallback(async () => {
    const name = newLibName.trim() || (playlist?.name ?? '新音乐库');
    const id = createLibrary(name);
    setNewLibName('');
    if (id) await handleAddToLibrary(id);
  }, [newLibName, playlist, createLibrary, handleAddToLibrary]);


  const loadPage = useCallback(async (page: number) => {
    if (!playlistId) return;
    setIsLoading(true);
    setLoadError(null);
    // 切歌单/翻页后可见歌曲集合变化，清空选中避免残留隐藏选择
    setSelectedIds(new Set());
    try {
      if (source === 'toplist') {
        // Only fetch once, then paginate on the client side
        let songs = allToplistSongsRef.current;
        if (songs.length === 0) {
          songs = await api.getNewSongs(parseInt(playlistId), 100);
          allToplistSongsRef.current = songs;
        }
        const start = (page - 1) * PAGE_SIZE;
        const paged = songs.slice(start, start + PAGE_SIZE);
        setPlaylist({
          id: playlistId,
          name: '排行榜',
          cover: '',
          trackCount: songs.length,
          tracks: paged,
          source: 'tencent',
          page,
          limit: PAGE_SIZE,
          total: songs.length,
        });
      } else {
        const data = await api.getPlaylist(playlistId, source, page, PAGE_SIZE);
        setPlaylist(data);
      }
      setCurrentPage(page);
      // 翻页后滚动到顶部，让用户看到新页内容
      requestAnimationFrame(() => {
        document.querySelector('main')?.scrollTo({ top: 0 });
      });
    } catch (e) {
      setLoadError('加载失败，请重试');
      console.error('加载歌单失败:', e);
    } finally {
      setIsLoading(false);
    }
  }, [playlistId, source]);

  useEffect(() => {
    if (!playlistId) return;
    allToplistSongsRef.current = [];
    setCurrentPage(1);
    // 切歌单 = 进入新视图，退出多选（对齐音乐库切库行为）
    setSelectMode(false);
    setSelectedIds(new Set());
    loadPage(1);
  }, [playlistId, source, loadPage]);

  // Extract color for playlist header title
  useEffect(() => {
    if (!playlist) return;
    let isMounted = true;
    const url = getSongCoverUrl(playlist, 400);
    if (!url) return;
    
    Vibrant.from(url).getPalette().then((palette) => {
      if (!isMounted || !palette) return;
      // Prefer LightVibrant for dark background, fallback to Vibrant or pure white
      const color = palette.LightVibrant?.hex || palette.Vibrant?.hex || 'rgba(255,255,255,0.95)';
      setHeaderTextColor(color);
    }).catch(() => {});
    
    return () => { isMounted = false; };
  }, [playlist]);

  const totalPages = playlist?.total ? Math.ceil(playlist.total / PAGE_SIZE) : 1;
  const trackOffset = (currentPage - 1) * PAGE_SIZE;

  const handlePlayAll = () => {
    if (!playlist || playlist.tracks.length === 0) return;
    if (source === 'toplist' && allToplistSongsRef.current.length > 0) {
      setQueue(allToplistSongsRef.current, 0);
    } else {
      setQueue(playlist.tracks, 0);
    }
  };

  const handlePlayTrack = useCallback((_song: Song, index: number) => {
    if (!playlist) return;
    if (source === 'toplist' && allToplistSongsRef.current.length > 0) {
      setQueue(allToplistSongsRef.current, index + trackOffset);
    } else {
      setQueue(playlist.tracks, index);
    }
  }, [playlist, source, setQueue, trackOffset]);

  const handleOpenArtist = useCallback((id: string, name: string) => {
    if (!id || !onNavigate) return;
    onNavigate({ page: 'artist', id, source: source === 'toplist' ? 'tencent' : (playlist?.source || source), name });
  }, [source, playlist, onNavigate]);

  const handleOpenAlbum = useCallback((id: string, name: string) => {
    if (!id || !onNavigate) return;
    onNavigate({ page: 'album', id, source: source === 'toplist' ? 'tencent' : (playlist?.source || source), name });
  }, [source, playlist, onNavigate]);

  const handleJump = useCallback(() => {
    const num = parseInt(jumpInput, 10);
    if (!Number.isFinite(num) || num < 1 || num > totalPages) return;
    setJumpInput('');
    void loadPage(num);
  }, [jumpInput, totalPages, loadPage]);

  if (!playlistId) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-faint, rgba(255,255,255,0.45))', gap: 16 }}>
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
        <span style={{ fontSize: 16 }}>请选择一个歌单查看</span>
      </div>
    );
  }

  if (loadError && !isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-faint)', gap: 16, padding: 40 }}>
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <span style={{ fontSize: 16 }}>{loadError}</span>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => loadPage(currentPage)}
          style={{ padding: '8px 24px', borderRadius: 8, background: 'var(--color-primary, #6366f1)', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 500 }}
        >
          重试
        </motion.button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div style={{ padding: '40px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ display: 'flex', gap: 32, alignItems: 'center' }}>
          <div className="shimmer-skeleton" style={{ width: 180, height: 180, borderRadius: 16 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
            <div className="shimmer-skeleton" style={{ width: '40%', height: 32, borderRadius: 6 }} />
            <div className="shimmer-skeleton" style={{ width: '20%', height: 18, borderRadius: 4 }} />
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 24 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ display: 'flex', gap: 16, alignItems: 'center', padding: '12px 16px' }}>
              <div className="shimmer-skeleton" style={{ width: 24, height: 20, borderRadius: 4 }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                <div className="shimmer-skeleton" style={{ width: '30%', height: 16, borderRadius: 4 }} />
                <div className="shimmer-skeleton" style={{ width: '15%', height: 12, borderRadius: 4 }} />
              </div>
              <div className="shimmer-skeleton" style={{ width: '20%', height: 16, borderRadius: 4 }} />
              <div className="shimmer-skeleton" style={{ width: 40, height: 16, borderRadius: 4 }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!playlist) {
    return (
      <div style={{ padding: '40px', color: 'var(--color-text-dim, rgba(255,255,255,0.65))', fontSize: 14 }}>
        歌单不存在或加载失败
      </div>
    );
  }

  const coverUrl = getSongCoverUrl(playlist, 400);
  const totalDuration = playlist.tracks.reduce((sum, t) => sum + (t.duration || 0), 0);
  const formatDuration = (s: number) => {
    const mins = Math.floor(s / 60);
    return `${mins} 分钟`;
  };

  return (
    <div style={{ position: 'relative', width: '100%', minHeight: '100%', paddingBottom: 120 }}>
      <style>{`
        /* Media queries for responsive PlaylistView */
        @media (max-width: 640px) {
          .playlist-header-container {
            height: auto !important;
            padding: 32px 20px !important;
          }
          .playlist-header {
            flex-direction: column !important;
            align-items: center !important;
            text-align: center !important;
            gap: 16px !important;
          }
          .playlist-cover-wrapper {
            width: 140px !important;
            height: 140px !important;
          }
          .playlist-info-wrapper {
            align-items: center !important;
            display: flex;
            flex-direction: column;
          }
          .playlist-info-wrapper h1 {
            text-align: center !important;
            font-size: 28px !important;
            margin: 8px 0 !important;
          }
        }
      `}</style>

      {/* Immersive Header */}
      <div className="playlist-header-container" style={{
        position: 'relative', height: 340, display: 'flex', alignItems: 'flex-end',
        padding: '0 40px 40px', overflow: 'hidden'
      }}>
        <div style={{
          position: 'absolute', inset: 0, zIndex: 0,
          backgroundImage: `url(${coverUrl})`,
          backgroundSize: 'cover', backgroundPosition: 'center',
          filter: 'blur(60px) brightness(0.6)',
          transform: 'scale(1.2)'
        }} />
        
        <div className="playlist-header" style={{ position: 'relative', zIndex: 1, display: 'flex', gap: 32, alignItems: 'flex-end', width: '100%' }}>
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 20 }}
            className="playlist-cover-wrapper"
            style={{ width: 220, height: 220, borderRadius: 16, overflow: 'hidden', boxShadow: '0 16px 40px rgba(0,0,0,0.5)', flexShrink: 0 }}
          >
            <img src={coverUrl} alt={playlist.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </motion.div>
          
          <motion.div className="playlist-info-wrapper" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }} style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'rgba(255,255,255,0.65)' }}>歌单</span>
            <h1 style={{ fontSize: 48, fontWeight: 800, margin: '8px 0 16px', letterSpacing: -1.5, color: headerTextColor, lineHeight: 1.1, maxWidth: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {playlist.name}
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'rgba(255,255,255,0.65)' }}>
              <span>{playlist.trackCount} 首</span>
              {totalDuration > 0 && (
                <>
                  <span>•</span>
                  <span>{formatDuration(totalDuration)}</span>
                </>
              )}
            </div>
          </motion.div>
        </div>
      </div>

      {/* Action Bar */}
      <div style={{ padding: '24px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <motion.button
          onClick={handlePlayAll}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          style={{
            width: 56, height: 56, borderRadius: '50%', background: 'var(--color-primary, #6366f1)', border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', cursor: 'pointer',
            boxShadow: '0 8px 24px rgba(0,0,0,0.15)'
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4l14 8-14 8V4z"/></svg>
        </motion.button>

        {/* Operations — 右侧 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* 多选按钮（无歌曲时禁用） */}
          <motion.button
            onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
            whileHover={{ scale: playlist.tracks.length > 0 ? 1.04 : 1 }}
            whileTap={{ scale: playlist.tracks.length > 0 ? 0.96 : 1 }}
            disabled={playlist.tracks.length === 0}
            style={{
              height: 38, padding: '0 18px', borderRadius: 20,
              background: selectMode ? 'var(--color-primary)' : 'var(--glass-2)',
              border: `1px solid ${selectMode ? 'var(--color-primary)' : 'var(--glass-border)'}`,
              color: selectMode ? '#fff' : 'var(--color-text)',
              display: 'flex', alignItems: 'center', gap: 8, cursor: playlist.tracks.length > 0 ? 'pointer' : 'not-allowed',
              fontSize: 14, fontWeight: 500, opacity: playlist.tracks.length > 0 ? 1 : 0.5,
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              backdropFilter: 'var(--blur-sm)',
              WebkitBackdropFilter: 'var(--blur-sm)',
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="4" />
              <path d="M9 12l2 2 4-4" />
            </svg>
            {selectMode ? '退出多选' : '多选'}
          </motion.button>

          {/* Add to Library Button */}
          <div ref={libMenuRef} style={{ position: 'relative' }}>
          <motion.button
            onClick={() => setLibMenuOpen(v => !v)}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            style={{
              height: 38, padding: '0 18px', borderRadius: 20,
              background: libMenuOpen ? 'var(--glass-3)' : 'var(--glass-2)',
              border: `1px solid ${libMenuOpen ? 'var(--color-primary)' : 'var(--glass-border)'}`,
              color: libMenuOpen ? 'var(--color-primary)' : 'var(--color-text)',
              display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, fontWeight: 500,
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              backdropFilter: 'var(--blur-sm)',
              WebkitBackdropFilter: 'var(--blur-sm)',
              boxShadow: libMenuOpen ? 'none' : 'none',
            }}
          >
            {importing ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14"/>
              </svg>
            )}
            {selectMode ? `加入音乐库 (${selectedIds.size})` : '加入音乐库'}
          </motion.button>

          <AnimatePresence>
            {libMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.97 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                style={{
                  position: 'absolute', top: '100%', right: 0, marginTop: 8, minWidth: 260,
                  background: 'var(--acrylic-noise), var(--acrylic-tint)',
                  backdropFilter: 'var(--acrylic-blur) var(--acrylic-saturate)',
                  WebkitBackdropFilter: 'var(--acrylic-blur) var(--acrylic-saturate)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: 16, padding: 8, zIndex: 50,
                  boxShadow: '0 16px 48px rgba(0,0,0,0.3)',
                }}
              >
                {/* New Library Row */}
                <div style={{ padding: '4px 8px 10px', borderBottom: '1px solid var(--glass-border)', marginBottom: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-dim)', letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: 8, padding: '0 4px' }}>新建音乐库</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      autoFocus
                      placeholder={playlist?.name ?? '音乐库名称'}
                      value={newLibName}
                      onChange={e => setNewLibName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleAddToNewLibrary(); }}
                      style={{
                        flex: 1, height: 34, padding: '0 10px', fontSize: 13, borderRadius: 10,
                        background: 'var(--glass-2)', border: '1px solid var(--glass-border)',
                        color: 'var(--color-text)', outline: 'none', fontFamily: 'inherit',
                      }}
                    />
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={handleAddToNewLibrary}
                      style={{
                        height: 34, padding: '0 14px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                        background: 'var(--color-primary)', border: 'none', color: '#fff', cursor: 'pointer',
                        whiteSpace: 'nowrap', flexShrink: 0,
                      }}
                    >
                      创建
                    </motion.button>
                  </div>
                </div>

                {/* Existing Libraries */}
                {libraries.length === 0 ? (
                  <div style={{ padding: '8px 12px', fontSize: 13, color: 'var(--color-text-faint)' }}>暂无音乐库，请新建</div>
                ) : (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-dim)', letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: 4, padding: '2px 12px' }}>已有音乐库</div>
                    {libraries.map(lib => (
                      <motion.div
                        key={lib.id}
                        whileHover={{ background: 'var(--color-surface-hover)' }}
                        onClick={() => handleAddToLibrary(lib.id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                          borderRadius: 10, cursor: 'pointer', transition: 'background 0.15s',
                        }}
                      >
                        <div style={{
                          width: 34, height: 34, borderRadius: 8, flexShrink: 0, overflow: 'hidden',
                          background: 'var(--glass-3)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {lib.songs[0] ? (
                            <img src={getSongCoverUrl(lib.songs[0], 64)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ opacity: 0.5 }}><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                          )}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{lib.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--color-text-faint)', marginTop: 2 }}>{lib.songs.length} 首</div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
          </div>
        </div>
      </div>

      {/* 多选操作栏：动作栏下方吸顶 */}
      <AnimatePresence>
        {selectMode && (
          <SelectionBar
            count={selectedIds.size}
            total={pageTracks.length}
            allSelected={allSelected}
            onToggleSelectAll={toggleSelectAll}
            onExit={exitSelectMode}
            actions={[
              {
                key: 'download',
                label: `下载${selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}`,
                disabled: selectedIds.size === 0,
                onClick: handleBatchDownload,
              },
            ]}
          />
        )}
      </AnimatePresence>

      {/* Tracklist Table */}
      {playlist.tracks.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-faint, rgba(255,255,255,0.45))' }}>
          该歌单暂无歌曲
        </div>
      ) : (
        <div style={{ padding: '0 40px' }}>
          <TrackList showCover={false}>
            <TrackListHeader showCover={false} />
            <motion.div
              variants={{
                show: { transition: { staggerChildren: 0.03 } }
              }}
              initial="hidden"
              animate="show"
              style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
            >
              {playlist.tracks.map((track, i) => (
                <motion.div
                  key={`${track.id}-${i}`}
                  variants={{
                    hidden: { opacity: 0, y: 10 },
                    show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } }
                  }}
                  layout="position"
                >
                  <TrackRow
                    song={track}
                    index={i}
                    displayIndex={trackOffset + i + 1}
                    isCurrent={current?.id === track.id}
                    isPlaying={isPlaying}
                    selectMode={selectMode}
                    selected={selectedIds.has(track.id)}
                    onToggleSelect={toggleSelect}
                    onPlay={handlePlayTrack}
                    onOpenArtist={handleOpenArtist as any}
                    onOpenAlbum={handleOpenAlbum as any}
                    showCover={false}
                  />
                </motion.div>
              ))}
            </motion.div>
          </TrackList>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '24px 0 16px',
            }}>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                disabled={currentPage <= 1}
                onClick={() => loadPage(currentPage - 1)}
                style={{
                  background: 'var(--color-surface-hover)', border: '1px solid var(--color-border)',
                  color: currentPage <= 1 ? 'var(--color-icon-disabled)' : 'var(--color-icon)',
                  cursor: currentPage <= 1 ? 'not-allowed' : 'pointer',
                  padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500,
                }}
              >
                上一页
              </motion.button>
              <span style={{ color: 'var(--color-text-faint)', fontSize: 13, padding: '0 12px' }}>
                {currentPage} / {totalPages}
              </span>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                disabled={currentPage >= totalPages}
                onClick={() => loadPage(currentPage + 1)}
                style={{
                  background: 'var(--color-surface-hover)', border: '1px solid var(--color-border)',
                  color: currentPage >= totalPages ? 'var(--color-icon-disabled)' : 'var(--color-icon)',
                  cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer',
                  padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500,
                }}
              >
                下一页
              </motion.button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 12 }}>
                <span style={{ color: 'var(--color-text-faint)', fontSize: 13 }}>跳至</span>
                <input
                  type="number"
                  min={1}
                  max={totalPages}
                  value={jumpInput}
                  onChange={(e) => setJumpInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleJump(); }}
                  placeholder="页"
                  style={{
                    width: 56, height: 30, padding: '0 8px', fontSize: 13, textAlign: 'center',
                    color: 'var(--color-icon)', background: 'var(--color-surface-hover)',
                    border: '1px solid var(--color-border)', borderRadius: 8, outline: 'none',
                  }}
                />
                <span style={{ color: 'var(--color-text-faint)', fontSize: 13 }}>页</span>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleJump}
                  style={{
                    background: 'var(--color-primary, #6366f1)', border: 'none', color: '#fff',
                    cursor: 'pointer', padding: '6px 12px', borderRadius: 8, fontSize: 13, fontWeight: 500,
                  }}
                >
                  跳转
                </motion.button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
