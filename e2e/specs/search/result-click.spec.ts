import { test, expect } from '../../fixtures/reset.js';
import { search } from '../../fixtures/selectors/search.js';

test('search: clicking a result navigates to /posts/<id>', async ({ actor }) => {
  await actor.goto('/search?q=typescript');
  await expect(search.searchResultItem(actor)).toBeVisible();
  await search.searchResultItem(actor).click();
  await expect(actor).toHaveURL(/\/posts\/c0000000-/);
});
