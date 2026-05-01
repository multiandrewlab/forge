import { test, expect } from '../../fixtures/reset.js';
import { search } from '../../fixtures/selectors/search.js';

test('search: since-preset 7d adds ?since=7d and yields fixture posts', async ({ actor }) => {
  // Pagination fixtures are 2 days old; within 7d window.
  await actor.goto('/search?q=fixture');
  await search.sincePreset(actor, '7d').click();
  await expect(actor).toHaveURL(/[?&]since=7d/);
  await expect(search.searchResultItem(actor)).toBeVisible();
});
