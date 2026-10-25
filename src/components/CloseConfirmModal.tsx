import { useState } from 'react';
import { useConfigStore } from '../stores/configStore';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { Modal, ModalButton } from './common/Modal';

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
      invoke('exit_app');
    }
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="关闭提示"
      // 注意：这里必须是纯色遮罩。原实现给遮罩加了 backdropFilter: 'blur(8px)'，
      // 而这是本项目其它四处弹窗都已经改掉的写法 —— 全屏模糊在透明度动画期间
      // 每帧对整屏重采样，是弹窗首帧卡顿的主因。改走 Modal 后自动得到纯色遮罩。
      aria-label="关闭确认"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 8 }}>
          <ModalButton onClick={onClose}>取消</ModalButton>
          <ModalButton variant="primary" onClick={() => handleAction('minimize')}>
            最小化到托盘
          </ModalButton>
          <ModalButton variant="danger" onClick={() => handleAction('exit')}>
            直接退出
          </ModalButton>
        </div>
      }
    >
      <p style={{ margin: 0, fontSize: 14, color: 'var(--color-text-dim)', lineHeight: 1.5 }}>
        您想要最小化到系统托盘，还是直接退出应用？
      </p>

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
    </Modal>
  );
}
