import React, { useCallback } from 'react';
import { motion } from 'framer-motion';
import { useFavoriteStore } from '../stores/favoriteStore';
import { usePlaybackStore } from '../stores/playbackStore';
import { getSongCoverUrl } from '../utils/cover';
import type { Song } from '../types/playback';

interface FavoriteTrackRowProps {
  song: Song;
  index: number;
  isCurrent: boolean;
  isPlaying: boolean;
  onPlay: (index: number) => void;
  coverUrl: string;
}

const FavoriteTrackRow = React.memo(function FavoriteTrackRow({
  song,
  index,
  isCurrent,
  isPlaying,
  onPlay,
  coverUrl,
}: FavoriteTrackRowProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      className="fv-track-row"
      onClick={() => onPlay(index)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '10px 12px',
        borderRadius: 8,
        cursor: 'pointer',
        transition: 'background 0.15s',
      }}
      whileHover={{ background: 'var(--color-hover, rgba(255,255,255,0.03))' }}
      whileTap={{ scale: 0.995 }}
    >
      <div style={{ width: 24, display: 'flex', justifyContent: 'center', alignItems: 'center', flexShrink: 0 }}>
        <span className="fv-track-index" style={{ fontSize: 13, color: 'var(--color-text-faint, rgba(255,255,255,0.45))' }}>
          {index + 1}
        </span>
        <span className="fv-play-icon" style={{ display: 'none', color: isCurrent ? 'var(--color-primary)' : 'var(--color-text)' }}>
          {isCurrent && isPlaying ? (
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="2" width="3" height="12" rx="0.5"/><rect x="10" y="2" width="3" height="12" rx="0.5"/></svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2l10 6-10 6V2z"/></svg>
          )}
        </span>
      </div>
      <img
        src={coverUrl}
        alt=""
        loading="lazy"
        decoding="async"
        onError={(e) => { e.currentTarget.style.display = 'none'; }}
        style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover', background: 'var(--color-img-placeholder)', flexShrink: 0 }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14,
          fontWeight: 500,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          color: isCurrent ? 'var(--color-primary)' : 'var(--color-text, rgba(255,255,255,0.95))'
        }}>
          {song.name}
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-text-dim, rgba(255,255,255,0.65))', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {song.artist}
        </div>
      </div>
      <span style={{ fontSize: 12, color: 'var(--color-text-dim, rgba(255,255,255,0.65))', flexShrink: 0 }}>
        {song.album}
      </span>
    </motion.div>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.isCurrent === nextProps.isCurrent &&
    prevProps.isPlaying === nextProps.isPlaying &&
    prevProps.coverUrl === nextProps.coverUrl
  );
});

export function FavoritesPage() {
  const favorites = useFavoriteStore((s) => s.favorites);
  const setQueue = usePlaybackStore((s) => s.setQueue);
  const current = usePlaybackStore((s) => s.current);
  const isPlaying = usePlaybackStore((s) => s.isPlaying);

  const handlePlay = useCallback((index: number) => {
    setQueue(favorites, index);
  }, [favorites, setQueue]);

  return (
    <div style={{ padding: '32px 40px', maxWidth: 900 }}>
      <style>{`
        .fv-track-row:hover .fv-track-index {
          display: none !important;
        }
        .fv-track-row:hover .fv-play-icon {
          display: inline-flex !important;
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
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>Liked Songs</h1>
          <p style={{ fontSize: 14, color: 'var(--color-text-dim, rgba(255,255,255,0.65))', margin: '4px 0 0' }}>{favorites.length} songs</p>
        </div>
      </div>
      {favorites.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--color-text-faint, rgba(255,255,255,0.45))' }}>
          <p style={{ fontSize: 16 }}>No liked songs yet</p>
          <p style={{ fontSize: 13, marginTop: 8 }}>Songs you like will appear here</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {favorites.map((song, index) => (
            <FavoriteTrackRow
              key={song.id}
              song={song}
              index={index}
              isCurrent={current?.id === song.id}
              isPlaying={isPlaying}
              onPlay={handlePlay}
              coverUrl={getSongCoverUrl(song, 80)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
