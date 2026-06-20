import { usePlaybackStore } from '../stores/playbackStore';

class AudioEngineClass {
  private audio: HTMLAudioElement;
  private playRequestId: number = 0;
  private currentPlayId: number = 0;
  private _currentUrl: string = '';
  private lastTimeUpdate: number = 0;

  constructor() {
    if (typeof window !== 'undefined') {
      this.audio = new Audio();
      this.audio.preload = 'auto';
      this.setupEventListeners();
      this.setupStoreSubscriptions();
    } else {
      this.audio = {} as HTMLAudioElement;
    }
  }

  private setupEventListeners() {
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
    });

    this.audio.addEventListener('durationchange', () => {
      const state = usePlaybackStore.getState();
      state.setDuration(this.audio.duration || 0);
    });

    this.audio.addEventListener('ended', () => {
      const state = usePlaybackStore.getState();

      // BUG-1: Repeat one - directly replay, bypass next()
      if (state.repeatMode === 'one') {
        this.audio.currentTime = 0;
        this.audio.play();
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
        } else {
          // BUG-3: End of queue - stop playing
          newState.setPlaying(false);
          this.audio.pause();
        }
      }
      // else: current changed, PlayerBar useEffect will load and play new song
    });

    this.audio.addEventListener('playing', () => {
      const state = usePlaybackStore.getState();
      state.setPlaying(true);
      state.setBuffering(false);
    });

    this.audio.addEventListener('pause', () => {
      // BUG-4: Only set playing false if this is a user-initiated pause, not a song switch
      if (this.playRequestId === this.currentPlayId) {
        usePlaybackStore.getState().setPlaying(false);
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

    this._currentUrl = url;
    this.audio.src = url;
    this.audio.muted = state.isMuted;
    this.audio.volume = 0; // start muted for fade in

    try {
      await this.audio.play();
    } catch {
      return;
    }
    
    if (this.playRequestId !== myId) return;
    this.currentPlayId = myId;

    // Fade in new track
    let vol = 0;
    const step = targetVolume / 10;
    for (let i = 0; i < 10; i++) {
      if (this.playRequestId !== myId) break;
      vol = Math.min(targetVolume, vol + step);
      this.audio.volume = vol;
      await new Promise(r => setTimeout(r, 30));
    }
    if (this.playRequestId === myId) {
      this.audio.volume = targetVolume;
    }
  }

  public pause(): void {
    this.playRequestId++;
    const myId = this.playRequestId;
    const state = usePlaybackStore.getState();

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
    
    this.playRequestId++;
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
      this.audio.volume = targetVolume;
    }
  }

  public seek(seconds: number): void {
    const duration = this.audio.duration || 0;
    const clamped = Math.min(Math.max(seconds, 0), duration);
    this.audio.currentTime = clamped;
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
