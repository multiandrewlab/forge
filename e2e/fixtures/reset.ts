import { request as plainRequest } from '@playwright/test';
import { test as authTest } from './auth.js';

const API_BASE = process.env.API_URL ?? 'http://localhost:3001';

/**
 * Re-export the auth-extended test, with an auto-applied DB reset that runs
 * before every test as part of fixture setup. Specs opt out via Playwright's
 * tag mechanism: `test('fresh register', { tag: '@no-reset' }, ...)`.
 *
 * Implementation notes:
 *
 * - Implemented as an auto-fixture rather than `test.beforeEach` because
 *   `test.beforeEach` registered in this fixture file only applies to tests
 *   literally defined here (none) — Playwright scopes beforeEach hooks to
 *   the file that calls them, not to the `test` object.
 * - The fixture is explicitly test-scoped (`scope: 'test'`) and creates its
 *   own APIRequestContext via `plainRequest.newContext()` instead of
 *   depending on the worker-scoped `request` fixture. Depending on
 *   worker-scoped fixtures would coerce the auto-fixture to worker-scope,
 *   firing the reset only once per worker — silent state-leak between tests.
 */
type ResetFixtures = {
  resetDatabase: undefined;
};

export const test = authTest.extend<ResetFixtures>({
  resetDatabase: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use, testInfo) => {
      if (!testInfo.tags.includes('@no-reset')) {
        const secret = process.env.E2E_SECRET;
        if (!secret) {
          throw new Error('[e2e/reset] process.env.E2E_SECRET unset — global-setup did not run.');
        }
        const ctx = await plainRequest.newContext();
        try {
          const workerId = String(testInfo.parallelIndex);
          const res = await ctx.post(`${API_BASE}/api/__test__/reset`, {
            headers: {
              'X-E2E-Secret': secret,
              'X-E2E-Worker-Id': workerId,
            },
          });
          if (!res.ok()) {
            const body = await res.text().catch(() => '<unreadable>');
            throw new Error(`[e2e/reset:w${workerId}] reset failed: HTTP ${res.status()}\n${body}`);
          }
        } finally {
          await ctx.dispose();
        }
      }
      await use(undefined);
    },
    { auto: true, scope: 'test' },
  ],
});

export { expect } from './auth.js';
