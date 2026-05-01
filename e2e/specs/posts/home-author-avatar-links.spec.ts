import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';

// Pinned seed UUID — actor is the author of the seeded "Test Fixture Post
// (actor-owned)" snippet, so clicking the inline author-avatar from
// HomePage's right pane should navigate alice to /user/<actor-id>.
const TESTUSER_ID = 'a0000000-0000-0000-0000-000000000099';

// The author-avatar element lives inside PostMetaHeader.vue, which is rendered
// by PostDetail.vue (HomePage's inline right-pane). After alice clicks the
// list-item heading, the inline panel mounts the meta header and the avatar
// becomes interactive. The avatar is wrapped in a RouterLink to user-profile,
// so a click navigates the page to /user/:id.
test('author-avatar: clicking the inline avatar navigates to user profile', async ({ alice }) => {
  await alice.goto('/');

  // Click the list-item heading (h3) — the right-pane PostMetaHeader also
  // renders the title as h1 once a post is auto-selected, so a plain
  // getByText is ambiguous. Targeting the h3 keeps the click on the post
  // list independent of auto-selection state.
  await alice.getByRole('heading', { level: 3, name: 'Test Fixture Post (actor-owned)' }).click();

  await expect(posts.authorAvatar(alice)).toBeVisible({ timeout: 10000 });
  await posts.authorAvatar(alice).click();

  await expect(alice).toHaveURL(`/user/${TESTUSER_ID}`);
});
