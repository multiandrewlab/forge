import { test, expect } from '../../fixtures/reset.js';
import { search } from '../../fixtures/selectors/search.js';

test('search: tag filter chip renders when ?tag= is set', async ({ actor }) => {
  await actor.goto('/search?q=ts&tag=typescript');
  await expect(search.filterChipTag(actor)).toBeVisible();
});
