import { test, expect } from '../../fixtures/reset.js';
import { voting } from '../../fixtures/selectors/voting.js';

test('voting: post-view shows vote_count from the server', async ({ testuser, alice }) => {
  // testuser creates a fresh post; alice upvotes it via API; testuser opens it.
  // Asserts the post-view renders the server-side vote_count for a post that
  // the viewer themselves has not voted on.
  const tuRefresh = await testuser.request.post('/api/auth/refresh');
  const { accessToken: tuToken } = (await tuRefresh.json()) as { accessToken: string };
  const post = await testuser.request.post('/api/posts', {
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
  const { accessToken: aliceToken } = (await aliceRefresh.json()) as { accessToken: string };
  await alice.request.post(`/api/posts/${postId}/vote`, {
    headers: { Authorization: `Bearer ${aliceToken}` },
    data: { value: 1 },
  });

  await testuser.goto(`/posts/${postId}`);
  await expect(voting.voteScore(testuser)).toHaveText('1');
});
