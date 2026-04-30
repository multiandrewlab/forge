import { test, expect } from '../../fixtures/reset.js';
import { request as plainRequest } from '@playwright/test';

test('voting: POST /vote without auth returns 401', { tag: '@no-reset' }, async () => {
  // Voting requires auth (votes.ts:9 → preHandler: [app.authenticate]).
  // Use a clean APIRequestContext (no storage state, no cookies, no token)
  // and assert the API returns 401 directly.
  const ctx = await plainRequest.newContext();
  const cheatsheetId = 'c0000000-0000-0000-0000-000000000001';
  const res = await ctx.post(`http://localhost:3001/api/posts/${cheatsheetId}/vote`, {
    data: { value: 1 },
  });
  expect(res.status()).toBe(401);
  await ctx.dispose();
});
