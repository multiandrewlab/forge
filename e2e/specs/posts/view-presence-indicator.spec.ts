import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';

// Pinned seed UUID — testuser-owned public snippet "Test Fixture Post
// (testuser-owned)". PresenceIndicator is mounted on PostViewPage.vue:134
// and renders a `presence-avatar` testid for each viewer returned by the
// `usePresence` composable.
const PUBLIC_POST_ID = 'c0000000-0000-0000-0000-000000000099';

// FIXME(issue #66): server-side presence broadcast gap.
//
// The current server implementation in
// `packages/server/src/plugins/websocket/handler.ts` records presence on
// every `presence` heartbeat but never broadcasts a `presence:update`
// frame on join — the only emission path is the 15s eviction interval
// in `presence.ts:120`, which only broadcasts for channels that actually
// had stale entries evicted. As long as the user keeps heartbeating
// (every 30s) their entry never goes stale, so the client never receives
// a `presence:update` and `viewers.length` stays at 0. The
// PresenceIndicator's `v-if="viewers.length > 0"` guard therefore keeps
// the avatar element off the DOM in single-user e2e runs.
//
// Out of WU11 scope (file scope is e2e specs + client testid only).
// This spec un-fixmes once the server emits `presence:update` on join
// (e.g. inside the `if (type === 'presence')` branch after `update`).
test.fixme('presence: testuser sees the presence-avatar on the post view page', async ({
  testuser,
}) => {
  await testuser.goto(`/posts/${PUBLIC_POST_ID}`);

  // The first matching avatar represents at least one connected viewer.
  // We assert visibility (not count) because presence is real-time and
  // other sessions may briefly join/leave; the contract is "at least
  // one avatar".
  await expect(posts.presenceAvatar(testuser).first()).toBeVisible();
});
