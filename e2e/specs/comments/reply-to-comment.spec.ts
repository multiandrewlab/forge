import { test, expect } from '../../fixtures/reset.js';
import { comments } from '../../fixtures/selectors/comments.js';

test('comments: reply to a top-level comment via UI', async ({ actor }) => {
  const cheatsheetId = 'c0000000-0000-0000-0000-000000000001';
  const parentId = 'e0000000-0000-0000-0000-000000000001';

  await actor.goto(`/posts/${cheatsheetId}`);
  // Click reply on bob's action row (scoped to avoid picking up nested replies' buttons).
  await comments.actionsOf(actor, parentId).getByTestId('reply-btn').click();
  // The reply form is the new comment-input that appears INSIDE bob's comment scope.
  // Use .first() because nested replies may also expose comment-inputs after expanding.
  const replyTextarea = actor
    .getByTestId(`comment-${parentId}`)
    .getByTestId('comment-input')
    .first();
  const replyBody = `reply-${Date.now()}`;
  await replyTextarea.fill(replyBody);
  await actor.getByTestId(`comment-${parentId}`).getByTestId('comment-submit-btn').first().click();

  // Assert the reply body now appears inside the parent comment scope
  await expect(actor.getByTestId(`comment-${parentId}`)).toContainText(replyBody);
});
