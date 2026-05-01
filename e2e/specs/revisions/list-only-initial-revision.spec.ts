import { test, expect } from '../../fixtures/reset.js';
import { revisions } from '../../fixtures/selectors/revisions.js';

test('revisions: history page shows a single revision for a post with no edits', async ({
  actor,
}) => {
  // Seeded draft post c0000000-...-098 (actor-owned) has exactly one
  // revision ("Initial draft version", revision_number 1) per
  // scripts/seed.sql — no subsequent edits, so the timeline renders one item.
  await actor.goto('/posts/c0000000-0000-0000-0000-000000000098/history');
  await expect(revisions.historyPage(actor)).toBeVisible();
  await expect(revisions.revisionItem(actor)).toHaveCount(1);
});
