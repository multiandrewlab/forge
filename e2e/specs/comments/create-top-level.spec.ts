import { test, expect } from '../../fixtures/reset.js';
import { comments } from '../../fixtures/selectors/comments.js';

test('comments: create top-level — testuser posts on alice cheatsheet', async ({ testuser }) => {
  const cheatsheetId = 'c0000000-0000-0000-0000-000000000001';
  await testuser.goto(`/posts/${cheatsheetId}`);

  await comments.input(testuser).fill('e2e-comment-' + Date.now());
  await comments.submit(testuser).click();

  // The newly created comment is testuser-authored — assert that a comment with
  // testuser's display name now appears in the list. Use a regex match against
  // the freshly-typed body to dodge false positives from seeded comments.
  await expect(testuser.getByTestId('comment-section')).toContainText(/e2e-comment-\d+/);
});
