import { test, expect } from '../../fixtures/reset.js';
import { bookmarks } from '../../fixtures/selectors/bookmarks.js';

test('bookmarks: per-card toggle on the feed (off → on → off) on a fresh post', async ({
  actor,
}) => {
  // Use a freshly created post + scope locator to its data-post-id so the
  // assertion is immune to cross-worker contention on shared seed state.
  const refresh = await actor.request.post('/api/auth/refresh');
  expect(refresh.ok()).toBe(true);
  const { accessToken } = (await refresh.json()) as { accessToken: string };
  const created = await actor.request.post('/api/posts', {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: {
      title: `Feed-card bookmark seed ${Date.now()}`,
      contentType: 'snippet',
      language: 'typescript',
      content: 'x',
      visibility: 'public',
      isDraft: false,
    },
  });
  expect(created.ok()).toBe(true);
  const {
    post: { id: postId },
  } = (await created.json()) as { post: { id: string } };

  await actor.goto('/');
  // Wait for the freshly-created card to render before asserting absence of the
  // bookmark icon — otherwise toHaveCount(0) passes vacuously while the card
  // is still loading.
  await expect(bookmarks.feedToggleOnCard(actor, postId)).toBeVisible();
  await expect(bookmarks.feedOnIconOnCard(actor, postId)).toHaveCount(0);

  await bookmarks.feedToggleOnCard(actor, postId).click();
  await expect(bookmarks.feedOnIconOnCard(actor, postId)).toBeVisible();

  await bookmarks.feedToggleOnCard(actor, postId).click();
  await expect(bookmarks.feedOnIconOnCard(actor, postId)).toHaveCount(0);
});
