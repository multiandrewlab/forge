import { test, expect } from '../../fixtures/reset.js';
import { search } from '../../fixtures/selectors/search.js';

test('search: nonsense query shows try-fuzzy-link affordance', async ({ actor }) => {
  await actor.goto('/search?q=zzzz-no-such-content-12345');
  await expect(search.tryFuzzyLink(actor)).toBeVisible();
});
