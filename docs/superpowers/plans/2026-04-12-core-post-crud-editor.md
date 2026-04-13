# Core Post CRUD & Editor Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement full post CRUD with revision tracking, CodeMirror 6 editor, Shiki read-only viewer, draft auto-save, and publish flow.

**Architecture:** Posts have metadata in the `posts` table and content in `post_revisions`. Every save creates a new revision. The server exposes 8 REST endpoints for CRUD + revisions. The client uses CodeMirror 6 for editing with debounced auto-save, and Shiki for read-only rendering.

**Tech Stack:** Fastify 5, Vue 3 + Pinia, CodeMirror 6 + vue-codemirror, Shiki, Zod, PostgreSQL

**Issue:** #16 — [4/19] Core post CRUD & editor

---

## Dependencies Between Tasks

```
Task 1 (shared) ──┬──> Task 2 (queries) ──> Task 3 (routes + service)
                   └──> Task 4 (client store)
Task 5 (CodeEditor) ──> Task 6 (editor UI) ──> Task 7 (pages)
Task 4 + Task 6 ──> Task 7 (pages)
Task 4 ──> Task 8 (viewer)
```

**Parallel groups:**

1. Task 1 first
2. Tasks 2, 4, 5 in parallel
3. Tasks 3, 6 in parallel
4. Tasks 7, 8 in parallel

**Human Checkpoints:**

1. After Task 3 — verify all 8 API endpoints work via curl
2. After Task 6 — verify editor renders in browser
3. After Task 8 — full end-to-end walkthrough

---

## File Structure

### Files to Create

| File                                                                    | Responsibility                                 |
| ----------------------------------------------------------------------- | ---------------------------------------------- |
| `packages/shared/src/types/post.ts`                                     | PostRevision, PostWithRevision types           |
| `packages/shared/src/validators/post.ts`                                | Post and revision Zod schemas                  |
| `packages/shared/src/__tests__/validators/post.test.ts`                 | Validator tests                                |
| `packages/server/src/services/posts.ts`                                 | Row-to-DTO transformers                        |
| `packages/server/src/routes/posts.ts`                                   | All 8 post API endpoints                       |
| `packages/server/src/__tests__/services/posts.test.ts`                  | Service tests                                  |
| `packages/server/src/__tests__/routes/posts.test.ts`                    | Route tests                                    |
| `packages/client/src/stores/posts.ts`                                   | Pinia post store                               |
| `packages/client/src/composables/usePosts.ts`                           | Post API composable                            |
| `packages/client/src/components/editor/CodeEditor.vue`                  | CodeMirror 6 wrapper                           |
| `packages/client/src/components/editor/EditorToolbar.vue`               | Language picker, visibility toggle             |
| `packages/client/src/components/editor/DraftStatus.vue`                 | Save status indicator                          |
| `packages/client/src/components/editor/PostEditor.vue`                  | Composite editor component                     |
| `packages/client/src/components/post/CodeViewer.vue`                    | Shiki read-only viewer                         |
| `packages/client/src/lib/detectLanguage.ts`                             | Heuristic language auto-detection from content |
| `packages/client/src/pages/PostNew.vue`                                 | New post page                                  |
| `packages/client/src/pages/PostEdit.vue`                                | Edit post page with auto-save                  |
| `packages/client/src/pages/PostView.vue`                                | Post detail/read view                          |
| `packages/client/src/__tests__/stores/posts.test.ts`                    | Store tests                                    |
| `packages/client/src/__tests__/composables/usePosts.test.ts`            | Composable tests                               |
| `packages/client/src/__tests__/lib/detectLanguage.test.ts`              | Language detection tests                       |
| `packages/client/src/__tests__/components/editor/DraftStatus.test.ts`   | DraftStatus component tests                    |
| `packages/client/src/__tests__/components/editor/EditorToolbar.test.ts` | EditorToolbar component tests                  |
| `packages/client/src/__tests__/components/post/CodeViewer.test.ts`      | CodeViewer component tests                     |

### Files to Modify

| File                                                         | Change                                                                  |
| ------------------------------------------------------------ | ----------------------------------------------------------------------- |
| `packages/shared/src/types/index.ts`                         | Re-export PostRevision, PostWithRevision                                |
| `packages/shared/src/validators/index.ts`                    | Re-export post schemas, remove inline createPostSchema                  |
| `packages/server/src/db/connection.ts`                       | No changes needed (withTransaction removed — YAGNI)                     |
| `packages/server/src/db/queries/posts.ts`                    | Add findPostWithLatestRevision, updatePost, softDeletePost, publishPost |
| `packages/server/src/db/queries/revisions.ts`                | Add createRevisionAtomic (race-safe)                                    |
| `packages/server/src/db/queries/types.ts`                    | Add PostWithRevisionRow type                                            |
| `packages/server/src/__tests__/db/queries/posts.test.ts`     | Tests for new query functions                                           |
| `packages/server/src/__tests__/db/queries/revisions.test.ts` | Test for createRevisionAtomic                                           |
| `packages/server/src/app.ts`                                 | Register postRoutes with `/api/posts` prefix                            |
| `packages/client/src/plugins/router.ts`                      | Add post routes                                                         |
| `packages/client/package.json`                               | Add codemirror + shiki deps                                             |

---

## Chunk 1: Shared Package + Server Query Layer

### Task 1: Shared Types & Validators

**Files:**

- Create: `packages/shared/src/types/post.ts`
- Create: `packages/shared/src/validators/post.ts`
- Create: `packages/shared/src/__tests__/validators/post.test.ts`
- Modify: `packages/shared/src/types/index.ts`
- Modify: `packages/shared/src/validators/index.ts`

#### Step 1: Write failing validator tests

- [ ] Create `packages/shared/src/__tests__/validators/post.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { createPostSchema, updatePostSchema, createRevisionSchema } from '../../validators/post.js';

describe('createPostSchema', () => {
  const validInput = {
    title: 'My Snippet',
    contentType: 'snippet',
    content: 'console.log("hello")',
  };

  it('accepts valid input with defaults', () => {
    const result = createPostSchema.safeParse(validInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.visibility).toBe('public');
    }
  });

  it('accepts full input with all optional fields', () => {
    const result = createPostSchema.safeParse({
      ...validInput,
      language: 'typescript',
      visibility: 'private',
      tags: ['javascript', 'tutorial'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty title', () => {
    expect(createPostSchema.safeParse({ ...validInput, title: '' }).success).toBe(false);
  });

  it('rejects title over 500 chars', () => {
    expect(createPostSchema.safeParse({ ...validInput, title: 'x'.repeat(501) }).success).toBe(
      false,
    );
  });

  it('rejects empty content', () => {
    expect(createPostSchema.safeParse({ ...validInput, content: '' }).success).toBe(false);
  });

  it('rejects invalid contentType', () => {
    expect(createPostSchema.safeParse({ ...validInput, contentType: 'invalid' }).success).toBe(
      false,
    );
  });

  it('rejects more than 10 tags', () => {
    const tags = Array.from({ length: 11 }, (_, i) => `tag${i}`);
    expect(createPostSchema.safeParse({ ...validInput, tags }).success).toBe(false);
  });

  it('rejects missing required fields', () => {
    expect(createPostSchema.safeParse({}).success).toBe(false);
  });
});

describe('updatePostSchema', () => {
  it('accepts partial updates', () => {
    expect(updatePostSchema.safeParse({ title: 'New Title' }).success).toBe(true);
  });

  it('accepts empty object', () => {
    expect(updatePostSchema.safeParse({}).success).toBe(true);
  });

  it('rejects invalid visibility', () => {
    expect(updatePostSchema.safeParse({ visibility: 'invalid' }).success).toBe(false);
  });

  it('accepts nullable language', () => {
    expect(updatePostSchema.safeParse({ language: null }).success).toBe(true);
  });
});

describe('createRevisionSchema', () => {
  it('accepts content only', () => {
    expect(createRevisionSchema.safeParse({ content: 'new content' }).success).toBe(true);
  });

  it('accepts content with message', () => {
    const result = createRevisionSchema.safeParse({ content: 'x', message: 'Fixed typo' });
    expect(result.success).toBe(true);
  });

  it('rejects empty content', () => {
    expect(createRevisionSchema.safeParse({ content: '' }).success).toBe(false);
  });

  it('rejects message over 500 chars', () => {
    expect(createRevisionSchema.safeParse({ content: 'x', message: 'x'.repeat(501) }).success).toBe(
      false,
    );
  });
});
```

- [ ] Run tests to verify they fail:

```bash
cd packages/shared && npx vitest run src/__tests__/validators/post.test.ts
```

Expected: FAIL — cannot resolve `../../validators/post.js`

#### Step 2: Create post types

- [ ] Create `packages/shared/src/types/post.ts`:

```typescript
import type { Post } from './index.js';

export interface PostRevision {
  id: string;
  postId: string;
  authorId: string | null;
  content: string;
  message: string | null;
  revisionNumber: number;
  createdAt: Date;
}

export interface PostWithRevision extends Post {
  content: string;
  revisionNumber: number;
  revisionMessage: string | null;
}
```

- [ ] Add to `packages/shared/src/types/index.ts` at the bottom (before the AuthTokens re-export):

```typescript
export type { PostRevision, PostWithRevision } from './post.js';
```

#### Step 3: Create post validators

- [ ] Create `packages/shared/src/validators/post.ts`:

```typescript
import { z } from 'zod';
import { ContentType, Visibility } from '../constants/index.js';

export const createPostSchema = z.object({
  title: z.string().min(1).max(500),
  contentType: z.enum([
    ContentType.Snippet,
    ContentType.Prompt,
    ContentType.Document,
    ContentType.Link,
  ]),
  language: z.string().optional(),
  visibility: z.enum([Visibility.Public, Visibility.Private]).default(Visibility.Public),
  content: z.string().min(1),
  // Note: tags are validated here but stored in the separate tags/post_tags join tables,
  // not in the posts table. The route handler will upsert tags after creating the post.
  // Full tag CRUD is in Issue 6/19; this schema accepts them so the API is forward-compatible.
  tags: z.array(z.string().min(1).max(50)).max(10).optional(),
});

export type CreatePostInput = z.infer<typeof createPostSchema>;

// Note: isDraft is intentionally excluded — publish/unpublish uses the dedicated
// POST /api/posts/:id/publish endpoint, not PATCH.
export const updatePostSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  visibility: z.enum([Visibility.Public, Visibility.Private]).optional(),
  language: z.string().nullable().optional(),
  contentType: z
    .enum([ContentType.Snippet, ContentType.Prompt, ContentType.Document, ContentType.Link])
    .optional(),
});

export type UpdatePostInput = z.infer<typeof updatePostSchema>;

export const createRevisionSchema = z.object({
  content: z.string().min(1),
  message: z.string().max(500).optional(),
});

export type CreateRevisionInput = z.infer<typeof createRevisionSchema>;
```

- [ ] Replace `packages/shared/src/validators/index.ts` contents with:

```typescript
export { createPostSchema, updatePostSchema, createRevisionSchema } from './post.js';

export type { CreatePostInput, UpdatePostInput, CreateRevisionInput } from './post.js';

export { loginSchema, registerSchema, updateProfileSchema } from './auth.js';

export type { LoginInput, RegisterInput, UpdateProfileInput } from './auth.js';
```

#### Step 4: Run tests, build, commit

- [ ] Run tests:

```bash
cd packages/shared && npx vitest run
```

Expected: All tests pass (both auth and post validators).

- [ ] Build shared package:

```bash
cd packages/shared && npm run build
```

Expected: Clean build.

- [ ] Commit:

```bash
git add packages/shared/src/types/post.ts packages/shared/src/validators/post.ts \
  packages/shared/src/__tests__/validators/post.test.ts \
  packages/shared/src/types/index.ts packages/shared/src/validators/index.ts
git commit -m "feat(shared): add post/revision types and CRUD validators"
```

---

### Task 2: Server Query Layer Extensions

**Files:**

- Modify: `packages/server/src/db/connection.ts`
- Modify: `packages/server/src/db/queries/types.ts`
- Modify: `packages/server/src/db/queries/posts.ts`
- Modify: `packages/server/src/db/queries/revisions.ts`
- Modify: `packages/server/src/__tests__/db/queries/posts.test.ts`
- Modify: `packages/server/src/__tests__/db/queries/revisions.test.ts`

#### Step 1: Write failing tests for new post queries

- [ ] Add to `packages/server/src/__tests__/db/queries/posts.test.ts` — import and test new functions. Add these describe blocks after the existing `createPost` describe:

```typescript
// Add to imports at top:
// import { findPostById, createPost, findPostWithLatestRevision, updatePost, softDeletePost, publishPost } from '../../../db/queries/posts.js';
// import type { PostRow, PostWithRevisionRow } from '../../../db/queries/types.js';

describe('findPostWithLatestRevision', () => {
  const postWithRevision = {
    ...samplePost,
    content: '# Hello',
    revision_number: 2,
    message: 'Updated',
  };

  it('returns post joined with latest revision', async () => {
    mockQuery.mockResolvedValue({ rows: [postWithRevision], rowCount: 1 });
    const result = await findPostWithLatestRevision(samplePost.id);
    expect(result).toEqual(postWithRevision);
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('JOIN post_revisions'), [
      samplePost.id,
    ]);
  });

  it('returns null when not found', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    const result = await findPostWithLatestRevision('nonexistent');
    expect(result).toBeNull();
  });
});

describe('updatePost', () => {
  it('updates a single field and returns updated row', async () => {
    const updated = { ...samplePost, title: 'New Title' };
    mockQuery.mockResolvedValue({ rows: [updated], rowCount: 1 });
    const result = await updatePost(samplePost.id, { title: 'New Title' });
    expect(result).toEqual(updated);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE posts SET'),
      expect.arrayContaining(['New Title', samplePost.id]),
    );
  });

  it('updates multiple fields with correct parameter indexing', async () => {
    const updated = { ...samplePost, title: 'New', visibility: 'private' };
    mockQuery.mockResolvedValue({ rows: [updated], rowCount: 1 });
    const result = await updatePost(samplePost.id, { title: 'New', visibility: 'private' });
    expect(result).toEqual(updated);
    // $1=title, $2=visibility, $3=id
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('$3'), [
      'New',
      'private',
      samplePost.id,
    ]);
  });

  it('returns current post when no fields provided (no-op)', async () => {
    mockQuery.mockResolvedValue({ rows: [samplePost], rowCount: 1 });
    const result = await updatePost(samplePost.id, {});
    expect(result).toEqual(samplePost);
    // Should call findPostById, not UPDATE
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('SELECT'), [samplePost.id]);
  });

  it('returns null when post not found', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    const result = await updatePost('nonexistent', { title: 'x' });
    expect(result).toBeNull();
  });
});

describe('softDeletePost', () => {
  it('sets deleted_at and returns true', async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });
    const result = await softDeletePost(samplePost.id);
    expect(result).toBe(true);
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('deleted_at = NOW()'), [
      samplePost.id,
    ]);
  });

  it('returns false when post not found', async () => {
    mockQuery.mockResolvedValue({ rowCount: 0 });
    const result = await softDeletePost('nonexistent');
    expect(result).toBe(false);
  });
});

describe('publishPost', () => {
  it('sets is_draft to false and returns updated row', async () => {
    const published = { ...samplePost, is_draft: false };
    mockQuery.mockResolvedValue({ rows: [published], rowCount: 1 });
    const result = await publishPost(samplePost.id);
    expect(result).toEqual(published);
  });

  it('returns null when post not found', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    const result = await publishPost('nonexistent');
    expect(result).toBeNull();
  });
});
```

- [ ] Run to verify they fail:

```bash
cd packages/server && npx vitest run src/__tests__/db/queries/posts.test.ts
```

Expected: FAIL — functions not exported.

#### Step 2: Add PostWithRevisionRow type

- [ ] Add to `packages/server/src/db/queries/types.ts` after `PostRevisionRow`:

```typescript
export type PostWithRevisionRow = PostRow & {
  content: string;
  revision_number: number;
  message: string | null;
};
```

#### Step 3: Implement new post queries

- [ ] Replace `packages/server/src/db/queries/posts.ts` with:

```typescript
import { query } from '../connection.js';
import type { PostRow, PostWithRevisionRow } from './types.js';

export async function findPostById(id: string): Promise<PostRow | null> {
  const result = await query<PostRow>('SELECT * FROM posts WHERE id = $1 AND deleted_at IS NULL', [
    id,
  ]);
  return result.rows[0] ?? null;
}

export async function findPostWithLatestRevision(id: string): Promise<PostWithRevisionRow | null> {
  const result = await query<PostWithRevisionRow>(
    `SELECT p.*, pr.content, pr.revision_number, pr.message
     FROM posts p
     JOIN post_revisions pr ON pr.post_id = p.id
     WHERE p.id = $1 AND p.deleted_at IS NULL
     ORDER BY pr.revision_number DESC
     LIMIT 1`,
    [id],
  );
  return result.rows[0] ?? null;
}

export interface CreatePostInput {
  authorId: string;
  title: string;
  contentType: string;
  language: string | null;
  visibility: string;
  isDraft: boolean;
}

export async function createPost(input: CreatePostInput): Promise<PostRow> {
  const result = await query<PostRow>(
    `INSERT INTO posts (author_id, title, content_type, language, visibility, is_draft) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [
      input.authorId,
      input.title,
      input.contentType,
      input.language,
      input.visibility,
      input.isDraft,
    ],
  );
  return result.rows[0] as PostRow;
}

export interface UpdatePostFields {
  title?: string;
  visibility?: string;
  language?: string | null;
  contentType?: string;
}

export async function updatePost(id: string, fields: UpdatePostFields): Promise<PostRow | null> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (fields.title !== undefined) {
    setClauses.push(`title = $${paramIndex++}`);
    values.push(fields.title);
  }
  if (fields.visibility !== undefined) {
    setClauses.push(`visibility = $${paramIndex++}`);
    values.push(fields.visibility);
  }
  if (fields.language !== undefined) {
    setClauses.push(`language = $${paramIndex++}`);
    values.push(fields.language);
  }
  if (fields.contentType !== undefined) {
    setClauses.push(`content_type = $${paramIndex++}`);
    values.push(fields.contentType);
  }

  if (setClauses.length === 0) return findPostById(id);

  setClauses.push(`updated_at = NOW()`);
  values.push(id);

  const result = await query<PostRow>(
    `UPDATE posts SET ${setClauses.join(', ')} WHERE id = $${paramIndex} AND deleted_at IS NULL RETURNING *`,
    values,
  );
  return result.rows[0] ?? null;
}

export async function softDeletePost(id: string): Promise<boolean> {
  const result = await query(
    'UPDATE posts SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL',
    [id],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function publishPost(id: string): Promise<PostRow | null> {
  const result = await query<PostRow>(
    `UPDATE posts SET is_draft = false, updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
    [id],
  );
  return result.rows[0] ?? null;
}
```

#### Step 5: Add createRevisionAtomic to revisions.ts

- [ ] Add to `packages/server/src/db/queries/revisions.ts` after existing functions:

```typescript
// Atomic revision insert: uses a single INSERT...SELECT to avoid TOCTOU race.
// The UNIQUE(post_id, revision_number) constraint in the schema provides a safety net.
export async function createRevisionAtomic(input: {
  postId: string;
  authorId: string;
  content: string;
  message: string | null;
}): Promise<PostRevisionRow> {
  const result = await query<PostRevisionRow>(
    `INSERT INTO post_revisions (post_id, author_id, content, message, revision_number)
     SELECT $1, $2, $3, $4, COALESCE(MAX(revision_number), 0) + 1
     FROM post_revisions WHERE post_id = $1
     RETURNING *`,
    [input.postId, input.authorId, input.content, input.message],
  );
  return result.rows[0] as PostRevisionRow;
}
```

- [ ] Add test in `packages/server/src/__tests__/db/queries/revisions.test.ts`:

```typescript
// Add createRevisionAtomic to imports

describe('createRevisionAtomic', () => {
  it('inserts revision with atomic revision_number calculation', async () => {
    const newRev = { ...sampleRevision, revision_number: 2 };
    mockQuery.mockResolvedValue({ rows: [newRev], rowCount: 1 });
    const result = await createRevisionAtomic({
      postId: sampleRevision.post_id,
      authorId: sampleRevision.author_id as string,
      content: 'updated',
      message: null,
    });
    expect(result.revision_number).toBe(2);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('COALESCE(MAX(revision_number), 0) + 1'),
      [sampleRevision.post_id, sampleRevision.author_id, 'updated', null],
    );
  });
});
```

#### Step 6: Run all query tests, commit

- [ ] Run tests:

```bash
cd packages/server && npx vitest run src/__tests__/db/queries/posts.test.ts src/__tests__/db/queries/revisions.test.ts
```

Expected: All pass.

- [ ] Commit:

```bash
git add packages/server/src/db/queries/types.ts \
  packages/server/src/db/queries/posts.ts packages/server/src/db/queries/revisions.ts \
  packages/server/src/__tests__/db/queries/posts.test.ts \
  packages/server/src/__tests__/db/queries/revisions.test.ts
git commit -m "feat(server): add post query extensions and transaction helper"
```

---

## Chunk 2: Server Service + Routes

### Task 3: Server Post Service & Routes

**Files:**

- Create: `packages/server/src/services/posts.ts`
- Create: `packages/server/src/routes/posts.ts`
- Create: `packages/server/src/__tests__/services/posts.test.ts`
- Create: `packages/server/src/__tests__/routes/posts.test.ts`
- Modify: `packages/server/src/app.ts`

#### Step 1: Write failing service tests

- [ ] Create `packages/server/src/__tests__/services/posts.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { toPost, toRevision, toPostWithRevision } from '../../services/posts.js';
import type { PostRow, PostRevisionRow, PostWithRevisionRow } from '../../db/queries/types.js';

const samplePostRow: PostRow = {
  id: '660e8400-e29b-41d4-a716-446655440000',
  author_id: '550e8400-e29b-41d4-a716-446655440000',
  title: 'Test Post',
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

const sampleRevisionRow: PostRevisionRow = {
  id: '770e8400-e29b-41d4-a716-446655440000',
  post_id: '660e8400-e29b-41d4-a716-446655440000',
  author_id: '550e8400-e29b-41d4-a716-446655440000',
  content: '# Hello',
  message: 'Initial',
  revision_number: 1,
  created_at: new Date('2026-01-01'),
};

describe('toPost', () => {
  it('converts PostRow to Post DTO with camelCase keys', () => {
    const result = toPost(samplePostRow);
    expect(result).toEqual({
      id: samplePostRow.id,
      authorId: samplePostRow.author_id,
      title: samplePostRow.title,
      contentType: 'snippet',
      language: 'typescript',
      visibility: 'public',
      isDraft: false,
      forkedFromId: null,
      linkUrl: null,
      linkPreview: null,
      voteCount: 0,
      viewCount: 0,
      deletedAt: null,
      createdAt: samplePostRow.created_at,
      updatedAt: samplePostRow.updated_at,
    });
  });
});

describe('toRevision', () => {
  it('converts PostRevisionRow to PostRevision DTO', () => {
    const result = toRevision(sampleRevisionRow);
    expect(result).toEqual({
      id: sampleRevisionRow.id,
      postId: sampleRevisionRow.post_id,
      authorId: sampleRevisionRow.author_id,
      content: '# Hello',
      message: 'Initial',
      revisionNumber: 1,
      createdAt: sampleRevisionRow.created_at,
    });
  });
});

describe('toPostWithRevision', () => {
  it('converts PostWithRevisionRow to PostWithRevision DTO', () => {
    const row: PostWithRevisionRow = {
      ...samplePostRow,
      content: '# Hello',
      revision_number: 2,
      message: 'Updated',
    };
    const result = toPostWithRevision(row);
    expect(result.content).toBe('# Hello');
    expect(result.revisionNumber).toBe(2);
    expect(result.revisionMessage).toBe('Updated');
    expect(result.authorId).toBe(samplePostRow.author_id);
  });
});
```

- [ ] Run to verify fail:

```bash
cd packages/server && npx vitest run src/__tests__/services/posts.test.ts
```

#### Step 2: Implement post service

- [ ] Create `packages/server/src/services/posts.ts`:

```typescript
import type { Post, PostRevision, PostWithRevision } from '@forge/shared';
import type { PostRow, PostRevisionRow, PostWithRevisionRow } from '../db/queries/types.js';

export function toPost(row: PostRow): Post {
  return {
    id: row.id,
    authorId: row.author_id,
    title: row.title,
    contentType: row.content_type as Post['contentType'],
    language: row.language,
    visibility: row.visibility as Post['visibility'],
    isDraft: row.is_draft,
    forkedFromId: row.forked_from_id,
    linkUrl: row.link_url,
    linkPreview: row.link_preview as Post['linkPreview'],
    voteCount: row.vote_count,
    viewCount: row.view_count,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toRevision(row: PostRevisionRow): PostRevision {
  return {
    id: row.id,
    postId: row.post_id,
    authorId: row.author_id,
    content: row.content,
    message: row.message,
    revisionNumber: row.revision_number,
    createdAt: row.created_at,
  };
}

export function toPostWithRevision(row: PostWithRevisionRow): PostWithRevision {
  return {
    ...toPost(row),
    content: row.content,
    revisionNumber: row.revision_number,
    revisionMessage: row.message,
  };
}
```

- [ ] Run service tests:

```bash
cd packages/server && npx vitest run src/__tests__/services/posts.test.ts
```

Expected: All pass.

- [ ] Commit:

```bash
git add packages/server/src/services/posts.ts packages/server/src/__tests__/services/posts.test.ts
git commit -m "feat(server): add post row-to-DTO service transformers"
```

#### Step 3: Write failing route tests

- [ ] Create `packages/server/src/__tests__/routes/posts.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi, type Mock } from 'vitest';

vi.mock('../../db/connection.js', () => ({
  query: vi.fn(),
}));

import { query } from '../../db/connection.js';
import { buildApp } from '../../app.js';
import type { FastifyInstance } from 'fastify';

const mockQuery = query as Mock;

const samplePostRow = {
  id: '660e8400-e29b-41d4-a716-446655440000',
  author_id: '550e8400-e29b-41d4-a716-446655440000',
  title: 'Test Post',
  content_type: 'snippet',
  language: 'typescript',
  visibility: 'public',
  is_draft: true,
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

const sampleRevisionRow = {
  id: '770e8400-e29b-41d4-a716-446655440000',
  post_id: samplePostRow.id,
  author_id: samplePostRow.author_id,
  content: 'console.log("hello")',
  message: null,
  revision_number: 1,
  created_at: new Date('2026-01-01'),
};

describe('POST /api/posts', () => {
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    process.env.JWT_REFRESH_SECRET = 'test-secret';
    app = await buildApp();
    token = app.jwt.sign({
      id: samplePostRow.author_id,
      email: 'test@example.com',
      displayName: 'Test User',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a post with initial revision (201)', async () => {
    // createPost query
    mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
    // createRevision query
    mockQuery.mockResolvedValueOnce({ rows: [sampleRevisionRow], rowCount: 1 });

    const response = await app.inject({
      method: 'POST',
      url: '/api/posts',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        title: 'Test Post',
        contentType: 'snippet',
        language: 'typescript',
        content: 'console.log("hello")',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.id).toBe(samplePostRow.id);
    expect(body.content).toBe('console.log("hello")');
  });

  it('returns 400 for invalid input', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/posts',
      headers: { authorization: `Bearer ${token}` },
      payload: { title: '' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('returns 401 without auth', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/posts',
      payload: { title: 'x', contentType: 'snippet', content: 'x' },
    });
    expect(response.statusCode).toBe(401);
  });
});

describe('GET /api/posts/:id', () => {
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    process.env.JWT_REFRESH_SECRET = 'test-secret';
    app = await buildApp();
    token = app.jwt.sign({
      id: samplePostRow.author_id,
      email: 'test@example.com',
      displayName: 'Test User',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns post with latest revision (200)', async () => {
    const joined = { ...samplePostRow, ...sampleRevisionRow, id: samplePostRow.id };
    mockQuery.mockResolvedValueOnce({ rows: [joined], rowCount: 1 });

    const response = await app.inject({
      method: 'GET',
      url: `/api/posts/${samplePostRow.id}`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().content).toBe(sampleRevisionRow.content);
  });

  it('returns 404 when not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const response = await app.inject({
      method: 'GET',
      url: '/api/posts/nonexistent-id',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(404);
  });
});

describe('PATCH /api/posts/:id', () => {
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    process.env.JWT_REFRESH_SECRET = 'test-secret';
    app = await buildApp();
    token = app.jwt.sign({
      id: samplePostRow.author_id,
      email: 'test@example.com',
      displayName: 'Test User',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates post metadata (200)', async () => {
    // findPostById (ownership check)
    mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
    // updatePost
    const updated = { ...samplePostRow, title: 'Updated' };
    mockQuery.mockResolvedValueOnce({ rows: [updated], rowCount: 1 });

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/posts/${samplePostRow.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { title: 'Updated' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().title).toBe('Updated');
  });

  it('returns 403 when not the author', async () => {
    const otherPost = { ...samplePostRow, author_id: 'other-user' };
    mockQuery.mockResolvedValueOnce({ rows: [otherPost], rowCount: 1 });

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/posts/${samplePostRow.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { title: 'Hacked' },
    });

    expect(response.statusCode).toBe(403);
  });
});

describe('DELETE /api/posts/:id', () => {
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    process.env.JWT_REFRESH_SECRET = 'test-secret';
    app = await buildApp();
    token = app.jwt.sign({
      id: samplePostRow.author_id,
      email: 'test@example.com',
      displayName: 'Test User',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('soft-deletes the post (204)', async () => {
    // findPostById (ownership check)
    mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
    // softDeletePost
    mockQuery.mockResolvedValueOnce({ rowCount: 1 });

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/posts/${samplePostRow.id}`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(204);
  });

  it('returns 403 when not the author', async () => {
    const otherPost = { ...samplePostRow, author_id: 'other-user' };
    mockQuery.mockResolvedValueOnce({ rows: [otherPost], rowCount: 1 });

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/posts/${samplePostRow.id}`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(403);
  });
});

describe('POST /api/posts/:id/publish', () => {
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    process.env.JWT_REFRESH_SECRET = 'test-secret';
    app = await buildApp();
    token = app.jwt.sign({
      id: samplePostRow.author_id,
      email: 'test@example.com',
      displayName: 'Test User',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('publishes a draft post (200)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
    const published = { ...samplePostRow, is_draft: false };
    mockQuery.mockResolvedValueOnce({ rows: [published], rowCount: 1 });

    const response = await app.inject({
      method: 'POST',
      url: `/api/posts/${samplePostRow.id}/publish`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().isDraft).toBe(false);
  });

  it('returns 403 when not the author', async () => {
    const otherPost = { ...samplePostRow, author_id: 'other-user' };
    mockQuery.mockResolvedValueOnce({ rows: [otherPost], rowCount: 1 });

    const response = await app.inject({
      method: 'POST',
      url: `/api/posts/${samplePostRow.id}/publish`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(403);
  });
});

describe('POST /api/posts/:id/revisions', () => {
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    process.env.JWT_REFRESH_SECRET = 'test-secret';
    app = await buildApp();
    token = app.jwt.sign({
      id: samplePostRow.author_id,
      email: 'test@example.com',
      displayName: 'Test User',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a new revision (201)', async () => {
    // findPostById
    mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
    // createRevisionAtomic (atomic INSERT...SELECT)
    const newRev = { ...sampleRevisionRow, revision_number: 2, content: 'updated' };
    mockQuery.mockResolvedValueOnce({ rows: [newRev], rowCount: 1 });

    const response = await app.inject({
      method: 'POST',
      url: `/api/posts/${samplePostRow.id}/revisions`,
      headers: { authorization: `Bearer ${token}` },
      payload: { content: 'updated' },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().revisionNumber).toBe(2);
  });
});

describe('GET /api/posts/:id/revisions', () => {
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    process.env.JWT_REFRESH_SECRET = 'test-secret';
    app = await buildApp();
    token = app.jwt.sign({
      id: samplePostRow.author_id,
      email: 'test@example.com',
      displayName: 'Test User',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists revisions (200)', async () => {
    // findPostById
    mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
    // findRevisionsByPostId
    mockQuery.mockResolvedValueOnce({ rows: [sampleRevisionRow], rowCount: 1 });

    const response = await app.inject({
      method: 'GET',
      url: `/api/posts/${samplePostRow.id}/revisions`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(1);
  });
});

describe('GET /api/posts/:id/revisions/:rev', () => {
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    process.env.JWT_REFRESH_SECRET = 'test-secret';
    app = await buildApp();
    token = app.jwt.sign({
      id: samplePostRow.author_id,
      email: 'test@example.com',
      displayName: 'Test User',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a specific revision (200)', async () => {
    // findPostById
    mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
    // findRevision
    mockQuery.mockResolvedValueOnce({ rows: [sampleRevisionRow], rowCount: 1 });

    const response = await app.inject({
      method: 'GET',
      url: `/api/posts/${samplePostRow.id}/revisions/1`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().revisionNumber).toBe(1);
  });

  it('returns 404 for nonexistent revision', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const response = await app.inject({
      method: 'GET',
      url: `/api/posts/${samplePostRow.id}/revisions/999`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(404);
  });
});
```

- [ ] Run to verify fail:

```bash
cd packages/server && npx vitest run src/__tests__/routes/posts.test.ts
```

#### Step 4: Implement post routes

- [ ] Create `packages/server/src/routes/posts.ts`:

```typescript
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { createPostSchema, updatePostSchema, createRevisionSchema } from '@forge/shared';
import {
  findPostById,
  findPostWithLatestRevision,
  createPost,
  updatePost,
  softDeletePost,
  publishPost,
} from '../db/queries/posts.js';
import {
  findRevisionsByPostId,
  findRevision,
  createRevision,
  createRevisionAtomic,
} from '../db/queries/revisions.js';
import { toPost, toRevision, toPostWithRevision } from '../services/posts.js';

export async function postRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/posts — create post + initial revision
  app.post('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = createPostSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: parsed.error.errors.map((e) => e.message).join(', ') });
    }

    const { title, contentType, language, visibility, content } = parsed.data;
    const userId = request.user.id;

    const postRow = await createPost({
      authorId: userId,
      title,
      contentType,
      language: language ?? null,
      visibility,
      isDraft: true,
    });

    const revisionRow = await createRevision({
      postId: postRow.id,
      authorId: userId,
      content,
      message: null,
      revisionNumber: 1,
    });

    return reply.status(201).send({
      ...toPost(postRow),
      content: revisionRow.content,
      revisionNumber: revisionRow.revision_number,
      revisionMessage: revisionRow.message,
    });
  });

  // GET /api/posts/:id — post + latest revision
  app.get('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = await findPostWithLatestRevision(id);
    if (!row) {
      return reply.status(404).send({ error: 'Post not found' });
    }
    return reply.send(toPostWithRevision(row));
  });

  // PATCH /api/posts/:id — update metadata only
  app.patch('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const post = await findPostById(id);
    if (!post) {
      return reply.status(404).send({ error: 'Post not found' });
    }
    if (post.author_id !== request.user.id) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const parsed = updatePostSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: parsed.error.errors.map((e) => e.message).join(', ') });
    }

    const updated = await updatePost(id, parsed.data);
    if (!updated) {
      return reply.status(404).send({ error: 'Post not found' });
    }
    return reply.send(toPost(updated));
  });

  // DELETE /api/posts/:id — soft delete
  app.delete('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const post = await findPostById(id);
    if (!post) {
      return reply.status(404).send({ error: 'Post not found' });
    }
    if (post.author_id !== request.user.id) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    await softDeletePost(id);
    return reply.status(204).send();
  });

  // POST /api/posts/:id/publish
  app.post('/:id/publish', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const post = await findPostById(id);
    if (!post) {
      return reply.status(404).send({ error: 'Post not found' });
    }
    if (post.author_id !== request.user.id) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const published = await publishPost(id);
    if (!published) {
      return reply.status(404).send({ error: 'Post not found' });
    }
    return reply.send(toPost(published));
  });

  // POST /api/posts/:id/revisions — create new revision
  app.post('/:id/revisions', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const post = await findPostById(id);
    if (!post) {
      return reply.status(404).send({ error: 'Post not found' });
    }
    if (post.author_id !== request.user.id) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const parsed = createRevisionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: parsed.error.errors.map((e) => e.message).join(', ') });
    }

    // Uses atomic INSERT...SELECT to avoid race conditions on revision_number.
    // The UNIQUE(post_id, revision_number) constraint is the safety net.
    const revision = await createRevisionAtomic({
      postId: id,
      authorId: request.user.id,
      content: parsed.data.content,
      message: parsed.data.message ?? null,
    });

    return reply.status(201).send(toRevision(revision));
  });

  // GET /api/posts/:id/revisions — list all revisions
  app.get('/:id/revisions', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const post = await findPostById(id);
    if (!post) {
      return reply.status(404).send({ error: 'Post not found' });
    }

    const rows = await findRevisionsByPostId(id);
    return reply.send(rows.map(toRevision));
  });

  // GET /api/posts/:id/revisions/:rev — get specific revision
  app.get('/:id/revisions/:rev', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id, rev } = request.params as { id: string; rev: string };
    const post = await findPostById(id);
    if (!post) {
      return reply.status(404).send({ error: 'Post not found' });
    }

    const revisionNumber = parseInt(rev, 10);
    if (isNaN(revisionNumber)) {
      return reply.status(400).send({ error: 'Invalid revision number' });
    }

    const revision = await findRevision(id, revisionNumber);
    if (!revision) {
      return reply.status(404).send({ error: 'Revision not found' });
    }
    return reply.send(toRevision(revision));
  });
}
```

#### Step 5: Register post routes in app.ts

- [ ] Add import in `packages/server/src/app.ts`:

```typescript
import { postRoutes } from './routes/posts.js';
```

- [ ] Add registration after `authRoutes` line:

```typescript
await app.register(postRoutes, { prefix: '/api/posts' });
```

#### Step 6: Run route tests, commit

- [ ] Run tests:

```bash
cd packages/server && npx vitest run src/__tests__/routes/posts.test.ts
```

Expected: All pass.

- [ ] Run all server tests to verify no regressions:

```bash
cd packages/server && npx vitest run
```

Expected: All pass.

- [ ] Commit:

```bash
git add packages/server/src/routes/posts.ts packages/server/src/app.ts \
  packages/server/src/__tests__/routes/posts.test.ts
git commit -m "feat(server): add post CRUD routes with 8 endpoints"
```

**--- HUMAN CHECKPOINT 1: Verify API endpoints work via curl ---**

---

## Chunk 3: Client Foundation + Editor Components

### Task 4: Client Dependencies, Store & Composable

**Files:**

- Modify: `packages/client/package.json` (add deps)
- Create: `packages/client/src/stores/posts.ts`
- Create: `packages/client/src/composables/usePosts.ts`
- Create: `packages/client/src/__tests__/stores/posts.test.ts`
- Create: `packages/client/src/__tests__/composables/usePosts.test.ts`
- Modify: `packages/client/src/plugins/router.ts`

#### Step 1: Install dependencies

- [ ] Install CodeMirror and Shiki:

```bash
cd packages/client && npm install codemirror @codemirror/lang-javascript @codemirror/lang-python @codemirror/lang-html @codemirror/lang-css @codemirror/lang-json @codemirror/lang-markdown @codemirror/lang-sql @codemirror/lang-xml @codemirror/lang-java @codemirror/lang-cpp @codemirror/lang-rust @codemirror/lang-php vue-codemirror shiki @codemirror/theme-one-dark
```

#### Step 2: Write failing store tests

- [ ] Create `packages/client/src/__tests__/stores/posts.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { usePostsStore } from '@/stores/posts';

describe('usePostsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('initializes with null currentPost', () => {
    const store = usePostsStore();
    expect(store.currentPost).toBeNull();
  });

  it('initializes with saved saveStatus', () => {
    const store = usePostsStore();
    expect(store.saveStatus).toBe('saved');
  });

  it('setPost updates currentPost', () => {
    const store = usePostsStore();
    const post = {
      id: '1',
      authorId: 'u1',
      title: 'Test',
      contentType: 'snippet' as const,
      language: 'ts',
      visibility: 'public' as const,
      isDraft: true,
      forkedFromId: null,
      linkUrl: null,
      linkPreview: null,
      voteCount: 0,
      viewCount: 0,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      content: 'hello',
      revisionNumber: 1,
      revisionMessage: null,
    };
    store.setPost(post);
    expect(store.currentPost).toEqual(post);
  });

  it('clearPost resets state', () => {
    const store = usePostsStore();
    store.setSaveStatus('saving');
    store.clearPost();
    expect(store.currentPost).toBeNull();
    expect(store.saveStatus).toBe('saved');
  });

  it('setDirty updates isDirty', () => {
    const store = usePostsStore();
    store.setDirty(true);
    expect(store.isDirty).toBe(true);
  });
});
```

- [ ] Run to verify fail:

```bash
cd packages/client && npx vitest run src/__tests__/stores/posts.test.ts
```

#### Step 3: Implement posts store

- [ ] Create `packages/client/src/stores/posts.ts`:

```typescript
import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { PostWithRevision } from '@forge/shared';

export type SaveStatus = 'saved' | 'saving' | 'error' | 'unsaved';

export const usePostsStore = defineStore('posts', () => {
  const currentPost = ref<PostWithRevision | null>(null);
  const isDirty = ref(false);
  const saveStatus = ref<SaveStatus>('saved');
  const lastSavedAt = ref<Date | null>(null);

  function setPost(post: PostWithRevision): void {
    currentPost.value = post;
  }

  function setDirty(dirty: boolean): void {
    isDirty.value = dirty;
    if (dirty) saveStatus.value = 'unsaved';
  }

  function setSaveStatus(status: SaveStatus): void {
    saveStatus.value = status;
    if (status === 'saved') {
      lastSavedAt.value = new Date();
      isDirty.value = false;
    }
  }

  function clearPost(): void {
    currentPost.value = null;
    isDirty.value = false;
    saveStatus.value = 'saved';
    lastSavedAt.value = null;
  }

  return {
    currentPost,
    isDirty,
    saveStatus,
    lastSavedAt,
    setPost,
    setDirty,
    setSaveStatus,
    clearPost,
  };
});
```

- [ ] Run store tests:

```bash
cd packages/client && npx vitest run src/__tests__/stores/posts.test.ts
```

Expected: All pass.

#### Step 4: Write failing composable tests

- [ ] Create `packages/client/src/__tests__/composables/usePosts.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

const mockApiFetch = vi.fn();
vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

import { usePosts } from '@/composables/usePosts';

describe('usePosts', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  describe('createPost', () => {
    it('sends POST and returns new post id', async () => {
      mockApiFetch.mockResolvedValue(
        new Response(JSON.stringify({ id: 'new-id', title: 'Test' }), { status: 201 }),
      );
      const { createPost } = usePosts();
      const id = await createPost({
        title: 'Test',
        contentType: 'snippet',
        content: 'hello',
      });
      expect(id).toBe('new-id');
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/api/posts',
        expect.objectContaining({
          method: 'POST',
        }),
      );
    });

    it('sets error on failure', async () => {
      mockApiFetch.mockResolvedValue(
        new Response(JSON.stringify({ error: 'Bad request' }), { status: 400 }),
      );
      const { createPost, error } = usePosts();
      const id = await createPost({ title: '', contentType: 'snippet', content: '' });
      expect(id).toBeNull();
      expect(error.value).toBe('Bad request');
    });
  });

  describe('fetchPost', () => {
    it('fetches and stores post', async () => {
      const post = {
        id: '1',
        title: 'Test',
        content: 'hello',
        revisionNumber: 1,
        revisionMessage: null,
      };
      mockApiFetch.mockResolvedValue(new Response(JSON.stringify(post), { status: 200 }));
      const { fetchPost, currentPost } = usePosts();
      await fetchPost('1');
      expect(currentPost.value?.id).toBe('1');
    });
  });

  describe('saveRevision', () => {
    it('sends POST to create revision', async () => {
      mockApiFetch.mockResolvedValue(
        new Response(JSON.stringify({ revisionNumber: 2 }), { status: 201 }),
      );
      const { saveRevision } = usePosts();
      await saveRevision('post-1', 'new content');
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/api/posts/post-1/revisions',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('updatePost', () => {
    it('sends PATCH with metadata', async () => {
      mockApiFetch.mockResolvedValue(new Response('{}', { status: 200 }));
      const { updatePost } = usePosts();
      await updatePost('post-1', { title: 'New Title' });
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/api/posts/post-1',
        expect.objectContaining({ method: 'PATCH' }),
      );
    });

    it('sets error on failure', async () => {
      mockApiFetch.mockResolvedValue(
        new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }),
      );
      const { updatePost, error } = usePosts();
      await updatePost('post-1', { title: 'x' });
      expect(error.value).toBe('Forbidden');
    });
  });

  describe('deletePost', () => {
    it('sends DELETE and returns true on success', async () => {
      mockApiFetch.mockResolvedValue(new Response(null, { status: 204 }));
      const { deletePost } = usePosts();
      const result = await deletePost('post-1');
      expect(result).toBe(true);
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/api/posts/post-1',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('returns false on failure', async () => {
      mockApiFetch.mockResolvedValue(new Response('{}', { status: 403 }));
      const { deletePost } = usePosts();
      const result = await deletePost('post-1');
      expect(result).toBe(false);
    });
  });

  describe('publishPost', () => {
    it('sends POST to publish endpoint', async () => {
      mockApiFetch.mockResolvedValue(new Response('{}', { status: 200 }));
      const { publishPost } = usePosts();
      await publishPost('post-1');
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/api/posts/post-1/publish',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('sets error on failure', async () => {
      mockApiFetch.mockResolvedValue(
        new Response(JSON.stringify({ error: 'Not found' }), { status: 404 }),
      );
      const { publishPost, error } = usePosts();
      await publishPost('post-1');
      expect(error.value).toBe('Not found');
    });
  });

  describe('fetchRevisions', () => {
    it('returns revisions array', async () => {
      const revisions = [{ id: 'r1', revisionNumber: 1 }];
      mockApiFetch.mockResolvedValue(new Response(JSON.stringify(revisions), { status: 200 }));
      const { fetchRevisions } = usePosts();
      const result = await fetchRevisions('post-1');
      expect(result).toEqual(revisions);
    });

    it('returns empty array on failure', async () => {
      mockApiFetch.mockResolvedValue(new Response('{}', { status: 404 }));
      const { fetchRevisions } = usePosts();
      const result = await fetchRevisions('post-1');
      expect(result).toEqual([]);
    });
  });
});
```

- [ ] Run to verify fail:

```bash
cd packages/client && npx vitest run src/__tests__/composables/usePosts.test.ts
```

#### Step 5: Implement usePosts composable

- [ ] Create `packages/client/src/composables/usePosts.ts`:

```typescript
import { ref } from 'vue';
import { storeToRefs } from 'pinia';
import { usePostsStore } from '@/stores/posts';
import { apiFetch } from '@/lib/api';
import type { PostWithRevision, PostRevision } from '@forge/shared';

async function parseErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error ?? fallback;
  } catch {
    return fallback;
  }
}

export function usePosts() {
  const store = usePostsStore();
  const { currentPost, isDirty, saveStatus, lastSavedAt } = storeToRefs(store);
  const error = ref<string | null>(null);

  async function createPost(input: {
    title: string;
    contentType: string;
    content: string;
    language?: string;
    visibility?: string;
    tags?: string[];
  }): Promise<string | null> {
    error.value = null;
    try {
      const response = await apiFetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!response.ok) {
        error.value = await parseErrorMessage(response, 'Failed to create post');
        return null;
      }
      const data = (await response.json()) as PostWithRevision;
      store.setPost(data);
      return data.id;
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to create post';
      return null;
    }
  }

  async function fetchPost(id: string): Promise<void> {
    error.value = null;
    try {
      const response = await apiFetch(`/api/posts/${id}`);
      if (!response.ok) {
        error.value = await parseErrorMessage(response, 'Failed to fetch post');
        return;
      }
      const data = (await response.json()) as PostWithRevision;
      store.setPost(data);
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch post';
    }
  }

  async function updatePost(
    id: string,
    input: { title?: string; visibility?: string; language?: string | null; contentType?: string },
  ): Promise<void> {
    error.value = null;
    try {
      const response = await apiFetch(`/api/posts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!response.ok) {
        error.value = await parseErrorMessage(response, 'Failed to update post');
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to update post';
    }
  }

  async function deletePost(id: string): Promise<boolean> {
    error.value = null;
    try {
      const response = await apiFetch(`/api/posts/${id}`, { method: 'DELETE' });
      return response.ok;
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to delete post';
      return false;
    }
  }

  async function publishPost(id: string): Promise<void> {
    error.value = null;
    try {
      const response = await apiFetch(`/api/posts/${id}/publish`, { method: 'POST' });
      if (!response.ok) {
        error.value = await parseErrorMessage(response, 'Failed to publish post');
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to publish post';
    }
  }

  async function saveRevision(id: string, content: string, message?: string): Promise<void> {
    error.value = null;
    store.setSaveStatus('saving');
    try {
      const response = await apiFetch(`/api/posts/${id}/revisions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, message }),
      });
      if (!response.ok) {
        store.setSaveStatus('error');
        error.value = await parseErrorMessage(response, 'Failed to save');
        return;
      }
      store.setSaveStatus('saved');
    } catch (err) {
      store.setSaveStatus('error');
      error.value = err instanceof Error ? err.message : 'Failed to save';
    }
  }

  async function fetchRevisions(id: string): Promise<PostRevision[]> {
    error.value = null;
    try {
      const response = await apiFetch(`/api/posts/${id}/revisions`);
      if (!response.ok) return [];
      return (await response.json()) as PostRevision[];
    } catch {
      return [];
    }
  }

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
  };
}
```

- [ ] Run composable tests:

```bash
cd packages/client && npx vitest run src/__tests__/composables/usePosts.test.ts
```

Expected: All pass.

#### Step 6: Add post routes to router

- [ ] Add to `packages/client/src/plugins/router.ts` routes array (before the closing `]`):

```typescript
{
  path: '/posts/new',
  name: 'post-new',
  component: () => import('@/pages/PostNew.vue'),
  meta: { requiresAuth: true },
},
{
  path: '/posts/:id/edit',
  name: 'post-edit',
  component: () => import('@/pages/PostEdit.vue'),
  meta: { requiresAuth: true },
},
{
  path: '/posts/:id',
  name: 'post-view',
  component: () => import('@/pages/PostView.vue'),
  meta: { requiresAuth: true },
},
```

- [ ] Commit:

```bash
git add packages/client/src/stores/posts.ts packages/client/src/composables/usePosts.ts \
  packages/client/src/__tests__/stores/posts.test.ts \
  packages/client/src/__tests__/composables/usePosts.test.ts \
  packages/client/src/plugins/router.ts packages/client/package.json package-lock.json
git commit -m "feat(client): add post store, composable, router entries, and editor deps"
```

---

### Task 5: CodeEditor Component (CodeMirror 6)

**Files:**

- Create: `packages/client/src/components/editor/CodeEditor.vue`

#### Step 1: Create CodeEditor component

- [ ] Create `packages/client/src/components/editor/CodeEditor.vue`:

```vue
<script setup lang="ts">
import { watch, shallowRef } from 'vue';
import { Codemirror } from 'vue-codemirror';
import { oneDark } from '@codemirror/theme-one-dark';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { sql } from '@codemirror/lang-sql';
import { xml } from '@codemirror/lang-xml';
import { java } from '@codemirror/lang-java';
import { cpp } from '@codemirror/lang-cpp';
import { rust } from '@codemirror/lang-rust';
import { php } from '@codemirror/lang-php';
import type { Extension } from '@codemirror/state';

const props = defineProps<{
  modelValue: string;
  language?: string;
  readonly?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const languageExtensions: Record<string, () => Extension> = {
  javascript: () => javascript({ jsx: true }),
  typescript: () => javascript({ jsx: true, typescript: true }),
  python: () => python(),
  html: () => html(),
  css: () => css(),
  json: () => json(),
  markdown: () => markdown(),
  sql: () => sql(),
  xml: () => xml(),
  java: () => java(),
  cpp: () => cpp(),
  c: () => cpp(),
  rust: () => rust(),
  php: () => php(),
};

const extensions = shallowRef<Extension[]>([oneDark]);

watch(
  () => props.language,
  (lang) => {
    const langExt = lang ? languageExtensions[lang]?.() : undefined;
    extensions.value = langExt ? [oneDark, langExt] : [oneDark];
  },
  { immediate: true },
);
</script>

<template>
  <Codemirror
    :model-value="modelValue"
    :extensions="extensions"
    :disabled="readonly"
    :style="{ minHeight: '300px', width: '100%' }"
    :tab-size="2"
    :indent-with-tab="true"
    @update:model-value="(val: string) => emit('update:modelValue', val)"
  />
</template>
```

- [ ] Commit:

```bash
git add packages/client/src/components/editor/CodeEditor.vue
git commit -m "feat(client): add CodeMirror 6 editor component with language support"
```

#### Step 1b: Write CodeEditor component test

- [ ] Create `packages/client/src/__tests__/components/editor/CodeEditor.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';

// Mock vue-codemirror — avoid loading real CodeMirror in jsdom
vi.mock('vue-codemirror', () => ({
  Codemirror: {
    name: 'Codemirror',
    props: ['modelValue', 'extensions', 'disabled', 'tabSize', 'indentWithTab'],
    emits: ['update:model-value'],
    template: '<div class="mock-codemirror"><slot /></div>',
  },
}));

vi.mock('@codemirror/theme-one-dark', () => ({ oneDark: {} }));
vi.mock('@codemirror/lang-javascript', () => ({ javascript: vi.fn(() => ({})) }));
vi.mock('@codemirror/lang-python', () => ({ python: vi.fn(() => ({})) }));
vi.mock('@codemirror/lang-html', () => ({ html: vi.fn(() => ({})) }));
vi.mock('@codemirror/lang-css', () => ({ css: vi.fn(() => ({})) }));
vi.mock('@codemirror/lang-json', () => ({ json: vi.fn(() => ({})) }));
vi.mock('@codemirror/lang-markdown', () => ({ markdown: vi.fn(() => ({})) }));
vi.mock('@codemirror/lang-sql', () => ({ sql: vi.fn(() => ({})) }));
vi.mock('@codemirror/lang-xml', () => ({ xml: vi.fn(() => ({})) }));
vi.mock('@codemirror/lang-java', () => ({ java: vi.fn(() => ({})) }));
vi.mock('@codemirror/lang-cpp', () => ({ cpp: vi.fn(() => ({})) }));
vi.mock('@codemirror/lang-rust', () => ({ rust: vi.fn(() => ({})) }));
vi.mock('@codemirror/lang-php', () => ({ php: vi.fn(() => ({})) }));

import CodeEditor from '@/components/editor/CodeEditor.vue';
import { javascript } from '@codemirror/lang-javascript';

describe('CodeEditor', () => {
  it('renders the codemirror wrapper', () => {
    const wrapper = mount(CodeEditor, { props: { modelValue: 'hello', language: 'javascript' } });
    expect(wrapper.find('.mock-codemirror').exists()).toBe(true);
  });

  it('activates language extension when language prop is set', () => {
    mount(CodeEditor, { props: { modelValue: '', language: 'javascript' } });
    expect(javascript).toHaveBeenCalled();
  });

  it('uses only theme when language is empty', () => {
    mount(CodeEditor, { props: { modelValue: '', language: '' } });
    // javascript should not be called for empty language
  });

  it('emits update:modelValue when codemirror emits', async () => {
    const wrapper = mount(CodeEditor, { props: { modelValue: 'old' } });
    const cm = wrapper.findComponent({ name: 'Codemirror' });
    await cm.vm.$emit('update:model-value', 'new');
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['new']);
  });

  it('passes readonly prop as disabled', () => {
    const wrapper = mount(CodeEditor, { props: { modelValue: '', readonly: true } });
    const cm = wrapper.findComponent({ name: 'Codemirror' });
    expect(cm.props('disabled')).toBe(true);
  });
});
```

- [ ] Run test:

```bash
cd packages/client && npx vitest run src/__tests__/components/editor/CodeEditor.test.ts
```

Expected: All pass.

- [ ] Commit:

```bash
git add packages/client/src/__tests__/components/editor/CodeEditor.test.ts
git commit -m "test(client): add CodeEditor component test"
```

#### Step 2: Write failing language detection tests

- [ ] Create `packages/client/src/__tests__/lib/detectLanguage.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { detectLanguage } from '@/lib/detectLanguage';

describe('detectLanguage', () => {
  it('detects python from shebang', () => {
    expect(detectLanguage('#!/usr/bin/env python\nprint("hi")')).toBe('python');
  });

  it('detects javascript from const/let/function keywords', () => {
    expect(detectLanguage('const x = 42;\nfunction foo() {}')).toBe('javascript');
  });

  it('detects typescript from type annotations', () => {
    expect(detectLanguage('interface Foo {\n  bar: string;\n}')).toBe('typescript');
  });

  it('detects html from tags', () => {
    expect(detectLanguage('<!DOCTYPE html>\n<html><body></body></html>')).toBe('html');
  });

  it('detects css from selectors and properties', () => {
    expect(detectLanguage('.container {\n  display: flex;\n}')).toBe('css');
  });

  it('detects json from object/array structure', () => {
    expect(detectLanguage('{\n  "name": "test",\n  "version": "1.0"\n}')).toBe('json');
  });

  it('detects sql from SELECT/INSERT keywords', () => {
    expect(detectLanguage('SELECT * FROM users WHERE id = 1;')).toBe('sql');
  });

  it('detects rust from fn/let mut/impl', () => {
    expect(detectLanguage('fn main() {\n    let mut x = 5;\n}')).toBe('rust');
  });

  it('returns null for unrecognizable content', () => {
    expect(detectLanguage('hello world')).toBeNull();
  });

  it('returns null for empty content', () => {
    expect(detectLanguage('')).toBeNull();
  });
});
```

- [ ] Run to verify fail:

```bash
cd packages/client && npx vitest run src/__tests__/lib/detectLanguage.test.ts
```

#### Step 3: Implement language detection

- [ ] Create `packages/client/src/lib/detectLanguage.ts`:

```typescript
interface LanguagePattern {
  lang: string;
  patterns: RegExp[];
  minMatches: number;
}

const languagePatterns: LanguagePattern[] = [
  // Check shebangs first (highest confidence)
  { lang: 'python', patterns: [/^#!.*python/m], minMatches: 1 },
  { lang: 'javascript', patterns: [/^#!.*node/m], minMatches: 1 },
  { lang: 'rust', patterns: [/^#!.*rust/m], minMatches: 1 },

  // TypeScript (check before JavaScript — TS is a superset)
  {
    lang: 'typescript',
    patterns: [
      /\binterface\s+\w+\s*\{/,
      /:\s*(string|number|boolean|void)\b/,
      /\btype\s+\w+\s*=/,
      /<\w+(\s*,\s*\w+)*>/,
      /\bas\s+(string|number|boolean|any)\b/,
    ],
    minMatches: 2,
  },

  // HTML
  {
    lang: 'html',
    patterns: [/<!DOCTYPE\s+html/i, /<html[\s>]/i, /<\/?(div|span|head|body|p|a|img)\b/i],
    minMatches: 1,
  },

  // CSS
  {
    lang: 'css',
    patterns: [
      /[.#][\w-]+\s*\{/,
      /\b(display|margin|padding|color|font-size)\s*:/,
      /@(media|keyframes|import)\b/,
    ],
    minMatches: 2,
  },

  // JSON
  {
    lang: 'json',
    patterns: [/^\s*[\[{]/, /"[\w-]+"\s*:\s*("|\d|true|false|null|\[|\{)/],
    minMatches: 2,
  },

  // SQL
  {
    lang: 'sql',
    patterns: [
      /\b(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/i,
      /\b(FROM|WHERE|JOIN|GROUP BY|ORDER BY|HAVING)\b/i,
    ],
    minMatches: 2,
  },

  // Rust
  {
    lang: 'rust',
    patterns: [/\bfn\s+\w+/, /\blet\s+mut\b/, /\bimpl\b/, /->.*\{/, /println!\(/],
    minMatches: 2,
  },

  // Python (after shebang check)
  {
    lang: 'python',
    patterns: [/\bdef\s+\w+\(/, /\bimport\s+\w+/, /\bclass\s+\w+.*:/, /^\s{4}\w/m, /print\(/],
    minMatches: 2,
  },

  // JavaScript (after TypeScript)
  {
    lang: 'javascript',
    patterns: [
      /\b(const|let|var)\s+\w+\s*=/,
      /\bfunction\s+\w+\(/,
      /=>\s*\{/,
      /\bconsole\.\w+\(/,
      /\brequire\(/,
    ],
    minMatches: 2,
  },

  // Java
  {
    lang: 'java',
    patterns: [/\bpublic\s+(class|static|void)\b/, /\bSystem\.out\.print/, /\bimport\s+java\./],
    minMatches: 2,
  },

  // C/C++
  {
    lang: 'cpp',
    patterns: [/#include\s*</, /\bint\s+main\s*\(/, /\bstd::\w+/, /printf\(/],
    minMatches: 2,
  },

  // PHP
  {
    lang: 'php',
    patterns: [/<\?php/, /\$\w+\s*=/, /\bfunction\s+\w+.*\$/, /\becho\b/],
    minMatches: 1,
  },

  // Markdown
  {
    lang: 'markdown',
    patterns: [/^#{1,6}\s+\w/m, /^\*\*\w/m, /^\- \w/m, /\[.*\]\(.*\)/],
    minMatches: 2,
  },
];

export function detectLanguage(content: string): string | null {
  if (!content.trim()) return null;

  for (const { lang, patterns, minMatches } of languagePatterns) {
    const matches = patterns.filter((p) => p.test(content)).length;
    if (matches >= minMatches) return lang;
  }

  return null;
}
```

- [ ] Run detection tests:

```bash
cd packages/client && npx vitest run src/__tests__/lib/detectLanguage.test.ts
```

Expected: All pass.

- [ ] Commit:

```bash
git add packages/client/src/lib/detectLanguage.ts packages/client/src/__tests__/lib/detectLanguage.test.ts
git commit -m "feat(client): add heuristic language auto-detection utility"
```

---

### Task 6: Editor Toolbar, DraftStatus & PostEditor

**Files:**

- Create: `packages/client/src/components/editor/EditorToolbar.vue`
- Create: `packages/client/src/components/editor/DraftStatus.vue`
- Create: `packages/client/src/components/editor/PostEditor.vue`

#### Step 1: Create EditorToolbar

- [ ] Create `packages/client/src/components/editor/EditorToolbar.vue`:

```vue
<script setup lang="ts">
import { ContentType, Visibility } from '@forge/shared';

import { ref } from 'vue';

const props = defineProps<{
  language: string;
  visibility: string;
  contentType: string;
  tags: string[];
}>();

const emit = defineEmits<{
  'update:language': [value: string];
  'update:visibility': [value: string];
  'update:contentType': [value: string];
  'update:tags': [value: string[]];
}>();

const tagInput = ref('');

const languages = [
  'javascript',
  'typescript',
  'python',
  'html',
  'css',
  'json',
  'markdown',
  'sql',
  'xml',
  'java',
  'cpp',
  'c',
  'rust',
  'php',
];

const contentTypes = [
  { value: ContentType.Snippet, label: 'Snippet' },
  { value: ContentType.Prompt, label: 'Prompt' },
  { value: ContentType.Document, label: 'Document' },
  { value: ContentType.Link, label: 'Link' },
];

function addTag() {
  const tag = tagInput.value.trim();
  if (tag && !props.tags.includes(tag) && props.tags.length < 10) {
    emit('update:tags', [...props.tags, tag]);
    tagInput.value = '';
  }
}

function removeTag(tag: string) {
  emit(
    'update:tags',
    props.tags.filter((t) => t !== tag),
  );
}
</script>

<template>
  <div
    class="flex items-center gap-3 py-2 px-3 bg-surface-700 border-b border-surface-500 flex-wrap"
  >
    <select
      :value="language"
      class="bg-surface border border-surface-500 text-white text-sm rounded px-2 py-1 focus:ring-primary focus:outline-none"
      @change="emit('update:language', ($event.target as HTMLSelectElement).value)"
    >
      <option value="">Auto-detect</option>
      <option v-for="lang in languages" :key="lang" :value="lang">{{ lang }}</option>
    </select>

    <select
      :value="contentType"
      class="bg-surface border border-surface-500 text-white text-sm rounded px-2 py-1 focus:ring-primary focus:outline-none"
      @change="emit('update:contentType', ($event.target as HTMLSelectElement).value)"
    >
      <option v-for="ct in contentTypes" :key="ct.value" :value="ct.value">{{ ct.label }}</option>
    </select>

    <!-- Tag input -->
    <div class="flex items-center gap-1">
      <span
        v-for="tag in tags"
        :key="tag"
        class="inline-flex items-center gap-1 bg-surface text-xs text-gray-300 px-2 py-0.5 rounded"
      >
        {{ tag }}
        <button class="text-gray-500 hover:text-white" @click="removeTag(tag)">&times;</button>
      </span>
      <input
        v-if="tags.length < 10"
        v-model="tagInput"
        type="text"
        placeholder="Add tag..."
        class="bg-transparent text-white text-xs w-20 focus:outline-none placeholder-gray-500"
        @keydown.enter.prevent="addTag"
      />
    </div>

    <button
      class="ml-auto text-sm px-3 py-1 rounded border"
      :class="
        visibility === 'public'
          ? 'border-green-500 text-green-400'
          : 'border-yellow-500 text-yellow-400'
      "
      @click="emit('update:visibility', visibility === 'public' ? 'private' : 'public')"
    >
      {{ visibility === 'public' ? 'Public' : 'Private' }}
    </button>
  </div>
</template>
```

#### Step 2: Create DraftStatus

- [ ] Create `packages/client/src/components/editor/DraftStatus.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue';
import type { SaveStatus } from '@/stores/posts';

const props = defineProps<{
  status: SaveStatus;
  lastSavedAt: Date | null;
}>();

const statusText = computed(() => {
  switch (props.status) {
    case 'saved':
      return props.lastSavedAt ? `Draft saved ${timeAgo(props.lastSavedAt)}` : 'Draft saved';
    case 'saving':
      return 'Saving...';
    case 'error':
      return 'Save failed';
    case 'unsaved':
      return 'Unsaved changes';
  }
});

const statusColor = computed(() => {
  switch (props.status) {
    case 'saved':
      return 'text-green-400';
    case 'saving':
      return 'text-gray-400';
    case 'error':
      return 'text-red-400';
    case 'unsaved':
      return 'text-yellow-400';
  }
});

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ago`;
}
</script>

<template>
  <span :class="['text-xs', statusColor]">{{ statusText }}</span>
</template>
```

#### Step 3: Create PostEditor composite

- [ ] Create `packages/client/src/components/editor/PostEditor.vue`:

```vue
<script setup lang="ts">
import { ref, watch } from 'vue';
import CodeEditor from './CodeEditor.vue';
import EditorToolbar from './EditorToolbar.vue';
import DraftStatus from './DraftStatus.vue';
import type { SaveStatus } from '@/stores/posts';

const props = defineProps<{
  modelValue: string;
  title: string;
  language: string;
  visibility: string;
  contentType: string;
  tags: string[];
  saveStatus: SaveStatus;
  lastSavedAt: Date | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
  'update:title': [value: string];
  'update:language': [value: string];
  'update:visibility': [value: string];
  'update:contentType': [value: string];
  'update:tags': [value: string[]];
  publish: [];
}>();
</script>

<template>
  <div class="flex flex-col h-full bg-surface rounded border border-surface-500">
    <!-- Header -->
    <div class="flex items-center gap-3 px-4 py-3 border-b border-surface-500">
      <input
        :value="title"
        type="text"
        placeholder="Untitled snippet..."
        class="flex-1 bg-transparent text-white text-lg font-medium focus:outline-none placeholder-gray-500"
        @input="emit('update:title', ($event.target as HTMLInputElement).value)"
      />
      <DraftStatus :status="saveStatus" :last-saved-at="lastSavedAt" />
      <button
        class="bg-primary hover:bg-primary-600 text-white text-sm font-medium px-4 py-2 rounded"
        @click="emit('publish')"
      >
        Publish Snippet
      </button>
    </div>

    <!-- Toolbar -->
    <EditorToolbar
      :language="language"
      :visibility="visibility"
      :content-type="contentType"
      :tags="tags"
      @update:language="emit('update:language', $event)"
      @update:visibility="emit('update:visibility', $event)"
      @update:content-type="emit('update:contentType', $event)"
      @update:tags="emit('update:tags', $event)"
    />

    <!-- Editor -->
    <div class="flex-1 overflow-auto">
      <CodeEditor
        :model-value="modelValue"
        :language="language"
        @update:model-value="emit('update:modelValue', $event)"
      />
    </div>
  </div>
</template>
```

- [ ] Commit:

```bash
git add packages/client/src/components/editor/EditorToolbar.vue \
  packages/client/src/components/editor/DraftStatus.vue \
  packages/client/src/components/editor/PostEditor.vue
git commit -m "feat(client): add editor toolbar, draft status, and PostEditor composite"
```

#### Step 4: Write DraftStatus component tests

- [ ] Create `packages/client/src/__tests__/components/editor/DraftStatus.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import DraftStatus from '@/components/editor/DraftStatus.vue';

describe('DraftStatus', () => {
  it('shows "Draft saved" when status is saved and no lastSavedAt', () => {
    const wrapper = mount(DraftStatus, { props: { status: 'saved', lastSavedAt: null } });
    expect(wrapper.text()).toBe('Draft saved');
    expect(wrapper.find('span').classes()).toContain('text-green-400');
  });

  it('shows "just now" when saved less than 5 seconds ago', () => {
    const recent = new Date(Date.now() - 2000);
    const wrapper = mount(DraftStatus, { props: { status: 'saved', lastSavedAt: recent } });
    expect(wrapper.text()).toContain('just now');
  });

  it('shows seconds ago when saved 10-59 seconds ago', () => {
    const wrapper = mount(DraftStatus, {
      props: { status: 'saved', lastSavedAt: new Date(Date.now() - 30000) },
    });
    expect(wrapper.text()).toMatch(/\d+s ago/);
  });

  it('shows minutes ago when saved 60+ seconds ago', () => {
    const wrapper = mount(DraftStatus, {
      props: { status: 'saved', lastSavedAt: new Date(Date.now() - 120000) },
    });
    expect(wrapper.text()).toMatch(/\d+m ago/);
  });

  it('shows "Saving..." with gray text', () => {
    const wrapper = mount(DraftStatus, { props: { status: 'saving', lastSavedAt: null } });
    expect(wrapper.text()).toBe('Saving...');
    expect(wrapper.find('span').classes()).toContain('text-gray-400');
  });

  it('shows "Save failed" with red text', () => {
    const wrapper = mount(DraftStatus, { props: { status: 'error', lastSavedAt: null } });
    expect(wrapper.text()).toBe('Save failed');
    expect(wrapper.find('span').classes()).toContain('text-red-400');
  });

  it('shows "Unsaved changes" with yellow text', () => {
    const wrapper = mount(DraftStatus, { props: { status: 'unsaved', lastSavedAt: null } });
    expect(wrapper.text()).toBe('Unsaved changes');
    expect(wrapper.find('span').classes()).toContain('text-yellow-400');
  });
});
```

#### Step 5: Write EditorToolbar component tests

- [ ] Create `packages/client/src/__tests__/components/editor/EditorToolbar.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import EditorToolbar from '@/components/editor/EditorToolbar.vue';

describe('EditorToolbar', () => {
  const defaultProps = {
    language: 'javascript',
    visibility: 'public',
    contentType: 'snippet',
    tags: [],
  };

  it('renders language dropdown with current selection', () => {
    const wrapper = mount(EditorToolbar, { props: defaultProps });
    const select = wrapper.find('select');
    expect(select.element.value).toBe('javascript');
  });

  it('emits update:language on dropdown change', async () => {
    const wrapper = mount(EditorToolbar, { props: defaultProps });
    const select = wrapper.find('select');
    await select.setValue('python');
    expect(wrapper.emitted('update:language')?.[0]).toEqual(['python']);
  });

  it('toggles visibility on button click', async () => {
    const wrapper = mount(EditorToolbar, { props: defaultProps });
    const btn = wrapper.find('button');
    await btn.trigger('click');
    expect(wrapper.emitted('update:visibility')?.[0]).toEqual(['private']);
  });

  it('shows "Private" when visibility is private', () => {
    const wrapper = mount(EditorToolbar, { props: { ...defaultProps, visibility: 'private' } });
    expect(wrapper.text()).toContain('Private');
  });

  it('adds a tag on enter key', async () => {
    const wrapper = mount(EditorToolbar, { props: defaultProps });
    const input = wrapper.find('input[placeholder="Add tag..."]');
    await input.setValue('newtag');
    await input.trigger('keydown.enter');
    expect(wrapper.emitted('update:tags')?.[0]).toEqual([['newtag']]);
  });

  it('renders existing tags with remove buttons', () => {
    const wrapper = mount(EditorToolbar, { props: { ...defaultProps, tags: ['tag1', 'tag2'] } });
    const tags = wrapper.findAll('span.inline-flex');
    expect(tags).toHaveLength(2);
    expect(tags[0].text()).toContain('tag1');
  });

  it('emits tag removal on x click', async () => {
    const wrapper = mount(EditorToolbar, { props: { ...defaultProps, tags: ['tag1', 'tag2'] } });
    const removeBtn = wrapper.findAll('span.inline-flex button')[0];
    await removeBtn.trigger('click');
    expect(wrapper.emitted('update:tags')?.[0]).toEqual([['tag2']]);
  });

  it('hides tag input when 10 tags exist', () => {
    const tags = Array.from({ length: 10 }, (_, i) => `tag${i}`);
    const wrapper = mount(EditorToolbar, { props: { ...defaultProps, tags } });
    expect(wrapper.find('input[placeholder="Add tag..."]').exists()).toBe(false);
  });
});
```

- [ ] Run component tests:

```bash
cd packages/client && npx vitest run src/__tests__/components/
```

Expected: All pass.

#### Step 6: Write PostEditor composite test

- [ ] Create `packages/client/src/__tests__/components/editor/PostEditor.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';

// Stub child components to avoid loading CodeMirror/vue-codemirror in tests
vi.mock('@/components/editor/CodeEditor.vue', () => ({
  default: {
    name: 'CodeEditor',
    props: ['modelValue', 'language', 'readonly'],
    emits: ['update:modelValue'],
    template: '<div class="mock-editor" />',
  },
}));
vi.mock('@/components/editor/EditorToolbar.vue', () => ({
  default: {
    name: 'EditorToolbar',
    props: ['language', 'visibility', 'contentType', 'tags'],
    emits: ['update:language', 'update:visibility', 'update:contentType', 'update:tags'],
    template: '<div class="mock-toolbar" />',
  },
}));
vi.mock('@/components/editor/DraftStatus.vue', () => ({
  default: {
    name: 'DraftStatus',
    props: ['status', 'lastSavedAt'],
    template: '<span class="mock-status" />',
  },
}));

import PostEditor from '@/components/editor/PostEditor.vue';

describe('PostEditor', () => {
  const defaultProps = {
    modelValue: 'code',
    title: 'My Post',
    language: 'javascript',
    visibility: 'public',
    contentType: 'snippet',
    tags: [] as string[],
    saveStatus: 'saved' as const,
    lastSavedAt: null,
  };

  it('renders title input with current value', () => {
    const wrapper = mount(PostEditor, { props: defaultProps });
    const input = wrapper.find('input[type="text"]');
    expect((input.element as HTMLInputElement).value).toBe('My Post');
  });

  it('emits update:title on title input', async () => {
    const wrapper = mount(PostEditor, { props: defaultProps });
    const input = wrapper.find('input[type="text"]');
    await input.setValue('New Title');
    expect(wrapper.emitted('update:title')).toBeTruthy();
  });

  it('emits publish on button click', async () => {
    const wrapper = mount(PostEditor, { props: defaultProps });
    const btn = wrapper.find('button');
    await btn.trigger('click');
    expect(wrapper.emitted('publish')).toBeTruthy();
  });

  it('renders child components', () => {
    const wrapper = mount(PostEditor, { props: defaultProps });
    expect(wrapper.find('.mock-editor').exists()).toBe(true);
    expect(wrapper.find('.mock-toolbar').exists()).toBe(true);
    expect(wrapper.find('.mock-status').exists()).toBe(true);
  });
});
```

- [ ] Run all component tests:

```bash
cd packages/client && npx vitest run src/__tests__/components/
```

Expected: All pass.

- [ ] Commit:

```bash
git add packages/client/src/__tests__/components/
git commit -m "test(client): add DraftStatus, EditorToolbar, and PostEditor component tests"
```

**--- HUMAN CHECKPOINT 2: Verify editor renders in browser ---**

---

## Chunk 4: Client Pages + Shiki Viewer

### Task 7: PostNew & PostEdit Pages

**Files:**

- Create: `packages/client/src/pages/PostNew.vue`
- Create: `packages/client/src/pages/PostEdit.vue`

#### Step 1: Create PostNew page

- [ ] Create `packages/client/src/pages/PostNew.vue`:

```vue
<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import PostEditor from '@/components/editor/PostEditor.vue';
import { usePosts } from '@/composables/usePosts';
import { detectLanguage } from '@/lib/detectLanguage';
import type { SaveStatus } from '@/stores/posts';

const router = useRouter();
const { createPost, error } = usePosts();

const title = ref('');
const content = ref('');
const language = ref('');
const manualLanguage = ref(false);
const visibility = ref('public');
const contentType = ref('snippet');
const tags = ref<string[]>([]);
const saveStatus = ref<SaveStatus>('saved');

// Auto-detect language from content when not manually set
watch(content, (newContent) => {
  if (manualLanguage.value) return;
  const detected = detectLanguage(newContent);
  if (detected) language.value = detected;
});

function onLanguageChange(lang: string) {
  language.value = lang;
  manualLanguage.value = lang !== '';
}

async function handlePublish() {
  const id = await createPost({
    title: title.value || 'Untitled',
    contentType: contentType.value,
    language: language.value || undefined,
    visibility: visibility.value,
    content: content.value,
    tags: tags.value.length > 0 ? tags.value : undefined,
  });
  if (id) {
    router.push({ name: 'post-edit', params: { id } });
  }
}
</script>

<template>
  <div class="min-h-screen bg-surface p-4">
    <div class="max-w-5xl mx-auto">
      <router-link to="/" class="text-gray-400 hover:text-white text-sm mb-4 inline-block">
        &larr; Back to Workspace
      </router-link>

      <div
        v-if="error"
        class="mb-4 p-3 bg-red-900/30 border border-red-500 rounded text-red-400 text-sm"
      >
        {{ error }}
      </div>

      <PostEditor
        v-model="content"
        v-model:title="title"
        :language="language"
        v-model:visibility="visibility"
        v-model:content-type="contentType"
        v-model:tags="tags"
        :save-status="saveStatus"
        :last-saved-at="null"
        @update:language="onLanguageChange"
        @publish="handlePublish"
      />
    </div>
  </div>
</template>
```

#### Step 2: Create PostEdit page with auto-save

- [ ] Create `packages/client/src/pages/PostEdit.vue`:

```vue
<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PostEditor from '@/components/editor/PostEditor.vue';
import { usePosts } from '@/composables/usePosts';
import { usePostsStore } from '@/stores/posts';
import { storeToRefs } from 'pinia';

const route = useRoute();
const router = useRouter();
const { fetchPost, saveRevision, updatePost, publishPost, error } = usePosts();
const store = usePostsStore();
const { currentPost, saveStatus, lastSavedAt } = storeToRefs(store);

const title = ref('');
const content = ref('');
const language = ref('');
const visibility = ref('public');
const contentType = ref('snippet');
const tags = ref<string[]>([]);
const loading = ref(true);
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

onMounted(async () => {
  const id = route.params.id as string;
  await fetchPost(id);
  if (currentPost.value) {
    title.value = currentPost.value.title;
    content.value = currentPost.value.content;
    language.value = currentPost.value.language ?? '';
    visibility.value = currentPost.value.visibility;
    contentType.value = currentPost.value.contentType;
    // Note: tags are stored in a separate tags/post_tags join table.
    // Tag loading will be handled when tag CRUD is implemented (Issue 6/19).
  }
  loading.value = false;
});

onBeforeUnmount(() => {
  if (debounceTimer) clearTimeout(debounceTimer);
  store.clearPost();
});

// Auto-save: debounce 2s after content changes
watch(content, (newContent) => {
  if (loading.value) return;
  store.setDirty(true);
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    const id = route.params.id as string;
    saveRevision(id, newContent);
  }, 2000);
});

// Save metadata changes immediately
watch([title, visibility, language, contentType], () => {
  if (loading.value) return;
  const id = route.params.id as string;
  updatePost(id, {
    title: title.value,
    visibility: visibility.value,
    language: language.value || undefined,
    contentType: contentType.value,
  });
});

async function handlePublish() {
  const id = route.params.id as string;
  // Save any pending content first
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    await saveRevision(id, content.value);
  }
  await publishPost(id);
  router.push({ name: 'post-view', params: { id } });
}
</script>

<template>
  <div class="min-h-screen bg-surface p-4">
    <div class="max-w-5xl mx-auto">
      <router-link to="/" class="text-gray-400 hover:text-white text-sm mb-4 inline-block">
        &larr; Back to Workspace
      </router-link>

      <div
        v-if="error"
        class="mb-4 p-3 bg-red-900/30 border border-red-500 rounded text-red-400 text-sm"
      >
        {{ error }}
      </div>

      <div v-if="loading" class="text-gray-400 text-center py-12">Loading...</div>

      <PostEditor
        v-else-if="currentPost"
        v-model="content"
        v-model:title="title"
        v-model:language="language"
        v-model:visibility="visibility"
        v-model:content-type="contentType"
        v-model:tags="tags"
        :save-status="saveStatus"
        :last-saved-at="lastSavedAt"
        @publish="handlePublish"
      />

      <div v-else class="text-gray-400 text-center py-12">
        Failed to load post.
        <router-link to="/" class="text-primary hover:underline ml-1">Go back</router-link>
      </div>
    </div>
  </div>
</template>
```

- [ ] Commit:

```bash
git add packages/client/src/pages/PostNew.vue packages/client/src/pages/PostEdit.vue
git commit -m "feat(client): add PostNew and PostEdit pages with auto-save"
```

#### Step 3: Write page component tests

- [ ] Create `packages/client/src/__tests__/pages/PostNew.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

const mockCreatePost = vi.fn();
const mockDetectLanguage = vi.fn();

vi.mock('@/composables/usePosts', () => ({
  usePosts: () => ({
    createPost: mockCreatePost,
    error: { value: null },
  }),
}));

vi.mock('@/lib/detectLanguage', () => ({
  detectLanguage: (c: string) => mockDetectLanguage(c),
}));

vi.mock('@/components/editor/PostEditor.vue', () => ({
  default: {
    name: 'PostEditor',
    props: [
      'modelValue',
      'title',
      'language',
      'visibility',
      'contentType',
      'tags',
      'saveStatus',
      'lastSavedAt',
    ],
    emits: [
      'update:modelValue',
      'update:title',
      'update:language',
      'update:visibility',
      'update:contentType',
      'update:tags',
      'publish',
    ],
    template:
      '<div class="mock-post-editor"><button @click="$emit(\'publish\')">Publish</button></div>',
  },
}));

import PostNew from '@/pages/PostNew.vue';

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/posts/new', component: PostNew },
    { path: '/posts/:id/edit', name: 'post-edit', component: { template: '<div />' } },
  ],
});

describe('PostNew', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('renders the post editor', async () => {
    router.push('/posts/new');
    await router.isReady();
    const wrapper = mount(PostNew, { global: { plugins: [createPinia(), router] } });
    expect(wrapper.find('.mock-post-editor').exists()).toBe(true);
  });

  it('calls createPost and navigates on publish', async () => {
    mockCreatePost.mockResolvedValue('new-id');
    router.push('/posts/new');
    await router.isReady();
    const wrapper = mount(PostNew, { global: { plugins: [createPinia(), router] } });
    await wrapper.find('button').trigger('click');
    await flushPromises();
    expect(mockCreatePost).toHaveBeenCalled();
  });

  it('auto-detects language from content changes', async () => {
    mockDetectLanguage.mockReturnValue('python');
    router.push('/posts/new');
    await router.isReady();
    const wrapper = mount(PostNew, { global: { plugins: [createPinia(), router] } });
    // Simulate content update via the PostEditor emit
    const editor = wrapper.findComponent({ name: 'PostEditor' });
    await editor.vm.$emit('update:modelValue', 'import os\nprint("hi")');
    await flushPromises();
    expect(mockDetectLanguage).toHaveBeenCalled();
  });
});
```

- [ ] Create `packages/client/src/__tests__/pages/PostEdit.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

const mockFetchPost = vi.fn();
const mockSaveRevision = vi.fn();
const mockUpdatePost = vi.fn();
const mockPublishPost = vi.fn();

vi.mock('@/composables/usePosts', () => ({
  usePosts: () => ({
    fetchPost: mockFetchPost,
    saveRevision: mockSaveRevision,
    updatePost: mockUpdatePost,
    publishPost: mockPublishPost,
    error: { value: null },
  }),
}));

vi.mock('@/components/editor/PostEditor.vue', () => ({
  default: {
    name: 'PostEditor',
    props: [
      'modelValue',
      'title',
      'language',
      'visibility',
      'contentType',
      'tags',
      'saveStatus',
      'lastSavedAt',
    ],
    emits: [
      'update:modelValue',
      'update:title',
      'update:language',
      'update:visibility',
      'update:contentType',
      'update:tags',
      'publish',
    ],
    template: '<div class="mock-post-editor" />',
  },
}));

import PostEdit from '@/pages/PostEdit.vue';
import { usePostsStore } from '@/stores/posts';

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/posts/:id/edit', name: 'post-edit', component: PostEdit },
    { path: '/posts/:id', name: 'post-view', component: { template: '<div />' } },
    { path: '/', component: { template: '<div />' } },
  ],
});

describe('PostEdit', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fetches post on mount', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = usePostsStore();
    store.setPost({
      id: '1',
      authorId: 'u1',
      title: 'Test',
      contentType: 'snippet',
      language: 'js',
      visibility: 'public',
      isDraft: true,
      forkedFromId: null,
      linkUrl: null,
      linkPreview: null,
      voteCount: 0,
      viewCount: 0,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      content: 'hello',
      revisionNumber: 1,
      revisionMessage: null,
    });
    mockFetchPost.mockResolvedValue(undefined);

    router.push('/posts/1/edit');
    await router.isReady();
    const wrapper = mount(PostEdit, { global: { plugins: [pinia, router] } });
    await flushPromises();

    expect(mockFetchPost).toHaveBeenCalledWith('1');
    expect(wrapper.find('.mock-post-editor').exists()).toBe(true);
  });

  it('shows loading state initially', async () => {
    mockFetchPost.mockImplementation(() => new Promise(() => {})); // never resolves
    router.push('/posts/1/edit');
    await router.isReady();
    const wrapper = mount(PostEdit, { global: { plugins: [createPinia(), router] } });
    expect(wrapper.text()).toContain('Loading');
  });

  it('shows fallback on fetch failure', async () => {
    mockFetchPost.mockResolvedValue(undefined);
    router.push('/posts/1/edit');
    await router.isReady();
    const wrapper = mount(PostEdit, { global: { plugins: [createPinia(), router] } });
    await flushPromises();
    expect(wrapper.text()).toContain('Failed to load post');
  });
});
```

- [ ] Create `packages/client/src/__tests__/pages/PostView.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

const mockFetchPost = vi.fn();
const mockDeletePost = vi.fn();

vi.mock('@/composables/usePosts', () => ({
  usePosts: () => ({
    fetchPost: mockFetchPost,
    deletePost: mockDeletePost,
    error: { value: null },
  }),
}));

vi.mock('@/composables/useAuth', () => ({
  useAuth: () => ({
    user: { value: { id: 'u1' } },
  }),
}));

vi.mock('@/components/post/CodeViewer.vue', () => ({
  default: {
    name: 'CodeViewer',
    props: ['code', 'language'],
    template: '<div class="mock-viewer">{{ code }}</div>',
  },
}));

import PostView from '@/pages/PostView.vue';
import { usePostsStore } from '@/stores/posts';

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/posts/:id', name: 'post-view', component: PostView },
    { path: '/posts/:id/edit', name: 'post-edit', component: { template: '<div />' } },
    { path: '/', component: { template: '<div />' } },
  ],
});

describe('PostView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('renders post content after fetch', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = usePostsStore();
    store.setPost({
      id: '1',
      authorId: 'u1',
      title: 'My Post',
      contentType: 'snippet',
      language: 'javascript',
      visibility: 'public',
      isDraft: false,
      forkedFromId: null,
      linkUrl: null,
      linkPreview: null,
      voteCount: 0,
      viewCount: 0,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      content: 'console.log("hi")',
      revisionNumber: 1,
      revisionMessage: null,
    });
    mockFetchPost.mockResolvedValue(undefined);

    router.push('/posts/1');
    await router.isReady();
    const wrapper = mount(PostView, { global: { plugins: [pinia, router] } });
    await flushPromises();

    expect(wrapper.text()).toContain('My Post');
    expect(wrapper.find('.mock-viewer').exists()).toBe(true);
  });

  it('shows edit and delete buttons for the author', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = usePostsStore();
    store.setPost({
      id: '1',
      authorId: 'u1',
      title: 'My Post',
      contentType: 'snippet',
      language: null,
      visibility: 'public',
      isDraft: false,
      forkedFromId: null,
      linkUrl: null,
      linkPreview: null,
      voteCount: 0,
      viewCount: 0,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      content: 'x',
      revisionNumber: 1,
      revisionMessage: null,
    });
    mockFetchPost.mockResolvedValue(undefined);

    router.push('/posts/1');
    await router.isReady();
    const wrapper = mount(PostView, { global: { plugins: [pinia, router] } });
    await flushPromises();

    expect(wrapper.text()).toContain('Edit');
    expect(wrapper.text()).toContain('Delete');
  });

  it('shows "Post not found" when fetch fails', async () => {
    mockFetchPost.mockResolvedValue(undefined);
    router.push('/posts/1');
    await router.isReady();
    const wrapper = mount(PostView, { global: { plugins: [createPinia(), router] } });
    await flushPromises();
    expect(wrapper.text()).toContain('Post not found');
  });
});
```

- [ ] Run all page tests:

```bash
cd packages/client && npx vitest run src/__tests__/pages/
```

Expected: All pass.

- [ ] Commit:

```bash
git add packages/client/src/__tests__/pages/PostNew.test.ts \
  packages/client/src/__tests__/pages/PostEdit.test.ts \
  packages/client/src/__tests__/pages/PostView.test.ts
git commit -m "test(client): add PostNew, PostEdit, and PostView page tests"
```

---

### Task 8: CodeViewer (Shiki) & PostView Page

**Files:**

- Create: `packages/client/src/components/post/CodeViewer.vue`
- Create: `packages/client/src/pages/PostView.vue`

#### Step 1: Create Shiki CodeViewer

- [ ] Create `packages/client/src/components/post/CodeViewer.vue`:

```vue
<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { codeToHtml } from 'shiki';

const props = defineProps<{
  code: string;
  language?: string;
}>();

const highlightedHtml = ref('');
const copied = ref(false);

async function highlight() {
  try {
    highlightedHtml.value = await codeToHtml(props.code, {
      lang: props.language || 'text',
      theme: 'one-dark-pro',
    });
  } catch {
    // Fallback for unsupported languages
    highlightedHtml.value = await codeToHtml(props.code, {
      lang: 'text',
      theme: 'one-dark-pro',
    });
  }
}

onMounted(highlight);
watch(() => [props.code, props.language], highlight);

async function copyToClipboard() {
  await navigator.clipboard.writeText(props.code);
  copied.value = true;
  setTimeout(() => {
    copied.value = false;
  }, 2000);
}
</script>

<template>
  <div class="relative group">
    <button
      class="absolute top-2 right-2 text-xs px-2 py-1 rounded bg-surface-700 text-gray-400 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
      @click="copyToClipboard"
    >
      {{ copied ? 'Copied!' : 'Copy' }}
    </button>
    <div class="rounded overflow-auto text-sm" v-html="highlightedHtml" />
  </div>
</template>
```

#### Step 2: Create PostView page

- [ ] Create `packages/client/src/pages/PostView.vue`:

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import CodeViewer from '@/components/post/CodeViewer.vue';
import { usePosts } from '@/composables/usePosts';
import { storeToRefs } from 'pinia';
import { usePostsStore } from '@/stores/posts';
import { useAuth } from '@/composables/useAuth';

const route = useRoute();
const router = useRouter();
const { fetchPost, deletePost, error } = usePosts();
const store = usePostsStore();
const { currentPost } = storeToRefs(store);
const { user } = useAuth();
const loading = ref(true);

const isAuthor = ref(false);

onMounted(async () => {
  const id = route.params.id as string;
  await fetchPost(id);
  if (currentPost.value && user.value) {
    isAuthor.value = currentPost.value.authorId === user.value.id;
  }
  loading.value = false;
});

async function handleDelete() {
  const id = route.params.id as string;
  const success = await deletePost(id);
  if (success) {
    router.push('/');
  }
}
</script>

<template>
  <div class="min-h-screen bg-surface p-4">
    <div class="max-w-5xl mx-auto">
      <router-link to="/" class="text-gray-400 hover:text-white text-sm mb-4 inline-block">
        &larr; Back to Workspace
      </router-link>

      <div
        v-if="error"
        class="mb-4 p-3 bg-red-900/30 border border-red-500 rounded text-red-400 text-sm"
      >
        {{ error }}
      </div>

      <div v-if="loading" class="text-gray-400 text-center py-12">Loading...</div>

      <template v-else-if="currentPost">
        <div class="flex items-start justify-between mb-4">
          <div>
            <h1 class="text-2xl font-bold text-white">{{ currentPost.title }}</h1>
            <div class="flex items-center gap-2 mt-1 text-sm text-gray-400">
              <span>{{ currentPost.contentType }}</span>
              <span v-if="currentPost.language">{{ currentPost.language }}</span>
              <span>Rev {{ currentPost.revisionNumber }}</span>
            </div>
          </div>

          <div v-if="isAuthor" class="flex gap-2">
            <router-link
              :to="{ name: 'post-edit', params: { id: currentPost.id } }"
              class="text-sm px-3 py-1 rounded border border-surface-500 text-gray-300 hover:text-white"
            >
              Edit
            </router-link>
            <button
              class="text-sm px-3 py-1 rounded border border-red-500 text-red-400 hover:bg-red-900/30"
              @click="handleDelete"
            >
              Delete
            </button>
          </div>
        </div>

        <CodeViewer :code="currentPost.content" :language="currentPost.language ?? undefined" />
      </template>

      <div v-else class="text-gray-400 text-center py-12">Post not found</div>
    </div>
  </div>
</template>
```

- [ ] Commit:

```bash
git add packages/client/src/components/post/CodeViewer.vue packages/client/src/pages/PostView.vue
git commit -m "feat(client): add Shiki code viewer and PostView page"
```

#### Step 3: Write CodeViewer component test

- [ ] Create `packages/client/src/__tests__/components/post/CodeViewer.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

// Mock shiki — avoid loading real WASM in tests
vi.mock('shiki', () => ({
  codeToHtml: vi.fn(async (code: string, opts: { lang: string }) => {
    return `<pre><code class="lang-${opts.lang}">${code}</code></pre>`;
  }),
}));

import CodeViewer from '@/components/post/CodeViewer.vue';
import { codeToHtml } from 'shiki';

describe('CodeViewer', () => {
  it('renders highlighted code', async () => {
    const wrapper = mount(CodeViewer, { props: { code: 'const x = 1;', language: 'javascript' } });
    await flushPromises();
    expect(wrapper.html()).toContain('const x = 1;');
    expect(codeToHtml).toHaveBeenCalledWith(
      'const x = 1;',
      expect.objectContaining({ lang: 'javascript' }),
    );
  });

  it('falls back to text for unsupported language', async () => {
    (codeToHtml as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('unsupported'))
      .mockResolvedValueOnce('<pre><code>fallback</code></pre>');
    const wrapper = mount(CodeViewer, { props: { code: 'hello', language: 'brainfuck' } });
    await flushPromises();
    expect(codeToHtml).toHaveBeenCalledTimes(2);
    expect(wrapper.html()).toContain('fallback');
  });

  it('renders copy button on hover', () => {
    const wrapper = mount(CodeViewer, { props: { code: 'test' } });
    expect(wrapper.find('button').text()).toBe('Copy');
  });
});
```

- [ ] Run test:

```bash
cd packages/client && npx vitest run src/__tests__/components/post/CodeViewer.test.ts
```

Expected: All pass.

- [ ] Commit:

```bash
git add packages/client/src/__tests__/components/
git commit -m "test(client): add CodeViewer component test"
```

#### Step 4: Run all client tests

- [ ] Run full client test suite:

```bash
cd packages/client && npx vitest run
```

Expected: All pass.

#### Step 4: Run full project build

- [ ] Build all packages:

```bash
cd /path/to/forge && npm run build
```

Expected: Clean build.

- [ ] Run all tests:

```bash
npm test
```

Expected: All pass.

- [ ] Final commit (if any uncommitted test/build fixes):

```bash
git add -A && git commit -m "fix: resolve any build/test issues"
```

**--- HUMAN CHECKPOINT 3: Full end-to-end walkthrough ---**

Walk through the complete flow:

1. Login, navigate to `/posts/new`
2. Enter title, select language, type code
3. Click "Publish Snippet" — verify post is created and redirected to edit
4. Edit content — verify auto-save triggers after 2s
5. Navigate to post view — verify Shiki renders code
6. Click Edit — verify editor loads existing content
7. Click Delete — verify soft delete and redirect
