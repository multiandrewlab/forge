import { test, expect } from '../../fixtures/reset.js';
import { comments } from '../../fixtures/selectors/comments.js';

test('comments: delete own — actor deletes their comment via UI', async ({ actor }) => {
  const refresh = await actor.request.post('/api/auth/refresh');
  expect(refresh.ok()).toBe(true);
  const { accessToken } = (await refresh.json()) as { accessToken: string };
  const auth = { Authorization: `Bearer ${accessToken}` };

  const post = await actor.request.post('/api/posts', {
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
  expect(post.ok()).toBe(true);
  const {
    post: { id: postId },
  } = (await post.json()) as { post: { id: string } };
  const comment = await actor.request.post(`/api/posts/${postId}/comments`, {
    headers: auth,
    data: { body: 'doomed' },
  });
  expect(comment.ok()).toBe(true);
  const {
    comment: { id: commentId },
  } = (await comment.json()) as { comment: { id: string } };

  await actor.goto(`/posts/${postId}`);
  await expect(comments.bodyOf(actor, commentId)).toHaveText('doomed');
  await comments.deleteBtnOf(actor, commentId).click();
  await expect(comments.item(actor, commentId)).toHaveCount(0);
});
