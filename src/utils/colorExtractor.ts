import type { Vibrant } from 'node-vibrant/browser';
import { DEFAULT_THEME_COLOR } from '../stores/playbackStore';

export { DEFAULT_THEME_COLOR };

// LRU 缓存：以封面 URL 为 key，缓存提取结果，避免切歌时重复计算
const COLOR_CACHE_MAX = 20;
type Palette = Awaited<ReturnType<ReturnType<typeof Vibrant.from>['getPalette']>>;
const colorCache = new Map<string, { palette: Palette; lightness: boolean }>();

export function applyThemeColor(hex: string): void {
  const r = document.documentElement;
  r.style.setProperty('--color-primary', hex);
  r.style.setProperty('--color-primary-20', hex + '33');
  r.style.setProperty('--color-primary-10', hex + '1a');
}

export function resetTheme(): void {
  applyThemeColor(DEFAULT_THEME_COLOR);
}

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

export async function extractAndApplyTheme(imageUrl: string): Promise<{ themeColor: string, bgIsLight: boolean, themeColors: string[] }> {
  // 切歌时先查 LRU 缓存，命中则直接应用，未命中才提取
  const cached = colorCache.get(imageUrl);
  if (cached) {
    // 访问后移到末尾（LRU）：delete + set 重新插入以更新插入顺序
    colorCache.delete(imageUrl);
    colorCache.set(imageUrl, cached);
    const hex = cached.palette.Vibrant?.hex
      ?? cached.palette.DarkVibrant?.hex
      ?? cached.palette.Muted?.hex
      ?? DEFAULT_THEME_COLOR;
    
    const themeColors = [
      cached.palette.Vibrant?.hex,
      cached.palette.LightVibrant?.hex,
      cached.palette.DarkVibrant?.hex,
      cached.palette.Muted?.hex,
      cached.palette.LightMuted?.hex,
      cached.palette.DarkMuted?.hex,
    ].filter(Boolean) as string[];
    
    if (themeColors.length === 0) themeColors.push(DEFAULT_THEME_COLOR);

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
    const hex = palette.Vibrant?.hex
      ?? palette.DarkVibrant?.hex
      ?? palette.Muted?.hex
      ?? DEFAULT_THEME_COLOR;
      
    const themeColors = [
      palette.Vibrant?.hex,
      palette.LightVibrant?.hex,
      palette.DarkVibrant?.hex,
      palette.Muted?.hex,
      palette.LightMuted?.hex,
      palette.DarkMuted?.hex,
    ].filter(Boolean) as string[];

    if (themeColors.length === 0) themeColors.push(DEFAULT_THEME_COLOR);

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
