import { test, expect } from '../../fixtures/reset.js';
import { search } from '../../fixtures/selectors/search.js';

test('search: clicking author chip on a result adds ?author= filter', async ({ actor }) => {
  // "type" matches multiple seeded snippets across alice/bob/actor; clicking
  // the first author chip emits addAuthorFilter(displayName) → URL gains ?author=.
  await actor.goto('/search?q=type');
  await expect(search.searchResultItem(actor)).toBeVisible();
  // Use .first() — multiple result rows render an author chip.
  await search.searchResultAuthor(actor).first().click();
  await expect(actor).toHaveURL(/[?&]author=/);
  await expect(search.filterChipAuthor(actor)).toBeVisible();
});
