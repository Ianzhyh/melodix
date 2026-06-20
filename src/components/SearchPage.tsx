import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useSearchStore } from '../stores/searchStore';
import { usePlaybackStore } from '../stores/playbackStore';
import { getSongCoverUrl } from '../utils/cover';
import type { Song } from '../types/playback';

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05, delayChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 300, damping: 24 } }
};

interface SearchTrackItemProps {
  song: Song;
  index: number;
  isCurrent: boolean;
  isPlaying: boolean;
  onPlay: (song: Song) => void;
  onAddToQueue: (song: Song) => void;
  coverUrl: string;
  isHovered: boolean;
  onHoverChange: (id: string | null) => void;
}

const SearchTrackItem = React.memo(function SearchTrackItem({
  song,
  onPlay,
  onAddToQueue,
  coverUrl,
  isHovered,
  onHoverChange,
}: SearchTrackItemProps) {
  return (
    <motion.div
      variants={itemVariants}
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '10px 16px',
        borderRadius: 16,
        background: isHovered ? 'var(--color-hover)' : 'transparent',
        cursor: 'pointer',
        border: `1px solid ${isHovered ? 'var(--color-border)' : 'transparent'}`,
        transition: 'background 0.2s, border-color 0.2s',
      }}
      onMouseEnter={() => onHoverChange(song.id)}
      onMouseLeave={() => onHoverChange(null)}
      onClick={() => onPlay(song)}
    >
      <div style={{ position: 'relative', width: 48, height: 48, marginRight: 16, flexShrink: 0 }}>
        <img
          src={coverUrl}
          alt={song.name}
          loading="lazy"
          decoding="async"
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
          style={{ width: '100%', height: '100%', borderRadius: 10, objectFit: 'cover', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}
        />
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.2)', borderRadius: 10, opacity: isHovered ? 1 : 0, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'opacity 0.2s' }} className="play-overlay">
           <svg width="24" height="24" viewBox="0 0 24 24" fill="var(--color-text)"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
        </div>
      </div>
      
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text, #fff)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.name}</div>
        <div style={{ fontSize: 13, color: 'var(--color-text-dim)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.artist} • {song.album}</div>
      </div>

      <div style={{ opacity: isHovered ? 1 : 0, transition: 'opacity 0.2s' }} className="action-buttons">
        <motion.button
          onClick={(e) => { e.stopPropagation(); onAddToQueue(song); }}
          style={{
            padding: '6px 16px',
            borderRadius: 20,
            background: 'var(--glass-2)',
            border: '1px solid var(--glass-border)',
            color: 'var(--color-text, #fff)',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            outline: 'none',
          }}
          whileHover={{ scale: 1.05, background: 'var(--glass-3)' }}
          whileTap={{ scale: 0.95 }}
        >
          Add to Queue
        </motion.button>
      </div>
    </motion.div>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.isCurrent === nextProps.isCurrent &&
    prevProps.isPlaying === nextProps.isPlaying &&
    prevProps.coverUrl === nextProps.coverUrl &&
    prevProps.isHovered === nextProps.isHovered
  );
});

export function SearchPage() {
  const [query, setQuery] = useState('');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const { search, searchResults, isLoading, error } = useSearchStore();
  const addSong = usePlaybackStore((s) => s.addSong);
  const setQueue = usePlaybackStore((s) => s.setQueue);
  const current = usePlaybackStore((s) => s.current);
  const isPlaying = usePlaybackStore((s) => s.isPlaying);

  const handleSearchChange = useCallback((value: string) => {
    setQuery(value);
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      search(query);
    }
  };

  const handlePlaySong = useCallback((song: Song) => {
    const playIndex = searchResults.findIndex(s => s.id === song.id);
    setQueue(searchResults, playIndex);
  }, [searchResults, setQueue]);

  const handleAddToQueue = useCallback((song: Song) => {
    addSong(song);
  }, [addSong]);

  const handleHoverChange = useCallback((id: string | null) => {
    setHoveredId(id);
  }, []);

  return (
    <div style={{ padding: '32px 40px', paddingBottom: 120, color: 'var(--color-text, rgba(255,255,255,0.95))', maxWidth: 1000, margin: '0 auto' }}>
      <motion.h2 
        initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        style={{ fontSize: 32, fontWeight: 700, marginBottom: 24, letterSpacing: -0.5 }}
      >
        Discover
      </motion.h2>

      {/* Search Input Form */}
      <motion.form 
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: 12, marginBottom: 12 }}
      >
        <div style={{ position: 'relative', flex: 1 }}>
          <svg
            style={{ position: 'absolute', left: 20, top: '50%', transform: 'translateY(-50%)', width: 18, height: 18, opacity: 0.4, pointerEvents: 'none' }}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search songs, artists, albums..."
            style={{
              width: '100%',
              padding: '14px 20px 14px 48px',
              borderRadius: 32,
              background: 'var(--glass-2)',
              border: '1px solid var(--glass-border)',
              color: 'var(--color-text, rgba(255,255,255,0.95))',
              outline: 'none',
              fontSize: 15,
              fontWeight: 500,
              boxSizing: 'border-box',
              transition: 'all 0.3s cubic-bezier(0.25, 1, 0.5, 1)',
              boxShadow: '0 4px 24px rgba(0,0,0,0.1)'
            }}
            onFocus={(e) => {
              e.currentTarget.style.background = 'var(--glass-3)';
              e.currentTarget.style.borderColor = 'var(--color-border)';
              e.currentTarget.style.boxShadow = '0 8px 32px rgba(0,0,0,0.2)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.background = 'var(--glass-2)';
              e.currentTarget.style.borderColor = 'var(--glass-border)';
              e.currentTarget.style.boxShadow = '0 4px 24px rgba(0,0,0,0.1)';
            }}
          />
        </div>
        <motion.button
          type="submit"
          disabled={isLoading}
          style={{
            padding: '0 28px',
            borderRadius: 32,
            background: 'var(--color-text, #fff)',
            border: 'none',
            color: 'var(--color-text-inverse, #000)',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            opacity: isLoading ? 0.7 : 1,
            outline: 'none',
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
          }}
          whileHover={{ scale: isLoading ? 1 : 1.05, boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}
          whileTap={{ scale: isLoading ? 1 : 0.95 }}
        >
          {isLoading ? 'Searching...' : 'Search'}
        </motion.button>
      </motion.form>

      {error && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ color: 'var(--color-danger, #ef4444)', marginBottom: 24, padding: 16, background: 'rgba(239,68,68,0.1)', borderRadius: 12 }}>
          {error}
        </motion.div>
      )}

      {/* Results List or Loading Skeleton */}
      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '10px 16px' }}>
              <div className="shimmer-skeleton" style={{ width: 48, height: 48, borderRadius: 10, marginRight: 16 }} />
              <div style={{ flex: 1 }}>
                <div className="shimmer-skeleton" style={{ width: '40%', height: 16, borderRadius: 4, marginBottom: 8 }} />
                <div className="shimmer-skeleton" style={{ width: '25%', height: 12, borderRadius: 4 }} />
              </div>
            </div>
          ))}
        </div>
      ) : searchResults.length > 0 ? (
        <motion.div 
          variants={containerVariants}
          initial="hidden"
          animate="show"
          style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
        >
          {searchResults.map((song, index) => {
            const coverUrl = getSongCoverUrl(song, 300);
            return (
              <SearchTrackItem
                key={song.id}
                song={song}
                index={index}
                isCurrent={current?.id === song.id}
                isPlaying={isPlaying}
                onPlay={handlePlaySong}
                onAddToQueue={handleAddToQueue}
                coverUrl={coverUrl}
                isHovered={hoveredId === song.id}
                onHoverChange={handleHoverChange}
              />
            );
          })}
        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ textAlign: 'center', padding: '80px 0', color: 'var(--color-text-dim)' }}>
          <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'center' }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </div>
          <div style={{ fontSize: 16, fontWeight: 500, letterSpacing: 0.5 }}>Find your next favorite track</div>
        </motion.div>
      )}
    </div>
  );
}
