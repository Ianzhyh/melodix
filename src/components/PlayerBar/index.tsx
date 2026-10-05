import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePlaybackStore } from '../../stores/playbackStore';
import { useConfigStore } from '../../stores/configStore';
import { useFavoriteStore } from '../../stores/favoriteStore';
import { useDownloadStore } from '../../stores/downloadStore';
import { useToastStore } from '../../stores/toastStore';
import * as api from '../../api/client';
import { AudioEngine } from '../../services/AudioEngine';
import { decodeQRC } from '../../utils/qrcDecoder';
import { parseLrcTranslation, matchTranslations, isChineseLyric } from '../../utils/lyricParser';
import type { LyricLine, RouteState, Song } from '../../types/playback';
import { extractAndApplyTheme } from '../../utils/colorExtractor';
import { Icons, QUALITY_OPTIONS } from './Icons';
import { CommentPanel, Comment } from './CommentPanel';
import { useUIStore } from '../../stores/uiStore';
import { TrackInfo } from './TrackInfo';
import { ProgressBar } from './ProgressBar';
import { PlayControls } from './PlayControls';
import { VolumeControl } from './VolumeControl';
import { SleepTimerButton } from './SleepTimer';

import { getSongCoverUrl } from '../../utils/cover';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

// 解析本地歌词：支持 QRC JSON 格式（QQ 音乐补齐后存储）和 LRC 文本格式
async function parseLocalLyrics(lyricsStr: string): Promise<LyricLine[]> {
  if (!lyricsStr) return [];

  // 尝试解析为 QRC JSON（结构化逐字歌词）
  try {
    const parsed = JSON.parse(lyricsStr);
    if (parsed && parsed.success && Array.isArray(parsed.lyrics)) {
      return parsed.lyrics.map((item: any) => {
        const chars = item.chars || [];
        const text = chars.map((c: any) => c.c).join('');
        const words = chars.map((c: any) => ({
          text: c.c,
          start: c.t || 0,
          duration: c.d || 0,
        }));
        const duration = chars.length > 0
          ? Math.max(...chars.map((c: any) => (c.t || 0) + (c.d || 0))) - (item.time || 0)
          : 0;
        return {
          time: item.time || 0,
          duration: duration > 0 ? duration : 0,
          text,
          words,
        };
      });
    }
  } catch {
    // 不是 JSON，是 LRC 文本或加密 QRC，回退到 decodeQRC
  }

  return decodeQRC(lyricsStr);
}

export function PlayerBar({ onNavigate }: { onNavigate?: (route: RouteState) => void }) {
  const {
    current,
    isPlaying,
    isBuffering,
    progress,
    currentTime,
    duration,
    volume,
    isMuted,
    lyricsOpen,
    playbackError,
    setPlaying,
    setProgress,
    setVolume,
    setLyricsOpen,
    setLyrics,
    themeColor,
    bgIsLight,
    setThemeColor,
    setPlaybackError,
    next,
    prev,
    shuffle,
    toggleShuffle,
    repeatMode,
    cycleRepeatMode,
    addSongNext,
    toggleMute,
    setCurrentTime,
    radioMode,
    toggleRadioMode,
  } = usePlaybackStore();

  const sidecarPort = useConfigStore((state) => state.sidecarPort);
  const streamingQuality = useConfigStore((state) => state.streamingQuality);
  const setStreamingQuality = useConfigStore((state) => state.setStreamingQuality);
  const enableTransparency = useConfigStore((state) => state.enableTransparency);
  const { toggleFavorite, isFavorite } = useFavoriteStore();
  const lastTrackId = useRef<string | null>(null);
  const isFirstQualityRender = useRef(true);
  const commentVersionRef = useRef(0);
  const loadVersion = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekValue, setSeekValue] = useState(0);
  const [isIdle, setIsIdle] = useState(false);
  const [showQualityMenu, setShowQualityMenu] = useState(false);

  const activePanel = useUIStore((s) => s.activePanel);
  const showComments = activePanel === 'comments';
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const qualityMenuRef = useRef<HTMLDivElement>(null);

  const isLightBg = bgIsLight;

  // Auto-hide when idle in lyrics view
  useEffect(() => {
    if (!lyricsOpen) {
      setIsIdle(false);
      return;
    }
    let timeout: number;
    const resetIdle = () => {
      setIsIdle(false);
      window.clearTimeout(timeout);
      timeout = window.setTimeout(() => setIsIdle(true), 3000);
    };
    window.addEventListener('mousemove', resetIdle);
    window.addEventListener('keydown', resetIdle);
    resetIdle();
    return () => {
      window.removeEventListener('mousemove', resetIdle);
      window.removeEventListener('keydown', resetIdle);
      window.clearTimeout(timeout);
    };
  }, [lyricsOpen]);

  // Close quality menu on outside click
  useEffect(() => {
    if (!showQualityMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (qualityMenuRef.current && !qualityMenuRef.current.contains(e.target as Node)) {
        setShowQualityMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showQualityMenu]);

  // 全局 Escape 广播（App.tsx 派发 melodix-close-popups）：关闭音质菜单与更多菜单
  // （TrackInfo 的 MoreMenu state 在本组件，通过 props 下发，统一在此关闭）
  useEffect(() => {
    const closePopups = () => {
      setShowQualityMenu(false);
      setShowMoreMenu(false);
    };
    window.addEventListener('melodix-close-popups', closePopups);
    return () => window.removeEventListener('melodix-close-popups', closePopups);
  }, []);

  // Sync volume state to AudioEngine when it changes
  useEffect(() => {
    AudioEngine.setVolume(isMuted ? 0 : volume);
  }, [volume, isMuted]);

  // Auto-clear playback error after 3 seconds
  useEffect(() => {
    if (!playbackError) return;
    const timer = window.setTimeout(() => setPlaybackError(null), 3000);
    return () => window.clearTimeout(timer);
  }, [playbackError, setPlaybackError]);

  // Reset lastTrackId when streamingQuality changes to force reload
  useEffect(() => {
    if (isFirstQualityRender.current) {
      isFirstQualityRender.current = false;
      return;
    }
    lastTrackId.current = null;
  }, [streamingQuality]);

  // 监听本地音乐更新事件（在线补齐完成后触发）
  // 如果当前播放的是本地歌曲且尚无歌词，重新查询并显示补齐后的歌词
  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    let cancelled = false;
    listen('local-music-updated', async () => {
      const cur = usePlaybackStore.getState().current;
      if (!cur || !cur.isLocal || !cur.filePath) return;
      // 当前已有歌词，无需刷新
      if (cur.lyrics) return;

      try {
        // 通过歌曲名搜索查询最新信息，再按 id 精确匹配
        const songs = await invoke<Song[]>('get_local_songs', {
          offset: 0,
          limit: 50,
          search: cur.name,
        });
        if (cancelled) return;
        const updated = songs.find((s) => s.id === cur.id);
        if (!updated || !updated.lyrics) return;

        // 确认当前播放的仍然是这首歌
        const latest = usePlaybackStore.getState().current;
        if (!latest || latest.id !== cur.id) return;

        // 更新 current 歌曲对象的 lyrics 字段（不触发 setCurrent 的状态重置）
        usePlaybackStore.setState({ current: { ...latest, lyrics: updated.lyrics, onlineSource: updated.onlineSource } });

        // 解析并显示歌词（支持 QRC JSON 和 LRC 文本两种格式）
        try {
          const lines = await parseLocalLyrics(updated.lyrics);
          const isChinese = isChineseLyric(lines);
          const hasTrans = lines.some((l) => l.translation != null);
          setLyrics(lines, { isChineseLyric: isChinese, hasTranslation: hasTrans });
        } catch {
          // 解析失败，保持空歌词
        }
      } catch (e) {
        console.error('刷新本地歌曲歌词失败:', e);
      }
    }).then((fn) => {
      if (cancelled) {
        fn();
      } else {
        unlisten = fn;
      }
    }).catch((e) => {
      console.error('监听 local-music-updated 失败:', e);
    });

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, [setLyrics]);

  // Load and play new track when current song changes
  useEffect(() => {
    if (!current) {
      lastTrackId.current = null;
      loadVersion.current++;
      return;
    }
    if (current.id === lastTrackId.current) {
      return;
    }
    lastTrackId.current = current.id;
    loadVersion.current++;

    const loadAndPlay = async () => {
      const version = loadVersion.current;
      if (abortRef.current) {
        abortRef.current.abort();
      }
      abortRef.current = new AbortController();

      // 断点续播：恢复上次的播放位置（仅消费一次；元数据未就绪时由 AudioEngine 延迟应用）
      const applyResumeSeek = () => {
        const st = usePlaybackStore.getState();
        const pending = st.consumePendingSeek();
        if (pending !== null && pending > 0) {
          AudioEngine.seek(pending);
          const dur = AudioEngine.getDuration() || current.duration || 0;
          if (dur > 0) {
            st.setProgress(pending / dur);
            st.setCurrentTime(pending);
          }
        }
      };

      try {
        AudioEngine.pause();
        // 记录本轮的引擎请求序号：加载期间用户按暂停（pause() 会使序号变化）则视为被中断
        const engineReq = AudioEngine.getPlayRequestId();
        // 启动恢复的歌曲：只装载到暂停状态（定位进度），不自动开播
        const st0 = usePlaybackStore.getState();
        const isRestoreResume = st0.isRestoredSession;
        if (isRestoreResume) st0.markSessionRestored();

        // 统一的开播逻辑：恢复态或加载中被用户暂停 → 只装载不播放；
        // 加载期间用户按的是「播放」→ 装载完接着播；否则正常开播
        const startPlayback = (url: string) => {
          const interrupted = AudioEngine.getPlayRequestId() !== engineReq;
          if (interrupted || isRestoreResume) {
            AudioEngine.prepare(url);
            applyResumeSeek();
            if (AudioEngine.getUserWantsPlay()) {
              // 用户在加载期间点了播放：装载完成后继续播放
              AudioEngine.resume().then(() => {
                usePlaybackStore.getState().setPlaying(true);
              }).catch(() => {});
            }
            return;
          }
          AudioEngine.play(url).then(() => {
            setPlaying(true);
            setPlaybackError(null);
          }).catch(() => {
            setPlaying(false);
          });
          applyResumeSeek();
        };

        // 本地歌曲：跳过在线 API，直接用 convertFileSrc 转换本地文件路径播放
        if (current.isLocal && current.filePath) {
          const localUrl = convertFileSrc(current.filePath);

          // 如果已有补齐的歌词（数据库存储的 QRC JSON 或 LRC 文本），解析并显示
          if (current.lyrics) {
            try {
              const lines = await parseLocalLyrics(current.lyrics);
              const isChinese = isChineseLyric(lines);
              const hasTrans = lines.some((l) => l.translation != null);
              setLyrics(lines, { isChineseLyric: isChinese, hasTranslation: hasTrans });
            } catch {
              setLyrics([], { isChineseLyric: false, hasTranslation: false });
            }
          } else {
            // 无歌词，清空状态并异步触发在线补齐（不阻塞播放）
            setLyrics([], { isChineseLyric: false, hasTranslation: false });
            // 必须传 cookie 参数：Rust 命令签名为 enrich_local_song(db, state, app, id, cookie)，
            // 缺参会直接以 "missing required key `cookie`" 拒绝，导致补齐永远失败。
            // 歌词需要 QQ 音乐 Cookie，封面不需要；未登录时传空串仍可补齐封面。
            const tencentCookie = useConfigStore.getState().cookies?.tencent || '';
            invoke('enrich_local_song', { id: parseInt(current.id), cookie: tencentCookie })
              .then(() => {
                console.log('本地歌曲补齐完成:', current.name);
              })
              .catch((e) => console.error('本地歌曲补齐失败:', e));
          }

          // 提取封面主题色（如果有封面）
          const coverUrlForTheme = getSongCoverUrl(current, 300);
          const themePromise = extractAndApplyTheme(coverUrlForTheme).catch(() => null);

          startPlayback(localUrl);

          const themeResult = await themePromise;
          if (version !== loadVersion.current) return;
          if (themeResult) {
            setThemeColor(themeResult.themeColor, themeResult.bgIsLight, themeResult.themeColors);
          }
          return;
        }

        const source = current.source || 'netease';

        const urlPromise = api.getUrl(current.id, source, api.qualityToApiParam(streamingQuality), abortRef.current.signal);

        const lrcPromise = api.getLyric(current.id, source)
          .catch(() => { return null; });

        let coverUrlForTheme = getSongCoverUrl(current, 300);
        const themePromise = extractAndApplyTheme(coverUrlForTheme).catch(() => null);

        const urlResult = await urlPromise;
        if (version !== loadVersion.current) return;

        if (urlResult.url) {
          startPlayback(urlResult.url);
        } else {
          setPlaying(false);
          setPlaybackError('无法播放此歌曲，可能需要配置 QQ音乐 Cookie');
          return;
        }

        const lrcJson = await lrcPromise;
        if (version !== loadVersion.current) return;
        if (lrcJson) {
          const transMap = lrcJson.trans ? parseLrcTranslation(lrcJson.trans) : new Map<number, string>();

          if (lrcJson.success && Array.isArray(lrcJson.lyrics) && lrcJson.lyrics.length > 0) {
            const lines = lrcJson.lyrics.map((line) => {
              const chars = line.chars || [];
              const text = chars.map((c) => c.c).join('');
              const words = chars.map((c) => ({
                text: c.c,
                start: c.t || 0,
                duration: c.d || 0,
              }));
              const duration = chars.length > 0
                ? Math.max(...chars.map((c) => (c.t || 0) + (c.d || 0))) - line.time
                : 0;
              return {
                time: line.time,
                duration: duration > 0 ? duration : 0,
                text,
                words,
                chars,
              };
            });
            matchTranslations(lines, transMap);
            const isChinese = isChineseLyric(lines);
            const hasTrans = (lines as LyricLine[]).some((l) => l.translation != null);
            setLyrics(lines, { isChineseLyric: isChinese, hasTranslation: hasTrans });
          } else if (lrcJson.data || lrcJson.lyric || lrcJson.lrc) {
            const lrcData = lrcJson.data || lrcJson;
            const lrcText = typeof lrcData === 'string' ? lrcData : (lrcData?.lyric || lrcData?.lrc || '');
            if (lrcText && lrcText !== '{}') {
              const lines = await decodeQRC(lrcText);
              matchTranslations(lines, transMap);
              const isChinese = isChineseLyric(lines);
              const hasTrans = lines.some((l) => l.translation != null);
              setLyrics(lines, { isChineseLyric: isChinese, hasTranslation: hasTrans });
            }
          }
        }

        const themeResult = await themePromise;
        if (version !== loadVersion.current) return;
        if (themeResult) {
          setThemeColor(themeResult.themeColor, themeResult.bgIsLight, themeResult.themeColors);
        }

      } catch (err) {
        if (version !== loadVersion.current) return;
        setPlaying(false);
      }
    };

    loadAndPlay();

    return () => {
      // Memory Optimization: abort pending requests on unmount
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, [current, sidecarPort, streamingQuality, setPlaying, setLyrics, setThemeColor, setPlaybackError]);

  // Sync MediaSession metadata
  useEffect(() => {
    if (!current || !('mediaSession' in navigator)) return;

    const coverUrl = getSongCoverUrl(current, 500);

    navigator.mediaSession.metadata = new MediaMetadata({
      title: current.name || 'Unknown Track',
      artist: current.artist || 'Unknown Artist',
      album: current.album || 'Melodix',
      artwork: [
        { src: coverUrl, sizes: '500x500', type: 'image/jpeg' }
      ]
    });
  }, [current]);

  // Sync MediaSession action handlers
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    navigator.mediaSession.setActionHandler('play', () => {
      AudioEngine.resume().then(() => setPlaying(true)).catch(() => {});
    });
    navigator.mediaSession.setActionHandler('pause', () => {
      AudioEngine.pause();
      setPlaying(false);
    });
    navigator.mediaSession.setActionHandler('previoustrack', () => {
      prev();
    });
    navigator.mediaSession.setActionHandler('nexttrack', () => {
      next();
    });
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime !== undefined && duration > 0) {
        AudioEngine.seek(details.seekTime);
        setProgress(details.seekTime / duration);
        setCurrentTime(details.seekTime);
      }
    });

    return () => {
      navigator.mediaSession.setActionHandler('play', null);
      navigator.mediaSession.setActionHandler('pause', null);
      navigator.mediaSession.setActionHandler('previoustrack', null);
      navigator.mediaSession.setActionHandler('nexttrack', null);
      navigator.mediaSession.setActionHandler('seekto', null);
    };
  }, [next, prev, setPlaying, duration, setProgress, setCurrentTime]);

  // Sync MediaSession playback state
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  }, [isPlaying]);

  // Handle play/pause toggling
  const handleTogglePlay = () => {
    if (!current) return;
    if (isPlaying) {
      AudioEngine.pause();
      setPlaying(false);
    } else {
      AudioEngine.resume().then(() => {
        setPlaying(true);
      }).catch(() => {
      });
    }
  };

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!current) return;
    const val = Number(e.target.value);
    setSeekValue(val);
  };

  const handleSeekStart = () => {
    setIsSeeking(true);
    setSeekValue(progress);
  };

  const handleSeekEnd = () => {
    setIsSeeking(false);
    if (current) {
      const targetTime = seekValue * duration;
      AudioEngine.seek(targetTime);
      setProgress(seekValue);
    }
  };

  const handleToggleComments = () => {
    if (!current) return;
    const opening = activePanel !== 'comments';
    useUIStore.getState().togglePanel('comments');
    if (opening) {
      commentVersionRef.current++;
      const myVersion = commentVersionRef.current;
      setCommentsLoading(true);
      api.getComments(current.songId || '', current.id, current.source || 'tencent').then(res => {
        if (myVersion !== commentVersionRef.current) return;
        const data = res?.data || res?.comments || [];
        setComments(Array.isArray(data) ? data : []);
      }).catch(() => {
        if (myVersion !== commentVersionRef.current) return;
        setComments([]);
      }).finally(() => {
        if (myVersion !== commentVersionRef.current) return;
        setCommentsLoading(false);
      });
    }
  };

  // 相似歌曲电台开关：开启时预热候选缓存（腾讯首次构建较慢）
  const handleToggleRadio = () => {
    toggleRadioMode();
    const nextOn = !radioMode;
    useToastStore.getState().showToast(nextOn ? '已开启相似歌曲电台：队列播完后自动续播' : '已关闭相似歌曲电台', 'info');
    if (nextOn && current) {
      void api.warmRadioCache(current);
    }
  };

  return (
    <>
      <style>{`
        @media (max-width: 768px) {
          .player-quality-btn,
          .player-shuffle-btn,
          .player-repeat-btn,
          .player-volume-container {
            display: none !important;
          }
        }
        @media (max-width: 640px) {
          .player-time {
            display: none !important;
          }
          .player-progress-container {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            width: 100% !important;
            height: 3px !important;
            padding: 0 !important;
            margin: 0 !important;
            z-index: 10 !important;
          }
          .player-seek-slider {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            height: 3px !important;
            margin: 0 !important;
            border-radius: 0 !important;
            border: none !important;
          }
        }
      `}</style>
      <AnimatePresence>
        {lyricsOpen && isIdle && current && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            style={{
              position: 'fixed',
              bottom: 0,
              left: 0,
              right: 0,
              height: 4,
              background: 'var(--color-surface-active)',
              zIndex: 'var(--z-playerbar)',
              pointerEvents: 'none'
            }}
          >
            <div style={{ height: '100%', width: `${(progress || 0) * 100}%`, background: 'var(--color-primary, #6366f1)' }} />
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        layout
        initial={false}
        animate={{ y: lyricsOpen && isIdle ? 88 : 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        style={{
          ...(lyricsOpen ? (
            isLightBg ? {
              '--color-text': 'rgba(0,0,0,0.85)',
              '--color-text-dim': 'rgba(0,0,0,0.6)',
              '--color-text-faint': 'rgba(0,0,0,0.4)',
              '--color-icon': 'rgba(0,0,0,0.65)',
              '--color-icon-active': 'rgba(0,0,0,0.95)',
              '--color-icon-disabled': 'rgba(0,0,0,0.25)',
            } : {
              '--color-text': 'rgba(255,255,255,0.95)',
              '--color-text-dim': 'rgba(255,255,255,0.7)',
              '--color-text-faint': 'rgba(255,255,255,0.4)',
              '--color-icon': 'rgba(255,255,255,0.7)',
              '--color-icon-active': 'rgba(255,255,255,1)',
              '--color-icon-disabled': 'rgba(255,255,255,0.3)',
            }
          ) : {}),
          position: lyricsOpen ? 'fixed' : 'relative',
          bottom: lyricsOpen ? 0 : 'auto',
          left: lyricsOpen ? 0 : 'auto',
          right: lyricsOpen ? 0 : 'auto',
          width: lyricsOpen ? '100vw' : '100%',
          height: 'var(--player-bar-height, 88px)',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          zIndex: 'var(--z-playerbar)',
          color: 'var(--color-text)',
          userSelect: 'none',
          background: lyricsOpen ? 'transparent' : 'var(--glass-bg)',
          backdropFilter: lyricsOpen ? 'none' : 'var(--glass-blur) var(--glass-saturate)',
          WebkitBackdropFilter: lyricsOpen ? 'none' : 'var(--glass-blur) var(--glass-saturate)',
          borderTop: lyricsOpen ? 'none' : '1px solid var(--glass-border)',
          boxShadow: lyricsOpen ? 'none' : '0 -1px 0 var(--color-border), 0 -20px 60px rgba(0,0,0,0.15)'
        } as React.CSSProperties}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr 1fr', width: '100%', alignSelf: 'stretch', alignItems: 'center' }}>

          {/* Left: Track Info & Actions */}
          <TrackInfo
            song={current}
            isFavorited={current ? isFavorite(current.id) : false}
            onToggleFavorite={() => current && toggleFavorite(current)}
            onCoverClick={() => setLyricsOpen(true)}
            lyricsOpen={lyricsOpen}
            showComments={showComments}
            onToggleComments={handleToggleComments}
            showMoreMenu={showMoreMenu}
            onToggleMoreMenu={() => setShowMoreMenu(!showMoreMenu)}
            onCloseMoreMenu={() => setShowMoreMenu(false)}
            onAddToQueue={() => current && addSongNext(current)}
            onOpenArtist={(id, name) => {
              if (!current || !onNavigate) return;
              if (!id) return;
              onNavigate({ page: 'artist', id, source: current.source || 'tencent', name });
            }}
            radioMode={radioMode}
            onToggleRadio={handleToggleRadio}
            onDownload={() => {
              if (!current) return;
              useDownloadStore.getState().addTask(current);
            }}
            onCopySongName={() => {
              if (current) {
                navigator.clipboard.writeText(`${current.name} - ${current.artist}`);
              }
            }}
          />

          {/* Center: Play Controls & Progress */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', maxWidth: 600, justifySelf: 'center', gap: 8, position: 'relative' }}>

            {/* Top Row: Play Controls + Volume */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
              <PlayControls
                isPlaying={isPlaying}
                isBuffering={isBuffering}
                isShuffled={shuffle}
                repeatMode={repeatMode}
                onTogglePlay={handleTogglePlay}
                onNext={next}
                onPrev={prev}
                onToggleShuffle={toggleShuffle}
                onCycleRepeat={cycleRepeatMode}
                hasCurrent={!!current}
              />

              <VolumeControl
                volume={volume}
                isMuted={isMuted}
                onVolumeChange={(val) => setVolume(val)}
                onToggleMute={toggleMute}
              />

              <SleepTimerButton />
            </div>

            {/* Bottom Row: Progress Bar */}
            <ProgressBar
              currentTime={isSeeking ? seekValue * duration : currentTime}
              duration={duration}
              progress={progress}
              isSeeking={isSeeking}
              seekValue={seekValue}
              onSeekChange={handleSeekChange}
              onSeekStart={handleSeekStart}
              onSeekEnd={handleSeekEnd}
              hasCurrent={!!current}
              themeColor={themeColor}
            />

            {/* Playback Error Toast */}
            <AnimatePresence>
              {playbackError && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.2 }}
                  style={{
                    position: 'absolute',
                    top: -8,
                    left: '50%',
                    transform: 'translateX(-50%) translateY(-100%)',
                    background: 'var(--color-danger)',
                    color: 'var(--color-text)',
                    fontSize: 11,
                    padding: '4px 12px',
                    borderRadius: 6,
                    whiteSpace: 'nowrap',
                    pointerEvents: 'none',
                    zIndex: 'var(--z-toast)',
                  }}
                >
                  {playbackError}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Right: Extra Tools */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 16, color: 'var(--color-icon)' }}>
            <div ref={qualityMenuRef} className="player-quality-btn" style={{ position: 'relative' }}>
              <motion.button
                whileHover={{ color: 'var(--color-text)' }}
                aria-label="切换音质"
                onClick={() => setShowQualityMenu(!showQualityMenu)}
                style={{
                  background: showQualityMenu ? 'var(--color-surface-active)' : 'none',
                  border: `1px solid ${showQualityMenu ? 'var(--color-primary, #6366f1)' : 'var(--glass-border)'}`,
                  color: showQualityMenu ? 'var(--color-primary, #6366f1)' : 'inherit',
                  cursor: 'pointer', fontSize: 11, padding: '2px 8px', borderRadius: 4,
                  fontWeight: 600, letterSpacing: '0.5px',
                }}
              >
                {QUALITY_OPTIONS.find(o => o.value === streamingQuality)?.shortLabel || 'HQ'}
              </motion.button>
              <AnimatePresence>
                {showQualityMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    transition={{ duration: 0.15 }}
                    style={{
                      position: 'absolute', bottom: '100%', right: 0, marginBottom: 8,
                      background: enableTransparency ? 'var(--acrylic-noise), var(--acrylic-tint)' : 'var(--color-bg-elevated)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 8, padding: 4, minWidth: 160,
                      backdropFilter: enableTransparency ? 'var(--acrylic-blur) var(--acrylic-saturate)' : 'none',
                      WebkitBackdropFilter: enableTransparency ? 'var(--acrylic-blur) var(--acrylic-saturate)' : 'none',
                      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                      zIndex: 'var(--z-modal)',
                    }}
                  >
                    {QUALITY_OPTIONS.map(opt => (
                      <div
                        key={opt.value}
                        onClick={() => {
                          setStreamingQuality(opt.value);
                          setShowQualityMenu(false);
                        }}
                        style={{
                          padding: '8px 12px', borderRadius: 6, cursor: 'pointer',
                          fontSize: 13, color: streamingQuality === opt.value ? 'var(--color-primary, #6366f1)' : 'var(--color-text-dim)',
                          background: streamingQuality === opt.value ? 'var(--color-primary-10)' : 'transparent',
                          fontWeight: streamingQuality === opt.value ? 600 : 400,
                          transition: 'background 0.15s, color 0.15s',
                        }}
                        onMouseEnter={(e) => {
                          if (streamingQuality !== opt.value) {
                            (e.currentTarget as HTMLDivElement).style.background = 'var(--color-surface-hover)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (streamingQuality !== opt.value) {
                            (e.currentTarget as HTMLDivElement).style.background = 'transparent';
                          }
                        }}
                      >
                        {opt.label}
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <motion.button onClick={() => useUIStore.getState().toggleMiniPlayer()} whileHover={{ color: 'var(--color-primary, #6366f1)' }} aria-label="迷你播放器" style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }} title="迷你播放器 (Mini Player)">
              <svg viewBox="0 0 1024 1024" width="20" height="20" xmlns="http://www.w3.org/2000/svg">
                <path d="M469.333333 469.333333h384v298.666667h-384z" fill="currentColor"></path>
                <path d="M938.666667 85.333333H85.333333C38.4 85.333333 0 123.733333 0 170.666667v682.666666c0 46.933333 38.4 85.333333 85.333333 85.333334h853.333334c46.933333 0 85.333333-38.4 85.333333-85.333334V170.666667c0-46.933333-38.4-85.333333-85.333333-85.333334z m-25.6 742.4H110.933333V196.266667h802.133334v631.466666z" fill="currentColor"></path>
              </svg>
            </motion.button>
            <motion.button onClick={() => setLyricsOpen(!lyricsOpen)} whileHover={{ color: 'var(--color-primary, #6366f1)' }} aria-label={lyricsOpen ? '关闭歌词页' : '打开歌词页'} style={{ background: 'none', border: 'none', color: lyricsOpen ? 'var(--color-primary, #6366f1)' : 'inherit', cursor: 'pointer', padding: 0 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18V5l12-2v13" />
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="16" r="3" />
              </svg>
            </motion.button>
            <motion.button onClick={() => useUIStore.getState().togglePanel('queue')} whileHover={{ color: 'var(--color-text)' }} aria-label={activePanel === 'queue' ? '关闭播放队列' : '打开播放队列'} style={{ background: 'none', border: 'none', color: activePanel === 'queue' ? 'var(--color-primary, #6366f1)' : 'inherit', cursor: 'pointer', padding: 0 }}>
              {Icons.queue}
            </motion.button>
          </div>

        </div>
      </motion.div>

      {/* Comment Panel */}
      <CommentPanel
        show={showComments && !!current}
        onClose={() => useUIStore.getState().closePanel()}
        comments={comments}
        loading={commentsLoading}
      />
    </>
  );
}
