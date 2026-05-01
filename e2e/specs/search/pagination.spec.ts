import { test, expect } from '../../fixtures/reset.js';
import { search } from '../../fixtures/selectors/search.js';

test('search: paginate the 25 paginationuser fixture results', async ({ testuser }) => {
  // 25 posts tagged tag-pagination-fixture, default limit=20 → 2 pages.
  await testuser.goto('/search?q=fixture&tag=tag-pagination-fixture');
  await expect(search.pageIndicator(testuser)).toContainText('page 1 of 2');
  await search.nextPageBtn(testuser).click();
  await expect(testuser).toHaveURL(/[?&]page=2/);
});
