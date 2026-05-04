import { test, expect } from '../../fixtures/reset.js';
import { tags } from '../../fixtures/selectors/tags.js';

test('tags: subscribe via TagPage subscribe button', async ({ actor }) => {
  await actor.goto('/tags/devops');
  // Scope to the tag-page region: the same subscribe-btn-devops also appears
  // in the sidebar Popular Tags shard, so getByTestId is a strict-mode
  // violation without scoping.
  const subscribeBtn = tags.tagPage(actor).getByTestId('subscribe-btn-devops');
  await expect(subscribeBtn).toHaveAttribute('aria-pressed', 'false');
  await subscribeBtn.click();
  await expect(subscribeBtn).toHaveAttribute('aria-pressed', 'true');
});
