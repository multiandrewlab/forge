import { test, expect } from '../../fixtures/reset.js';
import { bookmarks } from '../../fixtures/selectors/bookmarks.js';
import { storageStatePath } from '../../fixtures/auth.js';

test('bookmarks: persist across sessions (close context, reopen)', async ({
  browser,
  testuser,
}) => {
  const cheatsheetId = 'c0000000-0000-0000-0000-000000000001';

  // Session A: use the auto-injected testuser page; bookmark cheatsheet via UI
  await testuser.goto(`/posts/${cheatsheetId}`);
  await bookmarks.toggleBtn(testuser).click();
  await expect(bookmarks.onIcon(testuser)).toBeVisible();
  await testuser.context().close();

  // Session B: brand-new context with the same storage state
  const ctx = await browser.newContext({ storageState: storageStatePath('testuser') });
  const page = await ctx.newPage();
  // The bookmark survived the context close — it lives in the DB, not in cookies.
  // Asserting via /bookmarks (which queries the server's bookmarks list on
  // mount) rather than the post-view bookmark icon: PostViewPage doesn't
  // currently hydrate `userBookmarks` from any feed/post API response, so a
  // fresh page load on /posts/:id can't reflect persisted state in the
  // bookmark icon. The /bookmarks page round-trips through the server, so
  // it's the faithful UI surface for "bookmark survived the context close".
  await page.goto('/bookmarks');
  const cards = page.getByTestId('post-list-item');
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText('TypeScript');
  await ctx.close();
});
