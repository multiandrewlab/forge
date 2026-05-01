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

test('playground: post with multiple required vars renders all + gates Run', async ({
  testuser,
}) => {
  await withMockScript(testuser, 'default');
  const post = await seedPromptPost(testuser, {
    content: 'Hello {{name}}, you are a {{role}} working on {{project}}.',
  });
  await testuser.goto(`/playground/${post.id}`);

  await expect(playground.variableInput(testuser, 'name')).toBeVisible();
  await expect(playground.variableInput(testuser, 'role')).toBeVisible();
  await expect(playground.variableInput(testuser, 'project')).toBeVisible();

  await expect(playground.runBtn(testuser)).toBeDisabled();
  await playground.variableInput(testuser, 'name').fill('Andrew');
  await expect(playground.runBtn(testuser)).toBeDisabled();
  await playground.variableInput(testuser, 'role').fill('engineer');
  await expect(playground.runBtn(testuser)).toBeDisabled();
  await playground.variableInput(testuser, 'project').fill('forge');
  await expect(playground.runBtn(testuser)).toBeEnabled();

  await playground.runBtn(testuser).click();
  await expect(playground.outputContent(testuser)).toContainText('Hello world');
});
