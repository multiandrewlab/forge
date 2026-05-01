import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';

test('delete: alice cannot see a delete button on actor-owned post', async ({ alice }) => {
  // Seeded actor-owned snippet post (scripts/seed.sql; pinned in
  // bruno/environments/local.bru as `postId`).
  await alice.goto('/posts/c0000000-0000-0000-0000-000000000099');
  // Wait for the page to actually render the post before asserting absence —
  // otherwise toHaveCount(0) trivially passes against a still-loading view.
  await expect(posts.postTitle(alice)).toBeVisible();
  await expect(posts.postDeleteBtn(alice)).toHaveCount(0);
});
