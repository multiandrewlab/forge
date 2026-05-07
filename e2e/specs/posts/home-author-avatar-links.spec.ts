import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';

// Pinned seed UUID — actor is the author of the seeded "Test Fixture Post
// (testuser-owned)" snippet, so clicking the inline author-avatar from
// HomePage's right pane should navigate alice to /user/<actor-id>.
const TESTUSER_ID = 'a0000000-0000-0000-0000-000000000099';

// The author-avatar element lives inside PostMetaHeader.vue, which is rendered
// by PostDetail.vue (HomePage's inline right-pane). After alice clicks the
// list-item heading, the inline panel mounts the meta header and the avatar
// becomes interactive. The avatar is wrapped in a RouterLink to user-profile,
// so a click navigates the page to /user/:id.
test('author-avatar: clicking the inline avatar navigates to user profile', async ({ alice }) => {
  await alice.goto('/');

  // Click the testuser-owned tile specifically. Alice can fork the seeded
  // testuser post (see `e2e/specs/posts/fork-creates-linked-copy.spec.ts`),
  // and Alice's data is not in the worker-scoped reset's purview (only
  // e2e_w0..3 users are reset between tests). At higher worker counts, those
  // Alice forks accumulate as drafts whose title is verbatim "Test Fixture
  // Post (testuser-owned)" — a strict-mode lookup by title alone resolves
  // to multiple h3s. Scope to the post-list-item whose author link points
  // at testuser, then click that tile's heading.
  await alice
    .locator('[data-testid="post-list-item"]', {
      has: alice.locator(`a[href="/user/${TESTUSER_ID}"]`),
    })
    .first()
    .getByRole('heading', { level: 3 })
    .click();

  await expect(posts.authorAvatar(alice)).toBeVisible({ timeout: 10000 });
  await posts.authorAvatar(alice).click();

  await expect(alice).toHaveURL(`/user/${TESTUSER_ID}`);
});
