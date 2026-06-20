// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';
import { decryptQrcNative, decryptQrcCryptoJs } from '../decryptor/decryptor';
import { parseQrc, unescapeXml } from '../decryptor/parser';
import { qrcFixture } from '../fixtures/qrc-fixtures';

describe('QRC Decryptor & Parser', () => {
  it('should decrypt ciphertext using Node native crypto', () => {
    const decrypted = decryptQrcNative(qrcFixture.ciphertextHex);
    expect(decrypted).toBe(qrcFixture.decryptedXml);
  });

  it('should decrypt ciphertext using CryptoJS & pako (browser-aligned)', () => {
    const decrypted = decryptQrcCryptoJs(qrcFixture.ciphertextBase64);
    expect(decrypted).toBe(qrcFixture.decryptedXml);
  });

  it('should parse the decrypted XML and extract correct line/word timestamps', () => {
    const parsed = parseQrc(qrcFixture.decryptedXml);
    expect(parsed).toEqual(qrcFixture.expectedLines);
  });

  it('should handle syllable parsing of lyrics containing non-timestamp parentheses', () => {
    const xml = `<Qrc LyricContent="[0,1000]hello(world)(0,1000)"/>`;
    const parsed = parseQrc(xml);
    expect(parsed).toEqual([
      {
        time: 0,
        duration: 1000,
        text: 'hello(world)',
        words: [
          { text: 'hello(world)', start: 0, duration: 1000 }
        ]
      }
    ]);

    const xml2 = `<Qrc LyricContent="[100,500]hello(world)(0,200)foo(bar)(200,300)"/>`;
    const parsed2 = parseQrc(xml2);
    expect(parsed2).toEqual([
      {
        time: 100,
        duration: 500,
        text: 'hello(world)foo(bar)',
        words: [
          { text: 'hello(world)', start: 0, duration: 200 },
          { text: 'foo(bar)', start: 200, duration: 300 }
        ]
      }
    ]);
  });

  it('should ignore XML comments containing LyricContent attribute', () => {
    const xml = `
      <!-- <Qrc LyricContent="[0,1000]commented(0,1000)"/> -->
      <Qrc LyricContent="[0,1000]real(0,1000)"/>
    `;
    const parsed = parseQrc(xml);
    expect(parsed).toEqual([
      {
        time: 0,
        duration: 1000,
        text: 'real',
        words: [
          { text: 'real', start: 0, duration: 1000 }
        ]
      }
    ]);
  });

  it('should decode XML entities correctly including decimal, hex, and named entities', () => {
    const input = 'a&quot;b&apos;c&lt;d&gt;e&amp;f&#39;g&#x27;h&#10;i';
    const output = unescapeXml(input);
    expect(output).toBe('a"b\'c<d>e&f\'g\'h\ni');
  });

  it('should handle malformed input hex strings gracefully without panicking', () => {
    expect(() => decryptQrcNative('not-a-hex-string')).toThrow(/Native QRC decryption\/decompression failed/);
    expect(() => decryptQrcNative('1234')).toThrow(/Native QRC decryption\/decompression failed/);
  });
});
