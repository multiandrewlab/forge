import { test, expect } from '../../fixtures/reset.js';
import { search } from '../../fixtures/selectors/search.js';

test('search: try-fuzzy-link toggles to fuzzy=true and yields results', async ({ actor }) => {
  // typo: "typscrpt" should yield 0 results plain → try fuzzy → ≥1 trigram match
  await actor.goto('/search?q=typscrpt');
  await search.tryFuzzyLink(actor).click();
  await expect(actor).toHaveURL(/[?&]fuzzy=true/);
  await expect(search.searchResultItem(actor)).toBeVisible();
});
