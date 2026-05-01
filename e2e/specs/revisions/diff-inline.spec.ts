import { test, expect } from '../../fixtures/reset.js';
import { revisions } from '../../fixtures/selectors/revisions.js';

test('diff: inline mode renders combined add/remove lines', async ({ actor }) => {
  // Seeded post c0000000-...-099 has 3 revisions (scripts/seed.sql:79-81). Rev 2
  // → rev 3 adds new content (the comment + body change), so the rev1↔rev3 diff
  // contains added lines visible in inline mode. RevisionDiffViewer mounts only
  // when 2 revisions are selected, so click newest (nth(0) = Rev 3) + oldest
  // (last() = Rev 1). Inline mode is the default, but click modeInline to make
  // the assertion intent explicit.
  await actor.goto('/posts/c0000000-0000-0000-0000-000000000099/history');

  await revisions.revisionItem(actor).nth(0).click();
  await revisions.revisionItem(actor).last().click();

  await expect(revisions.diffViewer(actor)).toBeVisible();
  await revisions.modeInline(actor).click();

  await expect(revisions.diffAdded(actor).first()).toBeVisible();
});
