import { test, expect } from '../../fixtures/reset.js';

test('comments: GET /comments returns 404 after the post is deleted', async ({ testuser }) => {
  const refresh = await testuser.request.post('/api/auth/refresh');
  expect(refresh.ok()).toBe(true);
  const { accessToken } = (await refresh.json()) as { accessToken: string };
  const auth = { Authorization: `Bearer ${accessToken}` };

  const post = await testuser.request.post('/api/posts', {
    headers: auth,
    data: {
      title: 'Cascade-comments seed',
      contentType: 'snippet',
      language: 'typescript',
      content: 'x',
      visibility: 'public',
      isDraft: false,
    },
  });
  expect(post.ok()).toBe(true);
  const {
    post: { id: postId },
  } = (await post.json()) as { post: { id: string } };

  await testuser.request.post(`/api/posts/${postId}/comments`, {
    headers: auth,
    data: { body: 'doomed' },
  });

  // Delete the post via API
  const del = await testuser.request.delete(`/api/posts/${postId}`, { headers: auth });
  expect(del.ok()).toBe(true);

  // Comments route returns 404
  const after = await testuser.request.get(`/api/posts/${postId}/comments`, { headers: auth });
  expect(after.status()).toBe(404);
});
