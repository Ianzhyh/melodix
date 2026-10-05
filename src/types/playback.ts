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
  albumId?: string;       // 专辑 ID（专辑详情页跳转）
  artists?: ArtistRef[];  // 歌手 ID 列表（歌手页跳转）
}

export interface ArtistRef {
  id: string;
  name: string;
}

export interface AlbumDetail {
  id: string;
  name: string;
  cover: string;
  artist: string;
  artistId?: string;
  date?: string;
  company?: string;
  desc?: string;
  tracks: Song[];
  source: string;
}

export interface ArtistDetail {
  id: string;
  name: string;
  cover: string;
  desc?: string;
  songs: Song[];
  albums?: { id: string; name: string; cover: string; date?: string }[];
  source: string;
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
  name?: string;   // 详情页展示用兜底名称（点击入口携带）
  cover?: string;  // 详情页展示用兜底封面
  keyword?: string; // 搜索关键词（主页搜索框跳转发现页时携带）
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

export interface SearchArtistItem {
  id: string;
  name: string;
  pic: string;
  songCount?: number;
  albumCount?: number;
}

export interface SearchAlbumItem {
  id: string;
  name: string;
  cover: string;
  artist: string;
  artistId?: string;
  date?: string;
  songCount?: number;
}

export interface SearchPlaylistItem {
  id: string;
  name: string;
  cover: string;
  trackCount?: number;
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
