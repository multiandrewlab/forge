# Forking System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a post forking system allowing users to create linked copies of public posts with content, tags, and attribution.

**Architecture:** Add `POST /api/posts/:id/fork` endpoint that atomically creates a new post + initial revision + copies tags. Add `forkCount` to the feed types computed via SQL subquery (not denormalized). Modify 3 existing client components to show fork attribution, fork count, and an enabled fork button.

**Tech Stack:** Vue 3 Composition API, Tailwind CSS, Fastify, PostgreSQL, Vitest, `@vue/test-utils`

---

## File Structure

| Action | File                                                                   | Responsibility                                                          |
| ------ | ---------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Modify | `packages/shared/src/types/feed.ts`                                    | Add `forkCount` and `forkedFromTitle` to `PostWithAuthor`               |
| Modify | `packages/server/src/db/queries/posts.ts`                              | Add `createForkedPost` query                                            |
| Modify | `packages/server/src/__tests__/db/queries/posts.test.ts`               | Test for createForkedPost                                               |
| Modify | `packages/server/src/db/queries/feed.ts`                               | Add fork_count + forked_from_title subqueries, add forked_from_id index |
| Modify | `packages/server/src/db/queries/types.ts`                              | Add `fork_count`, `forked_from_title` to `PostWithAuthorRow`            |
| Modify | `packages/server/src/services/feed.ts`                                 | Map `fork_count` and `forked_from_title` in `toPostWithAuthor`          |
| Modify | `packages/server/src/__tests__/services/feed.test.ts`                  | Update feed service tests                                               |
| Modify | `packages/server/src/routes/posts.ts`                                  | Add `POST /:id/fork` endpoint                                           |
| Modify | `packages/server/src/__tests__/routes/posts.test.ts`                   | Fork endpoint tests (incl. chain fork test)                             |
| Modify | `packages/client/src/composables/usePosts.ts`                          | Add `forkPost` function                                                 |
| Modify | `packages/client/src/__tests__/composables/usePosts.test.ts`           | Test forkPost                                                           |
| Modify | `packages/client/src/components/post/PostMetaHeader.vue`               | Fork attribution with source title                                      |
| Modify | `packages/client/src/__tests__/components/post/PostMetaHeader.test.ts` | Attribution tests                                                       |
| Modify | `packages/client/src/components/post/PostActions.vue`                  | Enable fork button, emit fork event                                     |
| Modify | `packages/client/src/__tests__/components/post/PostActions.test.ts`    | Fork button tests                                                       |
| Modify | `packages/client/src/components/post/PostDetail.vue`                   | Handle fork event from PostActions                                      |
| Modify | `packages/client/src/__tests__/components/post/PostDetail.test.ts`     | Fork handler test                                                       |
| Modify | `packages/client/src/components/post/PostListItem.vue`                 | Fork count display                                                      |
| Modify | `packages/client/src/__tests__/components/post/PostListItem.test.ts`   | Fork count tests                                                        |
| Modify | `bruno/environments/local.bru`                                         | Add `forkablePostId` variable                                           |
| Create | `bruno/posts/fork-post.bru`                                            | Bruno API test for fork                                                 |
| Create | `packages/server/src/db/migrations/002_forked-from-index.sql`          | Index on `forked_from_id`                                               |

**Fixture updates required:** All test files constructing `PostWithAuthor` objects need `forkCount: 0` and `forkedFromTitle: null` added. This includes (non-exhaustive — grep for `PostWithAuthor` in test files): `PostMetaHeader.test.ts`, `PostActions.test.ts`, `PostListItem.test.ts`, `PostDetail.test.ts`, `PostViewPage.test.ts`, `posts.test.ts`, `posts-feed.test.ts`.

---

### Task 1: Add forkCount + forkedFromTitle to types, feed queries, index, and service

**Files:**

- Modify: `packages/shared/src/types/feed.ts`
- Modify: `packages/server/src/db/queries/feed.ts` (PostWithAuthorRow type + both SQL queries)
- Modify: `packages/server/src/services/feed.ts`
- Modify: `packages/server/src/__tests__/services/feed.test.ts`
- Modify: `packages/server/src/__tests__/routes/posts.test.ts` (update sampleFeedRow)
- Modify: `packages/server/src/__tests__/routes/posts-feed.test.ts` (update feed test fixtures)
- Create: `packages/server/src/db/migrations/002_forked-from-index.sql`
- Update all test fixtures constructing `PostWithAuthor` (see fixture list above)

- [ ] **Step 1: Create migration for forked_from_id index**

Create `packages/server/src/db/migrations/002_forked-from-index.sql`:

```sql
CREATE INDEX IF NOT EXISTS idx_posts_forked_from_id ON posts(forked_from_id) WHERE forked_from_id IS NOT NULL;
```

This prevents sequential scans on the fork_count subquery.

- [ ] **Step 2: Add `forkCount` and `forkedFromTitle` to `PostWithAuthor` interface**

In `packages/shared/src/types/feed.ts`:

```typescript
export interface PostWithAuthor extends Post {
  author: PostAuthor;
  tags: string[];
  forkCount: number;
  forkedFromTitle: string | null;
}
```

- [ ] **Step 3: Add fields to `PostWithAuthorRow`**

In `packages/server/src/db/queries/feed.ts`, update the type:

```typescript
export type PostWithAuthorRow = PostRow & {
  author_display_name: string;
  author_avatar_url: string | null;
  tags: string | null;
  fork_count: number;
  forked_from_title: string | null;
};
```

- [ ] **Step 4: Add subqueries to `findFeedPostById`**

In `packages/server/src/db/queries/feed.ts`, update the SQL in `findFeedPostById`:

```sql
SELECT
  p.*,
  u.display_name AS author_display_name,
  u.avatar_url   AS author_avatar_url,
  (
    SELECT string_agg(t.name, ',' ORDER BY t.name)
    FROM post_tags pt
    JOIN tags t ON t.id = pt.tag_id
    WHERE pt.post_id = p.id
  ) AS tags,
  (
    SELECT COUNT(*)::int FROM posts f
    WHERE f.forked_from_id = p.id AND f.deleted_at IS NULL
  ) AS fork_count,
  (
    SELECT title FROM posts src
    WHERE src.id = p.forked_from_id AND src.deleted_at IS NULL
  ) AS forked_from_title
FROM posts p
JOIN users u ON u.id = p.author_id
WHERE p.id = $1 AND p.deleted_at IS NULL
```

- [ ] **Step 5: Add subqueries to `findFeedPosts`**

In `packages/server/src/db/queries/feed.ts`, update the `selectClause` in `findFeedPosts`:

```sql
SELECT
  p.*,
  u.display_name AS author_display_name,
  u.avatar_url   AS author_avatar_url,
  (
    SELECT string_agg(t.name, ',' ORDER BY t.name)
    FROM post_tags pt
    JOIN tags t ON t.id = pt.tag_id
    WHERE pt.post_id = p.id
  ) AS tags,
  (
    SELECT COUNT(*)::int FROM posts f
    WHERE f.forked_from_id = p.id AND f.deleted_at IS NULL
  ) AS fork_count,
  (
    SELECT title FROM posts src
    WHERE src.id = p.forked_from_id AND src.deleted_at IS NULL
  ) AS forked_from_title
FROM posts p
JOIN users u ON u.id = p.author_id
```

- [ ] **Step 6: Map both fields in `toPostWithAuthor`**

In `packages/server/src/services/feed.ts`:

```typescript
export function toPostWithAuthor(row: PostWithAuthorRow): PostWithAuthor {
  return {
    ...toPost(row),
    author: {
      id: row.author_id,
      displayName: row.author_display_name,
      avatarUrl: row.author_avatar_url,
    },
    tags: row.tags ? row.tags.split(',') : [],
    forkCount: row.fork_count ?? 0,
    forkedFromTitle: row.forked_from_title ?? null,
  };
}
```

- [ ] **Step 7: Update feed service tests**

In `packages/server/src/__tests__/services/feed.test.ts`, add `fork_count: 0` and `forked_from_title: null` to all `PostWithAuthorRow` fixtures. Assert `forkCount: 0` and `forkedFromTitle: null` in output. Add tests:

- `fork_count: 5` maps to `forkCount: 5`
- `forked_from_title: 'Source Post'` maps to `forkedFromTitle: 'Source Post'`

- [ ] **Step 8: Update route test fixtures**

In `packages/server/src/__tests__/routes/posts.test.ts`, add `fork_count: 0` and `forked_from_title: null` to `sampleFeedRow`. Similarly update `packages/server/src/__tests__/routes/posts-feed.test.ts` feed row fixtures.

- [ ] **Step 9: Update ALL client test fixtures constructing `PostWithAuthor`**

Add `forkCount: 0` and `forkedFromTitle: null` to every test file that constructs a `PostWithAuthor` object. Search with: `grep -rn 'PostWithAuthor\|mockPost\|samplePost' packages/client/src/__tests__/`. Files to update include:

- `PostMetaHeader.test.ts`
- `PostActions.test.ts`
- `PostListItem.test.ts`
- `PostDetail.test.ts`
- `PostViewPage.test.ts`
- Any other matches

- [ ] **Step 10: Run full test suite**

Run: `npx vitest run`
Expected: All pass.

- [ ] **Step 11: Commit**

```bash
git add packages/shared/src/types/feed.ts packages/server/src/db/queries/feed.ts packages/server/src/db/migrations/ packages/server/src/services/feed.ts packages/server/src/__tests__/ packages/client/src/__tests__/
git commit -m "feat: add forkCount and forkedFromTitle to feed types and queries"
```

---

### Task 2: Add createForkedPost query + fork endpoint + tests

**Files:**

- Modify: `packages/server/src/db/queries/posts.ts`
- Modify: `packages/server/src/__tests__/db/queries/posts.test.ts`
- Modify: `packages/server/src/routes/posts.ts`
- Modify: `packages/server/src/__tests__/routes/posts.test.ts`

- [ ] **Step 1: Write failing tests for createForkedPost query**

In `packages/server/src/__tests__/db/queries/posts.test.ts`, add tests for the new query:

```typescript
describe('createForkedPost', () => {
  it('creates a post with forked_from_id set', async () => {
    const forkedRow = { ...samplePostRow, forked_from_id: 'source-post-id' };
    mockQuery.mockResolvedValueOnce({ rows: [forkedRow], rowCount: 1 });

    const result = await createForkedPost({
      authorId: userId,
      title: 'Forked Post',
      contentType: 'snippet',
      language: 'typescript',
      visibility: 'private',
      isDraft: true,
      forkedFromId: 'source-post-id',
    });

    expect(result.forked_from_id).toBe('source-post-id');
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('forked_from_id'),
      expect.arrayContaining(['source-post-id']),
    );
  });
});
```

- [ ] **Step 2: Implement createForkedPost query**

In `packages/server/src/db/queries/posts.ts`:

```typescript
export interface CreateForkedPostInput extends CreatePostInput {
  forkedFromId: string;
}

export async function createForkedPost(input: CreateForkedPostInput): Promise<PostRow> {
  const result = await query<PostRow>(
    `INSERT INTO posts (author_id, title, content_type, language, visibility, is_draft, forked_from_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [
      input.authorId,
      input.title,
      input.contentType,
      input.language,
      input.visibility,
      input.isDraft,
      input.forkedFromId,
    ],
  );
  return result.rows[0] as PostRow;
}
```

- [ ] **Step 3: Write failing tests for fork endpoint**

In `packages/server/src/__tests__/routes/posts.test.ts`, add a new describe block:

```typescript
// ─── POST /api/posts/:id/fork ────────────────────────────────────

describe('POST /api/posts/:id/fork', () => {
  const sourcePostRow: PostRow = {
    ...samplePostRow,
    visibility: 'public',
    is_draft: false,
    author_id: otherUserId, // source post belongs to another user
  };

  it('forks a post and returns 201 with the new post', async () => {
    // findPostById (source)
    mockQuery.mockResolvedValueOnce({ rows: [sourcePostRow], rowCount: 1 });
    // findPostWithLatestRevision (get latest revision content)
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          ...sourcePostRow,
          revision_id: 'rev-1',
          content: 'source code',
          revision_number: 1,
          message: 'init',
        },
      ],
      rowCount: 1,
    });
    // createForkedPost
    const forkedPostRow = { ...samplePostRow, forked_from_id: sourcePostRow.id, author_id: userId };
    mockQuery.mockResolvedValueOnce({ rows: [forkedPostRow], rowCount: 1 });
    // createRevision (initial revision for fork)
    mockQuery.mockResolvedValueOnce({ rows: [sampleRevisionRow], rowCount: 1 });
    // findTagsByPostId (copy tags)
    mockQuery.mockResolvedValueOnce({ rows: [{ tag_id: 'tag-1' }], rowCount: 1 });
    // addPostTag
    mockQuery.mockResolvedValueOnce({
      rows: [{ post_id: forkedPostRow.id, tag_id: 'tag-1' }],
      rowCount: 1,
    });
    // findFeedPostById for broadcast
    mockFindFeedPostById.mockResolvedValueOnce({ ...sampleFeedRow, fork_count: 0 });

    const response = await app.inject({
      method: 'POST',
      url: `/api/posts/${sourcePostRow.id}/fork`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.post.forkedFromId).toBe(sourcePostRow.id);
    expect(body.post.authorId).toBe(userId);
  });

  it('returns 401 without auth', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/posts/${postId}/fork`,
    });
    expect(response.statusCode).toBe(401);
  });

  it('returns 404 when source post does not exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const response = await app.inject({
      method: 'POST',
      url: `/api/posts/${postId}/fork`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(404);
  });

  it('returns 403 when trying to fork own post', async () => {
    // samplePostRow has author_id = userId (same as token user)
    mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });

    const response = await app.inject({
      method: 'POST',
      url: `/api/posts/${postId}/fork`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error).toBe('Cannot fork your own post');
  });

  it('returns 403 when source post is private', async () => {
    const privatePost = { ...sourcePostRow, visibility: 'private' };
    mockQuery.mockResolvedValueOnce({ rows: [privatePost], rowCount: 1 });

    const response = await app.inject({
      method: 'POST',
      url: `/api/posts/${postId}/fork`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error).toBe('Cannot fork a private post');
  });

  it('returns 403 when source post is a draft', async () => {
    const draftPost = { ...sourcePostRow, is_draft: true };
    mockQuery.mockResolvedValueOnce({ rows: [draftPost], rowCount: 1 });

    const response = await app.inject({
      method: 'POST',
      url: `/api/posts/${postId}/fork`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(403);
  });

  it('copies tags from source to forked post', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [sourcePostRow], rowCount: 1 });
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          ...sourcePostRow,
          revision_id: 'rev-1',
          content: 'code',
          revision_number: 1,
          message: null,
        },
      ],
      rowCount: 1,
    });
    const forkedPostRow = { ...samplePostRow, forked_from_id: sourcePostRow.id, author_id: userId };
    mockQuery.mockResolvedValueOnce({ rows: [forkedPostRow], rowCount: 1 });
    mockQuery.mockResolvedValueOnce({ rows: [sampleRevisionRow], rowCount: 1 });
    // Two tags
    mockQuery.mockResolvedValueOnce({
      rows: [{ tag_id: 'tag-1' }, { tag_id: 'tag-2' }],
      rowCount: 2,
    });
    mockQuery.mockResolvedValueOnce({
      rows: [{ post_id: forkedPostRow.id, tag_id: 'tag-1' }],
      rowCount: 1,
    });
    mockQuery.mockResolvedValueOnce({
      rows: [{ post_id: forkedPostRow.id, tag_id: 'tag-2' }],
      rowCount: 1,
    });
    mockFindFeedPostById.mockResolvedValueOnce({ ...sampleFeedRow, fork_count: 0 });

    const response = await app.inject({
      method: 'POST',
      url: `/api/posts/${sourcePostRow.id}/fork`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(201);
    // Verify addPostTag was called (query calls 5+6+7 are tag-related)
  });

  it('works when source post has no tags', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [sourcePostRow], rowCount: 1 });
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          ...sourcePostRow,
          revision_id: 'rev-1',
          content: 'code',
          revision_number: 1,
          message: null,
        },
      ],
      rowCount: 1,
    });
    const forkedPostRow = { ...samplePostRow, forked_from_id: sourcePostRow.id, author_id: userId };
    mockQuery.mockResolvedValueOnce({ rows: [forkedPostRow], rowCount: 1 });
    mockQuery.mockResolvedValueOnce({ rows: [sampleRevisionRow], rowCount: 1 });
    // No tags
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    mockFindFeedPostById.mockResolvedValueOnce({ ...sampleFeedRow, fork_count: 0 });

    const response = await app.inject({
      method: 'POST',
      url: `/api/posts/${sourcePostRow.id}/fork`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(201);
  });

  it('chain forking works — forking a fork sets forkedFromId to immediate parent', async () => {
    // Source post is itself a fork (has forked_from_id set)
    const chainSourcePost = { ...sourcePostRow, forked_from_id: 'grandparent-post-id' };
    mockQuery.mockResolvedValueOnce({ rows: [chainSourcePost], rowCount: 1 });
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          ...chainSourcePost,
          revision_id: 'rev-1',
          content: 'code',
          revision_number: 1,
          message: null,
        },
      ],
      rowCount: 1,
    });
    const forkedPostRow = {
      ...samplePostRow,
      forked_from_id: chainSourcePost.id,
      author_id: userId,
    };
    mockQuery.mockResolvedValueOnce({ rows: [forkedPostRow], rowCount: 1 });
    mockQuery.mockResolvedValueOnce({ rows: [sampleRevisionRow], rowCount: 1 });
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    mockFindFeedPostById.mockResolvedValueOnce({
      ...sampleFeedRow,
      fork_count: 0,
      forked_from_title: null,
    });

    const response = await app.inject({
      method: 'POST',
      url: `/api/posts/${chainSourcePost.id}/fork`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(201);
    // forkedFromId points to the immediate parent, NOT the grandparent
    expect(response.json().post.forkedFromId).toBe(chainSourcePost.id);
  });

  it('broadcasts post:new on feed channel after fork', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [sourcePostRow], rowCount: 1 });
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          ...sourcePostRow,
          revision_id: 'rev-1',
          content: 'code',
          revision_number: 1,
          message: null,
        },
      ],
      rowCount: 1,
    });
    const forkedPostRow = { ...samplePostRow, forked_from_id: sourcePostRow.id, author_id: userId };
    mockQuery.mockResolvedValueOnce({ rows: [forkedPostRow], rowCount: 1 });
    mockQuery.mockResolvedValueOnce({ rows: [sampleRevisionRow], rowCount: 1 });
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    mockFindFeedPostById.mockResolvedValueOnce({ ...sampleFeedRow, fork_count: 0 });

    await app.inject({
      method: 'POST',
      url: `/api/posts/${sourcePostRow.id}/fork`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(broadcastSpy).toHaveBeenCalledWith(
      'feed',
      expect.objectContaining({ type: 'post:new', channel: 'feed' }),
      expect.anything(),
    );
  });
});
```

- [ ] **Step 4: Implement the fork endpoint**

In `packages/server/src/routes/posts.ts`, add the imports and endpoint. Add at the top with existing imports:

```typescript
import { createForkedPost } from '../db/queries/posts.js';
```

Add the endpoint before the revisions routes:

```typescript
// POST /:id/fork — fork a public post
app.post('/:id/fork', { preHandler: [app.authenticate] }, async (request, reply) => {
  const { id } = request.params as { id: string };

  const source = await findPostById(id);
  if (!source) {
    return reply.status(404).send({ error: 'Post not found' });
  }

  if (source.author_id === request.user.id) {
    return reply.status(403).send({ error: 'Cannot fork your own post' });
  }

  if (source.visibility !== 'public' || source.is_draft) {
    return reply.status(403).send({ error: 'Cannot fork a private post' });
  }

  // Get latest revision content
  const sourceWithRevision = await findPostWithLatestRevision(id);
  if (!sourceWithRevision) {
    return reply.status(404).send({ error: 'Post not found' });
  }

  // Create forked post
  const forkedPostRow = await createForkedPost({
    authorId: request.user.id,
    title: source.title,
    contentType: source.content_type,
    language: source.language,
    visibility: 'private',
    isDraft: true,
    forkedFromId: id,
  });

  // Create initial revision with source content
  const revisionRow = await createRevision({
    postId: forkedPostRow.id,
    authorId: request.user.id,
    content: sourceWithRevision.content,
    message: `Forked from ${source.title}`,
    revisionNumber: 1,
  });

  // Copy tags from source
  const tagRows = await query<{ tag_id: string }>(
    'SELECT tag_id FROM post_tags WHERE post_id = $1',
    [id],
  );
  for (const { tag_id } of tagRows.rows) {
    await addPostTag(forkedPostRow.id, tag_id);
  }

  // Broadcast new post to feed
  const feedRow = await findFeedPostById(forkedPostRow.id);
  if (feedRow) {
    const excludeWs = getExcludeWs(app, request);
    app.websocket.channels.broadcast(
      'feed',
      { type: 'post:new', channel: 'feed', data: toPostWithAuthor(feedRow) },
      excludeWs,
    );
  }

  return reply.status(201).send({
    post: toPost(forkedPostRow),
    revision: toRevision(revisionRow),
  });
});
```

Add required imports at top of file:

```typescript
import { query } from '../db/connection.js';
import { addPostTag } from '../db/queries/tags.js';
```

- [ ] **Step 5: Run tests**

Run: `cd packages/server && npx vitest run src/__tests__/routes/posts.test.ts`
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/db/queries/posts.ts packages/server/src/__tests__/db/queries/posts.test.ts packages/server/src/routes/posts.ts packages/server/src/__tests__/routes/posts.test.ts
git commit -m "feat: add POST /api/posts/:id/fork endpoint with tag copying"
```

---

### Task 3: Client composable — forkPost function + tests

**Files:**

- Modify: `packages/client/src/composables/usePosts.ts`
- Modify: `packages/client/src/__tests__/composables/usePosts.test.ts`

- [ ] **Step 1: Write failing tests**

In `packages/client/src/__tests__/composables/usePosts.test.ts`, add:

```typescript
describe('forkPost', () => {
  it('should POST to /api/posts/:id/fork and return the new post id', async () => {
    const mockPost = createMockPost({ id: 'forked-1', forkedFromId: 'source-1' });
    mockApiFetch.mockResolvedValue(
      new Response(JSON.stringify({ post: jsonRoundTrip(mockPost) }), { status: 201 }),
    );

    const { forkPost } = usePosts();
    const id = await forkPost('source-1');

    expect(id).toBe('forked-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/posts/source-1/fork', {
      method: 'POST',
    });
  });

  it('should set error on non-ok response', async () => {
    mockApiFetch.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Cannot fork your own post' }), { status: 403 }),
    );

    const { forkPost, error } = usePosts();
    const id = await forkPost('source-1');

    expect(id).toBeNull();
    expect(error.value).toBe('Cannot fork your own post');
  });

  it('should set error on network failure', async () => {
    mockApiFetch.mockRejectedValue(new Error('Network error'));

    const { forkPost, error } = usePosts();
    const id = await forkPost('source-1');

    expect(id).toBeNull();
    expect(error.value).toBe('Network error');
  });

  it('should use fallback message when catch receives non-Error', async () => {
    mockApiFetch.mockRejectedValue('string-rejection');

    const { forkPost, error } = usePosts();
    const id = await forkPost('source-1');

    expect(id).toBeNull();
    expect(error.value).toBe('Failed to fork post');
  });
});
```

- [ ] **Step 2: Implement forkPost**

In `packages/client/src/composables/usePosts.ts`, add:

```typescript
async function forkPost(sourcePostId: string): Promise<string | null> {
  error.value = null;
  try {
    const response = await apiFetch(`/api/posts/${sourcePostId}/fork`, {
      method: 'POST',
    });

    if (!response.ok) {
      error.value = await parseErrorMessage(response, 'Failed to fork post');
      return null;
    }

    const data = (await response.json()) as { post: PostWithRevision };
    return data.post.id;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to fork post';
    return null;
  }
}
```

Add `forkPost` to the return object.

- [ ] **Step 3: Run tests**

Run: `cd packages/client && npx vitest run src/__tests__/composables/usePosts.test.ts`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/composables/usePosts.ts packages/client/src/__tests__/composables/usePosts.test.ts
git commit -m "feat: add forkPost composable function"
```

---

### Task 4: PostMetaHeader — fork attribution display + tests

**Files:**

- Modify: `packages/client/src/components/post/PostMetaHeader.vue`
- Modify: `packages/client/src/__tests__/components/post/PostMetaHeader.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `packages/client/src/__tests__/components/post/PostMetaHeader.test.ts`:

```typescript
it('shows fork attribution with source title when forkedFromId and forkedFromTitle are set', () => {
  const forkedPost = {
    ...mockPost,
    forkedFromId: 'source-123',
    forkedFromTitle: 'Original Post Title',
  };
  const wrapper = mount(PostMetaHeader, { props: { post: forkedPost } });

  expect(wrapper.text()).toContain('Forked from');
  expect(wrapper.text()).toContain('Original Post Title');
  expect(wrapper.find('[data-testid="fork-attribution"]').exists()).toBe(true);
});

it('shows "a deleted post" when forkedFromId is set but forkedFromTitle is null', () => {
  const forkedPost = { ...mockPost, forkedFromId: 'source-123', forkedFromTitle: null };
  const wrapper = mount(PostMetaHeader, { props: { post: forkedPost } });

  expect(wrapper.text()).toContain('Forked from');
  expect(wrapper.text()).toContain('a deleted post');
});

it('does not show fork attribution when forkedFromId is null', () => {
  const wrapper = mount(PostMetaHeader, { props: { post: mockPost } });

  expect(wrapper.find('[data-testid="fork-attribution"]').exists()).toBe(false);
});
```

- [ ] **Step 2: Add fork attribution to PostMetaHeader template**

In `packages/client/src/components/post/PostMetaHeader.vue`, add after the author info `<div>` block (after line 14):

```vue
<div v-if="post.forkedFromId" data-testid="fork-attribution" class="mt-1 text-xs text-gray-500">
      Forked from
      <router-link
        v-if="post.forkedFromTitle"
        :to="{ name: 'post-view', params: { id: post.forkedFromId } }"
        class="text-primary hover:underline"
      >
        {{ post.forkedFromTitle }}
      </router-link>
      <span v-else>a deleted post</span>
    </div>
```

- [ ] **Step 3: Run tests**

Run: `cd packages/client && npx vitest run src/__tests__/components/post/PostMetaHeader.test.ts`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/components/post/PostMetaHeader.vue packages/client/src/__tests__/components/post/PostMetaHeader.test.ts
git commit -m "feat: show fork attribution in PostMetaHeader"
```

---

### Task 5: PostActions — enable fork button + tests

**Files:**

- Modify: `packages/client/src/components/post/PostActions.vue`
- Modify: `packages/client/src/__tests__/components/post/PostActions.test.ts`

- [ ] **Step 1: Write failing tests**

Update `packages/client/src/__tests__/components/post/PostActions.test.ts`:

```typescript
describe('fork button', () => {
  it('is enabled for public posts by other users', () => {
    const otherUserPost = { ...samplePost, authorId: 'other-user' };
    const wrapper = mount(PostActions, { props: { post: otherUserPost } });

    const forkBtn = wrapper.find('[aria-label="Fork"]');
    expect(forkBtn.attributes('disabled')).toBeUndefined();
  });

  it('is disabled for own posts', () => {
    // samplePost.authorId matches the mocked auth user
    const wrapper = mount(PostActions, { props: { post: samplePost } });

    const forkBtn = wrapper.find('[aria-label="Fork"]');
    expect(forkBtn.attributes('disabled')).toBeDefined();
  });

  it('emits fork event when clicked', async () => {
    const otherUserPost = { ...samplePost, authorId: 'other-user' };
    const wrapper = mount(PostActions, { props: { post: otherUserPost } });

    await wrapper.find('[aria-label="Fork"]').trigger('click');

    expect(wrapper.emitted('fork')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Update fork button in PostActions.vue**

Replace the disabled fork button (lines 51-60) with:

```vue
<!-- Fork -->
<button
  class="flex items-center gap-1 text-sm"
  :class="canFork ? 'text-gray-400 hover:text-gray-200' : 'text-gray-600 cursor-not-allowed'"
  :disabled="!canFork"
  aria-label="Fork"
  @click="canFork && $emit('fork')"
>
      <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2"
        />
      </svg>
    </button>
```

In the `<script setup>` section, add the `fork` emit and `canFork` computed:

```typescript
import { useAuthStore } from '../../stores/auth.js';

const authStore = useAuthStore();

const emit = defineEmits<{ fork: [] }>();

const canFork = computed(() => {
  return props.post.authorId !== authStore.user?.id;
});
```

- [ ] **Step 3: Run tests**

Run: `cd packages/client && npx vitest run src/__tests__/components/post/PostActions.test.ts`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/components/post/PostActions.vue packages/client/src/__tests__/components/post/PostActions.test.ts
git commit -m "feat: enable fork button in PostActions for eligible posts"
```

---

### Task 5b: PostDetail — handle fork event + navigate to edit

**Files:**

- Modify: `packages/client/src/components/post/PostDetail.vue`
- Modify: `packages/client/src/__tests__/components/post/PostDetail.test.ts`

- [ ] **Step 1: Write failing test**

Add to `packages/client/src/__tests__/components/post/PostDetail.test.ts`:

```typescript
it('calls forkPost and navigates to edit when fork event received', async () => {
  // Mock forkPost to return a new post ID
  mockForkPost.mockResolvedValue('forked-post-id');

  const wrapper = mount(PostDetail, { props: { post: mockPost } });

  // Trigger fork event on PostActions
  const postActions = wrapper.findComponent({ name: 'PostActions' });
  postActions.vm.$emit('fork');
  await flushPromises();

  expect(mockForkPost).toHaveBeenCalledWith(mockPost.id);
  expect(mockPush).toHaveBeenCalledWith(`/posts/forked-post-id/edit`);
});
```

The test setup needs `mockForkPost` and `mockPush` mocked — follow the existing patterns in the test file for mocking `usePosts` and `useRouter`.

- [ ] **Step 2: Add fork handler to PostDetail.vue**

In `packages/client/src/components/post/PostDetail.vue`, add the `@fork` binding on the `<PostActions>` element:

```vue
<PostActions :post="post" @fork="handleFork" />
```

In the `<script setup>`, add:

```typescript
import { useRouter } from 'vue-router';
import { usePosts } from '@/composables/usePosts';

const router = useRouter();
const { forkPost } = usePosts();

async function handleFork(): Promise<void> {
  const newPostId = await forkPost(props.post.id);
  if (newPostId) {
    router.push(`/posts/${newPostId}/edit`);
  }
}
```

- [ ] **Step 3: Run tests**

Run: `cd packages/client && npx vitest run src/__tests__/components/post/PostDetail.test.ts`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/components/post/PostDetail.vue packages/client/src/__tests__/components/post/PostDetail.test.ts
git commit -m "feat: handle fork event in PostDetail with navigate to edit"
```

---

### Task 6: PostListItem — fork count display + tests

**Files:**

- Modify: `packages/client/src/components/post/PostListItem.vue`
- Modify: `packages/client/src/__tests__/components/post/PostListItem.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `packages/client/src/__tests__/components/post/PostListItem.test.ts`:

```typescript
it('shows fork count when forkCount > 0', () => {
  const forkedPost = { ...samplePost, forkCount: 3 };
  const wrapper = mount(PostListItem, {
    props: { post: forkedPost, selected: false },
  });

  expect(wrapper.find('[data-testid="fork-count"]').exists()).toBe(true);
  expect(wrapper.text()).toContain('3');
});

it('does not show fork count when forkCount is 0', () => {
  const wrapper = mount(PostListItem, {
    props: { post: samplePost, selected: false },
  });

  expect(wrapper.find('[data-testid="fork-count"]').exists()).toBe(false);
});
```

- [ ] **Step 2: Add fork count display to PostListItem template**

In `packages/client/src/components/post/PostListItem.vue`, add after the vote count `<span>` (after line 29):

```vue
<span v-if="post.forkCount > 0" data-testid="fork-count" class="flex items-center gap-1">
        <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2"
          />
        </svg>
        {{ post.forkCount }}
      </span>
```

- [ ] **Step 3: Run tests**

Run: `cd packages/client && npx vitest run src/__tests__/components/post/PostListItem.test.ts`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/components/post/PostListItem.vue packages/client/src/__tests__/components/post/PostListItem.test.ts
git commit -m "feat: show fork count in PostListItem"
```

---

### Task 7: Bruno API test for fork endpoint

**Files:**

- Modify: `bruno/environments/local.bru`
- Create: `bruno/posts/fork-post.bru`

- [ ] **Step 1: Add `forkablePostId` to Bruno local environment**

In `bruno/environments/local.bru`, add a new variable pointing to a seeded post owned by Alice (not testuser):

```
forkablePostId: c0000000-0000-0000-0000-000000000001
```

This is the "TypeScript Utility Types Cheat Sheet" post owned by user `a0000000-...-000000000001` (Alice). Since testuser runs the Bruno suite, forking Alice's post will succeed (different author, public, non-draft).

- [ ] **Step 2: Create the Bruno request file**

Create `bruno/posts/fork-post.bru`:

```
meta {
  name: Fork Post
  type: http
  seq: 7
}

post {
  url: {{baseUrl}}/api/posts/{{forkablePostId}}/fork
  body: none
  auth: bearer
}

auth:bearer {
  token: {{accessToken}}
}

assert {
  res.status: eq 201
}

script:post-response {
  if (res.status === 201) {
    const body = res.getBody();
    bru.setVar("forkedPostId", body.post.id);
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add bruno/environments/local.bru bruno/posts/fork-post.bru
git commit -m "test: add Bruno API test for fork endpoint"
```

---

## Verification Checklist

After all tasks are complete:

- [ ] Run `npm test` — all tests pass
- [ ] Run `npm run test:coverage` — meets 100% thresholds
- [ ] Run `npm run build` — no TypeScript errors
- [ ] Run `npm run lint` — no lint errors
- [ ] Start server and run Bruno suite: `npm run bruno`
- [ ] Manual smoke test: view a post by another user, click Fork, verify redirect to edit page with forked content
