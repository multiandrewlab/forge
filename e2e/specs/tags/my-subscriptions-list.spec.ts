import { test, expect } from '../../fixtures/reset.js';
import { tags } from '../../fixtures/selectors/tags.js';

test('tags: alice sees her seeded subscription in Following list', async ({ alice }) => {
  // Alice is seeded with sub to typescript (b0...0001) per scripts/seed.sql:128.
  await alice.goto('/');
  await expect(tags.subscribedTagLink(alice, 'typescript')).toBeVisible();
});
