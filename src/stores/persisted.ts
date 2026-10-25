/**
 * localStorage 持久化设置的统一实现。
 *
 * 背景：`configStore.ts` 里 18 个设置项各自抄了一遍
 * ```ts
 * xxx: ((): T => { try { const saved = localStorage.getItem(KEY); ... } catch { return DEFAULT; } })(),
 * setXxx: (v) => { localStorage.setItem(KEY, String(v)); set({ xxx: v }); },
 * ```
 * 同一套读写写了 18 遍（外加 playbackStore / searchStore / homeLayoutStore 里更多份），
 * 直接后果不是"难看"，而是行为不一致 + 一类真实 bug：
 *
 * **写入侧全部没有 try/catch。** 只要 `localStorage.setItem` 抛异常
 * （WebView 里配额超限或存储被禁用都会抛 QuotaExceededError / SecurityError），
 * setter 就在 `set(...)` **之前**中断 —— 开关点下去毫无反应，界面上还停着旧值，
 * 且控制台只有一个未捕获的 Promise/事件错误。读取侧却都包了 try/catch，
 * 说明"写会失败"这件事是被意识到过的，只是漏了 18 处。
 *
 * 本模块把读、写、校验、钳制收敛成一处：
 *   - 读失败 / 数据非法 → 一律回落默认值，绝不抛出
 *   - 写失败 → 吞掉异常但**仍然更新内存状态**（本次会话功能正常，只是重启后不保留）
 */

/** 读取并解析一个持久化值；任何异常或校验失败都返回 fallback */
export function readStored<T>(
  key: string,
  fallback: T,
  parse: (raw: string | null) => T,
): T {
  try {
    return parse(localStorage.getItem(key));
  } catch {
    // localStorage 不可用（隐私模式 / 沙箱）或 parse 内部抛错
    return fallback;
  }
}

/**
 * 写入一个持久化值。
 * @returns 是否写入成功（失败不代表状态不该更新，调用方通常仍然 `set`）
 */
export function writeStored(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** 解析枚举：只有落在白名单里才采纳，否则用默认值 */
export function parseEnum<T extends string>(raw: string | null, allowed: readonly T[], fallback: T): T {
  return raw !== null && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

/** 解析布尔：'true' → true，'false' → false，其余 → fallback */
export function parseBool(raw: string | null, fallback: boolean): boolean {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return fallback;
}

/** 解析数值并钳制到 [min, max]；非数字回落 fallback */
export function parseIntClamped(raw: string | null, fallback: number, min: number, max: number): number {
  if (raw === null || raw.trim() === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

/** 解析字符串；null → fallback */
export function parseString(raw: string | null, fallback: string = ''): string {
  return raw ?? fallback;
}

/** 解析 JSON 对象；非法 JSON 或非对象 → fallback */
export function parseJSONObject<T extends object>(raw: string | null, fallback: T): T {
  if (raw === null) return fallback;
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fallback;
  return parsed as T;
}
