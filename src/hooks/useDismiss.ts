import { useEffect, type RefObject } from 'react';

export interface UseDismissOptions {
  /** 是否同时响应全局 Escape 广播（App.tsx 派发的 melodix-close-popups），默认 true */
  escape?: boolean;
  /** 外部点击监听的事件类型，默认 'mousedown'（比 click 更早，避免与内部点击冲突） */
  event?: 'mousedown' | 'pointerdown' | 'click';
  /** 额外需要视为"内部"的元素（例如通过 portal 渲染到 body 的菜单） */
  extraRefs?: Array<RefObject<HTMLElement | null>>;
}

/**
 * 「点击外部关闭 + Escape 关闭」的统一实现。
 *
 * 背景：这段逻辑在项目里被抄了 17 遍 —— Modal、FavoritesPage、PlaylistView、
 * CustomLibraryPage、PlayerBar、SleepTimer、VolumeControl、SettingsPage、
 * EditMode、TrackInfo 各写一份。抄写过程中已经产生了行为分叉：
 *
 *   - 只有 CustomLibraryPage 与 PlayerBar 带了 `if (!open) return` 早退，
 *     其余无条件挂监听 —— 面板关闭后仍常驻一个文档级 mousedown 监听，
 *     每次 render 都要注册/注销一次；
 *   - `SettingsPage` 那份连 open 守卫都没有，关闭后监听常驻；
 *   - 有的听 `mousedown`、有的听 `click`，导致"拖选文本"和"点击菜单项"
 *     在某些面板里会意外触发关闭，另一些不会。
 *
 * 全部收敛到这里，默认行为与既有正确实现（EditMode.useDismiss）保持一致。
 *
 * @param open 浮层是否打开（为 false 时不挂任何监听）
 * @param ref 浮层根节点
 * @param onClose 关闭回调
 */
export function useDismiss(
  open: boolean,
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
  options: UseDismissOptions = {},
) {
  const { escape = true, event = 'mousedown', extraRefs } = options;

  useEffect(() => {
    if (!open) return;

    const onDoc = (e: MouseEvent) => {
      const target = e.target;
      if (!(target instanceof Node)) return;
      const roots = [ref, ...(extraRefs ?? [])];
      // 只要落在任意一个"内部"容器里就不关闭
      for (const r of roots) {
        const el = r.current;
        if (el && el.contains(target)) return;
      }
      onClose();
    };

    document.addEventListener(event, onDoc);

    let offEscape: (() => void) | undefined;
    if (escape) {
      // 走全局广播而不是各自的 keydown，保证 Escape 的分层关闭顺序由 App.tsx 统一决定
      const onEscape = () => onClose();
      window.addEventListener('melodix-close-popups', onEscape);
      offEscape = () => window.removeEventListener('melodix-close-popups', onEscape);
    }

    return () => {
      document.removeEventListener(event, onDoc);
      offEscape?.();
    };
    // extraRefs 是数组字面量时每次 render 都是新引用；用长度+首元素稳定依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ref, onClose, escape, event]);
}

export default useDismiss;
