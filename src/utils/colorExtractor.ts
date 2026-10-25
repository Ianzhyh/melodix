import type { Vibrant as VibrantType } from 'node-vibrant/browser';
import { DEFAULT_THEME_COLOR } from '../stores/playbackStore';

export { DEFAULT_THEME_COLOR };

// LRU 缓存：以封面 URL 为 key，缓存提取结果，避免切歌时重复计算
const COLOR_CACHE_MAX = 20;

/** 调色板：复用 node-vibrant 的类型，避免各调用点各自 `any` */
export type Palette = Awaited<ReturnType<ReturnType<typeof VibrantType.from>['getPalette']>>;

const colorCache = new Map<string, { palette: Palette; lightness: boolean }>();

/** 把主色写进 CSS 变量（全局主题色） */
export function applyThemeColor(hex: string): void {
  const r = document.documentElement;
  r.style.setProperty('--color-primary', hex);
  r.style.setProperty('--color-primary-20', hex + '33');
  r.style.setProperty('--color-primary-10', hex + '1a');
}

/** 恢复默认主题色 */
export function resetTheme(): void {
  applyThemeColor(DEFAULT_THEME_COLOR);
}

/** 封面平均亮度是否偏亮（用于决定文字用深色还是浅色） */
function calculateImageLightness(imageUrl: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';

    const cleanup = () => {
      img.onload = null;
      img.onerror = null;
      img.src = '';
    };

    img.onload = () => {
      const canvas = document.createElement('canvas');
      const size = 64; // Scale down for performance
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        cleanup();
        resolve(false);
        return;
      }
      ctx.drawImage(img, 0, 0, size, size);
      const data = ctx.getImageData(0, 0, size, size).data;
      let totalLuminance = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        totalLuminance += 0.299 * r + 0.587 * g + 0.114 * b;
      }
      const avgLuminance = totalLuminance / (size * size);

      // Memory optimization: explicit canvas cleanup
      canvas.width = 0;
      canvas.height = 0;
      cleanup();

      // 128 is middle gray. 120 leans towards classifying slightly light/mixed images as dark.
      resolve(avgLuminance > 120);
    };
    img.onerror = () => {
      cleanup();
      resolve(false);
    };
    img.src = imageUrl;
  });
}

/** 从调色板里按优先级挑一个主色（各调用点共用同一套优先级） */
export function pickPrimaryColor(palette: Palette | null | undefined): string {
  return (
    palette?.Vibrant?.hex ??
    palette?.DarkVibrant?.hex ??
    palette?.Muted?.hex ??
    DEFAULT_THEME_COLOR
  );
}

/**
 * 取一组用于渐变/背景的多色。
 *
 * 背景：`PlaylistView` 曾经自己写了第三份 Vibrant 调用（静态 import + 无缓存 + 无失败兜底），
 * 只为了拿一个标题色。现在统一走这里：同一次提取结果既能给全局主题，也能给局部标题。
 */
export function pickThemeColors(palette: Palette | null | undefined): string[] {
  const colors = [
    palette?.Vibrant?.hex,
    palette?.LightVibrant?.hex,
    palette?.DarkVibrant?.hex,
    palette?.Muted?.hex,
    palette?.LightMuted?.hex,
    palette?.DarkMuted?.hex,
  ].filter(Boolean) as string[];
  return colors.length > 0 ? colors : [DEFAULT_THEME_COLOR];
}

/**
 * 只提取调色板（不应用全局主题色），供页面级局部用色。
 * 与 `extractAndApplyTheme` 共享同一个 LRU 缓存 —— 同一张封面只解码一次。
 * 失败时返回 null，调用方自行决定兜底色。
 */
export async function extractPalette(imageUrl: string): Promise<Palette | null> {
  const cached = colorCache.get(imageUrl);
  if (cached) {
    // 命中后移到末尾（LRU）
    colorCache.delete(imageUrl);
    colorCache.set(imageUrl, cached);
    return cached.palette;
  }
  try {
    // 动态加载：node-vibrant 只在需要取色时才加载
    const { Vibrant } = await import('node-vibrant/browser');
    const palette = await Vibrant.from(imageUrl).getPalette();
    if (!palette) return null;
    // 这里只需调色板，lightness 由 extractAndApplyTheme 负责；为共享缓存先填 false，
    // 若之后 extractAndApplyTheme 命中该条，会重新计算亮度（见其缓存分支的说明）。
    colorCache.set(imageUrl, { palette, lightness: false });
    if (colorCache.size > COLOR_CACHE_MAX) {
      const oldest = colorCache.keys().next().value;
      if (oldest !== undefined) colorCache.delete(oldest);
    }
    return palette;
  } catch {
    return null;
  }
}

export async function extractAndApplyTheme(imageUrl: string): Promise<{ themeColor: string, bgIsLight: boolean, themeColors: string[] }> {
  // 切歌时先查 LRU 缓存，命中则直接应用，未命中才提取
  const cached = colorCache.get(imageUrl);
  if (cached) {
    // 访问后移到末尾（LRU）：delete + set 重新插入以更新插入顺序
    colorCache.delete(imageUrl);
    colorCache.set(imageUrl, cached);
    const hex = pickPrimaryColor(cached.palette);
    const themeColors = pickThemeColors(cached.palette);
    applyThemeColor(hex);
    return { themeColor: hex, bgIsLight: cached.lightness, themeColors };
  }

  try {
    // 动态加载：node-vibrant 仅在提取主题色时才需要
    const { Vibrant } = await import('node-vibrant/browser');
    const [palette, bgIsLight] = await Promise.all([
      Vibrant.from(imageUrl).getPalette(),
      calculateImageLightness(imageUrl)
    ]);
    const hex = pickPrimaryColor(palette);
    const themeColors = pickThemeColors(palette);

    applyThemeColor(hex);

    // 写入缓存；超过上限时淘汰最久未使用（Map 第一个 key）
    colorCache.set(imageUrl, { palette, lightness: bgIsLight });
    if (colorCache.size > COLOR_CACHE_MAX) {
      const oldest = colorCache.keys().next().value;
      if (oldest !== undefined) {
        colorCache.delete(oldest);
      }
    }

    return { themeColor: hex, bgIsLight, themeColors };
  } catch {
    return { themeColor: DEFAULT_THEME_COLOR, bgIsLight: false, themeColors: [DEFAULT_THEME_COLOR] };
  }
}
