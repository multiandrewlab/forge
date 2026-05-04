import { test, expect } from '../../fixtures/reset.js';
import { tags } from '../../fixtures/selectors/tags.js';

test('tags: unsubscribe from sidebar (was pre-subscribed)', async ({ actor }) => {
  // Establish the "pre-subscribed" state in the same browsing session that
  // performs the unsubscribe assertion: at workers=4 an API-only pre-state
  // is racy because another worker's per-spec reset can wipe the sub
  // between the API call and the page load. Click-to-subscribe then
  // click-to-unsubscribe within one session keeps the round-trip inside
  // the same fixture-boundary window.
  await actor.goto('/');
  const subscribeBtn = tags.subscribeBtn(actor, 'ai-prompts');
  await expect(subscribeBtn).toHaveAttribute('aria-pressed', 'false');
  await subscribeBtn.click();
  await expect(subscribeBtn).toHaveAttribute('aria-pressed', 'true');
  await subscribeBtn.click();
  await expect(subscribeBtn).toHaveAttribute('aria-pressed', 'false');
});
