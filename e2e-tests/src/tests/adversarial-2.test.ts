// @vitest-environment jsdom

import { describe, it, expect, afterEach } from 'vitest';
import crypto from 'crypto';
import zlib from 'zlib';
import http from 'http';
import { decryptQrcNative, decryptQrcCryptoJs } from '../decryptor/decryptor';
import { parseQrc, unescapeXml } from '../decryptor/parser';
import { start, stop, ping } from '../helpers/sidecar-runner';

const KEY_STRING = '!@#)(*$%123ZXC!@!@#)(NHL';
const DES_KEY_BUFFER = Buffer.from(KEY_STRING, 'latin1');

// Encryption helper for generating valid ciphertext payloads in tests
function encryptQrc(xml: string): { hex: string, base64: string } {
  const compressed = zlib.deflateRawSync(Buffer.from(xml, 'utf-8'));
  const rem = compressed.length % 8;
  const padLen = rem === 0 ? 0 : 8 - rem;
  const padded = Buffer.concat([compressed, Buffer.alloc(padLen, 0)]);
  
  const cipher = crypto.createCipheriv('des-ede3', DES_KEY_BUFFER, null);
  cipher.setAutoPadding(false);
  const encrypted = Buffer.concat([cipher.update(padded), cipher.final()]);
  return {
    hex: encrypted.toString('hex'),
    base64: encrypted.toString('base64')
  };
}

afterEach(async () => {
  // Always clean up the sidecar process to prevent state leakage
  await stop();
});

describe('QRC Decryptor & Parser - Challenger 2 Stress & Edge Tests', () => {

  describe('Decryptor robustness & performance', () => {
    it('decryptQrcCryptoJs should propagate pako/CryptoJS errors for invalid inputs', () => {
      // Input that represents invalid ciphertext / not 8-byte aligned / bad base64
      const invalidBase64 = 'not-base64-at-all';
      expect(() => decryptQrcCryptoJs(invalidBase64)).toThrow();
    });

    it('decryptQrcNative should throw native wrapped error for empty or invalid hex', () => {
      expect(() => decryptQrcNative('')).toThrow(/Native QRC decryption\/decompression failed/);
      expect(() => decryptQrcNative('123')).toThrow(/Native QRC decryption\/decompression failed/);
    });

    it('should decrypt a massive lyric file (Stress Test)', () => {
      // Generate a massive XML with 3000 lines, each having 5 syllables
      let massiveXml = '<?xml version="1.0" encoding="utf-8" ?><LyricInfo LyricContent="';
      for (let i = 0; i < 3000; i++) {
        massiveXml += `[${i * 1000},1000]line${i}(0,200)word1(200,200)word2(400,200)word3(600,200)word4(800,200)\n`;
      }
      massiveXml += '"/>';

      const encrypted = encryptQrc(massiveXml);

      // Measure native decryption
      const startNative = performance.now();
      const decryptedNative = decryptQrcNative(encrypted.hex);
      const endNative = performance.now();

      // Measure CryptoJS decryption
      const startCryptoJs = performance.now();
      const decryptedCryptoJs = decryptQrcCryptoJs(encrypted.base64);
      const endCryptoJs = performance.now();

      expect(decryptedNative).toBe(massiveXml);
      expect(decryptedCryptoJs).toBe(massiveXml);

      console.log(`[Challenger 2] Native decrypt time for ~250KB XML: ${(endNative - startNative).toFixed(2)}ms`);
      console.log(`[Challenger 2] CryptoJS decrypt time for ~250KB XML: ${(endCryptoJs - startCryptoJs).toFixed(2)}ms`);
    });
  });

  describe('Parser robustness & edge cases', () => {
    it('should verify trailing text after the last syllable is preserved', () => {
      const xml = `<LyricInfo LyricContent="[0,1000]hello(0,500)world(500,500)discardedText"/>`;
      const parsed = parseQrc(xml);
      
      expect(parsed[0].text).toBe('helloworlddiscardedText');
      expect(parsed[0].words.map(w => w.text)).toEqual(['hello', 'world']);
      expect(parsed[0].words.some(w => w.text.includes('discardedText'))).toBe(false);
    });

    it('should parse line with extremely large numbers without crashing', () => {
      const hugeTime = 9999999999999;
      const xml = `<LyricInfo LyricContent="[${hugeTime},1000]hello(0,1000)"/>`;
      const parsed = parseQrc(xml);
      expect(parsed[0].time).toBe(hugeTime);
    });

    it('should handle negative numbers gracefully by ignoring invalid lines', () => {
      const xml = `<LyricInfo LyricContent="[-100,1000]hello(0,1000)"/>`;
      const parsed = parseQrc(xml);
      expect(parsed).toEqual([]);
    });

    it('should handle massive number of syllables in a single line', () => {
      let line = '[0,10000]';
      for (let i = 0; i < 3000; i++) {
        line += `syl${i}(${i * 3},3)`;
      }
      const xml = `<LyricInfo LyricContent="${line}"/>`;
      
      const startParse = performance.now();
      const parsed = parseQrc(xml);
      const endParse = performance.now();

      expect(parsed[0].words.length).toBe(3000);
      console.log(`[Challenger 2] Syllable Parser parsed 3000 words in ${(endParse - startParse).toFixed(2)}ms`);
    });

    it('should handle unescaped or invalid XML entities in unescapeXml', () => {
      expect(unescapeXml('hello & world &invalid;')).toBe('hello & world &invalid;');
      expect(unescapeXml('&#xG;')).toBe('&#xG;'); 
      expect(unescapeXml('&#9999999999999999;')).toBe('&#9999999999999999;');
    });
  });

  describe('Sidecar Runner Concurrency & Port Stress', () => {
    const BUSY_PORT = 45011;

    it('should handle port conflict gracefully and reject start', async () => {
      const dummyServer = http.createServer((req, res) => {
        res.writeHead(503, { 'Content-Type': 'text/plain' });
        res.end('Busy');
      });

      await new Promise<void>((resolve) => {
        dummyServer.listen(BUSY_PORT, () => resolve());
      });

      try {
        await expect(start(BUSY_PORT)).rejects.toThrow(/Sidecar process failed to start/);
      } finally {
        await new Promise<void>((resolve) => {
          dummyServer.close(() => resolve());
        });
      }
    });

    it('should run multiple start/stop iterations without leaking ports', async () => {
      const iterPort = 45012;
      for (let i = 0; i < 3; i++) {
        await start(iterPort);
        const alive = await ping(iterPort);
        expect(alive).toBe(true);
        await stop();
        const dead = await ping(iterPort);
        expect(dead).toBe(false);
      }
    });
  });
});
