# Tasks

- [x] Task 1: 重写 Tauri 后端流式下载命令
  - [x] SubTask 1.1: 修改 `src-tauri/Cargo.toml`，reqwest 添加 `stream` feature，新增 `futures-util`、`tokio-util` 依赖
  - [x] SubTask 1.2: 在 `src-tauri/src/main.rs` 重写 `download_file` 命令：流式读取 + 写入文件 + 每秒 emit `download-progress-{taskId}` event + 支持 cancel 信号
  - [x] SubTask 1.3: 新增 `cancel_download` Tauri 命令
  - [x] SubTask 1.4: 维护 `HashMap<String, CancellationToken>` 全局下载任务表
  - [x] SubTask 1.5: 注册 `cancel_download` 到 `generate_handler!`
  - [x] SubTask 1.6: 保留原有安全检查

- [x] Task 2: 新建 downloadStore 下载任务管理
  - [x] SubTask 2.1: 定义 `DownloadTask` 类型（14 个字段）
  - [x] SubTask 2.2: 定义 `DownloadStatus` 联合类型（6 种状态）
  - [x] SubTask 2.3: 实现 store 状态：`tasks`、`activeCount`
  - [x] SubTask 2.4: 实现 `addTask(song)` 动作
  - [x] SubTask 2.5: 实现 `pauseTask`/`resumeTask`/`cancelTask`/`retryTask` 动作
  - [x] SubTask 2.6: 实现 `moveTaskUp`/`moveTaskDown` 优先级调整
  - [x] SubTask 2.7: 实现 `clearCompleted`
  - [x] SubTask 2.8: 实现 `schedule()` 调度
  - [x] SubTask 2.9: 实现 `startDownload(task)`：invoke + listen + 重试 + unlisten
  - [x] SubTask 2.10: Tauri event listen 在任务结束时 unlisten

- [x] Task 3: 扩展 configStore 下载设置
  - [x] SubTask 3.1: 新增 `maxConcurrentDownloads`（默认 3，clamp 1-10）+ setter
  - [x] SubTask 3.2: downloadStore 读取该字段用于调度

- [x] Task 4: 修复 API 与下载入口
  - [x] SubTask 4.1: 修复 `getDownloadUrl` 质量参数跟随 `streamingQuality`
  - [x] SubTask 4.2: PlayerBar `onDownload` 改用 downloadStore.addTask
  - [x] SubTask 4.3: SettingsPage 自动下载改用 downloadStore.addTask（修复参数名 Bug）
  - [x] SubTask 4.4: 下载成功/失败 Toast 反馈（downloadStore 内置）

- [x] Task 5: 新建 DownloadPanel 下载列表 UI
  - [x] SubTask 5.1: 新建 `DownloadPanel.tsx`，参考 QueuePanel 抽屉样式
  - [x] SubTask 5.2: 渲染任务列表（文件名/大小/进度条/百分比/速度/状态）
  - [x] SubTask 5.3: 操作按钮（暂停/继续/取消/重试按状态显示）
  - [x] SubTask 5.4: 优先级控制（上移/下移，仅 pending/paused）
  - [x] SubTask 5.5: 顶部工具栏（清空已完成）
  - [x] SubTask 5.6: 空状态提示
  - [x] SubTask 5.7: 文件大小格式化函数

- [x] Task 6: Sidebar 添加下载面板入口
  - [x] SubTask 6.1: 添加下载图标按钮
  - [x] SubTask 6.2: 活跃任务数徽标
  - [x] SubTask 6.3: 点击打开 DownloadPanel（uiStore 控制）

- [x] Task 7: SettingsPage Downloads tab 扩展
  - [x] SubTask 7.1: 新增「同时下载数量」设置（1-10，CustomSelect）
  - [x] SubTask 7.2: 保留现有下载功能

- [x] Task 8: 验证与自检
  - [x] SubTask 8.1: `tsc --noEmit` 本次改动无新增错误（6 个预存错误无关）
  - [x] SubTask 8.2: `cargo check` 通过
  - [x] SubTask 8.3: 修复 LyricsView.tsx 遗留的 useEffect 路径返回错误
  - [ ] SubTask 8.4: 手动验证下载流程（需用户运行应用）
  - [ ] SubTask 8.5: 手动验证暂停/继续/取消/重试（需用户运行应用）
  - [ ] SubTask 8.6: 手动验证并发限制（需用户运行应用）
  - [ ] SubTask 8.7: 手动验证优先级调整（需用户运行应用）

# Task Dependencies
- Task 1 → Task 2
- Task 3 → Task 2
- Task 2 → Task 4/5/6
- Task 3 → Task 7
- Task 8 依赖所有前置任务完成
