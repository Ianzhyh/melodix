import type React from 'react';

/**
 * 弹出菜单 / 浮层的玻璃材质。
 *
 * 背景：项目里同一套「丙烯噪点 + 着色 + 大模糊 + 1px 边框 + 阴影」被抄了 8 遍
 * （PlaylistView / CustomLibraryPage / SettingsPage ×2 / SleepTimer / TrackInfo /
 * VolumeControl / PlayerBar），且**行为已经漂移**：
 *
 *   - VolumeControl、SettingsPage、TrackInfo 等会判断 `enableTransparency`；
 *   - PlaylistView、CustomLibraryPage 直接写死丙烯，用户在设置里关掉透明效果后，
 *     这两个弹出菜单依然是模糊的（其余面板都已变不透明）。
 *
 * 这里把材质收敛成一个函数，透明度开关作为必填参数 —— 想漏都漏不掉。
 *
 * 注意与 `--modal-glass-*` 令牌的区别：弹窗走 Heavy 档（blur 80px + 更高不透明度），
 * 浮层走丙烯档（噪点纹理 + 更低不透明度），两者是有意分开的两套视觉层级。
 */

export interface PopoverGlassOptions {
  /** 用户是否开启了透明/亚克力效果 */
  enableTransparency: boolean;
  /** 圆角，默认 12 */
  radius?: number | string;
  /** 内边距，默认 8 */
  padding?: number | string;
  /** 最小宽度 */
  minWidth?: number;
  /** 阴影档位，默认 'md' */
  elevation?: 'sm' | 'md' | 'lg';
}

const SHADOWS = {
  sm: '0 8px 32px rgba(0,0,0,0.35)',
  md: '0 8px 32px rgba(0,0,0,0.5)',
  lg: '0 16px 48px rgba(0,0,0,0.3)',
} as const;

/** 弹出菜单的玻璃卡片样式 */
export function popoverGlass(opts: PopoverGlassOptions): React.CSSProperties {
  const { enableTransparency, radius = 12, padding = 8, minWidth, elevation = 'md' } = opts;
  return {
    background: enableTransparency
      ? 'var(--acrylic-noise), var(--acrylic-tint)'
      : 'var(--color-bg-elevated)',
    backdropFilter: enableTransparency ? 'var(--acrylic-blur) var(--acrylic-saturate)' : 'none',
    WebkitBackdropFilter: enableTransparency ? 'var(--acrylic-blur) var(--acrylic-saturate)' : 'none',
    border: '1px solid var(--color-border)',
    borderRadius: radius,
    padding,
    ...(minWidth !== undefined ? { minWidth } : null),
    boxShadow: SHADOWS[elevation],
    zIndex: 'var(--z-modal)',
  };
}

/** 弹层里的菜单项（含 hover / 选中态由 CSS 类处理，不手改内联样式） */
export function menuItemStyle(active = false): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 12px',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 13,
    color: active ? 'var(--color-primary)' : 'var(--color-text-dim)',
    background: active ? 'var(--color-primary-10, rgba(99,102,241,0.1))' : 'transparent',
    whiteSpace: 'nowrap',
    transition: 'background 0.15s, color 0.15s',
  };
}
