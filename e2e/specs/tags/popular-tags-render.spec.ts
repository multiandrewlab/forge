import { test, expect } from '../../fixtures/reset.js';
import { tags } from '../../fixtures/selectors/tags.js';

test('tags: popular-tags list renders on home', async ({ actor }) => {
  await actor.goto('/');
  await expect(tags.popularTagsList(actor)).toBeVisible();
  await expect(tags.popularTagRow(actor, 'typescript')).toBeVisible();
});
