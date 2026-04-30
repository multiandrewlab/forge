import { test, expect } from '../../fixtures/reset.js';
import { voting } from '../../fixtures/selectors/voting.js';

test('voting: upvote increments score from 0 to 1 on a fresh post', async ({ testuser }) => {
  // Use a freshly created post (initial vote_count = 0) so the assertion is
  // immune to cross-worker contention on the seeded cheatsheet baseline.
  const refresh = await testuser.request.post('/api/auth/refresh');
  const { accessToken } = (await refresh.json()) as { accessToken: string };
  const created = await testuser.request.post('/api/posts', {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: {
      title: `Upvote seed ${Date.now()}`,
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

  await testuser.goto(`/posts/${postId}`);
  await expect(voting.voteScore(testuser)).toHaveText('0');
  await voting.upvoteBtn(testuser).click();
  await expect(voting.voteScore(testuser)).toHaveText('1');
});
