import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';

// Issue #63: PostWithRevision now carries `tags`; PostViewPage renders chips.
test('tags: post view page displays the post-tag-chip for a seeded tag', async ({ alice }) => {
  // c0000000-...-0001 is alice's seeded "TypeScript Utility Types Cheat Sheet"
  // post (public). post_tags pins it to the 'typescript' tag.
  await alice.goto('/posts/c0000000-0000-0000-0000-000000000001');
  await expect(posts.postTagChip(alice, 'typescript')).toBeVisible();
});
