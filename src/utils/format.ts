/**
 * 时间 / 时长格式化。
 *
 * 背景：项目里同一件事写了两套以上，且**文案已经不一致**：
 *
 *   - `HistoryPage.formatRelativeTime`：7 天后切 `toLocaleDateString('zh-CN')`，
 *     没有"个月/年"档；
 *   - `CommentPanel.formatRelativeTime`：有"个月/年"，但永远不显示具体日期。
 *
 * 于是同一个时间戳，在「最近播放」里显示 `2026/6/1`，在「评论」里显示 `4 个月前`。
 * 这里统一成一套：短期用相对时间（更好读），超过 30 天用绝对日期
 * （相对时间到"几个月前"这个粒度就失去意义了）。
 *
 * 另：`formatDuration`（PlaylistView）/ `fmtDuration`（CustomLibraryPage）输出完全相同；
 * `SleepTimer.formatRemaining` 又手写了一遍 mm:ss 且**没有 NaN / Infinity 守卫**，
 * 而 `api/client.formatTime` 有 —— 这里统一并保留守卫。
 */

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

export interface RelativeTimeOptions {
  /**
   * 超过这个天数改用绝对日期，默认 30。
   * 设为 Infinity 则一直用相对时间（会显示"N 个月前 / N 年前"）。
   */
  absoluteAfterDays?: number;
}

/**
 * 相对时间：刚刚 / N 分钟前 / N 小时前 / N 天前 / 具体日期。
 * @param ts 毫秒时间戳
 */
export function formatRelativeTime(ts: number, options: RelativeTimeOptions = {}): string {
  const { absoluteAfterDays = 30 } = options;

  if (!Number.isFinite(ts) || ts <= 0) return '';

  const diff = Date.now() - ts;

  // 未来时间（时钟不同步 / 服务端时间偏快）按"刚刚"处理，避免出现"-3 分钟前"
  if (diff < MINUTE) return '刚刚';

  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} 分钟前`;

  if (diff < DAY) return `${Math.floor(diff / HOUR)} 小时前`;

  const days = Math.floor(diff / DAY);
  if (days <= absoluteAfterDays) return `${days} 天前`;

  // 超过阈值：用绝对日期（跨年时带上年份）
  const date = new Date(ts);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return sameYear
    ? `${date.getMonth() + 1}月${date.getDate()}日`
    : `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

/**
 * 时长（秒 → 中文概述），用于歌单元信息，如 `62 分钟`。
 * 0 / 非法值返回空串，调用方据此决定是否渲染。
 */
export function formatMinutes(seconds: number | null | undefined): string {
  if (!Number.isFinite(seconds as number) || (seconds as number) <= 0) return '';
  return `${Math.floor((seconds as number) / 60)} 分钟`;
}

/**
 * 时钟格式 mm:ss（超过 1 小时则 h:mm:ss）。
 * 带 NaN / Infinity / 负数守卫 —— 这也是 `SleepTimer` 那份手写实现缺的。
 */
export function formatClock(seconds: number | null | undefined): string {
  const s = seconds;
  if (!Number.isFinite(s as number) || (s as number) < 0) return '00:00';

  const total = Math.floor(s as number);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  const mm = String(mins).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');
  return hrs > 0 ? `${hrs}:${mm}:${ss}` : `${mm}:${ss}`;
}
