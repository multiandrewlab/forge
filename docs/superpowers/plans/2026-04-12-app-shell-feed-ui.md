# App Shell & Feed UI Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the three-panel app shell (sidebar + post list + detail) with feed sorting, cursor-based pagination, dark mode, and responsive layout.

**Architecture:** Hybrid Pinia store + composable pattern matching existing `useAuth`/`authStore`. Server-side feed endpoint with Zod validation, cursor-based pagination, and parameterized queries. Vue Router restructured with nested layout-children routes.

**Tech Stack:** Vue 3 + Pinia + Vue Router 4 + Tailwind v4 + Fastify + Zod + PostgreSQL + Vitest

**Design Spec:** `docs/superpowers/specs/2026-04-12-app-shell-feed-ui-design.md`

---

## File Structure

### New Files

| File                                                                   | Responsibility                                        |
| ---------------------------------------------------------------------- | ----------------------------------------------------- |
| `packages/shared/src/types/feed.ts`                                    | `PostWithAuthor` type, `FeedSort`, `FeedFilter` types |
| `packages/server/src/db/queries/feed.ts`                               | Feed query with sort/filter/pagination SQL            |
| `packages/server/src/services/feed.ts`                                 | `toPostWithAuthor()` row-to-DTO transform             |
| `packages/server/src/__tests__/db/queries/feed.test.ts`                | Feed query unit tests                                 |
| `packages/server/src/__tests__/routes/posts-feed.test.ts`              | Feed endpoint integration tests                       |
| `packages/client/src/stores/feed.ts`                                   | `useFeedStore` — thin state container                 |
| `packages/client/src/stores/ui.ts`                                     | `useUiStore` — sidebar, dark mode, search modal state |
| `packages/client/src/composables/useFeed.ts`                           | Wraps feedStore + apiFetch for feed operations        |
| `packages/client/src/composables/useDarkMode.ts`                       | Dark mode init, toggle, persistence                   |
| `packages/client/src/layouts/AppLayout.vue`                            | 3-panel shell with responsive breakpoints             |
| `packages/client/src/layouts/AuthLayout.vue`                           | Centered auth card                                    |
| `packages/client/src/components/shell/TheSidebar.vue`                  | Nav links, tags, user profile, collapse states        |
| `packages/client/src/components/shell/TheTopBar.vue`                   | Logo, search placeholder, dark mode toggle            |
| `packages/client/src/components/shell/UserAvatar.vue`                  | Avatar + dropdown menu                                |
| `packages/client/src/components/post/PostList.vue`                     | Scrollable feed with sort tabs + load more            |
| `packages/client/src/components/post/PostListItem.vue`                 | Post card in feed list                                |
| `packages/client/src/components/post/PostListFilters.vue`              | Sort tab bar                                          |
| `packages/client/src/components/post/PostDetail.vue`                   | Detail panel orchestrator                             |
| `packages/client/src/components/post/PostMetaHeader.vue`               | Author info, tags, timestamps                         |
| `packages/client/src/components/post/PostActions.vue`                  | Disabled stub for vote/bookmark                       |
| `packages/client/src/__tests__/stores/feed.test.ts`                    | Feed store tests                                      |
| `packages/client/src/__tests__/stores/ui.test.ts`                      | UI store tests                                        |
| `packages/client/src/__tests__/composables/useFeed.test.ts`            | Feed composable tests                                 |
| `packages/client/src/__tests__/composables/useDarkMode.test.ts`        | Dark mode composable tests                            |
| `packages/client/src/__tests__/components/shell/TheSidebar.test.ts`    | Sidebar nav + collapse tests                          |
| `packages/client/src/__tests__/components/shell/UserAvatar.test.ts`    | Avatar dropdown + logout tests                        |
| `packages/client/src/__tests__/pages/HomePage.test.ts`                 | Route prop watch + auto-select tests                  |
| `packages/client/src/__tests__/components/post/PostListItem.test.ts`   | Mobile routing logic test                             |
| `packages/client/src/__tests__/components/post/PostMetaHeader.test.ts` | Tag chips + draft badge rendering                     |
| `packages/server/src/__tests__/services/feed.test.ts`                  | `toPostWithAuthor` transform tests                    |
| `packages/client/src/pages/PostHistoryPage.vue`                        | Stub placeholder for future issue                     |

### Modified Files

| File                                      | Change                                           |
| ----------------------------------------- | ------------------------------------------------ |
| `packages/shared/src/types/index.ts`      | Re-export feed types                             |
| `packages/client/src/plugins/router.ts`   | Restructure as nested layout-children routes     |
| `packages/client/src/pages/HomePage.vue`  | Replace placeholder with PostList + PostDetail   |
| `packages/client/src/App.vue`             | No change needed (already just `<RouterView />`) |
| `packages/server/src/routes/posts.ts`     | Add `GET /` feed handler before `GET /:id`       |
| `packages/server/src/db/queries/posts.ts` | Add `PostWithAuthorRow` type export              |

---

## Chunk 1: Backend — Shared Types, Feed Query, Feed Route

### Task 1: Shared Types (`PostWithAuthor`, Feed Types)

**Files:**

- Create: `packages/shared/src/types/feed.ts`
- Modify: `packages/shared/src/types/index.ts`

- [ ] **Step 1: Add feed types to shared package**

```typescript
// packages/shared/src/types/feed.ts
import type { Post } from './post.js';

export interface PostAuthor {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface PostWithAuthor extends Post {
  author: PostAuthor;
  tags: string[];
}

export type FeedSort = 'trending' | 'recent' | 'top';
export type FeedFilter = 'mine' | 'bookmarked';
export type FeedContentType = 'snippet' | 'prompt' | 'document' | 'link';

export interface FeedResponse {
  posts: PostWithAuthor[];
  cursor: string | null;
}

export interface FeedQuery {
  sort?: FeedSort;
  filter?: FeedFilter;
  tag?: string;
  type?: FeedContentType;
  cursor?: string;
  limit?: number;
}
```

- [ ] **Step 2: Re-export from index**

Add to `packages/shared/src/types/index.ts`:

```typescript
export type {
  PostAuthor,
  PostWithAuthor,
  FeedSort,
  FeedFilter,
  FeedContentType,
  FeedResponse,
  FeedQuery,
} from './feed.js';
```

- [ ] **Step 3: Build shared package and verify**

Run: `npm run build --workspace=packages/shared`
Expected: Clean build, no errors

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/types/feed.ts packages/shared/src/types/index.ts
git commit -m "feat(shared): add PostWithAuthor and feed types"
```

---

### Task 2: Server Feed Query

**Files:**

- Create: `packages/server/src/db/queries/feed.ts`
- Create: `packages/server/src/services/feed.ts`
- Create: `packages/server/src/__tests__/db/queries/feed.test.ts`

- [ ] **Step 1: Write failing tests for feed query**

```typescript
// packages/server/src/__tests__/db/queries/feed.test.ts
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { query } from '../../../db/connection.js';
import { findFeedPosts } from '../../../db/queries/feed.js';
import type { PostWithAuthorRow } from '../../../db/queries/feed.js';

vi.mock('../../../db/connection.js', () => ({ query: vi.fn() }));
const mockQuery = query as Mock;

const sampleRow: PostWithAuthorRow = {
  id: '1',
  author_id: 'u1',
  title: 'Test Post',
  content_type: 'snippet',
  language: 'typescript',
  visibility: 'public',
  is_draft: false,
  forked_from_id: null,
  link_url: null,
  link_preview: null,
  vote_count: 5,
  view_count: 10,
  search_vector: null,
  deleted_at: null,
  created_at: new Date('2026-01-01'),
  updated_at: new Date('2026-01-01'),
  author_display_name: 'Test User',
  author_avatar_url: null,
  tags: null,
};

describe('findFeedPosts', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('returns posts with default sort (recent)', async () => {
    mockQuery.mockResolvedValue({ rows: [sampleRow] });
    const result = await findFeedPosts({ userId: 'u1' });
    expect(result).toEqual([sampleRow]);
    expect(mockQuery).toHaveBeenCalledOnce();
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('ORDER BY p.created_at DESC');
  });

  it('applies trending sort', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await findFeedPosts({ userId: 'u1', sort: 'trending' });
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('POWER');
    expect(sql).toContain('ORDER BY');
  });

  it('applies top sort', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await findFeedPosts({ userId: 'u1', sort: 'top' });
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('ORDER BY p.vote_count DESC');
  });

  it('filters by mine (includes drafts)', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await findFeedPosts({ userId: 'u1', filter: 'mine' });
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('p.author_id =');
    expect(sql).not.toContain('is_draft = false');
  });

  it('filters by bookmarked', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await findFeedPosts({ userId: 'u1', filter: 'bookmarked' });
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('JOIN bookmarks');
  });

  it('filters by tag', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await findFeedPosts({ userId: 'u1', tag: 'frontend' });
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('JOIN post_tags');
    expect(sql).toContain('JOIN tags');
  });

  it('filters by content type', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await findFeedPosts({ userId: 'u1', type: 'snippet' });
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('p.content_type =');
  });

  it('applies cursor pagination with parameterized values', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const cursor = btoa(JSON.stringify({ createdAt: '2026-01-01T00:00:00Z', id: 'abc' }));
    await findFeedPosts({ userId: 'u1', cursor });
    const params = mockQuery.mock.calls[0][1] as unknown[];
    // Cursor values must be in params array, never in SQL string
    expect(params.length).toBeGreaterThanOrEqual(2);
  });

  it('clamps limit to max 100', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await findFeedPosts({ userId: 'u1', limit: 500 });
    const sql = mockQuery.mock.calls[0][0] as string;
    // Should use LIMIT with clamped value
    expect(sql).toContain('LIMIT');
    const params = mockQuery.mock.calls[0][1] as unknown[];
    // The limit param should be <= 101 (100 + 1 for hasMore detection)
    const limitParam = params[params.length - 1] as number;
    expect(limitParam).toBeLessThanOrEqual(101);
  });

  it('excludes soft-deleted posts', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await findFeedPosts({ userId: 'u1' });
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('deleted_at IS NULL');
  });

  it('excludes drafts by default', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await findFeedPosts({ userId: 'u1' });
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('is_draft = false');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace=packages/server -- --reporter=verbose src/__tests__/db/queries/feed.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `PostWithAuthorRow` type and `findFeedPosts` query**

```typescript
// packages/server/src/db/queries/feed.ts
import { query } from '../connection.js';
import type { PostRow } from './types.js';

export interface PostWithAuthorRow extends PostRow {
  author_display_name: string;
  author_avatar_url: string | null;
  tags: string | null; // comma-separated from array_agg
}

interface FindFeedPostsInput {
  userId: string;
  sort?: 'trending' | 'recent' | 'top';
  filter?: 'mine' | 'bookmarked';
  tag?: string;
  type?: string;
  cursor?: string;
  limit?: number;
}

export async function findFeedPosts(input: FindFeedPostsInput): Promise<PostWithAuthorRow[]> {
  const { userId, sort = 'recent', filter, tag, type, cursor, limit: rawLimit = 20 } = input;

  const limit = Math.min(rawLimit, 100);
  const params: unknown[] = [];
  const conditions: string[] = ['p.deleted_at IS NULL'];
  const joins: string[] = [];

  // Draft filter: only show drafts for filter=mine
  if (filter !== 'mine') {
    conditions.push('p.is_draft = false');
  }

  // Filter: mine
  if (filter === 'mine') {
    params.push(userId);
    conditions.push(`p.author_id = $${params.length}`);
  }

  // Filter: bookmarked
  if (filter === 'bookmarked') {
    params.push(userId);
    joins.push(`JOIN bookmarks b ON b.post_id = p.id AND b.user_id = $${params.length}`);
  }

  // Filter: tag
  if (tag) {
    params.push(tag);
    joins.push('JOIN post_tags pt ON pt.post_id = p.id');
    joins.push(`JOIN tags t ON t.id = pt.tag_id AND t.name = $${params.length}`);
  }

  // Filter: content type
  if (type) {
    params.push(type);
    conditions.push(`p.content_type = $${params.length}`);
  }

  // Cursor pagination
  if (cursor) {
    try {
      const decoded = JSON.parse(atob(cursor)) as { createdAt: string; id: string };
      params.push(decoded.createdAt);
      params.push(decoded.id);
      const cIdx = params.length;
      conditions.push(
        `(p.created_at < $${cIdx - 1} OR (p.created_at = $${cIdx - 1} AND p.id < $${cIdx}))`,
      );
    } catch {
      // Invalid cursor — ignore, return from beginning
    }
  }

  // ORDER BY
  let orderBy: string;
  switch (sort) {
    case 'trending':
      orderBy = `(p.vote_count::float / POWER(EXTRACT(EPOCH FROM NOW() - p.created_at) / 3600 + 2, 1.5)) DESC, p.created_at DESC`;
      break;
    case 'top':
      orderBy = 'p.vote_count DESC, p.created_at DESC';
      break;
    case 'recent':
    default:
      orderBy = 'p.created_at DESC';
  }

  // LIMIT (fetch limit+1 to detect hasMore)
  params.push(limit + 1);

  const sql = `
    SELECT p.*, u.display_name AS author_display_name, u.avatar_url AS author_avatar_url,
           (SELECT string_agg(t2.name, ',' ORDER BY t2.name) FROM post_tags pt2 JOIN tags t2 ON t2.id = pt2.tag_id WHERE pt2.post_id = p.id) AS tags
    FROM posts p
    JOIN users u ON u.id = p.author_id
    ${joins.join('\n    ')}
    WHERE ${conditions.join(' AND ')}
    ORDER BY ${orderBy}
    LIMIT $${params.length}
  `;

  const result = await query<PostWithAuthorRow>(sql, params);
  return result.rows;
}
```

- [ ] **Step 4: Implement `toPostWithAuthor` transform**

```typescript
// packages/server/src/services/feed.ts
import type { PostWithAuthor } from '@forge/shared';
import type { PostWithAuthorRow } from '../db/queries/feed.js';

export function toPostWithAuthor(row: PostWithAuthorRow): PostWithAuthor {
  return {
    id: row.id,
    authorId: row.author_id,
    title: row.title,
    contentType: row.content_type as PostWithAuthor['contentType'],
    language: row.language,
    visibility: row.visibility as PostWithAuthor['visibility'],
    isDraft: row.is_draft,
    forkedFromId: row.forked_from_id,
    linkUrl: row.link_url,
    linkPreview: row.link_preview as PostWithAuthor['linkPreview'],
    voteCount: row.vote_count,
    viewCount: row.view_count,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    author: {
      id: row.author_id,
      displayName: row.author_display_name,
      avatarUrl: row.author_avatar_url,
    },
    tags: row.tags ? row.tags.split(',').filter(Boolean) : [],
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test --workspace=packages/server -- --reporter=verbose src/__tests__/db/queries/feed.test.ts`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/db/queries/feed.ts packages/server/src/services/feed.ts packages/server/src/__tests__/db/queries/feed.test.ts
git commit -m "feat(server): add feed query with sort/filter/cursor pagination"
```

---

### Task 3: Server Feed Route (`GET /api/posts`)

**Files:**

- Modify: `packages/server/src/routes/posts.ts`
- Create: `packages/server/src/__tests__/routes/posts-feed.test.ts`

- [ ] **Step 1: Write failing tests for feed endpoint**

```typescript
// packages/server/src/__tests__/routes/posts-feed.test.ts
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { findFeedPosts } from '../../../db/queries/feed.js';
import type { PostWithAuthorRow } from '../../../db/queries/feed.js';

// Mock the feed query module
vi.mock('../../../db/queries/feed.js', () => ({ findFeedPosts: vi.fn() }));
const mockFindFeedPosts = findFeedPosts as Mock;

const sampleRow: PostWithAuthorRow = {
  id: '1',
  author_id: 'u1',
  title: 'Test',
  content_type: 'snippet',
  language: 'typescript',
  visibility: 'public',
  is_draft: false,
  forked_from_id: null,
  link_url: null,
  link_preview: null,
  vote_count: 5,
  view_count: 10,
  search_vector: null,
  deleted_at: null,
  created_at: new Date('2026-01-01'),
  updated_at: new Date('2026-01-01'),
  author_display_name: 'Test User',
  author_avatar_url: null,
  tags: null,
};

describe('GET /api/posts (feed)', () => {
  beforeEach(() => {
    mockFindFeedPosts.mockReset();
  });

  it('returns 401 without auth token', async () => {
    const app = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/api/posts' });
    expect(response.statusCode).toBe(401);
  });

  it('returns paginated feed with default sort', async () => {
    mockFindFeedPosts.mockResolvedValue([sampleRow]);
    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/posts',
      headers: { authorization: `Bearer ${validToken}` },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.posts).toHaveLength(1);
    expect(body.posts[0].title).toBe('Test');
    expect(body.cursor).toBeNull();
  });

  it('passes sort param to query', async () => {
    mockFindFeedPosts.mockResolvedValue([]);
    const app = await buildApp();
    await app.inject({
      method: 'GET',
      url: '/api/posts?sort=trending',
      headers: { authorization: `Bearer ${validToken}` },
    });
    expect(mockFindFeedPosts).toHaveBeenCalledWith(expect.objectContaining({ sort: 'trending' }));
  });

  it('rejects invalid sort param', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/posts?sort=invalid',
      headers: { authorization: `Bearer ${validToken}` },
    });
    expect(response.statusCode).toBe(400);
  });

  it('builds cursor from last post in response', async () => {
    // Return limit+1 rows to trigger cursor generation
    const rows = Array.from({ length: 21 }, (_, i) => ({ ...sampleRow, id: String(i) }));
    mockFindFeedPosts.mockResolvedValue(rows);
    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/posts?limit=20',
      headers: { authorization: `Bearer ${validToken}` },
    });
    const body = response.json();
    expect(body.posts).toHaveLength(20);
    expect(body.cursor).toBeTruthy();
    // Verify cursor decodes to valid JSON with createdAt and id
    const decoded = JSON.parse(atob(body.cursor));
    expect(decoded).toHaveProperty('createdAt');
    expect(decoded).toHaveProperty('id');
  });

  it('returns null cursor when no more results', async () => {
    mockFindFeedPosts.mockResolvedValue([sampleRow]); // 1 row < limit
    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/posts',
      headers: { authorization: `Bearer ${validToken}` },
    });
    expect(response.json().cursor).toBeNull();
  });

  it('rejects limit > 100 with 400', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/posts?limit=200',
      headers: { authorization: `Bearer ${validToken}` },
    });
    // Zod .max(100) rejects values > 100
    expect(response.statusCode).toBe(400);
  });

  it('passes userId from JWT to query', async () => {
    mockFindFeedPosts.mockResolvedValue([]);
    const app = await buildApp();
    await app.inject({
      method: 'GET',
      url: '/api/posts',
      headers: { authorization: `Bearer ${validToken}` },
    });
    expect(mockFindFeedPosts).toHaveBeenCalledWith(expect.objectContaining({ userId: testUserId }));
  });

  it('passes tag and type filters to query', async () => {
    mockFindFeedPosts.mockResolvedValue([]);
    const app = await buildApp();
    await app.inject({
      method: 'GET',
      url: '/api/posts?tag=frontend&type=snippet',
      headers: { authorization: `Bearer ${validToken}` },
    });
    expect(mockFindFeedPosts).toHaveBeenCalledWith(
      expect.objectContaining({ tag: 'frontend', type: 'snippet' }),
    );
  });

  it('filter=mine scopes to authenticated user', async () => {
    mockFindFeedPosts.mockResolvedValue([]);
    const app = await buildApp();
    await app.inject({
      method: 'GET',
      url: '/api/posts?filter=mine',
      headers: { authorization: `Bearer ${validToken}` },
    });
    expect(mockFindFeedPosts).toHaveBeenCalledWith(
      expect.objectContaining({ filter: 'mine', userId: testUserId }),
    );
  });
});
```

Note: `buildApp`, `validToken`, and `testUserId` setup depends on the project's existing test patterns. Check existing route tests in `packages/server/src/__tests__/routes/` for the exact pattern and match it. The key is that these tests have concrete assertions, not empty bodies.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace=packages/server -- --reporter=verbose src/__tests__/routes/posts-feed.test.ts`
Expected: FAIL

- [ ] **Step 3: Add Zod schema and feed handler to posts routes**

In `packages/server/src/routes/posts.ts`, add BEFORE the existing `app.get('/:id', ...)` handler:

```typescript
import { z } from 'zod';
import { findFeedPosts } from '../db/queries/feed.js';
import { toPostWithAuthor } from '../services/feed.js';

const feedQuerySchema = z.object({
  sort: z.enum(['trending', 'recent', 'top']).default('recent'),
  filter: z.enum(['mine', 'bookmarked']).optional(),
  tag: z.string().max(50).optional(),
  type: z.enum(['snippet', 'prompt', 'document', 'link']).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// GET / — feed endpoint (MUST be registered before /:id)
app.get('/', { preHandler: [app.authenticate] }, async (request, reply) => {
  const parsed = feedQuerySchema.safeParse(request.query);
  if (!parsed.success) {
    return reply.status(400).send({
      error: parsed.error.errors.map((e) => e.message).join(', '),
    });
  }

  const { sort, filter, tag, type, cursor, limit } = parsed.data;
  const userId = request.user.id;

  const rows = await findFeedPosts({ userId, sort, filter, tag, type, cursor, limit });

  // If we got limit+1 rows, there are more pages
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const posts = pageRows.map(toPostWithAuthor);

  // Build cursor from last post
  const nextCursor =
    hasMore && pageRows.length > 0
      ? btoa(
          JSON.stringify({
            createdAt: pageRows[pageRows.length - 1].created_at.toISOString(),
            id: pageRows[pageRows.length - 1].id,
          }),
        )
      : null;

  return reply.send({ posts, cursor: nextCursor });
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace=packages/server -- --reporter=verbose src/__tests__/routes/posts-feed.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Run full server test suite**

Run: `npm test --workspace=packages/server`
Expected: All tests PASS, no regressions

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/routes/posts.ts packages/server/src/__tests__/routes/posts-feed.test.ts
git commit -m "feat(server): add GET /api/posts feed endpoint with sort/filter/pagination"
```

---

## Chunk 2: Client State & Composables

### Task 4: UI Store (`useUiStore`)

**Files:**

- Create: `packages/client/src/stores/ui.ts`
- Create: `packages/client/src/__tests__/stores/ui.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/client/src/__tests__/stores/ui.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useUiStore } from '../../stores/ui.js';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    clear: () => {
      store = {};
    },
  };
})();
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

describe('useUiStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it('initializes sidebarCollapsed from localStorage', () => {
    localStorageMock.getItem.mockReturnValueOnce('true');
    const store = useUiStore();
    expect(store.sidebarCollapsed).toBe(true);
  });

  it('defaults sidebarCollapsed to false', () => {
    const store = useUiStore();
    expect(store.sidebarCollapsed).toBe(false);
  });

  it('persists sidebarCollapsed to localStorage on change', () => {
    const store = useUiStore();
    store.toggleSidebar();
    expect(localStorageMock.setItem).toHaveBeenCalledWith('forge-sidebar-collapsed', 'true');
  });

  it('initializes searchModalOpen to false', () => {
    const store = useUiStore();
    expect(store.searchModalOpen).toBe(false);
  });

  it('initializes darkMode to true (default dark)', () => {
    const store = useUiStore();
    expect(store.darkMode).toBe(true);
  });

  it('darkMode syncs with setDarkMode', () => {
    const store = useUiStore();
    expect(store.darkMode).toBe(true);
    store.setDarkMode(false);
    expect(store.darkMode).toBe(false);
    store.setDarkMode(true);
    expect(store.darkMode).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace=packages/client -- --reporter=verbose src/__tests__/stores/ui.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement useUiStore**

```typescript
// packages/client/src/stores/ui.ts
import { ref } from 'vue';
import { defineStore } from 'pinia';

export const useUiStore = defineStore('ui', () => {
  const sidebarCollapsed = ref(localStorage.getItem('forge-sidebar-collapsed') === 'true');
  const searchModalOpen = ref(false);
  const darkMode = ref(true); // Default dark — useDarkMode composable initializes properly

  function toggleSidebar(): void {
    sidebarCollapsed.value = !sidebarCollapsed.value;
    localStorage.setItem('forge-sidebar-collapsed', String(sidebarCollapsed.value));
  }

  function setDarkMode(value: boolean): void {
    darkMode.value = value;
  }

  return { sidebarCollapsed, searchModalOpen, darkMode, toggleSidebar, setDarkMode };
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace=packages/client -- --reporter=verbose src/__tests__/stores/ui.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/stores/ui.ts packages/client/src/__tests__/stores/ui.test.ts
git commit -m "feat(client): add useUiStore with sidebar collapse and dark mode state"
```

---

### Task 5: Feed Store (`useFeedStore`)

**Files:**

- Create: `packages/client/src/stores/feed.ts`
- Create: `packages/client/src/__tests__/stores/feed.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/client/src/__tests__/stores/feed.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useFeedStore } from '../../stores/feed.js';
import type { PostWithAuthor } from '@forge/shared';

const mockPost: PostWithAuthor = {
  id: '1',
  authorId: 'u1',
  title: 'Test',
  contentType: 'snippet',
  language: 'ts',
  visibility: 'public',
  isDraft: false,
  forkedFromId: null,
  linkUrl: null,
  linkPreview: null,
  voteCount: 5,
  viewCount: 10,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  author: { id: 'u1', displayName: 'Test', avatarUrl: null },
  tags: [],
};

describe('useFeedStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('initializes with empty posts and default sort', () => {
    const store = useFeedStore();
    expect(store.posts).toEqual([]);
    expect(store.sort).toBe('recent');
    expect(store.selectedPostId).toBeNull();
    expect(store.cursor).toBeNull();
    expect(store.filter).toBeNull();
    expect(store.tag).toBeNull();
    expect(store.contentType).toBeNull();
  });

  it('setPosts replaces posts array', () => {
    const store = useFeedStore();
    store.setPosts([mockPost]);
    expect(store.posts).toEqual([mockPost]);
  });

  it('appendPosts adds to existing posts', () => {
    const store = useFeedStore();
    store.setPosts([mockPost]);
    const post2 = { ...mockPost, id: '2' };
    store.appendPosts([post2]);
    expect(store.posts).toHaveLength(2);
  });

  it('hasMore is derived from cursor', () => {
    const store = useFeedStore();
    expect(store.hasMore).toBe(false);
    store.setCursor('abc');
    expect(store.hasMore).toBe(true);
    store.setCursor(null);
    expect(store.hasMore).toBe(false);
  });

  it('setSort updates sort', () => {
    const store = useFeedStore();
    store.setSort('trending');
    expect(store.sort).toBe('trending');
  });

  it('setFilter updates filter', () => {
    const store = useFeedStore();
    store.setFilter('mine');
    expect(store.filter).toBe('mine');
  });

  it('reset clears all state', () => {
    const store = useFeedStore();
    store.setPosts([mockPost]);
    store.setSort('trending');
    store.setFilter('mine');
    store.setCursor('abc');
    store.reset();
    expect(store.posts).toEqual([]);
    expect(store.sort).toBe('recent');
    expect(store.filter).toBeNull();
    expect(store.cursor).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace=packages/client -- --reporter=verbose src/__tests__/stores/feed.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement useFeedStore**

```typescript
// packages/client/src/stores/feed.ts
import { ref, computed } from 'vue';
import { defineStore } from 'pinia';
import type { PostWithAuthor, FeedSort, FeedFilter, FeedContentType } from '@forge/shared';

export const useFeedStore = defineStore('feed', () => {
  const posts = ref<PostWithAuthor[]>([]);
  const sort = ref<FeedSort>('recent');
  const selectedPostId = ref<string | null>(null);
  const cursor = ref<string | null>(null);
  const tag = ref<string | null>(null);
  const filter = ref<FeedFilter | null>(null);
  const contentType = ref<FeedContentType | null>(null);

  const hasMore = computed(() => cursor.value !== null);

  function setPosts(newPosts: PostWithAuthor[]): void {
    posts.value = newPosts;
  }

  function appendPosts(newPosts: PostWithAuthor[]): void {
    posts.value = [...posts.value, ...newPosts];
  }

  function setCursor(value: string | null): void {
    cursor.value = value;
  }

  function setSort(value: FeedSort): void {
    sort.value = value;
  }

  function setFilter(value: FeedFilter | null): void {
    filter.value = value;
  }

  function setTag(value: string | null): void {
    tag.value = value;
  }

  function setContentType(value: FeedContentType | null): void {
    contentType.value = value;
  }

  function setSelectedPostId(id: string | null): void {
    selectedPostId.value = id;
  }

  function reset(): void {
    posts.value = [];
    sort.value = 'recent';
    selectedPostId.value = null;
    cursor.value = null;
    tag.value = null;
    filter.value = null;
    contentType.value = null;
  }

  return {
    posts,
    sort,
    selectedPostId,
    cursor,
    tag,
    filter,
    contentType,
    hasMore,
    setPosts,
    appendPosts,
    setCursor,
    setSort,
    setFilter,
    setTag,
    setContentType,
    setSelectedPostId,
    reset,
  };
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace=packages/client -- --reporter=verbose src/__tests__/stores/feed.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/stores/feed.ts packages/client/src/__tests__/stores/feed.test.ts
git commit -m "feat(client): add useFeedStore with feed state management"
```

---

### Task 6: Dark Mode Composable (`useDarkMode`)

**Files:**

- Create: `packages/client/src/composables/useDarkMode.ts`
- Create: `packages/client/src/__tests__/composables/useDarkMode.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/client/src/__tests__/composables/useDarkMode.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useDarkMode } from '../../composables/useDarkMode.js';

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    clear: () => {
      store = {};
    },
  };
})();
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

const matchMediaMock = vi.fn().mockReturnValue({ matches: false });
Object.defineProperty(globalThis, 'matchMedia', { value: matchMediaMock });

describe('useDarkMode', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorageMock.clear();
    vi.clearAllMocks();
    document.documentElement.classList.remove('dark');
  });

  it('reads initial value from localStorage', () => {
    localStorageMock.getItem.mockReturnValueOnce('light');
    const { isDark } = useDarkMode();
    expect(isDark.value).toBe(false);
  });

  it('falls back to system preference when no localStorage', () => {
    matchMediaMock.mockReturnValueOnce({ matches: true }); // prefers dark
    const { isDark } = useDarkMode();
    expect(isDark.value).toBe(true);
  });

  it('defaults to dark when no localStorage and no system preference', () => {
    const { isDark } = useDarkMode();
    expect(isDark.value).toBe(true);
  });

  it('toggle switches dark ↔ light', () => {
    const { isDark, toggle } = useDarkMode();
    expect(isDark.value).toBe(true);
    toggle();
    expect(isDark.value).toBe(false);
    toggle();
    expect(isDark.value).toBe(true);
  });

  it('toggle persists to localStorage', () => {
    const { toggle } = useDarkMode();
    toggle();
    expect(localStorageMock.setItem).toHaveBeenCalledWith('forge-theme', 'light');
  });

  it('adds dark class to html element when dark', () => {
    useDarkMode();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('removes dark class when toggled to light', () => {
    const { toggle } = useDarkMode();
    toggle();
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace=packages/client -- --reporter=verbose src/__tests__/composables/useDarkMode.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement useDarkMode**

```typescript
// packages/client/src/composables/useDarkMode.ts
import { computed, watch } from 'vue';
import { useUiStore } from '../stores/ui.js';

export function useDarkMode() {
  const store = useUiStore();

  // Initialize from localStorage → system preference → default dark
  const stored = localStorage.getItem('forge-theme');
  if (stored) {
    store.setDarkMode(stored === 'dark');
  } else if (typeof window !== 'undefined' && window.matchMedia) {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    store.setDarkMode(prefersDark || true); // Default dark if no preference
  }

  const isDark = computed(() => store.darkMode);

  // Sync class on <html>
  function applyClass(dark: boolean): void {
    if (dark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }

  // Apply immediately
  applyClass(store.darkMode);

  // Watch for changes
  watch(() => store.darkMode, applyClass);

  function toggle(): void {
    const newValue = !store.darkMode;
    store.setDarkMode(newValue);
    localStorage.setItem('forge-theme', newValue ? 'dark' : 'light');
  }

  return { isDark, toggle };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace=packages/client -- --reporter=verbose src/__tests__/composables/useDarkMode.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/composables/useDarkMode.ts packages/client/src/__tests__/composables/useDarkMode.test.ts
git commit -m "feat(client): add useDarkMode composable with localStorage persistence"
```

---

### Task 7: Feed Composable (`useFeed`)

**Files:**

- Create: `packages/client/src/composables/useFeed.ts`
- Create: `packages/client/src/__tests__/composables/useFeed.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/client/src/__tests__/composables/useFeed.test.ts
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { apiFetch } from '../../lib/api.js';
import { useFeed } from '../../composables/useFeed.js';
import type { PostWithAuthor } from '@forge/shared';

vi.mock('../../lib/api.js', () => ({ apiFetch: vi.fn() }));
const mockApiFetch = apiFetch as Mock;

const mockPost: PostWithAuthor = {
  id: '1',
  authorId: 'u1',
  title: 'Test',
  contentType: 'snippet',
  language: 'ts',
  visibility: 'public',
  isDraft: false,
  forkedFromId: null,
  linkUrl: null,
  linkPreview: null,
  voteCount: 5,
  viewCount: 10,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  author: { id: 'u1', displayName: 'Test', avatarUrl: null },
  tags: [],
};

function mockFetchResponse(data: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    json: () => Promise.resolve(data),
  } as Response;
}

describe('useFeed', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockApiFetch.mockReset();
  });

  it('loadPosts fetches and populates store', async () => {
    mockApiFetch.mockResolvedValue(mockFetchResponse({ posts: [mockPost], cursor: null }));
    const { loadPosts, posts } = useFeed();
    await loadPosts();
    expect(posts.value).toHaveLength(1);
    expect(posts.value[0].id).toBe('1');
  });

  it('loadPosts builds correct query string', async () => {
    mockApiFetch.mockResolvedValue(mockFetchResponse({ posts: [], cursor: null }));
    const { loadPosts } = useFeed();
    await loadPosts();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/posts?sort=recent&limit=20');
  });

  it('loadMore appends posts using cursor', async () => {
    mockApiFetch.mockResolvedValueOnce(mockFetchResponse({ posts: [mockPost], cursor: 'abc' }));
    const { loadPosts, loadMore, posts } = useFeed();
    await loadPosts();

    const post2 = { ...mockPost, id: '2' };
    mockApiFetch.mockResolvedValueOnce(mockFetchResponse({ posts: [post2], cursor: null }));
    await loadMore();
    expect(posts.value).toHaveLength(2);
  });

  it('setSort clears posts and reloads', async () => {
    mockApiFetch.mockResolvedValue(mockFetchResponse({ posts: [mockPost], cursor: null }));
    const { loadPosts, setSort, posts } = useFeed();
    await loadPosts();
    expect(posts.value).toHaveLength(1);

    mockApiFetch.mockResolvedValue(mockFetchResponse({ posts: [], cursor: null }));
    await setSort('trending');
    expect(mockApiFetch).toHaveBeenLastCalledWith('/api/posts?sort=trending&limit=20');
  });

  it('setFilter clears posts and reloads', async () => {
    mockApiFetch.mockResolvedValue(mockFetchResponse({ posts: [], cursor: null }));
    const { setFilter } = useFeed();
    await setFilter('mine');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/posts?sort=recent&filter=mine&limit=20');
  });

  it('error ref is set on fetch failure', async () => {
    mockApiFetch.mockResolvedValue(mockFetchResponse({ error: 'Server error' }, false));
    const { loadPosts, error } = useFeed();
    await loadPosts();
    expect(error.value).toBeTruthy();
  });

  it('error ref is cleared on next load', async () => {
    mockApiFetch.mockResolvedValueOnce(mockFetchResponse({ error: 'fail' }, false));
    const { loadPosts, error } = useFeed();
    await loadPosts();
    expect(error.value).toBeTruthy();

    mockApiFetch.mockResolvedValueOnce(mockFetchResponse({ posts: [], cursor: null }));
    await loadPosts();
    expect(error.value).toBeNull();
  });

  it('loading ref is true during fetch', async () => {
    let resolvePromise: (v: Response) => void;
    mockApiFetch.mockReturnValue(
      new Promise((r) => {
        resolvePromise = r;
      }),
    );
    const { loadPosts, loading } = useFeed();
    const promise = loadPosts();
    expect(loading.value).toBe(true);
    resolvePromise!(mockFetchResponse({ posts: [], cursor: null }));
    await promise;
    expect(loading.value).toBe(false);
  });

  it('selectPost sets selectedPostId', () => {
    const { selectPost, selectedPost } = useFeed();
    selectPost('1');
    // selectedPost is null because no posts loaded
    expect(selectedPost.value).toBeNull();
  });

  it('selectedPost returns matching post', async () => {
    mockApiFetch.mockResolvedValue(mockFetchResponse({ posts: [mockPost], cursor: null }));
    const { loadPosts, selectPost, selectedPost } = useFeed();
    await loadPosts();
    selectPost('1');
    expect(selectedPost.value?.id).toBe('1');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace=packages/client -- --reporter=verbose src/__tests__/composables/useFeed.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement useFeed composable**

```typescript
// packages/client/src/composables/useFeed.ts
import { ref, computed } from 'vue';
import { storeToRefs } from 'pinia';
import { apiFetch } from '../lib/api.js';
import { useFeedStore } from '../stores/feed.js';
import type { FeedSort, FeedFilter, FeedContentType, FeedResponse } from '@forge/shared';

export function useFeed() {
  const store = useFeedStore();
  const { posts, sort, selectedPostId, cursor, tag, filter, contentType, hasMore } =
    storeToRefs(store);
  const error = ref<string | null>(null);
  const loading = ref(false);

  const selectedPost = computed(
    () => posts.value.find((p) => p.id === selectedPostId.value) ?? null,
  );

  function buildUrl(): string {
    const params = new URLSearchParams();
    params.set('sort', store.sort);
    if (store.filter) params.set('filter', store.filter);
    if (store.tag) params.set('tag', store.tag);
    if (store.contentType) params.set('type', store.contentType);
    params.set('limit', '20');
    return `/api/posts?${params.toString()}`;
  }

  async function loadPosts(): Promise<void> {
    error.value = null;
    loading.value = true;
    try {
      const response = await apiFetch(buildUrl());
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        error.value = data.error ?? 'Failed to load posts';
        return;
      }
      const data = (await response.json()) as FeedResponse;
      store.setPosts(data.posts);
      store.setCursor(data.cursor);
    } catch (e) {
      error.value = 'Network error';
    } finally {
      loading.value = false;
    }
  }

  async function loadMore(): Promise<void> {
    if (!store.cursor) return;
    error.value = null;
    loading.value = true;
    try {
      const url = `${buildUrl()}&cursor=${encodeURIComponent(store.cursor)}`;
      const response = await apiFetch(url);
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        error.value = data.error ?? 'Failed to load more posts';
        return;
      }
      const data = (await response.json()) as FeedResponse;
      store.appendPosts(data.posts);
      store.setCursor(data.cursor);
    } catch (e) {
      error.value = 'Network error';
    } finally {
      loading.value = false;
    }
  }

  async function setSort(value: FeedSort): Promise<void> {
    store.setSort(value);
    store.setCursor(null);
    await loadPosts();
  }

  async function setFilter(value: FeedFilter | null): Promise<void> {
    store.setFilter(value);
    store.setCursor(null);
    await loadPosts();
  }

  async function setTag(value: string | null): Promise<void> {
    store.setTag(value);
    store.setCursor(null);
    await loadPosts();
  }

  async function setContentType(value: FeedContentType | null): Promise<void> {
    store.setContentType(value);
    store.setCursor(null);
    await loadPosts();
  }

  function selectPost(id: string | null): void {
    store.setSelectedPostId(id);
  }

  return {
    posts,
    sort,
    selectedPostId,
    cursor,
    tag,
    filter,
    contentType,
    hasMore,
    selectedPost,
    error,
    loading,
    loadPosts,
    loadMore,
    setSort,
    setFilter,
    setTag,
    setContentType,
    selectPost,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace=packages/client -- --reporter=verbose src/__tests__/composables/useFeed.test.ts`
Expected: All PASS

- [ ] **Step 5: Run full client test suite**

Run: `npm test --workspace=packages/client`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/composables/useFeed.ts packages/client/src/__tests__/composables/useFeed.test.ts
git commit -m "feat(client): add useFeed composable with load, sort, filter, pagination"
```

---

## Chunk 3: Components, Router, and Integration

### Task 8: Layout Components (`AppLayout`, `AuthLayout`)

**Files:**

- Create: `packages/client/src/layouts/AppLayout.vue`
- Create: `packages/client/src/layouts/AuthLayout.vue`

- [ ] **Step 1: Implement AuthLayout**

Simple centered card wrapper for login/register:

```vue
<!-- packages/client/src/layouts/AuthLayout.vue -->
<template>
  <div class="flex min-h-screen items-center justify-center bg-surface">
    <div class="w-full max-w-md p-6">
      <RouterView />
    </div>
  </div>
</template>

<script setup lang="ts">
import { RouterView } from 'vue-router';
</script>
```

- [ ] **Step 2: Implement AppLayout shell**

Three-panel layout with responsive breakpoints:

```vue
<!-- packages/client/src/layouts/AppLayout.vue -->
<template>
  <div class="flex h-screen flex-col bg-surface text-gray-200">
    <TheTopBar :sidebar-collapsed="sidebarCollapsed" @toggle-sidebar="handleToggleSidebar" />
    <div class="flex flex-1 overflow-hidden">
      <TheSidebar
        :collapsed="sidebarCollapsed"
        :overlay-open="overlayOpen"
        @close-overlay="overlayOpen = false"
      />
      <main class="flex-1 overflow-hidden">
        <RouterView />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { RouterView } from 'vue-router';
import { storeToRefs } from 'pinia';
import { useUiStore } from '../stores/ui.js';
import TheSidebar from '../components/shell/TheSidebar.vue';
import TheTopBar from '../components/shell/TheTopBar.vue';

const uiStore = useUiStore();
const { sidebarCollapsed } = storeToRefs(uiStore);
const overlayOpen = ref(false);

function handleToggleSidebar(): void {
  // On mobile: toggle overlay; on desktop: toggle collapse
  if (window.innerWidth < 768) {
    overlayOpen.value = !overlayOpen.value;
  } else {
    uiStore.toggleSidebar();
  }
}
</script>
```

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/layouts/AppLayout.vue packages/client/src/layouts/AuthLayout.vue
git commit -m "feat(client): add AppLayout and AuthLayout shell components"
```

---

### Task 9: Shell Components (`TheTopBar`, `TheSidebar`, `UserAvatar`)

**Files:**

- Create: `packages/client/src/components/shell/TheTopBar.vue`
- Create: `packages/client/src/components/shell/TheSidebar.vue`
- Create: `packages/client/src/components/shell/UserAvatar.vue`

- [ ] **Step 1: Implement TheTopBar**

```vue
<!-- packages/client/src/components/shell/TheTopBar.vue -->
<template>
  <header class="flex h-14 shrink-0 items-center gap-4 border-b border-gray-700 bg-surface px-4">
    <button
      class="text-gray-400 hover:text-white lg:hidden"
      aria-label="Toggle sidebar"
      @click="$emit('toggleSidebar')"
    >
      <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M4 6h16M4 12h16M4 18h16"
        />
      </svg>
    </button>
    <div class="flex items-center gap-2">
      <span class="text-lg font-bold text-primary">Forge</span>
    </div>
    <div class="relative mx-4 flex-1">
      <input
        type="text"
        placeholder="Search... (Cmd+K)"
        readonly
        class="w-full max-w-md rounded-lg border border-gray-600 bg-gray-800 px-4 py-1.5 text-sm text-gray-400 placeholder-gray-500 focus:outline-none"
      />
    </div>
    <button class="text-gray-400 hover:text-white" aria-label="Toggle dark mode" @click="toggle">
      <svg v-if="isDark" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
        />
      </svg>
      <svg v-else class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
        />
      </svg>
    </button>
  </header>
</template>

<script setup lang="ts">
import { useDarkMode } from '../../composables/useDarkMode.js';

defineProps<{ sidebarCollapsed: boolean }>();
defineEmits<{ toggleSidebar: [] }>();

const { isDark, toggle } = useDarkMode();
</script>
```

- [ ] **Step 2: Implement UserAvatar**

```vue
<!-- packages/client/src/components/shell/UserAvatar.vue -->
<template>
  <div class="relative">
    <button class="flex items-center gap-2 rounded-lg p-2 hover:bg-gray-700" @click="open = !open">
      <div
        class="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-white"
      >
        {{ initials }}
      </div>
      <span v-if="!collapsed" class="text-sm text-gray-300">{{ user?.displayName }}</span>
    </button>
    <div
      v-if="open"
      class="absolute bottom-full left-0 mb-2 w-48 rounded-lg border border-gray-600 bg-gray-800 py-1 shadow-lg"
    >
      <button
        v-for="item in menuItems"
        :key="item.label"
        class="block w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-gray-700"
        @click="
          item.action();
          open = false;
        "
      >
        {{ item.label }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuth } from '../../composables/useAuth.js';

defineProps<{ collapsed?: boolean }>();

const { user, logout } = useAuth();
const router = useRouter();
const open = ref(false);

const initials = computed(() => {
  const name = user.value?.displayName ?? '';
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
});

const menuItems = [
  { label: 'Profile', action: () => {} }, // TODO: profile page
  { label: 'My Snippets', action: () => router.push('/my-snippets') },
  { label: 'Settings', action: () => {} }, // TODO: settings page
  { label: 'Logout', action: () => logout().then(() => router.push('/login')) },
];
</script>
```

- [ ] **Step 3: Implement TheSidebar**

```vue
<!-- packages/client/src/components/shell/TheSidebar.vue -->
<template>
  <!-- Desktop/tablet sidebar -->
  <aside
    class="hidden shrink-0 flex-col border-r border-gray-700 bg-surface transition-all duration-200 md:flex"
    :class="collapsed ? 'w-14' : 'w-60'"
  >
    <div class="flex flex-1 flex-col overflow-y-auto p-3">
      <!-- Create button -->
      <RouterLink
        to="/posts/new"
        class="mb-4 flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
      >
        <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M12 4v16m8-8H4"
          />
        </svg>
        <span v-if="!collapsed">Create New Post</span>
      </RouterLink>

      <!-- Nav links -->
      <nav class="space-y-1">
        <RouterLink
          v-for="link in navLinks"
          :key="link.to"
          :to="link.to"
          class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white"
          active-class="bg-gray-700 text-white"
        >
          <component :is="link.icon" class="h-5 w-5 shrink-0" />
          <span v-if="!collapsed">{{ link.label }}</span>
        </RouterLink>
      </nav>

      <!-- Tags section -->
      <div v-if="!collapsed" class="mt-6 border-t border-gray-700 pt-4">
        <h3 class="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
          Followed Tags
        </h3>
        <div class="space-y-1 px-3">
          <span class="block text-sm text-gray-400">#frontend</span>
          <span class="block text-sm text-gray-400">#k8s</span>
          <span class="block text-sm text-gray-400">#prompts</span>
        </div>
      </div>
    </div>

    <!-- User profile at bottom -->
    <div class="border-t border-gray-700 p-3">
      <UserAvatar :collapsed="collapsed" />
    </div>
  </aside>

  <!-- Mobile overlay -->
  <Teleport to="body">
    <Transition name="sidebar">
      <div v-if="overlayOpen" class="fixed inset-0 z-40 md:hidden">
        <div class="absolute inset-0 bg-black/50" @click="$emit('closeOverlay')" />
        <aside
          class="absolute inset-y-0 left-0 w-60 flex-col border-r border-gray-700 bg-surface flex"
        >
          <div class="flex flex-1 flex-col overflow-y-auto p-3">
            <RouterLink
              to="/posts/new"
              class="mb-4 flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
              @click="$emit('closeOverlay')"
            >
              <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 4v16m8-8H4"
                />
              </svg>
              <span>Create New Post</span>
            </RouterLink>
            <nav class="space-y-1">
              <RouterLink
                v-for="link in navLinks"
                :key="link.to"
                :to="link.to"
                class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white"
                active-class="bg-gray-700 text-white"
                @click="$emit('closeOverlay')"
              >
                <component :is="link.icon" class="h-5 w-5 shrink-0" />
                <span>{{ link.label }}</span>
              </RouterLink>
            </nav>
            <div class="mt-6 border-t border-gray-700 pt-4">
              <h3 class="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Followed Tags
              </h3>
              <div class="space-y-1 px-3">
                <span class="block text-sm text-gray-400">#frontend</span>
                <span class="block text-sm text-gray-400">#k8s</span>
                <span class="block text-sm text-gray-400">#prompts</span>
              </div>
            </div>
          </div>
          <div class="border-t border-gray-700 p-3">
            <UserAvatar />
          </div>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { h, type FunctionalComponent } from 'vue';
import { RouterLink } from 'vue-router';
import UserAvatar from './UserAvatar.vue';

defineProps<{ collapsed: boolean; overlayOpen: boolean }>();
defineEmits<{ closeOverlay: [] }>();

// Simple SVG icon components
const HomeIcon: FunctionalComponent = () =>
  h('svg', { fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor' }, [
    h('path', {
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'stroke-width': '2',
      d: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1',
    }),
  ]);
const TrendingIcon: FunctionalComponent = () =>
  h('svg', { fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor' }, [
    h('path', {
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'stroke-width': '2',
      d: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6',
    }),
  ]);
const SnippetsIcon: FunctionalComponent = () =>
  h('svg', { fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor' }, [
    h('path', {
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'stroke-width': '2',
      d: 'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4',
    }),
  ]);
const BookmarkIcon: FunctionalComponent = () =>
  h('svg', { fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor' }, [
    h('path', {
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'stroke-width': '2',
      d: 'M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z',
    }),
  ]);

const navLinks = [
  { to: '/', label: 'Home', icon: HomeIcon },
  { to: '/trending', label: 'Trending', icon: TrendingIcon },
  { to: '/my-snippets', label: 'My Snippets', icon: SnippetsIcon },
  { to: '/bookmarks', label: 'Bookmarks', icon: BookmarkIcon },
];
</script>

<style scoped>
.sidebar-enter-active,
.sidebar-leave-active {
  transition:
    opacity 0.2s,
    transform 0.2s;
}
.sidebar-enter-from,
.sidebar-leave-to {
  opacity: 0;
}
.sidebar-enter-from aside,
.sidebar-leave-to aside {
  transform: translateX(-100%);
}
</style>
```

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/components/shell/TheTopBar.vue packages/client/src/components/shell/TheSidebar.vue packages/client/src/components/shell/UserAvatar.vue
git commit -m "feat(client): add shell components — TheTopBar, TheSidebar, UserAvatar"
```

---

### Task 10: Post Feed Components

**Files:**

- Create: `packages/client/src/components/post/PostListFilters.vue`
- Create: `packages/client/src/components/post/PostListItem.vue`
- Create: `packages/client/src/components/post/PostList.vue`
- Create: `packages/client/src/components/post/PostMetaHeader.vue`
- Create: `packages/client/src/components/post/PostActions.vue`
- Create: `packages/client/src/components/post/PostDetail.vue`

- [ ] **Step 1: Implement PostListFilters**

```vue
<!-- packages/client/src/components/post/PostListFilters.vue -->
<template>
  <div class="flex border-b border-gray-700">
    <button
      v-for="tab in tabs"
      :key="tab.value"
      class="px-4 py-2 text-sm font-medium transition-colors"
      :class="
        modelValue === tab.value
          ? 'border-b-2 border-primary text-primary'
          : 'text-gray-400 hover:text-gray-200'
      "
      @click="$emit('update:modelValue', tab.value)"
    >
      {{ tab.label }}
    </button>
  </div>
</template>

<script setup lang="ts">
import type { FeedSort } from '@forge/shared';

defineProps<{ modelValue: FeedSort }>();
defineEmits<{ 'update:modelValue': [value: FeedSort] }>();

const tabs = [
  { label: 'Trending', value: 'trending' as const },
  { label: 'Recent', value: 'recent' as const },
  { label: 'Top', value: 'top' as const },
];
</script>
```

- [ ] **Step 2: Implement PostListItem**

```vue
<!-- packages/client/src/components/post/PostListItem.vue -->
<template>
  <div
    class="cursor-pointer border-b border-gray-700 p-4 transition-colors hover:bg-gray-800"
    :class="{ 'bg-gray-800': selected }"
    @click="handleClick"
  >
    <div class="mb-1 flex items-center gap-2">
      <div
        class="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-xs text-primary"
      >
        {{ post.author.displayName[0]?.toUpperCase() }}
      </div>
      <span class="text-xs text-gray-400">{{ post.author.displayName }}</span>
      <span class="text-xs text-gray-500">{{ timeAgo(post.createdAt) }}</span>
      <span
        v-if="post.isDraft"
        class="rounded bg-yellow-600/20 px-1.5 py-0.5 text-xs text-yellow-400"
      >
        Draft
      </span>
    </div>
    <h3 class="mb-1 text-sm font-medium text-gray-100">{{ post.title }}</h3>
    <div class="flex items-center gap-3 text-xs text-gray-500">
      <span class="flex items-center gap-1">
        <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" />
        </svg>
        {{ post.voteCount }}
      </span>
      <span class="rounded bg-gray-700 px-1.5 py-0.5 text-xs">{{ post.contentType }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import type { PostWithAuthor } from '@forge/shared';

const props = defineProps<{ post: PostWithAuthor; selected: boolean }>();
const emit = defineEmits<{ select: [id: string] }>();
const router = useRouter();

function handleClick(): void {
  // On mobile (<768px), navigate to full-screen post view
  if (window.matchMedia('(max-width: 767px)').matches) {
    router.push(`/posts/${props.post.id}`);
  } else {
    emit('select', props.post.id);
  }
}

function timeAgo(date: Date | string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
</script>
```

- [ ] **Step 3: Implement PostList**

```vue
<!-- packages/client/src/components/post/PostList.vue -->
<template>
  <div class="flex h-full w-full flex-col md:w-[360px] md:shrink-0 md:border-r md:border-gray-700">
    <PostListFilters v-model="sort" @update:model-value="onSortChange" />
    <div class="flex-1 overflow-y-auto">
      <!-- Loading skeleton -->
      <div v-if="loading && posts.length === 0" class="space-y-1">
        <div v-for="i in 5" :key="i" class="animate-pulse border-b border-gray-700 p-4">
          <div class="mb-2 h-3 w-24 rounded bg-gray-700" />
          <div class="mb-2 h-4 w-48 rounded bg-gray-700" />
          <div class="h-3 w-16 rounded bg-gray-700" />
        </div>
      </div>
      <!-- Empty state -->
      <div v-else-if="!loading && posts.length === 0" class="p-8 text-center">
        <p class="text-sm text-gray-400">{{ emptyMessage }}</p>
        <RouterLink
          v-if="showCreateCta"
          to="/posts/new"
          class="mt-3 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
        >
          Create New Post
        </RouterLink>
      </div>
      <!-- Error state -->
      <div v-else-if="error" class="p-8 text-center">
        <p class="mb-3 text-sm text-red-400">{{ error }}</p>
        <button
          class="rounded-lg border border-gray-600 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700"
          @click="$emit('retry')"
        >
          Retry
        </button>
      </div>
      <!-- Post list -->
      <template v-else>
        <PostListItem
          v-for="post in posts"
          :key="post.id"
          :post="post"
          :selected="post.id === selectedPostId"
          @select="$emit('selectPost', $event)"
        />
        <div v-if="hasMore" class="p-4">
          <button
            class="w-full rounded-lg border border-gray-600 py-2 text-sm text-gray-300 hover:bg-gray-700"
            :disabled="loading"
            @click="$emit('loadMore')"
          >
            {{ loading ? 'Loading...' : 'Load More' }}
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { RouterLink } from 'vue-router';
import type { PostWithAuthor, FeedSort } from '@forge/shared';
import PostListFilters from './PostListFilters.vue';
import PostListItem from './PostListItem.vue';

const props = defineProps<{
  posts: PostWithAuthor[];
  selectedPostId: string | null;
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  currentSort: FeedSort;
  currentFilter: string | null;
  currentTag: string | null;
}>();

defineEmits<{
  sortChange: [sort: FeedSort];
  selectPost: [id: string];
  loadMore: [];
  retry: [];
}>();

const sort = ref(props.currentSort);

function onSortChange(value: FeedSort): void {
  sort.value = value;
}

const emptyMessage = computed(() => {
  if (props.currentTag) return `No posts tagged #${props.currentTag}`;
  switch (props.currentFilter) {
    case 'mine':
      return "You haven't created any posts yet";
    case 'bookmarked':
      return 'No bookmarked posts yet';
    default:
      return 'No posts yet — be the first to share!';
  }
});

const showCreateCta = computed(() => props.currentFilter !== 'bookmarked');
</script>
```

- [ ] **Step 4: Implement PostMetaHeader**

```vue
<!-- packages/client/src/components/post/PostMetaHeader.vue -->
<template>
  <div class="mb-4 border-b border-gray-700 pb-4">
    <h1 class="mb-2 text-xl font-bold text-white">{{ post.title }}</h1>
    <div class="flex items-center gap-3">
      <div
        class="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-sm font-bold text-primary"
      >
        {{ post.author.displayName[0]?.toUpperCase() }}
      </div>
      <div>
        <div class="text-sm font-medium text-gray-200">{{ post.author.displayName }}</div>
        <div class="text-xs text-gray-500">Updated {{ timeAgo(post.updatedAt) }}</div>
      </div>
    </div>
    <div v-if="post.isDraft" class="mt-2">
      <span class="rounded bg-yellow-600/20 px-2 py-1 text-xs text-yellow-400">Draft</span>
    </div>
    <div v-if="post.tags.length > 0" class="mt-2 flex flex-wrap gap-1">
      <span
        v-for="tag in post.tags"
        :key="tag"
        class="rounded bg-gray-700 px-2 py-0.5 text-xs text-gray-300"
      >
        #{{ tag }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PostWithAuthor } from '@forge/shared';

defineProps<{ post: PostWithAuthor }>();

function timeAgo(date: Date | string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
</script>
```

- [ ] **Step 5: Implement PostActions (disabled stub)**

```vue
<!-- packages/client/src/components/post/PostActions.vue -->
<template>
  <!-- TODO(#18): Wire vote/bookmark to stores -->
  <div class="flex items-center gap-4 border-b border-gray-700 py-3 opacity-50">
    <button disabled class="flex items-center gap-1 text-sm text-gray-500" aria-label="Upvote">
      <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" />
      </svg>
      {{ post.voteCount }}
    </button>
    <button disabled class="flex items-center gap-1 text-sm text-gray-500" aria-label="Bookmark">
      <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
        />
      </svg>
    </button>
    <button disabled class="flex items-center gap-1 text-sm text-gray-500" aria-label="Share">
      <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
        />
      </svg>
    </button>
  </div>
</template>

<script setup lang="ts">
import type { PostWithAuthor } from '@forge/shared';

defineProps<{ post: PostWithAuthor }>();
</script>
```

- [ ] **Step 6: Implement PostDetail**

```vue
<!-- packages/client/src/components/post/PostDetail.vue -->
<template>
  <div v-if="post" class="flex h-full flex-col overflow-y-auto p-6">
    <PostMetaHeader :post="post" />
    <PostActions :post="post" />
    <div class="mt-4 flex-1">
      <CodeViewer v-if="revision" :code="revision.content" :language="post.language ?? undefined" />
    </div>
    <!-- Comments placeholder — TODO(#19) -->
    <div class="mt-6 border-t border-gray-700 pt-4">
      <h3 class="text-sm font-medium text-gray-400">Comments</h3>
      <p class="mt-2 text-sm text-gray-500">Comments coming soon.</p>
    </div>
  </div>
  <div v-else class="flex h-full items-center justify-center">
    <p class="text-sm text-gray-500">Select a post to view</p>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { apiFetch } from '../../lib/api.js';
import type { PostWithAuthor, PostWithRevision } from '@forge/shared';
import CodeViewer from './CodeViewer.vue';
import PostMetaHeader from './PostMetaHeader.vue';
import PostActions from './PostActions.vue';

const props = defineProps<{ post: PostWithAuthor | null }>();

const fullPost = ref<PostWithRevision | null>(null);

const revision = computed(() => fullPost.value?.revisions?.[0] ?? null);

watch(
  () => props.post?.id,
  async (id) => {
    if (!id) {
      fullPost.value = null;
      return;
    }
    try {
      const response = await apiFetch(`/api/posts/${id}`);
      if (response.ok) {
        fullPost.value = (await response.json()) as PostWithRevision;
      }
    } catch {
      fullPost.value = null;
    }
  },
  { immediate: true },
);
</script>
```

- [ ] **Step 7: Commit**

```bash
git add packages/client/src/components/post/PostListFilters.vue packages/client/src/components/post/PostListItem.vue packages/client/src/components/post/PostList.vue packages/client/src/components/post/PostMetaHeader.vue packages/client/src/components/post/PostActions.vue packages/client/src/components/post/PostDetail.vue
git commit -m "feat(client): add feed components — PostList, PostListItem, PostDetail, PostActions stubs"
```

---

### Task 11: Router Restructure & HomePage Integration

**Files:**

- Modify: `packages/client/src/plugins/router.ts`
- Modify: `packages/client/src/pages/HomePage.vue`

- [ ] **Step 1: Restructure router with nested layout-children routes**

Rewrite `packages/client/src/plugins/router.ts` to use layout components as route parents. Preserve all existing named routes. Keep `/register`, `/auth/callback`, `/auth/link` as top-level routes.

Key changes:

- Import `AppLayout` and `AuthLayout`
- Wrap authenticated routes as children of `AppLayout`
- Wrap `/login` as child of `AuthLayout`
- Keep `/register` top-level with `AuthLayout` wrapper
- Keep `/auth/callback` and `/auth/link` as standalone routes
- Route guards (`beforeEach`) remain unchanged

The `beforeEach` guard checks `meta.requiresAuth` — this propagates from parent to children in Vue Router, so setting it on the `AppLayout` parent applies to all children.

- [ ] **Step 2: Rewrite HomePage with PostList + PostDetail**

```vue
<!-- packages/client/src/pages/HomePage.vue -->
<template>
  <div class="flex h-full">
    <PostList
      :posts="posts"
      :selected-post-id="selectedPostId"
      :loading="loading"
      :error="error"
      :has-more="hasMore"
      :current-sort="sort"
      :current-filter="filter"
      @sort-change="onSortChange"
      @select-post="selectPost"
      @load-more="loadMore"
      @retry="loadPosts"
    />
    <!-- Detail panel: hidden on mobile (users navigate to /posts/:id instead) -->
    <div class="hidden flex-1 md:block">
      <PostDetail :post="selectedPost" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, watch } from 'vue';
import type { FeedSort, FeedFilter } from '@forge/shared';
import { useFeed } from '../composables/useFeed.js';
import PostList from '../components/post/PostList.vue';
import PostDetail from '../components/post/PostDetail.vue';

const props = defineProps<{
  sort?: FeedSort;
  filter?: FeedFilter;
}>();

const {
  posts,
  sort,
  filter,
  selectedPostId,
  hasMore,
  selectedPost,
  error,
  loading,
  loadPosts,
  loadMore,
  setSort,
  setFilter,
  selectPost,
} = useFeed();

// React to route prop changes (Vue Router reuses this component)
watch(
  () => props.sort,
  (newSort) => {
    if (newSort && newSort !== sort.value) setSort(newSort);
  },
  { immediate: false },
);

watch(
  () => props.filter,
  (newFilter) => {
    const filterValue = newFilter ?? null;
    if (filterValue !== filter.value) setFilter(filterValue);
  },
  { immediate: false },
);

function onSortChange(value: FeedSort): void {
  setSort(value);
}

onMounted(async () => {
  // Apply route props on initial mount
  if (props.sort) setSort(props.sort);
  else if (props.filter) setFilter(props.filter);
  else await loadPosts();

  // Auto-select first post on desktop
  if (window.matchMedia('(min-width: 768px)').matches && posts.value.length > 0) {
    selectPost(posts.value[0].id);
  }
});

// Auto-select first post after any load (desktop only)
watch(posts, (newPosts) => {
  if (
    newPosts.length > 0 &&
    !selectedPostId.value &&
    window.matchMedia('(min-width: 768px)').matches
  ) {
    selectPost(newPosts[0].id);
  }
});
</script>
```

- [ ] **Step 3: Verify build**

Run: `npm run build --workspace=packages/client`
Expected: No type errors, clean build

- [ ] **Step 4: Run full test suite**

Run: `npm test`
Expected: All tests pass across all workspaces

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/plugins/router.ts packages/client/src/pages/HomePage.vue
git commit -m "feat(client): restructure router with layout components, wire HomePage feed"
```

---

### Task 12: PostHistoryPage Stub + Component Integration Tests

**Files:**

- Create: `packages/client/src/pages/PostHistoryPage.vue`
- Create: `packages/client/src/__tests__/components/shell/TheSidebar.test.ts`
- Create: `packages/client/src/__tests__/components/shell/UserAvatar.test.ts`
- Create: `packages/client/src/__tests__/pages/HomePage.test.ts`
- Create: `packages/client/src/__tests__/components/post/PostListItem.test.ts`
- Create: `packages/client/src/__tests__/components/post/PostMetaHeader.test.ts`
- Create: `packages/server/src/__tests__/services/feed.test.ts`

- [ ] **Step 1: Create PostHistoryPage stub**

```vue
<!-- packages/client/src/pages/PostHistoryPage.vue -->
<template>
  <div class="flex h-full items-center justify-center">
    <p class="text-sm text-gray-500">Revision history coming soon.</p>
  </div>
</template>
```

- [ ] **Step 2: Write TheSidebar integration test**

```typescript
// packages/client/src/__tests__/components/shell/TheSidebar.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import TheSidebar from '../../../components/shell/TheSidebar.vue';

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/trending', component: { template: '<div />' } },
      { path: '/my-snippets', component: { template: '<div />' } },
      { path: '/bookmarks', component: { template: '<div />' } },
      { path: '/posts/new', component: { template: '<div />' } },
    ],
  });
}

describe('TheSidebar', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('renders all nav links', () => {
    const router = createTestRouter();
    const wrapper = mount(TheSidebar, {
      props: { collapsed: false, overlayOpen: false },
      global: { plugins: [router] },
    });
    expect(wrapper.text()).toContain('Home');
    expect(wrapper.text()).toContain('Trending');
    expect(wrapper.text()).toContain('My Snippets');
    expect(wrapper.text()).toContain('Bookmarks');
  });

  it('renders Create New Post button', () => {
    const router = createTestRouter();
    const wrapper = mount(TheSidebar, {
      props: { collapsed: false, overlayOpen: false },
      global: { plugins: [router] },
    });
    expect(wrapper.text()).toContain('Create New Post');
  });

  it('hides labels when collapsed', () => {
    const router = createTestRouter();
    const wrapper = mount(TheSidebar, {
      props: { collapsed: true, overlayOpen: false },
      global: { plugins: [router] },
    });
    expect(wrapper.text()).not.toContain('Home');
  });

  it('nav links have correct routes', () => {
    const router = createTestRouter();
    const wrapper = mount(TheSidebar, {
      props: { collapsed: false, overlayOpen: false },
      global: { plugins: [router] },
    });
    const links = wrapper.findAll('a');
    const hrefs = links.map((l) => l.attributes('href'));
    expect(hrefs).toContain('/');
    expect(hrefs).toContain('/trending');
    expect(hrefs).toContain('/my-snippets');
    expect(hrefs).toContain('/bookmarks');
  });
});
```

- [ ] **Step 3: Write UserAvatar integration test**

```typescript
// packages/client/src/__tests__/components/shell/UserAvatar.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import UserAvatar from '../../../components/shell/UserAvatar.vue';
import { useAuthStore } from '../../../stores/auth.js';

vi.mock('../../../composables/useAuth.js', () => ({
  useAuth: () => ({
    user: { value: { id: 'u1', displayName: 'Alex Chen', avatarUrl: null } },
    logout: vi.fn().mockResolvedValue(undefined),
  }),
}));

describe('UserAvatar', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('renders user initials', () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<div />' } },
        { path: '/my-snippets', component: { template: '<div />' } },
        { path: '/login', component: { template: '<div />' } },
      ],
    });
    const wrapper = mount(UserAvatar, { global: { plugins: [router] } });
    expect(wrapper.text()).toContain('AC');
  });

  it('shows dropdown with all menu items on click', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<div />' } },
        { path: '/my-snippets', component: { template: '<div />' } },
        { path: '/login', component: { template: '<div />' } },
      ],
    });
    const wrapper = mount(UserAvatar, { global: { plugins: [router] } });
    await wrapper.find('button').trigger('click');
    expect(wrapper.text()).toContain('Profile');
    expect(wrapper.text()).toContain('My Snippets');
    expect(wrapper.text()).toContain('Settings');
    expect(wrapper.text()).toContain('Logout');
  });
});
```

- [ ] **Step 4: Write HomePage integration test (route prop watch + auto-select)**

```typescript
// packages/client/src/__tests__/pages/HomePage.test.ts
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { apiFetch } from '../../lib/api.js';
import HomePage from '../../pages/HomePage.vue';
import type { PostWithAuthor } from '@forge/shared';

vi.mock('../../lib/api.js', () => ({ apiFetch: vi.fn() }));
const mockApiFetch = apiFetch as Mock;

const mockPost: PostWithAuthor = {
  id: '1',
  authorId: 'u1',
  title: 'Test Post',
  contentType: 'snippet',
  language: 'ts',
  visibility: 'public',
  isDraft: false,
  forkedFromId: null,
  linkUrl: null,
  linkPreview: null,
  voteCount: 5,
  viewCount: 10,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  author: { id: 'u1', displayName: 'Test', avatarUrl: null },
  tags: [],
};

function mockFeedResponse(posts: PostWithAuthor[] = [mockPost]) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({ posts, cursor: null }),
  } as Response;
}

// Mock matchMedia for desktop
Object.defineProperty(window, 'matchMedia', {
  value: vi.fn().mockReturnValue({ matches: true }), // desktop
});

describe('HomePage', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockApiFetch.mockReset();
    mockApiFetch.mockResolvedValue(mockFeedResponse());
  });

  it('loads posts on mount and auto-selects first post on desktop', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: HomePage }],
    });
    await router.push('/');
    await router.isReady();
    const wrapper = mount(HomePage, { global: { plugins: [router] } });
    await flushPromises();
    expect(mockApiFetch).toHaveBeenCalled();
    // The PostList component should be rendered with posts
    expect(wrapper.html()).toContain('Test Post');
  });

  it('reloads when sort prop changes (route reuse)', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: HomePage },
        { path: '/trending', component: HomePage, props: { sort: 'trending' } },
      ],
    });
    await router.push('/');
    await router.isReady();
    const wrapper = mount(HomePage, {
      props: { sort: undefined },
      global: { plugins: [router] },
    });
    await flushPromises();
    const callCount = mockApiFetch.mock.calls.length;

    // Simulate prop change (route reuse)
    await wrapper.setProps({ sort: 'trending' });
    await flushPromises();
    expect(mockApiFetch.mock.calls.length).toBeGreaterThan(callCount);
  });

  it('reloads when filter prop changes (route reuse)', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: HomePage },
        { path: '/my-snippets', component: HomePage, props: { filter: 'mine' } },
      ],
    });
    await router.push('/');
    await router.isReady();
    const wrapper = mount(HomePage, {
      props: { filter: undefined },
      global: { plugins: [router] },
    });
    await flushPromises();
    const callCount = mockApiFetch.mock.calls.length;

    await wrapper.setProps({ filter: 'mine' });
    await flushPromises();
    expect(mockApiFetch.mock.calls.length).toBeGreaterThan(callCount);
    expect(mockApiFetch).toHaveBeenLastCalledWith(expect.stringContaining('filter=mine'));
  });

  it('auto-selects first post on desktop after load', async () => {
    mockApiFetch.mockResolvedValue(mockFeedResponse());
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: HomePage }],
    });
    await router.push('/');
    await router.isReady();
    mount(HomePage, { global: { plugins: [router] } });
    await flushPromises();
    // Verify selectedPostId is set in the feed store
    const { useFeedStore } = await import('../../stores/feed.js');
    const store = useFeedStore();
    expect(store.selectedPostId).toBe('1');
  });
});
```

- [ ] **Step 5: Write PostListItem mobile routing test**

```typescript
// packages/client/src/__tests__/components/post/PostListItem.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import PostListItem from '../../../components/post/PostListItem.vue';
import type { PostWithAuthor } from '@forge/shared';

const mockPost: PostWithAuthor = {
  id: '1',
  authorId: 'u1',
  title: 'Test Post',
  contentType: 'snippet',
  language: 'ts',
  visibility: 'public',
  isDraft: false,
  forkedFromId: null,
  linkUrl: null,
  linkPreview: null,
  voteCount: 5,
  viewCount: 10,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  author: { id: 'u1', displayName: 'Test User', avatarUrl: null },
  tags: [],
};

describe('PostListItem', () => {
  it('emits select on click (desktop)', async () => {
    Object.defineProperty(window, 'matchMedia', {
      value: vi.fn().mockReturnValue({ matches: false }), // >767px = false for max-width:767px
    });
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<div />' } },
        { path: '/posts/:id', component: { template: '<div />' } },
      ],
    });
    const wrapper = mount(PostListItem, {
      props: { post: mockPost, selected: false },
      global: { plugins: [router] },
    });
    await wrapper.trigger('click');
    expect(wrapper.emitted('select')).toBeTruthy();
    expect(wrapper.emitted('select')![0]).toEqual(['1']);
  });

  it('navigates to /posts/:id on click (mobile)', async () => {
    Object.defineProperty(window, 'matchMedia', {
      value: vi.fn().mockReturnValue({ matches: true }), // max-width:767px matches = mobile
    });
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<div />' } },
        { path: '/posts/:id', component: { template: '<div />' } },
      ],
    });
    const pushSpy = vi.spyOn(router, 'push');
    const wrapper = mount(PostListItem, {
      props: { post: mockPost, selected: false },
      global: { plugins: [router] },
    });
    await wrapper.trigger('click');
    expect(pushSpy).toHaveBeenCalledWith('/posts/1');
  });

  it('shows draft badge when isDraft is true', () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div />' } }],
    });
    const draftPost = { ...mockPost, isDraft: true };
    const wrapper = mount(PostListItem, {
      props: { post: draftPost, selected: false },
      global: { plugins: [router] },
    });
    expect(wrapper.text()).toContain('Draft');
  });
});
```

- [ ] **Step 6: Write PostMetaHeader component test**

```typescript
// packages/client/src/__tests__/components/post/PostMetaHeader.test.ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import PostMetaHeader from '../../../components/post/PostMetaHeader.vue';
import type { PostWithAuthor } from '@forge/shared';

const mockPost: PostWithAuthor = {
  id: '1',
  authorId: 'u1',
  title: 'Test Post',
  contentType: 'snippet',
  language: 'ts',
  visibility: 'public',
  isDraft: false,
  forkedFromId: null,
  linkUrl: null,
  linkPreview: null,
  voteCount: 5,
  viewCount: 10,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  author: { id: 'u1', displayName: 'Test User', avatarUrl: null },
  tags: ['frontend', 'vue'],
};

describe('PostMetaHeader', () => {
  it('renders post title', () => {
    const wrapper = mount(PostMetaHeader, { props: { post: mockPost } });
    expect(wrapper.text()).toContain('Test Post');
  });

  it('renders author name', () => {
    const wrapper = mount(PostMetaHeader, { props: { post: mockPost } });
    expect(wrapper.text()).toContain('Test User');
  });

  it('renders tag chips', () => {
    const wrapper = mount(PostMetaHeader, { props: { post: mockPost } });
    expect(wrapper.text()).toContain('#frontend');
    expect(wrapper.text()).toContain('#vue');
  });

  it('does not render tags section when tags is empty', () => {
    const noTagsPost = { ...mockPost, tags: [] };
    const wrapper = mount(PostMetaHeader, { props: { post: noTagsPost } });
    expect(wrapper.text()).not.toContain('#');
  });

  it('renders draft badge when isDraft is true', () => {
    const draftPost = { ...mockPost, isDraft: true };
    const wrapper = mount(PostMetaHeader, { props: { post: draftPost } });
    expect(wrapper.text()).toContain('Draft');
  });
});
```

- [ ] **Step 7: Write toPostWithAuthor transform test**

```typescript
// packages/server/src/__tests__/services/feed.test.ts
import { describe, it, expect } from 'vitest';
import { toPostWithAuthor } from '../../services/feed.js';
import type { PostWithAuthorRow } from '../../db/queries/feed.js';

const sampleRow: PostWithAuthorRow = {
  id: '1',
  author_id: 'u1',
  title: 'Test',
  content_type: 'snippet',
  language: 'typescript',
  visibility: 'public',
  is_draft: false,
  forked_from_id: null,
  link_url: null,
  link_preview: null,
  vote_count: 5,
  view_count: 10,
  search_vector: null,
  deleted_at: null,
  created_at: new Date('2026-01-01'),
  updated_at: new Date('2026-01-01'),
  author_display_name: 'Test User',
  author_avatar_url: 'https://example.com/avatar.png',
  tags: 'frontend,vue,typescript',
};

describe('toPostWithAuthor', () => {
  it('maps snake_case row to camelCase DTO', () => {
    const result = toPostWithAuthor(sampleRow);
    expect(result.id).toBe('1');
    expect(result.authorId).toBe('u1');
    expect(result.contentType).toBe('snippet');
    expect(result.isDraft).toBe(false);
    expect(result.voteCount).toBe(5);
    expect(result.createdAt).toEqual(new Date('2026-01-01'));
  });

  it('maps author fields correctly', () => {
    const result = toPostWithAuthor(sampleRow);
    expect(result.author).toEqual({
      id: 'u1',
      displayName: 'Test User',
      avatarUrl: 'https://example.com/avatar.png',
    });
  });

  it('splits comma-separated tags into array', () => {
    const result = toPostWithAuthor(sampleRow);
    expect(result.tags).toEqual(['frontend', 'vue', 'typescript']);
  });

  it('returns empty tags array when tags column is null', () => {
    const result = toPostWithAuthor({ ...sampleRow, tags: null });
    expect(result.tags).toEqual([]);
  });

  it('returns empty tags array when tags column is empty string', () => {
    const result = toPostWithAuthor({ ...sampleRow, tags: '' });
    expect(result.tags).toEqual([]);
  });
});
```

- [ ] **Step 8: Run all tests**

Run: `npm test`
Expected: All PASS across all workspaces

- [ ] **Step 9: Commit**

```bash
git add packages/client/src/pages/PostHistoryPage.vue packages/client/src/__tests__/components/shell/TheSidebar.test.ts packages/client/src/__tests__/components/shell/UserAvatar.test.ts packages/client/src/__tests__/pages/HomePage.test.ts packages/client/src/__tests__/components/post/PostListItem.test.ts packages/client/src/__tests__/components/post/PostMetaHeader.test.ts packages/server/src/__tests__/services/feed.test.ts
git commit -m "feat: add PostHistoryPage stub, component integration tests, and transform tests"
```

---

### Task 13: Manual Smoke Test

- [ ] **Step 1: Start dev servers**

Run: `npm run dev --workspace=packages/server` (in one terminal)
Run: `npm run dev --workspace=packages/client` (in another terminal)

- [ ] **Step 2: Verify in browser**

Check all Definition of Done items:

1. Three-panel layout renders (sidebar + list + detail)
2. Dark mode toggle works (sun/moon in topbar)
3. Sidebar nav links navigate correctly
4. Sidebar collapses on tablet, overlays on mobile (resize browser)
5. Sort tabs (Trending/Recent/Top) reload the feed
6. Clicking a post shows detail with code viewer
7. First post auto-selected on load
8. "Load more" button works (if enough posts exist)
9. "Create New Post" navigates to editor
10. User avatar dropdown renders menu items (Profile, My Snippets, Settings, Logout)
11. Empty/loading/error states render correctly
12. **Mobile: clicking a post navigates to `/posts/:id` full-screen** (resize to <768px)
13. **Tag chips render on PostMetaHeader** (for posts with tags)
14. **Draft badge renders on PostListItem** (navigate to My Snippets)

- [ ] **Step 3: Fix any issues found during smoke test**

- [ ] **Step 4: Final commit if needed**
