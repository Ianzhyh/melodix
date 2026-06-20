# Tasks

## 第一批：高优先级 Bug 修复

- [x] Task 1: 修复 AudioEngine URL 匹配误判
  - [x] 1.1: 将 `this.audio.src === url || this.audio.src.endsWith(url)` 改为完整 URL 比较，移除 `endsWith` 判断
  - [x] 1.2: 验证切歌场景正常工作

- [x] Task 2: 修复 AudioEngine ended 事件竞态条件
  - [x] 2.1: 在 ended handler 中记录开始时的 songId，异步操作完成后校验 songId 是否仍是当前歌曲
  - [x] 2.2: 将动态 import() 改为顶部静态 import，减少延迟
  - [x] 2.3: 验证快速切歌时不会播放错误歌曲

- [x] Task 3: 修复 LyricsView RAF 空循环
  - [x] 3.1: 当 lyrics.length === 0 时不启动 RAF 循环
  - [x] 3.2: 当 activeLine < 0 时暂停逐字更新但仍保持 RAF（等待 activeLine 变化）
  - [x] 3.3: 验证无歌词时 CPU 占用正常

- [x] Task 4: 修复 PlaylistView useEffect 闭包过期
  - [x] 4.1: 将 loadPage 用 useCallback 包裹，正确声明依赖
  - [x] 4.2: 验证切换歌单/排行榜时数据正确加载

- [x] Task 5: 修复 server.js 双重 decodeURIComponent
  - [x] 5.1: 移除 handleSearch/handlePlaylist 等所有 handler 中手动的 decodeURIComponent 调用
  - [x] 5.2: 验证搜索含 `%` 字符的内容不再报错

- [x] Task 6: 修复 PlayerBar 主色 fallback 值
  - [x] 6.1: 将所有 `var(--color-primary, #22d3ee)` 替换为 `var(--color-primary, #6366f1)`
  - [x] 6.2: 验证按钮和进度条颜色一致

## 第二批：高优先级安全修复

- [x] Task 7: 修复 server.js 静态文件路径穿越
  - [x] 7.1: 在 serveStatic 中添加路径校验，解析后路径必须以 STATIC_ROOT 开头
  - [x] 7.2: 非法路径返回 403
  - [x] 7.3: 验证正常文件仍可访问，穿越路径被拒绝

- [x] Task 8: 修复 server.js /proxy-image SSRF
  - [x] 8.1: 定义音乐平台域名白名单（如 *.qq.com, *.126.net, *.kugou.com 等）
  - [x] 8.2: 校验目标 URL 域名在白名单内，否则返回 403
  - [x] 8.3: 验证正常图片代理仍工作，内网地址被拒绝

- [x] Task 9: 修复 main.rs download_file 任意文件写入
  - [x] 9.1: 从 configStore 获取用户配置的下载目录
  - [x] 9.2: 校验 dest_path 解析后在下载目录内
  - [x] 9.3: 非法路径返回错误
  - [x] 9.4: 验证正常下载仍工作，恶意路径被拒绝

## 第三批：代码质量修复

- [x] Task 10: 提取 Song 映射公共函数
  - [x] 10.1: 在 client.ts 中创建 `normalizeSong(raw, source)` 函数
  - [x] 10.2: 替换 search/getPlaylist/getNewSongs/getTencentPlaylist 中的重复映射逻辑
  - [x] 10.3: 验证搜索、歌单、排行榜数据仍正确显示

- [x] Task 11: 优化 AudioEngine Store 订阅
  - [x] 11.1: 将 `subscribe` 改为只订阅 volume 和 isMuted
  - [x] 11.2: 验证音量调节和静音切换仍正常工作

- [x] Task 12: 修复全局 CSS 类名冲突
  - [x] 12.1: FavoritesPage 的 .track-row/.track-index/.play-icon 添加 fv- 前缀
  - [x] 12.2: PlaylistView 的 .track-row/.track-index/.play-icon 添加 pv- 前缀
  - [x] 12.3: 验证两个页面的歌曲列表样式互不干扰

- [x] Task 13: 为 API 请求添加超时
  - [x] 13.1: 在 client.ts 的 request() 函数中添加 AbortSignal.timeout(10000)
  - [x] 13.2: 超时时返回友好错误信息
  - [x] 13.3: 验证正常请求不受影响，超时请求正确报错

- [x] Task 14: 为 Sidecar 就绪检查添加加载 UI
  - [x] 14.1: 在 App.tsx 的 sidecar 等待期间显示加载动画和提示文字
  - [x] 14.2: 验证启动时用户能看到加载状态而非空白页面

## 第四批：编译验证

- [x] Task 15: 编译验证并打包
  - [x] 15.1: 运行 TypeScript 编译检查
  - [x] 15.2: 运行 Vite 构建
  - [x] 15.3: 运行 Tauri 打包

# Task Dependencies
- Task 1, 2 可并行（都修改 AudioEngine.ts 但不同区域）
- Task 3, 4, 5, 6 可并行（不同文件）
- Task 7, 8, 9 可并行（不同文件）
- Task 10, 11, 12, 13, 14 可并行（不同文件）
- Task 15 依赖所有前置任务完成
