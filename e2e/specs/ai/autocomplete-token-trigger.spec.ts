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

test('ai: typing triggers autocomplete ghost text', async ({ actor }) => {
  await withMockScript(actor, 'autocomplete-typescript-react');
  await openEditorOnNewPost(actor);
  await actor.keyboard.type('export function ');
  await expect(ai.autocompleteSuggestion(actor)).toBeVisible({ timeout: 5_000 });
});
