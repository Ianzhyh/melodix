# 替换 Sidecar + 添加侧边栏设置 Spec

## Why
当前 sidecar 的自定义 `qqUrl` 函数无法获取播放 URL（QQ Music 未登录返回空 purl），导致无法播放任何歌曲。`D:\IanMusic\meting-api` 是一个成熟的、经过验证的音乐 API，支持 Cookie、多平台、扫码登录。需要替换 sidecar 并添加设置页面让用户配置 Cookie。

## What Changes
- **替换 sidecar**：用 `D:\IanMusic\meting-api\server.js` 替换 `D:\IANMUSICD\melodix\meting-server\index.js`
- **更新前端 API 调用**：适配 meting-api 的路由格式（`/search?server=xxx&id=keyword` 而非 `/?server=xxx&type=search&keywords=keyword`）
- **添加侧边栏**：左侧可折叠侧边栏，包含导航和设置入口
- **添加设置页面**：Cookie 配置（tencent / netease / kugou / kuwo），保存到 Tauri 本地存储
- **前端 Cookie 传递**：播放 URL 请求时通过 `X-Tencent-Cookie` 请求头传递 Cookie

## Impact
- Affected code: `meting-server/index.js`（替换）、`searchStore.ts`、`PlayerBar.tsx`、`AudioEngine.ts`、`App.tsx`（添加侧边栏）
- 新增文件: `src/components/Sidebar.tsx`、`src/components/SettingsPage.tsx`
- Affected stores: `configStore.ts`（添加 Cookie 存储）

## ADDED Requirements

### Requirement: Sidecar 替换为 meting-api
系统 SHALL 使用 `D:\IanMusic\meting-api\server.js` 作为 sidecar，替代当前的自定义实现。

#### Scenario: Sidecar 正常启动
- **WHEN** Tauri 应用启动
- **THEN** meting-api sidecar 在指定端口启动，`/health` 返回 200

#### Scenario: 搜索歌曲
- **WHEN** 前端调用 `/search?server=tencent&id=周杰伦`
- **THEN** 返回搜索结果数组

#### Scenario: 获取播放 URL
- **WHEN** 前端调用 `/url?server=tencent&id=xxx` 并携带 Cookie
- **THEN** 返回有效的播放 URL

### Requirement: 前端 API 适配
前端 SHALL 使用 meting-api 的路由格式调用 API。

#### Scenario: 搜索
- **WHEN** 用户搜索歌曲
- **THEN** 请求 `/search?server=tencent&id=关键词` 而非 `/?server=tencent&type=search&keywords=关键词`

#### Scenario: 获取 URL
- **WHEN** 播放歌曲
- **THEN** 请求 `/url?server=tencent&id=歌曲ID` 并携带 `X-Tencent-Cookie` 请求头

#### Scenario: 获取歌词
- **WHEN** 获取歌词
- **THEN** 请求 `/lyric?server=tencent&id=歌曲ID` 并携带 Cookie

#### Scenario: 获取封面
- **WHEN** 获取封面
- **THEN** 请求 `/pic?server=tencent&id=图片ID&size=300`

### Requirement: 侧边栏导航
系统 SHALL 提供左侧可折叠侧边栏，包含搜索和设置入口。

#### Scenario: 侧边栏显示
- **WHEN** 应用启动
- **THEN** 左侧显示窄侧边栏（图标模式），包含搜索图标和设置图标

#### Scenario: 切换页面
- **WHEN** 用户点击侧边栏图标
- **THEN** 主内容区切换到对应页面

### Requirement: Cookie 设置页面
系统 SHALL 提供设置页面，允许用户为各平台填写 Cookie。

#### Scenario: 保存 Cookie
- **WHEN** 用户在设置页面填写 QQ Music Cookie 并点击保存
- **THEN** Cookie 保存到 Tauri 本地存储，后续 API 请求自动携带

#### Scenario: Cookie 持久化
- **WHEN** 应用重启
- **THEN** 之前保存的 Cookie 仍然可用

#### Scenario: 通过 API 保存 Cookie
- **WHEN** 用户保存 Cookie
- **THEN** 同时调用 sidecar 的 `/api/cookie` POST 接口，让 sidecar 也能使用 Cookie
