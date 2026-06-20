# 动态主题 & Glassmorphism 打磨 Spec

## Why
当前 UI 使用硬编码颜色，所有组件共用同一个静态主题色。需要从专辑封面提取主色调动态更新界面，同时补全设计系统（tokens.css / glass.css）和过渡动画，让界面接近 Spotify/Apple Music 的视觉品质。

## What Changes
- 安装 `node-vibrant`、`framer-motion` 依赖
- 新增 `src/styles/tokens.css`：设计 token 变量（颜色、圆角、间距、模糊等）
- 新增 `src/styles/glass.css`：Glassmorphism 工具类
- 新增 `src/utils/colorExtractor.ts`：从封面图片提取主色调并更新 CSS 变量
- 修改 `src/styles/global.css`：导入 tokens.css 和 glass.css
- 修改 `src/stores/playbackStore.ts`：添加 `themeColor` 状态和 `setThemeColor` action
- 修改 `src/components/PlayerBar.tsx`：切歌时提取封面颜色更新主题
- 修改 `src/components/LyricsView.tsx`：歌词面板使用主题色 + framer-motion 动画
- 修改 `src/App.tsx`：歌词面板过渡改用 framer-motion AnimatePresence
- 修改 `src/components/SearchPage.tsx`：搜索结果行使用 glass 类 + hover 动画

## Impact
- Affected code: `global.css`, `playbackStore.ts`, `PlayerBar.tsx`, `LyricsView.tsx`, `App.tsx`, `SearchPage.tsx`, `package.json`
- 新增文件: `tokens.css`, `glass.css`, `colorExtractor.ts`
- 依赖: `node-vibrant`, `framer-motion`

## ADDED Requirements

### Requirement: 设计 Token 系统
系统 SHALL 通过 CSS 变量定义所有设计 token，组件通过变量引用而非硬编码值。

#### Scenario: tokens.css 定义完整变量
- **WHEN** 应用加载
- **THEN** `:root` 上挂载 `--color-primary`、`--color-primary-20`、`--color-primary-10`、`--glass-1/2/3`、`--glass-border`、`--blur-sm/md/lg`、`--radius-sm/md/lg/xl`、`--player-bar-height`、`--sidebar-width`、`--titlebar-height`、`--font-main` 等变量

### Requirement: Glassmorphism 工具类
系统 SHALL 提供 `.glass` 和 `.glass-hover` CSS 类。

#### Scenario: glass 类应用毛玻璃效果
- **WHEN** 元素添加 `.glass` 类
- **THEN** 元素获得半透明背景 + backdrop-filter 模糊 + 微边框

#### Scenario: glass-hover 类提供悬停反馈
- **WHEN** 元素添加 `.glass-hover` 类且鼠标悬停
- **THEN** 背景变亮，0.15s 过渡

### Requirement: 封面取色动态主题
系统 SHALL 从当前播放歌曲的封面图片提取主色调并更新 CSS 变量。

#### Scenario: 切歌时提取颜色
- **WHEN** 当前播放歌曲变更且封面 URL 可用
- **THEN** 使用 node-vibrant 从封面提取 Vibrant 色，更新 `--color-primary` 及其派生变量

#### Scenario: 提取失败回退
- **WHEN** 封面取色失败（图片加载失败、跨域等）
- **THEN** 保持当前主题色不变，不报错

#### Scenario: 无封面时使用默认色
- **WHEN** 当前歌曲无封面
- **THEN** 主题色保持默认 `#6366f1`

### Requirement: Framer Motion 动画
系统 SHALL 使用 framer-motion 为关键交互添加流畅动画。

#### Scenario: 歌词面板滑入滑出
- **WHEN** 用户点击歌词按钮
- **THEN** 歌词面板以 framer-motion 动画滑入/滑出（替代 CSS transform）

#### Scenario: 歌词行切换动画
- **WHEN** 当前行变更
- **THEN** 歌词行有 framer-motion 布局动画（scale + opacity 过渡）

#### Scenario: 搜索结果行出现动画
- **WHEN** 搜索结果加载完成
- **THEN** 结果行以 stagger 动画依次出现
