# Melodix

Melodix 是一个基于 Tauri + React 的跨平台桌面音乐播放器，支持在线搜索播放、本地音乐管理、QRC 逐字歌词等功能。

## 功能特性

- 在线音乐搜索与播放（QQ音乐、网易云音乐多源支持）
- 下载管理（任务队列、断点续传、优先级控制、自动重试）
- 本地音乐库（自动导入、元数据解析、封面与歌词自动补齐）
- QRC 逐字歌词（QQ音乐字符级时间轴，支持翻译）
- 收藏与歌单管理
- 玻璃拟态 UI 设计，支持主题切换
- 离线可用（封面歌词本地持久化，断网不丢失）

## 下载安装

前往 [GitHub Releases](https://github.com/Ianzhyh/melodix/releases) 页面下载最新版本。

Windows 用户下载 `.msi` 或 `.exe` 安装包，双击运行按提示完成安装即可。

## 开发指南

### 环境要求

- Node.js 18+
- Rust（stable）
- Windows SDK（Windows）/ Xcode（macOS）

### 常用命令

```bash
npm install        # 安装依赖
npm run tauri dev  # 开发模式
npm run tauri build # 打包
```

## 技术栈

- 前端：React 19、TypeScript、Zustand、Framer Motion、Vite
- 后端：Tauri 2 (Rust)、rusqlite、lofty、reqwest
- Sidecar：Node.js (meting-api)

## 许可证

本项目采用 [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) 许可证授权，禁止商业用途。详见 [LICENSE](./LICENSE) 文件。
