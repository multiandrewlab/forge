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
  // Preview variants (Task 3)
  filePreviewImage: (page: Page): Locator => page.getByTestId('file-preview-image'),
  filePreviewCode: (page: Page): Locator => page.getByTestId('file-preview-code'),
  filePreviewMarkdown: (page: Page): Locator => page.getByTestId('file-preview-markdown'),
  filePreviewText: (page: Page): Locator => page.getByTestId('file-preview-text'),
  // Upload UI surfaces (Task 3)
  fileUploadClientError: (page: Page): Locator => page.getByTestId('file-upload-client-error'),
  fileUploadInputSidebar: (page: Page): Locator => page.getByTestId('file-upload-input-sidebar'),
  fileSidebarItem: (page: Page, filename: string): Locator =>
    page.getByTestId(`file-sidebar-item-${filename}`),
  // Remove + server-error UI (Task 4)
  fileRemoveBtn: (page: Page, filename: string): Locator =>
    page.getByTestId(`file-remove-btn-${filename}`),
  fileUploadError: (page: Page): Locator => page.getByTestId('file-upload-error'),
};
