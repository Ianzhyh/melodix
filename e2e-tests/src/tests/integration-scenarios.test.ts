import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { decryptQrcNative } from '../decryptor/decryptor';
import { parseQrc } from '../decryptor/parser';
import { start, stop } from '../helpers/sidecar-runner';

const PORT = 45015;

beforeAll(async () => {
  await start(PORT);
}, 10000);

afterAll(async () => {
  await stop();
});

describe('Tier 3: Cross-Feature Integration Test', () => {
  it('should flow end-to-end: search -> play URL -> fetch lyrics -> decrypt -> parse', async () => {
    // 1. Call search endpoint for "晴天", extract the first song's ID.
    const searchRes = await fetch(`http://localhost:${PORT}/?server=tencent&type=search&keywords=${encodeURIComponent('晴天')}`);
    expect(searchRes.status).toBe(200);
    const searchData = (await searchRes.json()) as any;
    expect(Array.isArray(searchData)).toBe(true);
    expect(searchData.length).toBeGreaterThan(0);
    
    const firstSongId = searchData[0].id;
    expect(firstSongId).toBeDefined();

    // 2. Call play URL endpoint for that ID and verify play URL is returned.
    const urlRes = await fetch(`http://localhost:${PORT}/?server=tencent&type=url&id=${firstSongId}`);
    expect(urlRes.status).toBe(200);
    const urlData = (await urlRes.json()) as any;
    expect(Array.isArray(urlData)).toBe(true);
    expect(urlData.length).toBeGreaterThan(0);
    expect(urlData[0].url).toBeDefined();
    expect(urlData[0].url.length).toBeGreaterThan(0);

    // 3. Call lyric endpoint for that ID, get encrypted hex lyrics.
    const lyricRes = await fetch(`http://localhost:${PORT}/?server=tencent&type=lrc&id=${firstSongId}`);
    expect(lyricRes.status).toBe(200);
    const encryptedHex = await lyricRes.text();
    expect(encryptedHex.length).toBeGreaterThan(0);

    // 4. Decrypt the hex lyrics using decryptQrcNative.
    const decryptedXml = decryptQrcNative(encryptedHex);
    expect(decryptedXml).toContain('LyricContent');

    // 5. Parse the decrypted XML lyrics using parseQrc.
    const parsedLyrics = parseQrc(decryptedXml);
    expect(parsedLyrics.length).toBeGreaterThan(0);

    // 6. Assert that the parsed output contains valid lines and timestamps.
    const firstLine = parsedLyrics[0];
    expect(firstLine.time).toBeGreaterThanOrEqual(0);
    expect(firstLine.duration).toBeGreaterThan(0);
    expect(firstLine.text.length).toBeGreaterThan(0);
    expect(firstLine.words.length).toBeGreaterThan(0);
  });
});

describe('Tier 4: Real-world Application Scenarios', () => {
  // Scenario 1: Active Lyric Syncing
  it('Scenario 1: Active Lyric Syncing - correctly determines the active line and word index', () => {
    // Let's mock a list of parsed QRC lines:
    const mockLines = [
      {
        time: 1000, // starts at 1000ms
        duration: 2000, // ends at 3000ms
        text: 'hello world',
        words: [
          { text: 'hello', start: 0, duration: 800 }, // 1000ms - 1800ms
          { text: ' ', start: 800, duration: 200 }, // 1800ms - 2000ms
          { text: 'world', start: 1000, duration: 1000 } // 2000ms - 3000ms
        ]
      },
      {
        time: 4000, // starts at 4000ms
        duration: 1500, // ends at 5500ms
        text: 'singing song',
        words: [
          { text: 'singing', start: 0, duration: 700 }, // 4000ms - 4700ms
          { text: ' ', start: 700, duration: 100 }, // 4700ms - 4800ms
          { text: 'song', start: 800, duration: 700 } // 4800ms - 5500ms
        ]
      }
    ];

    function findActiveLyricIndices(lines: typeof mockLines, timeMs: number): { lineIndex: number; wordIndex: number } {
      if (lines.length === 0) return { lineIndex: -1, wordIndex: -1 };
      if (timeMs < lines[0].time) return { lineIndex: -1, wordIndex: -1 };

      let activeLineIdx = -1;
      for (let i = 0; i < lines.length; i++) {
        if (timeMs >= lines[i].time) {
          if (i === lines.length - 1 || timeMs < lines[i + 1].time) {
            activeLineIdx = i;
            break;
          }
        }
      }

      if (activeLineIdx === -1) {
        return { lineIndex: -1, wordIndex: -1 };
      }

      const line = lines[activeLineIdx];
      if (timeMs >= line.time + line.duration) {
        return { lineIndex: activeLineIdx, wordIndex: -1 };
      }

      const relativeTime = timeMs - line.time;
      let activeWordIdx = -1;
      for (let j = 0; j < line.words.length; j++) {
        const word = line.words[j];
        if (relativeTime >= word.start && relativeTime < word.start + word.duration) {
          activeWordIdx = j;
          break;
        }
      }

      return { lineIndex: activeLineIdx, wordIndex: activeWordIdx };
    }

    // 0ms (before first line) -> expect no active line, no active word
    expect(findActiveLyricIndices(mockLines, 0)).toEqual({ lineIndex: -1, wordIndex: -1 });

    // 500ms (before first line) -> expect no active line, no active word
    expect(findActiveLyricIndices(mockLines, 500)).toEqual({ lineIndex: -1, wordIndex: -1 });

    // 1000ms (exactly at first line, first word start) -> line 0, word 0
    expect(findActiveLyricIndices(mockLines, 1000)).toEqual({ lineIndex: 0, wordIndex: 0 });

    // 1500ms (within first word) -> line 0, word 0
    expect(findActiveLyricIndices(mockLines, 1500)).toEqual({ lineIndex: 0, wordIndex: 0 });

    // 1900ms (within space word) -> line 0, word 1
    expect(findActiveLyricIndices(mockLines, 1900)).toEqual({ lineIndex: 0, wordIndex: 1 });

    // 2500ms (within second word 'world') -> line 0, word 2
    expect(findActiveLyricIndices(mockLines, 2500)).toEqual({ lineIndex: 0, wordIndex: 2 });

    // 3500ms (in the gap between line 0 and line 1) -> line 0, word -1
    expect(findActiveLyricIndices(mockLines, 3500)).toEqual({ lineIndex: 0, wordIndex: -1 });

    // 4000ms (exactly at line 1 start) -> line 1, word 0
    expect(findActiveLyricIndices(mockLines, 4000)).toEqual({ lineIndex: 1, wordIndex: 0 });

    // 5000ms (within line 1, second word 'song') -> line 1, word 2
    expect(findActiveLyricIndices(mockLines, 5000)).toEqual({ lineIndex: 1, wordIndex: 2 });

    // 6000ms (after the last line) -> line 1, word -1
    expect(findActiveLyricIndices(mockLines, 6000)).toEqual({ lineIndex: 1, wordIndex: -1 });
  });

  // Scenario 2: State Machine / Playback Queue
  it('Scenario 2: State Machine / Playback Queue - correctly manages queue and current index', () => {
    interface Song {
      id: string;
      name: string;
      artist: string;
    }

    class PlaybackQueue {
      public queue: Song[] = [];
      public currentIndex: number = -1;

      getCurrentSong(): Song | null {
        if (this.currentIndex >= 0 && this.currentIndex < this.queue.length) {
          return this.queue[this.currentIndex];
        }
        return null;
      }

      addSong(song: Song) {
        this.queue.push(song);
        if (this.currentIndex === -1) {
          this.currentIndex = 0;
        }
      }

      addSongNext(song: Song) {
        if (this.currentIndex === -1) {
          this.queue.push(song);
          this.currentIndex = 0;
        } else {
          this.queue.splice(this.currentIndex + 1, 0, song);
        }
      }

      next() {
        if (this.currentIndex < this.queue.length - 1) {
          this.currentIndex++;
        }
      }

      prev() {
        if (this.currentIndex > 0) {
          this.currentIndex--;
        }
      }

      skipNext() {
        this.next();
      }

      clear() {
        this.queue = [];
        this.currentIndex = -1;
      }
    }

    const queue = new PlaybackQueue();
    expect(queue.queue).toEqual([]);
    expect(queue.currentIndex).toBe(-1);
    expect(queue.getCurrentSong()).toBeNull();

    // add song to queue
    const songA = { id: 'A', name: 'Song A', artist: 'Artist A' };
    queue.addSong(songA);
    expect(queue.queue).toEqual([songA]);
    expect(queue.currentIndex).toBe(0);
    expect(queue.getCurrentSong()).toEqual(songA);

    // add another song
    const songB = { id: 'B', name: 'Song B', artist: 'Artist B' };
    queue.addSong(songB);
    expect(queue.queue).toEqual([songA, songB]);
    expect(queue.currentIndex).toBe(0);

    // add song next
    const songC = { id: 'C', name: 'Song C', artist: 'Artist C' };
    queue.addSongNext(songC);
    expect(queue.queue).toEqual([songA, songC, songB]);
    expect(queue.currentIndex).toBe(0);

    // navigate next
    queue.next();
    expect(queue.currentIndex).toBe(1);
    expect(queue.getCurrentSong()).toEqual(songC);

    // navigate next again
    queue.next();
    expect(queue.currentIndex).toBe(2);
    expect(queue.getCurrentSong()).toEqual(songB);

    // try next at boundary
    queue.next();
    expect(queue.currentIndex).toBe(2);

    // navigate prev
    queue.prev();
    expect(queue.currentIndex).toBe(1);
    expect(queue.getCurrentSong()).toEqual(songC);

    // skip next
    queue.skipNext();
    expect(queue.currentIndex).toBe(2);
    expect(queue.getCurrentSong()).toEqual(songB);

    // clear queue
    queue.clear();
    expect(queue.queue).toEqual([]);
    expect(queue.currentIndex).toBe(-1);
    expect(queue.getCurrentSong()).toBeNull();
  });

  // Scenario 3: Theme Extraction Integration
  it('Scenario 3: Theme Extraction Integration - fetches image stream and verifies raw image data', async () => {
    const res = await fetch(`http://localhost:${PORT}/?server=tencent&type=pic&id=35847388&size=800`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('image/png');

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    expect(buffer.length).toBeGreaterThan(0);

    // Verify raw image signature: PNG magic header
    const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
    expect(isPng).toBe(true);
  });

  // Scenario 4: Lyric Offset Adjustment / Sync Correction
  it('Scenario 4: Lyric Offset Adjustment / Sync Correction - shifts timestamps and verifies active syllable lookup', () => {
    const mockLines = [
      {
        time: 1000, // starts at 1000ms
        duration: 2000, // ends at 3000ms
        text: 'hello world',
        words: [
          { text: 'hello', start: 0, duration: 800 }, // 1000ms - 1800ms
          { text: ' ', start: 800, duration: 200 }, // 1800ms - 2000ms
          { text: 'world', start: 1000, duration: 1000 } // 2000ms - 3000ms
        ]
      },
      {
        time: 4000, // starts at 4000ms
        duration: 1500, // ends at 5500ms
        text: 'singing song',
        words: [
          { text: 'singing', start: 0, duration: 700 }, // 4000ms - 4700ms
          { text: ' ', start: 700, duration: 100 }, // 4700ms - 4800ms
          { text: 'song', start: 800, duration: 700 } // 4800ms - 5500ms
        ]
      }
    ];

    function findActiveLyricIndices(lines: typeof mockLines, timeMs: number, offsetMs: number = 0): { lineIndex: number; wordIndex: number } {
      const adjustedTime = timeMs + offsetMs;
      if (lines.length === 0) return { lineIndex: -1, wordIndex: -1 };
      if (adjustedTime < lines[0].time) return { lineIndex: -1, wordIndex: -1 };

      let activeLineIdx = -1;
      for (let i = 0; i < lines.length; i++) {
        if (adjustedTime >= lines[i].time) {
          if (i === lines.length - 1 || adjustedTime < lines[i + 1].time) {
            activeLineIdx = i;
            break;
          }
        }
      }

      if (activeLineIdx === -1) {
        return { lineIndex: -1, wordIndex: -1 };
      }

      const line = lines[activeLineIdx];
      if (adjustedTime >= line.time + line.duration) {
        return { lineIndex: activeLineIdx, wordIndex: -1 };
      }

      const relativeTime = adjustedTime - line.time;
      let activeWordIdx = -1;
      for (let j = 0; j < line.words.length; j++) {
        const word = line.words[j];
        if (relativeTime >= word.start && relativeTime < word.start + word.duration) {
          activeWordIdx = j;
          break;
        }
      }

      return { lineIndex: activeLineIdx, wordIndex: activeWordIdx };
    }

    // Baseline (no offset): at 1500ms, should be line 0, word 0 ("hello")
    expect(findActiveLyricIndices(mockLines, 1500, 0)).toEqual({ lineIndex: 0, wordIndex: 0 });

    // With -500ms offset: time 1500ms adjusts to 1000ms, which is start of word 0
    expect(findActiveLyricIndices(mockLines, 1500, -500)).toEqual({ lineIndex: 0, wordIndex: 0 });

    // With +500ms offset: time 1500ms adjusts to 2000ms, which is line 0, word 2 ("world")
    expect(findActiveLyricIndices(mockLines, 1500, 500)).toEqual({ lineIndex: 0, wordIndex: 2 });

    // With -1000ms offset: time 1500ms adjusts to 500ms, which is before the first line
    expect(findActiveLyricIndices(mockLines, 1500, -1000)).toEqual({ lineIndex: -1, wordIndex: -1 });

    // With +2500ms offset: time 1500ms adjusts to 4000ms, which is start of line 1, word 0 ("singing")
    expect(findActiveLyricIndices(mockLines, 1500, 2500)).toEqual({ lineIndex: 1, wordIndex: 0 });
  });

  // Scenario 5: Volume Control & Mute Manager
  it('Scenario 5: Volume Control & Mute Manager - handles fading, mute/unmute toggling, and boundary safety', async () => {
    class VolumeManager {
      private volume: number = 0.5;
      private isMuted: boolean = false;
      private lastVolumeBeforeMute: number = 0.5;

      getVolume(): number {
        return this.isMuted ? 0 : this.volume;
      }

      setVolume(val: number) {
        const clamped = Math.min(Math.max(val, 0), 1);
        this.volume = clamped;
        this.lastVolumeBeforeMute = clamped;
      }

      toggleMute() {
        if (this.isMuted) {
          this.isMuted = false;
          this.volume = this.lastVolumeBeforeMute;
        } else {
          this.lastVolumeBeforeMute = this.volume;
          this.isMuted = true;
        }
      }

      getMuteState(): boolean {
        return this.isMuted;
      }

      async fadeTo(targetVolume: number, steps: number = 5): Promise<number[]> {
        const targetClamped = Math.min(Math.max(targetVolume, 0), 1);
        const startVolume = this.volume;
        const volumeLevels: number[] = [];

        for (let i = 1; i <= steps; i++) {
          const progress = i / steps;
          const current = startVolume + (targetClamped - startVolume) * progress;
          this.setVolume(current);
          volumeLevels.push(Number(current.toFixed(2)));
        }

        return volumeLevels;
      }
    }

    const manager = new VolumeManager();

    // 1. Initial State
    expect(manager.getVolume()).toBe(0.5);
    expect(manager.getMuteState()).toBe(false);

    // 2. Boundary Safety
    manager.setVolume(1.5);
    expect(manager.getVolume()).toBe(1.0);
    manager.setVolume(-0.5);
    expect(manager.getVolume()).toBe(0.0);

    manager.setVolume(0.8);
    expect(manager.getVolume()).toBe(0.8);

    // 3. Mute/Unmute Toggling and remembering last volume
    manager.toggleMute();
    expect(manager.getMuteState()).toBe(true);
    expect(manager.getVolume()).toBe(0);

    manager.setVolume(0.6);
    expect(manager.getVolume()).toBe(0);

    manager.toggleMute();
    expect(manager.getMuteState()).toBe(false);
    expect(manager.getVolume()).toBe(0.6);

    manager.setVolume(0.75);
    manager.toggleMute();
    expect(manager.getVolume()).toBe(0);
    manager.toggleMute();
    expect(manager.getVolume()).toBe(0.75);

    // 4. Volume Fading Transitions
    manager.setVolume(0.2);
    const fadeSteps = await manager.fadeTo(0.7, 5);
    expect(fadeSteps).toEqual([0.3, 0.4, 0.5, 0.6, 0.7]);
    expect(manager.getVolume()).toBe(0.7);

    const fadeOutOfBounds = await manager.fadeTo(1.2, 2);
    expect(fadeOutOfBounds).toEqual([0.85, 1.0]);
    expect(manager.getVolume()).toBe(1.0);
  });
});
