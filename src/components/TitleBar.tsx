import { useState, useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useConfigStore } from '../stores/configStore';

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    const unlisten = getCurrentWindow().onResized(async () => {
      setIsMaximized(await getCurrentWindow().isMaximized());
    });
    // 初始化检查
    getCurrentWindow().isMaximized().then(setIsMaximized);
    return () => { unlisten.then(fn => fn()); };
  }, []);

  const btnStyle: React.CSSProperties = {
    width: 46,
    height: 'var(--titlebar-height, 32px)',
    border: 'none',
    background: 'transparent',
    color: 'var(--color-text)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 0.1s',
  };

  return (
    <div
      data-tauri-drag-region
      style={{
        height: 'var(--titlebar-height, 32px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingLeft: 12,
        flexShrink: 0,
        userSelect: 'none',
        WebkitAppRegion: 'drag',
        background: 'transparent',
        borderBottom: 'none',
      } as React.CSSProperties}
    >
      <style>{`
        @media (max-width: 900px) {
          .hamburger-btn {
            display: flex !important;
          }
        }
      `}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          className="hamburger-btn"
          onClick={() => {
            const { sidebarOpen, setSidebarOpen } = useConfigStore.getState();
            setSidebarOpen(!sidebarOpen);
          }}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--color-text)',
            cursor: 'pointer',
            padding: 4,
            display: 'none',
            alignItems: 'center',
            justifyContent: 'center',
            outline: 'none'
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>
        <span
          data-tauri-drag-region
          style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', letterSpacing: 0.5 }}
        >
          Melodix
        </span>
      </div>
      <div style={{ display: 'flex', height: '100%' }}>
        {/* Minimize */}
        <button
          style={btnStyle}
          onClick={() => getCurrentWindow().minimize()}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-surface-hover)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          <svg width="10" height="1" viewBox="0 0 10 1"><rect width="10" height="1" fill="currentColor"/></svg>
        </button>
        {/* Maximize / Restore */}
        <button
          style={btnStyle}
          onClick={() => getCurrentWindow().toggleMaximize()}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-surface-hover)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          {isMaximized ? (
            <svg viewBox="0 0 1024 1024" width="12" height="12" fill="currentColor">
              <path d="M812.2 65H351.6c-78.3 0-142.5 61.1-147.7 138.1-77 5.1-138.1 69.4-138.1 147.7v460.6c0 81.6 66.4 148 148 148h460.6c78.3 0 142.5-61.1 147.7-138.1 77-5.1 138.1-69.4 138.1-147.7V213c0-81.6-66.4-148-148-148z m-45.8 746.3c0 50.7-41.3 92-92 92H213.8c-50.7 0-92-41.3-92-92V350.7c0-50.7 41.3-92 92-92h460.6c50.7 0 92 41.3 92 92v460.6z m137.8-137.7c0 47.3-35.8 86.3-81.8 91.4V350.7c0-81.6-66.4-148-148-148H260.2c5.1-45.9 44.2-81.8 91.4-81.8h460.6c50.7 0 92 41.3 92 92v460.7z" />
            </svg>
          ) : (
            <svg viewBox="0 0 1024 1024" width="12" height="12" fill="currentColor">
              <path d="M812.3 959.4H213.7c-81.6 0-148-66.4-148-148V212.9c0-81.6 66.4-148 148-148h598.5c81.6 0 148 66.4 148 148v598.5C960.3 893 893.9 959.4 812.3 959.4zM213.7 120.9c-50.7 0-92 41.3-92 92v598.5c0 50.7 41.3 92 92 92h598.5c50.7 0 92-41.3 92-92V212.9c0-50.7-41.3-92-92-92H213.7z" />
            </svg>
          )}
        </button>
        {/* Close */}
        <button
          style={btnStyle}
          onClick={() => getCurrentWindow().close()}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--color-danger) 80%, transparent)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.2">
            <line x1="0" y1="0" x2="10" y2="10"/>
            <line x1="10" y1="0" x2="0" y2="10"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
