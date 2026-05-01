import { test, expect } from '../../fixtures/reset.js';
import { revisions } from '../../fixtures/selectors/revisions.js';

test('rollback: alice cannot restore a revision on actor-owned post', async ({ alice }) => {
  // Seeded post c0000000-...-099 is owned by actor and has 3 revisions
  // (scripts/seed.sql:79-81). Alice can browse the history page (revisions are
  // publicly readable per posts.ts:558) but cannot trigger a restore: the
  // server-side endpoint requires authenticated ownership (posts.ts:594), and
  // the client-side button is gated on `selectedIds.length === 1 && !isLatestSelected`
  // (PostHistoryPage.vue:37). Selecting the FIRST (newest) item satisfies the
  // count clause but trips `isLatestSelected`, so the button is hidden.
  await alice.goto('/posts/c0000000-0000-0000-0000-000000000099/history');
  await expect(revisions.revisionItem(alice)).toHaveCount(3);

  await revisions.revisionItem(alice).first().click();

  await expect(revisions.restoreTrigger(alice)).toHaveCount(0);
});
