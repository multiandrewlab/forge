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
import type { PostRow, VoteRow } from '../../db/queries/types.js';

const mockQuery = query as Mock;

const userId = '660e8400-e29b-41d4-a716-446655440000';
const postId = '550e8400-e29b-41d4-a716-446655440000';

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

const sampleVote: VoteRow = {
  user_id: userId,
  post_id: postId,
  value: 1,
};

describe('vote routes', () => {
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    app = await buildApp();
    token = app.jwt.sign({ id: userId, email: 'test@example.com', displayName: 'Test User' });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── POST /api/posts/:id/vote ──────────────────────────────────────

  describe('POST /api/posts/:id/vote', () => {
    it('creates a new vote and returns 200 with voteCount and userVote', async () => {
      // findPostById — post exists
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // getUserVote — no existing vote
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      // upsertVote — insert new vote
      mockQuery.mockResolvedValueOnce({ rows: [sampleVote], rowCount: 1 });
      // findPostById — re-read for updated vote_count
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...samplePostRow, vote_count: 1 }],
        rowCount: 1,
      });

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/vote`,
        headers: { authorization: `Bearer ${token}` },
        payload: { value: 1 },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.voteCount).toBe(1);
      expect(body.userVote).toBe(1);
    });

    it('toggles off same vote and returns 200 with userVote=null', async () => {
      // findPostById — post exists
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // getUserVote — existing vote with same value
      mockQuery.mockResolvedValueOnce({ rows: [sampleVote], rowCount: 1 });
      // deleteVote — remove existing vote
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });
      // findPostById — re-read for updated vote_count
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...samplePostRow, vote_count: -1 }],
        rowCount: 1,
      });

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/vote`,
        headers: { authorization: `Bearer ${token}` },
        payload: { value: 1 },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.voteCount).toBe(-1);
      expect(body.userVote).toBeNull();
    });

    it('changes vote direction and returns 200 with new userVote', async () => {
      // findPostById — post exists
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // getUserVote — existing vote with different value
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...sampleVote, value: -1 }],
        rowCount: 1,
      });
      // upsertVote — update to new value
      const updatedVote: VoteRow = { ...sampleVote, value: 1 };
      mockQuery.mockResolvedValueOnce({ rows: [updatedVote], rowCount: 1 });
      // findPostById — re-read for updated vote_count
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...samplePostRow, vote_count: 2 }],
        rowCount: 1,
      });

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/vote`,
        headers: { authorization: `Bearer ${token}` },
        payload: { value: 1 },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.voteCount).toBe(2);
      expect(body.userVote).toBe(1);
    });

    it('returns 404 when post not found', async () => {
      // findPostById — no post
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/vote`,
        headers: { authorization: `Bearer ${token}` },
        payload: { value: 1 },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.error).toBe('Post not found');
    });

    it('returns 401 without auth', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/vote`,
        payload: { value: 1 },
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 400 for value 0', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/vote`,
        headers: { authorization: `Bearer ${token}` },
        payload: { value: 0 },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error).toBeDefined();
    });

    it('returns 400 for value 2', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/vote`,
        headers: { authorization: `Bearer ${token}` },
        payload: { value: 2 },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error).toBeDefined();
    });

    it('falls back to original vote_count when post re-read returns null (race condition)', async () => {
      // findPostById — post exists
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // getUserVote — no existing vote
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      // upsertVote — insert new vote
      mockQuery.mockResolvedValueOnce({ rows: [sampleVote], rowCount: 1 });
      // findPostById — re-read returns null (post deleted between vote and re-read)
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/vote`,
        headers: { authorization: `Bearer ${token}` },
        payload: { value: 1 },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      // Falls back to original post.vote_count
      expect(body.voteCount).toBe(0);
      expect(body.userVote).toBe(1);
    });

    it('returns 400 for missing body', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/vote`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error).toBeDefined();
    });
  });

  // ─── DELETE /api/posts/:id/vote ────────────────────────────────────

  describe('DELETE /api/posts/:id/vote', () => {
    it('removes vote and returns 200 with userVote=null', async () => {
      // findPostById — post exists
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // deleteVote — returns true (vote existed)
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });
      // findPostById — re-read for updated vote_count
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...samplePostRow, vote_count: -1 }],
        rowCount: 1,
      });

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/posts/${postId}/vote`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.voteCount).toBe(-1);
      expect(body.userVote).toBeNull();
    });

    it('falls back to original vote_count when post re-read returns null (race condition)', async () => {
      // findPostById — post exists
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // deleteVote — returns true (vote existed)
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });
      // findPostById — re-read returns null (post deleted between delete and re-read)
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/posts/${postId}/vote`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      // Falls back to original post.vote_count
      expect(body.voteCount).toBe(0);
      expect(body.userVote).toBeNull();
    });

    it('returns 404 when no vote exists', async () => {
      // findPostById — post exists
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // deleteVote — returns false (no vote)
      mockQuery.mockResolvedValueOnce({ rowCount: 0 });

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/posts/${postId}/vote`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.error).toBe('Vote not found');
    });

    it('returns 404 when post not found', async () => {
      // findPostById — no post
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/posts/${postId}/vote`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.error).toBe('Post not found');
    });

    it('returns 401 without auth', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/posts/${postId}/vote`,
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
