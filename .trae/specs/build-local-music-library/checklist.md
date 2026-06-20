# Checklist

## 后端基础
- [x] Cargo.toml 新增 notify/lofty/rusqlite(bundled) 依赖，cargo check 通过
- [x] local_music.rs 模块创建，SQLite 数据库初始化（local_music 表）正确
- [x] main.rs 声明 mod local_music，setup 中初始化数据库并 manage 注册
- [x] scan_directory 递归扫描支持格式（MP3/FLAC/WAV/AAC/M4A/OGG），lofty 解析元数据
- [x] 重复文件（file_path 已存在）通过 INSERT OR IGNORE 跳过
- [x] 元数据缺失时歌名用文件名，不报错
- [x] 文件损坏时跳过并记录，不中断扫描

## Tauri 命令
- [x] scan_local_music 命令实现，通过 event 上报扫描进度
- [x] get_local_songs 命令实现，支持分页和模糊搜索
- [x] get_local_song_count 命令实现
- [x] delete_local_song 命令实现
- [x] import_files 命令实现（手动导入指定文件列表）
- [x] watch_download_dir 命令实现，notify 监控 + 延迟 2 秒扫描
- [x] stop_watch 命令实现
- [x] 所有命令注册到 generate_handler!

## CSP 与权限
- [x] tauri.conf.json CSP 的 media-src 和 img-src 包含 asset: 和 https://asset.localhost
- [x] asset 协议已启用配置
- [x] capabilities/default.json 包含必要的 fs 权限

## 前端类型与配置
- [x] Song 接口新增 filePath/isLocal/format 字段
- [x] configStore 新增 localLibraryPath/autoImportOnDownload/importMode 字段及 setter
- [x] 三个新配置字段持久化到 localStorage（melodix- 前缀）

## 本地音乐库 Store
- [x] localLibraryStore.ts 创建，状态定义完整（songs/totalCount/loading/searchQuery/scanProgress）
- [x] loadSongs 分页加载实现
- [x] search 搜索实现
- [x] scanDirectory 扫描 + 进度监听实现
- [x] importFiles 手动导入实现
- [x] deleteSong 删除实现
- [x] refreshCount 数量统计实现

## 本地音乐库页面
- [x] LocalLibraryPage.tsx 创建，列表样式与 FavoritesPage 一致
- [x] 顶部工具栏：搜索框 + 导入文件 + 导入文件夹 + 重新扫描按钮
- [x] 歌曲列表显示歌名/艺术家/专辑/时长/格式
- [x] 空状态提示 + 导入引导
- [x] 扫描进度条显示
- [x] 点击歌曲播放（setQueue + 播放）

## Sidebar 与路由
- [x] Sidebar Your Library 区块新增「本地音乐」入口 + 歌曲数量
- [x] App.tsx 新增 local-library 路由分支

## 本地文件播放
- [x] PlayerBar 判断 source==='local' 跳过 sidecar URL/歌词获取，用 convertFileSrc 播放
- [x] cover.ts 本地封面路径通过 convertFileSrc 转换
- [x] AudioEngine 能播放 convertFileSrc 返回的 URL

## 设置页面
- [x] SettingsPage 新增 library tab
- [x] Library tab 包含：库目录选择器、自动导入开关、导入模式选择、支持格式、手动导入、重新扫描
- [x] 自动导入开关变化时启动/停止文件监控

## 下载完成回调
- [x] downloadStore 下载成功后检查 autoImportOnDownload，为 true 时触发扫描导入
- [x] 导入成功后 toast 提示

## 验证
- [x] cargo check 通过
- [x] tsc --noEmit 无新增错误
- [ ] 扫描目录导入流程正常（成功/跳过/失败计数正确）
- [ ] 本地歌曲可播放（音频和封面正常显示）
- [ ] 下载完成后自动导入触发
- [ ] 设置页配置变更生效
- [ ] 搜索过滤正常
- [ ] 删除歌曲后列表刷新
