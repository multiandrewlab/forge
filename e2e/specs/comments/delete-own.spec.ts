import { test, expect } from '../../fixtures/reset.js';
import { comments } from '../../fixtures/selectors/comments.js';

test('comments: delete own — testuser deletes their comment via UI', async ({ testuser }) => {
  const refresh = await testuser.request.post('/api/auth/refresh');
  expect(refresh.ok()).toBe(true);
  const { accessToken } = (await refresh.json()) as { accessToken: string };
  const auth = { Authorization: `Bearer ${accessToken}` };

  const post = await testuser.request.post('/api/posts', {
    headers: auth,
    data: {
      title: 'Delete-own seed',
      contentType: 'snippet',
      language: 'typescript',
      content: 'x',
      visibility: 'public',
      isDraft: false,
    },
  });
  const {
    post: { id: postId },
  } = (await post.json()) as { post: { id: string } };
  const comment = await testuser.request.post(`/api/posts/${postId}/comments`, {
    headers: auth,
    data: { body: 'doomed' },
  });
  const {
    comment: { id: commentId },
  } = (await comment.json()) as { comment: { id: string } };

  await testuser.goto(`/posts/${postId}`);
  await expect(comments.bodyOf(testuser, commentId)).toHaveText('doomed');
  await comments.deleteBtnOf(testuser, commentId).click();
  await expect(comments.item(testuser, commentId)).toHaveCount(0);
});
