import { test, expect } from '../../fixtures/reset.js';
import { voting } from '../../fixtures/selectors/voting.js';

test('voting: post-view shows vote_count from the server', async ({ actor, alice }) => {
  // actor creates a fresh post; alice upvotes it via API; actor opens it.
  // Asserts the post-view renders the server-side vote_count for a post that
  // the viewer themselves has not voted on.
  const tuRefresh = await actor.request.post('/api/auth/refresh');
  expect(tuRefresh.ok()).toBe(true);
  const { accessToken: tuToken } = (await tuRefresh.json()) as { accessToken: string };
  const post = await actor.request.post('/api/posts', {
    headers: { Authorization: `Bearer ${tuToken}` },
    data: {
      title: 'Score-view seed',
      contentType: 'snippet',
      language: 'typescript',
      content: 'x',
      visibility: 'public',
      isDraft: false,
    },
  });
  const {
    post: { id: postId },
  } = (await post.json()) as { post: { id: string } };

  const aliceRefresh = await alice.request.post('/api/auth/refresh');
  expect(aliceRefresh.ok()).toBe(true);
  const { accessToken: aliceToken } = (await aliceRefresh.json()) as { accessToken: string };
  await alice.request.post(`/api/posts/${postId}/vote`, {
    headers: { Authorization: `Bearer ${aliceToken}` },
    data: { value: 1 },
  });

  await actor.goto(`/posts/${postId}`);
  await expect(voting.voteScore(actor)).toHaveText('1');
});
