import { useEffect, useRef } from 'react';
import type { Song } from '../types/playback';
import { getSongMetaBatch } from '../api/client';

// 已尝试过的歌曲（source:id）：请求已发出（无论成败），不再重复尝试
const attemptedKeys = new Set<string>();
// 正在请求中的歌曲：StrictMode 下 effect 会跑两次，用它防止并发重复请求
const inflightKeys = new Set<string>();

// 每批请求的歌曲数：控制请求频率，避免触发 sidecar 限流
const BATCH_SIZE = 20;

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
    const missing = songs.filter(
      (s) => needsEnrichment(s) && !attemptedKeys.has(keyOf(s)) && !inflightKeys.has(keyOf(s))
    );
    if (missing.length === 0) return;

    // 按平台分组
    const groups: Record<string, Song[]> = {};
    for (const s of missing) {
      (groups[s.source as string] ||= []).push(s);
    }

    (async () => {
      for (const server of Object.keys(groups)) {
        const list = groups[server];
        for (let i = 0; i < list.length; i += BATCH_SIZE) {
          const chunk = list.slice(i, i + BATCH_SIZE);
          // 先标记 in-flight，防止 StrictMode 第二次 effect 重复请求
          chunk.forEach((s) => inflightKeys.add(keyOf(s)));
          const patches = await getSongMetaBatch(chunk.map((s) => s.id), server);
          chunk.forEach((s) => {
            inflightKeys.delete(keyOf(s));
            attemptedKeys.add(keyOf(s));
          });
          for (const p of patches) {
            if (p.id) {
              const { id, ...rest } = p;
              onPatchedRef.current(id, rest);
            }
          }
        }
      }
    })().catch(() => {});
  }, [songs]);
}
