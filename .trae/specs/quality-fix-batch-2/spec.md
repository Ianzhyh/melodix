# 项目质量修复与优化 Spec

## Why
项目存在多个明显 Bug（URL 匹配误判、RAF 空循环、双重解码等）、安全隐患（路径穿越、SSRF、任意文件写入）和低质量代码（全局 CSS 冲突、重复映射逻辑、硬编码泛滥），严重影响用户体验和代码可维护性。

## What Changes
- 修复 AudioEngine URL 匹配误判和 ended 事件竞态条件
- 修复 LyricsView 无歌词时 RAF 空循环
- 修复 PlaylistView useEffect 闭包过期问题
- 修复 server.js 双重 decodeURIComponent 导致搜索含 `%` 内容报错
- 修复 PlayerBar 主色 fallback 值错误（#22d3ee → #6366f1）
- 修复全局 CSS 类名冲突（FavoritesPage/PlaylistView 的 .track-row）
- 修复 server.js 静态文件路径穿越漏洞
- 修复 server.js /proxy-image SSRF 漏洞
- 修复 main.rs download_file 任意文件写入漏洞
- 提取 client.ts 中重复 4 次的 Song 映射逻辑为公共函数
- 优化 AudioEngine store 订阅为 selector 模式
- 为 API 请求添加超时机制
- 为 Sidecar 就绪检查添加加载 UI 反馈

## Impact
- Affected code: AudioEngine.ts, playbackStore.ts, LyricsView.tsx, PlaylistView.tsx, PlayerBar.tsx, client.ts, App.tsx, server.js, main.rs, FavoritesPage.tsx

## ADDED Requirements

### Requirement: AudioEngine URL 精确匹配
AudioEngine 的 `play()` 方法 SHALL 使用完整 URL 比较而非 `endsWith` 判断当前播放歌曲，避免短 URL 后缀误匹配。

#### Scenario: 切换到 URL 后缀相同的歌曲
- **WHEN** 当前播放 `/song/11`，用户切换到 `/song/1`
- **THEN** AudioEngine SHALL 正确加载新歌曲，而非误判为同一首歌

### Requirement: LyricsView RAF 资源管理
LyricsView 的 RAF 循环 SHALL 在无歌词或无活跃行时停止，避免 CPU 空转。

#### Scenario: 无歌词时
- **WHEN** 歌曲没有歌词数据
- **THEN** RAF 循环 SHALL 停止，不消耗 CPU 资源

### Requirement: API 请求超时
前端 API 请求 SHALL 设置超时（10 秒），避免 sidecar 无响应时请求无限挂起。

#### Scenario: Sidecar 无响应
- **WHEN** sidecar 进程无响应
- **THEN** 请求 SHALL 在 10 秒后超时并显示错误信息

### Requirement: 静态文件路径穿越防护
server.js 的 serveStatic SHALL 校验解析后的路径仍在 STATIC_ROOT 内，防止路径穿越攻击。

#### Scenario: 恶意路径请求
- **WHEN** 请求 `/../../../etc/passwd`
- **THEN** 服务器 SHALL 返回 403 Forbidden

### Requirement: 图片代理 SSRF 防护
server.js 的 /proxy-image SHALL 限制目标 URL 域名为已知音乐平台域名白名单。

#### Scenario: 请求内网地址
- **WHEN** 请求代理 `http://169.254.169.254/` 等内网地址
- **THEN** 服务器 SHALL 返回 403 Forbidden

### Requirement: 下载文件路径沙箱
main.rs 的 download_file SHALL 校验目标路径在用户指定下载目录内，防止任意文件写入。

#### Scenario: 恶意路径写入
- **WHEN** 前端传入 `C:\Windows\System32\evil.dll` 作为 dest_path
- **THEN** Rust 后端 SHALL 拒绝并返回错误

## MODIFIED Requirements

### Requirement: Song 数据映射
client.ts 中分散在 search/getPlaylist/getNewSongs/getTencentPlaylist 的 Song 映射逻辑 SHALL 统一提取为 `normalizeSong()` 公共函数。

### Requirement: AudioEngine Store 订阅
AudioEngine 的 store 订阅 SHALL 使用 selector 只订阅 volume 和 isMuted，而非订阅全部状态变化。

### Requirement: 全局 CSS 类名作用域
FavoritesPage 和 PlaylistView 的全局 CSS 类名 SHALL 添加组件前缀（如 `.fv-track-row` 和 `.pv-track-row`），避免同名冲突。

### Requirement: 主色 Fallback 一致性
PlayerBar 中所有 `var(--color-primary, #22d3ee)` SHALL 修改为 `var(--color-primary, #6366f1)`，与 tokens.css 定义一致。

## REMOVED Requirements

### Requirement: server.js 双重 URL 解码
**Reason**: `url.parse` 已自动解码查询参数，手动 `decodeURIComponent` 导致含 `%` 的搜索词报错
**Migration**: 移除所有 handler 中手动的 `decodeURIComponent` 调用
