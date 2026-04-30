import { test, expect } from '../../fixtures/reset.js';
import { bookmarks } from '../../fixtures/selectors/bookmarks.js';

test('bookmarks: toggle on post-view (off → on → off) on a fresh post', async ({ testuser }) => {
  // Use a freshly created post so the bookmark state is unambiguously
  // owned by this test (no cross-worker contention on shared seed state).
  const refresh = await testuser.request.post('/api/auth/refresh');
  expect(refresh.ok()).toBe(true);
  const { accessToken } = (await refresh.json()) as { accessToken: string };
  const created = await testuser.request.post('/api/posts', {
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

  await testuser.goto(`/posts/${postId}`);
  // Initially: testuser has no bookmark on this fresh post.
  await expect(bookmarks.onIcon(testuser)).toHaveCount(0);

  await bookmarks.toggleBtn(testuser).click();
  await expect(bookmarks.onIcon(testuser)).toBeVisible();

  await bookmarks.toggleBtn(testuser).click();
  await expect(bookmarks.onIcon(testuser)).toHaveCount(0);
});
