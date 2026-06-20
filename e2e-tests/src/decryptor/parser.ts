export interface LyricWord {
  text: string;
  start: number;
  duration: number;
}

export interface LyricLine {
  time: number;
  duration: number;
  text: string;
  words: LyricWord[];
}

/**
 * Unescape XML entities.
 */
export function unescapeXml(str: string): string {
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
      if (isNaN(codePoint) || codePoint < 0 || codePoint > 0x10FFFF) {
        return match;
      }
      return String.fromCodePoint(codePoint);
    }
    if (hex) {
      const codePoint = parseInt(hex, 16);
      if (isNaN(codePoint) || codePoint < 0 || codePoint > 0x10FFFF) {
        return match;
      }
      return String.fromCodePoint(codePoint);
    }
    return match;
  });
}

/**
 * Parse decrypted QRC XML string.
 * Extracts LyricContent, unescapes it, and parses each line.
 */
export function parseQrc(xml: string): LyricLine[] {
  // Strip out XML comments first
  const cleanXml = xml.replace(/<!--[\s\S]*?-->/g, '');

  // Match LyricContent with single or double quotes, and optional spaces around =
  const match = cleanXml.match(/LyricContent\s*=\s*(["'])([\s\S]*?)\1/);
  if (!match) {
    return [];
  }

  const lyricContent = unescapeXml(match[2]);
  const lines = lyricContent.split(/\r?\n/);
  const parsedLines: LyricLine[] = [];

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) {
      continue;
    }

    // Match [lineTime, duration]
    const lineMatch = trimmedLine.match(/^\[(\d+),(\d+)\](.*)$/);
    if (!lineMatch) {
      continue; // Skip non-lyric lines like [offset:0] or other headers
    }

    const lineTime = parseInt(lineMatch[1], 10);
    const lineDuration = parseInt(lineMatch[2], 10);
    const content = lineMatch[3];

    const words: LyricWord[] = [];
    const textBuilder: string[] = [];

    // Parse word-level timestamps: text(start,dur) using robust regex
    const timestampRegex = /\((0|[1-9]\d*),(0|[1-9]\d*)\)/g;
    let wordMatch: RegExpExecArray | null;
    let lastIndex = 0;

    while ((wordMatch = timestampRegex.exec(content)) !== null) {
      const startIdx = wordMatch.index;
      // Extract syllable text between lastIndex and startIdx
      const text = content.substring(lastIndex, startIdx);
      const start = parseInt(wordMatch[1], 10);
      const duration = parseInt(wordMatch[2], 10);

      words.push({ text, start, duration });
      textBuilder.push(text);

      lastIndex = timestampRegex.lastIndex;
    }

    if (lastIndex < content.length) {
      textBuilder.push(content.substring(lastIndex));
    }

    const fullText = words.length > 0 ? textBuilder.join('') : content;

    parsedLines.push({
      time: lineTime,
      duration: lineDuration,
      text: fullText,
      words
    });
  }

  return parsedLines;
}
