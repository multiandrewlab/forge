import { test, expect } from '../../fixtures/reset.js';
import { playground } from '../../fixtures/selectors/playground.js';
import { withMockScript } from '../../fixtures/mock-llm.js';

test('playground: fork button creates new prompt post; navigates to /playground/{newId}', async ({
  testuser,
}) => {
  await withMockScript(testuser, 'default');
  // Use the demo prompt as source (alice-owned, fully defaulted, public)
  const sourceId = 'c0000000-0000-0000-0000-000000000004';
  await testuser.goto(`/playground/${sourceId}`);

  // Wait for the playground page to render before clicking. Without this gate
  // the goto's `load` event resolves before the SPA's fetchPost completes, so
  // the fork handler runs without a contentType prop and silently no-ops or
  // routes to the wrong page (caught when the suite runs as a sequence — the
  // single-spec run doesn't reproduce because the suite warmup masks the race).
  await expect(playground.page(testuser)).toBeVisible();
  await expect(playground.forkBtn(testuser)).toBeEnabled();

  // Pair the click with a request-wait so we know fork resolves before
  // checking for the URL change. Otherwise the click may register before
  // PlaygroundHeader's fork handler is bound.
  const [forkResponse] = await Promise.all([
    testuser.waitForResponse(
      (res) =>
        res.url().includes(`/api/posts/${sourceId}/fork`) && res.request().method() === 'POST',
    ),
    playground.forkBtn(testuser).click(),
  ]);
  expect(forkResponse.ok()).toBeTruthy();

  await testuser.waitForURL(
    (url) => /\/playground\/[0-9a-f-]+$/.test(url.pathname) && !url.pathname.endsWith(sourceId),
    { timeout: 10_000 },
  );
  const forkedId = testuser.url().split('/').pop();
  expect(forkedId).not.toBe(sourceId);

  await expect(playground.page(testuser)).toBeVisible();
});
