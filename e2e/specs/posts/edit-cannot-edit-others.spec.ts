import { test, expect } from '../../fixtures/reset.js';

// Pinned seed UUID — actor-owned public snippet. Alice should be forbidden from editing it.
const TESTUSER_OWNED_POST_ID = 'c0000000-0000-0000-0000-000000000099';

test('edit: alice cannot edit actor-owned post (forbidden)', async ({ alice }) => {
  await alice.goto(`/posts/${TESTUSER_OWNED_POST_ID}/edit`);
  await expect(alice.getByTestId('forbidden-page')).toBeVisible();
});
