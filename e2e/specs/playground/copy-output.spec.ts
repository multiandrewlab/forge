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

test('playground: copy button writes streamed content to clipboard', async ({
  testuser,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await withMockScript(testuser, 'default');
  const post = await seedPromptPost(testuser, { content: 'Hi {{name}}!' });

  await testuser.goto(`/playground/${post.id}`);
  await playground.variableInput(testuser, 'name').fill('there');
  await playground.runBtn(testuser).click();
  await expect(playground.outputContent(testuser)).toContainText('Hello world');

  await playground.copyBtn(testuser).click();
  const clipboardText = await testuser.evaluate(() => navigator.clipboard.readText());
  expect(clipboardText).toContain('Hello world');
});
