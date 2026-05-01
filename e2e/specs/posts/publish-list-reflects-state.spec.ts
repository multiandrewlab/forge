import { test, expect } from '../../fixtures/reset.js';

test('publish: /my-snippets list reflects publish state — draft-badge present before, absent after', async ({
  actor,
}) => {
  // Storage state has the refresh_token cookie; mint an access token from it.
  const refresh = await actor.request.post('/api/auth/refresh');
  expect(refresh.ok()).toBe(true);
  const { accessToken } = (await refresh.json()) as { accessToken: string };

  const title = 'List-reflects-state seed';
  // Seed a draft. createPostSchema requires content min(1) for non-link types.
  const created = await actor.request.post('/api/posts', {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: {
      title,
      contentType: 'snippet',
      language: 'typescript',
      content: 'x',
      visibility: 'public',
      isDraft: true,
    },
  });
  expect(created.ok()).toBe(true);
  const {
    post: { id: createdPostId },
  } = (await created.json()) as { post: { id: string } };

  // /my-snippets includes drafts (server feed.ts:137 — drafts surfaced for
  // filter=mine). Row locator pinned to post-list-item testid added by this WU.
  await actor.goto('/my-snippets');
  const draftRow = actor.getByTestId('post-list-item').filter({ hasText: title });
  await expect(draftRow.getByTestId('draft-badge')).toBeVisible();

  // Publish via the dedicated endpoint. updatePostSchema (post.ts:46-53) does
  // NOT accept isDraft; the publish flow has its own route at posts.ts:217.
  const publishRes = await actor.request.post(`/api/posts/${createdPostId}/publish`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  expect(publishRes.ok()).toBe(true);

  // After publish — same row, no draft-badge (no "Published" indicator exists
  // in PostListItem; published is the default state with no badge).
  await actor.reload();
  const publishedRow = actor.getByTestId('post-list-item').filter({ hasText: title });
  await expect(publishedRow).toBeVisible();
  await expect(publishedRow.getByTestId('draft-badge')).toHaveCount(0);
});
