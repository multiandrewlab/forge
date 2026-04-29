import type { Page, Locator } from '@playwright/test';

export const voting = {
  upvoteBtn: (page: Page): Locator => page.getByTestId('upvote-btn'),
  voteScore: (page: Page): Locator => page.getByTestId('vote-score'),
};
