import { test, expect } from '../../fixtures/reset.js';
import { comments } from '../../fixtures/selectors/comments.js';

test('comments: alice cannot see edit button on bob-authored seeded comment', async ({ alice }) => {
  const cheatsheetId = 'c0000000-0000-0000-0000-000000000001';
  const bobCommentId = 'e0000000-0000-0000-0000-000000000001';

  await alice.goto(`/posts/${cheatsheetId}`);
  // Bob's top-level seeded comment must be visible before asserting on its
  // actions — otherwise the absence-of-edit-btn check passes vacuously.
  // (Carol's seeded comment e0…03 is INLINE on rev 2 line 2 and renders via
  // the per-line indicator, not via CommentThread — it has no `comment-${id}`
  // testid at all in the main thread DOM, so we check bob's main-thread
  // comment only here.)
  await expect(alice.getByTestId(`comment-${bobCommentId}`)).toBeVisible();
  // Use actionsOf to scope strictly to the action row of THIS comment, dodging
  // buttons rendered by nested replies (e.g. alice's seeded reply to bob).
  await expect(comments.actionsOf(alice, bobCommentId).getByTestId('edit-btn')).toHaveCount(0);
});
