* [x] crypto-js、pako 及类型声明已安装，package.json 正确

* [x] qrcDecoder.ts 能正确解密+解压+解析 e2e-tests 中的 qrcFixture 数据，输出与 expectedLines 一致

* [x] qrcDecoder.ts 对空字符串和无效数据返回空数组，不抛异常

* [x] playbackStore 包含 lyrics、activeLine 状态和 setLyrics、setActiveLine actions

* [x] 切歌时 lyrics 重置为 \[]、activeLine 重置为 -1

* [x] LyricsView 当前行高亮（字体放大、主题色、其余行半透明）

* [x] LyricsView 当前行自动滚动到可视区域中心

* [x] LyricsView 逐字进度动画正常工作

* [x] LyricsView 无歌词时显示"暂无歌词"

* [x] App.tsx 中歌词 placeholder 已替换为 LyricsView 组件

* [x] 切歌时自动拉取歌词并解码，成功后更新 store

* [x] 歌词获取失败时不阻塞播放，lyrics 为空数组

* [x] TypeScript 编译无错误

