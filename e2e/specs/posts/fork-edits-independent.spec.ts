import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';

// Pinned seed post — actor-owned public snippet. alice forks it, edits the
// fork's title, then we GET the SOURCE post via /api/posts/:id and assert its
// title is unchanged. This proves fork is a linked-but-independent copy: the
// source row is untouched by edits to the fork.
const SEEDED_POST_ID = 'c0000000-0000-0000-0000-000000000099';
const SEEDED_TITLE = 'Test Fixture Post (actor-owned)';

test('fork: editing the fork does not mutate the source post', async ({ alice }) => {
  await alice.goto(`/posts/${SEEDED_POST_ID}`);
  await posts.forkBtn(alice).click();
  await expect(alice).toHaveURL(new RegExp(`/posts/(?!${SEEDED_POST_ID}\\b)[a-f0-9-]+/edit$`));

  // Edit the fork's title via the new-post-title input (Save Draft commits it).
  const FORK_TITLE = 'Alice fork — independent edit';
  await posts.newPostTitle(alice).fill(FORK_TITLE);
  await posts.newPostSaveDraft(alice).click();
  await expect(posts.newPostTitle(alice)).toHaveValue(FORK_TITLE);

  // GET /api/posts/<source> and verify the source's title is unchanged.
  // Authed flow mirrors the edit-own-post pattern: refresh cookie -> access
  // token -> Authorization: Bearer.
  const refresh = await alice.request.post('/api/auth/refresh');
  expect(refresh.ok()).toBe(true);
  const { accessToken } = (await refresh.json()) as { accessToken: string };

  const sourceRes = await alice.request.get(`/api/posts/${SEEDED_POST_ID}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  expect(sourceRes.ok()).toBe(true);
  const { post } = (await sourceRes.json()) as { post: { title: string } };
  expect(post.title).toBe(SEEDED_TITLE);
});
