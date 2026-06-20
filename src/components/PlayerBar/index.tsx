import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePlaybackStore } from '../../stores/playbackStore';
import { useConfigStore } from '../../stores/configStore';
import { useFavoriteStore } from '../../stores/favoriteStore';
import { useDownloadStore } from '../../stores/downloadStore';
import * as api from '../../api/client';
import { AudioEngine } from '../../services/AudioEngine';
import { decodeQRC } from '../../utils/qrcDecoder';
import { parseLrcTranslation, matchTranslations, isChineseLyric } from '../../utils/lyricParser';
import type { LyricLine, Song } from '../../types/playback';
import { extractAndApplyTheme } from '../../utils/colorExtractor';
import { Icons, QUALITY_OPTIONS } from './Icons';
import { CommentPanel, Comment } from './CommentPanel';
import { useUIStore } from '../../stores/uiStore';
import { TrackInfo } from './TrackInfo';
import { ProgressBar } from './ProgressBar';
import { PlayControls } from './PlayControls';
import { VolumeControl } from './VolumeControl';

import { getSongCoverUrl } from '../../utils/cover';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

// 解析本地歌词：支持 QRC JSON 格式（QQ 音乐补齐后存储）和 LRC 文本格式
function parseLocalLyrics(lyricsStr: string): LyricLine[] {
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

export function PlayerBar() {
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
  } = usePlaybackStore();

  const sidecarPort = useConfigStore((state) => state.sidecarPort);
  const streamingQuality = useConfigStore((state) => state.streamingQuality);
  const setStreamingQuality = useConfigStore((state) => state.setStreamingQuality);
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
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
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

  // Close volume slider on outside click
  useEffect(() => {
    if (!showVolumeSlider) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('.player-volume-container')) return;
      setShowVolumeSlider(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showVolumeSlider]);

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
          const lines = parseLocalLyrics(updated.lyrics);
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
      try {
        AudioEngine.pause();

        // 本地歌曲：跳过在线 API，直接用 convertFileSrc 转换本地文件路径播放
        if (current.isLocal && current.filePath) {
          const localUrl = convertFileSrc(current.filePath);

          // 如果已有补齐的歌词（数据库存储的 QRC JSON 或 LRC 文本），解析并显示
          if (current.lyrics) {
            try {
              const lines = parseLocalLyrics(current.lyrics);
              const isChinese = isChineseLyric(lines);
              const hasTrans = lines.some((l) => l.translation != null);
              setLyrics(lines, { isChineseLyric: isChinese, hasTranslation: hasTrans });
            } catch {
              setLyrics([], { isChineseLyric: false, hasTranslation: false });
            }
          } else {
            // 无歌词，清空状态并异步触发在线补齐（不阻塞播放）
            setLyrics([], { isChineseLyric: false, hasTranslation: false });
            invoke('enrich_local_song', { id: parseInt(current.id) })
              .then(() => {
                console.log('本地歌曲补齐完成:', current.name);
              })
              .catch((e) => console.error('本地歌曲补齐失败:', e));
          }

          // 提取封面主题色（如果有封面）
          const coverUrlForTheme = getSongCoverUrl(current, 300);
          const themePromise = extractAndApplyTheme(coverUrlForTheme).catch(() => null);

          AudioEngine.play(localUrl).then(() => {
            setPlaying(true);
            setPlaybackError(null);
          }).catch(() => {
            setPlaying(false);
          });

          const themeResult = await themePromise;
          if (version !== loadVersion.current) return;
          if (themeResult) {
            setThemeColor(themeResult.themeColor, themeResult.bgIsLight);
          }
          return;
        }

        const source = current.source || 'netease';

        const urlPromise = api.getUrl(current.id, source, api.qualityToApiParam(streamingQuality), abortRef.current.signal);

        const lrcPromise = api.getLyric(current.id, source)
          .catch(e => { return null; });

        let coverUrlForTheme = getSongCoverUrl(current, 300);
        const themePromise = extractAndApplyTheme(coverUrlForTheme).catch(() => null);

        const urlResult = await urlPromise;
        if (version !== loadVersion.current) return;

        if (urlResult.url) {
          AudioEngine.play(urlResult.url).then(() => {
            setPlaying(true);
            setPlaybackError(null);
          }).catch(e => {
            setPlaying(false);
          });
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
              const lines = decodeQRC(lrcText);
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
          setThemeColor(themeResult.themeColor, themeResult.bgIsLight);
        }

      } catch (err) {
        if (version !== loadVersion.current) return;
        setPlaying(false);
      }
    };

    loadAndPlay();
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
      }).catch((err) => {
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

  const coverUrl = current ? getSongCoverUrl(current, 300) : '';

  const songProps = current ? { name: current.name, artist: current.artist, coverUrl, id: current.id } : null;

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
        transition={{ type: 'spring', stiffness: 300, damping: 35 }}
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
        <div style={{ display: 'flex', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'space-between' }}>

          {/* Left: Track Info & Actions */}
          <TrackInfo
            song={songProps}
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
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1.5, maxWidth: 600, gap: 8, position: 'relative' }}>

            {/* Top Row: Play Controls + Volume */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
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
                showVolumeSlider={showVolumeSlider}
                onVolumeChange={(val) => setVolume(val)}
                onToggleMute={toggleMute}
                onToggleVolumeSlider={() => setShowVolumeSlider(!showVolumeSlider)}
              />
            </div>

            {/* Bottom Row: Progress Bar */}
            <ProgressBar
              currentTime={currentTime}
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 20, flex: 1, minWidth: 0, color: 'var(--color-icon)' }}>
            <div ref={qualityMenuRef} className="player-quality-btn" style={{ position: 'relative' }}>
              <motion.button
                whileHover={{ color: 'var(--color-text)' }}
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
                      background: 'var(--glass-bg)',
                      border: '1px solid var(--glass-border)',
                      borderRadius: 8, padding: 4, minWidth: 160,
                      backdropFilter: 'blur(20px)',
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
            <motion.button onClick={() => setLyricsOpen(!lyricsOpen)} whileHover={{ color: 'var(--color-primary, #6366f1)' }} style={{ background: 'none', border: 'none', color: lyricsOpen ? 'var(--color-primary, #6366f1)' : 'inherit', cursor: 'pointer', padding: 0 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18V5l12-2v13" />
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="16" r="3" />
              </svg>
            </motion.button>
            <motion.button onClick={() => useUIStore.getState().togglePanel('queue')} whileHover={{ color: 'var(--color-text)' }} style={{ background: 'none', border: 'none', color: activePanel === 'queue' ? 'var(--color-primary, #6366f1)' : 'inherit', cursor: 'pointer', padding: 0 }}>
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
