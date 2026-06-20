# 集成 & 加固 Spec (M5)

## Why
M3 和 M4 代码已编写完成，E2E 测试 55/55 通过，TypeScript 编译 0 错误。但 challenger-m2 测试暴露了 AudioEngine 的 ended 事件处理存在状态快照 bug（state 变量未重新获取导致 next 后不自动播放），需要修复。此外需要确保生产构建能正常打包、sidecar 正确嵌入、窗口效果工作。

## What Changes
- 修复 `src/services/AudioEngine.ts` 的 ended 事件状态快照 bug
- 更新 `e2e-tests/src/tests/challenger-m2.test.ts` 中已知的 bug 标记测试（修复后应通过）
- 验证 `npm run tauri build` 生产构建成功
- 验证 sidecar 在 Tauri 环境中正确启动
- 补充前端 qrcDecoder 的单元测试到 e2e-tests

## Impact
- Affected code: `AudioEngine.ts`, `challenger-m2.test.ts`
- 新增文件: `e2e-tests/src/tests/qrc-decoder-frontend.test.ts`（前端解码器对照测试）

## ADDED Requirements

### Requirement: AudioEngine ended 事件正确自动播放下一首
AudioEngine 的 ended 事件处理 SHALL 在调用 `next()` 后重新获取最新 state，正确判断是否有下一首并自动播放。

#### Scenario: 播放结束自动切到下一首
- **WHEN** 当前歌曲播放结束触发 ended 事件，且队列中还有下一首
- **THEN** 自动调用 `next()` 切到下一首，获取播放 URL 并开始播放

#### Scenario: 队列末尾播放结束
- **WHEN** 当前歌曲播放结束触发 ended 事件，且已是队列最后一首
- **THEN** 停止播放，`isPlaying` 设为 false

### Requirement: 前端 QRC 解码器与 E2E 解码器输出一致
前端 `src/utils/qrcDecoder.ts` 的解码结果 SHALL 与 e2e-tests 中的 `decryptQrcCryptoJs` + `parseQrc` 输出一致。

#### Scenario: 相同输入产生相同输出
- **WHEN** 使用 qrcFixture 的 ciphertextBase64 作为输入
- **THEN** 前端 `decodeQRC` 的输出等于 e2e `parseQrc(decryptQrcCryptoJs(ciphertextBase64))` 的输出

### Requirement: 生产构建成功
`npm run tauri build` SHALL 成功生成安装包。

#### Scenario: 构建无错误
- **WHEN** 运行 `npm run tauri build`
- **THEN** 构建成功完成，在 `src-tauri/target/release/bundle/` 下生成安装包
