# Tasks

- [x] Task 1: 安装前端依赖 crypto-js、pako 及类型声明
  - [x] SubTask 1.1: `npm install crypto-js pako` + `npm install -D @types/crypto-js @types/pako`
  - [x] SubTask 1.2: 验证 package.json 中依赖已正确添加

- [x] Task 2: 创建 src/utils/qrcDecoder.ts
  - [x] SubTask 2.1: 实现 `decodeQRC(base64: string): LyricLine[]` — CryptoJS Triple DES EDE3-ECB 解密
  - [x] SubTask 2.2: 实现 pako inflateRaw 解压
  - [x] SubTask 2.3: 实现 `parseQrcXml(xml: string): LyricLine[]` — XML 解析为 LyricLine[]（含逐字时间戳）
  - [x] SubTask 2.4: 处理边界情况（空输入、解密失败返回空数组）

- [x] Task 3: 扩展 playbackStore 歌词状态
  - [x] SubTask 3.1: 添加 `lyrics: LyricLine[]`、`activeLine: number` 状态
  - [x] SubTask 3.2: 添加 `setLyrics`、`setActiveLine` actions
  - [x] SubTask 3.3: 在 `setCurrent` / `next` / `prev` 时重置 lyrics 和 activeLine

- [x] Task 4: 创建 src/components/LyricsView.tsx
  - [x] SubTask 4.1: 歌词列表渲染，当前行高亮（字体放大、主题色、其余行半透明）
  - [x] SubTask 4.2: 当前行自动滚动到可视区域中心
  - [x] SubTask 4.3: 逐字进度动画（基于 words 时间戳的渐进填充效果）
  - [x] SubTask 4.4: 无歌词时显示"暂无歌词"提示

- [x] Task 5: 更新 App.tsx 替换 placeholder
  - [x] SubTask 5.1: 导入 LyricsView 组件
  - [x] SubTask 5.2: 替换歌词面板 placeholder 为 LyricsView

- [x] Task 6: PlayerBar 接入歌词获取逻辑
  - [x] SubTask 6.1: 切歌时调用 sidecar lrc 接口获取加密歌词
  - [x] SubTask 6.2: 调用 qrcDecoder 解码，更新 store
  - [x] SubTask 6.3: 播放进度更新时同步 activeLine（在 LyricsView 中实现）

# Task Dependencies
- [Task 2] depends on [Task 1] (需要 crypto-js 和 pako)
- [Task 3] 无外部依赖，可与 Task 2 并行
- [Task 4] depends on [Task 3] (需要 store 中的歌词状态)
- [Task 5] depends on [Task 4] (需要 LyricsView 组件)
- [Task 6] depends on [Task 2, Task 3] (需要解码器和 store)
