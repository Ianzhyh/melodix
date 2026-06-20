# 本地音乐导入系统 Spec

## Why
项目当前是纯在线音乐播放器，所有数据来自 sidecar meting-api。下载功能完成后文件散落在下载目录，无法被播放器识别和管理。用户需要一个完整的本地音乐导入系统：自动监控下载目录导入新文件、手动选择文件/文件夹导入、解析元数据（歌名/艺术家/专辑/封面）、本地音乐库页面浏览和播放。

## What Changes
- **新增 Rust 依赖**：`notify`（文件监控）、`lofty`（音频元数据解析）、`rusqlite`（bundled，SQLite 数据库）
- **新建 `src-tauri/src/local_music.rs` 模块**：扫描目录、解析元数据、SQLite CRUD、文件监控
- **新增 Tauri 命令**：`scan_local_music`（扫描指定目录）、`get_local_songs`（分页查询）、`watch_download_dir`（启动监控）、`stop_watch`（停止监控）、`delete_local_song`（删除记录）、`get_local_song_count`（统计数量）
- **新建 `src/stores/localLibraryStore.ts`**：本地音乐库状态管理（歌曲列表、加载、搜索、导入进度）
- **新建 `src/components/LocalLibraryPage.tsx`**：本地音乐库页面（歌曲列表、搜索、导入按钮、进度反馈）
- **扩展 `src/types/playback.ts` Song 类型**：新增 `filePath?: string`、`isLocal?: boolean`、`format?: string` 字段
- **扩展 `src/stores/configStore.ts`**：新增 `localLibraryPath`（本地库根目录）、`autoImportOnDownload`（下载完成自动导入）、`importMode`（copy/index）
- **扩展 `src/components/SettingsPage.tsx`**：新增 Library tab（库目录、自动导入开关、导入模式、支持格式、手动导入按钮、重新扫描按钮）
- **扩展 `src/components/Sidebar.tsx`**：Your Library 区块新增「本地音乐」入口 + 歌曲数量
- **扩展 `src/App.tsx`**：新增 `local-library` 路由
- **改造 `src/services/AudioEngine.ts`**：支持本地文件 URL（通过 `convertFileSrc`）
- **改造 `src/components/PlayerBar/index.tsx`**：本地歌曲（`source === 'local'`）跳过 sidecar URL 获取，直接用 `convertFileSrc(filePath)` 播放
- **改造 `src-tauri/tauri.conf.json` CSP**：允许 `asset:` 协议用于本地文件播放和封面
- **改造 `src/utils/cover.ts`**：本地封面路径通过 `convertFileSrc` 转换
- **downloadStore 下载完成回调**：触发自动导入（若 `autoImportOnDownload` 开启）

## Impact
- Affected code:
  - `src-tauri/Cargo.toml` — 新增 notify/lofty/rusqlite 依赖
  - `src-tauri/src/main.rs` — 注册新命令、模块声明、数据库初始化
  - `src-tauri/src/local_music.rs`（新建）— 扫描/元数据/数据库/监控
  - `src-tauri/tauri.conf.json` — CSP 改造 + asset 协议配置
  - `src-tauri/capabilities/default.json` — fs 权限
  - `src/types/playback.ts` — Song 类型扩展
  - `src/stores/localLibraryStore.ts`（新建）— 本地库状态
  - `src/stores/configStore.ts` — 新增本地库配置字段
  - `src/stores/downloadStore.ts` — 下载完成回调触发导入
  - `src/components/LocalLibraryPage.tsx`（新建）— 本地库页面
  - `src/components/SettingsPage.tsx` — Library tab
  - `src/components/Sidebar.tsx` — 本地音乐入口
  - `src/App.tsx` — 路由
  - `src/services/AudioEngine.ts` — 本地文件播放支持
  - `src/components/PlayerBar/index.tsx` — 本地歌曲播放分支
  - `src/utils/cover.ts` — 本地封面转换

## ADDED Requirements

### Requirement: 目录扫描与元数据解析
系统 SHALL 扫描指定目录及其子目录，识别支持的音乐文件格式（MP3/FLAC/WAV/AAC/M4A/OGG），解析元数据（歌名、艺术家、专辑、封面、时长、比特率），存入 SQLite 数据库。

#### Scenario: 扫描目录
- **WHEN** 用户触发扫描或自动导入
- **THEN** 递归遍历目录，对每个支持格式的文件用 lofty 解析元数据
- **AND** 将解析结果存入 SQLite（文件路径作为唯一键，重复文件跳过）
- **AND** 通过 Tauri event 上报扫描进度（已扫描数/总数/当前文件名）

#### Scenario: 元数据缺失
- **WHEN** 文件无元数据标签
- **THEN** 歌名用文件名（去扩展名），艺术家/专辑为空字符串，封面为空

#### Scenario: 文件损坏
- **WHEN** lofty 解析失败
- **THEN** 跳过该文件，记录到错误列表，不中断扫描

### Requirement: SQLite 数据库存储
系统 SHALL 使用 SQLite 数据库存储本地音乐库，数据库文件位于 app local data 目录。

#### Scenario: 数据库结构
- **WHEN** 首次启动
- **THEN** 创建 `local_music` 表：`id INTEGER PRIMARY KEY, file_path TEXT UNIQUE, title TEXT, artist TEXT, album TEXT, cover_path TEXT, duration INTEGER, bitrate INTEGER, format TEXT, file_size INTEGER, created_at INTEGER`

#### Scenario: 重复导入
- **WHEN** 扫描到已存在的 file_path
- **THEN** 跳过该文件（INSERT OR IGNORE）

### Requirement: 自动导入（下载目录监控）
系统 SHALL 监控下载目录，当有新音乐文件下载完成时自动扫描导入。

#### Scenario: 下载完成自动导入
- **WHEN** `autoImportOnDownload` 为 true 且下载目录有新文件
- **THEN** 延迟 2 秒（等文件写入完成）后扫描该文件
- **AND** 解析元数据并存入数据库
- **AND** 通过 Tauri event 通知前端刷新本地库

#### Scenario: 自动导入关闭
- **WHEN** `autoImportOnDownload` 为 false
- **THEN** 不监控下载目录，需手动触发导入

### Requirement: 手动导入
系统 SHALL 提供手动导入界面，支持选择单个文件、多个文件或整个文件夹。

#### Scenario: 选择文件导入
- **WHEN** 用户点击「导入文件」并选择一个或多个音乐文件
- **THEN** 对选中文件解析元数据并存入数据库
- **AND** 显示导入结果（成功数、跳过数、失败数）

#### Scenario: 选择文件夹导入
- **WHEN** 用户点击「导入文件夹」并选择一个目录
- **THEN** 递归扫描该目录，导入所有支持格式的文件

### Requirement: 导入配置
系统 SHALL 在设置页面提供导入配置选项。

#### Scenario: 配置项
- **WHEN** 用户打开设置 Library tab
- **THEN** 可配置：本地库根目录、自动导入开关、导入模式（复制/索引）、支持格式列表

#### Scenario: 导入模式 - 复制
- **WHEN** 导入模式为「复制」
- **THEN** 将文件复制到本地库根目录的 music/ 子目录下，数据库记录新路径

#### Scenario: 导入模式 - 索引
- **WHEN** 导入模式为「索引」
- **THEN** 不复制文件，数据库记录原文件路径

### Requirement: 导入反馈
系统 SHALL 在导入过程中显示进度，完成后提供详细报告。

#### Scenario: 导入进度
- **WHEN** 扫描进行中
- **THEN** 显示进度条（已扫描/总数）和当前文件名
- **AND** 通过 Tauri event 实时更新

#### Scenario: 导入完成报告
- **WHEN** 扫描完成
- **THEN** 显示 Toast：成功导入 X 首，跳过 Y 首（重复），失败 Z 首
- **AND** 失败文件列表可在设置页查看

### Requirement: 本地音乐库页面
系统 SHALL 提供本地音乐库页面，展示所有已导入的歌曲。

#### Scenario: 浏览本地库
- **WHEN** 用户点击侧边栏「本地音乐」
- **THEN** 显示所有本地歌曲列表（歌名、艺术家、专辑、时长、格式）
- **AND** 支持搜索（按歌名/艺术家/专辑过滤）
- **AND** 点击歌曲播放

#### Scenario: 空库状态
- **WHEN** 本地库无歌曲
- **THEN** 显示空状态提示「还没有本地音乐，点击导入按钮添加」+ 导入按钮

#### Scenario: 播放本地歌曲
- **WHEN** 用户点击本地歌曲
- **THEN** 通过 `convertFileSrc` 转换文件路径为可播放 URL
- **AND** 加入播放队列并开始播放

### Requirement: 本地文件播放
系统 SHALL 支持播放本地音乐文件。

#### Scenario: 播放本地文件
- **WHEN** 播放 `source === 'local'` 的歌曲
- **THEN** 跳过 sidecar URL 获取，直接用 `convertFileSrc(filePath)` 播放
- **AND** 跳过 sidecar 歌词获取（本地音乐无在线歌词）

#### Scenario: 本地封面显示
- **WHEN** 歌曲有嵌入封面（cover_path 不为空）
- **THEN** 通过 `convertFileSrc` 转换封面路径并显示

## MODIFIED Requirements

### Requirement: Song 类型
Song 接口新增 `filePath?: string`（本地文件绝对路径）、`isLocal?: boolean`、`format?: string`（mp3/flac/wav/aac/ogg）字段。

### Requirement: CSP 配置
tauri.conf.json CSP 的 `media-src` 和 `img-src` 新增 `asset:` 和 `https://asset.localhost` 协议，允许本地文件播放和封面显示。

### Requirement: 下载完成回调
downloadStore 下载完成时，若 `autoImportOnDownload` 为 true，触发本地音乐导入（invoke `scan_local_music` 扫描该文件）。
