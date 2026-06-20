# Tasks

- [x] Task 1: 替换 sidecar 为 meting-api
  - [x] SubTask 1.1: 复制 `D:\IanMusic\meting-api\server.js` 到 `D:\IANMUSICD\melodix\meting-server\server.js`
  - [x] SubTask 1.2: 复制 `D:\IanMusic\meting-api\qrc-decrypt.js` 到 `D:\IANMUSICD\melodix\meting-server\qrc-decrypt.js`
  - [x] SubTask 1.3: 复制 `D:\IanMusic\meting-api\platforms\` 目录到 `D:\IANMUSICD\melodix\meting-server\platforms\`
  - [x] SubTask 1.4: 更新 `meting-server/package.json`，添加 meting-api 的依赖（meting, qrcode）
  - [x] SubTask 1.5: 在 meting-server 目录运行 `npm install`
  - [x] SubTask 1.6: 用 `npm run build` 重新打包 sidecar exe

- [x] Task 2: 更新前端 API 调用（searchStore、PlayerBar、AudioEngine）
  - [x] SubTask 2.1: 更新 `searchStore.ts`：搜索改为 `/search?server=tencent&id=关键词`
  - [x] SubTask 2.2: 更新 `PlayerBar.tsx`：URL 改为 `/url?server=tencent&id=xxx`，歌词改为 `/lyric?server=tencent&id=xxx`，封面改为 `/pic?server=tencent&id=xxx`
  - [x] SubTask 2.3: 更新 `AudioEngine.ts`：ended 事件中的 URL 获取改为新格式
  - [x] SubTask 2.4: 所有 API 请求添加 Cookie 请求头（从 configStore 读取）

- [x] Task 3: 添加 Cookie 存储到 configStore
  - [x] SubTask 3.1: 在 `configStore.ts` 中添加 `cookies` 状态（`{ tencent?: string, netease?: string, kugou?: string, kuwo?: string }`）
  - [x] SubTask 3.2: 添加 `setCookie(platform, cookie)` action
  - [x] SubTask 3.3: 使用 localStorage 持久化 Cookie

- [x] Task 4: 创建侧边栏组件
  - [x] SubTask 4.1: 创建 `src/components/Sidebar.tsx`，包含搜索和设置图标按钮
  - [x] SubTask 4.2: 侧边栏宽度 56px（图标模式），图标用 SVG

- [x] Task 5: 创建设置页面
  - [x] SubTask 5.1: 创建 `src/components/SettingsPage.tsx`，包含各平台 Cookie 输入框
  - [x] SubTask 5.2: 保存按钮：保存到 configStore + 调用 sidecar `/api/cookie` POST 接口

- [x] Task 6: 更新 App.tsx 集成侧边栏
  - [x] SubTask 6.1: 添加 Sidebar 组件
  - [x] SubTask 6.2: 添加页面路由状态（search / settings）
  - [x] SubTask 6.3: 主内容区根据路由状态显示 SearchPage 或 SettingsPage

- [x] Task 7: 本地测试
  - [x] SubTask 7.1: 启动 meting-api sidecar（node server.js），用 "unhappy" 测试搜索和播放
  - [x] SubTask 7.2: 确认搜索结果有 URL、能播放、歌词能获取

- [x] Task 8: 编译验证
  - [x] SubTask 8.1: `npx tsc --noEmit` 通过
  - [x] SubTask 8.2: 重新打包 sidecar exe
  - [x] SubTask 8.3: `npm run tauri dev` 启动应用，端到端测试

# Task Dependencies
- [Task 2] depends on [Task 1] (需要新 sidecar API 格式)
- [Task 2] depends on [Task 3] (需要 Cookie 存储)
- [Task 5] depends on [Task 3] (设置页面需要 configStore)
- [Task 6] depends on [Task 4, 5] (集成侧边栏和设置页面)
- [Task 7] depends on [Task 1] (需要 sidecar 运行)
- [Task 8] depends on [Task 1, 2, 3, 4, 5, 6, 7] (全部完成后验证)
