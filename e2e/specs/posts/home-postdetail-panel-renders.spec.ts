import { test, expect } from '../../fixtures/reset.js';

test('home: PostDetail panel renders at default desktop viewport with a selected post', async ({
  alice,
}) => {
  // Default Playwright viewport is 1280×720 (Desktop Chrome) — the md: breakpoint.
  await alice.goto('/');

  // Assert the panel container is in the DOM AND visible (i.e. md:block applied).
  const panel = alice.getByTestId('postdetail-panel');
  await expect(panel).toBeVisible();

  // Auto-select picks the first post; assert PostDetail rendered the post-author
  // surface (a stable inner testid). This affirmatively verifies "with a selected
  // post" — DoD bullet 4.
  await expect(panel.getByTestId('author-avatar').first()).toBeVisible();
});
