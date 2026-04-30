import { test, expect } from '../../fixtures/reset.js';
import { tags } from '../../fixtures/selectors/tags.js';

test('tags: popular-tags list renders on home', async ({ testuser }) => {
  await testuser.goto('/');
  await expect(tags.popularTagsList(testuser)).toBeVisible();
  await expect(tags.popularTagRow(testuser, 'typescript')).toBeVisible();
});
