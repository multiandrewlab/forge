import { test, expect } from '../../fixtures/reset.js';
import { voting } from '../../fixtures/selectors/voting.js';

test('voting: switching up→down moves score by exactly 2 on a fresh post', async ({ actor }) => {
  // Use a freshly created post (initial vote_count = 0) so the assertion is
  // immune to cross-worker contention on the seeded cheatsheet baseline.
  const refresh = await actor.request.post('/api/auth/refresh');
  expect(refresh.ok()).toBe(true);
  const { accessToken } = (await refresh.json()) as { accessToken: string };
  const created = await actor.request.post('/api/posts', {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: {
      title: `Switch seed ${Date.now()}`,
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

  await actor.goto(`/posts/${postId}`);
  await voting.upvoteBtn(actor).click();
  await expect(voting.voteScore(actor)).toHaveText('1');
  await voting.downvoteBtn(actor).click();
  await expect(voting.voteScore(actor)).toHaveText('-1');
});
