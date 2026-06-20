import { useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { usePlaybackStore } from '../stores/playbackStore';
import { useHomeStore } from '../stores/homeStore';
import { useToastStore } from '../stores/toastStore';
import * as api from '../api/client';
import { getSongCoverUrl } from '../utils/cover';
import type { Song } from '../types/playback';
import '../styles/home.css';

interface HomePageProps {
  onNavigate?: (route: { page: string; id?: string; source?: string }) => void;
}

const Skeleton = ({ width, height, borderRadius = 8 }: { width: number | string; height: number; borderRadius?: number }) => (
  <div className="shimmer-skeleton" style={{ width, height, borderRadius }} />
);

export function HomePage({ onNavigate }: HomePageProps) {
  const { recommendations, toplists, newSongs, isLoading, fetchHomeData } = useHomeStore();
  const setQueue = usePlaybackStore((s) => s.setQueue);
  const { showToast } = useToastStore();

  useEffect(() => {
    fetchHomeData();
  }, [fetchHomeData]);

  const handleRefresh = useCallback(() => {
    fetchHomeData();
  }, [fetchHomeData]);

  // Preload playlist/toplist covers so opening PlaylistView is instant
  useEffect(() => {
    const urls = new Set<string>();
    recommendations.forEach(r => { if (r.cover) urls.add(api.getProxyImageUrl(r.cover)); });
    toplists.forEach(t => { if (t.cover) urls.add(api.getProxyImageUrl(t.cover)); });
    urls.forEach(u => { const img = new Image(); img.src = u; });
  }, [recommendations, toplists]);

  const handlePlaySong = (songs: Song[], startIndex: number) => {
    setQueue(songs, startIndex);
    showToast(`正在播放: ${songs[startIndex]?.name || '未知歌曲'}`, 'success');
  };

  return (
    <div style={{ padding: '32px 40px', paddingBottom: 120, minHeight: '100%' }}>
      {/* Hero Section: "今日为你推荐" */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 className="section-title" style={{ marginBottom: 0 }}>今日为你推荐</h2>
        <button
          onClick={handleRefresh}
          disabled={isLoading}
          style={{
            background: 'var(--color-surface-hover)',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            padding: '6px 14px',
            color: 'var(--color-icon)',
            fontSize: 13,
            cursor: isLoading ? 'not-allowed' : 'pointer',
            opacity: isLoading ? 0.5 : 1,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-surface-active)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--color-surface-hover)'; }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
          刷新
        </button>
      </div>
      <div className="hero-grid">
        {isLoading ? (
          <>
            <div className="hero-main-card"><Skeleton width="100%" height={180} borderRadius={14} /></div>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i}><Skeleton width="100%" height={160} borderRadius={12} /></div>
            ))}
          </>
        ) : (
          <>
            {/* Big Banner Card — landscape with blurred bg, text left, cover right */}
            {newSongs.length > 0 && (
              <div className="hero-main-card">
                <motion.div
                  className="song-card hero-banner"
                  initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05, ease: 'easeOut' }}
                  whileHover={{ y: -3 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => handlePlaySong(newSongs, 0)}
                >
                  {/* Blurred background */}
                  <div
                    className="hero-banner-bg"
                    style={{ backgroundImage: `url(${getSongCoverUrl(newSongs[0], 300)})` }}
                  />
                  {/* Dark overlay */}
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 1 }} />
                  {/* Content */}
                  <div className="hero-banner-content">
                    <div className="hero-banner-text">
                      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--color-text-on-dark-faint)', marginBottom: 2 }}>猜你喜欢</div>
                      <div style={{ fontSize: 22, fontWeight: 700, color: '#ffffff', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{newSongs[0].name}</div>
                      <div style={{ fontSize: 13, color: 'var(--color-text-on-dark-dim)', marginTop: 4 }}>{newSongs[0].artist}</div>
                      <button className="hero-play-btn" onClick={(e) => { e.stopPropagation(); handlePlaySong(newSongs, 0); }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                      </button>
                    </div>
                    <div className="hero-banner-cover">
                      <img src={getSongCoverUrl(newSongs[0], 300)} alt={newSongs[0].name} />
                    </div>
                  </div>
                </motion.div>
              </div>
            )}
            {/* Small Square Cards */}
            {newSongs.slice(1, 5).map((song, index) => (
              <motion.div
                key={song.id}
                className="song-card"
                style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column' }}
                initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: (index + 1) * 0.05 + 0.05, ease: 'easeOut' }}
                whileHover={{ y: -4 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handlePlaySong(newSongs, index + 1)}
              >
                <div className="card-container" style={{ width: '100%', aspectRatio: '1/1', borderRadius: 12, marginBottom: 12 }}>
                  <img
                    src={getSongCoverUrl(song, 300)}
                    alt={song.name}
                    className="card-image"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  <div className="play-overlay" style={{ borderRadius: 12 }}>
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#fff' }}><path d="M8 5v14l11-7z"/></svg>
                  </div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.name}</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-faint)', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.artist}</div>
              </motion.div>
            ))}
          </>
        )}
      </div>

      {/* Playlist Grid 1: "你的歌单宝藏库" */}
      <h2 className="section-title">你的歌单宝藏库</h2>
      <div className="six-col-grid">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i}><Skeleton width="100%" height={160} borderRadius={12} /></div>
          ))
        ) : (
          recommendations.slice(0, 6).map((rec, index) => (
            <motion.div
              key={rec.id}
              className="song-card"
              style={{ cursor: 'pointer' }}
              initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: index * 0.05, ease: 'easeOut' }}
              whileHover={{ y: -4 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => { if (onNavigate) onNavigate({ page: 'playlist', id: rec.id, source: 'tencent' }); }}
            >
              <div className="card-container" style={{ width: '100%', aspectRatio: '1/1', borderRadius: 12, marginBottom: 12 }}>
                {rec.cover && (
                  <img src={api.getProxyImageUrl(rec.cover)} alt={rec.name} className="card-image" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" decoding="async" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                )}
                <div className="play-overlay" style={{ borderRadius: 12 }}>
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#fff' }}><path d="M8 5v14l11-7z"/></svg>
                </div>
                {rec.trackCount && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3, position: 'absolute', bottom: 6, right: 8, background: 'rgba(0,0,0,0.6)', padding: '3px 6px', borderRadius: 10, fontSize: 11, color: 'rgba(255,255,255,0.9)', zIndex: 1, backdropFilter: 'blur(4px)' }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                    {Number(rec.trackCount) > 100000000 ? (Number(rec.trackCount) / 100000000).toFixed(1) + '亿' : Number(rec.trackCount) > 10000 ? (Number(rec.trackCount) / 10000).toFixed(1) + '万' : rec.trackCount}
                  </div>
                )}
              </div>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.4 }}>{rec.name}</div>
            </motion.div>
          ))
        )}
      </div>

      {/* Playlist Grid 2: "随时随地，停不下来" (Using toplists) */}
      <h2 className="section-title">随时随地，停不下来</h2>
      <div className="six-col-grid">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i}><Skeleton width="100%" height={160} borderRadius={12} /></div>
          ))
        ) : (
          toplists.slice(0, 6).map((top, index) => (
            <motion.div
              key={top.id}
              className="song-card"
              style={{ cursor: 'pointer' }}
              initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: index * 0.05, ease: 'easeOut' }}
              whileHover={{ y: -4 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => { if (onNavigate) onNavigate({ page: 'playlist', id: top.id, source: 'toplist' }); }}
            >
              <div className="card-container" style={{ width: '100%', aspectRatio: '1/1', borderRadius: 12, marginBottom: 12 }}>
                {top.cover && (
                  <img src={api.getProxyImageUrl(top.cover)} alt={top.name} className="card-image" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" decoding="async" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                )}
                <div className="play-overlay" style={{ borderRadius: 12 }}>
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#fff' }}><path d="M8 5v14l11-7z"/></svg>
                </div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{top.name}</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-faint)', marginTop: 4 }}>Top Charts</div>
            </motion.div>
          ))
        )}
      </div>

      {/* Track Grid 1: "听「新歌」也会喜欢" */}
      <h2 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        听「热门新歌」也会喜欢
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.8 }}><path d="M8 5v14l11-7z"/></svg>
      </h2>
      <div className="track-grid">
        {isLoading ? (
          Array.from({ length: 9 }).map((_, i) => (
            <div key={i} style={{ display: 'flex', gap: 12 }}>
               <Skeleton width={56} height={56} borderRadius={8} />
               <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8 }}>
                 <Skeleton width="80%" height={14} borderRadius={4} />
                 <Skeleton width="40%" height={12} borderRadius={4} />
               </div>
            </div>
          ))
        ) : (
          newSongs.slice(6, 15).map((song, index) => (
            <motion.div
              key={song.id}
              className="track-item-card"
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '8px',
                borderRadius: 12, cursor: 'pointer', transition: 'background 0.2s',
              }}
              initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3, delay: index * 0.04, ease: 'easeOut' }}
              whileHover={{ background: 'var(--color-surface-hover)' }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handlePlaySong(newSongs, index + 6)}
            >
              <div className="card-container" style={{ width: 56, height: 56, borderRadius: 8, flexShrink: 0 }}>
                <img
                  src={getSongCoverUrl(song, 150)}
                  alt={song.name}
                  className="card-image"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  loading="lazy"
                  decoding="async"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
                <div className="play-overlay" style={{ borderRadius: 8 }}>
                   <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" style={{ color: 'var(--color-text)' }}><path d="M8 5v14l11-7z"/></svg>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, justifyContent: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.name}</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-faint)', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.artist}</div>
              </div>
            </motion.div>
          ))
        )}
      </div>

      {/* Playlist Grid 3: "根据你爱的歌曲推荐" */}
      <h2 className="section-title">根据你爱的歌曲推荐</h2>
      <div className="six-col-grid">
        {isLoading ? null : recommendations.slice(6, 12).map((rec) => (
          <motion.div
            key={rec.id}
            className="song-card"
            style={{ cursor: 'pointer' }}
            whileHover={{ y: -4 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => { if (onNavigate) onNavigate({ page: 'playlist', id: rec.id, source: 'tencent' }); }}
          >
            <div className="card-container" style={{ width: '100%', aspectRatio: '1/1', borderRadius: 12, marginBottom: 12 }}>
              {rec.cover && (
                <img src={api.getProxyImageUrl(rec.cover)} alt={rec.name} className="card-image" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" decoding="async" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
              )}
              <div className="play-overlay" style={{ borderRadius: 12 }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor" style={{ color: 'var(--color-text)' }}><path d="M8 5v14l11-7z"/></svg>
              </div>
            </div>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.4 }}>{rec.name}</div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
