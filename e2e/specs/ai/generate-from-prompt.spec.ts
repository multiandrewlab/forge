import { test, expect } from '../../fixtures/reset.js';
import { ai } from '../../fixtures/selectors/ai.js';
import { withMockScript } from '../../fixtures/mock-llm.js';

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
