import { test, expect } from '../../fixtures/reset.js';

// Zero UUID — guaranteed not to match any seeded or runtime-created post.
const MISSING_POST_ID = '00000000-0000-0000-0000-000000000000';

test('post view: navigating to a missing post id shows "Post not found"', async ({ testuser }) => {
  await testuser.goto(`/posts/${MISSING_POST_ID}`);

  // The page renders "Post not found" in two places when the API 404s: an
  // error banner (from the composable's error.value) and the empty-state
  // div in the v-else branch when currentPost is null. We assert the
  // empty-state — anchor on the unique class string to avoid strict-mode
  // collision with the error banner.
  await expect(testuser.locator('div.text-gray-400.text-center.py-12')).toHaveText(
    'Post not found',
  );
});
