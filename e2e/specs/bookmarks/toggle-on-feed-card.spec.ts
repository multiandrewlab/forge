import { test, expect } from '../../fixtures/reset.js';
import { bookmarks } from '../../fixtures/selectors/bookmarks.js';

test('bookmarks: per-card toggle on the feed (off → on → off) on a fresh post', async ({
  testuser,
}) => {
  // Use a freshly created post + scope locator to its data-post-id so the
  // assertion is immune to cross-worker contention on shared seed state.
  const refresh = await testuser.request.post('/api/auth/refresh');
  const { accessToken } = (await refresh.json()) as { accessToken: string };
  const created = await testuser.request.post('/api/posts', {
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
  const {
    post: { id: postId },
  } = (await created.json()) as { post: { id: string } };

  await testuser.goto('/');
  // Initially: no on-icon on the fresh post's card.
  await expect(bookmarks.feedOnIconOnCard(testuser, postId)).toHaveCount(0);

  await bookmarks.feedToggleOnCard(testuser, postId).click();
  await expect(bookmarks.feedOnIconOnCard(testuser, postId)).toBeVisible();

  await bookmarks.feedToggleOnCard(testuser, postId).click();
  await expect(bookmarks.feedOnIconOnCard(testuser, postId)).toHaveCount(0);
});
