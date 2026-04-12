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
import type { PostRow, CommentRow, CommentWithAuthorRow } from '../../db/queries/types.js';

const mockQuery = query as Mock;

const userId = '660e8400-e29b-41d4-a716-446655440000';
const otherUserId = '770e8400-e29b-41d4-a716-446655440000';
const postId = '550e8400-e29b-41d4-a716-446655440000';
const commentId = '880e8400-e29b-41d4-a716-446655440000';
const revisionId = '990e8400-e29b-41d4-a716-446655440000';

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

const sampleCommentRow: CommentRow = {
  id: commentId,
  post_id: postId,
  author_id: userId,
  parent_id: null,
  line_number: null,
  revision_id: null,
  body: 'Test comment',
  created_at: new Date('2026-01-01'),
  updated_at: new Date('2026-01-01'),
};

const sampleCommentWithAuthor: CommentWithAuthorRow = {
  ...sampleCommentRow,
  author_display_name: 'Test User',
  author_avatar_url: null,
  revision_number: null,
};

describe('comment routes', () => {
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

  // ─── GET /api/posts/:id/comments ────────────────────────────────────

  describe('GET /api/posts/:id/comments', () => {
    it('returns comments for a post', async () => {
      // findPostById — post exists
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // findCommentsByPostIdWithAuthor
      mockQuery.mockResolvedValueOnce({ rows: [sampleCommentWithAuthor], rowCount: 1 });

      const response = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}/comments`,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.comments).toHaveLength(1);
      expect(body.comments[0].id).toBe(commentId);
      expect(body.comments[0].body).toBe('Test comment');
      expect(body.comments[0].author).toEqual({
        id: userId,
        displayName: 'Test User',
        avatarUrl: null,
      });
    });

    it('returns comments filtered by revision', async () => {
      const commentWithRevision: CommentWithAuthorRow = {
        ...sampleCommentWithAuthor,
        revision_id: revisionId,
        revision_number: 2,
      };

      // findPostById — post exists
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // findCommentsByPostIdWithAuthorForRevision
      mockQuery.mockResolvedValueOnce({ rows: [commentWithRevision], rowCount: 1 });

      const response = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}/comments?revision=${revisionId}`,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.comments).toHaveLength(1);
      expect(body.comments[0].revisionId).toBe(revisionId);
      expect(body.comments[0].revisionNumber).toBe(2);
    });

    it('returns 404 when post not found', async () => {
      // findPostById — no post
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const response = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}/comments`,
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.error).toBe('Post not found');
    });
  });

  // ─── POST /api/posts/:id/comments ───────────────────────────────────

  describe('POST /api/posts/:id/comments', () => {
    it('creates a comment and returns 201', async () => {
      // findPostById — post exists
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // createComment — insert
      mockQuery.mockResolvedValueOnce({ rows: [sampleCommentRow], rowCount: 1 });
      // findCommentsByPostIdWithAuthor — re-read with author join
      mockQuery.mockResolvedValueOnce({ rows: [sampleCommentWithAuthor], rowCount: 1 });

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/comments`,
        headers: { authorization: `Bearer ${token}` },
        payload: { body: 'Test comment' },
      });

      expect(response.statusCode).toBe(201);
      const json = response.json();
      expect(json.comment.id).toBe(commentId);
      expect(json.comment.body).toBe('Test comment');
      expect(json.comment.author).toEqual({
        id: userId,
        displayName: 'Test User',
        avatarUrl: null,
      });
    });

    it('returns 201 with fallback when re-read does not find created comment', async () => {
      // findPostById — post exists
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // createComment — insert
      mockQuery.mockResolvedValueOnce({ rows: [sampleCommentRow], rowCount: 1 });
      // findCommentsByPostIdWithAuthor — re-read returns empty (race condition)
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/comments`,
        headers: { authorization: `Bearer ${token}` },
        payload: { body: 'Test comment' },
      });

      expect(response.statusCode).toBe(201);
      const json = response.json();
      expect(json.comment.id).toBe(commentId);
      expect(json.comment.body).toBe('Test comment');
    });

    it('returns 400 for empty body', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/comments`,
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const json = response.json();
      expect(json.error).toBeDefined();
    });

    it('returns 401 without auth', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/comments`,
        payload: { body: 'Test comment' },
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 404 when post not found', async () => {
      // findPostById — no post
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/comments`,
        headers: { authorization: `Bearer ${token}` },
        payload: { body: 'Test comment' },
      });

      expect(response.statusCode).toBe(404);
      const json = response.json();
      expect(json.error).toBe('Post not found');
    });
  });

  // ─── PATCH /api/posts/:id/comments/:cid ─────────────────────────────

  describe('PATCH /api/posts/:id/comments/:cid', () => {
    it('updates comment body and returns 200', async () => {
      const updatedRow: CommentWithAuthorRow = {
        ...sampleCommentWithAuthor,
        body: 'Updated comment',
        updated_at: new Date('2026-01-02'),
      };

      // findPostById — post exists
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // findCommentById — comment exists, owned by user
      mockQuery.mockResolvedValueOnce({ rows: [sampleCommentRow], rowCount: 1 });
      // updateComment
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...sampleCommentRow, body: 'Updated comment' }],
        rowCount: 1,
      });
      // findCommentsByPostIdWithAuthor — re-read for response
      mockQuery.mockResolvedValueOnce({ rows: [updatedRow], rowCount: 1 });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/posts/${postId}/comments/${commentId}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { body: 'Updated comment' },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.comment.body).toBe('Updated comment');
    });

    it('returns 403 when not the comment owner', async () => {
      // findPostById — post exists
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // findCommentById — comment exists, owned by different user
      mockQuery.mockResolvedValueOnce({ rows: [sampleCommentRow], rowCount: 1 });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/posts/${postId}/comments/${commentId}`,
        headers: { authorization: `Bearer ${otherToken}` },
        payload: { body: 'Updated comment' },
      });

      expect(response.statusCode).toBe(403);
      const json = response.json();
      expect(json.error).toBe('Not authorized to edit this comment');
    });

    it('returns 404 when comment not found', async () => {
      // findPostById — post exists
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // findCommentById — no comment
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/posts/${postId}/comments/${commentId}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { body: 'Updated comment' },
      });

      expect(response.statusCode).toBe(404);
      const json = response.json();
      expect(json.error).toBe('Comment not found');
    });

    it('returns 401 without auth', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/posts/${postId}/comments/${commentId}`,
        payload: { body: 'Updated comment' },
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 400 for empty body', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/posts/${postId}/comments/${commentId}`,
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const json = response.json();
      expect(json.error).toBeDefined();
    });
  });

  // ─── DELETE /api/posts/:id/comments/:cid ────────────────────────────

  describe('DELETE /api/posts/:id/comments/:cid', () => {
    it('deletes a comment and returns 204', async () => {
      // findPostById — post exists
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // findCommentById — comment exists, owned by user
      mockQuery.mockResolvedValueOnce({ rows: [sampleCommentRow], rowCount: 1 });
      // deleteComment
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/posts/${postId}/comments/${commentId}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(204);
    });

    it('returns 403 when not the comment owner', async () => {
      // findPostById — post exists
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // findCommentById — comment exists, owned by different user
      mockQuery.mockResolvedValueOnce({ rows: [sampleCommentRow], rowCount: 1 });

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/posts/${postId}/comments/${commentId}`,
        headers: { authorization: `Bearer ${otherToken}` },
      });

      expect(response.statusCode).toBe(403);
      const json = response.json();
      expect(json.error).toBe('Not authorized to delete this comment');
    });

    it('returns 404 when comment not found', async () => {
      // findPostById — post exists
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // findCommentById — no comment
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/posts/${postId}/comments/${commentId}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(404);
      const json = response.json();
      expect(json.error).toBe('Comment not found');
    });

    it('returns 401 without auth', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/posts/${postId}/comments/${commentId}`,
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
