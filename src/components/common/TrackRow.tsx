import React from 'react';
import { SelectionCheckbox } from '../SelectionBar';
import { LoadingSpinner } from './LoadingSpinner';
import { getSongCoverUrl } from '../../utils/cover';
import { COVER_PLACEHOLDER, onCoverError } from '../../utils/coverFallback';
import { formatTime } from '../../api/client';
import type { Song } from '../../types/playback';

export interface TrackRowProps {
  song: Song;
  index: number;
  displayIndex: number | string;
  isCurrent: boolean;
  isPlaying: boolean;
  /** 当前这首歌正在取播放地址 / 缓冲：行内显示转圈，序号位置让位 */
  isBuffering?: boolean;
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

/**
 * 封面加载失败时的兜底处理见 src/utils/coverFallback.ts（COVER_PLACEHOLDER / onCoverError）。
 *
 * 关键点：封面 `<img>` 是 grid 项（模板 `40px 40px 1fr …`，见 TrackList.tsx:23）。
 * 之前的 `onError` 用 `display: none` 隐藏它，元素被移出 grid，**其后所有列整体左移一个轨道**：
 * 实测标题列 x 390→336（-54px）、专辑列 777→390（-387px）、时长列 1164→777（-387px）、
 * action 列 1258→1164（-94px），标题单元格由 373px 塌成 40px，歌名被截成一个字。
 * 任何封面 404/502（过期 picId 走 `/pic?...`、或 cover 为死链）都会触发。
 * 换成透明占位图后元素仍占住 40×40 轨道位，列边界不再漂移。
 */

export const TrackRow = React.memo(function TrackRow({
  song,
  index,
  displayIndex,
  isCurrent,
  isPlaying,
  isBuffering = false,
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
  // 正在加载这一行：点歌后到真正出声之间，行内给出即时反馈
  const rowLoading = isCurrent && isBuffering && !isPlaying;

  return (
    <div
      className={`common-track-row ${isDragging ? 'common-track-dragging' : ''} ${rowLoading ? 'melodix-row-loading' : ''}`}
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
        ) : rowLoading ? (
          /* 加载中：序号/播放图标让位给转圈，位置与两者一致（同列、居中），不引起跳动 */
          <span className="common-track-loading" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <LoadingSpinner size={13} strokeWidth={2} color="var(--color-primary, #6366f1)" />
          </span>
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
          src={coverUrl || COVER_PLACEHOLDER}
          alt=""
          loading="lazy"
          decoding="async"
          onError={onCoverError}
          style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover', background: 'var(--color-img-placeholder, rgba(255,255,255,0.05))', flexShrink: 0, display: 'block' }}
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
    // 必须比较：否则 isBuffering 变化被 memo 挡掉，加载转圈永远不出现
    prevProps.isBuffering === nextProps.isBuffering &&
    prevProps.selectMode === nextProps.selectMode &&
    prevProps.selected === nextProps.selected &&
    prevProps.isDragging === nextProps.isDragging
  );
});
