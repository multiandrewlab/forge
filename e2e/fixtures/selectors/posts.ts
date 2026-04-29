import type { Page, Locator } from '@playwright/test';

export const posts = {
  newPostTitle: (page: Page): Locator => page.getByTestId('new-post-title-input'),
  // The editor is a CodeMirror instance — Playwright's fill() needs the
  // contenteditable .cm-content element, not the outer wrapper. We anchor on
  // the wrapper testid for stability and descend into the CM content node.
  newPostBody: (page: Page): Locator =>
    page.getByTestId('new-post-body-editor').locator('.cm-content'),
  newPostSaveDraft: (page: Page): Locator => page.getByTestId('new-post-save-draft-btn'),
  newPostPublish: (page: Page): Locator => page.getByTestId('new-post-publish-btn'),
  postTitle: (page: Page): Locator => page.getByTestId('post-title'),
  draftBadge: (page: Page): Locator => page.getByTestId('draft-badge'),
  // Upload widget on the new-post / edit page
  fileUploadInput: (page: Page): Locator => page.getByTestId('file-upload-input'),
  fileUploadPreview: (page: Page): Locator => page.getByTestId('file-upload-preview'),
  publishedBadge: (page: Page): Locator => page.getByTestId('published-badge'),
  forkBtn: (page: Page): Locator => page.getByTestId('fork-btn'),
  forkAttribution: (page: Page): Locator => page.getByTestId('fork-attribution'),
  // New for Task 1 (PostNewPage page-level testid)
  postNewPage: (page: Page): Locator => page.getByTestId('post-new-page'),
  // New for Task 3.4 (PostEditor cancel)
  postCancelBtn: (page: Page): Locator => page.getByTestId('post-cancel-btn'),
  // New for Task 4 (delete-confirm dialog)
  postDeleteBtn: (page: Page): Locator => page.getByTestId('post-delete-btn'),
  postDeleteConfirm: (page: Page): Locator => page.getByTestId('post-delete-confirm'),
  postDeleteCancel: (page: Page): Locator => page.getByTestId('post-delete-cancel'),
  postDeleteDialog: (page: Page): Locator => page.getByTestId('post-delete-dialog'),
  // New for Task 8.3 (visible tag chips on view page — no navigation, no tag page yet)
  postTagChip: (page: Page, name: string): Locator => page.getByTestId(`post-tag-chip-${name}`),
  // New for Task 9 (link-preview, tested via HomePage inline path)
  linkPreviewCard: (page: Page): Locator => page.getByTestId('link-preview-card'),
  linkPreviewRefresh: (page: Page): Locator => page.getByTestId('refresh-preview'),
  // New for Task 10 (code-runner, tested via HomePage inline path)
  codeRunner: (page: Page): Locator => page.getByTestId('code-runner'),
  runPlay: (page: Page): Locator => page.getByTestId('run-play'),
  runStop: (page: Page): Locator => page.getByTestId('run-stop'),
  executionOutput: (page: Page): Locator => page.getByTestId('execution-output'),
  clearOutputBtn: (page: Page): Locator => page.getByTestId('clear-button'),
  // New for Task 11.1 (author avatar on PostMetaHeader, used inline on HomePage)
  authorAvatar: (page: Page): Locator => page.getByTestId('author-avatar'),
  // New for Task 11.2 (presence on view page)
  presenceAvatar: (page: Page): Locator => page.getByTestId('presence-avatar'),
  // New for Task 12.2 (manual revision via button)
  saveRevisionBtn: (page: Page): Locator => page.getByTestId('save-revision-btn'),
};
