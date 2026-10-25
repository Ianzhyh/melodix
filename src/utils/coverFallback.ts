import type { SyntheticEvent } from 'react';

/**
 * 1×1 全透明 PNG 占位图。
 *
 * 用途：封面 `<img>` 加载失败时的兜底 src。
 *
 * 为什么不能再用 `display: none`：
 * 封面 `<img>` 常常是 **grid 项**（如 TrackList 的 `40px 40px 1fr …` 模板）或
 * **flex 项**（如队列行、搜索结果行）。`display:none` 会把该元素移出布局，
 * 于是它后面的所有内容整体前移：
 *   - TrackRow（grid）：标题列 x 390→336（-54px）、专辑列 777→390（-387px）、
 *     时长列 1164→777（-387px），标题单元格由 373px 塌成 40px，歌名被截成一个字；
 *   - QueuePanel（flex）：标题整体左移 50px（封面 40px + gap 10px）。
 * 任何封面 404/502（过期 picId 走 `/pic?...`、封面死链）都会触发，属于常见路径。
 *
 * 换成透明 data URI 后元素仍在文档流中、仍占住原来的轨道/间距位，
 * 并且保留调用方自己的占位底色（`background: var(--color-img-placeholder)` 等）。
 */
export const COVER_PLACEHOLDER =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/**
 * 封面 `<img>` 的 onError 处理器：加载失败时回落到透明占位图，**保持元素占位**。
 *
 * 判重方式用「当前 src 是否已是占位图」而不是一次性 dataset 标记：
 * 歌曲变化后 React 会写入新的封面 URL，此时若新封面同样失败，仍能再次回落。
 */
export function onCoverError(e: SyntheticEvent<HTMLImageElement>): void {
  const el = e.currentTarget;
  if (el.getAttribute('src') !== COVER_PLACEHOLDER) {
    el.src = COVER_PLACEHOLDER;
  }
}
