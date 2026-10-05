import { usePlaybackStore, persistLastProgress } from '../stores/playbackStore';
import { useEQStore } from '../stores/eqStore';
import { useSleepTimerStore } from '../stores/sleepTimerStore';
import { useToastStore } from '../stores/toastStore';
import { computeFinalPreamp } from '../utils/eqResponse';
import * as api from '../api/client';

class AudioEngineClass {
  private audio: HTMLAudioElement;
  private playRequestId: number = 0;
  private currentPlayId: number = 0;
  private _currentUrl: string = '';
  private lastTimeUpdate: number = 0;
  private lastProgressPersist: number = 0;
  private pendingSeek: number | null = null;
  /** 用户最近一次意图：pause() 置 false，resume() 置 true（供加载期间的竞态判断） */
  private userWantsPlay: boolean = false;

  private audioCtx: AudioContext | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  // AudioWorklet 专业 DSP 链（唯一路径，无 Legacy 降级图）
  private workletNode: AudioWorkletNode | null = null;
  private analyser: AnalyserNode | null = null;
  private meterSnapshot: { lPeak: number; rPeak: number; lRms: number; rRms: number; t: number } | null = null;
  private initPromise: Promise<void> | null = null;
  private eqSubscribed = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.audio = new Audio();
      this.audio.preload = 'auto';
      this.audio.crossOrigin = 'anonymous'; // Required for Web Audio API
      this.setupEventListeners();
      this.setupStoreSubscriptions();
    } else {
      this.audio = {} as HTMLAudioElement;
    }
  }

  private initWebAudio(): Promise<void> {
    if (this.audioCtx) return Promise.resolve();
    if (!this.initPromise) {
      this.initPromise = this.doInitWebAudio();
    }
    return this.initPromise;
  }

  private async doInitWebAudio(): Promise<void> {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      this.audioCtx = new AudioContextClass();
      this.sourceNode = this.audioCtx.createMediaElementSource(this.audio);

      if (await this.tryInitWorklet()) {
        console.log('[AudioEngine] AudioWorklet 专业 DSP 链已激活');
      } else {
        // Worklet 不可用时降级为纯直通（sourceNode 已直连 destination）
        console.warn('[AudioEngine] AudioWorklet 不可用，降级为纯直通（无音效处理）');
        this.sourceNode!.connect(this.audioCtx!.destination);
        // 旁路 Analyser（频谱可视化，不影响主路信号）
        this.analyser = this.audioCtx!.createAnalyser();
        this.analyser.fftSize = 4096;
        this.analyser.smoothingTimeConstant = 0.82;
        this.analyser.minDecibels = -100;
        this.analyser.maxDecibels = -10;
        this.sourceNode!.connect(this.analyser);
      }
      this.subscribeEQ();
    } catch (e) {
      console.error('Failed to init Web Audio API:', e);
      // 允许下次 play() 重试
      this.initPromise = null;
      this.audioCtx = null;
      this.sourceNode = null;
    }
  }

  /**
   * 建立 AudioWorklet 专业 DSP 链（public/dsp-worklet.js）：
   * MediaElementSource → worklet(2x 过采样 EQ/增强/声场/混响/动态/限幅) → 输出，
   * 旁路接一个 AnalyserNode 供音效面板显示实时频谱与电平。
   */
  private async tryInitWorklet(): Promise<boolean> {
    try {
      const ctx = this.audioCtx!;
      // 与页面同源的 worklet 模块：dev 下由 vite 提供，生产下由 frontendDist 提供
      const url = new URL('dsp-worklet.js', window.location.href).href;
      await ctx.audioWorklet.addModule(url);
      this.workletNode = new AudioWorkletNode(ctx, 'melodix-dsp', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        channelCount: 2,
        channelCountMode: 'explicit',
      });
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 4096;
      this.analyser.smoothingTimeConstant = 0.82;
      this.analyser.minDecibels = -100;
      this.analyser.maxDecibels = -10;

      this.sourceNode!.connect(this.workletNode);
      this.workletNode.connect(this.analyser); // 旁路监听（不接 destination）
      this.workletNode.connect(ctx.destination);

      this.workletNode.port.onmessage = (e: MessageEvent) => {
        const d = e.data;
        if (d && d.type === 'meter') {
          this.meterSnapshot = {
            lPeak: d.lPeak, rPeak: d.rPeak,
            lRms: d.lRms, rRms: d.rRms,
            t: Date.now(),
          };
        }
      };
      this.pushDSPParams();
      return true;
    } catch (e) {
      console.warn('[AudioEngine] AudioWorklet init failed:', e);
      this.workletNode = null;
      this.analyser = null;
      return false;
    }
  }


  /** 订阅 EQ store：参数变化时将全量参数推送到 worklet */
  private subscribeEQ() {
    if (this.eqSubscribed) return;
    this.eqSubscribed = true;
    useEQStore.subscribe(
      (state) => ({
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
        preampDb: state.preampDb,
        autoGainComp: state.autoGainComp,
        headphoneMode: state.headphoneMode,
        loudnessNorm: state.loudnessNorm,
        smartBass: state.smartBass,
      }),
      () => {
        if (this.workletNode) this.pushDSPParams();
      },
      {
        equalityFn: (a, b) =>
          a.enabled === b.enabled &&
          a.bassBoost === b.bassBoost &&
          a.bassEnhancer === b.bassEnhancer &&
          a.exciter === b.exciter &&
          a.stereoWidth === b.stereoWidth &&
          a.surround3D === b.surround3D &&
          a.crossfeedAmount === b.crossfeedAmount &&
          a.reverbPreset === b.reverbPreset &&
          a.reverbAmount === b.reverbAmount &&
          a.compressorAmount === b.compressorAmount &&
          a.limiterOn === b.limiterOn &&
          a.preampDb === b.preampDb &&
          a.autoGainComp === b.autoGainComp &&
          a.headphoneMode === b.headphoneMode &&
          a.loudnessNorm === b.loudnessNorm &&
          a.smartBass === b.smartBass &&
          a.gains.join() === b.gains.join(),
      }
    );
  }

  /** 推送全部音效参数到 worklet（参数在 worklet 内做 20ms 平滑） */
  private pushDSPParams() {
    if (!this.workletNode) return;
    const eq = useEQStore.getState();
    // 最终前置增益 = 手动 preamp + 自动增益补偿（按 EQ 合成频响峰值前置衰减，防大增益削波）
    const finalPreamp = computeFinalPreamp(eq.gains, eq.bassBoost, eq.preampDb, eq.autoGainComp);
    this.workletNode.port.postMessage({
      type: 'params',
      params: {
        enabled: eq.enabled,
        gains: eq.gains,
        bassBoost: eq.bassBoost,
        bassEnhancer: eq.bassEnhancer,
        exciter: eq.exciter,
        width: eq.stereoWidth,
        surround3D: eq.surround3D,
        crossfeedAmount: eq.crossfeedAmount,
        reverbPreset: eq.reverbPreset,
        reverbAmount: eq.reverbAmount,
        compressorAmount: eq.compressorAmount,
        limiterOn: eq.limiterOn,
        preampDb: finalPreamp,
        headphoneMode: eq.headphoneMode,
        loudnessNorm: eq.loudnessNorm,
        smartBass: eq.smartBass,
      },
    });
  }

  /** 音效面板接口 */
  public getAnalyser(): AnalyserNode | null { return this.analyser; }
  public getMeterSnapshot() { return this.meterSnapshot; }
  public isWorkletActive(): boolean { return this.workletNode !== null; }


  private setupEventListeners() {
    this.audio.addEventListener('loadedmetadata', () => {
      // 断点续播：seek 时若元数据未就绪，此处补应用待 seek 位置
      if (this.pendingSeek !== null) {
        this.audio.currentTime = Math.min(Math.max(this.pendingSeek, 0), this.audio.duration || 0);
        this.pendingSeek = null;
      }
    });

    this.audio.addEventListener('timeupdate', () => {
      const now = Date.now();
      if (now - this.lastTimeUpdate < 250) return;
      this.lastTimeUpdate = now;
      const state = usePlaybackStore.getState();
      const currentTime = this.audio.currentTime;
      const duration = this.audio.duration || 0;
      state.setCurrentTime(currentTime);
      if (duration > 0) {
        state.setProgress(currentTime / duration);
      } else {
        state.setProgress(0);
      }

      // 断点续播：每 5 秒节流持久化当前进度
      if (now - this.lastProgressPersist > 5000) {
        this.lastProgressPersist = now;
        persistLastProgress(state.current?.id || null, currentTime);
      }
      
      // Update activeLine centrally so it works even if LyricsView is not mounted
      const lyrics = state.lyrics;
      if (lyrics.length > 0) {
        let lo = 0, hi = lyrics.length - 1, result = -1;
        while (lo <= hi) {
          const mid = (lo + hi) >>> 1;
          if (lyrics[mid].time <= currentTime) { result = mid; lo = mid + 1; }
          else { hi = mid - 1; }
        }
        if (result !== state.activeLine) {
          state.setActiveLine(result);
        }
      }
    });

    this.audio.addEventListener('durationchange', () => {
      const state = usePlaybackStore.getState();
      state.setDuration(this.audio.duration || 0);
    });

    this.audio.addEventListener('ended', async () => {
      const state = usePlaybackStore.getState();

      // 睡眠定时「播完当前歌曲」：停止播放，不自动切歌
      const sleepState = useSleepTimerStore.getState();
      if (sleepState.active === 'songEnd') {
        sleepState.cancelTimer();
        state.setPlaying(false);
        useToastStore.getState().showToast('本曲已播完，睡眠定时结束', 'info');
        return;
      }

      // BUG-1: Repeat one - directly replay, bypass next()
      if (state.repeatMode === 'one') {
        this.audio.currentTime = 0;
        // 静默捕获自动重播的 rejection（如浏览器打断），避免未处理的 Promise 异常
        this.audio.play().catch(() => {});
        return;
      }

      const prevCurrent = state.current;
      state.next();

      const newState = usePlaybackStore.getState();
      if (newState.current === prevCurrent) {
        // Current didn't change after next()
        if (newState.queue.length === 1 && newState.repeatMode === 'all') {
          // BUG-2: Single song with repeat all - replay directly
          this.audio.currentTime = 0;
          this.audio.play();
        } else if (newState.radioMode && prevCurrent) {
          // 电台模式：队列无法继续时，拉同歌手热门歌曲续播
          const radioSong = await api.pickRadioSong(prevCurrent);
          const latest = usePlaybackStore.getState();
          if (radioSong && latest.current === prevCurrent) {
            useToastStore.getState().showToast(`电台续播：${radioSong.name}`, 'info');
            latest.addSong(radioSong); // addSong 推进 current → PlayerBar 副作用加载并播放
          } else {
            latest.setPlaying(false);
            this.audio.pause();
          }
        } else {
          // BUG-3: End of queue - stop playing
          newState.setPlaying(false);
          this.audio.pause();
        }
      } else if (newState.current && !newState.current.isLocal && !newState.current.filePath) {
        // 当前歌曲已切换：在线歌曲由引擎重新获取下一首 URL 并播放（本地歌曲由 PlayerBar 处理文件源）
        const nextSong = newState.current;
        try {
          const server = nextSong.onlineSource || nextSong.source || 'netease';
          const { url } = await api.getUrl(nextSong.id, server);
          if (url && usePlaybackStore.getState().current === nextSong) {
            await this.play(url);
          }
        } catch {
          // 取 URL 失败时保持现有状态，由 PlayerBar 的 current 副作用继续处理
        }
      }
    });

    this.audio.addEventListener('playing', () => {
      const state = usePlaybackStore.getState();
      state.setPlaying(true);
      state.setBuffering(false);
    });

    this.audio.addEventListener('pause', () => {
      // 断点续播：暂停时立即保存进度
      const st = usePlaybackStore.getState();
      persistLastProgress(st.current?.id || null, this.audio.currentTime || 0);
      // BUG-4: Only set playing false if this is a user-initiated pause, not a song switch
      if (this.playRequestId === this.currentPlayId) {
        st.setPlaying(false);
      }
    });

    this.audio.addEventListener('waiting', () => {
      usePlaybackStore.getState().setBuffering(true);
    });

    this.audio.addEventListener('loadstart', () => {
      usePlaybackStore.getState().setBuffering(true);
    });

    this.audio.addEventListener('canplay', () => {
      usePlaybackStore.getState().setBuffering(false);
    });

    this.audio.addEventListener('error', () => {
      const state = usePlaybackStore.getState();
      state.setPlaying(false);
      state.setBuffering(false);
      state.setPlaybackError('播放出错，请尝试其他歌曲');
    });
  }

  private setupStoreSubscriptions() {
    usePlaybackStore.subscribe(
      (state) => ({ volume: state.volume, isMuted: state.isMuted }),
      ({ volume, isMuted }) => {
        if (isMuted) {
          this.audio.muted = true;
          this.audio.volume = 0;
        } else {
          this.audio.muted = false;
          this.audio.volume = volume;
        }
      },
      { equalityFn: (a, b) => a.volume === b.volume && a.isMuted === b.isMuted }
    );

    // BUG-12: Pause audio when current song becomes null (e.g. after clearQueue)
    usePlaybackStore.subscribe(
      (state) => state.current,
      (current) => {
        if (!current && !this.audio.paused) {
          this.audio.pause();
        }
      }
    );
  }

  public async play(url: string): Promise<void> {
    if (!url) return;
    
    await this.initWebAudio();
    if (this.audioCtx?.state === 'suspended') {
      await this.audioCtx.resume();
    }

    // Wrap URL in CORS proxy if it's an online HTTP source.
    // Tauri's asset:// protocol already sends CORS headers, so we don't need
    // to touch the crossOrigin attribute for local files.
    // 注意：本地文件 URL 形如 http(s)://asset.localhost/<path>，同样以 http 开头，
    // 但只能在 WebView 内解析（sidecar 代理会 502），必须排除在代理之外。
    if ((url.startsWith('http://') || url.startsWith('https://')) && !api.isTauriAssetUrl(url)) {
      url = api.getProxiedAudioUrl(url);
    }

    if (this._currentUrl === url) {
      if (this.audio.paused) {
        await this.resume();
      }
      return;
    }

    // BUG-4: Use playRequestId to handle race conditions during rapid song switching
    this.playRequestId++;
    const myId = this.playRequestId;
    
    const state = usePlaybackStore.getState();
    const targetVolume = state.isMuted ? 0 : state.volume;

    // Fade out previous track
    if (!this.audio.paused && this.audio.src) {
      let vol = this.audio.volume;
      const step = vol / 10;
      for (let i = 0; i < 10; i++) {
        if (this.playRequestId !== myId) return;
        vol = Math.max(0, vol - step);
        this.audio.volume = vol;
        await new Promise(r => setTimeout(r, 30));
      }
    }

    if (this.playRequestId !== myId) return;

    // Abort any in-flight play promise by pausing first, then call load()
    // to guarantee the audio element is in a clean HAVE_NOTHING state before
    // setting the new src.  Without this, a pending play() call on the old src
    // raises AbortError which our catch block swallows and returns early.
    this.audio.pause();
    this.audio.load();

    // 新歌加载：清掉上一首歌遗留的待 seek 位置
    this.pendingSeek = null;

    this._currentUrl = url;
    this.audio.src = url;
    this.audio.muted = state.isMuted;
    this.audio.volume = state.isMuted ? 0 : targetVolume;

    try {
      await this.audio.play();
    } catch (e: any) {
      // AbortError is expected when play() is interrupted by a rapid song switch.
      // Any other error (e.g. NotSupportedError for an undecodable file) is real.
      if (e?.name !== 'AbortError') {
        console.error('[AudioEngine] play() failed:', e);
        const s = usePlaybackStore.getState();
        this.audio.volume = s.isMuted ? 0 : s.volume;
      }
      return;
    }
    
    if (this.playRequestId !== myId) return;
    this.currentPlayId = myId;

    // Ensure volume matches store (user may have changed it during the async load)
    const s = usePlaybackStore.getState();
    this.audio.volume = s.isMuted ? 0 : s.volume;
  }

  public pause(): void {
    this.playRequestId++;
    this.userWantsPlay = false;
    const myId = this.playRequestId;
    const state = usePlaybackStore.getState();

    if (this.audioCtx?.state === 'running') {
      // Suspending context is optional, but pausing audio element is the main thing
    }

    if (!this.audio.paused && this.audio.volume > 0) {
      const currentVol = this.audio.volume;
      const step = currentVol / 5;
      let vol = currentVol;
      const fadeOut = async () => {
        for (let i = 0; i < 5; i++) {
          if (this.playRequestId !== myId) return;
          vol = Math.max(0, vol - step);
          this.audio.volume = vol;
          await new Promise(r => setTimeout(r, 20));
        }
        if (this.playRequestId === myId) {
          this.audio.pause();
          this.audio.volume = state.isMuted ? 0 : state.volume; // Restore actual volume for next play
        }
      };
      fadeOut();
    } else {
      this.audio.pause();
    }
  }

  public async resume(): Promise<void> {
    const state = usePlaybackStore.getState();
    const targetVolume = state.isMuted ? 0 : state.volume;
    
    await this.initWebAudio();
    if (this.audioCtx?.state === 'suspended') {
      await this.audioCtx.resume();
    }

    this.playRequestId++;
    this.userWantsPlay = true;
    const myId = this.playRequestId;
    this.currentPlayId = myId;

    this.audio.muted = state.isMuted;
    this.audio.volume = 0;
    
    try {
      await this.audio.play();
    } catch {
      return;
    }

    if (this.playRequestId !== myId) return;

    let vol = 0;
    const step = targetVolume / 5;
    for (let i = 0; i < 5; i++) {
      if (this.playRequestId !== myId) break;
      vol = Math.min(targetVolume, vol + step);
      this.audio.volume = vol;
      await new Promise(r => setTimeout(r, 20));
    }
    if (this.playRequestId === myId) {
      // 淡入期间用户可能已通过 store 调整音量，最终赋值必须读最新状态，避免旧快照覆盖新音量
      const s = usePlaybackStore.getState();
      this.audio.volume = s.isMuted ? 0 : s.volume;
    }
  }

  public seek(seconds: number): void {
    const duration = this.audio.duration || 0;
    if (duration > 0) {
      this.audio.currentTime = Math.min(Math.max(seconds, 0), duration);
      this.pendingSeek = null;
      return;
    }
    // 元数据未就绪（歌曲刚加载）：记住目标位置，loadedmetadata 事件后自动应用
    this.pendingSeek = Math.max(seconds, 0);
  }

  /** 仅装载音源（设置 src 并开始加载），不自动播放；配合 seek() 定位到指定进度 */
  public prepare(url: string): void {
    this.playRequestId++;
    this.audio.pause();
    this.audio.load();
    this.pendingSeek = null;
    this._currentUrl = url;
    this.audio.src = url;
    const state = usePlaybackStore.getState();
    this.audio.muted = state.isMuted;
    this.audio.volume = state.isMuted ? 0 : state.volume;
  }

  /** 当前播放请求序号：加载期间用户按暂停会使它变化，调用方据此判断是否被中断 */
  public getPlayRequestId(): number {
    return this.playRequestId;
  }

  /** 用户最近的播放意图（暂停=false，播放=true），用于加载完成后的竞态决策 */
  public getUserWantsPlay(): boolean {
    return this.userWantsPlay;
  }

  public setVolume(v: number): void {
    const clamped = Math.min(Math.max(v, 0), 1);
    this.audio.volume = clamped;
  }

  public getDuration(): number {
    return this.audio.duration || 0;
  }

  public getCurrentTime(): number {
    return this.audio.currentTime || 0;
  }
}

export const AudioEngine = new AudioEngineClass();
export default AudioEngine;
