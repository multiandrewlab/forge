import { test, expect } from '../../fixtures/reset.js';
import { comments } from '../../fixtures/selectors/comments.js';

test('comments: edit own — testuser edits their comment via UI', async ({ testuser }) => {
  // Mint access token from the refresh-token cookie.
  const refresh = await testuser.request.post('/api/auth/refresh');
  expect(refresh.ok()).toBe(true);
  const { accessToken } = (await refresh.json()) as { accessToken: string };
  const auth = { Authorization: `Bearer ${accessToken}` };

  // Create a fresh post + comment so the edit doesn't race with seeded data.
  const post = await testuser.request.post('/api/posts', {
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
  const comment = await testuser.request.post(`/api/posts/${postId}/comments`, {
    headers: auth,
    data: { body: 'before-edit' },
  });
  expect(comment.ok()).toBe(true);
  const {
    comment: { id: commentId },
  } = (await comment.json()) as { comment: { id: string } };

  await testuser.goto(`/posts/${postId}`);
  await comments.editBtnOf(testuser, commentId).click();
  // Edit form is a CommentInput with `initial-value` populated; the textarea is the same comment-input testid.
  const editTextarea = testuser.getByTestId(`comment-${commentId}`).getByTestId('comment-input');
  await editTextarea.fill('after-edit');
  await testuser.getByTestId(`comment-${commentId}`).getByTestId('comment-submit-btn').click();

  await expect(comments.bodyOf(testuser, commentId)).toHaveText('after-edit');
});
