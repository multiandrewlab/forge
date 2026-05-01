import type { Page, Locator } from '@playwright/test';

export const ai = {
  // Autocomplete (CodeMirror ghost-text widget)
  autocompleteSuggestion: (p: Page): Locator => p.getByTestId('ai-autocomplete-suggestion'),

  // Generate panel
  generateToggle: (p: Page): Locator => p.getByTestId('ai-generate-toggle'),
  generatePanel: (p: Page): Locator => p.getByTestId('ai-generate-panel'),
  generateDescription: (p: Page): Locator => p.getByTestId('ai-generate-description'),
  generateSubmit: (p: Page): Locator => p.getByTestId('ai-generate-submit'),
  generateStop: (p: Page): Locator => p.getByTestId('ai-generate-stop'),
  generateCancel: (p: Page): Locator => p.getByTestId('ai-generate-cancel'),
  generateLoading: (p: Page): Locator => p.getByTestId('ai-generate-loading'),
  generateError: (p: Page): Locator => p.getByTestId('ai-generate-error'),

  // Editor where AI tokens land
  editorContent: (p: Page): Locator => p.locator('.cm-content').first(),
};
