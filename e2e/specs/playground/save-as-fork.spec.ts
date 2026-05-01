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

  await playground.forkBtn(testuser).click();

  await testuser.waitForURL(/\/playground\/[0-9a-f-]+$/, { timeout: 10_000 });
  const forkedId = testuser.url().split('/').pop();
  expect(forkedId).not.toBe(sourceId);

  await expect(playground.page(testuser)).toBeVisible();
});
