import { test, expect } from '../../fixtures/reset.js';
import { search } from '../../fixtures/selectors/search.js';

test('search: paginate the 25 paginationuser fixture results', async ({ actor }) => {
  // 25 posts tagged tag-pagination-fixture, default limit=20 → 2 pages.
  await actor.goto('/search?q=fixture&tag=tag-pagination-fixture');
  await expect(search.pageIndicator(actor)).toContainText('page 1 of 2');
  await search.nextPageBtn(actor).click();
  await expect(actor).toHaveURL(/[?&]page=2/);
});
