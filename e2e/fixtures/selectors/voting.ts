import type { Page, Locator } from '@playwright/test';

export const voting = {
  // Post-view PostActions
  upvoteBtn: (page: Page): Locator => page.getByTestId('upvote-btn'),
  downvoteBtn: (page: Page): Locator => page.getByTestId('downvote-btn'),
  voteScore: (page: Page): Locator => page.getByTestId('vote-score'),

  // Feed PostListItem (per-card). Card root has data-testid="post-list-item"
  // (static, shared across all cards) and a separate `data-post-id="${id}"` (per-card).
  // Compound selector matches both attributes on the same element — `:has(a[href*=...])`
  // doesn't work because PostListItem.vue navigates programmatically (router.push), no <a>.
  feedScoreOnCard: (page: Page, postId: string): Locator =>
    page.locator(
      `[data-testid="post-list-item"][data-post-id="${postId}"] [data-testid="post-list-item-vote-score"]`,
    ),
};
