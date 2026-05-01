import { test, expect } from '../../fixtures/reset.js';
import { search } from '../../fixtures/selectors/search.js';

test('search: clicking author chip on a result adds ?author= filter', async ({ testuser }) => {
  // "type" matches multiple seeded snippets across alice/bob/testuser; clicking
  // the first author chip emits addAuthorFilter(displayName) → URL gains ?author=.
  await testuser.goto('/search?q=type');
  await expect(search.searchResultItem(testuser)).toBeVisible();
  // Use .first() — multiple result rows render an author chip.
  await search.searchResultAuthor(testuser).first().click();
  await expect(testuser).toHaveURL(/[?&]author=/);
  await expect(search.filterChipAuthor(testuser)).toBeVisible();
});
