import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';

test('edit: cancel button discards in-flight changes and returns to view', async ({ testuser }) => {
  const originalTitle = 'Cancel seed title';
  // Storage state has the refresh_token cookie; mint an access token from it.
  const refresh = await testuser.request.post('/api/auth/refresh');
  expect(refresh.ok()).toBe(true);
  const { accessToken } = (await refresh.json()) as { accessToken: string };

  const created = await testuser.request.post('/api/posts', {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: {
      title: originalTitle,
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

  await testuser.goto(`/posts/${createdPostId}/edit`);
  await posts.newPostTitle(testuser).fill('Stomp the title');
  await posts.postCancelBtn(testuser).click();
  await expect(testuser).toHaveURL(new RegExp(`/posts/${createdPostId}(?!/edit)`));
  await expect(posts.postTitle(testuser)).toHaveText(originalTitle);
});
