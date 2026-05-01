import { test, expect } from '../../fixtures/reset.js';
import { tags } from '../../fixtures/selectors/tags.js';

test('tags: subscribe via TagPage subscribe button', async ({ testuser }) => {
  await testuser.goto('/tags/devops');
  // Scope to the tag-page region: the same subscribe-btn-devops also appears
  // in the sidebar Popular Tags shard, so getByTestId is a strict-mode
  // violation without scoping.
  const subscribeBtn = tags.tagPage(testuser).getByTestId('subscribe-btn-devops');
  await expect(subscribeBtn).toHaveAttribute('aria-pressed', 'false');
  await subscribeBtn.click();
  await expect(subscribeBtn).toHaveAttribute('aria-pressed', 'true');
});
