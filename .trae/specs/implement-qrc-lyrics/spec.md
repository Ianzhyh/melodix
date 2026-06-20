# QRC 歌词解码与展示 Spec

## Why
当前歌词面板是 placeholder，无法显示真实歌词。需要实现 QRC 加密歌词的解码和同步滚动展示，这是 M3 里程碑的核心功能。

## What Changes
- 新增 `src/utils/qrcDecoder.ts`：实现 Triple DES EDE3-ECB 解密 + zlib raw deflate 解压 + QRC XML 解析
- 新增 `src/components/LyricsView.tsx`：同步滚动歌词展示组件（当前行高亮、逐字进度动画）
- 修改 `src/stores/playbackStore.ts`：添加 `lyrics`、`activeLine` 状态和相关 actions
- 修改 `src/App.tsx`：替换歌词 placeholder 为真实 LyricsView 组件
- 修改 `src/components/PlayerBar.tsx`：切歌时自动拉取歌词并解码
- 安装 `crypto-js`、`pako` 依赖

## Impact
- Affected code: `playbackStore.ts`, `App.tsx`, `PlayerBar.tsx`, `package.json`
- 新增文件: `qrcDecoder.ts`, `LyricsView.tsx`
- 依赖: `crypto-js`, `pako`, `@types/crypto-js`

## ADDED Requirements

### Requirement: QRC 歌词解码
系统 SHALL 将 sidecar 返回的 base64 编码加密歌词数据解码为 `LyricLine[]`。

#### Scenario: 正常解码
- **WHEN** 传入有效的 base64 编码 QRC 密文
- **THEN** 返回 `LyricLine[]`，每行包含 `time`、`duration`、`text`、`words`（逐字时间戳）

#### Scenario: 空或无效输入
- **WHEN** 传入空字符串或无效数据
- **THEN** 返回空数组 `[]`，不抛异常

### Requirement: 歌词状态管理
playbackStore SHALL 管理 `lyrics: LyricLine[]` 和 `activeLine: number` 状态。

#### Scenario: 切歌时清空歌词
- **WHEN** 当前播放歌曲变更
- **THEN** `lyrics` 重置为 `[]`，`activeLine` 重置为 `-1`

#### Scenario: 歌词加载完成
- **WHEN** 歌词解码成功
- **THEN** `lyrics` 更新为解码结果

#### Scenario: 当前歌词行同步
- **WHEN** 播放进度更新
- **THEN** `activeLine` 根据当前时间自动指向对应歌词行

### Requirement: 歌词展示组件
LyricsView SHALL 在歌词面板中展示同步滚动的歌词。

#### Scenario: 当前行高亮
- **WHEN** `activeLine` 变化
- **THEN** 当前行自动滚动到可视区域中心，字体放大、颜色变为主题色，其余行半透明

#### Scenario: 逐字进度动画
- **WHEN** 当前行有 `words` 数据
- **THEN** 根据播放进度显示逐字填充效果（文字从透明到不透明的渐进填充）

#### Scenario: 无歌词状态
- **WHEN** `lyrics` 为空
- **THEN** 显示"暂无歌词"提示

### Requirement: 自动拉取歌词
切歌时 SHALL 自动从 sidecar 获取歌词并解码。

#### Scenario: 播放新歌时自动获取歌词
- **WHEN** 当前歌曲变更且歌曲有 id
- **THEN** 自动调用 sidecar `lrc` 接口获取加密歌词，解码后更新 store

#### Scenario: 歌词获取失败
- **WHEN** 歌词请求或解码失败
- **THEN** `lyrics` 设为空数组，不阻塞播放
