import { test, expect } from '../../fixtures/reset.js';
import { tags } from '../../fixtures/selectors/tags.js';

test('tags: clicking tag chip on post navigates to TagPage', async ({ actor }) => {
  // c0...0001 is the seeded typescript-tagged post.
  await actor.goto('/posts/c0000000-0000-0000-0000-000000000001');
  await tags.postTagChip(actor, 'typescript').click();
  await expect(actor).toHaveURL(/\/tags\/typescript/);
});
