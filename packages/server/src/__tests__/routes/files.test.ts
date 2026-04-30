import { describe, it, expect, beforeAll, afterAll, beforeEach, vi, type Mock } from 'vitest';

// Set env vars so app.ts registers the (mocked) storage plugin
process.env.MINIO_ACCESS_KEY = 'test-key';

// ---------------------------------------------------------------------------
// Module mocks — must come before any imports that touch the mocked modules
// ---------------------------------------------------------------------------

vi.mock('../../db/connection.js', () => ({
  query: vi.fn(),
}));

// Disable rate limiting in route tests
vi.mock('../../plugins/rate-limit.js', () => ({
  rateLimitPlugin: async () => {
    // no-op
  },
}));

// Mock the storage plugin to avoid real MinIO connections
const mockStorageUpload = vi.fn();
const mockStorageGetSignedUrl = vi.fn();
const mockStorageDelete = vi.fn();
const mockStorageExists = vi.fn();
const mockStorageCopy = vi.fn();

vi.mock('../../plugins/storage.js', async () => {
  const fp = (await import('fastify-plugin')).default;
  return {
    storagePlugin: fp(async (fastify: { decorate: (name: string, value: unknown) => void }) => {
      fastify.decorate('storage', {
        upload: mockStorageUpload,
        copy: mockStorageCopy,
        getSignedUrl: mockStorageGetSignedUrl,
        delete: mockStorageDelete,
        exists: mockStorageExists,
      });
    }),
  };
});

// Mock file-type package for magic bytes validation
const mockFileTypeFromBuffer = vi.fn();
vi.mock('file-type', () => ({
  fileTypeFromBuffer: mockFileTypeFromBuffer,
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { query } from '../../db/connection.js';
import { buildApp } from '../../app.js';
import type { FastifyInstance } from 'fastify';
import type { PostRow, PostFileRow } from '../../db/queries/types.js';

const mockQuery = query as Mock;

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const userId = '660e8400-e29b-41d4-a716-446655440000';
const otherUserId = '990e8400-e29b-41d4-a716-446655440000';
const postId = '550e8400-e29b-41d4-a716-446655440000';
const fileId = 'aae08400-e29b-41d4-a716-446655440001';
const revisionId = '770e8400-e29b-41d4-a716-446655440000';

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

const sampleFileRow: PostFileRow = {
  id: fileId,
  post_id: postId,
  revision_id: null,
  filename: 'hello.ts',
  content: 'console.log("hello");',
  storage_key: null,
  mime_type: 'text/plain',
  sort_order: 0,
  file_size: 21,
  created_at: new Date('2026-01-01'),
};

const sampleObjectFileRow: PostFileRow = {
  id: fileId,
  post_id: postId,
  revision_id: null,
  filename: 'photo.png',
  content: null,
  storage_key: `staging/${userId}/${fileId}/photo.png`,
  mime_type: 'image/png',
  sort_order: 0,
  file_size: 100_000,
  created_at: new Date('2026-01-01'),
};

const sampleCommittedFileRow: PostFileRow = {
  ...sampleFileRow,
  revision_id: revisionId,
};

// ---------------------------------------------------------------------------
// Helper: build a raw multipart body for app.inject
// ---------------------------------------------------------------------------

function buildMultipartBody(
  filename: string,
  content: Buffer | string,
  contentType: string,
): { body: Buffer; boundary: string } {
  const boundary = '----TestBoundary123';
  const fileContent = typeof content === 'string' ? Buffer.from(content) : content;
  const parts = [
    `--${boundary}\r\n`,
    `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n`,
    `Content-Type: ${contentType}\r\n`,
    '\r\n',
  ];
  const header = Buffer.from(parts.join(''));
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    body: Buffer.concat([header, fileContent, footer]),
    boundary,
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('file routes', () => {
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    token = app.jwt.sign({ id: userId, email: 'test@example.com', displayName: 'Test User' });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── POST /api/posts/:id/files ──────────────────────────────────────

  describe('POST /api/posts/:id/files', () => {
    it('uploads inline file and returns 201', async () => {
      const fileContent = 'console.log("hello");';
      const { body, boundary } = buildMultipartBody('hello.ts', fileContent, 'text/plain');

      // findPostById
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // getNextSortOrder
      mockQuery.mockResolvedValueOnce({ rows: [{ next: 0 }], rowCount: 1 });
      // createPostFile
      mockQuery.mockResolvedValueOnce({ rows: [sampleFileRow], rowCount: 1 });

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/files`,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        body,
      });

      expect(response.statusCode).toBe(201);
      const json = response.json();
      expect(json.file.id).toBe(fileId);
      expect(json.file.filename).toBe('hello.ts');
      expect(json.file.mimeType).toBe('text/plain');
    });

    it('uploads object-stored file and returns 201', async () => {
      // Create a buffer larger than 64KB to trigger object storage
      const largeContent = Buffer.alloc(65_537, 'x');
      const { body, boundary } = buildMultipartBody('photo.png', largeContent, 'image/png');

      // Mock file-type for image magic bytes validation
      mockFileTypeFromBuffer.mockResolvedValueOnce({ mime: 'image/png' });

      // findPostById
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // getNextSortOrder
      mockQuery.mockResolvedValueOnce({ rows: [{ next: 0 }], rowCount: 1 });
      // createPostFile
      mockQuery.mockResolvedValueOnce({ rows: [sampleObjectFileRow], rowCount: 1 });
      // UPDATE storage_key
      mockQuery.mockResolvedValueOnce({ rows: [sampleObjectFileRow], rowCount: 1 });

      mockStorageUpload.mockResolvedValueOnce(undefined);

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/files`,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        body,
      });

      expect(response.statusCode).toBe(201);
      expect(mockStorageUpload).toHaveBeenCalled();
    });

    it('deletes orphan DB row when object storage upload fails', async () => {
      // Create a buffer larger than 64KB to trigger object storage
      const largeContent = Buffer.alloc(65_537, 'x');
      const { body, boundary } = buildMultipartBody('photo.png', largeContent, 'image/png');

      // Mock file-type for image magic bytes validation
      mockFileTypeFromBuffer.mockResolvedValueOnce({ mime: 'image/png' });

      // findPostById
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // getNextSortOrder
      mockQuery.mockResolvedValueOnce({ rows: [{ next: 0 }], rowCount: 1 });
      // createPostFile — returns row with id
      mockQuery.mockResolvedValueOnce({ rows: [sampleObjectFileRow], rowCount: 1 });
      // DELETE orphan row (compensation)
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      // Simulate storage upload failure
      mockStorageUpload.mockRejectedValueOnce(new Error('MinIO unreachable'));

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/files`,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        body,
      });

      // Should propagate the error (500)
      expect(response.statusCode).toBe(500);
      // The compensation DELETE should have been called
      const deleteCalls = mockQuery.mock.calls.filter(
        (call: unknown[]) =>
          typeof call[0] === 'string' &&
          (call[0] as string).startsWith('DELETE FROM post_files WHERE id'),
      );
      expect(deleteCalls).toHaveLength(1);
      expect(deleteCalls[0][1]).toEqual([sampleObjectFileRow.id, postId]);
    });

    it('returns 401 without auth', async () => {
      const { body, boundary } = buildMultipartBody('hello.ts', 'content', 'text/plain');

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/files`,
        headers: {
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        body,
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 404 when post not found', async () => {
      const { body, boundary } = buildMultipartBody('hello.ts', 'content', 'text/plain');

      // findPostById returns nothing
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/files`,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        body,
      });

      expect(response.statusCode).toBe(404);
    });

    it('returns 403 when user does not own the post', async () => {
      const { body, boundary } = buildMultipartBody('hello.ts', 'content', 'text/plain');

      // findPostById returns post owned by another user
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...samplePostRow, author_id: otherUserId }],
        rowCount: 1,
      });

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/files`,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        body,
      });

      expect(response.statusCode).toBe(403);
    });

    it('returns 415 for disallowed MIME type', async () => {
      const { body, boundary } = buildMultipartBody(
        'virus.exe',
        'content',
        'application/x-msdownload',
      );

      // findPostById
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/files`,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        body,
      });

      expect(response.statusCode).toBe(415);
    });

    it('returns 415 when image magic bytes do not match claimed MIME', async () => {
      const { body, boundary } = buildMultipartBody('fake.png', 'not-a-real-png', 'image/png');

      // Mock file-type returning different MIME than claimed
      mockFileTypeFromBuffer.mockResolvedValueOnce({ mime: 'text/plain' });

      // findPostById
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/files`,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        body,
      });

      expect(response.statusCode).toBe(415);
    });

    it('returns 415 when image has no detectable magic bytes', async () => {
      const { body, boundary } = buildMultipartBody('fake.png', 'not-a-real-png', 'image/png');

      // Mock file-type returning undefined (no magic bytes detected)
      mockFileTypeFromBuffer.mockResolvedValueOnce(undefined);

      // findPostById
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/files`,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        body,
      });

      expect(response.statusCode).toBe(415);
    });

    it('returns 413 when file exceeds size limit (truncated)', async () => {
      // Build a buffer just over the 10MB limit to trigger truncation.
      // With throwFileSizeLimit: false, the stream is silently truncated
      // and our handler checks data.file.truncated.
      const oversizedContent = Buffer.alloc(10_485_761, 'x');
      const { body, boundary } = buildMultipartBody('big.txt', oversizedContent, 'text/plain');

      // findPostById
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/files`,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        body,
      });

      expect(response.statusCode).toBe(413);
      expect(response.json().error).toBe('File too large');
    });

    it('returns 400 when no file is attached to the multipart request', async () => {
      // Send a multipart body with no file field
      const boundary = '----TestBoundary123';
      const body = Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="notAFile"\r\n\r\nsome text\r\n--${boundary}--\r\n`,
      );

      // findPostById
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/files`,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        body,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toBe('No file uploaded');
    });

    it('sanitizes dangerous filenames', async () => {
      const { body, boundary } = buildMultipartBody('../../../etc/passwd', 'content', 'text/plain');

      // findPostById
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // getNextSortOrder
      mockQuery.mockResolvedValueOnce({ rows: [{ next: 0 }], rowCount: 1 });
      // createPostFile — capture what filename was passed
      const createdRow: PostFileRow = {
        ...sampleFileRow,
        filename: 'passwd',
      };
      mockQuery.mockResolvedValueOnce({ rows: [createdRow], rowCount: 1 });

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/files`,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        body,
      });

      expect(response.statusCode).toBe(201);
      // The filename should have been sanitized — check the DB insert args
      const createCall = mockQuery.mock.calls[2];
      // The third positional arg to the INSERT query is the filename
      expect(createCall[1][2]).toBe('passwd');
    });
  });

  // ─── GET /api/posts/:id/files ──────────────────────────────────────

  describe('GET /api/posts/:id/files', () => {
    it('lists staged files for post owner with auth (no revisionId query)', async () => {
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
      expect(json.files[0].filename).toBe('hello.ts');
    });

    it('returns 401 for staged files (no revisionId) without auth', async () => {
      // preHandler short-circuits before any DB call — no mocks needed
      const response = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}/files`,
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 403 for staged files (no revisionId) when non-owner', async () => {
      const otherToken = app.jwt.sign({
        id: otherUserId,
        email: 'other@example.com',
        displayName: 'Other User',
      });

      // findPostById — post owned by userId, not otherUserId
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });

      const response = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}/files`,
        headers: { authorization: `Bearer ${otherToken}` },
      });

      expect(response.statusCode).toBe(403);
    });

    it('lists files for a specific revision (public post, with auth)', async () => {
      // findPostById — public, not draft
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // revision-to-post association check
      mockQuery.mockResolvedValueOnce({ rows: [{ post_id: postId }], rowCount: 1 });
      // findFilesByRevisionId
      mockQuery.mockResolvedValueOnce({ rows: [sampleCommittedFileRow], rowCount: 1 });

      const response = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}/files?revisionId=${revisionId}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.files).toHaveLength(1);
      expect(json.files[0].revisionId).toBe(revisionId);
    });

    it('returns 404 for specific revisionId not belonging to the post', async () => {
      // findPostById — public post
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // revision-to-post association check — revision belongs to a different post
      mockQuery.mockResolvedValueOnce({ rows: [{ post_id: 'different-post-id' }], rowCount: 1 });

      const response = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}/files?revisionId=${revisionId}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(404);
    });

    it('returns 404 when specific revisionId does not exist', async () => {
      // findPostById — public post
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // revision-to-post association check — revision not found
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const response = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}/files?revisionId=${revisionId}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(404);
    });

    it('returns 401 for revision files on private post without auth', async () => {
      // preHandler short-circuits before any DB call — no mocks needed
      const response = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}/files?revisionId=${revisionId}`,
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 403 for revision files on private post when non-owner', async () => {
      const otherToken = app.jwt.sign({
        id: otherUserId,
        email: 'other@example.com',
        displayName: 'Other User',
      });
      const privatePost = { ...samplePostRow, visibility: 'private' };

      // findPostById — private post (assertCanReadPost short-circuits before revision lookup)
      mockQuery.mockResolvedValueOnce({ rows: [privatePost], rowCount: 1 });

      const response = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}/files?revisionId=${revisionId}`,
        headers: { authorization: `Bearer ${otherToken}` },
      });

      expect(response.statusCode).toBe(403);
    });

    it('lists revision files for non-owner on public draft post (visibility check passes)', async () => {
      // After WU3, draft-blocking on read is removed (matches WU2's posts.ts behavior).
      // assertCanReadPost only enforces visibility === 'private'; drafts are reachable
      // to authenticated callers if visibility is public.
      const otherToken = app.jwt.sign({
        id: otherUserId,
        email: 'other@example.com',
        displayName: 'Other User',
      });
      const draftPost = { ...samplePostRow, is_draft: true };

      // findPostById — draft post (public but draft)
      mockQuery.mockResolvedValueOnce({ rows: [draftPost], rowCount: 1 });
      // revision-to-post association check
      mockQuery.mockResolvedValueOnce({ rows: [{ post_id: postId }], rowCount: 1 });
      // findFilesByRevisionId
      mockQuery.mockResolvedValueOnce({ rows: [sampleCommittedFileRow], rowCount: 1 });

      const response = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}/files?revisionId=${revisionId}`,
        headers: { authorization: `Bearer ${otherToken}` },
      });

      expect(response.statusCode).toBe(200);
    });

    it('allows owner to access revision files on private post', async () => {
      const privatePost = { ...samplePostRow, visibility: 'private' };

      // findPostById — private post
      mockQuery.mockResolvedValueOnce({ rows: [privatePost], rowCount: 1 });
      // revision-to-post association check
      mockQuery.mockResolvedValueOnce({ rows: [{ post_id: postId }], rowCount: 1 });
      // findFilesByRevisionId
      mockQuery.mockResolvedValueOnce({ rows: [sampleCommittedFileRow], rowCount: 1 });

      const response = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}/files?revisionId=${revisionId}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
    });

    it('lists files for the latest revision when revisionId=latest (public post)', async () => {
      // findPostById
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // findRevisionsByPostId — returns latest revision first
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: revisionId, post_id: postId, revision_number: 1 }],
        rowCount: 1,
      });
      // findFilesByRevisionId
      mockQuery.mockResolvedValueOnce({ rows: [sampleCommittedFileRow], rowCount: 1 });

      const response = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}/files?revisionId=latest`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.files).toHaveLength(1);
    });

    it('returns empty array when latest revision has no files', async () => {
      // findPostById
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // findRevisionsByPostId
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: revisionId, post_id: postId, revision_number: 1 }],
        rowCount: 1,
      });
      // findFilesByRevisionId
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const response = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}/files?revisionId=latest`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.files).toHaveLength(0);
    });

    it('returns 401 for latest revision on private post without auth', async () => {
      // preHandler short-circuits before any DB call — no mocks needed
      const response = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}/files?revisionId=latest`,
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 403 for latest revision on private post when non-owner', async () => {
      const otherToken = app.jwt.sign({
        id: otherUserId,
        email: 'other@example.com',
        displayName: 'Other User',
      });
      const privatePost = { ...samplePostRow, visibility: 'private' };

      // findPostById — private post (assertCanReadPost short-circuits before revision lookup)
      mockQuery.mockResolvedValueOnce({ rows: [privatePost], rowCount: 1 });

      const response = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}/files?revisionId=latest`,
        headers: { authorization: `Bearer ${otherToken}` },
      });

      expect(response.statusCode).toBe(403);
    });

    it('returns 404 when post not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const response = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}/files`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(404);
    });

    it('returns 404 when revisionId=latest but post has no revisions', async () => {
      // findPostById
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // findRevisionsByPostId — empty
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const response = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}/files?revisionId=latest`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // ─── GET /api/posts/:id/files/:fileId ──────────────────────────────

  describe('GET /api/posts/:id/files/:fileId', () => {
    it('returns inline content for committed file on public post (with auth)', async () => {
      // sampleFileRow has revision_id: null (staged) — use sampleCommittedFileRow for committed
      // findPostById — public post
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // query for file by id and post_id
      mockQuery.mockResolvedValueOnce({ rows: [sampleCommittedFileRow], rowCount: 1 });

      const response = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}/files/${fileId}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/plain');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['content-disposition']).toContain('hello.ts');
      expect(response.body).toBe('console.log("hello");');
    });

    it('returns inline content for staged file when owner', async () => {
      // findPostById — public post
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // query for file — staged (revision_id: null)
      mockQuery.mockResolvedValueOnce({ rows: [sampleFileRow], rowCount: 1 });

      const response = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}/files/${fileId}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toBe('console.log("hello");');
    });

    it('returns 401 for staged file without auth', async () => {
      // preHandler short-circuits before any DB call — no mocks needed
      const response = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}/files/${fileId}`,
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 403 for staged file when non-owner', async () => {
      const otherToken = app.jwt.sign({
        id: otherUserId,
        email: 'other@example.com',
        displayName: 'Other User',
      });

      // findPostById
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // query for file — staged (revision_id: null)
      mockQuery.mockResolvedValueOnce({ rows: [sampleFileRow], rowCount: 1 });

      const response = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}/files/${fileId}`,
        headers: { authorization: `Bearer ${otherToken}` },
      });

      expect(response.statusCode).toBe(403);
    });

    it('returns 401 for committed file on private post without auth', async () => {
      // preHandler short-circuits before any DB call — no mocks needed
      const response = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}/files/${fileId}`,
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 403 for committed file on private post when non-owner', async () => {
      const otherToken = app.jwt.sign({
        id: otherUserId,
        email: 'other@example.com',
        displayName: 'Other User',
      });
      const privatePost = { ...samplePostRow, visibility: 'private' };

      // findPostById — private post (assertCanReadPost short-circuits before file lookup)
      mockQuery.mockResolvedValueOnce({ rows: [privatePost], rowCount: 1 });

      const response = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}/files/${fileId}`,
        headers: { authorization: `Bearer ${otherToken}` },
      });

      expect(response.statusCode).toBe(403);
    });

    it('allows owner to access committed file on private post', async () => {
      const privatePost = { ...samplePostRow, visibility: 'private' };

      // findPostById — private post
      mockQuery.mockResolvedValueOnce({ rows: [privatePost], rowCount: 1 });
      // query for file — committed
      mockQuery.mockResolvedValueOnce({ rows: [sampleCommittedFileRow], rowCount: 1 });

      const response = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}/files/${fileId}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
    });

    it('returns committed file on public draft post for non-owner (visibility check passes)', async () => {
      // After WU3, draft-blocking on read is removed (matches WU2's posts.ts behavior).
      const otherToken = app.jwt.sign({
        id: otherUserId,
        email: 'other@example.com',
        displayName: 'Other User',
      });
      const draftPost = { ...samplePostRow, is_draft: true };

      // findPostById — draft post (public visibility)
      mockQuery.mockResolvedValueOnce({ rows: [draftPost], rowCount: 1 });
      // query for file — committed
      mockQuery.mockResolvedValueOnce({ rows: [sampleCommittedFileRow], rowCount: 1 });

      const response = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}/files/${fileId}`,
        headers: { authorization: `Bearer ${otherToken}` },
      });

      expect(response.statusCode).toBe(200);
    });

    it('redirects to signed URL for object-stored committed files (public post)', async () => {
      const signedUrl = 'https://minio.example.com/signed-url';
      mockStorageGetSignedUrl.mockResolvedValueOnce(signedUrl);

      const committedObjectFile: PostFileRow = { ...sampleObjectFileRow, revision_id: revisionId };

      // findPostById
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // query for file by id and post_id
      mockQuery.mockResolvedValueOnce({ rows: [committedObjectFile], rowCount: 1 });

      const response = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}/files/${fileId}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toBe(signedUrl);
      expect(mockStorageGetSignedUrl).toHaveBeenCalledWith(committedObjectFile.storage_key);
    });

    it('returns 404 when post not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const response = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}/files/${fileId}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(404);
    });

    it('returns 404 when file not found', async () => {
      // findPostById
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // file query returns nothing
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const response = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}/files/${fileId}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(404);
    });

    it('uses application/octet-stream when committed inline file has null mime_type', async () => {
      const nullMimeFile: PostFileRow = {
        ...sampleCommittedFileRow,
        mime_type: null,
      };

      // findPostById
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // query for file
      mockQuery.mockResolvedValueOnce({ rows: [nullMimeFile], rowCount: 1 });

      const response = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}/files/${fileId}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('application/octet-stream');
    });

    it('returns 404 when committed file has neither inline content nor storage key', async () => {
      const orphanedFile: PostFileRow = {
        ...sampleCommittedFileRow,
        content: null,
        storage_key: null,
      };

      // findPostById
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // query for file
      mockQuery.mockResolvedValueOnce({ rows: [orphanedFile], rowCount: 1 });

      const response = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}/files/${fileId}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error).toBe('File content not available');
    });
  });

  // ─── DELETE /api/posts/:id/files/:fileId ───────────────────────────

  describe('DELETE /api/posts/:id/files/:fileId', () => {
    it('deletes a staged inline file and returns 204', async () => {
      // findPostById
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // findStagedFileById
      mockQuery.mockResolvedValueOnce({ rows: [sampleFileRow], rowCount: 1 });
      // deleteFileById
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/posts/${postId}/files/${fileId}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(204);
    });

    it('deletes a staged object-stored file from storage then DB', async () => {
      mockStorageDelete.mockResolvedValueOnce(undefined);

      // findPostById
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // findStagedFileById
      mockQuery.mockResolvedValueOnce({ rows: [sampleObjectFileRow], rowCount: 1 });
      // deleteFileById
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/posts/${postId}/files/${fileId}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(204);
      expect(mockStorageDelete).toHaveBeenCalledWith(sampleObjectFileRow.storage_key);
    });

    it('returns 401 without auth', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/posts/${postId}/files/${fileId}`,
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 404 when post not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/posts/${postId}/files/${fileId}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(404);
    });

    it('returns 403 when user does not own the post', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...samplePostRow, author_id: otherUserId }],
        rowCount: 1,
      });

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/posts/${postId}/files/${fileId}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(403);
    });

    it('returns 404 when staged file not found', async () => {
      // findPostById
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // findStagedFileById — no result
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/posts/${postId}/files/${fileId}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
