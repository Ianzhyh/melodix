# Checklist

## 代播列表封面兜底
- [x] `QueuePanel.tsx` Now Playing 封面 img 含 `onError` 处理
- [x] `QueuePanel.tsx` Up Next 列表封面 img 含 `onError` 处理
- [x] 封面 URL 为空时显示灰色占位背景，不渲染破损 img 图标
- [x] 封面加载失败时隐藏 img，显示灰色占位背景

## 歌词类型扩展
- [x] `LyricLine` 接口含 `translation?: string` 字段
- [x] `LyricResult` 接口含 `trans?: string` 字段

## 歌词解析工具
- [x] `src/utils/lyricParser.ts` 已创建
- [x] `parseLrcTranslation` 能正确解析 LRC 时间戳返回 Map
- [x] `matchTranslations` 按 ±2 秒容错匹配时间戳填充 `line.translation`
- [x] `isChineseLyric` 中文字符比例 > 50% 返回 true

## PlayerBar 翻译集成
- [x] 歌词加载逻辑读取 `trans` 字段并调用解析工具
- [x] 解析后 `line.translation` 被正确填充
- [x] 非中文歌判断结果与翻译存在状态传递给 LyricsView（通过 playbackStore）

## LyricsView 翻译渲染
- [x] 原歌词行下方渲染翻译文本
- [x] 翻译字号为原歌词 0.8 倍
- [x] 当前行翻译透明度 0.6，非当前行 0.35
- [x] 右上角翻译切换图标使用用户提供的 SVG
- [x] 图标点击切换翻译显示/隐藏
- [x] 图标显示条件：`showTranslationButton` && 非中文歌 && 存在翻译数据
- [x] `autoTranslateLyrics` 为 true 时切歌默认显示翻译

## 配置 Store
- [x] `configStore.ts` 含 `showTranslationButton` 字段（默认 true）+ setter
- [x] `configStore.ts` 含 `autoTranslateLyrics` 字段（默认 false）+ setter
- [x] 两个字段持久化到 localStorage（`melodix-` 前缀）

## 设置页面
- [x] SettingsPage Appearance tab 含「显示翻译按钮」开关
- [x] SettingsPage Appearance tab 含「自动翻译歌词」开关
- [x] 开关状态与 configStore 双向绑定

## 验证
- [x] `tsc --noEmit` 本次改动无新增错误（预存 6 个错误与本次无关）
- [x] 本次引入的 QueuePanel `api` 未使用导入已修复
- [ ] 代播列表封面失败场景显示占位背景（需用户运行应用验证）
- [ ] 非中文歌显示翻译图标，点击切换翻译（需用户运行应用验证）
- [ ] 中文歌不显示翻译图标（需用户运行应用验证）
- [ ] 设置开关切换生效（需用户运行应用验证）
