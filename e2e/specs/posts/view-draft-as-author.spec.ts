import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';

test('post view: actor views own draft and sees title + draft-badge', async ({ actor }) => {
  // Drafts are visible only to their author. Create one as the per-worker actor
  // so the worker that runs this spec is guaranteed to be the owner. (Pre-#75
  // this spec used the seeded testuser-owned draft, but that draft is now
  // unreachable to the e2e_w* actor fixtures.)
  const refresh = await actor.request.post('/api/auth/refresh');
  expect(refresh.ok()).toBe(true);
  const { accessToken } = (await refresh.json()) as { accessToken: string };

  const draftTitle = `Draft view ${Date.now()}`;
  const created = await actor.request.post('/api/posts', {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: {
      title: draftTitle,
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

  await actor.goto(`/posts/${createdPostId}`);

  await expect(posts.postTitle(actor)).toHaveText(draftTitle);
  await expect(posts.draftBadge(actor)).toBeVisible();
});
