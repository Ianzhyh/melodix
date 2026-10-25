/**
 * 唯一 ID 生成。
 *
 * 背景：项目里有四份各自为政的 ID 生成：
 *   - `customLibraryStore`  带特性检测 + `lib-` 前缀兜底
 *   - `downloadStore`       **裸调 `crypto.randomUUID()`，没有任何兜底**
 *   - `toastStore`          `Math.random().toString(36).substring(7)`
 *   - `homeLayoutStore`     `ct-` 前缀 + 另一套兜底
 * 其中 `downloadStore` 那份是真缺陷：`crypto.randomUUID` 只在**安全上下文**
 * （https / localhost / Tauri 的自定义协议）里存在，一旦运行环境不满足，
 * `addTask` 会在构造任务对象时直接抛 `TypeError: crypto.randomUUID is not a function`，
 * 整个下载功能不可用 —— 而它自己的注释还写着"与 downloadStore 一致"。
 * `toastStore` 那份则可能产生空串（`substring(7)` 越界）。
 *
 * 这里统一成一个实现：优先用标准的 `randomUUID`，不可用时退回
 * 时间戳 + 计数器 + 随机段，保证**同一进程内单调且不重复**。
 */

let counter = 0;

/**
 * 生成唯一 id。
 * @param prefix 可选前缀，便于在日志/存储里区分来源（如 'lib'、'ct'）
 */
export function makeId(prefix?: string): string {
  const head = prefix ? `${prefix}-` : '';

  // 优先标准实现（安全上下文下可用）
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${head}${crypto.randomUUID()}`;
  }

  // 兜底：时间戳保证跨会话有序，自增计数器保证同毫秒内不重复，随机段降低碰撞
  counter = (counter + 1) % 0x100000;
  const ts = Date.now().toString(36);
  const seq = counter.toString(36).padStart(4, '0');
  const rand = Math.random().toString(36).slice(2, 8).padEnd(6, '0');
  return `${head}${ts}-${seq}-${rand}`;
}
