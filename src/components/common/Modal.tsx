import React, { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useGlassWhileIdle } from '../../hooks/useGlassWhileIdle';
import { useConfigStore } from '../../stores/configStore';

/**
 * 统一弹窗外壳。
 *
 * 背景：项目里同时存在 5 套手写弹窗脚手架，各自复制了「全屏遮罩 + 停冒泡 +
 * Heavy 玻璃卡片 + 取消/确认按钮 + hover 换色」这一整段：
 *   - CloseConfirmModal.tsx      自写 backdrop 的 blur(8px)（全屏逐帧重采样）
 *   - CustomLibraryPage.tsx      LibraryModal + 模块级 modalOverlayStyle/modalCardStyle/inputStyle
 *   - AddToLibraryModal.tsx      自己拼 glassReady/enableTransparency 三元表达式
 *   - ImportQQPlaylistModal.tsx  zIndex 硬编码 1000（绕过了 --z-confirm/--z-modal 层级）
 *   - SettingsPage.tsx 路径弹窗    另一份 minWidth 400 的卡片
 * 五份实现的行为并不一致，其中三处是真 bug：
 *   1. CloseConfirmModal 的遮罩用了 `backdropFilter: blur(8px)`，正好是本项目
 *      反复注明的"首帧卡顿主因"；其它四处都已改成纯色遮罩，只有它漏改。
 *   2. ImportQQPlaylistModal 写死 `zIndex: 1000`，比 --z-confirm(130) 和
 *      --z-toast 都高：它的 toast 会被自己盖住。
 *   3. 五处都没有焦点管理 —— 打开弹窗后 Tab 会跑到弹窗背后的列表里，
 *      关闭后焦点丢失到 body（键盘用户直接"掉线"）。
 * 现在统一到这里：层级走令牌、遮罩用纯色、玻璃延后开启、焦点自动进入并归还。
 */

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** 卡片标题（提供后自动渲染标题行） */
  title?: React.ReactNode;
  /** 标题下的说明文字 */
  description?: React.ReactNode;
  children?: React.ReactNode;
  /** 底部操作区；不传则只渲染默认的「取消」按钮 */
  footer?: React.ReactNode;
  /** 卡片宽度，默认 400 */
  width?: number | string;
  /** 层级：确认类弹窗用 'confirm'（盖住 toast），普通弹窗用 'modal' */
  layer?: 'modal' | 'confirm';
  /** 点击遮罩是否关闭，默认 true */
  closeOnBackdrop?: boolean;
  /** 是否响应全局 Escape 广播（App.tsx 的 melodix-close-popups），默认 true */
  closeOnEscape?: boolean;
  /** 关掉内置的内边距与 gap，交给调用方自己排版（如带 Header 的复杂弹窗） */
  bare?: boolean;
  /** 渲染到 body 之外？默认 portal 到 body */
  portal?: boolean;
  /** 追加到卡片的样式（合并到玻璃样式之后，可覆盖） */
  cardStyle?: React.CSSProperties;
  /** 追加到遮罩的样式 */
  overlayStyle?: React.CSSProperties;
  'aria-label'?: string;
}

/** 遮罩：纯色。全屏 backdrop-filter 会让每帧对整屏重采样，是弹窗首帧卡顿的主因。 */
const overlayBase: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(0,0,0,0.5)',
};

/** 卡片：Heavy 玻璃（DESIGN-REVIEW.md §5.1），含规范 §7 的顶部高光 */
const cardBase: React.CSSProperties = {
  position: 'relative',
  maxWidth: '90%',
  maxHeight: '86vh',
  overflowY: 'auto',
  background: 'var(--modal-glass-bg, rgba(30,30,30,0.85))',
  border: '1px solid var(--modal-glass-border, rgba(255,255,255,0.12))',
  borderRadius: 16,
  padding: 24,
  boxShadow: '0 24px 48px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)',
  color: 'var(--color-text)',
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
};

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 400,
  layer = 'confirm',
  closeOnBackdrop = true,
  closeOnEscape = true,
  bare = false,
  portal = true,
  cardStyle,
  overlayStyle,
  'aria-label': ariaLabel,
}: ModalProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  // 记录打开前的焦点元素，关闭时归还（否则键盘用户焦点掉到 body）
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const glassReady = useGlassWhileIdle(open);
  const enableTransparency = useConfigStore((s) => s.enableTransparency);
  const useGlass = enableTransparency && glassReady;

  // 全局 Escape 广播：App.tsx 统一派发 melodix-close-popups（不要各弹窗自己听 keydown）
  useEffect(() => {
    if (!open || !closeOnEscape) return;
    const close = () => onClose();
    window.addEventListener('melodix-close-popups', close);
    return () => window.removeEventListener('melodix-close-popups', close);
  }, [open, closeOnEscape, onClose]);

  // 焦点管理：打开时把焦点送进卡片，关闭时归还给触发元素
  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    // 等一帧，确保 portal 内容已挂载
    const raf = requestAnimationFrame(() => {
      const card = cardRef.current;
      if (!card) return;
      const focusable = card.querySelector<HTMLElement>(
        'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      (focusable ?? card).focus();
    });
    return () => {
      cancelAnimationFrame(raf);
      returnFocusRef.current?.focus?.();
      returnFocusRef.current = null;
    };
  }, [open]);

  // Tab 焦点循环：不设陷阱的话 Tab 会跑到遮罩背后的列表里
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return;
    const card = cardRef.current;
    if (!card) return;
    const nodes = Array.from(
      card.querySelectorAll<HTMLElement>(
        'a[href], input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((n) => n.offsetParent !== null || n === document.activeElement);
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }, []);

  const content = (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          style={{
            ...overlayBase,
            zIndex: layer === 'confirm' ? 'var(--z-confirm)' : 'var(--z-modal)',
            ...overlayStyle,
          }}
          onClick={closeOnBackdrop ? onClose : undefined}
        >
          <motion.div
            ref={cardRef}
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel ?? (typeof title === 'string' ? title : undefined)}
            tabIndex={-1}
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={handleKeyDown}
            style={{
              ...cardBase,
              width,
              // 模糊只在入场动画结束后开启：动画期间每帧重采样会掉帧
              backdropFilter: useGlass ? 'var(--modal-glass-blur) var(--modal-glass-saturate)' : 'none',
              WebkitBackdropFilter: useGlass ? 'var(--modal-glass-blur) var(--modal-glass-saturate)' : 'none',
              ...(useGlass ? null : { background: 'var(--color-bg-elevated, rgba(30,30,30,0.92))' }),
              ...(bare ? { padding: 0, gap: 0 } : null),
              ...cardStyle,
            }}
          >
            {(title || description) && (
              <div>
                {title && <div style={{ fontSize: 16, fontWeight: 600 }}>{title}</div>}
                {description && (
                  <div style={{ fontSize: 13, color: 'var(--color-text-dim)', lineHeight: 1.5, marginTop: 6 }}>
                    {description}
                  </div>
                )}
              </div>
            )}
            {children}
            {footer !== undefined ? (
              footer
            ) : (
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                <ModalButton onClick={onClose}>取消</ModalButton>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return portal ? createPortal(content, document.body) : content;
}

export type ModalButtonVariant = 'ghost' | 'primary' | 'danger';

export interface ModalButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ModalButtonVariant;
  children: React.ReactNode;
}

/**
 * 弹窗按钮：`ghost` / `primary` / `danger` 三档。
 *
 * 背景：原代码在 5 个弹窗里各写了一遍「三档按钮 + onMouseEnter/onMouseLeave 手动改
 * style.background」——同一套 hover 逻辑抄了 15 遍以上，且手动改内联样式会让
 * disabled/主题切换时残留旧颜色。这里改用 CSS 变量 + hover 类，只写一次。
 */
export function ModalButton({ variant = 'ghost', children, style, disabled, ...rest }: ModalButtonProps) {
  const base: React.CSSProperties = {
    padding: '8px 20px',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: variant === 'ghost' ? 400 : 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    whiteSpace: 'nowrap',
    transition: 'background 0.2s, opacity 0.2s',
    ...style,
  };

  const variants: Record<ModalButtonVariant, React.CSSProperties> = {
    ghost: {
      border: '1px solid var(--color-border)',
      background: 'transparent',
      color: 'var(--color-text)',
    },
    primary: {
      border: 'none',
      background: 'var(--color-primary, #6366f1)',
      color: '#fff',
    },
    danger: {
      border: 'none',
      background: 'var(--color-danger, #ef4444)',
      color: '#fff',
    },
  };

  return (
    <button
      type="button"
      disabled={disabled}
      className={`common-modal-btn common-modal-btn--${variant}`}
      style={{ ...base, ...variants[variant] }}
      {...rest}
    >
      {children}
      <style>{`
        .common-modal-btn--ghost:hover:not(:disabled) { background: var(--color-surface-hover); }
        .common-modal-btn--primary:hover:not(:disabled),
        .common-modal-btn--danger:hover:not(:disabled) { opacity: 0.85; }
      `}</style>
    </button>
  );
}

export default Modal;
