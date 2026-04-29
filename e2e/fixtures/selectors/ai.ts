import type { Page, Locator } from '@playwright/test';

export const ai = {
  // The autocomplete suggestion popup that appears while typing in the editor
  autocompleteSuggestion: (page: Page): Locator => page.getByTestId('ai-autocomplete-suggestion'),
  acceptSuggestion: (page: Page): Locator => page.getByTestId('ai-autocomplete-accept-btn'),
};
