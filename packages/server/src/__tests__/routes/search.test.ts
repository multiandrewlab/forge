import { describe, it, expect, beforeAll, afterAll, beforeEach, vi, type Mock } from 'vitest';

vi.mock('../../db/connection.js', () => ({
  query: vi.fn(),
}));

vi.mock('../../plugins/rate-limit.js', () => ({
  rateLimitPlugin: async () => {
    // no-op
  },
}));

vi.mock('../../db/queries/search.js', () => ({
  searchPostsByTsvector: vi.fn(),
  searchPostsByTrigram: vi.fn(),
  searchUsers: vi.fn(),
}));

import { buildApp } from '../../app.js';
import {
  searchPostsByTsvector,
  searchPostsByTrigram,
  searchUsers,
} from '../../db/queries/search.js';
import type { SearchPostRow, SearchUserRow } from '../../db/queries/search.js';
import type { FastifyInstance } from 'fastify';

const mockSearchPostsByTsvector = searchPostsByTsvector as Mock;
const mockSearchPostsByTrigram = searchPostsByTrigram as Mock;
const mockSearchUsers = searchUsers as Mock;

function makePostRow(overrides: Partial<SearchPostRow> = {}): SearchPostRow {
  return {
    id: '660e8400-e29b-41d4-a716-446655440000',
    title: 'React Hooks Guide',
    content_type: 'snippet',
    language: 'typescript',
    author_id: '550e8400-e29b-41d4-a716-446655440000',
    author_display_name: 'Alice',
    author_avatar_url: 'https://example.com/avatar.png',
    excerpt: 'Learn about React hooks...',
    rank: 0.85,
    ...overrides,
  };
}

function makeUserRow(overrides: Partial<SearchUserRow> = {}): SearchUserRow {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    display_name: 'Alice',
    avatar_url: 'https://example.com/avatar.png',
    post_count: 42,
    ...overrides,
  };
}

describe('search routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('GET /api/search', () => {
    it('returns empty response when q is empty after trim', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/search',
        query: { q: '   ' },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toEqual({
        snippets: [],
        aiActions: [],
        people: [],
        query: '',
        totalResults: 0,
      });
      expect(mockSearchPostsByTsvector).not.toHaveBeenCalled();
      expect(mockSearchPostsByTrigram).not.toHaveBeenCalled();
      expect(mockSearchUsers).not.toHaveBeenCalled();
    });

    it('returns snippets from tsvector when results >= 5 (no trigram fallback)', async () => {
      const rows = Array.from({ length: 6 }, (_, i) =>
        makePostRow({ id: `id-${i}`, rank: 0.9 - i * 0.1 }),
      );
      mockSearchPostsByTsvector.mockResolvedValueOnce(rows);
      mockSearchUsers.mockResolvedValueOnce([]);

      const res = await app.inject({
        method: 'GET',
        url: '/api/search',
        query: { q: 'react' },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.snippets).toHaveLength(6);
      expect(body.snippets[0].id).toBe('id-0');
      expect(body.snippets[0].matchedBy).toBe('tsvector');
      expect(body.query).toBe('react');
      expect(mockSearchPostsByTsvector).toHaveBeenCalledOnce();
      expect(mockSearchPostsByTrigram).not.toHaveBeenCalled();
    });

    it('falls back to trigram when tsvector returns < 5 rows and merges/dedupes by id', async () => {
      const tsvectorRows = [
        makePostRow({ id: 'shared-id', rank: 0.9 }),
        makePostRow({ id: 'tsv-only', rank: 0.8 }),
      ];
      const trigramRows = [
        makePostRow({ id: 'shared-id', rank: 0.7 }),
        makePostRow({ id: 'tri-only', rank: 0.6 }),
      ];
      mockSearchPostsByTsvector.mockResolvedValueOnce(tsvectorRows);
      mockSearchPostsByTrigram.mockResolvedValueOnce(trigramRows);
      mockSearchUsers.mockResolvedValueOnce([]);

      const res = await app.inject({
        method: 'GET',
        url: '/api/search',
        query: { q: 'react' },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      // shared-id from tsvector kept, tri-only appended
      expect(body.snippets).toHaveLength(3);
      expect(body.snippets[0].id).toBe('shared-id');
      expect(body.snippets[0].matchedBy).toBe('tsvector');
      expect(body.snippets[1].id).toBe('tsv-only');
      expect(body.snippets[2].id).toBe('tri-only');
      expect(body.snippets[2].matchedBy).toBe('trigram');
      expect(mockSearchPostsByTsvector).toHaveBeenCalledOnce();
      expect(mockSearchPostsByTrigram).toHaveBeenCalledOnce();
    });

    it('calls only trigram (not tsvector) when fuzzy=true', async () => {
      const trigramRows = [makePostRow({ id: 'tri-1' })];
      mockSearchPostsByTrigram.mockResolvedValueOnce(trigramRows);
      mockSearchUsers.mockResolvedValueOnce([]);

      const res = await app.inject({
        method: 'GET',
        url: '/api/search',
        query: { q: 'react', fuzzy: 'true' },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.snippets).toHaveLength(1);
      expect(body.snippets[0].matchedBy).toBe('trigram');
      expect(mockSearchPostsByTsvector).not.toHaveBeenCalled();
      expect(mockSearchPostsByTrigram).toHaveBeenCalledOnce();
    });

    it('passes type and tag to query layer', async () => {
      mockSearchPostsByTsvector.mockResolvedValueOnce(
        Array.from({ length: 5 }, (_, i) => makePostRow({ id: `id-${i}` })),
      );
      mockSearchUsers.mockResolvedValueOnce([]);

      const res = await app.inject({
        method: 'GET',
        url: '/api/search',
        query: { q: 'react', type: 'snippet', tag: 'javascript' },
      });

      expect(res.statusCode).toBe(200);
      expect(mockSearchPostsByTsvector).toHaveBeenCalledWith('react', {
        contentType: 'snippet',
        tag: 'javascript',
        limit: 20,
      });
    });

    it('returns 400 for invalid type parameter', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/search',
        query: { q: 'react', type: 'bogus' },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.error).toBeDefined();
      expect(typeof body.error).toBe('string');
    });

    it('returns 500 with internal_error when query layer throws', async () => {
      mockSearchPostsByTsvector.mockRejectedValueOnce(new Error('DB connection lost'));
      mockSearchUsers.mockResolvedValueOnce([]);

      const res = await app.inject({
        method: 'GET',
        url: '/api/search',
        query: { q: 'react' },
      });

      expect(res.statusCode).toBe(500);
      const body = res.json();
      expect(body).toEqual({ error: 'internal_error' });
    });

    it('returns people from searchUsers', async () => {
      mockSearchPostsByTsvector.mockResolvedValueOnce(
        Array.from({ length: 5 }, (_, i) => makePostRow({ id: `id-${i}` })),
      );
      mockSearchUsers.mockResolvedValueOnce([makeUserRow()]);

      const res = await app.inject({
        method: 'GET',
        url: '/api/search',
        query: { q: 'alice' },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.people).toHaveLength(1);
      expect(body.people[0]).toEqual({
        id: '550e8400-e29b-41d4-a716-446655440000',
        displayName: 'Alice',
        avatarUrl: 'https://example.com/avatar.png',
        postCount: 42,
      });
    });

    it('includes aiActions when q.length >= 2', async () => {
      mockSearchPostsByTsvector.mockResolvedValueOnce(
        Array.from({ length: 5 }, (_, i) => makePostRow({ id: `id-${i}` })),
      );
      mockSearchUsers.mockResolvedValueOnce([]);

      const res = await app.inject({
        method: 'GET',
        url: '/api/search',
        query: { q: 'react' },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.aiActions).toHaveLength(2);
      expect(body.aiActions[0].label).toBe('Generate a react tutorial');
      expect(body.aiActions[1].label).toBe('Explain react');
    });

    it('computes totalResults as snippets + people + aiActions', async () => {
      mockSearchPostsByTsvector.mockResolvedValueOnce(
        Array.from({ length: 5 }, (_, i) => makePostRow({ id: `id-${i}` })),
      );
      mockSearchUsers.mockResolvedValueOnce([makeUserRow()]);

      const res = await app.inject({
        method: 'GET',
        url: '/api/search',
        query: { q: 'react' },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      // 5 snippets + 1 person + 2 aiActions = 8
      expect(body.totalResults).toBe(8);
    });

    it('respects limit parameter for snippets', async () => {
      const rows = Array.from({ length: 10 }, (_, i) => makePostRow({ id: `id-${i}` }));
      mockSearchPostsByTsvector.mockResolvedValueOnce(rows);
      mockSearchUsers.mockResolvedValueOnce([]);

      const res = await app.inject({
        method: 'GET',
        url: '/api/search',
        query: { q: 'react', limit: '3' },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.snippets).toHaveLength(3);
    });

    it('does not leak raw error messages in 500 responses', async () => {
      mockSearchPostsByTsvector.mockRejectedValueOnce(
        new Error('FATAL: password authentication failed'),
      );
      mockSearchUsers.mockResolvedValueOnce([]);

      const res = await app.inject({
        method: 'GET',
        url: '/api/search',
        query: { q: 'react' },
      });

      expect(res.statusCode).toBe(500);
      const body = res.json();
      expect(JSON.stringify(body)).not.toContain('password');
      expect(JSON.stringify(body)).not.toContain('FATAL');
      expect(body.error).toBe('internal_error');
    });
  });
});
