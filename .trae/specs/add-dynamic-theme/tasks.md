# Tasks

- [x] Task 1: 安装 node-vibrant 和 framer-motion 依赖
  - [x] SubTask 1.1: `npm install node-vibrant framer-motion`
  - [x] SubTask 1.2: 验证 package.json 中依赖已正确添加

- [x] Task 2: 创建 src/styles/tokens.css — 设计 token 变量
  - [x] SubTask 2.1: 定义 `:root` 下的所有 CSS 变量（颜色、glass、模糊、圆角、尺寸、字体）
  - [x] SubTask 2.2: 在 global.css 中导入 tokens.css

- [x] Task 3: 创建 src/styles/glass.css — Glassmorphism 工具类
  - [x] SubTask 3.1: 定义 `.glass` 类（半透明背景 + backdrop-filter + 边框）
  - [x] SubTask 3.2: 定义 `.glass-hover` 类（悬停变亮 + 过渡）
  - [x] SubTask 3.3: 在 global.css 中导入 glass.css

- [x] Task 4: 创建 src/utils/colorExtractor.ts — 封面取色
  - [x] SubTask 4.1: 实现 `extractAndApplyTheme(imageUrl: string)` 函数
  - [x] SubTask 4.2: 使用 node-vibrant 提取 Vibrant 色
  - [x] SubTask 4.3: 更新 `--color-primary`、`--color-primary-20`、`--color-primary-10` CSS 变量
  - [x] SubTask 4.4: 失败时静默回退，不报错

- [x] Task 5: 扩展 playbackStore — 添加 themeColor 状态
  - [x] SubTask 5.1: 添加 `themeColor: string` 状态（默认 `#6366f1`）和 `setThemeColor` action
  - [x] SubTask 5.2: 切歌时重置 themeColor 为默认值

- [x] Task 6: PlayerBar 接入封面取色
  - [x] SubTask 6.1: 切歌时调用 colorExtractor 从封面提取颜色
  - [x] SubTask 6.2: 提取成功后更新 store 的 themeColor

- [x] Task 7: LyricsView 添加 framer-motion 动画
  - [x] SubTask 7.1: 歌词行使用 motion.div + layout 动画（scale + opacity）
  - [x] SubTask 7.2: 当前行切换时有平滑过渡效果

- [x] Task 8: App.tsx 歌词面板改用 framer-motion
  - [x] SubTask 8.1: 使用 AnimatePresence + motion.div 替代 CSS transform 动画
  - [x] SubTask 8.2: 保持滑入滑出效果

- [x] Task 9: SearchPage 添加 stagger 动画 + glass 类
  - [x] SubTask 9.1: 搜索结果行使用 motion.tr 依次出现（stagger 动画）
  - [x] SubTask 9.2: 结果行使用 `.glass` 类替代内联样式

# Task Dependencies
- [Task 2, 3] 无外部依赖，可并行
- [Task 4] depends on [Task 1] (需要 node-vibrant)
- [Task 5] 无外部依赖，可与 Task 4 并行
- [Task 6] depends on [Task 4, 5]
- [Task 7] depends on [Task 1] (需要 framer-motion)
- [Task 8] depends on [Task 1] (需要 framer-motion)
- [Task 9] depends on [Task 1, 3] (需要 framer-motion 和 glass.css)
