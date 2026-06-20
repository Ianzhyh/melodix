# Checklist

## Tauri 后端流式下载
- [x] `Cargo.toml` reqwest 含 `stream` feature，含 `futures-util`/`tokio-util` 依赖
- [x] `download_file` 命令流式读取响应并写入文件（非一次性 bytes）
- [x] `download_file` 每秒 emit `download-progress-{taskId}` event，含 `{ downloaded, total, speed }`
- [x] `download_file` 支持 cancel 信号（CancellationToken）
- [x] `cancel_download` 命令已实现并注册到 `generate_handler!`
- [x] 全局下载任务表 `HashMap<String, CancellationToken>` 已维护
- [x] 保留原有安全检查（扩展名白名单 .mp3/.flac、路径穿越防护、canonicalize 校验）
- [x] `cargo check` 通过

## downloadStore 任务管理
- [x] `DownloadTask` 类型定义完整（14 个字段）
- [x] `DownloadStatus` 联合类型含 6 种状态
- [x] `addTask` 动作：构建 pending 任务，插入队列，触发调度
- [x] `pauseTask`/`resumeTask`/`cancelTask`/`retryTask` 动作实现
- [x] `moveTaskUp`/`moveTaskDown` 优先级调整实现
- [x] `clearCompleted` 清除已完成任务
- [x] `schedule` 调度：活跃数 < maxConcurrentDownloads 时取 pending 任务启动
- [x] `startDownload`：invoke download_file + listen progress event + 完成标记 + 失败重试（3 次，1s/2s/4s）+ 暂停 invoke cancel
- [x] Tauri event listen 在任务结束/取消时 unlisten

## configStore 扩展
- [x] `maxConcurrentDownloads` 字段（默认 3，clamp 1-10）+ setter
- [x] 持久化到 localStorage（`melodix-max-concurrent-downloads`）
- [x] downloadStore 读取该字段用于调度

## API 与下载入口修复
- [x] `getDownloadUrl` 质量参数跟随 `streamingQuality` 配置
- [x] PlayerBar `onDownload` 改用 downloadStore.addTask
- [x] SettingsPage 自动下载参数名修复 + 改用 downloadStore.addTask
- [x] 下载成功/失败显示 Toast 反馈（downloadStore 内置）
- [ ] 文件名扩展名根据 Content-Disposition 推断（当前仍用 .mp3，sidecar 返回 .flac 时命名不准）

## DownloadPanel UI
- [x] 面板样式参考 QueuePanel（framer-motion 滑入）
- [x] 任务列表显示：文件名、已下载/总大小、进度条、百分比、速度、状态标签
- [x] 操作按钮：进行中=暂停，暂停=继续+取消，失败=重试+取消，完成=无，pending=取消
- [x] 优先级控制：上移/下移按钮（仅 pending/paused 生效）
- [x] 顶部工具栏：清空已完成按钮
- [x] 空状态提示
- [x] 文件大小格式化函数（B/KB/MB/GB）

## Sidebar 入口
- [x] 侧边栏含下载图标按钮
- [x] 活跃任务数徽标（pending + downloading）
- [x] 点击打开 DownloadPanel（uiStore 联动）

## SettingsPage 扩展
- [x] Downloads tab 含「同时下载数量」设置（1-10，CustomSelect）
- [x] 绑定 maxConcurrentDownloads
- [x] 保留现有下载功能

## 验证
- [x] `tsc --noEmit` 无新增错误（6 个预存错误与本次无关）
- [x] `cargo check` 通过
- [x] 修复 LyricsView.tsx 遗留的 useEffect 路径返回错误
- [ ] 下载流程：添加→进度→完成（需用户运行应用验证）
- [ ] 暂停/继续/取消/重试（需用户运行应用验证）
- [ ] 并发限制生效（需用户运行应用验证）
- [ ] 优先级调整生效（需用户运行应用验证）
- [ ] 设置变更生效（需用户运行应用验证）
