import { defineConfig } from 'vitest/config';

process.env.FORCE_MOCK_SIDECAR = 'true';

export default defineConfig({
  test: {
    environment: 'node',
  },
});
