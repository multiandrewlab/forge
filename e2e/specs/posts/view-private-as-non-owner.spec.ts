import { test, expect } from '../../fixtures/reset.js';

// Pinned seed UUID — carol-owned PRIVATE document "My Kubernetes Notes".
const PRIVATE_POST_ID = 'c0000000-0000-0000-0000-000000000006';

test("post view: alice cannot see carol's private post; forbidden state renders", async ({
  alice,
}) => {
  await alice.goto(`/posts/${PRIVATE_POST_ID}`);
  await expect(alice.getByTestId('forbidden-page')).toBeVisible();
  await expect(alice.getByTestId('forbidden-page')).toContainText('This post is private');
});
