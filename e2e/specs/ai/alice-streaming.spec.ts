import { test, expect } from '../../fixtures/reset.js';
import { ai } from '../../fixtures/selectors/ai.js';
import { withMockScript } from '../../fixtures/mock-llm.js';

// Both tests below exercise alice's per-userId AI rate-limiter slot via
// /api/ai/generate. At workers=4 (CI) Playwright will otherwise schedule
// them on different workers concurrently, where one alice's in-flight
// stream causes the other's /api/ai/generate to 429 and the error UI
// surfaces the generic "Request failed" rather than the streamed
// rate-limit message we expect. Forcing serial mode within this file keeps
// both alice-scoped flows on the same worker.
test.describe.configure({ mode: 'serial' });

test('ai: generate panel streams chunks INTO the editor (alice)', async ({ alice }) => {
  await withMockScript(alice, 'generate-readme-short');
  await alice.goto('/posts/new');
  await ai.generateToggle(alice).click();
  await expect(ai.generatePanel(alice)).toBeVisible();
  await ai.generateDescription(alice).fill('Generate a short README');
  await ai.generateSubmit(alice).click();
  // generate-readme-short emits: '# README\n', '\n', 'TODO: write content.', '[done]'
  await expect(ai.editorContent(alice)).toContainText('# README', { timeout: 10_000 });
});

test('ai: error-rate-limit script surfaces error UI (alice)', async ({ alice }) => {
  await withMockScript(alice, 'error-rate-limit');
  await alice.goto('/posts/new');
  await ai.generateToggle(alice).click();
  await ai.generateDescription(alice).fill('Anything');
  await ai.generateSubmit(alice).click();
  await expect(ai.generateError(alice)).toBeVisible({ timeout: 5_000 });
  await expect(ai.generateError(alice)).toContainText(/rate.?limit|too many/i);
});
