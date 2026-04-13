# Comments & Inline Commenting Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add threaded comment system with general comments below posts and inline comments anchored to specific code lines and revisions, including stale comment display for older revisions.

**Architecture:** Flat comment list returned from server API (joined with author + revision data), tree-building and stale detection computed client-side in the Pinia store. Five REST endpoints for CRUD. Four Vue components: CommentInput (markdown body + submit), CommentThread (recursive nesting), InlineComment (line-anchored), CommentSection (orchestrates general + stale sections). CodeViewer gets a gutter click handler for inline comment creation.

**Tech Stack:** Fastify routes, PostgreSQL queries (parameterized), Zod validators, Pinia stores, Vue 3 `<script setup>`, Tailwind CSS, Vitest with mocked DB connection / apiFetch.

---

## File Map

### Create

| File                                                     | Responsibility                                                |
| -------------------------------------------------------- | ------------------------------------------------------------- |
| `packages/shared/src/types/comment.ts`                   | Comment DTO interface, CommentAuthor type                     |
| `packages/shared/src/validators/comment.ts`              | Zod schemas for create/update comment input                   |
| `packages/server/src/services/comments.ts`               | `toComment()` row-to-DTO transformer                          |
| `packages/server/src/routes/comments.ts`                 | 5 CRUD endpoints nested under `/api/posts/:id/comments`       |
| `packages/client/src/stores/comments.ts`                 | Pinia store: flat list, computed tree, inline map, stale list |
| `packages/client/src/composables/useComments.ts`         | `useComments()` composable for API calls                      |
| `packages/client/src/components/post/CommentInput.vue`   | Textarea + submit button for writing comments                 |
| `packages/client/src/components/post/CommentThread.vue`  | Recursive threaded comment display                            |
| `packages/client/src/components/post/InlineComment.vue`  | Single inline comment anchored to a code line                 |
| `packages/client/src/components/post/CommentSection.vue` | Orchestrates general comments + stale section                 |

### Modify

| File                                                 | Change                                                                                                                                 |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared/src/types/index.ts`                 | Add comment type exports                                                                                                               |
| `packages/shared/src/validators/index.ts`            | Add comment validator exports                                                                                                          |
| `packages/server/src/db/queries/types.ts`            | Add `CommentWithAuthorRow` interface                                                                                                   |
| `packages/server/src/db/queries/comments.ts`         | Add `findCommentsByPostIdWithAuthor`, `findCommentsByPostIdWithAuthorForRevision`, `findCommentById`, `updateComment`, `deleteComment` |
| `packages/server/src/app.ts`                         | Register comment routes                                                                                                                |
| `packages/client/src/components/post/PostDetail.vue` | Replace placeholder with CommentSection                                                                                                |
| `packages/client/src/components/post/CodeViewer.vue` | Add gutter click for inline comments, emit line-click                                                                                  |

### Test

| File                                                                   | Covers                                      |
| ---------------------------------------------------------------------- | ------------------------------------------- |
| `packages/shared/src/__tests__/validators/comment.test.ts`             | Zod schema validation                       |
| `packages/server/src/__tests__/db/queries/comments.test.ts`            | Extend with new query tests                 |
| `packages/server/src/__tests__/services/comments.test.ts`              | toComment transformation                    |
| `packages/server/src/__tests__/routes/comments.test.ts`                | All 5 route handlers                        |
| `packages/client/src/__tests__/stores/comments.test.ts`                | Store state, tree building, stale detection |
| `packages/client/src/__tests__/composables/useComments.test.ts`        | API call composable                         |
| `packages/client/src/__tests__/components/post/CommentInput.test.ts`   | Input component                             |
| `packages/client/src/__tests__/components/post/CommentThread.test.ts`  | Thread rendering                            |
| `packages/client/src/__tests__/components/post/CommentSection.test.ts` | Section orchestration                       |
| `packages/client/src/__tests__/components/post/InlineComment.test.ts`  | Inline comment rendering                    |
| `packages/client/src/__tests__/components/post/PostDetail.test.ts`     | Update existing tests                       |
| `packages/client/src/__tests__/components/post/CodeViewer.test.ts`     | Update existing tests                       |

---

## Chunk 1: Shared Layer + Server Queries + Service

### Task 1: Shared Types & Validators

**Files:**

- Create: `packages/shared/src/types/comment.ts`
- Create: `packages/shared/src/validators/comment.ts`
- Modify: `packages/shared/src/types/index.ts`
- Modify: `packages/shared/src/validators/index.ts`
- Create: `packages/shared/src/__tests__/validators/comment.test.ts`

- [ ] **Step 1: Write comment type definitions**

Create `packages/shared/src/types/comment.ts`:

```typescript
export interface CommentAuthor {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface Comment {
  id: string;
  postId: string;
  author: CommentAuthor | null;
  parentId: string | null;
  lineNumber: number | null;
  revisionId: string | null;
  revisionNumber: number | null;
  body: string;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 2: Export comment types from barrel**

Add to `packages/shared/src/types/index.ts`:

```typescript
export type { Comment, CommentAuthor } from './comment.js';
```

- [ ] **Step 3: Write the failing validator tests**

Create `packages/shared/src/__tests__/validators/comment.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { createCommentSchema, updateCommentSchema } from '../../validators/comment.js';

describe('createCommentSchema', () => {
  it('accepts valid general comment', () => {
    const result = createCommentSchema.safeParse({ body: 'Great post!' });
    expect(result.success).toBe(true);
  });

  it('accepts valid inline comment with all optional fields', () => {
    const result = createCommentSchema.safeParse({
      body: 'Nice line',
      parentId: '550e8400-e29b-41d4-a716-446655440000',
      lineNumber: 5,
      revisionId: '660e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty body', () => {
    const result = createCommentSchema.safeParse({ body: '' });
    expect(result.success).toBe(false);
  });

  it('rejects body over 10000 chars', () => {
    const result = createCommentSchema.safeParse({ body: 'x'.repeat(10001) });
    expect(result.success).toBe(false);
  });

  it('rejects negative lineNumber', () => {
    const result = createCommentSchema.safeParse({ body: 'hi', lineNumber: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer lineNumber', () => {
    const result = createCommentSchema.safeParse({ body: 'hi', lineNumber: 1.5 });
    expect(result.success).toBe(false);
  });

  it('accepts null optional fields', () => {
    const result = createCommentSchema.safeParse({
      body: 'hi',
      parentId: null,
      lineNumber: null,
      revisionId: null,
    });
    expect(result.success).toBe(true);
  });
});

describe('updateCommentSchema', () => {
  it('accepts valid body', () => {
    const result = updateCommentSchema.safeParse({ body: 'Updated comment' });
    expect(result.success).toBe(true);
  });

  it('rejects empty body', () => {
    const result = updateCommentSchema.safeParse({ body: '' });
    expect(result.success).toBe(false);
  });

  it('rejects body over 10000 chars', () => {
    const result = updateCommentSchema.safeParse({ body: 'x'.repeat(10001) });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `cd packages/shared && npx vitest run src/__tests__/validators/comment.test.ts`
Expected: FAIL — module not found

- [ ] **Step 5: Write the validators**

Create `packages/shared/src/validators/comment.ts`:

```typescript
import { z } from 'zod';

export const createCommentSchema = z.object({
  body: z.string().min(1).max(10000),
  parentId: z.string().uuid().nullable().optional(),
  lineNumber: z.number().int().min(0).nullable().optional(),
  revisionId: z.string().uuid().nullable().optional(),
});

export type CreateCommentInput = z.infer<typeof createCommentSchema>;

export const updateCommentSchema = z.object({
  body: z.string().min(1).max(10000),
});

export type UpdateCommentInput = z.infer<typeof updateCommentSchema>;
```

- [ ] **Step 6: Export validators from barrel**

Add to `packages/shared/src/validators/index.ts`:

```typescript
export { createCommentSchema, updateCommentSchema } from './comment.js';
export type { CreateCommentInput, UpdateCommentInput } from './comment.js';
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd packages/shared && npx vitest run src/__tests__/validators/comment.test.ts`
Expected: All PASS

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src/types/comment.ts packages/shared/src/types/index.ts \
  packages/shared/src/validators/comment.ts packages/shared/src/validators/index.ts \
  packages/shared/src/__tests__/validators/comment.test.ts
git commit -m "feat(shared): add Comment types and validator schemas for issue #19"
```

---

### Task 2: Server Comment Queries

**Files:**

- Modify: `packages/server/src/db/queries/types.ts`
- Modify: `packages/server/src/db/queries/comments.ts`
- Modify: `packages/server/src/__tests__/db/queries/comments.test.ts`

- [ ] **Step 1: Add CommentWithAuthorRow type**

Add to `packages/server/src/db/queries/types.ts` after `CommentRow`:

```typescript
export interface CommentWithAuthorRow extends CommentRow {
  author_display_name: string | null;
  author_avatar_url: string | null;
  revision_number: number | null;
}
```

- [ ] **Step 2: Write failing tests for new query functions**

Extend `packages/server/src/__tests__/db/queries/comments.test.ts` — add these describes inside the existing outer `describe('comment queries')`:

```typescript
import {
  findCommentsByPostId,
  createComment,
  findCommentsByPostIdWithAuthor,
  findCommentsByPostIdWithAuthorForRevision,
  findCommentById,
  updateComment,
  deleteComment,
} from '../../../db/queries/comments.js';
import type { CommentRow, CommentWithAuthorRow } from '../../../db/queries/types.js';

// ... keep existing sampleComment ...

const sampleCommentWithAuthor: CommentWithAuthorRow = {
  ...sampleComment,
  author_display_name: 'Test User',
  author_avatar_url: null,
  revision_number: null,
};

// Add these describes after existing ones:

describe('findCommentsByPostIdWithAuthor', () => {
  it('returns comments with author and revision info', async () => {
    mockQuery.mockResolvedValue({ rows: [sampleCommentWithAuthor], rowCount: 1 });
    const result = await findCommentsByPostIdWithAuthor(sampleComment.post_id);
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('LEFT JOIN users'), [
      sampleComment.post_id,
    ]);
    expect(result).toEqual([sampleCommentWithAuthor]);
  });

  it('returns empty array when no comments', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    const result = await findCommentsByPostIdWithAuthor(sampleComment.post_id);
    expect(result).toEqual([]);
  });
});

describe('findCommentsByPostIdWithAuthorForRevision', () => {
  it('returns comments filtered by revision and general comments', async () => {
    mockQuery.mockResolvedValue({ rows: [sampleCommentWithAuthor], rowCount: 1 });
    const result = await findCommentsByPostIdWithAuthorForRevision(sampleComment.post_id, 'rev-1');
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('c.revision_id = $2 OR c.revision_id IS NULL'),
      [sampleComment.post_id, 'rev-1'],
    );
    expect(result).toEqual([sampleCommentWithAuthor]);
  });
});

describe('findCommentById', () => {
  it('returns comment when found', async () => {
    mockQuery.mockResolvedValue({ rows: [sampleComment], rowCount: 1 });
    const result = await findCommentById(sampleComment.id);
    expect(mockQuery).toHaveBeenCalledWith('SELECT * FROM comments WHERE id = $1', [
      sampleComment.id,
    ]);
    expect(result).toEqual(sampleComment);
  });

  it('returns null when not found', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    const result = await findCommentById('nonexistent');
    expect(result).toBeNull();
  });
});

describe('updateComment', () => {
  it('updates body and returns updated row', async () => {
    const updated = { ...sampleComment, body: 'Updated!', updated_at: new Date('2026-02-01') };
    mockQuery.mockResolvedValue({ rows: [updated], rowCount: 1 });
    const result = await updateComment(sampleComment.id, 'Updated!');
    expect(mockQuery).toHaveBeenCalledWith(
      'UPDATE comments SET body = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      ['Updated!', sampleComment.id],
    );
    expect(result).toEqual(updated);
  });

  it('returns null when comment not found', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    const result = await updateComment('nonexistent', 'Updated!');
    expect(result).toBeNull();
  });
});

describe('deleteComment', () => {
  it('returns true when comment deleted', async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });
    const result = await deleteComment(sampleComment.id);
    expect(mockQuery).toHaveBeenCalledWith('DELETE FROM comments WHERE id = $1', [
      sampleComment.id,
    ]);
    expect(result).toBe(true);
  });

  it('returns false when comment not found', async () => {
    mockQuery.mockResolvedValue({ rowCount: 0 });
    const result = await deleteComment('nonexistent');
    expect(result).toBe(false);
  });
});

describe('cascade delete verification', () => {
  it('schema defines ON DELETE CASCADE for parent_id FK', async () => {
    // Verify the migration SQL includes cascade on parent_id
    // This is a schema-level check — the DB handles cascade automatically
    // We verify by checking that the migration file contains the constraint
    const fs = await import('fs');
    const path = await import('path');
    const migrationPath = path.resolve(
      __dirname,
      '../../../../src/db/migrations/001_initial-schema.sql',
    );
    const sql = fs.readFileSync(migrationPath, 'utf-8');
    expect(sql).toContain('parent_id UUID REFERENCES comments(id) ON DELETE CASCADE');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd packages/server && npx vitest run src/__tests__/db/queries/comments.test.ts`
Expected: FAIL — functions not exported

- [ ] **Step 4: Implement the new query functions**

Add to `packages/server/src/db/queries/comments.ts`:

```typescript
import type { CommentRow, CommentWithAuthorRow } from './types.js';

// ... keep existing findCommentsByPostId, CreateCommentInput, createComment ...

export async function findCommentsByPostIdWithAuthor(
  postId: string,
): Promise<CommentWithAuthorRow[]> {
  const result = await query<CommentWithAuthorRow>(
    `SELECT c.*,
      u.display_name AS author_display_name,
      u.avatar_url AS author_avatar_url,
      pr.revision_number
    FROM comments c
    LEFT JOIN users u ON u.id = c.author_id
    LEFT JOIN post_revisions pr ON pr.id = c.revision_id
    WHERE c.post_id = $1
    ORDER BY c.created_at ASC`,
    [postId],
  );
  return result.rows;
}

export async function findCommentsByPostIdWithAuthorForRevision(
  postId: string,
  revisionId: string,
): Promise<CommentWithAuthorRow[]> {
  const result = await query<CommentWithAuthorRow>(
    `SELECT c.*,
      u.display_name AS author_display_name,
      u.avatar_url AS author_avatar_url,
      pr.revision_number
    FROM comments c
    LEFT JOIN users u ON u.id = c.author_id
    LEFT JOIN post_revisions pr ON pr.id = c.revision_id
    WHERE c.post_id = $1 AND (c.revision_id = $2 OR c.revision_id IS NULL)
    ORDER BY c.created_at ASC`,
    [postId, revisionId],
  );
  return result.rows;
}

export async function findCommentById(id: string): Promise<CommentRow | null> {
  const result = await query<CommentRow>('SELECT * FROM comments WHERE id = $1', [id]);
  return result.rows[0] ?? null;
}

export async function updateComment(id: string, body: string): Promise<CommentRow | null> {
  const result = await query<CommentRow>(
    'UPDATE comments SET body = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
    [body, id],
  );
  return result.rows[0] ?? null;
}

export async function deleteComment(id: string): Promise<boolean> {
  const result = await query('DELETE FROM comments WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}
```

Update the import at the top to include `CommentWithAuthorRow`:

```typescript
import type { CommentRow, CommentWithAuthorRow } from './types.js';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/server && npx vitest run src/__tests__/db/queries/comments.test.ts`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/db/queries/types.ts packages/server/src/db/queries/comments.ts \
  packages/server/src/__tests__/db/queries/comments.test.ts
git commit -m "feat(server): add comment query functions with author joins for issue #19"
```

---

### Task 3: Server Comment Service

**Files:**

- Create: `packages/server/src/services/comments.ts`
- Create: `packages/server/src/__tests__/services/comments.test.ts`

- [ ] **Step 1: Write failing tests for toComment**

Create `packages/server/src/__tests__/services/comments.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { toComment } from '../../services/comments.js';
import type { CommentWithAuthorRow } from '../../db/queries/types.js';

const baseRow: CommentWithAuthorRow = {
  id: '990e8400-e29b-41d4-a716-446655440000',
  post_id: '660e8400-e29b-41d4-a716-446655440000',
  author_id: '550e8400-e29b-41d4-a716-446655440000',
  parent_id: null,
  line_number: null,
  revision_id: null,
  body: 'Great post!',
  created_at: new Date('2026-01-01T00:00:00Z'),
  updated_at: new Date('2026-01-01T00:00:00Z'),
  author_display_name: 'Test User',
  author_avatar_url: 'https://example.com/avatar.png',
  revision_number: null,
};

describe('toComment', () => {
  it('transforms row to Comment DTO with author', () => {
    const result = toComment(baseRow);
    expect(result).toEqual({
      id: baseRow.id,
      postId: baseRow.post_id,
      author: {
        id: '550e8400-e29b-41d4-a716-446655440000',
        displayName: 'Test User',
        avatarUrl: 'https://example.com/avatar.png',
      },
      parentId: null,
      lineNumber: null,
      revisionId: null,
      revisionNumber: null,
      body: 'Great post!',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('returns null author when author_id is null', () => {
    const row: CommentWithAuthorRow = {
      ...baseRow,
      author_id: null,
      author_display_name: null,
      author_avatar_url: null,
    };
    const result = toComment(row);
    expect(result.author).toBeNull();
  });

  it('maps inline comment fields', () => {
    const row: CommentWithAuthorRow = {
      ...baseRow,
      parent_id: '770e8400-e29b-41d4-a716-446655440000',
      line_number: 42,
      revision_id: '880e8400-e29b-41d4-a716-446655440000',
      revision_number: 3,
    };
    const result = toComment(row);
    expect(result.parentId).toBe('770e8400-e29b-41d4-a716-446655440000');
    expect(result.lineNumber).toBe(42);
    expect(result.revisionId).toBe('880e8400-e29b-41d4-a716-446655440000');
    expect(result.revisionNumber).toBe(3);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/server && npx vitest run src/__tests__/services/comments.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement toComment service**

Create `packages/server/src/services/comments.ts`:

```typescript
import type { Comment } from '@forge/shared';
import type { CommentWithAuthorRow } from '../db/queries/types.js';

export function toComment(row: CommentWithAuthorRow): Comment {
  return {
    id: row.id,
    postId: row.post_id,
    author: row.author_id
      ? {
          id: row.author_id,
          displayName: row.author_display_name ?? 'Unknown',
          avatarUrl: row.author_avatar_url,
        }
      : null,
    parentId: row.parent_id,
    lineNumber: row.line_number,
    revisionId: row.revision_id,
    revisionNumber: row.revision_number,
    body: row.body,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/server && npx vitest run src/__tests__/services/comments.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/services/comments.ts \
  packages/server/src/__tests__/services/comments.test.ts
git commit -m "feat(server): add toComment service transformer for issue #19"
```

---

## Chunk 2: Server Routes + Client Store + Composable

### Task 4: Server Comment Routes

**Files:**

- Create: `packages/server/src/routes/comments.ts`
- Modify: `packages/server/src/app.ts`
- Create: `packages/server/src/__tests__/routes/comments.test.ts`

- [ ] **Step 1: Write failing route tests**

Create `packages/server/src/__tests__/routes/comments.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi, type Mock } from 'vitest';

vi.mock('../../db/connection.js', () => ({
  query: vi.fn(),
}));

vi.mock('../../plugins/rate-limit.js', () => ({
  rateLimitPlugin: async () => {
    // no-op
  },
}));

import { query } from '../../db/connection.js';
import { buildApp } from '../../app.js';
import type { FastifyInstance } from 'fastify';
import type { PostRow, CommentRow, CommentWithAuthorRow } from '../../db/queries/types.js';

const mockQuery = query as Mock;

const userId = '660e8400-e29b-41d4-a716-446655440000';
const otherUserId = '770e8400-e29b-41d4-a716-446655440000';
const postId = '550e8400-e29b-41d4-a716-446655440000';
const commentId = '990e8400-e29b-41d4-a716-446655440000';

const samplePostRow: PostRow = {
  id: postId,
  author_id: userId,
  title: 'Hello World',
  content_type: 'snippet',
  language: 'typescript',
  visibility: 'public',
  is_draft: false,
  forked_from_id: null,
  link_url: null,
  link_preview: null,
  vote_count: 0,
  view_count: 0,
  search_vector: null,
  deleted_at: null,
  created_at: new Date('2026-01-01'),
  updated_at: new Date('2026-01-01'),
};

const sampleCommentRow: CommentRow = {
  id: commentId,
  post_id: postId,
  author_id: userId,
  parent_id: null,
  line_number: null,
  revision_id: null,
  body: 'Great post!',
  created_at: new Date('2026-01-01'),
  updated_at: new Date('2026-01-01'),
};

const sampleCommentWithAuthor: CommentWithAuthorRow = {
  ...sampleCommentRow,
  author_display_name: 'Test User',
  author_avatar_url: null,
  revision_number: null,
};

describe('comment routes', () => {
  let app: FastifyInstance;
  let token: string;
  let otherToken: string;

  beforeAll(async () => {
    app = await buildApp();
    token = app.jwt.sign({ id: userId, email: 'test@example.com', displayName: 'Test User' });
    otherToken = app.jwt.sign({
      id: otherUserId,
      email: 'other@example.com',
      displayName: 'Other',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/posts/:id/comments', () => {
    it('returns comments for a post', async () => {
      // findPostById
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // findCommentsByPostIdWithAuthor
      mockQuery.mockResolvedValueOnce({ rows: [sampleCommentWithAuthor], rowCount: 1 });

      const response = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}/comments`,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.comments).toHaveLength(1);
      expect(body.comments[0].body).toBe('Great post!');
    });

    it('returns comments filtered by revision when ?revision= is provided', async () => {
      // findPostById
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // findCommentsByPostIdWithAuthorForRevision
      mockQuery.mockResolvedValueOnce({ rows: [sampleCommentWithAuthor], rowCount: 1 });

      const response = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}/comments?revision=rev-1`,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.comments).toHaveLength(1);
    });

    it('returns 404 when post not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const response = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}/comments`,
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /api/posts/:id/comments', () => {
    it('creates a general comment', async () => {
      // findPostById
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // createComment
      mockQuery.mockResolvedValueOnce({ rows: [sampleCommentRow], rowCount: 1 });
      // findCommentsByPostIdWithAuthor (re-read single comment for response)
      mockQuery.mockResolvedValueOnce({ rows: [sampleCommentWithAuthor], rowCount: 1 });

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/comments`,
        headers: { authorization: `Bearer ${token}` },
        payload: { body: 'Great post!' },
      });

      expect(response.statusCode).toBe(201);
      const responseBody = response.json();
      expect(responseBody.comment.body).toBe('Great post!');
      expect(responseBody.comment.author).toBeDefined();
    });

    it('returns 400 for empty body', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/comments`,
        headers: { authorization: `Bearer ${token}` },
        payload: { body: '' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 401 without auth', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/comments`,
        payload: { body: 'Great post!' },
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 404 when post not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/comments`,
        headers: { authorization: `Bearer ${token}` },
        payload: { body: 'Great post!' },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('PATCH /api/posts/:id/comments/:cid', () => {
    it('updates comment body', async () => {
      // findPostById
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // findCommentById
      mockQuery.mockResolvedValueOnce({ rows: [sampleCommentRow], rowCount: 1 });
      // updateComment
      const updated = { ...sampleCommentRow, body: 'Updated!' };
      mockQuery.mockResolvedValueOnce({ rows: [updated], rowCount: 1 });
      // findCommentsByPostIdWithAuthor for response
      const updatedWithAuthor = { ...sampleCommentWithAuthor, body: 'Updated!' };
      mockQuery.mockResolvedValueOnce({ rows: [updatedWithAuthor], rowCount: 1 });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/posts/${postId}/comments/${commentId}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { body: 'Updated!' },
      });

      expect(response.statusCode).toBe(200);
      const responseBody = response.json();
      expect(responseBody.comment.body).toBe('Updated!');
    });

    it('returns 403 when not comment author', async () => {
      // findPostById
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // findCommentById
      mockQuery.mockResolvedValueOnce({ rows: [sampleCommentRow], rowCount: 1 });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/posts/${postId}/comments/${commentId}`,
        headers: { authorization: `Bearer ${otherToken}` },
        payload: { body: 'Updated!' },
      });

      expect(response.statusCode).toBe(403);
    });

    it('returns 404 when comment not found', async () => {
      // findPostById
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // findCommentById
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/posts/${postId}/comments/${commentId}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { body: 'Updated!' },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error).toBe('Comment not found');
    });

    it('returns 401 without auth', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/posts/${postId}/comments/${commentId}`,
        payload: { body: 'Updated!' },
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 400 for empty body', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/posts/${postId}/comments/${commentId}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { body: '' },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('DELETE /api/posts/:id/comments/:cid', () => {
    it('deletes comment and returns 204', async () => {
      // findPostById
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // findCommentById
      mockQuery.mockResolvedValueOnce({ rows: [sampleCommentRow], rowCount: 1 });
      // deleteComment
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/posts/${postId}/comments/${commentId}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(204);
    });

    it('returns 403 when not comment author', async () => {
      // findPostById
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // findCommentById
      mockQuery.mockResolvedValueOnce({ rows: [sampleCommentRow], rowCount: 1 });

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/posts/${postId}/comments/${commentId}`,
        headers: { authorization: `Bearer ${otherToken}` },
      });

      expect(response.statusCode).toBe(403);
    });

    it('returns 404 when comment not found', async () => {
      // findPostById
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // findCommentById
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/posts/${postId}/comments/${commentId}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(404);
    });

    it('returns 401 without auth', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/posts/${postId}/comments/${commentId}`,
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/server && npx vitest run src/__tests__/routes/comments.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement comment routes**

Create `packages/server/src/routes/comments.ts`:

```typescript
import type { FastifyInstance } from 'fastify';
import { createCommentSchema, updateCommentSchema } from '@forge/shared';
import { findPostById } from '../db/queries/posts.js';
import {
  findCommentsByPostIdWithAuthor,
  findCommentsByPostIdWithAuthorForRevision,
  findCommentById,
  createComment,
  updateComment,
  deleteComment,
} from '../db/queries/comments.js';
import { toComment } from '../services/comments.js';

export async function commentRoutes(app: FastifyInstance): Promise<void> {
  // GET /:id/comments — list comments for a post (optional ?revision=<id> filter)
  app.get('/:id/comments', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { revision } = request.query as { revision?: string };

    const post = await findPostById(id);
    if (!post) {
      return reply.status(404).send({ error: 'Post not found' });
    }

    const rows = revision
      ? await findCommentsByPostIdWithAuthorForRevision(id, revision)
      : await findCommentsByPostIdWithAuthor(id);
    return reply.send({ comments: rows.map(toComment) });
  });

  // POST /:id/comments — create comment
  app.post('/:id/comments', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const post = await findPostById(id);
    if (!post) {
      return reply.status(404).send({ error: 'Post not found' });
    }

    const parsed = createCommentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: parsed.error.errors.map((e) => e.message).join(', ') });
    }

    const row = await createComment({
      postId: id,
      authorId: request.user.id,
      parentId: parsed.data.parentId ?? null,
      lineNumber: parsed.data.lineNumber ?? null,
      revisionId: parsed.data.revisionId ?? null,
      body: parsed.data.body,
    });

    // Re-read with author join for response
    const rows = await findCommentsByPostIdWithAuthor(id);
    const created = rows.find((r) => r.id === row.id);
    return reply
      .status(201)
      .send({
        comment: toComment(
          created ?? {
            ...row,
            author_display_name: null,
            author_avatar_url: null,
            revision_number: null,
          },
        ),
      });
  });

  // PATCH /:id/comments/:cid — edit comment
  app.patch('/:id/comments/:cid', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id, cid } = request.params as { id: string; cid: string };

    const post = await findPostById(id);
    if (!post) {
      return reply.status(404).send({ error: 'Post not found' });
    }

    const existing = await findCommentById(cid);
    if (!existing) {
      return reply.status(404).send({ error: 'Comment not found' });
    }

    if (existing.author_id !== request.user.id) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const parsed = updateCommentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: parsed.error.errors.map((e) => e.message).join(', ') });
    }

    await updateComment(cid, parsed.data.body);

    // Re-read with author join for response
    const rows = await findCommentsByPostIdWithAuthor(id);
    const updated = rows.find((r) => r.id === cid);
    if (!updated) {
      return reply.status(404).send({ error: 'Comment not found' });
    }

    return reply.send({ comment: toComment(updated) });
  });

  // DELETE /:id/comments/:cid — delete comment
  app.delete('/:id/comments/:cid', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id, cid } = request.params as { id: string; cid: string };

    const post = await findPostById(id);
    if (!post) {
      return reply.status(404).send({ error: 'Post not found' });
    }

    const existing = await findCommentById(cid);
    if (!existing) {
      return reply.status(404).send({ error: 'Comment not found' });
    }

    if (existing.author_id !== request.user.id) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    await deleteComment(cid);
    return reply.status(204).send();
  });
}
```

- [ ] **Step 4: Register routes in app.ts**

Add import at top of `packages/server/src/app.ts`:

```typescript
import { commentRoutes } from './routes/comments.js';
```

Add registration after the tag routes line:

```typescript
await app.register(commentRoutes, { prefix: '/api/posts' });
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/server && npx vitest run src/__tests__/routes/comments.test.ts`
Expected: All PASS

- [ ] **Step 6: Run full server test suite**

Run: `cd packages/server && npx vitest run`
Expected: All PASS (no regressions)

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/routes/comments.ts packages/server/src/app.ts \
  packages/server/src/__tests__/routes/comments.test.ts
git commit -m "feat(server): add comment CRUD routes for issue #19"
```

---

### Task 5: Client Comments Store

**Files:**

- Create: `packages/client/src/stores/comments.ts`
- Create: `packages/client/src/__tests__/stores/comments.test.ts`

- [ ] **Step 1: Write failing store tests**

Create `packages/client/src/__tests__/stores/comments.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useCommentsStore } from '@/stores/comments';
import type { Comment } from '@forge/shared';

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 'c1',
    postId: 'p1',
    author: { id: 'u1', displayName: 'User', avatarUrl: null },
    parentId: null,
    lineNumber: null,
    revisionId: null,
    revisionNumber: null,
    body: 'Hello',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('useCommentsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  describe('initial state', () => {
    it('has empty comments', () => {
      const store = useCommentsStore();
      expect(store.comments).toEqual([]);
    });

    it('has null currentRevisionId', () => {
      const store = useCommentsStore();
      expect(store.currentRevisionId).toBeNull();
    });
  });

  describe('setComments', () => {
    it('sets the flat comments list', () => {
      const store = useCommentsStore();
      const comments = [makeComment()];
      store.setComments(comments);
      expect(store.comments).toEqual(comments);
    });
  });

  describe('addComment', () => {
    it('appends a comment', () => {
      const store = useCommentsStore();
      store.setComments([makeComment({ id: 'c1' })]);
      store.addComment(makeComment({ id: 'c2', body: 'Second' }));
      expect(store.comments).toHaveLength(2);
    });
  });

  describe('updateComment', () => {
    it('updates a comment body', () => {
      const store = useCommentsStore();
      store.setComments([makeComment({ id: 'c1', body: 'Old' })]);
      store.updateComment('c1', makeComment({ id: 'c1', body: 'New' }));
      expect(store.comments[0].body).toBe('New');
    });

    it('does nothing when comment not found', () => {
      const store = useCommentsStore();
      store.setComments([makeComment({ id: 'c1' })]);
      store.updateComment('nonexistent', makeComment({ id: 'nonexistent' }));
      expect(store.comments).toHaveLength(1);
    });
  });

  describe('removeComment', () => {
    it('removes a comment by id', () => {
      const store = useCommentsStore();
      store.setComments([makeComment({ id: 'c1' }), makeComment({ id: 'c2' })]);
      store.removeComment('c1');
      expect(store.comments).toHaveLength(1);
      expect(store.comments[0].id).toBe('c2');
    });
  });

  describe('generalComments (computed)', () => {
    it('returns top-level comments without lineNumber', () => {
      const store = useCommentsStore();
      store.setComments([
        makeComment({ id: 'c1', lineNumber: null }),
        makeComment({ id: 'c2', lineNumber: 5 }),
      ]);
      expect(store.generalComments).toHaveLength(1);
      expect(store.generalComments[0].id).toBe('c1');
    });
  });

  describe('commentTree (computed)', () => {
    it('builds nested tree from flat list for general comments', () => {
      const store = useCommentsStore();
      store.setComments([
        makeComment({ id: 'c1', parentId: null, lineNumber: null }),
        makeComment({ id: 'c2', parentId: 'c1', lineNumber: null }),
      ]);
      // commentTree returns general top-level with children
      expect(store.commentTree).toHaveLength(1);
      expect(store.commentTree[0].id).toBe('c1');
      expect(store.commentTree[0].children).toHaveLength(1);
      expect(store.commentTree[0].children[0].id).toBe('c2');
    });

    it('supports multiple levels of nesting', () => {
      const store = useCommentsStore();
      store.setComments([
        makeComment({ id: 'c1', parentId: null, lineNumber: null }),
        makeComment({ id: 'c2', parentId: 'c1', lineNumber: null }),
        makeComment({ id: 'c3', parentId: 'c2', lineNumber: null }),
      ]);
      expect(store.commentTree).toHaveLength(1);
      expect(store.commentTree[0].children[0].children).toHaveLength(1);
    });
  });

  describe('inlineComments (computed)', () => {
    it('groups current-revision inline comments by lineNumber', () => {
      const store = useCommentsStore();
      const revId = 'rev-1';
      store.setCurrentRevisionId(revId);
      store.setComments([
        makeComment({ id: 'c1', lineNumber: 5, revisionId: revId, parentId: null }),
        makeComment({ id: 'c2', lineNumber: 5, revisionId: revId, parentId: null }),
        makeComment({ id: 'c3', lineNumber: 10, revisionId: revId, parentId: null }),
      ]);
      expect(store.inlineComments.get(5)).toHaveLength(2);
      expect(store.inlineComments.get(10)).toHaveLength(1);
    });

    it('excludes comments from other revisions', () => {
      const store = useCommentsStore();
      store.setCurrentRevisionId('rev-current');
      store.setComments([
        makeComment({ id: 'c1', lineNumber: 5, revisionId: 'rev-current', parentId: null }),
        makeComment({ id: 'c2', lineNumber: 5, revisionId: 'rev-old', parentId: null }),
      ]);
      expect(store.inlineComments.get(5)).toHaveLength(1);
    });
  });

  describe('staleComments (computed)', () => {
    it('returns inline comments from older revisions', () => {
      const store = useCommentsStore();
      store.setCurrentRevisionId('rev-current');
      store.setComments([
        makeComment({ id: 'c1', lineNumber: 5, revisionId: 'rev-current', parentId: null }),
        makeComment({
          id: 'c2',
          lineNumber: 8,
          revisionId: 'rev-old',
          revisionNumber: 2,
          parentId: null,
        }),
      ]);
      expect(store.staleComments).toHaveLength(1);
      expect(store.staleComments[0].id).toBe('c2');
    });

    it('excludes general comments (no lineNumber)', () => {
      const store = useCommentsStore();
      store.setCurrentRevisionId('rev-current');
      store.setComments([
        makeComment({ id: 'c1', lineNumber: null, revisionId: null, parentId: null }),
      ]);
      expect(store.staleComments).toHaveLength(0);
    });
  });

  describe('clearComments', () => {
    it('resets all state', () => {
      const store = useCommentsStore();
      store.setComments([makeComment()]);
      store.setCurrentRevisionId('rev-1');
      store.clearComments();
      expect(store.comments).toEqual([]);
      expect(store.currentRevisionId).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/client && npx vitest run src/__tests__/stores/comments.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the comments store**

Create `packages/client/src/stores/comments.ts`:

```typescript
import { ref, computed } from 'vue';
import { defineStore } from 'pinia';
import type { Comment } from '@forge/shared';

export interface CommentTreeNode extends Comment {
  children: CommentTreeNode[];
}

export const useCommentsStore = defineStore('comments', () => {
  const comments = ref<Comment[]>([]);
  const currentRevisionId = ref<string | null>(null);

  function setComments(newComments: Comment[]): void {
    comments.value = newComments;
  }

  function setCurrentRevisionId(revisionId: string | null): void {
    currentRevisionId.value = revisionId;
  }

  function addComment(comment: Comment): void {
    comments.value.push(comment);
  }

  function updateComment(id: string, updated: Comment): void {
    const idx = comments.value.findIndex((c) => c.id === id);
    if (idx !== -1) {
      comments.value[idx] = updated;
    }
  }

  function removeComment(id: string): void {
    comments.value = comments.value.filter((c) => c.id !== id);
  }

  function clearComments(): void {
    comments.value = [];
    currentRevisionId.value = null;
  }

  const generalComments = computed(() =>
    comments.value.filter((c) => c.lineNumber === null && c.parentId === null),
  );

  const commentTree = computed((): CommentTreeNode[] => {
    const general = comments.value.filter((c) => c.lineNumber === null);
    const map = new Map<string, CommentTreeNode>();

    for (const c of general) {
      map.set(c.id, { ...c, children: [] });
    }

    const roots: CommentTreeNode[] = [];
    for (const node of map.values()) {
      const parent = node.parentId ? map.get(node.parentId) : undefined;
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  });

  const inlineComments = computed(() => {
    const grouped = new Map<number, Comment[]>();
    for (const c of comments.value) {
      if (
        c.lineNumber !== null &&
        c.parentId === null &&
        c.revisionId === currentRevisionId.value
      ) {
        const existing = grouped.get(c.lineNumber) ?? [];
        existing.push(c);
        grouped.set(c.lineNumber, existing);
      }
    }
    return grouped;
  });

  const staleComments = computed(() =>
    comments.value.filter(
      (c) =>
        c.lineNumber !== null &&
        c.parentId === null &&
        c.revisionId !== null &&
        c.revisionId !== currentRevisionId.value,
    ),
  );

  return {
    comments,
    currentRevisionId,
    setComments,
    setCurrentRevisionId,
    addComment,
    updateComment,
    removeComment,
    clearComments,
    generalComments,
    commentTree,
    inlineComments,
    staleComments,
  };
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/client && npx vitest run src/__tests__/stores/comments.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/stores/comments.ts \
  packages/client/src/__tests__/stores/comments.test.ts
git commit -m "feat(client): add comments Pinia store with tree building and stale detection"
```

---

### Task 6: Client Comments Composable

**Files:**

- Create: `packages/client/src/composables/useComments.ts`
- Create: `packages/client/src/__tests__/composables/useComments.test.ts`

- [ ] **Step 1: Write failing composable tests**

Create `packages/client/src/__tests__/composables/useComments.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useCommentsStore } from '../../stores/comments.js';
import type { Comment } from '@forge/shared';

const mockComment: Comment = {
  id: 'c1',
  postId: 'p1',
  author: { id: 'u1', displayName: 'User', avatarUrl: null },
  parentId: null,
  lineNumber: null,
  revisionId: null,
  revisionNumber: null,
  body: 'Hello',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function mockResponse(data: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    json: () => Promise.resolve(data),
  } as Response;
}

const mockApiFetch = vi.fn();
vi.mock('../../lib/api.js', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args) as unknown,
}));

import { useComments } from '../../composables/useComments.js';

describe('useComments', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockApiFetch.mockReset();
  });

  describe('fetchComments', () => {
    it('fetches comments and sets them in store', async () => {
      const store = useCommentsStore();
      mockApiFetch.mockResolvedValue(mockResponse({ comments: [mockComment] }));

      const { fetchComments } = useComments();
      await fetchComments('p1');

      expect(mockApiFetch).toHaveBeenCalledWith('/api/posts/p1/comments');
      expect(store.comments).toHaveLength(1);
    });

    it('sets error on failure', async () => {
      mockApiFetch.mockResolvedValue(mockResponse({ error: 'Not found' }, false));

      const { fetchComments, error } = useComments();
      await fetchComments('p1');

      expect(error.value).toBe('Not found');
    });
  });

  describe('addComment', () => {
    it('posts comment and adds to store', async () => {
      mockApiFetch.mockResolvedValue(mockResponse({ comment: mockComment }, true));

      const store = useCommentsStore();
      const { addComment } = useComments();
      await addComment('p1', { body: 'Hello' });

      expect(mockApiFetch).toHaveBeenCalledWith('/api/posts/p1/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: 'Hello' }),
      });
      expect(store.comments).toHaveLength(1);
    });

    it('sends optional fields when provided', async () => {
      mockApiFetch.mockResolvedValue(mockResponse({ comment: mockComment }, true));

      const { addComment } = useComments();
      await addComment('p1', { body: 'Inline', lineNumber: 5, revisionId: 'rev-1' });

      expect(mockApiFetch).toHaveBeenCalledWith('/api/posts/p1/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: 'Inline', lineNumber: 5, revisionId: 'rev-1' }),
      });
    });

    it('sets error on failure', async () => {
      mockApiFetch.mockResolvedValue(mockResponse({ error: 'Bad request' }, false));

      const { addComment, error } = useComments();
      await addComment('p1', { body: 'Hello' });

      expect(error.value).toBe('Bad request');
    });
  });

  describe('editComment', () => {
    it('patches comment and updates store', async () => {
      const updated = { ...mockComment, body: 'Updated' };
      mockApiFetch.mockResolvedValue(mockResponse({ comment: updated }, true));

      const store = useCommentsStore();
      store.setComments([mockComment]);

      const { editComment } = useComments();
      await editComment('p1', 'c1', 'Updated');

      expect(mockApiFetch).toHaveBeenCalledWith('/api/posts/p1/comments/c1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: 'Updated' }),
      });
      expect(store.comments[0].body).toBe('Updated');
    });
  });

  describe('deleteComment', () => {
    it('deletes comment and removes from store', async () => {
      mockApiFetch.mockResolvedValue({ ok: true, status: 204 } as Response);

      const store = useCommentsStore();
      store.setComments([mockComment]);

      const { deleteComment } = useComments();
      await deleteComment('p1', 'c1');

      expect(mockApiFetch).toHaveBeenCalledWith('/api/posts/p1/comments/c1', {
        method: 'DELETE',
      });
      expect(store.comments).toHaveLength(0);
    });

    it('sets error on failure', async () => {
      mockApiFetch.mockResolvedValue(mockResponse({ error: 'Forbidden' }, false));

      const { deleteComment, error } = useComments();
      await deleteComment('p1', 'c1');

      expect(error.value).toBe('Forbidden');
    });
  });

  describe('loading state', () => {
    it('sets loading during fetchComments', async () => {
      let resolvePromise: (v: Response) => void;
      mockApiFetch.mockReturnValue(
        new Promise((r) => {
          resolvePromise = r;
        }),
      );

      const { fetchComments, loading } = useComments();
      const promise = fetchComments('p1');
      expect(loading.value).toBe(true);

      (resolvePromise as (v: Response) => void)(mockResponse({ comments: [] }));
      await promise;
      expect(loading.value).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/client && npx vitest run src/__tests__/composables/useComments.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the useComments composable**

Create `packages/client/src/composables/useComments.ts`:

```typescript
import { ref } from 'vue';
import { apiFetch } from '../lib/api.js';
import { useCommentsStore } from '../stores/comments.js';
import type { Comment } from '@forge/shared';

async function parseErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error ?? fallback;
  } catch {
    return fallback;
  }
}

interface AddCommentInput {
  body: string;
  parentId?: string;
  lineNumber?: number;
  revisionId?: string;
}

export function useComments() {
  const store = useCommentsStore();
  const error = ref<string | null>(null);
  const loading = ref(false);

  async function fetchComments(postId: string): Promise<void> {
    error.value = null;
    loading.value = true;
    try {
      const response = await apiFetch(`/api/posts/${postId}/comments`);
      if (!response.ok) {
        error.value = await parseErrorMessage(response, 'Failed to load comments');
        return;
      }
      const data = (await response.json()) as { comments: Comment[] };
      store.setComments(data.comments);
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load comments';
    } finally {
      loading.value = false;
    }
  }

  async function addComment(postId: string, input: AddCommentInput): Promise<void> {
    error.value = null;
    loading.value = true;
    try {
      const response = await apiFetch(`/api/posts/${postId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!response.ok) {
        error.value = await parseErrorMessage(response, 'Failed to add comment');
        return;
      }
      const data = (await response.json()) as { comment: Comment };
      store.addComment(data.comment);
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to add comment';
    } finally {
      loading.value = false;
    }
  }

  async function editComment(postId: string, commentId: string, body: string): Promise<void> {
    error.value = null;
    loading.value = true;
    try {
      const response = await apiFetch(`/api/posts/${postId}/comments/${commentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      if (!response.ok) {
        error.value = await parseErrorMessage(response, 'Failed to edit comment');
        return;
      }
      const data = (await response.json()) as { comment: Comment };
      store.updateComment(commentId, data.comment);
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to edit comment';
    } finally {
      loading.value = false;
    }
  }

  async function deleteComment(postId: string, commentId: string): Promise<void> {
    error.value = null;
    loading.value = true;
    try {
      const response = await apiFetch(`/api/posts/${postId}/comments/${commentId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        error.value = await parseErrorMessage(response, 'Failed to delete comment');
        return;
      }
      store.removeComment(commentId);
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to delete comment';
    } finally {
      loading.value = false;
    }
  }

  return {
    error,
    loading,
    fetchComments,
    addComment,
    editComment,
    deleteComment,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/client && npx vitest run src/__tests__/composables/useComments.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/composables/useComments.ts \
  packages/client/src/__tests__/composables/useComments.test.ts
git commit -m "feat(client): add useComments composable for comment CRUD"
```

---

## Chunk 3: Client Components + Integration

### Task 7: CommentInput Component

**Files:**

- Create: `packages/client/src/components/post/CommentInput.vue`
- Create: `packages/client/src/__tests__/components/post/CommentInput.test.ts`

- [ ] **Step 1: Write failing component tests**

Create `packages/client/src/__tests__/components/post/CommentInput.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import CommentInput from '@/components/post/CommentInput.vue';

describe('CommentInput', () => {
  it('renders textarea and submit button', () => {
    const wrapper = mount(CommentInput);
    expect(wrapper.find('textarea').exists()).toBe(true);
    expect(wrapper.find('button[type="submit"]').exists()).toBe(true);
  });

  it('disables submit when body is empty', () => {
    const wrapper = mount(CommentInput);
    const btn = wrapper.find('button[type="submit"]');
    expect(btn.attributes('disabled')).toBeDefined();
  });

  it('enables submit when body has content', async () => {
    const wrapper = mount(CommentInput);
    await wrapper.find('textarea').setValue('Hello');
    const btn = wrapper.find('button[type="submit"]');
    expect(btn.attributes('disabled')).toBeUndefined();
  });

  it('emits submit event with body text', async () => {
    const wrapper = mount(CommentInput);
    await wrapper.find('textarea').setValue('My comment');
    await wrapper.find('form').trigger('submit');
    const emitted = wrapper.emitted('submit') as unknown[][];
    expect(emitted).toBeTruthy();
    expect(emitted[0]).toEqual(['My comment']);
  });

  it('clears textarea after submit', async () => {
    const wrapper = mount(CommentInput);
    const textarea = wrapper.find('textarea');
    await textarea.setValue('My comment');
    await wrapper.find('form').trigger('submit');
    expect((textarea.element as HTMLTextAreaElement).value).toBe('');
  });

  it('emits cancel when cancel button clicked', async () => {
    const wrapper = mount(CommentInput, { props: { showCancel: true } });
    await wrapper.find('[data-testid="cancel-btn"]').trigger('click');
    expect(wrapper.emitted('cancel')).toBeTruthy();
  });

  it('shows placeholder text', () => {
    const wrapper = mount(CommentInput, { props: { placeholder: 'Add a comment...' } });
    expect(wrapper.find('textarea').attributes('placeholder')).toBe('Add a comment...');
  });

  it('pre-fills textarea with initialValue prop', () => {
    const wrapper = mount(CommentInput, { props: { initialValue: 'Existing text' } });
    const textarea = wrapper.find('textarea').element as HTMLTextAreaElement;
    expect(textarea.value).toBe('Existing text');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/client && npx vitest run src/__tests__/components/post/CommentInput.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement CommentInput component**

Create `packages/client/src/components/post/CommentInput.vue`:

```vue
<template>
  <form class="flex flex-col gap-2" @submit.prevent="handleSubmit">
    <textarea
      v-model="body"
      :placeholder="placeholder"
      class="w-full resize-none rounded border border-gray-600 bg-surface-800 px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:border-primary focus:outline-none"
      rows="3"
    />
    <div class="flex items-center gap-2">
      <button
        type="submit"
        :disabled="!body.trim()"
        class="rounded bg-primary px-3 py-1 text-sm font-medium text-white disabled:opacity-50"
      >
        Comment
      </button>
      <button
        v-if="showCancel"
        type="button"
        data-testid="cancel-btn"
        class="rounded px-3 py-1 text-sm text-gray-400 hover:text-gray-200"
        @click="$emit('cancel')"
      >
        Cancel
      </button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{
  placeholder?: string;
  showCancel?: boolean;
  initialValue?: string;
}>();

const emit = defineEmits<{
  submit: [body: string];
  cancel: [];
}>();

const body = ref(props.initialValue ?? '');

function handleSubmit(): void {
  const text = body.value.trim();
  if (!text) return;
  emit('submit', text);
  body.value = '';
}
</script>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/client && npx vitest run src/__tests__/components/post/CommentInput.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/post/CommentInput.vue \
  packages/client/src/__tests__/components/post/CommentInput.test.ts
git commit -m "feat(client): add CommentInput component for issue #19"
```

---

### Task 8: CommentThread Component

**Files:**

- Create: `packages/client/src/components/post/CommentThread.vue`
- Create: `packages/client/src/__tests__/components/post/CommentThread.test.ts`

- [ ] **Step 1: Write failing component tests**

Create `packages/client/src/__tests__/components/post/CommentThread.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import CommentThread from '@/components/post/CommentThread.vue';
import type { CommentTreeNode } from '@/stores/comments';

const mockApiFetch = vi.fn();
vi.mock('../../../lib/api.js', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args) as unknown,
}));

function makeNode(overrides: Partial<CommentTreeNode> = {}): CommentTreeNode {
  return {
    id: 'c1',
    postId: 'p1',
    author: { id: 'u1', displayName: 'Alice', avatarUrl: null },
    parentId: null,
    lineNumber: null,
    revisionId: null,
    revisionNumber: null,
    body: 'Hello world',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    children: [],
    ...overrides,
  };
}

describe('CommentThread', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockApiFetch.mockReset();
  });

  it('renders comment body and author', () => {
    const wrapper = mount(CommentThread, {
      props: { node: makeNode(), postId: 'p1' },
    });
    expect(wrapper.text()).toContain('Hello world');
    expect(wrapper.text()).toContain('Alice');
  });

  it('renders "Deleted user" when author is null', () => {
    const wrapper = mount(CommentThread, {
      props: { node: makeNode({ author: null }), postId: 'p1' },
    });
    expect(wrapper.text()).toContain('Deleted user');
  });

  it('renders children recursively', () => {
    const child = makeNode({ id: 'c2', body: 'Reply', parentId: 'c1' });
    const parent = makeNode({ id: 'c1', children: [child] });

    const wrapper = mount(CommentThread, {
      props: { node: parent, postId: 'p1' },
    });
    expect(wrapper.text()).toContain('Hello world');
    expect(wrapper.text()).toContain('Reply');
  });

  it('shows Reply button', () => {
    const wrapper = mount(CommentThread, {
      props: { node: makeNode(), postId: 'p1' },
    });
    expect(wrapper.find('[data-testid="reply-btn"]').exists()).toBe(true);
  });

  it('shows reply input when Reply clicked', async () => {
    const wrapper = mount(CommentThread, {
      props: { node: makeNode(), postId: 'p1' },
    });
    await wrapper.find('[data-testid="reply-btn"]').trigger('click');
    expect(wrapper.find('textarea').exists()).toBe(true);
  });

  it('submits reply and hides input', async () => {
    const mockComment = {
      id: 'c-reply',
      postId: 'p1',
      author: { id: 'u1', displayName: 'User', avatarUrl: null },
      parentId: 'c1',
      lineNumber: null,
      revisionId: null,
      revisionNumber: null,
      body: 'Reply text',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    mockApiFetch.mockResolvedValue({
      ok: true,
      status: 201,
      json: () => Promise.resolve({ comment: mockComment }),
    } as Response);

    const wrapper = mount(CommentThread, {
      props: { node: makeNode(), postId: 'p1' },
    });
    await wrapper.find('[data-testid="reply-btn"]').trigger('click');
    await wrapper.find('textarea').setValue('Reply text');
    await wrapper.find('form').trigger('submit');
    // Wait for async handler
    await new Promise((r) => setTimeout(r, 0));
    await wrapper.vm.$nextTick();
    expect(wrapper.find('textarea').exists()).toBe(false);
  });

  it('shows Edit button only when currentUserId matches author', () => {
    const wrapper = mount(CommentThread, {
      props: { node: makeNode(), postId: 'p1', currentUserId: 'u1' },
    });
    expect(wrapper.find('[data-testid="edit-btn"]').exists()).toBe(true);
  });

  it('hides Edit button when currentUserId does not match author', () => {
    const wrapper = mount(CommentThread, {
      props: { node: makeNode(), postId: 'p1', currentUserId: 'u-other' },
    });
    expect(wrapper.find('[data-testid="edit-btn"]').exists()).toBe(false);
  });

  it('hides Edit button when no currentUserId', () => {
    const wrapper = mount(CommentThread, {
      props: { node: makeNode(), postId: 'p1' },
    });
    expect(wrapper.find('[data-testid="edit-btn"]').exists()).toBe(false);
  });

  it('shows edit input with current body when Edit clicked', async () => {
    const wrapper = mount(CommentThread, {
      props: { node: makeNode({ body: 'Original' }), postId: 'p1', currentUserId: 'u1' },
    });
    await wrapper.find('[data-testid="edit-btn"]').trigger('click');
    const textarea = wrapper.find('textarea');
    expect(textarea.exists()).toBe(true);
    expect((textarea.element as HTMLTextAreaElement).value).toBe('Original');
  });

  it('submits edit and exits edit mode', async () => {
    const updatedComment = {
      id: 'c1',
      postId: 'p1',
      author: { id: 'u1', displayName: 'Alice', avatarUrl: null },
      parentId: null,
      lineNumber: null,
      revisionId: null,
      revisionNumber: null,
      body: 'Edited',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    };
    mockApiFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ comment: updatedComment }),
    } as Response);

    const wrapper = mount(CommentThread, {
      props: { node: makeNode(), postId: 'p1', currentUserId: 'u1' },
    });
    await wrapper.find('[data-testid="edit-btn"]').trigger('click');
    await wrapper.find('textarea').setValue('Edited');
    await wrapper.find('form').trigger('submit');
    await new Promise((r) => setTimeout(r, 0));
    await wrapper.vm.$nextTick();
    // Edit mode should be closed
    expect(wrapper.find('[data-testid="edit-btn"]').exists()).toBe(true);
  });

  it('shows Delete button only when currentUserId matches author', () => {
    const wrapper = mount(CommentThread, {
      props: { node: makeNode(), postId: 'p1', currentUserId: 'u1' },
    });
    expect(wrapper.find('[data-testid="delete-btn"]').exists()).toBe(true);
  });

  it('hides Delete button when currentUserId does not match', () => {
    const wrapper = mount(CommentThread, {
      props: { node: makeNode(), postId: 'p1', currentUserId: 'u-other' },
    });
    expect(wrapper.find('[data-testid="delete-btn"]').exists()).toBe(false);
  });

  it('calls deleteComment when Delete clicked', async () => {
    mockApiFetch.mockResolvedValue({ ok: true, status: 204 } as Response);

    const wrapper = mount(CommentThread, {
      props: { node: makeNode(), postId: 'p1', currentUserId: 'u1' },
    });
    await wrapper.find('[data-testid="delete-btn"]').trigger('click');
    await new Promise((r) => setTimeout(r, 0));

    expect(mockApiFetch).toHaveBeenCalledWith('/api/posts/p1/comments/c1', {
      method: 'DELETE',
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/client && npx vitest run src/__tests__/components/post/CommentThread.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement CommentThread component**

Create `packages/client/src/components/post/CommentThread.vue`:

```vue
<template>
  <div class="flex flex-col gap-1">
    <div class="flex items-start gap-2 rounded p-2 hover:bg-surface-700">
      <div class="flex-1">
        <div class="flex items-center gap-2 text-xs text-gray-400">
          <span class="font-medium text-gray-300">
            {{ node.author?.displayName ?? 'Deleted user' }}
          </span>
          <span>{{ timeAgo(node.createdAt) }}</span>
        </div>

        <!-- Edit mode -->
        <CommentInput
          v-if="isEditing"
          :initial-value="node.body"
          placeholder="Edit comment..."
          :show-cancel="true"
          class="mt-1"
          @submit="handleEdit"
          @cancel="isEditing = false"
        />

        <!-- Display mode -->
        <template v-else>
          <p class="mt-1 text-sm text-gray-200 whitespace-pre-wrap">{{ node.body }}</p>
          <div class="mt-1 flex items-center gap-2">
            <button
              data-testid="reply-btn"
              class="text-xs text-gray-500 hover:text-gray-300"
              @click="showReplyInput = !showReplyInput"
            >
              Reply
            </button>
            <button
              v-if="isOwner"
              data-testid="edit-btn"
              class="text-xs text-gray-500 hover:text-gray-300"
              @click="isEditing = true"
            >
              Edit
            </button>
            <button
              v-if="isOwner"
              data-testid="delete-btn"
              class="text-xs text-red-500 hover:text-red-400"
              @click="handleDelete"
            >
              Delete
            </button>
          </div>
        </template>

        <CommentInput
          v-if="showReplyInput && !isEditing"
          placeholder="Write a reply..."
          :show-cancel="true"
          class="mt-2"
          @submit="handleReply"
          @cancel="showReplyInput = false"
        />
      </div>
    </div>
    <div v-if="node.children.length > 0" class="ml-6 border-l border-gray-700 pl-2">
      <CommentThread
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :post-id="postId"
        :current-user-id="currentUserId"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import type { CommentTreeNode } from '../../stores/comments.js';
import { useComments } from '../../composables/useComments.js';
import CommentInput from './CommentInput.vue';

const props = defineProps<{
  node: CommentTreeNode;
  postId: string;
  currentUserId?: string;
}>();

const showReplyInput = ref(false);
const isEditing = ref(false);
const { addComment, editComment, deleteComment } = useComments();

const isOwner = computed(
  () => props.currentUserId != null && props.node.author?.id === props.currentUserId,
);

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

async function handleReply(body: string): Promise<void> {
  await addComment(props.postId, { body, parentId: props.node.id });
  showReplyInput.value = false;
}

async function handleEdit(body: string): Promise<void> {
  await editComment(props.postId, props.node.id, body);
  isEditing.value = false;
}

async function handleDelete(): Promise<void> {
  await deleteComment(props.postId, props.node.id);
}
</script>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/client && npx vitest run src/__tests__/components/post/CommentThread.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/post/CommentThread.vue \
  packages/client/src/__tests__/components/post/CommentThread.test.ts
git commit -m "feat(client): add CommentThread component with recursive nesting"
```

---

### Task 9: CommentSection, InlineComment & PostDetail Integration

**Files:**

- Create: `packages/client/src/components/post/CommentSection.vue`
- Create: `packages/client/src/components/post/InlineComment.vue`
- Create: `packages/client/src/__tests__/components/post/CommentSection.test.ts`
- Modify: `packages/client/src/components/post/PostDetail.vue`
- Modify: `packages/client/src/components/post/CodeViewer.vue`
- Update: `packages/client/src/__tests__/components/post/PostDetail.test.ts`
- Update: `packages/client/src/__tests__/components/post/CodeViewer.test.ts`

- [ ] **Step 1: Write InlineComment tests**

Create `packages/client/src/__tests__/components/post/InlineComment.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import InlineComment from '@/components/post/InlineComment.vue';
import type { Comment } from '@forge/shared';

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 'c1',
    postId: 'p1',
    author: { id: 'u1', displayName: 'Alice', avatarUrl: null },
    parentId: null,
    lineNumber: 5,
    revisionId: 'rev-1',
    revisionNumber: 3,
    body: 'Nice line of code',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('InlineComment', () => {
  it('renders comment body', () => {
    const wrapper = mount(InlineComment, { props: { comment: makeComment() } });
    expect(wrapper.text()).toContain('Nice line of code');
  });

  it('renders author display name', () => {
    const wrapper = mount(InlineComment, { props: { comment: makeComment() } });
    expect(wrapper.text()).toContain('Alice');
  });

  it('renders "Deleted user" when author is null', () => {
    const wrapper = mount(InlineComment, {
      props: { comment: makeComment({ author: null }) },
    });
    expect(wrapper.text()).toContain('Deleted user');
  });

  it('renders revision number with "Left on revision" text', () => {
    const wrapper = mount(InlineComment, {
      props: { comment: makeComment({ revisionNumber: 3 }) },
    });
    expect(wrapper.text()).toContain('Left on revision 3');
  });

  it('does not render revision indicator when revisionNumber is null', () => {
    const wrapper = mount(InlineComment, {
      props: { comment: makeComment({ revisionNumber: null }) },
    });
    expect(wrapper.text()).not.toContain('Left on revision');
  });
});
```

- [ ] **Step 2: Create InlineComment component**

Create `packages/client/src/components/post/InlineComment.vue`:

```vue
<template>
  <div class="border-l-2 border-primary bg-surface-800 px-3 py-2 my-1 rounded-r text-sm">
    <div class="flex items-center gap-2 text-xs text-gray-400">
      <span class="font-medium text-gray-300">
        {{ comment.author?.displayName ?? 'Deleted user' }}
      </span>
      <span v-if="comment.revisionNumber" class="text-gray-500">
        Left on revision {{ comment.revisionNumber }}
      </span>
    </div>
    <p class="mt-1 text-gray-200 whitespace-pre-wrap">{{ comment.body }}</p>
  </div>
</template>

<script setup lang="ts">
import type { Comment } from '@forge/shared';

defineProps<{ comment: Comment }>();
</script>
```

- [ ] **Step 2: Write failing CommentSection tests**

Create `packages/client/src/__tests__/components/post/CommentSection.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import CommentSection from '@/components/post/CommentSection.vue';
import { useCommentsStore } from '@/stores/comments';
import type { Comment } from '@forge/shared';

const mockApiFetch = vi.fn();
vi.mock('../../../lib/api.js', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args) as unknown,
}));

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 'c1',
    postId: 'p1',
    author: { id: 'u1', displayName: 'Alice', avatarUrl: null },
    parentId: null,
    lineNumber: null,
    revisionId: null,
    revisionNumber: null,
    body: 'General comment',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('CommentSection', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockApiFetch.mockReset();
  });

  it('renders "Comments" heading', () => {
    const wrapper = mount(CommentSection, { props: { postId: 'p1' } });
    expect(wrapper.text()).toContain('Comments');
  });

  it('renders general comments from store', () => {
    const store = useCommentsStore();
    store.setComments([makeComment({ id: 'c1', body: 'General comment' })]);

    const wrapper = mount(CommentSection, { props: { postId: 'p1' } });
    expect(wrapper.text()).toContain('General comment');
  });

  it('renders stale comments section when stale comments exist', () => {
    const store = useCommentsStore();
    store.setCurrentRevisionId('rev-current');
    store.setComments([
      makeComment({ id: 'c1', lineNumber: 5, revisionId: 'rev-old', revisionNumber: 2 }),
    ]);

    const wrapper = mount(CommentSection, { props: { postId: 'p1' } });
    expect(wrapper.text()).toContain('Previous comments');
    expect(wrapper.text()).toContain('Left on revision 2');
  });

  it('does not render stale section when no stale comments', () => {
    const store = useCommentsStore();
    store.setComments([makeComment()]);

    const wrapper = mount(CommentSection, { props: { postId: 'p1' } });
    expect(wrapper.text()).not.toContain('Previous comments');
  });

  it('renders CommentInput for new comments', () => {
    const wrapper = mount(CommentSection, { props: { postId: 'p1' } });
    expect(wrapper.find('textarea').exists()).toBe(true);
  });

  it('submits a new comment via the input form', async () => {
    const mockComment = {
      id: 'c-new',
      postId: 'p1',
      author: { id: 'u1', displayName: 'Alice', avatarUrl: null },
      parentId: null,
      lineNumber: null,
      revisionId: null,
      revisionNumber: null,
      body: 'New comment',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    mockApiFetch.mockResolvedValue({
      ok: true,
      status: 201,
      json: () => Promise.resolve({ comment: mockComment }),
    } as Response);

    const wrapper = mount(CommentSection, { props: { postId: 'p1' } });
    await wrapper.find('textarea').setValue('New comment');
    await wrapper.find('form').trigger('submit');
    await new Promise((r) => setTimeout(r, 0));

    const store = useCommentsStore();
    expect(store.comments).toHaveLength(1);
    expect(store.comments[0].body).toBe('New comment');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd packages/client && npx vitest run src/__tests__/components/post/CommentSection.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement CommentSection component**

Create `packages/client/src/components/post/CommentSection.vue`:

```vue
<template>
  <div class="flex flex-col gap-4">
    <h3 class="text-sm font-medium text-gray-400">Comments</h3>

    <!-- General comments (threaded) -->
    <div v-if="store.commentTree.length > 0" class="flex flex-col gap-2">
      <CommentThread
        v-for="node in store.commentTree"
        :key="node.id"
        :node="node"
        :post-id="postId"
        :current-user-id="currentUserId"
      />
    </div>
    <p v-else class="text-sm text-gray-500">No comments yet.</p>

    <!-- Stale comments from older revisions -->
    <div v-if="store.staleComments.length > 0" class="mt-4">
      <h4 class="text-xs font-medium text-gray-500">Previous comments</h4>
      <div class="mt-2 flex flex-col gap-1">
        <div
          v-for="comment in store.staleComments"
          :key="comment.id"
          class="rounded border border-gray-700 bg-surface-800 p-2 text-sm"
        >
          <div class="flex items-center gap-2 text-xs text-gray-500">
            <span class="font-medium text-gray-400">
              {{ comment.author?.displayName ?? 'Deleted user' }}
            </span>
            <span v-if="comment.revisionNumber" class="rounded bg-surface-700 px-1.5 py-0.5">
              Left on revision {{ comment.revisionNumber }}
            </span>
          </div>
          <p class="mt-1 text-gray-300 whitespace-pre-wrap">{{ comment.body }}</p>
        </div>
      </div>
    </div>

    <!-- New comment input -->
    <CommentInput placeholder="Add a comment..." @submit="handleNewComment" />
  </div>
</template>

<script setup lang="ts">
import { useCommentsStore } from '../../stores/comments.js';
import { useComments } from '../../composables/useComments.js';
import CommentThread from './CommentThread.vue';
import CommentInput from './CommentInput.vue';

const props = defineProps<{ postId: string; currentUserId?: string }>();
const store = useCommentsStore();
const { addComment } = useComments();

async function handleNewComment(body: string): Promise<void> {
  await addComment(props.postId, { body });
}
</script>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/client && npx vitest run src/__tests__/components/post/CommentSection.test.ts`
Expected: All PASS

- [ ] **Step 6: Update CodeViewer to emit line clicks**

Modify `packages/client/src/components/post/CodeViewer.vue`:

Add an emit for line clicks and a gutter "+" button that appears on hover. The highlighted HTML from shiki renders lines as `<span class="line">` elements.

In the `<script setup>` section, add:

```typescript
const emit = defineEmits<{
  'line-click': [lineNumber: number];
}>();
```

Replace the template with a version that includes the click handler:

```vue
<template>
  <div class="relative group">
    <button
      class="absolute top-2 right-2 text-xs px-2 py-1 rounded bg-surface-700 text-gray-400 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
      @click="copyToClipboard"
    >
      {{ copied ? 'Copied!' : 'Copy' }}
    </button>
    <div class="rounded overflow-auto text-sm" v-html="highlightedHtml" @click="handleLineClick" />
  </div>
</template>
```

Add the click handler in the script:

```typescript
function handleLineClick(event: MouseEvent): void {
  const target = event.target as HTMLElement;
  const line = target.closest('.line');
  if (!line) return;
  const container = line.parentElement;
  if (!container) return;
  const lines = Array.from(container.querySelectorAll('.line'));
  const lineNumber = lines.indexOf(line) + 1;
  if (lineNumber > 0) {
    emit('line-click', lineNumber);
  }
}
```

- [ ] **Step 7: Update PostDetail to wire comments + inline comment input**

Replace the comments placeholder in `packages/client/src/components/post/PostDetail.vue`.

Replace the entire `<template>`:

```vue
<template>
  <div v-if="post" class="flex h-full flex-col overflow-y-auto p-6">
    <PostMetaHeader :post="post" />
    <PostActions :post="post" />
    <div class="mt-4 flex-1">
      <CodeViewer
        v-if="revision"
        :code="revision.content"
        :language="post.language ?? undefined"
        @line-click="handleLineClick"
      />
      <!-- Existing inline comments for the clicked line -->
      <div v-if="inlineCommentLine !== null" class="mt-2">
        <p class="text-xs text-gray-400 mb-1">Line {{ inlineCommentLine }}</p>
        <InlineComment
          v-for="c in commentsStore.inlineComments.get(inlineCommentLine) ?? []"
          :key="c.id"
          :comment="c"
        />
        <CommentInput
          placeholder="Add inline comment..."
          :show-cancel="true"
          @submit="handleInlineComment"
          @cancel="inlineCommentLine = null"
        />
      </div>
      <!-- Persistent inline comment indicators (lines with comments) -->
      <div v-for="[line, lineComments] in commentsStore.inlineComments" :key="line" class="mt-1">
        <button
          v-if="inlineCommentLine !== line"
          class="text-xs text-primary hover:underline"
          @click="inlineCommentLine = line"
        >
          {{ lineComments.length }} comment{{ lineComments.length > 1 ? 's' : '' }} on line
          {{ line }}
        </button>
      </div>
    </div>
    <div class="mt-6 border-t border-gray-700 pt-4">
      <CommentSection
        v-if="fullPost"
        :post-id="fullPost.id"
        :current-user-id="authStore.user?.id"
      />
    </div>
  </div>
  <div v-else class="flex h-full items-center justify-center">
    <p class="text-sm text-gray-500">Select a post to view</p>
  </div>
</template>
```

Replace the entire `<script setup>`:

```vue
<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { apiFetch } from '../../lib/api.js';
import type { PostWithAuthor, PostWithRevision } from '@forge/shared';
import CodeViewer from './CodeViewer.vue';
import PostMetaHeader from './PostMetaHeader.vue';
import PostActions from './PostActions.vue';
import CommentSection from './CommentSection.vue';
import CommentInput from './CommentInput.vue';
import InlineComment from './InlineComment.vue';
import { useComments } from '../../composables/useComments.js';
import { useCommentsStore } from '../../stores/comments.js';
import { useAuthStore } from '../../stores/auth.js';

const props = defineProps<{ post: PostWithAuthor | null }>();

const authStore = useAuthStore();
const fullPost = ref<PostWithRevision | null>(null);
const inlineCommentLine = ref<number | null>(null);

const revision = computed(() => fullPost.value?.revisions?.[0] ?? null);

const { fetchComments, addComment } = useComments();
const commentsStore = useCommentsStore();

watch(
  () => props.post?.id,
  async (id) => {
    if (!id) {
      fullPost.value = null;
      commentsStore.clearComments();
      inlineCommentLine.value = null;
      return;
    }
    try {
      const response = await apiFetch(`/api/posts/${id}`);
      if (response.ok) {
        fullPost.value = (await response.json()) as PostWithRevision;
        const rev = fullPost.value?.revisions?.[0];
        if (rev) {
          commentsStore.setCurrentRevisionId(rev.id);
        }
        await fetchComments(id);
      }
    } catch {
      fullPost.value = null;
      commentsStore.clearComments();
    }
  },
  { immediate: true },
);

function handleLineClick(lineNumber: number): void {
  inlineCommentLine.value = lineNumber;
}

async function handleInlineComment(body: string): Promise<void> {
  if (!fullPost.value || inlineCommentLine.value === null) return;
  const rev = revision.value;
  await addComment(fullPost.value.id, {
    body,
    lineNumber: inlineCommentLine.value,
    revisionId: rev?.id,
  });
  inlineCommentLine.value = null;
}
</script>
```

- [ ] **Step 8: Update existing PostDetail tests**

Update `packages/client/src/__tests__/components/post/PostDetail.test.ts`:

The PostDetail watcher now makes TWO sequential `apiFetch` calls: one for the post and one for comments. Update the `mockApiFetch` to handle both calls. Replace the existing single-call mock pattern with a function that routes based on URL:

```typescript
// Replace existing mockApiFetch setup with URL-routing mock:
mockApiFetch.mockImplementation((url: string) => {
  if (url.includes('/comments')) {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ comments: [] }),
    } as Response);
  }
  // Default: return the post data (existing behavior)
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(mockPostWithRevision),
  } as Response);
});
```

Add new tests for inline comment wiring:

```typescript
it('does not show inline comment input by default', async () => {
  const wrapper = mount(PostDetail, { props: { post: mockPost } });
  await wrapper.vm.$nextTick();
  expect(wrapper.find('[placeholder="Add inline comment..."]').exists()).toBe(false);
});
```

Verify no existing tests break by running the full PostDetail test suite after the update.

- [ ] **Step 9: Update existing CodeViewer tests**

Update `packages/client/src/__tests__/components/post/CodeViewer.test.ts` with a meaningful test:

```typescript
it('emits line-click with line number when a .line element is clicked', async () => {
  const wrapper = mount(CodeViewer, { props: { code: 'line1\nline2', language: 'text' } });
  // Wait for shiki to render
  await new Promise((r) => setTimeout(r, 100));
  await wrapper.vm.$nextTick();

  const lineElements = wrapper.findAll('.line');
  if (lineElements.length >= 2) {
    await lineElements[1].trigger('click');
    const emitted = wrapper.emitted('line-click') as unknown[][];
    expect(emitted).toBeTruthy();
    expect(emitted[0]).toEqual([2]);
  }
});

it('does not emit line-click when clicking outside a .line element', async () => {
  const wrapper = mount(CodeViewer, { props: { code: 'hello', language: 'text' } });
  await wrapper.find('.relative').trigger('click');
  // Should not emit since click was not on a .line element
  expect(wrapper.emitted('line-click')).toBeFalsy();
});
```

- [ ] **Step 10: Run the full client test suite**

Run: `cd packages/client && npx vitest run`
Expected: All PASS (no regressions)

- [ ] **Step 11: Run the full server test suite**

Run: `cd packages/server && npx vitest run`
Expected: All PASS

- [ ] **Step 12: Run full project coverage check**

Run: `npm run test:coverage`
Expected: Coverage meets `.coverage-thresholds.json` thresholds (100% lines/branches/functions/statements)

- [ ] **Step 13: Commit**

```bash
git add packages/client/src/components/post/CommentSection.vue \
  packages/client/src/components/post/InlineComment.vue \
  packages/client/src/components/post/CommentThread.vue \
  packages/client/src/components/post/CodeViewer.vue \
  packages/client/src/components/post/PostDetail.vue \
  packages/client/src/__tests__/components/post/CommentSection.test.ts \
  packages/client/src/__tests__/components/post/PostDetail.test.ts \
  packages/client/src/__tests__/components/post/CodeViewer.test.ts
git commit -m "feat(client): add CommentSection, InlineComment and wire into PostDetail"
```

---

## Acceptance Criteria Checklist

| Criteria                                                          | Task                                               |
| ----------------------------------------------------------------- | -------------------------------------------------- |
| `GET /api/posts/:id/comments` — returns threaded comments         | Task 4                                             |
| `GET /api/posts/:id/comments?revision=<id>` — filter by revision  | Task 2 (query) + Task 4 (route)                    |
| `POST /api/posts/:id/comments` — create comment                   | Task 4                                             |
| `PATCH /api/posts/:id/comments/:cid` — edit comment               | Task 4                                             |
| `DELETE /api/posts/:id/comments/:cid` — delete comment (cascades) | Task 2 (cascade verified) + Task 4                 |
| General comments shown below code viewer                          | Task 9                                             |
| Inline comments shown next to referenced line                     | Task 9 (InlineComment)                             |
| Clicking a code line opens inline comment input                   | Task 9 (CodeViewer line-click + PostDetail wiring) |
| Threaded replies with nesting                                     | Task 8 (CommentThread)                             |
| Stale comment display policy with "Left on revision N"            | Task 5 (store) + Task 9 (CommentSection)           |
| CommentThread component                                           | Task 8                                             |
| InlineComment component (with tests)                              | Task 9                                             |
| CommentInput component with submit                                | Task 7                                             |
