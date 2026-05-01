import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';

test('delete: clicking delete shows a confirmation dialog; cancel keeps the post', async ({
  actor,
}) => {
  // Browser storage holds only the refresh_token cookie. Mirror the runtime
  // session flow (packages/client/src/lib/restore-session.ts): exchange the
  // refresh cookie for an access token, then call /api/posts with
  // Authorization: Bearer <token>. Pattern: edit-own-post.spec.ts.
  const refresh = await actor.request.post('/api/auth/refresh');
  expect(refresh.ok()).toBe(true);
  const { accessToken } = (await refresh.json()) as { accessToken: string };

  const created = await actor.request.post('/api/posts', {
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

  await actor.goto(`/posts/${createdPostId}`);
  await posts.postDeleteBtn(actor).click();
  await expect(posts.postDeleteDialog(actor)).toBeVisible();
  await posts.postDeleteCancel(actor).click();
  await expect(posts.postDeleteDialog(actor)).not.toBeVisible();
  await expect(posts.postTitle(actor)).toHaveText('Delete-confirm seed');
});
