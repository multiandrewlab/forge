import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';

// Pinned seed post — testuser-owned public snippet. alice forks it, then we
// navigate to a surface that displays the post-detail with its meta-header and
// assert the `fork-attribution` element is rendered. This proves the fork
// relationship is persistently displayed (not just a transient post-fork
// artifact).
//
// `fork-attribution` is rendered in two surfaces (grep "fork-attribution" in
// packages/client/src):
//   1. PostEditPage.vue:121–133  — the page alice lands on after forking
//   2. PostMetaHeader.vue:20–30  — embedded in PostDetail (inline on HomePage)
//
// We navigate to /posts/<newForkId>/edit explicitly (re-entering the page after
// the post-fork redirect) so the assertion exercises persistent rendering, not
// the redirect side-effect.
const SEEDED_POST_ID = 'c0000000-0000-0000-0000-000000000099';

test('fork: fork-attribution element is visible on the fork post page', async ({ alice }) => {
  await alice.goto(`/posts/${SEEDED_POST_ID}`);
  await posts.forkBtn(alice).click();
  await expect(alice).toHaveURL(new RegExp(`/posts/(?!${SEEDED_POST_ID}\\b)[a-f0-9-]+/edit$`));

  // Capture the fork's id from the URL to re-navigate explicitly.
  const url = new URL(alice.url());
  const match = url.pathname.match(/\/posts\/([a-f0-9-]+)\/edit$/);
  const forkId = match?.[1];
  expect(forkId).toBeDefined();

  // Navigate away and back to verify the relationship is persistent (not a
  // post-fork transient).
  await alice.goto('/');
  await alice.goto(`/posts/${forkId}/edit`);

  await expect(posts.forkAttribution(alice)).toBeVisible();
});
