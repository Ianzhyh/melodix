import { getProxyImageUrl, getProxiedCoverUrl } from '../api/client';
import { convertFileSrc } from '@tauri-apps/api/core';

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
