import { test, expect } from '../../fixtures/reset.js';

test("bookmarks: /bookmarks page lists the user's bookmark on a fresh post", async ({ actor }) => {
  // Create a fresh post + bookmark it via API. Assert by unique title.
  const refresh = await actor.request.post('/api/auth/refresh');
  expect(refresh.ok()).toBe(true);
  const { accessToken } = (await refresh.json()) as { accessToken: string };
  const auth = { Authorization: `Bearer ${accessToken}` };
  const uniqueTitle = `Bookmark-list seed ${Date.now()}`;
  const created = await actor.request.post('/api/posts', {
    headers: auth,
    data: {
      title: uniqueTitle,
      contentType: 'snippet',
      language: 'typescript',
      content: 'x',
      visibility: 'public',
      isDraft: false,
    },
  });
  expect(created.ok()).toBe(true);
  const {
    post: { id: postId },
  } = (await created.json()) as { post: { id: string } };

  const toggle = await actor.request.post(`/api/posts/${postId}/bookmark`, {
    headers: auth,
    data: {},
  });
  expect(toggle.ok()).toBe(true);
  expect(((await toggle.json()) as { bookmarked: boolean }).bookmarked).toBe(true);

  await actor.goto('/bookmarks');
  // Filter to the unique-titled card.
  const card = actor.getByTestId('post-list-item').filter({ hasText: uniqueTitle });
  await expect(card).toHaveCount(1);
});
