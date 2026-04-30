import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';

// Issue #64: LinkPreviewCard mounted in PostDetail.vue (HomePage inline panel).
test('link-preview: card visible on HomePage after selecting the seeded link post', async ({
  alice,
}) => {
  await alice.goto('/');
  await alice.getByText('Awesome TypeScript Resources').click();
  await expect(posts.linkPreviewCard(alice)).toBeVisible();
  await expect(posts.linkPreviewCard(alice)).toContainText('Type Challenges');
});
