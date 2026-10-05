import React from 'react';
import { motion } from 'framer-motion';

interface TrackListProps {
  children: React.ReactNode;
  showCover?: boolean;
  actionWidth?: string;
  albumWidth?: string;
}

export const TrackList: React.FC<TrackListProps> = ({ 
  children, 
  showCover = true,
  actionWidth = '40px',
  albumWidth = '1fr'
}) => {
  return (
    <div 
      className="common-track-list-wrapper"
      style={{
        '--action-width': actionWidth,
        '--album-width': albumWidth,
        '--grid-cols': showCover ? '40px 40px 1fr var(--album-width) 80px var(--action-width)' : '40px 1fr var(--album-width) 80px var(--action-width)',
        '--grid-cols-mobile': showCover ? '40px 40px 1fr 80px var(--action-width)' : '40px 1fr 80px var(--action-width)',
      } as React.CSSProperties}
    >
      <style>{`
        .common-track-row:hover { background: var(--color-hover, rgba(255,255,255,0.03)); }
        .common-track-row:hover .common-track-index { display: none !important; }
        .common-track-row:hover .common-play-icon { display: inline-flex !important; }
        .common-track-row:hover .common-action-col { opacity: 1 !important; }
        
        .common-action-col { opacity: 0; transition: opacity 0.2s; }
        
        /* Grid definitions */
        .common-track-row, .common-list-header {
          grid-template-columns: var(--grid-cols);
        }
        
        /* Responsive adjustments */
        @media (max-width: 768px) {
          .common-album-col { display: none !important; }
          .common-track-row, .common-list-header {
            grid-template-columns: var(--grid-cols-mobile) !important;
          }
        }
      `}</style>
      {children}
    </div>
  );
};

interface TrackListHeaderProps {
  showCover?: boolean;
  albumContent?: React.ReactNode;
  durationContent?: React.ReactNode;
}

export const TrackListHeader: React.FC<TrackListHeaderProps> = ({ 
  showCover = true,
  albumContent,
  durationContent,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="common-list-header"
      style={{
        padding: '0 12px 10px',
        display: 'grid',
        gap: 14,
        alignItems: 'center',
        borderBottom: '1px solid var(--color-border)',
        marginBottom: 8,
        color: 'var(--color-text-faint)',
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: '0.5px',
        textTransform: 'uppercase'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>#</div>
      {showCover && <div />}
      <div>标题</div>
      <div className="common-album-col">{albumContent || '专辑'}</div>
      {/* 时长表头：与行时长单元格统一 flex 右对齐，保证列右边界严格一致 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
        {durationContent || (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg>
        )}
      </div>
      <div />
    </motion.div>
  );
};
