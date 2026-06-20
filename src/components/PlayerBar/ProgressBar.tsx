import React from 'react';
import * as api from '../../api/client';

interface ProgressBarProps {
  currentTime: number;
  duration: number;
  progress: number;
  isSeeking: boolean;
  seekValue: number;
  onSeekChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSeekStart: () => void;
  onSeekEnd: () => void;
  hasCurrent: boolean;
  themeColor: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  currentTime,
  duration,
  progress,
  isSeeking,
  seekValue,
  onSeekChange,
  onSeekStart,
  onSeekEnd,
  hasCurrent,
  themeColor,
}) => {
  return (
    <div className="player-progress-container" style={{ display: 'flex', alignItems: 'center', width: '100%', gap: 12, fontSize: 11, color: 'var(--color-text-dim)' }}>
      <span className="player-time">{api.formatTime(currentTime)}</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.001}
        value={isSeeking ? seekValue : (progress || 0)}
        onChange={onSeekChange}
        onMouseDown={onSeekStart}
        onMouseUp={onSeekEnd}
        onTouchStart={onSeekStart}
        onTouchEnd={onSeekEnd}
        disabled={!hasCurrent}
        className="player-seek-slider"
        style={{
          flex: 1,
          outline: 'none',
          cursor: hasCurrent ? 'pointer' : 'default',
          borderRadius: 2,
          '--theme-color': themeColor || 'var(--color-primary, #6366f1)',
          '--progress': `${(isSeeking ? seekValue : (progress || 0)) * 100}%`
        } as React.CSSProperties}
      />
      <span className="player-time">{api.formatTime(duration)}</span>
    </div>
  );
};
