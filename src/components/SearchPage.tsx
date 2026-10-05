import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useSearchStore } from '../stores/searchStore';
import { usePlaybackStore } from '../stores/playbackStore';
import { useToastStore } from '../stores/toastStore';
import { getSongCoverUrl } from '../utils/cover';
import * as api from '../api/client';
import type { RouteState, SearchAlbumItem, SearchArtistItem, SearchPlaylistItem, Song } from '../types/playback';
import { AddToLibraryButton } from './AddToLibraryModal';

interface SearchPageProps {
  onNavigate: (route: RouteState) => void;
}

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
  onOpenArtist: (id: string, name: string) => void;
  onOpenAlbum: (id: string, name: string) => void;
  coverUrl: string;
  isHovered: boolean;
  onHoverChange: (id: string | null) => void;
}

const SearchTrackItem = React.memo(function SearchTrackItem({
  song,
  index,
  isCurrent,
  isPlaying,
  onPlay,
  onAddToQueue,
  onOpenArtist,
  onOpenAlbum,
  coverUrl,
  isHovered,
  onHoverChange,
}: SearchTrackItemProps) {
  return (
    <motion.div
      variants={itemVariants}
      className="sp-track-row"
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '10px 16px',
        borderRadius: 8,
        background: isHovered ? 'var(--color-hover)' : 'transparent',
        cursor: 'pointer',
        border: `1px solid ${isHovered ? 'var(--color-border)' : 'transparent'}`,
        transition: 'background 0.2s, border-color 0.2s',
      }}
      onMouseEnter={() => onHoverChange(song.id)}
      onMouseLeave={() => onHoverChange(null)}
      onClick={() => onPlay(song)}
    >
      <div style={{ width: 24, display: 'flex', justifyContent: 'center', alignItems: 'center', flexShrink: 0, marginRight: 10 }}>
        <span className="sp-track-index" style={{ fontSize: 13, color: isCurrent ? 'var(--color-primary, #6366f1)' : 'var(--color-text-faint, rgba(255,255,255,0.45))' }}>
          {index + 1}
        </span>
        <span className="sp-play-icon" style={{ display: 'none', color: isCurrent ? 'var(--color-primary, #6366f1)' : 'var(--color-text)' }}>
          {isCurrent && isPlaying ? (
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="2" width="3" height="12" rx="0.5"/><rect x="10" y="2" width="3" height="12" rx="0.5"/></svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2l10 6-10 6V2z"/></svg>
          )}
        </span>
      </div>
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
        <div style={{ fontSize: 15, fontWeight: 600, color: isCurrent ? 'var(--color-primary, #6366f1)' : 'var(--color-text, #fff)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.name}</div>
        <div style={{ fontSize: 13, color: 'var(--color-text-dim)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {song.artists && song.artists.length > 0 ? (
            song.artists.map((a, i) => (
              <span key={`${a.id}-${i}`}>
                <span className="md-text-link" onClick={(e) => { e.stopPropagation(); onOpenArtist(a.id, a.name); }}>{a.name}</span>
                {i < song.artists!.length - 1 ? ', ' : ''}
              </span>
            ))
          ) : (
            <span>{song.artist}</span>
          )}
          {song.album ? (<span> • </span>) : null}
          {song.albumId ? (
            <span className="md-text-link" onClick={(e) => { e.stopPropagation(); onOpenAlbum(song.albumId!, song.album); }}>{song.album}</span>
          ) : (
            <span>{song.album}</span>
          )}
        </div>
      </div>

      <div style={{ opacity: isHovered ? 1 : 0, transition: 'opacity 0.2s', display: 'flex', gap: 8 }} className="action-buttons">
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
          加入队列
        </motion.button>
        <AddToLibraryButton song={song} />
      </div>
    </motion.div>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.song === nextProps.song &&
    prevProps.index === nextProps.index &&
    prevProps.isCurrent === nextProps.isCurrent &&
    prevProps.isPlaying === nextProps.isPlaying &&
    prevProps.coverUrl === nextProps.coverUrl &&
    prevProps.isHovered === nextProps.isHovered
  );
});

// 歌手搜索结果行
const SearchArtistRow = React.memo(function SearchArtistRow({
  item,
  onOpen,
}: {
  item: SearchArtistItem;
  onOpen: (id: string, name: string) => void;
}) {
  return (
    <motion.div
      variants={itemVariants}
      onClick={() => onOpen(item.id, item.name)}
      style={{
        display: 'flex', alignItems: 'center', gap: 14, padding: '10px 16px',
        borderRadius: 8, cursor: 'pointer', background: 'transparent', transition: 'background 0.2s',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--color-hover)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
    >
      <div style={{ width: 48, height: 48, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: 'var(--color-bg-placeholder)', border: '1px solid var(--color-border)' }}>
        {item.pic ? (
          <img
            src={api.getProxyImageUrl(item.pic)}
            alt={item.name}
            loading="lazy"
            decoding="async"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, rgba(99,102,241,0.5) 0%, rgba(139,92,246,0.5) 100%)' }}>
            <span style={{ fontSize: 20, fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>{item.name?.charAt(0) || '♪'}</span>
          </div>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text, #fff)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
        <div style={{ fontSize: 12, color: 'var(--color-text-dim)', marginTop: 2 }}>
          {item.songCount ? `${item.songCount} 首歌` : ''}
          {item.songCount && item.albumCount ? ' · ' : ''}
          {item.albumCount ? `${item.albumCount} 张专辑` : ''}
        </div>
      </div>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-faint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
    </motion.div>
  );
});

// 专辑搜索结果行
const SearchAlbumRow = React.memo(function SearchAlbumRow({
  item,
  onOpen,
}: {
  item: SearchAlbumItem;
  onOpen: (id: string, name: string) => void;
}) {
  return (
    <motion.div
      variants={itemVariants}
      onClick={() => onOpen(item.id, item.name)}
      style={{
        display: 'flex', alignItems: 'center', gap: 14, padding: '10px 16px',
        borderRadius: 8, cursor: 'pointer', background: 'transparent', transition: 'background 0.2s',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--color-hover)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
    >
      <div style={{ width: 48, height: 48, borderRadius: 10, overflow: 'hidden', flexShrink: 0, background: 'var(--color-bg-placeholder)', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
        {item.cover ? (
          <img
            src={api.getProxyImageUrl(item.cover)}
            alt={item.name}
            loading="lazy"
            decoding="async"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, rgba(99,102,241,0.5) 0%, rgba(139,92,246,0.5) 100%)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="rgba(255,255,255,0.7)"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 4a6 6 0 1 1 0 12 6 6 0 0 1 0-12zm0 3a3 3 0 1 0 0 6 3 3 0 0 0 0-3z"/></svg>
          </div>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text, #fff)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
        <div style={{ fontSize: 12, color: 'var(--color-text-dim)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {item.artist ? `${item.artist}` : ''}
          {item.date ? ` · ${item.date.slice(0, 4)}` : ''}
          {item.songCount ? ` · ${item.songCount} 首` : ''}
        </div>
      </div>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-faint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
    </motion.div>
  );
});

// 歌单搜索结果行
const SearchPlaylistRow = React.memo(function SearchPlaylistRow({
  item,
  onOpen,
}: {
  item: SearchPlaylistItem;
  onOpen: (id: string, name: string) => void;
}) {
  return (
    <motion.div
      variants={itemVariants}
      onClick={() => onOpen(item.id, item.name)}
      style={{
        display: 'flex', alignItems: 'center', gap: 14, padding: '10px 16px',
        borderRadius: 8, cursor: 'pointer', background: 'transparent', transition: 'background 0.2s',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--color-hover)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
    >
      <div style={{ width: 48, height: 48, borderRadius: 10, overflow: 'hidden', flexShrink: 0, background: 'var(--color-bg-placeholder)', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
        {item.cover ? (
          <img
            src={api.getProxyImageUrl(item.cover)}
            alt={item.name}
            loading="lazy"
            decoding="async"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, rgba(99,102,241,0.5) 0%, rgba(139,92,246,0.5) 100%)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="rgba(255,255,255,0.7)"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
          </div>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text, #fff)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
        <div style={{ fontSize: 12, color: 'var(--color-text-dim)', marginTop: 2 }}>
          {item.trackCount ? `${item.trackCount} 首` : '歌单'}
        </div>
      </div>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-faint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
    </motion.div>
  );
});

export function SearchPage({ onNavigate }: SearchPageProps) {
  // 主页搜索框跳转过来时，用最近一次搜索词回填输入框
  const [query, setQuery] = useState(() => useSearchStore.getState().currentKeywords || '');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const { search, searchResults, artists, albums, playlists, isLoading, error, loadMore, loadingMore, hasMore, platform, searchType, setSearchType } = useSearchStore();
  const addSong = usePlaybackStore((s) => s.addSong);
  const showToast = useToastStore((s) => s.showToast);
  const setQueue = usePlaybackStore((s) => s.setQueue);
  const current = usePlaybackStore((s) => s.current);
  const isPlaying = usePlaybackStore((s) => s.isPlaying);

  // 各平台支持的综合搜索类型（腾讯无公开歌单搜索接口）
  const searchTabs = useMemo(() => {
    if (platform === 'netease') {
      return [
        { id: 'song' as const, label: '单曲' },
        { id: 'artist' as const, label: '歌手' },
        { id: 'album' as const, label: '专辑' },
        { id: 'playlist' as const, label: '歌单' },
      ];
    }
    if (platform === 'tencent') {
      return [
        { id: 'song' as const, label: '单曲' },
        { id: 'artist' as const, label: '歌手' },
        { id: 'album' as const, label: '专辑' },
      ];
    }
    return [{ id: 'song' as const, label: '单曲' }];
  }, [platform]);

  // 列表底部哨兵节点，用于 IntersectionObserver 触发分页加载
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // 监听哨兵进入视口，触发 loadMore；rootMargin 提前 200px 预加载。
  // deps 带 searchResults.length/hasMore：结果加载完成后哨兵才挂载，必须重建 observer
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        loadMore();
      }
    }, { rootMargin: '200px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadMore, searchResults.length, hasMore]);

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
    showToast('已加入播放队列', 'info');
  }, [addSong, showToast]);

  const handleHoverChange = useCallback((id: string | null) => {
    setHoveredId(id);
  }, []);

  const handleOpenArtist = useCallback((id: string, name: string) => {
    if (!id) {
      showToast('该平台暂不支持查看歌手', 'info');
      return;
    }
    onNavigate({ page: 'artist', id, source: platform, name });
  }, [platform, onNavigate, showToast]);

  const handleOpenAlbum = useCallback((id: string, name: string) => {
    if (!id) {
      showToast('该平台暂不支持查看专辑', 'info');
      return;
    }
    onNavigate({ page: 'album', id, source: platform, name });
  }, [platform, onNavigate, showToast]);

  return (
    <div style={{ padding: 'clamp(20px, 3vw, 40px)', paddingBottom: 120, color: 'var(--color-text, rgba(255,255,255,0.95))', maxWidth: 1200, margin: '0 auto' }}>
      <motion.h2 
        initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        style={{ fontSize: 32, fontWeight: 700, marginBottom: 24, letterSpacing: -0.5 }}
      >
        发现
      </motion.h2>

      <style>{`
        .sp-track-row:hover .sp-track-index {
          display: none !important;
        }
        .sp-track-row:hover .sp-play-icon {
          display: inline-flex !important;
        }
      `}</style>

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
            placeholder="搜索歌曲、歌手、专辑..."
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
            cursor: isLoading ? 'not-allowed' : 'pointer',
            opacity: isLoading ? 0.7 : 1,
            outline: 'none',
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
          }}
          whileHover={{ scale: isLoading ? 1 : 1.05, boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}
          whileTap={{ scale: isLoading ? 1 : 0.95 }}
        >
          {isLoading ? '搜索中...' : '搜索'}
        </motion.button>
      </motion.form>

      {/* 综合搜索 Tab（仅支持多类型搜索的平台显示） */}
      {searchTabs.length > 1 && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          {searchTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSearchType(tab.id)}
              style={{
                padding: '7px 18px', borderRadius: 24, fontSize: 13, fontWeight: 600,
                background: searchType === tab.id ? 'var(--color-primary, #6366f1)' : 'var(--glass-2)',
                border: `1px solid ${searchType === tab.id ? 'var(--color-primary)' : 'var(--glass-border)'}`,
                color: searchType === tab.id ? '#fff' : 'var(--color-text)',
                boxShadow: searchType === tab.id ? 'none' : 'none',
                cursor: 'pointer', transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

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
      ) : searchType === 'artist' ? (
        artists.length > 0 ? (
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="show"
            style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
          >
            {artists.map((a) => (
              <SearchArtistRow key={a.id} item={a} onOpen={handleOpenArtist} />
            ))}
          </motion.div>
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ textAlign: 'center', padding: '80px 0', color: 'var(--color-text-dim)' }}>
            <div style={{ fontSize: 16, fontWeight: 500, letterSpacing: 0.5 }}>未找到相关歌手</div>
          </motion.div>
        )
      ) : searchType === 'album' ? (
        albums.length > 0 ? (
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="show"
            style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
          >
            {albums.map((a) => (
              <SearchAlbumRow key={a.id} item={a} onOpen={handleOpenAlbum} />
            ))}
          </motion.div>
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ textAlign: 'center', padding: '80px 0', color: 'var(--color-text-dim)' }}>
            <div style={{ fontSize: 16, fontWeight: 500, letterSpacing: 0.5 }}>未找到相关专辑</div>
          </motion.div>
        )
      ) : searchType === 'playlist' ? (
        playlists.length > 0 ? (
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="show"
            style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
          >
            {playlists.map((p) => (
              <SearchPlaylistRow
                key={p.id}
                item={p}
                onOpen={(id) => onNavigate({ page: 'playlist', id, source: 'netease' })}
              />
            ))}
          </motion.div>
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ textAlign: 'center', padding: '80px 0', color: 'var(--color-text-dim)' }}>
            <div style={{ fontSize: 16, fontWeight: 500, letterSpacing: 0.5 }}>未找到相关歌单</div>
          </motion.div>
        )
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
                onOpenArtist={handleOpenArtist}
                onOpenAlbum={handleOpenAlbum}
                coverUrl={coverUrl}
                isHovered={hoveredId === song.id}
                onHoverChange={handleHoverChange}
              />
            );
          })}

          {/* 哨兵节点：进入视口即触发 loadMore */}
          <div ref={sentinelRef} style={{ height: 1 }} />

          {/* 底部状态：加载中 / 已加载全部 */}
          {loadingMore ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '16px 0', color: 'var(--color-text-dim)' }}>
              <span style={{ display: 'inline-block', width: 16, height: 16, borderRadius: '50%', border: '2px solid var(--color-text-dim)', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
              <span style={{ fontSize: 13 }}>加载中...</span>
            </div>
          ) : !hasMore ? (
            <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--color-text-faint)', fontSize: 12 }}>
              已加载全部
            </div>
          ) : null}
        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ textAlign: 'center', padding: '80px 0', color: 'var(--color-text-dim)' }}>
          <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'center' }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </div>
          <div style={{ fontSize: 16, fontWeight: 500, letterSpacing: 0.5 }}>搜索你喜欢的音乐</div>
        </motion.div>
      )}
    </div>
  );
}
