import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';

test('edit: changes persist after navigating away and back', async ({ testuser }) => {
  // Storage state has the refresh_token cookie; mint an access token from it.
  const refresh = await testuser.request.post('/api/auth/refresh');
  expect(refresh.ok()).toBe(true);
  const { accessToken } = (await refresh.json()) as { accessToken: string };

  const created = await testuser.request.post('/api/posts', {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: {
      title: 'Persistence seed',
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

  const persistedTitle = 'Persisted across nav';

  await testuser.goto(`/posts/${createdPostId}/edit`);
  await posts.newPostTitle(testuser).fill(persistedTitle);
  await posts.newPostSaveDraft(testuser).click();
  await testuser.goto('/');
  await testuser.goto(`/posts/${createdPostId}`);
  await expect(posts.postTitle(testuser)).toHaveText(persistedTitle);
});
