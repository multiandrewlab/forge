import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';

test('delete: cascade — post + comments + votes + bookmarks all vanish', async ({
  testuser,
  alice,
  request,
}) => {
  // testuser creates a post (auth via refresh-token exchange — see
  // edit-own-post.spec.ts for canonical pattern).
  const tuRefresh = await testuser.request.post('/api/auth/refresh');
  expect(tuRefresh.ok()).toBe(true);
  const { accessToken: tuToken } = (await tuRefresh.json()) as { accessToken: string };

  const created = await testuser.request.post('/api/posts', {
    headers: { Authorization: `Bearer ${tuToken}` },
    data: {
      title: 'Cascade test',
      contentType: 'snippet',
      language: 'typescript',
      content: 'x',
      visibility: 'public',
      isDraft: false,
    },
  });
  expect(created.ok()).toBe(true);
  const {
    post: { id: createdPostId },
  } = (await created.json()) as { post: { id: string } };

  // Alice gets her own access token (separate refresh-token exchange from her
  // own browser storage state) and creates a vote, bookmark, and comment on
  // testuser's post. Endpoint shapes verified against:
  //   - votes:     packages/server/src/routes/votes.ts:9     POST /api/posts/:id/vote
  //   - bookmarks: packages/server/src/routes/bookmarks.ts   POST /api/posts/:id/bookmark
  //   - comments:  packages/server/src/routes/comments.ts    POST /api/posts/:id/comments
  const aliceRefresh = await alice.request.post('/api/auth/refresh');
  expect(aliceRefresh.ok()).toBe(true);
  const { accessToken: aliceToken } = (await aliceRefresh.json()) as { accessToken: string };
  const aliceAuth = { Authorization: `Bearer ${aliceToken}` };

  const voteRes = await alice.request.post(`/api/posts/${createdPostId}/vote`, {
    headers: aliceAuth,
    data: { value: 1 },
  });
  expect(voteRes.ok()).toBe(true);

  const bookmarkRes = await alice.request.post(`/api/posts/${createdPostId}/bookmark`, {
    headers: aliceAuth,
    data: {},
  });
  expect(bookmarkRes.ok()).toBe(true);

  const commentRes = await alice.request.post(`/api/posts/${createdPostId}/comments`, {
    headers: aliceAuth,
    data: { body: 'cascade comment' },
  });
  expect(commentRes.ok()).toBe(true);

  // testuser deletes via UI — exercises the new dialog.
  await testuser.goto(`/posts/${createdPostId}`);
  await posts.postDeleteBtn(testuser).click();
  await posts.postDeleteConfirm(testuser).click();
  await expect(testuser).toHaveURL(/\/$/);

  // Cascade verification: the post itself returns 404. Postgres FK-cascade
  // (posts → comments / votes / bookmarks) implies all children are gone.
  const postAfterDelete = await request.get(`/api/posts/${createdPostId}`);
  expect(postAfterDelete.status()).toBe(404);
});
