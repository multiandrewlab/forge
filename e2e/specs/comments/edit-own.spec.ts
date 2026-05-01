import { test, expect } from '../../fixtures/reset.js';
import { comments } from '../../fixtures/selectors/comments.js';

test('comments: edit own — actor edits their comment via UI', async ({ actor }) => {
  // Mint access token from the refresh-token cookie.
  const refresh = await actor.request.post('/api/auth/refresh');
  expect(refresh.ok()).toBe(true);
  const { accessToken } = (await refresh.json()) as { accessToken: string };
  const auth = { Authorization: `Bearer ${accessToken}` };

  // Create a fresh post + comment so the edit doesn't race with seeded data.
  const post = await actor.request.post('/api/posts', {
    headers: auth,
    data: {
      title: 'Edit-own seed',
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
    data: { body: 'before-edit' },
  });
  expect(comment.ok()).toBe(true);
  const {
    comment: { id: commentId },
  } = (await comment.json()) as { comment: { id: string } };

  await actor.goto(`/posts/${postId}`);
  await comments.editBtnOf(actor, commentId).click();
  // Edit form is a CommentInput with `initial-value` populated; the textarea is the same comment-input testid.
  const editTextarea = actor.getByTestId(`comment-${commentId}`).getByTestId('comment-input');
  await editTextarea.fill('after-edit');
  await actor.getByTestId(`comment-${commentId}`).getByTestId('comment-submit-btn').click();

  await expect(comments.bodyOf(actor, commentId)).toHaveText('after-edit');
});
