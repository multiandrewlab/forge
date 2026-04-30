import { test as authTest } from './auth.js';

const API_BASE = process.env.API_URL ?? 'http://localhost:3001';

/**
 * Re-export the auth-extended test, with an auto-applied DB reset that
 * runs before every test as part of fixture setup. Specs opt out via
 * Playwright's tag mechanism: `test('fresh register', { tag: '@no-reset' }, ...)`.
 *
 * Implemented as an auto-fixture (rather than a top-level test.beforeEach)
 * so it fires for every test in every spec file that imports this `test`.
 * A top-level beforeEach declared in this fixture file only fires for
 * tests in the same file scope as the declaration, which is empty —
 * leading to silent state-leakage between specs that share seeded
 * fixtures (e.g. the cheatsheet vote_count baseline).
 */
type ResetFixtures = {
  resetDatabase: undefined;
};

export const test = authTest.extend<ResetFixtures>({
  resetDatabase: [
    async ({ request }, use, testInfo) => {
      if (!testInfo.tags.includes('@no-reset')) {
        const secret = process.env.E2E_SECRET;
        if (!secret) {
          throw new Error('[e2e/reset] process.env.E2E_SECRET unset — global-setup did not run.');
        }
        const res = await request.post(`${API_BASE}/api/__test__/reset`, {
          headers: { 'X-E2E-Secret': secret },
        });
        if (!res.ok()) {
          const body = await res.text().catch(() => '<unreadable>');
          throw new Error(`[e2e/reset] reset failed: HTTP ${res.status()}\n${body}`);
        }
      }
      await use(undefined);
    },
    { auto: true },
  ],
});

export { expect } from './auth.js';
