import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';

test('delete: clicking delete shows a confirmation dialog; cancel keeps the post', async ({
  testuser,
}) => {
  // Browser storage holds only the refresh_token cookie. Mirror the runtime
  // session flow (packages/client/src/lib/restore-session.ts): exchange the
  // refresh cookie for an access token, then call /api/posts with
  // Authorization: Bearer <token>. Pattern: edit-own-post.spec.ts.
  const refresh = await testuser.request.post('/api/auth/refresh');
  expect(refresh.ok()).toBe(true);
  const { accessToken } = (await refresh.json()) as { accessToken: string };

  const created = await testuser.request.post('/api/posts', {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: {
      title: 'Delete-confirm seed',
      contentType: 'snippet',
      language: 'typescript',
      content: 'x',
      visibility: 'public',
      isDraft: false,
    },
  });
  expect(created.ok()).toBe(true);
  const {
    post: { id: createdPostId },
  } = (await created.json()) as { post: { id: string } };

  await testuser.goto(`/posts/${createdPostId}`);
  await posts.postDeleteBtn(testuser).click();
  await expect(posts.postDeleteDialog(testuser)).toBeVisible();
  await posts.postDeleteCancel(testuser).click();
  await expect(posts.postDeleteDialog(testuser)).not.toBeVisible();
  await expect(posts.postTitle(testuser)).toHaveText('Delete-confirm seed');
});
