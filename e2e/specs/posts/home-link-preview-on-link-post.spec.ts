import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';

// FIXME(issue #64): blocked on LinkPreviewCard being mounted somewhere.
//
// LinkPreviewCard.vue exists and is unit-tested, but is not consumed by
// any page in the live app. Verify with `grep -rn "LinkPreviewCard"` —
// only __tests__ matches. The DoD bullet (amendment) "link-preview-card
// visible on a link-type post inline" therefore cannot pass.
//
// Tracked at issue #64; this spec un-fixmes once LinkPreviewCard is
// mounted (likely in PostDetail.vue and/or PostViewPage.vue).
test.fixme('link-preview: card visible on HomePage after selecting the seeded link post', async ({
  alice,
}) => {
  await alice.goto('/');
  await alice.getByText('Awesome TypeScript Resources').click();
  await expect(posts.linkPreviewCard(alice)).toBeVisible();
  await expect(posts.linkPreviewCard(alice)).toContainText('Type Challenges');
});
