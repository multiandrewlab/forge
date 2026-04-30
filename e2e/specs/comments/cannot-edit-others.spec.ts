import { test, expect } from '../../fixtures/reset.js';
import { comments } from '../../fixtures/selectors/comments.js';

test('comments: alice cannot see edit button on bob/carol-authored seeded comments', async ({
  alice,
}) => {
  const cheatsheetId = 'c0000000-0000-0000-0000-000000000001';
  const bobCommentId = 'e0000000-0000-0000-0000-000000000001';
  const carolCommentId = 'e0000000-0000-0000-0000-000000000003';

  await alice.goto(`/posts/${cheatsheetId}`);
  // Bob's top-level comment is visible — wait for it before asserting on its actions.
  await expect(alice.getByTestId(`comment-${bobCommentId}`)).toBeVisible();
  // Use actionsOf to scope strictly to the action row of THIS comment, dodging
  // buttons rendered by nested replies (e.g. alice's seeded reply to bob).
  await expect(comments.actionsOf(alice, bobCommentId).getByTestId('edit-btn')).toHaveCount(0);
  await expect(comments.actionsOf(alice, carolCommentId).getByTestId('edit-btn')).toHaveCount(0);
});
