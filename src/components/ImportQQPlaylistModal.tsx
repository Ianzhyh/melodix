import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { importTencentPlaylist, extractQQPlaylistId } from '../api/client';
import { useCustomLibraryStore } from '../stores/customLibraryStore';
import { useToastStore } from '../stores/toastStore';
import type { PlaylistDetail } from '../types/playback';

interface ImportQQPlaylistModalProps {
  onClose: () => void;
  onImported?: (libraryId: string) => void;
}

type Phase = 'input' | 'loading' | 'success' | 'error';

export function ImportQQPlaylistModal({ onClose, onImported }: ImportQQPlaylistModalProps) {
  const [input, setInput] = useState('');
  const [phase, setPhase] = useState<Phase>('input');
  const [errorMsg, setErrorMsg] = useState('');
  const [progress, setProgress] = useState({ loaded: 0, total: 0, name: '' });
  const [result, setResult] = useState<PlaylistDetail | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const createLibrary = useCustomLibraryStore((s) => s.createLibrary);
  const showToast = useToastStore((s) => s.showToast);

  useEffect(() => {
    inputRef.current?.focus();
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const isValidInput = extractQQPlaylistId(input) !== null;

  const handleImport = async () => {
    if (!isValidInput) return;
    setPhase('loading');
    setProgress({ loaded: 0, total: 0, name: '' });
    try {
      const detail = await importTencentPlaylist(input, (loaded, total, name) => {
        setProgress({ loaded, total, name });
      });
      const libId = createLibrary(detail.name);
      if (!libId) throw new Error('创建音乐库失败');
      if (detail.cover) {
        useCustomLibraryStore.getState().setLibraryCover(libId, detail.cover);
      }
      // Batch add all songs directly to avoid N individual toasts
      useCustomLibraryStore.setState(state => {
        const updated = state.libraries.map(l =>
          l.id === libId ? { ...l, songs: detail.tracks } : l
        );
        try { localStorage.setItem('melodix-custom-libraries', JSON.stringify(updated)); } catch {}
        return { libraries: updated };
      });
      setResult(detail);
      setPhase('success');
      showToast(`已导入「${detail.name}」，共 ${detail.tracks.length} 首`, 'success');
      onImported?.(libId);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '导入失败，请稍后重试');
      setPhase('error');
    }
  };

  const progressPct = progress.total > 0 ? Math.min(100, Math.round((progress.loaded / progress.total) * 100)) : 0;

  const overlayStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 1000,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(0,0,0,0.4)',
    backdropFilter: 'blur(10px)',
  };

  const cardStyle: React.CSSProperties = {
    width: 420,
    background: 'var(--color-bg-elevated)',
    backdropFilter: 'blur(40px) saturate(1.8)',
    borderRadius: 20,
    border: '1px solid var(--color-border)',
    boxShadow: '0 32px 80px rgba(0,0,0,0.3), 0 0 0 1px var(--color-border)',
    overflow: 'hidden',
    fontFamily: 'var(--font-main)',
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={overlayStyle} onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.93, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.93, y: 16 }}
        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
        onClick={e => e.stopPropagation()}
        style={cardStyle}
      >
        {/* Header */}
        <div style={{ padding: '22px 22px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10, flexShrink: 0,
            background: 'var(--color-primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 14px var(--color-primary-20)',
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
              <path d="M19 11H7.83l4.88-4.88c.39-.39.39-1.03 0-1.42-.39-.39-1.02-.39-1.41 0l-6.59 6.59c-.39.39-.39 1.02 0 1.41l6.59 6.59c.39.39 1.02.39 1.41 0 .39-.39.39-1.02 0-1.41L7.83 13H19c.55 0 1-.45 1-1s-.45-1-1-1z"/>
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text)' }}>导入 QQ 音乐歌单</div>
            <div style={{ fontSize: 11, color: 'var(--color-text-faint)', marginTop: 2 }}>
              粘贴链接或输入歌单 ID，一键同步到音乐库
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: 'var(--color-text-faint)',
            cursor: 'pointer', width: 28, height: 28, borderRadius: 7,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s',
          }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-text)'; e.currentTarget.style.background = 'var(--color-surface-hover)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-faint)'; e.currentTarget.style.background = 'none'; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '18px 22px 22px' }}>
          <AnimatePresence mode="wait">

            {/* ── Input ── */}
            {phase === 'input' && (
              <motion.div key="input" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: 'var(--color-surface-hover)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 12, padding: '0 12px',
                  marginBottom: 10,
                }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-faint)" strokeWidth="2" strokeLinecap="round">
                    <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
                    <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
                  </svg>
                  <input
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && isValidInput) handleImport(); }}
                    placeholder="https://y.qq.com/n/ryqq/playlist/..."
                    style={{
                      flex: 1, background: 'none', border: 'none', outline: 'none',
                      color: 'var(--color-text)', fontSize: 13, padding: '11px 0',
                      fontFamily: 'var(--font-main)',
                    }}
                  />
                  {input && (
                    <button onClick={() => setInput('')} style={{
                      background: 'none', border: 'none', color: 'var(--color-text-faint)',
                      cursor: 'pointer', padding: 2, display: 'flex',
                    }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-faint)', marginBottom: 16, lineHeight: 1.6 }}>
                  支持 y.qq.com / c.y.qq.com 链接，或纯数字歌单 ID
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={onClose} style={{
                    flex: 1, padding: '10px', borderRadius: 10,
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-surface-hover)', color: 'var(--color-text-dim)',
                    cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-main)', fontWeight: 500,
                    transition: 'background 0.15s',
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-active)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
                  >取消</button>
                  <button onClick={handleImport} disabled={!isValidInput} style={{
                    flex: 2, padding: '10px', borderRadius: 10, border: 'none',
                    background: isValidInput ? 'var(--color-primary)' : 'var(--color-surface-hover)',
                    color: isValidInput ? 'var(--color-text-inverse)' : 'var(--color-text-faint)',
                    cursor: isValidInput ? 'pointer' : 'not-allowed',
                    fontSize: 13, fontFamily: 'var(--font-main)', fontWeight: 600,
                    boxShadow: isValidInput ? '0 4px 16px var(--color-primary-20)' : 'none',
                    transition: 'all 0.2s',
                  }}>开始导入</button>
                </div>
              </motion.div>
            )}

            {/* ── Loading ── */}
            {phase === 'loading' && (
              <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                style={{ textAlign: 'center', padding: '10px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
                  <motion.svg width="38" height="38" viewBox="0 0 24 24" fill="none"
                    animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }}>
                    <circle cx="12" cy="12" r="10" stroke="var(--color-border)" strokeWidth="2.5"/>
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="var(--color-primary)" strokeWidth="2.5" strokeLinecap="round"/>
                  </motion.svg>
                </div>
                {progress.name && (
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)', marginBottom: 4 }}>{progress.name}</div>
                )}
                <div style={{ fontSize: 12, color: 'var(--color-text-faint)', marginBottom: 14 }}>
                  {progress.total > 0
                    ? `正在获取歌曲... ${progress.loaded} / ${progress.total}`
                    : '正在连接 QQ 音乐...'}
                </div>
                {progress.total > 0 && (
                  <div style={{ height: 3, background: 'var(--color-border)', borderRadius: 4, overflow: 'hidden' }}>
                    <motion.div
                      initial={{ width: 0 }} animate={{ width: `${progressPct}%` }}
                      transition={{ type: 'spring', stiffness: 160, damping: 28 }}
                      style={{ height: '100%', background: 'var(--color-primary)', borderRadius: 4 }}
                    />
                  </div>
                )}
              </motion.div>
            )}

            {/* ── Success ── */}
            {phase === 'success' && result && (
              <motion.div key="success" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                style={{ textAlign: 'center', padding: '10px 0' }}>
                <motion.div
                  initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 450, damping: 20, delay: 0.06 }}
                  style={{
                    width: 52, height: 52, borderRadius: '50%',
                    background: 'var(--color-primary)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 14px',
                    boxShadow: '0 8px 28px var(--color-primary-20)',
                  }}>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </motion.div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text)', marginBottom: 4 }}>{result.name}</div>
                <div style={{ fontSize: 13, color: 'var(--color-text-faint)', marginBottom: 20 }}>
                  成功导入 <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>{result.tracks.length}</span> 首歌曲
                </div>
                <button onClick={onClose} style={{
                  width: '100%', padding: '11px', borderRadius: 10, border: 'none',
                  background: 'var(--color-primary)',
                  color: 'var(--color-text-inverse)', cursor: 'pointer', fontSize: 13,
                  fontFamily: 'var(--font-main)', fontWeight: 600,
                  boxShadow: '0 4px 16px var(--color-primary-20)',
                }}>完成</button>
              </motion.div>
            )}

            {/* ── Error ── */}
            {phase === 'error' && (
              <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                style={{ textAlign: 'center', padding: '10px 0' }}>
                <div style={{
                  width: 52, height: 52, borderRadius: '50%',
                  background: 'rgba(239,68,68,0.1)',
                  border: '1px solid rgba(239,68,68,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 14px',
                }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-danger)" strokeWidth="2.5" strokeLinecap="round">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                </div>
                <div style={{ fontSize: 13, color: 'var(--color-text-dim)', marginBottom: 20, lineHeight: 1.6 }}>{errorMsg}</div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={onClose} style={{
                    flex: 1, padding: '10px', borderRadius: 10,
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-surface-hover)', color: 'var(--color-text-dim)',
                    cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-main)', fontWeight: 500,
                  }}>关闭</button>
                  <button onClick={() => { setPhase('input'); setErrorMsg(''); }} style={{
                    flex: 2, padding: '10px', borderRadius: 10, border: 'none',
                    background: 'var(--color-surface-active)', color: 'var(--color-text)',
                    cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-main)', fontWeight: 600,
                  }}>重新输入</button>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}
