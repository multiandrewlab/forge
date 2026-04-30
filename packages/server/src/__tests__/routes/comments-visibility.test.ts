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
import type { PostRow } from '../../db/queries/types.js';

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

describe('comments visibility', () => {
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

  describe('GET /api/posts/:id/comments', () => {
    it('returns 401 when no token is provided', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/posts/${privatePostId}/comments`,
      });
      expect(res.statusCode).toBe(401);
    });

    it('returns 200 to authenticated caller for public post', async () => {
      // findPostById
      mockQuery.mockResolvedValueOnce({ rows: [publicPostRow], rowCount: 1 });
      // findCommentsByPostIdWithAuthor
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const res = await app.inject({
        method: 'GET',
        url: `/api/posts/${publicPostId}/comments`,
        headers: { authorization: `Bearer ${nonOwnerToken}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it('returns 200 to private-post owner', async () => {
      // findPostById
      mockQuery.mockResolvedValueOnce({ rows: [privatePostRow], rowCount: 1 });
      // findCommentsByPostIdWithAuthor
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const res = await app.inject({
        method: 'GET',
        url: `/api/posts/${privatePostId}/comments`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it('returns 403 to private-post non-owner', async () => {
      // findPostById
      mockQuery.mockResolvedValueOnce({ rows: [privatePostRow], rowCount: 1 });
      const res = await app.inject({
        method: 'GET',
        url: `/api/posts/${privatePostId}/comments`,
        headers: { authorization: `Bearer ${nonOwnerToken}` },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json()).toEqual({ error: 'This post is private' });
    });
  });
});
