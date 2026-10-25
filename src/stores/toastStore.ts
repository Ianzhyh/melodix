import { create } from 'zustand';
import { makeId } from '../utils/id';

export type ToastType = 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastState {
  toasts: Toast[];
  showToast: (message: string, type?: ToastType) => void;
  removeToast: (id: string) => void;
}

/** 同屏最多保留几条：再多就会盖住内容（原先无上限，连点会堆成一堵墙） */
const MAX_VISIBLE_TOASTS = 3;
/** 每条停留时长 */
const DEFAULT_DURATION = 3000;
/** 错误信息留久一点，用户需要时间读完 */
const ERROR_DURATION = 5000;

/** 唯一 id：走统一实现（原来用 Math.random().toString(36).substring(7)，可能产出空串） */
const nextId = () => makeId('toast');

/** 每条 toast 的自动移除定时器，手动关闭时要一并清掉，避免累积 */
const timers = new Map<string, ReturnType<typeof setTimeout>>();

const clearTimer = (id: string) => {
  const t = timers.get(id);
  if (t !== undefined) {
    clearTimeout(t);
    timers.delete(id);
  }
};

/**
 * 全局提示。
 *
 * 相比原实现修掉的三个体验问题：
 * 1. **无上限堆叠**：连点"加入队列"会一路往上堆，最后盖住半屏。现在同屏最多 3 条，
 *    超出的从最旧那条挤掉。
 * 2. **重复消息刷屏**：同一个操作重复触发时，原来每次都是一条新 toast，视觉上像"刷屏"。
 *    现在相邻的相同消息不再新增，而是重置它的停留计时（用户看到的效果是"又亮了一下"）。
 * 3. **错误提示和成功提示停留时间一样**：错误信息 3 秒读不完。现在错误给 5 秒。
 *
 * 另外每个 toast 的定时器会在被挤掉 / 手动关闭时同步清理 —— 原实现只靠 setTimeout
 * 自行到期，用户连续点击时这些定时器会一直累积。
 */
export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  showToast: (message, type = 'info') => {
    if (!message) return;

    const { toasts } = get();

    // 相邻重复消息：不新增，只把它挪到末尾并重置计时
    const dupIndex = toasts.findIndex((t) => t.message === message && t.type === type);
    if (dupIndex !== -1 && dupIndex === toasts.length - 1) {
      const existing = toasts[dupIndex];
      clearTimer(existing.id);
      const duration = type === 'error' ? ERROR_DURATION : DEFAULT_DURATION;
      timers.set(existing.id, setTimeout(() => get().removeToast(existing.id), duration));
      return;
    }

    const id = nextId();
    set((state) => {
      // 新的追加在末尾；超过上限时把最旧的挤掉（并清掉它的定时器）
      const next = [...state.toasts, { id, message, type }];
      while (next.length > MAX_VISIBLE_TOASTS) {
        const dropped = next.shift();
        if (dropped) clearTimer(dropped.id);
      }
      return { toasts: next };
    });

    const duration = type === 'error' ? ERROR_DURATION : DEFAULT_DURATION;
    timers.set(id, setTimeout(() => get().removeToast(id), duration));
  },

  removeToast: (id) => {
    clearTimer(id);
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },
}));
