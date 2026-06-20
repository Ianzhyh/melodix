# 修复代播列表封面与实现歌词翻译 Spec

## Why
代播列表（Up Next）封面图片加载失败时显示破损图标，体验差。歌词翻译功能后端已就绪（`server.js` 已解密返回 `trans` 字段），但前端类型/解析/渲染三层完全未消费，导致用户看不到翻译。

## What Changes
- 修复 `QueuePanel.tsx` 封面 img 缺少 `onError` 兜底和空 URL 占位符问题
- 扩展歌词类型：`LyricLine` 增加 `translation?: string`，`LyricResult` 增加 `trans?: string`
- 在 `PlayerBar/index.tsx` 歌词加载逻辑中解析 `trans`（LRC 格式），按时间戳容错匹配到对应歌词行
- 在 `LyricsView.tsx` 原歌词行下方渲染翻译（字号较小、透明度较低）
- 新增翻译切换图标（用户提供的 SVG），位于歌词页面右上角，仅当非中文歌且有翻译数据时显示
- 新增中文歌判断逻辑（检测歌词中文字符比例 > 50% 视为中文歌）
- 新增两个设置项：`showTranslationButton`（是否显示翻译图标，默认 true）、`autoTranslateLyrics`（是否自动翻译，默认 false）

## Impact
- Affected code:
  - `src/components/QueuePanel.tsx` — 封面 onError 兜底
  - `src/types/playback.ts` — LyricLine/LyricResult 类型扩展
  - `src/components/PlayerBar/index.tsx` — 翻译解析与匹配
  - `src/components/LyricsView.tsx` — 翻译渲染 + 右上角图标
  - `src/stores/configStore.ts` — 新增两个设置字段
  - `src/components/SettingsPage.tsx` — 新增两个开关
  - `src/utils/lyricParser.ts`（新建）— LRC 翻译解析 + 中文歌判断工具函数

## ADDED Requirements

### Requirement: 代播列表封面兜底
系统 SHALL 在封面 URL 为空或加载失败时显示占位背景，不显示破损图标。

#### Scenario: 封面 URL 为空
- **WHEN** `getSongCoverUrl` 返回空字符串
- **THEN** img 不渲染，显示灰色占位背景

#### Scenario: 封面加载失败
- **WHEN** 图片加载触发 onError
- **THEN** 隐藏 img 元素，显示灰色占位背景

### Requirement: 歌词翻译解析
系统 SHALL 解析后端返回的 `trans` 字段（LRC 格式），按时间戳容错匹配（±2 秒）到对应歌词行的 `translation` 字段。

#### Scenario: 有翻译数据
- **WHEN** 后端返回非空 `trans` 字段
- **THEN** 解析 LRC 时间戳，匹配到原歌词行，填充 `line.translation`

#### Scenario: 无翻译数据
- **WHEN** 后端返回空 `trans` 字段
- **THEN** 所有歌词行的 `translation` 为 undefined

### Requirement: 翻译切换图标
系统 SHALL 在歌词页面右上角显示翻译切换图标（用户提供的 SVG），仅当满足以下条件时显示：
1. 设置 `showTranslationButton` 为 true
2. 当前歌曲为非中文歌（歌词中文字符比例 ≤ 50%）
3. 歌词数据中存在至少一行翻译

#### Scenario: 非中文歌有翻译
- **WHEN** 歌曲为非中文歌且存在翻译数据
- **THEN** 右上角显示翻译图标，点击切换翻译显示/隐藏

#### Scenario: 中文歌
- **WHEN** 歌词中文字符比例 > 50%
- **THEN** 不显示翻译图标

#### Scenario: 设置关闭翻译按钮
- **WHEN** 设置 `showTranslationButton` 为 false
- **THEN** 不显示翻译图标，但自动翻译仍可生效

### Requirement: 自动翻译设置
系统 SHALL 提供自动翻译设置，当开启时遇到可翻译歌曲自动显示翻译。

#### Scenario: 自动翻译开启
- **WHEN** `autoTranslateLyrics` 为 true 且歌曲有翻译数据
- **THEN** 翻译默认显示，无需手动点击图标

#### Scenario: 自动翻译关闭
- **WHEN** `autoTranslateLyrics` 为 false
- **THEN** 翻译默认隐藏，需手动点击图标开启

### Requirement: 翻译渲染样式
系统 SHALL 在原歌词行下方渲染翻译文本，样式区别于原歌词。

#### Scenario: 翻译显示
- **WHEN** 翻译开关开启且 `line.translation` 存在
- **THEN** 在原歌词下方显示翻译，字号较小（原歌词的 0.8 倍），透明度较低（当前行 0.6，非当前行 0.35）

## MODIFIED Requirements

### Requirement: 设置页面
在设置页面（Appearance 或 Audio tab）新增两个开关：
1. "显示翻译按钮" — 控制 `showTranslationButton`
2. "自动翻译歌词" — 控制 `autoTranslateLyrics`
