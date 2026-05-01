import { test, expect } from '../../fixtures/reset.js';
import { playground } from '../../fixtures/selectors/playground.js';
import { withMockScript } from '../../fixtures/mock-llm.js';
import type { Page } from '@playwright/test';

async function seedPromptPost(
  page: Page,
  options: { content?: string; title?: string } = {},
): Promise<{ id: string }> {
  const refresh = await page.request.post('/api/auth/refresh');
  const { accessToken } = await refresh.json();
  const created = await page.request.post('/api/posts', {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: {
      title: options.title ?? `e2e-prompt-${Date.now()}`,
      contentType: 'prompt',
      language: 'markdown',
      content: options.content ?? 'Hello {{name}}!',
      visibility: 'public',
      isDraft: false,
    },
  });
  expect(created.ok()).toBeTruthy();
  const { post } = await created.json();
  return post;
}

test('playground: generate-readme-short script renders deterministic README chunks', async ({
  testuser,
}) => {
  await withMockScript(testuser, 'generate-readme-short');
  const post = await seedPromptPost(testuser, { content: 'Generate a README for {{project}}' });
  await testuser.goto(`/playground/${post.id}`);
  await playground.variableInput(testuser, 'project').fill('forge');
  await playground.runBtn(testuser).click();

  // generate-readme-short emits: ['# README\n', '\n', 'TODO: write content.', '[done]']
  // '# README' is the deterministic substring (single hash, not '## ').
  await expect(playground.outputContent(testuser)).toContainText('# README', { timeout: 10_000 });
  await expect(playground.outputContent(testuser)).toContainText('TODO: write content.');
});
