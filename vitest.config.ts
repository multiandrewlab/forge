import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: [
        'packages/server/src/**/*.ts',
        'packages/client/src/**/*.{ts,vue}',
      ],
      exclude: [
        'packages/server/src/server.ts',
        'packages/client/src/main.ts',
        'packages/client/src/plugins/router.ts',
        '**/*.config.*',
        '**/*.d.ts',
        '**/.*',
      ],
      thresholds: {
        lines: 100,
        branches: 100,
        functions: 100,
        statements: 100,
      },
    },
  },
});
