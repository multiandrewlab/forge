import type { Page, Locator } from '@playwright/test';

export const playground = {
  page: (p: Page): Locator => p.getByTestId('playground-page'),
  header: (p: Page): Locator => p.getByTestId('playground-header'),
  title: (p: Page): Locator => p.getByTestId('playground-title'),
  promptSource: (p: Page): Locator => p.getByTestId('playground-prompt-source'),
  promptContent: (p: Page): Locator => p.getByTestId('playground-prompt-content'),

  variableInput: (p: Page, name: string): Locator => p.getByTestId(`prompt-variable-input-${name}`),
  variableLabel: (p: Page, name: string): Locator => p.getByTestId(`prompt-variable-label-${name}`),
  variableRequiredMark: (p: Page, name: string): Locator =>
    p.getByTestId(`prompt-variable-required-${name}`),

  runBtn: (p: Page): Locator => p.getByTestId('playground-run-btn'),
  stopBtn: (p: Page): Locator => p.getByTestId('playground-stop-btn'),
  forkBtn: (p: Page): Locator => p.getByTestId('playground-fork-btn'),
  runHint: (p: Page): Locator => p.locator('#playground-run-hint'),

  error: (p: Page): Locator => p.getByTestId('playground-error'),
  loadError: (p: Page): Locator => p.getByTestId('playground-load-error'),

  output: (p: Page): Locator => p.getByTestId('prompt-output'),
  outputContent: (p: Page): Locator => p.getByTestId('prompt-output-content'),
  outputLoading: (p: Page): Locator => p.getByTestId('prompt-output-loading'),
  copyBtn: (p: Page): Locator => p.getByTestId('copy-button'),
};
