import { test, expect } from '../../fixtures/reset.js';
import { search } from '../../fixtures/selectors/search.js';

test('search: plain query "typescript" returns matching results', async ({ testuser }) => {
  await testuser.goto('/search?q=typescript');
  await expect(search.searchResultItem(testuser)).toBeVisible();
});
