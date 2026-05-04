import { test, expect } from '../../fixtures/reset.js';
import { search } from '../../fixtures/selectors/search.js';

test('search: recent-searches shows previous query when modal reopens', async ({ actor }) => {
  await actor.goto('/');
  // Open the modal via the top-bar trigger.
  await search.searchTrigger(actor).click();
  await expect(search.searchInput(actor)).toBeVisible();
  // pushRecent only fires on handleSelect (modal Enter on a result, or click).
  // Type a query that has results, wait for results, then press Enter.
  await search.searchInput(actor).fill('typescript');
  await expect(search.searchResultItem(actor)).toBeVisible();
  await actor.keyboard.press('Enter');
  // handleSelect navigates away (e.g. /posts/<id>) and closes the modal.
  // Reopen on the destination page; recentQueries persists in localStorage.
  await search.searchTrigger(actor).click();
  await expect(search.searchInput(actor)).toBeVisible();
  // Recent-searches list should contain "typescript".
  await expect(search.recentQuery(actor).filter({ hasText: 'typescript' })).toBeVisible();
});
