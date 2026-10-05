import React, { useEffect, useRef, useState } from 'react';
import { Icons } from './Icons';
import { useConfigStore } from '../../stores/configStore';

interface VolumeControlProps {
  volume: number;
  isMuted: boolean;
  onVolumeChange: (val: number) => void;
  onToggleMute: () => void;
}

export const VolumeControl: React.FC<VolumeControlProps> = ({
  volume,
  isMuted,
  onVolumeChange,
  onToggleMute,
}) => {
  const enableTransparency = useConfigStore((s) => s.enableTransparency);
  const currentVolume = isMuted ? 0 : volume;
  const volumeIcon = isMuted
    ? Icons.volumeMute
    : volume < 0.3
      ? Icons.volumeLow
      : volume < 0.7
        ? Icons.volumeMid
        : Icons.volumeHigh;

  // hover 显示滑块，移出后延迟 200ms 隐藏防误关
  const [showSlider, setShowSlider] = useState(false);
  const hideTimerRef = useRef<number | null>(null);

  const clearHideTimer = () => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };

  useEffect(() => clearHideTimer, []);

  // 全局 Escape 广播（App.tsx 派发 melodix-close-popups）：清隐藏定时器并立即隐藏滑块
  useEffect(() => {
    const closePopup = () => {
      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      setShowSlider(false);
    };
    window.addEventListener('melodix-close-popups', closePopup);
    return () => window.removeEventListener('melodix-close-popups', closePopup);
  }, []);

  const handleMouseEnter = () => {
    clearHideTimer();
    setShowSlider(true);
  };

  const handleMouseLeave = () => {
    clearHideTimer();
    hideTimerRef.current = window.setTimeout(() => setShowSlider(false), 200);
  };

  return (
    <div
      className="player-volume-container"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{ position: 'relative', display: 'flex', alignItems: 'center', color: 'var(--color-icon)', marginLeft: 8 }}
    >
      <button onClick={onToggleMute} aria-label={isMuted ? '取消静音' : '静音'} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }}>
        {volumeIcon}
      </button>
      {showSlider && (
        <div style={{ position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: 8, background: enableTransparency ? 'var(--acrylic-noise), var(--acrylic-tint)' : 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '16px 10px 12px', backdropFilter: enableTransparency ? 'var(--acrylic-blur) var(--acrylic-saturate)' : 'none', WebkitBackdropFilter: enableTransparency ? 'var(--acrylic-blur) var(--acrylic-saturate)' : 'none', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', zIndex: 'var(--z-modal)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, width: 36 }}>
          <div style={{ height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <input
              type="range"
              className="vertical-range"
              min={0}
              max={1}
              step={0.01}
              value={currentVolume}
              onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
              style={{
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
