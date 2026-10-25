import { useEffect, useRef } from 'react';
import type { Song } from '../types/playback';
import { getSongMetaBatch } from '../api/client';

// 已尝试过的歌曲（source:id）：请求【发出前】就写入，无论成败都不再重复尝试（失败不重试）。
// 写入时机是本文件的核心不变量，见下方 useSongEnrichment 的注释。
const attemptedKeys = new Set<string>();

// 每批请求的歌曲数：控制请求频率，避免触发 sidecar 限流
const BATCH_SIZE = 20;

// 相邻两批之间的间隔：把「一次性并发全部批次」摊平成平滑序列。
// sidecar 限流是 120 req/min 且按 IP 全应用共用，这里按 ~2 req/s 发送：
// 620 首 = 31 批 → 约 17s 补完，既给用户正常浏览留下充足预算，
// 也不会像早期 40ms 间隔那样瞬时 21.5 req/s（一次突发吃掉 1/4 分钟预算，
// 一旦窗口内已有其它请求就整批 429，而失败不重试 → 这批歌本次运行内补不全）。
const BATCH_INTERVAL_MS = 250; // 配合 BATCH_SIZE=20 → 平均约 2 req/s

const keyOf = (s: Song) => `${s.source}:${s.id}`;

const needsEnrichment = (s: Song) => {
  if (!s || !s.id || s.isLocal) return false;
  if (s.source !== 'tencent' && s.source !== 'netease') return false;
  if (s.albumId && s.artists && s.artists.length > 0) return false;
  return true;
};

/**
 * 老数据补全：对缺失 albumId / artists 的在线歌曲（tencent/netease），
 * 按平台分批静默拉取单曲元信息并通过 onPatched 回调写回存储。
 * 补全成功后歌曲对象被持久化，下次启动不再需要请求；失败静默跳过且不重试。
 *
 * StrictMode 去重（本文件的关键不变量）：
 * React StrictMode 下 effect 会 mount → cleanup → mount 跑两次。旧实现把
 * 「已尝试」标记写在 `await` 返回之后，于是第二次 effect 在第一批还没回来时
 * 看到的仍是「未尝试」，620 首被整轮调度两遍 —— 实测 25s 内发出 61 次
 * `/tencent/song`（应为 31 次）并触发 7 个 429。
 * 现在**在 effect 体内、await 之前就同步把全部 key 写进 attemptedKeys**，
 * 第二次 effect 必然看到所有 key 已被占用而直接返回，彻底消除双发；
 * 真正的请求再按 BATCH_INTERVAL_MS 分批推进，避免瞬时并发尖峰。
 *
 * 注意：不做 effect 取消（unmount 后写 store 是安全的），否则 StrictMode
 * 的 mount→cleanup→mount 流程会把请求标记为已尝试却拿不到结果。
 */
export function useSongEnrichment(
  songs: Song[],
  onPatched: (songId: string, patch: Partial<Song>) => void
): void {
  const onPatchedRef = useRef(onPatched);
  onPatchedRef.current = onPatched;

  useEffect(() => {
    const missing = songs.filter((s) => needsEnrichment(s) && !attemptedKeys.has(keyOf(s)));
    if (missing.length === 0) return;

    // 按平台分组（对齐 getSongMetaBatch 的 server 参数）后按 BATCH_SIZE 切块
    const batches: { server: string; chunk: Song[] }[] = [];
    const groups: Record<string, Song[]> = {};
    for (const s of missing) {
      (groups[s.source as string] ||= []).push(s);
    }
    for (const server of Object.keys(groups)) {
      const list = groups[server];
      for (let i = 0; i < list.length; i += BATCH_SIZE) {
        batches.push({ server, chunk: list.slice(i, i + BATCH_SIZE) });
      }
    }

    // 【关键】同步占位：await 之前就把本次要发的全部 key 标记为「已尝试」。
    // 这样 StrictMode 的第二次 effect 一定看到空 missing 而不再发请求；
    // 后续无论成功失败都不再重发（失败不重试）。
    for (const { chunk } of batches) {
      for (const s of chunk) attemptedKeys.add(keyOf(s));
    }

    void (async () => {
      for (let i = 0; i < batches.length; i++) {
        const { server, chunk } = batches[i];
        // 批次之间让出事件循环并留出间隔：把 31 次请求摊平成平滑序列，不做瞬时齐发
        if (i > 0) await new Promise((r) => setTimeout(r, BATCH_INTERVAL_MS));
        const patches = await getSongMetaBatch(chunk.map((s) => s.id), server);
        for (const p of patches) {
          if (p.id) {
            const { id, ...rest } = p;
            onPatchedRef.current(id, rest);
          }
        }
      }
    })().catch(() => {});
  }, [songs]);
}
