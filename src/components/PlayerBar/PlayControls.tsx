import React from 'react';
import { motion } from 'framer-motion';
import { Icons } from './Icons';
import { LoadingSpinner } from '../common/LoadingSpinner';

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
      <motion.button className="player-shuffle-btn" onClick={onToggleShuffle} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} style={{ background: 'none', border: 'none', color: isShuffled ? 'var(--color-primary, #6366f1)' : 'var(--color-icon)', cursor: 'pointer', padding: 0 }}>
        {Icons.shuffle}
      </motion.button>

      <motion.button onClick={onPrev} disabled={!hasCurrent} whileHover={hasCurrent ? { scale: 1.05, color: 'var(--color-text)' } : undefined} whileTap={hasCurrent ? { scale: 0.95 } : undefined} style={{ background: 'none', border: 'none', color: hasCurrent ? 'var(--color-icon-active)' : 'var(--color-icon-disabled)', cursor: hasCurrent ? 'pointer' : 'not-allowed', padding: 0 }}>
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
          cursor: hasCurrent ? 'pointer' : 'not-allowed',
          opacity: hasCurrent ? 1 : 0.5,
        }}
      >
        {isBuffering ? <LoadingSpinner size={16} strokeWidth={2} color="var(--color-bg)" trackColor="rgba(0,0,0,0.2)" /> : isPlaying ? Icons.pause : Icons.play}
      </motion.button>

      <motion.button onClick={onNext} disabled={!hasCurrent} whileHover={hasCurrent ? { scale: 1.05, color: 'var(--color-text)' } : undefined} whileTap={hasCurrent ? { scale: 0.95 } : undefined} style={{ background: 'none', border: 'none', color: hasCurrent ? 'var(--color-icon-active)' : 'var(--color-icon-disabled)', cursor: hasCurrent ? 'pointer' : 'not-allowed', padding: 0 }}>
        {Icons.next}
      </motion.button>

      <motion.button className="player-repeat-btn" onClick={onCycleRepeat} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} style={{ background: 'none', border: 'none', color: repeatMode !== 'off' ? 'var(--color-primary, #6366f1)' : 'var(--color-icon)', cursor: 'pointer', padding: 0 }}>
        {repeatMode === 'one' ? Icons.repeatOne : Icons.repeat}
      </motion.button>
    </div>
  );
};
