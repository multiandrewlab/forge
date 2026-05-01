import { test, expect } from '../../fixtures/reset.js';
import { ai } from '../../fixtures/selectors/ai.js';
import { withMockScript } from '../../fixtures/mock-llm.js';

test('ai: error-rate-limit script surfaces error UI (alice)', async ({ alice }) => {
  await withMockScript(alice, 'error-rate-limit');
  await alice.goto('/posts/new');
  await ai.generateToggle(alice).click();
  await ai.generateDescription(alice).fill('Anything');
  await ai.generateSubmit(alice).click();
  await expect(ai.generateError(alice)).toBeVisible({ timeout: 5_000 });
  await expect(ai.generateError(alice)).toContainText(/rate.?limit|too many/i);
});
