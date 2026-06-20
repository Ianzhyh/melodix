import React from 'react';
import { motion } from 'framer-motion';
import { Icons } from './Icons';

interface PlayControlsProps {
  isPlaying: boolean;
  isBuffering: boolean;
  isShuffled: boolean;
  repeatMode: string;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrev: () => void;
  onToggleShuffle: () => void;
  onCycleRepeat: () => void;
  hasCurrent: boolean;
}

export const PlayControls: React.FC<PlayControlsProps> = ({
  isPlaying,
  isBuffering,
  isShuffled,
  repeatMode,
  onTogglePlay,
  onNext,
  onPrev,
  onToggleShuffle,
  onCycleRepeat,
  hasCurrent,
}) => {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
      <motion.button className="player-shuffle-btn" onClick={onToggleShuffle} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} style={{ background: 'none', border: 'none', color: isShuffled ? 'var(--color-primary, #6366f1)' : 'var(--color-icon)', cursor: 'pointer', padding: 0 }}>
        {Icons.shuffle}
      </motion.button>

      <motion.button onClick={onPrev} disabled={!hasCurrent} whileHover={hasCurrent ? { scale: 1.1, color: 'var(--color-text)' } : undefined} whileTap={hasCurrent ? { scale: 0.9 } : undefined} style={{ background: 'none', border: 'none', color: hasCurrent ? 'var(--color-icon-active)' : 'var(--color-icon-disabled)', cursor: hasCurrent ? 'pointer' : 'default', padding: 0 }}>
        {Icons.prev}
      </motion.button>

      <motion.button
        onClick={onTogglePlay}
        disabled={!hasCurrent}
        whileHover={hasCurrent ? { scale: 1.05 } : undefined}
        whileTap={hasCurrent ? { scale: 0.95 } : undefined}
        style={{
          background: 'var(--color-primary, #6366f1)',
          border: 'none',
          color: 'var(--color-bg)',
          width: 40,
          height: 40,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: hasCurrent ? 'pointer' : 'default',
          opacity: hasCurrent ? 1 : 0.5,
        }}
      >
        {isBuffering ? <div style={{ width: 16, height: 16, border: '2px solid rgba(0,0,0,0.2)', borderTopColor: 'var(--color-bg)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /> : isPlaying ? Icons.pause : Icons.play}
      </motion.button>

      <motion.button onClick={onNext} disabled={!hasCurrent} whileHover={hasCurrent ? { scale: 1.1, color: 'var(--color-text)' } : undefined} whileTap={hasCurrent ? { scale: 0.9 } : undefined} style={{ background: 'none', border: 'none', color: hasCurrent ? 'var(--color-icon-active)' : 'var(--color-icon-disabled)', cursor: hasCurrent ? 'pointer' : 'default', padding: 0 }}>
        {Icons.next}
      </motion.button>

      <motion.button className="player-repeat-btn" onClick={onCycleRepeat} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} style={{ background: 'none', border: 'none', color: repeatMode !== 'off' ? 'var(--color-primary, #6366f1)' : 'var(--color-icon)', cursor: 'pointer', padding: 0 }}>
        {repeatMode === 'one' ? Icons.repeatOne : Icons.repeat}
      </motion.button>
    </div>
  );
};
