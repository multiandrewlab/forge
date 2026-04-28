import { describe, it, expect, beforeAll, afterAll, beforeEach, vi, type Mock } from 'vitest';

// Set env vars so app.ts registers the (mocked) storage plugin
process.env.MINIO_ACCESS_KEY = 'test-key';

// ---------------------------------------------------------------------------
// Module mocks — must come before any imports that touch the mocked modules
// ---------------------------------------------------------------------------

const mockWithTransaction = vi.fn();

vi.mock('../../db/connection.js', () => ({
  query: vi.fn(),
  withTransaction: (...args: unknown[]) => mockWithTransaction(...args),
}));

// Disable rate limiting in route tests
vi.mock('../../plugins/rate-limit.js', () => ({
  rateLimitPlugin: async () => {
    // no-op
  },
}));

// Mock findFeedPostById so we can control broadcast data in route tests
vi.mock('../../db/queries/feed.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../db/queries/feed.js')>();
  return {
    ...original,
    findFeedPostById: vi.fn(),
  };
});

// Mock the storage plugin to avoid real MinIO connections
const mockStorageCopy = vi.fn();
const mockStorageDelete = vi.fn();

vi.mock('../../plugins/storage.js', async () => {
  const fp = (await import('fastify-plugin')).default;
  return {
    storagePlugin: fp(async (fastify: { decorate: (name: string, value: unknown) => void }) => {
      fastify.decorate('storage', {
        upload: vi.fn(),
        copy: mockStorageCopy,
        getSignedUrl: vi.fn(),
        delete: mockStorageDelete,
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
import type { PostRow, PostRevisionRow, PostFileRow } from '../../db/queries/types.js';

const mockQuery = query as Mock;

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const userId = '660e8400-e29b-41d4-a716-446655440000';
const postId = '550e8400-e29b-41d4-a716-446655440000';
const revisionId = '770e8400-e29b-41d4-a716-446655440000';
const newRevisionId = '770e8400-e29b-41d4-a716-446655440001';
const fileId1 = 'aae08400-e29b-41d4-a716-446655440001';
const fileId2 = 'aae08400-e29b-41d4-a716-446655440002';
const fileId3 = 'aae08400-e29b-41d4-a716-446655440003';

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

const sampleRevisionRow: PostRevisionRow = {
  id: revisionId,
  post_id: postId,
  author_id: userId,
  content: 'console.log("hello");',
  message: 'Initial version',
  revision_number: 1,
  created_at: new Date('2026-01-01'),
};

const newRevisionRow: PostRevisionRow = {
  id: newRevisionId,
  post_id: postId,
  author_id: userId,
  content: 'console.log("updated");',
  message: 'File update',
  revision_number: 2,
  created_at: new Date('2026-01-02'),
};

const stagedInlineFile: PostFileRow = {
  id: fileId1,
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

const stagedObjectFile: PostFileRow = {
  id: fileId2,
  post_id: postId,
  revision_id: null,
  filename: 'photo.png',
  content: null,
  storage_key: `staging/${userId}/${fileId2}/photo.png`,
  mime_type: 'image/png',
  sort_order: 1,
  file_size: 100_000,
  created_at: new Date('2026-01-01'),
};

const committedFile: PostFileRow = {
  id: fileId3,
  post_id: postId,
  revision_id: revisionId,
  filename: 'existing.ts',
  content: 'const x = 1;',
  storage_key: null,
  mime_type: 'text/plain',
  sort_order: 0,
  file_size: 12,
  created_at: new Date('2026-01-01'),
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('POST /:id/revisions with file operations', () => {
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
    mockQuery.mockReset();
    mockWithTransaction.mockReset();
  });

  // ─── Backwards compatible: revision without files ────────────────────

  it('creates a revision without files (backwards compatible)', async () => {
    // findPostById
    mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
    // createRevisionAtomic
    mockQuery.mockResolvedValueOnce({ rows: [newRevisionRow], rowCount: 1 });
    // findFeedPostById (for broadcast) — return null to skip broadcast
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const response = await app.inject({
      method: 'POST',
      url: `/api/posts/${postId}/revisions`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        content: 'console.log("updated");',
        message: 'File update',
      },
    });

    expect(response.statusCode).toBe(201);
    const json = response.json();
    expect(json.revision).toBeDefined();
    expect(json.revision.content).toBe('console.log("updated");');
    // withTransaction should NOT be called for plain revisions
    expect(mockWithTransaction).not.toHaveBeenCalled();
  });

  // ─── Basic revision with stagedFileIds ──────────────────────────────

  it('creates a revision and commits staged inline files', async () => {
    // findPostById
    mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });

    // Mock withTransaction to execute the callback with a fake client
    const mockClient = { query: vi.fn() };
    mockWithTransaction.mockImplementation(async (fn: (client: typeof mockClient) => unknown) => {
      // Create revision
      mockClient.query.mockResolvedValueOnce({ rows: [newRevisionRow], rowCount: 1 });
      // Verify staged file (fileId1 belongs to postId and is staged)
      mockClient.query.mockResolvedValueOnce({ rows: [stagedInlineFile], rowCount: 1 });
      // Update staged file with revision_id
      mockClient.query.mockResolvedValueOnce({
        rows: [{ ...stagedInlineFile, revision_id: newRevisionId }],
        rowCount: 1,
      });
      // Get previous revision's files (for carry-forward) — empty since no prior revision with files
      mockClient.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      return fn(mockClient);
    });

    // findFeedPostById (for broadcast) — return null
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const response = await app.inject({
      method: 'POST',
      url: `/api/posts/${postId}/revisions`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        content: 'console.log("updated");',
        message: 'File update',
        stagedFileIds: [fileId1],
      },
    });

    expect(response.statusCode).toBe(201);
    expect(mockWithTransaction).toHaveBeenCalledTimes(1);
    const json = response.json();
    expect(json.revision).toBeDefined();
    expect(json.revision.id).toBe(newRevisionId);
  });

  // ─── Staged object file: copies storage key ─────────────────────────

  it('copies storage object from staging to permanent key for object-stored files', async () => {
    // findPostById
    mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });

    const expectedPermanentKey = `posts/${postId}/revisions/${newRevisionId}/photo.png`;
    const mockClient = { query: vi.fn() };
    mockWithTransaction.mockImplementation(async (fn: (client: typeof mockClient) => unknown) => {
      // Create revision
      mockClient.query.mockResolvedValueOnce({ rows: [newRevisionRow], rowCount: 1 });
      // Verify staged file
      mockClient.query.mockResolvedValueOnce({ rows: [stagedObjectFile], rowCount: 1 });
      // Update staged file with revision_id and new storage_key
      mockClient.query.mockResolvedValueOnce({
        rows: [
          { ...stagedObjectFile, revision_id: newRevisionId, storage_key: expectedPermanentKey },
        ],
        rowCount: 1,
      });
      // Get previous revision's files — empty
      mockClient.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      return fn(mockClient);
    });

    mockStorageCopy.mockResolvedValueOnce(undefined);

    // findFeedPostById — return null
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const response = await app.inject({
      method: 'POST',
      url: `/api/posts/${postId}/revisions`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        content: 'console.log("updated");',
        message: 'File update',
        stagedFileIds: [fileId2],
      },
    });

    expect(response.statusCode).toBe(201);
    expect(mockStorageCopy).toHaveBeenCalledWith(
      stagedObjectFile.storage_key,
      expectedPermanentKey,
    );
  });

  // ─── Carry-forward: files from previous revision ────────────────────

  it('carries forward files from previous revision that are not in removeFileIds', async () => {
    // findPostById
    mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });

    const mockClient = { query: vi.fn() };
    mockWithTransaction.mockImplementation(async (fn: (client: typeof mockClient) => unknown) => {
      // Create revision
      mockClient.query.mockResolvedValueOnce({ rows: [newRevisionRow], rowCount: 1 });
      // No staged files to process
      // Get previous revision ID (latest revision)
      mockClient.query.mockResolvedValueOnce({ rows: [sampleRevisionRow], rowCount: 1 });
      // Get previous revision's files
      mockClient.query.mockResolvedValueOnce({ rows: [committedFile], rowCount: 1 });
      // Carry forward: INSERT new row for committedFile with new revision_id
      mockClient.query.mockResolvedValueOnce({
        rows: [{ ...committedFile, id: 'new-carry-id', revision_id: newRevisionId }],
        rowCount: 1,
      });

      return fn(mockClient);
    });

    // findFeedPostById — return null
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const response = await app.inject({
      method: 'POST',
      url: `/api/posts/${postId}/revisions`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        content: 'console.log("updated");',
        message: 'File update',
        stagedFileIds: [],
        removeFileIds: [],
      },
    });

    expect(response.statusCode).toBe(201);
    expect(mockWithTransaction).toHaveBeenCalledTimes(1);
  });

  // ─── removeFileIds: excludes files from carry-forward ───────────────

  it('does not carry forward files listed in removeFileIds', async () => {
    // findPostById
    mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });

    const mockClient = { query: vi.fn() };
    let carryForwardInsertCount = 0;
    mockWithTransaction.mockImplementation(async (fn: (client: typeof mockClient) => unknown) => {
      mockClient.query.mockImplementation(async (sql: string, _params?: unknown[]) => {
        // Create revision
        if (sql.includes('INSERT INTO post_revisions')) {
          return { rows: [newRevisionRow], rowCount: 1 };
        }
        // Get latest revision for previous files
        if (sql.includes('FROM post_revisions') && sql.includes('ORDER BY')) {
          return { rows: [sampleRevisionRow], rowCount: 1 };
        }
        // Get previous revision's files
        if (sql.includes('FROM post_files') && sql.includes('revision_id = $1')) {
          return { rows: [committedFile], rowCount: 1 };
        }
        // Carry forward INSERT
        if (sql.includes('INSERT INTO post_files')) {
          carryForwardInsertCount++;
          return { rows: [{ ...committedFile, revision_id: newRevisionId }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      });

      return fn(mockClient);
    });

    // findFeedPostById — return null
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const response = await app.inject({
      method: 'POST',
      url: `/api/posts/${postId}/revisions`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        content: 'console.log("updated");',
        message: 'File update',
        removeFileIds: [fileId3], // Remove the committed file
      },
    });

    expect(response.statusCode).toBe(201);
    // The committed file (fileId3) should NOT be carried forward
    expect(carryForwardInsertCount).toBe(0);
  });

  // ─── Cross-post protection ──────────────────────────────────────────

  it('rejects staged file that belongs to a different post', async () => {
    // findPostById
    mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });

    const mockClient = { query: vi.fn() };
    mockWithTransaction.mockImplementation(async (fn: (client: typeof mockClient) => unknown) => {
      // Create revision
      mockClient.query.mockResolvedValueOnce({ rows: [newRevisionRow], rowCount: 1 });
      // Verify staged file — NOT FOUND (file belongs to different post)
      mockClient.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      return fn(mockClient);
    });

    const response = await app.inject({
      method: 'POST',
      url: `/api/posts/${postId}/revisions`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        content: 'console.log("updated");',
        message: 'File update',
        stagedFileIds: [fileId1], // This file belongs to otherPostId
      },
    });

    expect(response.statusCode).toBe(400);
    const json = response.json();
    expect(json.error).toMatch(/staged file/i);
  });

  // ─── Post-transaction cleanup: deletes staging objects ──────────────

  it('deletes staging storage objects after transaction commits (best-effort)', async () => {
    // findPostById
    mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });

    const mockClient = { query: vi.fn() };
    mockWithTransaction.mockImplementation(async (fn: (client: typeof mockClient) => unknown) => {
      // Create revision
      mockClient.query.mockResolvedValueOnce({ rows: [newRevisionRow], rowCount: 1 });
      // Verify staged object file
      mockClient.query.mockResolvedValueOnce({ rows: [stagedObjectFile], rowCount: 1 });
      // Update staged file
      mockClient.query.mockResolvedValueOnce({
        rows: [{ ...stagedObjectFile, revision_id: newRevisionId }],
        rowCount: 1,
      });
      // Previous revision files — empty
      mockClient.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      return fn(mockClient);
    });

    mockStorageCopy.mockResolvedValueOnce(undefined);
    mockStorageDelete.mockResolvedValueOnce(undefined);

    // findFeedPostById — return null
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const response = await app.inject({
      method: 'POST',
      url: `/api/posts/${postId}/revisions`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        content: 'console.log("updated");',
        message: 'File update',
        stagedFileIds: [fileId2],
      },
    });

    expect(response.statusCode).toBe(201);
    // After transaction, staging key should be deleted (best-effort)
    expect(mockStorageDelete).toHaveBeenCalledWith(stagedObjectFile.storage_key);
  });

  // ─── 5c: Transaction rollback deletes copied storage objects ────────

  it('deletes copied storage objects when transaction rolls back', async () => {
    // findPostById
    mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });

    const expectedPermanentKey = `posts/${postId}/revisions/${newRevisionId}/photo.png`;
    const mockClient = { query: vi.fn() };
    mockWithTransaction.mockImplementation(async (fn: (client: typeof mockClient) => unknown) => {
      // Create revision
      mockClient.query.mockResolvedValueOnce({ rows: [newRevisionRow], rowCount: 1 });
      // Verify staged object file
      mockClient.query.mockResolvedValueOnce({ rows: [stagedObjectFile], rowCount: 1 });
      // storage.copy succeeds — but then the DB update throws
      mockStorageCopy.mockResolvedValueOnce(undefined);
      // DB update throws (simulates a later failure inside the transaction)
      mockClient.query.mockRejectedValueOnce(new Error('DB constraint violation'));

      return fn(mockClient);
    });

    const response = await app.inject({
      method: 'POST',
      url: `/api/posts/${postId}/revisions`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        content: 'console.log("updated");',
        message: 'File update',
        stagedFileIds: [fileId2],
      },
    });

    // Transaction failure should result in a 500
    expect(response.statusCode).toBe(500);
    // The copied permanent key should be deleted (compensation)
    expect(mockStorageDelete).toHaveBeenCalledWith(expectedPermanentKey);
  });

  it('still throws original error when compensation storage.delete fails', async () => {
    // findPostById
    mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });

    const mockClient = { query: vi.fn() };
    mockWithTransaction.mockImplementation(async (fn: (client: typeof mockClient) => unknown) => {
      // Create revision
      mockClient.query.mockResolvedValueOnce({ rows: [newRevisionRow], rowCount: 1 });
      // Verify staged object file
      mockClient.query.mockResolvedValueOnce({ rows: [stagedObjectFile], rowCount: 1 });
      // storage.copy succeeds
      mockStorageCopy.mockResolvedValueOnce(undefined);
      // DB update throws (simulates failure after copy)
      mockClient.query.mockRejectedValueOnce(new Error('DB constraint violation'));

      return fn(mockClient);
    });

    // Compensation storage.delete ALSO fails (best-effort — must not mask original error)
    mockStorageDelete.mockRejectedValueOnce(new Error('Storage unavailable'));

    const response = await app.inject({
      method: 'POST',
      url: `/api/posts/${postId}/revisions`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        content: 'console.log("updated");',
        message: 'File update',
        stagedFileIds: [fileId2],
      },
    });

    // Original DB error should still propagate as 500, not masked by storage failure
    expect(response.statusCode).toBe(500);
    expect(mockStorageDelete).toHaveBeenCalled();
  });

  // ─── Best-effort: staging delete failure does not fail request ──────

  it('succeeds even if staging delete fails (best-effort cleanup)', async () => {
    // findPostById
    mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });

    const mockClient = { query: vi.fn() };
    mockWithTransaction.mockImplementation(async (fn: (client: typeof mockClient) => unknown) => {
      // Create revision
      mockClient.query.mockResolvedValueOnce({ rows: [newRevisionRow], rowCount: 1 });
      // Verify staged object file
      mockClient.query.mockResolvedValueOnce({ rows: [stagedObjectFile], rowCount: 1 });
      // Update staged file
      mockClient.query.mockResolvedValueOnce({
        rows: [{ ...stagedObjectFile, revision_id: newRevisionId }],
        rowCount: 1,
      });
      // Previous revision files — empty
      mockClient.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      return fn(mockClient);
    });

    mockStorageCopy.mockResolvedValueOnce(undefined);
    // Simulate delete failure
    mockStorageDelete.mockRejectedValueOnce(new Error('S3 delete failed'));

    // findFeedPostById — return null
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const response = await app.inject({
      method: 'POST',
      url: `/api/posts/${postId}/revisions`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        content: 'console.log("updated");',
        message: 'File update',
        stagedFileIds: [fileId2],
      },
    });

    // Request should still succeed despite delete failure
    expect(response.statusCode).toBe(201);
  });
});
