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
  countSearchPosts: vi.fn(),
}));

vi.mock('../../plugins/langchain/provider.js', () => ({
  createChatModel: vi.fn().mockReturnValue({} as never),
}));

const mockRunSearchChain = vi.fn();
vi.mock('../../plugins/langchain/chains/search.js', () => ({
  createSearchChain: vi.fn(() => ({})),
  runSearchChain: (...args: unknown[]) => mockRunSearchChain(...args),
}));

import { buildApp } from '../../app.js';
import {
  searchPostsByTsvector,
  searchPostsByTrigram,
  searchUsers,
  countSearchPosts,
} from '../../db/queries/search.js';
import type { SearchPostRow, SearchUserRow } from '../../db/queries/search.js';
import type { FastifyInstance } from 'fastify';
import type { AiSearchFilters } from '@forge/shared';

const mockSearchPostsByTsvector = searchPostsByTsvector as Mock;
const mockSearchPostsByTrigram = searchPostsByTrigram as Mock;
const mockSearchUsers = searchUsers as Mock;
const mockCountSearchPosts = countSearchPosts as Mock;

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
  let token: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    token = app.jwt.sign({
      id: 'a0000000-0000-0000-0000-000000000099',
      email: 'testuser@example.com',
      displayName: 'Test User',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.resetAllMocks();
    mockRunSearchChain.mockReset();
    // Defaults so tests that don't override these don't hit `undefined.map(...)`.
    // Tests with specific shapes use `.mockResolvedValueOnce(...)` which takes
    // precedence over these defaults.
    mockCountSearchPosts.mockResolvedValue(0);
    mockSearchPostsByTsvector.mockResolvedValue([]);
    mockSearchPostsByTrigram.mockResolvedValue([]);
    mockSearchUsers.mockResolvedValue([]);
  });

  describe('GET /api/search', () => {
    it('returns empty response when q is empty after trim', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/search',
        query: { q: '   ' },
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toEqual({
        snippets: [],
        aiActions: [],
        people: [],
        query: '',
        totalResults: 0,
        page: 1,
        totalPages: 0,
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
        headers: { authorization: `Bearer ${token}` },
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
        headers: { authorization: `Bearer ${token}` },
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
        headers: { authorization: `Bearer ${token}` },
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
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      expect(mockSearchPostsByTsvector).toHaveBeenCalledWith(
        'react',
        expect.objectContaining({
          contentType: 'snippet',
          tag: 'javascript',
          limit: 20,
        }),
      );
    });

    it('returns 400 for invalid type parameter', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/search',
        query: { q: 'react', type: 'bogus' },
        headers: { authorization: `Bearer ${token}` },
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
        headers: { authorization: `Bearer ${token}` },
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
        headers: { authorization: `Bearer ${token}` },
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
        headers: { authorization: `Bearer ${token}` },
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
        headers: { authorization: `Bearer ${token}` },
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
        headers: { authorization: `Bearer ${token}` },
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
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(500);
      const body = res.json();
      expect(JSON.stringify(body)).not.toContain('password');
      expect(JSON.stringify(body)).not.toContain('FATAL');
      expect(body.error).toBe('internal_error');
    });

    describe('ai=true path', () => {
      let authToken: string;

      beforeAll(() => {
        // Sign a real JWT using the same secret buildApp() uses
        authToken = app.jwt.sign({ id: 'u1', email: 'u1@example.com', displayName: 'U1' });
      });

      it('runs AI chain when authenticated and slot acquired, overrides searchOptions with filters', async () => {
        const filters: AiSearchFilters = {
          tags: ['typescript'],
          language: 'typescript',
          contentType: 'snippet',
          textQuery: 'binary search',
        };
        mockRunSearchChain.mockResolvedValueOnce(filters);
        mockSearchPostsByTsvector.mockResolvedValueOnce(
          Array.from({ length: 5 }, (_, i) => makePostRow({ id: `id-${i}` })),
        );
        mockSearchUsers.mockResolvedValueOnce([]);

        const res = await app.inject({
          method: 'GET',
          url: '/api/search',
          query: { q: 'typescript binary search', ai: 'true' },
          headers: { authorization: `Bearer ${authToken}` },
        });

        expect(res.statusCode).toBe(200);
        expect(mockRunSearchChain).toHaveBeenCalledOnce();
        // Search should be called with the textQuery from filters
        expect(mockSearchPostsByTsvector).toHaveBeenCalledWith(
          'binary search',
          expect.objectContaining({ contentType: 'snippet' }),
        );
      });

      it('returns 401 when not authenticated (preHandler enforces auth before AI logic)', async () => {
        const res = await app.inject({
          method: 'GET',
          url: '/api/search',
          query: { q: 'react hooks', ai: 'true' },
        });

        expect(res.statusCode).toBe(401);
        // preHandler short-circuits before any handler logic — chain & DB never called
        expect(mockRunSearchChain).not.toHaveBeenCalled();
        expect(mockSearchPostsByTsvector).not.toHaveBeenCalled();
      });

      it('falls back to plain search when chain returns null (chain failure)', async () => {
        mockRunSearchChain.mockResolvedValueOnce(null);
        mockSearchPostsByTsvector.mockResolvedValueOnce(
          Array.from({ length: 5 }, (_, i) => makePostRow({ id: `id-${i}` })),
        );
        mockSearchUsers.mockResolvedValueOnce([]);

        const res = await app.inject({
          method: 'GET',
          url: '/api/search',
          query: { q: 'react', ai: 'true' },
          headers: { authorization: `Bearer ${authToken}` },
        });

        expect(res.statusCode).toBe(200);
        expect(mockRunSearchChain).toHaveBeenCalledOnce();
        // Falls back: uses original query, not filters.textQuery
        expect(mockSearchPostsByTsvector).toHaveBeenCalledWith('react', expect.any(Object));
      });

      it('falls back to plain search when slot cannot be acquired (rate limit)', async () => {
        // Hold a slot for u1 so aiAcquire returns null for the same user
        const typedApp = app as unknown as {
          aiAcquire: (userId: string) => { release: () => void } | null;
        };
        const heldSlot = typedApp.aiAcquire('u1');
        expect(heldSlot).not.toBeNull();

        mockSearchPostsByTsvector.mockResolvedValueOnce(
          Array.from({ length: 5 }, (_, i) => makePostRow({ id: `id-${i}` })),
        );
        mockSearchUsers.mockResolvedValueOnce([]);

        try {
          const res = await app.inject({
            method: 'GET',
            url: '/api/search',
            query: { q: 'react', ai: 'true' },
            headers: { authorization: `Bearer ${authToken}` },
          });

          expect(res.statusCode).toBe(200);
          expect(mockRunSearchChain).not.toHaveBeenCalled();
          expect(mockSearchPostsByTsvector).toHaveBeenCalledWith('react', expect.any(Object));
        } finally {
          (heldSlot as { release: () => void }).release();
        }
      });

      it('falls back to plain search when chain throws', async () => {
        mockRunSearchChain.mockRejectedValueOnce(new Error('chain exploded'));
        mockSearchPostsByTsvector.mockResolvedValueOnce(
          Array.from({ length: 5 }, (_, i) => makePostRow({ id: `id-${i}` })),
        );
        mockSearchUsers.mockResolvedValueOnce([]);

        const res = await app.inject({
          method: 'GET',
          url: '/api/search',
          query: { q: 'react', ai: 'true' },
          headers: { authorization: `Bearer ${authToken}` },
        });

        expect(res.statusCode).toBe(200);
        expect(mockRunSearchChain).toHaveBeenCalledOnce();
        expect(mockSearchPostsByTsvector).toHaveBeenCalledWith('react', expect.any(Object));
      });

      it('handles null contentType and empty tags in filters (covers ?? branches)', async () => {
        const filters: AiSearchFilters = {
          tags: [],
          language: null,
          contentType: null,
          textQuery: 'hooks',
        };
        mockRunSearchChain.mockResolvedValueOnce(filters);
        mockSearchPostsByTsvector.mockResolvedValueOnce(
          Array.from({ length: 5 }, (_, i) => makePostRow({ id: `id-${i}` })),
        );
        mockSearchUsers.mockResolvedValueOnce([]);

        const res = await app.inject({
          method: 'GET',
          url: '/api/search',
          query: { q: 'react hooks', ai: 'true' },
          headers: { authorization: `Bearer ${authToken}` },
        });

        expect(res.statusCode).toBe(200);
        // contentType and tag should be undefined (null ?? undefined)
        expect(mockSearchPostsByTsvector).toHaveBeenCalledWith(
          'hooks',
          expect.objectContaining({ contentType: undefined, tag: undefined }),
        );
      });

      it('passes filters to buildAiActions when AI chain succeeds', async () => {
        const filters: AiSearchFilters = {
          tags: [],
          language: 'python',
          contentType: 'snippet',
          textQuery: 'quicksort',
        };
        mockRunSearchChain.mockResolvedValueOnce(filters);
        mockSearchPostsByTsvector.mockResolvedValueOnce(
          Array.from({ length: 5 }, (_, i) => makePostRow({ id: `id-${i}` })),
        );
        mockSearchUsers.mockResolvedValueOnce([]);

        const res = await app.inject({
          method: 'GET',
          url: '/api/search',
          query: { q: 'python quicksort', ai: 'true' },
          headers: { authorization: `Bearer ${authToken}` },
        });

        expect(res.statusCode).toBe(200);
        const body = res.json();
        // AI actions should use filters-based generation (language-specific)
        expect(body.aiActions.some((a: { label: string }) => a.label.includes('python'))).toBe(
          true,
        );
      });

      it('uses plain buildAiActions (no filters) when AI path falls back', async () => {
        mockRunSearchChain.mockResolvedValueOnce(null);
        mockSearchPostsByTsvector.mockResolvedValueOnce(
          Array.from({ length: 5 }, (_, i) => makePostRow({ id: `id-${i}` })),
        );
        mockSearchUsers.mockResolvedValueOnce([]);

        const res = await app.inject({
          method: 'GET',
          url: '/api/search',
          query: { q: 'react', ai: 'true' },
          headers: { authorization: `Bearer ${authToken}` },
        });

        expect(res.statusCode).toBe(200);
        const body = res.json();
        // Falls back to stub actions with topic key
        expect(body.aiActions[0].params['topic']).toBe('react');
      });
    });

    // ─── Issue #49: pagination contract, author/since, AI×pagination ───

    describe('pagination contract', () => {
      it('returns page=1 and totalPages in the response shape', async () => {
        mockSearchPostsByTsvector.mockResolvedValueOnce(
          Array.from({ length: 5 }, (_, i) => makePostRow({ id: `id-${i}` })),
        );
        mockSearchUsers.mockResolvedValueOnce([]);
        mockCountSearchPosts.mockResolvedValueOnce(5);

        const res = await app.inject({
          method: 'GET',
          url: '/api/search',
          query: { q: 'typescript' },
          headers: { authorization: `Bearer ${token}` },
        });

        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.page).toBe(1);
        expect(body.totalPages).toBe(1);
      });

      it('computes totalPages as ceil(count / limit)', async () => {
        mockSearchPostsByTsvector.mockResolvedValueOnce(
          Array.from({ length: 20 }, (_, i) => makePostRow({ id: `id-${i}` })),
        );
        mockSearchUsers.mockResolvedValueOnce([]);
        mockCountSearchPosts.mockResolvedValueOnce(25);

        const res = await app.inject({
          method: 'GET',
          url: '/api/search',
          query: { q: 'fixture', tag: 'tag-pagination-fixture', limit: '20' },
          headers: { authorization: `Bearer ${token}` },
        });

        expect(res.statusCode).toBe(200);
        const body = res.json();
        // 25 / 20 = 1.25 → ceil = 2
        expect(body.totalPages).toBe(2);
      });

      it('passes page=2 to query layer (offset handled inside query helper)', async () => {
        mockSearchPostsByTsvector.mockResolvedValueOnce(
          Array.from({ length: 5 }, (_, i) => makePostRow({ id: `p2-${i}` })),
        );
        mockSearchUsers.mockResolvedValueOnce([]);
        mockCountSearchPosts.mockResolvedValueOnce(25);

        const res = await app.inject({
          method: 'GET',
          url: '/api/search',
          query: {
            q: 'fixture',
            tag: 'tag-pagination-fixture',
            limit: '20',
            page: '2',
          },
          headers: { authorization: `Bearer ${token}` },
        });

        expect(res.statusCode).toBe(200);
        expect(mockSearchPostsByTsvector).toHaveBeenCalledWith(
          'fixture',
          expect.objectContaining({ page: 2, limit: 20, tag: 'tag-pagination-fixture' }),
        );
      });

      it('clamps page > totalPages to last page (200 + empty snippets)', async () => {
        mockSearchPostsByTsvector.mockResolvedValueOnce(
          Array.from({ length: 5 }, (_, i) => makePostRow({ id: `id-${i}` })),
        );
        mockSearchUsers.mockResolvedValueOnce([]);
        mockCountSearchPosts.mockResolvedValueOnce(25);

        const res = await app.inject({
          method: 'GET',
          url: '/api/search',
          query: {
            q: 'fixture',
            tag: 'tag-pagination-fixture',
            limit: '20',
            page: '999',
          },
          headers: { authorization: `Bearer ${token}` },
        });

        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.snippets).toHaveLength(0);
        // Echoed page is clamped to totalPages (2)
        expect(body.page).toBe(2);
        expect(body.totalPages).toBe(2);
      });

      it('returns page=1 totalPages=0 when count is zero', async () => {
        mockSearchPostsByTsvector.mockResolvedValueOnce([]);
        mockSearchUsers.mockResolvedValueOnce([]);
        mockCountSearchPosts.mockResolvedValueOnce(0);

        const res = await app.inject({
          method: 'GET',
          url: '/api/search',
          query: { q: 'nothing' },
          headers: { authorization: `Bearer ${token}` },
        });

        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.page).toBe(1);
        expect(body.totalPages).toBe(0);
      });

      it('only top-ups trigram fallback on page=1', async () => {
        // Page 2: tsvector returns 2 rows (below threshold), but trigram MUST NOT be called
        mockSearchPostsByTsvector.mockResolvedValueOnce([
          makePostRow({ id: 'tsv-1' }),
          makePostRow({ id: 'tsv-2' }),
        ]);
        mockSearchUsers.mockResolvedValueOnce([]);
        mockCountSearchPosts.mockResolvedValueOnce(50);

        const res = await app.inject({
          method: 'GET',
          url: '/api/search',
          query: { q: 'react', limit: '20', page: '2' },
          headers: { authorization: `Bearer ${token}` },
        });

        expect(res.statusCode).toBe(200);
        expect(mockSearchPostsByTsvector).toHaveBeenCalledOnce();
        expect(mockSearchPostsByTrigram).not.toHaveBeenCalled();
      });

      it('rejects ?page=0 with 400', async () => {
        const res = await app.inject({
          method: 'GET',
          url: '/api/search',
          query: { q: 'typescript', page: '0' },
          headers: { authorization: `Bearer ${token}` },
        });

        expect(res.statusCode).toBe(400);
      });

      it('rejects ?page=1001 with 400', async () => {
        const res = await app.inject({
          method: 'GET',
          url: '/api/search',
          query: { q: 'typescript', page: '1001' },
          headers: { authorization: `Bearer ${token}` },
        });

        expect(res.statusCode).toBe(400);
      });
    });

    describe('author filter', () => {
      it('passes author to query layer', async () => {
        mockSearchPostsByTsvector.mockResolvedValueOnce([
          makePostRow({ author_display_name: 'Alice' }),
        ]);
        mockSearchUsers.mockResolvedValueOnce([]);
        mockCountSearchPosts.mockResolvedValueOnce(1);

        const res = await app.inject({
          method: 'GET',
          url: '/api/search',
          query: { q: 'typescript', author: 'Alice' },
          headers: { authorization: `Bearer ${token}` },
        });

        expect(res.statusCode).toBe(200);
        expect(mockSearchPostsByTsvector).toHaveBeenCalledWith(
          'typescript',
          expect.objectContaining({ author: 'Alice' }),
        );
      });

      it('rejects empty author with 400', async () => {
        const res = await app.inject({
          method: 'GET',
          url: '/api/search',
          query: { q: 'typescript', author: '' },
          headers: { authorization: `Bearer ${token}` },
        });

        expect(res.statusCode).toBe(400);
      });

      it('rejects author > 100 chars with 400', async () => {
        const res = await app.inject({
          method: 'GET',
          url: '/api/search',
          query: { q: 'typescript', author: 'a'.repeat(101) },
          headers: { authorization: `Bearer ${token}` },
        });

        expect(res.statusCode).toBe(400);
      });
    });

    describe('since filter', () => {
      it.each(['today', '7d', '30d'] as const)(
        'accepts since=%s and passes it to the query layer',
        async (sinceValue) => {
          mockSearchPostsByTsvector.mockResolvedValueOnce([]);
          mockSearchUsers.mockResolvedValueOnce([]);
          mockCountSearchPosts.mockResolvedValueOnce(0);

          const res = await app.inject({
            method: 'GET',
            url: '/api/search',
            query: { q: 'fixture', since: sinceValue },
            headers: { authorization: `Bearer ${token}` },
          });

          expect(res.statusCode).toBe(200);
          expect(mockSearchPostsByTsvector).toHaveBeenCalledWith(
            'fixture',
            expect.objectContaining({ since: sinceValue }),
          );
        },
      );

      it('rejects unknown since token with 400', async () => {
        const res = await app.inject({
          method: 'GET',
          url: '/api/search',
          query: { q: 'typescript', since: 'banana' },
          headers: { authorization: `Bearer ${token}` },
        });

        expect(res.statusCode).toBe(400);
      });

      it('rejects empty since with 400', async () => {
        const res = await app.inject({
          method: 'GET',
          url: '/api/search',
          query: { q: 'typescript', since: '' },
          headers: { authorization: `Bearer ${token}` },
        });

        expect(res.statusCode).toBe(400);
      });
    });

    describe('AI × pagination', () => {
      // TODO(WU7): The named mock-script key `search-resolves-to-typescript-tag`
      // does not yet exist. WU7 adds it (touches mock-scripts.ts and
      // packages/shared/src/types/mock-script-keys.ts). For WU2 we exercise
      // the AI page-1 gate using the existing mockRunSearchChain stub instead
      // of the X-Mock-Script header — same effect on the route logic.

      it('runs AI chain and echoes aiResolvedFilters when ai=true and page=1', async () => {
        const filters: AiSearchFilters = {
          tags: ['typescript'],
          language: 'typescript',
          contentType: 'snippet',
          textQuery: 'binary search',
        };
        mockRunSearchChain.mockResolvedValueOnce(filters);
        mockSearchPostsByTsvector.mockResolvedValueOnce(
          Array.from({ length: 5 }, (_, i) => makePostRow({ id: `id-${i}` })),
        );
        mockSearchUsers.mockResolvedValueOnce([]);
        mockCountSearchPosts.mockResolvedValueOnce(5);

        const res = await app.inject({
          method: 'GET',
          url: '/api/search',
          query: { q: 'typescript', ai: 'true', page: '1' },
          headers: { authorization: `Bearer ${token}` },
        });

        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.aiResolvedFilters).toBeDefined();
        expect(body.aiResolvedFilters?.tag).toBe('typescript');
        expect(body.aiResolvedFilters?.type).toBe('snippet');
        expect(mockRunSearchChain).toHaveBeenCalledOnce();
      });

      it('does not run AI chain when ai=true but page>=2', async () => {
        mockSearchPostsByTsvector.mockResolvedValueOnce(
          Array.from({ length: 5 }, (_, i) => makePostRow({ id: `id-${i}` })),
        );
        mockSearchUsers.mockResolvedValueOnce([]);
        mockCountSearchPosts.mockResolvedValueOnce(50);

        const res = await app.inject({
          method: 'GET',
          url: '/api/search',
          query: { q: 'typescript', ai: 'true', page: '2' },
          headers: { authorization: `Bearer ${token}` },
        });

        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.aiResolvedFilters).toBeUndefined();
        expect(mockRunSearchChain).not.toHaveBeenCalled();
      });

      it('omits aiResolvedFilters when AI chain returns null (fallback)', async () => {
        mockRunSearchChain.mockResolvedValueOnce(null);
        mockSearchPostsByTsvector.mockResolvedValueOnce(
          Array.from({ length: 5 }, (_, i) => makePostRow({ id: `id-${i}` })),
        );
        mockSearchUsers.mockResolvedValueOnce([]);
        mockCountSearchPosts.mockResolvedValueOnce(5);

        const res = await app.inject({
          method: 'GET',
          url: '/api/search',
          query: { q: 'typescript', ai: 'true', page: '1' },
          headers: { authorization: `Bearer ${token}` },
        });

        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.aiResolvedFilters).toBeUndefined();
      });

      it('omits aiResolvedFilters when ai filter has empty tags + null contentType', async () => {
        const filters: AiSearchFilters = {
          tags: [],
          language: null,
          contentType: null,
          textQuery: 'hooks',
        };
        mockRunSearchChain.mockResolvedValueOnce(filters);
        mockSearchPostsByTsvector.mockResolvedValueOnce(
          Array.from({ length: 5 }, (_, i) => makePostRow({ id: `id-${i}` })),
        );
        mockSearchUsers.mockResolvedValueOnce([]);
        mockCountSearchPosts.mockResolvedValueOnce(5);

        const res = await app.inject({
          method: 'GET',
          url: '/api/search',
          query: { q: 'react hooks', ai: 'true', page: '1' },
          headers: { authorization: `Bearer ${token}` },
        });

        expect(res.statusCode).toBe(200);
        const body = res.json();
        // No tag/type to echo → field should be omitted entirely
        expect(body.aiResolvedFilters).toBeUndefined();
      });
    });
  });
});
