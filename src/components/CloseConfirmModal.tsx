import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useConfigStore } from '../stores/configStore';
import { getCurrentWindow } from '@tauri-apps/api/window';

interface CloseConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CloseConfirmModal({ isOpen, onClose }: CloseConfirmModalProps) {
  const setCloseAction = useConfigStore((state) => state.setCloseAction);
  const [remember, setRemember] = useState(false);

  const handleAction = async (action: 'minimize' | 'exit') => {
    if (remember) {
      setCloseAction(action);
    }
    onClose();
    if (action === 'minimize') {
      await getCurrentWindow().setSkipTaskbar(true);
      await getCurrentWindow().hide();
    } else {
      await getCurrentWindow().destroy();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.4)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
            }}
          />

          {/* Modal content */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2, type: 'spring', damping: 25, stiffness: 300 }}
            style={{
              position: 'relative',
              width: 400,
              maxWidth: '90%',
              background: 'var(--color-bg-elevated, rgba(30,30,30,0.85))',
              backdropFilter: 'blur(20px)',
              border: '1px solid var(--glass-border, rgba(255,255,255,0.1))',
              borderRadius: 16,
              padding: 24,
              boxShadow: '0 24px 48px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.05) inset',
              color: 'var(--color-text)',
              display: 'flex',
              flexDirection: 'column',
              gap: 20,
            }}
          >
            <div>
              <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 600 }}>关闭提示</h2>
              <p style={{ margin: 0, fontSize: 14, color: 'var(--color-text-dim)', lineHeight: 1.5 }}>
                您想要最小化到系统托盘，还是直接退出应用？
              </p>
            </div>

            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 13,
              color: 'var(--color-text-dim)',
              cursor: 'pointer',
              userSelect: 'none',
            }}>
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                style={{ cursor: 'pointer', accentColor: 'var(--color-primary)' }}
              />
              记住我的选择，不再询问
            </label>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 8 }}>
              <button
                onClick={onClose}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: '1px solid var(--color-border)',
                  background: 'transparent',
                  color: 'var(--color-text)',
                  fontSize: 13,
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-surface-hover)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                取消
              </button>
              <button
                onClick={() => handleAction('minimize')}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: '1px solid var(--color-primary)',
                  background: 'color-mix(in srgb, var(--color-primary) 15%, transparent)',
                  color: 'var(--color-primary)',
                  fontSize: 13,
                  cursor: 'pointer',
                  fontWeight: 500,
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'color-mix(in srgb, var(--color-primary) 25%, transparent)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'color-mix(in srgb, var(--color-primary) 15%, transparent)'}
              >
                最小化到托盘
              </button>
              <button
                onClick={() => handleAction('exit')}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: 'none',
                  background: 'var(--color-danger, #ef4444)',
                  color: '#fff',
                  fontSize: 13,
                  cursor: 'pointer',
                  fontWeight: 500,
                  transition: 'opacity 0.2s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.opacity = '0.8'}
                onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
              >
                直接退出
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
