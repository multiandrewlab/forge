import { test, expect } from '../../fixtures/reset.js';
import { comments } from '../../fixtures/selectors/comments.js';

test('comments: alice cannot see delete button on bob-authored seeded comment', async ({
  alice,
}) => {
  const cheatsheetId = 'c0000000-0000-0000-0000-000000000001';
  const bobCommentId = 'e0000000-0000-0000-0000-000000000001';

  await alice.goto(`/posts/${cheatsheetId}`);
  await expect(alice.getByTestId(`comment-${bobCommentId}`)).toBeVisible();
  // Scope to bob's action row to avoid picking up Alice's reply's delete-btn.
  await expect(comments.actionsOf(alice, bobCommentId).getByTestId('delete-btn')).toHaveCount(0);
});
