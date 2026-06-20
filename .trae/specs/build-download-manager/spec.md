# 文件下载管理器 Spec

## Why
现有下载功能仅有最小骨架（Tauri `download_file` 命令 + 前端直接调用），存在 3 个已确认 Bug（自动下载参数名错误、下载质量未跟随配置、文件名扩展名硬编码）和 6 项架构缺陷（内存风险、无进度反馈、无并发控制、无取消、无成功反馈、无队列管理）。用户需要一个完整的下载管理器：任务管理、列表展示、实时进度、状态管理、优先级控制、设置选项、错误重试、后台下载。

## What Changes
- **重写 Tauri `download_file` 命令**为流式下载 + Tauri event 进度上报 + 取消支持（用 `CancelToken`）
- **新增 Tauri `cancel_download` 命令**取消指定下载任务
- **新建 `src/stores/downloadStore.ts`**：下载任务队列管理（添加/暂停/继续/取消/重试/优先级调整）、并发控制、状态机
- **新建 `src/components/DownloadPanel.tsx`**：下载列表 UI（文件名、大小、进度条、状态、操作按钮）
- **扩展 `configStore.ts`**：新增 `maxConcurrentDownloads`（默认 3）
- **扩展 `SettingsPage.tsx` Downloads tab**：新增并发数设置
- **修复 `api/client.ts` `getDownloadUrl`**：质量参数跟随 `streamingQuality` 配置
- **修复 `PlayerBar/index.tsx` 下载入口**：改用 downloadStore 添加任务，不再直接 invoke
- **修复 `SettingsPage.tsx` 自动下载**：参数名 `destPath` → `filename`，改用 downloadStore
- **修复文件名扩展名**：根据 sidecar `Content-Disposition` 或 URL 推断 .mp3/.flac
- **Sidebar 添加下载面板入口**：显示下载数量徽标

## Impact
- Affected code:
  - `src-tauri/Cargo.toml` — reqwest 添加 `stream` feature，新增 `futures-util`、`tokio` stream
  - `src-tauri/src/main.rs` — 重写 `download_file`，新增 `cancel_download`，新增下载状态管理
  - `src/stores/downloadStore.ts`（新建）— 下载任务队列 + 状态机 + 并发调度
  - `src/stores/configStore.ts` — 新增 `maxConcurrentDownloads`
  - `src/components/DownloadPanel.tsx`（新建）— 下载列表 UI
  - `src/components/SettingsPage.tsx` — Downloads tab 新增并发数设置 + 修复自动下载
  - `src/components/PlayerBar/index.tsx` — 下载入口改用 downloadStore
  - `src/components/Sidebar.tsx` — 添加下载面板入口
  - `src/api/client.ts` — 修复 `getDownloadUrl` 质量参数

## ADDED Requirements

### Requirement: 流式下载与进度上报
系统 SHALL 以流式方式下载文件（避免大文件撑爆内存），并通过 Tauri event 实时上报下载进度（已下载字节数、总字节数、速度）。

#### Scenario: 下载进度更新
- **WHEN** 下载任务进行中
- **THEN** Tauri 后端每秒通过 `download-progress-{taskId}` event 上报 `{ downloaded, total, speed }`
- **AND** 前端 downloadStore 更新对应任务的进度字段

#### Scenario: 大文件下载
- **WHEN** 下载 FLAC 文件（30-50MB）
- **THEN** 内存占用稳定（流式写入磁盘，不一次性读入内存）

### Requirement: 下载任务管理
系统 SHALL 提供下载任务的完整生命周期管理：添加、暂停、继续、取消、重试。

#### Scenario: 添加下载任务
- **WHEN** 用户点击下载按钮
- **THEN** 任务添加到队列，状态为 `pending`（等待中）
- **AND** 若当前活跃任务数 < `maxConcurrentDownloads`，立即开始下载

#### Scenario: 暂停下载
- **WHEN** 用户暂停下载中任务
- **THEN** 取消当前下载（发送 cancel 信号），任务状态变为 `paused`
- **AND** 保留已下载的部分信息（但文件重新下载，因 sidecar 不支持 Range）

#### Scenario: 继续下载
- **WHEN** 用户继续暂停的任务
- **THEN** 任务状态变为 `pending`，重新排队等待下载

#### Scenario: 取消下载
- **WHEN** 用户取消任务
- **THEN** 取消当前下载（若进行中），任务从队列移除，删除部分下载文件

#### Scenario: 重试失败任务
- **WHEN** 用户重试失败任务
- **THEN** 任务状态变为 `pending`，重新排队，重置错误信息

### Requirement: 下载状态管理
系统 SHALL 准确显示每个任务的下载状态：`pending`（等待中）、`downloading`（下载中）、`paused`（暂停）、`completed`（已完成）、`failed`（失败）、`canceled`（已取消）。

#### Scenario: 状态流转
- **WHEN** 任务经历添加→开始→完成
- **THEN** 状态依次为 `pending` → `downloading` → `completed`

#### Scenario: 失败状态
- **WHEN** 下载出错
- **THEN** 状态变为 `failed`，记录错误信息，允许用户重试

### Requirement: 下载列表展示
系统 SHALL 以列表形式展示所有下载任务，每项显示：文件名、文件大小、当前进度（进度条 + 百分比 + 已下载/总大小）、下载状态、操作按钮（暂停/继续/取消/重试）。

#### Scenario: 列表展示
- **WHEN** 用户打开下载面板
- **THEN** 显示所有任务，按优先级降序 + 创建时间升序排列
- **AND** 每项显示文件名、`已下载 / 总大小`、进度条、百分比、状态标签
- **AND** 进行中任务显示暂停按钮，暂停任务显示继续/取消按钮，失败任务显示重试按钮，完成任务无操作按钮

### Requirement: 实时进度显示
系统 SHALL 为每个下载任务提供进度条，精确显示下载百分比和已下载大小/总大小。

#### Scenario: 进度条更新
- **WHEN** 下载进行中
- **THEN** 进度条实时更新（每秒），显示百分比（保留 1 位小数）
- **AND** 显示 `已下载 MB / 总大小 MB` 格式文本
- **AND** 显示下载速度（如 `2.5 MB/s`）

### Requirement: 下载优先级控制
系统 SHALL 支持调整下载任务的优先级顺序（上移/下移），高优先级任务优先调度。

#### Scenario: 调整优先级
- **WHEN** 用户点击任务的上移/下移按钮
- **THEN** 任务在队列中重新排序
- **AND** 若该任务为 `pending` 状态，按新顺序等待调度

### Requirement: 下载并发控制
系统 SHALL 限制同时进行的下载任务数量，默认 3 个，可在设置中配置（1-10）。

#### Scenario: 并发达到上限
- **WHEN** 活跃下载任务数 = `maxConcurrentDownloads`
- **THEN** 新添加的任务保持 `pending` 状态等待
- **AND** 当有任务完成/失败/取消时，自动调度队列中最高优先级的 `pending` 任务

### Requirement: 错误处理与自动重试
系统 SHALL 在下载失败时自动重试（最多 3 次），重试间隔递增（1s、2s、4s），仍失败则标记为 `failed` 并显示错误信息。

#### Scenario: 自动重试
- **WHEN** 下载失败且重试次数 < 3
- **THEN** 等待递增间隔后自动重新下载
- **AND** 任务状态保持 `downloading`，记录当前重试次数

#### Scenario: 重试耗尽
- **WHEN** 下载失败且重试次数 = 3
- **THEN** 状态变为 `failed`，显示最后一次错误信息

### Requirement: 下载设置
系统 SHALL 在设置页面提供下载配置选项：下载路径、同时下载数量限制（1-10）、自动下载开关。

#### Scenario: 配置并发数
- **WHEN** 用户在设置中修改 `maxConcurrentDownloads`
- **THEN** 立即生效，后续调度按新限制执行

### Requirement: 后台下载支持
系统 SHALL 确保应用窗口隐藏或失焦时下载任务继续执行。

#### Scenario: 窗口隐藏
- **WHEN** 用户最小化或隐藏应用窗口
- **THEN** 下载任务继续在 Tauri 后端执行，进度持续上报

### Requirement: 下载面板入口
系统 SHALL 在侧边栏提供下载面板入口，显示当前下载数量徽标。

#### Scenario: 有下载任务
- **WHEN** 存在进行中或等待中的下载任务
- **THEN** 侧边栏下载图标显示数字徽标（活跃任务数）

## MODIFIED Requirements

### Requirement: 下载质量跟随配置
`getDownloadUrl` SHALL 使用 `streamingQuality` 配置作为默认质量参数，而非硬编码 `'320'`。

### Requirement: 文件名扩展名推断
下载文件名 SHALL 根据 sidecar 返回的 `Content-Disposition` 头或音频 URL 推断扩展名（.mp3 或 .flac），而非硬编码 `.mp3`。

### Requirement: 手动下载入口
PlayerBar 下载按钮 SHALL 通过 downloadStore 添加任务，而非直接 invoke `download_file`，以获得队列管理和进度反馈。

### Requirement: 自动下载
SettingsPage 自动下载逻辑 SHALL 通过 downloadStore 添加任务（修复参数名 Bug），复用并发控制和重试机制。
