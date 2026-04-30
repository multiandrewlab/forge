import { test, expect } from '../../fixtures/reset.js';
import { search } from '../../fixtures/selectors/search.js';

test('search: clicking remove-filter-tag drops the tag from URL', async ({ testuser }) => {
  await testuser.goto('/search?q=ts&tag=typescript');
  await expect(search.filterChipTag(testuser)).toBeVisible();
  await search.removeFilterTag(testuser).click();
  await expect(testuser).not.toHaveURL(/[?&]tag=/);
});
