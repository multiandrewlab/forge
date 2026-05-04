import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';

test('publish: draft post toggles to published — draft-badge becomes published-badge', async ({
  actor,
}) => {
  // Storage state has the refresh_token cookie; mint an access token from it
  // (mirrors packages/client/src/lib/restore-session.ts boot flow).
  const refresh = await actor.request.post('/api/auth/refresh');
  expect(refresh.ok()).toBe(true);
  const { accessToken } = (await refresh.json()) as { accessToken: string };

  // Seed a draft post via API. createPostSchema requires content min(1) for
  // non-link types (packages/shared/src/validators/post.ts:4).
  const created = await actor.request.post('/api/posts', {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: {
      title: 'Publish-toggle seed',
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

  // Open the edit page (where the Publish button lives) and verify the post is
  // a draft. PostEditPage doesn't render the badge directly; the badge surfaces
  // on the post-view page that handlePublish() routes to. So we visit the view
  // page first to confirm the draft state, then go to /edit to click Publish.
  await actor.goto(`/posts/${createdPostId}`);
  await expect(posts.draftBadge(actor)).toBeVisible();

  await actor.goto(`/posts/${createdPostId}/edit`);
  await posts.newPostPublish(actor).click();

  // handlePublish() in PostEditPage:82 calls publishPost then router.push to
  // post-view. The view page renders published-badge (else of v-if isDraft).
  await expect(actor).toHaveURL(new RegExp(`/posts/${createdPostId}(?!/edit)`));
  await expect(posts.publishedBadge(actor)).toBeVisible();
  await expect(posts.draftBadge(actor)).toHaveCount(0);
});
