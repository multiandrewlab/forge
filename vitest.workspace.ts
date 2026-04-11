import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'packages/server/vitest.config.ts',
  'packages/client/vitest.config.ts',
  'packages/shared/vitest.config.ts',
]);
