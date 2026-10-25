import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { usePlaybackStore } from '../stores/playbackStore';
import { useToastStore } from '../stores/toastStore';
import * as api from '../api/client';
import { getSongCoverUrl } from '../utils/cover';
import { onCoverError } from '../utils/coverFallback';
import { ErrorState, DetailSkeleton } from './common/ListStates';
import { TrackList, TrackListHeader } from './common/TrackList';
import { TrackRow } from './common/TrackRow';
import type { AlbumDetail, RouteState } from '../types/playback';

interface AlbumPageProps {
  albumId?: string;
  source?: string;
  fallbackName?: string;
  fallbackCover?: string;
  onNavigate: (route: RouteState) => void;
  onBack: () => void;
}

export function AlbumPage({ albumId, source = 'tencent', fallbackName, fallbackCover, onNavigate, onBack }: AlbumPageProps) {
  const [album, setAlbum] = useState<AlbumDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [descExpanded, setDescExpanded] = useState(false);
  const { setQueue, current, isPlaying, isBuffering } = usePlaybackStore();
  const showToast = useToastStore((s) => s.showToast);

  const load = useCallback(async () => {
    if (!albumId) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await api.getAlbumDetail(albumId, source, { name: fallbackName, cover: fallbackCover });
      if (data) {
        setAlbum(data);
      } else {
        setLoadError('专辑加载失败，请重试');
      }
    } catch (e) {
      console.error('加载专辑失败:', e);
      setLoadError('专辑加载失败，请重试');
    } finally {
      setIsLoading(false);
    }
  }, [albumId, source, fallbackName, fallbackCover]);

  useEffect(() => {
    setAlbum(null);
    load();
  }, [load]);

  const handlePlayAll = () => {
    if (!album || album.tracks.length === 0) return;
    setQueue(album.tracks, 0);
    showToast(`正在播放: ${album.name}`, 'success');
  };

  const handlePlayTrack = (index: number) => {
    if (!album) return;
    setQueue(album.tracks, index);
  };

  const openArtist = useCallback((id: string, name: string) => {
    if (!id) {
      showToast('该平台暂不支持查看歌手', 'info');
      return;
    }
    onNavigate({ page: 'artist', id, source, name });
  }, [source, onNavigate, showToast]);

  return (
    <div style={{ position: 'relative', width: '100%', minHeight: '100%', paddingBottom: 120 }}>
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

      {isLoading && <DetailSkeleton coverSize={200} coverRadius={16} rows={6} />}

      {loadError && !isLoading && (
        <ErrorState message={loadError} onRetry={load} height="70vh" padding={0} />
      )}

      {!isLoading && !loadError && album && (
        <>
          {/* 沉浸式头部 */}
          <div style={{
            position: 'relative', height: 340, display: 'flex', alignItems: 'flex-end',
            padding: '0 40px 40px', overflow: 'hidden',
          }}>
            <div style={{
              position: 'absolute', inset: 0, zIndex: 0,
              backgroundImage: `url(${getSongCoverUrl({ cover: album.cover, picId: album.id, source }, 400)})`,
              backgroundColor: 'var(--color-bg-alt)',
              backgroundSize: 'cover', backgroundPosition: 'center',
              filter: 'blur(60px) brightness(0.6)',
              transform: 'scale(1.2)',
            }} />
            <div style={{ position: 'absolute', inset: 0, zIndex: 1, background: 'linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.45) 100%)' }} />

            <div style={{ position: 'relative', zIndex: 2, display: 'flex', gap: 32, alignItems: 'flex-end', width: '100%' }}>
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 20 }}
                style={{ width: 200, height: 200, borderRadius: 16, overflow: 'hidden', boxShadow: '0 16px 40px rgba(0,0,0,0.5)', flexShrink: 0, background: 'var(--color-bg-placeholder)' }}
              >
                <img
                  src={getSongCoverUrl({ cover: album.cover, picId: album.id, source }, 400)}
                  alt={album.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={onCoverError}
                />
              </motion.div>

              <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }} style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'rgba(255,255,255,0.65)' }}>专辑</span>
                <h1 style={{ fontSize: 44, fontWeight: 800, margin: '8px 0 12px', letterSpacing: -1, color: '#fff', lineHeight: 1.1, maxWidth: 640, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {album.name}
                </h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'rgba(255,255,255,0.75)', flexWrap: 'wrap' }}>
                  {album.artist && (
                    <>
                      <span
                        className="md-text-link"
                        style={{ fontWeight: 600 }}
                        onClick={() => openArtist(album.artistId || '', album.artist)}
                      >
                        {album.artist}
                      </span>
                      <span>•</span>
                    </>
                  )}
                  {album.date && (<><span>{album.date}</span><span>•</span></>)}
                  <span>{album.tracks.length} 首</span>
                  {album.company && (<><span>•</span><span>{album.company}</span></>)}
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
              disabled={album.tracks.length === 0}
              style={{
                width: 56, height: 56, borderRadius: '50%', background: 'var(--color-primary, #6366f1)', border: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
                cursor: album.tracks.length === 0 ? 'not-allowed' : 'pointer',
                opacity: album.tracks.length === 0 ? 0.5 : 1,
                boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4l14 8-14 8V4z"/></svg>
            </motion.button>
            <span style={{ fontSize: 14, color: 'var(--color-text-dim)' }}>播放全部</span>
          </div>

          {/* 简介 */}
          {album.desc && (
            <div style={{ padding: '0 40px 4px' }}>
              <div style={{ position: 'relative' }}>
                {/* 文本主体 */}
                <div
                  style={{
                    fontSize: 13,
                    lineHeight: 1.75,
                    color: 'var(--color-text-dim, rgba(255,255,255,0.6))',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    overflow: 'hidden',
                    maxHeight: descExpanded ? 'none' : '6em',
                    transition: 'max-height 0.35s ease',
                  }}
                >
                  {album.desc}
                </div>

              </div>
              {/* 展开/收起按钮 */}
              {album.desc.length > 200 && (
                <button
                  onClick={() => setDescExpanded(v => !v)}
                  style={{
                    marginTop: 6,
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    color: 'var(--color-primary, #6366f1)',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    opacity: 0.85,
                    transition: 'opacity 0.15s',
                  }}
                >
                  {descExpanded ? '收起' : '展开简介'}
                  <svg
                    width="12" height="12" viewBox="0 0 24 24"
                    fill="none" stroke="currentColor" strokeWidth="2.5"
                    style={{ transform: descExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.25s' }}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
              )}
            </div>
          )}

          {/* 曲目表 */}
          <div style={{ padding: '16px 40px 0' }}>
            <TrackList showCover={false} actionWidth="40px">
              <TrackListHeader showCover={false} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {album.tracks.map((track, i) => (
                  <TrackRow
                    key={`${track.id}-${i}`}
                    song={track}
                    index={i}
                    displayIndex={i + 1}
                    isCurrent={current?.id === track.id}
                    isPlaying={isPlaying}
                    isBuffering={isBuffering}
                    selectMode={false}
                    selected={false}
                    onToggleSelect={() => {}}
                    onPlay={(_song, idx) => handlePlayTrack(idx)}
                    onOpenArtist={(s) => {
                      const a = s.artists && s.artists.length > 0 ? s.artists[0] : null;
                      if (a) openArtist(a.id, a.name);
                    }}
                    showCover={false}
                  />
                ))}
              </div>
            </TrackList>
          </div>
        </>
      )}
    </div>
  );
}
