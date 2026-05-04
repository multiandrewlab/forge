import { test, expect } from '../../fixtures/reset.js';

test('bookmarks: /bookmarks page shows empty-state when user has no bookmarks', async ({
  actor,
}) => {
  // Defensive cleanup. The per-worker reset auto-fixture DELETEs actor's
  // bookmarks before each test, so this loop is a no-op in the happy case.
  // It guards against a transient race where a previous test's mutation
  // hasn't fully settled by the time this test asserts the empty-state UI,
  // and incidentally forces the API to commit before the page renders.
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
  // Bookmarks page loads via async fetch; wait for the network to settle so the
  // skeleton transitions to either empty-state or list before we assert.
  await actor.waitForLoadState('networkidle');
  await expect(actor.getByTestId('empty-state')).toBeVisible();
  await expect(actor.getByTestId('empty-state-message')).toHaveText('No bookmarked posts yet');
});
