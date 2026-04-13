# [6/19] Voting, Bookmarks & Tags Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add voting (toggle up/down), bookmark toggle, tag management (CRUD, subscriptions, autocomplete), personalized feed sort, and wire up PostActions and sidebar followed-tags UI.

**Architecture:** New Fastify route plugins for votes/bookmarks/tags registered alongside existing post routes. Client-side uses composables wrapping `apiFetch` + Pinia stores for reactive state. PostActions reads vote/bookmark state from the feed store. TheSidebar reads subscribed tags from a new tags store. Personalized feed sort adds an EXISTS subquery + subscription-count fallback in the existing feed query builder.

**Tech Stack:** Fastify 5 + PostgreSQL (raw SQL via `pg`) + Zod | Vue 3 + Pinia + Tailwind 4 | Vitest (100% coverage)

**Issue:** #18

---

## File Structure

### New Files

| File                                                                | Responsibility                                                  |
| ------------------------------------------------------------------- | --------------------------------------------------------------- |
| `packages/shared/src/types/vote.ts`                                 | `VoteValue`, `VoteResponse` types                               |
| `packages/shared/src/types/bookmark.ts`                             | `BookmarkToggleResponse` type                                   |
| `packages/shared/src/types/tag.ts`                                  | `Tag` (public DTO), `TagSubscriptionResponse` types             |
| `packages/shared/src/validators/vote.ts`                            | `voteSchema` Zod validator                                      |
| `packages/server/src/routes/votes.ts`                               | `POST/DELETE /api/posts/:id/vote`                               |
| `packages/server/src/routes/bookmarks.ts`                           | `POST /api/posts/:id/bookmark`, `GET /api/bookmarks`            |
| `packages/server/src/routes/tags.ts`                                | Tag list, search, popular, subscribe/unsubscribe, subscriptions |
| `packages/server/src/__tests__/routes/votes.test.ts`                | Vote route tests                                                |
| `packages/server/src/__tests__/routes/bookmarks.test.ts`            | Bookmark route tests                                            |
| `packages/server/src/__tests__/routes/tags.test.ts`                 | Tag route tests                                                 |
| `packages/client/src/composables/useVotes.ts`                       | Vote API calls + store updates                                  |
| `packages/client/src/composables/useBookmarks.ts`                   | Bookmark toggle + store updates                                 |
| `packages/client/src/composables/useTags.ts`                        | Tag loading, search, subscribe/unsubscribe                      |
| `packages/client/src/stores/tags.ts`                                | Subscribed/popular tags state                                   |
| `packages/client/src/__tests__/composables/useVotes.test.ts`        | Vote composable tests                                           |
| `packages/client/src/__tests__/composables/useBookmarks.test.ts`    | Bookmark composable tests                                       |
| `packages/client/src/__tests__/composables/useTags.test.ts`         | Tags composable tests                                           |
| `packages/client/src/__tests__/stores/tags.test.ts`                 | Tags store tests                                                |
| `packages/client/src/__tests__/components/post/PostActions.test.ts` | PostActions component tests                                     |
| `bruno/votes/upvote.bru`                                            | Bruno: upvote a post                                            |
| `bruno/votes/downvote.bru`                                          | Bruno: downvote a post                                          |
| `bruno/votes/remove-vote.bru`                                       | Bruno: remove vote                                              |
| `bruno/bookmarks/toggle-bookmark.bru`                               | Bruno: toggle bookmark                                          |
| `bruno/bookmarks/list-bookmarks.bru`                                | Bruno: list bookmarked posts                                    |
| `bruno/tags/list-tags.bru`                                          | Bruno: list/search tags                                         |
| `bruno/tags/popular-tags.bru`                                       | Bruno: popular tags                                             |
| `bruno/tags/subscribe.bru`                                          | Bruno: subscribe to tag                                         |
| `bruno/tags/unsubscribe.bru`                                        | Bruno: unsubscribe from tag                                     |
| `bruno/tags/subscriptions.bru`                                      | Bruno: list user's subscribed tags                              |

### Modified Files

| File                                                                    | Changes                                                                                             |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `packages/shared/src/types/feed.ts:15`                                  | Add `'personalized'` to `FeedSort` union                                                            |
| `packages/shared/src/types/index.ts`                                    | Export new vote, bookmark, tag types                                                                |
| `packages/shared/src/validators/index.ts`                               | Export `voteSchema`, `VoteInput`                                                                    |
| `packages/server/src/db/queries/votes.ts`                               | Add `getUserVote` query                                                                             |
| `packages/server/src/db/queries/bookmarks.ts`                           | Add `getUserBookmark` query                                                                         |
| `packages/server/src/db/queries/tags.ts`                                | Add `searchTags`, `findPopularTags`, `subscribeToTag`, `unsubscribeFromTag`, `getUserSubscriptions` |
| `packages/server/src/db/queries/feed.ts:31-131`                         | Add `sort=personalized` with subscription filter + trending fallback                                |
| `packages/server/src/routes/posts.ts:23`                                | Add `'personalized'` to `feedQuerySchema` sort enum; add tag processing to POST route               |
| `packages/server/src/app.ts:50-51`                                      | Register vote, bookmark, tag route plugins                                                          |
| `packages/server/src/__tests__/db/queries/votes.test.ts`                | Add `getUserVote` tests                                                                             |
| `packages/server/src/__tests__/db/queries/bookmarks.test.ts`            | Add `getUserBookmark` tests                                                                         |
| `packages/server/src/__tests__/db/queries/tags.test.ts`                 | Add new query tests                                                                                 |
| `packages/server/src/__tests__/db/queries/feed.test.ts`                 | Add personalized sort tests                                                                         |
| `packages/server/src/__tests__/routes/posts.test.ts`                    | Add test for tag processing in POST                                                                 |
| `packages/client/src/stores/feed.ts`                                    | Add `userVotes`, `userBookmarks` state + update methods                                             |
| `packages/client/src/__tests__/stores/feed.test.ts`                     | Add userVotes/userBookmarks tests                                                                   |
| `packages/client/src/components/post/PostActions.vue`                   | Wire vote/bookmark buttons, add downvote/fork/history buttons                                       |
| `packages/client/src/components/shell/TheSidebar.vue:40-49,95-103`      | Replace hardcoded tags with dynamic subscribed tags                                                 |
| `packages/client/src/__tests__/components/shell/TheSidebar.test.ts`     | Update for dynamic tags                                                                             |
| `packages/client/src/__tests__/components/post/PostListItem.test.ts`    | Add vote count reactivity test                                                                      |
| `packages/client/src/__tests__/pages/HomePage.test.ts`                  | Verify bookmarked filter prop case                                                                  |
| `packages/client/src/components/editor/EditorToolbar.vue`               | Add tag input with autocomplete dropdown                                                            |
| `packages/client/src/__tests__/components/editor/EditorToolbar.test.ts` | Add tag autocomplete tests                                                                          |
| `bruno/posts/get-feed.bru`                                              | Update docs to include `personalized` sort                                                          |

---

## Dependency Graph

```
Task 1 (shared types) ──┬── Task 2 (server votes)       ─┐
                         ├── Task 3 (server bookmarks)    ├── batch 1 (parallel)
                         ├── Task 4 (server tags)         │
                         ├── Task 5 (server personalized) ─┘
                         ├── Task 6 (client PostActions)  ─┐
                         ├── Task 7 (client tags+sidebar) ├── batch 2 (parallel)
                         └── Task 8 (tag autocomplete)    ─┘

Tasks 2-5 ──────────────────── Task 9 (Bruno API tests) ── batch 3 (after server routes exist)
```

Tasks 2-5 are independent (batch 1). Tasks 6-8 are independent (batch 2). Task 9 depends on Tasks 2-5 (server routes must exist). All depend on Task 1.

---

## Key Design Decisions

1. **Vote toggle on server** — `POST /:id/vote` checks existing vote: same value = delete (toggle off), different value = update, no vote = insert. DB trigger `update_vote_count()` handles count atomically.

2. **Bookmark toggle via ON CONFLICT** — `createBookmark` returns `null` when bookmark exists (ON CONFLICT DO NOTHING); route interprets `null` as "already existed → delete it."

3. **Personalized feed fallback** — `findFeedPosts` checks `SELECT 1 FROM user_tag_subscriptions WHERE user_id = $1 LIMIT 1` first. If no subscriptions, falls back to `trending` sort. If subscriptions exist, adds `EXISTS (SELECT 1 FROM post_tags pt_sub JOIN user_tag_subscriptions uts ...)` filter and hotness ORDER BY.

4. **No separate service files for votes/bookmarks/tags** — Responses are simple enough to construct in route handlers. Only create services when there's non-trivial transformation logic (like the existing `toPostWithAuthor`).

5. **Vote/bookmark state in feed store** — `userVotes: Record<string, number>` and `userBookmarks: Record<string, boolean>` live in the feed store since they're per-post state displayed alongside feed posts.

6. **Bookmarks page already exists** — The `/bookmarks` route is defined in `packages/client/src/plugins/router.ts:31-35` as `{ path: 'bookmarks', component: HomePage, props: { filter: 'bookmarked' } }`. HomePage already watches the `filter` prop and calls `useFeed().setFilter('bookmarked')`, which hits `GET /api/posts?filter=bookmarked`. The server-side `GET /api/bookmarks` endpoint (Task 3) is an additional convenience route but the client-side bookmarks page is already functional via the existing feed filter mechanism. No new page component needed.

7. **PostListItem vote count reactivity** — PostListItem receives `post: PostWithAuthor` as a prop sourced from the feed store's `posts` array. When `updatePostVote` mutates `post.voteCount` on the store object, Vue's reactivity propagates the change to PostListItem. This must be verified with a test.

8. **Tag subscriptions in separate store** — `useTagsStore` owns `subscribedTags[]` and `popularTags[]`, separate from the feed store, since tags have their own lifecycle.

---

## Chunk 1: Shared Foundation + Server Votes

### Task 1: Shared Types & Validators

**Files:**

- Create: `packages/shared/src/types/vote.ts`
- Create: `packages/shared/src/types/bookmark.ts`
- Create: `packages/shared/src/types/tag.ts`
- Create: `packages/shared/src/validators/vote.ts`
- Modify: `packages/shared/src/types/feed.ts`
- Modify: `packages/shared/src/types/index.ts`
- Modify: `packages/shared/src/validators/index.ts`

- [ ] **Step 1: Create vote types**

```typescript
// packages/shared/src/types/vote.ts
export type VoteValue = 1 | -1;

export interface VoteResponse {
  voteCount: number;
  userVote: VoteValue | null;
}
```

- [ ] **Step 2: Create bookmark types**

```typescript
// packages/shared/src/types/bookmark.ts
export interface BookmarkToggleResponse {
  bookmarked: boolean;
}
```

- [ ] **Step 3: Create tag types**

```typescript
// packages/shared/src/types/tag.ts
export interface Tag {
  id: string;
  name: string;
  postCount: number;
}

export interface TagSubscriptionResponse {
  subscribed: boolean;
}
```

- [ ] **Step 4: Create vote validator**

```typescript
// packages/shared/src/validators/vote.ts
import { z } from 'zod';

export const voteSchema = z.object({
  value: z.union([z.literal(1), z.literal(-1)]),
});

export type VoteInput = z.infer<typeof voteSchema>;
```

- [ ] **Step 5: Update FeedSort type**

In `packages/shared/src/types/feed.ts:15`, change:

```typescript
// Before:
export type FeedSort = 'trending' | 'recent' | 'top';
// After:
export type FeedSort = 'trending' | 'recent' | 'top' | 'personalized';
```

- [ ] **Step 6: Export new types from shared/types/index.ts**

Add these exports:

```typescript
export type { VoteValue, VoteResponse } from './vote.js';
export type { BookmarkToggleResponse } from './bookmark.js';
export type { Tag, TagSubscriptionResponse } from './tag.js';
```

- [ ] **Step 7: Export validator from shared/validators/index.ts**

Add:

```typescript
export { voteSchema } from './vote.js';
export type { VoteInput } from './vote.js';
```

- [ ] **Step 8: Verify types compile**

Run: `cd packages/shared && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 9: Commit**

```bash
git add packages/shared/src/types/vote.ts packages/shared/src/types/bookmark.ts packages/shared/src/types/tag.ts packages/shared/src/validators/vote.ts packages/shared/src/types/feed.ts packages/shared/src/types/index.ts packages/shared/src/validators/index.ts
git commit -m "feat(shared): add vote, bookmark, tag types and vote validator"
```

---

### Task 2: Server Vote Queries & Routes

**Files:**

- Modify: `packages/server/src/db/queries/votes.ts`
- Modify: `packages/server/src/__tests__/db/queries/votes.test.ts`
- Create: `packages/server/src/routes/votes.ts`
- Create: `packages/server/src/__tests__/routes/votes.test.ts`
- Modify: `packages/server/src/app.ts`

**Context:**

- Existing queries: `upsertVote(userId, postId, value)` and `deleteVote(userId, postId)` in `packages/server/src/db/queries/votes.ts`
- DB trigger `update_vote_count()` auto-updates `posts.vote_count` on INSERT/UPDATE/DELETE to votes table
- `findPostById(id)` exists in `packages/server/src/db/queries/posts.ts`, returns `PostRow | null`
- Route test pattern: see `packages/server/src/__tests__/routes/posts.test.ts` for mock setup, JWT signing, `app.inject()` pattern

- [ ] **Step 1: Write failing test for getUserVote query**

Add to `packages/server/src/__tests__/db/queries/votes.test.ts`, updating the import to include `getUserVote`:

```typescript
describe('getUserVote', () => {
  it('returns the vote when found', async () => {
    mockQuery.mockResolvedValue({ rows: [sampleVote], rowCount: 1 });
    const result = await getUserVote(sampleVote.user_id, sampleVote.post_id);
    expect(mockQuery).toHaveBeenCalledWith(
      'SELECT * FROM votes WHERE user_id = $1 AND post_id = $2',
      [sampleVote.user_id, sampleVote.post_id],
    );
    expect(result).toEqual(sampleVote);
  });

  it('returns null when not found', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    const result = await getUserVote('u1', 'p1');
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/server && npx vitest run src/__tests__/db/queries/votes.test.ts`
Expected: FAIL — `getUserVote` is not exported

- [ ] **Step 3: Implement getUserVote**

Add to `packages/server/src/db/queries/votes.ts`:

```typescript
export async function getUserVote(userId: string, postId: string): Promise<VoteRow | null> {
  const result = await query<VoteRow>('SELECT * FROM votes WHERE user_id = $1 AND post_id = $2', [
    userId,
    postId,
  ]);
  return result.rows[0] ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/server && npx vitest run src/__tests__/db/queries/votes.test.ts`
Expected: PASS

- [ ] **Step 5: Write failing tests for vote routes**

Create `packages/server/src/__tests__/routes/votes.test.ts`. Use the same mock pattern as `posts.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi, type Mock } from 'vitest';

vi.mock('../../db/connection.js', () => ({ query: vi.fn() }));
vi.mock('../../plugins/rate-limit.js', () => ({ rateLimitPlugin: async () => {} }));

import { query } from '../../db/connection.js';
import { buildApp } from '../../app.js';
import type { FastifyInstance } from 'fastify';
import type { PostRow, VoteRow } from '../../db/queries/types.js';

const mockQuery = query as Mock;
const userId = '660e8400-e29b-41d4-a716-446655440000';
const postId = '550e8400-e29b-41d4-a716-446655440000';

// Reuse samplePostRow from posts.test.ts pattern (full PostRow with all fields)
```

**Test cases for `POST /api/posts/:id/vote`:**

| Case                        | Mock sequence                                                             | Expected                                |
| --------------------------- | ------------------------------------------------------------------------- | --------------------------------------- |
| New vote (no existing)      | findPostById → getUserVote(empty) → upsertVote → findPostById(updated)    | 200, `{ voteCount: 1, userVote: 1 }`    |
| Toggle off (same value)     | findPostById → getUserVote(value=1) → deleteVote → findPostById(updated)  | 200, `{ voteCount: 0, userVote: null }` |
| Change vote (diff value)    | findPostById → getUserVote(value=-1) → upsertVote → findPostById(updated) | 200, `{ voteCount: 1, userVote: 1 }`    |
| Post not found              | findPostById(empty)                                                       | 404                                     |
| No auth header              | —                                                                         | 401                                     |
| Invalid body `{ value: 0 }` | —                                                                         | 400                                     |
| Invalid body `{ value: 2 }` | —                                                                         | 400                                     |
| Missing body                | —                                                                         | 400                                     |

**Test cases for `DELETE /api/posts/:id/vote`:**

| Case                 | Mock sequence                   | Expected                                |
| -------------------- | ------------------------------- | --------------------------------------- |
| Remove existing vote | deleteVote(true) → findPostById | 200, `{ voteCount: 0, userVote: null }` |
| No vote to remove    | deleteVote(false)               | 404                                     |
| No auth              | —                               | 401                                     |

- [ ] **Step 6: Run test to verify it fails**

Run: `cd packages/server && npx vitest run src/__tests__/routes/votes.test.ts`
Expected: FAIL — route module doesn't exist

- [ ] **Step 7: Implement vote routes**

Create `packages/server/src/routes/votes.ts`:

```typescript
import type { FastifyInstance } from 'fastify';
import { voteSchema } from '@forge/shared';
import { upsertVote, deleteVote, getUserVote } from '../db/queries/votes.js';
import { findPostById } from '../db/queries/posts.js';

export async function voteRoutes(app: FastifyInstance): Promise<void> {
  // POST /:id/vote — idempotent toggle
  app.post('/:id/vote', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = voteSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: parsed.error.errors.map((e) => e.message).join(', ') });
    }

    const post = await findPostById(id);
    if (!post) {
      return reply.status(404).send({ error: 'Post not found' });
    }

    const userId = request.user.id;
    const { value } = parsed.data;
    const existing = await getUserVote(userId, id);

    let userVote: number | null;
    if (existing && existing.value === value) {
      // Same value → toggle off
      await deleteVote(userId, id);
      userVote = null;
    } else {
      // New vote or different value → upsert
      const row = await upsertVote(userId, id, value);
      userVote = row.value;
    }

    // Trigger has updated vote_count; re-read
    const updated = (await findPostById(id))!;
    return reply.send({ voteCount: updated.vote_count, userVote });
  });

  // DELETE /:id/vote — explicit removal
  app.delete('/:id/vote', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user.id;

    const deleted = await deleteVote(userId, id);
    if (!deleted) {
      return reply.status(404).send({ error: 'Vote not found' });
    }

    const post = await findPostById(id);
    if (!post) {
      return reply.status(404).send({ error: 'Post not found' });
    }

    return reply.send({ voteCount: post.vote_count, userVote: null });
  });
}
```

- [ ] **Step 8: Register vote routes in app.ts**

In `packages/server/src/app.ts`, add import and registration:

```typescript
import { voteRoutes } from './routes/votes.js';
// After the existing postRoutes registration (line ~50):
await app.register(voteRoutes, { prefix: '/api/posts' });
```

- [ ] **Step 9: Run vote route tests**

Run: `cd packages/server && npx vitest run src/__tests__/routes/votes.test.ts`
Expected: PASS

- [ ] **Step 10: Run full server test suite**

Run: `cd packages/server && npx vitest run`
Expected: All pass

- [ ] **Step 11: Commit**

```bash
git add packages/server/src/db/queries/votes.ts packages/server/src/routes/votes.ts packages/server/src/app.ts packages/server/src/__tests__/db/queries/votes.test.ts packages/server/src/__tests__/routes/votes.test.ts
git commit -m "feat(server): add vote toggle and removal routes"
```

---

## Chunk 2: Server Bookmarks, Tags & Personalized Feed

### Task 3: Server Bookmark Routes

**Files:**

- Modify: `packages/server/src/db/queries/bookmarks.ts`
- Modify: `packages/server/src/__tests__/db/queries/bookmarks.test.ts`
- Create: `packages/server/src/routes/bookmarks.ts`
- Create: `packages/server/src/__tests__/routes/bookmarks.test.ts`
- Modify: `packages/server/src/app.ts`

**Context:**

- Existing: `createBookmark(userId, postId)` returns `BookmarkRow | null` (null on conflict = already exists), `deleteBookmark(userId, postId)` returns boolean
- Bookmark toggle uses `createBookmark` return value: non-null = created, null = already existed → delete
- `GET /api/bookmarks` reuses `findFeedPosts` with `filter: 'bookmarked'` (already implemented in `packages/server/src/db/queries/feed.ts:63-65`)

- [ ] **Step 1: Write failing test for getUserBookmark query**

Add to `packages/server/src/__tests__/db/queries/bookmarks.test.ts`:

```typescript
describe('getUserBookmark', () => {
  it('returns the bookmark when found', async () => {
    mockQuery.mockResolvedValue({ rows: [sampleBookmark], rowCount: 1 });
    const result = await getUserBookmark(sampleBookmark.user_id, sampleBookmark.post_id);
    expect(mockQuery).toHaveBeenCalledWith(
      'SELECT * FROM bookmarks WHERE user_id = $1 AND post_id = $2',
      [sampleBookmark.user_id, sampleBookmark.post_id],
    );
    expect(result).toEqual(sampleBookmark);
  });

  it('returns null when not found', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    const result = await getUserBookmark('u1', 'p1');
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Implement getUserBookmark**

Add to `packages/server/src/db/queries/bookmarks.ts`:

```typescript
export async function getUserBookmark(userId: string, postId: string): Promise<BookmarkRow | null> {
  const result = await query<BookmarkRow>(
    'SELECT * FROM bookmarks WHERE user_id = $1 AND post_id = $2',
    [userId, postId],
  );
  return result.rows[0] ?? null;
}
```

- [ ] **Step 4: Run test — expect PASS**

- [ ] **Step 5: Write failing tests for bookmark routes**

Create `packages/server/src/__tests__/routes/bookmarks.test.ts`. Same mock pattern as votes.

**Test cases for `POST /api/posts/:id/bookmark` (toggle):**

| Case                         | Mock sequence                                                | Expected                     |
| ---------------------------- | ------------------------------------------------------------ | ---------------------------- |
| Create bookmark (new)        | findPostById → createBookmark(returns row)                   | 200, `{ bookmarked: true }`  |
| Remove bookmark (toggle off) | findPostById → createBookmark(returns null) → deleteBookmark | 200, `{ bookmarked: false }` |
| Post not found               | findPostById(empty)                                          | 404                          |
| No auth                      | —                                                            | 401                          |

**Test cases for `GET /api/bookmarks`:**

| Case                     | Mock sequence        | Expected                             |
| ------------------------ | -------------------- | ------------------------------------ |
| Returns bookmarked posts | findFeedPosts mock   | 200, `{ posts: [...], cursor: ... }` |
| Empty bookmarks          | findFeedPosts(empty) | 200, `{ posts: [], cursor: null }`   |
| No auth                  | —                    | 401                                  |

- [ ] **Step 6: Run test — expect FAIL**

- [ ] **Step 7: Implement bookmark routes**

Create `packages/server/src/routes/bookmarks.ts`:

```typescript
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createBookmark, deleteBookmark } from '../db/queries/bookmarks.js';
import { findPostById } from '../db/queries/posts.js';
import { findFeedPosts } from '../db/queries/feed.js';
import { toPostWithAuthor } from '../services/feed.js';

const bookmarkListSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export async function bookmarkRoutes(app: FastifyInstance): Promise<void> {
  // POST /posts/:id/bookmark — toggle
  app.post('/posts/:id/bookmark', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const post = await findPostById(id);
    if (!post) {
      return reply.status(404).send({ error: 'Post not found' });
    }

    const userId = request.user.id;
    const created = await createBookmark(userId, id);

    if (created) {
      return reply.send({ bookmarked: true });
    }

    // Already existed → toggle off
    await deleteBookmark(userId, id);
    return reply.send({ bookmarked: false });
  });

  // GET /bookmarks — paginated list
  app.get('/bookmarks', { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = bookmarkListSchema.safeParse(request.query);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: parsed.error.errors.map((e) => e.message).join(', ') });
    }

    const { cursor, limit } = parsed.data;
    const userId = request.user.id;

    const { posts: rows, hasMore } = await findFeedPosts({
      userId,
      filter: 'bookmarked',
      cursor,
      limit,
    });

    const lastRow = rows.at(-1);
    const nextCursor =
      hasMore && lastRow
        ? Buffer.from(
            JSON.stringify({ createdAt: lastRow.created_at.toISOString(), id: lastRow.id }),
          ).toString('base64')
        : null;

    return reply.send({ posts: rows.map(toPostWithAuthor), cursor: nextCursor });
  });
}
```

- [ ] **Step 8: Register in app.ts**

```typescript
import { bookmarkRoutes } from './routes/bookmarks.js';
await app.register(bookmarkRoutes, { prefix: '/api' });
```

Note: prefix is `/api` since routes handle both `/posts/:id/bookmark` and `/bookmarks`.

- [ ] **Step 9: Run tests — expect PASS**

- [ ] **Step 10: Commit**

```bash
git commit -m "feat(server): add bookmark toggle and bookmark list routes"
```

---

### Task 4: Server Tag Queries & Routes

**Files:**

- Modify: `packages/server/src/db/queries/tags.ts`
- Modify: `packages/server/src/__tests__/db/queries/tags.test.ts`
- Create: `packages/server/src/routes/tags.ts`
- Create: `packages/server/src/__tests__/routes/tags.test.ts`
- Modify: `packages/server/src/app.ts`
- Modify: `packages/server/src/routes/posts.ts` (add tag processing to POST)
- Modify: `packages/server/src/__tests__/routes/posts.test.ts` (add tag test)

**Context:**

- Existing tag queries: `findTagByName`, `createTag`, `addPostTag`, `removePostTag` in `packages/server/src/db/queries/tags.ts`
- DB row types: `TagRow { id, name, post_count }`, `UserTagSubscriptionRow { user_id, tag_id }` in `types.ts`
- DB trigger `update_tag_post_count()` auto-updates `tags.post_count` on INSERT/DELETE to `post_tags`
- `createPostSchema` already accepts `tags: z.array(z.string()).max(10).optional()` but the POST route doesn't process them

- [ ] **Step 1: Write failing tests for new tag queries**

Add to `packages/server/src/__tests__/db/queries/tags.test.ts`, updating the import:

```typescript
import {
  findTagByName,
  createTag,
  addPostTag,
  removePostTag,
  searchTags,
  findPopularTags,
  subscribeToTag,
  unsubscribeFromTag,
  getUserSubscriptions,
} from '../../../db/queries/tags.js';
```

Test cases:

- `searchTags('type', 5)` → `SELECT * FROM tags WHERE name ILIKE $1 ORDER BY post_count DESC LIMIT $2` with `['type%', 5]`
- `findPopularTags(10)` → `SELECT * FROM tags WHERE post_count > 0 ORDER BY post_count DESC LIMIT $1` with `[10]`
- `subscribeToTag('u1', 't1')` → INSERT ON CONFLICT DO NOTHING, returns true on insert, false on conflict
- `unsubscribeFromTag('u1', 't1')` → DELETE, returns true/false/false(null rowCount) — same pattern as `deleteBookmark`
- `getUserSubscriptions('u1')` → JOIN tags + user_tag_subscriptions, returns `TagRow[]`

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Implement new tag queries**

Add to `packages/server/src/db/queries/tags.ts`:

```typescript
export async function searchTags(prefix: string, limit: number): Promise<TagRow[]> {
  const result = await query<TagRow>(
    'SELECT * FROM tags WHERE name ILIKE $1 ORDER BY post_count DESC LIMIT $2',
    [`${prefix}%`, limit],
  );
  return result.rows;
}

export async function findPopularTags(limit: number): Promise<TagRow[]> {
  const result = await query<TagRow>(
    'SELECT * FROM tags WHERE post_count > 0 ORDER BY post_count DESC LIMIT $1',
    [limit],
  );
  return result.rows;
}

export async function subscribeToTag(userId: string, tagId: string): Promise<boolean> {
  const result = await query<UserTagSubscriptionRow>(
    'INSERT INTO user_tag_subscriptions (user_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING *',
    [userId, tagId],
  );
  return result.rows.length > 0;
}

export async function unsubscribeFromTag(userId: string, tagId: string): Promise<boolean> {
  const result = await query(
    'DELETE FROM user_tag_subscriptions WHERE user_id = $1 AND tag_id = $2',
    [userId, tagId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function getUserSubscriptions(userId: string): Promise<TagRow[]> {
  const result = await query<TagRow>(
    'SELECT t.* FROM tags t JOIN user_tag_subscriptions uts ON uts.tag_id = t.id WHERE uts.user_id = $1 ORDER BY t.name',
    [userId],
  );
  return result.rows;
}
```

Add import for `UserTagSubscriptionRow` at the top.

- [ ] **Step 4: Run query tests — expect PASS**

- [ ] **Step 5: Write failing tests for tag routes**

Create `packages/server/src/__tests__/routes/tags.test.ts`:

**Test cases:**

- `GET /api/tags` → returns all tags as `{ tags: Tag[] }`
- `GET /api/tags?q=react&limit=5` → returns search results
- `GET /api/tags/popular` → returns popular tags
- `GET /api/tags/popular?limit=3` → respects limit
- `GET /api/tags/subscriptions` → returns user's subscribed tags (requires auth)
- `POST /api/tags/:id/subscribe` → subscribes, returns `{ subscribed: true }`
- `POST /api/tags/:id/subscribe` (already subscribed) → returns `{ subscribed: true, alreadySubscribed: true }`
- `DELETE /api/tags/:id/subscribe` → unsubscribes, returns `{ subscribed: false }`
- `DELETE /api/tags/:id/subscribe` (not subscribed) → 404
- Auth required for subscribe/unsubscribe/subscriptions endpoints

- [ ] **Step 6: Run tests — expect FAIL**

- [ ] **Step 7: Implement tag routes**

Create `packages/server/src/routes/tags.ts`:

```typescript
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  searchTags,
  findPopularTags,
  subscribeToTag,
  unsubscribeFromTag,
  getUserSubscriptions,
} from '../db/queries/tags.js';
import type { TagRow } from '../db/queries/types.js';
import type { Tag } from '@forge/shared';

function toTag(row: TagRow): Tag {
  return { id: row.id, name: row.name, postCount: row.post_count };
}

const searchSchema = z.object({
  q: z.string().max(50).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const popularSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export async function tagRoutes(app: FastifyInstance): Promise<void> {
  // GET / — list or search tags
  app.get('/', async (request, reply) => {
    const parsed = searchSchema.safeParse(request.query);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: parsed.error.errors.map((e) => e.message).join(', ') });
    }
    const { q, limit } = parsed.data;
    const rows = await searchTags(q ?? '', limit);
    return reply.send({ tags: rows.map(toTag) });
  });

  // GET /popular
  app.get('/popular', async (request, reply) => {
    const parsed = popularSchema.safeParse(request.query);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: parsed.error.errors.map((e) => e.message).join(', ') });
    }
    const rows = await findPopularTags(parsed.data.limit);
    return reply.send({ tags: rows.map(toTag) });
  });

  // GET /subscriptions — user's subscribed tags
  app.get('/subscriptions', { preHandler: [app.authenticate] }, async (request, reply) => {
    const rows = await getUserSubscriptions(request.user.id);
    return reply.send({ tags: rows.map(toTag) });
  });

  // POST /:id/subscribe
  app.post('/:id/subscribe', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const created = await subscribeToTag(request.user.id, id);
    return reply.send({ subscribed: true, alreadySubscribed: !created });
  });

  // DELETE /:id/subscribe
  app.delete('/:id/subscribe', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const deleted = await unsubscribeFromTag(request.user.id, id);
    if (!deleted) {
      return reply.status(404).send({ error: 'Subscription not found' });
    }
    return reply.send({ subscribed: false });
  });
}
```

- [ ] **Step 8: Register in app.ts**

```typescript
import { tagRoutes } from './routes/tags.js';
await app.register(tagRoutes, { prefix: '/api/tags' });
```

- [ ] **Step 9: Add tag processing to POST /api/posts route**

In `packages/server/src/routes/posts.ts`, after creating the post and revision (around line 60), add tag processing:

```typescript
import { findTagByName, createTag, addPostTag } from '../db/queries/tags.js';

// Inside POST / handler, after createRevision:
if (parsed.data.tags && parsed.data.tags.length > 0) {
  for (const tagName of parsed.data.tags) {
    let tag = await findTagByName(tagName);
    if (!tag) {
      tag = await createTag(tagName);
    }
    await addPostTag(postRow.id, tag.id);
  }
}
```

Add a test in `posts.test.ts` that POSTs with `tags: ['typescript', 'react']` and verifies the tag queries are called.

- [ ] **Step 10: Run all tests**

Run: `cd packages/server && npx vitest run`

- [ ] **Step 11: Commit**

```bash
git commit -m "feat(server): add tag routes and post-tag assignment"
```

---

### Task 5: Server Personalized Feed

**Files:**

- Modify: `packages/server/src/db/queries/feed.ts`
- Modify: `packages/server/src/__tests__/db/queries/feed.test.ts`
- Modify: `packages/server/src/routes/posts.ts:23`

**Context:**

- Feed query builder is in `packages/server/src/db/queries/feed.ts:31-131`
- It uses a `nextParam()` helper to track `$N` parameter indices
- The ORDER BY is a switch on `sort` — currently handles `recent`, `top`, and `trending` (default)
- The personalized sort needs: (1) check if user has subscriptions, (2) if yes, add EXISTS filter + hotness ORDER BY, (3) if no, fall back to trending

- [ ] **Step 1: Write failing tests for personalized sort**

Add to `packages/server/src/__tests__/db/queries/feed.test.ts`:

```typescript
describe('sort=personalized', () => {
  it('adds subscription filter and hotness ranking when user has subscriptions', async () => {
    // Subscription check: user has subscriptions
    mockQuery.mockResolvedValueOnce({ rows: [{}], rowCount: 1 });
    // Main feed query
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await findFeedPosts({ userId: 'u1', sort: 'personalized' });

    expect(mockQuery.mock.calls[0][0]).toBe(
      'SELECT 1 FROM user_tag_subscriptions WHERE user_id = $1 LIMIT 1',
    );
    const mainSql = mockQuery.mock.calls[1][0] as string;
    expect(mainSql).toContain('EXISTS');
    expect(mainSql).toContain('user_tag_subscriptions');
    expect(mainSql).toContain('vote_count');
  });

  it('falls back to trending when user has no subscriptions', async () => {
    // Subscription check: empty
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    // Main feed query (trending)
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await findFeedPosts({ userId: 'u1', sort: 'personalized' });

    const mainSql = mockQuery.mock.calls[1][0] as string;
    expect(mainSql).not.toContain('user_tag_subscriptions');
    // Should use trending ORDER BY (GREATEST pattern)
    expect(mainSql).toContain('GREATEST');
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Implement personalized sort in feed query**

In `packages/server/src/db/queries/feed.ts`, modify `findFeedPosts`:

**After** the destructuring line (`const { userId, sort = 'trending', ... }`), add:

```typescript
let effectiveSort = sort;
let filterBySubscriptions = false;

if (sort === 'personalized') {
  const subCheck = await query('SELECT 1 FROM user_tag_subscriptions WHERE user_id = $1 LIMIT 1', [
    userId,
  ]);
  if (subCheck.rows.length > 0) {
    filterBySubscriptions = true;
  } else {
    effectiveSort = 'trending';
  }
}
```

**In the WHERE conditions section**, after the `type` condition, add:

```typescript
if (filterBySubscriptions) {
  const userParam = nextParam(userId);
  conditions.push(
    `EXISTS (SELECT 1 FROM post_tags pt_sub JOIN user_tag_subscriptions uts ON uts.tag_id = pt_sub.tag_id WHERE pt_sub.post_id = p.id AND uts.user_id = ${userParam})`,
  );
}
```

**In the ORDER BY section**, replace `sort` with `effectiveSort` and add the personalized case:

```typescript
let orderByClause: string;
if (effectiveSort === 'recent') {
  orderByClause = 'ORDER BY p.created_at DESC, p.id DESC';
} else if (effectiveSort === 'top') {
  orderByClause = 'ORDER BY p.vote_count DESC, p.created_at DESC, p.id DESC';
} else if (effectiveSort === 'personalized') {
  orderByClause =
    'ORDER BY (p.vote_count + 1) * (1.0 / (EXTRACT(EPOCH FROM NOW() - p.created_at) / 3600 + 2)) DESC, p.created_at DESC, p.id DESC';
} else {
  // trending (default)
  orderByClause =
    'ORDER BY (p.vote_count::float / GREATEST(1, EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600)) DESC, p.created_at DESC, p.id DESC';
}
```

- [ ] **Step 4: Update feedQuerySchema in posts.ts**

In `packages/server/src/routes/posts.ts:23`, change:

```typescript
sort: z.enum(['trending', 'recent', 'top', 'personalized']).default('recent'),
```

- [ ] **Step 5: Run all server tests**

Run: `cd packages/server && npx vitest run`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(server): add personalized feed sort with subscription filter"
```

---

## Chunk 3: Client-Side Features

### Task 6: Client PostActions + Vote/Bookmark Composables

**Files:**

- Modify: `packages/client/src/stores/feed.ts`
- Modify: `packages/client/src/__tests__/stores/feed.test.ts`
- Create: `packages/client/src/composables/useVotes.ts`
- Create: `packages/client/src/__tests__/composables/useVotes.test.ts`
- Create: `packages/client/src/composables/useBookmarks.ts`
- Create: `packages/client/src/__tests__/composables/useBookmarks.test.ts`
- Modify: `packages/client/src/components/post/PostActions.vue`
- Create: `packages/client/src/__tests__/components/post/PostActions.test.ts`

**Context:**

- Feed store pattern: `packages/client/src/stores/feed.ts` — Pinia composition API store with `ref()` + functions
- Composable pattern: `packages/client/src/composables/useFeed.ts` — uses `apiFetch` + store, returns refs
- `apiFetch` in `packages/client/src/lib/api.ts` handles auth headers + token refresh
- Test pattern: mock `../../lib/api.js`, create `mockResponse()` helper, `setActivePinia(createPinia())` in `beforeEach`
- PostActions currently has 3 disabled buttons — needs rewrite with 5 functional/placeholder buttons

- [ ] **Step 1: Write failing tests for feed store vote/bookmark methods**

Add to `packages/client/src/__tests__/stores/feed.test.ts`:

```typescript
describe('updatePostVote', () => {
  it('updates post voteCount and sets userVote', () => {
    store.setPosts([{ ...mockPost, id: 'p1', voteCount: 0 }]);
    store.updatePostVote('p1', 5, 1);
    expect(store.posts[0].voteCount).toBe(5);
    expect(store.userVotes['p1']).toBe(1);
  });

  it('removes userVote when null', () => {
    store.userVotes['p1'] = 1;
    store.updatePostVote('p1', 0, null);
    expect(store.userVotes['p1']).toBeUndefined();
  });
});

describe('setBookmark', () => {
  it('adds bookmark', () => {
    store.setBookmark('p1', true);
    expect(store.userBookmarks['p1']).toBe(true);
  });

  it('removes bookmark', () => {
    store.userBookmarks['p1'] = true;
    store.setBookmark('p1', false);
    expect(store.userBookmarks['p1']).toBeUndefined();
  });
});
```

Also test that `reset()` clears `userVotes` and `userBookmarks`.

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Extend feed store**

In `packages/client/src/stores/feed.ts`, add:

```typescript
const userVotes = ref<Record<string, number>>({});
const userBookmarks = ref<Record<string, boolean>>({});

function updatePostVote(postId: string, voteCount: number, userVote: number | null): void {
  const post = posts.value.find((p) => p.id === postId);
  if (post) {
    post.voteCount = voteCount;
  }
  if (userVote !== null) {
    userVotes.value[postId] = userVote;
  } else {
    delete userVotes.value[postId];
  }
}

function setBookmark(postId: string, bookmarked: boolean): void {
  if (bookmarked) {
    userBookmarks.value[postId] = true;
  } else {
    delete userBookmarks.value[postId];
  }
}
```

Add to `reset()`: `userVotes.value = {}; userBookmarks.value = {};`
Add `userVotes`, `userBookmarks`, `updatePostVote`, `setBookmark` to the return object.

- [ ] **Step 4: Run store tests — expect PASS**

- [ ] **Step 5: Write failing tests for useVotes composable**

Create `packages/client/src/__tests__/composables/useVotes.test.ts`:

Mock `../../lib/api.js`. Test cases:

1. `vote(postId, 1)` → POSTs to `/api/posts/:id/vote` with `{ value: 1 }`, updates store
2. `vote` returns `VoteResponse` on success, `null` on failure
3. `removeVote(postId)` → DELETEs `/api/posts/:id/vote`, clears store vote
4. Error sets `error.value` to server message
5. Network error sets `error.value` to `'Network error'`
6. `loading` is true during request, false after

- [ ] **Step 6: Implement useVotes composable**

Create `packages/client/src/composables/useVotes.ts`:

```typescript
import { ref } from 'vue';
import { apiFetch } from '../lib/api.js';
import { useFeedStore } from '../stores/feed.js';
import type { VoteResponse, VoteValue } from '@forge/shared';

export function useVotes() {
  const store = useFeedStore();
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function vote(postId: string, value: VoteValue): Promise<VoteResponse | null> {
    error.value = null;
    loading.value = true;
    try {
      const response = await apiFetch(`/api/posts/${postId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        error.value = data.error ?? 'Failed to vote';
        return null;
      }
      const data = (await response.json()) as VoteResponse;
      store.updatePostVote(postId, data.voteCount, data.userVote);
      return data;
    } catch {
      error.value = 'Network error';
      return null;
    } finally {
      loading.value = false;
    }
  }

  async function removeVote(postId: string): Promise<VoteResponse | null> {
    error.value = null;
    loading.value = true;
    try {
      const response = await apiFetch(`/api/posts/${postId}/vote`, { method: 'DELETE' });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        error.value = data.error ?? 'Failed to remove vote';
        return null;
      }
      const data = (await response.json()) as VoteResponse;
      store.updatePostVote(postId, data.voteCount, null);
      return data;
    } catch {
      error.value = 'Network error';
      return null;
    } finally {
      loading.value = false;
    }
  }

  return { vote, removeVote, loading, error };
}
```

- [ ] **Step 7: Run useVotes tests — expect PASS**

- [ ] **Step 8: Write failing tests + implement useBookmarks**

Create `packages/client/src/composables/useBookmarks.ts` and `packages/client/src/__tests__/composables/useBookmarks.test.ts`.

Follow the same pattern as useVotes. Single function `toggleBookmark(postId)`:

- POSTs to `/api/posts/${postId}/bookmark`
- On success: calls `store.setBookmark(postId, data.bookmarked)`
- Returns `data.bookmarked` (boolean) or `null` on failure

- [ ] **Step 9: Run useBookmarks tests — expect PASS**

- [ ] **Step 10: Write failing tests for PostActions component**

Create `packages/client/src/__tests__/components/post/PostActions.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import PostActions from '../../../components/post/PostActions.vue';
import { useFeedStore } from '../../../stores/feed.js';

vi.mock('../../../lib/api.js', () => ({ apiFetch: vi.fn() }));
```

Test cases:

1. Renders all 5 buttons (Upvote, Downvote, Bookmark, Fork, History)
2. Displays vote count from post
3. Upvote button has `text-primary` class when `store.userVotes[postId] === 1`
4. Downvote button has `text-red-400` class when `store.userVotes[postId] === -1`
5. Bookmark button has `text-yellow-400` class when `store.userBookmarks[postId] === true`
6. Fork and History buttons are disabled
7. Clicking Upvote calls `apiFetch` with correct params (via useVotes)
8. Clicking Bookmark calls `apiFetch` with correct params (via useBookmarks)

- [ ] **Step 11: Rewrite PostActions component**

Replace `packages/client/src/components/post/PostActions.vue` entirely:

```vue
<template>
  <div class="flex items-center gap-4 border-b border-gray-700 py-3">
    <button
      class="flex items-center gap-1 text-sm"
      :class="currentVote === 1 ? 'text-primary' : 'text-gray-400 hover:text-white'"
      aria-label="Upvote"
      @click="handleVote(1)"
    >
      <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" />
      </svg>
      {{ post.voteCount }}
    </button>
    <button
      class="flex items-center gap-1 text-sm"
      :class="currentVote === -1 ? 'text-red-400' : 'text-gray-400 hover:text-white'"
      aria-label="Downvote"
      @click="handleVote(-1)"
    >
      <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
    </button>
    <button
      class="flex items-center gap-1 text-sm"
      :class="isBookmarked ? 'text-yellow-400' : 'text-gray-400 hover:text-white'"
      aria-label="Bookmark"
      @click="handleBookmark"
    >
      <svg
        class="h-4 w-4"
        :fill="isBookmarked ? 'currentColor' : 'none'"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
        />
      </svg>
    </button>
    <button disabled class="flex items-center gap-1 text-sm text-gray-500" aria-label="Fork">
      <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
        />
      </svg>
    </button>
    <button disabled class="flex items-center gap-1 text-sm text-gray-500" aria-label="History">
      <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { PostWithAuthor, VoteValue } from '@forge/shared';
import { useVotes } from '../../composables/useVotes.js';
import { useBookmarks } from '../../composables/useBookmarks.js';
import { useFeedStore } from '../../stores/feed.js';

const props = defineProps<{ post: PostWithAuthor }>();
const { vote } = useVotes();
const { toggleBookmark } = useBookmarks();
const store = useFeedStore();

const currentVote = computed(() => store.userVotes[props.post.id] ?? null);
const isBookmarked = computed(() => store.userBookmarks[props.post.id] ?? false);

function handleVote(value: VoteValue): void {
  vote(props.post.id, value);
}

function handleBookmark(): void {
  toggleBookmark(props.post.id);
}
</script>
```

- [ ] **Step 12: Run PostActions tests — expect PASS**

- [ ] **Step 13: Verify PostListItem vote count reactivity**

PostListItem receives its `post` prop from the feed store's `posts` array. When `updatePostVote` mutates `post.voteCount` in the store, Vue reactivity propagates to PostListItem. Add a test to `packages/client/src/__tests__/components/post/PostListItem.test.ts` that:

1. Mounts PostListItem with a post from the feed store
2. Calls `store.updatePostVote(postId, 10, 1)` to simulate a vote
3. Verifies the rendered vote count changes from the original value to 10

This confirms the acceptance criterion "Vote count updates in real-time on the PostListItem and PostActions components."

- [ ] **Step 14: Verify bookmarks page works with existing route**

The `/bookmarks` route already exists in `packages/client/src/plugins/router.ts:31-35` and renders `HomePage.vue` with `props: { filter: 'bookmarked' }`. Verify the existing `packages/client/src/__tests__/pages/HomePage.test.ts` covers the `filter='bookmarked'` prop case. If not, add a test case:

```typescript
it('applies bookmarked filter from props', async () => {
  // Mount with filter prop
  // Verify apiFetch called with filter=bookmarked
});
```

This confirms the DoD item "Bookmarks toggle and bookmarks page lists saved posts."

- [ ] **Step 15: Run full client test suite**

Run: `cd packages/client && npx vitest run`
Expected: All pass

- [ ] **Step 16: Commit**

```bash
git commit -m "feat(client): add vote/bookmark composables and wire PostActions"
```

---

### Task 7: Client Tags Store, Composable & Sidebar

**Files:**

- Create: `packages/client/src/stores/tags.ts`
- Create: `packages/client/src/__tests__/stores/tags.test.ts`
- Create: `packages/client/src/composables/useTags.ts`
- Create: `packages/client/src/__tests__/composables/useTags.test.ts`
- Modify: `packages/client/src/components/shell/TheSidebar.vue`
- Modify: `packages/client/src/__tests__/components/shell/TheSidebar.test.ts`

**Context:**

- Store pattern: see `packages/client/src/stores/feed.ts` — composition API with `ref()` + functions
- TheSidebar currently has hardcoded `#frontend`, `#k8s`, `#prompts` at lines 44-48 (desktop) and 99-103 (mobile)
- TheSidebar test file: `packages/client/src/__tests__/components/shell/TheSidebar.test.ts`
- Tags need to come from a composable that loads from `/api/tags/subscriptions`
- Clicking a tag filters the feed by calling `useFeed().setTag(tagName)`

- [ ] **Step 1: Write failing tests for tags store**

Create `packages/client/src/__tests__/stores/tags.test.ts`:

Test cases: `setSubscribedTags`, `setPopularTags`, `addSubscription` (+ no-duplicate), `removeSubscription`, `reset`

- [ ] **Step 2: Implement tags store**

Create `packages/client/src/stores/tags.ts`:

```typescript
import { ref } from 'vue';
import { defineStore } from 'pinia';
import type { Tag } from '@forge/shared';

export const useTagsStore = defineStore('tags', () => {
  const subscribedTags = ref<Tag[]>([]);
  const popularTags = ref<Tag[]>([]);

  function setSubscribedTags(tags: Tag[]): void {
    subscribedTags.value = tags;
  }

  function setPopularTags(tags: Tag[]): void {
    popularTags.value = tags;
  }

  function addSubscription(tag: Tag): void {
    if (!subscribedTags.value.find((t) => t.id === tag.id)) {
      subscribedTags.value = [...subscribedTags.value, tag];
    }
  }

  function removeSubscription(tagId: string): void {
    subscribedTags.value = subscribedTags.value.filter((t) => t.id !== tagId);
  }

  function reset(): void {
    subscribedTags.value = [];
    popularTags.value = [];
  }

  return {
    subscribedTags,
    popularTags,
    setSubscribedTags,
    setPopularTags,
    addSubscription,
    removeSubscription,
    reset,
  };
});
```

- [ ] **Step 3: Run store tests — expect PASS**

- [ ] **Step 4: Write failing tests for useTags composable**

Create `packages/client/src/__tests__/composables/useTags.test.ts`:

Test cases:

1. `loadSubscriptions()` → GETs `/api/tags/subscriptions`, sets store
2. `loadPopularTags(10)` → GETs `/api/tags/popular?limit=10`, sets store
3. `searchTags('react', 5)` → GETs `/api/tags?q=react&limit=5`, returns `Tag[]`
4. `searchTags` returns `[]` on failure
5. `subscribe(tag)` → POSTs to `/api/tags/:id/subscribe`, adds to store
6. `unsubscribe(tagId)` → DELETEs `/api/tags/:id/subscribe`, removes from store
7. Error handling for loadSubscriptions, subscribe, unsubscribe
8. Network error handling

- [ ] **Step 5: Implement useTags composable**

Create `packages/client/src/composables/useTags.ts`:

```typescript
import { ref } from 'vue';
import { storeToRefs } from 'pinia';
import { apiFetch } from '../lib/api.js';
import { useTagsStore } from '../stores/tags.js';
import type { Tag } from '@forge/shared';

export function useTags() {
  const store = useTagsStore();
  const { subscribedTags, popularTags } = storeToRefs(store);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function loadSubscriptions(): Promise<void> {
    error.value = null;
    loading.value = true;
    try {
      const response = await apiFetch('/api/tags/subscriptions');
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        error.value = data.error ?? 'Failed to load subscriptions';
        return;
      }
      const data = (await response.json()) as { tags: Tag[] };
      store.setSubscribedTags(data.tags);
    } catch {
      error.value = 'Network error';
    } finally {
      loading.value = false;
    }
  }

  async function loadPopularTags(limit = 10): Promise<void> {
    error.value = null;
    loading.value = true;
    try {
      const response = await apiFetch(`/api/tags/popular?limit=${limit}`);
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        error.value = data.error ?? 'Failed to load popular tags';
        return;
      }
      const data = (await response.json()) as { tags: Tag[] };
      store.setPopularTags(data.tags);
    } catch {
      error.value = 'Network error';
    } finally {
      loading.value = false;
    }
  }

  async function searchTags(query: string, limit = 5): Promise<Tag[]> {
    try {
      const response = await apiFetch(`/api/tags?q=${encodeURIComponent(query)}&limit=${limit}`);
      if (!response.ok) return [];
      const data = (await response.json()) as { tags: Tag[] };
      return data.tags;
    } catch {
      return [];
    }
  }

  async function subscribe(tag: Tag): Promise<void> {
    error.value = null;
    try {
      const response = await apiFetch(`/api/tags/${tag.id}/subscribe`, { method: 'POST' });
      if (response.ok) {
        store.addSubscription(tag);
      }
    } catch {
      error.value = 'Network error';
    }
  }

  async function unsubscribe(tagId: string): Promise<void> {
    error.value = null;
    try {
      const response = await apiFetch(`/api/tags/${tagId}/subscribe`, { method: 'DELETE' });
      if (response.ok) {
        store.removeSubscription(tagId);
      }
    } catch {
      error.value = 'Network error';
    }
  }

  return {
    subscribedTags,
    popularTags,
    loading,
    error,
    loadSubscriptions,
    loadPopularTags,
    searchTags,
    subscribe,
    unsubscribe,
  };
}
```

- [ ] **Step 6: Run useTags tests — expect PASS**

- [ ] **Step 7: Write failing tests for TheSidebar dynamic tags**

Update `packages/client/src/__tests__/components/shell/TheSidebar.test.ts`:

Need to mock the useTags composable (or the tags store). Add tests:

1. Renders subscribed tags from store instead of hardcoded ones
2. Shows "No followed tags" when store is empty
3. Tag click calls feed `setTag` (or emits an event)
4. Mobile overlay also renders dynamic tags

**Important:** The existing sidebar test mocks `useAuth`. Now it also needs to mock `useTags` and `useFeed`:

```typescript
vi.mock('../../../composables/useTags.js', () => ({
  useTags: () => ({
    subscribedTags: { value: [{ id: 't1', name: 'typescript', postCount: 5 }] },
    loadSubscriptions: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('../../../composables/useFeed.js', () => ({
  useFeed: () => ({
    setTag: vi.fn(),
  }),
}));
```

- [ ] **Step 8: Update TheSidebar component**

In `packages/client/src/components/shell/TheSidebar.vue`:

Add to script:

```typescript
import { onMounted } from 'vue';
import { useTags } from '../../composables/useTags.js';
import { useFeed } from '../../composables/useFeed.js';

const { subscribedTags, loadSubscriptions } = useTags();
const { setTag } = useFeed();

function handleTagClick(tagName: string): void {
  setTag(tagName);
}

onMounted(() => {
  loadSubscriptions();
});
```

Replace the desktop tags section (lines 40-49) with:

```vue
<div v-if="!collapsed" class="mt-6 border-t border-gray-700 pt-4">
  <h3 class="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
    Followed Tags
  </h3>
  <div v-if="subscribedTags.length > 0" class="space-y-1">
    <button
      v-for="tag in subscribedTags"
      :key="tag.id"
      class="block w-full px-3 text-left text-sm text-gray-400 hover:text-white"
      @click="handleTagClick(tag.name)"
    >
      #{{ tag.name }}
    </button>
  </div>
  <p v-else class="px-3 text-xs text-gray-600">No followed tags</p>
</div>
```

Apply the same change to the mobile overlay tags section (lines 95-103).

- [ ] **Step 9: Run TheSidebar tests — expect PASS**

- [ ] **Step 10: Run full client test suite**

Run: `cd packages/client && npx vitest run`

- [ ] **Step 11: Commit**

```bash
git commit -m "feat(client): add tags store/composable and wire sidebar followed tags"
```

---

### Task 8: Editor Tag Autocomplete

**Files:**

- Modify: `packages/client/src/components/editor/EditorToolbar.vue`
- Modify: `packages/client/src/__tests__/components/editor/EditorToolbar.test.ts`

**Context:**

- Read `packages/client/src/components/editor/EditorToolbar.vue` to understand current structure
- The `useTags` composable from Task 7 provides `searchTags(query, limit)` for autocomplete
- Tags are stored as `string[]` in the post creation payload (`createPostSchema.tags`)
- The `usePosts` composable's `createPost` already accepts the full payload — tags just need to be included

**Implementation approach:**

1. Add a tag input section to the toolbar (below the existing controls)
2. Bind the input to a local `tagQuery` ref
3. On input change (debounced ~200ms), call `searchTags(tagQuery)` and show results in a dropdown
4. Clicking a suggestion or pressing Enter adds the tag to a local `selectedTags` array
5. Display selected tags as removable chips
6. If the typed tag doesn't exist in results, Enter creates it inline (just adds the string to `selectedTags`)
7. Expose `selectedTags` via `defineExpose` or emit so the parent can include them in the create payload
8. Max 10 tags (matches `createPostSchema.tags` max)

**Test cases:**

1. Renders tag input field
2. Typing shows autocomplete dropdown (mock `useTags().searchTags`)
3. Clicking suggestion adds tag to selected list
4. Pressing Enter on new tag adds it
5. Removing a tag chip removes from selected list
6. Max 10 tags enforced

- [ ] **Step 1: Read EditorToolbar.vue to understand current structure**

- [ ] **Step 2: Write failing tests for tag autocomplete**

- [ ] **Step 3: Implement tag autocomplete UI**

- [ ] **Step 4: Run EditorToolbar tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(client): add tag autocomplete to editor toolbar"
```

---

## Chunk 4: Bruno API Tests

### Task 9: Bruno API Client Collection

**Files:**

- Create: `bruno/votes/upvote.bru`
- Create: `bruno/votes/downvote.bru`
- Create: `bruno/votes/remove-vote.bru`
- Create: `bruno/bookmarks/toggle-bookmark.bru`
- Create: `bruno/bookmarks/list-bookmarks.bru`
- Create: `bruno/tags/list-tags.bru`
- Create: `bruno/tags/popular-tags.bru`
- Create: `bruno/tags/subscribe.bru`
- Create: `bruno/tags/unsubscribe.bru`
- Create: `bruno/tags/subscriptions.bru`
- Modify: `bruno/posts/get-feed.bru`
- Modify: `bruno/environments/local.bru`

**Context:**

- Existing Bruno collection at `bruno/` — uses `bruno.json` with `@usebruno/cli`
- Run command: `npm run bruno` (runs `cd bruno && npx @usebruno/cli run -r --env local`)
- Format: `.bru` files with `meta`, HTTP method, `auth:bearer`, `body:json`, `script:post-response`, and `docs` blocks
- Environment variables: `{{baseUrl}}` = `http://localhost:3001`, `{{accessToken}}`, `{{postId}}`
- Existing patterns: `bruno/posts/create-post.bru` uses `script:post-response` to capture `postId`; `bruno/posts/get-feed.bru` uses `docs` block for param reference
- **Prerequisite:** Server must be running locally on port 3001 with a seeded database. Bruno tests are manual/integration, not part of `npm test`.

- [ ] **Step 1: Add `tagId` variable to local environment**

In `bruno/environments/local.bru`, add `tagId:` to the vars block (empty default, populated by post-response scripts).

- [ ] **Step 2: Create `bruno/votes/` directory and upvote request**

Create `bruno/votes/upvote.bru`:

```bru
meta {
  name: Upvote Post
  type: http
  seq: 1
}

post {
  url: {{baseUrl}}/api/posts/{{postId}}/vote
  body: json
  auth: bearer
}

auth:bearer {
  token: {{accessToken}}
}

body:json {
  {
    "value": 1
  }
}

docs {
  Idempotent vote toggle.
  - If no existing vote: creates upvote
  - If already upvoted: removes vote (toggle off)
  - If downvoted: switches to upvote

  Response: { voteCount: number, userVote: 1 | -1 | null }

  Requires {{postId}} from Create Post or Get Feed.
}
```

- [ ] **Step 3: Create downvote request**

Create `bruno/votes/downvote.bru`:

```bru
meta {
  name: Downvote Post
  type: http
  seq: 2
}

post {
  url: {{baseUrl}}/api/posts/{{postId}}/vote
  body: json
  auth: bearer
}

auth:bearer {
  token: {{accessToken}}
}

body:json {
  {
    "value": -1
  }
}

docs {
  Same toggle logic as upvote but with value: -1.
  Response: { voteCount: number, userVote: 1 | -1 | null }
}
```

- [ ] **Step 4: Create remove-vote request**

Create `bruno/votes/remove-vote.bru`:

```bru
meta {
  name: Remove Vote
  type: http
  seq: 3
}

delete {
  url: {{baseUrl}}/api/posts/{{postId}}/vote
  body: none
  auth: bearer
}

auth:bearer {
  token: {{accessToken}}
}

docs {
  Explicit vote removal (DELETE instead of toggle).
  Returns 404 if no vote exists.
  Response: { voteCount: number, userVote: null }
}
```

- [ ] **Step 5: Create `bruno/bookmarks/` directory and toggle-bookmark request**

Create `bruno/bookmarks/toggle-bookmark.bru`:

```bru
meta {
  name: Toggle Bookmark
  type: http
  seq: 1
}

post {
  url: {{baseUrl}}/api/posts/{{postId}}/bookmark
  body: none
  auth: bearer
}

auth:bearer {
  token: {{accessToken}}
}

docs {
  Toggles bookmark on a post.
  - If not bookmarked: creates bookmark, returns { bookmarked: true }
  - If already bookmarked: removes bookmark, returns { bookmarked: false }
}
```

- [ ] **Step 6: Create list-bookmarks request**

Create `bruno/bookmarks/list-bookmarks.bru`:

```bru
meta {
  name: List Bookmarks
  type: http
  seq: 2
}

get {
  url: {{baseUrl}}/api/bookmarks?limit=20
  body: none
  auth: bearer
}

auth:bearer {
  token: {{accessToken}}
}

docs {
  Returns paginated list of user's bookmarked posts.
  Query params:
  - cursor: base64 pagination cursor (optional)
  - limit: 1-100 (default: 20)
  Response: { posts: PostWithAuthor[], cursor: string | null }
}
```

- [ ] **Step 7: Create `bruno/tags/` directory and tag requests**

Create `bruno/tags/list-tags.bru`:

```bru
meta {
  name: List Tags
  type: http
  seq: 1
}

get {
  url: {{baseUrl}}/api/tags?limit=20
  body: none
  auth: none
}

docs {
  List or search tags. No auth required.
  Query params:
  - q: search prefix (optional, e.g. ?q=react)
  - limit: 1-50 (default: 20)
  Response: { tags: Tag[] } where Tag = { id, name, postCount }
}
```

Create `bruno/tags/popular-tags.bru`:

```bru
meta {
  name: Popular Tags
  type: http
  seq: 2
}

get {
  url: {{baseUrl}}/api/tags/popular?limit=10
  body: none
  auth: none
}

docs {
  Top tags by post count. No auth required.
  Query params:
  - limit: 1-50 (default: 10)
  Response: { tags: Tag[] }
}
```

Create `bruno/tags/subscribe.bru`:

```bru
meta {
  name: Subscribe to Tag
  type: http
  seq: 3
}

post {
  url: {{baseUrl}}/api/tags/{{tagId}}/subscribe
  body: none
  auth: bearer
}

auth:bearer {
  token: {{accessToken}}
}

docs {
  Subscribe to a tag. Idempotent — returns success even if already subscribed.
  Requires {{tagId}} — get from List Tags or Popular Tags.
  Response: { subscribed: true, alreadySubscribed: boolean }
}
```

Create `bruno/tags/unsubscribe.bru`:

```bru
meta {
  name: Unsubscribe from Tag
  type: http
  seq: 4
}

delete {
  url: {{baseUrl}}/api/tags/{{tagId}}/subscribe
  body: none
  auth: bearer
}

auth:bearer {
  token: {{accessToken}}
}

docs {
  Unsubscribe from a tag. Returns 404 if not subscribed.
  Response: { subscribed: false }
}
```

Create `bruno/tags/subscriptions.bru`:

```bru
meta {
  name: My Tag Subscriptions
  type: http
  seq: 5
}

get {
  url: {{baseUrl}}/api/tags/subscriptions
  body: none
  auth: bearer
}

auth:bearer {
  token: {{accessToken}}
}

docs {
  Returns the authenticated user's subscribed tags.
  Response: { tags: Tag[] }
}
```

- [ ] **Step 8: Add post-response scripts to capture `tagId`**

In `bruno/tags/list-tags.bru`, add a script to capture the first tag ID for use in subscribe/unsubscribe:

```bru
script:post-response {
  if (res.body.tags && res.body.tags.length > 0) {
    bru.setVar("tagId", res.body.tags[0].id);
  }
}
```

Also add the same to `bruno/tags/popular-tags.bru`.

- [ ] **Step 9: Update get-feed.bru docs for personalized sort**

In `bruno/posts/get-feed.bru`, update the docs block and URL:

```bru
get {
  url: {{baseUrl}}/api/posts?sort=recent&limit=20
  body: none
  auth: bearer
}

docs {
  Query params:
  - sort: trending | recent | top | personalized (default: recent)
  - filter: mine | bookmarked (optional)
  - tag: string (optional)
  - type: snippet | prompt | document | link (optional)
  - cursor: base64 pagination cursor (optional)
  - limit: 1-100 (default: 20)

  sort=personalized returns posts tagged with the user's subscribed tags,
  ranked by recency weighted by vote_count. Falls back to trending if the
  user has no tag subscriptions.
}
```

- [ ] **Step 10: Run Bruno collection to verify all requests parse**

```bash
npm run bruno
```

This runs `npx @usebruno/cli run -r --env local` which executes all `.bru` files. Requests will fail if the server isn't running, but the CLI will validate that all `.bru` files parse correctly and the environment variables resolve. Any syntax errors in `.bru` files will be reported.

**Note:** For a full integration test, the server must be running on `localhost:3001` with a seeded database. Steps to run manually:

1. Start the server: `cd packages/server && npm run dev`
2. Login via Bruno: run `bruno/auth/login.bru` to populate `{{accessToken}}`
3. Create a post: run `bruno/posts/create-post.bru` to populate `{{postId}}`
4. Run the new requests: votes, bookmarks, tags in order

- [ ] **Step 11: Commit**

```bash
git add bruno/votes/ bruno/bookmarks/ bruno/tags/ bruno/posts/get-feed.bru bruno/environments/local.bru
git commit -m "feat(bruno): add API requests for votes, bookmarks, and tags"
```

---

## Final Steps

After all tasks are complete:

- [ ] **Run full test suite with coverage**

```bash
npm run test:coverage
```

Verify 100% coverage across lines, branches, functions, statements.

- [ ] **Run type check across all packages**

```bash
npx tsc --noEmit
```

- [ ] **Verify Bruno collection parses cleanly**

```bash
npm run bruno
```

If the server is running locally, this executes all Bruno requests end-to-end. If not, verify the CLI reports no parse errors in the `.bru` files.

- [ ] **Final commit (if any remaining changes)**

- [ ] **Create PR for issue #18**
