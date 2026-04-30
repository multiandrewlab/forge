import { test, expect } from '../../fixtures/reset.js';
import { search } from '../../fixtures/selectors/search.js';

test('search: recent-searches shows previous query when modal reopens', async ({ testuser }) => {
  await testuser.goto('/');
  // Open the modal via the top-bar trigger.
  await search.searchTrigger(testuser).click();
  await expect(search.searchInput(testuser)).toBeVisible();
  // pushRecent only fires on handleSelect (modal Enter on a result, or click).
  // Type a query that has results, wait for results, then press Enter.
  await search.searchInput(testuser).fill('typescript');
  await expect(search.searchResultItem(testuser)).toBeVisible();
  await testuser.keyboard.press('Enter');
  // handleSelect navigates away (e.g. /posts/<id>) and closes the modal.
  // Reopen on the destination page; recentQueries persists in localStorage.
  await search.searchTrigger(testuser).click();
  await expect(search.searchInput(testuser)).toBeVisible();
  // Recent-searches list should contain "typescript".
  await expect(search.recentQuery(testuser).filter({ hasText: 'typescript' })).toBeVisible();
});
