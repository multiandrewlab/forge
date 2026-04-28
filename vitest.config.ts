import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
    coverage: {
      provider: 'v8',
      include: [
        'packages/server/src/**/*.ts',
        'packages/client/src/**/*.{ts,vue}',
        'packages/shared/src/**/*.ts',
      ],
      exclude: [
        'packages/server/src/server.ts',
        'packages/server/src/db/queries/types.ts',
        'packages/client/src/main.ts',
        'packages/shared/src/index.ts',
        'packages/shared/src/constants/index.ts',
        'packages/shared/src/types/index.ts',
        'packages/shared/src/types/user.ts',
        'packages/shared/src/types/post.ts',
        'packages/shared/src/types/feed.ts',
        'packages/shared/src/types/vote.ts',
        'packages/shared/src/types/bookmark.ts',
        'packages/shared/src/types/tag.ts',
        'packages/shared/src/types/comment.ts',
        'packages/shared/src/types/file.ts',
        'packages/shared/src/types/mock-script-keys.ts',
        'packages/shared/src/types/profile.ts',
        'packages/shared/src/validators/index.ts',
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
