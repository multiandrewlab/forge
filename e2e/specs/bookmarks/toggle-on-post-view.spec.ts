import { test, expect } from '../../fixtures/reset.js';
import { bookmarks } from '../../fixtures/selectors/bookmarks.js';

test('bookmarks: toggle on post-view (off → on → off) on a fresh post', async ({ actor }) => {
  // Use a freshly created post so the bookmark state is unambiguously
  // owned by this test (no cross-worker contention on shared seed state).
  const refresh = await actor.request.post('/api/auth/refresh');
  expect(refresh.ok()).toBe(true);
  const { accessToken } = (await refresh.json()) as { accessToken: string };
  const created = await actor.request.post('/api/posts', {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: {
      title: `Bookmark-toggle seed ${Date.now()}`,
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

  await actor.goto(`/posts/${postId}`);
  // Initially: actor has no bookmark on this fresh post.
  await expect(bookmarks.onIcon(actor)).toHaveCount(0);

  await bookmarks.toggleBtn(actor).click();
  await expect(bookmarks.onIcon(actor)).toBeVisible();

  await bookmarks.toggleBtn(actor).click();
  await expect(bookmarks.onIcon(actor)).toHaveCount(0);
});
