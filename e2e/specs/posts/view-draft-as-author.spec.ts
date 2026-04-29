import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';

// Pinned seed UUID — testuser-owned draft "Forge E2E Draft Sandbox (testuser)".
// Title intentionally omits "Fixture" so it doesn't shadow the
// `c…0099` fixture in `_journey.spec.ts` search-by-fixture tests.
const DRAFT_POST_ID = 'c0000000-0000-0000-0000-000000000098';

test('post view: testuser views own draft and sees title + draft-badge', async ({ testuser }) => {
  await testuser.goto(`/posts/${DRAFT_POST_ID}`);

  await expect(posts.postTitle(testuser)).toHaveText('Forge E2E Draft Sandbox (testuser)');
  await expect(posts.draftBadge(testuser)).toBeVisible();
});
