import { LyricLine } from '../types/playback';

const KEY_STRING = '!@#)(*$%123ZXC!@!@#)(NHL';

// LRU 缓存：以 input 为 key，缓存解密后的歌词。利用 Map 的插入顺序实现 LRU。
const LRU_CACHE_MAX = 50;
const qrcCache = new Map<string, LyricLine[]>();

function getCached(key: string): LyricLine[] | undefined {
  if (!qrcCache.has(key)) return undefined;
  const value = qrcCache.get(key) as LyricLine[];
  // 删除后重新插入，使其成为最新使用
  qrcCache.delete(key);
  qrcCache.set(key, value);
  return value;
}

function setCached(key: string, value: LyricLine[]): void {
  if (qrcCache.has(key)) {
    qrcCache.delete(key);
  } else if (qrcCache.size >= LRU_CACHE_MAX) {
    // 淘汰最久未使用的（Map 的第一个元素）
    const oldestKey = qrcCache.keys().next().value;
    if (oldestKey !== undefined) {
      qrcCache.delete(oldestKey);
    }
  }
  qrcCache.set(key, value);
}

function unescapeXml(str: string): string {
  return str.replace(/&(?:([a-zA-Z]+)|#(\d+)|#x([0-9a-fA-F]+));/g, (match, name, dec, hex) => {
    if (name) {
      switch (name) {
        case 'quot': return '"';
        case 'apos': return "'";
        case 'lt': return '<';
        case 'gt': return '>';
        case 'amp': return '&';
        default: return match;
      }
    }
    if (dec) {
      const codePoint = parseInt(dec, 10);
      if (isNaN(codePoint) || codePoint < 0 || codePoint > 0x10FFFF) return match;
      return String.fromCodePoint(codePoint);
    }
    if (hex) {
      const codePoint = parseInt(hex, 16);
      if (isNaN(codePoint) || codePoint < 0 || codePoint > 0x10FFFF) return match;
      return String.fromCodePoint(codePoint);
    }
    return match;
  });
}

function parseQrcXml(xml: string): LyricLine[] {
  const cleanXml = xml.replace(/<!--[\s\S]*?-->/g, '');
  const match = cleanXml.match(/LyricContent\s*=\s*(["'])([\s\S]*?)\1/);
  if (!match) return [];

  const lyricContent = unescapeXml(match[2]);
  const lines = lyricContent.split(/\r?\n/);
  const parsedLines: LyricLine[] = [];

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    const lineMatch = trimmedLine.match(/^\[(\d+),(\d+)\](.*)$/);
    if (!lineMatch) continue;

    const lineTime = parseInt(lineMatch[1], 10) / 1000;
    const lineDuration = parseInt(lineMatch[2], 10) / 1000;
    const content = lineMatch[3];

    const words: LyricLine['words'] = [];
    const textBuilder: string[] = [];

    const timestampRegex = /\((0|[1-9]\d*),(0|[1-9]\d*)\)/g;
    let wordMatch: RegExpExecArray | null;
    let lastIndex = 0;

    while ((wordMatch = timestampRegex.exec(content)) !== null) {
      const startIdx = wordMatch.index;
      const text = content.substring(lastIndex, startIdx);
      const start = lineTime + parseInt(wordMatch[1], 10) / 1000;
      const duration = parseInt(wordMatch[2], 10) / 1000;
      words.push({ text, start, duration });
      textBuilder.push(text);
      lastIndex = timestampRegex.lastIndex;
    }

    if (lastIndex < content.length) {
      textBuilder.push(content.substring(lastIndex));
    }

    const fullText = words.length > 0 ? textBuilder.join('') : content;
    parsedLines.push({ time: lineTime, duration: lineDuration, text: fullText, words });
  }

  return parsedLines;
}

export async function decodeQRC(input: string): Promise<LyricLine[]> {
  if (!input) return [];

  // 解密前先查缓存，命中则直接返回
  const cached = getCached(input);
  if (cached) return cached;

  try {
    const [{ default: CryptoJS }, { default: pako }] = await Promise.all([
      import('crypto-js'),
      import('pako'),
    ]);

    const key = CryptoJS.enc.Latin1.parse(KEY_STRING);
    const cipherParams = CryptoJS.lib.CipherParams.create({
      ciphertext: CryptoJS.enc.Base64.parse(input)
    });

    const decrypted = CryptoJS.TripleDES.decrypt(cipherParams, key, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.NoPadding
    });

    const sigBytes = decrypted.sigBytes;
    if (sigBytes > 0) {
      const words = decrypted.words;
      const u8 = new Uint8Array(sigBytes);
      for (let i = 0; i < sigBytes; i++) {
        const byte = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
        u8[i] = byte;
      }

      const xml = pako.inflateRaw(u8, { to: 'string' });
      const parsed = parseQrcXml(xml);
      if (parsed.length > 0) {
        setCached(input, parsed);
        return parsed;
      }
    }
  } catch {
    // Fallthrough to parse as plain LRC
  }

  // Fallback: Parse as plain LRC
  const lines = input.split(/\r?\n/);
  const parsedLines: LyricLine[] = [];
  const regex = /^\[(\d{2,}):(\d{2})(?:\.(\d+))?\](.*)$/;

  for (const line of lines) {
    const match = line.trim().match(regex);
    if (!match) continue;

    const min = parseInt(match[1], 10);
    const sec = parseInt(match[2], 10);
    const ms = match[3] ? parseInt(match[3].slice(0, 3).padEnd(3, '0'), 10) : 0;
    const time = min * 60 + sec + ms / 1000;
    const text = match[4].trim();

    parsedLines.push({ time, duration: 0, text, words: [] });
  }

  // Calculate generic durations
  for (let i = 0; i < parsedLines.length - 1; i++) {
    parsedLines[i].duration = parsedLines[i + 1].time - parsedLines[i].time;
  }

  setCached(input, parsedLines);
  return parsedLines;
}
