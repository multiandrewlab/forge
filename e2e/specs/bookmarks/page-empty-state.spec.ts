import { test, expect } from '../../fixtures/reset.js';

test('bookmarks: /bookmarks page shows empty-state when user has no bookmarks', async ({
  actor,
}) => {
  await actor.goto('/bookmarks');
  await expect(actor.getByTestId('empty-state')).toBeVisible();
  await expect(actor.getByTestId('empty-state-message')).toHaveText('No bookmarked posts yet');
});
