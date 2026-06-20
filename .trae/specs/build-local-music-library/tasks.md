# Tasks

- [x] Task 1: Rust 后端依赖与数据库基础
  - [x] SubTask 1.1: 修改 `src-tauri/Cargo.toml`，新增 `notify = "6"`、`lofty = "0.21"`、`rusqlite = { version = "0.32", features = ["bundled"] }`
  - [x] SubTask 1.2: 新建 `src-tauri/src/local_music.rs` 模块，实现 SQLite 数据库初始化（建表 `local_music`）、连接池管理
  - [x] SubTask 1.3: 在 `main.rs` 声明 `mod local_music;`，在 `.setup()` 中初始化数据库并通过 `app.manage()` 注册数据库连接状态
  - [x] SubTask 1.4: 实现 `scan_directory(dir: &Path) -> ScanResult` 内部函数：递归遍历目录，对支持格式文件用 lofty 解析元数据，INSERT OR IGNORE 入库，返回 `{ scanned, imported, skipped, failed }`

- [x] Task 2: Tauri 扫描与查询命令
  - [x] SubTask 2.1: 实现 `scan_local_music(app, dir)` 命令：调用 scan_directory，通过 `app.emit("scan-progress-{...}", ...)` 上报进度，返回 ScanResult
  - [x] SubTask 2.2: 实现 `get_local_songs(offset, limit, search?)` 命令：分页查询，支持按 title/artist/album 模糊搜索，返回 Song 数组（含 filePath/format/isLocal 字段）
  - [x] SubTask 2.3: 实现 `get_local_song_count()` 命令：返回数据库总记录数
  - [x] SubTask 2.4: 实现 `delete_local_song(id)` 命令：删除数据库记录（可选删除文件）
  - [x] SubTask 2.5: 实现 `import_files(file_paths[])` 命令：对指定文件列表解析元数据并入库（手动导入单/多文件）
  - [x] SubTask 2.6: 注册所有命令到 `generate_handler!`

- [x] Task 3: 文件监控（自动导入）
  - [x] SubTask 3.1: 实现 `watch_download_dir(app, dir)` 命令：用 notify 监控目录，检测到新文件延迟 2 秒后扫描导入，通过 event 通知前端
  - [x] SubTask 3.2: 实现 `stop_watch()` 命令：停止文件监控
  - [x] SubTask 3.3: 在 main.rs 维护全局 watcher 状态（`Arc<Mutex<Option<RecommendedWatcher>>>`），注册到 manage
  - [x] SubTask 3.4: 注册 watch_download_dir 和 stop_watch 命令

- [x] Task 4: CSP 与权限改造
  - [x] SubTask 4.1: 修改 `src-tauri/tauri.conf.json` CSP：`media-src` 和 `img-src` 新增 `asset:` 和 `https://asset.localhost`
  - [x] SubTask 4.2: 配置 Tauri asset 协议（在 tauri.conf.json 的 `app.security.assetProtocol` 或 `app.security` 中启用）
  - [x] SubTask 4.3: 修改 `src-tauri/capabilities/default.json` 添加 fs 读取权限（如需）

- [x] Task 5: 前端类型与配置扩展
  - [x] SubTask 5.1: 在 `src/types/playback.ts` Song 接口新增 `filePath?: string`、`isLocal?: boolean`、`format?: string`
  - [x] SubTask 5.2: 在 `src/stores/configStore.ts` 新增 `localLibraryPath: string`（默认 ''）、`autoImportOnDownload: boolean`（默认 false）、`importMode: 'copy' | 'index'`（默认 'index'）+ 对应 setter，localStorage 持久化

- [x] Task 6: 本地音乐库 Store
  - [x] SubTask 6.1: 新建 `src/stores/localLibraryStore.ts`，定义状态：`songs: Song[]`、`totalCount: number`、`loading: boolean`、`searchQuery: string`、`scanProgress: { scanned, total, currentFile } | null`
  - [x] SubTask 6.2: 实现 `loadSongs(reset?)` 动作：invoke `get_local_songs` 分页加载
  - [x] SubTask 6.3: 实现 `search(query)` 动作：设置 searchQuery 并重新加载
  - [x] SubTask 6.4: 实现 `scanDirectory(dir)` 动作：invoke `scan_local_music` + listen `scan-progress` event 更新 scanProgress
  - [x] SubTask 6.5: 实现 `importFiles(paths[])` 动作：invoke `import_files`
  - [x] SubTask 6.6: 实现 `deleteSong(id)` 动作：invoke `delete_local_song` 并刷新列表
  - [x] SubTask 6.7: 实现 `refreshCount()` 动作：invoke `get_local_song_count`

- [x] Task 7: 本地音乐库页面 UI
  - [x] SubTask 7.1: 新建 `src/components/LocalLibraryPage.tsx`，参考 FavoritesPage 列表样式
  - [x] SubTask 7.2: 顶部工具栏：搜索框、「导入文件」按钮、「导入文件夹」按钮、「重新扫描」按钮
  - [x] SubTask 7.3: 歌曲列表：歌名、艺术家、专辑、时长、格式标签、播放按钮
  - [x] SubTask 7.4: 空状态提示 + 导入引导
  - [x] SubTask 7.5: 扫描进度条（scanProgress 不为 null 时显示）
  - [x] SubTask 7.6: 点击歌曲调用 playbackStore.setQueue + 播放

- [x] Task 8: Sidebar 与路由
  - [x] SubTask 8.1: 在 `src/components/Sidebar.tsx` Your Library 区块新增「本地音乐」入口（图标 + 歌曲数量）
  - [x] SubTask 8.2: 在 `src/App.tsx` 新增 `local-library` 路由分支，渲染 LocalLibraryPage

- [x] Task 9: 本地文件播放支持
  - [x] SubTask 9.1: 改造 `src/components/PlayerBar/index.tsx`：判断 `current.source === 'local'`，跳过 api.getUrl，用 `convertFileSrc(current.filePath)` 播放；跳过 api.getLyric
  - [x] SubTask 9.2: 改造 `src/utils/cover.ts`：本地封面路径（filePath 或 cover 以非 http 开头）通过 `convertFileSrc` 转换
  - [x] SubTask 9.3: 改造 `src/services/AudioEngine.ts`：确认 play(url) 能接受 convertFileSrc 返回的 URL（通常无需改动，只是 URL 格式不同）

- [x] Task 10: 设置页面 Library tab
  - [x] SubTask 10.1: 在 `src/components/SettingsPage.tsx` SETTINGS_TABS 新增 `library` tab
  - [x] SubTask 10.2: Library tab 内容：本地库根目录选择器（复用 Downloads tab 的目录选择模式）、自动导入开关（Toggle）、导入模式选择（CustomSelect: 复制/索引）、支持格式显示、手动导入按钮、重新扫描按钮
  - [x] SubTask 10.3: 自动导入开关变化时 invoke watch_download_dir / stop_watch

- [x] Task 11: 下载完成自动导入回调
  - [x] SubTask 11.1: 在 `src/stores/downloadStore.ts` startDownload 成功回调中，检查 configStore.autoImportOnDownload，若为 true 则 invoke scan_local_music 扫描该文件
  - [x] SubTask 11.2: 导入成功后通过 toastStore 提示「已导入本地库」

- [ ] Task 12: 验证与自检
  - [x] SubTask 12.1: `cargo check` 通过
  - [x] SubTask 12.2: `tsc --noEmit` 无新增错误
  - [ ] SubTask 12.3: 手动验证扫描目录导入流程
  - [ ] SubTask 12.4: 手动验证本地歌曲播放
  - [ ] SubTask 12.5: 手动验证自动导入（下载完成触发）
  - [ ] SubTask 12.6: 手动验证设置页配置生效

# Task Dependencies
- Task 1 → Task 2（命令依赖数据库和扫描函数）
- Task 1 → Task 3（监控依赖扫描函数）
- Task 2 → Task 6（store 依赖命令）
- Task 4 → Task 9（CSP 改造后才能播放本地文件）
- Task 5 → Task 6（store 依赖类型和配置）
- Task 5 → Task 10（设置页依赖配置字段）
- Task 6 → Task 7（页面依赖 store）
- Task 6 → Task 8（Sidebar 数量依赖 store）
- Task 6 → Task 11（下载回调依赖 store）
- Task 7 → Task 8（路由依赖页面）
- Task 9 独立于 Task 6/7（可并行，但依赖 Task 4 CSP）
- Task 1、Task 4、Task 5 可独立并行
- Task 12 依赖所有前置任务完成
