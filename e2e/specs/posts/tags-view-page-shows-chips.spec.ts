import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';

// FIXME(issue #63): blocked on PostViewPage rendering tags.
//
// `/posts/:id` resolves to PostViewPage.vue, which does not render tags.
// PostMetaHeader.vue (which has the tag rendering) is only consumed by
// PostDetail.vue on the HomePage feed, not by PostViewPage. Additionally,
// `GET /api/posts/:id` returns `PostWithRevision`, which has no `tags`
// field — tags only appear on PostWithAuthor (feed) and PostWithSnippet
// (search). Satisfying the DoD bullet "post page shows tag links" requires
// server-side type expansion (OOS for #47 per "anything under
// packages/server/" exclusion).
//
// Tracked at issue #63; this spec un-fixmes once tags are returned by
// GET /api/posts/:id and rendered in PostViewPage.
test.fixme('tags: post view page displays the post-tag-chip for a seeded tag', async ({
  alice,
}) => {
  // c0000000-...-0001 is alice's seeded "TypeScript Utility Types Cheat Sheet"
  // post (public). post_tags pins it to the 'typescript' tag.
  await alice.goto('/posts/c0000000-0000-0000-0000-000000000001');
  await expect(posts.postTagChip(alice, 'typescript')).toBeVisible();
});
