import { motion, AnimatePresence } from 'framer-motion';
import { useUIStore } from '../stores/uiStore';
import { useDownloadStore, type DownloadStatus, type DownloadTask } from '../stores/downloadStore';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i];
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec <= 0) return '';
  return formatBytes(bytesPerSec) + '/s';
}

const STATUS_META: Record<DownloadStatus, { label: string; color: string; bg: string }> = {
  pending: { label: '等待中', color: 'var(--color-text-dim)', bg: 'var(--color-surface-hover)' },
  downloading: { label: '下载中', color: 'var(--color-primary)', bg: 'rgba(99,102,241,0.12)' },
  paused: { label: '已暂停', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  completed: { label: '已完成', color: 'var(--color-success)', bg: 'rgba(16,185,129,0.12)' },
  failed: { label: '失败', color: 'var(--color-danger)', bg: 'rgba(239,68,68,0.12)' },
  canceled: { label: '已取消', color: 'var(--color-text-faint)', bg: 'var(--color-surface-hover)' },
};

function StatusBadge({ status }: { status: DownloadStatus }) {
  const meta = STATUS_META[status];
  return (
    <span style={{
      fontSize: 10,
      fontWeight: 600,
      padding: '2px 8px',
      borderRadius: 9999,
      color: meta.color,
      background: meta.bg,
      whiteSpace: 'nowrap',
      flexShrink: 0,
    }}>
      {meta.label}
    </span>
  );
}

function IconButton({
  title,
  onClick,
  children,
  danger,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <motion.button
      title={title}
      aria-label={title}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      onClick={onClick}
      style={{
        width: 26,
        height: 26,
        borderRadius: 7,
        border: '1px solid var(--color-border)',
        background: 'var(--color-surface-hover)',
        color: danger ? 'var(--color-danger)' : 'var(--color-text-dim)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'color 0.2s, background 0.2s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--color-surface-active)';
        if (!danger) e.currentTarget.style.color = 'var(--color-text)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'var(--color-surface-hover)';
        if (!danger) e.currentTarget.style.color = 'var(--color-text-dim)';
      }}
    >
      {children}
    </motion.button>
  );
}

function TaskRow({ task, index }: { task: DownloadTask; index: number }) {
  const { pauseTask, resumeTask, cancelTask, retryTask, moveTaskUp, moveTaskDown } = useDownloadStore();
  const meta = STATUS_META[task.status];
  const showProgress = task.status !== 'completed' && task.status !== 'canceled';
  const showSpeed = task.status === 'downloading' && task.speed > 0;
  const canMove = task.status === 'pending' || task.status === 'paused';

  return (
    <motion.div
      key={task.id}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ delay: Math.min(index, 15) * 0.03 }}
      style={{
        padding: '10px 12px',
        borderRadius: 10,
        background: 'var(--color-surface-hover)',
        border: '1px solid var(--color-border)',
        marginBottom: 6,
      }}
    >
      {/* 顶部行：文件名 + 状态徽标 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={{
          flex: 1,
          fontSize: 13,
          fontWeight: 500,
          color: 'var(--color-text)',
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis',
          overflow: 'hidden',
        }}>
          {task.song.name}
        </div>
        <StatusBadge status={task.status} />
      </div>

      {/* 进度条 */}
      {showProgress && (
        <div style={{
          height: 4,
          borderRadius: 9999,
          background: 'var(--color-border)',
          overflow: 'hidden',
          marginBottom: 6,
        }}>
          <motion.div
            initial={false}
            animate={{ width: `${task.progress}%` }}
            transition={{ duration: 0.2 }}
            style={{
              height: '100%',
              borderRadius: 9999,
              background: meta.color,
            }}
          />
        </div>
      )}

      {/* 进度文本 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        fontSize: 11,
        color: 'var(--color-text-faint)',
      }}>
        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {task.total > 0
            ? `${formatBytes(task.downloaded)} / ${formatBytes(task.total)}`
            : task.downloaded > 0
              ? formatBytes(task.downloaded)
              : '—'}
          <span style={{ margin: '0 6px' }}>·</span>
          {task.progress.toFixed(1)}%
          {showSpeed && (
            <>
              <span style={{ margin: '0 6px' }}>·</span>
              {formatSpeed(task.speed)}
            </>
          )}
        </div>

        {/* 操作按钮 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          {task.status === 'pending' && (
            <IconButton title="取消" onClick={() => cancelTask(task.id)} danger>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </IconButton>
          )}
          {task.status === 'downloading' && (
            <IconButton title="暂停" onClick={() => pauseTask(task.id)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            </IconButton>
          )}
          {task.status === 'paused' && (
            <>
              <IconButton title="继续" onClick={() => resumeTask(task.id)}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </IconButton>
              <IconButton title="取消" onClick={() => cancelTask(task.id)} danger>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </IconButton>
            </>
          )}
          {task.status === 'failed' && (
            <>
              <IconButton title="重试" onClick={() => retryTask(task.id)}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
              </IconButton>
              <IconButton title="取消" onClick={() => cancelTask(task.id)} danger>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </IconButton>
            </>
          )}
          {canMove && (
            <>
              <IconButton title="上移" onClick={() => moveTaskUp(task.id)}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="18 15 12 9 6 15" />
                </svg>
              </IconButton>
              <IconButton title="下移" onClick={() => moveTaskDown(task.id)}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </IconButton>
            </>
          )}
        </div>
      </div>

      {/* 失败错误信息 */}
      {task.status === 'failed' && task.error && (
        <div style={{
          marginTop: 6,
          fontSize: 11,
          color: 'var(--color-danger)',
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis',
          overflow: 'hidden',
        }}>
          {task.error}
        </div>
      )}
    </motion.div>
  );
}

export function DownloadPanel() {
  const isOpen = useUIStore((s) => s.downloadPanelOpen);
  const setOpen = useUIStore((s) => s.setDownloadPanelOpen);
  const tasks = useDownloadStore((s) => s.tasks);
  const clearCompleted = useDownloadStore((s) => s.clearCompleted);

  const hasCompleted = tasks.some((t) => t.status === 'completed');

  const close = () => setOpen(false);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* 背景遮罩 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={close}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.4)',
              zIndex: 'var(--z-overlay)',
            }}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="下载列表"
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 260 }}
            style={{
              position: 'fixed',
              top: 'var(--titlebar-height, 40px)',
              right: 0,
              bottom: 'var(--player-bar-height, 88px)',
              width: 360,
              background: 'var(--glass-bg)',
              backdropFilter: 'var(--glass-blur) var(--glass-saturate)',
              WebkitBackdropFilter: 'var(--glass-blur) var(--glass-saturate)',
              borderLeft: '1px solid var(--glass-border)',
              zIndex: 'var(--z-modal)',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '-8px 0 40px rgba(0,0,0,0.15)',
              borderTopLeftRadius: 16,
              borderBottomLeftRadius: 16,
              transform: 'translateZ(0)',
            }}
          >
            {/* Header */}
            <div style={{
              padding: '20px 24px 14px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderBottom: '1px solid var(--color-border)',
              flexShrink: 0,
            }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: 'var(--color-text)', letterSpacing: 0.3 }}>
                下载列表
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {hasCompleted && (
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={clearCompleted}
                    style={{
                      background: 'var(--color-surface-hover)',
                      border: '1px solid var(--color-border)',
                      color: 'var(--color-text-faint)',
                      cursor: 'pointer',
                      fontSize: 12,
                      padding: '5px 12px',
                      borderRadius: 8,
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = 'var(--color-text)';
                      e.currentTarget.style.background = 'var(--color-surface-active)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = 'var(--color-text-faint)';
                      e.currentTarget.style.background = 'var(--color-surface-hover)';
                    }}
                  >
                    清空已完成
                  </motion.button>
                )}
                <motion.button
                  whileHover={{ scale: 1.1, rotate: 90 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={close}
                  aria-label="关闭"
                  style={{
                    background: 'var(--color-surface-hover)',
                    border: 'none',
                    color: 'var(--color-icon)',
                    cursor: 'pointer',
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </motion.button>
              </div>
            </div>

            {/* 任务列表 */}
            <div style={{ flex: 1, padding: '8px 12px', overflowY: 'auto', overflowX: 'hidden' }}>
              {tasks.length === 0 ? (
                <div style={{
                  textAlign: 'center',
                  padding: '40px 20px',
                  color: 'var(--color-text-faint)',
                  fontSize: 14,
                }}>
                  暂无下载任务
                </div>
              ) : (
                <AnimatePresence>
                  {tasks.map((task, i) => (
                    <TaskRow key={task.id} task={task} index={i} />
                  ))}
                </AnimatePresence>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
