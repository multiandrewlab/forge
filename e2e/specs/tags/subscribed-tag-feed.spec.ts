import { test, expect } from '../../fixtures/reset.js';
import { tags } from '../../fixtures/selectors/tags.js';

test('tags: /following shows posts tagged with subscribed tags', async ({ alice }) => {
  // Use alice (seeded typescript-subscriber) instead of actor+API-sub:
  // the per-spec reset re-runs scripts/seed.sql so alice's typescript sub
  // is stable across cross-worker resets, while a runtime API sub for
  // actor would be wiped by any other worker's reset between subscribe
  // and navigation. Seed has 4 typescript-tagged posts (c0...0001/0007/
  // 0009/0011), and c011 ("React Testing Library Tips") is dual-tagged
  // with react+typescript — so /following includes a post that renders
  // a post-tag-chip-react chip on the feed card.
  await alice.goto('/following');
  await expect(alice.getByTestId('post-list-item').first()).toBeVisible();
  await expect(tags.postTagChip(alice, 'react').first()).toBeVisible();
});
