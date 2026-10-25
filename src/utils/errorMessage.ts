/**
 * 错误信息的用户可见文案。
 *
 * 背景：项目里 8 处用 `` `xxx失败：${String(err)}` `` 拼错误提示，直接把
 * `Error: 系统找不到指定的文件。 (os error 2)` 这种带 `Error: ` 前缀、
 * 甚至带 Rust/sidecar 内部术语的原文怼给用户，既难读也不像给人看的提示。
 *
 * 这里统一成两档：
 *   - `toUserMessage(err)`        —— 给用户看的短句，剥掉 `Error:` 前缀与堆栈
 *   - `toUserMessage(err, 动作)`  —— 带上"失败原因"的完整提示
 *
 * 刻意**不**做错误码翻译表：本项目错误大多来自 Tauri/IPC 与 sidecar，
 * 文案随平台而变，硬编码映射表比原文更容易误导。这里只做"去掉噪音"。
 */

/** 从任意抛出物里取出可读的原因 */
export function toErrorMessage(err: unknown): string {
  let raw: string;
  if (err instanceof Error) {
    raw = err.message || err.name || '';
  } else if (typeof err === 'string') {
    raw = err;
  } else if (err && typeof err === 'object' && 'message' in err) {
    raw = String((err as { message: unknown }).message ?? '');
  } else {
    raw = String(err ?? '');
  }

  // 剥掉重复的 `Error: ` / `TypeError: ` 之类前缀（可能叠加多层）
  raw = raw.replace(/^(\w*Error:\s*)+/i, '');

  // 只保留第一行：堆栈对用户毫无意义，且会撑爆 toast 宽度
  raw = raw.split('\n')[0].trim();

  // 空消息（有些 IPC 拒绝只给一个空 Error）给一句兜底
  if (!raw || raw === 'undefined' || raw === 'null') return '未知错误';

  // 过长的原文截断，避免一条提示占满整行
  const MAX = 120;
  return raw.length > MAX ? `${raw.slice(0, MAX - 1)}…` : raw;
}

/**
 * 拼一句"动作失败：原因"。
 * @param action 动作名，例如 '导入文件'
 */
export function toUserMessage(err: unknown, action?: string): string {
  const reason = toErrorMessage(err);
  return action ? `${action}失败：${reason}` : reason;
}
