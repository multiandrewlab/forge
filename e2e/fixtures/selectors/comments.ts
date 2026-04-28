import type { Page, Locator } from '@playwright/test';

export const comments = {
  commentInput: (page: Page): Locator => page.getByTestId('comment-input'),
  commentSubmit: (page: Page): Locator => page.getByTestId('comment-submit-btn'),
  commentBody: (page: Page): Locator => page.getByTestId('comment-body').first(),
};
