import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Client package has its own vitest config with Vue plugin — exclude here
    exclude: ['packages/client/**', 'node_modules/**'],
    passWithNoTests: true,
  },
});
