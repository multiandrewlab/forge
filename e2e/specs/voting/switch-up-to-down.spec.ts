import { test, expect } from '../../fixtures/reset.js';
import { voting } from '../../fixtures/selectors/voting.js';

test('voting: switching up→down moves score by exactly 2', async ({ testuser }) => {
  const cheatsheetId = 'c0000000-0000-0000-0000-000000000001';

  await testuser.goto(`/posts/${cheatsheetId}`);
  await voting.upvoteBtn(testuser).click();
  await expect(voting.voteScore(testuser)).toHaveText('3');
  await voting.downvoteBtn(testuser).click();
  await expect(voting.voteScore(testuser)).toHaveText('1');
});
