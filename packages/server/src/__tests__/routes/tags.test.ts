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
import type { TagRow } from '../../db/queries/types.js';

const mockQuery = query as Mock;

const userId = '660e8400-e29b-41d4-a716-446655440000';

const sampleTag: TagRow = {
  id: '880e8400-e29b-41d4-a716-446655440000',
  name: 'typescript',
  post_count: 5,
};

const sampleTag2: TagRow = {
  id: '990e8400-e29b-41d4-a716-446655440000',
  name: 'javascript',
  post_count: 10,
};

describe('tag routes', () => {
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

  // ─── GET /api/tags ────────────────────────────────────────────────

  describe('GET /api/tags', () => {
    it('returns all tags when no query param', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleTag2, sampleTag], rowCount: 2 });

      const response = await app.inject({
        method: 'GET',
        url: '/api/tags',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.tags).toHaveLength(2);
      expect(body.tags[0].name).toBe('javascript');
      expect(body.tags[0].postCount).toBe(10);
      expect(body.tags[1].name).toBe('typescript');
      expect(body.tags[1].postCount).toBe(5);
    });

    it('searches tags by prefix when q param is provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleTag], rowCount: 1 });

      const response = await app.inject({
        method: 'GET',
        url: '/api/tags?q=type',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.tags).toHaveLength(1);
      expect(body.tags[0].name).toBe('typescript');
    });

    it('respects custom limit param', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleTag], rowCount: 1 });

      const response = await app.inject({
        method: 'GET',
        url: '/api/tags?limit=1',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.tags).toHaveLength(1);
    });

    it('returns 400 for invalid limit (too high)', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/tags?limit=100',
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error).toBeDefined();
    });

    it('returns 400 for invalid limit (zero)', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/tags?limit=0',
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 for q exceeding max length', async () => {
      const longQuery = 'a'.repeat(51);
      const response = await app.inject({
        method: 'GET',
        url: `/api/tags?q=${longQuery}`,
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns empty tags array when no results', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const response = await app.inject({
        method: 'GET',
        url: '/api/tags?q=nonexistent',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.tags).toEqual([]);
    });

    it('does not require authentication', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const response = await app.inject({
        method: 'GET',
        url: '/api/tags',
      });

      expect(response.statusCode).toBe(200);
    });
  });

  // ─── GET /api/tags/popular ────────────────────────────────────────

  describe('GET /api/tags/popular', () => {
    it('returns popular tags', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleTag2, sampleTag], rowCount: 2 });

      const response = await app.inject({
        method: 'GET',
        url: '/api/tags/popular',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.tags).toHaveLength(2);
      expect(body.tags[0].name).toBe('javascript');
      expect(body.tags[0].postCount).toBe(10);
    });

    it('respects custom limit param', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleTag2], rowCount: 1 });

      const response = await app.inject({
        method: 'GET',
        url: '/api/tags/popular?limit=1',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.tags).toHaveLength(1);
    });

    it('returns 400 for invalid limit (too high)', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/tags/popular?limit=100',
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 for invalid limit (zero)', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/tags/popular?limit=0',
      });

      expect(response.statusCode).toBe(400);
    });

    it('does not require authentication', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const response = await app.inject({
        method: 'GET',
        url: '/api/tags/popular',
      });

      expect(response.statusCode).toBe(200);
    });
  });

  // ─── GET /api/tags/subscriptions ──────────────────────────────────

  describe('GET /api/tags/subscriptions', () => {
    it('returns user subscribed tags', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleTag2, sampleTag], rowCount: 2 });

      const response = await app.inject({
        method: 'GET',
        url: '/api/tags/subscriptions',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.tags).toHaveLength(2);
      expect(body.tags[0].name).toBe('javascript');
    });

    it('returns 401 without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/tags/subscriptions',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // ─── POST /api/tags/:id/subscribe ─────────────────────────────────

  describe('POST /api/tags/:id/subscribe', () => {
    it('subscribes to a tag and returns 201', async () => {
      // findTagById query (check tag exists)
      mockQuery.mockResolvedValueOnce({ rows: [sampleTag], rowCount: 1 });
      // subscribeToTag query — insert succeeds
      mockQuery.mockResolvedValueOnce({
        rows: [{ user_id: userId, tag_id: sampleTag.id }],
        rowCount: 1,
      });

      const response = await app.inject({
        method: 'POST',
        url: `/api/tags/${sampleTag.id}/subscribe`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.subscribed).toBe(true);
    });

    it('returns 200 when already subscribed', async () => {
      // findTagById query
      mockQuery.mockResolvedValueOnce({ rows: [sampleTag], rowCount: 1 });
      // subscribeToTag query — ON CONFLICT, no insert
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const response = await app.inject({
        method: 'POST',
        url: `/api/tags/${sampleTag.id}/subscribe`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.subscribed).toBe(true);
    });

    it('returns 404 when tag not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const response = await app.inject({
        method: 'POST',
        url: '/api/tags/nonexistent-id/subscribe',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.error).toBe('Tag not found');
    });

    it('returns 401 without auth', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/tags/${sampleTag.id}/subscribe`,
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // ─── DELETE /api/tags/:id/subscribe ────────────────────────────────

  describe('DELETE /api/tags/:id/subscribe', () => {
    it('unsubscribes from a tag and returns 204', async () => {
      // unsubscribeFromTag query — delete succeeds
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/tags/${sampleTag.id}/subscribe`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(204);
    });

    it('returns 404 when not subscribed', async () => {
      // unsubscribeFromTag query — nothing to delete
      mockQuery.mockResolvedValueOnce({ rowCount: 0 });

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/tags/${sampleTag.id}/subscribe`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.error).toBe('Not subscribed to this tag');
    });

    it('returns 401 without auth', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/tags/${sampleTag.id}/subscribe`,
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
