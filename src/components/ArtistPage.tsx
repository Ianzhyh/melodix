import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { usePlaybackStore } from '../stores/playbackStore';
import { useToastStore } from '../stores/toastStore';
import * as api from '../api/client';
import { formatTime } from '../api/client';
import type { ArtistDetail, RouteState, Song } from '../types/playback';

interface ArtistPageProps {
  artistId?: string;
  source?: string;
  fallbackName?: string;
  fallbackCover?: string;
  onNavigate: (route: RouteState) => void;
  onBack: () => void;
}

interface ArtistTrackRowProps {
  track: Song;
  index: number;
  isCurrent: boolean;
  isPlaying: boolean;
  onPlay: (index: number) => void;
  onOpenAlbum: (id: string, name: string) => void;
}

const ArtistTrackRow = memo(function ArtistTrackRow({
  track,
  index,
  isCurrent,
  isPlaying,
  onPlay,
  onOpenAlbum,
}: ArtistTrackRowProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index % 30, 10) * 0.02 }}
      className="arp-track-row"
      whileHover={{ background: 'var(--color-hover, rgba(255,255,255,0.03))' }}
      whileTap={{ scale: 0.995 }}
      onClick={() => onPlay(index)}
      style={{
        display: 'grid', gridTemplateColumns: '40px 1fr 1fr 80px', padding: '12px 16px',
        borderRadius: 8, cursor: 'pointer', alignItems: 'center', transition: 'background 0.2s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
        <span className="arp-track-index" style={{ color: isCurrent ? 'var(--color-primary, #6366f1)' : 'var(--color-text-faint, rgba(255,255,255,0.45))', fontSize: 14 }}>{index + 1}</span>
        <span className="arp-play-icon" style={{ display: 'none', color: isCurrent ? 'var(--color-primary, #6366f1)' : '#fff' }}>
          {isCurrent && isPlaying ? (
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="2" width="3" height="12" rx="0.5"/><rect x="10" y="2" width="3" height="12" rx="0.5"/></svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2l10 6-10 6V2z"/></svg>
          )}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', paddingRight: 16, minWidth: 0 }}>
        <span style={{ fontSize: 15, fontWeight: 500, color: isCurrent ? 'var(--color-primary, #6366f1)' : 'var(--color-text, rgba(255,255,255,0.95))', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{track.name}</span>
        <span style={{ fontSize: 13, color: 'var(--color-text-dim, rgba(255,255,255,0.65))', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{track.artist}</span>
      </div>
      <div style={{ color: 'var(--color-text-dim, rgba(255,255,255,0.65))', fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: 16 }}>
        {track.albumId ? (
          <span
            className="md-text-link"
            onClick={(e) => { e.stopPropagation(); onOpenAlbum(track.albumId!, track.album); }}
          >
            {track.album}
          </span>
        ) : track.album}
      </div>
      {/* 时长单元格：与表头列保持相同 flex 右对齐，字体尺寸、等宽数字一致 */}
      <div style={{
        display: 'flex', justifyContent: 'flex-end', alignItems: 'center',
        color: 'var(--color-text-dim, rgba(255,255,255,0.65))',
        fontSize: 13, lineHeight: 1, fontVariantNumeric: 'tabular-nums',
      }}>
        {track.duration ? formatTime(track.duration) : '--:--'}
      </div>
    </motion.div>
  );
});

const SONGS_PAGE_SIZE = 50;

// 非 tencent/netease 平台：详情接口已附带歌曲列表，直接作为全部歌曲
function getDetailSongs(artist: ArtistDetail | null): Song[] {
  if (!artist) return [];
  return artist.songs || [];
}

export function ArtistPage({ artistId, source = 'tencent', fallbackName, fallbackCover, onNavigate, onBack }: ArtistPageProps) {
  const [artist, setArtist] = useState<ArtistDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [descExpanded, setDescExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'songs' | 'albums'>('songs');

  // 歌曲列表：独立懒加载（详情先渲染，歌曲分页滚动加载）
  const [songs, setSongs] = useState<Song[]>([]);
  const [songsTotal, setSongsTotal] = useState<number | null>(null);
  const [songsLoading, setSongsLoading] = useState(true);
  const [songsLoadingMore, setSongsLoadingMore] = useState(false);
  const [songsHasMore, setSongsHasMore] = useState(true);
  const [songsFailed, setSongsFailed] = useState(false);
  const songsOffsetRef = useRef(0);
  const loadMoreBusyRef = useRef(false);
  const initialSongsLoadedRef = useRef(false);
  const songsHasMoreRef = useRef(true);
  songsHasMoreRef.current = songsHasMore;
  const songsFailedRef = useRef(false);
  songsFailedRef.current = songsFailed;
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const { setQueue, current, isPlaying } = usePlaybackStore();
  const showToast = useToastStore((s) => s.showToast);

  // 用 ref 供 loadMoreSongs 读取最新 artist（避免依赖变化导致回调重建）
  const artistRef = useRef(artist);
  artistRef.current = artist;

  const load = useCallback(async () => {
    if (!artistId) return;
    setIsLoading(true);
    setLoadError(null);
    setDescExpanded(false);
    try {
      const data = await api.getArtistDetail(artistId, source, { name: fallbackName, cover: fallbackCover });
      if (data) {
        setArtist(data);
      } else {
        setLoadError('歌手信息加载失败，请重试');
      }
    } catch (e) {
      console.error('加载歌手信息失败:', e);
      setLoadError('歌手信息加载失败，请重试');
    } finally {
      setIsLoading(false);
    }
  }, [artistId, source, fallbackName, fallbackCover]);

  // 切换歌手时重置全部歌曲状态
  useEffect(() => {
    setArtist(null);
    setSongs([]);
    setSongsTotal(null);
    setSongsHasMore(true);
    setSongsFailed(false);
    setSongsLoading(true);
    setDescExpanded(false);
    setActiveTab('songs');
    songsOffsetRef.current = 0;
    loadMoreBusyRef.current = false;
    initialSongsLoadedRef.current = false;
    load();
  }, [load]);

  // 懒加载：拉取下一批歌曲（reset=true 为第一页）
  const loadMoreSongs = useCallback(async (reset: boolean) => {
    if (!artistId || loadMoreBusyRef.current) return;
    if (!reset && (!songsHasMoreRef.current || songsFailedRef.current)) return;
    loadMoreBusyRef.current = true;
    const offset = reset ? 0 : songsOffsetRef.current;
    if (reset) {
      setSongsLoading(true);
      setSongsFailed(false);
    } else {
      setSongsLoadingMore(true);
    }
    const result = await api.getArtistSongs(artistId, source, {
      offset,
      page: Math.floor(offset / SONGS_PAGE_SIZE) + 1,
      limit: SONGS_PAGE_SIZE,
      name: artistRef.current?.name || fallbackName,
    });
    if (result.songs.length === 0 && result.total === 0) {
      // 分页接口无数据：首次加载回退到详情接口自带的歌曲（非 tencent/netease 平台）；
      // 加载更多失败则保持 hasMore，等用户再次滚动时重试
      if (reset) {
        const fallback = getDetailSongs(artistRef.current);
        if (fallback.length > 0) {
          setSongs(fallback);
          setSongsTotal(fallback.length);
          setSongsHasMore(false);
          songsOffsetRef.current = fallback.length;
        } else {
          setSongsFailed(true);
        }
      }
    } else {
      setSongs(prev => reset ? result.songs : [...prev, ...result.songs]);
      setSongsTotal(result.total > 0 ? result.total : null);
      setSongsHasMore(result.hasMore);
      songsOffsetRef.current = offset + result.songs.length;
    }
    setSongsLoading(false);
    setSongsLoadingMore(false);
    loadMoreBusyRef.current = false;
  }, [artistId, source]);

  // 首次加载歌曲（详情加载完后启动；详情接口已自带歌曲的平台直接使用）
  useEffect(() => {
    if (isLoading || !artistId || initialSongsLoadedRef.current) return;
    initialSongsLoadedRef.current = true;
    const detailSongs = getDetailSongs(artist);
    if (detailSongs.length > 0) {
      setSongs(detailSongs);
      setSongsTotal(detailSongs.length);
      setSongsHasMore(false);
      setSongsLoading(false);
      songsOffsetRef.current = detailSongs.length;
      return;
    }
    loadMoreSongs(true);
  }, [isLoading, artistId, artist, loadMoreSongs]);

  // 滚动哨兵：进入视口自动加载下一页。
  // deps 里带上 songs/songsLoading/activeTab：首屏第 1 页加载完成后哨兵节点才挂载，
  // 这些值变化时必须重建 observer，否则 observer 永远观察不到哨兵（只会停在第一页）
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        loadMoreSongs(false);
      }
    }, { rootMargin: '400px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadMoreSongs, songsHasMore, songs, songsLoading, songsLoadingMore, activeTab]);

  const handlePlayAll = () => {
    if (songs.length === 0) return;
    setQueue(songs, 0);
    showToast(`正在播放: ${artist?.name || '歌手歌曲'}`, 'success');
  };

  const handlePlayTrack = (index: number) => {
    setQueue(songs, index);
  };

  const openAlbum = useCallback((id: string, name: string) => {
    if (!id) {
      showToast('该平台暂不支持查看专辑', 'info');
      return;
    }
    onNavigate({ page: 'album', id, source, name });
  }, [source, onNavigate, showToast]);

  const coverUrl = artist?.cover
    ? (artist.cover.startsWith('http') ? api.getProxyImageUrl(artist.cover) : artist.cover)
    : '';

  const songsCountLabel = songsTotal != null
    ? `共 ${songsTotal} 首`
    : `已加载 ${songs.length} 首`;

  return (
    <div style={{ position: 'relative', width: '100%', minHeight: '100%', paddingBottom: 120 }}>
      <style>{`
        .arp-track-row:hover .arp-track-index {
          display: none !important;
        }
        .arp-track-row:hover .arp-play-icon {
          display: inline-flex !important;
        }
      `}</style>

      {/* 返回按钮 */}
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={onBack}
        title="返回"
        style={{
          position: 'absolute', top: 20, left: 24, zIndex: 10,
          width: 36, height: 36, borderRadius: '50%',
          background: 'rgba(0,0,0,0.35)',
          border: '1px solid rgba(255,255,255,0.15)',
          color: '#fff', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
      </motion.button>

      {isLoading && (
        <div style={{ padding: '40px', display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ display: 'flex', gap: 32, alignItems: 'center' }}>
            <div className="shimmer-skeleton" style={{ width: 180, height: 180, borderRadius: '50%' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
              <div className="shimmer-skeleton" style={{ width: '30%', height: 32, borderRadius: 6 }} />
              <div className="shimmer-skeleton" style={{ width: '60%', height: 14, borderRadius: 4 }} />
              <div className="shimmer-skeleton" style={{ width: '45%', height: 14, borderRadius: 4 }} />
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 24 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{ display: 'flex', gap: 16, alignItems: 'center', padding: '12px 16px' }}>
                <div className="shimmer-skeleton" style={{ width: 24, height: 20, borderRadius: 4 }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                  <div className="shimmer-skeleton" style={{ width: '30%', height: 16, borderRadius: 4 }} />
                  <div className="shimmer-skeleton" style={{ width: '15%', height: 12, borderRadius: 4 }} />
                </div>
                <div className="shimmer-skeleton" style={{ width: '20%', height: 16, borderRadius: 4 }} />
              </div>
            ))}
          </div>
        </div>
      )}

      {loadError && !isLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '70vh', color: 'var(--color-text-faint)', gap: 16 }}>
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span style={{ fontSize: 16 }}>{loadError}</span>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={load}
            style={{ padding: '8px 24px', borderRadius: 8, background: 'var(--color-primary, #6366f1)', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 500 }}
          >
            重试
          </motion.button>
        </div>
      )}

      {!isLoading && !loadError && artist && (
        <>
          {/* 沉浸式头部 */}
          <div style={{
            position: 'relative', height: 320, display: 'flex', alignItems: 'flex-end',
            padding: '0 40px 40px', overflow: 'hidden',
          }}>
            <div style={{
              position: 'absolute', inset: 0, zIndex: 0,
              backgroundImage: coverUrl ? `url(${coverUrl})` : 'none',
              backgroundColor: 'var(--color-bg-alt)',
              backgroundSize: 'cover', backgroundPosition: 'center',
              filter: 'blur(60px) brightness(0.55)',
              transform: 'scale(1.2)',
            }} />
            <div style={{ position: 'absolute', inset: 0, zIndex: 1, background: 'linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.45) 100%)' }} />

            <div style={{ position: 'relative', zIndex: 2, display: 'flex', gap: 32, alignItems: 'flex-end', width: '100%' }}>
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 20 }}
                style={{
                  width: 180, height: 180, borderRadius: '50%', overflow: 'hidden',
                  boxShadow: '0 16px 40px rgba(0,0,0,0.5)', flexShrink: 0,
                  border: '3px solid rgba(255,255,255,0.2)', background: 'var(--color-bg-placeholder)',
                }}
              >
                {coverUrl ? (
                  <img
                    src={coverUrl}
                    alt={artist.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={(e) => { e.currentTarget.style.opacity = '0'; }}
                  />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)' }}>
                    <span style={{ fontSize: 64, fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>{artist.name?.charAt(0) || '♪'}</span>
                  </div>
                )}
              </motion.div>

              <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }} style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'rgba(255,255,255,0.65)' }}>歌手</span>
                <h1 style={{ fontSize: 44, fontWeight: 800, margin: '8px 0 12px', letterSpacing: -1, color: '#fff', lineHeight: 1.1, maxWidth: 640, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {artist.name}
                </h1>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.75)' }}>
                  {songsTotal != null ? `共 ${songsTotal} 首歌曲` : '歌曲加载中...'}
                  {artist.albums && artist.albums.length > 0 ? ` • ${artist.albums.length} 张专辑` : ''}
                </div>
              </motion.div>
            </div>
          </div>

          {/* 操作栏 */}
          <div style={{ padding: '24px 40px', display: 'flex', alignItems: 'center', gap: 20 }}>
            <motion.button
              onClick={handlePlayAll}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              disabled={songs.length === 0}
              style={{
                width: 56, height: 56, borderRadius: '50%', background: 'var(--color-primary, #6366f1)', border: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
                cursor: songs.length === 0 ? 'not-allowed' : 'pointer',
                opacity: songs.length === 0 ? 0.5 : 1,
                boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4l14 8-14 8V4z"/></svg>
            </motion.button>
            <span style={{ fontSize: 14, color: 'var(--color-text-dim)' }}>播放全部</span>
          </div>

          {/* 简介 */}
          {artist.desc && (
            <div style={{ padding: '0 40px 12px' }}>
              <div
                className="md-desc-text"
                style={{
                  margin: 0, fontSize: 13, lineHeight: 1.7, color: 'var(--color-text-dim)',
                  display: '-webkit-box', WebkitLineClamp: descExpanded ? undefined : 3, WebkitBoxOrient: 'vertical',
                  overflow: 'hidden', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}
              >
                {artist.desc}
              </div>
              {artist.desc.length > 180 && (
                <button
                  onClick={() => setDescExpanded(v => !v)}
                  style={{
                    background: 'none', border: 'none', padding: 0, marginTop: 6,
                    color: 'var(--color-primary)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  {descExpanded ? '收起' : '展开'}
                </button>
              )}
            </div>
          )}

          {/* 歌曲 / 专辑 Tab */}
          {artist.albums && artist.albums.length > 0 && (
            <div style={{ padding: '0 40px 8px', display: 'flex', gap: 10 }}>
              {([['songs', '歌曲'], ['albums', `专辑 (${artist.albums.length})`]] as const).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  style={{
                    padding: '8px 20px', borderRadius: 24, fontSize: 13, fontWeight: 600,
                    background: activeTab === id ? 'var(--color-primary, #6366f1)' : 'var(--glass-2)',
                    border: `1px solid ${activeTab === id ? 'var(--color-primary)' : 'var(--glass-border)'}`,
                    color: activeTab === id ? '#fff' : 'var(--color-text)',
                    boxShadow: activeTab === id ? 'none' : 'none',
                    cursor: 'pointer', transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* 专辑网格 */}
          {artist.albums && artist.albums.length > 0 && activeTab === 'albums' && (
            <div style={{ padding: '8px 40px 0' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 20 }}>
                {artist.albums.map((alb, index) => (
                  <motion.div
                    key={alb.id}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03, ease: 'easeOut' }}
                    whileHover={{ y: -4 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => openAlbum(alb.id, alb.name)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div style={{ width: '100%', aspectRatio: '1/1', borderRadius: 12, overflow: 'hidden', marginBottom: 10, background: 'var(--color-bg-placeholder)', boxShadow: '0 4px 16px rgba(0,0,0,0.15)' }}>
                      {alb.cover ? (
                        <img
                          src={api.getProxyImageUrl(alb.cover)}
                          alt={alb.name}
                          loading="lazy"
                          decoding="async"
                          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                      ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, rgba(99,102,241,0.5) 0%, rgba(139,92,246,0.5) 100%)' }}>
                          <svg width="32" height="32" viewBox="0 0 24 24" fill="rgba(255,255,255,0.7)"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 4a6 6 0 1 1 0 12 6 6 0 0 1 0-12zm0 3a3 3 0 1 0 0 6 3 3 0 0 0 0-3z"/></svg>
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{alb.name}</div>
                    {alb.date && (
                      <div style={{ fontSize: 11, color: 'var(--color-text-faint)', marginTop: 4 }}>{alb.date.slice(0, 4)}</div>
                    )}
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {/* 歌曲列表（懒加载）：无专辑时直接展示；有专辑时由 Tab 控制 */}
          {(!artist.albums || artist.albums.length === 0 || activeTab === 'songs') && (
          <div style={{ padding: '24px 40px 0' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '0 0 16px' }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-text)', margin: 0 }}>歌曲</h2>
              <span style={{ fontSize: 12, color: 'var(--color-text-faint)' }}>{songsCountLabel}</span>
            </div>

            {songsLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} style={{ display: 'flex', gap: 16, alignItems: 'center', padding: '12px 16px' }}>
                    <div className="shimmer-skeleton" style={{ width: 24, height: 20, borderRadius: 4 }} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                      <div className="shimmer-skeleton" style={{ width: '30%', height: 16, borderRadius: 4 }} />
                      <div className="shimmer-skeleton" style={{ width: '15%', height: 12, borderRadius: 4 }} />
                    </div>
                    <div className="shimmer-skeleton" style={{ width: '20%', height: 16, borderRadius: 4 }} />
                  </div>
                ))}
              </div>
            ) : songsFailed && songs.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-faint)' }}>
                <div style={{ fontSize: 14, marginBottom: 16 }}>歌曲加载失败</div>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => { songsOffsetRef.current = 0; loadMoreSongs(true); }}
                  style={{ padding: '8px 24px', borderRadius: 8, background: 'var(--color-primary, #6366f1)', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 500 }}
                >
                  重试
                </motion.button>
              </div>
            ) : songs.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-faint)' }}>
                暂无歌曲
              </div>
            ) : (
              <>
                <div style={{
                  display: 'grid', gridTemplateColumns: '40px 1fr 1fr 80px', padding: '0 16px 12px',
                  borderBottom: '1px solid var(--color-border, rgba(255,255,255,0.04))', color: 'var(--color-text-dim, rgba(255,255,255,0.65))',
                  fontSize: 13, fontWeight: 500, letterSpacing: 0.5, marginBottom: 16, alignItems: 'center',
                }}>
                  {/* 与 ArtistTrackRow 第 1 列对齐：同样在 flex 子容器左对齐，保持视觉一致 */}
                  <div style={{ display: 'flex', alignItems: 'center' }}><span>#</span></div>
                  <div>标题</div>
                  <div>专辑</div>
                  {/* 时长表头：与行时长单元格统一宽度基准 */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-text-faint)' }}><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {songs.map((track, i) => (
                    <ArtistTrackRow
                      key={`${track.id}-${i}`}
                      track={track}
                      index={i}
                      isCurrent={current?.id === track.id}
                      isPlaying={isPlaying}
                      onPlay={handlePlayTrack}
                      onOpenAlbum={openAlbum}
                    />
                  ))}
                </div>

                {/* 懒加载哨兵 + 底部状态 */}
                {songsHasMore && <div ref={sentinelRef} style={{ height: 1 }} />}
                {songsLoadingMore && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '16px 0', color: 'var(--color-text-dim)' }}>
                    <span style={{ display: 'inline-block', width: 16, height: 16, borderRadius: '50%', border: '2px solid var(--color-text-dim)', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
                    <span style={{ fontSize: 13 }}>加载中...</span>
                  </div>
                )}
                {!songsHasMore && !songsLoadingMore && (
                  <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--color-text-faint)', fontSize: 12 }}>
                    已加载全部歌曲
                  </div>
                )}
              </>
            )}
          </div>
          )}
        </>
      )}
    </div>
  );
}
