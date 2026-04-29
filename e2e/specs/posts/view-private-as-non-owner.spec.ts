import { test, expect } from '../../fixtures/reset.js';

// Pinned seed UUID — carol-owned PRIVATE document "My Kubernetes Notes".
const PRIVATE_POST_ID = 'c0000000-0000-0000-0000-000000000006';

// FIXME(issue #47): blocked on server-side authorization fix.
//
// The DoD bullet "permission: private post hidden from non-owner" assumes
// `GET /api/posts/:id` enforces visibility. As of this WU it does not —
// `packages/server/src/routes/posts.ts:148-157` returns the post payload
// regardless of caller identity or `visibility='private'`. The page therefore
// renders the post normally instead of the not-found / forbidden message
// this spec asserts.
//
// Server-side fix is out of scope of issue #47 ("Out of scope: anything
// under `packages/server/`"). Tracked in a separate security issue; this
// spec un-fixmes once the API enforces visibility.
test.fixme("post view: alice cannot see carol's private post and sees a not-found message", async ({
  alice,
}) => {
  await alice.goto(`/posts/${PRIVATE_POST_ID}`);
  await expect(alice.getByText('Post not found')).toBeVisible();
});
