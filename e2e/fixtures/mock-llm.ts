import type { Page } from '@playwright/test';
import type { MockScriptKey } from '@forge/shared';

/**
 * Type-safe wrapper around the X-Mock-Script header (foundation #44).
 * Each subsequent SPA → /api/ai/* request will use this script.
 */
export async function withMockScript(page: Page, key: MockScriptKey): Promise<void> {
  await page.setExtraHTTPHeaders({ 'X-Mock-Script': key });
}

/**
 * Clear the mock-script header (revert to the deterministic 'default' script
 * baked into the mock provider).
 */
export async function clearMockScript(page: Page): Promise<void> {
  await page.setExtraHTTPHeaders({});
}
