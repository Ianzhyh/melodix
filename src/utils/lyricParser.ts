import type { LyricLine } from '../types/playback';

const LRC_TIME_REGEX = /\[(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?\]/g;

/**
 * 将毫秒片段字符串解析为毫秒数值
 * "4" → 400ms（一位 = 分秒）
 * "45" → 450ms（两位 = 厘秒）
 * "456" → 456ms（三位 = 毫秒）
 */
function parseMsFragment(msStr: string): number {
  const n = parseInt(msStr, 10);
  if (isNaN(n)) return 0;
  if (msStr.length === 1) return n * 100;
  if (msStr.length === 2) return n * 10;
  return n;
}

/**
 * 解析 LRC 格式翻译歌词，返回「秒 → 翻译文本」映射
 * 支持单行多时间戳：[01:23.45][02:34.56]翻译文本
 */
export function parseLrcTranslation(transLrc: string): Map<number, string> {
  const map = new Map<number, string>();
  if (!transLrc) return map;

  const lines = transLrc.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;

    LRC_TIME_REGEX.lastIndex = 0;
    const timestamps: number[] = [];
    let cursor = 0;
    let match: RegExpExecArray | null;

    // 收集行首连续的时间戳
    while ((match = LRC_TIME_REGEX.exec(line)) !== null) {
      if (match.index !== cursor) break;
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const ms = match[3] ? parseMsFragment(match[3]) : 0;
      timestamps.push(minutes * 60 + seconds + ms / 1000);
      cursor = match.index + match[0].length;
    }

    if (timestamps.length === 0) continue;

    const text = line.slice(cursor).trim();
    if (!text) continue;

    for (const t of timestamps) {
      map.set(t, text);
    }
  }

  return map;
}

/**
 * 按时间戳容错匹配（默认 ±2 秒），原地填充 line.translation
 * 匹配规则：对每个 line，在 transMap 中找时间戳最接近且在容错范围内的翻译
 */
export function matchTranslations(
  lines: LyricLine[],
  transMap: Map<number, string>,
  toleranceSec = 2
): void {
  if (transMap.size === 0) return;

  for (const line of lines) {
    let bestDiff = Infinity;
    let bestText: string | undefined;

    for (const [transTime, transText] of transMap) {
      const diff = Math.abs(line.time - transTime);
      if (diff <= toleranceSec && diff < bestDiff) {
        bestDiff = diff;
        bestText = transText;
      }
    }

    if (bestText !== undefined) {
      line.translation = bestText;
    }
  }
}

/**
 * 判断是否为中文歌词
 * 统计所有歌词文本中文字符（Unicode 范围 \u4e00-\u9fff）占总字符比例
 * 中文字符比例 > 50% 返回 true
 * 空歌词返回 false
 */
export function isChineseLyric(lines: LyricLine[]): boolean {
  let totalChars = 0;
  let chineseChars = 0;

  for (const line of lines) {
    let text: string;
    if (line.words && line.words.length > 0) {
      text = line.words.map((w) => w.text).join('');
    } else {
      text = line.text || '';
    }

    for (const char of text) {
      if (/\s/.test(char)) continue;
      totalChars++;
      if (char >= '\u4e00' && char <= '\u9fff') {
        chineseChars++;
      }
    }
  }

  if (totalChars === 0) return false;
  return chineseChars / totalChars > 0.5;
}
