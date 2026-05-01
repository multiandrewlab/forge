import { test, expect } from '../../fixtures/reset.js';

test('a 401 from a feed request triggers the refresh interceptor', async ({ actor }) => {
  // Two distinct code paths fire `POST /api/auth/refresh`:
  //   1. Boot-time: `packages/client/src/lib/restore-session.ts:16` calls
  //      it on every authenticated app load to rehydrate the in-memory access
  //      token (Pinia ref at `packages/client/src/stores/auth.ts:6`).
  //   2. 401-triggered: `packages/client/src/lib/api.ts:65-67` retries through
  //      `/api/auth/refresh` when an authed request returns 401, the access
  //      token is set, and the failing url isn't itself /api/auth/refresh.
  //
  // We exercise path #2 by stubbing the first `/api/posts` request with a
  // 401, then assert the count of refresh calls reaches >=2 (one boot-time,
  // one 401-triggered). A single observation — "the 401-triggered refresh
  // path was exercised" — expressed as a count to coexist deterministically
  // with the boot-time refresh we cannot suppress.
  let refreshCount = 0;
  actor.on('request', (req) => {
    if (req.method() === 'POST' && req.url().includes('/api/auth/refresh')) {
      refreshCount += 1;
    }
  });

  // One-shot 401 on the feed; Playwright auto-detaches after `times: 1`,
  // so the post-refresh retry hits the real backend and the page recovers.
  await actor.route(
    '**/api/posts**',
    (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'expired' }),
      }),
    { times: 1 },
  );

  await actor.goto('/');

  await expect.poll(() => refreshCount, { timeout: 10_000 }).toBeGreaterThanOrEqual(2);
});
