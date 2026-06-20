// @vitest-environment jsdom
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { usePlaybackStore } from '../../../src/stores/playbackStore';

// Mock the window.Audio if needed. In JSDOM, Audio is available but has no real playback.
// We can spy on HTMLMediaElement prototype methods to control them.
const playSpy = vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
const pauseSpy = vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});

// Now import AudioEngine
import { AudioEngine } from '../../../src/services/AudioEngine';

describe('Challenger Milestone 2 tests', () => {
  beforeEach(() => {
    // Reset Zustand store state before each test
    usePlaybackStore.setState({
      current: null,
      isPlaying: false,
      progress: 0,
      currentTime: 0,
      duration: 0,
      volume: 0.5,
      isMuted: false,
      lastVolumeBeforeMute: 0.5,
      queue: [],
      currentIndex: -1,
      syncLyrics: false,
      lyricsOpen: false,
    });
    vi.clearAllMocks();
  });

  describe('Volume Control & Memory Logic', () => {
    it('should clamp volume bounds (0.0 to 1.0)', () => {
      const store = usePlaybackStore.getState();

      store.setVolume(0.8);
      expect(usePlaybackStore.getState().volume).toBe(0.8);

      store.setVolume(1.5);
      expect(usePlaybackStore.getState().volume).toBe(1.0);

      store.setVolume(-0.5);
      expect(usePlaybackStore.getState().volume).toBe(0.0);

      store.setVolume(0);
      expect(usePlaybackStore.getState().volume).toBe(0.0);
    });

    it('should toggle mute/unmute and remember previous volume', () => {
      const store = usePlaybackStore.getState();

      // Start at 0.5
      expect(usePlaybackStore.getState().volume).toBe(0.5);
      expect(usePlaybackStore.getState().isMuted).toBe(false);

      // Mute
      store.toggleMute();
      expect(usePlaybackStore.getState().isMuted).toBe(true);
      expect(usePlaybackStore.getState().volume).toBe(0.0);
      expect(usePlaybackStore.getState().lastVolumeBeforeMute).toBe(0.5);

      // Unmute
      store.toggleMute();
      expect(usePlaybackStore.getState().isMuted).toBe(false);
      expect(usePlaybackStore.getState().volume).toBe(0.5);
    });

    it('identifies transition anomaly when volume is set while muted', () => {
      const store = usePlaybackStore.getState();
      
      store.setVolume(0.7);
      expect(usePlaybackStore.getState().volume).toBe(0.7);

      // Mute the store
      store.toggleMute();
      expect(usePlaybackStore.getState().isMuted).toBe(true);
      expect(usePlaybackStore.getState().volume).toBe(0);
      expect(usePlaybackStore.getState().lastVolumeBeforeMute).toBe(0.7);

      // Change volume while muted
      store.setVolume(0.3);
      // Volume is now 0.3, but we are still muted.
      expect(usePlaybackStore.getState().volume).toBe(0.3);
      expect(usePlaybackStore.getState().lastVolumeBeforeMute).toBe(0.7); // Still remembers 0.7 because state.isMuted is true!

      // Unmute
      store.toggleMute();
      expect(usePlaybackStore.getState().isMuted).toBe(false);
      // Volume gets set to lastVolumeBeforeMute (0.7), and the 0.3 we set while muted is lost!
      expect(usePlaybackStore.getState().volume).toBe(0.7);
    });

    it('identifies issue when volume is set to 0 and then muted/unmuted', () => {
      const store = usePlaybackStore.getState();

      store.setVolume(0);
      expect(usePlaybackStore.getState().volume).toBe(0);
      expect(usePlaybackStore.getState().lastVolumeBeforeMute).toBe(0);

      store.toggleMute(); // Mute
      expect(usePlaybackStore.getState().isMuted).toBe(true);
      expect(usePlaybackStore.getState().volume).toBe(0);
      expect(usePlaybackStore.getState().lastVolumeBeforeMute).toBe(0);

      store.toggleMute(); // Unmute
      expect(usePlaybackStore.getState().isMuted).toBe(false);
      expect(usePlaybackStore.getState().volume).toBe(0); // Restores to 0, which is still silent.
    });

    it('should verify volume fading (fadeTo) transitions and steps', async () => {
      const store = usePlaybackStore.getState();

      store.setVolume(0.2);
      const fadeSteps = await store.fadeTo(0.8, 4);

      // Since we fade from 0.2 to 0.8 in 4 steps:
      // step 1: 0.2 + (0.8-0.2)*0.25 = 0.35
      // step 2: 0.2 + (0.8-0.2)*0.50 = 0.50
      // step 3: 0.2 + (0.8-0.2)*0.75 = 0.65
      // step 4: 0.2 + (0.8-0.2)*1.00 = 0.80
      expect(fadeSteps).toEqual([0.35, 0.5, 0.65, 0.8]);
      expect(usePlaybackStore.getState().volume).toBe(0.8);
    });
  });

  describe('Queue Navigation', () => {
    const song1 = { id: '1', name: 'Song 1', artist: 'Artist 1', album: 'Album 1', cover: '' };
    const song2 = { id: '2', name: 'Song 2', artist: 'Artist 2', album: 'Album 2', cover: '' };
    const song3 = { id: '3', name: 'Song 3', artist: 'Artist 3', album: 'Album 3', cover: '' };

    it('should handle navigation under empty conditions', () => {
      const store = usePlaybackStore.getState();

      expect(store.queue).toEqual([]);
      expect(store.currentIndex).toBe(-1);
      expect(store.getCurrentSong()).toBeNull();

      // Call next, prev, skipNext
      store.next();
      expect(usePlaybackStore.getState().currentIndex).toBe(-1);
      expect(usePlaybackStore.getState().current).toBeNull();

      store.prev();
      expect(usePlaybackStore.getState().currentIndex).toBe(-1);
      expect(usePlaybackStore.getState().current).toBeNull();

      store.skipNext();
      expect(usePlaybackStore.getState().currentIndex).toBe(-1);
      expect(usePlaybackStore.getState().current).toBeNull();
    });

    it('should handle single song queue navigation', () => {
      const store = usePlaybackStore.getState();

      store.addSong(song1);
      expect(usePlaybackStore.getState().queue).toEqual([song1]);
      expect(usePlaybackStore.getState().currentIndex).toBe(0);
      expect(usePlaybackStore.getState().current).toEqual(song1);
      expect(usePlaybackStore.getState().getCurrentSong()).toEqual(song1);

      // next at boundary
      store.next();
      expect(usePlaybackStore.getState().currentIndex).toBe(0);

      // prev at boundary
      store.prev();
      expect(usePlaybackStore.getState().currentIndex).toBe(0);

      // skipNext
      store.skipNext();
      expect(usePlaybackStore.getState().currentIndex).toBe(0);
    });

    it('should handle multi-song queue navigation and edge cases', () => {
      const store = usePlaybackStore.getState();

      store.addSong(song1);
      store.addSong(song2);
      expect(usePlaybackStore.getState().queue).toEqual([song1, song2]);
      expect(usePlaybackStore.getState().currentIndex).toBe(0);

      // add song next
      store.addSongNext(song3);
      // should insert song3 right after currentIndex (index 0)
      expect(usePlaybackStore.getState().queue).toEqual([song1, song3, song2]);
      expect(usePlaybackStore.getState().currentIndex).toBe(0);

      // navigate next
      store.next();
      expect(usePlaybackStore.getState().currentIndex).toBe(1);
      expect(usePlaybackStore.getState().current).toEqual(song3);

      // navigate next again
      store.next();
      expect(usePlaybackStore.getState().currentIndex).toBe(2);
      expect(usePlaybackStore.getState().current).toEqual(song2);

      // next at boundary
      store.next();
      expect(usePlaybackStore.getState().currentIndex).toBe(2);

      // prev
      store.prev();
      expect(usePlaybackStore.getState().currentIndex).toBe(1);
      expect(usePlaybackStore.getState().current).toEqual(song3);

      // prev again
      store.prev();
      expect(usePlaybackStore.getState().currentIndex).toBe(0);
      expect(usePlaybackStore.getState().current).toEqual(song1);

      // prev at boundary
      store.prev();
      expect(usePlaybackStore.getState().currentIndex).toBe(0);
    });

    it('should fully clear the queue and reset all fields', () => {
      const store = usePlaybackStore.getState();
      store.addSong(song1);
      store.addSong(song2);
      store.setPlaying(true);
      store.setCurrentTime(45);
      store.setDuration(180);
      store.setProgress(0.25);

      expect(usePlaybackStore.getState().queue.length).toBe(2);
      expect(usePlaybackStore.getState().isPlaying).toBe(true);

      store.clearQueue();
      const updated = usePlaybackStore.getState();
      expect(updated.queue).toEqual([]);
      expect(updated.currentIndex).toBe(-1);
      expect(updated.current).toBeNull();
      expect(updated.isPlaying).toBe(false);
      expect(updated.currentTime).toBe(0);
      expect(updated.duration).toBe(0);
      expect(updated.progress).toBe(0);
    });
  });

  describe('Audio Engine Integration & State Variables', () => {
    // Access the private audio property for testing event dispatches
    let audioElement: HTMLAudioElement;

    beforeEach(() => {
      // In AudioEngineClass: this.audio is created
      audioElement = (AudioEngine as any).audio;
      // Reset currentTime and duration
      audioElement.currentTime = 0;
      Object.defineProperty(audioElement, 'duration', {
        value: 0,
        writable: true,
        configurable: true
      });
    });

    it('should update store currentTime and progress on audio timeupdate', () => {
      const store = usePlaybackStore.getState();
      
      // Set duration in element
      Object.defineProperty(audioElement, 'duration', { value: 100 });
      audioElement.currentTime = 25;

      // Dispatch event
      audioElement.dispatchEvent(new Event('timeupdate'));

      expect(usePlaybackStore.getState().currentTime).toBe(25);
      expect(usePlaybackStore.getState().progress).toBe(0.25);
    });

    it('should update store duration on audio durationchange', () => {
      const store = usePlaybackStore.getState();

      Object.defineProperty(audioElement, 'duration', { value: 120 });
      audioElement.dispatchEvent(new Event('durationchange'));

      expect(usePlaybackStore.getState().duration).toBe(120);
    });

    it('should sync store volume changes to audio element', () => {
      const store = usePlaybackStore.getState();

      store.setVolume(0.85);
      expect(audioElement.volume).toBe(0.85);

      store.toggleMute();
      expect(audioElement.volume).toBe(0);

      store.toggleMute();
      expect(audioElement.volume).toBe(0.85);
    });

    it('should update currentTime via seek action', () => {
      Object.defineProperty(audioElement, 'duration', { value: 100 });
      
      AudioEngine.seek(50);
      expect(audioElement.currentTime).toBe(50);

      // Out of bounds seek
      AudioEngine.seek(150);
      expect(audioElement.currentTime).toBe(100);

      AudioEngine.seek(-10);
      expect(audioElement.currentTime).toBe(0);
    });

    it('should handle ended event by progressing queue or pausing', async () => {
      const store = usePlaybackStore.getState();
      const song1 = { id: '1', name: 'Song 1', artist: 'Artist 1', album: 'Album 1', cover: '' };
      const song2 = { id: '2', name: 'Song 2', artist: 'Artist 2', album: 'Album 2', cover: '' };
      
      store.addSong(song1);
      store.addSong(song2);
      store.setPlaying(true);

      expect(usePlaybackStore.getState().currentIndex).toBe(0);

      // Mock fetch to simulate next song url resolve
      const fetchMock = vi.fn().mockImplementation(() => 
        Promise.resolve({
          json: () => Promise.resolve([{ url: 'http://example.com/song2.mp3' }])
        })
      );
      global.fetch = fetchMock;
      globalThis.fetch = fetchMock;
      window.fetch = fetchMock;

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Trigger ended event
      audioElement.dispatchEvent(new Event('ended'));

      // Give event loop time to run async ended handler
      await new Promise(resolve => setTimeout(resolve, 200));

      // Check if there was any console error
      if (consoleErrorSpy.mock.calls.length > 0) {
        console.log('Detected AudioEngine ended error:', consoleErrorSpy.mock.calls[0]);
      }

      expect(usePlaybackStore.getState().currentIndex).toBe(1);
      expect(usePlaybackStore.getState().current).toEqual(song2);
      
      // After fix: AudioEngine correctly re-fetches state after next(),
      // so it fetches the next song URL and plays it
      expect(fetchMock).toHaveBeenCalled();
      expect(usePlaybackStore.getState().isPlaying).toBe(true);

      consoleErrorSpy.mockRestore();
    });
  });
});
