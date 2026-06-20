export interface Song {
  id: string;
  name: string;
  artist: string;
  album: string;
  cover: string;       // Cover image URL
  picId?: string;      // Album mid for cover image API
  songId?: string;     // Numeric song ID (for QQ Music comment API)
  duration?: number;   // Duration in seconds
  source?: string;     // e.g., 'tencent'
  filePath?: string;   // 本地文件绝对路径
  isLocal?: boolean;   // 是否本地音乐
  format?: string;     // 音频格式（mp3/flac/wav/aac/ogg）
  lyrics?: string;        // LRC 歌词文本（本地歌曲补齐后存储）
  onlineSource?: string;  // 在线源（如 netease）
}

export interface WordInfo {
  text: string;
  start: number;       // relative start time in seconds
  duration: number;    // duration in seconds
}

export interface LyricLine {
  time: number;        // start time in seconds
  duration: number;    // duration in seconds
  text: string;
  words: WordInfo[];
  translation?: string; // 翻译歌词文本
}

export interface RouteState {
  page: string;
  id?: string;
  source?: string;
}

export type RepeatMode = 'off' | 'all' | 'one';

export interface Playlist {
  id: string;
  name: string;
  cover: string;
  description?: string;
  trackCount?: number;
  source?: string;
  tracks?: Song[];
}

export interface SearchResult {
  songs: Song[];
  total?: number;
  page?: number;
}

export interface PlaylistDetail {
  id: string;
  name: string;
  cover: string;
  description?: string;
  trackCount: number;
  tracks: Song[];
  source: string;
  page?: number;
  limit?: number;
  total?: number;
}

export interface LyricChar {
  c: string;   // character
  t: number;   // start time in seconds
  d: number;   // duration in seconds
}

export interface LyricLineRaw {
  time: number;
  chars: LyricChar[];
}

export interface LyricResult {
  success?: boolean;
  lyrics?: LyricLineRaw[];
  data?: any;
  lyric?: string;
  lrc?: string;
  trans?: string;      // LRC 格式翻译歌词
}
