import { test, expect } from '../../fixtures/reset.js';
import { search } from '../../fixtures/selectors/search.js';

test('search: since-preset 7d adds ?since=7d and yields fixture posts', async ({ testuser }) => {
  // Pagination fixtures are 2 days old; within 7d window.
  await testuser.goto('/search?q=fixture');
  await search.sincePreset(testuser, '7d').click();
  await expect(testuser).toHaveURL(/[?&]since=7d/);
  await expect(search.searchResultItem(testuser)).toBeVisible();
});
