import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { useConfigStore } from '../stores/configStore';
import { useFavoriteStore } from '../stores/favoriteStore';
import { useSearchStore } from '../stores/searchStore';
import { useDownloadStore } from '../stores/downloadStore';
import { useLocalLibraryStore } from '../stores/localLibraryStore';
import type { ScanResult } from '../stores/localLibraryStore';
import { useToastStore } from '../stores/toastStore';
import type { PlatformCookies } from '../stores/configStore';
import { open, ask, message as showDialog } from '@tauri-apps/plugin-dialog';

// GitHub 仓库地址（上传后替换为真实地址，关于页跳转链接会用到）
const GITHUB_REPO_URL = 'https://github.com/Ianzhyh/melodix';

const PLATFORM_INFO: { key: keyof PlatformCookies; name: string; hint: string }[] = [
  { key: 'tencent', name: 'QQ音乐', hint: '访问 y.qq.com 按F12在Console输入document.cookie，或者使用下面的扫码登录' },
  { key: 'netease', name: '网易云音乐', hint: '访问 music.163.com 按F12在Application找Cookies' },
  { key: 'kugou', name: '酷狗音乐', hint: '暂时无需配置cookie' },
  { key: 'kuwo', name: '酷我音乐', hint: '访问 kuwo.cn 按F12在Application找Cookies' },
];

const SETTINGS_TABS = [
  { id: 'account', label: 'Account & Cookies' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'audio', label: 'Audio Quality' },
  { id: 'downloads', label: 'Downloads' },
  { id: 'library', label: 'Library' },
  { id: 'about', label: 'About' },
];

const SEARCH_PLATFORMS = [
  { id: 'tencent', name: 'QQ音乐' },
  { id: 'netease', name: '网易云音乐' },
  { id: 'kugou', name: '酷狗音乐' },
  { id: 'kuwo', name: '酷我音乐' },
];

function CustomSelect({ value, options, onChange }: { value: string, options: { value: string, label: string }[], onChange: (v: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find(o => o.value === value) || options[0];

  return (
    <div ref={ref} style={{ position: 'relative', width: 240 }}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '100%', padding: '12px 16px', background: 'var(--color-hover)',
          border: `1px solid ${isOpen ? 'var(--glass-border)' : 'var(--color-border)'}`, 
          borderRadius: 8, color: 'var(--color-text)',
          fontSize: 14, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          transition: 'border-color 0.2s',
        }}
      >
        {selectedOption.label}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </div>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
            style={{
              position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 8,
              background: 'var(--color-bg)', backdropFilter: 'var(--glass-blur)',
              border: '1px solid var(--glass-border)', borderRadius: 8, overflow: 'hidden',
              zIndex: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
            }}
          >
            {options.map(opt => (
              <div
                key={opt.value}
                onClick={() => { onChange(opt.value); setIsOpen(false); }}
                style={{
                  padding: '10px 16px', fontSize: 14, color: opt.value === value ? 'var(--color-primary, #6366f1)' : 'var(--color-text)',
                  cursor: 'pointer', background: opt.value === value ? 'var(--glass-2)' : 'transparent',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => { if (opt.value !== value) e.currentTarget.style.background = 'var(--glass-1)' }}
                onMouseLeave={(e) => { if (opt.value !== value) e.currentTarget.style.background = 'transparent' }}
              >
                {opt.label}
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SearchPlatformSelector() {
  const { platform, setPlatform } = useSearchStore();
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {SEARCH_PLATFORMS.map(p => {
        const isActive = platform === p.id;
        return (
          <button
            key={p.id}
            onClick={() => setPlatform(p.id)}
            style={{
              padding: '8px 20px', borderRadius: 20, fontSize: 13, fontWeight: 500,
              background: isActive ? 'var(--color-primary, #6366f1)' : 'var(--color-surface-hover)',
              border: `1px solid ${isActive ? 'var(--color-primary, #6366f1)' : 'var(--glass-border)'}`,
              color: isActive ? 'var(--color-text)' : 'var(--color-text)',
              cursor: 'pointer', transition: 'all 0.2s',
            }}
          >
            {p.name}
          </button>
        );
      })}
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: () => void }) {
  return (
    <div
      onClick={onChange}
      style={{
        width: 44, height: 24, borderRadius: 12, position: 'relative', cursor: 'pointer',
        background: value ? 'var(--color-success, #10b981)' : 'var(--glass-3)',
        transition: 'background 0.2s',
        display: 'flex',
        alignItems: 'center',
        padding: '0 2px',
        justifyContent: value ? 'flex-end' : 'flex-start'
      }}
    >
      <motion.div
        layout
        transition={{ type: 'spring', stiffness: 700, damping: 30 }}
        style={{
          width: 20, height: 20, background: 'var(--color-text)', borderRadius: '50%',
          boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
        }}
      />
    </div>
  );
}

export function SettingsPage() {
  const {
    cookies, setCookie, sidecarPort,
    streamingQuality, setStreamingQuality,
    downloadPath, setDownloadPath,
    autoDownload, setAutoDownload,
    theme, setTheme,
    enableTransparency, setEnableTransparency,
    showTranslationButton, setShowTranslationButton,
    autoTranslateLyrics, setAutoTranslateLyrics,
    maxConcurrentDownloads, setMaxConcurrentDownloads,
    localLibraryPath, setLocalLibraryPath,
    autoImportOnDownload, setAutoImportOnDownload,
    importMode, setImportMode,
  } = useConfigStore();
  
  const { favorites } = useFavoriteStore();
  const { scanDirectory, scanning } = useLocalLibraryStore();
  const { showToast } = useToastStore();
  const [localCookies, setLocalCookies] = useState<PlatformCookies>({ ...cookies });
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('account');
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  
  const [downloadHistory, setDownloadHistory] = useState<{ name: string; artist: string; time: number }[]>([]);
  const downloadingRef = useRef(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [pathModalOpen, setPathModalOpen] = useState(false);
  const [tempPath, setTempPath] = useState(downloadPath);
  
  const [qrLoginState, setQrLoginState] = useState<'idle' | 'loading' | 'showing' | 'scanned' | 'success' | 'expired' | 'error'>('idle');
  const [qrBase64, setQrBase64] = useState('');
  const qrPollRef = useRef<number | null>(null);
  const qrLoadingRef = useRef(false);
  const isMountedRef = useRef(true);
  isMountedRef.current = true; // React StrictMode double-mount 会导致 cleanup 把 ref 设为 false, 每次 render 重置为 true
  
  const favoritesRef = useRef(favorites);
  const pendingCheckRef = useRef(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('melodix-download-history');
      if (saved) setDownloadHistory(JSON.parse(saved));
    } catch {}
  }, []);

  useEffect(() => {
    favoritesRef.current = favorites;
  }, [favorites]);

  useEffect(() => {
    if (!autoDownload || favorites.length === 0 || !downloadPath) return;
    if (downloadingRef.current) {
      pendingCheckRef.current = true;
      return;
    }
    cancelledRef.current = false;
    
    const autoDownloadNew = async () => {
      downloadingRef.current = true;
      setIsDownloading(true);
      try {
        const downloadedIds: string[] = JSON.parse(localStorage.getItem('melodix-auto-downloaded-ids') || '[]');
        const newDownloads: { name: string; artist: string; time: number }[] = [];
        const toDownload = favoritesRef.current.filter(song => !downloadedIds.includes(song.id));

        for (const song of toDownload) {
          if (cancelledRef.current || !isMountedRef.current) break;
          useDownloadStore.getState().addTask(song);
          downloadedIds.push(song.id);
          newDownloads.push({ name: song.name, artist: song.artist, time: Date.now() });
        }

        if (isMountedRef.current && newDownloads.length > 0) {
          localStorage.setItem('melodix-auto-downloaded-ids', JSON.stringify(downloadedIds));
          setDownloadHistory(prev => {
            const updated = [...newDownloads, ...prev].slice(0, 50);
            localStorage.setItem('melodix-download-history', JSON.stringify(updated));
            return updated;
          });
        }
      } catch {} finally {
        setIsDownloading(false);
        downloadingRef.current = false;
        if (pendingCheckRef.current && isMountedRef.current) {
          pendingCheckRef.current = false;
          cancelledRef.current = false;
          autoDownloadNew();
        }
      }
    };
    
    autoDownloadNew();
    return () => { cancelledRef.current = true; };
  }, [favorites, autoDownload, downloadPath]);

  const handleStartQRLogin = async () => {
    console.log('[QR] === begin, sidecarPort:', sidecarPort, 'isMounted:', isMountedRef.current, 'qrLoading:', qrLoadingRef.current);
    if (!isMountedRef.current) { console.log('[QR] BLOCKED: not mounted'); return; }
    if (qrLoadingRef.current) { console.log('[QR] BLOCKED: already loading'); return; }
    if (qrPollRef.current) {
      clearInterval(qrPollRef.current);
      qrPollRef.current = null;
    }
    if (!sidecarPort) { console.log('[QR] BLOCKED: sidecarPort empty'); return; }
    
    qrLoadingRef.current = true;
    setQrLoginState('loading');
    console.log('[QR] fetching /tencent/qr/show ...');
    try {
      const res = await fetch(`http://127.0.0.1:${sidecarPort}/tencent/qr/show`);
      console.log('[QR] /qr/show response status:', res.status);
      if (!isMountedRef.current) return;
      const json = await res.json();
      console.log('[QR] /qr/show json:', { success: json.success, hasBase64: !!json.base64, session_id: json.session_id });
      if (!isMountedRef.current) return;
      if (json.success) {
        setQrBase64(json.base64);
        setQrLoginState('showing');
        console.log('[QR] QR displayed, starting poll with session:', json.session_id);
        if (qrPollRef.current) clearInterval(qrPollRef.current);
        qrPollRef.current = window.setInterval(async () => {
          try {
            const checkRes = await fetch(`http://127.0.0.1:${sidecarPort}/tencent/qr/check?session_id=${json.session_id}`);
            const checkJson = await checkRes.json();
            console.log('[QR] poll result:', checkJson.status, checkJson.status === 'confirmed' ? 'cookie_len:' + (checkJson.cookie || checkJson.qqmusic_key || '').length : '');
            if (!isMountedRef.current) {
              if (qrPollRef.current) clearInterval(qrPollRef.current);
              qrPollRef.current = null;
              return;
            }
            if (checkJson.status === 'scanned') {
              setQrLoginState('scanned');
            } else if (checkJson.status === 'confirmed') {
              setQrLoginState('success');
              if (qrPollRef.current) clearInterval(qrPollRef.current);
              qrPollRef.current = null;
              const cookieValue = checkJson.cookie || checkJson.qqmusic_key || '';
              console.log('[QR] confirmed, saving cookie len:', cookieValue.length);
              if (cookieValue) {
                setCookie('tencent', cookieValue);
                setLocalCookies(prev => ({ ...prev, tencent: cookieValue }));
                console.log('[QR] cookie saved to store, posting to sidecar...');
                if (sidecarPort) {
                  fetch(`http://127.0.0.1:${sidecarPort}/api/cookie`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ platform: 'tencent', cookie: cookieValue }),
                  })
                  .then(r => console.log('[QR] sidecar save response:', r.status))
                  .catch(e => console.error('[QR] sidecar save FAILED:', e));
                }
              }
            } else if (checkJson.status === 'expired') {
              console.log('[QR] QR expired, restarting...');
              setQrLoginState('expired');
              if (qrPollRef.current) clearInterval(qrPollRef.current);
              qrPollRef.current = null;
              if (!isMountedRef.current) return;
              handleStartQRLogin();
            }
          } catch (e) { console.error('[QR] poll error:', e); }
        }, 2000);
      } else {
        console.error('[QR] /qr/show returned success=false');
        setQrLoginState('error');
      }
    } catch (e) {
      console.error('[QR] /qr/show fetch FAILED:', e);
      setQrLoginState('error');
    } finally {
      qrLoadingRef.current = false;
    }
  };

  useEffect(() => {
    return () => {
      if (qrPollRef.current) clearInterval(qrPollRef.current);
    };
  }, []);

  const handleSaveCookies = async () => {
    setSaving(true);
    setMessage(null);
    try {
      for (const { key } of PLATFORM_INFO) {
        const value = localCookies[key] || '';
        if (value !== (cookies[key] || '')) setCookie(key, value);
      }
      if (sidecarPort) {
        for (const { key } of PLATFORM_INFO) {
          const cookie = localCookies[key];
          if (cookie !== undefined) {
            await fetch(`http://127.0.0.1:${sidecarPort}/api/cookie`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ platform: key, cookie: cookie || '' }),
            }).catch(() => {});
          }
        }
      }
      setMessage({ text: 'Settings saved successfully.', type: 'success' });
      setTimeout(() => setMessage(null), 3000);
    } catch (e) {
      setMessage({ text: 'Failed to save: ' + String(e), type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleCheckUpdate = async () => {
    try {
      const info = await invoke<{
        hasUpdate: boolean;
        latestVersion: string;
        currentVersion: string;
        releaseUrl: string;
        notes: string;
      }>('check_for_update');
      if (info.hasUpdate) {
        const yes = await ask(
          `发现新版本 v${info.latestVersion}！\n\n${info.notes}\n\n是否前往下载？`,
          { title: '发现更新', okLabel: '去下载', cancelLabel: '稍后' }
        );
        if (yes) {
          await invoke('open_external_url', { url: info.releaseUrl });
        }
      } else {
        await showDialog(`当前已是最新版本 (v${info.currentVersion})`, {
          title: '检查更新',
          okLabel: '知道了',
        });
      }
    } catch {
      await showDialog('检查更新失败，请稍后重试', {
        title: '检查更新',
        okLabel: '知道了',
      });
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '12px 16px', background: 'var(--color-hover)',
    border: '1px solid var(--color-border)', borderRadius: 8, color: 'var(--color-text)',
    fontSize: 14, fontFamily: 'monospace', outline: 'none', transition: 'border-color 0.2s',
    boxSizing: 'border-box',
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'account':
        return (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
            <h2 style={{ fontSize: 24, fontWeight: 600, margin: '0 0 8px', color: 'var(--color-text)' }}>Account & Cookies</h2>
            <p style={{ margin: '0 0 32px', color: 'var(--color-text-dim)', fontSize: 14 }}>
              Configure your platform cookies to access VIP and encrypted audio streams.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {PLATFORM_INFO.map(({ key, name, hint }) => (
                <div key={key}>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: 'var(--color-text)', marginBottom: 8 }}>{name}</label>
                  <input
                    type="password"
                    name={`${key}-cookie-input`}
                    autoComplete="new-password"
                    placeholder={hint}
                    value={localCookies[key] || ''}
                    onChange={(e) => {
                      setLocalCookies({ ...localCookies, [key]: e.target.value });
                    }}
                    style={inputStyle}
                    onFocus={(e) => e.target.style.borderColor = 'var(--glass-border)'}
                    onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
                  />
                  {key === 'tencent' && (
                    <div style={{ marginTop: 8 }}>
                      {qrLoginState === 'idle' && (
                        <button
                          onClick={handleStartQRLogin}
                          style={{
                            background: 'var(--glass-3)', color: 'var(--color-text)',
                            border: '1px solid var(--glass-border)',
                            padding: '6px 16px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                          }}
                        >
                          扫码登录
                        </button>
                      )}
                      {qrLoginState === 'loading' && <span style={{ fontSize: 12, color: 'var(--color-text-dim)' }}>加载中...</span>}
                      {qrLoginState === 'showing' && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                          <img src={qrBase64} style={{ width: 180, height: 180, borderRadius: 8 }} />
                          <span style={{ fontSize: 12, color: 'var(--color-text-dim)' }}>请使用QQ扫描二维码</span>
                          <button
                            onClick={() => { setQrLoginState('idle'); if (qrPollRef.current) clearInterval(qrPollRef.current); }}
                            style={{ background: 'none', border: 'none', color: 'var(--color-text-dim)', fontSize: 11, cursor: 'pointer' }}
                          >
                            取消
                          </button>
                        </div>
                      )}
                      {qrLoginState === 'scanned' && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                          <img src={qrBase64} style={{ width: 180, height: 180, borderRadius: 8, opacity: 0.5 }} />
                          <span style={{ fontSize: 12, color: 'var(--color-success-bright)' }}>已扫码，请在手机上确认</span>
                        </div>
                      )}
                      {qrLoginState === 'success' && (
                        <span style={{ fontSize: 12, color: 'var(--color-success-bright)' }}>登录成功，Cookie已自动保存</span>
                      )}
                      {qrLoginState === 'expired' && (
                        <div>
                          <span style={{ fontSize: 12, color: 'var(--color-danger-light)' }}>二维码已过期</span>
                          <button
                            onClick={handleStartQRLogin}
                            style={{ marginLeft: 8, background: 'none', border: 'none', color: 'var(--color-text-dim)', fontSize: 11, cursor: 'pointer' }}
                          >
                            重新获取
                          </button>
                        </div>
                      )}
                      {qrLoginState === 'error' && (
                        <div>
                          <span style={{ fontSize: 12, color: 'var(--color-danger-light)' }}>获取二维码失败</span>
                          <button
                            onClick={handleStartQRLogin}
                            style={{ marginLeft: 8, background: 'none', border: 'none', color: 'var(--color-text-dim)', fontSize: 11, cursor: 'pointer' }}
                          >
                            重试
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div style={{ marginTop: 32, display: 'flex', alignItems: 'center', gap: 16 }}>
              <motion.button
                onClick={handleSaveCookies}
                disabled={saving}
                whileHover={{ scale: 1.02, background: 'var(--color-text)', color: '#000' }}
                whileTap={{ scale: 0.98 }}
                style={{
                  background: 'var(--color-primary, #e5e5e5)', color: 'var(--color-bg)', border: 'none',
                  padding: '10px 24px', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  opacity: saving ? 0.7 : 1, transition: 'background 0.2s, color 0.2s'
                }}
              >
                {saving ? 'Saving...' : 'Save Configuration'}
              </motion.button>
              <AnimatePresence>
                {message && (
                  <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ fontSize: 14, color: message.type === 'success' ? 'var(--color-success)' : 'var(--color-danger)' }}>
                    {message.text}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        );
      case 'appearance':
        return (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
            <h2 style={{ fontSize: 24, fontWeight: 600, margin: '0 0 8px', color: 'var(--color-text)' }}>Appearance</h2>
            <p style={{ margin: '0 0 32px', color: 'var(--color-text-dim)', fontSize: 14 }}>Customize the look and feel of Melodix.</p>
            
            <div style={{ background: 'var(--glass-2)', border: '1px solid var(--glass-border)', borderRadius: 12, padding: 24, marginBottom: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text)', marginBottom: 4 }}>Acrylic Transparency</div>
                  <div style={{ fontSize: 13, color: 'var(--color-text-dim)' }}>Enable blurred background effect (requires restart to fully apply if unsupported)</div>
                </div>
                <Toggle value={enableTransparency} onChange={() => {
                  setEnableTransparency(!enableTransparency);
                }} />
              </div>
            </div>

            <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: 'var(--color-text)', marginBottom: 8 }}>Theme</label>
            <CustomSelect
              value={theme}
              onChange={(v) => setTheme(v as 'dark' | 'light' | 'system')}
              options={[
                { value: 'system', label: 'System Default' },
                { value: 'dark', label: 'Dark Mode' },
                { value: 'light', label: 'Light Mode' },
              ]}
            />

            <div style={{ background: 'var(--glass-2)', border: '1px solid var(--glass-border)', borderRadius: 12, padding: 24, marginTop: 24, marginBottom: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text)', marginBottom: 4 }}>显示翻译按钮</div>
                  <div style={{ fontSize: 13, color: 'var(--color-text-dim)' }}>在歌词界面显示翻译切换按钮</div>
                </div>
                <Toggle value={showTranslationButton} onChange={() => {
                  setShowTranslationButton(!showTranslationButton);
                }} />
              </div>
            </div>

            <div style={{ background: 'var(--glass-2)', border: '1px solid var(--glass-border)', borderRadius: 12, padding: 24, marginBottom: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text)', marginBottom: 4 }}>自动翻译歌词</div>
                  <div style={{ fontSize: 13, color: 'var(--color-text-dim)' }}>加载歌词时自动翻译为中文</div>
                </div>
                <Toggle value={autoTranslateLyrics} onChange={() => {
                  setAutoTranslateLyrics(!autoTranslateLyrics);
                }} />
              </div>
            </div>
          </motion.div>
        );
      case 'audio':
        return (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
            <h2 style={{ fontSize: 24, fontWeight: 600, margin: '0 0 8px', color: 'var(--color-text)' }}>Audio Quality</h2>
            <p style={{ margin: '0 0 32px', color: 'var(--color-text-dim)', fontSize: 14 }}>Manage streaming and download audio quality.</p>
            
            <div style={{ background: 'var(--glass-2)', border: '1px solid var(--glass-border)', borderRadius: 12, padding: 24, marginBottom: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text)', marginBottom: 4 }}>Lossless Audio</div>
                  <div style={{ fontSize: 13, color: 'var(--color-text-dim)' }}>Stream in FLAC lossless quality</div>
                </div>
                <Toggle value={streamingQuality === 'lossless'} onChange={() => {
                  setStreamingQuality(streamingQuality === 'lossless' ? 'high' : 'lossless');
                }} />
              </div>
            </div>

            <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: 'var(--color-text)', marginBottom: 8 }}>Streaming Quality</label>
            <CustomSelect
              value={streamingQuality}
              onChange={(v) => setStreamingQuality(v as 'standard' | 'high' | 'lossless')}
              options={[
                { value: 'standard', label: 'Standard (128 kbps)' },
                { value: 'high', label: 'High Quality (320 kbps)' },
                { value: 'lossless', label: 'Lossless (FLAC)' },
              ]}
            />

            <div style={{ marginTop: 32 }}>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: 'var(--color-text)', marginBottom: 8 }}>Search Platform</label>
              <p style={{ margin: '0 0 12px', color: 'var(--color-text-dim)', fontSize: 13 }}>Choose the music source for search. QQ音乐 is recommended for best compatibility.</p>
              <SearchPlatformSelector />
            </div>
          </motion.div>
        );

      case 'downloads':
        return (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
            <h2 style={{ fontSize: 24, fontWeight: 600, margin: '0 0 8px', color: 'var(--color-text)' }}>Downloads</h2>
            <p style={{ margin: '0 0 32px', color: 'var(--color-text-dim)', fontSize: 14 }}>Manage your offline library.</p>

            <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: 'var(--color-text)', marginBottom: 8 }}>Download Location</label>
            <div style={{ display: 'flex', gap: 12, marginBottom: 32 }}>
              <input
                type="text"
                value={downloadPath}
                onChange={(e) => setDownloadPath(e.target.value)}
                placeholder="Select download location..."
                style={{ ...inputStyle, flex: 1, color: downloadPath ? 'var(--color-text)' : 'var(--color-text-faint)' }}
              />
              <button
                onClick={async () => {
                  try {
                    const selected = await open({ directory: true, defaultPath: downloadPath || undefined });
                    if (selected) setDownloadPath(selected as string);
                  } catch {
                    setTempPath(downloadPath);
                    setPathModalOpen(true);
                  }
                }}
                style={{ padding: '0 24px', borderRadius: 8, background: 'var(--color-surface-active)', color: 'var(--color-text)', border: 'none', cursor: 'pointer' }}
              >
                Change...
              </button>
            </div>

            <div style={{ background: 'var(--glass-2)', border: '1px solid var(--glass-border)', borderRadius: 12, padding: 24, marginBottom: 32 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text)', marginBottom: 4 }}>Auto-Download Liked Songs</div>
                  <div style={{ fontSize: 13, color: 'var(--color-text-dim)' }}>Automatically download songs when added to your Library.</div>
                </div>
                <Toggle value={autoDownload} onChange={() => setAutoDownload(!autoDownload)} />
              </div>
              {isDownloading && (
                <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-primary, #6366f1)', fontSize: 13 }}>
                  <div style={{ width: 14, height: 14, border: '2px solid var(--color-surface-active)', borderTopColor: 'var(--color-primary, #6366f1)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                  Downloading...
                </div>
              )}
            </div>

            <div style={{ background: 'var(--glass-2)', border: '1px solid var(--glass-border)', borderRadius: 12, padding: 24, marginBottom: 32 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text)', marginBottom: 4 }}>同时下载数量</div>
                  <div style={{ fontSize: 13, color: 'var(--color-text-dim)' }}>设置同时进行的下载任务数量（1-10）</div>
                </div>
                <CustomSelect
                  value={String(maxConcurrentDownloads)}
                  onChange={(v) => setMaxConcurrentDownloads(Number(v))}
                  options={Array.from({ length: 10 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))}
                />
              </div>
            </div>

            {/* Download History */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ fontSize: 16, fontWeight: 500, color: 'var(--color-text)', margin: 0 }}>Download History</h3>
                {downloadHistory.length > 0 && (
                  <button
                    onClick={() => {
                      setDownloadHistory([]);
                      localStorage.removeItem('melodix-download-history');
                      localStorage.removeItem('melodix-auto-downloaded-ids');
                    }}
                    style={{ background: 'none', border: 'none', color: 'var(--color-text-faint)', cursor: 'pointer', fontSize: 12 }}
                  >
                    Clear All
                  </button>
                )}
              </div>
              {downloadHistory.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 32, color: 'var(--color-text-faint)', fontSize: 14 }}>
                  No downloads yet
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {downloadHistory.map((item, i) => (
                    <div key={i} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '10px 12px', borderRadius: 6,
                      background: 'var(--glass-2)',
                    }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--color-text-faint)' }}>{item.artist}</div>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-faint)', marginLeft: 12, flexShrink: 0 }}>
                        {new Date(item.time).toLocaleDateString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        );
      case 'library':
        return (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
            <h2 style={{ fontSize: 24, fontWeight: 600, margin: '0 0 8px', color: 'var(--color-text)' }}>Library</h2>
            <p style={{ margin: '0 0 32px', color: 'var(--color-text-dim)', fontSize: 14 }}>管理本地音乐库目录与导入设置。</p>

            {/* 本地库目录 */}
            <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: 'var(--color-text)', marginBottom: 8 }}>本地库目录</label>
            <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
              <input
                type="text"
                value={localLibraryPath}
                readOnly
                placeholder="请选择本地库目录..."
                style={{ ...inputStyle, flex: 1, color: localLibraryPath ? 'var(--color-text)' : 'var(--color-text-faint)' }}
              />
              <button
                onClick={async () => {
                  try {
                    const selected = await open({ directory: true, defaultPath: localLibraryPath || undefined });
                    if (selected) setLocalLibraryPath(selected as string);
                  } catch (e) {
                    showToast('打开目录选择器失败', 'error');
                  }
                }}
                style={{ padding: '0 24px', borderRadius: 8, background: 'var(--color-surface-active)', color: 'var(--color-text)', border: 'none', cursor: 'pointer' }}
              >
                更改...
              </button>
            </div>
            <p style={{ margin: '0 0 32px', color: 'var(--color-text-dim)', fontSize: 13 }}>本地音乐文件将扫描此目录</p>

            {/* 自动导入 */}
            <div style={{ background: 'var(--glass-2)', border: '1px solid var(--glass-border)', borderRadius: 12, padding: 24, marginBottom: 32 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text)', marginBottom: 4 }}>下载后自动导入</div>
                  <div style={{ fontSize: 13, color: 'var(--color-text-dim)' }}>下载完成的音乐自动导入到本地库</div>
                </div>
                <Toggle value={autoImportOnDownload} onChange={() => setAutoImportOnDownload(!autoImportOnDownload)} />
              </div>
            </div>

            {/* 导入模式 */}
            <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: 'var(--color-text)', marginBottom: 8 }}>导入模式</label>
            <CustomSelect
              value={importMode}
              onChange={(v) => setImportMode(v as 'copy' | 'index')}
              options={[
                { value: 'index', label: '仅创建索引' },
                { value: 'copy', label: '复制到库目录' },
              ]}
            />
            <p style={{ margin: '12px 0 32px', color: 'var(--color-text-dim)', fontSize: 13 }}>索引模式不复制文件，复制模式将文件复制到库目录</p>

            {/* 支持格式 */}
            <div style={{ background: 'var(--glass-2)', border: '1px solid var(--glass-border)', borderRadius: 12, padding: 24, marginBottom: 32 }}>
              <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text)', marginBottom: 12 }}>支持格式</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {['MP3', 'FLAC', 'WAV', 'AAC', 'M4A', 'OGG'].map(fmt => (
                  <span key={fmt} style={{ padding: '6px 12px', background: 'var(--glass-3)', borderRadius: 20, fontSize: 12, color: 'var(--color-text-dim)', border: '1px solid var(--glass-border)' }}>
                    {fmt}
                  </span>
                ))}
              </div>
            </div>

            {/* 手动扫描 */}
            <div style={{ background: 'var(--glass-2)', border: '1px solid var(--glass-border)', borderRadius: 12, padding: 24, marginBottom: 32 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text)', marginBottom: 4 }}>手动扫描</div>
                  <div style={{ fontSize: 13, color: 'var(--color-text-dim)' }}>立即扫描库目录以导入新增的本地音乐文件</div>
                </div>
                <motion.button
                  onClick={async () => {
                    if (!localLibraryPath) {
                      showToast('请先设置库目录', 'error');
                      return;
                    }
                    try {
                      const result: ScanResult = await scanDirectory(localLibraryPath);
                      showToast(`扫描完成：共 ${result.scanned} 个文件，导入 ${result.imported}，跳过 ${result.skipped}，失败 ${result.failed}`, 'success');
                    } catch (e) {
                      showToast('扫描失败：' + String(e), 'error');
                    }
                  }}
                  disabled={scanning}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  style={{
                    padding: '10px 24px', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                    background: 'var(--color-primary, #6366f1)', color: '#fff', border: 'none',
                    opacity: scanning ? 0.7 : 1,
                  }}
                >
                  {scanning ? '扫描中...' : '立即扫描库目录'}
                </motion.button>
              </div>
              {scanning && (
                <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-primary, #6366f1)', fontSize: 13 }}>
                  <div style={{ width: 14, height: 14, border: '2px solid var(--color-surface-active)', borderTopColor: 'var(--color-primary, #6366f1)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                  正在扫描...
                </div>
              )}
            </div>
          </motion.div>
        );
      case 'about':
        return (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
            <h2 style={{ fontSize: 24, fontWeight: 600, margin: '0 0 8px', color: 'var(--color-text)' }}>About Melodix</h2>
            <p style={{ margin: '0 0 32px', color: 'var(--color-text-dim)', fontSize: 14 }}>
              App information, credits, and disclaimers.
            </p>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 32 }}>
              {/* App Info Card */}
              <div style={{ background: 'var(--glass-2)', border: '1px solid var(--glass-border)', borderRadius: 12, padding: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
                  <div style={{ width: 64, height: 64, borderRadius: 16, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.1)' }}>
                    <img src="/app-icon.png" alt="Melodix Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: 20, fontWeight: 600, color: 'var(--color-text)', margin: '0 0 4px' }}>Melodix</h3>
                    <div style={{ fontSize: 13, color: 'var(--color-text-dim)' }}>Version 1.0.0 (Beta)</div>
                  </div>
                </div>
                
                <button onClick={handleCheckUpdate} style={{ width: '100%', padding: '10px 0', background: 'var(--color-surface-active)', border: 'none', borderRadius: 8, color: 'var(--color-text)', fontSize: 13, cursor: 'pointer', transition: 'background 0.2s' }}>
                  Check for Updates
                </button>
              </div>

              {/* Links Card */}
              <div style={{ background: 'var(--glass-2)', border: '1px solid var(--glass-border)', borderRadius: 12, padding: 24 }}>
                <h4 style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text)', margin: '0 0 16px' }}>Links & Resources</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {[
                    { label: 'GitHub Repository', url: GITHUB_REPO_URL },
                    { label: 'Documentation & Guides', url: `${GITHUB_REPO_URL}#readme` },
                    { label: 'Report an Issue', url: `${GITHUB_REPO_URL}/issues` },
                    { label: 'Privacy Policy', url: `${GITHUB_REPO_URL}/blob/main/PRIVACY.md` }
                  ].map(link => (
                    <a
                      key={link.label}
                      href={link.url}
                      onClick={(e) => { e.preventDefault(); void invoke('open_external_url', { url: link.url }); }}
                      style={{ fontSize: 13, color: 'var(--color-text-dim)', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
                    >
                      <span>{link.label}</span>
                      <span style={{ opacity: 0.5 }}>↗</span>
                    </a>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ background: 'var(--glass-2)', border: '1px solid var(--glass-border)', borderRadius: 12, padding: 24, marginBottom: 32 }}>
              <h4 style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text)', margin: '0 0 12px' }}>构建技术 / Built With</h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 32 }}>
                {['React 18', 'TypeScript', 'Tauri (Rust)', 'Framer Motion', 'Vite', 'Zustand', 'Howler.js'].map(tech => (
                  <span key={tech} style={{ padding: '6px 12px', background: 'var(--glass-3)', borderRadius: 20, fontSize: 12, color: 'var(--color-text-dim)', border: '1px solid var(--glass-border)' }}>
                    {tech}
                  </span>
                ))}
              </div>

              <h4 style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text)', margin: '0 0 12px' }}>致谢 / Credits</h4>
              <p style={{ fontSize: 13, color: 'var(--color-text-dim)', lineHeight: 1.6, margin: '0 0 32px' }}>
                感谢开源社区，本项目依赖了众多优秀的开源项目（如 React, Tauri, Framer Motion 等）。<br />
                向所有无私奉献的开源开发者致敬。
              </p>

              <h4 style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text)', margin: '0 0 12px' }}>免责声明 / Disclaimer</h4>
              <div style={{ fontSize: 13, color: 'var(--color-danger-light)', background: 'rgba(239, 68, 68, 0.1)', padding: '16px', borderRadius: 8, margin: 0, border: '1px solid rgba(239, 68, 68, 0.2)', lineHeight: 1.6 }}>
                <strong>本项目仅供学习使用 (For Educational Purposes Only)</strong>
                <p style={{ margin: '8px 0 0', opacity: 0.9 }}>本软件仅作为技术学习与交流的示例，不得用于任何商业用途。软件内涉及的音频资源及 API 接口均来源于网络公开数据，版权归原平台及权利人所有。</p>
              </div>
            </div>
          </motion.div>
        );
      default: return null;
    }
  };

  return (
    <div style={{ display: 'flex', height: '100%', color: 'var(--color-text)' }}>
      {/* Settings Sidebar */}
      <div style={{ width: 240, borderRight: '1px solid var(--glass-border)', padding: '40px 16px' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 24px 12px', color: 'var(--color-text)' }}>Settings</h1>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {SETTINGS_TABS.map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <motion.button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                style={{
                  position: 'relative',
                  background: 'transparent',
                  border: 'none',
                  color: isActive ? 'var(--color-text)' : 'var(--color-text-dim)',
                  padding: '10px 12px', borderRadius: 8, textAlign: 'left', fontSize: 14,
                  fontWeight: isActive ? 500 : 400, cursor: 'pointer',
                  overflow: 'hidden'
                }}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeSettingsTab"
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'var(--glass-2)',
                      borderRadius: 8,
                      zIndex: -1,
                    }}
                    transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                  />
                )}
                {!isActive && (
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'transparent',
                    borderRadius: 8,
                    zIndex: -1
                  }} />
                )}
                <span style={{ position: 'relative', zIndex: 1 }}>{tab.label}</span>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Settings Content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ padding: '40px 64px', maxWidth: 800 }}>
          {renderContent()}
        </div>
      </div>

      {pathModalOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 'var(--z-modal)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)'
        }} onClick={() => setPathModalOpen(false)}>
          <div style={{
            background: 'var(--glass-bg)',
            backdropFilter: 'var(--glass-blur) var(--glass-saturate)',
            WebkitBackdropFilter: 'var(--glass-blur) var(--glass-saturate)',
            border: '1px solid var(--glass-border)',
            borderRadius: 'var(--radius-lg)',
            padding: '24px',
            minWidth: '400px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: 'var(--color-text)' }}>
              设置下载路径
            </div>
            <input
              autoFocus
              value={tempPath}
              onChange={e => setTempPath(e.target.value)}
              style={{
                width: '100%', padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-border)',
                background: 'var(--color-hover)',
                color: 'var(--color-text)',
                fontSize: 14,
                outline: 'none',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 20 }}>
              <button onClick={() => setPathModalOpen(false)}
                style={{
                  padding: '8px 20px', borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border)',
                  background: 'transparent', color: 'var(--color-text-dim)',
                  fontSize: 14, cursor: 'pointer',
                }}>取消</button>
              <button onClick={() => {
                setDownloadPath(tempPath);
                setPathModalOpen(false);
              }}
                style={{
                  padding: '8px 20px', borderRadius: 'var(--radius-sm)',
                  border: 'none', background: 'var(--color-primary)',
                  color: '#fff', fontSize: 14, cursor: 'pointer',
                }}>确认</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
