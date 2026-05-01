import { test, expect } from '../../fixtures/reset.js';
import { comments } from '../../fixtures/selectors/comments.js';

test('comments: empty-state appears for a brand-new post', async ({ actor }) => {
  const refresh = await actor.request.post('/api/auth/refresh');
  expect(refresh.ok()).toBe(true);
  const { accessToken } = (await refresh.json()) as { accessToken: string };
  const auth = { Authorization: `Bearer ${accessToken}` };

  const post = await actor.request.post('/api/posts', {
    headers: auth,
    data: {
      title: 'Empty seed',
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

  await actor.goto(`/posts/${postId}`);
  await expect(comments.empty(actor)).toBeVisible();
  await expect(comments.empty(actor)).toHaveText('No comments yet.');
  // Belt-and-suspenders: the comment list element is absent
  await expect(comments.list(actor)).toHaveCount(0);
});
