import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';

// Pinned seed UUID — actor-owned public snippet "Test Fixture Post (actor-owned)"
const PUBLIC_POST_ID = 'c0000000-0000-0000-0000-000000000099';

test('post view: alice can view a public post and sees title + published-badge', async ({
  alice,
}) => {
  await alice.goto(`/posts/${PUBLIC_POST_ID}`);

  await expect(posts.postTitle(alice)).toHaveText('Test Fixture Post (actor-owned)');
  await expect(posts.publishedBadge(alice)).toBeVisible();
});
