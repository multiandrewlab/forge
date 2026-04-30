import { test, expect } from '../../fixtures/reset.js';
import { comments } from '../../fixtures/selectors/comments.js';

test('comments: input textarea clears after submit', async ({ testuser }) => {
  const cheatsheetId = 'c0000000-0000-0000-0000-000000000001';

  await testuser.goto(`/posts/${cheatsheetId}`);
  await comments.input(testuser).fill('typed-content');
  await comments.submit(testuser).click();

  // After submit, the input value is empty.
  await expect(comments.input(testuser)).toHaveValue('');
});
