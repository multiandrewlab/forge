import { test, expect } from '../../fixtures/reset.js';
import { revisions } from '../../fixtures/selectors/revisions.js';

test('revisions: history page lists all 3 seeded revisions newest-first', async ({ actor }) => {
  // Seeded post c0000000-...-099 (testuser-owned snippet) has 3 revisions per
  // scripts/seed.sql:
  //   - rev 1: "Initial version"
  //   - rev 2: "Second revision — added export"
  //   - rev 3: "Third revision — comment + body change"
  // The server endpoint GET /api/posts/:id/revisions sorts by
  // revision_number DESC (packages/server/src/db/queries/revisions.ts), so
  // the timeline renders newest-first — the "Current" badge sits at index 0
  // (rev 3) and Rev 1 is last.
  await actor.goto('/posts/c0000000-0000-0000-0000-000000000099/history');
  await expect(revisions.historyPage(actor)).toBeVisible();

  const items = revisions.revisionItem(actor);
  await expect(items).toHaveCount(3);

  // Verify newest-first order via the visible "Rev N" labels rendered by
  // RevisionTimeline. Index 0 is newest (Rev 3), index 2 is oldest (Rev 1).
  await expect(items.nth(0)).toContainText('Rev 3');
  await expect(items.nth(1)).toContainText('Rev 2');
  await expect(items.nth(2)).toContainText('Rev 1');
});
