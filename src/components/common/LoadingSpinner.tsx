import React from 'react';

interface LoadingSpinnerProps {
  /** 直径 px */
  size?: number;
  /** 圆弧颜色（默认继承 currentColor） */
  color?: string;
  /** 底环颜色（默认半透明 currentColor 观感） */
  trackColor?: string;
  /** 圆环粗细 px */
  strokeWidth?: number;
  className?: string;
  style?: React.CSSProperties;
  /** 是否延迟淡入（默认 true）：避免本地/已缓存歌曲加载过快时"闪一下" */
  delayed?: boolean;
}

/**
 * 统一加载指示器（点歌 / 缓冲 / 列表行内）。
 *
 * **为什么用 CSS 延迟淡入而不是 JS 定时器**：本地歌曲或已缓存的歌曲常常 50ms 内
 * 就加载完，立刻弹出的转圈会"闪一下"，看起来像故障而不是加载。这里让它默认在
 * 120ms 之后才淡入：快加载时用户完全看不到，慢加载时自然浮现。放在 CSS 里就
 * 不需要额外的 state / 定时器 / 清理逻辑，也不会阻塞主线程。
 *
 * 尊重 `prefers-reduced-motion`：关闭旋转，仅保留淡入。
 */
export function LoadingSpinner({
  size = 14,
  color,
  trackColor,
  strokeWidth = 2,
  className = '',
  style,
  delayed = true,
}: LoadingSpinnerProps) {
  return (
    <span
      className={`melodix-spinner${delayed ? '' : ' melodix-spinner-immediate'} ${className}`.trim()}
      role="status"
      aria-label="正在加载"
      style={{
        width: size,
        height: size,
        borderWidth: strokeWidth,
        ...(color ? { ['--spinner-color' as string]: color } : null),
        ...(trackColor ? { ['--spinner-track' as string]: trackColor } : null),
        ...style,
      }}
    />
  );
}
