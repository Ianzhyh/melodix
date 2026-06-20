# Tasks

- [x] Task 1: 修复代播列表封面兜底
  - [x] SubTask 1.1: 在 `src/components/QueuePanel.tsx` Now Playing 封面 img（约 102-106 行）添加 `onError` 处理：隐藏 img 元素
  - [x] SubTask 1.2: 在 `src/components/QueuePanel.tsx` Up Next 列表封面 img（约 138-143 行）添加 `onError` 处理：隐藏 img 元素
  - [x] SubTask 1.3: 当 `getSongCoverUrl` 返回空字符串时，不渲染 img，改为渲染灰色占位背景 div

- [x] Task 2: 扩展歌词类型定义
  - [x] SubTask 2.1: 在 `src/types/playback.ts` 的 `LyricLine` 接口增加 `translation?: string` 字段
  - [x] SubTask 2.2: 在 `src/types/playback.ts` 的 `LyricResult` 接口增加 `trans?: string` 字段

- [x] Task 3: 新建歌词解析工具 `src/utils/lyricParser.ts`
  - [x] SubTask 3.1: 实现 `parseLrcTranslation(transLrc: string): Map<number, string>` — 解析 LRC 时间戳返回「秒 → 翻译文本」映射
  - [x] SubTask 3.2: 实现 `matchTranslations(lines: LyricLine[], transMap: Map<number, string>, toleranceSec = 2): void` — 按时间戳容错匹配，原地填充 `line.translation`
  - [x] SubTask 3.3: 实现 `isChineseLyric(lines: LyricLine[]): boolean` — 统计中文字符比例 > 50% 返回 true

- [x] Task 4: 在 `src/components/PlayerBar/index.tsx` 集成翻译解析
  - [x] SubTask 4.1: 歌词加载逻辑中读取 `trans` 字段（约 170-224 行），调用 `parseLrcTranslation` + `matchTranslations` 填充 `line.translation`
  - [x] SubTask 4.2: 将 `isChineseLyric` 结果与「是否存在翻译行」状态暴露给 LyricsView（通过 playbackStore 的 isChineseLyric/hasTranslation 字段）

- [x] Task 5: 在 `src/components/LyricsView.tsx` 渲染翻译
  - [x] SubTask 5.1: 在原歌词行下方渲染 `line.translation`（当翻译开关开启且 translation 存在）
  - [x] SubTask 5.2: 翻译样式：字号为原歌词 0.8 倍，当前行透明度 0.6，非当前行 0.35
  - [x] SubTask 5.3: 在歌词页面右上角添加翻译切换图标（用户提供的 SVG），点击切换翻译显示状态
  - [x] SubTask 5.4: 图标显示条件：`showTranslationButton` 为 true 且非中文歌且存在翻译数据
  - [x] SubTask 5.5: 自动翻译：当 `autoTranslateLyrics` 为 true 且切歌时存在翻译数据，默认开启翻译显示

- [x] Task 6: 扩展配置 store
  - [x] SubTask 6.1: 在 `src/stores/configStore.ts` 新增 `showTranslationButton: boolean`（默认 true）+ `setShowTranslationButton`
  - [x] SubTask 6.2: 在 `src/stores/configStore.ts` 新增 `autoTranslateLyrics: boolean`（默认 false）+ `setAutoTranslateLyrics`
  - [x] SubTask 6.3: 持久化到 localStorage（沿用 `melodix-` 前缀）

- [x] Task 7: 在 `src/components/SettingsPage.tsx` 新增开关
  - [x] SubTask 7.1: 在 Appearance tab 新增「显示翻译按钮」开关，绑定 `showTranslationButton`
  - [x] SubTask 7.2: 在 Appearance tab 新增「自动翻译歌词」开关，绑定 `autoTranslateLyrics`

- [x] Task 8: 验证与自检
  - [x] SubTask 8.1: 运行 `tsc --noEmit` 确认本次改动无新增错误（预存 6 个错误与本次无关）
  - [x] SubTask 8.2: 修复本次引入的 QueuePanel.tsx `api` 未使用导入错误
  - [ ] SubTask 8.3: 手动验证代播列表封面加载失败场景显示占位背景（需用户运行应用验证）
  - [ ] SubTask 8.4: 手动验证非中文歌显示翻译图标、点击切换、中文歌不显示图标（需用户运行应用验证）
  - [ ] SubTask 8.5: 手动验证设置开关生效（需用户运行应用验证）

# Task Dependencies
- Task 2 → Task 3（lyricParser 依赖 LyricLine 类型）
- Task 3 → Task 4（PlayerBar 依赖 lyricParser）
- Task 6 → Task 5（LyricsView 图标显示依赖 configStore 字段）
- Task 6 → Task 7（SettingsPage 依赖 configStore 字段）
- Task 1、Task 2 可独立并行
- Task 5 依赖 Task 4 与 Task 6
- Task 8 依赖所有前置任务完成
