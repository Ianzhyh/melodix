import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { motion } from 'framer-motion';
import { open } from '@tauri-apps/plugin-dialog';
import type { UnlistenFn } from '@tauri-apps/api/event';
import { useLocalLibraryStore, type ScanResult } from '../stores/localLibraryStore';
import { usePlaybackStore } from '../stores/playbackStore';
import { useConfigStore } from '../stores/configStore';
import { useToastStore } from '../stores/toastStore';
import { AddToLibraryButton } from './AddToLibraryModal';
import { TrackList, TrackListHeader } from './common/TrackList';
import { TrackRow } from './common/TrackRow';

// 支持的音频扩展名
const AUDIO_EXTENSIONS = ['mp3', 'flac', 'wav', 'aac', 'm4a', 'ogg'];

export function LocalLibraryPage() {
  const songs = useLocalLibraryStore((s) => s.songs);
  const totalCount = useLocalLibraryStore((s) => s.totalCount);
  const loading = useLocalLibraryStore((s) => s.loading);
  const scanning = useLocalLibraryStore((s) => s.scanning);
  const scanProgress = useLocalLibraryStore((s) => s.scanProgress);
  const enriching = useLocalLibraryStore((s) => s.enriching);
  const enrichProgress = useLocalLibraryStore((s) => s.enrichProgress);
  const hasMore = useLocalLibraryStore((s) => s.hasMore);
  const loadSongs = useLocalLibraryStore((s) => s.loadSongs);
  const searchStore = useLocalLibraryStore((s) => s.search);
  const scanDirectory = useLocalLibraryStore((s) => s.scanDirectory);
  const importFiles = useLocalLibraryStore((s) => s.importFiles);
  const refreshCount = useLocalLibraryStore((s) => s.refreshCount);
  const enrichAllSongs = useLocalLibraryStore((s) => s.enrichAllSongs);
  const startWatching = useLocalLibraryStore((s) => s.startWatchingLocalMusicUpdates);

  const setQueue = usePlaybackStore((s) => s.setQueue);
  const current = usePlaybackStore((s) => s.current);
  const isPlaying = usePlaybackStore((s) => s.isPlaying);
  const localLibraryPath = useConfigStore((s) => s.localLibraryPath);
  const showToast = useToastStore((s) => s.showToast);

  const [searchInput, setSearchInput] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listEndRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Virtualizer setup
  const rowVirtualizer = useVirtualizer({
    count: songs.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 62, // 60px row + 2px gap
    overscan: 10,
  });

  // 挂载时加载歌曲、刷新总数、监听文件监控更新
  useEffect(() => {
    void loadSongs(true);
    void refreshCount();
    let unlisten: UnlistenFn | null = null;
    let cancelled = false;
    startWatching().then((fn) => {
      if (cancelled) {
        fn();
      } else {
        unlisten = fn;
      }
    }).catch((err) => {
      console.error('监听本地音乐更新失败:', err);
    });
    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, [loadSongs, refreshCount, startWatching]);

  // 搜索防抖 300ms
  const handleSearchInput = useCallback((value: string) => {
    setSearchInput(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      void searchStore(value);
    }, 300);
  }, [searchStore]);

  useEffect(() => {
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, []);

  // 滚动到底部加载更多
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el || loading || !hasMore || scanning) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) {
      void loadSongs(false);
    }
  }, [loading, hasMore, scanning, loadSongs]);

  // 点击行播放
  const handlePlay = useCallback((index: number) => {
    setQueue(songs, index);
  }, [songs, setQueue]);

  // 导入结果 toast，并在有新歌曲导入时自动触发批量补齐
  const reportImportResult = useCallback((result: ScanResult, action: string) => {
    showToast(
      `${action}：成功 ${result.imported} 首，跳过 ${result.skipped} 首，失败 ${result.failed} 首`,
      result.failed > 0 ? 'error' : 'success'
    );
    // 有新歌曲导入时，自动触发批量补齐封面和歌词（异步，不阻塞）
    if (result.imported > 0) {
      void enrichAllSongs();
    }
  }, [showToast, enrichAllSongs]);

  // 选择文件导入
  const handleImportFiles = useCallback(async () => {
    try {
      const selected = await open({
        multiple: true,
        filters: [{ name: '音乐', extensions: AUDIO_EXTENSIONS }],
      });
      if (!selected) return;
      const paths = Array.isArray(selected) ? selected : [selected];
      if (paths.length === 0) return;
      const result = await importFiles(paths);
      reportImportResult(result, '导入文件');
    } catch (err) {
      console.error('导入文件失败:', err);
      showToast(`导入文件失败：${String(err)}`, 'error');
    }
  }, [importFiles, reportImportResult, showToast]);

  // 选择文件夹导入（扫描该目录）
  const handleImportFolder = useCallback(async () => {
    try {
      const selected = await open({ directory: true });
      if (!selected || typeof selected !== 'string') return;
      const result = await scanDirectory(selected);
      reportImportResult(result, '导入文件夹');
    } catch (err) {
      console.error('导入文件夹失败:', err);
      showToast(`导入文件夹失败：${String(err)}`, 'error');
    }
  }, [scanDirectory, reportImportResult, showToast]);

  // 重新扫描配置的本地库目录
  const handleRescan = useCallback(async () => {
    if (!localLibraryPath) {
      showToast('请先在设置中配置本地库目录', 'info');
      return;
    }
    try {
      const result = await scanDirectory(localLibraryPath);
      reportImportResult(result, '重新扫描');
    } catch (err) {
      console.error('重新扫描失败:', err);
      showToast(`重新扫描失败：${String(err)}`, 'error');
    }
  }, [localLibraryPath, scanDirectory, reportImportResult, showToast]);

  // 手动触发批量补齐封面和歌词
  const handleEnrichAll = useCallback(async () => {
    try {
      await enrichAllSongs();
      showToast('补齐完成', 'success');
    } catch (err) {
      console.error('补齐失败:', err);
      showToast(`补齐失败：${String(err)}`, 'error');
    }
  }, [enrichAllSongs, showToast]);

  // 进度百分比
  const progressPercent = useMemo(() => {
    if (!scanProgress || scanProgress.total === 0) return 0;
    return Math.min(100, Math.round((scanProgress.scanned / scanProgress.total) * 100));
  }, [scanProgress]);

  // 补齐进度百分比
  const enrichPercent = useMemo(() => {
    if (!enrichProgress || enrichProgress.total === 0) return 0;
    return Math.min(100, Math.round((enrichProgress.current / enrichProgress.total) * 100));
  }, [enrichProgress]);

  const isEmpty = songs.length === 0 && !loading && !scanning;

  return (
    <div
      ref={scrollContainerRef}
      onScroll={handleScroll}
      style={{ height: '100%', overflowY: 'auto' }}
    >
      <div style={{ padding: 'clamp(20px, 3vw, 40px)', maxWidth: 1200, margin: '0 auto' }}>
      <style>{`
        .ll-track-row:hover .ll-track-index {
          display: none !important;
        }
        .ll-track-row:hover .ll-play-icon {
          display: inline-flex !important;
        }
        .ll-track-row .cl-add-btn {
          opacity: 0;
          pointer-events: none;
        }
        .ll-track-row:hover .cl-add-btn {
          opacity: 1;
          pointer-events: auto;
        }
        .ll-toolbar-btn:hover:not(:disabled) {
          background: var(--color-surface-active, rgba(255,255,255,0.08)) !important;
        }
      `}</style>

      {/* 页面头部 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <div style={{
          width: 56,
          height: 56,
          borderRadius: 12,
          background: 'var(--color-primary, #6366f1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
        </div>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>本地音乐</h1>
          <p style={{ fontSize: 14, color: 'var(--color-text-dim, rgba(255,255,255,0.65))', margin: '4px 0 0' }}>
            {totalCount} 首歌曲
          </p>
        </div>
      </div>

      {/* 工具栏 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          type="text"
          value={searchInput}
          onChange={(e) => handleSearchInput(e.target.value)}
          placeholder="搜索本地音乐..."
          style={{
            flex: 1,
            minWidth: 200,
            height: 36,
            padding: '0 12px',
            fontSize: 13,
            color: 'var(--color-text, rgba(255,255,255,0.95))',
            background: 'var(--color-hover, rgba(255,255,255,0.04))',
            border: '1px solid var(--color-border, rgba(255,255,255,0.06))',
            borderRadius: 8,
            outline: 'none',
          }}
        />
        <button
          onClick={handleImportFiles}
          className="ll-toolbar-btn"
          disabled={scanning}
          style={toolbarButtonStyle(scanning)}
        >
          导入文件
        </button>
        <button
          onClick={handleImportFolder}
          className="ll-toolbar-btn"
          disabled={scanning}
          style={toolbarButtonStyle(scanning)}
        >
          导入文件夹
        </button>
        <button
          onClick={handleRescan}
          className="ll-toolbar-btn"
          disabled={scanning}
          style={toolbarButtonStyle(scanning)}
        >
          重新扫描
        </button>
        <button
          onClick={handleEnrichAll}
          className="ll-toolbar-btn"
          disabled={enriching || scanning}
          style={toolbarButtonStyle(enriching || scanning)}
        >
          {enriching ? '补齐中...' : '补齐封面歌词'}
        </button>
      </div>

      {/* 扫描进度条 */}
      {scanProgress && (
        <div style={{
          marginBottom: 16,
          padding: '12px 14px',
          background: 'var(--color-hover, rgba(255,255,255,0.04))',
          borderRadius: 8,
          border: '1px solid var(--color-border, rgba(255,255,255,0.06))',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--color-text-dim, rgba(255,255,255,0.65))' }}>
              正在扫描... {scanProgress.scanned} / {scanProgress.total}
            </span>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-primary)' }}>
              {progressPercent}%
            </span>
          </div>
          <div style={{
            height: 4,
            background: 'var(--color-border, rgba(255,255,255,0.06))',
            borderRadius: 2,
            overflow: 'hidden',
          }}>
            <motion.div
              animate={{ width: `${progressPercent}%` }}
              transition={{ duration: 0.2 }}
              style={{
                height: '100%',
                background: 'var(--color-primary, #6366f1)',
                borderRadius: 2,
              }}
            />
          </div>
          {scanProgress.currentFile && (
            <div style={{
              marginTop: 8,
              fontSize: 11,
              color: 'var(--color-text-faint, rgba(255,255,255,0.45))',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              {scanProgress.currentFile}
            </div>
          )}
        </div>
      )}

      {/* 补齐进度条 */}
      {enrichProgress && (
        <div style={{
          marginBottom: 16,
          padding: '12px 14px',
          background: 'var(--color-hover, rgba(255,255,255,0.04))',
          borderRadius: 8,
          border: '1px solid var(--color-border, rgba(255,255,255,0.06))',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--color-text-dim, rgba(255,255,255,0.65))' }}>
              正在补齐封面歌词... {enrichProgress.current} / {enrichProgress.total}
            </span>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-primary)' }}>
              {enrichPercent}%
            </span>
          </div>
          <div style={{
            height: 4,
            background: 'var(--color-border, rgba(255,255,255,0.06))',
            borderRadius: 2,
            overflow: 'hidden',
          }}>
            <motion.div
              animate={{ width: `${enrichPercent}%` }}
              transition={{ duration: 0.2 }}
              style={{
                height: '100%',
                background: 'var(--color-primary, #6366f1)',
                borderRadius: 2,
              }}
            />
          </div>
          {enrichProgress.currentSong && (
            <div style={{
              marginTop: 8,
              fontSize: 11,
              color: 'var(--color-text-faint, rgba(255,255,255,0.45))',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              {enrichProgress.currentSong}
            </div>
          )}
        </div>
      )}

      {/* 空状态 */}
      {isEmpty && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--color-text-faint, rgba(255,255,255,0.45))' }}>
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'center' }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
          </div>
          <p style={{ fontSize: 16, margin: '0 0 4px' }}>还没有本地音乐</p>
          <p style={{ fontSize: 13, margin: '0 0 20px' }}>导入文件或文件夹以开始聆听</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button onClick={handleImportFiles} style={toolbarButtonStyle(false)}>导入文件</button>
            <button onClick={handleImportFolder} style={toolbarButtonStyle(false)}>导入文件夹</button>
          </div>
        </div>
      )}

      {/* 歌曲列表 */}
      {songs.length > 0 && (
        <TrackList showCover={true} actionWidth="160px">
          <div style={{ padding: '0 12px' }}>
            <TrackListHeader showCover={true} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div 
              style={{ 
                height: `${rowVirtualizer.getTotalSize()}px`, 
                width: '100%', 
                position: 'relative',
              }}
            >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const index = virtualRow.index;
              const song = songs[index];
              return (
                <div
                  key={virtualRow.key}
                  data-index={index}
                  ref={rowVirtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                    paddingBottom: 2, // 替代之前的 gap: 2
                  }}
                >
                  <TrackRow
                    song={song}
                    index={index}
                    displayIndex={index + 1}
                    isCurrent={current?.id === song.id}
                    isPlaying={isPlaying}
                    selectMode={false}
                    selected={false}
                    onToggleSelect={() => {}}
                    onPlay={() => handlePlay(index)}
                    showCover={true}
                    renderAction={() => (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {song.format && (
                          <span style={{
                            fontSize: 10,
                            fontWeight: 600,
                            color: 'var(--color-text-dim, rgba(255,255,255,0.65))',
                            background: 'var(--color-hover, rgba(255,255,255,0.06))',
                            padding: '2px 6px',
                            borderRadius: 4,
                            textTransform: 'uppercase',
                            letterSpacing: 0.5,
                          }}>
                            {song.format}
                          </span>
                        )}
                        <AddToLibraryButton song={song} />
                      </div>
                    )}
                  />
                </div>
              );
            })}
          </div>
          
          {/* 加载更多 / 触底哨兵 */}
            <div ref={listEndRef} style={{ height: 1 }} />
            {loading && (
              <div style={{ textAlign: 'center', padding: '16px 0', fontSize: 12, color: 'var(--color-text-faint, rgba(255,255,255,0.45))' }}>
                加载中...
              </div>
            )}
            {!loading && !hasMore && songs.length > 0 && (
              <div style={{ textAlign: 'center', padding: '16px 0', fontSize: 12, color: 'var(--color-text-faint, rgba(255,255,255,0.45))' }}>
                已加载全部
              </div>
            )}
          </div>
        </TrackList>
      )}
      </div>
    </div>
  );
}

// 工具栏按钮统一样式
function toolbarButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    height: 36,
    padding: '0 14px',
    fontSize: 13,
    fontWeight: 500,
    color: disabled ? 'var(--color-text-faint, rgba(255,255,255,0.4))' : 'var(--color-text, rgba(255,255,255,0.95))',
    background: 'var(--color-hover, rgba(255,255,255,0.04))',
    border: '1px solid var(--color-border, rgba(255,255,255,0.06))',
    borderRadius: 8,
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'background 0.15s',
    whiteSpace: 'nowrap',
  };
}
