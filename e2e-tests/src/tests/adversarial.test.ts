import { describe, it, expect, afterEach } from 'vitest';
import { decryptQrcNative, decryptQrcCryptoJs } from '../decryptor/decryptor';
import { parseQrc, unescapeXml } from '../decryptor/parser';
import { start, stop, ping } from '../helpers/sidecar-runner';
import http from 'http';

afterEach(async () => {
  // Always clean up the sidecar process to prevent test pollution
  await stop();
});

describe('Adversarial & Stress Tests - Parser', () => {
  it('should handle out-of-bounds decimal XML entity by returning the original string', () => {
    // 1114112 is outside Unicode range (0 to 0x10FFFF)
    expect(unescapeXml('&#1114112;')).toBe('&#1114112;');
  });

  it('should handle extremely large decimal XML entity by returning the original string', () => {
    // String.fromCodePoint on huge number should not cause RangeError
    expect(unescapeXml('&#9999999999999999;')).toBe('&#9999999999999999;');
  });

  it('should handle out-of-bounds hex XML entity by returning the original string', () => {
    // 0x110000 is 1114112
    expect(unescapeXml('&#x110000;')).toBe('&#x110000;');
  });

  it('should preserve trailing text after the last timestamp in a line', () => {
    const xml = `<Qrc LyricContent="[0,1000]hello(0,500)world"/>`;
    const parsed = parseQrc(xml);
    expect(parsed).toEqual([
      {
        time: 0,
        duration: 1000,
        text: 'helloworld',
        words: [
          { text: 'hello', start: 0, duration: 500 }
        ]
      }
    ]);
  });

  it('should parse LyricContent inside unclosed XML comments (parser gap)', () => {
    const xml = `<!-- unclosed comment <Qrc LyricContent="[0,1000]hello(0,1000)"/>`;
    const parsed = parseQrc(xml);
    // Because the comment is never closed, the comment-stripping regex doesn't match/remove it.
    // The parser then incorrectly extracts and parses the LyricContent anyway.
    expect(parsed).toEqual([
      {
        time: 0,
        duration: 1000,
        text: 'hello',
        words: [
          { text: 'hello', start: 0, duration: 1000 }
        ]
      }
    ]);
  });

  it('should handle unclosed comments with large content without catastrophic backtracking', () => {
    const largeUnclosed = '<!-- ' + 'A'.repeat(50000);
    const startTime = Date.now();
    const parsed = parseQrc(largeUnclosed);
    const duration = Date.now() - startTime;
    
    expect(parsed).toEqual([]);
    expect(duration).toBeLessThan(100); // Should be very fast, no catastrophic backtracking
  });

  it('should handle extremely long lyric line with 5000 words efficiently', () => {
    let content = '[0,10000]';
    for (let i = 0; i < 5000; i++) {
      content += `word${i}(${i * 2},2)`;
    }
    const xml = `<Qrc LyricContent="${content}"/>`;
    
    const startTime = Date.now();
    const parsed = parseQrc(xml);
    const duration = Date.now() - startTime;

    expect(parsed.length).toBe(1);
    expect(parsed[0].words.length).toBe(5000);
    expect(duration).toBeLessThan(200); // Should parse 5000 words in under 200ms
  });
});

describe('Adversarial & Stress Tests - Decryptor', () => {
  it('should throw on empty string for native decryptor', () => {
    expect(() => decryptQrcNative('')).toThrow(/Native QRC decryption\/decompression failed/);
  });

  it('should return undefined (due to pako type mismatch) for CryptoJS decryptor', () => {
    // Under the hood, decryptQrcCryptoJs returns undefined instead of string on empty/invalid input
    expect((decryptQrcCryptoJs('') as any)).toBeUndefined();
  });

  it('should throw on malformed hex input for native decryptor', () => {
    expect(() => decryptQrcNative('ZZZZ')).toThrow(/Native QRC decryption\/decompression failed/);
  });
});

describe('Adversarial & Stress Tests - Sidecar Runner', () => {
  it('should throw error when trying to start on an occupied port', async () => {
    const busyPort = 45005;
    
    // Create a server to occupy the port. Return 503 so that ping fails.
    const server = http.createServer((req, res) => {
      res.writeHead(503);
      res.end('service unavailable');
    });

    await new Promise<void>((resolve) => {
      server.listen(busyPort, () => resolve());
    });

    try {
      // Attempting to start sidecar on busyPort should throw
      await expect(start(busyPort)).rejects.toThrow(/Sidecar process failed to start/);
    } finally {
      // Clean up busyPort server
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
  });

  it('should handle rapid start/stop cycles without process leakage', async () => {
    const cyclePort = 45006;
    for (let i = 0; i < 3; i++) {
      await start(cyclePort);
      const alive = await ping(cyclePort);
      expect(alive).toBe(true);
      await stop();
      const dead = await ping(cyclePort);
      expect(dead).toBe(false);
    }
  });

  it('should handle high concurrency requests on sidecar', async () => {
    const concPort = 45007;
    await start(concPort);

    const requests = Array.from({ length: 50 }, () =>
      fetch(`http://localhost:${concPort}/?server=tencent&type=search&keywords=晴天`)
    );

    const responses = await Promise.all(requests);
    for (const res of responses) {
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(Array.isArray(data)).toBe(true);
    }

    await stop();
  });
});
