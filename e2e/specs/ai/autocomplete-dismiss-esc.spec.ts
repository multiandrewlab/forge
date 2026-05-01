import { test, expect } from '../../fixtures/reset.js';
import { ai } from '../../fixtures/selectors/ai.js';
import { withMockScript } from '../../fixtures/mock-llm.js';
import type { Page } from '@playwright/test';

async function openEditorOnNewPost(page: Page): Promise<void> {
  // ?language=typescript ensures /api/ai/complete passes Zod validation (language min(1)).
  // PostNewPage reads route.query.language on mount.
  await page.goto('/posts/new?language=typescript');
  await page.locator('.cm-content').first().waitFor();
  await page.locator('.cm-content').first().click();
}

test('ai: Esc dismisses ghost text without inserting', async ({ testuser }) => {
  await withMockScript(testuser, 'autocomplete-typescript-react');
  await openEditorOnNewPost(testuser);
  await testuser.keyboard.type('export function ');
  await expect(ai.autocompleteSuggestion(testuser)).toBeVisible();
  // Capture the suggestion text we are about to dismiss.
  const ghostText = (await ai.autocompleteSuggestion(testuser).textContent()) ?? '';
  expect(ghostText.trim().length).toBeGreaterThan(0);

  await testuser.keyboard.press('Escape');
  // The ghost widget is removed from the DOM after Esc.
  await expect(ai.autocompleteSuggestion(testuser)).toHaveCount(0);

  // Esc must NOT have inserted the suggestion into the document.
  // `.cm-line` includes inline widget text while the ghost is rendered, but
  // after toHaveCount(0) the widget is gone, so .cm-line is the real document.
  // We just need to verify the ghost text isn't present in the real document.
  const afterLine = (await testuser.locator('.cm-line').first().textContent()) ?? '';
  expect(afterLine).not.toContain(ghostText.trim().slice(0, 10));
  // And the user's typed prefix is still there.
  expect(afterLine).toContain('export function');
});
