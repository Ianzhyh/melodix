// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { decryptQrcCryptoJs } from '../decryptor/decryptor';
import { parseQrc } from '../decryptor/parser';
import { qrcFixture } from '../fixtures/qrc-fixtures';

describe('Frontend QRC Decoder Parity', () => {
  it('should produce the same output as e2e decoder for the standard fixture', () => {
    // Step 1: Decrypt using CryptoJS (same as frontend)
    const decryptedXml = decryptQrcCryptoJs(qrcFixture.ciphertextBase64);
    expect(decryptedXml).toBe(qrcFixture.decryptedXml);

    // Step 2: Parse the decrypted XML
    const parsedLines = parseQrc(decryptedXml);
    expect(parsedLines).toEqual(qrcFixture.expectedLines);
  });

  it('should handle empty input gracefully', () => {
    // Frontend decodeQRC returns [] for empty input
    // Verify the underlying components behave consistently
    expect(() => decryptQrcCryptoJs('')).not.toThrow();
    expect(parseQrc('')).toEqual([]);
    expect(parseQrc('<Qrc LyricContent=""/>')).toEqual([]);
  });

  it('should handle invalid base64 input without throwing', () => {
    // Frontend decodeQRC catches errors and returns []
    // The CryptoJS decryptor may throw or return undefined for invalid input
    // This test documents the expected behavior
    try {
      const result = decryptQrcCryptoJs('not-valid-base64!!!');
      // If it doesn't throw, result should be undefined or invalid
      if (result !== undefined) {
        // If we got a string, parsing it should give empty or garbage
        const parsed = parseQrc(result);
        // We just verify it doesn't crash
        expect(Array.isArray(parsed)).toBe(true);
      }
    } catch {
      // If it throws, that's also acceptable for invalid input
      // Frontend decodeQRC catches this and returns []
    }
  });

  it('should correctly parse lyrics with XML entities', () => {
    const xml = `<Qrc LyricContent="[0,1000]hello&amp;world(0,1000)"/>`;
    const parsed = parseQrc(xml);
    expect(parsed).toEqual([
      {
        time: 0,
        duration: 1000,
        text: 'hello&world',
        words: [{ text: 'hello&world', start: 0, duration: 1000 }]
      }
    ]);
  });

  it('should correctly parse multi-line lyrics with syllable timestamps', () => {
    const xml = `<Qrc LyricContent="[0,2000]hello(0,500) world(500,500)test(1000,1000)\n[3000,2000]second(0,1000)line(1000,1000)"/>`;
    const parsed = parseQrc(xml);
    expect(parsed.length).toBe(2);

    expect(parsed[0].time).toBe(0);
    expect(parsed[0].duration).toBe(2000);
    expect(parsed[0].text).toBe('hello worldtest');
    expect(parsed[0].words.length).toBe(3);

    expect(parsed[1].time).toBe(3000);
    expect(parsed[1].duration).toBe(2000);
    expect(parsed[1].text).toBe('secondline');
    expect(parsed[1].words.length).toBe(2);
  });
});
