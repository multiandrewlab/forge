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

test('playground: open prompt page renders header, source disclosure (collapsed), run button', async ({
  testuser,
}) => {
  await withMockScript(testuser, 'default');
  const post = await seedPromptPost(testuser, { title: 'Greeting', content: 'Hi {{name}}!' });

  await testuser.goto(`/playground/${post.id}`);

  await expect(playground.page(testuser)).toBeVisible();
  await expect(playground.title(testuser)).toContainText('Greeting');
  await expect(playground.runBtn(testuser)).toBeVisible();
  // Disclosure is present and collapsed by default
  const disclosure = playground.promptSource(testuser);
  await expect(disclosure).toBeVisible();
  await expect(disclosure).not.toHaveAttribute('open', '');
});
