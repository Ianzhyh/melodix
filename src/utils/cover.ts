import { getProxyImageUrl, getProxiedCoverUrl } from '../api/client';
import { convertFileSrc } from '@tauri-apps/api/core';
import type { UserLibrary } from '../stores/customLibraryStore';

export function getSongCoverUrl(
  song: { cover?: string; picId?: string | number; id?: string | number; source?: string; albumMid?: string; picUrl?: string; isLocal?: boolean },
  size: number = 200
): string {
  // Priority 1: Direct cover URL
  if (song.cover) {
    if (song.cover.startsWith('http')) {
      return getProxyImageUrl(song.cover);
    }
    // 本地歌曲：cover 是本地文件绝对路径，需通过 convertFileSrc 转换为可显示 URL
    if (song.isLocal) {
      return convertFileSrc(song.cover);
    }
    return song.cover;
  }
  // 本地歌曲没有内嵌封面时直接返回空：
  // 此前会落入 Priority 2，用本地数据库自增 id 去请求 /pic?server=tencent&id=<本地id>，
  // 产生无意义的 404 封面请求和占位闪烁
  if (song.isLocal) {
    return '';
  }
  // Priority 2: picId/albumMid → API proxy
  if (song.picId || song.id) {
    return getProxiedCoverUrl(
      String(song.picId || song.id),
      song.source || 'tencent',
      size
    );
  }
  // Priority 3: picUrl as standalone string
  if (song.picUrl) {
    if (song.picUrl.startsWith('http')) {
      return getProxyImageUrl(song.picUrl);
    }
    return song.picUrl;
  }
  return '';
}

/**
 * 音乐库封面解析：
 * 1. 自定义封面（图片文件绝对路径 → convertFileSrc；http(s) URL → 代理包装）；
 * 2. 未设置时回落到第一首歌的封面；
 * 3. 没有任何歌曲时返回空字符串，由调用方渲染默认占位（渐变 + 图标）。
 */
export function getLibraryCoverUrl(lib: UserLibrary, size: number = 300): string {
  if (lib.cover) {
    if (lib.cover.startsWith('http')) {
      return getProxyImageUrl(lib.cover);
    }
    return convertFileSrc(lib.cover);
  }
  if (lib.songs.length > 0) {
    return getSongCoverUrl(lib.songs[0], size);
  }
  return '';
}
