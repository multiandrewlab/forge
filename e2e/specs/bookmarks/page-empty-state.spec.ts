import { test, expect } from '../../fixtures/reset.js';

test('bookmarks: /bookmarks page shows empty-state when user has no bookmarks', async ({
  testuser,
}) => {
  // testuser has 0 seeded bookmarks (the bookmark on c0…99 is alice's, not testuser's).
  // Asserting against the post-reset baseline directly — no arrange step needed.
  await testuser.goto('/bookmarks');
  await expect(testuser.getByTestId('empty-state')).toBeVisible();
  await expect(testuser.getByTestId('empty-state-message')).toHaveText('No bookmarked posts yet');
});
