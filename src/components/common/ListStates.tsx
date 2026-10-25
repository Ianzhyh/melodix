import React from 'react';
import { motion } from 'framer-motion';

/**
 * 列表页的三种「非正常内容」状态：骨架屏 / 错误重试 / 空状态。
 *
 * 背景：这三种状态在项目里被各页面各写一遍，共 15 份：
 *   骨架屏 ×5（AlbumPage / ArtistPage / PlaylistView / SearchPage / CommentPanel）
 *     差异仅是 5 行 vs 6 行、封面 180 vs 200；
 *   错误重试 ×3（AlbumPage / ArtistPage / PlaylistView）
 *     图标 + 文案 + 按钮几乎逐字节相同，但外层高度一个是 70vh、一个是 100%+padding40；
 *   空状态 ×7（Favorites / History / CustomLibrary ×2 / LocalLibrary / PlaylistView / DownloadPanel / QueuePanel）
 *     padding 有 40/60/80 三种，有的有图标有的没有。
 *
 * 统一后行为可预期：同一类状态在任何页面长得一样、位置一样。
 */

/* ================= 错误重试 ================= */
export interface ErrorStateProps {
  message: React.ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  /** 容器高度，默认 '60vh'（原实现 70vh / 100% 不一） */
  height?: number | string;
  /** 额外内边距，默认 40 */
  padding?: number | string;
  style?: React.CSSProperties;
}

export function ErrorState({
  message,
  onRetry,
  retryLabel = '重试',
  height = '60vh',
  padding = 40,
  style,
}: ErrorStateProps) {
  return (
    <motion.div
      role="alert"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height,
        padding,
        color: 'var(--color-text-faint)',
        gap: 16,
        boxSizing: 'border-box',
        ...style,
      }}
    >
      <svg
        width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"
        style={{ opacity: 0.5 }} aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <span style={{ fontSize: 16, textAlign: 'center' }}>{message}</span>
      {onRetry && (
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onRetry}
          style={{
            padding: '8px 24px',
            borderRadius: 8,
            background: 'var(--color-primary, #6366f1)',
            border: 'none',
            color: '#fff',
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          {retryLabel}
        </motion.button>
      )}
    </motion.div>
  );
}

/* ================= 空状态 ================= */
export interface EmptyStateProps {
  /** 图标节点；不传则只显示文字 */
  icon?: React.ReactNode;
  title: React.ReactNode;
  /** 补充说明（小一号、更淡） */
  hint?: React.ReactNode;
  /** 可选操作按钮 */
  action?: React.ReactNode;
  /** 垂直内边距，默认 60（原三种取值统一到这里） */
  padding?: number | string;
  style?: React.CSSProperties;
}

export function EmptyState({ icon, title, hint, action, padding = 60, style }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: `${padding}px 0`,
        color: 'var(--color-text-faint)',
        textAlign: 'center',
        ...style,
      }}
    >
      {icon && (
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'center', opacity: 0.5 }}>
          {icon}
        </div>
      )}
      <div style={{ fontSize: 16, fontWeight: 500 }}>{title}</div>
      {hint && (
        <div style={{ fontSize: 13, marginTop: 8, color: 'var(--color-text-faint)', lineHeight: 1.6 }}>
          {hint}
        </div>
      )}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </motion.div>
  );
}

/* ================= 骨架屏 ================= */
export interface RowSkeletonProps {
  /** 行数，默认 6 */
  rows?: number;
  /** 是否显示左侧封面块 */
  cover?: boolean;
  /** 封面尺寸，默认 44 */
  coverSize?: number;
  /** 封面圆角，默认 8（专辑/歌单详情页封面用 16） */
  coverRadius?: number;
  /** 额外顶部间距 */
  gap?: number;
}

/** 列表行骨架 */
export function RowSkeleton({
  rows = 6,
  cover = true,
  coverSize = 44,
  coverRadius = 8,
  gap = 8,
}: RowSkeletonProps) {
  return (
    <div
      aria-busy="true"
      aria-label="正在加载"
      style={{ display: 'flex', flexDirection: 'column', gap, marginTop: gap ? 8 : 0 }}
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display: 'flex', gap: 16, alignItems: 'center', padding: '10px 16px' }}>
          <div className="shimmer-skeleton" style={{ width: 20, height: 16, borderRadius: 4, flexShrink: 0 }} />
          {cover && (
            <div
              className="shimmer-skeleton"
              style={{ width: coverSize, height: coverSize, borderRadius: coverRadius, flexShrink: 0 }}
            />
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 0 }}>
            <div className="shimmer-skeleton" style={{ width: '30%', height: 16, borderRadius: 4 }} />
            <div className="shimmer-skeleton" style={{ width: '15%', height: 12, borderRadius: 4 }} />
          </div>
          <div className="shimmer-skeleton" style={{ width: 40, height: 14, borderRadius: 4, flexShrink: 0 }} />
        </div>
      ))}
    </div>
  );
}

export interface DetailSkeletonProps {
  /** 大封面尺寸，默认 200 */
  coverSize?: number;
  /** 封面圆角，默认 16 */
  coverRadius?: number;
  /** 封面是否圆形（歌手页） */
  circle?: boolean;
  /** 下方列表行数，默认 6 */
  rows?: number;
}

/** 详情页骨架：大封面 + 标题块 + 列表行 */
export function DetailSkeleton({
  coverSize = 200,
  coverRadius = 16,
  circle = false,
  rows = 6,
}: DetailSkeletonProps) {
  return (
    <div aria-busy="true" aria-label="正在加载" style={{ padding: '40px 0' }}>
      <div style={{ display: 'flex', gap: 32, alignItems: 'center' }}>
        <div
          className="shimmer-skeleton"
          style={{
            width: coverSize,
            height: coverSize,
            borderRadius: circle ? '50%' : coverRadius,
            flexShrink: 0,
          }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minWidth: 0 }}>
          <div className="shimmer-skeleton" style={{ width: '40%', height: 32, borderRadius: 6 }} />
          <div className="shimmer-skeleton" style={{ width: '20%', height: 18, borderRadius: 4 }} />
          <div className="shimmer-skeleton" style={{ width: '30%', height: 14, borderRadius: 4 }} />
        </div>
      </div>
      <div style={{ marginTop: 24 }}>
        <RowSkeleton rows={rows} cover={false} />
      </div>
    </div>
  );
}
