import { test, expect } from '../../fixtures/reset.js';

test("bookmarks: /bookmarks page lists the user's bookmarks", async ({ testuser }) => {
  // testuser has 0 seeded bookmarks; arrange one via API.
  const refresh = await testuser.request.post('/api/auth/refresh');
  const { accessToken } = (await refresh.json()) as { accessToken: string };
  const cheatsheetId = 'c0000000-0000-0000-0000-000000000001';
  const toggle = await testuser.request.post(`/api/posts/${cheatsheetId}/bookmark`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: {},
  });
  expect(toggle.ok()).toBe(true);
  expect(((await toggle.json()) as { bookmarked: boolean }).bookmarked).toBe(true);

  await testuser.goto('/bookmarks');
  const cards = testuser.getByTestId('post-list-item');
  await expect(cards).toHaveCount(1);
  // Cheatsheet card title (from seed): "TypeScript Cheatsheet — Common Utility Types"
  await expect(cards.first()).toContainText('TypeScript');
});
