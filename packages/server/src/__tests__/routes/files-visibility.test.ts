import { describe, it, expect, beforeAll, afterAll, beforeEach, vi, type Mock } from 'vitest';

// Set env so app.ts registers the (mocked) storage plugin
process.env.MINIO_ACCESS_KEY = 'test-key';

// ---------------------------------------------------------------------------
// Module mocks — must come before any imports that touch the mocked modules
// ---------------------------------------------------------------------------

vi.mock('../../db/connection.js', () => ({
  query: vi.fn(),
}));

vi.mock('../../plugins/rate-limit.js', () => ({
  rateLimitPlugin: async () => {
    // no-op
  },
}));

// Mock the storage plugin to avoid real MinIO connections
vi.mock('../../plugins/storage.js', async () => {
  const fp = (await import('fastify-plugin')).default;
  return {
    storagePlugin: fp(async (fastify: { decorate: (name: string, value: unknown) => void }) => {
      fastify.decorate('storage', {
        upload: vi.fn(),
        copy: vi.fn(),
        getSignedUrl: vi.fn(),
        delete: vi.fn(),
        exists: vi.fn(),
      });
    }),
  };
});

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { query } from '../../db/connection.js';
import { buildApp } from '../../app.js';
import type { FastifyInstance } from 'fastify';
import type { PostRow, PostFileRow } from '../../db/queries/types.js';

const mockQuery = query as Mock;

// ---------------------------------------------------------------------------
// Fixtures (anchored to scripts/seed.sql)
// ---------------------------------------------------------------------------

const ownerId = 'a0000000-0000-0000-0000-000000000003'; // carol
const nonOwnerId = 'a0000000-0000-0000-0000-000000000099'; // testuser

const privatePostId = 'c0000000-0000-0000-0000-000000000006'; // carol's private
const publicPostId = 'c0000000-0000-0000-0000-000000000099'; // testuser public

const publicFileId = 'aae08400-e29b-41d4-a716-446655440099';
const privateFileId = 'aae08400-e29b-41d4-a716-446655440006';

const publicRevisionId = 'd0000000-0000-0000-0000-000000000099';

const privatePostRow: PostRow = {
  id: privatePostId,
  author_id: ownerId,
  title: 'My Kubernetes Notes',
  content_type: 'document',
  language: null,
  visibility: 'private',
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

const publicPostRow: PostRow = {
  id: publicPostId,
  author_id: nonOwnerId,
  title: 'Test Fixture Post (testuser-owned)',
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

const publicCommittedFileRow: PostFileRow = {
  id: publicFileId,
  post_id: publicPostId,
  revision_id: publicRevisionId,
  filename: 'hello.ts',
  content: 'console.log("hello");',
  storage_key: null,
  mime_type: 'text/plain',
  sort_order: 0,
  file_size: 21,
  created_at: new Date('2026-01-01'),
};

// ---------------------------------------------------------------------------
// Test suite — 4 cells × 2 routes = 8 tests
// ---------------------------------------------------------------------------

describe('files visibility', () => {
  let app: FastifyInstance;
  let ownerToken: string;
  let nonOwnerToken: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    ownerToken = app.jwt.sign({
      id: ownerId,
      email: 'carol@example.com',
      displayName: 'Carol Davis',
    });
    nonOwnerToken = app.jwt.sign({
      id: nonOwnerId,
      email: 'testuser@example.com',
      displayName: 'Test User',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── GET /api/posts/:id/files ──────────────────────────────────────

  describe('GET /api/posts/:id/files', () => {
    it('returns 401 when no token is provided', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/posts/${privatePostId}/files?revisionId=${publicRevisionId}`,
      });
      expect(res.statusCode).toBe(401);
    });

    it('returns 200 to authenticated caller for public post', async () => {
      // findPostById
      mockQuery.mockResolvedValueOnce({ rows: [publicPostRow], rowCount: 1 });
      // revision-to-post association check
      mockQuery.mockResolvedValueOnce({ rows: [{ post_id: publicPostId }], rowCount: 1 });
      // findFilesByRevisionId
      mockQuery.mockResolvedValueOnce({ rows: [publicCommittedFileRow], rowCount: 1 });

      const res = await app.inject({
        method: 'GET',
        url: `/api/posts/${publicPostId}/files?revisionId=${publicRevisionId}`,
        headers: { authorization: `Bearer ${nonOwnerToken}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it('returns 200 to private-post owner', async () => {
      // findPostById
      mockQuery.mockResolvedValueOnce({ rows: [privatePostRow], rowCount: 1 });
      // findStagedFilesByPostId (no revisionId query → staged-files branch, owner-only)
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const res = await app.inject({
        method: 'GET',
        url: `/api/posts/${privatePostId}/files`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it('returns 403 to private-post non-owner with descriptive message', async () => {
      // findPostById
      mockQuery.mockResolvedValueOnce({ rows: [privatePostRow], rowCount: 1 });

      const res = await app.inject({
        method: 'GET',
        url: `/api/posts/${privatePostId}/files`,
        headers: { authorization: `Bearer ${nonOwnerToken}` },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json()).toEqual({ error: 'This post is private' });
    });
  });

  // ─── GET /api/posts/:id/files/:fileId ──────────────────────────────

  describe('GET /api/posts/:id/files/:fileId', () => {
    it('returns 401 when no token is provided', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/posts/${privatePostId}/files/${privateFileId}`,
      });
      expect(res.statusCode).toBe(401);
    });

    it('returns 200 to authenticated caller for public post', async () => {
      // findPostById
      mockQuery.mockResolvedValueOnce({ rows: [publicPostRow], rowCount: 1 });
      // SELECT * FROM post_files WHERE id = $1 AND post_id = $2
      mockQuery.mockResolvedValueOnce({ rows: [publicCommittedFileRow], rowCount: 1 });

      const res = await app.inject({
        method: 'GET',
        url: `/api/posts/${publicPostId}/files/${publicFileId}`,
        headers: { authorization: `Bearer ${nonOwnerToken}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it('returns 200 to private-post owner', async () => {
      const privateCommittedFile: PostFileRow = {
        ...publicCommittedFileRow,
        id: privateFileId,
        post_id: privatePostId,
      };

      // findPostById
      mockQuery.mockResolvedValueOnce({ rows: [privatePostRow], rowCount: 1 });
      // file lookup
      mockQuery.mockResolvedValueOnce({ rows: [privateCommittedFile], rowCount: 1 });

      const res = await app.inject({
        method: 'GET',
        url: `/api/posts/${privatePostId}/files/${privateFileId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it('returns 403 to private-post non-owner with descriptive message', async () => {
      // findPostById — visibility check fires BEFORE file lookup, so file row need not exist
      mockQuery.mockResolvedValueOnce({ rows: [privatePostRow], rowCount: 1 });

      const res = await app.inject({
        method: 'GET',
        url: `/api/posts/${privatePostId}/files/${privateFileId}`,
        headers: { authorization: `Bearer ${nonOwnerToken}` },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json()).toEqual({ error: 'This post is private' });
    });
  });
});
