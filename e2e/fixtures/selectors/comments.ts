import type { Page, Locator } from '@playwright/test';

export const comments = {
  // CommentSection root + empty state
  section: (page: Page): Locator => page.getByTestId('comment-section'),
  list: (page: Page): Locator => page.getByTestId('comment-list'),
  empty: (page: Page): Locator => page.getByTestId('comments-empty'),

  // CommentInput (top-level new-comment form, lives at the bottom of CommentSection).
  // Scoped to `comment-section` so it doesn't accidentally match the inline-comment
  // form (PostDetail) or reply/edit forms (CommentThread) which also render
  // `comment-input` / `comment-submit-btn` testids.
  input: (page: Page): Locator =>
    page.getByTestId('comment-section').getByTestId('comment-input').last(),
  submit: (page: Page): Locator =>
    page.getByTestId('comment-section').getByTestId('comment-submit-btn').last(),

  // Per-comment thread item — pass UUID for uniqueness
  item: (page: Page, id: string): Locator => page.getByTestId(`comment-${id}`),
  // Within a specific item — body, author, action buttons
  bodyOf: (page: Page, id: string): Locator =>
    page.getByTestId(`comment-${id}`).getByTestId('comment-body').first(),
  authorOf: (page: Page, id: string): Locator =>
    page.getByTestId(`comment-${id}`).getByTestId('comment-author').first(),
  replyBtnOf: (page: Page, id: string): Locator =>
    page.getByTestId(`comment-${id}`).getByTestId('reply-btn').first(),
  editBtnOf: (page: Page, id: string): Locator =>
    page.getByTestId(`comment-${id}`).getByTestId('edit-btn').first(),
  deleteBtnOf: (page: Page, id: string): Locator =>
    page.getByTestId(`comment-${id}`).getByTestId('delete-btn').first(),
  // Direct action-row scope (bypasses nested replies). Use this when you need
  // to assert action-button presence on a SPECIFIC comment without picking up
  // buttons from nested children.
  actionsOf: (page: Page, id: string): Locator => page.getByTestId(`comment-actions-${id}`),

  // Inline-on-revision-line
  inlineIndicator: (page: Page, line: number): Locator =>
    page.getByTestId(`inline-comment-indicator-line-${line}`),
  inlineInputWrapper: (page: Page): Locator => page.getByTestId('inline-comment-input-wrapper'),
};
