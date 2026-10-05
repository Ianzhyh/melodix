import { motion, AnimatePresence } from 'framer-motion';
import React from 'react';

// 多选模式公共组件：吸顶选择操作栏 + 行内复选框。
// 三个页面（歌单 / 自建音乐库 / 收藏）共用，保证多选交互与视觉一致。

export interface SelectionAction {
  key: string;
  label: string;
  danger?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  onClick: () => void;
}

interface SelectionBarProps {
  count: number;
  total: number;
  allSelected: boolean;
  onToggleSelectAll: () => void;
  actions: SelectionAction[];
  onExit: () => void;
  /** 水平内边距：与所在页面的内容内边距对齐（默认 40px） */
  horizontalPadding?: string | number;
}

// 下载图标
const DownloadIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

// 移除图标
const TrashIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </svg>
);

// 关闭图标
const CloseIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

// 内置默认图标映射
const defaultIcons: Record<string, React.ReactNode> = {
  download: <DownloadIcon />,
  remove: <TrashIcon />,
};

export function SelectionBar({
  count,
  total,
  allSelected,
  onToggleSelectAll,
  actions,
  onExit,
  horizontalPadding = 40,
}: SelectionBarProps) {
  const hp = typeof horizontalPadding === 'number' ? `${horizontalPadding}px` : horizontalPadding;
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: `0 ${hp} 10px`,
        borderBottom: '1px solid var(--color-border)',
        marginBottom: 8,
      }}
    >
      {/* 选中计数 badge */}
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 12px 4px 10px',
        borderRadius: 20,
        background: count > 0
          ? 'var(--color-primary)'
          : 'var(--glass-2)',
        border: `1px solid ${count > 0 ? 'transparent' : 'var(--glass-border)'}`,
        boxShadow: count > 0 ? '0 8px 32px rgba(0,0,0,0.3)' : 'none',
        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        fontSize: 13,
        fontWeight: 700,
        color: count > 0 ? '#fff' : 'var(--color-text-dim)',
        marginRight: 4,
        userSelect: 'none',
      }}>
        {/* 数字切换动画 */}
        <AnimatePresence mode="wait">
          <motion.span
            key={count}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.14 }}
            style={{ display: 'inline-block', minWidth: 10, textAlign: 'center', lineHeight: 1 }}
          >
            {count}
          </motion.span>
        </AnimatePresence>
        <span style={{ fontWeight: 500, opacity: 0.85 }}>/ {total} 首已选</span>
      </div>

      {/* 全选按钮 */}
      <motion.button
        onClick={onToggleSelectAll}
        disabled={total === 0}
        whileHover={total > 0 ? { scale: 1.04 } : undefined}
        whileTap={total > 0 ? { scale: 0.94 } : undefined}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          height: 34,
          padding: '0 14px',
          borderRadius: 17,
          fontSize: 13,
          fontWeight: 500,
          background: allSelected ? 'rgba(99,102,241,0.15)' : 'var(--glass-2)',
          border: `1px solid ${allSelected ? 'rgba(99,102,241,0.45)' : 'var(--glass-border)'}`,
          color: allSelected ? 'var(--color-primary)' : 'var(--color-text)',
          cursor: total === 0 ? 'not-allowed' : 'pointer',
          opacity: total === 0 ? 0.45 : 1,
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          {allSelected ? (
            <>
              <rect x="3" y="3" width="18" height="18" rx="4" fill="var(--color-primary)" stroke="var(--color-primary)" />
              <polyline points="7 12 10.5 15.5 17 9" stroke="#fff" strokeWidth="2.5" />
            </>
          ) : (
            <rect x="3" y="3" width="18" height="18" rx="4" />
          )}
        </svg>
        {allSelected ? '取消全选' : '全选'}
      </motion.button>

      <div style={{ flex: 1 }} />

      {/* 操作按钮组 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {actions.map((action) => (
          <motion.button
            key={action.key}
            onClick={action.onClick}
            disabled={action.disabled}
            whileHover={!action.disabled ? { scale: 1.04 } : undefined}
            whileTap={!action.disabled ? { scale: 0.94 } : undefined}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              height: 34,
              padding: '0 16px',
              borderRadius: 17,
              fontSize: 13,
              fontWeight: 600,
              whiteSpace: 'nowrap',
              background: action.danger
                ? 'rgba(239,68,68,0.1)'
                : 'var(--glass-2)',
              border: `1px solid ${action.danger ? 'rgba(239,68,68,0.3)' : 'var(--glass-border)'}`,
              color: action.disabled
                ? 'var(--color-text-faint)'
                : action.danger
                  ? '#f87171'
                  : 'var(--color-text)',
              cursor: action.disabled ? 'not-allowed' : 'pointer',
              opacity: action.disabled ? 0.5 : 1,
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >
            {action.icon ?? defaultIcons[action.key]}
            {action.label}
          </motion.button>
        ))}
      </div>

      {/* 退出多选：圆形 × 按钮，hover 时旋转 */}
      <motion.button
        onClick={onExit}
        whileHover={{ scale: 1.1, rotate: 90 }}
        whileTap={{ scale: 0.9 }}
        title="退出多选 (Esc)"
        style={{
          width: 34,
          height: 34,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--glass-2)',
          border: '1px solid var(--glass-border)',
          color: 'var(--color-text-dim)',
          cursor: 'pointer',
          flexShrink: 0,
          marginLeft: 4,
          transition: 'background 0.2s, border-color 0.2s, color 0.2s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(239,68,68,0.12)';
          e.currentTarget.style.borderColor = 'rgba(239,68,68,0.35)';
          e.currentTarget.style.color = '#f87171';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'var(--glass-2)';
          e.currentTarget.style.borderColor = 'var(--glass-border)';
          e.currentTarget.style.color = 'var(--color-text-dim)';
        }}
      >
        <CloseIcon />
      </motion.button>
    </motion.div>
  );
}

// 行内复选框：多选模式下替换序号位置渲染
export function SelectionCheckbox({ selected }: { selected: boolean }) {
  return (
    <motion.span
      animate={{ scale: selected ? [1, 1.18, 1] : 1 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      style={{
        width: 20,
        height: 20,
        borderRadius: 6,
        border: `1.5px solid ${selected ? 'var(--color-primary)' : 'rgba(255,255,255,0.22)'}`,
        background: selected ? 'var(--color-primary)' : 'rgba(255,255,255,0.04)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        transition: 'border-color 0.18s ease, background 0.18s ease',
        boxShadow: selected ? '0 2px 8px rgba(0,0,0,0.1)' : 'none',
      }}
    >
      <AnimatePresence>
        {selected && (
          <motion.svg
            key="check"
            initial={{ opacity: 0, scale: 0.4, rotate: -10 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            exit={{ opacity: 0, scale: 0.4 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            width="12" height="12" viewBox="0 0 24 24"
            fill="none" stroke="#fff" strokeWidth="3"
            strokeLinecap="round" strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </motion.svg>
        )}
      </AnimatePresence>
    </motion.span>
  );
}
