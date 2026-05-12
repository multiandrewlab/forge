import { test, expect } from '../../fixtures/reset.js';
import { ai } from '../../fixtures/selectors/ai.js';
import { withMockScript } from '../../fixtures/mock-llm.js';

// Both tests below exercise alice's per-userId AI rate-limiter slot via
// /api/ai/generate. Serial mode keeps both flows on the same worker, AND
// test 1 must wait for its stream to fully complete before exiting —
// otherwise alice's slot is still held when test 2 starts and the gate
// returns 429, surfacing the generic "Request failed" instead of the
// streamed rate-limit message we want test 2 to assert against (#88).
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
  // Wait for the full paced stream (~600ms) to finish — when panelState leaves
  // 'generating' the toggle button re-renders. This releases alice's AI slot
  // server-side before the next test fires its request (#88).
  await expect(ai.generateToggle(alice)).toBeVisible({ timeout: 10_000 });
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
