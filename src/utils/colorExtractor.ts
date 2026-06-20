import { Vibrant } from 'node-vibrant/browser';
import { DEFAULT_THEME_COLOR } from '../stores/playbackStore';

export { DEFAULT_THEME_COLOR };

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
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const size = 64; // Scale down for performance
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
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
      // 128 is middle gray. 120 leans towards classifying slightly light/mixed images as dark.
      resolve(avgLuminance > 120);
    };
    img.onerror = () => resolve(false);
    img.src = imageUrl;
  });
}

export async function extractAndApplyTheme(imageUrl: string): Promise<{ themeColor: string, bgIsLight: boolean }> {
  try {
    const [palette, bgIsLight] = await Promise.all([
      Vibrant.from(imageUrl).getPalette(),
      calculateImageLightness(imageUrl)
    ]);
    const hex = palette.Vibrant?.hex
      ?? palette.DarkVibrant?.hex
      ?? palette.Muted?.hex
      ?? DEFAULT_THEME_COLOR;
    applyThemeColor(hex);

    return { themeColor: hex, bgIsLight };
  } catch {
    return { themeColor: DEFAULT_THEME_COLOR, bgIsLight: false };
  }
}
