export type StreamingQuality = 'standard' | 'high' | 'lossless';

export const QUALITY_OPTIONS: { value: StreamingQuality; label: string; shortLabel: string }[] = [
  { value: 'standard', label: 'Standard (128k)', shortLabel: 'STD' },
  { value: 'high', label: 'High (320k)', shortLabel: 'HQ' },
  { value: 'lossless', label: 'Lossless (FLAC)', shortLabel: 'SQ' },
];

export const Icons = {
  prev: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M4 3h2v10H4V3zm3.5 5l6.5 5V3L7.5 8z"/>
    </svg>
  ),
  play: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M4 2l10 6-10 6V2z"/>
    </svg>
  ),
  pause: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <rect x="3" y="2" width="3.5" height="12" rx="1"/>
      <rect x="9.5" y="2" width="3.5" height="12" rx="1"/>
    </svg>
  ),
  next: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M12 3h-2v10h2V3zm-3.5 5L2 13V3l6.5 5z"/>
    </svg>
  ),
  volumeMute: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M2 5.5h2.5L8 2v12L4.5 10.5H2a1 1 0 01-1-1v-3a1 1 0 011-1z"/>
      <line x1="11" y1="5.5" x2="14.5" y2="10.5" stroke="currentColor" strokeWidth="1.2"/>
      <line x1="14.5" y1="5.5" x2="11" y2="10.5" stroke="currentColor" strokeWidth="1.2"/>
    </svg>
  ),
  volumeLow: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M2 5.5h2.5L8 2v12L4.5 10.5H2a1 1 0 01-1-1v-3a1 1 0 011-1z"/>
      <path d="M10.5 5.8a3.3 3.3 0 010 4.4" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  ),
  volumeMid: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M2 5.5h2.5L8 2v12L4.5 10.5H2a1 1 0 01-1-1v-3a1 1 0 011-1z"/>
      <path d="M10.5 5.8a3.3 3.3 0 010 4.4" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <path d="M12.5 4a5.5 5.5 0 010 8" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  ),
  volumeHigh: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M2 5.5h2.5L8 2v12L4.5 10.5H2a1 1 0 01-1-1v-3a1 1 0 011-1z"/>
      <path d="M10.5 5.8a3.3 3.3 0 010 4.4" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <path d="M12.5 4a5.5 5.5 0 010 8" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <path d="M14.2 2.5a8 8 0 010 11" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  ),
  shuffle: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 3 21 3 21 8"></polyline>
      <line x1="4" y1="20" x2="21" y2="3"></line>
      <polyline points="21 16 21 21 16 21"></polyline>
      <line x1="15" y1="15" x2="21" y2="21"></line>
      <line x1="4" y1="4" x2="9" y2="9"></line>
    </svg>
  ),
  repeat: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="17 1 21 5 17 9"></polyline>
      <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
      <polyline points="7 23 3 19 7 15"></polyline>
      <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
    </svg>
  ),
  repeatOne: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="17 1 21 5 17 9"></polyline>
      <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
      <polyline points="7 23 3 19 7 15"></polyline>
      <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
      <text x="12" y="15" textAnchor="middle" fill="currentColor" stroke="none" fontSize="8" fontWeight="bold">1</text>
    </svg>
  ),
  queue: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6"></line>
      <line x1="8" y1="12" x2="21" y2="12"></line>
      <line x1="8" y1="18" x2="21" y2="18"></line>
      <line x1="3" y1="6" x2="3.01" y2="6"></line>
      <line x1="3" y1="12" x2="3.01" y2="12"></line>
      <line x1="3" y1="18" x2="3.01" y2="18"></line>
    </svg>
  )
};
