import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useEQStore, EQ_FREQUENCIES, PRESETS, type ReverbPreset } from '../stores/eqStore';
import { AudioEngine } from '../services/AudioEngine';
import { computeEqResponseDb, computeFinalPreamp, EQ_PLOT_MIN_FREQ, EQ_PLOT_MAX_FREQ } from '../utils/eqResponse';

function Toggle({ value, onChange }: { value: boolean; onChange: () => void }) {
  return (
    <div
      onClick={onChange}
      style={{
        width: 44, height: 24, borderRadius: 12, position: 'relative', cursor: 'pointer',
        background: value ? 'var(--color-primary, #6366f1)' : 'var(--glass-3)',
        boxShadow: value ? '0 2px 8px rgba(0,0,0,0.1)' : 'inset 0 1px 3px rgba(0,0,0,0.1)',
        transition: 'background 0.3s, box-shadow 0.3s',
        display: 'flex', alignItems: 'center', padding: '0 2px',
        justifyContent: value ? 'flex-end' : 'flex-start'
      }}
    >
      <motion.div
        layout
        transition={{ type: 'spring', stiffness: 700, damping: 30 }}
        style={{
          width: 20, height: 20, background: '#fff', borderRadius: '50%',
          boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
        }}
      />
    </div>
  );
}

function CustomVerticalSlider({ value, min, max, onChange, label }: { value: number, min: number, max: number, onChange: (v: number) => void, label?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const percentage = (value - min) / (max - min);

  const updateValue = (clientY: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const height = rect.height;
    const p = 1 - Math.max(0, Math.min(1, (clientY - rect.top) / height));
    const newValue = Math.round(min + p * (max - min));
    onChange(newValue);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!containerRef.current) return;
    containerRef.current.setPointerCapture(e.pointerId);
    updateValue(e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!containerRef.current || !containerRef.current.hasPointerCapture(e.pointerId)) return;
    updateValue(e.clientY);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', userSelect: 'none' }}>
      <span style={{ fontSize: 11, color: value !== 0 ? 'var(--color-primary)' : 'var(--color-text-dim)', marginBottom: 12, fontWeight: 600, transition: 'color 0.2s', width: 24, textAlign: 'center' }}>
        {value > 0 ? '+' : ''}{value}
      </span>
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(e) => containerRef.current?.releasePointerCapture(e.pointerId)}
        style={{
          flex: 1, width: 32, display: 'flex', justifyContent: 'center', cursor: 'ns-resize', touchAction: 'none',
          padding: '6px 0', position: 'relative'
        }}
      >
        {/* Track */}
        <div style={{
          position: 'absolute', top: 6, bottom: 6, width: 4, borderRadius: 2,
          background: 'var(--glass-3)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.1)'
        }}>
          {/* Active Fill */}
          <div style={{
            position: 'absolute', bottom: 0, width: '100%', borderRadius: 2,
            height: `${percentage * 100}%`,
            background: 'var(--color-primary)',
            boxShadow: '0 0 8px var(--color-primary)',
            opacity: value !== min ? 1 : 0,
            transition: 'opacity 0.2s'
          }} />
        </div>
        {/* Thumb */}
        <div style={{
          position: 'absolute', bottom: `calc(6px + ${percentage} * (100% - 12px))`,
          width: 14, height: 14, borderRadius: '50%',
          background: '#ffffff',
          border: '2px solid var(--color-primary)',
          boxShadow: '0 2px 4px rgba(0,0,0,0.2), 0 0 0 4px var(--glass-1)',
          transform: 'translateY(50%)',
          transition: 'box-shadow 0.2s'
        }} />
      </div>
      <span style={{ fontSize: 11, color: 'var(--color-text-dim)', marginTop: 12, fontWeight: 500 }}>{label}</span>
    </div>
  );
}

function CustomHorizontalSlider({ value, min, max, onChange, width = 120 }: { value: number, min: number, max: number, onChange: (v: number) => void, width?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const percentage = (value - min) / (max - min);

  const updateValue = (clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const widthPx = rect.width;
    const p = Math.max(0, Math.min(1, (clientX - rect.left) / widthPx));
    const newValue = Math.round(min + p * (max - min));
    onChange(newValue);
  };

  return (
    <div
      ref={containerRef}
      onPointerDown={(e) => { containerRef.current?.setPointerCapture(e.pointerId); updateValue(e.clientX); }}
      onPointerMove={(e) => { if (containerRef.current?.hasPointerCapture(e.pointerId)) updateValue(e.clientX); }}
      onPointerUp={(e) => containerRef.current?.releasePointerCapture(e.pointerId)}
      style={{
        width, height: 24, display: 'flex', alignItems: 'center', cursor: 'ew-resize', touchAction: 'none', position: 'relative'
      }}
    >
      <div style={{ width: '100%', height: 4, borderRadius: 2, background: 'var(--glass-3)', position: 'relative' }}>
        <div style={{
          position: 'absolute', left: 0, height: '100%', borderRadius: 2,
          width: `${percentage * 100}%`, background: 'var(--color-primary)',
          boxShadow: '0 0 8px var(--color-primary)'
        }} />
      </div>
      <div style={{
        position: 'absolute', left: `${percentage * 100}%`,
        width: 14, height: 14, borderRadius: '50%', background: '#fff',
        border: '2px solid var(--color-primary)', transform: 'translateX(-50%)',
        boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
      }} />
    </div>
  );
}

interface MeterSnapshot {
  lPeak: number; rPeak: number; lRms: number; rRms: number;
}

/** 实时频谱分析器 + 峰值/RMS 电平表（rAF 驱动，直读 AudioEngine 的分析器旁路） */
function SpectrumAnalyzer() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [meter, setMeter] = useState<MeterSnapshot | null>(null);
  const [engineMode, setEngineMode] = useState<'worklet' | 'compat' | 'idle'>(
    AudioEngine.isWorkletActive() ? 'worklet' : 'idle'
  );
  const modeRef = useRef(engineMode);

  useEffect(() => {
    let raf = 0;
    let freqData: Uint8Array<ArrayBuffer> | null = null;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const canvas = canvasRef.current;
      const ctx = canvas && canvas.getContext('2d');
      if (!canvas || !ctx) return;

      // 引擎模式徽标（worklet 激活 / 兼容模式 / 待初始化）
      const mode: 'worklet' | 'compat' | 'idle' = AudioEngine.isWorkletActive()
        ? 'worklet'
        : AudioEngine.getAnalyser()
          ? 'compat'
          : 'idle';
      if (mode !== modeRef.current) {
        modeRef.current = mode;
        setEngineMode(mode);
      }

      // 同步画布分辨率
      if (canvas.width !== canvas.clientWidth || canvas.height !== 96) {
        canvas.width = canvas.clientWidth;
        canvas.height = 96;
      }
      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const analyser = AudioEngine.getAnalyser();
      if (!analyser) {
        ctx.fillStyle = 'rgba(255,255,255,0.28)';
        ctx.font = '12px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('播放音乐后显示实时频谱', w / 2, h / 2 + 4);
        return;
      }
      if (!freqData) freqData = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(freqData);

      // 主题色（canvas 无法解析 CSS var()，取计算值）
      let primary = '#6366f1';
      try {
        const v = getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim();
        if (v) primary = v;
      } catch { /* ignore */ }

      const bars = 96;
      const usable = Math.floor(freqData.length * 0.7);
      const barW = w / bars;
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, primary + '14');
      grad.addColorStop(0.45, primary + '66');
      grad.addColorStop(1, primary + 'd9');
      for (let i = 0; i < bars; i++) {
        const v = freqData[Math.min(freqData.length - 1, Math.floor((i / bars) * usable))] / 255;
        const bh = Math.max(2, v * (h - 6));
        ctx.fillStyle = grad;
        ctx.fillRect(i * barW + 1, h - bh, Math.max(1, barW - 2), bh);
      }
      // 顶部高光
      ctx.fillStyle = primary + '30';
      ctx.fillRect(0, 0, w, 1.5);

      // 电平表快照（worklet 每 ~21ms 上报一次）
      const snap = AudioEngine.getMeterSnapshot();
      if (snap) {
        setMeter((prev) => {
          if (prev
            && Math.abs(prev.lPeak - snap.lPeak) < 0.6
            && Math.abs(prev.rPeak - snap.rPeak) < 0.6
            && Date.now() - snap.t < 800) {
            return prev;
          }
          return { lPeak: snap.lPeak, rPeak: snap.rPeak, lRms: snap.lRms, rRms: snap.rRms };
        });
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  const badge = engineMode === 'worklet'
    ? { text: 'AudioWorklet 专业 DSP · 2x 过采样', color: 'var(--color-primary)' }
    : engineMode === 'compat'
      ? { text: '原生节点兼容模式', color: 'var(--color-text-faint)' }
      : { text: '待初始化', color: 'var(--color-text-faint)' };

  return (
    <div style={{
      background: 'var(--glass-2)', backdropFilter: 'var(--blur-md)', WebkitBackdropFilter: 'var(--blur-md)',
      border: '1px solid var(--glass-border)', borderRadius: 16, padding: 16, marginBottom: 24,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-dim)', letterSpacing: 0.5 }}>实时频谱</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: badge.color }}>{badge.text}</span>
        <span style={{ fontSize: 11, color: 'var(--color-text-faint)', fontVariantNumeric: 'tabular-nums' }}>
          {meter
            ? `L ${meter.lPeak.toFixed(1)} / R ${meter.rPeak.toFixed(1)} dB`
            : '-- dB'}
        </span>
      </div>
      <canvas ref={canvasRef} style={{ width: '100%', height: 96, display: 'block', borderRadius: 8 }} />
    </div>
  );
}

function EffectCard({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--glass-2)', backdropFilter: 'var(--blur-md)', WebkitBackdropFilter: 'var(--blur-md)',
      border: '1px solid var(--glass-border)', borderRadius: 16, padding: '16px 20px',
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)' }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--color-text-dim)', marginTop: 2, lineHeight: 1.5 }}>{desc}</div>
      </div>
      {children}
    </div>
  );
}

function SliderRow({ label, value, min, max, onChange, width = 140 }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void; width?: number }) {
  const active = value !== min;
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: active ? 'var(--color-primary)' : 'var(--color-text-dim)', width: 52, transition: 'color 0.2s' }}>
        {label}
      </span>
      <CustomHorizontalSlider value={value} min={min} max={max} onChange={onChange} width={width} />
    </div>
  );
}

/** EQ 合成频响曲线：对数频率轴，整体叠加最终 preamp（含自动增益补偿），反映实际听感 */
function EQResponseCurve({ gains, bassBoost, preampDb, autoGainComp }: { gains: number[]; bassBoost: number; preampDb: number; autoGainComp: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // 参数变化不频繁：useMemo 先算曲线数据（gains 引用变化即重算），引用稳定时跳过重绘
  const curve = useMemo(
    () => ({
      resp: computeEqResponseDb(gains, bassBoost),
      preamp: computeFinalPreamp(gains, bassBoost, preampDb, autoGainComp),
    }),
    [gains, bassBoost, preampDb, autoGainComp]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas && canvas.getContext('2d');
    if (!canvas || !ctx) return;

    // 同步画布分辨率（宽度自适应）
    if (canvas.width !== canvas.clientWidth || canvas.height !== 110) {
      canvas.width = canvas.clientWidth;
      canvas.height = 110;
    }
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // 主题色（canvas 无法解析 CSS var()，取计算值）
    let primary = '#6366f1';
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim();
      if (v) primary = v;
    } catch { /* ignore */ }

    const RANGE = 15; // Y 轴固定 ±15dB 量程，0dB 居中
    const logMin = Math.log(EQ_PLOT_MIN_FREQ);
    const logMax = Math.log(EQ_PLOT_MAX_FREQ);
    const xOf = (f: number) => ((Math.log(f) - logMin) / (logMax - logMin)) * w;
    const yOf = (db: number) => (h / 2) * (1 - Math.max(-RANGE, Math.min(RANGE, db)) / RANGE);

    // ±6/±12dB 网格线（更微弱）
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (const gd of [-12, -6, 6, 12]) {
      const y = yOf(gd);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // 0dB 中线（虚线、微弱）
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    const { freqs, db } = curve.resp;
    const n = freqs.length;

    // 曲线与 0dB 线之间填充主题色 8% 纯色（非渐变）
    ctx.beginPath();
    ctx.moveTo(xOf(freqs[0]), h / 2);
    for (let i = 0; i < n; i++) ctx.lineTo(xOf(freqs[i]), yOf(db[i] + curve.preamp));
    ctx.lineTo(xOf(freqs[n - 1]), h / 2);
    ctx.closePath();
    ctx.fillStyle = primary + '14';
    ctx.fill();

    // 频响曲线（主题色 2px 描边）
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = xOf(freqs[i]), y = yOf(db[i] + curve.preamp);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = primary;
    ctx.lineWidth = 2;
    ctx.stroke();
  }, [curve]);

  return (
    <div style={{
      background: 'var(--glass-2)', border: '1px solid var(--glass-border)', borderRadius: 12,
      padding: '10px 12px 6px', marginBottom: 20,
    }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: 110, display: 'block' }} />
    </div>
  );
}

const REVERB_OPTIONS: { key: ReverbPreset; label: string; desc: string }[] = [
  { key: 'off', label: '关闭', desc: '不加混响' },
  { key: 'studio', label: '录音室', desc: '紧凑短混响' },
  { key: 'hall', label: '大厅', desc: '宽敞 1.8s' },
  { key: 'plate', label: '金属板', desc: '明亮光泽' },
];

export function EqualizerSettings() {
  const {
    enabled, setEnabled,
    gains, setGain,
    bassBoost, setBassBoost,
    bassEnhancer, setBassEnhancer,
    exciter, setExciter,
    stereoWidth, setStereoWidth,
    surround3D, setSurround3D,
    crossfeedAmount, setCrossfeedAmount,
    reverbPreset, setReverbPreset,
    reverbAmount, setReverbAmount,
    compressorAmount, setCompressorAmount,
    limiterOn, setLimiterOn,
    headphoneMode, setHeadphoneMode,
    loudnessNorm, setLoudnessNorm,
    smartBass, setSmartBass,
    preampDb, setPreampDb,
    autoGainComp, setAutoGainComp,
    currentPreset, applyPreset,
  } = useEQStore();

  return (
    <div style={{ marginTop: 32 }}>
      <div style={{
        background: enabled ? 'var(--glass-3)' : 'var(--glass-2)',
        backdropFilter: 'var(--blur-lg)', WebkitBackdropFilter: 'var(--blur-lg)',
        border: '1px solid var(--glass-border)', borderRadius: 16, padding: 20, marginBottom: 24,
        boxShadow: enabled ? '0 8px 32px rgba(0,0,0,0.05)' : 'none', transition: 'all 0.3s'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text)', marginBottom: 4 }}>专业音效引擎</div>
            <div style={{ fontSize: 13, color: 'var(--color-text-dim)' }}>2x 过采样参量均衡 · 谐波激励 · 声场 · 混响 · 母带动态与真峰值限幅</div>
          </div>
          <Toggle value={enabled} onChange={() => setEnabled(!enabled)} />
        </div>
      </div>

      <SpectrumAnalyzer />

      <AnimatePresence>
        {enabled && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            style={{ overflow: 'hidden' }}
          >
            {/* Presets */}
            <div style={{ marginBottom: 32 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--color-text-dim)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '1px' }}>
                专业调音预设
              </label>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {PRESETS.map((preset) => {
                  const isActive = currentPreset === preset.name;
                  return (
                    <button
                      key={preset.name}
                      onClick={() => applyPreset(preset.name)}
                      style={{
                        padding: '8px 20px', borderRadius: 24, fontSize: 13, fontWeight: 600,
                        background: isActive ? 'var(--color-primary, #6366f1)' : 'var(--glass-2)',
                        border: `1px solid ${isActive ? 'var(--color-primary)' : 'var(--glass-border)'}`,
                        color: isActive ? '#fff' : 'var(--color-text)',
                        boxShadow: isActive ? 'none' : 'none',
                        cursor: 'pointer', transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                      }}
                    >
                      {preset.name}
                    </button>
                  );
                })}
                <div style={{
                  padding: '8px 20px', borderRadius: 24, fontSize: 13, fontWeight: 600,
                  background: currentPreset === 'Custom' ? 'var(--glass-3)' : 'transparent',
                  border: '1px solid var(--glass-border)', color: 'var(--color-text-dim)',
                  boxShadow: currentPreset === 'Custom' ? 'inset 0 2px 4px rgba(0,0,0,0.05)' : 'none'
                }}>
                  自定义
                </div>
              </div>
            </div>

            {/* 10-band EQ */}
            <div style={{
              background: 'var(--glass-2)', backdropFilter: 'var(--blur-md)', WebkitBackdropFilter: 'var(--blur-md)',
              border: '1px solid var(--glass-border)', borderRadius: 20, padding: 24, marginBottom: 24,
              boxShadow: '0 8px 32px rgba(0,0,0,0.03)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text)' }}>参量均衡器 (EQ)</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-faint)', marginTop: 2 }}>10 段 · 1 倍频程 · Q=1.41 · 2x 过采样（高频无挤边失真）</div>
                </div>
                <button
                  onClick={() => applyPreset('Flat')}
                  style={{
                    background: 'var(--glass-3)', border: 'none', color: 'var(--color-text)',
                    fontSize: 12, fontWeight: 600, padding: '6px 14px', borderRadius: 12, cursor: 'pointer',
                    transition: 'background 0.2s'
                  }}
                >
                  重置
                </button>
              </div>

              <EQResponseCurve gains={gains} bassBoost={bassBoost} preampDb={preampDb} autoGainComp={autoGainComp} />

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
                <SliderRow label={`${preampDb > 0 ? '+' : ''}${preampDb}dB`} value={preampDb} min={-15} max={15} onChange={setPreampDb} width={160} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: autoGainComp ? 'var(--color-primary)' : 'var(--color-text-dim)', transition: 'color 0.2s' }}>自动增益补偿</div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-faint)', marginTop: 2 }}>EQ 大增益时自动降电平防失真</div>
                  </div>
                  <Toggle value={autoGainComp} onChange={() => setAutoGainComp(!autoGainComp)} />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', height: 220, padding: '0 8px' }}>
                {EQ_FREQUENCIES.map((freq, index) => {
                  const label = freq >= 1000 ? `${freq / 1000}k` : `${freq}`;
                  return (
                    <CustomVerticalSlider
                      key={freq}
                      value={gains[index] || 0}
                      min={-12} max={12}
                      onChange={(v) => setGain(index, v)}
                      label={label}
                    />
                  );
                })}
              </div>
            </div>

            {/* Effects grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
              <EffectCard title="低音驱动 (Bass Shelf)" desc="60Hz 低频搁架，提升震撼力">
                <SliderRow label={`${bassBoost > 0 ? '+' : ''}${bassBoost}dB`} value={bassBoost} min={0} max={12} onChange={setBassBoost} />
              </EffectCard>

              <EffectCard title="低音谐波 (Bass Enhancer)" desc="低频段谐波激励，小音箱也能听出下潜与温暖感">
                <SliderRow label={`${bassEnhancer}%`} value={bassEnhancer} min={0} max={100} onChange={setBassEnhancer} />
              </EffectCard>

              <EffectCard title="空气激励 (Exciter)" desc="7kHz 以上谐波激励，增加空气感与细节光泽">
                <SliderRow label={`${exciter}%`} value={exciter} min={0} max={100} onChange={setExciter} />
              </EffectCard>

              <EffectCard title="声场宽度 (Stereo Width)" desc="Mid/Side 宽度控制，150Hz 以下自动单声道化保持低频聚焦">
                <SliderRow label={stereoWidth === 100 ? '原始' : `${stereoWidth}%`} value={stereoWidth} min={0} max={200} onChange={setStereoWidth} />
              </EffectCard>

              <EffectCard title="声场扩展 (Haas)" desc="立体声 Haas 交叉延迟，拓宽空间感（扬声器场景效果最佳）">
                <SliderRow label={`${surround3D}%`} value={surround3D} min={0} max={100} onChange={setSurround3D} />
              </EffectCard>

              <EffectCard title="耳机声场 (Crossfeed)" desc="Bauer 交叉馈送将声像从头内拉到前方位置，消除耳机特有的「头中效应」">
                <div style={{ opacity: headphoneMode ? 1 : 0.4, pointerEvents: headphoneMode ? 'auto' : 'none', transition: 'opacity 0.3s' }}>
                  <SliderRow label={`${crossfeedAmount}%`} value={crossfeedAmount} min={0} max={100} onChange={setCrossfeedAmount} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: headphoneMode ? 'var(--color-primary)' : 'var(--color-text-dim)', transition: 'color 0.2s' }}>耳机模式</div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-faint)', marginTop: 2 }}>Bauer 交叉馈送，适合耳机聆听</div>
                  </div>
                  <Toggle value={headphoneMode} onChange={() => setHeadphoneMode(!headphoneMode)} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: loudnessNorm ? 'var(--color-primary)' : 'var(--color-text-dim)', transition: 'color 0.2s' }}>响度均衡</div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-faint)', marginTop: 2 }}>统一歌曲间音量</div>
                  </div>
                  <Toggle value={loudnessNorm} onChange={() => setLoudnessNorm(!loudnessNorm)} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: smartBass ? 'var(--color-primary)' : 'var(--color-text-dim)', transition: 'color 0.2s' }}>智能低音</div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-faint)', marginTop: 2 }}>小音量自动增强低频</div>
                  </div>
                  <Toggle value={smartBass} onChange={() => setSmartBass(!smartBass)} />
                </div>
              </EffectCard>

              <EffectCard title="混响 (Reverb)" desc="8×8 Hadamard FDN 反馈延迟网络，三种经典空间">
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {REVERB_OPTIONS.map((opt) => {
                    const isActive = reverbPreset === opt.key;
                    return (
                      <button
                        key={opt.key}
                        title={opt.desc}
                        onClick={() => setReverbPreset(opt.key)}
                        style={{
                          padding: '6px 14px', borderRadius: 14, fontSize: 12, fontWeight: 600,
                          background: isActive ? 'var(--color-primary, #6366f1)' : 'var(--glass-3)',
                          border: `1px solid ${isActive ? 'var(--color-primary)' : 'var(--glass-border)'}`,
                          color: isActive ? '#fff' : 'var(--color-text-dim)',
                          cursor: 'pointer', transition: 'all 0.2s'
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                {reverbPreset !== 'off' && (
                  <SliderRow label={`${reverbAmount}%`} value={reverbAmount} min={0} max={100} onChange={setReverbAmount} />
                )}
              </EffectCard>

              <EffectCard title="母带压缩 (Compressor)" desc="软拐点立体声联动压缩 + 自动补偿增益，模拟母带总线">
                <SliderRow label={`${compressorAmount}%`} value={compressorAmount} min={0} max={100} onChange={setCompressorAmount} />
              </EffectCard>

              <EffectCard title="真峰值限幅 (True-Peak Limiter)" desc="2ms 前瞻滑动窗口，天花板 -1dBFS，防止削波失真">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: limiterOn ? 'var(--color-primary)' : 'var(--color-text-dim)' }}>
                    {limiterOn ? '已启用' : '已关闭'}
                  </span>
                  <Toggle value={limiterOn} onChange={() => setLimiterOn(!limiterOn)} />
                </div>
              </EffectCard>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
