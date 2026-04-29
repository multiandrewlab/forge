import type { Page, Locator } from '@playwright/test';

export const revisions = {
  // RevisionTimeline (existing testids)
  revisionItem: (page: Page): Locator => page.getByTestId('revision-item'),

  // RevisionDiffViewer (existing testids)
  diffViewer: (page: Page): Locator => page.getByTestId('diff-viewer'),
  modeInline: (page: Page): Locator => page.getByTestId('mode-inline'),
  modeSideBySide: (page: Page): Locator => page.getByTestId('mode-side-by-side'),
  diffAdded: (page: Page): Locator => page.getByTestId('diff-added'),
  diffRemoved: (page: Page): Locator => page.getByTestId('diff-removed'),
  diffUnchanged: (page: Page): Locator => page.getByTestId('diff-unchanged'),
  diffSideBySide: (page: Page): Locator => page.getByTestId('diff-side-by-side'),
  sideLeft: (page: Page): Locator => page.getByTestId('side-left'),
  sideRight: (page: Page): Locator => page.getByTestId('side-right'),

  // RestoreButton (existing testids)
  restoreTrigger: (page: Page): Locator => page.getByTestId('restore-trigger'),
  restoreDialog: (page: Page): Locator => page.getByTestId('restore-dialog'),
  restoreConfirm: (page: Page): Locator => page.getByTestId('restore-confirm'),
  restoreCancel: (page: Page): Locator => page.getByTestId('restore-cancel'),

  // PostHistoryPage (page-level testid added in Task 13)
  historyPage: (page: Page): Locator => page.getByTestId('post-history-page'),
};
