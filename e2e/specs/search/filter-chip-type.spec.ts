import { test, expect } from '../../fixtures/reset.js';
import { search } from '../../fixtures/selectors/search.js';

test('search: type filter chip renders when ?type= is set', async ({ testuser }) => {
  await testuser.goto('/search?q=ts&type=snippet');
  await expect(search.filterChipType(testuser)).toBeVisible();
});
