import { describe, it, expect, beforeAll, afterAll, beforeEach, vi, type Mock } from 'vitest';

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

const mockBuildUserProfile = vi.fn();
vi.mock('../../services/user-profiles.js', () => ({
  buildUserProfile: (...args: unknown[]) => mockBuildUserProfile(...args),
  toUserProfilePost: vi.fn(),
}));

vi.mock('../../db/queries/search.js', () => ({
  searchPostsByTsvector: vi.fn(),
  searchPostsByTrigram: vi.fn(),
  searchUsers: vi.fn(),
}));

vi.mock('../../plugins/langchain/provider.js', () => ({
  createChatModel: vi.fn().mockReturnValue({} as never),
}));

vi.mock('../../plugins/langchain/chains/search.js', () => ({
  createSearchChain: vi.fn(() => ({})),
  runSearchChain: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { query } from '../../db/connection.js';
import {
  searchPostsByTsvector,
  searchPostsByTrigram,
  searchUsers,
} from '../../db/queries/search.js';
import { buildApp } from '../../app.js';
import type { FastifyInstance } from 'fastify';

const mockQuery = query as Mock;
const mockSearchPostsByTsvector = searchPostsByTsvector as Mock;
const mockSearchPostsByTrigram = searchPostsByTrigram as Mock;
const mockSearchUsers = searchUsers as Mock;

const userId = 'a0000000-0000-0000-0000-000000000099';

// ---------------------------------------------------------------------------
// Test suite — 4 routes × 2 cells (no-token 401, valid-token 200) = 8 tests
// ---------------------------------------------------------------------------

describe('Auth required on previously-public read routes (WU4)', () => {
  let app: FastifyInstance;
  let validToken: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    validToken = app.jwt.sign({
      id: userId,
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

  // ─── GET /api/tags ────────────────────────────────────────────────

  describe('GET /api/tags', () => {
    it('returns 401 without token', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/tags' });
      expect(res.statusCode).toBe(401);
    });

    it('returns 200 with valid token', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const res = await app.inject({
        method: 'GET',
        url: '/api/tags',
        headers: { authorization: `Bearer ${validToken}` },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  // ─── GET /api/tags/popular ────────────────────────────────────────

  describe('GET /api/tags/popular', () => {
    it('returns 401 without token', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/tags/popular' });
      expect(res.statusCode).toBe(401);
    });

    it('returns 200 with valid token', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const res = await app.inject({
        method: 'GET',
        url: '/api/tags/popular',
        headers: { authorization: `Bearer ${validToken}` },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  // ─── GET /api/users/:id ───────────────────────────────────────────

  describe('GET /api/users/:id', () => {
    it('returns 401 without token', async () => {
      const res = await app.inject({ method: 'GET', url: `/api/users/${userId}` });
      expect(res.statusCode).toBe(401);
    });

    it('returns 200 with valid token', async () => {
      mockBuildUserProfile.mockResolvedValueOnce({
        user: {
          id: userId,
          displayName: 'Test User',
          avatarUrl: null,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        stats: { postCount: 0, totalVotes: 0, topTags: [] },
        badges: [],
        posts: [],
        cursor: null,
      });

      const res = await app.inject({
        method: 'GET',
        url: `/api/users/${userId}`,
        headers: { authorization: `Bearer ${validToken}` },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  // ─── GET /api/search ──────────────────────────────────────────────

  describe('GET /api/search', () => {
    it('returns 401 without token', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/search?q=fixture' });
      expect(res.statusCode).toBe(401);
    });

    it('returns 200 with valid token', async () => {
      mockSearchPostsByTsvector.mockResolvedValueOnce([]);
      mockSearchPostsByTrigram.mockResolvedValueOnce([]);
      mockSearchUsers.mockResolvedValueOnce([]);

      const res = await app.inject({
        method: 'GET',
        url: '/api/search?q=fixture',
        headers: { authorization: `Bearer ${validToken}` },
      });
      expect(res.statusCode).toBe(200);
    });
  });
});
