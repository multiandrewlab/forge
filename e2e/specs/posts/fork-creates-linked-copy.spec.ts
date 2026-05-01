import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';

// Pinned seed post — actor-owned public snippet "Test Fixture Post (actor-owned)".
// alice (a separate seeded user) forks this; actor cannot fork their own post
// (PostActions.vue disables Fork when viewer is the author), so alice is the
// canonical forker for this read-only spec.
const SEEDED_POST_ID = 'c0000000-0000-0000-0000-000000000099';

test('fork: alice forks a public post and lands on /posts/<newId>/edit with the source title prefilled', async ({
  alice,
}) => {
  await alice.goto(`/posts/${SEEDED_POST_ID}`);
  await posts.forkBtn(alice).click();

  // Forking redirects to the new post's edit page (PostViewPage.vue handleFork
  // → router.push(`/posts/${newPostId}/edit`)). Capture a NEW uuid that is not
  // the source uuid.
  await expect(alice).toHaveURL(new RegExp(`/posts/(?!${SEEDED_POST_ID}\\b)[a-f0-9-]+/edit$`));

  // The fork is created from the source's title (server posts.ts:308 copies
  // `source.title` into the new post). The new-post title input should contain
  // "Test Fixture Post" — substring tolerant in case the seed title evolves.
  await expect(posts.newPostTitle(alice)).toHaveValue(/Test Fixture Post/);
});
