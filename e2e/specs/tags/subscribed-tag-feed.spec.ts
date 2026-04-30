import { test, expect } from '../../fixtures/reset.js';

test('tags: /following shows posts tagged with subscribed tags', async ({ alice }) => {
  // Use alice (seeded typescript-subscriber) instead of testuser+API-sub:
  // the per-spec reset re-runs scripts/seed.sql so alice's typescript sub
  // is stable across cross-worker resets, while a runtime API sub for
  // testuser would be wiped by any other worker's reset between subscribe
  // and navigation. Seed has 4 typescript-tagged posts (c0...0001/0007/
  // 0009/0011), so /following is non-empty for alice.
  // Canonical spec wanted post-tag-chip-react, but PostListItem (the feed
  // card) doesn't render tag chips — only PostMetaHeader / PostViewPage do.
  // Filter the feed by a known typescript-tagged seed-post title; this
  // still proves the subscribed-tag feed is wired.
  await alice.goto('/following');
  const card = alice
    .getByTestId('post-list-item')
    .filter({ hasText: 'React Testing Library Tips' });
  await expect(card).toHaveCount(1);
});
