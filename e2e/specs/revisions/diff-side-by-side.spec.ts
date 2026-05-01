import { test, expect } from '../../fixtures/reset.js';
import { revisions } from '../../fixtures/selectors/revisions.js';

test('diff: side-by-side mode renders left and right panes', async ({ actor }) => {
  // Seeded post c0000000-...-099 has 3 revisions (scripts/seed.sql:79-81).
  // PostHistoryPage.vue requires TWO selected revisions before
  // RevisionDiffViewer renders (selectedIds.length < 2 → placeholder).
  // Click the newest (nth(0) = "Rev 3") + the oldest (last() = "Rev 1") to
  // mount the diff, then switch to side-by-side mode.
  await actor.goto('/posts/c0000000-0000-0000-0000-000000000099/history');

  await revisions.revisionItem(actor).nth(0).click();
  await revisions.revisionItem(actor).last().click();

  await expect(revisions.diffViewer(actor)).toBeVisible();
  await revisions.modeSideBySide(actor).click();

  await expect(revisions.diffSideBySide(actor)).toBeVisible();
  await expect(revisions.sideLeft(actor)).toBeVisible();
  await expect(revisions.sideRight(actor)).toBeVisible();
});
