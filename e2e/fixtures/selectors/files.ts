import type { Page, Locator } from '@playwright/test';

/**
 * Selectors for the files feature folder. Mirrors the `posts` shard pattern
 * (`e2e/fixtures/selectors/posts.ts`). New testids are added by the tasks
 * below as the underlying components gain them.
 */
export const files = {
  // Upload entry points (already exist on PostEditor)
  fileUploadInput: (page: Page): Locator => page.getByTestId('file-upload-input'),
  fileUploadPreview: (page: Page): Locator => page.getByTestId('file-upload-preview'),
  editorDropZone: (page: Page): Locator => page.getByTestId('editor-drop-zone'),
  // Published-post listing (already exists on PostViewPage)
  postFileList: (page: Page): Locator => page.getByTestId('post-file-list'),
};
