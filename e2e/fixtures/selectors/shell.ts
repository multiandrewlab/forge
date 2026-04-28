import type { Page, Locator } from '@playwright/test';

/**
 * Cross-cutting selectors used by the journey smoke. Each entry below has a
 * matching data-testid attribute somewhere in packages/client/src/**.
 *
 * Convention:
 *   - Interactive: kebab + role suffix (e.g. 'submit-btn').
 *   - Content/state: bare kebab nouns (e.g. 'error-message').
 *   - Selection always uses getByTestId; assertions on copy use toContainText.
 */
export const shell = {
  errorToast: (page: Page): Locator => page.getByTestId('error-toast'),
  // The TheTopBar.vue search-trigger already exists (foundation).
  searchTrigger: (page: Page): Locator => page.getByTestId('search-trigger'),
  // Generic forbidden / not-permitted page used by the permission phase.
  forbiddenPage: (page: Page): Locator => page.getByTestId('forbidden-page'),
};
