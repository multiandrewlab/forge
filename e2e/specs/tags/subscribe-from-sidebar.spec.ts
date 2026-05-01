import { test, expect } from '../../fixtures/reset.js';
import { tags } from '../../fixtures/selectors/tags.js';

test('tags: subscribe to typescript via sidebar popular-tags button', async ({ actor }) => {
  await actor.goto('/');
  const subscribeBtn = tags.subscribeBtn(actor, 'typescript');
  await expect(subscribeBtn).toHaveAttribute('aria-pressed', 'false');
  await subscribeBtn.click();
  await expect(subscribeBtn).toHaveAttribute('aria-pressed', 'true');
});
