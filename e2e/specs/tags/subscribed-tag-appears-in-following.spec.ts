import { test, expect } from '../../fixtures/reset.js';
import { tags } from '../../fixtures/selectors/tags.js';

test('tags: subscribed tag appears in sidebar Following list', async ({ testuser }) => {
  // Subscribe via the sidebar UI, then assert the sidebar's Followed Tags
  // list updates with the new tag. Driving the subscribe via UI (not API)
  // shrinks the cross-worker contention window: at workers=4 another spec's
  // reset can wipe an API-set sub between the API call and the page load.
  // Doing both actions in the same in-flight session keeps the assertion
  // immediately reactive after the optimistic UI update.
  await testuser.goto('/');
  await tags.subscribeBtn(testuser, 'python').click();
  await expect(tags.subscribedTagLink(testuser, 'python')).toBeVisible();
});
