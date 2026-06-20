import { motion, AnimatePresence } from 'framer-motion';
import { useToastStore } from '../stores/toastStore';

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  return (
    <div style={{
      position: 'fixed',
      bottom: 100, // Above player bar
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 'var(--z-toast)',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      pointerEvents: 'none',
    }}>
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            style={{
              background: 'var(--glass-bg)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid var(--glass-border)',
              padding: '10px 20px',
              borderRadius: 24,
              color: 'var(--color-text)',
              fontSize: 14,
              fontWeight: 500,
              boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              pointerEvents: 'auto',
            }}
            onClick={() => removeToast(toast.id)}
          >
            {toast.type === 'success' && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-success, #10b981)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
            {toast.type === 'error' && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-danger, #ef4444)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>}
            {toast.type === 'info' && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary, #6366f1)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>}
            {toast.message}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
