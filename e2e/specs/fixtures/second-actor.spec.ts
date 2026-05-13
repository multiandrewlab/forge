import { test, expect } from '../../fixtures/reset.js';

/**
 * Smoke test for the secondActor fixture (issue #102 WU9 §9.0).
 *
 * Verifies that `actor` and `secondActor` resolve to two DIFFERENT e2e_wN
 * users so cross-user specs can rely on the second viewer not being the
 * author of resources owned by the first.
 *
 * The fixture cycles with wrap-around: parallelIndex N pairs with N+1 mod 4,
 * so every (actor, secondActor) pair is disjoint within the worker pool.
 */
async function getMe(page: import('@playwright/test').Page): Promise<{
  id: string;
  email: string;
}> {
  // Mint an access token from the refresh-token cookie (baked by
  // globalSetup), then hit /api/auth/me. Mirrors the pattern used by
  // publish-draft-to-public.spec.ts.
  const refresh = await page.request.post('/api/auth/refresh');
  if (!refresh.ok()) throw new Error(`refresh failed: ${refresh.status()}`);
  const { accessToken } = (await refresh.json()) as { accessToken: string };
  const me = await page.request.get('/api/auth/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!me.ok()) throw new Error(`me failed: ${me.status()}`);
  return (await me.json()) as { id: string; email: string };
}

test('secondActor: resolves to a different e2e_wN user than actor', async ({
  actor,
  secondActor,
}) => {
  const [actorMe, secondMe] = await Promise.all([getMe(actor), getMe(secondActor)]);

  expect(actorMe.email).toMatch(/^e2e_w[0-3]@example\.com$/);
  expect(secondMe.email).toMatch(/^e2e_w[0-3]@example\.com$/);
  expect(secondMe.id).not.toBe(actorMe.id);
  expect(secondMe.email).not.toBe(actorMe.email);
});
