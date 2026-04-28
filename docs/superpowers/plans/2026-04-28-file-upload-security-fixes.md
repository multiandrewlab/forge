# File Upload Security & Data Integrity Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 7 critical/major security and data integrity issues in the file upload system (GitHub Issue #38).

**Architecture:** Security fixes applied in layers — shared validation first, then server-side route authorization, then storage lifecycle hardening. Each task is independently testable and committable. No new files are created; all changes modify existing modules.

**Tech Stack:** TypeScript (strict), Fastify, Vitest, PostgreSQL, AWS S3 SDK (MinIO), Bruno API tests.

**Issue:** https://github.com/multiandrewlab/forge/issues/38

---

## File Map

| File | Responsibility | Tasks |
|------|---------------|-------|
| `packages/shared/src/validators/file.ts` | MIME allowlist | 1 |
| `packages/shared/src/__tests__/validators/file.test.ts` | MIME validation tests | 1 |
| `packages/server/src/services/files.ts` | Filename sanitization, key generation | 2 |
| `packages/server/src/__tests__/services/files.test.ts` | Sanitization tests | 2 |
| `packages/server/src/plugins/storage.ts` | MinIO S3 client, `ensureBucket` | 3 |
| `packages/server/src/__tests__/plugins/storage.test.ts` | Storage plugin tests (existing — add error-narrowing tests) | 3 |
| `packages/server/src/routes/files.ts` | File CRUD endpoints | 4, 5 |
| `packages/server/src/__tests__/routes/files.test.ts` | File route tests | 4, 5 |
| `packages/server/src/db/queries/post-files.ts` | File DB queries, cleanup | 5 |
| `packages/server/src/__tests__/db/queries/post-files.test.ts` | File query tests | 5 |
| `packages/server/src/app.ts` | App bootstrap, cleanup hook | 5 |
| `packages/server/src/routes/posts.ts` | Revision creation with file ops | 5 |
| `packages/server/src/__tests__/routes/posts-revision-files.test.ts` | Revision file tests | 5 |

---

### Task 1: MIME Validation Hardening (Stored XSS Prevention)

**Why:** `ALLOWED_MIME_PREFIXES = ['text/']` allows `text/html`, enabling stored XSS. An attacker uploads an HTML file containing JavaScript; the file-content endpoint serves it inline with `Content-Type: text/html` under the app's origin.

**Files:**
- Modify: `packages/shared/src/validators/file.ts:1-47`
- Modify: `packages/shared/src/__tests__/validators/file.test.ts:1-122`

- [ ] **Step 1: Write failing tests for text/html rejection**

In `packages/shared/src/__tests__/validators/file.test.ts`, change the existing `text/html` test (line 61-63) and add new tests:

```typescript
// Replace the existing test at line 61-63:
it('should reject text/html (stored XSS vector)', () => {
  expect(isAllowedMimeType('text/html')).toBe(false);
});

// Add after line 63:
it('should reject text/xml (active content)', () => {
  expect(isAllowedMimeType('text/xml')).toBe(false);
});

it('should allow text/csv', () => {
  expect(isAllowedMimeType('text/csv')).toBe(true);
});

it('should allow text/x-python', () => {
  expect(isAllowedMimeType('text/x-python')).toBe(true);
});

it('should allow text/x-java-source', () => {
  expect(isAllowedMimeType('text/x-java-source')).toBe(true);
});
```

Also update the constants test at line 25-27 to reflect the new structure:

```typescript
it('ALLOWED_MIME_SAFE_TEXT should contain text/plain', () => {
  expect(ALLOWED_MIME_SAFE_TEXT).toContain('text/plain');
});

it('ALLOWED_MIME_SAFE_TEXT should NOT contain text/html', () => {
  expect(ALLOWED_MIME_SAFE_TEXT).not.toContain('text/html');
});

it('ALLOWED_MIME_SAFE_TEXT should NOT contain text/xml', () => {
  expect(ALLOWED_MIME_SAFE_TEXT).not.toContain('text/xml');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/shared/src/__tests__/validators/file.test.ts`
Expected: Multiple failures — `text/html` still returns `true`, `ALLOWED_MIME_SAFE_TEXT` not defined.

- [ ] **Step 3: Replace text/* prefix with explicit safe-text allowlist**

In `packages/shared/src/validators/file.ts`, replace lines 6-8:

```typescript
/** Prefix-matched MIME types (e.g. text/* matches text/plain, text/html, etc.) */
export const ALLOWED_MIME_PREFIXES = ['text/'] as const;
```

With:

```typescript
/**
 * Safe text MIME subtypes. Active-content types (text/html, text/xml) are
 * excluded because the file-content endpoint serves uploads inline — serving
 * HTML under the app's origin enables stored XSS.
 *
 * Code-oriented text/* subtypes (text/x-python, text/x-java-source, etc.)
 * are matched via the `text/x-` prefix below.
 */
export const ALLOWED_MIME_SAFE_TEXT = [
  'text/plain',
  'text/csv',
  'text/markdown',
  'text/tab-separated-values',
] as const;

/**
 * Prefix-matched MIME types. `text/x-` covers programming-language subtypes
 * (text/x-python, text/x-java-source, etc.) which are never rendered as
 * active content by browsers.
 */
export const ALLOWED_MIME_PREFIXES = ['text/x-'] as const;
```

Update `isAllowedMimeType` (lines 39-47) to check the safe-text list:

```typescript
export function isAllowedMimeType(mime: string | null | undefined): boolean {
  if (!mime) return false;

  if ((ALLOWED_MIME_SAFE_TEXT as readonly string[]).includes(mime)) return true;

  for (const prefix of ALLOWED_MIME_PREFIXES) {
    if (mime.startsWith(prefix)) return true;
  }

  return (ALLOWED_MIME_EXACT as readonly string[]).includes(mime);
}
```

- [ ] **Step 4: Update the shared package exports**

If `ALLOWED_MIME_SAFE_TEXT` needs to be exported from the shared package index, add it. Check `packages/shared/src/index.ts` for the file validator exports and add `ALLOWED_MIME_SAFE_TEXT` alongside existing exports.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run packages/shared/src/__tests__/validators/file.test.ts`
Expected: All pass.

- [ ] **Step 6: Run full test suite to check for regressions**

Run: `npm test`
Expected: All pass. The upload route test for `text/plain` still works because `text/plain` is in `ALLOWED_MIME_SAFE_TEXT`.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/validators/file.ts packages/shared/src/__tests__/validators/file.test.ts
git commit -m "fix(security): reject text/html uploads to prevent stored XSS

Replace broad text/* MIME prefix with explicit safe-text allowlist.
Active content types (text/html, text/xml) are now rejected at
validation time. Programming-language subtypes (text/x-*) remain
allowed since browsers never render them as active content.

Fixes part of #38"
```

---

### Task 2: Cross-Platform Path Sanitization

**Why:** `path.basename()` only strips the current platform's separator. On Linux, `..\\..\\secret.txt` passes through unchanged because backslash is not a path separator on POSIX. After character replacement it becomes `.._.._secret.txt` — not a traversal, but the original filename is lost.

**Files:**
- Modify: `packages/server/src/services/files.ts:1-28`
- Modify: `packages/server/src/__tests__/services/files.test.ts:16-66`

- [ ] **Step 1: Write failing test for Windows-style path traversal**

In `packages/server/src/__tests__/services/files.test.ts`, add after line 65 (inside the `sanitizeFilename` describe block):

```typescript
it('strips Windows-style backslash directory traversal on all platforms', () => {
  expect(sanitizeFilename('..\\..\\secret.txt')).toBe('secret.txt');
});

it('strips mixed forward/backslash traversal', () => {
  expect(sanitizeFilename('..\\../..\\secret.txt')).toBe('secret.txt');
});

it('strips UNC-style paths', () => {
  expect(sanitizeFilename('\\\\server\\share\\file.txt')).toBe('file.txt');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/server/src/__tests__/services/files.test.ts`
Expected: The new tests fail — `sanitizeFilename('..\\..\\secret.txt')` returns `.._.._secret.txt` instead of `secret.txt`.

- [ ] **Step 3: Fix sanitizeFilename to use cross-platform basename**

In `packages/server/src/services/files.ts`, change line 1 and lines 19-21:

Replace:
```typescript
import path from 'node:path';
```
With:
```typescript
import path from 'node:path';
```

Replace the first two lines of the function body (lines 20-21):
```typescript
export function sanitizeFilename(raw: string): string {
  let name = path.basename(raw);
```

With:
```typescript
export function sanitizeFilename(raw: string): string {
  // Normalize Windows backslash separators to forward slash before extracting
  // basename. path.basename() only strips the current platform's separator,
  // so on Linux, backslash paths pass through unchanged.
  let name = path.posix.basename(raw.replaceAll('\\', '/'));
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/server/src/__tests__/services/files.test.ts`
Expected: All pass, including the new cross-platform tests.

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/services/files.ts packages/server/src/__tests__/services/files.test.ts
git commit -m "fix(security): normalize backslash paths before basename extraction

path.basename() only strips the current platform's separator. On Linux,
Windows-style paths like '..\\..\\secret.txt' passed through unchanged.
Now normalizes all backslashes to forward slashes before calling
path.posix.basename().

Fixes part of #38"
```

---

### Task 3: ensureBucket Error Narrowing

**Why:** The catch-all in `ensureBucket()` treats any error from `HeadBucketCommand` as "bucket missing" and calls `CreateBucketCommand`. Auth failures, network errors, and config issues are masked — the server starts up thinking everything is fine when it isn't.

**Files:**
- Modify: `packages/server/src/plugins/storage.ts:68-74`
- Modify: `packages/server/src/__tests__/plugins/storage.test.ts:85-115` (existing file — uses `sendMock` via `vi.hoisted()`)

**Existing mock pattern:** The test file uses `vi.hoisted()` to create `sendMock` and `getSignedUrlMock`, then mocks `@aws-sdk/client-s3` with `vi.fn()` constructors. Tests use `sendMock` directly. All new tests must follow this pattern.

- [ ] **Step 1: Write failing tests for ensureBucket error handling**

In `packages/server/src/__tests__/plugins/storage.test.ts`, add inside the existing `ensureBucket` describe block (after line 114, before the closing `});` on line 115):

```typescript
    it('rethrows 403 Forbidden errors (auth failure)', async () => {
      const forbiddenError = new Error('Forbidden');
      Object.assign(forbiddenError, { $metadata: { httpStatusCode: 403 } });
      sendMock.mockRejectedValueOnce(forbiddenError);

      await expect(storage.ensureBucket()).rejects.toThrow('Forbidden');
      expect(sendMock).toHaveBeenCalledTimes(1);
      expect(CreateBucketCommand).not.toHaveBeenCalled();
    });

    it('rethrows 500 errors (server error)', async () => {
      const serverError = new Error('Internal Server Error');
      Object.assign(serverError, { $metadata: { httpStatusCode: 500 } });
      sendMock.mockRejectedValueOnce(serverError);

      await expect(storage.ensureBucket()).rejects.toThrow('Internal Server Error');
      expect(sendMock).toHaveBeenCalledTimes(1);
      expect(CreateBucketCommand).not.toHaveBeenCalled();
    });

    it('rethrows network errors (no $metadata)', async () => {
      const networkError = new Error('ECONNREFUSED');
      sendMock.mockRejectedValueOnce(networkError);

      await expect(storage.ensureBucket()).rejects.toThrow('ECONNREFUSED');
      expect(sendMock).toHaveBeenCalledTimes(1);
      expect(CreateBucketCommand).not.toHaveBeenCalled();
    });

    it('creates bucket when error has $metadata with httpStatusCode 404', async () => {
      const notFoundError = new Error('Not Found');
      Object.assign(notFoundError, { $metadata: { httpStatusCode: 404 } });
      sendMock.mockRejectedValueOnce(notFoundError);  // HeadBucket 404
      sendMock.mockResolvedValueOnce({});               // CreateBucket succeeds

      await storage.ensureBucket();

      expect(sendMock).toHaveBeenCalledTimes(2);
      expect(CreateBucketCommand).toHaveBeenCalledWith({ Bucket: 'test-bucket' });
    });
```

Also update the existing "creates the bucket when it does not exist" test (lines 95-105) to use a 404 `$metadata` error instead of a bare `NotFound` error, since the implementation will now check `$metadata.httpStatusCode`:

```typescript
    it('creates the bucket when it does not exist', async () => {
      const notFound = new Error('NotFound');
      Object.assign(notFound, { $metadata: { httpStatusCode: 404 } });
      sendMock.mockRejectedValueOnce(notFound); // HeadBucketCommand fails with 404
      sendMock.mockResolvedValueOnce({}); // CreateBucketCommand succeeds

      await storage.ensureBucket();

      expect(HeadBucketCommand).toHaveBeenCalledWith({ Bucket: 'test-bucket' });
      expect(CreateBucketCommand).toHaveBeenCalledWith({ Bucket: 'test-bucket' });
    });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/server/src/__tests__/plugins/storage.test.ts`
Expected: The "rethrows 403", "rethrows 500", and "rethrows network errors" tests fail because the current catch-all swallows all errors.

- [ ] **Step 3: Narrow ensureBucket catch to 404 only**

In `packages/server/src/plugins/storage.ts`, replace lines 68-74:

```typescript
  async ensureBucket(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
  }
```

With:

```typescript
  async ensureBucket(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch (err: unknown) {
      // Only create the bucket when the error is a 404 (not found).
      // Auth failures, network errors, and other issues must propagate
      // so misconfiguration is surfaced at startup instead of masked.
      const status =
        err != null &&
        typeof err === 'object' &&
        '$metadata' in err &&
        typeof (err as Record<string, unknown>)['$metadata'] === 'object'
          ? ((err as Record<string, Record<string, unknown>>)['$metadata']['httpStatusCode'] as
              | number
              | undefined)
          : undefined;

      if (status !== 404) throw err;

      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/server/src/__tests__/plugins/storage.test.ts`
Expected: All pass.

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/plugins/storage.ts packages/server/src/__tests__/plugins/storage.test.ts
git commit -m "fix(reliability): narrow ensureBucket catch to 404 only

The previous catch-all treated any HeadBucketCommand error as 'bucket
missing' and attempted CreateBucketCommand. Auth failures (403), network
errors, and server errors were silently masked. Now only 404 triggers
bucket creation; all other errors propagate to fail startup visibly.

Fixes part of #38"
```

---

### Task 4: File Endpoint Authorization

**Why:** `GET /posts/:id/files` and `GET /posts/:id/files/:fileId` have no authorization. Staged files (revision_id IS NULL) are only meant for the post owner; committed files should follow the same visibility rules as the parent post (public + not draft = visible to all, otherwise owner-only). The revision-to-post association is also not verified.

**Files:**
- Modify: `packages/server/src/routes/files.ts:101-169`
- Modify: `packages/server/src/__tests__/routes/files.test.ts`
- Modify: Bruno files for error paths

- [ ] **Step 1: Write failing tests for file list authorization**

In `packages/server/src/__tests__/routes/files.test.ts`, add inside the `GET /api/posts/:id/files` describe block (after line 537):

```typescript
it('returns 403 when listing staged files for post owned by another user', async () => {
  const otherToken = app.jwt.sign({ id: otherUserId, email: 'other@example.com', displayName: 'Other' });

  // findPostById — post owned by userId (not otherUserId)
  mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });

  const response = await app.inject({
    method: 'GET',
    url: `/api/posts/${postId}/files`,
    headers: { authorization: `Bearer ${otherToken}` },
  });

  expect(response.statusCode).toBe(403);
});

it('returns staged files for post owner', async () => {
  // findPostById
  mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
  // findStagedFilesByPostId
  mockQuery.mockResolvedValueOnce({ rows: [sampleFileRow], rowCount: 1 });

  const response = await app.inject({
    method: 'GET',
    url: `/api/posts/${postId}/files`,
    headers: { authorization: `Bearer ${token}` },
  });

  expect(response.statusCode).toBe(200);
  expect(response.json().files).toHaveLength(1);
});

it('returns 401 when listing staged files without auth', async () => {
  // findPostById
  mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });

  const response = await app.inject({
    method: 'GET',
    url: `/api/posts/${postId}/files`,
  });

  // Staged files require auth — unauthenticated users get 401
  expect(response.statusCode).toBe(401);
});

it('allows unauthenticated access to revision files on public non-draft posts', async () => {
  // findPostById — public, not draft
  mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
  // findFilesByRevisionId
  mockQuery.mockResolvedValueOnce({ rows: [sampleCommittedFileRow], rowCount: 1 });

  const response = await app.inject({
    method: 'GET',
    url: `/api/posts/${postId}/files?revisionId=${revisionId}`,
  });

  expect(response.statusCode).toBe(200);
});

it('returns 403 for revision files on private post when not owner', async () => {
  const privatePost = { ...samplePostRow, visibility: 'private' };
  const otherToken = app.jwt.sign({ id: otherUserId, email: 'other@example.com', displayName: 'Other' });

  // findPostById
  mockQuery.mockResolvedValueOnce({ rows: [privatePost], rowCount: 1 });

  const response = await app.inject({
    method: 'GET',
    url: `/api/posts/${postId}/files?revisionId=${revisionId}`,
    headers: { authorization: `Bearer ${otherToken}` },
  });

  expect(response.statusCode).toBe(403);
});

it('returns 403 for revision files on draft post when not owner', async () => {
  const draftPost = { ...samplePostRow, is_draft: true };
  const otherToken = app.jwt.sign({ id: otherUserId, email: 'other@example.com', displayName: 'Other' });

  // findPostById
  mockQuery.mockResolvedValueOnce({ rows: [draftPost], rowCount: 1 });

  const response = await app.inject({
    method: 'GET',
    url: `/api/posts/${postId}/files?revisionId=${revisionId}`,
    headers: { authorization: `Bearer ${otherToken}` },
  });

  expect(response.statusCode).toBe(403);
});

it('validates revision belongs to the target post', async () => {
  const otherPostRevision = { ...sampleCommittedFileRow, post_id: 'different-post-id' };

  // findPostById
  mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
  // findRevisionById — returns revision for a different post
  mockQuery.mockResolvedValueOnce({
    rows: [{ id: revisionId, post_id: 'different-post-id', revision_number: 1 }],
    rowCount: 1,
  });

  const response = await app.inject({
    method: 'GET',
    url: `/api/posts/${postId}/files?revisionId=${revisionId}`,
  });

  expect(response.statusCode).toBe(404);
});
```

- [ ] **Step 2: Write failing tests for file content authorization**

In the `GET /api/posts/:id/files/:fileId` describe block (after line 644):

```typescript
it('returns 403 for file content on private post when not owner', async () => {
  const privatePost = { ...samplePostRow, visibility: 'private' };
  const otherToken = app.jwt.sign({ id: otherUserId, email: 'other@example.com', displayName: 'Other' });

  // findPostById
  mockQuery.mockResolvedValueOnce({ rows: [privatePost], rowCount: 1 });

  const response = await app.inject({
    method: 'GET',
    url: `/api/posts/${postId}/files/${fileId}`,
    headers: { authorization: `Bearer ${otherToken}` },
  });

  expect(response.statusCode).toBe(403);
});

it('returns 403 for staged file content when not owner', async () => {
  const otherToken = app.jwt.sign({ id: otherUserId, email: 'other@example.com', displayName: 'Other' });

  // findPostById
  mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
  // query for file — staged (revision_id is null)
  mockQuery.mockResolvedValueOnce({ rows: [sampleFileRow], rowCount: 1 });

  const response = await app.inject({
    method: 'GET',
    url: `/api/posts/${postId}/files/${fileId}`,
    headers: { authorization: `Bearer ${otherToken}` },
  });

  expect(response.statusCode).toBe(403);
});

it('returns 401 for staged file content without auth', async () => {
  // findPostById
  mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
  // query for file — staged (revision_id is null)
  mockQuery.mockResolvedValueOnce({ rows: [sampleFileRow], rowCount: 1 });

  const response = await app.inject({
    method: 'GET',
    url: `/api/posts/${postId}/files/${fileId}`,
  });

  expect(response.statusCode).toBe(401);
});

it('allows unauthenticated access to committed file on public non-draft post', async () => {
  // findPostById — public, not draft
  mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
  // query for file — committed (revision_id set)
  mockQuery.mockResolvedValueOnce({ rows: [sampleCommittedFileRow], rowCount: 1 });

  const response = await app.inject({
    method: 'GET',
    url: `/api/posts/${postId}/files/${fileId}`,
  });

  expect(response.statusCode).toBe(200);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run packages/server/src/__tests__/routes/files.test.ts`
Expected: New auth tests fail — endpoints currently return 200 for unauthorized access.

- [ ] **Step 4: Add authorization to GET /:id/files**

In `packages/server/src/routes/files.ts`, replace the GET /:id/files handler (lines 102-131).

The key changes:
1. Add optional auth via `app.authenticate` with a try-catch (don't fail if no token — just set user to null).
2. For staged files (no revisionId): require auth + ownership.
3. For revision files: check post visibility (public + not draft = public, else require auth + ownership).
4. Verify revision belongs to the target post when a specific revisionId is provided.

```typescript
  // ─── GET /:id/files — list files for a revision (or staged) ─────────
  app.get('/:id/files', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { revisionId } = request.query as { revisionId?: string };

    // Check post exists
    const post = await findPostById(id);
    if (!post) {
      return reply.status(404).send({ error: 'Post not found' });
    }

    // Resolve authenticated user (optional — may be null for public access)
    let userId: string | null = null;
    try {
      await request.jwtVerify();
      userId = (request.user as { id: string }).id;
    } catch {
      // No valid token — proceed as unauthenticated
    }

    const isOwner = userId !== null && post.author_id === userId;
    const isPublic = post.visibility === 'public' && !post.is_draft;

    // Staged files: owner-only
    if (!revisionId) {
      if (!userId) {
        return reply.status(401).send({ error: 'Authentication required' });
      }
      if (!isOwner) {
        return reply.status(403).send({ error: 'Forbidden' });
      }
      const files = await findStagedFilesByPostId(id);
      return reply.send({ files: files.map(toPostFile) });
    }

    // Revision files: post visibility applies
    if (!isPublic && !isOwner) {
      if (!userId) {
        return reply.status(401).send({ error: 'Authentication required' });
      }
      return reply.status(403).send({ error: 'Forbidden' });
    }

    let files: PostFileRow[];

    if (revisionId === 'latest') {
      const revisions = await findRevisionsByPostId(id);
      const latestRevision = revisions[0];
      if (!latestRevision) {
        return reply.status(404).send({ error: 'No revisions found' });
      }
      files = await findFilesByRevisionId(latestRevision.id);
    } else {
      // Verify the revision belongs to this post
      const revisionCheck = await query<{ post_id: string }>(
        'SELECT post_id FROM post_revisions WHERE id = $1',
        [revisionId],
      );
      if (!revisionCheck.rows[0] || revisionCheck.rows[0].post_id !== id) {
        return reply.status(404).send({ error: 'Revision not found' });
      }
      files = await findFilesByRevisionId(revisionId);
    }

    return reply.send({ files: files.map(toPostFile) });
  });
```

- [ ] **Step 5: Add authorization to GET /:id/files/:fileId**

In `packages/server/src/routes/files.ts`, replace the GET /:id/files/:fileId handler (lines 133-169):

```typescript
  // ─── GET /:id/files/:fileId — get file content or redirect ─────────
  app.get('/:id/files/:fileId', async (request, reply) => {
    const { id, fileId } = request.params as { id: string; fileId: string };

    // Check post exists
    const post = await findPostById(id);
    if (!post) {
      return reply.status(404).send({ error: 'Post not found' });
    }

    // Find the file (either staged or committed)
    const result = await query<PostFileRow>(
      'SELECT * FROM post_files WHERE id = $1 AND post_id = $2',
      [fileId, id],
    );
    const file = result.rows[0];
    if (!file) {
      return reply.status(404).send({ error: 'File not found' });
    }

    // Resolve authenticated user (optional)
    let userId: string | null = null;
    try {
      await request.jwtVerify();
      userId = (request.user as { id: string }).id;
    } catch {
      // No valid token
    }

    const isOwner = userId !== null && post.author_id === userId;
    const isPublic = post.visibility === 'public' && !post.is_draft;

    // Staged files: owner-only
    if (file.revision_id === null) {
      if (!userId) {
        return reply.status(401).send({ error: 'Authentication required' });
      }
      if (!isOwner) {
        return reply.status(403).send({ error: 'Forbidden' });
      }
    } else if (!isPublic && !isOwner) {
      // Committed files: post visibility applies
      if (!userId) {
        return reply.status(401).send({ error: 'Authentication required' });
      }
      return reply.status(403).send({ error: 'Forbidden' });
    }

    // Inline file: return content directly
    if (file.content !== null) {
      return reply
        .header('Content-Type', file.mime_type ?? 'application/octet-stream')
        .header('X-Content-Type-Options', 'nosniff')
        .header('Content-Disposition', `inline; filename="${file.filename}"`)
        .send(file.content);
    }

    // Object-stored file: redirect to signed URL
    if (file.storage_key) {
      const url = await app.storage.getSignedUrl(file.storage_key);
      return reply.code(302).redirect(url);
    }

    return reply.status(404).send({ error: 'File content not available' });
  });
```

- [ ] **Step 6: Update existing tests that now need auth/visibility context**

Several existing tests in the `GET /api/posts/:id/files` and `GET /api/posts/:id/files/:fileId` blocks now need adjustment because the routes have new auth behavior. Tests for public committed files (e.g., "lists files for a specific revision") should still pass since `samplePostRow` has `visibility: 'public'` and `is_draft: false`. Tests for staged files without auth will now return 401 instead of 200.

Update the existing staged-files test (lines 437-453) to include auth:

```typescript
it('lists staged files for post owner (with auth)', async () => {
  // findPostById
  mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
  // findStagedFilesByPostId
  mockQuery.mockResolvedValueOnce({ rows: [sampleFileRow], rowCount: 1 });

  const response = await app.inject({
    method: 'GET',
    url: `/api/posts/${postId}/files`,
    headers: { authorization: `Bearer ${token}` },
  });

  expect(response.statusCode).toBe(200);
  const json = response.json();
  expect(json.files).toHaveLength(1);
  expect(json.files[0].id).toBe(fileId);
});
```

Also update the revision-specific file list tests to add the revision-to-post verification mock where needed.

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run packages/server/src/__tests__/routes/files.test.ts`
Expected: All pass.

- [ ] **Step 8: Run full test suite**

Run: `npm test`
Expected: All pass.

- [ ] **Step 9: Commit**

```bash
git add packages/server/src/routes/files.ts packages/server/src/__tests__/routes/files.test.ts
git commit -m "fix(security): add authorization to file list and content endpoints

GET /posts/:id/files and GET /posts/:id/files/:fileId now enforce:
- Staged files (revision_id IS NULL): require auth + post ownership
- Committed files: follow parent post visibility (public+published = open,
  otherwise require auth + ownership)
- Revision-to-post association is verified for specific revisionId queries

Fixes part of #38"
```

---

### Task 5: Storage Lifecycle & Atomicity Fixes

**Why:** Three related data-integrity problems: (a) `cleanupStagedFiles()` deletes DB rows but not MinIO objects, causing unbounded storage growth; (b) `storage.copy()` inside `withTransaction()` leaves orphaned objects on rollback; (c) the upload path creates a DB row before storage upload completes — if upload fails, an unreadable orphan row remains.

**Files:**
- Modify: `packages/server/src/db/queries/post-files.ts:108-114`
- Modify: `packages/server/src/__tests__/db/queries/post-files.test.ts`
- Modify: `packages/server/src/app.ts:94-103`
- Modify: `packages/server/src/routes/files.ts` (upload handler, lines 76-94)
- Modify: `packages/server/src/__tests__/routes/files.test.ts`
- Modify: `packages/server/src/routes/posts.ts` (revision file-aware path, lines 425-513)
- Modify: `packages/server/src/__tests__/routes/posts-revision-files.test.ts`

#### 5a: Cleanup service that deletes objects before rows

- [ ] **Step 1: Add `findStaleStaged` query for storage-aware cleanup**

In `packages/server/src/db/queries/post-files.ts`, replace `cleanupStagedFiles` (lines 108-114):

```typescript
/**
 * Find staged files older than 24 hours (candidates for cleanup).
 * Returns rows with their storage_key so the caller can delete objects.
 */
export async function findStaleStagedFiles(): Promise<PostFileRow[]> {
  const result = await query<PostFileRow>(
    "SELECT * FROM post_files WHERE revision_id IS NULL AND created_at < NOW() - INTERVAL '24 hours'",
    [],
  );
  return result.rows;
}

/**
 * Delete staged files by their IDs. Call this AFTER deleting the
 * corresponding storage objects to avoid orphaned MinIO objects.
 */
export async function deleteStagedFilesByIds(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const result = await query(
    'DELETE FROM post_files WHERE id = ANY($1) AND revision_id IS NULL',
    [ids],
  );
  return result.rowCount ?? 0;
}
```

- [ ] **Step 2: Write tests for the new query functions**

In `packages/server/src/__tests__/db/queries/post-files.test.ts`, add tests for `findStaleStagedFiles` and `deleteStagedFilesByIds`. Follow the existing mock pattern in that file.

```typescript
describe('findStaleStagedFiles', () => {
  it('returns staged files older than 24 hours', async () => {
    const staleFile = { ...sampleFileRow, storage_key: 'staging/u/f/test.ts' };
    mockQuery.mockResolvedValueOnce({ rows: [staleFile], rowCount: 1 });

    const result = await findStaleStagedFiles();

    expect(result).toHaveLength(1);
    expect(result[0].storage_key).toBe('staging/u/f/test.ts');
  });
});

describe('deleteStagedFilesByIds', () => {
  it('deletes files by IDs', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 2 });

    const count = await deleteStagedFilesByIds(['id-1', 'id-2']);

    expect(count).toBe(2);
    expect(mockQuery).toHaveBeenCalledWith(
      'DELETE FROM post_files WHERE id = ANY($1) AND revision_id IS NULL',
      [['id-1', 'id-2']],
    );
  });

  it('returns 0 for empty array without hitting DB', async () => {
    const count = await deleteStagedFilesByIds([]);

    expect(count).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run packages/server/src/__tests__/db/queries/post-files.test.ts`
Expected: Fails — `findStaleStagedFiles` and `deleteStagedFilesByIds` not yet exported.

- [ ] **Step 4: Implement the query functions** (already written in Step 1)

Run: `npx vitest run packages/server/src/__tests__/db/queries/post-files.test.ts`
Expected: All pass.

- [ ] **Step 5: Update app.ts cleanup hook to use storage-aware cleanup**

In `packages/server/src/app.ts`, change the import (line 24) and the `onReady` hook (lines 94-103):

Replace import:
```typescript
import { cleanupStagedFiles } from './db/queries/post-files.js';
```
With:
```typescript
import { findStaleStagedFiles, deleteStagedFilesByIds } from './db/queries/post-files.js';
```

Replace the `onReady` hook:
```typescript
  app.addHook('onReady', async () => {
    try {
      const staleFiles = await findStaleStagedFiles();
      if (staleFiles.length === 0) return;

      // Delete storage objects first (best-effort)
      if (app.storage) {
        for (const file of staleFiles) {
          if (file.storage_key) {
            try {
              await app.storage.delete(file.storage_key);
            } catch {
              app.log.warn({ storageKey: file.storage_key }, 'Failed to delete stale storage object');
            }
          }
        }
      }

      // Then delete DB rows
      const cleaned = await deleteStagedFilesByIds(staleFiles.map((f) => f.id));
      if (cleaned > 0) {
        app.log.info({ count: cleaned }, 'Cleaned up orphaned staged files');
      }
    } catch (err) {
      app.log.warn({ err }, 'Failed to clean up staged files');
    }
  });
```

- [ ] **Step 6: Write tests for the app.ts onReady cleanup hook**

The `app.ts` test file may not have direct tests for the `onReady` hook. Since the hook interacts with `findStaleStagedFiles`, `deleteStagedFilesByIds`, and `app.storage.delete`, add integration-style tests in `packages/server/src/__tests__/routes/files.test.ts` (which already has the storage mocks wired up) or in a dedicated describe block. The key branches to cover:

```typescript
describe('staged file cleanup (onReady hook)', () => {
  it('does nothing when no stale staged files exist', async () => {
    // findStaleStagedFiles returns empty
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    // The hook runs on app.ready() — already called in beforeAll.
    // Verify no deleteStagedFilesByIds call was made.
    // (This tests the early-return branch: staleFiles.length === 0)
  });

  it('deletes storage objects before DB rows for stale files', async () => {
    const staleFile = {
      ...sampleFileRow,
      storage_key: 'staging/user/file/test.ts',
      created_at: new Date('2025-01-01'), // older than 24h
    };
    // findStaleStagedFiles
    mockQuery.mockResolvedValueOnce({ rows: [staleFile], rowCount: 1 });
    // deleteStagedFilesByIds
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    mockStorageDelete.mockResolvedValueOnce(undefined);

    // Trigger cleanup and verify order: storage.delete before DB delete
    // Exact integration depends on test harness — may need to rebuild app
    // to capture the onReady hook with fresh mocks.
  });

  it('continues cleanup when storage.delete fails (best-effort)', async () => {
    const staleFile = {
      ...sampleFileRow,
      storage_key: 'staging/user/file/test.ts',
    };
    // findStaleStagedFiles
    mockQuery.mockResolvedValueOnce({ rows: [staleFile], rowCount: 1 });
    // storage.delete fails
    mockStorageDelete.mockRejectedValueOnce(new Error('Storage unavailable'));
    // deleteStagedFilesByIds still called
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    // Verify DB rows are still deleted even when storage delete fails
  });

  it('skips storage deletion for files without storage_key', async () => {
    const inlineStaleFile = {
      ...sampleFileRow,
      storage_key: null,
    };
    // findStaleStagedFiles
    mockQuery.mockResolvedValueOnce({ rows: [inlineStaleFile], rowCount: 1 });
    // deleteStagedFilesByIds
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    // Verify storage.delete was NOT called
  });
});
```

Note: The `onReady` hook runs during `app.ready()` in `beforeAll`. To test different branches, you may need to extract the cleanup logic into a testable function (e.g., `cleanupStaleFiles(storage, log)`) imported by both `app.ts` and the test. This keeps the hook thin and the logic fully testable. Alternatively, rebuild the app with fresh mocks per test in a separate describe block.

- [ ] **Step 7: Run full test suite to verify no regressions and coverage**

Run: `npm test`
Expected: All pass with 100% coverage on the new cleanup branches.

- [ ] **Step 8: Commit cleanup service changes**

```bash
git add packages/server/src/db/queries/post-files.ts packages/server/src/__tests__/db/queries/post-files.test.ts packages/server/src/app.ts
git commit -m "fix(data-integrity): delete storage objects before DB rows in cleanup

cleanupStagedFiles() was a bare DELETE that leaked MinIO objects.
Now finds stale staged files, deletes their storage objects (best-effort),
then removes DB rows. Objects are deleted first so a crash between
the two steps leaves deletable rows rather than orphaned objects.

Fixes part of #38"
```

#### 5b: Upload atomicity — prevent orphan rows on storage failure

- [ ] **Step 8: Write failing test for upload atomicity**

In `packages/server/src/__tests__/routes/files.test.ts`, add inside the `POST /api/posts/:id/files` describe block:

```typescript
it('does not leave orphan DB row when storage upload fails', async () => {
  const largeContent = Buffer.alloc(65_537, 'x');
  const { body, boundary } = buildMultipartBody('photo.png', largeContent, 'image/png');

  mockFileTypeFromBuffer.mockResolvedValueOnce({ mime: 'image/png' });

  // findPostById
  mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
  // getNextSortOrder
  mockQuery.mockResolvedValueOnce({ rows: [{ next: 0 }], rowCount: 1 });
  // createPostFile
  mockQuery.mockResolvedValueOnce({ rows: [sampleObjectFileRow], rowCount: 1 });
  // storage upload fails
  mockStorageUpload.mockRejectedValueOnce(new Error('Storage unavailable'));
  // DELETE orphan row (compensation)
  mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

  const response = await app.inject({
    method: 'POST',
    url: `/api/posts/${postId}/files`,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });

  expect(response.statusCode).toBe(500);
  // Verify the orphan row was cleaned up
  const deleteCalls = mockQuery.mock.calls.filter(
    (call) => typeof call[0] === 'string' && call[0].includes('DELETE FROM post_files'),
  );
  expect(deleteCalls.length).toBeGreaterThanOrEqual(1);
});
```

- [ ] **Step 9: Run test to verify it fails**

Run: `npx vitest run packages/server/src/__tests__/routes/files.test.ts`
Expected: Fails — current code doesn't catch storage upload failure or clean up the DB row.

- [ ] **Step 10: Add compensation logic to upload path**

In `packages/server/src/routes/files.ts`, replace the object storage block (lines 89-94):

```typescript
      // 10. If object storage, upload and update storage_key
      if (storageMode === 'object') {
        const key = stagingKey(request.user.id, row.id, filename);
        try {
          await app.storage.upload(key, buffer, data.mimetype, buffer.length);
          await query('UPDATE post_files SET storage_key = $1 WHERE id = $2', [key, row.id]);
          row.storage_key = key;
        } catch (err) {
          // Compensate: delete the orphan DB row
          await query('DELETE FROM post_files WHERE id = $1 AND post_id = $2', [row.id, id]);
          throw err;
        }
      }
```

- [ ] **Step 11: Run tests to verify they pass**

Run: `npx vitest run packages/server/src/__tests__/routes/files.test.ts`
Expected: All pass.

- [ ] **Step 12: Commit upload atomicity fix**

```bash
git add packages/server/src/routes/files.ts packages/server/src/__tests__/routes/files.test.ts
git commit -m "fix(data-integrity): clean up orphan DB row when storage upload fails

The upload path created the DB row before the storage upload. If
storage.upload() or the subsequent UPDATE failed, the row was left
with content=null and storage_key=null — unreadable and invisible
to cleanup. Now wraps the storage operation in try/catch with
compensation that deletes the orphan row.

Fixes part of #38"
```

#### 5c: Compensation for storage.copy inside revision transaction

- [ ] **Step 13: Write failing test for revision storage rollback compensation**

In `packages/server/src/__tests__/routes/posts-revision-files.test.ts`, add a test verifying that when a DB operation fails after `storage.copy`, the copied objects are cleaned up:

```typescript
it('cleans up copied storage objects when transaction rolls back', async () => {
  // Setup: post with one staged file that has a storage_key
  const stagedFile: PostFileRow = {
    ...sampleFileRow,
    revision_id: null,
    storage_key: 'staging/user/file/test.png',
    content: null,
  };

  // findPostById
  mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });

  // withTransaction mocks (called via client.query):
  // BEGIN
  mockPoolClient.query.mockResolvedValueOnce({});
  // INSERT revision
  mockPoolClient.query.mockResolvedValueOnce({
    rows: [{ id: 'new-rev-id', post_id: postId, author_id: userId, content: 'x', message: null, revision_number: 2, created_at: new Date() }],
    rowCount: 1,
  });
  // SELECT staged file
  mockPoolClient.query.mockResolvedValueOnce({ rows: [stagedFile], rowCount: 1 });

  // storage.copy succeeds
  mockStorageCopy.mockResolvedValueOnce(undefined);

  // UPDATE staged file — FAILS (simulating DB error after copy)
  mockPoolClient.query.mockRejectedValueOnce(new Error('DB constraint violation'));
  // ROLLBACK
  mockPoolClient.query.mockResolvedValueOnce({});

  // storage.delete for compensation
  mockStorageDelete.mockResolvedValueOnce(undefined);

  const response = await app.inject({
    method: 'POST',
    url: `/api/posts/${postId}/revisions`,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      content: 'updated content',
      stagedFileIds: [stagedFile.id],
    }),
  });

  expect(response.statusCode).toBe(500);
  // Verify the copied object was cleaned up
  expect(mockStorageDelete).toHaveBeenCalledWith(
    expect.stringContaining('posts/'),
  );
});
```

- [ ] **Step 14: Add compensation logic to revision file-aware transaction**

In `packages/server/src/routes/posts.ts`, the file-aware transaction path (lines 425-513) already tracks `stagingKeysToDelete`. Add a parallel `copiedKeys` tracker and wrap the catch block to clean up:

Replace the `try { revisionRow = await withTransaction(...)` block (lines 427-513) to track copied keys and add compensation:

```typescript
    const stagingKeysToDelete: string[] = [];
    const copiedKeys: string[] = []; // Track keys copied during transaction

    let revisionRow: PostRevisionRow;
    try {
      revisionRow = await withTransaction(async (client) => {
        // 1. Create revision atomically
        const revResult = await client.query<PostRevisionRow>(
          `INSERT INTO post_revisions (post_id, author_id, content, message, revision_number)
           SELECT $1, $2, $3, $4, COALESCE(MAX(revision_number), 0) + 1
           FROM post_revisions WHERE post_id = $1
           RETURNING *`,
          [id, request.user.id, parsed.data.content, parsed.data.message ?? null],
        );
        const rev = revResult.rows[0] as PostRevisionRow;

        // 2. Process staged files
        for (const fileId of stagedFileIds) {
          const fileResult = await client.query<PostFileRow>(
            'SELECT * FROM post_files WHERE id = $1 AND post_id = $2 AND revision_id IS NULL',
            [fileId, id],
          );
          const file = fileResult.rows[0];
          if (!file) {
            throw new Error(`Staged file not found: ${fileId}`);
          }

          let newStorageKey = file.storage_key;
          if (file.storage_key) {
            newStorageKey = permanentKey(id, rev.id, file.filename);
            await app.storage.copy(file.storage_key, newStorageKey);
            copiedKeys.push(newStorageKey);
            stagingKeysToDelete.push(file.storage_key);
          }

          await client.query(
            'UPDATE post_files SET revision_id = $1, storage_key = $2 WHERE id = $3 AND post_id = $4',
            [rev.id, newStorageKey, fileId, id],
          );
        }

        // 3. Carry forward files from previous revision (if any)
        const prevRevResult = await client.query<PostRevisionRow>(
          'SELECT * FROM post_revisions WHERE post_id = $1 AND id != $2 ORDER BY revision_number DESC LIMIT 1',
          [id, rev.id],
        );
        const prevRevision = prevRevResult.rows[0];

        if (prevRevision) {
          const prevFilesResult = await client.query<PostFileRow>(
            'SELECT * FROM post_files WHERE revision_id = $1 ORDER BY sort_order ASC',
            [prevRevision.id],
          );

          const removeSet = new Set(removeFileIds);
          for (const prevFile of prevFilesResult.rows) {
            if (removeSet.has(prevFile.id)) continue;

            await client.query(
              `INSERT INTO post_files (post_id, revision_id, filename, content, storage_key, mime_type, sort_order, file_size)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
              [
                prevFile.post_id,
                rev.id,
                prevFile.filename,
                prevFile.content,
                prevFile.storage_key,
                prevFile.mime_type,
                prevFile.sort_order,
                prevFile.file_size,
              ],
            );
          }
        }

        return rev;
      });
    } catch (err) {
      // Compensate: delete any objects copied during the failed transaction
      for (const key of copiedKeys) {
        try {
          await app.storage.delete(key);
        } catch {
          // Best-effort: log but don't mask the original error
        }
      }

      const message = err instanceof Error ? err.message : 'Transaction failed';
      if (message.startsWith('Staged file not found')) {
        return reply.status(400).send({ error: message });
      }
      throw err;
    }
```

- [ ] **Step 15: Run tests to verify they pass**

Run: `npx vitest run packages/server/src/__tests__/routes/posts-revision-files.test.ts`
Expected: All pass.

- [ ] **Step 16: Run full test suite**

Run: `npm test`
Expected: All pass.

- [ ] **Step 17: Commit storage compensation**

```bash
git add packages/server/src/routes/posts.ts packages/server/src/__tests__/routes/posts-revision-files.test.ts
git commit -m "fix(data-integrity): compensate storage.copy on transaction rollback

storage.copy() was called inside withTransaction(). If a later DB
operation failed, the transaction rolled back but already-copied objects
remained orphaned. Now tracks copied keys and deletes them in the
catch block when the transaction fails.

Fixes part of #38"
```

---

### Task 6: Bruno API Test Updates

**Files:**
- Modify: `bruno/files/list-files.bru` (now requires auth for staged files)
- Create: `bruno/files/list-staged-no-auth.bru`
- Create: `bruno/files/get-file-private-post.bru`
- Modify: `bruno/files/upload-disallowed-mime.bru` (verify text/html is rejected)

- [ ] **Step 1: Add Bruno test for text/html upload rejection**

Create or update `bruno/files/upload-disallowed-mime.bru` to test that `text/html` is now rejected (415).

- [ ] **Step 2: Add Bruno test for staged file list without auth**

Create `bruno/files/list-staged-no-auth.bru` asserting 401 response when listing staged files without authentication.

- [ ] **Step 3: Create Bruno test for file content on private post**

Create `bruno/files/get-file-private-post.bru` asserting 403 when fetching file content from a private post without ownership. Use a different user's token or no auth to hit `GET /api/posts/:postId/files/:fileId` where the post is private. Must include `assert { res.status: eq 403 }` block.

- [ ] **Step 4: Update existing list-files.bru to include auth header**

`bruno/files/list-files.bru` — if it tests staged file listing, add the Bearer token header.

- [ ] **Step 5: Run Bruno suite against running server**

```bash
cd bruno && npx @usebruno/cli run files --env local
```

Expected: All files in `bruno/files/` return their asserted status codes.

- [ ] **Step 6: Commit Bruno updates**

```bash
git add bruno/files/
git commit -m "test(bruno): update file API tests for auth and MIME changes

- text/html upload now asserts 415
- Staged file list without auth asserts 401
- Existing tests updated with auth headers where needed

Fixes part of #38"
```

---

### Task 7: Final Verification

- [ ] **Step 1: Run full test suite with coverage**

Run: `npm run test:coverage`
Expected: All tests pass, 100% lines/branches/functions/statements.

- [ ] **Step 2: Run Bruno suite against running server**

Start server: `set -a && source .env && set +a && cd packages/server && npx tsx src/server.ts`
Run: `cd bruno && npx @usebruno/cli run -r --env local`
Expected: All requests return their asserted status codes.

- [ ] **Step 3: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: Clean.

- [ ] **Step 4: Run lint**

Run: `npm run lint`
Expected: Clean.
