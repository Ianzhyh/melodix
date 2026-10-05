import { create } from 'zustand';
import { usePlaybackStore } from './playbackStore';
import { useToastStore } from './toastStore';
import { AudioEngine } from '../services/AudioEngine';

/**
 * 睡眠定时器：
 * - 'time'：N 分钟后停止（渐弱音量后暂停）
 * - 'songEnd'：当前歌曲播完即停止（由 AudioEngine 的 ended 处理）
 */
interface SleepTimerState {
  active: 'off' | 'songEnd' | 'time';
  /** 定时模式的目标时间戳（ms） */
  endsAt: number | null;
  startTimeTimer: (minutes: number) => void;
  startSongEndTimer: () => void;
  cancelTimer: () => void;
}

let fireHandle: ReturnType<typeof setTimeout> | null = null;

function clearFireHandle() {
  if (fireHandle) {
    clearTimeout(fireHandle);
    fireHandle = null;
  }
}

/** 定时触发：渐弱音量 → 暂停 → 恢复音量（供下次播放正常） */
async function fireTimer() {
  const s = useSleepTimerStore.getState();
  if (s.active !== 'time') return;
  clearFireHandle();
  useSleepTimerStore.setState({ active: 'off', endsAt: null });
  const pb = usePlaybackStore.getState();
  if (pb.isPlaying) {
    const prevVolume = pb.volume;
    try {
      await pb.fadeTo(0, 10);
    } catch {}
    AudioEngine.pause();
    pb.setPlaying(false);
    pb.setVolume(prevVolume);
    useToastStore.getState().showToast('睡眠定时结束，已停止播放', 'info');
  }
}

export const useSleepTimerStore = create<SleepTimerState>((set) => ({
  active: 'off',
  endsAt: null,

  startTimeTimer: (minutes) => {
    if (!Number.isFinite(minutes) || minutes <= 0) return;
    clearFireHandle();
    const endsAt = Date.now() + minutes * 60 * 1000;
    set({ active: 'time', endsAt });
    fireHandle = setTimeout(fireTimer, minutes * 60 * 1000);
    useToastStore.getState().showToast(`睡眠定时已开启：${minutes} 分钟后停止`, 'info');
  },

  startSongEndTimer: () => {
    clearFireHandle();
    set({ active: 'songEnd', endsAt: null });
    useToastStore.getState().showToast('将在本曲播放结束后停止', 'info');
  },

  cancelTimer: () => {
    clearFireHandle();
    set({ active: 'off', endsAt: null });
  },
}));
