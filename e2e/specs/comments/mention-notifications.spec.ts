import { test } from '../../fixtures/reset.js';

// FIXME(#48): mention-notification infrastructure not implemented as of 2026-04-30.
// No code paths exist in packages/server/src/routes/comments.ts or services/ that
// parse @mentions or emit notifications. Activate this spec once the feature ships.
test.fixme('comments: @mention generates a notification for the mentioned user', async ({
  actor: _testuser,
  alice: _alice,
}) => {
  // Posting a comment containing "@alice" should produce a notification for alice.
  // Exact API + UI assertions to be filled in when the feature is built.
});
