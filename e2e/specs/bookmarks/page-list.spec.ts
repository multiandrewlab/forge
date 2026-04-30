import { test, expect } from '../../fixtures/reset.js';

test("bookmarks: /bookmarks page lists the user's bookmark on a fresh post", async ({
  testuser,
}) => {
  // Create a fresh post + bookmark it via API. Filter the /bookmarks page
  // listing by the unique title to dodge cross-worker pollution that could
  // add or remove other testuser bookmarks mid-flight.
  const refresh = await testuser.request.post('/api/auth/refresh');
  const { accessToken } = (await refresh.json()) as { accessToken: string };
  const auth = { Authorization: `Bearer ${accessToken}` };
  const uniqueTitle = `Bookmark-list seed ${Date.now()}`;
  const created = await testuser.request.post('/api/posts', {
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
  const {
    post: { id: postId },
  } = (await created.json()) as { post: { id: string } };

  const toggle = await testuser.request.post(`/api/posts/${postId}/bookmark`, {
    headers: auth,
    data: {},
  });
  expect(toggle.ok()).toBe(true);
  expect(((await toggle.json()) as { bookmarked: boolean }).bookmarked).toBe(true);

  await testuser.goto('/bookmarks');
  // Filter to the unique-titled card (cross-worker pollution may add others).
  const card = testuser.getByTestId('post-list-item').filter({ hasText: uniqueTitle });
  await expect(card).toHaveCount(1);
});
