import { test, expect } from '../../fixtures/reset.js';
import { tags } from '../../fixtures/selectors/tags.js';

test('tags: TagPage renders for /tags/typescript', async ({ testuser }) => {
  await testuser.goto('/tags/typescript');
  await expect(tags.tagPage(testuser)).toBeVisible();
  await expect(tags.tagPageTitle(testuser)).toContainText('typescript');
  await expect(testuser.getByTestId('post-list-item').first()).toBeVisible();
});
