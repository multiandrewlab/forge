import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'github-scripts',
    include: ['__tests__/**/*.test.ts'],
    environment: 'node',
  },
});
