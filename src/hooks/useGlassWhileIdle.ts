import { useEffect, useState } from 'react';

/**
 * 弹窗玻璃的「动画期间不开模糊」开关。
 *
 * 背景：项目原先给弹窗去掉 `backdrop-filter` 是**有意的性能取舍**，原注释写着
 * 「遮罩透明度动画期间每帧对整屏重采样模糊是首帧卡顿的主因之一」。但代价是弹窗
 * 完全没有玻璃感（卡片是 `rgb(10,10,11)` 全不透明），与 DESIGN-REVIEW.md §5.1
 * 把弹窗定义为 Heavy 玻璃的规格不符。
 *
 * 解法是把这个取舍**从"永久关闭"改成"按时间分阶段"**：
 *   - 入场动画期间：不开模糊（此时每一帧都在做透明度/位移动画，重采样最贵）
 *   - 动画结束后：开启模糊（静态画面，模糊只算一次，观感拉满）
 *   - 退场时：立即关闭（退出动画同样是逐帧的）
 *
 * 实现注意：这里用 `useState` + `setTimeout` 而不是 `onAnimationComplete`，
 * 因为弹窗可能由 CSS transition / AnimatePresence 驱动，回调不一定触发；
 * 固定延时更可靠，且与 framer-motion 的入场时长解耦。
 *
 * @param isOpen 弹窗是否打开
 * @param delayMs 入场动画结束后再开模糊的等待时间（默认 220ms，略大于常见入场时长）
 * @returns 是否应该在卡片上启用 backdrop-filter
 */
export function useGlassWhileIdle(isOpen: boolean, delayMs: number = 220): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      // 关闭（或退场中）：立刻关掉模糊，避免退出动画逐帧重采样
      setEnabled(false);
      return;
    }
    const t = setTimeout(() => setEnabled(true), delayMs);
    return () => clearTimeout(t);
  }, [isOpen, delayMs]);

  return enabled;
}
