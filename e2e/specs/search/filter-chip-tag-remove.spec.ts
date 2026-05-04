import { test, expect } from '../../fixtures/reset.js';
import { search } from '../../fixtures/selectors/search.js';

test('search: clicking remove-filter-tag drops the tag from URL', async ({ actor }) => {
  await actor.goto('/search?q=ts&tag=typescript');
  await expect(search.filterChipTag(actor)).toBeVisible();
  await search.removeFilterTag(actor).click();
  await expect(actor).not.toHaveURL(/[?&]tag=/);
});
