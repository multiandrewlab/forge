import { test, expect } from '../../fixtures/reset.js';
import { bookmarks } from '../../fixtures/selectors/bookmarks.js';
import { storageStatePath } from '../../fixtures/auth.js';

test('bookmarks: persist across sessions (close context, reopen)', async ({
  browser,
  testuser,
}) => {
  // Use a freshly created post (not the seeded cheatsheet) so the assertion
  // is immune to cross-worker contention on shared seed state. testuser
  // bookmarks THIS post; the assertion against /bookmarks looks up THIS post
  // by title (unique per run).
  const refresh = await testuser.request.post('/api/auth/refresh');
  const { accessToken } = (await refresh.json()) as { accessToken: string };
  const auth = { Authorization: `Bearer ${accessToken}` };
  const uniqueTitle = `Bookmark-persists seed ${Date.now()}`;
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

  // Session A: bookmark via UI on the post-view
  await testuser.goto(`/posts/${postId}`);
  await bookmarks.toggleBtn(testuser).click();
  await expect(bookmarks.onIcon(testuser)).toBeVisible();
  await testuser.context().close();

  // Session B: brand-new context with the same storage state.
  // The bookmark survived the context close — it lives in the DB, not in cookies.
  // Asserting via /bookmarks (which queries the server's bookmarks list on
  // mount) rather than the post-view bookmark icon: PostViewPage doesn't
  // currently hydrate `userBookmarks` from any feed/post API response, so a
  // fresh page load on /posts/:id can't reflect persisted state in the
  // bookmark icon. The /bookmarks page round-trips through the server, so
  // it's the faithful UI surface for "bookmark survived the context close".
  const ctx = await browser.newContext({ storageState: storageStatePath('testuser') });
  const page = await ctx.newPage();
  await page.goto('/bookmarks');
  // Filter to the unique-titled card to dodge cross-worker pollution.
  const card = page.getByTestId('post-list-item').filter({ hasText: uniqueTitle });
  await expect(card).toHaveCount(1);
  await ctx.close();
});
