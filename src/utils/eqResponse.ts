/**
 * EQ 频响计算与自动增益补偿工具（TypeScript 纯函数模块，无外部依赖）。
 *
 * 数学公式与 public/dsp-worklet.js 的 biquadCoeffs（RBJ Audio EQ Cookbook）
 * 保持完全一致，供 UI 绘制频响曲线与 AudioEngine 推送参数共用，
 * 保证「所见曲线」与「实际听感」一致。
 */

import { EQ_FREQUENCIES } from '../stores/eqStore';

/** 归一化后的双二阶（biquad）滤波器系数（已除以 a0） */
export interface BiquadCoeffs {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

/**
 * RBJ Audio EQ Cookbook 双二阶系数计算。
 * 与 worklet 的 biquadCoeffs 在 peaking / lowshelf 两个分支上数学完全一致：
 * A = 10^(gainDb/40)，w0 = 2π·freq/sr，
 * peaking:  alpha = sinW/(2q)；
 * lowshelf: alpha = (sinW/2)·√2（S=1 斜率），twoSqrtA = 2·√A·alpha。
 * 最后统一除以 a0 归一化。
 */
export function rbjCoeffs(
  type: 'peaking' | 'lowshelf',
  freq: number,
  q: number,
  gainDb: number,
  sr: number
): BiquadCoeffs {
  const A = Math.pow(10, gainDb / 40);
  const w0 = (2 * Math.PI * freq) / sr;
  const cosW = Math.cos(w0);
  const sinW = Math.sin(w0);
  let b0 = 0, b1 = 0, b2 = 0, a0 = 0, a1 = 0, a2 = 0;

  if (type === 'peaking') {
    const alpha = sinW / (2 * q);
    b0 = 1 + alpha * A;
    b1 = -2 * cosW;
    b2 = 1 - alpha * A;
    a0 = 1 + alpha / A;
    a1 = -2 * cosW;
    a2 = 1 - alpha / A;
  } else {
    // lowshelf（S=1 斜率）
    const alpha = (sinW / 2) * Math.sqrt(2);
    const twoSqrtA = 2 * Math.sqrt(A) * alpha;
    b0 = A * ((A + 1) - (A - 1) * cosW + twoSqrtA);
    b1 = 2 * A * ((A - 1) - (A + 1) * cosW);
    b2 = A * ((A + 1) - (A - 1) * cosW - twoSqrtA);
    a0 = (A + 1) + (A - 1) * cosW + twoSqrtA;
    a1 = -2 * ((A - 1) + (A + 1) * cosW);
    a2 = (A + 1) + (A - 1) * cosW - twoSqrtA;
  }

  const invA0 = 1 / a0;
  return {
    b0: b0 * invA0,
    b1: b1 * invA0,
    b2: b2 * invA0,
    a1: a1 * invA0,
    a2: a2 * invA0,
  };
}

/**
 * 计算单个 biquad 滤波器在指定频率处的幅度响应（dB）。
 * 单位圆频响：w = 2π·freq/sr，
 * |H| = |b0 + b1·e^{-jw} + b2·e^{-2jw}| / |1 + a1·e^{-jw} + a2·e^{-2jw}|，
 * 返回 20·log10(|H|)。
 */
export function biquadMagnitudeDb(coeffs: BiquadCoeffs, freq: number, sr: number): number {
  const w = (2 * Math.PI * freq) / sr;
  const cosW = Math.cos(w);
  const sinW = Math.sin(w);
  const cos2W = Math.cos(2 * w);
  const sin2W = Math.sin(2 * w);

  // 分子：b0 + b1·e^{-jw} + b2·e^{-2jw}（e^{-jw} = cosW - j·sinW）
  const numRe = coeffs.b0 + coeffs.b1 * cosW + coeffs.b2 * cos2W;
  const numIm = -(coeffs.b1 * sinW + coeffs.b2 * sin2W);
  // 分母：1 + a1·e^{-jw} + a2·e^{-2jw}
  const denRe = 1 + coeffs.a1 * cosW + coeffs.a2 * cos2W;
  const denIm = -(coeffs.a1 * sinW + coeffs.a2 * sin2W);

  const numMag = Math.sqrt(numRe * numRe + numIm * numIm);
  const denMag = Math.sqrt(denRe * denRe + denIm * denIm);
  return 20 * Math.log10(numMag / denMag);
}

/** 频响曲线绘制的最小频率（Hz） */
export const EQ_PLOT_MIN_FREQ = 20;
/** 频响曲线绘制的最大频率（Hz） */
export const EQ_PLOT_MAX_FREQ = 20000;

/**
 * 计算 EQ 合成频响曲线。
 * 合成响应 = lowshelf(60Hz, Q=0.707, gainDb=bassBoost)
 *          + 10 个 peaking（EQ_FREQUENCIES 频点，Q=1.41，增益 gains[i]）。
 * 频点在 20~20000Hz 的对数轴上均匀分布（含两端点），db[i] 为各滤波器在该频点 dB 响应之和。
 *
 * 默认 sr=96000：与 worklet 内 EQ 运行的 2x 过采样域一致（48kHz 的 2 倍），
 * 保证计算出的频响与 DSP 实际处理结果一致。
 */
export function computeEqResponseDb(
  gains: number[],
  bassBoost: number,
  sr = 96000,
  points = 240
): { freqs: number[]; db: number[] } {
  const coeffsList: BiquadCoeffs[] = [
    rbjCoeffs('lowshelf', 60, 0.707, bassBoost, sr),
    ...EQ_FREQUENCIES.map((f, i) => rbjCoeffs('peaking', f, 1.41, gains[i], sr)),
  ];

  const freqs: number[] = new Array(points);
  const db: number[] = new Array(points);
  const logMin = Math.log(EQ_PLOT_MIN_FREQ);
  const logMax = Math.log(EQ_PLOT_MAX_FREQ);
  for (let i = 0; i < points; i++) {
    const f = Math.exp(logMin + ((logMax - logMin) * i) / (points - 1));
    freqs[i] = f;
    db[i] = coeffsList.reduce((sum, c) => sum + biquadMagnitudeDb(c, f, sr), 0);
  }
  return { freqs, db };
}

/**
 * 计算最终 preamp 增益（dB）。
 * 内部用密集网格（480 点，20~20000Hz 对数分布）计算合成响应，取最大 dB 峰值 peakDb。
 * final = manualPreampDb + (autoComp ? -Math.max(0, peakDb) : 0)，并 clamp 到 [-30, +15]。
 */
export function computeFinalPreamp(
  gains: number[],
  bassBoost: number,
  manualPreampDb: number,
  autoComp: boolean
): number {
  const { db } = computeEqResponseDb(gains, bassBoost, 96000, 480);
  let peakDb = -Infinity;
  for (const v of db) {
    if (v > peakDb) peakDb = v;
  }
  const final = manualPreampDb + (autoComp ? -Math.max(0, peakDb) : 0);
  return Math.min(15, Math.max(-30, final));
}
