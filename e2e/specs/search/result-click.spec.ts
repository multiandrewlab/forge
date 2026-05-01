import { test, expect } from '../../fixtures/reset.js';
import { search } from '../../fixtures/selectors/search.js';

test('search: clicking a result navigates to /posts/<id>', async ({ testuser }) => {
  await testuser.goto('/search?q=typescript');
  await expect(search.searchResultItem(testuser)).toBeVisible();
  await search.searchResultItem(testuser).click();
  await expect(testuser).toHaveURL(/\/posts\/c0000000-/);
});
