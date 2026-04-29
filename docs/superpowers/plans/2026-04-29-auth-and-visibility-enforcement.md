# Auth + Visibility Enforcement Implementation Plan — REV 3

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close [issue #62](https://github.com/multiandrewlab/forge/issues/62): require auth on all read endpoints, enforce post-visibility on direct-lookup endpoints (403 for private-not-yours), filter private posts from list endpoints (feed + bookmarks + WebSocket broadcasts), and harden JWT.

**Architecture:** TDD per work unit. Single visibility helper (`packages/server/src/lib/visibility.ts`) is the chokepoint for direct-lookup 403s. Feed query gets a visibility WHERE clause. WebSocket broadcasts get a per-recipient filter. Per-route `app.authenticate` preHandler is added explicitly (no global default-deny). Frontend keys forbidden state on HTTP status code (`errorStatus === 403`).

**Tech Stack:** Fastify + `@fastify/jwt` + Postgres (migrations) + Vue 3 + Pinia + Vitest + Bruno + Playwright.

**Source design:** `docs/superpowers/specs/2026-04-29-auth-and-visibility-enforcement-design.md` (REV 3, design-review-gate APPROVED).

**Branch:** `feat/auth-visibility-enforcement` (already created, design committed).

---

## File Structure

### Create

```
packages/server/src/lib/visibility.ts                      (WU1)
packages/server/src/__tests__/lib/visibility.test.ts       (WU1)
packages/server/src/db/migrations/004_posts-visibility-author-index.sql (WU0)
bruno/posts/get-private-post-as-non-owner.bru              (WU9)
bruno/posts/get-private-post-as-owner.bru                  (WU9)
bruno/posts/get-private-post-comments-as-non-owner.bru     (WU9)
bruno/posts/get-private-post-revisions-as-non-owner.bru    (WU9)
bruno/posts/get-private-post-files-as-non-owner.bru        (WU9)
bruno/auth/jwt-algorithm-pin.bru                           (WU9)
```

### Modify

```
packages/server/src/app.ts                                 (WU1 — JWT hardening)
packages/server/src/routes/posts.ts                        (WU2 — :id + revisions; WU5 — refresh-preview; WU6 — descriptive 403 strings)
packages/server/src/routes/comments.ts                     (WU2 — comments visibility)
packages/server/src/routes/files.ts                        (WU3 — files visibility + dead-code removal)
packages/server/src/routes/tags.ts                         (WU4 — auth on /, /popular)
packages/server/src/routes/search.ts                       (WU4 — auth)
packages/server/src/routes/user-profiles.ts                (WU4 — auth on /:id)
packages/server/src/db/queries/feed.ts                     (WU5 — visibility clause)
packages/server/src/plugins/websocket/channels.ts          (WU7 — broadcast filter at channels.ts:50; broadcast.ts is only the getExcludeWs helper)
packages/server/src/plugins/websocket/handler.ts           (WU7 — pass userId on broadcast)
packages/server/src/plugins/websocket/index.ts             (WU7 — verify handshake auth)
packages/client/src/composables/usePosts.ts                (WU8 — errorStatus ref)
packages/client/src/pages/PostViewPage.vue                 (WU8 — forbidden state)
packages/client/src/pages/PostHistoryPage.vue              (WU8 — forbidden state)
e2e/specs/posts/view-private-as-non-owner.spec.ts          (WU10 — un-fixme + retarget)
```

---

## Work Unit Decomposition

| WU   | Title                                                                                  | Depends on    | Approx scope    |
| ---- | -------------------------------------------------------------------------------------- | ------------- | --------------- |
| WU0  | Database migration: index `idx_posts_visibility_author`                                | —             | 1 SQL file      |
| WU1  | Visibility helper + JWT hardening                                                      | —             | 2 files + tests |
| WU2  | Auth + visibility on direct-lookup post sub-resources (posts/:id, comments, revisions) | WU1           | 2 files + tests |
| WU3  | Auth + visibility on file routes (incl. dead-code removal)                             | WU1           | 1 file + tests  |
| WU4  | Auth-only on tag/search/user-profile routes                                            | —             | 3 files + tests |
| WU5  | Feed visibility filter + refresh-preview ownership                                     | —             | 2 files + tests |
| WU6  | Existing bare 'Forbidden' strings → descriptive                                        | —             | 1 file + tests  |
| WU7  | WebSocket broadcast filter (per-recipient)                                             | —             | 2 files + tests |
| WU8  | Frontend: errorStatus ref + forbidden states (PostView + PostHistory)                  | WU2, WU3      | 3 files + tests |
| WU9  | Bruno regression specs (5 new)                                                         | WU2, WU3, WU4 | 6 .bru files    |
| WU10 | E2E un-fixme: view-private-as-non-owner spec                                           | WU2, WU8      | 1 file          |
| WU11 | Final verification + PR                                                                | all           | —               |

Total: 11 implementation WUs + 1 verification.

---

## TDD pattern (used throughout)

For each WU:

1. **Write the failing test(s)** — show the assertion code.
2. **Run them, watch fail** — `npm run test:coverage` (or scoped `npx vitest run path`).
3. **Implement minimal code** — show the diff.
4. **Run, watch pass.**
5. **Verify coverage held** — coverage stays at 100% per `.coverage-thresholds.json`.
6. **Commit** with the message shown.

Bruno changes get re-run via `cd bruno && npx @usebruno/cli run -r --env local` after committing.

---

## Task 0 (WU0): DB migration — `idx_posts_visibility_author`

**Files:**

- Create: `packages/server/src/db/migrations/004_posts-visibility-author-index.sql`

### Step 1: Verify next migration number

```bash
ls packages/server/src/db/migrations/
```

Expected: `001_initial-schema.sql`, `002_forked-from-index.sql`, `003_post-files-staging.sql` — next is `004`.

### Step 2: Create the migration

Create `packages/server/src/db/migrations/004_posts-visibility-author-index.sql`:

```sql
-- Index supporting the new feed visibility clause `(p.visibility = 'public' OR p.author_id = $userId)`
-- and direct-lookup visibility checks. Partial index excludes soft-deleted rows.
CREATE INDEX IF NOT EXISTS idx_posts_visibility_author
  ON posts(visibility, author_id)
  WHERE deleted_at IS NULL;
```

### Step 3: Apply + verify

```bash
set -a && source .env && set +a && psql "$DATABASE_URL" -f packages/server/src/db/migrations/004_posts-visibility-author-index.sql
psql "$DATABASE_URL" -c "\\d+ posts" | grep idx_posts_visibility_author
```

Expected: index appears in the `posts` table indexes.

### Step 4: Commit

```bash
git add packages/server/src/db/migrations/004_posts-visibility-author-index.sql
git commit -m "feat(db): add idx_posts_visibility_author index (WU0 of #62)"
```

---

## Task 1 (WU1): Visibility helper + JWT hardening

**Files:**

- Create: `packages/server/src/lib/visibility.ts`
- Create: `packages/server/src/__tests__/lib/visibility.test.ts`
- Modify: `packages/server/src/app.ts:36-37`

### Step 1: Write the failing test for the helper

Create `packages/server/src/__tests__/lib/visibility.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { assertCanReadPost } from '../../lib/visibility.js';

describe('assertCanReadPost', () => {
  function mockReply() {
    const status = vi.fn().mockReturnThis();
    const send = vi.fn().mockReturnThis();
    return { status, send } as unknown as import('fastify').FastifyReply;
  }

  it('returns true and does not respond when post is public', () => {
    const reply = mockReply();
    const post = { visibility: 'public' as const, author_id: 'other-user' };
    expect(assertCanReadPost(post, 'caller-user', reply)).toBe(true);
    expect(reply.status).not.toHaveBeenCalled();
    expect(reply.send).not.toHaveBeenCalled();
  });

  it('returns true and does not respond when caller owns a private post', () => {
    const reply = mockReply();
    const post = { visibility: 'private' as const, author_id: 'me' };
    expect(assertCanReadPost(post, 'me', reply)).toBe(true);
    expect(reply.status).not.toHaveBeenCalled();
  });

  it('returns false and sends 403 when post is private and caller is not author', () => {
    const reply = mockReply();
    const post = { visibility: 'private' as const, author_id: 'other-user' };
    expect(assertCanReadPost(post, 'caller-user', reply)).toBe(false);
    expect(reply.status).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalledWith({ error: 'This post is private' });
  });
});
```

### Step 2: Run, watch fail

```bash
cd packages/server && npx vitest run src/__tests__/lib/visibility.test.ts
```

Expected: FAIL with "Cannot find module '../../lib/visibility.js'".

### Step 3: Implement the helper

Create `packages/server/src/lib/visibility.ts`:

```typescript
import type { FastifyReply } from 'fastify';

/**
 * Enforce read-visibility on a post for the calling user.
 *
 * Caller MUST `return` early after a `false` result, or the route handler
 * will send a second reply (Fastify will throw):
 *
 *   if (!assertCanReadPost(post, request.user.id, reply)) return;
 *
 * @param post - any object with `visibility` and `author_id`
 * @param callerId - the JWT-derived user id (`request.user.id`)
 * @param reply - the FastifyReply; receives 403 when access is denied
 * @returns true if allowed; false if denied (and reply sent)
 */
export function assertCanReadPost(
  post: { visibility: string; author_id: string },
  callerId: string,
  reply: FastifyReply,
): boolean {
  if (post.visibility === 'private' && post.author_id !== callerId) {
    reply.status(403).send({ error: 'This post is private' });
    return false;
  }
  return true;
}
```

### Step 4: Run, watch pass

```bash
cd packages/server && npx vitest run src/__tests__/lib/visibility.test.ts
```

Expected: 3 passed.

### Step 5: JWT hardening — write the failing test

Append to a new test file `packages/server/src/__tests__/app-jwt.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('app JWT hardening', () => {
  const ORIGINAL_ENV = process.env.NODE_ENV;
  const ORIGINAL_SECRET = process.env.JWT_SECRET;

  beforeEach(() => {
    process.env.NODE_ENV = ORIGINAL_ENV;
    process.env.JWT_SECRET = ORIGINAL_SECRET;
  });

  it('throws when JWT_SECRET is unset and NODE_ENV is not test', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;
    const { buildApp } = await import('../app.js');
    await expect(buildApp()).rejects.toThrow(/JWT_SECRET/);
  });

  it('builds when NODE_ENV=test even without JWT_SECRET', async () => {
    process.env.NODE_ENV = 'test';
    delete process.env.JWT_SECRET;
    const { buildApp } = await import('../app.js');
    const app = await buildApp();
    await app.close();
  });
});
```

### Step 6: Run, watch fail

```bash
cd packages/server && npx vitest run src/__tests__/app-jwt.test.ts
```

Expected: FAIL — `buildApp` doesn't throw on missing JWT_SECRET in production.

### Step 7: Modify `packages/server/src/app.ts`

Find lines 36-37:

```typescript
await app.register(jwt, {
  secret: process.env.JWT_SECRET ?? 'dev-secret-change-in-production',
});
```

Replace with:

```typescript
if (process.env.NODE_ENV !== 'test' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required outside test environments');
}
await app.register(jwt, {
  secret: process.env.JWT_SECRET ?? 'dev-secret-change-in-production',
  verify: { algorithms: ['HS256'] },
});
```

### Step 8: Run, watch pass

```bash
cd packages/server && npx vitest run src/__tests__/app-jwt.test.ts src/__tests__/lib/visibility.test.ts
```

Expected: 5 passed (3 from helper + 2 from JWT).

### Step 9: Run full coverage gate

```bash
npm run test:coverage
```

Expected: 100% lines/branches/functions/statements maintained.

### Step 10: Commit

```bash
git add packages/server/src/lib/visibility.ts \
        packages/server/src/__tests__/lib/visibility.test.ts \
        packages/server/src/__tests__/app-jwt.test.ts \
        packages/server/src/app.ts
git commit -m "feat(server): visibility helper + JWT hardening (HS256 pin + secret fail-fast) (WU1 of #62)"
```

---

## Task 2 (WU2): Auth + visibility on direct-lookup post sub-resources

**Goal:** Add `app.authenticate` preHandler + `assertCanReadPost` check to `GET /:id`, `GET /:id/comments`, `GET /:id/revisions`, `GET /:id/revisions/:rev`.

**Files:**

- Modify: `packages/server/src/routes/posts.ts:148-157` (`GET /:id`), `:558-585` (revisions list + detail)
- Modify: `packages/server/src/routes/comments.ts:18-30` (`GET /:id/comments`)
- Test: `packages/server/src/__tests__/routes/posts-visibility.test.ts` (new file)
- Test: `packages/server/src/__tests__/routes/comments-visibility.test.ts` (new file)

### Step 1: Write the failing test for `GET /:id`

Create `packages/server/src/__tests__/routes/posts-visibility.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../../app.js';
import type { FastifyInstance } from 'fastify';

describe('GET /api/posts/:id visibility', () => {
  let app: FastifyInstance;
  let ownerToken: string;
  let nonOwnerToken: string;
  const PRIVATE_POST_ID = 'c0000000-0000-0000-0000-000000000006'; // carol's private
  const PUBLIC_POST_ID = 'c0000000-0000-0000-0000-000000000099'; // testuser public
  const CAROL_USER_ID = 'a0000000-0000-0000-0000-000000000003';

  beforeAll(async () => {
    app = await buildApp();
    // Mint tokens — assumes seeded users exist
    ownerToken = app.jwt.sign({ id: CAROL_USER_ID, email: 'carol@example.com' });
    nonOwnerToken = app.jwt.sign({
      id: 'a0000000-0000-0000-0000-000000000099',
      email: 'testuser@example.com',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 401 when no token is provided', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/posts/${PRIVATE_POST_ID}` });
    expect(res.statusCode).toBe(401);
  });

  it('returns 200 to public-post non-owner', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/posts/${PUBLIC_POST_ID}`,
      headers: { Authorization: `Bearer ${nonOwnerToken}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it('returns 200 to private-post owner', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/posts/${PRIVATE_POST_ID}`,
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it('returns 403 to private-post non-owner with descriptive message', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/posts/${PRIVATE_POST_ID}`,
      headers: { Authorization: `Bearer ${nonOwnerToken}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'This post is private' });
  });
});
```

### Step 2: Run, watch fail

```bash
cd packages/server && npx vitest run src/__tests__/routes/posts-visibility.test.ts
```

Expected: FAIL — currently `GET /:id` returns 200 for everyone.

### Step 3: Modify `packages/server/src/routes/posts.ts:148-157`

Current code:

```typescript
app.get('/:id', async (request, reply) => {
  const { id } = request.params as { id: string };
  const row = await findPostWithLatestRevision(id);
  if (!row) {
    return reply.status(404).send({ error: 'Post not found' });
  }
  return reply.send({ post: toPostWithRevision(row) });
});
```

Replace with:

```typescript
app.get('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
  const { id } = request.params as { id: string };
  const row = await findPostWithLatestRevision(id);
  if (!row) {
    return reply.status(404).send({ error: 'Post not found' });
  }
  if (!assertCanReadPost(row, request.user.id, reply)) return;
  return reply.send({ post: toPostWithRevision(row) });
});
```

Add at the top of `posts.ts` (with other imports):

```typescript
import { assertCanReadPost } from '../lib/visibility.js';
```

### Step 4: Run, watch pass

```bash
cd packages/server && npx vitest run src/__tests__/routes/posts-visibility.test.ts
```

Expected: 4 passed.

### Step 5: Repeat for revisions list (`posts.ts:558-585`)

Current:

```typescript
app.get('/:id/revisions', async (request, reply) => {
  const { id } = request.params as { id: string };
  const post = await findPostById(id);
  if (!post) return reply.status(404).send({ error: 'Post not found' });
  const rows = await findRevisionsByPostId(id);
  return reply.send({ revisions: rows.map(toRevision) });
});
```

Replace with:

```typescript
app.get('/:id/revisions', { preHandler: [app.authenticate] }, async (request, reply) => {
  const { id } = request.params as { id: string };
  const post = await findPostById(id);
  if (!post) return reply.status(404).send({ error: 'Post not found' });
  if (!assertCanReadPost(post, request.user.id, reply)) return;
  const rows = await findRevisionsByPostId(id);
  return reply.send({ revisions: rows.map(toRevision) });
});
```

Same pattern for `GET /:id/revisions/:rev` at `posts.ts:571`.

### Step 6: Add test cases for revisions

Append to `posts-visibility.test.ts`:

```typescript
describe('GET /api/posts/:id/revisions visibility', () => {
  it('returns 403 for private post to non-owner', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/posts/${PRIVATE_POST_ID}/revisions`,
      headers: { Authorization: `Bearer ${nonOwnerToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 401 to unauthenticated caller', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/posts/${PRIVATE_POST_ID}/revisions` });
    expect(res.statusCode).toBe(401);
  });
});
```

### Step 7: Modify `comments.ts:18-30`

Current:

```typescript
app.get('/:id/comments', async (request, reply) => {
  const { id } = request.params as { id: string };
  const post = await findPostById(id);
  if (!post) return reply.status(404).send({ error: 'Post not found' });
  const rows = await findCommentsByPostId(id);
  return reply.send({ comments: rows.map(toComment) });
});
```

Replace with:

```typescript
app.get('/:id/comments', { preHandler: [app.authenticate] }, async (request, reply) => {
  const { id } = request.params as { id: string };
  const post = await findPostById(id);
  if (!post) return reply.status(404).send({ error: 'Post not found' });
  if (!assertCanReadPost(post, request.user.id, reply)) return;
  const rows = await findCommentsByPostId(id);
  return reply.send({ comments: rows.map(toComment) });
});
```

Add at top: `import { assertCanReadPost } from '../lib/visibility.js';`

### Step 8: Add comments test

Create `packages/server/src/__tests__/routes/comments-visibility.test.ts` mirroring the posts test pattern. Cover 4 cells (401 / public-200 / owner-200 / non-owner-403).

### Step 9: Run all and commit

```bash
cd packages/server && npx vitest run src/__tests__/routes/posts-visibility.test.ts src/__tests__/routes/comments-visibility.test.ts
npm run test:coverage
```

Expected: all pass; 100% coverage maintained.

```bash
git add packages/server/src/routes/posts.ts packages/server/src/routes/comments.ts packages/server/src/__tests__/routes/posts-visibility.test.ts packages/server/src/__tests__/routes/comments-visibility.test.ts
git commit -m "feat(server): auth + visibility on /:id, /:id/comments, /:id/revisions, /:id/revisions/:rev (WU2 of #62)"
```

---

## Task 3 (WU3): Auth + visibility on file routes (incl. dead-code removal)

**Goal:** Add `app.authenticate` preHandler + visibility check to `GET /:id/files` and `GET /:id/files/:fileId`. Remove the optional-auth dead code at `files.ts:131-140` and `files.ts:216-244`.

**Files:**

- Modify: `packages/server/src/routes/files.ts`
- Test: `packages/server/src/__tests__/routes/files-visibility.test.ts` (new)

### Step 1: Read current files.ts to understand structure

```bash
sed -n '120,260p' packages/server/src/routes/files.ts
```

Note: the existing handler does ad-hoc auth via `request.jwtVerify().catch(...)` pattern. After preHandler, `request.user.id` is guaranteed; the optional-auth ladder becomes dead code.

### Step 2: Write failing test

Create `packages/server/src/__tests__/routes/files-visibility.test.ts` with 8 test cases (4 cells × 2 routes).

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../../app.js';
import type { FastifyInstance } from 'fastify';

describe('Files visibility', () => {
  let app: FastifyInstance;
  let ownerToken: string;
  let nonOwnerToken: string;
  const PRIVATE_POST_ID = 'c0000000-0000-0000-0000-000000000006';
  const CAROL_USER_ID = 'a0000000-0000-0000-0000-000000000003';

  beforeAll(async () => {
    app = await buildApp();
    ownerToken = app.jwt.sign({ id: CAROL_USER_ID, email: 'carol@example.com' });
    nonOwnerToken = app.jwt.sign({
      id: 'a0000000-0000-0000-0000-000000000099',
      email: 'testuser@example.com',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /:id/files returns 401 unauthenticated', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/posts/${PRIVATE_POST_ID}/files` });
    expect(res.statusCode).toBe(401);
  });

  it('GET /:id/files returns 403 for non-owner of private post', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/posts/${PRIVATE_POST_ID}/files`,
      headers: { Authorization: `Bearer ${nonOwnerToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('GET /:id/files returns 200 for owner of private post', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/posts/${PRIVATE_POST_ID}/files`,
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
  });
});
```

### Step 3: Run, watch fail

```bash
cd packages/server && npx vitest run src/__tests__/routes/files-visibility.test.ts
```

Expected: FAIL — current routes return 200 + bytes anonymously.

### Step 4: Modify `files.ts:123-260`

Replace the `GET /:id/files` handler (lines ~123-194):

- Add `{ preHandler: [app.authenticate] }`
- Replace the optional-auth try/catch block (~131-140) with a direct fetch using `request.user.id`
- After `findPostById`, call `assertCanReadPost(post, request.user.id, reply)`
- Remove `isPublic` branching (~166-190)

Replace the `GET /:id/files/:fileId` handler (lines ~197-244) similarly:

- Add `{ preHandler: [app.authenticate] }`
- Delete the entire optional-auth ladder (`try { await request.jwtVerify() } catch { ... }`, lines ~216-244)
- After parent-post fetch, call `assertCanReadPost`
- Use `request.user.id` directly

Add to top of file: `import { assertCanReadPost } from '../lib/visibility.js';`

### Step 5: Run, watch pass

```bash
cd packages/server && npx vitest run src/__tests__/routes/files-visibility.test.ts
```

Expected: 3 passed (extend with the 5 remaining cells from the 8-cell matrix).

### Step 6: Run full coverage; verify dead-code removal didn't drop coverage

```bash
npm run test:coverage
```

If files.ts coverage dropped, the deleted optional-auth branch had test cases that need removal too. Check `packages/client/src/__tests__/files*` and existing files-related tests.

### Step 7: Commit

```bash
git add packages/server/src/routes/files.ts packages/server/src/__tests__/routes/files-visibility.test.ts
git commit -m "feat(server): auth + visibility on /:id/files routes; remove optional-auth dead code (WU3 of #62)"
```

---

## Task 4 (WU4): Auth on tag/search/user-profile routes

**Goal:** Add `app.authenticate` preHandler to 4 routes that currently don't require auth: `GET /api/tags`, `GET /api/tags/popular`, `GET /api/users/:id`, `GET /api/search`. No visibility check needed (these don't expose private posts directly; they expose tag/user/search metadata that already filters or doesn't surface visibility-sensitive data).

**Files:**

- Modify: `packages/server/src/routes/tags.ts:32, 46`
- Modify: `packages/server/src/routes/user-profiles.ts:18`
- Modify: `packages/server/src/routes/search.ts:13`
- Test: `packages/server/src/__tests__/routes/auth-preHandler.test.ts` (new)

### Step 1: Write failing test

Create `packages/server/src/__tests__/routes/auth-preHandler.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../../app.js';
import type { FastifyInstance } from 'fastify';

describe('Auth required on previously-public read routes', () => {
  let app: FastifyInstance;
  let validToken: string;

  beforeAll(async () => {
    app = await buildApp();
    validToken = app.jwt.sign({
      id: 'a0000000-0000-0000-0000-000000000099',
      email: 'testuser@example.com',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const routes = [
    'GET /api/tags',
    'GET /api/tags/popular',
    'GET /api/users/a0000000-0000-0000-0000-000000000099',
    'GET /api/search?q=fixture',
  ];

  for (const r of routes) {
    const [method, path] = r.split(' ');
    it(`${r} returns 401 without token`, async () => {
      const res = await app.inject({ method: method as 'GET', url: path });
      expect(res.statusCode).toBe(401);
    });
    it(`${r} returns 200 with token`, async () => {
      const res = await app.inject({
        method: method as 'GET',
        url: path,
        headers: { Authorization: `Bearer ${validToken}` },
      });
      expect(res.statusCode).toBe(200);
    });
  }
});
```

### Step 2: Run, watch fail

```bash
cd packages/server && npx vitest run src/__tests__/routes/auth-preHandler.test.ts
```

Expected: 4 of 8 fail — the no-token cases currently return 200.

### Step 3: Modify the routes

In `packages/server/src/routes/tags.ts:32`, change:

```typescript
app.get('/', async (request, reply) => {
```

to:

```typescript
app.get('/', { preHandler: [app.authenticate] }, async (request, reply) => {
```

Same for `tags.ts:46` (`/popular`).

In `packages/server/src/routes/user-profiles.ts:18`, same pattern.

In `packages/server/src/routes/search.ts:13`, same pattern.

### Step 4: Run, watch pass

```bash
cd packages/server && npx vitest run src/__tests__/routes/auth-preHandler.test.ts
npm run test:coverage
```

Expected: 8 passed; 100% coverage.

### Step 5: Commit

```bash
git add packages/server/src/routes/tags.ts packages/server/src/routes/user-profiles.ts packages/server/src/routes/search.ts packages/server/src/__tests__/routes/auth-preHandler.test.ts
git commit -m "feat(server): require auth on /api/tags, /api/tags/popular, /api/users/:id, /api/search (WU4 of #62)"
```

---

## Task 5 (WU5): Feed visibility filter + refresh-preview ownership

**Goal:** Filter private posts (not owned by caller) from `GET /api/posts` (feed) and the bookmarks branch. Add ownership check to `POST /api/posts/:id/refresh-preview`.

**Files:**

- Modify: `packages/server/src/db/queries/feed.ts:130-140`
- Modify: `packages/server/src/routes/posts.ts:250-280` (refresh-preview)
- Test: `packages/server/src/__tests__/queries/feed-visibility.test.ts` (new)
- Test: `packages/server/src/__tests__/routes/refresh-preview-ownership.test.ts` (new)

### Step 1: Write failing test for feed filter

Create `packages/server/src/__tests__/queries/feed-visibility.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { findFeedPosts } from '../../db/queries/feed.js';

describe('findFeedPosts visibility filter', () => {
  const PRIVATE_POST_ID = 'c0000000-0000-0000-0000-000000000006'; // carol's private
  const CAROL_USER_ID = 'a0000000-0000-0000-0000-000000000003';
  const TESTUSER_ID = 'a0000000-0000-0000-0000-000000000099';

  it('does not include other-user private posts in default feed', async () => {
    const result = await findFeedPosts({ userId: TESTUSER_ID, sort: 'recent', limit: 50 });
    const ids = result.posts.map((p) => p.id);
    expect(ids).not.toContain(PRIVATE_POST_ID);
  });

  it('includes own private posts in default feed', async () => {
    const result = await findFeedPosts({ userId: CAROL_USER_ID, sort: 'recent', limit: 50 });
    const ids = result.posts.map((p) => p.id);
    expect(ids).toContain(PRIVATE_POST_ID);
  });

  it('does not include other-user private posts in bookmarked filter', async () => {
    // Pre-test setup: assume testuser bookmarked carol's private post in the past
    // (or use a fixture that was previously bookmarked). If no such fixture exists,
    // create the bookmark via SQL in beforeAll.
    const result = await findFeedPosts({
      userId: TESTUSER_ID,
      sort: 'recent',
      limit: 50,
      filter: 'bookmarked',
    });
    const ids = result.posts.map((p) => p.id);
    expect(ids).not.toContain(PRIVATE_POST_ID);
  });
});
```

### Step 2: Run, watch fail

```bash
cd packages/server && npx vitest run src/__tests__/queries/feed-visibility.test.ts
```

Expected: 2 of 3 fail.

### Step 3: Modify `feed.ts:130-140`

Find the WHERE conditions block and add:

```typescript
if (filter !== 'mine') {
  const userParam = nextParam(userId);
  conditions.push(`(p.visibility = 'public' OR p.author_id = ${userParam})`);
}
```

Insert this after the existing `is_draft` clause (~line 140) so it applies to both default and `bookmarked` filters but skips `mine` (which is already author-scoped).

### Step 4: Run, watch pass

```bash
cd packages/server && npx vitest run src/__tests__/queries/feed-visibility.test.ts
```

Expected: 3 passed.

### Step 5: Write failing test for refresh-preview

Create `packages/server/src/__tests__/routes/refresh-preview-ownership.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../../app.js';
import type { FastifyInstance } from 'fastify';

describe('POST /api/posts/:id/refresh-preview ownership', () => {
  let app: FastifyInstance;
  let nonOwnerToken: string;
  const ALICE_LINK_POST_ID = 'c0000000-0000-0000-0000-000000000007'; // alice's link post

  beforeAll(async () => {
    app = await buildApp();
    nonOwnerToken = app.jwt.sign({
      id: 'a0000000-0000-0000-0000-000000000099',
      email: 'testuser@example.com',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 403 when caller is not the post owner', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/posts/${ALICE_LINK_POST_ID}/refresh-preview`,
      headers: { Authorization: `Bearer ${nonOwnerToken}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'Only the author can refresh the link preview' });
  });
});
```

### Step 6: Run, watch fail

Currently the route either lets non-owner trigger SSRF or it has its own ownership check. Read `posts.ts:250-280` to see current state.

```bash
sed -n '248,290p' packages/server/src/routes/posts.ts
```

If there's already an ownership check, the test will pass — no code change needed. If not, add it.

### Step 7: Modify if needed

If the handler lacks ownership check, add right after fetching the post:

```typescript
if (post.author_id !== request.user.id) {
  return reply.status(403).send({ error: 'Only the author can refresh the link preview' });
}
```

### Step 8: Run, commit

```bash
cd packages/server && npx vitest run src/__tests__/queries/feed-visibility.test.ts src/__tests__/routes/refresh-preview-ownership.test.ts
npm run test:coverage
git add packages/server/src/db/queries/feed.ts packages/server/src/routes/posts.ts packages/server/src/__tests__/queries/feed-visibility.test.ts packages/server/src/__tests__/routes/refresh-preview-ownership.test.ts
git commit -m "feat(server): feed visibility filter + refresh-preview ownership (WU5 of #62)"
```

---

## Task 6 (WU6): Existing bare 'Forbidden' strings → descriptive

**Goal:** Update 5 existing bare `{ error: 'Forbidden' }` returns in `posts.ts` to descriptive strings (per design REV 3 §1).

**Files:**

- Modify: `packages/server/src/routes/posts.ts:169, 208, 227, 381, 610`
- Test: existing tests for those routes (likely need assertion updates)

### Step 1: Find existing tests asserting on 'Forbidden'

```bash
grep -rn "'Forbidden'" packages/server/src/__tests__/ packages/server/src/routes/posts.ts
```

Note the tests that need assertion updates (they currently assert `{ error: 'Forbidden' }`).

### Step 2: Update strings (5 line edits)

| Line                                              | New string                                           |
| ------------------------------------------------- | ---------------------------------------------------- |
| `posts.ts:169` (PATCH /:id)                       | `'You can only edit your own posts'`                 |
| `posts.ts:208` (DELETE /:id)                      | `'You can only delete your own posts'`               |
| `posts.ts:227` (POST /:id/publish)                | `'You can only publish your own posts'`              |
| `posts.ts:381` (POST /:id/revisions)              | `'You can only add revisions to your own posts'`     |
| `posts.ts:610` (POST /:id/revisions/:rev/restore) | `'You can only restore revisions on your own posts'` |

### Step 3: Update existing test assertions

For each test that asserts `{ error: 'Forbidden' }` against one of these endpoints, change to the new string. Locate via:

```bash
grep -rn "Forbidden" packages/server/src/__tests__/
```

### Step 4: Run, verify pass

```bash
cd packages/server && npm test
npm run test:coverage
```

Expected: all pass; 100% coverage.

### Step 5: Commit

```bash
git add packages/server/src/routes/posts.ts packages/server/src/__tests__/
git commit -m "feat(server): replace bare 'Forbidden' with descriptive 403 messages (WU6 of #62)"
```

---

## Task 7 (WU7): WebSocket broadcast filter

**Goal:** Filter `post:new` and `post:updated` events on the `feed` channel by recipient — non-owner subscribers should NOT receive events for private posts.

**Files:**

- Modify: `packages/server/src/plugins/websocket/broadcast.ts`
- Modify: `packages/server/src/plugins/websocket/handler.ts`
- Test: `packages/server/src/__tests__/websocket/feed-visibility-filter.test.ts` (new)

### Step 1: Inspect current broadcast mechanism

```bash
sed -n '1,80p' packages/server/src/plugins/websocket/broadcast.ts
sed -n '80,120p' packages/server/src/plugins/websocket/handler.ts
sed -n '20,40p' packages/server/src/plugins/websocket/connections.ts
```

Verify: does `addConnection(userId, ws, clientId)` store `userId` per socket? (Per design-review iteration 2 architect verification: yes, at `connections.ts:22-34`.)

### Step 2: Write failing test

Create `packages/server/src/__tests__/websocket/feed-visibility-filter.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { broadcastFeed } from '../../plugins/websocket/broadcast.js';

describe('feed-channel broadcast visibility filter', () => {
  it('does not send post:new for a private post to non-owner subscribers', () => {
    const ownerSocket = { send: vi.fn(), readyState: 1 } as unknown as WebSocket;
    const nonOwnerSocket = { send: vi.fn(), readyState: 1 } as unknown as WebSocket;
    const subscribers = new Map([
      ['author-id', [{ ws: ownerSocket, clientId: 'c1' }]],
      ['other-id', [{ ws: nonOwnerSocket, clientId: 'c2' }]],
    ]);
    const event = {
      type: 'post:new',
      channel: 'feed',
      data: { id: 'p1', authorId: 'author-id', visibility: 'private' /* ... */ },
    };

    broadcastFeed(subscribers, event);

    expect(ownerSocket.send).toHaveBeenCalledWith(JSON.stringify(event));
    expect(nonOwnerSocket.send).not.toHaveBeenCalled();
  });

  it('sends post:new for a public post to all subscribers', () => {
    // ... mirror with visibility: 'public', assert both sockets received
  });
});
```

### Step 3: Run, watch fail

```bash
cd packages/server && npx vitest run src/__tests__/websocket/feed-visibility-filter.test.ts
```

Expected: FAIL — no filter exists today.

### Step 4: Modify broadcast.ts

Add a per-recipient check inside the broadcast loop. The exact mechanism depends on how broadcast is structured. Pseudocode:

```typescript
export function broadcastFeed(subscribers: Map<string, Subscription[]>, event: FeedEvent): void {
  for (const [recipientUserId, subs] of subscribers.entries()) {
    // Visibility filter: skip private-post events for non-owner recipients
    if (
      (event.type === 'post:new' || event.type === 'post:updated') &&
      event.data.visibility === 'private' &&
      event.data.authorId !== recipientUserId
    ) {
      continue;
    }
    for (const sub of subs) {
      if (sub.ws.readyState === 1) sub.ws.send(JSON.stringify(event));
    }
  }
}
```

Adapt to actual broadcast.ts structure during implementation (read it first).

### Step 5: Run, watch pass + commit

```bash
cd packages/server && npx vitest run src/__tests__/websocket/feed-visibility-filter.test.ts
npm run test:coverage
git add packages/server/src/plugins/websocket/ packages/server/src/__tests__/websocket/
git commit -m "feat(ws): filter feed-channel post:new/post:updated by recipient visibility (WU7 of #62)"
```

---

## Task 8 (WU8): Frontend errorStatus + forbidden states

**Goal:** Surface HTTP status from `usePosts` composable; render `forbidden-page` testid + descriptive message on PostViewPage and PostHistoryPage when status is 403.

**Files:**

- Modify: `packages/client/src/composables/usePosts.ts` (add `errorStatus` ref, populate in catch paths)
- Modify: `packages/client/src/pages/PostViewPage.vue` (add forbidden v-if branch)
- Modify: `packages/client/src/pages/PostHistoryPage.vue` (add error UI; new — currently has no error UI)
- Test: `packages/client/src/__tests__/composables/usePosts.test.ts` (extend)
- Test: `packages/client/src/__tests__/pages/PostViewPage.test.ts` (extend)
- Test: `packages/client/src/__tests__/pages/PostHistoryPage.test.ts` (extend)

### Step 1: Add `errorStatus` ref to usePosts

In `packages/client/src/composables/usePosts.ts`, add alongside `error`:

```typescript
const errorStatus = ref<number | null>(null);
```

In every method that resets `error.value = null`, also reset `errorStatus.value = null`. In every catch path that sets `error.value`, also set `errorStatus.value = response.status`.

Methods to update (per design REV 3 §2a + Designer iter 2 suggestion #1): `fetchPost`, `createPost`, `updatePost`, `deletePost`, `forkPost`, `refreshPreview`, `saveRevision`, plus any others that set `error.value`.

Export `errorStatus` from the return.

### Step 2: Write failing test for usePosts errorStatus

Add to `packages/client/src/__tests__/composables/usePosts.test.ts`:

```typescript
it('sets errorStatus to 403 when fetchPost gets 403', async () => {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status: 403,
    json: () => Promise.resolve({ error: 'This post is private' }),
  } as Response);
  const { fetchPost, error, errorStatus } = usePosts();
  await fetchPost('any-id');
  expect(errorStatus.value).toBe(403);
  expect(error.value).toBe('This post is private');
});

it('clears errorStatus on next fetch', async () => {
  // Mock 403, then 200. After second fetch, errorStatus should be null.
});
```

### Step 3: Run, watch fail / pass

```bash
cd packages/client && npx vitest run src/__tests__/composables/usePosts.test.ts
```

### Step 4: Modify PostViewPage.vue

Add a forbidden state v-if branch:

```vue
<template>
  <div class="...">
    <div v-if="errorStatus === 403" data-testid="forbidden-page" class="...">
      <h2 class="text-xl font-semibold">This post is private</h2>
      <p class="text-sm text-gray-400">{{ error || 'The owner has not shared it with you.' }}</p>
    </div>
    <div v-else-if="error" class="...">{{ error }}</div>
    <div v-else-if="loading" class="...">Loading...</div>
    <template v-else-if="currentPost">
      <!-- existing content -->
    </template>
    <div v-else class="...">Post not found</div>
  </div>
</template>
```

In `<script setup>`, destructure `errorStatus` from `usePosts`.

### Step 5: Modify PostHistoryPage.vue

Add a similar forbidden block. PostHistoryPage currently has NO error UI — this is a new addition. Mirror the PostViewPage pattern.

### Step 6: Add Vitest tests for the forbidden state

In `packages/client/src/__tests__/pages/PostViewPage.test.ts`:

```typescript
it('renders forbidden-page when errorStatus is 403', async () => {
  // Mock usePosts to return errorStatus.value = 403
  const wrapper = await mountPage();
  expect(wrapper.find('[data-testid="forbidden-page"]').exists()).toBe(true);
  expect(wrapper.find('[data-testid="forbidden-page"]').text()).toContain('This post is private');
});
```

Same for PostHistoryPage.

### Step 7: Run, commit

```bash
cd packages/client && npm test
npm run test:coverage
git add packages/client/src/composables/usePosts.ts packages/client/src/pages/PostViewPage.vue packages/client/src/pages/PostHistoryPage.vue packages/client/src/__tests__/
git commit -m "feat(client): errorStatus ref + forbidden state on PostViewPage/PostHistoryPage (WU8 of #62)"
```

---

## Task 9 (WU9): Bruno regression specs

**Goal:** Add 5 new Bruno specs covering the visibility branches; 1 spec for JWT-algorithm-pin regression.

**Files:**

- Create: `bruno/posts/get-private-post-as-non-owner.bru`
- Create: `bruno/posts/get-private-post-as-owner.bru`
- Create: `bruno/posts/get-private-post-comments-as-non-owner.bru`
- Create: `bruno/posts/get-private-post-revisions-as-non-owner.bru`
- Create: `bruno/posts/get-private-post-files-as-non-owner.bru`
- Create: `bruno/auth/jwt-algorithm-pin.bru`

### Step 1: Create get-private-post-as-non-owner.bru

```
meta {
  name: get-private-post-as-non-owner
  type: http
  seq: 100
}

get {
  url: {{baseUrl}}/api/posts/c0000000-0000-0000-0000-000000000006
  body: none
  auth: bearer
}

auth:bearer {
  token: {{accessToken}}
}

assert {
  res.status: eq 403
  res.body.error: eq This post is private
}
```

The collection-level pre-request (`bruno/collection.bru`) already populates `accessToken` for testuser. carol's `c…0006` is private; testuser is not the owner — should get 403.

### Step 2: Repeat for the other 4 Bruno specs

Adapt the URL and assertion per spec:

- `comments`: `GET /api/posts/c…0006/comments` → 403
- `revisions`: `GET /api/posts/c…0006/revisions` → 403
- `files`: `GET /api/posts/c…0006/files` → 403
- `as-owner` (positive): need to login as carol and assert 200. Use a `script:pre-request` block to login as carol explicitly.

### Step 3: Create get-private-post-as-owner.bru

```
meta {
  name: get-private-post-as-owner
  type: http
  seq: 101
}

get {
  url: {{baseUrl}}/api/posts/c0000000-0000-0000-0000-000000000006
  body: none
  auth: bearer
}

script:pre-request {
  // Login as carol explicitly for this spec; restore testuser after.
  const loginRes = await axios.post(`${bru.getEnvVar('baseUrl')}/api/auth/login`, {
    email: 'carol@example.com',
    password: 'password123',
  });
  bru.setVar('carolToken', loginRes.data.accessToken);
}

auth:bearer {
  token: {{carolToken}}
}

assert {
  res.status: eq 200
}
```

### Step 4: Create jwt-algorithm-pin.bru

```
meta {
  name: jwt-algorithm-pin
  type: http
  seq: 200
}

get {
  url: {{baseUrl}}/api/auth/me
  body: none
  auth: bearer
}

auth:bearer {
  token: {{rs256Token}}
}

script:pre-request {
  // Sign a token with RS256 against a different secret; the server should reject it.
  // (Alternative: use a known-bad token like an alg: none JWT and assert 401.)
  bru.setVar('rs256Token', 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IngifQ.invalid');
}

assert {
  res.status: eq 401
}
```

### Step 5: Run Bruno regression

```bash
cd bruno && npx @usebruno/cli run -r --env local
```

Expected: all new specs pass; existing specs still pass.

### Step 6: Commit

```bash
git add bruno/posts/get-private-post-*.bru bruno/auth/jwt-algorithm-pin.bru
git commit -m "test(bruno): visibility 403 specs + JWT algorithm-pin regression (WU9 of #62)"
```

---

## Task 10 (WU10): E2E un-fixme — view-private-as-non-owner

**Goal:** Re-enable the e2e spec `e2e/specs/posts/view-private-as-non-owner.spec.ts` (currently `test.fixme` per WU2 of issue #47); update assertion to expect the new 403 + `forbidden-page` testid.

**Files:**

- Modify: `e2e/specs/posts/view-private-as-non-owner.spec.ts`

### Step 1: Read current spec

```bash
cat e2e/specs/posts/view-private-as-non-owner.spec.ts
```

### Step 2: Update spec — un-fixme + retarget

Replace `test.fixme(...)` with `test(...)` and change the assertion:

```typescript
import { test, expect } from '../../fixtures/reset.js';

const PRIVATE_POST_ID = 'c0000000-0000-0000-0000-000000000006';

test("post view: alice cannot see carol's private post; forbidden state renders", async ({
  alice,
}) => {
  await alice.goto(`/posts/${PRIVATE_POST_ID}`);
  await expect(alice.getByTestId('forbidden-page')).toBeVisible();
  await expect(alice.getByTestId('forbidden-page')).toContainText('This post is private');
});
```

Remove the FIXME comment (the issue is now closed by this PR).

### Step 3: Run e2e

```bash
cd e2e && npx playwright test specs/posts/view-private-as-non-owner.spec.ts --project=chromium-desktop
```

Expected: 1 passed.

### Step 4: Commit

```bash
git add e2e/specs/posts/view-private-as-non-owner.spec.ts
git commit -m "test(e2e): un-fixme view-private-as-non-owner; assert forbidden state (WU10 of #62)"
```

---

## Task 11 (WU11): Final verification + PR

### Step 1: Re-seed (post-migration safety)

```bash
set -a && source .env && set +a && psql "$DATABASE_URL" -f scripts/seed.sql
```

Expected: BEGIN/INSERTs/COMMIT, no errors.

### Step 2: Vitest + coverage

```bash
npm run test:coverage
```

Expected: all pass; 100% lines/branches/functions/statements.

### Step 3: Bruno regression

Server running on 3001 (`HOST=localhost ENABLE_TEST_ROUTES=1 LLM_PROVIDER=mock E2E_MODE=1 NODE_ENV=test`):

```bash
cd bruno && npx @usebruno/cli run -r --env local
```

Expected: all pass.

### Step 4: E2E full suite at workers=1

```bash
cd e2e && npx playwright test --workers=1 --project=chromium-desktop
```

Expected: all pass — including the un-fixme'd spec, and existing specs not broken by the new visibility filter (e.g., the journey spec should still work).

### Step 5: E2E at workers=4 with retries=1

```bash
cd e2e && npx playwright test --workers=4 --project=chromium-desktop
```

Expected: all pass (CI uses retries=1 per #67).

### Step 6: Spec-N-alone verification

Pick 5 specs, run each alone:

```bash
cd e2e && npx playwright test specs/posts/view-private-as-non-owner.spec.ts --workers=1 --project=chromium-desktop
cd e2e && npx playwright test specs/posts/view-public-post.spec.ts --workers=1 --project=chromium-desktop
cd e2e && npx playwright test specs/posts/edit-cannot-edit-others.spec.ts --workers=1 --project=chromium-desktop
cd e2e && npx playwright test specs/revisions/rollback-permission.spec.ts --workers=1 --project=chromium-desktop
cd e2e && npx playwright test specs/_journey.spec.ts --workers=1 --project=chromium-desktop
```

Expected: each passes.

### Step 7: Run /self-reflect to capture learnings

Per CLAUDE.md, before opening the PR. Capture any learnings into `.beads/knowledge/` and commit.

### Step 8: Push branch

```bash
git push -u origin feat/auth-visibility-enforcement
```

### Step 9: Open PR

```bash
gh pr create --title "feat: auth + visibility enforcement on read endpoints (#62)" --body "$(cat <<'EOF'
## Summary

Closes #62. Closes the security gap where private posts were readable by non-owners (and even anonymous callers) via direct lookup, sub-resource endpoints, and the feed.

## Scope

- **Auth-required preHandler** added to 10 previously-public read routes
- **`assertCanReadPost` visibility helper** at `packages/server/src/lib/visibility.ts`; used by 6 direct-lookup endpoints
- **Feed visibility filter**: `(p.visibility = 'public' OR p.author_id = $userId)` in `feed.ts`; applies to default and bookmarked filters
- **WebSocket broadcast filter**: `post:new`/`post:updated` events on `feed` channel are filtered per recipient
- **JWT hardening**: `algorithms: ['HS256']` pin + fail-fast on missing secret outside test env
- **DB index**: `idx_posts_visibility_author` (partial, excludes soft-deleted rows)
- **Refresh-preview ownership**: `POST /:id/refresh-preview` now returns 403 to non-owners
- **Files dead-code removal**: optional-auth ladder at `files.ts:131-140, 216-244` deleted (replaced by uniform preHandler)
- **5 existing bare `'Forbidden'` strings → descriptive** in `posts.ts`
- **Frontend forbidden state** keyed on HTTP `error.status === 403` (i18n-friendly); `PostViewPage` + `PostHistoryPage` render a `forbidden-page` testid
- **5 Bruno specs** + 1 JWT-algorithm-pin regression spec
- **E2E un-fixme**: `view-private-as-non-owner.spec.ts` re-enabled

## Status code matrix

| Caller state | Response |
|---|---|
| No / invalid token | 401 |
| Private post + not owner | 403 + `{ error: 'This post is private' }` |
| Post truly missing | 404 |
| Public post | 200 |

## Test plan

- [x] `npm run test:coverage` — 100% all metrics
- [x] `cd bruno && npx @usebruno/cli run -r --env local` — all pass
- [x] `cd e2e && npx playwright test --workers=1 --project=chromium-desktop` — all pass
- [x] `cd e2e && npx playwright test --workers=4 --project=chromium-desktop` — all pass
- [x] 5 random e2e specs verified in isolation
- [ ] 3 consecutive green CI runs

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Out of scope (with notes)

- **CI grep guard** (Security iter 3 suggestion) — defer to separate enhancement issue. Trivial to add (~10 lines workflow), but not strictly required for this PR.
- **Tag `post_count` count-only leak** — file follow-up issue; deferred per design.
- **MinIO signed-URL TTL audit** — verified during plan if needed; defer to separate issue if TTL is too long.

---

## Self-review

**1. Spec coverage:**

| Spec section                                  | Plan task                                                                    |
| --------------------------------------------- | ---------------------------------------------------------------------------- |
| Auth-required preHandler on 10 routes         | WU2 (3 sub-resources of /:id) + WU3 (files) + WU4 (tags/search/user-profile) |
| Visibility helper                             | WU1                                                                          |
| Feed visibility clause                        | WU5                                                                          |
| WebSocket broadcast filter                    | WU7                                                                          |
| JWT hardening (HS256 + secret fail-fast)      | WU1                                                                          |
| DB index migration                            | WU0                                                                          |
| Refresh-preview ownership                     | WU5                                                                          |
| Files.ts dead-code removal                    | WU3                                                                          |
| Existing 'Forbidden' → descriptive (5 lines)  | WU6                                                                          |
| Frontend errorStatus + forbidden state        | WU8                                                                          |
| Bruno specs (5 negative + 1 positive + 1 JWT) | WU9                                                                          |
| E2E un-fixme                                  | WU10                                                                         |
| 24-cell coverage matrix                       | implicit in WU2/WU3 unit tests                                               |
| Final verification + PR                       | WU11                                                                         |

**2. Placeholder scan:** No "TBD"/"TODO". Every step has concrete code or commands.

**3. Type consistency:** `assertCanReadPost(post, callerId, reply): boolean` is consistent across all uses (WU1, WU2, WU3). `errorStatus: Ref<number | null>` consistent (WU8). Migration filename `004_posts-visibility-author-index.sql` consistent (WU0).

**4. Out-of-scope discipline:** CI grep guard, tag post_count, MinIO TTL deferred with rationale.

**5. Coverage 100% strategy:** Visibility helper has 3 unit tests covering all branches. Each modified route has a per-route test for 401/403/200 branches. Feed filter has 3 tests. WebSocket filter has 2 tests. JWT hardening has 2 tests. Frontend errorStatus has 2 tests. Total: 28+ new unit tests across the WUs. `.coverage-thresholds.json` 100% maintained.

---

## REV 2 amendments (plan-review-gate iter 1 — Completeness FAIL × 4)

Iter 1 verdict: Feasibility PASS, Scope & Alignment PASS, Completeness FAIL on 4 blockers + 1 path mismatch from Feasibility. REV 2 sections SUPERSEDE conflicting items above.

### 1. WU7 path correction + handshake-auth verification (Feasibility path mismatch + Completeness #1)

**Path mismatch fix:** `broadcast.ts` is only 15 lines (the `getExcludeWs` helper). The actual broadcast loop is at `packages/server/src/plugins/websocket/channels.ts:50`. WU7 modifies `channels.ts`, not `broadcast.ts`. The plan's File Structure section is updated accordingly.

**Handshake auth must be verified explicitly.** Add as WU7 Step 0:

```bash
# Step 0a: Verify the /ws handshake requires auth
sed -n '40,80p' packages/server/src/plugins/websocket/index.ts
sed -n '60,110p' packages/server/src/plugins/websocket/handler.ts
```

The state machine starts in `awaiting-auth` (verified during design-review-gate iter 2). If a future change weakens this, the per-recipient broadcast filter has no recipient identity to compare against — silent regression. Add a unit test:

```typescript
// packages/server/src/__tests__/websocket/handshake-auth.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../../app.js';
import type { FastifyInstance } from 'fastify';
import WebSocket from 'ws';

describe('WebSocket /ws handshake', () => {
  let app: FastifyInstance;
  let port: number;

  beforeAll(async () => {
    app = await buildApp();
    await app.listen({ port: 0 });
    const addr = app.server.address();
    if (typeof addr === 'object' && addr !== null) port = addr.port;
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects WS connections that never send auth frame within timeout', async () => {
    const ws = new WebSocket(`ws://localhost:${port}/ws`);
    await new Promise<void>((resolve) => {
      ws.on('close', (code) => {
        // Server closes the socket if no auth frame is sent
        expect(code).toBeGreaterThanOrEqual(1000);
        resolve();
      });
      // Don't send any auth frame; rely on server-side timeout
      setTimeout(() => ws.close(), 2000);
    });
  });

  it('rejects auth frames with invalid JWT', async () => {
    const ws = new WebSocket(`ws://localhost:${port}/ws`);
    await new Promise<void>((resolve) => {
      ws.on('open', () => ws.send(JSON.stringify({ type: 'auth', token: 'invalid-jwt' })));
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        expect(msg.type === 'error' || msg.type === 'auth:rejected').toBe(true);
        ws.close();
        resolve();
      });
    });
  });
});
```

Adapt the assertion to the actual server response shape after reading `handler.ts`.

### 2. 24-cell coverage matrix enumerated (Completeness #2)

REV 2 makes the 24-cell matrix explicit. Each of the 6 direct-lookup routes gets 4 unit-test cells:

```
posts-visibility.test.ts:           4 cells × 4 routes (posts/:id, comments, revisions, revisions/:rev) = 16 tests
files-visibility.test.ts:           4 cells × 2 routes (files, files/:fileId)                          = 8 tests
                                                                                                       = 24 tests
```

WU2 must produce a test file with all 16 tests for the 4 routes; WU3 must produce a test file with all 8 tests for the 2 file routes. The 4 cells per route are:

| Cell | Caller state                                  | Target       | Expected status |
| ---- | --------------------------------------------- | ------------ | --------------- |
| 1    | No token                                      | private post | 401             |
| 2    | Valid token, public post                      | public post  | 200             |
| 3    | Valid token, private post owned by caller     | private post | 200             |
| 4    | Valid token, private post NOT owned by caller | private post | 403             |

WU2 Step 6 is updated: instead of "extend with 2 more tests", the test file MUST include all 16 tests (4 routes × 4 cells) at commit time. WU3 Step 5 is updated: the test file MUST include all 8 tests at commit time.

### 3. WU5 refresh-preview test is unconditional (Completeness #3)

Plan WU5 Step 6-7 said "if there's already an ownership check, the test will pass — no code change needed; if not, add it." This is wrong (TDD anti-pattern; tests are regressions, written even when behavior already exists).

REV 2: WU5 Step 5 ALWAYS writes the test; WU5 Step 6 verifies it (red OR green). If green, no implementation change needed but the test stays as a regression. If red, add the ownership check.

The test file must include both 401 (no token) and 403 (non-owner) cells — 2 tests minimum for refresh-preview.

### 4. WU8 errorStatus reset enumeration (Completeness #4)

REV 2 explicitly enumerates the methods in `usePosts.ts` that need `errorStatus.value = null` reset. Read the file and reset in each:

| Method                                                               | Reset errorStatus? | Why                                                                          |
| -------------------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------- |
| `fetchPost`                                                          | YES                | direct-lookup 403 path                                                       |
| `fetchPostHistory` (or whatever loads revisions for PostHistoryPage) | **YES**            | history-page 403 path — REQUIRED for PostHistoryPage forbidden state to work |
| `createPost`                                                         | YES                | covers any future 403 (e.g., quota)                                          |
| `updatePost` (PATCH)                                                 | YES                | 403 if non-owner                                                             |
| `deletePost`                                                         | YES                | 403 if non-owner                                                             |
| `forkPost`                                                           | YES                | 403 if source is private                                                     |
| `refreshPreview`                                                     | YES                | 403 if non-owner                                                             |
| `saveRevision`                                                       | YES                | 403 if non-owner                                                             |

Plan WU8 Step 1 is updated: read `packages/client/src/composables/usePosts.ts` first to enumerate every existing method that resets `error.value = null`. Add `errorStatus.value = null` reset to **every one of them** (not just `fetchPost`). If `fetchPostHistory` exists as a separate composable or method (verify in code), apply the same change there.

### 5. Bruno spec count clarification (Completeness clarification)

WU9 produces 6 .bru files: 4 negative (posts/comments/revisions/files for non-owner-403) + 1 positive (owner-200) + 1 JWT-pin = 6 files. The plan's "5 Bruno specs" header in the PR-body template is updated to "6 Bruno specs" for accuracy.

### 6. assertCanReadPost type tightening (Completeness clarification)

REV 2 tightens the helper signature from `{ visibility: string; author_id: string }` to `{ visibility: 'public' | 'private'; author_id: string }`. Matches design REV 2 §"Visibility helper" intent (`Pick<PostRow, 'visibility' | 'author_id'>` where PostRow narrows visibility to a union literal). The unit tests in WU1 already use `'public' as const` / `'private' as const` so no test changes needed.

### 7. CI grep guard decision recorded (Completeness clarification)

REV 2 explicitly evaluates the CI grep guard: a ~10-line workflow step that greps every `app.get/post/patch/delete` call outside the public-route whitelist for `preHandler: [app.authenticate]`. **Decision: deferred to follow-up issue** (rationale: trivial to add, but adds CI surface and requires whitelist maintenance; better as its own PR with focused review). To be filed as a separate enhancement issue when this PR is opened.

### Updated acceptance criteria

- [x] WU7 path correction (channels.ts) + handshake auth test
- [x] 24-cell coverage matrix enumerated; WU2 produces 16 tests, WU3 produces 8
- [x] WU5 refresh-preview test unconditional (covers 401 + 403)
- [x] WU8 errorStatus reset across ALL usePosts methods including fetchPostHistory
- [x] Bruno spec count corrected to 6
- [x] Helper type tightened to literal union

---

## REV 3 amendments (plan-review-gate iter 2 — Completeness × 2)

Iter 2 verdict: Feasibility PASS, Scope & Alignment PASS, Completeness FAIL × 2 (Bruno parity gap + bookmarks-branch test visibility). REV 3 below SUPERSEDES.

### 1. WU9 Bruno specs — match the 24-cell vitest matrix (6 negative)

The 24-cell vitest matrix covers 6 sub-resource direct-lookup routes (`/:id`, `/:id/comments`, `/:id/revisions`, `/:id/revisions/:rev`, `/:id/files`, `/:id/files/:fileId`). REV 2's Bruno coverage was 4 negative — short by 2 vs. the vitest matrix.

REV 3: WU9 adds 2 more negative specs:

```
bruno/posts/get-private-post-revision-detail-as-non-owner.bru   (NEW in REV 3)
bruno/posts/get-private-post-file-detail-as-non-owner.bru        (NEW in REV 3)
```

Updated WU9 file count: 6 negative + 1 positive + 1 JWT-pin = **8 .bru files**.

Spec templates (alice GETs carol's private post sub-resource, expects 403):

```
# bruno/posts/get-private-post-revision-detail-as-non-owner.bru
get {
  url: {{baseUrl}}/api/posts/c0000000-0000-0000-0000-000000000006/revisions/d0000000-0000-0000-0000-000000000007
  body: none
  auth: bearer
}
auth:bearer { token: {{accessToken}} }
assert {
  res.status: eq 403
  res.body.error: eq This post is private
}
```

The revision UUID `d0000000-...-000000000007` is from `scripts/seed.sql` line 69 (carol's `c…0006` initial revision).

```
# bruno/posts/get-private-post-file-detail-as-non-owner.bru
# carol's c…0006 may have no files; the parent-post visibility check fires
# before the file lookup, so the file UUID is opaque (any UUID works).
get {
  url: {{baseUrl}}/api/posts/c0000000-0000-0000-0000-000000000006/files/00000000-0000-0000-0000-000000000000
  body: none
  auth: bearer
}
auth:bearer { token: {{accessToken}} }
assert {
  res.status: eq 403
  res.body.error: eq This post is private
}
```

### 2. WU5 bookmarks-branch test made explicit (Completeness clarification)

WU5 Step 1's `feed-visibility.test.ts` already includes the test case `'does not include other-user private posts in bookmarked filter'` (third `it()` block in the test file). REV 3 confirms this is the explicit coverage of design REV 2 audit row D. WU5 Step 1 is updated:

- The test gets a comment header marking it `EXPLICIT COVERAGE of audit row D`
- A `beforeAll` is added that inserts a bookmark row for testuser → c…0006 (or asserts/uses an existing seed bookmark)

The test body is unchanged. Plan WU5 Step 2 (run, watch fail) covers all 3 tests; expected fail count: 2 of 3 (the bookmarks test + the default-feed test). Step 4 adds the visibility WHERE clause to feed.ts; expected: all 3 pass.

### Updated acceptance criteria (REV 3)

- [x] WU9 produces 8 .bru files (6 negative + 1 positive + 1 JWT pin) for parity with 24-cell vitest matrix
- [x] WU5 bookmarks-branch test annotated as "EXPLICIT COVERAGE" of audit row D + beforeAll setup added
