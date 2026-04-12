import { describe, it, expect, beforeAll, afterAll, beforeEach, vi, type Mock } from 'vitest';

vi.mock('../../db/connection.js', () => ({
  query: vi.fn(),
}));

// Disable rate limiting in route tests
vi.mock('../../plugins/rate-limit.js', () => ({
  rateLimitPlugin: async () => {
    // no-op
  },
}));

import { query } from '../../db/connection.js';
import { buildApp } from '../../app.js';
import type { FastifyInstance } from 'fastify';
import type { PostRow, PostRevisionRow, PostWithRevisionRow } from '../../db/queries/types.js';

const mockQuery = query as Mock;

const userId = '660e8400-e29b-41d4-a716-446655440000';
const otherUserId = '990e8400-e29b-41d4-a716-446655440000';
const postId = '550e8400-e29b-41d4-a716-446655440000';

const samplePostRow: PostRow = {
  id: postId,
  author_id: userId,
  title: 'Hello World',
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

const sampleRevisionRow: PostRevisionRow = {
  id: '770e8400-e29b-41d4-a716-446655440000',
  post_id: postId,
  author_id: userId,
  content: 'console.log("hello");',
  message: 'Initial version',
  revision_number: 1,
  created_at: new Date('2026-01-01'),
};

const samplePostWithRevisionRow: PostWithRevisionRow = {
  ...samplePostRow,
  revision_id: '880e8400-e29b-41d4-a716-446655440000',
  content: 'console.log("hello");',
  revision_number: 1,
  message: 'Initial version',
};

describe('post routes', () => {
  let app: FastifyInstance;
  let token: string;
  let otherToken: string;

  beforeAll(async () => {
    app = await buildApp();
    token = app.jwt.sign({ id: userId, email: 'test@example.com', displayName: 'Test User' });
    otherToken = app.jwt.sign({
      id: otherUserId,
      email: 'other@example.com',
      displayName: 'Other User',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── POST /api/posts ───────────────────────────────────────────────

  describe('POST /api/posts', () => {
    const validPayload = {
      title: 'Hello World',
      contentType: 'snippet',
      language: 'typescript',
      visibility: 'public',
      content: 'console.log("hello");',
    };

    it('creates a post with initial revision and returns 201', async () => {
      // createPost query
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // createRevision query
      mockQuery.mockResolvedValueOnce({ rows: [sampleRevisionRow], rowCount: 1 });

      const response = await app.inject({
        method: 'POST',
        url: '/api/posts',
        headers: { authorization: `Bearer ${token}` },
        payload: validPayload,
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.post.title).toBe('Hello World');
      expect(body.post.authorId).toBe(userId);
      expect(body.revision.content).toBe('console.log("hello");');
      expect(body.revision.revisionNumber).toBe(1);
    });

    it('returns 400 for invalid body', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/posts',
        headers: { authorization: `Bearer ${token}` },
        payload: { title: '' },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error).toBeDefined();
    });

    it('returns 401 without auth', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/posts',
        payload: validPayload,
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // ─── GET /api/posts/:id ────────────────────────────────────────────

  describe('GET /api/posts/:id', () => {
    it('returns post with latest revision', async () => {
      // findPostWithLatestRevision query
      mockQuery.mockResolvedValueOnce({
        rows: [samplePostWithRevisionRow],
        rowCount: 1,
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}`,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.post.id).toBe(postId);
      expect(body.post.title).toBe('Hello World');
      expect(body.post.revisions).toHaveLength(1);
      expect(body.post.revisions[0].content).toBe('console.log("hello");');
    });

    it('returns 404 when post not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const response = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}`,
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.error).toBe('Post not found');
    });
  });

  // ─── PATCH /api/posts/:id ──────────────────────────────────────────

  describe('PATCH /api/posts/:id', () => {
    it('updates post metadata and returns 200', async () => {
      // findPostById for ownership check
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // updatePost query
      const updatedRow = { ...samplePostRow, title: 'Updated Title' };
      mockQuery.mockResolvedValueOnce({ rows: [updatedRow], rowCount: 1 });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/posts/${postId}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { title: 'Updated Title' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.post.title).toBe('Updated Title');
    });

    it('returns 403 when user is not the author', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/posts/${postId}`,
        headers: { authorization: `Bearer ${otherToken}` },
        payload: { title: 'Hacked' },
      });

      expect(response.statusCode).toBe(403);
      const body = response.json();
      expect(body.error).toBe('Forbidden');
    });

    it('returns 404 when post not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/posts/${postId}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { title: 'Nope' },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.error).toBe('Post not found');
    });

    it('returns 400 for invalid body', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/posts/${postId}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { title: '' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 401 without auth', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/posts/${postId}`,
        payload: { title: 'No Auth' },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // ─── DELETE /api/posts/:id ─────────────────────────────────────────

  describe('DELETE /api/posts/:id', () => {
    it('soft-deletes and returns 204', async () => {
      // findPostById for ownership check
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // softDeletePost query
      mockQuery.mockResolvedValueOnce({ rows: [{ id: postId }], rowCount: 1 });

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/posts/${postId}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(204);
    });

    it('returns 403 when user is not the author', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/posts/${postId}`,
        headers: { authorization: `Bearer ${otherToken}` },
      });

      expect(response.statusCode).toBe(403);
    });

    it('returns 404 when post not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/posts/${postId}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(404);
    });

    it('returns 401 without auth', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/posts/${postId}`,
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // ─── POST /api/posts/:id/publish ───────────────────────────────────

  describe('POST /api/posts/:id/publish', () => {
    it('publishes a draft and returns 200', async () => {
      // findPostById for ownership check
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // publishPost query
      const publishedRow = { ...samplePostRow, is_draft: false };
      mockQuery.mockResolvedValueOnce({ rows: [publishedRow], rowCount: 1 });

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/publish`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.post.isDraft).toBe(false);
    });

    it('returns 403 when user is not the author', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/publish`,
        headers: { authorization: `Bearer ${otherToken}` },
      });

      expect(response.statusCode).toBe(403);
    });

    it('returns 404 when post not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/publish`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(404);
    });

    it('returns 401 without auth', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/publish`,
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // ─── POST /api/posts/:id/revisions ─────────────────────────────────

  describe('POST /api/posts/:id/revisions', () => {
    it('creates a revision and returns 201', async () => {
      // findPostById for ownership check
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // createRevisionAtomic query
      const newRevision: PostRevisionRow = {
        ...sampleRevisionRow,
        id: '880e8400-e29b-41d4-a716-446655440000',
        revision_number: 2,
        content: 'console.log("updated");',
        message: 'Updated code',
      };
      mockQuery.mockResolvedValueOnce({ rows: [newRevision], rowCount: 1 });

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/revisions`,
        headers: { authorization: `Bearer ${token}` },
        payload: { content: 'console.log("updated");', message: 'Updated code' },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.revision.content).toBe('console.log("updated");');
      expect(body.revision.revisionNumber).toBe(2);
    });

    it('returns 403 when user is not the author', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/revisions`,
        headers: { authorization: `Bearer ${otherToken}` },
        payload: { content: 'hacked' },
      });

      expect(response.statusCode).toBe(403);
    });

    it('returns 400 for invalid body', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/revisions`,
        headers: { authorization: `Bearer ${token}` },
        payload: { content: '' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 404 when post not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/revisions`,
        headers: { authorization: `Bearer ${token}` },
        payload: { content: 'something' },
      });

      expect(response.statusCode).toBe(404);
    });

    it('returns 401 without auth', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/revisions`,
        payload: { content: 'no auth' },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // ─── GET /api/posts/:id/revisions ──────────────────────────────────

  describe('GET /api/posts/:id/revisions', () => {
    it('lists all revisions for a post', async () => {
      // findPostById to check existence
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // findRevisionsByPostId query
      const rev2: PostRevisionRow = {
        ...sampleRevisionRow,
        id: '880e8400-e29b-41d4-a716-446655440000',
        revision_number: 2,
        content: 'updated content',
        message: 'v2',
      };
      mockQuery.mockResolvedValueOnce({ rows: [rev2, sampleRevisionRow], rowCount: 2 });

      const response = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}/revisions`,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.revisions).toHaveLength(2);
      expect(body.revisions[0].revisionNumber).toBe(2);
      expect(body.revisions[1].revisionNumber).toBe(1);
    });

    it('returns 404 when post not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const response = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}/revisions`,
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // ─── GET /api/posts/:id/revisions/:rev ─────────────────────────────

  describe('GET /api/posts/:id/revisions/:rev', () => {
    it('returns a specific revision', async () => {
      // findPostById to check existence
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // findRevision query
      mockQuery.mockResolvedValueOnce({ rows: [sampleRevisionRow], rowCount: 1 });

      const response = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}/revisions/1`,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.revision.revisionNumber).toBe(1);
      expect(body.revision.content).toBe('console.log("hello");');
    });

    it('returns 404 when revision not found', async () => {
      // findPostById
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // findRevision returns null
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const response = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}/revisions/99`,
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.error).toBe('Revision not found');
    });

    it('returns 404 when post not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const response = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}/revisions/1`,
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.error).toBe('Post not found');
    });

    it('returns 400 for non-numeric revision number', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}/revisions/abc`,
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error).toBe('Invalid revision number');
    });
  });
});
