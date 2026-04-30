import { test, expect } from '../../fixtures/reset.js';
import { search } from '../../fixtures/selectors/search.js';

test('search: try-fuzzy-link toggles to fuzzy=true and yields results', async ({ testuser }) => {
  // typo: "typscrpt" should yield 0 results plain → try fuzzy → ≥1 trigram match
  await testuser.goto('/search?q=typscrpt');
  await search.tryFuzzyLink(testuser).click();
  await expect(testuser).toHaveURL(/[?&]fuzzy=true/);
  await expect(search.searchResultItem(testuser)).toBeVisible();
});
