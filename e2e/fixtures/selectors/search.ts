import type { Page, Locator } from '@playwright/test';

export const search = {
  searchInput: (page: Page): Locator => page.getByTestId('search-input'),
  searchResultItem: (page: Page): Locator => page.getByTestId('search-result-item').first(),
};
