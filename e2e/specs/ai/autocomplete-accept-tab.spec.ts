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

test('ai: Tab key inserts the suggested text', async ({ testuser }) => {
  await withMockScript(testuser, 'autocomplete-typescript-react');
  await openEditorOnNewPost(testuser);
  await testuser.keyboard.type('export function ');
  await expect(ai.autocompleteSuggestion(testuser)).toBeVisible();
  // Capture the suggestion text the user is about to accept.
  const ghostText = (await ai.autocompleteSuggestion(testuser).textContent()) ?? '';
  expect(ghostText.trim().length).toBeGreaterThan(0);

  await testuser.keyboard.press('Tab');
  // After Tab, the ghost is cleared (either via accept or via doc-change-clears-ghost
  // logic in ghost-text.ts). The suggestion DOM is removed.
  await expect(ai.autocompleteSuggestion(testuser)).toHaveCount(0);

  // Verify the editor's actual document text contains the original typed prefix
  // plus the first chars of the accepted suggestion. Using `.cm-line` excludes the
  // ghost widget DOM (which lives outside .cm-line in the inline-widget decoration).
  const lineText = (await testuser.locator('.cm-line').first().textContent()) ?? '';
  // Pre-typed text must survive acceptance — guards against regressions where Tab
  // replaces the original typed prefix with the suggestion alone.
  expect(lineText).toContain('export function ');
  const expectedPrefix = ghostText.trim().slice(0, 10);
  expect(lineText).toContain(expectedPrefix);
});
