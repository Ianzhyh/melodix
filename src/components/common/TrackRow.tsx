import React from 'react';
import { SelectionCheckbox } from '../SelectionBar';
import { getSongCoverUrl } from '../../utils/cover';
import { formatTime } from '../../api/client';
import type { Song } from '../../types/playback';

export interface TrackRowProps {
  song: Song;
  index: number;
  displayIndex: number | string;
  isCurrent: boolean;
  isPlaying: boolean;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onPlay: (song: Song, index: number) => void;
  onOpenArtist?: (song: Song) => void;
  onOpenAlbum?: (song: Song) => void;
  
  // Custom right-side action slot (e.g. remove from library, remove from queue)
  renderAction?: (song: Song) => React.ReactNode;
  
  // Custom columns
  albumContent?: React.ReactNode;
  durationContent?: React.ReactNode;
  
  // UI preferences
  showCover?: boolean;
  
  // Drag styling (if wrapped in Reorder.Item)
  isDragging?: boolean;
}

export const TrackRow = React.memo(function TrackRow({
  song,
  index,
  displayIndex,
  isCurrent,
  isPlaying,
  selectMode,
  selected,
  onToggleSelect,
  onPlay,
  onOpenArtist,
  onOpenAlbum,
  renderAction,
  albumContent,
  durationContent,
  showCover = true,
  isDragging = false,
}: TrackRowProps) {
  const coverUrl = showCover ? getSongCoverUrl(song, 300) : '';

  return (
    <div
      className={`common-track-row ${isDragging ? 'common-track-dragging' : ''}`}
      onClick={() => (selectMode ? onToggleSelect(song.id) : onPlay(song, index))}
      style={{
        display: 'grid',
        gap: 14,
        alignItems: 'center',
        padding: '10px 12px',
        borderRadius: 8,
        cursor: selectMode ? 'pointer' : (isDragging ? 'grabbing' : 'pointer'),
        transition: 'background 0.2s',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minWidth: 0 }}>
        {selectMode ? (
          <SelectionCheckbox selected={selected} />
        ) : (
          <>
            <span className="common-track-index" style={{ fontSize: 13, color: isCurrent ? 'var(--color-primary, #6366f1)' : 'var(--color-text-faint, rgba(255,255,255,0.45))' }}>
              {displayIndex}
            </span>
            <span className="common-play-icon" style={{ display: 'none', color: isCurrent ? 'var(--color-primary, #6366f1)' : 'var(--color-text)' }}>
              {isCurrent && isPlaying ? (
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="2" width="3" height="12" rx="0.5"/><rect x="10" y="2" width="3" height="12" rx="0.5"/></svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2l10 6-10 6V2z"/></svg>
              )}
            </span>
          </>
        )}
      </div>

      {showCover && (
        <img
          src={coverUrl}
          alt=""
          loading="lazy"
          decoding="async"
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
          style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover', background: 'var(--color-img-placeholder, rgba(255,255,255,0.05))', flexShrink: 0 }}
        />
      )}

      <div style={{ minWidth: 0, paddingRight: 12 }}>
        <div style={{
          fontSize: 14,
          fontWeight: 500,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          color: isCurrent ? 'var(--color-primary, #6366f1)' : 'var(--color-text, rgba(255,255,255,0.95))',
          marginBottom: 2
        }}>
          {song.name}
        </div>
        <div style={{ fontSize: 13, color: 'var(--color-text-dim, rgba(255,255,255,0.65))', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {song.artists && song.artists.length > 0 ? (
            song.artists.map((a, i) => (
              <React.Fragment key={`${a.id}-${i}`}>
                <span className={onOpenArtist ? "md-text-link" : ""} onClick={(e) => { if (onOpenArtist) { e.stopPropagation(); onOpenArtist(song); } }}>{a.name}</span>
                {i < song.artists!.length - 1 ? ', ' : ''}
              </React.Fragment>
            ))
          ) : (
            <span>{song.artist || '未知艺术家'}</span>
          )}
        </div>
      </div>

      <div className="common-album-col" title={!albumContent ? (song.album || '') : undefined} style={{ fontSize: 13, color: 'var(--color-text-dim, rgba(255,255,255,0.65))', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {albumContent ? albumContent : (song.albumId && onOpenAlbum ? (
          <span className="md-text-link" onClick={(e) => { e.stopPropagation(); onOpenAlbum(song); }}>{song.album || ''}</span>
        ) : (song.album || ''))}
      </div>

      {/* 时长单元格：与表头列保持相同 flex 右对齐，列边界严格一致 */}
      <div style={{
        display: 'flex', justifyContent: 'flex-end', alignItems: 'center',
        fontSize: 13, color: 'var(--color-text-dim, rgba(255,255,255,0.65))',
        lineHeight: 1, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums',
      }}>
        {durationContent ? durationContent : formatTime(song.duration || 0)}
      </div>

      <div className="common-action-col" onClick={e => e.stopPropagation()} style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
        {!selectMode && renderAction && renderAction(song)}
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.song === nextProps.song &&
    prevProps.index === nextProps.index &&
    prevProps.displayIndex === nextProps.displayIndex &&
    prevProps.isCurrent === nextProps.isCurrent &&
    prevProps.isPlaying === nextProps.isPlaying &&
    prevProps.selectMode === nextProps.selectMode &&
    prevProps.selected === nextProps.selected &&
    prevProps.isDragging === nextProps.isDragging
  );
});
