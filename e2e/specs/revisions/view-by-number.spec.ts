import { test, expect } from '../../fixtures/reset.js';
import { revisions } from '../../fixtures/selectors/revisions.js';

test('revisions: selecting revision 2 by message renders revision 2 content', async ({
  testuser,
}) => {
  // Seeded post c0000000-...-099 has 3 revisions (scripts/seed.sql:79-81):
  //   rev 1: 'const testFixture: string = "hello from testuser";' / msg "Initial version"
  //   rev 2: 'const testFixture: string = "hello from testuser v2";\nexport default testFixture;' / msg "Second revision — added export"
  //   rev 3: rev 2 + comment + body change / msg "Third revision — comment + body change"
  // PostHistoryPage.vue requires TWO selected revisions before RevisionDiffViewer
  // mounts (selectedIds.length < 2 → placeholder; >= 2 → diff). We deterministically
  // pick rev 2 by message text (not by index), then add rev 1 so the diff renders
  // with rev 2 on the right (newer) side. The diff body therefore must contain
  // rev 2's distinctive content ("hello from testuser v2").
  await testuser.goto('/posts/c0000000-0000-0000-0000-000000000099/history');

  // Pick rev 2 by message — deterministic (REV 4 plan requirement).
  const rev2Item = revisions.revisionItem(testuser).filter({ hasText: /Second revision/ });
  await expect(rev2Item).toHaveCount(1);
  await rev2Item.click();

  // Add rev 1 so RevisionDiffViewer mounts (needs exactly 2 selections).
  const rev1Item = revisions.revisionItem(testuser).filter({ hasText: /Initial version/ });
  await expect(rev1Item).toHaveCount(1);
  await rev1Item.click();

  await expect(revisions.diffViewer(testuser)).toBeVisible();
  // Rev 2's distinctive body is rendered in the diff (added line, since rev 1 is
  // the "left" / older side and rev 2 the "right" / newer side).
  await expect(revisions.diffViewer(testuser).getByText(/hello from testuser v2/)).toBeVisible();
});
