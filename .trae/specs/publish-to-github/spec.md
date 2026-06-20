# 发布到 GitHub Spec

## Why
项目已完成核心功能（在线搜索播放、下载管理、本地音乐库、QRC 歌词、封面歌词补齐），需要发布到 GitHub 供用户下载使用，并补齐关于页面的真实跳转链接和检查更新功能。当前项目未初始化 git，无 README，关于页面的链接和"检查更新"按钮都是死按钮。

## What Changes
- 创建 LICENSE 文件（CC BY-NC 4.0，禁止商业用途）
- 创建 README.md（参考同类 Tauri 音乐项目结构：简介、功能特性、下载、开发指南、技术栈、许可证）
- 关于页面 4 个跳转链接改成真实仓库地址 `https://github.com/Ianzhyh/melodix`
- 实现检查更新功能：Rust command 调 GitHub Releases API 对比版本号，前端按钮点击后用对话框提示用户去 release 页下载
- 初始化 git 仓库，首次提交所有代码
- 用 gh CLI 创建公开仓库 `Ianzhyh/melodix` 并推送
- 用 `tauri build` 打包 Windows 安装包（msi + nsis exe）
- 用 `gh release create v0.1.0` 上传安装包到 GitHub Releases

## Impact
- Affected code: `src/components/SettingsPage.tsx`（跳转链接真实化 + 检查更新按钮）、`src-tauri/src/main.rs`（新增 check_for_update command）、`src-tauri/Cargo.toml`（可能加 reqwest json feature）
- 新增文件：`README.md`、`LICENSE`
- 不改动现有功能逻辑，仅新增发布相关能力

## ADDED Requirements

### Requirement: 真实的检查更新功能
系统 SHALL 在关于页面"Check for Updates"按钮点击时，调用后端 command 检查 GitHub Releases 是否有比当前版本更新的版本，并用对话框告知用户结果。

#### Scenario: 有新版本
- **WHEN** 用户点击"Check for Updates"且 GitHub 上存在比 0.1.0 更新的 release
- **THEN** 弹出对话框显示新版本号和更新说明，提供"去下载"按钮（在系统浏览器打开 release 页）

#### Scenario: 已是最新版本
- **WHEN** 用户点击"Check for Updates"且当前版本已是最新
- **THEN** 弹出对话框提示"当前已是最新版本"

#### Scenario: 检查失败
- **WHEN** 网络错误或 GitHub API 不可达
- **THEN** 弹出对话框提示"检查更新失败，请稍后重试"

### Requirement: 真实的跳转链接
关于页面 4 个链接（GitHub Repository / Documentation & Guides / Report an Issue / Privacy Policy）SHALL 指向真实仓库地址，点击在系统默认浏览器打开。

### Requirement: GitHub 仓库与 Release
项目 SHALL 发布到公开仓库 `https://github.com/Ianzhyh/melodix`，并创建 v0.1.0 release 附带 Windows 安装包（msi + nsis exe）。

## MODIFIED Requirements

### Requirement: 关于页面
关于页面的跳转链接从占位符 `#` 改为真实仓库地址；"Check for Updates"按钮从无响应改为真实检查 GitHub Releases。

## 安全复查
上传前 SHALL 确认：无硬编码凭证、.gitignore 完整、sidecar 仅监听 127.0.0.1、无 81MB 二进制被提交、.agents/ 目录被忽略。此前已修复这些问题，发布前做最终确认。
