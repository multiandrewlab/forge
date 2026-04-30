import { test, expect } from '../../fixtures/reset.js';
import { bookmarks } from '../../fixtures/selectors/bookmarks.js';

test('bookmarks: toggle on post-view (off → on → off)', async ({ testuser }) => {
  const cheatsheetId = 'c0000000-0000-0000-0000-000000000001';

  await testuser.goto(`/posts/${cheatsheetId}`);
  // Initially: testuser has no bookmark on cheatsheet
  await expect(bookmarks.onIcon(testuser)).toHaveCount(0);

  await bookmarks.toggleBtn(testuser).click();
  await expect(bookmarks.onIcon(testuser)).toBeVisible();

  await bookmarks.toggleBtn(testuser).click();
  await expect(bookmarks.onIcon(testuser)).toHaveCount(0);
});
