import { test, expect } from '../../fixtures/reset.js';
import { voting } from '../../fixtures/selectors/voting.js';

test('voting: upvote increments score from 2 to 3 on cheatsheet', async ({ testuser }) => {
  const cheatsheetId = 'c0000000-0000-0000-0000-000000000001';

  await testuser.goto(`/posts/${cheatsheetId}`);
  await expect(voting.voteScore(testuser)).toHaveText('2');
  await voting.upvoteBtn(testuser).click();
  await expect(voting.voteScore(testuser)).toHaveText('3');
});
