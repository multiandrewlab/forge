import type { Page, Locator } from '@playwright/test';

export const bookmarks = {
  bookmarkToggle: (page: Page): Locator => page.getByTestId('bookmark-toggle-btn'),
  bookmarkOnIcon: (page: Page): Locator => page.getByTestId('bookmark-on-icon'),
};
