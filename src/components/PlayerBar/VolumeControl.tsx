import React from 'react';
import { Icons } from './Icons';

interface VolumeControlProps {
  volume: number;
  isMuted: boolean;
  showVolumeSlider: boolean;
  onVolumeChange: (val: number) => void;
  onToggleMute: () => void;
  onToggleVolumeSlider: () => void;
}

export const VolumeControl: React.FC<VolumeControlProps> = ({
  volume,
  isMuted,
  showVolumeSlider,
  onVolumeChange,
  onToggleMute,
  onToggleVolumeSlider,
}) => {
  const currentVolume = isMuted ? 0 : volume;
  const volumeIcon = isMuted
    ? Icons.volumeMute
    : volume < 0.3
      ? Icons.volumeLow
      : volume < 0.7
        ? Icons.volumeMid
        : Icons.volumeHigh;

  return (
    <div className="player-volume-container" style={{ position: 'relative', display: 'flex', alignItems: 'center', color: 'var(--color-icon)', marginLeft: 8 }}>
      <button onClick={() => { onToggleMute(); onToggleVolumeSlider(); }} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }}>
        {volumeIcon}
      </button>
      {showVolumeSlider && (
        <div style={{ position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: 8, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '16px 10px 12px', backdropFilter: 'blur(20px)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', zIndex: 'var(--z-modal)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, width: 36 }}>
          <div style={{ height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={currentVolume}
              onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
              style={{
                width: 100,
                cursor: 'pointer',
                transform: 'rotate(-90deg)',
                transformOrigin: 'center center',
                '--theme-color': 'var(--color-primary, #6366f1)',
                '--progress': `${currentVolume * 100}%`
              } as React.CSSProperties}
            />
          </div>
          <span style={{ fontSize: 10, color: 'var(--color-text-faint)' }}>{Math.round(currentVolume * 100)}%</span>
        </div>
      )}
    </div>
  );
};
