import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';

// Pinned seed UUID — actor-owned public snippet "Test Fixture Post
// (actor-owned)". PresenceIndicator is mounted on PostViewPage.vue:134
// and renders a `presence-avatar` testid for each viewer returned by the
// `usePresence` composable.
const PUBLIC_POST_ID = 'c0000000-0000-0000-0000-000000000099';

// Issue #66: server broadcasts presence:update on every authenticated `presence`
// frame (handler.ts:217). PresenceIndicator de-dups by userId.
test('presence: actor sees the presence-avatar on the post view page', async ({ actor }) => {
  await actor.goto(`/posts/${PUBLIC_POST_ID}`);

  // The first matching avatar represents at least one connected viewer.
  // We assert visibility (not count) because presence is real-time and
  // other sessions may briefly join/leave; the contract is "at least
  // one avatar".
  await expect(posts.presenceAvatar(actor).first()).toBeVisible();
});
