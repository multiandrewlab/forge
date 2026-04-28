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
};
