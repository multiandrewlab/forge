import { test, expect } from '../../fixtures/reset.js';
import { search } from '../../fixtures/selectors/search.js';

test('search: type filter chip renders when ?type= is set', async ({ actor }) => {
  await actor.goto('/search?q=ts&type=snippet');
  await expect(search.filterChipType(actor)).toBeVisible();
});
