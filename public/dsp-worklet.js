/**
 * Melodix Pro DSP — AudioWorklet 处理器
 * =====================================================
 * 专业级音频处理链（全部在 2x 过采样域运行，消除 EQ 在奈奎斯特附近的
 * "频率挤边"失真）：
 *
 *   MediaElementSource
 *     └─ [2x 半带 FIR 过采样]
 *         ├─ 前置增益（preamp，dB 域平滑的整体电平调整）
 *         ├─ 10 段参量均衡（RBJ biquad，1 倍频程间距 Q=1.41）+ 60Hz 低频搁架
 *         ├─ 智能动态低音（全带 RMS 检测驱动的低频等响度补偿）
 *         ├─ 低音谐波增强器（次谐波/暖声激励）
 *         ├─ 空气感激励器（高频谐波激励）
 *         ├─ 立体声宽度（Mid/Side，150Hz 低频单声道化保护）
 *         ├─ 耳机交叉馈送（Bauer 式 650Hz 一阶低通 + 0.27ms 耳间延迟）
 *         ├─ FDN 混响（8×8 Hadamard 反馈延迟网络，Studio / Hall / Plate）
 *         ├─ 母带软拐点压缩器（立体声联动）
 *         ├─ 响度均衡 AGC（RLB 计权 RMS + 斜率限制，防歌曲间音量跳变）
 *         └─ 2ms 前瞻真峰值限幅器（-1dBFS 天花板）
 *     └─ [2x 半带 FIR 降采样] → 输出 + 电平计量
 *
 * 参数经 port.postMessage({type:'params', params:{...}}) 实时推送，
 * 所有增益/强度参数按 ~20ms 时间常数平滑，杜绝"拉链噪声"。
 *
 * 该文件作为普通脚本同时可在 Node（vitest）中加载：注册逻辑被
 * `typeof AudioWorkletProcessor !== 'undefined'` 守卫，纯 DSP 函数以
 * ESM export 暴露供数值验证。
 */

'use strict';

/* ================================================================== */
/* 基础数学工具                                                        */
/* ================================================================== */

const TWO_PI = 2 * Math.PI;
const EPS = 1e-30;

function linToDb(x) {
  return 20 * Math.log10(x > EPS ? x : EPS);
}
function dbToLin(db) {
  return Math.pow(10, db / 20);
}
function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
/** 冲洗次正规浮点，防止 CPU 在静音段空转 */
function flush(v) {
  return v > -EPS && v < EPS ? 0 : v;
}

/* ================================================================== */
/* RBJ Biquad（Audio EQ Cookbook）                                     */
/* ================================================================== */

export function biquadCoeffs(type, freq, q, gainDb, sr) {
  const A = Math.pow(10, gainDb / 40);
  const w0 = (TWO_PI * freq) / sr;
  const cosW = Math.cos(w0);
  const sinW = Math.sin(w0);
  let b0 = 0, b1 = 0, b2 = 0, a0 = 0, a1 = 0, a2 = 0;

  switch (type) {
    case 'peaking': {
      const alpha = sinW / (2 * q);
      b0 = 1 + alpha * A;
      b1 = -2 * cosW;
      b2 = 1 - alpha * A;
      a0 = 1 + alpha / A;
      a1 = -2 * cosW;
      a2 = 1 - alpha / A;
      break;
    }
    case 'lowshelf': {
      const alpha = (sinW / 2) * Math.sqrt(2); // S=1 斜率
      const twoSqrtA = 2 * Math.sqrt(A) * alpha;
      b0 = A * ((A + 1) - (A - 1) * cosW + twoSqrtA);
      b1 = 2 * A * ((A - 1) - (A + 1) * cosW);
      b2 = A * ((A + 1) - (A - 1) * cosW - twoSqrtA);
      a0 = (A + 1) + (A - 1) * cosW + twoSqrtA;
      a1 = -2 * ((A - 1) + (A + 1) * cosW);
      a2 = (A + 1) + (A - 1) * cosW - twoSqrtA;
      break;
    }
    case 'highshelf': {
      const alpha = (sinW / 2) * Math.sqrt(2);
      const twoSqrtA = 2 * Math.sqrt(A) * alpha;
      b0 = A * ((A + 1) + (A - 1) * cosW + twoSqrtA);
      b1 = -2 * A * ((A - 1) + (A + 1) * cosW);
      b2 = A * ((A + 1) + (A - 1) * cosW - twoSqrtA);
      a0 = (A + 1) - (A - 1) * cosW + twoSqrtA;
      a1 = 2 * ((A - 1) - (A + 1) * cosW);
      a2 = (A + 1) - (A - 1) * cosW - twoSqrtA;
      break;
    }
    case 'lowpass': {
      const alpha = sinW / (2 * q);
      b0 = (1 - cosW) / 2;
      b1 = 1 - cosW;
      b2 = (1 - cosW) / 2;
      a0 = 1 + alpha;
      a1 = -2 * cosW;
      a2 = 1 - alpha;
      break;
    }
    case 'highpass': {
      const alpha = sinW / (2 * q);
      b0 = (1 + cosW) / 2;
      b1 = -(1 + cosW);
      b2 = (1 + cosW) / 2;
      a0 = 1 + alpha;
      a1 = -2 * cosW;
      a2 = 1 - alpha;
      break;
    }
    default:
      throw new Error('Unknown biquad type: ' + type);
  }
  const invA0 = 1 / a0;
  return { b0: b0 * invA0, b1: b1 * invA0, b2: b2 * invA0, a1: a1 * invA0, a2: a2 * invA0 };
}

export class BiquadFilter {
  constructor(type, freq, q, gainDb, sr) {
    this.type = type;
    this.freq = freq;
    this.q = q;
    this.gainDb = gainDb;
    this.sr = sr;
    this.x1 = 0; this.x2 = 0; this.y1 = 0; this.y2 = 0;
    const c = biquadCoeffs(type, freq, q, gainDb, sr);
    this.b0 = c.b0; this.b1 = c.b1; this.b2 = c.b2; this.a1 = c.a1; this.a2 = c.a2;
  }
  /** 更新增益（保持中心频率/Q），用于平滑后的 EQ 参数 */
  setGain(gainDb) {
    this.gainDb = gainDb;
    const c = biquadCoeffs(this.type, this.freq, this.q, gainDb, this.sr);
    this.b0 = c.b0; this.b1 = c.b1; this.b2 = c.b2; this.a1 = c.a1; this.a2 = c.a2;
  }
  process(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2
            - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x;
    this.y2 = this.y1; this.y1 = flush(y);
    return this.y1;
  }
  processInPlace(buf, len) {
    for (let i = 0; i < len; i++) buf[i] = this.process(buf[i]);
  }
}

/** 一阶低通（单极点，用于交叉馈送染色） */
export class OnePoleLP {
  constructor(sr, freq) {
    this.a = Math.exp(-(TWO_PI * freq) / sr);
    this.b = 1 - this.a;
    this.s = 0;
  }
  process(x) {
    this.s = flush(this.b * x + this.a * this.s);
    return this.s;
  }
}

/* ================================================================== */
/* 2x 半带 FIR 过采样 / 降采样                                          */
/* ================================================================== */

function besselI0(x) {
  let sum = 1, term = 1, k = 1;
  const xh2 = (x / 2) * (x / 2);
  while (k < 60) {
    term *= xh2 / (k * k);
    const next = sum + term;
    if (next === sum) break;
    sum = next;
    k++;
  }
  return sum;
}

function kaiserWindow(N, beta) {
  const M = N - 1;
  const denom = besselI0(beta);
  const w = new Float64Array(N);
  for (let n = 0; n < N; n++) {
    const x = (2 * n - M) / M;
    w[n] = besselI0(beta * Math.sqrt(Math.max(0, 1 - x * x))) / denom;
  }
  return w;
}

/**
 * 设计半带 FIR（奇数长度 N，中心抽头 h[M]=0.5，偶数偏移抽头严格置零）。
 *
 * 以中心在 0 的理想半带 h 为原型，因果化为 h_c[k] = h[k-M] 后：
 *  - 偶数相位（工作相位）系数 = h_c[2j] = h[2j-M]，j=0..M（M+1 抽头）
 *  - 奇数相位 = 单抽头 0.5，位于 oddDelay = (M-1)/2 处
 *
 * 上采样使用 ×2 增益的偶数相位；降采样使用原始增益的偶数相位。
 */
export function designHalfBand(N = 47, beta = 9.3) {
  const M = (N - 1) / 2;
  const h = new Float64Array(N);
  const win = kaiserWindow(N, beta);
  for (let n = 0; n < N; n++) {
    const k = n - M;
    if (k === 0) {
      h[n] = 0.5;
    } else {
      const x = (Math.PI * k) / 2;
      h[n] = (0.5 * Math.sin(x) / x) * win[n];
    }
  }
  // 强制精确半带：偶数偏移（n-M 为偶数且 n≠M）抽头归零
  for (let n = 0; n < N; n++) {
    if ((n - M) % 2 === 0 && n !== M) h[n] = 0;
  }
  h[M] = 0.5;

  // 归一化：窗函数使奇数偏移抽头之和略小于 0.5，整体缩放使其精确等于 0.5，
  // 保证 H 的直流增益恰为 1（过采样级联的单位增益与通带平坦度）
  let sumOdd = 0;
  for (let n = 0; n < N; n++) {
    if ((n - M) % 2 !== 0) sumOdd += h[n];
  }
  if (sumOdd > 1e-9) {
    const k = 0.5 / sumOdd;
    for (let n = 0; n < N; n++) {
      if ((n - M) % 2 !== 0) h[n] *= k;
    }
  }

  const downEven = new Float64Array(M + 1); // h_c[2j] = h[2j]，j=0..M（偶数索引 = 奇数偏移的工作抽头）
  const upEven = new Float64Array(M + 1);   // 2*h_c[2j]
  for (let j = 0; j <= M; j++) {
    downEven[j] = h[2 * j];
    upEven[j] = 2 * h[2 * j];
  }
  return { upEven, downEven, oddDelay: (M - 1) / 2 };
}

export class HalfBandResampler {
  constructor(N = 47, beta = 9.3) {
    const c = designHalfBand(N, beta);
    this.upEven = c.upEven;
    this.downEven = c.downEven;
    this.oddDelay = c.oddDelay;   // 奇数相位单抽头延迟
    this.taps = c.upEven.length;  // M+1
  }

  /** 1x → 2x：输入 in[0..inLen)，输出 out[0..2*inLen)，历史 hist（长度 2*taps） */
  upsample(inBuf, inLen, outBuf, hist) {
    const taps = this.taps;
    const d = this.oddDelay;
    for (let n = 0; n < inLen; n++) {
      // 偶数相位：2*H0 卷积（工作相位）
      let acc = 0;
      for (let j = 0; j < taps; j++) {
        const idx = n - j;
        acc += this.upEven[j] * (idx >= 0 ? inBuf[idx] : hist[hist.length + idx]);
      }
      outBuf[2 * n] = acc;
      // 奇数相位：2*H1 = 纯延迟（负索引必须读历史，否则每块开头 11 个样本被清零，
      // 造成周期性毛刺与 ~4.3% 的电平损失）
      const src = n - d;
      outBuf[2 * n + 1] = src >= 0 ? inBuf[src] : hist[hist.length + src];
    }
    const need = Math.min(taps, inLen);
    hist.copyWithin(0, hist.length - need);
    hist.set(inBuf.subarray(inLen - need, inLen), hist.length - need);
  }

  /** 2x → 1x：输入 in[0..2*outLen)，输出 out[0..outLen)，历史 hist（长度 4*taps+4） */
  downsample(inBuf, outLen, outBuf, hist) {
    const taps = this.taps;
    const d = this.oddDelay;
    for (let n = 0; n < outLen; n++) {
      // 偶数相位 = H1 单抽头：0.5 * y_even[n-d] = 0.5 * y[2n-2d]
      let acc = 0;
      const eIdx = 2 * n - 2 * d;
      acc += 0.5 * (eIdx >= 0 ? inBuf[eIdx] : hist[hist.length + eIdx]);
      // 奇数相位 = H0 卷积：Σ h_c[2j] * y_odd[n-j] = Σ h_c[2j] * y[2n-2j+1]
      for (let j = 0; j < taps; j++) {
        const idx = 2 * n - 2 * j + 1;
        acc += this.downEven[j] * (idx >= 0 ? inBuf[idx] : hist[hist.length + idx]);
      }
      outBuf[n] = acc;
    }
    const need = Math.min(2 * taps + 2, inBuf.length);
    hist.copyWithin(0, hist.length - need);
    hist.set(inBuf.subarray(inBuf.length - need, inBuf.length), hist.length - need);
  }
}

/* ================================================================== */
/* 音效模块                                                            */
/* ================================================================== */

/** 立体声宽度（Mid/Side + 150Hz 单声道化保护，LR2 互补交叉） */
export class StereoWidth {
  constructor(sr2) {
    this.lpL = new BiquadFilter('lowpass', 150, 0.5, 0, sr2);
    this.lpR = new BiquadFilter('lowpass', 150, 0.5, 0, sr2);
    this.width = 1; // 1 = 原始
  }
  setWidth(w) { this.width = w; }
  process(L, R, len) {
    const w = this.width;
    for (let i = 0; i < len; i++) {
      const l = L[i], r = R[i];
      const lLow = this.lpL.process(l);
      const rLow = this.lpR.process(r);
      const lHi = l - lLow;
      const rHi = r - rLow;
      // 高频段 Mid/Side 宽度控制（低频保持居中）
      L[i] = lLow + (lHi * (1 + w) + rHi * (1 - w)) * 0.5;
      R[i] = rLow + (lHi * (1 - w) + rHi * (1 + w)) * 0.5;
    }
  }
}

/** FDN 混响（8×8 Hadamard 反馈延迟网络，商用级算法混响）
 *
 *  相比 Schroeder（并联梳状+串联全通）：Hadamard 正交混合把能量均匀
 *  撒到 8 条延迟线上，反射密度建立快、无"金属回声串"；环路增益按各线
 *  延迟与目标 RT60 精确设定 g_i = 10^(-3·delaySec_i/RT60)；4 条线读
 *  位置加 ±2.5 样本 / 0.7Hz 正弦调制抹平梳状染色；右声道延迟 ×1.02
 *  微失谐去相关。
 *  稳定性：反馈矩阵谱范数 ≤ max(g_i)·‖H‖ = max(g_i) < 1，恒稳定。
 */
export class FDNReverb {
  constructor(sr2) {
    this.sr2 = sr2;
    // 8×8 Sylvester Hadamard 归一化混合矩阵（H·H = I，谱范数恰为 1）
    const norm = 1 / Math.sqrt(8);
    this.H = [];
    for (let i = 0; i < 8; i++) {
      const row = new Float32Array(8);
      for (let j = 0; j < 8; j++) {
        let pc = 0, m = i & j;
        while (m) { pc += m & 1; m >>= 1; }
        row[j] = (pc & 1) ? -norm : norm;
      }
      this.H.push(row);
    }
    // 输出合成权重（交错正负 1/√8，合成增益 1）
    this.outW = new Float32Array(8);
    for (let i = 0; i < 8; i++) this.outW[i] = (i & 1) ? -norm : norm;
    // 8 条延迟线（毫秒长度 × sr2/1000；右声道 ×1.02 微失谐去相关）
    const delaysMs = [20.3, 25.7, 31.1, 36.7, 42.3, 53.9, 65.3, 81.7];
    this.bufL = delaysMs.map((ms) => new Float32Array(Math.max(8, Math.round((ms * sr2) / 1000))));
    this.bufR = delaysMs.map((ms) => new Float32Array(Math.max(8, Math.round((ms * 1.02 * sr2) / 1000))));
    this.posL = new Int32Array(8);
    this.posR = new Int32Array(8);
    // 每线独立一阶阻尼低通状态（系数由 setPreset 设定）
    this.dampStateL = new Float32Array(8);
    this.dampStateR = new Float32Array(8);
    this.dampA = 0.5;
    this.dampB = 0.5;
    // 环路增益（setPreset 按 RT60 精确重算）
    this.gL = new Float32Array(8);
    this.gR = new Float32Array(8);
    // 读位置调制：索引 2/4/5/7 共 4 条线，±2.5 样本、~0.7Hz，相位左右不同
    this.modMask = [false, false, true, false, true, true, false, true];
    this.modAmp = 2.5;
    this.modInc = (TWO_PI * 0.7) / sr2;
    this.modPhL = 0;
    this.modPhR = Math.PI / 2;
    // 20ms 预延迟环形缓冲（输入先进预延迟，再注入网络）
    this.preDelay = Math.max(2, Math.ceil(0.02 * sr2));
    this.preL = new Float32Array(this.preDelay + 2);
    this.preR = new Float32Array(this.preDelay + 2);
    this.prePos = 0;
    this.preLen = this.preL.length;
    // 逐样本暂存（阻尼后的 8 线读出值，供 Hadamard 混合与输出合成）
    this.yTmpL = new Float32Array(8);
    this.yTmpR = new Float32Array(8);
    this.rt60 = 0.8;
    this.fc = 5000;
    this.wet = 0;
    this.dry = 1;
    // 幂等守卫：process 每块都调 setPreset/setAmount，参数未变时跳过重算
    this._presetKey = null;
    this._amountPct = -1;
    this._applyPreset();
  }

  /** 按 RT60 与阻尼拐点重算每线环路增益与阻尼系数 */
  _applyPreset() {
    this.dampA = Math.exp((-TWO_PI * this.fc) / this.sr2);
    this.dampB = 1 - this.dampA;
    for (let i = 0; i < 8; i++) {
      this.gL[i] = Math.pow(10, (-3 * this.bufL[i].length) / (this.rt60 * this.sr2));
      this.gR[i] = Math.pow(10, (-3 * this.bufR[i].length) / (this.rt60 * this.sr2));
    }
  }

  setPreset(preset) {
    if (preset === this._presetKey) return;
    this._presetKey = preset;
    // Studio：短小紧凑、阻尼重（暗而紧）/ Hall：宽敞 / Plate：明亮金属板
    switch (preset) {
      case 'studio':
        this.rt60 = 0.8; this.fc = 5000; break;
      case 'plate':
        this.rt60 = 1.2; this.fc = 10000; break;
      case 'hall':
      default:
        this.rt60 = 1.9; this.fc = 7000; break;
    }
    this._applyPreset();
  }

  setAmount(pct) {
    if (pct === this._amountPct) return;
    this._amountPct = pct;
    this.wet = (pct / 100) * 0.7;
    this.dry = 1 - (pct / 100) * 0.35;
  }

  process(L, R, len) {
    if (this.wet < 1e-4) {
      // 完全关断：清空全部延迟/状态，重新开启时干净启动
      for (let i = 0; i < 8; i++) {
        this.bufL[i].fill(0);
        this.bufR[i].fill(0);
      }
      this.posL.fill(0);
      this.posR.fill(0);
      this.dampStateL.fill(0);
      this.dampStateR.fill(0);
      this.preL.fill(0);
      this.preR.fill(0);
      this.prePos = 0;
      this.modPhL = 0;
      this.modPhR = Math.PI / 2;
      return;
    }
    const wet = this.wet;
    const dry = this.dry;
    const H = this.H;
    const gL = this.gL, gR = this.gR;
    const bufsL = this.bufL, bufsR = this.bufR;
    const posL = this.posL, posR = this.posR;
    const dsL = this.dampStateL, dsR = this.dampStateR;
    const dampA = this.dampA, dampB = this.dampB;
    const yL = this.yTmpL, yR = this.yTmpR;
    const outW = this.outW;
    const modMask = this.modMask;
    const modAmp = this.modAmp;
    const modInc = this.modInc;
    const preDelay = this.preDelay;
    const preL = this.preL, preR = this.preR;
    const preLen = this.preLen;
    let prePos = this.prePos;
    let phL = this.modPhL, phR = this.modPhR;

    for (let i = 0; i < len; i++) {
      const dryL = L[i], dryR = R[i];

      // ---- 预延迟读写（输入先进 20ms 环形缓冲再注入网络） ----
      preL[prePos] = dryL;
      preR[prePos] = dryR;
      const pL = preL[(prePos - preDelay + preLen) % preLen];
      const pR = preR[(prePos - preDelay + preLen) % preLen];
      prePos = (prePos + 1) % preLen;

      // ---- 左声道：读 8 线（调制线线性插值）→ 每线一阶阻尼 ----
      const modL = modAmp * Math.sin(phL);
      for (let k = 0; k < 8; k++) {
        const buf = bufsL[k];
        const n = buf.length;
        const p = posL[k];
        let y;
        if (modMask[k]) {
          let rp = p + modL;
          if (rp < 0) rp += n;
          else if (rp >= n) rp -= n;
          const i0 = rp | 0;
          const i1 = i0 + 1 < n ? i0 + 1 : 0;
          const frac = rp - i0;
          y = buf[i0] + frac * (buf[i1] - buf[i0]);
        } else {
          y = buf[p];
        }
        const yd = dampB * y + dampA * dsL[k];
        dsL[k] = yd;
        yL[k] = yd;
      }
      // ---- 左声道：Hadamard 反馈混合 → 写回各线 ----
      for (let k = 0; k < 8; k++) {
        const row = H[k];
        let mix = 0;
        for (let j = 0; j < 8; j++) mix += row[j] * yL[j];
        bufsL[k][posL[k]] = gL[k] * mix + pL;
        posL[k] = (posL[k] + 1) % bufsL[k].length;
      }
      // ---- 左声道：输出合成（交错 ±1/√8 权重） ----
      let accL = 0;
      for (let k = 0; k < 8; k++) accL += yL[k] * outW[k];
      L[i] = dryL * dry + wet * accL;

      // ---- 右声道：同流程（延迟 ×1.02 微失谐、调制相位不同） ----
      const modR = modAmp * Math.sin(phR);
      for (let k = 0; k < 8; k++) {
        const buf = bufsR[k];
        const n = buf.length;
        const p = posR[k];
        let y;
        if (modMask[k]) {
          let rp = p + modR;
          if (rp < 0) rp += n;
          else if (rp >= n) rp -= n;
          const i0 = rp | 0;
          const i1 = i0 + 1 < n ? i0 + 1 : 0;
          const frac = rp - i0;
          y = buf[i0] + frac * (buf[i1] - buf[i0]);
        } else {
          y = buf[p];
        }
        const yd = dampB * y + dampA * dsR[k];
        dsR[k] = yd;
        yR[k] = yd;
      }
      for (let k = 0; k < 8; k++) {
        const row = H[k];
        let mix = 0;
        for (let j = 0; j < 8; j++) mix += row[j] * yR[j];
        bufsR[k][posR[k]] = gR[k] * mix + pR;
        posR[k] = (posR[k] + 1) % bufsR[k].length;
      }
      let accR = 0;
      for (let k = 0; k < 8; k++) accR += yR[k] * outW[k];
      R[i] = dryR * dry + wet * accR;

      phL += modInc;
      phR += modInc;
    }
    this.prePos = prePos;
    this.modPhL = phL;
    this.modPhR = phR;
  }
}

/** Bauer 式耳机交叉馈送（650Hz 一阶低通 + 0.27ms 耳间延迟）
 *
 *  声像"在头中"是耳机播放的固有缺陷：将对侧声道经 0.27ms 耳间延迟与
 *  650Hz 一阶低通（模拟头部阴影/ITD）后小幅（≤0.3）馈入，可把声像
 *  拉到前方扬声器位置，且不影响单声道兼容性。
 */
export class HeadphoneCrossfeed {
  constructor(sr2) {
    this.lpLtoR = new OnePoleLP(sr2, 650); // 左声道 → 右耳路径染色
    this.lpRtoL = new OnePoleLP(sr2, 650); // 右声道 → 左耳路径染色
    this.delaySamples = Math.max(1, Math.round(0.00027 * sr2));
    const blen = this.delaySamples + 2;
    this.bufL = new Float32Array(blen); // 左声道样本，延迟后送右耳
    this.bufR = new Float32Array(blen); // 右声道样本，延迟后送左耳
    this.bufLen = blen;
    this.pos = 0;
    this.gain = 0;
    this.enabled = false;
  }
  setEnabled(on) { this.enabled = on; }
  setAmount(pct) {
    this.gain = (pct / 100) * 0.3;
  }
  process(L, R, len) {
    if (!this.enabled) return;
    const g = this.gain;
    const bl = this.bufL, br = this.bufR;
    const blen = this.bufLen;
    const d = this.delaySamples;
    let p = this.pos;
    for (let i = 0; i < len; i++) {
      const l = L[i], r = R[i];
      // 先读延迟（写入点回退 d 样本 = 对侧 0.27ms 前的信号）
      const dIdx = (p - d + blen) % blen;
      const delayedL = bl[dIdx];
      const delayedR = br[dIdx];
      // 再写当前样本（保持缓冲温热，重新开启时无杂音）
      bl[p] = l;
      br[p] = r;
      p = (p + 1) % blen;
      // 交叉馈送：对侧信号经一阶低通染色后小幅混入
      L[i] = l + g * this.lpRtoL.process(delayedR);
      R[i] = r + g * this.lpLtoR.process(delayedL);
    }
    this.pos = p;
  }
}

/** 响度均衡 AGC（RLB 计权 RMS + 斜率限制增益）
 *
 *  防止歌曲之间音量跳变：按 ITU-R BS.1770 RLB 计权测量 4s 时间常数的
 *  RMS，向 -18dB 参考响度缓慢适配（增益变化最快 0.15/s、限幅 ±6dB），
 *  听感上只"悄悄把太轻的歌抬起来"，无喘息/抽吸；静音（<-60dB）不抬升。
 */
export class LoudnessAGC {
  constructor(sr2) {
    // RLB 计权 = highshelf 1681Hz +4dB 串联 highpass 38Hz（每声道独立状态）
    this.shelfL = new BiquadFilter('highshelf', 1681, 0.707, 4, sr2);
    this.shelfR = new BiquadFilter('highshelf', 1681, 0.707, 4, sr2);
    this.hpL = new BiquadFilter('highpass', 38, 0.707, 0, sr2);
    this.hpR = new BiquadFilter('highpass', 38, 0.707, 0, sr2);
    this.alpha = 1 - Math.exp(-1 / (4 * sr2)); // RMS 平滑 τ≈4s
    this.slew = 0.15 / sr2;                     // 增益斜率上限 0.15/s
    this.rms2 = 0;
    this.gain = 1;
    this.enabled = false;
  }
  setEnabled(on) { this.enabled = on; }
  /** 当前增益（测试/计量用） */
  getGain() { return this.gain; }
  process(L, R, len) {
    if (!this.enabled) return;
    const alpha = this.alpha;
    const slew = this.slew;
    let rms2 = this.rms2;
    let gain = this.gain;
    for (let i = 0; i < len; i++) {
      // RLB 计权（检测的是增益施加前的输入信号，纯前馈，无自激风险）
      const wl = this.hpL.process(this.shelfL.process(L[i]));
      const wr = this.hpR.process(this.shelfR.process(R[i]));
      // 双声道计权能量平均
      rms2 += alpha * ((wl * wl + wr * wr) * 0.5 - rms2);
      // 目标增益：对齐 -18dB；静音不抬升；限幅 ±6dB（目标每样本重算，RMS 本身变化极慢）
      const rmsDb = linToDb(Math.sqrt(rms2));
      const targetDb = rmsDb < -60 ? 0 : clamp(-18 - rmsDb, -6, 6);
      const target = dbToLin(targetDb);
      // 斜率限制逼近（方向不限）
      const diff = target - gain;
      if (diff > slew) gain += slew;
      else if (diff < -slew) gain -= slew;
      else gain = target;
      L[i] *= gain;
      R[i] *= gain;
    }
    this.rms2 = rms2;
    this.gain = gain;
  }
}

/** 智能动态低音（全带 RMS 检测驱动的 100Hz 低频搁架等响度补偿）
 *
 *  等响曲线：节目电平越低，低频感知衰减越厉害。检测 pre-EQ 信号（preamp 后、EQ 前）的
 *  200ms 全带 RMS：检测路径与均衡应用路径分离，避免 EQ boost 导致检测过载而误判。
 *  ≥-12dB 不补偿、-40dB 以下补足 +6dB（100Hz lowshelf），响的歌不动、轻的歌低音自动补齐。
 */
export class SmartBass {
  constructor(sr2) {
    // 100Hz 低频搁架（biquad 有状态，每声道独立实例）
    this.shelfL = new BiquadFilter('lowshelf', 100, 0.707, 0, sr2);
    this.shelfR = new BiquadFilter('lowshelf', 100, 0.707, 0, sr2);
    this.alpha = 1 - Math.exp(-1 / (0.2 * sr2)); // 检测 RMS τ=200ms
    this.rms2 = 0;
    this.pendingGain = 0; // detect() 计算的补偿强度（dB），apply() 时使用
    this.enabled = false;
  }
  setEnabled(on) { this.enabled = on; }
  /**
   * 检测 pre-EQ 信号电平并计算补偿强度。
   * 必须在 EQ 处理之前调用。
   */
  detect(L, R, len) {
    if (!this.enabled) { this.pendingGain = 0; return; }
    const alpha = this.alpha;
    let rms2 = this.rms2;
    for (let i = 0; i < len; i++) {
      const m = (L[i] + R[i]) * 0.5;
      rms2 += alpha * (m * m - rms2);
    }
    this.rms2 = rms2;
    // 每块结束映射补偿：-12dB→0dB、-40dB→+6dB（线性插值）
    const rmsDb = linToDb(Math.sqrt(rms2));
    this.pendingGain = 6 * clamp((-12 - rmsDb) / 28, 0, 1);
  }
  /**
   * 应用补偿强度到 EQ 后的信号。
   * 必须在 EQ 处理之后调用。
   */
  apply(L, R, len) {
    if (!this.enabled) return;
    this.shelfL.setGain(this.pendingGain);
    this.shelfR.setGain(this.pendingGain);
    this.shelfL.processInPlace(L, len);
    this.shelfR.processInPlace(R, len);
  }
}


/** 母带压缩器：软拐点、立体声联动、自动补偿增益 */
export class MasterCompressor {
  constructor(sr2) {
    this.sr2 = sr2;
    this.gainLin = 1;
    this.attackCoef = Math.exp(-1 / (0.008 * sr2));
    this.releaseCoef = Math.exp(-1 / (0.12 * sr2));
    this.enabled = false;
    this.thresholdDb = 0;
    this.ratio = 1;
    this.kneeDb = 6;
    this.makeupLin = 1;
  }
  setAmount(pct) {
    // amount 0-100 → 阈值 -3..-25dB、比率 1..5.5、补偿 0..6dB
    const a = clamp(pct, 0, 100) / 100;
    this.thresholdDb = -(3 + 22 * a);
    this.ratio = 1 + 4.5 * a;
    this.kneeDb = 6;
    this.makeupLin = dbToLin(6 * a);
    this.enabled = pct > 0;
  }
  process(L, R, len) {
    if (!this.enabled) return;
    const invRatio = 1 / this.ratio;
    const kneeHalf = this.kneeDb / 2;
    const attack = this.attackCoef;
    const release = this.releaseCoef;
    const makeup = this.makeupLin;
    let gain = this.gainLin;
    for (let i = 0; i < len; i++) {
      // 峰值检测（取左右较大者，立体声联动）
      const peak = Math.max(Math.abs(L[i]), Math.abs(R[i]));
      const levelDb = linToDb(peak);
      let grDb = 0;
      const over = levelDb - this.thresholdDb;
      if (over > kneeHalf) {
        grDb = over * (1 - invRatio);
      } else if (over > -kneeHalf) {
        const t = over + kneeHalf;
        grDb = (t * t) / (4 * this.kneeDb) * (1 - invRatio);
      }
      const target = dbToLin(-grDb) * makeup;
      const coef = target < gain ? attack : release;
      gain += coef * (target - gain);
      L[i] = L[i] * gain;
      R[i] = R[i] * gain;
    }
    this.gainLin = gain;
  }
}

/** 2ms 前瞻真峰值限幅器：-1dBFS 天花板、即时起音、40ms 释音 */
export class LookaheadLimiter {
  constructor(sr2) {
    this.delaySamples = Math.max(16, Math.round(0.002 * sr2)); // 2ms 前瞻
    const blen = this.delaySamples + 1;
    this.sigL = new Float32Array(blen);
    this.sigR = new Float32Array(blen);
    this.peakBuf = new Float32Array(blen);
    this.pos = 0;
    this.absPos = 0; // 单调递增绝对序号（队列用，不随环形回绕）
    this.gain = 1;
    this.ceiling = dbToLin(-1); // -1dBFS
    this.releaseCoef = Math.exp(-1 / (0.04 * sr2));
    this.enabled = true;
    this.window = []; // 单调递减队列（绝对序号）
    this.head = 0;
  }
  setEnabled(on) { this.enabled = on; }
  process(L, R, len) {
    if (!this.enabled) return;
    const blen = this.sigL.length;
    const D = this.delaySamples;
    const sigL = this.sigL, sigR = this.sigR, pbuf = this.peakBuf;
    let p = this.pos;
    let abs = this.absPos;
    let gain = this.gain;
    const win = this.window;
    let head = this.head;
    const ceiling = this.ceiling;
    const rel = this.releaseCoef;

    for (let i = 0; i < len; i++) {
      const l = L[i], r = R[i];
      const peak = Math.max(Math.abs(l), Math.abs(r));

      // 写入信号与峰值环
      sigL[p] = l;
      sigR[p] = r;
      pbuf[p] = peak;

      // 滑动窗口最大值（单调队列，绝对序号比较）
      const outIdx = abs - D;
      while (head < win.length && win[head] <= outIdx) head++;
      while (win.length > head && pbuf[win[win.length - 1] % blen] <= peak) win.pop();
      win.push(abs);

      const winPeak = pbuf[win[head] % blen];
      const target = winPeak > ceiling ? ceiling / winPeak : 1;
      // 即时起音 + 40ms 释音
      gain = target < gain ? target : gain + rel * (target - gain);

      // 读取延迟后的信号并应用增益（恒定总时延 = D）
      const readPos = (p - D + blen) % blen;
      L[i] = sigL[readPos] * gain;
      R[i] = sigR[readPos] * gain;
      p = (p + 1) % blen;
      abs++;
    }

    // 压缩队列（丢弃已过期的头），防止无限增长
    if (head > 512) {
      win.splice(0, head);
      head = 0;
    }
    this.head = head;
    this.pos = p;
    this.absPos = abs;
    this.gain = gain;
  }
}

/* ================================================================== */
/* 处理器主体                                                          */
/* ================================================================== */

export const EQ_FREQUENCIES = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
const EQ_Q = 1.41; // 1 倍频程间距的标准比例 Q

let MelodixDSPProcessor = null;

if (typeof AudioWorkletProcessor !== 'undefined') {
  MelodixDSPProcessor = class extends AudioWorkletProcessor {
    constructor() {
      super();
      this.sr = sampleRate;    // 基础采样率（WebView2 通常 48000）
      this.sr2 = this.sr * 2;  // 2x 过采样域

      // 参数（目标值）与平滑状态
      this.target = {
        enabled: true,
        gains: new Array(10).fill(0),
        bassBoost: 0,
        bassEnhancer: 0,
        exciter: 0,
        width: 100,
        surround3D: 0,
        crossfeedAmount: 50,
        reverbPreset: 'off',
        reverbAmount: 0,
        compressorAmount: 0,
        limiterOn: true,
        preampDb: 0,
        headphoneMode: false,
        loudnessNorm: true,
        smartBass: false,
      };
      this.smGains = new Array(10).fill(0);
      this.smBassBoost = 0;
      this.smBassEnh = 0;
      this.smExciter = 0;
      this.smWidth = 1;
      this.smSurround = 0;
      this.smCrossfeed = 50;  // Bauer 耳机交叉馈送强度，独立于 smSurround
      this.smReverbAmt = 0;
      this.smCompAmt = 0;
      this.smPreamp = 0;
      this.smoothCoef = 1 - Math.exp(-128 / (0.02 * this.sr)); // ~20ms 时间常数

      // 过采样器（历史缓冲按声道独立）
      this.resampler = new HalfBandResampler();
      this.upHistL = new Float32Array(2 * this.resampler.taps);
      this.upHistR = new Float32Array(2 * this.resampler.taps);
      this.downHistL = new Float32Array(4 * this.resampler.taps + 4);
      this.downHistR = new Float32Array(4 * this.resampler.taps + 4);

      // EQ（2x 域）
      this.eqFilters = EQ_FREQUENCIES.map((f) => new BiquadFilter('peaking', f, EQ_Q, 0, this.sr2));
      this.bassShelf = new BiquadFilter('lowshelf', 60, 0.707, 0, this.sr2);

      // 增强器（每声道独立状态）
      this.enhLPL = new BiquadFilter('lowpass', 120, 0.707, 0, this.sr2);
      this.enhLPR = new BiquadFilter('lowpass', 120, 0.707, 0, this.sr2);
      this.enhHPL = new BiquadFilter('highpass', 30, 0.707, 0, this.sr2);
      this.enhHPR = new BiquadFilter('highpass', 30, 0.707, 0, this.sr2);
      this.excHPL = new BiquadFilter('highpass', 7000, 0.707, 0, this.sr2);
      this.excHPR = new BiquadFilter('highpass', 7000, 0.707, 0, this.sr2);

      // 空间
      this.widthProc = new StereoWidth(this.sr2);
      this.crossfeed = new HeadphoneCrossfeed(this.sr2);
      this.reverb = new FDNReverb(this.sr2);

      // 动态
      this.compressor = new MasterCompressor(this.sr2);
      this.limiter = new LookaheadLimiter(this.sr2);
      this.loudAGC = new LoudnessAGC(this.sr2);
      this.smartBass = new SmartBass(this.sr2);

      // 工作缓冲（2x 域）
      this.bufL = new Float32Array(256);
      this.bufR = new Float32Array(256);

      // 计量
      this.meterCounter = 0;

      this.port.onmessage = (e) => {
        if (e.data && e.data.type === 'params' && e.data.params) {
          const p = e.data.params;
          if (Array.isArray(p.gains) && p.gains.length === 10) this.target.gains = p.gains.slice();
          if (typeof p.enabled === 'boolean') this.target.enabled = p.enabled;
          if (typeof p.bassBoost === 'number') this.target.bassBoost = p.bassBoost;
          if (typeof p.bassEnhancer === 'number') this.target.bassEnhancer = p.bassEnhancer;
          if (typeof p.exciter === 'number') this.target.exciter = p.exciter;
          if (typeof p.width === 'number') this.target.width = p.width;
          if (typeof p.surround3D === 'number') this.target.surround3D = p.surround3D;
          if (typeof p.crossfeedAmount === 'number') this.target.crossfeedAmount = p.crossfeedAmount;
          if (typeof p.reverbPreset === 'string') this.target.reverbPreset = p.reverbPreset;
          if (typeof p.reverbAmount === 'number') this.target.reverbAmount = p.reverbAmount;
          if (typeof p.compressorAmount === 'number') this.target.compressorAmount = p.compressorAmount;
          if (typeof p.limiterOn === 'boolean') this.target.limiterOn = p.limiterOn;
          if (typeof p.preampDb === 'number') this.target.preampDb = p.preampDb;
          if (typeof p.headphoneMode === 'boolean') this.target.headphoneMode = p.headphoneMode;
          if (typeof p.loudnessNorm === 'boolean') this.target.loudnessNorm = p.loudnessNorm;
          if (typeof p.smartBass === 'boolean') this.target.smartBass = p.smartBass;
        }
      };
    }

    _smoothParams() {
      const c = this.smoothCoef;
      const t = this.target;
      for (let i = 0; i < 10; i++) this.smGains[i] += c * (t.gains[i] - this.smGains[i]);
      this.smBassBoost += c * (t.bassBoost - this.smBassBoost);
      this.smBassEnh += c * (t.bassEnhancer - this.smBassEnh);
      this.smExciter += c * (t.exciter - this.smExciter);
      this.smWidth += c * (t.width / 100 - this.smWidth);
      this.smSurround += c * (t.surround3D - this.smSurround);
      this.smCrossfeed += c * (t.crossfeedAmount - this.smCrossfeed);
      this.smReverbAmt += c * (t.reverbAmount - this.smReverbAmt);
      this.smCompAmt += c * (t.compressorAmount - this.smCompAmt);
      this.smPreamp += c * (t.preampDb - this.smPreamp);
    }

    _sendMeter(outL, outR, len) {
      this.meterCounter++;
      if (this.meterCounter < 8) return;
      this.meterCounter = 0;
      let peakL = 0, peakR = 0, sumL = 0, sumR = 0;
      for (let i = 0; i < len; i++) {
        const l = outL[i], r = outR[i];
        const al = Math.abs(l), ar = Math.abs(r);
        if (al > peakL) peakL = al;
        if (ar > peakR) peakR = ar;
        sumL += l * l;
        sumR += r * r;
      }
      const n = len || 1;
      const msg = {
        type: 'meter',
        lPeak: linToDb(peakL),
        rPeak: linToDb(peakR),
        lRms: linToDb(Math.sqrt(sumL / n)),
        rRms: linToDb(Math.sqrt(sumR / n)),
      };
      try { this.port.postMessage(msg); } catch (_) { /* port 已关闭时忽略 */ }
    }

    process(inputs, outputs) {
      const out = outputs[0];
      if (!out || !out.length) return true;

      const input = inputs[0];
      const inL = input && input.length > 0 ? input[0] : null;
      const inR = input && input.length > 1 ? input[1] : inL;
      const outL = out[0] || new Float32Array(128);
      const outR = out[1] || outL;
      const frameLen = outL.length;

      // 无输入或已禁用：直通（单声道复制到双声道）
      if (!inL || !this.target.enabled) {
        if (!inL) {
          outL.fill(0);
          if (outR !== outL) outR.fill(0);
          return true;
        }
        // 模块5: A/B bypass 响度匹配
        // 施加当前 AGC 增益，使干道响度与音效链输出主观等响，避免用户误判音效好坏
        const agcGain = this.loudAGC.getGain ? this.loudAGC.getGain() : 1;
        const bypassComp = agcGain > 1e-6 ? agcGain : 1;
        for (let i = 0; i < frameLen; i++) {
          outL[i] = inL[i] * bypassComp;
          outR[i] = (inR ? inR[i] : inL[i]) * bypassComp;
        }
        this._sendMeter(outL, outR, frameLen);
        return true;
      }

      this._smoothParams();
      const t = this.target;

      // ---- 1. 上采样 2x ----
      const n2 = frameLen * 2;
      if (this.bufL.length < n2) {
        this.bufL = new Float32Array(n2);
        this.bufR = new Float32Array(n2);
      }
      this.resampler.upsample(inL, frameLen, this.bufL, this.upHistL);
      this.resampler.upsample(inR, frameLen, this.bufR, this.upHistR);

      // ---- 1.5 前置增益（preamp，dB 域平滑）----
      const preGain = dbToLin(this.smPreamp);
      if (preGain !== 1) {
        for (let i = 0; i < n2; i++) { this.bufL[i] *= preGain; this.bufR[i] *= preGain; }
      }

      // ---- 1.8 SmartBass 检测（pre-EQ sidechain）----
      // 检测 preamp 后、EQ 前的原始电平，避免 EQ boost 干扰补偿决策（修复 B2 bug）
      this.smartBass.setEnabled(t.smartBass);
      this.smartBass.detect(this.bufL, this.bufR, n2);

      // ---- 2. EQ（平滑增益 → 每块重算系数） ----
      for (let i = 0; i < 10; i++) this.eqFilters[i].setGain(this.smGains[i]);
      this.bassShelf.setGain(this.smBassBoost);
      this.bassShelf.processInPlace(this.bufL, n2);
      this.bassShelf.processInPlace(this.bufR, n2);
      for (let i = 0; i < 10; i++) {
        this.eqFilters[i].processInPlace(this.bufL, n2);
        this.eqFilters[i].processInPlace(this.bufR, n2);
      }

      // ---- 2.5 SmartBass 应用（post-EQ）----
      // 将 detect() 计算的补偿量施加到 EQ 均衡后的信号上
      this.smartBass.apply(this.bufL, this.bufR, n2);

      // ---- 3. 低音谐波增强 ----
      if (this.smBassEnh > 0.5) {
        const amount = (this.smBassEnh / 100) * 0.8;
        const drive = 1 + (this.smBassEnh / 100) * 1.5;
        for (let i = 0; i < n2; i++) {
          const xl = this.bufL[i];
          const lowL = this.enhLPL.process(xl);
          this.bufL[i] = xl + amount * this.enhHPL.process(Math.tanh(drive * lowL) - lowL);
          const xr = this.bufR[i];
          const lowR = this.enhLPR.process(xr);
          this.bufR[i] = xr + amount * this.enhHPR.process(Math.tanh(drive * lowR) - lowR);
        }
      }

      // ---- 4. 空气感激励器 ----
      if (this.smExciter > 0.5) {
        const amount = this.smExciter / 100;
        for (let i = 0; i < n2; i++) {
          const hfL = this.excHPL.process(this.bufL[i]);
          this.bufL[i] += amount * (Math.tanh(2 * hfL) - hfL);
          const hfR = this.excHPR.process(this.bufR[i]);
          this.bufR[i] += amount * (Math.tanh(2 * hfR) - hfR);
        }
      }

      // ---- 5. 立体声宽度 ----
      this.widthProc.setWidth(this.smWidth);
      this.widthProc.process(this.bufL, this.bufR, n2);

      // ---- 5.5 耳机交叉馈送（Bauer 式） ----
      this.crossfeed.setEnabled(t.headphoneMode);
      // 使用独立的 smCrossfeed 参数，与 smSurround（Haas 延迟）彻底解耦（修复 B1 bug）
      this.crossfeed.setAmount(this.smCrossfeed);
      this.crossfeed.process(this.bufL, this.bufR, n2);

      // ---- 6. FDN 混响 ----
      this.reverb.setPreset(t.reverbPreset);
      this.reverb.setAmount(this.smReverbAmt);
      this.reverb.process(this.bufL, this.bufR, n2);

      // ---- 7. 压缩 ----
      this.compressor.setAmount(this.smCompAmt);
      this.compressor.process(this.bufL, this.bufR, n2);

      // ---- 7.5 响度均衡 ----
      this.loudAGC.setEnabled(t.loudnessNorm);
      this.loudAGC.process(this.bufL, this.bufR, n2);

      // ---- 8. 前瞻真峰值限幅 ----
      this.limiter.setEnabled(t.limiterOn);
      this.limiter.process(this.bufL, this.bufR, n2);

      // ---- 9. 降采样回基础速率 ----
      this.resampler.downsample(this.bufL, frameLen, outL, this.downHistL);
      this.resampler.downsample(this.bufR, frameLen, outR, this.downHistR);

      // 硬限幅保险（限幅器已保证 ≤-1dBFS，此处仅在异常时兜底，线性区完全透明）
      for (let i = 0; i < frameLen; i++) {
        outL[i] = flush(clamp(outL[i], -1, 1));
        outR[i] = flush(clamp(outR[i], -1, 1));
      }

      // ---- 计量上报 ----
      this._sendMeter(outL, outR, frameLen);

      return true;
    }
  };

  if (typeof registerProcessor !== 'undefined') {
    registerProcessor('melodix-dsp', MelodixDSPProcessor);
  }
}

export { MelodixDSPProcessor };
