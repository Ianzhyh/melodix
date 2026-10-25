import { motion, AnimatePresence } from 'framer-motion';
import { useToastStore } from '../stores/toastStore';

const ICONS = {
  success: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-success, #10b981)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  error: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-danger, #ef4444)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  ),
  info: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary, #6366f1)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  ),
} as const;

/** 进度条时长需与 toastStore 保持一致（成功/信息 3s，错误 5s） */
const BAR_DURATION = { success: 3, error: 5, info: 3 } as const;

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  return (
    <div
      // 屏幕阅读器播报：断言式（assertive）留给错误，其余用 polite。
      // 原来只是一个普通 div，读屏用户完全感知不到操作结果。
      role="status"
      aria-live="polite"
      aria-atomic="false"
      style={{
        position: 'fixed',
        bottom: 100, // Above player bar
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 'var(--z-toast)',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        pointerEvents: 'none',
      }}
    >
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            role={toast.type === 'error' ? 'alert' : undefined}
            aria-live={toast.type === 'error' ? 'assertive' : undefined}
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            style={{
              position: 'relative',
              overflow: 'hidden',
              background: 'var(--glass-bg)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid var(--glass-border)',
              padding: '10px 20px 11px',
              borderRadius: 24,
              color: 'var(--color-text)',
              fontSize: 14,
              fontWeight: 500,
              boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              pointerEvents: 'auto',
              cursor: 'pointer',
            }}
            onClick={() => removeToast(toast.id)}
            title="点击关闭"
          >
            {ICONS[toast.type]}
            {toast.message}

            {/* 剩余时间指示：没有它的话用户不知道这条会自己消失还是卡住了 */}
            <motion.div
              aria-hidden="true"
              initial={{ scaleX: 1 }}
              animate={{ scaleX: 0 }}
              transition={{ duration: BAR_DURATION[toast.type], ease: 'linear' }}
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                height: 2,
                transformOrigin: 'left center',
                background:
                  toast.type === 'error'
                    ? 'var(--color-danger, #ef4444)'
                    : toast.type === 'success'
                      ? 'var(--color-success, #10b981)'
                      : 'var(--color-primary, #6366f1)',
                opacity: 0.5,
              }}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
