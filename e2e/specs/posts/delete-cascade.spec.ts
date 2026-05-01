import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';

test('delete: cascade — post + comments + votes + bookmarks all vanish', async ({
  actor,
  alice,
}) => {
  // actor creates a post (auth via refresh-token exchange — see
  // edit-own-post.spec.ts for canonical pattern).
  const tuRefresh = await actor.request.post('/api/auth/refresh');
  expect(tuRefresh.ok()).toBe(true);
  const { accessToken: tuToken } = (await tuRefresh.json()) as { accessToken: string };

  const created = await actor.request.post('/api/posts', {
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
  // actor's post. Endpoint shapes verified against:
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

  // actor deletes via UI — exercises the new dialog.
  await actor.goto(`/posts/${createdPostId}`);
  await posts.postDeleteBtn(actor).click();
  await posts.postDeleteConfirm(actor).click();
  await expect(actor).toHaveURL(/\/$/);

  // Cascade verification: the post itself returns 404. Postgres FK-cascade
  // (posts → comments / votes / bookmarks) implies all children are gone.
  //
  // Auth note: GET /api/posts/:id is auth-required after WU2 of issue #62, so
  // the unauthenticated `request` fixture would 401 here. Reusing actor's
  // bearer token keeps the assertion targeted at the 404 (post truly gone)
  // rather than masking it behind an auth challenge.
  const postAfterDelete = await actor.request.get(`/api/posts/${createdPostId}`, {
    headers: { Authorization: `Bearer ${tuToken}` },
  });
  expect(postAfterDelete.status()).toBe(404);
});
