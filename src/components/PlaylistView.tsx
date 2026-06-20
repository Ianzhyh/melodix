import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { usePlaybackStore } from '../stores/playbackStore';
import * as api from '../api/client';
import { getSongCoverUrl } from '../utils/cover';
import type { PlaylistDetail, Song } from '../types/playback';

interface PlaylistViewProps {
  playlistId?: string;
  source?: string;
}

interface PlaylistTrackRowProps {
  track: Song;
  index: number;
  displayIndex: number;
  isCurrent: boolean;
  isPlaying: boolean;
  onPlay: (track: Song, index: number) => void;
  durationLabel: string;
}

const PlaylistTrackRow = memo(function PlaylistTrackRow({
  track,
  index,
  displayIndex,
  isCurrent,
  isPlaying,
  onPlay,
  durationLabel,
}: PlaylistTrackRowProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 + index * 0.03 }}
      className="playlist-grid pv-track-row"
      whileHover={{ background: 'var(--color-hover, rgba(255,255,255,0.03))' }}
      whileTap={{ scale: 0.995 }}
      onClick={() => onPlay(track, index)}
      style={{
        display: 'grid', gridTemplateColumns: '40px 1fr 1fr 80px', padding: '12px 16px',
        borderRadius: 8, cursor: 'pointer', alignItems: 'center', transition: 'background 0.2s'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
        <span className="pv-track-index" style={{ color: isCurrent ? 'var(--color-primary, #6366f1)' : 'var(--color-text-faint, rgba(255,255,255,0.45))', fontSize: 14 }}>{displayIndex}</span>
        <span className="pv-play-icon" style={{ display: 'none', color: isCurrent ? 'var(--color-primary, #6366f1)' : '#fff' }}>
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
      <div className="playlist-album-col" style={{ color: 'var(--color-text-dim, rgba(255,255,255,0.65))', fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{track.album}</div>
      <div style={{ textAlign: 'right', color: 'var(--color-text-dim, rgba(255,255,255,0.65))', fontSize: 14 }}>
        {durationLabel}
      </div>
    </motion.div>
  );
});

import { Vibrant } from 'node-vibrant/browser';

export function PlaylistView({ playlistId, source = 'netease' }: PlaylistViewProps) {
  const [playlist, setPlaylist] = useState<PlaylistDetail | null>(null);
  const [headerTextColor, setHeaderTextColor] = useState<string>('rgba(255,255,255,0.95)');
  const allToplistSongsRef = useRef<Song[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [jumpInput, setJumpInput] = useState('');
  const PAGE_SIZE = 30;
  const { setQueue, current, isPlaying } = usePlaybackStore();

  const loadPage = useCallback(async (page: number) => {
    if (!playlistId) return;
    setIsLoading(true);
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
    } catch {
    } finally {
      setIsLoading(false);
    }
  }, [playlistId, source]);

  useEffect(() => {
    if (!playlistId) return;
    allToplistSongsRef.current = [];
    setCurrentPage(1);
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
        <span style={{ fontSize: 16 }}>Select a playlist to view</span>
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
        Playlist not found or failed to load.
      </div>
    );
  }

  const coverUrl = getSongCoverUrl(playlist, 400);
  const totalDuration = playlist.tracks.reduce((sum, t) => sum + (t.duration || 0), 0);
  const formatDuration = (s: number) => {
    const mins = Math.floor(s / 60);
    return `${mins} min`;
  };

  return (
    <div style={{ position: 'relative', width: '100%', minHeight: '100%', paddingBottom: 120 }}>
      <style>{`
        .pv-track-row:hover .pv-track-index {
          display: none !important;
        }
        .pv-track-row:hover .pv-play-icon {
          display: inline-flex !important;
        }
        
        /* Media queries for responsive PlaylistView */
        @media (max-width: 768px) {
          .playlist-grid {
            grid-template-columns: 40px 1fr 80px !important;
          }
          .playlist-album-col {
            display: none !important;
          }
        }
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
            <span style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'rgba(255,255,255,0.65)' }}>Playlist</span>
            <h1 style={{ fontSize: 48, fontWeight: 800, margin: '8px 0 16px', letterSpacing: -1.5, color: headerTextColor, lineHeight: 1.1, maxWidth: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {playlist.name}
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'rgba(255,255,255,0.65)' }}>
              <span>{playlist.trackCount} songs</span>
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
      <div style={{ padding: '24px 40px', display: 'flex', alignItems: 'center', gap: 24 }}>
        <motion.button
          onClick={handlePlayAll}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          style={{
            width: 56, height: 56, borderRadius: '50%', background: 'var(--color-primary, #6366f1)', border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', cursor: 'pointer',
            boxShadow: '0 8px 24px var(--color-primary-20, rgba(99,102,241,0.4))'
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4l14 8-14 8V4z"/></svg>
        </motion.button>
      </div>

      {/* Tracklist Table */}
      {playlist.tracks.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-faint, rgba(255,255,255,0.45))' }}>
          This playlist has no tracks.
        </div>
      ) : (
        <div style={{ padding: '0 40px' }}>
          <div className="playlist-grid" style={{
            display: 'grid', gridTemplateColumns: '40px 1fr 1fr 80px', padding: '0 16px 12px',
            borderBottom: '1px solid var(--color-border, rgba(255,255,255,0.04))', color: 'var(--color-text-dim, rgba(255,255,255,0.65))',
            fontSize: 13, fontWeight: 500, letterSpacing: 0.5, marginBottom: 16
          }}>
            <div>#</div>
            <div>TITLE</div>
            <div className="playlist-album-col">ALBUM</div>
            <div style={{ textAlign: 'right' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {playlist.tracks.map((track, i) => (
              <PlaylistTrackRow
                key={`${track.id}-${i}`}
                track={track}
                index={i}
                displayIndex={trackOffset + i + 1}
                isCurrent={current?.id === track.id}
                isPlaying={isPlaying}
                onPlay={handlePlayTrack}
                durationLabel={track.duration ? formatDuration(track.duration) : '--:--'}
              />
            ))}
          </div>

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
                Prev
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
                Next
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
