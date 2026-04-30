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
import type {
  PostRow,
  PostRevisionRow,
  PostRevisionWithAuthorRow,
  PostWithRevisionRow,
} from '../../db/queries/types.js';

const mockQuery = query as Mock;

const ownerId = 'a0000000-0000-0000-0000-000000000003';
const nonOwnerId = 'a0000000-0000-0000-0000-000000000099';
const privatePostId = 'c0000000-0000-0000-0000-000000000006';
const publicPostId = 'c0000000-0000-0000-0000-000000000099';

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
  view_count: 10,
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

const privatePostWithRevision: PostWithRevisionRow = {
  ...privatePostRow,
  revision_id: 'd0000000-0000-0000-0000-000000000007',
  content: '# Kubernetes Notes',
  revision_number: 1,
  message: 'Initial version',
};

const publicPostWithRevision: PostWithRevisionRow = {
  ...publicPostRow,
  revision_id: 'd0000000-0000-0000-0000-000000000099',
  content: 'const testFixture: string = "hello";',
  revision_number: 1,
  message: 'Initial version',
};

const privateRevisionRow: PostRevisionRow = {
  id: 'd0000000-0000-0000-0000-000000000007',
  post_id: privatePostId,
  author_id: ownerId,
  content: '# Kubernetes Notes',
  message: 'Initial version',
  revision_number: 1,
  created_at: new Date('2026-01-01'),
};

const publicRevisionRow: PostRevisionRow = {
  id: 'd0000000-0000-0000-0000-000000000099',
  post_id: publicPostId,
  author_id: nonOwnerId,
  content: 'const testFixture: string = "hello";',
  message: 'Initial version',
  revision_number: 1,
  created_at: new Date('2026-01-01'),
};

const privateRevisionWithAuthor: PostRevisionWithAuthorRow = {
  ...privateRevisionRow,
  author_display_name: 'Carol Davis',
  author_avatar_url: null,
};

const publicRevisionWithAuthor: PostRevisionWithAuthorRow = {
  ...publicRevisionRow,
  author_display_name: 'Test User',
  author_avatar_url: null,
};

describe('posts visibility', () => {
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

  // ─── GET /api/posts/:id ────────────────────────────────────────────

  describe('GET /api/posts/:id', () => {
    it('returns 401 when no token is provided', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/posts/${privatePostId}`,
      });
      expect(res.statusCode).toBe(401);
    });

    it('returns 200 to authenticated caller for public post', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [publicPostWithRevision], rowCount: 1 });
      const res = await app.inject({
        method: 'GET',
        url: `/api/posts/${publicPostId}`,
        headers: { authorization: `Bearer ${nonOwnerToken}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it('returns 200 to private-post owner', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [privatePostWithRevision], rowCount: 1 });
      const res = await app.inject({
        method: 'GET',
        url: `/api/posts/${privatePostId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it('returns 403 to private-post non-owner with descriptive message', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [privatePostWithRevision], rowCount: 1 });
      const res = await app.inject({
        method: 'GET',
        url: `/api/posts/${privatePostId}`,
        headers: { authorization: `Bearer ${nonOwnerToken}` },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json()).toEqual({ error: 'This post is private' });
    });
  });

  // ─── GET /api/posts/:id/revisions ──────────────────────────────────

  describe('GET /api/posts/:id/revisions', () => {
    it('returns 401 when no token is provided', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/posts/${privatePostId}/revisions`,
      });
      expect(res.statusCode).toBe(401);
    });

    it('returns 200 to authenticated caller for public post', async () => {
      // findPostById
      mockQuery.mockResolvedValueOnce({ rows: [publicPostRow], rowCount: 1 });
      // findRevisionsWithAuthorByPostId
      mockQuery.mockResolvedValueOnce({ rows: [publicRevisionWithAuthor], rowCount: 1 });
      const res = await app.inject({
        method: 'GET',
        url: `/api/posts/${publicPostId}/revisions`,
        headers: { authorization: `Bearer ${nonOwnerToken}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it('returns 200 to private-post owner', async () => {
      // findPostById
      mockQuery.mockResolvedValueOnce({ rows: [privatePostRow], rowCount: 1 });
      // findRevisionsWithAuthorByPostId
      mockQuery.mockResolvedValueOnce({ rows: [privateRevisionWithAuthor], rowCount: 1 });
      const res = await app.inject({
        method: 'GET',
        url: `/api/posts/${privatePostId}/revisions`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it('returns 403 to private-post non-owner', async () => {
      // findPostById
      mockQuery.mockResolvedValueOnce({ rows: [privatePostRow], rowCount: 1 });
      const res = await app.inject({
        method: 'GET',
        url: `/api/posts/${privatePostId}/revisions`,
        headers: { authorization: `Bearer ${nonOwnerToken}` },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json()).toEqual({ error: 'This post is private' });
    });
  });

  // ─── GET /api/posts/:id/revisions/:rev ─────────────────────────────

  describe('GET /api/posts/:id/revisions/:rev', () => {
    it('returns 401 when no token is provided', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/posts/${privatePostId}/revisions/1`,
      });
      expect(res.statusCode).toBe(401);
    });

    it('returns 200 to authenticated caller for public post', async () => {
      // findPostById
      mockQuery.mockResolvedValueOnce({ rows: [publicPostRow], rowCount: 1 });
      // findRevision
      mockQuery.mockResolvedValueOnce({ rows: [publicRevisionRow], rowCount: 1 });
      const res = await app.inject({
        method: 'GET',
        url: `/api/posts/${publicPostId}/revisions/1`,
        headers: { authorization: `Bearer ${nonOwnerToken}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it('returns 200 to private-post owner', async () => {
      // findPostById
      mockQuery.mockResolvedValueOnce({ rows: [privatePostRow], rowCount: 1 });
      // findRevision
      mockQuery.mockResolvedValueOnce({ rows: [privateRevisionRow], rowCount: 1 });
      const res = await app.inject({
        method: 'GET',
        url: `/api/posts/${privatePostId}/revisions/1`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it('returns 403 to private-post non-owner', async () => {
      // findPostById
      mockQuery.mockResolvedValueOnce({ rows: [privatePostRow], rowCount: 1 });
      const res = await app.inject({
        method: 'GET',
        url: `/api/posts/${privatePostId}/revisions/1`,
        headers: { authorization: `Bearer ${nonOwnerToken}` },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json()).toEqual({ error: 'This post is private' });
    });
  });
});
