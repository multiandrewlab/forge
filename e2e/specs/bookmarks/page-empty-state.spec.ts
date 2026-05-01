import { test, expect } from '../../fixtures/reset.js';

test('bookmarks: /bookmarks page shows empty-state when user has no bookmarks', async ({
  actor,
}) => {
  // Defensive cleanup: under workers > 1, another concurrent spec may add a
  // bookmark for actor between this test's reset and its assertion. To make
  // the assertion robust, fetch the current bookmark list and toggle each one
  // off before navigating. This is idempotent — if no bookmarks exist (the
  // common case post-reset), the loop is a no-op.
  const refresh = await actor.request.post('/api/auth/refresh');
  expect(refresh.ok()).toBe(true);
  const { accessToken } = (await refresh.json()) as { accessToken: string };
  const auth = { Authorization: `Bearer ${accessToken}` };
  const list = await actor.request.get('/api/bookmarks?limit=100', { headers: auth });
  expect(list.ok()).toBe(true);
  const { posts } = (await list.json()) as { posts: { id: string }[] };
  for (const p of posts) {
    const toggleRes = await actor.request.post(`/api/posts/${p.id}/bookmark`, {
      headers: auth,
      data: {},
    });
    expect(toggleRes.ok()).toBe(true);
  }

  await actor.goto('/bookmarks');
  await expect(actor.getByTestId('empty-state')).toBeVisible();
  await expect(actor.getByTestId('empty-state-message')).toHaveText('No bookmarked posts yet');
});
