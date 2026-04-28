import { test as authTest } from './auth.js';

const API_BASE = process.env.API_URL ?? 'http://localhost:3001';

/**
 * Re-export the auth-extended test, plus an auto-applied beforeEach that
 * resets the database via the foundation #44 endpoint. Specs opt out via
 * Playwright's tag mechanism: `test('fresh register', { tag: '@no-reset' }, ...)`.
 */
export const test = authTest.extend<Record<string, never>>({});

test.beforeEach(async ({ request }, testInfo) => {
  if (testInfo.tags.includes('@no-reset')) return;
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
});

export { expect } from './auth.js';
