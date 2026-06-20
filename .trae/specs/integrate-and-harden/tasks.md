# Tasks

- [x] Task 1: 修复 AudioEngine ended 事件状态快照 bug
  - [x] SubTask 1.1: 读取 AudioEngine.ts，定位 ended 事件处理函数中的 state 快照问题
  - [x] SubTask 1.2: 修复：在 `state.next()` 调用后重新 `usePlaybackStore.getState()` 获取最新 state
  - [x] SubTask 1.3: 确保修复后 next 分支能正确 fetch URL 并调用 play

- [x] Task 2: 更新 challenger-m2.test.ts 中 ended 事件测试的预期
  - [x] SubTask 2.1: 修复后，ended 事件测试中 `fetchMock` 应该被调用，`isPlaying` 应为 true
  - [x] SubTask 2.2: 移除测试中的 bug 标记注释

- [x] Task 3: 创建前端 QRC 解码器对照测试
  - [x] SubTask 3.1: 创建 `e2e-tests/src/tests/qrc-decoder-frontend.test.ts`
  - [x] SubTask 3.2: 导入前端 qrcDecoder（通过相对路径或复制逻辑），对照 qrcFixture 验证输出一致

- [x] Task 4: 运行全部 E2E 测试确认通过
  - [x] SubTask 4.1: `cd e2e-tests && npx vitest run`，确认 60 测试全部通过

- [x] Task 5: 验证生产构建
  - [x] SubTask 5.1: `npm run tauri build` 成功编译（melodix.exe 已生成）
  - [x] SubTask 5.2: MSI/NSIS 安装包因环境缺工具链未生成（非代码问题）

# Task Dependencies
- [Task 2] depends on [Task 1] (需要 AudioEngine 修复后才能更新测试预期)
- [Task 3] 无依赖，可与 Task 1 并行
- [Task 4] depends on [Task 1, 2, 3] (所有修复和新增测试完成后运行)
- [Task 5] depends on [Task 4] (测试通过后验证构建)
