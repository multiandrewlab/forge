import { test, expect } from '../../fixtures/reset.js';
import { tags } from '../../fixtures/selectors/tags.js';

test('tags: TagPage renders for /tags/typescript', async ({ actor }) => {
  await actor.goto('/tags/typescript');
  await expect(tags.tagPage(actor)).toBeVisible();
  await expect(tags.tagPageTitle(actor)).toContainText('typescript');
  await expect(actor.getByTestId('post-list-item').first()).toBeVisible();
});
