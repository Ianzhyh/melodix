import { defineConfig } from 'vitest/config';

process.env.FORCE_MOCK_SIDECAR = 'true';

export default defineConfig({
  test: {
    environment: 'node',
  },
  server: {
    fs: {
      // 允许测试导入应用 public/ 下的 DSP worklet 源文件做数值验证
      allow: ['..'],
    },
  },
});
