import { test, expect } from '../../fixtures/reset.js';
import { bookmarks } from '../../fixtures/selectors/bookmarks.js';

test('bookmarks: per-card toggle on the feed (off → on → off)', async ({ testuser }) => {
  const cheatsheetId = 'c0000000-0000-0000-0000-000000000001';

  await testuser.goto('/');
  // Initially: no on-icon on the cheatsheet card for testuser
  await expect(bookmarks.feedOnIconOnCard(testuser, cheatsheetId)).toHaveCount(0);

  await bookmarks.feedToggleOnCard(testuser, cheatsheetId).click();
  await expect(bookmarks.feedOnIconOnCard(testuser, cheatsheetId)).toBeVisible();

  await bookmarks.feedToggleOnCard(testuser, cheatsheetId).click();
  await expect(bookmarks.feedOnIconOnCard(testuser, cheatsheetId)).toHaveCount(0);
});
