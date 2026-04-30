import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';

// Issue #64: LinkPreviewCard mounted; refresh wired to POST /refresh-preview.
test('link-preview: author can refresh; POST /refresh-preview returns 200', async ({ alice }) => {
  await alice.goto('/');
  await alice.getByText('Awesome TypeScript Resources').click();

  const refreshBtn = posts.linkPreviewRefresh(alice);
  await expect(refreshBtn).toBeVisible();

  const refreshResponse = alice.waitForResponse(
    (res) =>
      /\/api\/posts\/[a-f0-9-]+\/refresh-preview$/.test(res.url()) &&
      res.request().method() === 'POST',
  );
  await refreshBtn.click();
  const response = await refreshResponse;
  expect(response.status()).toBe(200);
});
