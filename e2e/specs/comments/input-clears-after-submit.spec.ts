import { test, expect } from '../../fixtures/reset.js';
import { comments } from '../../fixtures/selectors/comments.js';

test('comments: input textarea clears after submit', async ({ actor }) => {
  const cheatsheetId = 'c0000000-0000-0000-0000-000000000001';

  await actor.goto(`/posts/${cheatsheetId}`);
  await comments.input(actor).fill('typed-content');
  await comments.submit(actor).click();

  // After submit, the input value is empty.
  await expect(comments.input(actor)).toHaveValue('');
});
