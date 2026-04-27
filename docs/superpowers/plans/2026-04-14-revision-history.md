# Revision History & Visual Diffs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a revision history page with visual diff comparison and revision restore for Issue #2.

**Architecture:** Server already has list/get revision endpoints; we add a restore endpoint. Client gets three new components (RevisionTimeline, RevisionDiffViewer, RestoreButton) assembled into the existing PostHistoryPage placeholder. Client-side diff computation using the `diff` npm package. The existing disabled History button in PostActions gets wired up.

**Tech Stack:** Vue 3 Composition API, Tailwind CSS, Fastify, PostgreSQL, Vitest, `diff` npm package, `@vue/test-utils`

---

## Deferred Requirements

The acceptance criterion "Inline comments on older revisions display correctly per the comment display policy in the design spec" is **deferred** — no design spec document exists in the codebase to define this policy. This criterion will be addressed when the design spec is created.

## File Structure

| Action  | File                                                                          | Responsibility                                                           |
| ------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Modify  | `packages/shared/src/types/post.ts`                                           | Add `authorId`, `authorDisplayName`, `authorAvatarUrl` to `PostRevision` |
| Modify  | `packages/server/src/db/queries/types.ts`                                     | Add `PostRevisionWithAuthorRow` type                                     |
| Modify  | `packages/server/src/db/queries/revisions.ts`                                 | Add `findRevisionsWithAuthorByPostId` joined query                       |
| Modify  | `packages/server/src/__tests__/db/queries/revisions.test.ts`                  | Test for joined query                                                    |
| Modify  | `packages/server/src/services/posts.ts`                                       | Update `toRevision` mapping for author fields                            |
| Modify  | `packages/server/src/__tests__/services/posts.test.ts`                        | Update toRevision tests                                                  |
| Modify  | `packages/server/src/routes/posts.ts`                                         | Add restore endpoint, use joined query for list                          |
| Modify  | `packages/server/src/__tests__/routes/posts.test.ts`                          | Restore endpoint tests, list endpoint author fields                      |
| Modify  | `packages/client/src/composables/usePosts.ts`                                 | Add `restoreRevision`, fix `fetchRevisions`                              |
| Modify  | `packages/client/src/__tests__/composables/usePosts.test.ts`                  | Replace fetchRevisions tests, add restoreRevision tests                  |
| Install | `diff`, `@types/diff`                                                         | Client-side diff computation                                             |
| Create  | `packages/client/src/components/history/RevisionTimeline.vue`                 | Scrollable revision list with selection + author avatars                 |
| Create  | `packages/client/src/__tests__/components/history/RevisionTimeline.test.ts`   | Timeline component tests                                                 |
| Create  | `packages/client/src/components/history/RevisionDiffViewer.vue`               | Inline/side-by-side diff display                                         |
| Create  | `packages/client/src/__tests__/components/history/RevisionDiffViewer.test.ts` | Diff viewer tests                                                        |
| Create  | `packages/client/src/components/history/RestoreButton.vue`                    | Restore with confirmation dialog                                         |
| Create  | `packages/client/src/__tests__/components/history/RestoreButton.test.ts`      | Restore button tests                                                     |
| Modify  | `packages/client/src/pages/PostHistoryPage.vue`                               | Assemble all components                                                  |
| Create  | `packages/client/src/__tests__/pages/PostHistoryPage.test.ts`                 | Page-level tests                                                         |
| Modify  | `packages/client/src/components/post/PostActions.vue`                         | Enable History button                                                    |
| Modify  | `packages/client/src/__tests__/components/post/PostActions.test.ts`           | History button tests                                                     |
| Create  | `bruno/posts/revisions/restore-revision.bru`                                  | Bruno API test for restore                                               |

**Route note:** The `/posts/:id/history` route is already registered at `packages/client/src/plugins/router.ts:52-55` with name `post-history`. No router modification needed.

---

### Task 1: Extend PostRevision type with author fields + joined query

**Files:**

- Modify: `packages/shared/src/types/post.ts`
- Modify: `packages/server/src/db/queries/types.ts`
- Modify: `packages/server/src/db/queries/revisions.ts`
- Modify: `packages/server/src/__tests__/db/queries/revisions.test.ts`
- Modify: `packages/server/src/services/posts.ts`
- Modify: `packages/server/src/__tests__/services/posts.test.ts`
- Modify: `packages/server/src/routes/posts.ts` (list endpoint only)
- Modify: `packages/server/src/__tests__/routes/posts.test.ts` (list endpoint tests)

- [ ] **Step 1: Add author fields to PostRevision interface**

In `packages/shared/src/types/post.ts`, add `authorId`, `authorDisplayName`, and `authorAvatarUrl` to the `PostRevision` interface:

```typescript
export interface PostRevision {
  id: string;
  postId: string;
  authorId: string;
  authorDisplayName: string | null;
  authorAvatarUrl: string | null;
  content: string;
  message: string | null;
  revisionNumber: number;
  createdAt: Date;
}
```

- [ ] **Step 2: Add PostRevisionWithAuthorRow to DB types**

In `packages/server/src/db/queries/types.ts`, add a joined row type following the existing `CommentWithAuthorRow` pattern (line 100-104):

```typescript
export type PostRevisionWithAuthorRow = PostRevisionRow & {
  author_display_name: string | null;
  author_avatar_url: string | null;
};
```

- [ ] **Step 3: Add joined query to revisions.ts**

In `packages/server/src/db/queries/revisions.ts`, add `findRevisionsWithAuthorByPostId`:

```typescript
import type { PostRevisionWithAuthorRow } from './types.js';

export async function findRevisionsWithAuthorByPostId(
  postId: string,
): Promise<PostRevisionWithAuthorRow[]> {
  const result = await query(
    `SELECT pr.*, u.display_name AS author_display_name, u.avatar_url AS author_avatar_url
     FROM post_revisions pr
     LEFT JOIN users u ON pr.author_id = u.id
     WHERE pr.post_id = $1
     ORDER BY pr.revision_number DESC`,
    [postId],
  );
  return result.rows as PostRevisionWithAuthorRow[];
}
```

- [ ] **Step 4: Write test for the joined query**

In `packages/server/src/__tests__/db/queries/revisions.test.ts`, add a test for `findRevisionsWithAuthorByPostId` following the existing test patterns in that file (mocked `query` function):

```typescript
describe('findRevisionsWithAuthorByPostId', () => {
  it('returns revisions with author display name and avatar', async () => {
    const row = {
      ...sampleRow,
      author_display_name: 'Test User',
      author_avatar_url: 'https://example.com/avatar.png',
    };
    mockQuery.mockResolvedValueOnce({ rows: [row], rowCount: 1 });

    const result = await findRevisionsWithAuthorByPostId('post-1');

    expect(result).toHaveLength(1);
    expect(result[0].author_display_name).toBe('Test User');
    expect(result[0].author_avatar_url).toBe('https://example.com/avatar.png');
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('LEFT JOIN users'), ['post-1']);
  });
});
```

- [ ] **Step 5: Update `toRevision` mapping in services/posts.ts**

Update `toRevision` to accept the wider row type and map author fields:

```typescript
export function toRevision(
  row: PostRevisionRow & { author_display_name?: string | null; author_avatar_url?: string | null },
): PostRevision {
  return {
    id: row.id,
    postId: row.post_id,
    authorId: row.author_id ?? '',
    authorDisplayName: row.author_display_name ?? null,
    authorAvatarUrl: row.author_avatar_url ?? null,
    content: row.content,
    message: row.message,
    revisionNumber: row.revision_number,
    createdAt: row.created_at,
  };
}
```

Also update the inline revision mapping in `toPostWithRevision` to include the new fields.

**Note:** `PostWithRevisionRow` extends `PostRow` — its `author_id` is the **post** author, not the revision author (the joined query does not select `pr.author_id` separately). Since only the post author can create revisions (ownership check enforced), `row.author_id` is practically correct here. We set `authorDisplayName`/`authorAvatarUrl` to `null` because the join doesn't include user info — the full author data is only available from the `findRevisionsWithAuthorByPostId` joined query used by the list endpoint.

```typescript
export function toPostWithRevision(row: PostWithRevisionRow): PostWithRevision {
  return {
    ...toPost(row),
    revisions: [
      {
        id: row.revision_id,
        postId: row.id,
        // row.author_id is the post author — correct here since only post authors create revisions
        authorId: row.author_id,
        authorDisplayName: null,
        authorAvatarUrl: null,
        content: row.content,
        message: row.message,
        revisionNumber: row.revision_number,
        createdAt: row.created_at,
      },
    ],
  };
}
```

- [ ] **Step 6: Update list endpoint to use joined query**

In `packages/server/src/routes/posts.ts`, import the new query and use it in the `GET /:id/revisions` handler:

```typescript
import {
  findRevisionsWithAuthorByPostId,
  // ... existing imports
} from '../db/queries/revisions.js';
```

Replace in the `GET /:id/revisions` handler:

```typescript
// OLD: const rows = await findRevisionsByPostId(id);
const rows = await findRevisionsWithAuthorByPostId(id);
return reply.send({ revisions: rows.map(toRevision) });
```

- [ ] **Step 7: Update services/posts.test.ts**

Update existing `toRevision` test assertions to include `authorId`, `authorDisplayName`, `authorAvatarUrl`. Update `toPostWithRevision` test to expect the new fields (with `null` values for display name/avatar).

- [ ] **Step 8: Update routes/posts.test.ts for list endpoint**

Update the mock data for the `GET /:id/revisions` test to include `author_display_name` and `author_avatar_url` fields in the mock query return, and assert they appear in the response.

- [ ] **Step 9: Run tests to verify**

Run: `cd packages/server && npx vitest run`
Expected: All pass.

- [ ] **Step 10: Commit**

```bash
git add packages/shared/src/types/post.ts packages/server/src/db/queries/types.ts packages/server/src/db/queries/revisions.ts packages/server/src/__tests__/db/queries/revisions.test.ts packages/server/src/services/posts.ts packages/server/src/__tests__/services/posts.test.ts packages/server/src/routes/posts.ts packages/server/src/__tests__/routes/posts.test.ts
git commit -m "feat: add author info to PostRevision type with joined query"
```

---

### Task 2: Restore API endpoint + tests

**Files:**

- Modify: `packages/server/src/routes/posts.ts` (add after line 310, before closing `}`)
- Modify: `packages/server/src/__tests__/routes/posts.test.ts`

- [ ] **Step 1: Write failing tests for restore endpoint**

Add to `packages/server/src/__tests__/routes/posts.test.ts`, inside the `describe('post routes', ...)` block:

```typescript
// ─── POST /api/posts/:id/revisions/:rev/restore ─────────────────────

describe('POST /api/posts/:id/revisions/:rev/restore', () => {
  it('restores a revision and returns 201 with new revision', async () => {
    // findPostById
    mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
    // findRevision (target revision to restore)
    mockQuery.mockResolvedValueOnce({ rows: [sampleRevisionRow], rowCount: 1 });
    // createRevisionAtomic (creates the restored revision)
    const restoredRow: PostRevisionRow = {
      ...sampleRevisionRow,
      id: '990e8400-e29b-41d4-a716-446655440099',
      revision_number: 2,
      message: 'Restored from revision 1',
    };
    mockQuery.mockResolvedValueOnce({ rows: [restoredRow], rowCount: 1 });
    // findFeedPostById for broadcast
    mockFindFeedPostById.mockResolvedValueOnce(sampleFeedRow);

    const response = await app.inject({
      method: 'POST',
      url: `/api/posts/${postId}/revisions/1/restore`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.revision.revisionNumber).toBe(2);
    expect(body.revision.message).toBe('Restored from revision 1');
    expect(body.revision.content).toBe(sampleRevisionRow.content);

    // Verify broadcast
    expect(broadcastSpy).toHaveBeenCalledWith(
      `post:${postId}`,
      expect.objectContaining({ type: 'revision:new' }),
      expect.anything(),
    );
  });

  it('returns 401 without authentication', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/posts/${postId}/revisions/1/restore`,
    });
    expect(response.statusCode).toBe(401);
  });

  it('returns 404 when post does not exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const response = await app.inject({
      method: 'POST',
      url: `/api/posts/${postId}/revisions/1/restore`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe('Post not found');
  });

  it('returns 403 when user is not the post author', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });

    const response = await app.inject({
      method: 'POST',
      url: `/api/posts/${postId}/revisions/1/restore`,
      headers: { authorization: `Bearer ${otherToken}` },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error).toBe('Forbidden');
  });

  it('returns 404 when target revision does not exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const response = await app.inject({
      method: 'POST',
      url: `/api/posts/${postId}/revisions/999/restore`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe('Revision not found');
  });

  it('returns 400 for invalid revision number', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/posts/${postId}/revisions/abc/restore`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('Invalid revision number');
  });

  it('returns 400 for negative revision number', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/posts/${postId}/revisions/-1/restore`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(400);
  });

  it('returns 400 for decimal revision number', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/posts/${postId}/revisions/1.5/restore`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(400);
  });

  it('broadcasts to feed channel when feedRow exists', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
    mockQuery.mockResolvedValueOnce({ rows: [sampleRevisionRow], rowCount: 1 });
    mockQuery.mockResolvedValueOnce({
      rows: [{ ...sampleRevisionRow, revision_number: 2, message: 'Restored from revision 1' }],
      rowCount: 1,
    });
    mockFindFeedPostById.mockResolvedValueOnce(sampleFeedRow);

    await app.inject({
      method: 'POST',
      url: `/api/posts/${postId}/revisions/1/restore`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(broadcastSpy).toHaveBeenCalledWith(
      'feed',
      expect.objectContaining({ type: 'post:updated', channel: 'feed' }),
      expect.anything(),
    );
  });

  it('skips feed broadcast when findFeedPostById returns null', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
    mockQuery.mockResolvedValueOnce({ rows: [sampleRevisionRow], rowCount: 1 });
    mockQuery.mockResolvedValueOnce({
      rows: [{ ...sampleRevisionRow, revision_number: 2, message: 'Restored from revision 1' }],
      rowCount: 1,
    });
    mockFindFeedPostById.mockResolvedValueOnce(null);

    await app.inject({
      method: 'POST',
      url: `/api/posts/${postId}/revisions/1/restore`,
      headers: { authorization: `Bearer ${token}` },
    });

    // Only post channel broadcast, no feed broadcast
    expect(broadcastSpy).toHaveBeenCalledTimes(1);
    expect(broadcastSpy).toHaveBeenCalledWith(
      `post:${postId}`,
      expect.objectContaining({ type: 'revision:new' }),
      expect.anything(),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/server && npx vitest run src/__tests__/routes/posts.test.ts`
Expected: FAIL — the restore endpoint does not exist yet.

- [ ] **Step 3: Implement the restore endpoint**

In `packages/server/src/routes/posts.ts`, add before the closing `}` of the `postRoutes` function (after the `GET /:id/revisions/:rev` handler):

```typescript
// POST /:id/revisions/:rev/restore — restore a previous revision
app.post(
  '/:id/revisions/:rev/restore',
  { preHandler: [app.authenticate] },
  async (request, reply) => {
    const { id, rev } = request.params as { id: string; rev: string };

    const revisionNumber = Number(rev);
    if (Number.isNaN(revisionNumber) || !Number.isInteger(revisionNumber) || revisionNumber < 1) {
      return reply.status(400).send({ error: 'Invalid revision number' });
    }

    const existing = await findPostById(id);
    if (!existing) {
      return reply.status(404).send({ error: 'Post not found' });
    }

    if (existing.author_id !== request.user.id) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const targetRevision = await findRevision(id, revisionNumber);
    if (!targetRevision) {
      return reply.status(404).send({ error: 'Revision not found' });
    }

    const revisionRow = await createRevisionAtomic({
      postId: id,
      authorId: request.user.id,
      content: targetRevision.content,
      message: `Restored from revision ${revisionNumber}`,
    });

    const revisionData = toRevision(revisionRow);

    const excludeWs = getExcludeWs(app, request);
    app.websocket.channels.broadcast(
      `post:${id}`,
      { type: 'revision:new', channel: `post:${id}`, data: revisionData },
      excludeWs,
    );

    const feedRow = await findFeedPostById(id);
    if (feedRow) {
      app.websocket.channels.broadcast(
        'feed',
        { type: 'post:updated', channel: 'feed', data: toPostWithAuthor(feedRow) },
        excludeWs,
      );
    }

    return reply.status(201).send({ revision: revisionData });
  },
);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/server && npx vitest run src/__tests__/routes/posts.test.ts`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/routes/posts.ts packages/server/src/__tests__/routes/posts.test.ts
git commit -m "feat: add POST /api/posts/:id/revisions/:rev/restore endpoint"
```

---

### Task 3: Client composable — restoreRevision + fix fetchRevisions

**Files:**

- Modify: `packages/client/src/composables/usePosts.ts`
- Modify: `packages/client/src/__tests__/composables/usePosts.test.ts`

- [ ] **Step 1: Write failing tests**

In `packages/client/src/__tests__/composables/usePosts.test.ts`:

**IMPORTANT: DELETE the entire existing `describe('fetchRevisions', ...)` block** (approximately lines 562-614). It mocks a raw array response, but the server returns `{ revisions: [...] }`. The existing tests will break after we fix `fetchRevisions` to properly extract `.revisions`. Replace it with the corrected version below.

Add these two new describe blocks:

```typescript
describe('fetchRevisions', () => {
  it('should GET /api/posts/:id/revisions and return the revisions array', async () => {
    const mockRevisions = [
      createMockRevision(),
      createMockRevision({ id: 'rev-3', revisionNumber: 3 }),
    ];
    mockApiFetch.mockResolvedValue(
      new Response(JSON.stringify({ revisions: jsonRoundTrip(mockRevisions) }), { status: 200 }),
    );

    const { fetchRevisions } = usePosts();
    const result = await fetchRevisions('post-1');

    expect(result).toEqual(jsonRoundTrip(mockRevisions));
    expect(mockApiFetch).toHaveBeenCalledWith('/api/posts/post-1/revisions');
  });

  it('should return empty array on non-ok response', async () => {
    mockApiFetch.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Not found' }), { status: 404 }),
    );

    const { fetchRevisions, error } = usePosts();
    const result = await fetchRevisions('post-1');

    expect(result).toEqual([]);
    expect(error.value).toBe('Not found');
  });

  it('should return empty array on network failure', async () => {
    mockApiFetch.mockRejectedValue(new Error('Network error'));

    const { fetchRevisions, error } = usePosts();
    const result = await fetchRevisions('post-1');

    expect(result).toEqual([]);
    expect(error.value).toBe('Network error');
  });
});

describe('restoreRevision', () => {
  it('should POST to /api/posts/:id/revisions/:rev/restore and return the new revision', async () => {
    const mockRevision = createMockRevision({
      message: 'Restored from revision 1',
      revisionNumber: 3,
    });
    mockApiFetch.mockResolvedValue(
      new Response(JSON.stringify({ revision: jsonRoundTrip(mockRevision) }), { status: 201 }),
    );

    const { restoreRevision } = usePosts();
    const result = await restoreRevision('post-1', 1);

    expect(result).toEqual(jsonRoundTrip(mockRevision));
    expect(mockApiFetch).toHaveBeenCalledWith('/api/posts/post-1/revisions/1/restore', {
      method: 'POST',
    });
  });

  it('should set error on non-ok response', async () => {
    mockApiFetch.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }),
    );

    const { restoreRevision, error } = usePosts();
    const result = await restoreRevision('post-1', 1);

    expect(result).toBeNull();
    expect(error.value).toBe('Forbidden');
  });

  it('should set error on network failure', async () => {
    mockApiFetch.mockRejectedValue(new Error('Network error'));

    const { restoreRevision, error } = usePosts();
    const result = await restoreRevision('post-1', 1);

    expect(result).toBeNull();
    expect(error.value).toBe('Network error');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/client && npx vitest run src/__tests__/composables/usePosts.test.ts`
Expected: FAIL — `restoreRevision` does not exist, `fetchRevisions` may need fixing.

- [ ] **Step 3: Fix fetchRevisions and add restoreRevision**

In `packages/client/src/composables/usePosts.ts`, fix `fetchRevisions` to properly extract the revisions array from the response:

```typescript
async function fetchRevisions(postId: string): Promise<PostRevision[]> {
  error.value = null;
  try {
    const response = await apiFetch(`/api/posts/${postId}/revisions`);

    if (!response.ok) {
      error.value = await parseErrorMessage(response, 'Failed to fetch revisions');
      return [];
    }

    const data = (await response.json()) as { revisions: PostRevision[] };
    return data.revisions;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to fetch revisions';
    return [];
  }
}
```

Add the `restoreRevision` function:

```typescript
async function restoreRevision(
  postId: string,
  revisionNumber: number,
): Promise<PostRevision | null> {
  error.value = null;
  try {
    const response = await apiFetch(`/api/posts/${postId}/revisions/${revisionNumber}/restore`, {
      method: 'POST',
    });

    if (!response.ok) {
      error.value = await parseErrorMessage(response, 'Failed to restore revision');
      return null;
    }

    const data = (await response.json()) as { revision: PostRevision };
    return data.revision;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to restore revision';
    return null;
  }
}
```

Add `restoreRevision` to the return object:

```typescript
return {
  currentPost,
  isDirty,
  saveStatus,
  lastSavedAt,
  error,
  createPost,
  fetchPost,
  updatePost,
  deletePost,
  publishPost,
  saveRevision,
  fetchRevisions,
  restoreRevision,
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/client && npx vitest run src/__tests__/composables/usePosts.test.ts`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/composables/usePosts.ts packages/client/src/__tests__/composables/usePosts.test.ts
git commit -m "feat: add restoreRevision composable + fix fetchRevisions response parsing"
```

---

### Task 4: Install diff package + RevisionTimeline component

**Files:**

- Install: `diff` + `@types/diff` in `packages/client`
- Create: `packages/client/src/components/history/RevisionTimeline.vue`
- Create: `packages/client/src/__tests__/components/history/RevisionTimeline.test.ts`

- [ ] **Step 1: Install the diff package**

```bash
cd packages/client && npm install diff && npm install -D @types/diff
```

- [ ] **Step 2: Write failing tests for RevisionTimeline**

Create `packages/client/src/__tests__/components/history/RevisionTimeline.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import RevisionTimeline from '@/components/history/RevisionTimeline.vue';
import type { PostRevision } from '@forge/shared';

function makeRevision(overrides: Partial<PostRevision> = {}): PostRevision {
  return {
    id: 'rev-1',
    postId: 'post-1',
    authorId: 'user-1',
    authorDisplayName: 'Test User',
    authorAvatarUrl: null,
    content: 'console.log("hello")',
    message: 'Initial version',
    revisionNumber: 1,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('RevisionTimeline', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('renders a list item for each revision', () => {
    const revisions = [
      makeRevision({ id: 'rev-2', revisionNumber: 2, message: 'Update' }),
      makeRevision({ id: 'rev-1', revisionNumber: 1, message: 'Initial' }),
    ];

    const wrapper = mount(RevisionTimeline, {
      props: { revisions, selectedIds: [] },
    });

    const items = wrapper.findAll('[data-testid="revision-item"]');
    expect(items).toHaveLength(2);
  });

  it('displays revision number and message', () => {
    const wrapper = mount(RevisionTimeline, {
      props: {
        revisions: [makeRevision({ revisionNumber: 3, message: 'Fix bug' })],
        selectedIds: [],
      },
    });

    expect(wrapper.text()).toContain('Rev 3');
    expect(wrapper.text()).toContain('Fix bug');
  });

  it('shows "Current" badge on the first (latest) revision', () => {
    const revisions = [
      makeRevision({ id: 'rev-2', revisionNumber: 2 }),
      makeRevision({ id: 'rev-1', revisionNumber: 1 }),
    ];

    const wrapper = mount(RevisionTimeline, {
      props: { revisions, selectedIds: [] },
    });

    const firstItem = wrapper.find('[data-testid="revision-item"]');
    expect(firstItem.text()).toContain('Current');
  });

  it('emits "select" with revision id when clicked', async () => {
    const rev = makeRevision({ id: 'rev-1' });
    const wrapper = mount(RevisionTimeline, {
      props: { revisions: [rev], selectedIds: [] },
    });

    await wrapper.find('[data-testid="revision-item"]').trigger('click');

    expect(wrapper.emitted('select')).toBeTruthy();
    expect(wrapper.emitted('select')![0]).toEqual(['rev-1']);
  });

  it('highlights selected revisions', () => {
    const revisions = [
      makeRevision({ id: 'rev-2', revisionNumber: 2 }),
      makeRevision({ id: 'rev-1', revisionNumber: 1 }),
    ];

    const wrapper = mount(RevisionTimeline, {
      props: { revisions, selectedIds: ['rev-1'] },
    });

    const items = wrapper.findAll('[data-testid="revision-item"]');
    expect(items[1].classes()).toContain('ring-2');
  });

  it('displays relative time for createdAt', () => {
    const wrapper = mount(RevisionTimeline, {
      props: {
        revisions: [makeRevision({ createdAt: new Date() })],
        selectedIds: [],
      },
    });

    // Should show some relative time text (e.g., "just now", "a few seconds ago")
    // The exact text depends on the formatting helper, but it should NOT be the raw ISO string
    const item = wrapper.find('[data-testid="revision-item"]');
    expect(item.text()).not.toContain('T00:00:00');
  });

  it('shows "Restored from revision N" message style for restored revisions', () => {
    const wrapper = mount(RevisionTimeline, {
      props: {
        revisions: [makeRevision({ message: 'Restored from revision 2' })],
        selectedIds: [],
      },
    });

    expect(wrapper.text()).toContain('Restored from revision 2');
  });

  it('displays author display name', () => {
    const wrapper = mount(RevisionTimeline, {
      props: {
        revisions: [makeRevision({ authorDisplayName: 'Alice' })],
        selectedIds: [],
      },
    });

    expect(wrapper.text()).toContain('Alice');
  });

  it('shows initials avatar when no avatar URL', () => {
    const wrapper = mount(RevisionTimeline, {
      props: {
        revisions: [makeRevision({ authorDisplayName: 'Alice Bob', authorAvatarUrl: null })],
        selectedIds: [],
      },
    });

    expect(wrapper.find('[data-testid="author-avatar"]').text()).toBe('AB');
  });

  it('shows image avatar when avatar URL provided', () => {
    const wrapper = mount(RevisionTimeline, {
      props: {
        revisions: [makeRevision({ authorAvatarUrl: 'https://example.com/a.png' })],
        selectedIds: [],
      },
    });

    const img = wrapper.find('[data-testid="author-avatar"] img');
    expect(img.exists()).toBe(true);
    expect(img.attributes('src')).toBe('https://example.com/a.png');
  });

  it('renders empty state when no revisions provided', () => {
    const wrapper = mount(RevisionTimeline, {
      props: { revisions: [], selectedIds: [] },
    });

    expect(wrapper.text()).toContain('No revisions');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd packages/client && npx vitest run src/__tests__/components/history/RevisionTimeline.test.ts`
Expected: FAIL — component does not exist.

- [ ] **Step 4: Implement RevisionTimeline component**

Create `packages/client/src/components/history/RevisionTimeline.vue`:

```vue
<template>
  <div class="flex flex-col gap-1">
    <p v-if="revisions.length === 0" class="py-4 text-center text-sm text-gray-500">
      No revisions found.
    </p>
    <button
      v-for="(rev, index) in revisions"
      :key="rev.id"
      data-testid="revision-item"
      class="flex items-start gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors"
      :class="[
        selectedIds.includes(rev.id)
          ? 'ring-2 ring-primary border-primary bg-primary/10'
          : 'border-gray-700 hover:border-gray-500',
      ]"
      @click="$emit('select', rev.id)"
    >
      <!-- Author avatar -->
      <div
        data-testid="author-avatar"
        class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gray-600 text-xs text-gray-200"
      >
        <img
          v-if="rev.authorAvatarUrl"
          :src="rev.authorAvatarUrl"
          :alt="rev.authorDisplayName ?? 'Author'"
          class="h-full w-full rounded-full object-cover"
        />
        <template v-else>{{ getInitials(rev.authorDisplayName) }}</template>
      </div>

      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <span class="font-mono font-medium text-gray-200">Rev {{ rev.revisionNumber }}</span>
          <span
            v-if="index === 0"
            class="rounded bg-green-800 px-1.5 py-0.5 text-xs text-green-200"
          >
            Current
          </span>
          <span
            v-if="rev.message?.startsWith('Restored from revision')"
            class="rounded bg-yellow-800 px-1.5 py-0.5 text-xs text-yellow-200"
          >
            Restored
          </span>
        </div>
        <p class="mt-0.5 text-xs text-gray-400">
          {{ rev.authorDisplayName ?? 'Unknown' }}
        </p>
        <p v-if="rev.message" class="mt-0.5 truncate text-gray-400">
          {{ rev.message }}
        </p>
        <p class="mt-0.5 text-xs text-gray-500">
          {{ formatRelativeTime(rev.createdAt) }}
        </p>
      </div>
    </button>
  </div>
</template>

<script setup lang="ts">
import type { PostRevision } from '@forge/shared';

defineProps<{
  revisions: PostRevision[];
  selectedIds: string[];
}>();

defineEmits<{
  select: [revisionId: string];
}>();

function getInitials(name: string | null): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function formatRelativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 30) return `${diffDay}d ago`;
  return d.toLocaleDateString();
}
</script>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/client && npx vitest run src/__tests__/components/history/RevisionTimeline.test.ts`
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add packages/client/package.json packages/client/package-lock.json packages/client/src/components/history/RevisionTimeline.vue packages/client/src/__tests__/components/history/RevisionTimeline.test.ts
git commit -m "feat: add RevisionTimeline component with selection support"
```

---

### Task 5: RevisionDiffViewer component

**Files:**

- Create: `packages/client/src/components/history/RevisionDiffViewer.vue`
- Create: `packages/client/src/__tests__/components/history/RevisionDiffViewer.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/client/src/__tests__/components/history/RevisionDiffViewer.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import RevisionDiffViewer from '@/components/history/RevisionDiffViewer.vue';

describe('RevisionDiffViewer', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('renders diff between two content strings', () => {
    const wrapper = mount(RevisionDiffViewer, {
      props: {
        leftContent: 'line one\nline two',
        rightContent: 'line one\nline three',
        leftLabel: 'Rev 1',
        rightLabel: 'Rev 2',
      },
    });

    expect(wrapper.find('[data-testid="diff-viewer"]').exists()).toBe(true);
  });

  it('shows additions in green with + prefix', () => {
    const wrapper = mount(RevisionDiffViewer, {
      props: {
        leftContent: 'hello',
        rightContent: 'hello\nworld',
        leftLabel: 'Rev 1',
        rightLabel: 'Rev 2',
      },
    });

    const added = wrapper.findAll('[data-testid="diff-added"]');
    expect(added.length).toBeGreaterThan(0);
    expect(added[0].text()).toContain('+');
    expect(added[0].classes()).toContain('bg-green-900/40');
  });

  it('shows deletions in red with - prefix', () => {
    const wrapper = mount(RevisionDiffViewer, {
      props: {
        leftContent: 'hello\nworld',
        rightContent: 'hello',
        leftLabel: 'Rev 1',
        rightLabel: 'Rev 2',
      },
    });

    const removed = wrapper.findAll('[data-testid="diff-removed"]');
    expect(removed.length).toBeGreaterThan(0);
    expect(removed[0].text()).toContain('-');
    expect(removed[0].classes()).toContain('bg-red-900/40');
  });

  it('shows unchanged lines without prefix markers', () => {
    const wrapper = mount(RevisionDiffViewer, {
      props: {
        leftContent: 'same\ndifferent',
        rightContent: 'same\nchanged',
        leftLabel: 'Rev 1',
        rightLabel: 'Rev 2',
      },
    });

    const unchanged = wrapper.findAll('[data-testid="diff-unchanged"]');
    expect(unchanged.length).toBeGreaterThan(0);
  });

  it('defaults to inline mode', () => {
    const wrapper = mount(RevisionDiffViewer, {
      props: {
        leftContent: 'a',
        rightContent: 'b',
        leftLabel: 'Rev 1',
        rightLabel: 'Rev 2',
      },
    });

    expect(wrapper.find('[data-testid="mode-inline"]').classes()).toContain('bg-gray-600');
  });

  it('toggles to side-by-side mode', async () => {
    const wrapper = mount(RevisionDiffViewer, {
      props: {
        leftContent: 'a',
        rightContent: 'b',
        leftLabel: 'Rev 1',
        rightLabel: 'Rev 2',
      },
    });

    await wrapper.find('[data-testid="mode-side-by-side"]').trigger('click');

    expect(wrapper.find('[data-testid="mode-side-by-side"]').classes()).toContain('bg-gray-600');
    expect(wrapper.find('[data-testid="diff-side-by-side"]').exists()).toBe(true);
  });

  it('renders side-by-side view with two columns', async () => {
    const wrapper = mount(RevisionDiffViewer, {
      props: {
        leftContent: 'hello',
        rightContent: 'world',
        leftLabel: 'Rev 1',
        rightLabel: 'Rev 2',
      },
    });

    await wrapper.find('[data-testid="mode-side-by-side"]').trigger('click');

    expect(wrapper.find('[data-testid="side-left"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="side-right"]').exists()).toBe(true);
  });

  it('shows column headers with labels in side-by-side mode', async () => {
    const wrapper = mount(RevisionDiffViewer, {
      props: {
        leftContent: 'a',
        rightContent: 'b',
        leftLabel: 'Rev 1',
        rightLabel: 'Rev 2',
      },
    });

    await wrapper.find('[data-testid="mode-side-by-side"]').trigger('click');

    expect(wrapper.text()).toContain('Rev 1');
    expect(wrapper.text()).toContain('Rev 2');
  });

  it('shows "No differences" when contents are identical', () => {
    const wrapper = mount(RevisionDiffViewer, {
      props: {
        leftContent: 'same content',
        rightContent: 'same content',
        leftLabel: 'Rev 1',
        rightLabel: 'Rev 2',
      },
    });

    expect(wrapper.text()).toContain('No differences');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/client && npx vitest run src/__tests__/components/history/RevisionDiffViewer.test.ts`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Implement RevisionDiffViewer component**

Create `packages/client/src/components/history/RevisionDiffViewer.vue`:

```vue
<template>
  <div data-testid="diff-viewer" class="overflow-hidden rounded-md border border-gray-700">
    <!-- Mode toggle -->
    <div class="flex items-center gap-1 border-b border-gray-700 bg-gray-800 px-3 py-2">
      <button
        data-testid="mode-inline"
        class="rounded px-2 py-1 text-xs text-gray-300"
        :class="mode === 'inline' ? 'bg-gray-600' : 'hover:bg-gray-700'"
        @click="mode = 'inline'"
      >
        Inline
      </button>
      <button
        data-testid="mode-side-by-side"
        class="rounded px-2 py-1 text-xs text-gray-300"
        :class="mode === 'side-by-side' ? 'bg-gray-600' : 'hover:bg-gray-700'"
        @click="mode = 'side-by-side'"
      >
        Side by side
      </button>
    </div>

    <!-- No differences -->
    <div v-if="isIdentical" class="px-4 py-8 text-center text-sm text-gray-500">
      No differences between these revisions.
    </div>

    <!-- Inline mode -->
    <div v-else-if="mode === 'inline'" class="overflow-x-auto font-mono text-sm">
      <div
        v-for="(part, i) in diffParts"
        :key="i"
        :data-testid="part.added ? 'diff-added' : part.removed ? 'diff-removed' : 'diff-unchanged'"
        class="whitespace-pre px-3 py-0.5"
        :class="[
          part.added ? 'bg-green-900/40 text-green-300' : '',
          part.removed ? 'bg-red-900/40 text-red-300' : '',
          !part.added && !part.removed ? 'text-gray-400' : '',
        ]"
      >
        {{ part.added ? '+' : part.removed ? '-' : ' ' }} {{ part.value }}
      </div>
    </div>

    <!-- Side-by-side mode -->
    <div v-else data-testid="diff-side-by-side" class="grid grid-cols-2">
      <div data-testid="side-left" class="border-r border-gray-700">
        <div class="border-b border-gray-700 bg-gray-800 px-3 py-1 text-xs text-gray-400">
          {{ leftLabel }}
        </div>
        <div class="overflow-x-auto font-mono text-sm">
          <div
            v-for="(line, i) in sideBySideLeft"
            :key="'l-' + i"
            :data-testid="line.type === 'removed' ? 'diff-removed' : 'diff-unchanged'"
            class="whitespace-pre px-3 py-0.5"
            :class="[line.type === 'removed' ? 'bg-red-900/40 text-red-300' : 'text-gray-400']"
          >
            {{ line.type === 'removed' ? '-' : ' ' }} {{ line.value }}
          </div>
        </div>
      </div>
      <div data-testid="side-right">
        <div class="border-b border-gray-700 bg-gray-800 px-3 py-1 text-xs text-gray-400">
          {{ rightLabel }}
        </div>
        <div class="overflow-x-auto font-mono text-sm">
          <div
            v-for="(line, i) in sideBySideRight"
            :key="'r-' + i"
            :data-testid="line.type === 'added' ? 'diff-added' : 'diff-unchanged'"
            class="whitespace-pre px-3 py-0.5"
            :class="[line.type === 'added' ? 'bg-green-900/40 text-green-300' : 'text-gray-400']"
          >
            {{ line.type === 'added' ? '+' : ' ' }} {{ line.value }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { diffLines } from 'diff';

const props = defineProps<{
  leftContent: string;
  rightContent: string;
  leftLabel: string;
  rightLabel: string;
}>();

const mode = ref<'inline' | 'side-by-side'>('inline');

interface DiffPart {
  value: string;
  added: boolean;
  removed: boolean;
}

const diffParts = computed<DiffPart[]>(() => {
  const changes = diffLines(props.leftContent, props.rightContent);
  const parts: DiffPart[] = [];

  for (const change of changes) {
    // Split multi-line changes into individual lines for display
    const lines = change.value.replace(/\n$/, '').split('\n');
    for (const line of lines) {
      parts.push({
        value: line,
        added: change.added ?? false,
        removed: change.removed ?? false,
      });
    }
  }

  return parts;
});

const isIdentical = computed(() => props.leftContent === props.rightContent);

interface SideLine {
  value: string;
  type: 'added' | 'removed' | 'unchanged';
}

const sideBySideLeft = computed<SideLine[]>(() => {
  return diffParts.value
    .filter((p) => !p.added)
    .map((p) => ({
      value: p.value,
      type: p.removed ? ('removed' as const) : ('unchanged' as const),
    }));
});

const sideBySideRight = computed<SideLine[]>(() => {
  return diffParts.value
    .filter((p) => !p.removed)
    .map((p) => ({
      value: p.value,
      type: p.added ? ('added' as const) : ('unchanged' as const),
    }));
});
</script>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/client && npx vitest run src/__tests__/components/history/RevisionDiffViewer.test.ts`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/history/RevisionDiffViewer.vue packages/client/src/__tests__/components/history/RevisionDiffViewer.test.ts
git commit -m "feat: add RevisionDiffViewer component with inline and side-by-side modes"
```

---

### Task 6: RestoreButton component

**Files:**

- Create: `packages/client/src/components/history/RestoreButton.vue`
- Create: `packages/client/src/__tests__/components/history/RestoreButton.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/client/src/__tests__/components/history/RestoreButton.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import RestoreButton from '@/components/history/RestoreButton.vue';

describe('RestoreButton', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('renders a restore button with the revision number', () => {
    const wrapper = mount(RestoreButton, {
      props: { revisionNumber: 3, loading: false },
    });

    expect(wrapper.find('button').text()).toContain('Restore');
  });

  it('shows confirmation dialog when clicked', async () => {
    const wrapper = mount(RestoreButton, {
      props: { revisionNumber: 3, loading: false },
    });

    await wrapper.find('[data-testid="restore-trigger"]').trigger('click');

    expect(wrapper.find('[data-testid="restore-dialog"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Restore to revision 3');
  });

  it('emits "restore" when confirmed', async () => {
    const wrapper = mount(RestoreButton, {
      props: { revisionNumber: 3, loading: false },
    });

    await wrapper.find('[data-testid="restore-trigger"]').trigger('click');
    await wrapper.find('[data-testid="restore-confirm"]').trigger('click');

    expect(wrapper.emitted('restore')).toBeTruthy();
    expect(wrapper.emitted('restore')![0]).toEqual([3]);
  });

  it('closes dialog when cancelled', async () => {
    const wrapper = mount(RestoreButton, {
      props: { revisionNumber: 3, loading: false },
    });

    await wrapper.find('[data-testid="restore-trigger"]').trigger('click');
    await wrapper.find('[data-testid="restore-cancel"]').trigger('click');

    expect(wrapper.find('[data-testid="restore-dialog"]').exists()).toBe(false);
    expect(wrapper.emitted('restore')).toBeFalsy();
  });

  it('disables button when loading is true', () => {
    const wrapper = mount(RestoreButton, {
      props: { revisionNumber: 3, loading: true },
    });

    expect(wrapper.find('[data-testid="restore-trigger"]').attributes('disabled')).toBeDefined();
  });

  it('shows loading text when loading', () => {
    const wrapper = mount(RestoreButton, {
      props: { revisionNumber: 3, loading: true },
    });

    expect(wrapper.text()).toContain('Restoring');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/client && npx vitest run src/__tests__/components/history/RestoreButton.test.ts`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Implement RestoreButton component**

Create `packages/client/src/components/history/RestoreButton.vue`:

```vue
<template>
  <div>
    <button
      data-testid="restore-trigger"
      class="rounded bg-yellow-700 px-3 py-1.5 text-sm text-yellow-100 transition-colors hover:bg-yellow-600 disabled:opacity-50"
      :disabled="loading"
      @click="showDialog = true"
    >
      {{ loading ? 'Restoring...' : 'Restore' }}
    </button>

    <!-- Confirmation dialog -->
    <div
      v-if="showDialog"
      data-testid="restore-dialog"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    >
      <div class="mx-4 w-full max-w-sm rounded-lg border border-gray-700 bg-gray-800 p-6 shadow-xl">
        <h3 class="text-lg font-medium text-gray-100">Restore revision</h3>
        <p class="mt-2 text-sm text-gray-400">
          Restore to revision {{ revisionNumber }}? This will create a new revision with that
          content. No history will be lost.
        </p>
        <div class="mt-4 flex justify-end gap-2">
          <button
            data-testid="restore-cancel"
            class="rounded border border-gray-600 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700"
            @click="showDialog = false"
          >
            Cancel
          </button>
          <button
            data-testid="restore-confirm"
            class="rounded bg-yellow-700 px-3 py-1.5 text-sm text-yellow-100 hover:bg-yellow-600"
            @click="handleConfirm"
          >
            Restore
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{
  revisionNumber: number;
  loading: boolean;
}>();

const emit = defineEmits<{
  restore: [revisionNumber: number];
}>();

const showDialog = ref(false);

function handleConfirm(): void {
  showDialog.value = false;
  emit('restore', props.revisionNumber);
}
</script>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/client && npx vitest run src/__tests__/components/history/RestoreButton.test.ts`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/history/RestoreButton.vue packages/client/src/__tests__/components/history/RestoreButton.test.ts
git commit -m "feat: add RestoreButton component with confirmation dialog"
```

---

### Task 7: PostHistoryPage assembly + page test

**Files:**

- Modify: `packages/client/src/pages/PostHistoryPage.vue`
- Create: `packages/client/src/__tests__/pages/PostHistoryPage.test.ts`

**Pre-check:** Verify route already exists:

```bash
grep -n 'post-history' packages/client/src/plugins/router.ts
```

Expected: The route `{ path: 'posts/:id/history', name: 'post-history', ... }` at approximately line 52-55. If missing, add it — but it should already be registered.

- [ ] **Step 1: Write failing tests**

Create `packages/client/src/__tests__/pages/PostHistoryPage.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import PostHistoryPage from '@/pages/PostHistoryPage.vue';
import type { PostRevision } from '@forge/shared';

const mockFetchRevisions = vi.fn();
const mockRestoreRevision = vi.fn();
const mockFetchPost = vi.fn();

vi.mock('@/composables/usePosts', () => ({
  usePosts: () => ({
    fetchRevisions: mockFetchRevisions,
    restoreRevision: mockRestoreRevision,
    fetchPost: mockFetchPost,
    currentPost: { value: null },
    error: { value: null },
  }),
}));

const mockRoute = { params: { id: 'post-1' } };
vi.mock('vue-router', () => ({
  useRoute: () => mockRoute,
  useRouter: () => ({ push: vi.fn() }),
}));

function makeRevision(overrides: Partial<PostRevision> = {}): PostRevision {
  return {
    id: 'rev-1',
    postId: 'post-1',
    authorId: 'user-1',
    authorDisplayName: 'Test User',
    authorAvatarUrl: null,
    content: 'console.log("hello")',
    message: 'Initial version',
    revisionNumber: 1,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('PostHistoryPage', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('fetches revisions on mount', async () => {
    mockFetchRevisions.mockResolvedValue([makeRevision()]);

    mount(PostHistoryPage);

    expect(mockFetchRevisions).toHaveBeenCalledWith('post-1');
  });

  it('renders RevisionTimeline with fetched revisions', async () => {
    const revisions = [
      makeRevision({ id: 'rev-2', revisionNumber: 2, message: 'Update' }),
      makeRevision({ id: 'rev-1', revisionNumber: 1, message: 'Initial' }),
    ];
    mockFetchRevisions.mockResolvedValue(revisions);

    const wrapper = mount(PostHistoryPage);
    await flushPromises();

    expect(wrapper.findAll('[data-testid="revision-item"]')).toHaveLength(2);
  });

  it('shows diff viewer when two revisions are selected', async () => {
    const revisions = [
      makeRevision({ id: 'rev-2', revisionNumber: 2, content: 'updated' }),
      makeRevision({ id: 'rev-1', revisionNumber: 1, content: 'original' }),
    ];
    mockFetchRevisions.mockResolvedValue(revisions);

    const wrapper = mount(PostHistoryPage);
    await flushPromises();

    // Click first revision
    const items = wrapper.findAll('[data-testid="revision-item"]');
    await items[0].trigger('click');
    await items[1].trigger('click');

    expect(wrapper.find('[data-testid="diff-viewer"]').exists()).toBe(true);
  });

  it('shows loading state while fetching', () => {
    mockFetchRevisions.mockReturnValue(new Promise(() => {})); // never resolves

    const wrapper = mount(PostHistoryPage);

    expect(wrapper.text()).toContain('Loading');
  });

  it('replaces oldest selection when third revision is clicked', async () => {
    const revisions = [
      makeRevision({ id: 'rev-3', revisionNumber: 3, content: 'v3' }),
      makeRevision({ id: 'rev-2', revisionNumber: 2, content: 'v2' }),
      makeRevision({ id: 'rev-1', revisionNumber: 1, content: 'v1' }),
    ];
    mockFetchRevisions.mockResolvedValue(revisions);

    const wrapper = mount(PostHistoryPage);
    await flushPromises();

    const items = wrapper.findAll('[data-testid="revision-item"]');
    // Select first two
    await items[0].trigger('click');
    await items[1].trigger('click');
    // Click third — should replace the first selection
    await items[2].trigger('click');

    // Diff viewer should still be visible (two revisions selected)
    expect(wrapper.find('[data-testid="diff-viewer"]').exists()).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/client && npx vitest run src/__tests__/pages/PostHistoryPage.test.ts`
Expected: FAIL — page is still placeholder.

- [ ] **Step 3: Implement PostHistoryPage**

Replace `packages/client/src/pages/PostHistoryPage.vue` with:

```vue
<template>
  <div class="mx-auto max-w-5xl px-4 py-6">
    <!-- Header -->
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-xl font-semibold text-gray-100">Revision History</h1>
        <p v-if="currentPost" class="mt-1 text-sm text-gray-400">
          {{ currentPost.title }}
        </p>
      </div>
      <router-link
        :to="{ name: 'post-view', params: { id: postId } }"
        class="text-sm text-gray-400 hover:text-gray-200"
      >
        Back to post
      </router-link>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center py-12">
      <p class="text-sm text-gray-400">Loading revisions...</p>
    </div>

    <!-- Content -->
    <div v-else class="grid grid-cols-[280px_1fr] gap-6">
      <!-- Left: Timeline + Restore -->
      <div class="flex flex-col gap-4">
        <p class="text-xs text-gray-500">
          Select two revisions to compare. Click once to select, click again to deselect.
        </p>
        <RevisionTimeline
          :revisions="revisions"
          :selected-ids="selectedIds"
          @select="handleSelect"
        />
        <RestoreButton
          v-if="selectedIds.length === 1 && !isLatestSelected"
          :revision-number="selectedRevisionNumber"
          :loading="restoring"
          @restore="handleRestore"
        />
      </div>

      <!-- Right: Diff viewer -->
      <div>
        <div
          v-if="selectedIds.length < 2"
          class="flex items-center justify-center rounded-md border border-gray-700 py-12"
        >
          <p class="text-sm text-gray-500">
            {{
              selectedIds.length === 0
                ? 'Select two revisions to compare'
                : 'Select one more revision to compare'
            }}
          </p>
        </div>
        <RevisionDiffViewer
          v-else
          :left-content="leftRevision!.content"
          :right-content="rightRevision!.content"
          :left-label="'Rev ' + leftRevision!.revisionNumber"
          :right-label="'Rev ' + rightRevision!.revisionNumber"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { usePosts } from '@/composables/usePosts';
import RevisionTimeline from '@/components/history/RevisionTimeline.vue';
import RevisionDiffViewer from '@/components/history/RevisionDiffViewer.vue';
import RestoreButton from '@/components/history/RestoreButton.vue';
import type { PostRevision } from '@forge/shared';

const route = useRoute();
const postId = route.params.id as string;
const { fetchRevisions, restoreRevision, fetchPost, currentPost, error } = usePosts();

const revisions = ref<PostRevision[]>([]);
const selectedIds = ref<string[]>([]);
const loading = ref(true);
const restoring = ref(false);

const isLatestSelected = computed(() => {
  if (revisions.value.length === 0 || selectedIds.value.length !== 1) return false;
  return selectedIds.value[0] === revisions.value[0].id;
});

const selectedRevisionNumber = computed(() => {
  if (selectedIds.value.length !== 1) return 0;
  const rev = revisions.value.find((r) => r.id === selectedIds.value[0]);
  return rev?.revisionNumber ?? 0;
});

const leftRevision = computed(() => {
  if (selectedIds.value.length !== 2) return null;
  const revs = selectedIds.value
    .map((id) => revisions.value.find((r) => r.id === id))
    .filter((r): r is PostRevision => r !== undefined)
    .sort((a, b) => a.revisionNumber - b.revisionNumber);
  return revs[0] ?? null;
});

const rightRevision = computed(() => {
  if (selectedIds.value.length !== 2) return null;
  const revs = selectedIds.value
    .map((id) => revisions.value.find((r) => r.id === id))
    .filter((r): r is PostRevision => r !== undefined)
    .sort((a, b) => a.revisionNumber - b.revisionNumber);
  return revs[1] ?? null;
});

function handleSelect(revisionId: string): void {
  const idx = selectedIds.value.indexOf(revisionId);
  if (idx >= 0) {
    selectedIds.value = selectedIds.value.filter((id) => id !== revisionId);
  } else if (selectedIds.value.length < 2) {
    selectedIds.value = [...selectedIds.value, revisionId];
  } else {
    // Replace the oldest selection
    selectedIds.value = [selectedIds.value[1], revisionId];
  }
}

async function handleRestore(revisionNumber: number): Promise<void> {
  restoring.value = true;
  const result = await restoreRevision(postId, revisionNumber);
  restoring.value = false;

  if (result) {
    selectedIds.value = [];
    await loadRevisions();
  }
}

async function loadRevisions(): Promise<void> {
  loading.value = true;
  revisions.value = await fetchRevisions(postId);
  loading.value = false;
}

onMounted(async () => {
  await Promise.all([loadRevisions(), fetchPost(postId)]);
});
</script>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/client && npx vitest run src/__tests__/pages/PostHistoryPage.test.ts`
Expected: All pass (some may need adjustment based on exact async timing — use `await flushPromises()` from `@vue/test-utils` if needed).

- [ ] **Step 5: Run full client test suite**

Run: `cd packages/client && npx vitest run`
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/pages/PostHistoryPage.vue packages/client/src/__tests__/pages/PostHistoryPage.test.ts
git commit -m "feat: implement PostHistoryPage with timeline, diff viewer, and restore"
```

---

### Task 8: Enable History button in PostActions

**Files:**

- Modify: `packages/client/src/components/post/PostActions.vue`
- Modify: `packages/client/src/__tests__/components/post/PostActions.test.ts`

- [ ] **Step 1: Write failing test for History button navigation**

Add to `packages/client/src/__tests__/components/post/PostActions.test.ts`:

```typescript
// Mock vue-router
const mockPush = vi.fn();
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));
```

Then add a test:

```typescript
it('navigates to post history when History button is clicked', async () => {
  const wrapper = mount(PostActions, {
    props: { post: samplePost },
  });

  const historyBtn = wrapper.find('[aria-label="History"]');
  expect(historyBtn.attributes('disabled')).toBeUndefined();

  await historyBtn.trigger('click');

  expect(mockPush).toHaveBeenCalledWith({
    name: 'post-history',
    params: { id: samplePost.id },
  });
});
```

Also update any existing test that asserts the History button is disabled — it should now be enabled.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/client && npx vitest run src/__tests__/components/post/PostActions.test.ts`
Expected: FAIL — button is still disabled.

- [ ] **Step 3: Enable the History button**

In `packages/client/src/components/post/PostActions.vue`:

Replace the disabled History button (lines 62-72):

```vue
    <!-- History (placeholder) -->
    <button disabled class="flex items-center gap-1 text-sm text-gray-500" aria-label="History">
```

With an enabled button that navigates:

```vue
    <!-- History -->
    <button
      class="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-200"
      aria-label="History"
      @click="goToHistory"
    >
```

Keep the SVG icon unchanged.

In the `<script setup>` section, add the router import and navigation function:

```typescript
import { useRouter } from 'vue-router';

const router = useRouter();

function goToHistory(): void {
  router.push({ name: 'post-history', params: { id: props.post.id } });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/client && npx vitest run src/__tests__/components/post/PostActions.test.ts`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/post/PostActions.vue packages/client/src/__tests__/components/post/PostActions.test.ts
git commit -m "feat: enable History button in PostActions to navigate to revision history"
```

---

### Task 9: Bruno API test for restore endpoint

**Files:**

- Create: `bruno/posts/revisions/restore-revision.bru`

- [ ] **Step 1: Create the Bruno request file**

Create `bruno/posts/revisions/restore-revision.bru`:

```
meta {
  name: Restore Revision
  type: http
  seq: 4
}

post {
  url: {{baseUrl}}/api/posts/{{postId}}/revisions/1/restore
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
    bru.setVar("restoredRevisionNumber", body.revision.revisionNumber);
  }
}
```

- [ ] **Step 2: Run the Bruno suite against a running server**

Start the server:

```bash
set -a && source .env && set +a && cd packages/server && npx tsx src/server.ts &
```

Run the revisions suite:

```bash
cd bruno && npx @usebruno/cli run posts/revisions --env local
```

Expected: All 4 requests pass (list, get, create, restore).

- [ ] **Step 3: Commit**

```bash
git add bruno/posts/revisions/restore-revision.bru
git commit -m "test: add Bruno API test for revision restore endpoint"
```

---

## Verification Checklist

After all tasks are complete:

- [ ] Run `npm test` — all tests pass
- [ ] Run `npm run test:coverage` — meets 100% thresholds from `.coverage-thresholds.json`
- [ ] Run `npm run build` — no TypeScript errors
- [ ] Run `npm run lint` — no lint errors
- [ ] Start server and run full Bruno suite: `npm run bruno`
- [ ] Manual smoke test: navigate to a post, click History, select two revisions, view diff, restore a revision
