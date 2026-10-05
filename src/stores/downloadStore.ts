import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { Song } from '../types/playback';
import { useConfigStore } from './configStore';
import { useToastStore } from './toastStore';
import * as api from '../api/client';

export type DownloadStatus = 'pending' | 'downloading' | 'paused' | 'completed' | 'failed' | 'canceled';

export interface DownloadTask {
  id: string;
  song: Song;
  url: string;
  filename: string;
  downloadDir: string;
  status: DownloadStatus;
  progress: number;
  downloaded: number;
  total: number;
  speed: number;
  error: string;
  retryCount: number;
  // 已废弃：调度顺序由 tasks 数组顺序决定（见 schedule()），保留字段仅为兼容
  priority: number;
  createdAt: number;
  // 断点续传：恢复/重试时从哪个字节开始下载，0 表示从头下载
  startOffset: number;
}

interface DownloadState {
  tasks: DownloadTask[];
  activeCount: () => number;
  addTask: (song: Song) => void;
  addTasks: (songs: Song[]) => void;
  pauseTask: (id: string) => void;
  resumeTask: (id: string) => void;
  cancelTask: (id: string) => void;
  retryTask: (id: string) => void;
  moveTaskUp: (id: string) => void;
  moveTaskDown: (id: string) => void;
  clearCompleted: () => void;
}

const sanitizeFilename = (name: string): string => name.replace(/[<>:"/\\|?*]/g, '_');

/** 构造下载任务（单曲与批量共用） */
function buildDownloadTask(
  song: Song,
  downloadPath: string,
  streamingQuality: 'standard' | 'high' | 'lossless',
): DownloadTask {
  return {
    id: crypto.randomUUID(),
    song,
    url: api.getDownloadUrl(song.source || 'netease', song.id, api.qualityToApiParam(streamingQuality)),
    filename: `${sanitizeFilename(song.name)}.mp3`,
    downloadDir: downloadPath,
    status: 'pending',
    progress: 0,
    downloaded: 0,
    total: 0,
    speed: 0,
    error: '',
    retryCount: 0,
    priority: 0,
    createdAt: Date.now(),
    startOffset: 0,
  };
}

// 下载历史条目：与 SettingsPage 下载历史列表共用 localStorage 键 melodix-download-history
// source 记录下载来源（平台），name/artist/time 与既有数据结构保持兼容
interface DownloadHistoryEntry {
  name: string;
  artist: string;
  time: number;
  source?: string;
}

const DOWNLOAD_HISTORY_KEY = 'melodix-download-history';
const DOWNLOAD_HISTORY_LIMIT = 50;

// 任务完成时统一写入一条下载历史（含来源标识）
// 去重策略与原 SettingsPage 实现一致：不去重，新记录插到最前，最多保留 50 条
const appendDownloadHistory = (task: DownloadTask) => {
  try {
    const saved = localStorage.getItem(DOWNLOAD_HISTORY_KEY);
    const history: DownloadHistoryEntry[] = saved ? JSON.parse(saved) : [];
    const entry: DownloadHistoryEntry = {
      name: task.song.name,
      artist: task.song.artist,
      time: Date.now(),
      source: task.song.source,
    };
    localStorage.setItem(
      DOWNLOAD_HISTORY_KEY,
      JSON.stringify([entry, ...history].slice(0, DOWNLOAD_HISTORY_LIMIT)),
    );
  } catch (e) {
    console.error('写入下载历史失败:', e);
  }
};

export const useDownloadStore = create<DownloadState>((set, get) => {
  const updateTask = (id: string, patch: Partial<DownloadTask>) => {
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }));
  };

  // 调度：按 tasks 数组顺序启动 pending 任务，直到达到并发上限
  // 数组顺序即用户队列顺序（moveTaskUp/Down 直接调整数组位置），
  // 此前按 priority/createdAt 排序，而 priority 恒为 0，导致上移/下移按钮完全不生效。
  const schedule = () => {
    const maxConcurrent = useConfigStore.getState().maxConcurrentDownloads;
    for (;;) {
      const { tasks } = get();
      const activeCount = tasks.filter((t) => t.status === 'downloading').length;
      if (activeCount >= maxConcurrent) return;
      const pending = tasks.filter((t) => t.status === 'pending');
      if (pending.length === 0) return;
      void startDownload(pending[0]);
    }
  };

  // 启动单个下载：listen progress + invoke download_file + 重试/失败处理
  const startDownload = async (task: DownloadTask) => {
    updateTask(task.id, { status: 'downloading', error: '' });
    let unlisten: UnlistenFn | null = null;
    try {
      unlisten = await listen<{ downloaded: number; total: number; speed: number }>(
        `download-progress-${task.id}`,
        (event) => {
          const { downloaded, total, speed } = event.payload;
          const progress = total > 0 ? Math.min(100, (downloaded / total) * 100) : 0;
          updateTask(task.id, { downloaded, total, speed, progress });
        },
      );
      // 竞态防护：等待 listen 注册期间用户可能已暂停/取消该任务
      // （pauseTask 已调用后端 cancel_download，cancelTask 已把任务移出列表）。
      // 此时直接放弃，避免被取消的任务仍在后台下载、完成时弹"下载完成"提示。
      const live = get().tasks.find((t) => t.id === task.id);
      if (!live || live.status !== 'downloading') return;
      await invoke('download_file', {
        taskId: task.id,
        url: task.url,
        filename: task.filename,
        downloadDir: task.downloadDir,
        startOffset: task.startOffset,
      });
      updateTask(task.id, { status: 'completed', progress: 100 });
      // 统一写入下载历史（手动/自动下载均在此入史）
      appendDownloadHistory(task);
      useToastStore.getState().showToast(`「${task.song.name}」下载完成`, 'success');
      schedule();
      // 下载完成后，如果开启了自动导入，扫描该文件导入本地库
      const { autoImportOnDownload, downloadPath } = useConfigStore.getState();
      if (autoImportOnDownload && downloadPath) {
        try {
          await invoke('scan_local_music', { dir: downloadPath });
          useToastStore.getState().showToast(`「${task.song.name}」已导入本地库`, 'success');
        } catch (e) {
          console.error('自动导入本地库失败:', e);
        }
      }
    } catch (err) {
      const errMsg = String((err as Error)?.message ?? err);
      // 用户主动取消（pause/cancel 触发），不重试
      if (errMsg.includes('canceled')) return;
      const current = get().tasks.find((t) => t.id === task.id);
      if (!current) return;
      if (current.retryCount < 3) {
        const retryCount = current.retryCount + 1;
        updateTask(task.id, { retryCount });
        const delay = 1000 * Math.pow(2, retryCount - 1); // 1s / 2s / 4s
        const expected = retryCount;
        setTimeout(() => {
          const latest = get().tasks.find((t) => t.id === task.id);
          if (!latest) return;
          // 期间用户手动 retry/resume/pause/cancel 都会改变 retryCount 或 status
          if (latest.retryCount !== expected) return;
          if (latest.status !== 'downloading') return;
          void startDownload(latest);
        }, delay);
      } else {
        updateTask(task.id, { status: 'failed', error: errMsg });
        useToastStore.getState().showToast(`「${task.song.name}」下载失败`, 'error');
        schedule();
      }
    } finally {
      // 确保所有异常路径（成功/失败/取消）都清理监听器，避免泄漏
      if (unlisten) {
        unlisten();
        unlisten = null;
      }
    }
  };

  return {
    tasks: [],
    activeCount: () =>
      get().tasks.filter((t) => t.status === 'pending' || t.status === 'downloading').length,

    addTask: (song) => {
      const { downloadPath, streamingQuality } = useConfigStore.getState();
      if (!downloadPath) {
        useToastStore.getState().showToast('请先在设置中配置下载路径', 'error');
        return;
      }
      const exists = get().tasks.some(
        (t) =>
          t.song.id === song.id &&
          (t.status === 'pending' || t.status === 'downloading' || t.status === 'paused'),
      );
      if (exists) {
        useToastStore.getState().showToast('已在下载列表中', 'info');
        return;
      }
      const task = buildDownloadTask(song, downloadPath, streamingQuality);
      set((state) => ({ tasks: [...state.tasks, task] }));
      schedule();
    },

    // 批量添加下载任务（多选用）：去重，汇总一次提示
    addTasks: (songs) => {
      const { downloadPath, streamingQuality } = useConfigStore.getState();
      if (!downloadPath) {
        useToastStore.getState().showToast('请先在设置中配置下载路径', 'error');
        return;
      }
      const tasks = get().tasks;
      const activeIds = new Set(
        tasks
          .filter((t) => t.status === 'pending' || t.status === 'downloading' || t.status === 'paused')
          .map((t) => t.song.id),
      );
      const newTasks: DownloadTask[] = [];
      let skipped = 0;
      for (const song of songs) {
        if (!song || !song.id) continue;
        if (activeIds.has(song.id)) {
          skipped++;
          continue;
        }
        activeIds.add(song.id);
        newTasks.push(buildDownloadTask(song, downloadPath, streamingQuality));
      }
      if (newTasks.length > 0) {
        set((state) => ({ tasks: [...state.tasks, ...newTasks] }));
        schedule();
      }
      if (newTasks.length > 0) {
        useToastStore.getState().showToast(
          skipped > 0 ? `已添加 ${newTasks.length} 首到下载列表（${skipped} 首已存在）` : `已添加 ${newTasks.length} 首到下载列表`,
          'success',
        );
      } else if (songs.length > 0) {
        useToastStore.getState().showToast('所选歌曲已在下载列表中', 'info');
      }
    },

    pauseTask: (id) => {
      const task = get().tasks.find((t) => t.id === id);
      if (!task) return;
      if (task.status === 'downloading') {
        // 暂停保留部分文件，供恢复时断点续传
        void invoke('cancel_download', { taskId: id, deletePartial: false }).catch(() => {});
      }
      updateTask(id, { status: 'paused' });
      schedule();
    },

    resumeTask: (id) => {
      const task = get().tasks.find((t) => t.id === id);
      if (!task || task.status !== 'paused') return;
      // 从已下载字节数继续下载，配合后端 Range: bytes=N- 实现 206 续传
      updateTask(id, {
        status: 'pending',
        retryCount: 0,
        error: '',
        startOffset: task.downloaded,
      });
      schedule();
    },

    cancelTask: (id) => {
      const task = get().tasks.find((t) => t.id === id);
      if (!task) return;
      if (task.status === 'downloading') {
        // 取消意图删除部分文件（后端占位参数，实际不删；前端仅从列表移除）
        void invoke('cancel_download', { taskId: id, deletePartial: true }).catch(() => {});
      }
      set((state) => ({ tasks: state.tasks.filter((t) => t.id !== id) }));
      schedule();
    },

    retryTask: (id) => {
      const task = get().tasks.find((t) => t.id === id);
      if (!task) return;
      updateTask(id, { status: 'pending', retryCount: 0, error: '' });
      schedule();
    },

    moveTaskUp: (id) => {
      const { tasks } = get();
      const movableIndices = tasks
        .map((t, i) => (t.status === 'pending' || t.status === 'paused' ? i : -1))
        .filter((i) => i >= 0);
      const idx = tasks.findIndex((t) => t.id === id);
      if (idx === -1) return;
      const pos = movableIndices.indexOf(idx);
      if (pos <= 0) return;
      const prevIdx = movableIndices[pos - 1];
      const newTasks = [...tasks];
      [newTasks[idx], newTasks[prevIdx]] = [newTasks[prevIdx], newTasks[idx]];
      set({ tasks: newTasks });
      schedule();
    },

    moveTaskDown: (id) => {
      const { tasks } = get();
      const movableIndices = tasks
        .map((t, i) => (t.status === 'pending' || t.status === 'paused' ? i : -1))
        .filter((i) => i >= 0);
      const idx = tasks.findIndex((t) => t.id === id);
      if (idx === -1) return;
      const pos = movableIndices.indexOf(idx);
      if (pos === -1 || pos >= movableIndices.length - 1) return;
      const nextIdx = movableIndices[pos + 1];
      const newTasks = [...tasks];
      [newTasks[idx], newTasks[nextIdx]] = [newTasks[nextIdx], newTasks[idx]];
      set({ tasks: newTasks });
      schedule();
    },

    clearCompleted: () => {
      set((state) => ({ tasks: state.tasks.filter((t) => t.status !== 'completed') }));
    },
  };
});
