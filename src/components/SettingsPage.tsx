import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { useConfigStore } from '../stores/configStore';
import { useFavoriteStore } from '../stores/favoriteStore';
import { useSearchStore } from '../stores/searchStore';
import { useDownloadStore } from '../stores/downloadStore';
import { useLocalLibraryStore } from '../stores/localLibraryStore';
import { useToastStore } from '../stores/toastStore';
import { useHomeLayoutStore } from '../stores/homeLayoutStore';
import type { PlatformCookies } from '../stores/configStore';
import { open, ask, message as showDialog } from '@tauri-apps/plugin-dialog';
import { EqualizerSettings } from './EqualizerSettings';

// GitHub 仓库地址（上传后替换为真实地址，关于页跳转链接会用到）
const GITHUB_REPO_URL = 'https://github.com/Ianzhyh/melodix';

const PLATFORM_INFO: { key: keyof PlatformCookies; name: string; hint: string }[] = [
  { key: 'tencent', name: 'QQ音乐', hint: '访问 y.qq.com 按F12在Console输入document.cookie，或者使用下面的扫码登录' },
  { key: 'netease', name: '网易云音乐', hint: '访问 music.163.com 按F12在Application找Cookies' },
  { key: 'kugou', name: '酷狗音乐', hint: '暂时无需配置cookie' },
  { key: 'kuwo', name: '酷我音乐', hint: '访问 kuwo.cn 按F12在Application找Cookies' },
];

const SETTINGS_TABS = [
  { id: 'general', label: '常规与外观' },
  { id: 'playback', label: '播放与音效' },
  { id: 'downloads', label: '下载与本地' },
  { id: 'account', label: '账号与数据' },
  { id: 'about', label: '关于' },
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
  const enableTransparency = useConfigStore(s => s.enableTransparency);
  
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 全局 Escape 广播（App.tsx 派发 melodix-close-popups）：关闭下拉选项
  useEffect(() => {
    const closePopup = () => setIsOpen(false);
    window.addEventListener('melodix-close-popups', closePopup);
    return () => window.removeEventListener('melodix-close-popups', closePopup);
  }, []);

  const selectedOption = options.find(o => o.value === value) || options[0];

  return (
    <div ref={ref} style={{ position: 'relative', width: 240, zIndex: isOpen ? 50 : 1 }}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '100%', padding: '12px 16px', background: isOpen ? 'var(--glass-3)' : 'var(--glass-2)',
          border: `1px solid ${isOpen ? 'var(--color-primary)' : 'var(--glass-border)'}`, 
          borderRadius: 12, color: 'var(--color-text)',
          boxShadow: isOpen ? '0 4px 12px rgba(0,0,0,0.1)' : '0 2px 6px rgba(0,0,0,0.02)',
          fontSize: 14, fontWeight: 500, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {selectedOption.label}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', color: isOpen ? 'var(--color-primary)' : 'var(--color-text-dim)' }}>
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </div>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            style={{
              position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 8,
              background: enableTransparency ? 'var(--acrylic-noise), var(--acrylic-tint)' : 'var(--color-bg-elevated)',
              backdropFilter: enableTransparency ? 'var(--acrylic-blur) var(--acrylic-saturate)' : 'none',
              WebkitBackdropFilter: enableTransparency ? 'var(--acrylic-blur) var(--acrylic-saturate)' : 'none',
              border: '1px solid var(--color-border)', borderRadius: 12, padding: 4, overflow: 'hidden',
              zIndex: 10, boxShadow: '0 12px 40px rgba(0,0,0,0.3)'
            }}
          >
            {options.map(opt => (
              <div
                key={opt.value}
                onClick={() => { onChange(opt.value); setIsOpen(false); }}
                style={{
                  padding: '8px 12px', borderRadius: 8, fontSize: 13, fontWeight: opt.value === value ? 600 : 500,
                  color: opt.value === value ? 'var(--color-primary, #6366f1)' : 'var(--color-text)',
                  cursor: 'pointer', background: opt.value === value ? 'var(--color-surface-hover)' : 'transparent',
                  transition: 'background 0.15s'
                }}
                onMouseEnter={(e) => { if (opt.value !== value) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
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
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      {SEARCH_PLATFORMS.map(p => {
        const isActive = platform === p.id;
        return (
          <button
            key={p.id}
            onClick={() => setPlatform(p.id)}
            style={{
              padding: '8px 20px', borderRadius: 24, fontSize: 13, fontWeight: 600,
              background: isActive ? 'var(--color-primary, #6366f1)' : 'var(--glass-2)',
              border: `1px solid ${isActive ? 'var(--color-primary)' : 'var(--glass-border)'}`,
              color: isActive ? '#fff' : 'var(--color-text)',
              boxShadow: isActive ? 'none' : 'none',
              cursor: 'pointer', transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
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
        background: value ? 'var(--color-primary, #6366f1)' : 'var(--glass-3)',
        boxShadow: value ? '0 2px 8px rgba(0,0,0,0.1)' : 'inset 0 1px 3px rgba(0,0,0,0.1)',
        transition: 'background 0.3s, box-shadow 0.3s',
        display: 'flex', alignItems: 'center', padding: '0 2px',
        justifyContent: value ? 'flex-end' : 'flex-start'
      }}
    >
      <motion.div
        layout
        transition={{ type: 'spring', stiffness: 700, damping: 30 }}
        style={{
          width: 20, height: 20, background: '#fff', borderRadius: '50%',
          boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
        }}
      />
    </div>
  );
}

interface SettingsPageProps {
  onNavigate?: (route: { page: string; id?: string; source?: string }) => void;
}

export function SettingsPage({ onNavigate }: SettingsPageProps) {
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
    closeAction, setCloseAction,
    playerBackgroundType, setPlayerBackgroundType,
  } = useConfigStore();
  
  const favoriteIds = useFavoriteStore((s) => s.favoriteIds);
  const getFavorites = useFavoriteStore((s) => s.getFavorites);
  const { scanDirectory, scanning } = useLocalLibraryStore();
  const { showToast } = useToastStore();
  const [localCookies, setLocalCookies] = useState<PlatformCookies>({ ...cookies });
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('general');
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  
  const [downloadHistory, setDownloadHistory] = useState<{ name: string; artist: string; time: number }[]>([]);
  const downloadingRef = useRef(false);

  const [pathModalOpen, setPathModalOpen] = useState(false);
  const [tempPath, setTempPath] = useState(downloadPath);
  
  const [qrLoginState, setQrLoginState] = useState<'idle' | 'loading' | 'showing' | 'scanned' | 'success' | 'expired' | 'error'>('idle');
  const [qrBase64, setQrBase64] = useState('');
  const qrPollRef = useRef<number | null>(null);
  const qrLoadingRef = useRef(false);
  const isMountedRef = useRef(true);
  isMountedRef.current = true; // React StrictMode double-mount 会导致 cleanup 把 ref 设为 false, 每次 render 重置为 true
  
  const favoritesRef = useRef(getFavorites());
  const pendingCheckRef = useRef(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('melodix-download-history');
      if (saved) setDownloadHistory(JSON.parse(saved));
    } catch {}
    // 下载历史由 downloadStore 统一写入，完成数变化时重读 localStorage 刷新列表
    let lastCompleted = useDownloadStore.getState().tasks.filter((t) => t.status === 'completed').length;
    const unsub = useDownloadStore.subscribe((state) => {
      const completed = state.tasks.filter((t) => t.status === 'completed').length;
      if (completed === lastCompleted) return;
      lastCompleted = completed;
      try {
        const saved = localStorage.getItem('melodix-download-history');
        setDownloadHistory(saved ? JSON.parse(saved) : []);
      } catch {}
    });
    return unsub;
  }, []);

  useEffect(() => {
    favoritesRef.current = getFavorites();
  }, [favoriteIds, getFavorites]);

  useEffect(() => {
    if (!autoDownload || favoriteIds.length === 0 || !downloadPath) return;
    if (downloadingRef.current) {
      pendingCheckRef.current = true;
      return;
    }
    cancelledRef.current = false;
    
    const autoDownloadNew = async () => {
      downloadingRef.current = true;
      try {
        const downloadedIds: string[] = JSON.parse(localStorage.getItem('melodix-auto-downloaded-ids') || '[]');
        let addedCount = 0;
        const toDownload = favoritesRef.current.filter(song => !downloadedIds.includes(song.id));

        for (const song of toDownload) {
          if (cancelledRef.current || !isMountedRef.current) break;
          // 下载历史由 downloadStore 在任务完成时统一写入，此处只负责建任务
          useDownloadStore.getState().addTask(song);
          downloadedIds.push(song.id);
          addedCount += 1;
        }

        if (isMountedRef.current && addedCount > 0) {
          localStorage.setItem('melodix-auto-downloaded-ids', JSON.stringify(downloadedIds));
        }
      } catch {} finally {
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
  }, [favoriteIds, autoDownload, downloadPath]);

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
                window.postMessage({ type: 'auth-success' }, '*');
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
      setMessage({ text: '设置已成功保存。', type: 'success' });
      setTimeout(() => setMessage(null), 3000);
    } catch (e) {
      setMessage({ text: '保存失败：' + String(e), type: 'error' });
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
    width: '100%', padding: '14px 16px', background: 'var(--glass-3)',
    border: '1px solid var(--glass-border)', borderRadius: 12, color: 'var(--color-text)',
    fontSize: 14, fontFamily: 'monospace', outline: 'none', transition: 'all 0.2s',
    boxSizing: 'border-box', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)'
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'general':
        return (
          <motion.div key="general" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 8px', color: 'var(--color-text)', letterSpacing: '-0.5px' }}>常规与外观</h2>
            <p style={{ margin: '0 0 32px', color: 'var(--color-text-dim)', fontSize: 14 }}>自定义 Melodix 的全局行为与界面质感。</p>
            
            <div style={{ background: enableTransparency ? 'var(--settings-card-bg)' : 'var(--glass-2)', backdropFilter: enableTransparency ? 'var(--settings-card-backdrop)' : 'var(--blur-lg)', WebkitBackdropFilter: enableTransparency ? 'var(--settings-card-backdrop)' : 'var(--blur-lg)', border: '1px solid var(--glass-border)', borderRadius: 20, padding: 24, marginBottom: 24, boxShadow: '0 8px 32px rgba(0,0,0,0.03)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text)', marginBottom: 4 }}>亚克力透明效果</div>
                  <div style={{ fontSize: 13, color: 'var(--color-text-dim)' }}>全局开启流畅的模糊背景（需重启生效）</div>
                </div>
                <Toggle value={enableTransparency} onChange={() => setEnableTransparency(!enableTransparency)} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 24, marginBottom: 24 }}>
              <div style={{ background: enableTransparency ? 'var(--settings-card-bg)' : 'var(--glass-2)', backdropFilter: enableTransparency ? 'var(--settings-card-backdrop)' : 'var(--blur-lg)', WebkitBackdropFilter: enableTransparency ? 'var(--settings-card-backdrop)' : 'var(--blur-lg)', border: '1px solid var(--glass-border)', borderRadius: 20, padding: 24, boxShadow: '0 8px 32px rgba(0,0,0,0.03)', position: 'relative', zIndex: 10 }}>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--color-text)', marginBottom: 16 }}>色彩主题</label>
                <CustomSelect
                  value={theme}
                  onChange={(v) => setTheme(v as 'dark' | 'light' | 'system')}
                  options={[
                    { value: 'system', label: '跟随系统' },
                    { value: 'dark', label: '深色模式' },
                    { value: 'light', label: '浅色模式' },
                  ]}
                />
              </div>
              <div style={{ background: enableTransparency ? 'var(--settings-card-bg)' : 'var(--glass-2)', backdropFilter: enableTransparency ? 'var(--settings-card-backdrop)' : 'var(--blur-lg)', WebkitBackdropFilter: enableTransparency ? 'var(--settings-card-backdrop)' : 'var(--blur-lg)', border: '1px solid var(--glass-border)', borderRadius: 20, padding: 24, boxShadow: '0 8px 32px rgba(0,0,0,0.03)', position: 'relative', zIndex: 9 }}>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--color-text)', marginBottom: 16 }}>播放页背景</label>
                <CustomSelect
                  value={playerBackgroundType}
                  onChange={(v) => setPlayerBackgroundType(v as 'static' | 'dynamic')}
                  options={[
                    { value: 'static', label: '静态模糊' },
                    { value: 'dynamic', label: '动态流光' },
                  ]}
                />
              </div>
              <div style={{ background: enableTransparency ? 'var(--settings-card-bg)' : 'var(--glass-2)', backdropFilter: enableTransparency ? 'var(--settings-card-backdrop)' : 'var(--blur-lg)', WebkitBackdropFilter: enableTransparency ? 'var(--settings-card-backdrop)' : 'var(--blur-lg)', border: '1px solid var(--glass-border)', borderRadius: 20, padding: 24, boxShadow: '0 8px 32px rgba(0,0,0,0.03)', position: 'relative', zIndex: 8 }}>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--color-text)', marginBottom: 16 }}>关闭窗口时</label>
                <CustomSelect
                  value={closeAction}
                  onChange={(v) => setCloseAction(v as 'ask' | 'minimize' | 'exit')}
                  options={[
                    { value: 'ask', label: '询问每次' },
                    { value: 'minimize', label: '最小化到托盘' },
                    { value: 'exit', label: '直接退出' },
                  ]}
                />
              </div>
            </div>

            <div style={{ background: enableTransparency ? 'var(--settings-card-bg)' : 'var(--glass-2)', backdropFilter: enableTransparency ? 'var(--settings-card-backdrop)' : 'var(--blur-lg)', WebkitBackdropFilter: enableTransparency ? 'var(--settings-card-backdrop)' : 'var(--blur-lg)', border: '1px solid var(--glass-border)', borderRadius: 20, padding: 24, marginBottom: 24, boxShadow: '0 8px 32px rgba(0,0,0,0.03)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text)', marginBottom: 4 }}>自定义主页</div>
                  <div style={{ fontSize: 13, color: 'var(--color-text-dim)' }}>调整主页模块的显示、顺序、数量与布局（拖拽即可完成）</div>
                </div>
                <button
                  onClick={() => {
                    useHomeLayoutStore.getState().setEditMode(true);
                    onNavigate?.({ page: 'home' });
                  }}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '9px 20px', borderRadius: 999, border: 'none',
                    background: 'var(--color-primary)', color: '#fff',
                    fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    transition: 'background 0.2s, transform 0.2s', flexShrink: 0,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-primary-light)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--color-primary)'; e.currentTarget.style.transform = 'none'; }}
                >
                  去自定义
                </button>
              </div>
            </div>

            <div style={{ background: enableTransparency ? 'var(--settings-card-bg)' : 'var(--glass-2)', backdropFilter: enableTransparency ? 'var(--settings-card-backdrop)' : 'var(--blur-lg)', WebkitBackdropFilter: enableTransparency ? 'var(--settings-card-backdrop)' : 'var(--blur-lg)', border: '1px solid var(--glass-border)', borderRadius: 20, padding: 24, marginBottom: 24, boxShadow: '0 8px 32px rgba(0,0,0,0.03)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text)', marginBottom: 4 }}>显示翻译按钮</div>
                  <div style={{ fontSize: 13, color: 'var(--color-text-dim)' }}>在歌词界面显示翻译切换开关</div>
                </div>
                <Toggle value={showTranslationButton} onChange={() => setShowTranslationButton(!showTranslationButton)} />
              </div>
              <div style={{ width: '100%', height: 1, background: 'var(--glass-border)', marginBottom: 24 }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text)', marginBottom: 4 }}>自动翻译歌词</div>
                  <div style={{ fontSize: 13, color: 'var(--color-text-dim)' }}>加载新歌词时默认显示中文翻译</div>
                </div>
                <Toggle value={autoTranslateLyrics} onChange={() => setAutoTranslateLyrics(!autoTranslateLyrics)} />
              </div>
            </div>
          </motion.div>
        );

      case 'playback':
        return (
          <motion.div key="playback" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 8px', color: 'var(--color-text)', letterSpacing: '-0.5px' }}>播放与音效</h2>
            <p style={{ margin: '0 0 32px', color: 'var(--color-text-dim)', fontSize: 14 }}>配置音源平台、流媒体质量及全局均衡器。</p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 24, marginBottom: 32 }}>
              <div style={{ background: enableTransparency ? 'var(--settings-card-bg)' : 'var(--glass-2)', backdropFilter: enableTransparency ? 'var(--settings-card-backdrop)' : 'var(--blur-lg)', WebkitBackdropFilter: enableTransparency ? 'var(--settings-card-backdrop)' : 'var(--blur-lg)', border: '1px solid var(--glass-border)', borderRadius: 20, padding: 24, boxShadow: '0 8px 32px rgba(0,0,0,0.03)', position: 'relative', zIndex: 10 }}>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--color-text)', marginBottom: 16 }}>流媒体音质</label>
                <CustomSelect
                  value={streamingQuality}
                  onChange={(v) => setStreamingQuality(v as 'standard' | 'high' | 'lossless')}
                  options={[
                    { value: 'standard', label: '标准品质 (128 kbps)' },
                    { value: 'high', label: '高品质 (320 kbps)' },
                    { value: 'lossless', label: '无损品质 (FLAC)' },
                  ]}
                />
              </div>
              <div style={{ background: enableTransparency ? 'var(--settings-card-bg)' : 'var(--glass-2)', backdropFilter: enableTransparency ? 'var(--settings-card-backdrop)' : 'var(--blur-lg)', WebkitBackdropFilter: enableTransparency ? 'var(--settings-card-backdrop)' : 'var(--blur-lg)', border: '1px solid var(--glass-border)', borderRadius: 20, padding: 24, boxShadow: '0 8px 32px rgba(0,0,0,0.03)' }}>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--color-text)', marginBottom: 16 }}>默认搜索源</label>
                <SearchPlatformSelector />
              </div>
            </div>

            <EqualizerSettings />
          </motion.div>
        );

      case 'downloads':
        return (
          <motion.div key="downloads" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 8px', color: 'var(--color-text)', letterSpacing: '-0.5px' }}>下载与本地</h2>
            <p style={{ margin: '0 0 32px', color: 'var(--color-text-dim)', fontSize: 14 }}>管理离线音乐库与本地导入规则。</p>

            {/* Downloads Config */}
            <div style={{ background: enableTransparency ? 'var(--settings-card-bg)' : 'var(--glass-2)', backdropFilter: enableTransparency ? 'var(--settings-card-backdrop)' : 'var(--blur-lg)', WebkitBackdropFilter: enableTransparency ? 'var(--settings-card-backdrop)' : 'var(--blur-lg)', border: '1px solid var(--glass-border)', borderRadius: 20, padding: 24, marginBottom: 24, boxShadow: '0 8px 32px rgba(0,0,0,0.03)', position: 'relative', zIndex: 10 }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text)', marginBottom: 24 }}>下载设置</div>
              
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--color-text-dim)', marginBottom: 12, letterSpacing: '0.5px', textTransform: 'uppercase' }}>保存位置</label>
              <div style={{ display: 'flex', gap: 12, marginBottom: 32 }}>
                <input
                  type="text"
                  value={downloadPath}
                  onChange={(e) => setDownloadPath(e.target.value)}
                  placeholder="选择下载位置..."
                  style={{ ...inputStyle, flex: 1, background: 'var(--glass-1)', border: '1px solid var(--glass-border)', color: downloadPath ? 'var(--color-text)' : 'var(--color-text-dim)' }}
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
                  style={{ padding: '0 24px', borderRadius: 8, background: 'var(--color-primary)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                >
                  更改...
                </button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text)', marginBottom: 4 }}>自动下载收藏歌曲</div>
                  <div style={{ fontSize: 13, color: 'var(--color-text-dim)' }}>加入收藏时自动建立下载任务。</div>
                </div>
                <Toggle value={autoDownload} onChange={() => setAutoDownload(!autoDownload)} />
              </div>
              
              <div style={{ width: '100%', height: 1, background: 'var(--glass-border)', marginBottom: 24 }} />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text)', marginBottom: 4 }}>同时下载数量</div>
                  <div style={{ fontSize: 13, color: 'var(--color-text-dim)' }}>设置并发下载线程（1-10）</div>
                </div>
                <CustomSelect
                  value={String(maxConcurrentDownloads)}
                  onChange={(v) => setMaxConcurrentDownloads(Number(v))}
                  options={Array.from({ length: 10 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))}
                />
              </div>
            </div>

            {/* Local Library Config */}
            <div style={{ background: enableTransparency ? 'var(--settings-card-bg)' : 'var(--glass-2)', backdropFilter: enableTransparency ? 'var(--settings-card-backdrop)' : 'var(--blur-lg)', WebkitBackdropFilter: enableTransparency ? 'var(--settings-card-backdrop)' : 'var(--blur-lg)', border: '1px solid var(--glass-border)', borderRadius: 20, padding: 24, marginBottom: 24, boxShadow: '0 8px 32px rgba(0,0,0,0.03)', position: 'relative', zIndex: 9 }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text)', marginBottom: 24 }}>本地库设置</div>
              
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--color-text-dim)', marginBottom: 12, letterSpacing: '0.5px', textTransform: 'uppercase' }}>本地库目录</label>
              <div style={{ display: 'flex', gap: 12, marginBottom: 32 }}>
                <input
                  type="text"
                  value={localLibraryPath}
                  readOnly
                  placeholder="请选择本地库目录..."
                  style={{ ...inputStyle, flex: 1, background: 'var(--glass-1)', border: '1px solid var(--glass-border)', color: localLibraryPath ? 'var(--color-text)' : 'var(--color-text-dim)' }}
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
                  style={{ padding: '0 24px', borderRadius: 8, background: 'var(--color-primary)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                >
                  更改...
                </button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text)', marginBottom: 4 }}>下载后自动导入</div>
                  <div style={{ fontSize: 13, color: 'var(--color-text-dim)' }}>任务完成时自动添加到本地库。</div>
                </div>
                <Toggle value={autoImportOnDownload} onChange={() => setAutoImportOnDownload(!autoImportOnDownload)} />
              </div>

              <div style={{ width: '100%', height: 1, background: 'var(--glass-border)', marginBottom: 24 }} />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text)', marginBottom: 4 }}>导入模式</div>
                  <div style={{ fontSize: 13, color: 'var(--color-text-dim)' }}>只建索引，还是复制实体文件</div>
                </div>
                <CustomSelect
                  value={importMode}
                  onChange={(v) => setImportMode(v as 'copy' | 'index')}
                  options={[
                    { value: 'index', label: '仅创建索引' },
                    { value: 'copy', label: '复制到库目录' },
                  ]}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', background: 'var(--glass-1)', borderRadius: 16, border: '1px solid var(--glass-border)' }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text)', marginBottom: 4 }}>手动扫描</div>
                  <div style={{ fontSize: 13, color: 'var(--color-text-dim)' }}>扫描目录导入新增的音乐文件</div>
                </div>
                <motion.button
                  onClick={async () => {
                    if (!localLibraryPath) { showToast('请先设置库目录', 'error'); return; }
                    try {
                      const result = await scanDirectory(localLibraryPath);
                      showToast(`扫描完成：共 ${result.scanned} 个文件，导入 ${result.imported}`, 'success');
                    } catch (e) {
                      showToast('扫描失败', 'error');
                    }
                  }}
                  disabled={scanning}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  style={{
                    padding: '8px 24px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    background: scanning ? 'var(--glass-3)' : 'var(--color-primary)', color: scanning ? 'var(--color-text-dim)' : '#fff', border: 'none'
                  }}
                >
                  {scanning ? '正在扫描...' : '立即扫描'}
                </motion.button>
              </div>
            </div>
            
            {/* Download History */}
            <div style={{ background: enableTransparency ? 'var(--settings-card-bg)' : 'var(--glass-2)', backdropFilter: enableTransparency ? 'var(--settings-card-backdrop)' : 'var(--blur-lg)', border: '1px solid var(--glass-border)', borderRadius: 20, padding: 24, boxShadow: '0 8px 32px rgba(0,0,0,0.03)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text)', margin: 0 }}>下载历史</h3>
                {downloadHistory.length > 0 && (
                  <button
                    onClick={() => {
                      setDownloadHistory([]);
                      localStorage.removeItem('melodix-download-history');
                      localStorage.removeItem('melodix-auto-downloaded-ids');
                    }}
                    style={{ background: 'var(--glass-3)', border: 'none', color: 'var(--color-danger)', cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 6 }}
                  >
                    清除记录
                  </button>
                )}
              </div>
              {downloadHistory.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 32, color: 'var(--color-text-dim)', fontSize: 14 }}>暂无下载记录</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {downloadHistory.map((item, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderRadius: 12, background: 'var(--glass-1)', border: '1px solid var(--glass-border)' }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--color-text-dim)', marginTop: 4 }}>{item.artist}</div>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--color-text-dim)', marginLeft: 16, flexShrink: 0, fontWeight: 500 }}>
                        {new Date(item.time).toLocaleDateString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        );

      case 'account':
        return (
          <motion.div key="account" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 8px', color: 'var(--color-text)', letterSpacing: '-0.5px' }}>账号与数据</h2>
            <p style={{ margin: '0 0 32px', color: 'var(--color-text-dim)', fontSize: 14 }}>配置各平台数据访问授权凭证。</p>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 24 }}>
              {PLATFORM_INFO.map(({ key, name, hint }) => (
                <div key={key} style={{ background: enableTransparency ? 'var(--settings-card-bg)' : 'var(--glass-2)', backdropFilter: enableTransparency ? 'var(--settings-card-backdrop)' : 'var(--blur-lg)', WebkitBackdropFilter: enableTransparency ? 'var(--settings-card-backdrop)' : 'var(--blur-lg)', border: '1px solid var(--glass-border)', borderRadius: 20, padding: 24, boxShadow: '0 8px 32px rgba(0,0,0,0.03)' }}>
                  <label style={{ display: 'block', fontSize: 16, fontWeight: 600, color: 'var(--color-text)', marginBottom: 12 }}>{name}</label>
                  <input
                    type="password"
                    name={`${key}-cookie-input`}
                    autoComplete="new-password"
                    placeholder={hint}
                    value={localCookies[key] || ''}
                    onChange={(e) => setLocalCookies({ ...localCookies, [key]: e.target.value })}
                    style={{ ...inputStyle, background: 'var(--glass-1)', border: '1px solid var(--glass-border)' }}
                    onFocus={(e) => e.target.style.borderColor = 'var(--color-primary)'}
                    onBlur={(e) => e.target.style.borderColor = 'var(--glass-border)'}
                  />
                  {key === 'tencent' && (
                    <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      {qrLoginState === 'idle' && (
                        <button
                          onClick={handleStartQRLogin}
                          style={{
                            background: 'var(--color-primary)', color: '#fff', border: 'none',
                            padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                          }}
                        >
                          扫码一键授权
                        </button>
                      )}
                      {qrLoginState === 'loading' && <span style={{ fontSize: 13, color: 'var(--color-text-dim)', fontWeight: 500 }}>加载二维码...</span>}
                      {qrLoginState === 'showing' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', width: '100%', padding: '16px 0' }}>
                          <div style={{ padding: 8, background: '#fff', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.1)' }}>
                            <img src={qrBase64} style={{ width: 160, height: 160, display: 'block' }} alt="QR" />
                          </div>
                          <span style={{ fontSize: 13, color: 'var(--color-text-dim)', fontWeight: 500 }}>打开手机 QQ 扫一扫</span>
                          <button
                            onClick={() => { setQrLoginState('idle'); if (qrPollRef.current) clearInterval(qrPollRef.current); }}
                            style={{ background: 'none', border: 'none', color: 'var(--color-text-dim)', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}
                          >取消扫码</button>
                        </div>
                      )}
                      {qrLoginState === 'scanned' && <span style={{ fontSize: 13, color: 'var(--color-success)', fontWeight: 600 }}>扫描成功，请在手机上确认</span>}
                      {qrLoginState === 'success' && <span style={{ fontSize: 13, color: 'var(--color-success)', fontWeight: 600 }}>✅ 授权成功，凭证已保存</span>}
                      {(qrLoginState === 'expired' || qrLoginState === 'error') && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <span style={{ fontSize: 13, color: 'var(--color-danger)' }}>{qrLoginState === 'expired' ? '二维码失效' : '获取失败'}</span>
                          <button
                            onClick={handleStartQRLogin}
                            style={{ background: 'var(--glass-3)', border: '1px solid var(--glass-border)', color: 'var(--color-text)', fontSize: 12, padding: '4px 12px', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
                          >重试</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
            
            <div style={{ marginTop: 32, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 16 }}>
              <AnimatePresence>
                {message && (
                  <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 8, background: message.type === 'success' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: message.type === 'success' ? 'var(--color-success)' : 'var(--color-danger)', fontSize: 14, fontWeight: 500 }}>
                    {message.text}
                  </motion.div>
                )}
              </AnimatePresence>
              <motion.button
                onClick={handleSaveCookies}
                disabled={saving}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                style={{
                  background: 'var(--color-primary)', color: '#fff', border: 'none',
                  padding: '12px 32px', borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: 'pointer',
                  opacity: saving ? 0.7 : 1, boxShadow: 'none'
                }}
              >
                {saving ? '保存中...' : '保存所有配置'}
              </motion.button>
            </div>
          </motion.div>
        );

      case 'about':
        return (
          <motion.div key="about" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 8px', color: 'var(--color-text)', letterSpacing: '-0.5px' }}>关于 Melodix</h2>
            <p style={{ margin: '0 0 32px', color: 'var(--color-text-dim)', fontSize: 14 }}>了解应用信息与版权声明。</p>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 24, marginBottom: 32 }}>
              {/* App Info Card */}
              <div style={{ background: enableTransparency ? 'var(--settings-card-bg)' : 'var(--glass-2)', backdropFilter: enableTransparency ? 'var(--settings-card-backdrop)' : 'var(--blur-lg)', WebkitBackdropFilter: enableTransparency ? 'var(--settings-card-backdrop)' : 'var(--blur-lg)', border: '1px solid var(--glass-border)', borderRadius: 20, padding: 24, boxShadow: '0 8px 32px rgba(0,0,0,0.03)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 24 }}>
                  <div style={{ width: 72, height: 72, borderRadius: 20, background: 'var(--glass-1)', border: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.1)' }}>
                    <img src="/app-icon.png" alt="Melodix" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text)', margin: '0 0 4px', letterSpacing: '-0.5px' }}>Melodix</h3>
                    <div style={{ fontSize: 13, color: 'var(--color-text-dim)', fontWeight: 500 }}>版本 1.0.0 (Beta)</div>
                  </div>
                </div>
                
                <button onClick={handleCheckUpdate} style={{ width: '100%', padding: '12px 0', background: 'var(--glass-3)', border: '1px solid var(--glass-border)', borderRadius: 12, color: 'var(--color-text)', fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'background 0.2s', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                  检查更新
                </button>
              </div>

              {/* Links Card */}
              <div style={{ background: enableTransparency ? 'var(--settings-card-bg)' : 'var(--glass-2)', backdropFilter: enableTransparency ? 'var(--settings-card-backdrop)' : 'var(--blur-lg)', WebkitBackdropFilter: enableTransparency ? 'var(--settings-card-backdrop)' : 'var(--blur-lg)', border: '1px solid var(--glass-border)', borderRadius: 20, padding: 24, boxShadow: '0 8px 32px rgba(0,0,0,0.03)' }}>
                <h4 style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text)', margin: '0 0 20px' }}>链接与资源</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {[
                    { label: 'GitHub 仓库', url: GITHUB_REPO_URL },
                    { label: '文档与指南', url: `${GITHUB_REPO_URL}#readme` },
                    { label: '反馈问题', url: `${GITHUB_REPO_URL}/issues` },
                    { label: '隐私政策', url: `${GITHUB_REPO_URL}/blob/main/PRIVACY.md` }
                  ].map(link => (
                    <a
                      key={link.label}
                      href={link.url}
                      onClick={(e) => { e.preventDefault(); void invoke('open_external_url', { url: link.url }); }}
                      style={{ fontSize: 14, color: 'var(--color-text-dim)', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', fontWeight: 500, padding: '4px 0' }}
                    >
                      <span>{link.label}</span>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>
                    </a>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ background: enableTransparency ? 'var(--settings-card-bg)' : 'var(--glass-2)', backdropFilter: enableTransparency ? 'var(--settings-card-backdrop)' : 'var(--blur-lg)', WebkitBackdropFilter: enableTransparency ? 'var(--settings-card-backdrop)' : 'var(--blur-lg)', border: '1px solid var(--glass-border)', borderRadius: 20, padding: 24, marginBottom: 32, boxShadow: '0 8px 32px rgba(0,0,0,0.03)' }}>
              <h4 style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text)', margin: '0 0 16px' }}>技术驱动</h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 36 }}>
                {['React 19', 'TypeScript', 'Tauri (Rust)', 'Framer Motion', 'Vite', 'Zustand', 'Web Audio API'].map(tech => (
                  <span key={tech} style={{ padding: '8px 16px', background: 'var(--glass-1)', borderRadius: 24, fontSize: 13, fontWeight: 600, color: 'var(--color-text-dim)', border: '1px solid var(--glass-border)', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                    {tech}
                  </span>
                ))}
              </div>

              <h4 style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text)', margin: '0 0 16px' }}>致谢</h4>
              <p style={{ fontSize: 14, color: 'var(--color-text-dim)', lineHeight: 1.6, margin: '0 0 36px' }}>
                感谢开源社区，本项目依赖了众多优秀的开源项目。<br />
                向所有无私奉献的开源开发者致敬。
              </p>

              <h4 style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text)', margin: '0 0 16px' }}>免责声明</h4>
              <div style={{ fontSize: 13, color: 'var(--color-danger)', background: 'rgba(239, 68, 68, 0.05)', padding: '20px', borderRadius: 16, margin: 0, border: '1px solid rgba(239, 68, 68, 0.2)', lineHeight: 1.6 }}>
                <strong style={{ fontSize: 14 }}>仅供技术交流与学习</strong>
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
      <div style={{ width: 200, minWidth: 160, flexShrink: 0, borderRight: '1px solid var(--glass-border)', padding: '40px 12px', overflowX: 'hidden' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 24px 12px', color: 'var(--color-text)' }}>设置</h1>
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
        <div style={{ padding: 'clamp(24px, 4vw, 64px)', maxWidth: 800, margin: '0 auto', boxSizing: 'border-box' }}>
          <AnimatePresence mode="wait">
            {renderContent()}
          </AnimatePresence>
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
