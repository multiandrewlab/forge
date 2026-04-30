import { test, expect } from '../../fixtures/reset.js';
import { voting } from '../../fixtures/selectors/voting.js';

test('voting: vote score in feed view updates after upvoting on a fresh post', async ({
  testuser,
}) => {
  // Use a freshly created post (initial vote_count = 0) and scope feed
  // locator by its data-post-id to dodge cross-worker contention on the
  // seeded cheatsheet baseline.
  const refresh = await testuser.request.post('/api/auth/refresh');
  const { accessToken } = (await refresh.json()) as { accessToken: string };
  const created = await testuser.request.post('/api/posts', {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: {
      title: `Score-in-feed seed ${Date.now()}`,
      contentType: 'snippet',
      language: 'typescript',
      content: 'x',
      visibility: 'public',
      isDraft: false,
    },
  });
  const {
    post: { id: postId },
  } = (await created.json()) as { post: { id: string } };

  await testuser.goto('/');
  // Fresh post starts at 0.
  await expect(voting.feedScoreOnCard(testuser, postId)).toHaveText('0');

  // Click into the post and upvote.
  await testuser.goto(`/posts/${postId}`);
  await voting.upvoteBtn(testuser).click();
  await expect(voting.voteScore(testuser)).toHaveText('1');

  // Navigate home — the feed card should reflect the new score.
  await testuser.goto('/');
  await expect(voting.feedScoreOnCard(testuser, postId)).toHaveText('1');
});
