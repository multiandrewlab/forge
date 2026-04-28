import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('../../db/connection.js', () => ({
  query: vi.fn(),
}));

vi.mock('../../plugins/rate-limit.js', () => ({
  rateLimitPlugin: async () => {
    // no-op
  },
}));

const mockBuildUserProfile = vi.fn();
vi.mock('../../services/user-profiles.js', () => ({
  buildUserProfile: (...args: unknown[]) => mockBuildUserProfile(...args),
  toUserProfilePost: vi.fn(),
}));

import { buildApp } from '../../app.js';
import type { FastifyInstance } from 'fastify';
import type { UserProfileResponse } from '@forge/shared';

const validUserId = '660e8400-e29b-41d4-a716-446655440000';

const sampleProfile: UserProfileResponse = {
  user: {
    id: validUserId,
    displayName: 'Test User',
    avatarUrl: null,
    createdAt: '2025-01-01T00:00:00.000Z',
  },
  stats: {
    postCount: 5,
    totalVotes: 42,
    topTags: [{ tagName: 'typescript', voteSum: 20 }],
  },
  badges: [{ type: 'top_contributor', label: 'Top Contributor', rank: 1 }],
  posts: [
    {
      id: 'p0000000-0000-0000-0000-000000000001',
      title: 'Hello World',
      contentType: 'snippet',
      language: 'typescript',
      voteCount: 10,
      createdAt: '2025-06-01T00:00:00.000Z',
      tags: ['typescript'],
    },
  ],
  cursor: '2025-06-01T00:00:00.000Z|p0000000-0000-0000-0000-000000000001',
};

describe('user profile routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── GET /api/users/:id ───────────────────────────────────────────

  describe('GET /api/users/:id', () => {
    it('returns 200 with profile data on success', async () => {
      mockBuildUserProfile.mockResolvedValueOnce(sampleProfile);

      const response = await app.inject({
        method: 'GET',
        url: `/api/users/${validUserId}`,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.user.id).toBe(validUserId);
      expect(body.stats.postCount).toBe(5);
      expect(body.badges).toHaveLength(1);
      expect(body.posts).toHaveLength(1);
      expect(body.cursor).toBe(sampleProfile.cursor);
      expect(mockBuildUserProfile).toHaveBeenCalledWith(validUserId, 20, undefined);
    });

    it('returns 400 for invalid UUID param', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/users/not-a-uuid',
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error).toBeDefined();
    });

    it('returns 404 when buildUserProfile returns null', async () => {
      mockBuildUserProfile.mockResolvedValueOnce(null);

      const response = await app.inject({
        method: 'GET',
        url: `/api/users/${validUserId}`,
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.error).toBe('User not found');
    });

    it('accepts custom limit query param', async () => {
      mockBuildUserProfile.mockResolvedValueOnce(sampleProfile);

      const response = await app.inject({
        method: 'GET',
        url: `/api/users/${validUserId}?limit=10`,
      });

      expect(response.statusCode).toBe(200);
      expect(mockBuildUserProfile).toHaveBeenCalledWith(validUserId, 10, undefined);
    });

    it('clamps limit above 50 to validation error', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/users/${validUserId}?limit=100`,
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error).toBeDefined();
    });

    it('uses default limit of 20 when not specified', async () => {
      mockBuildUserProfile.mockResolvedValueOnce(sampleProfile);

      const response = await app.inject({
        method: 'GET',
        url: `/api/users/${validUserId}`,
      });

      expect(response.statusCode).toBe(200);
      expect(mockBuildUserProfile).toHaveBeenCalledWith(validUserId, 20, undefined);
    });

    it('parses cursor query param and passes Date to buildUserProfile', async () => {
      mockBuildUserProfile.mockResolvedValueOnce(sampleProfile);
      const cursorValue = '2025-06-01T00:00:00.000Z|some-post-id';

      const response = await app.inject({
        method: 'GET',
        url: `/api/users/${validUserId}?cursor=${encodeURIComponent(cursorValue)}`,
      });

      expect(response.statusCode).toBe(200);
      expect(mockBuildUserProfile).toHaveBeenCalledWith(
        validUserId,
        20,
        new Date('2025-06-01T00:00:00.000Z'),
      );
    });

    it('returns 400 for limit below 1', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/users/${validUserId}?limit=0`,
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error).toBeDefined();
    });
  });
});
