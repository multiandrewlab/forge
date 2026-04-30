import { describe, it, expect, beforeAll, afterAll, beforeEach, vi, type Mock } from 'vitest';

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

// Mock findFeedPostById so we can control broadcast data in route tests
vi.mock('../../db/queries/feed.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../db/queries/feed.js')>();
  return {
    ...original,
    findFeedPostById: vi.fn(),
  };
});

// Mock post-files queries so we can verify file carry-forward during fork
vi.mock('../../db/queries/post-files.js', () => ({
  findFilesByRevisionId: vi.fn(),
  createPostFile: vi.fn(),
  findStagedFilesByPostId: vi.fn(),
  findStagedFileById: vi.fn(),
  getNextSortOrder: vi.fn(),
  setStagedFileRevision: vi.fn(),
  carryForwardFile: vi.fn(),
  deleteFileById: vi.fn(),
  cleanupStagedFiles: vi.fn(),
}));

// Mock revisions queries so we can control findRevisionsByPostId
vi.mock('../../db/queries/revisions.js', () => ({
  findRevisionsByPostId: vi.fn(),
  findRevisionsWithAuthorByPostId: vi.fn(),
  findRevision: vi.fn(),
  createRevision: vi.fn(),
  createRevisionAtomic: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { query } from '../../db/connection.js';
import { buildApp } from '../../app.js';
import { findFeedPostById } from '../../db/queries/feed.js';
import { findFilesByRevisionId, createPostFile } from '../../db/queries/post-files.js';
import { findRevisionsByPostId, createRevision } from '../../db/queries/revisions.js';
import type { FastifyInstance } from 'fastify';
import type {
  PostRow,
  PostRevisionRow,
  PostFileRow,
  PostWithRevisionRow,
} from '../../db/queries/types.js';
import type { PostWithAuthorRow } from '../../db/queries/feed.js';

const mockQuery = query as Mock;
const mockFindFeedPostById = findFeedPostById as Mock;
const mockFindFilesByRevisionId = findFilesByRevisionId as Mock;
const mockCreatePostFile = createPostFile as Mock;
const mockFindRevisionsByPostId = findRevisionsByPostId as Mock;
const mockCreateRevision = createRevision as Mock;

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const userId = '660e8400-e29b-41d4-a716-446655440000';
const otherUserId = '990e8400-e29b-41d4-a716-446655440000';
const sourcePostId = '550e8400-e29b-41d4-a716-446655440000';
const forkedPostId = 'ff0e8400-e29b-41d4-a716-446655440000';
const sourceRevisionId = '770e8400-e29b-41d4-a716-446655440000';
const forkedRevisionId = '880e8400-e29b-41d4-a716-446655440000';

const sourcePostRow: PostRow = {
  id: sourcePostId,
  author_id: otherUserId,
  title: 'Source Post',
  content_type: 'snippet',
  language: 'typescript',
  visibility: 'public',
  is_draft: false,
  forked_from_id: null,
  link_url: null,
  link_preview: null,
  vote_count: 5,
  view_count: 100,
  search_vector: null,
  deleted_at: null,
  created_at: new Date('2026-01-01'),
  updated_at: new Date('2026-01-01'),
};

const sourceWithRevisionRow: PostWithRevisionRow = {
  ...sourcePostRow,
  revision_id: sourceRevisionId,
  content: 'console.log("hello");',
  revision_number: 1,
  message: 'Initial version',
  tags: null,
};

const sourceRevisionRow: PostRevisionRow = {
  id: sourceRevisionId,
  post_id: sourcePostId,
  author_id: otherUserId,
  content: 'console.log("hello");',
  message: 'Initial version',
  revision_number: 1,
  created_at: new Date('2026-01-01'),
};

const forkedPostRow: PostRow = {
  id: forkedPostId,
  author_id: userId,
  title: 'Source Post',
  content_type: 'snippet',
  language: 'typescript',
  visibility: 'private',
  is_draft: true,
  forked_from_id: sourcePostId,
  link_url: null,
  link_preview: null,
  vote_count: 0,
  view_count: 0,
  search_vector: null,
  deleted_at: null,
  created_at: new Date('2026-01-02'),
  updated_at: new Date('2026-01-02'),
};

const forkedRevisionRow: PostRevisionRow = {
  id: forkedRevisionId,
  post_id: forkedPostId,
  author_id: userId,
  content: 'console.log("hello");',
  message: `Forked from Source Post`,
  revision_number: 1,
  created_at: new Date('2026-01-02'),
};

const sampleFileRow1: PostFileRow = {
  id: 'aae08400-e29b-41d4-a716-446655440001',
  post_id: sourcePostId,
  revision_id: sourceRevisionId,
  filename: 'main.ts',
  content: 'const x = 1;',
  storage_key: 'posts/source/rev1/main.ts',
  mime_type: 'text/typescript',
  sort_order: 0,
  file_size: 14,
  created_at: new Date('2026-01-01'),
};

const sampleFileRow2: PostFileRow = {
  id: 'aae08400-e29b-41d4-a716-446655440002',
  post_id: sourcePostId,
  revision_id: sourceRevisionId,
  filename: 'utils.ts',
  content: null,
  storage_key: 'posts/source/rev1/utils.ts',
  mime_type: 'text/typescript',
  sort_order: 1,
  file_size: 256,
  created_at: new Date('2026-01-01'),
};

const sampleFeedRow: PostWithAuthorRow = {
  ...forkedPostRow,
  author_display_name: 'Test User',
  author_avatar_url: null,
  tags: '',
  fork_count: 0,
  forked_from_title: 'Source Post',
};

// ---------------------------------------------------------------------------
// Helper: set up the common mock sequence for a successful fork
// ---------------------------------------------------------------------------

function setupSuccessfulForkMocks(files: PostFileRow[]): void {
  // 1. findPostById (source post)
  mockQuery.mockResolvedValueOnce({ rows: [sourcePostRow], rowCount: 1 });
  // 2. findPostWithLatestRevision (source with revision)
  mockQuery.mockResolvedValueOnce({ rows: [sourceWithRevisionRow], rowCount: 1 });
  // 3. createForkedPost
  mockQuery.mockResolvedValueOnce({ rows: [forkedPostRow], rowCount: 1 });
  // 4. createRevision (initial revision for fork)
  mockCreateRevision.mockResolvedValueOnce(forkedRevisionRow);
  // 5. findRevisionsByPostId (source post's revisions — for file carry-forward)
  mockFindRevisionsByPostId.mockResolvedValueOnce([sourceRevisionRow]);
  // 6. findFilesByRevisionId (source revision's files)
  mockFindFilesByRevisionId.mockResolvedValueOnce(files);
  // 7. createPostFile for each file
  for (const file of files) {
    mockCreatePostFile.mockResolvedValueOnce({
      ...file,
      id: `new-${file.id}`,
      post_id: forkedPostId,
      revision_id: forkedRevisionId,
    });
  }
  // 8. query for tags from source post
  mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
  // 9. findFeedPostById for broadcast
  mockFindFeedPostById.mockResolvedValueOnce(sampleFeedRow);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/posts/:id/fork — file carry-forward', () => {
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

  it('copies files from source post latest revision to forked post with shared storage keys', async () => {
    setupSuccessfulForkMocks([sampleFileRow1, sampleFileRow2]);

    const response = await app.inject({
      method: 'POST',
      url: `/api/posts/${sourcePostId}/fork`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(201);

    // Verify findRevisionsByPostId was called with the source post ID
    expect(mockFindRevisionsByPostId).toHaveBeenCalledWith(sourcePostId);

    // Verify findFilesByRevisionId was called with the source revision ID
    expect(mockFindFilesByRevisionId).toHaveBeenCalledWith(sourceRevisionId);

    // Verify createPostFile was called for each source file with shared storage_key
    expect(mockCreatePostFile).toHaveBeenCalledTimes(2);

    expect(mockCreatePostFile).toHaveBeenCalledWith({
      postId: forkedPostId,
      revisionId: forkedRevisionId,
      filename: 'main.ts',
      content: 'const x = 1;',
      storageKey: 'posts/source/rev1/main.ts',
      mimeType: 'text/typescript',
      fileSize: 14,
      sortOrder: 0,
    });

    expect(mockCreatePostFile).toHaveBeenCalledWith({
      postId: forkedPostId,
      revisionId: forkedRevisionId,
      filename: 'utils.ts',
      content: null,
      storageKey: 'posts/source/rev1/utils.ts',
      mimeType: 'text/typescript',
      fileSize: 256,
      sortOrder: 1,
    });
  });

  it('forks a post with no files without calling createPostFile', async () => {
    // 1. findPostById (source post)
    mockQuery.mockResolvedValueOnce({ rows: [sourcePostRow], rowCount: 1 });
    // 2. findPostWithLatestRevision (source with revision)
    mockQuery.mockResolvedValueOnce({ rows: [sourceWithRevisionRow], rowCount: 1 });
    // 3. createForkedPost
    mockQuery.mockResolvedValueOnce({ rows: [forkedPostRow], rowCount: 1 });
    // 4. createRevision
    mockCreateRevision.mockResolvedValueOnce(forkedRevisionRow);
    // 5. findRevisionsByPostId — source has revisions
    mockFindRevisionsByPostId.mockResolvedValueOnce([sourceRevisionRow]);
    // 6. findFilesByRevisionId — no files
    mockFindFilesByRevisionId.mockResolvedValueOnce([]);
    // 7. query for tags
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    // 8. findFeedPostById for broadcast
    mockFindFeedPostById.mockResolvedValueOnce(sampleFeedRow);

    const response = await app.inject({
      method: 'POST',
      url: `/api/posts/${sourcePostId}/fork`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(201);
    expect(mockFindRevisionsByPostId).toHaveBeenCalledWith(sourcePostId);
    expect(mockFindFilesByRevisionId).toHaveBeenCalledWith(sourceRevisionId);
    expect(mockCreatePostFile).not.toHaveBeenCalled();
  });

  it('handles source post with no revisions gracefully (no file copy attempt)', async () => {
    // 1. findPostById (source post)
    mockQuery.mockResolvedValueOnce({ rows: [sourcePostRow], rowCount: 1 });
    // 2. findPostWithLatestRevision (source with revision)
    mockQuery.mockResolvedValueOnce({ rows: [sourceWithRevisionRow], rowCount: 1 });
    // 3. createForkedPost
    mockQuery.mockResolvedValueOnce({ rows: [forkedPostRow], rowCount: 1 });
    // 4. createRevision
    mockCreateRevision.mockResolvedValueOnce(forkedRevisionRow);
    // 5. findRevisionsByPostId — no revisions (edge case)
    mockFindRevisionsByPostId.mockResolvedValueOnce([]);
    // 6. query for tags
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    // 7. findFeedPostById for broadcast
    mockFindFeedPostById.mockResolvedValueOnce(sampleFeedRow);

    const response = await app.inject({
      method: 'POST',
      url: `/api/posts/${sourcePostId}/fork`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(201);
    expect(mockFindRevisionsByPostId).toHaveBeenCalledWith(sourcePostId);
    expect(mockFindFilesByRevisionId).not.toHaveBeenCalled();
    expect(mockCreatePostFile).not.toHaveBeenCalled();
  });

  it('preserves inline content and null storage_key when forking files', async () => {
    const inlineOnlyFile: PostFileRow = {
      id: 'aae08400-e29b-41d4-a716-446655440003',
      post_id: sourcePostId,
      revision_id: sourceRevisionId,
      filename: 'inline.txt',
      content: 'This is inline content',
      storage_key: null,
      mime_type: 'text/plain',
      sort_order: 0,
      file_size: null,
      created_at: new Date('2026-01-01'),
    };

    setupSuccessfulForkMocks([inlineOnlyFile]);

    const response = await app.inject({
      method: 'POST',
      url: `/api/posts/${sourcePostId}/fork`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(201);

    expect(mockCreatePostFile).toHaveBeenCalledTimes(1);
    expect(mockCreatePostFile).toHaveBeenCalledWith({
      postId: forkedPostId,
      revisionId: forkedRevisionId,
      filename: 'inline.txt',
      content: 'This is inline content',
      storageKey: null,
      mimeType: 'text/plain',
      fileSize: null,
      sortOrder: 0,
    });
  });
});
