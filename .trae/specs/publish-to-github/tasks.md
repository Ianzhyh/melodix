# Tasks

- [ ] Task 1: 安全最终复查
  - [ ] 确认凭证文件已删除（sidecar.log、qr_now.txt、qq_check_*.txt 不存在）
  - [ ] 确认 .gitignore 包含 .agents/、node.exe、*.db、qr_now.txt、qq_check_*.txt
  - [ ] 确认 server.js 监听 127.0.0.1
  - [ ] 确认 proxy.js 无硬编码 IP
  - [ ] 确认 capabilities 无 shell:allow-execute
  - [ ] 全局搜索硬编码 cookie/token/密钥（grep -ri "uin=" "refresh_token" "musickey" "gho_" 排除 node_modules）

- [ ] Task 2: 创建 LICENSE 文件
  - [ ] 创建 d:\IANMUSICD\melodix\LICENSE，内容为 CC BY-NC 4.0 完整法律文本

- [ ] Task 3: 创建 README.md
  - [ ] 参考 Musicat 项目结构，写：项目标题+简介、功能特性（emoji 列表）、下载安装（指向 GitHub Releases）、开发指南（环境要求+命令）、技术栈、许可证（CC BY-NC 4.0）
  - [ ] 功能特性覆盖：在线搜索播放（QQ/网易云）、下载管理、本地音乐库、QRC 逐字歌词、封面歌词补齐、收藏歌单

- [ ] Task 4: 关于页面跳转链接真实化
  - [ ] 修改 src/components/SettingsPage.tsx 第 15 行 GITHUB_REPO_URL 常量从占位符改为 'https://github.com/Ianzhyh/melodix'

- [ ] Task 5: 实现检查更新功能
  - [ ] src-tauri/src/main.rs 新增 check_for_update command：用 reqwest 调 https://api.github.com/repos/Ianzhyh/melodix/releases/latest，解析 tag_name 去掉 v 前缀，与当前版本（env!("CARGO_PKG_VERSION")）做 semver 字符串对比，返回 { hasUpdate, latestVersion, releaseUrl, notes }
  - [ ] 注册 check_for_update 到 invoke_handler
  - [ ] 确认 src-tauri/Cargo.toml 的 reqwest 已有 json feature（用于解析 GitHub API JSON 响应）
  - [ ] 修改 src/components/SettingsPage.tsx 关于页面"Check for Updates"按钮：点击调用 invoke('check_for_update')，用 @tauri-apps/plugin-dialog 的 message/ask 显示结果，有更新时提供"去下载"按钮调用 open_external_url 打开 releaseUrl

- [ ] Task 6: 验证编译
  - [ ] cd src-tauri && cargo check 通过
  - [ ] cd melodix && node node_modules/typescript/bin/tsc --noEmit 无新增错误

- [ ] Task 7: 初始化 git 并首次提交
  - [ ] git init
  - [ ] git add（确认 .gitignore 生效，不提交 node_modules、.agents、node.exe、*.db 等）
  - [ ] git commit -m "Initial release v0.1.0"

- [ ] Task 8: 创建 GitHub 仓库并推送
  - [ ] gh repo create Ianzhyh/melodix --public --source=. --remote=origin --description "Melodix - 跨平台音乐播放器（Tauri + React）"
  - [ ] git push -u origin main

- [ ] Task 9: 打包 Windows 安装包
  - [ ] 运行 npm run tauri build（生成 src-tauri/target/release/bundle/msi/*.msi 和 nsis/*.exe）
  - [ ] 确认安装包生成成功

- [ ] Task 10: 创建 GitHub Release v0.1.0
  - [ ] gh release create v0.1.0 <msi路径> <exe路径> --title "v0.1.0 - 首个公开版本" --notes "首个公开版本，包含在线搜索播放、下载管理、本地音乐库、QRC 歌词等功能"

# Task Dependencies
- Task 4, 5 依赖 Task 6 验证编译
- Task 7 依赖 Task 1-6（代码和文档就绪）
- Task 8 依赖 Task 7（有提交才能推送）
- Task 9 依赖 Task 6（编译通过才能打包）
- Task 10 依赖 Task 8 + Task 9（仓库存在 + 安装包就绪）
- Task 1-5 可并行（无相互依赖）
