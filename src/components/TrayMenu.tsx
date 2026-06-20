import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { Song } from '../types/playback';
import { getSongCoverUrl } from '../utils/cover';

export function TrayMenu() {
  const [current, setCurrent] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [themeColor, setThemeColor] = useState('#6366f1');
  const [channel, setChannel] = useState<BroadcastChannel | null>(null);

  useEffect(() => {
    // Hide default context menu
    const preventDefault = (e: Event) => e.preventDefault();
    document.addEventListener('contextmenu', preventDefault);

    const bc = new BroadcastChannel('melodix-tray-sync');
    setChannel(bc);

    bc.onmessage = (e) => {
      const data = e.data;
      if (data.type === 'sync') {
        setCurrent(data.state.current);
        setIsPlaying(data.state.isPlaying);
        if (data.state.themeColor) setThemeColor(data.state.themeColor);
      }
    };

    // Request initial state
    bc.postMessage({ action: 'request-sync' });

    return () => {
      document.removeEventListener('contextmenu', preventDefault);
      bc.close();
    };
  }, []);

  // Auto-hide logic
  useEffect(() => {
    let timeout: number;

    const handleBlur = () => {
      getCurrentWindow().hide();
    };

    const handleMouseLeave = () => {
      timeout = window.setTimeout(() => {
        getCurrentWindow().hide();
      }, 2000); // Hide after 2 seconds of mouse leaving
    };

    const handleMouseEnter = () => {
      window.clearTimeout(timeout);
    };

    window.addEventListener('blur', handleBlur);
    document.addEventListener('mouseleave', handleMouseLeave);
    document.addEventListener('mouseenter', handleMouseEnter);

    return () => {
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('mouseleave', handleMouseLeave);
      document.removeEventListener('mouseenter', handleMouseEnter);
      window.clearTimeout(timeout);
    };
  }, []);

  const handleAction = (action: string) => {
    if (channel) {
      channel.postMessage({ action });
    }
    if (action === 'show' || action === 'exit') {
      getCurrentWindow().hide();
    }
  };

  const coverUrl = current ? getSongCoverUrl(current, 300) : null;

  return (
    <div style={{
      width: '100%',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--glass-bg)',
      backdropFilter: 'blur(20px)',
      border: '1px solid var(--glass-border)',
      borderRadius: 'var(--radius-md)',
      overflow: 'hidden',
      color: '#fff',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      {/* Header / Draggable region */}
      <div 
        data-tauri-drag-region
        style={{
          height: 32,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          fontWeight: 600,
          opacity: 0.7,
          borderBottom: '1px solid var(--color-border)',
          cursor: 'default'
        }}
      >
        Melodix
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Now Playing Info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 52,
            height: 52,
            borderRadius: 'var(--radius-sm)',
            background: 'rgba(255, 255, 255, 0.1)',
            overflow: 'hidden',
            flexShrink: 0,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
          }}>
            {coverUrl ? (
              <img src={coverUrl} alt="Cover" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.6 }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
              </div>
            )}
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <div style={{ fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 2 }}>
              {current?.name || '未播放'}
            </div>
            <div style={{ fontSize: 13, opacity: 0.7, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {current?.artists?.map(a => a.name).join(', ') || 'Melodix'}
            </div>
          </div>
        </div>

        {/* Playback Controls */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <button 
            onClick={() => handleAction('prev')}
            style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-surface-hover)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
          </button>
          
          <button 
            onClick={() => handleAction('togglePlay')}
            style={{ width: 44, height: 44, borderRadius: '50%', border: 'none', background: themeColor, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
          >
            {isPlaying ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            )}
          </button>
          
          <button 
            onClick={() => handleAction('next')}
            style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-surface-hover)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
          </button>
        </div>
      </div>

      <div style={{ height: 1, background: 'rgba(255, 255, 255, 0.1)', margin: '4px 16px' }} />

      {/* Menu Actions */}
      <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <button
          onClick={() => handleAction('show')}
          style={{ width: '100%', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 12, background: 'transparent', border: 'none', color: '#fff', borderRadius: 'var(--radius-xs)', cursor: 'pointer', fontSize: 13, transition: 'background 0.2s' }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>
          显示主界面
        </button>
        <button
          onClick={() => handleAction('exit')}
          style={{ width: '100%', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 12, background: 'transparent', border: 'none', color: '#ef4444', borderRadius: 'var(--radius-xs)', cursor: 'pointer', fontSize: 13, transition: 'background 0.2s' }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
          退出
        </button>
      </div>
    </div>
  );
}
