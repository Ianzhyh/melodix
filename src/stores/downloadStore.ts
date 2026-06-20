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
  priority: number;
  createdAt: number;
}

interface DownloadState {
  tasks: DownloadTask[];
  activeCount: () => number;
  addTask: (song: Song) => void;
  pauseTask: (id: string) => void;
  resumeTask: (id: string) => void;
  cancelTask: (id: string) => void;
  retryTask: (id: string) => void;
  moveTaskUp: (id: string) => void;
  moveTaskDown: (id: string) => void;
  clearCompleted: () => void;
}

const sanitizeFilename = (name: string): string => name.replace(/[<>:"/\\|?*]/g, '_');

export const useDownloadStore = create<DownloadState>((set, get) => {
  const updateTask = (id: string, patch: Partial<DownloadTask>) => {
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }));
  };

  // 调度：按优先级降序 + 创建时间升序启动 pending 任务，直到达到并发上限
  const schedule = () => {
    const maxConcurrent = useConfigStore.getState().maxConcurrentDownloads;
    for (;;) {
      const { tasks } = get();
      const activeCount = tasks.filter((t) => t.status === 'downloading').length;
      if (activeCount >= maxConcurrent) return;
      const pending = tasks
        .filter((t) => t.status === 'pending')
        .sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt);
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
      await invoke('download_file', {
        taskId: task.id,
        url: task.url,
        filename: task.filename,
        downloadDir: task.downloadDir,
      });
      unlisten();
      unlisten = null;
      updateTask(task.id, { status: 'completed', progress: 100 });
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
      if (unlisten) {
        unlisten();
        unlisten = null;
      }
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
      const url = api.getDownloadUrl(
        song.source || 'netease',
        song.id,
        api.qualityToApiParam(streamingQuality),
      );
      const filename = `${sanitizeFilename(song.name)}.mp3`;
      const task: DownloadTask = {
        id: crypto.randomUUID(),
        song,
        url,
        filename,
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
      };
      set((state) => ({ tasks: [...state.tasks, task] }));
      schedule();
    },

    pauseTask: (id) => {
      const task = get().tasks.find((t) => t.id === id);
      if (!task) return;
      if (task.status === 'downloading') {
        void invoke('cancel_download', { taskId: id }).catch(() => {});
      }
      updateTask(id, { status: 'paused' });
      schedule();
    },

    resumeTask: (id) => {
      const task = get().tasks.find((t) => t.id === id);
      if (!task || task.status !== 'paused') return;
      updateTask(id, { status: 'pending', retryCount: 0, error: '' });
      schedule();
    },

    cancelTask: (id) => {
      const task = get().tasks.find((t) => t.id === id);
      if (!task) return;
      if (task.status === 'downloading') {
        void invoke('cancel_download', { taskId: id }).catch(() => {});
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
