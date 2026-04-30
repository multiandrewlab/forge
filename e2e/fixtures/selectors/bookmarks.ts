import type { Page, Locator } from '@playwright/test';

export const bookmarks = {
  // Post-view (PostActions)
  toggleBtn: (page: Page): Locator => page.getByTestId('bookmark-toggle-btn'),
  onIcon: (page: Page): Locator => page.getByTestId('bookmark-on-icon'),

  // Feed (PostListItem) — scoped via the per-card `data-post-id` attribute added in Step 0.3
  // (separate attribute from the static `post-list-item` testid, to avoid Vue's
  // duplicate-attribute collision).
  feedToggleOnCard: (page: Page, postId: string): Locator =>
    page.locator(
      `[data-testid="post-list-item"][data-post-id="${postId}"] [data-testid="post-list-item-bookmark-toggle-btn"]`,
    ),
  feedOnIconOnCard: (page: Page, postId: string): Locator =>
    page.locator(
      `[data-testid="post-list-item"][data-post-id="${postId}"] [data-testid="post-list-item-bookmark-on-icon"]`,
    ),
};
