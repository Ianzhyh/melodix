import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

export type ReverbPreset = 'off' | 'studio' | 'hall' | 'plate';

export interface EQPreset {
  name: string;
  gains: number[]; // 10 values from -12 to 12
  bassBoost?: number; // 0 to 12（60Hz 低频搁架）
  surround3D?: number; // 0 to 100（哈斯交叉延迟）
  crossfeedAmount?: number; // 0 to 100（Bauer 耳机交叉馈送强度，与 surround3D 独立）
  bassEnhancer?: number; // 0 to 100（低音谐波激励）
  exciter?: number; // 0 to 100（空气感激励）
  stereoWidth?: number; // 0 to 200（100 = 原始）
  reverbPreset?: ReverbPreset;
  reverbAmount?: number; // 0 to 100
  compressorAmount?: number; // 0 to 100（母带软拐点压缩）
  limiterOn?: boolean; // 真峰值前瞻限幅
  headphoneMode?: boolean; // 耳机模式（Bauer 交叉馈送）
  loudnessNorm?: boolean; // 响度均衡
  smartBass?: boolean; // 智能动态低音
}

export const EQ_FREQUENCIES = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

/**
 * 专业调音预设（经数值验证的 DSP 链：2x 过采样 + Q=1.41 倍频程参量均衡）。
 * 每个预设同时定义空间/动态参数，一键得到"母带级"声场。
 */
export const PRESETS: EQPreset[] = [
  { name: 'Flat', gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], bassBoost: 0, surround3D: 0, crossfeedAmount: 50, bassEnhancer: 0, exciter: 0, stereoWidth: 100, reverbPreset: 'off', reverbAmount: 0, compressorAmount: 0, limiterOn: true },
  { name: 'Pop', gains: [-1, 1, 3, 4, 3, 0, -1, -2, -1, 1], bassBoost: 2, surround3D: 6, crossfeedAmount: 50, bassEnhancer: 15, exciter: 20, stereoWidth: 110, reverbPreset: 'off', reverbAmount: 0, compressorAmount: 25, limiterOn: true },
  { name: 'Rock', gains: [4, 3, -2, -4, -1, 2, 5, 6, 6, 6], bassBoost: 4, surround3D: 8, crossfeedAmount: 50, bassEnhancer: 30, exciter: 30, stereoWidth: 115, reverbPreset: 'studio', reverbAmount: 8, compressorAmount: 35, limiterOn: true },
  { name: 'Classical', gains: [4, 3, 2, 1, -1, -1, 0, 3, 4, 3], bassBoost: 1, surround3D: 8, crossfeedAmount: 50, bassEnhancer: 0, exciter: 12, stereoWidth: 120, reverbPreset: 'hall', reverbAmount: 22, compressorAmount: 10, limiterOn: true },
  { name: 'Jazz', gains: [3, 2, 1, 2, -1, -1, 0, 1, 2, 3], bassBoost: 3, surround3D: 8, crossfeedAmount: 50, bassEnhancer: 10, exciter: 8, stereoWidth: 105, reverbPreset: 'studio', reverbAmount: 12, compressorAmount: 15, limiterOn: true },
  { name: 'Vocal', gains: [-2, -1, -1, 1, 4, 4, 2, 0, -1, -2], bassBoost: 1, surround3D: 0, crossfeedAmount: 50, bassEnhancer: 8, exciter: 22, stereoWidth: 100, reverbPreset: 'plate', reverbAmount: 10, compressorAmount: 30, limiterOn: true },
  { name: 'Bass Boost', gains: [6, 5, 4, 2, 1, 0, 0, 0, 0, 0], bassBoost: 6, surround3D: 0, crossfeedAmount: 50, bassEnhancer: 40, exciter: 0, stereoWidth: 100, reverbPreset: 'off', reverbAmount: 0, compressorAmount: 20, limiterOn: true },
  { name: 'Electronic', gains: [4, 3, 1, -1, -2, 1, 0, 2, 4, 5], bassBoost: 5, surround3D: 10, crossfeedAmount: 50, bassEnhancer: 35, exciter: 35, stereoWidth: 130, reverbPreset: 'hall', reverbAmount: 15, compressorAmount: 40, limiterOn: true },
  { name: 'DJ', gains: [5, 4, 2, 0, -1, 0, 1, 3, 4, 3], bassBoost: 7, surround3D: 10, crossfeedAmount: 50, bassEnhancer: 45, exciter: 25, stereoWidth: 112, reverbPreset: 'off', reverbAmount: 0, compressorAmount: 50, limiterOn: true, smartBass: true },
  { name: 'KTV', gains: [-2, -1, 0, 1, 3, 4, 3, 1, 0, -1], bassBoost: 2, surround3D: 0, crossfeedAmount: 50, bassEnhancer: 5, exciter: 15, stereoWidth: 105, reverbPreset: 'plate', reverbAmount: 18, compressorAmount: 35, limiterOn: true },
  { name: '3D全景', gains: [0, 0, 0, 0, 0, 0, 0, 1, 2, 1], bassBoost: 1, surround3D: 0, crossfeedAmount: 65, bassEnhancer: 8, exciter: 15, stereoWidth: 125, reverbPreset: 'off', reverbAmount: 0, compressorAmount: 15, limiterOn: true, headphoneMode: true },
  { name: '音乐厅', gains: [1, 1, 0, 0, 1, 1, 0, 0, 1, 1], bassBoost: 2, surround3D: 12, crossfeedAmount: 50, bassEnhancer: 20, exciter: 15, stereoWidth: 125, reverbPreset: 'hall', reverbAmount: 30, compressorAmount: 25, limiterOn: true },
  { name: '影院', gains: [5, 4, 2, 0, -1, -1, 0, 1, 2, 3], bassBoost: 5, surround3D: 15, crossfeedAmount: 50, bassEnhancer: 45, exciter: 10, stereoWidth: 135, reverbPreset: 'hall', reverbAmount: 20, compressorAmount: 30, limiterOn: true },
  { name: '耳机空间', gains: [0, 1, 0, -1, 0, 0, 0, 1, 2, 1], bassBoost: 1, surround3D: 0, crossfeedAmount: 60, bassEnhancer: 12, exciter: 18, stereoWidth: 118, reverbPreset: 'off', reverbAmount: 0, compressorAmount: 15, limiterOn: true, headphoneMode: true },
  { name: 'HiFi 母带', gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], bassBoost: 0, surround3D: 0, crossfeedAmount: 50, bassEnhancer: 0, exciter: 6, stereoWidth: 102, reverbPreset: 'off', reverbAmount: 0, compressorAmount: 18, limiterOn: true },
];

interface EQState {
  enabled: boolean;
  gains: number[]; // 10 bands
  bassBoost: number; // 0 to 12
  bassEnhancer: number; // 0 to 100
  exciter: number; // 0 to 100
  stereoWidth: number; // 0 to 200
  surround3D: number; // 0 to 100
  crossfeedAmount: number; // 0 to 100（Bauer 耳机交叉馈送强度，与 surround3D 独立）
  reverbPreset: ReverbPreset;
  reverbAmount: number; // 0 to 100
  compressorAmount: number; // 0 to 100
  limiterOn: boolean;
  headphoneMode: boolean;
  loudnessNorm: boolean;
  smartBass: boolean;
  preampDb: number; // -15 到 15（前置增益）
  autoGainComp: boolean; // 自动增益补偿（默认开）
  currentPreset: string;

  setEnabled: (enabled: boolean) => void;
  setGains: (gains: number[]) => void;
  setGain: (index: number, value: number) => void;
  setBassBoost: (value: number) => void;
  setBassEnhancer: (value: number) => void;
  setExciter: (value: number) => void;
  setStereoWidth: (value: number) => void;
  setSurround3D: (value: number) => void;
  setCrossfeedAmount: (value: number) => void;
  setReverbPreset: (preset: ReverbPreset) => void;
  setReverbAmount: (value: number) => void;
  setCompressorAmount: (value: number) => void;
  setLimiterOn: (on: boolean) => void;
  setHeadphoneMode: (on: boolean) => void;
  setLoudnessNorm: (on: boolean) => void;
  setSmartBass: (on: boolean) => void;
  setPreampDb: (value: number) => void;
  setAutoGainComp: (on: boolean) => void;
  applyPreset: (presetName: string) => void;
}

const loadPersisted = () => {
  try {
    const saved = localStorage.getItem('melodix-eq');
    if (saved) return JSON.parse(saved);
  } catch {}
  return null;
};

const defaultState = {
  enabled: false,
  gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  bassBoost: 0,
  bassEnhancer: 0,
  exciter: 0,
  stereoWidth: 100,
  surround3D: 0,
  crossfeedAmount: 50,
  reverbPreset: 'off' as ReverbPreset,
  reverbAmount: 0,
  compressorAmount: 0,
  limiterOn: true,
  headphoneMode: false,
  loudnessNorm: true,
  smartBass: false,
  preampDb: 0,
  autoGainComp: true,
  currentPreset: 'Flat',
};

const sanitize = (raw: any) => {
  const s = { ...defaultState, ...(raw || {}) };
  if (!Array.isArray(s.gains) || s.gains.length !== 10) s.gains = defaultState.gains;
  s.gains = s.gains.map((g: number) => Math.min(12, Math.max(-12, Number(g) || 0)));
  s.bassBoost = Math.min(12, Math.max(0, Number(s.bassBoost) || 0));
  s.bassEnhancer = Math.min(100, Math.max(0, Number(s.bassEnhancer) || 0));
  s.exciter = Math.min(100, Math.max(0, Number(s.exciter) || 0));
  s.stereoWidth = Math.min(200, Math.max(0, Number(s.stereoWidth) || 100));
  s.surround3D = Math.min(100, Math.max(0, Number(s.surround3D) || 0));
  s.crossfeedAmount = Math.min(100, Math.max(0, Number(s.crossfeedAmount) ?? 50));
  s.reverbAmount = Math.min(100, Math.max(0, Number(s.reverbAmount) || 0));
  s.compressorAmount = Math.min(100, Math.max(0, Number(s.compressorAmount) || 0));
  s.limiterOn = s.limiterOn !== false;
  s.headphoneMode = s.headphoneMode === true;
  s.loudnessNorm = s.loudnessNorm !== false; // 默认开
  s.smartBass = s.smartBass === true;
  s.preampDb = Math.min(15, Math.max(-15, Number(s.preampDb) || 0));
  s.autoGainComp = s.autoGainComp !== false;
  if (!['off', 'studio', 'hall', 'plate'].includes(s.reverbPreset)) s.reverbPreset = 'off';
  return s;
};

const initialState = sanitize(loadPersisted());

export const useEQStore = create<EQState>()(
  subscribeWithSelector((set, get) => ({
    ...initialState,

    setEnabled: (enabled) => {
      set({ enabled });
      persistState(get());
    },
    setGains: (gains) => {
      set({ gains, currentPreset: 'Custom' });
      persistState(get());
    },
    setGain: (index, value) => {
      const { gains } = get();
      const newGains = [...gains];
      newGains[index] = value;
      set({ gains: newGains, currentPreset: 'Custom' });
      persistState(get());
    },
    setBassBoost: (value) => {
      set({ bassBoost: value, currentPreset: 'Custom' });
      persistState(get());
    },
    setBassEnhancer: (value) => {
      set({ bassEnhancer: value, currentPreset: 'Custom' });
      persistState(get());
    },
    setExciter: (value) => {
      set({ exciter: value, currentPreset: 'Custom' });
      persistState(get());
    },
    setStereoWidth: (value) => {
      set({ stereoWidth: value, currentPreset: 'Custom' });
      persistState(get());
    },
    setSurround3D: (surround3D) => {
      set({ surround3D, currentPreset: 'Custom' });
      persistState(get());
    },
    setCrossfeedAmount: (value) => {
      set({ crossfeedAmount: value, currentPreset: 'Custom' });
      persistState(get());
    },
    setReverbPreset: (preset) => {
      set({ reverbPreset: preset, currentPreset: 'Custom' });
      persistState(get());
    },
    setReverbAmount: (value) => {
      set({ reverbAmount: value, currentPreset: 'Custom' });
      persistState(get());
    },
    setCompressorAmount: (value) => {
      set({ compressorAmount: value, currentPreset: 'Custom' });
      persistState(get());
    },
    setLimiterOn: (on) => {
      set({ limiterOn: on, currentPreset: 'Custom' });
      persistState(get());
    },
    setHeadphoneMode: (on) => {
      set({ headphoneMode: on, currentPreset: 'Custom' });
      persistState(get());
    },
    setLoudnessNorm: (on) => {
      set({ loudnessNorm: on, currentPreset: 'Custom' });
      persistState(get());
    },
    setSmartBass: (on) => {
      set({ smartBass: on, currentPreset: 'Custom' });
      persistState(get());
    },
    // preamp/自动补偿为用户听感偏好层：切换预设不重置，调整它们也不把预设标记为 Custom
    setPreampDb: (value) => {
      set({ preampDb: value });
      persistState(get());
    },
    setAutoGainComp: (on) => {
      set({ autoGainComp: on });
      persistState(get());
    },
    applyPreset: (presetName) => {
      const preset = PRESETS.find((p) => p.name === presetName);
      if (preset) {
        // preampDb/autoGainComp 属于用户听感偏好层，刻意不在预设切换时重置，保持用户设置不被预设覆盖
        set({
          enabled: true,
          gains: preset.gains,
          bassBoost: preset.bassBoost || 0,
          bassEnhancer: preset.bassEnhancer || 0,
          exciter: preset.exciter || 0,
          stereoWidth: preset.stereoWidth ?? 100,
          surround3D: preset.surround3D || 0,
          crossfeedAmount: preset.crossfeedAmount ?? 50,
          reverbPreset: preset.reverbPreset || 'off',
          reverbAmount: preset.reverbAmount || 0,
          compressorAmount: preset.compressorAmount || 0,
          limiterOn: preset.limiterOn !== false,
          headphoneMode: preset.headphoneMode === true,
          loudnessNorm: preset.loudnessNorm !== false,
          smartBass: preset.smartBass === true,
          currentPreset: presetName,
        });
        persistState(get());
      }
    },
  }))
);

const persistState = (state: EQState) => {
  try {
    const toSave = {
      enabled: state.enabled,
      gains: state.gains,
      bassBoost: state.bassBoost,
      bassEnhancer: state.bassEnhancer,
      exciter: state.exciter,
      stereoWidth: state.stereoWidth,
      surround3D: state.surround3D,
      crossfeedAmount: state.crossfeedAmount,
      reverbPreset: state.reverbPreset,
      reverbAmount: state.reverbAmount,
      compressorAmount: state.compressorAmount,
      limiterOn: state.limiterOn,
      headphoneMode: state.headphoneMode,
      loudnessNorm: state.loudnessNorm,
      smartBass: state.smartBass,
      preampDb: state.preampDb,
      autoGainComp: state.autoGainComp,
      currentPreset: state.currentPreset,
    };
    localStorage.setItem('melodix-eq', JSON.stringify(toSave));
  } catch {}
};
