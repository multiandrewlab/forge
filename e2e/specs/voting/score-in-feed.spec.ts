import { test, expect } from '../../fixtures/reset.js';
import { voting } from '../../fixtures/selectors/voting.js';

test('voting: vote score in feed view updates after upvoting', async ({ testuser }) => {
  const cheatsheetId = 'c0000000-0000-0000-0000-000000000001';

  await testuser.goto('/');
  // The feed card for cheatsheet currently shows 2 (seeded from bob+carol).
  await expect(voting.feedScoreOnCard(testuser, cheatsheetId)).toHaveText('2');

  // Click into cheatsheet and upvote.
  await testuser.goto(`/posts/${cheatsheetId}`);
  await voting.upvoteBtn(testuser).click();
  await expect(voting.voteScore(testuser)).toHaveText('3');

  // Navigate home — the feed should reflect the new score.
  await testuser.goto('/');
  await expect(voting.feedScoreOnCard(testuser, cheatsheetId)).toHaveText('3');
});
