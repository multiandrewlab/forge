import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

vi.mock('../../../db/connection.js', () => ({
  query: vi.fn(),
}));

import { query } from '../../../db/connection.js';
import {
  searchPostsByTsvector,
  searchPostsByTrigram,
  searchUsers,
  countSearchPosts,
} from '../../../db/queries/search.js';
import type { SearchPostRow, SearchUserRow } from '../../../db/queries/search.js';

const mockQuery = query as Mock;

const samplePostRow: SearchPostRow = {
  id: '660e8400-e29b-41d4-a716-446655440000',
  title: 'Test Post',
  content_type: 'snippet',
  language: 'typescript',
  author_id: '550e8400-e29b-41d4-a716-446655440000',
  author_display_name: 'Alice',
  author_avatar_url: 'https://example.com/alice.png',
  excerpt: 'Some content here...',
  rank: 0.65,
};

const sampleUserRow: SearchUserRow = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  display_name: 'Alice',
  avatar_url: 'https://example.com/alice.png',
  post_count: 5,
};

describe('search queries', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  // ─── searchPostsByTsvector ───

  describe('searchPostsByTsvector', () => {
    it('builds correct SQL and params with no optional filters', async () => {
      mockQuery.mockResolvedValue({ rows: [samplePostRow], rowCount: 1 });

      const result = await searchPostsByTsvector('typescript basics', {});

      expect(result).toEqual([samplePostRow]);
      expect(mockQuery).toHaveBeenCalledOnce();

      const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];

      // Core SQL fragments
      expect(sql).toContain("plainto_tsquery('forge_search', $1)");
      expect(sql).toContain('ts_rank(p.search_vector, query)');
      expect(sql).toContain('p.search_vector @@ query');
      expect(sql).toContain('p.deleted_at IS NULL');
      expect(sql).toContain("p.visibility = 'public'");
      expect(sql).toContain('LEFT(pr.content, 200) AS excerpt');
      expect(sql).toContain('LEFT JOIN LATERAL');
      expect(sql).toContain('JOIN users u ON u.id = p.author_id');
      expect(sql).toContain('ORDER BY rank DESC');

      // No content_type or tag filter
      expect(sql).not.toContain('p.content_type =');
      expect(sql).not.toContain('post_tags');

      // Params: $1 = q, $2 = limit (default 20), $3 = offset (default 0)
      expect(params).toEqual(['typescript basics', 20, 0]);
    });

    it('adds content_type filter when contentType is provided', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await searchPostsByTsvector('test', { contentType: 'snippet' });

      const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];

      expect(sql).toContain('p.content_type = $2');
      expect(params).toEqual(['test', 'snippet', 20, 0]);
    });

    it('adds tag filter when tag is provided', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await searchPostsByTsvector('test', { tag: 'javascript' });

      const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];

      expect(sql).toContain('EXISTS');
      expect(sql).toContain('post_tags');
      expect(sql).toContain('t.name = $2');
      expect(params).toEqual(['test', 'javascript', 20, 0]);
    });

    it('adds both contentType and tag filters', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await searchPostsByTsvector('test', { contentType: 'snippet', tag: 'javascript' });

      const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];

      expect(sql).toContain('p.content_type = $2');
      expect(sql).toContain('t.name = $3');
      expect(params).toEqual(['test', 'snippet', 'javascript', 20, 0]);
    });

    it('respects custom limit', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await searchPostsByTsvector('test', { limit: 5 });

      const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
      // Final two params: limit=5, offset=0
      expect(params[params.length - 2]).toBe(5);
      expect(params[params.length - 1]).toBe(0);
    });

    it('handles single-quote in query via parameterisation (no interpolation)', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await searchPostsByTsvector("it's a test", {});

      const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];

      // The query string must appear as a parameter, never in the SQL text
      expect(sql).not.toContain("it's");
      expect(params[0]).toBe("it's a test");
    });
  });

  // ─── searchPostsByTrigram ───

  describe('searchPostsByTrigram', () => {
    it('builds correct SQL and params with no optional filters', async () => {
      mockQuery.mockResolvedValue({ rows: [samplePostRow], rowCount: 1 });

      const result = await searchPostsByTrigram('typescript basics', {});

      expect(result).toEqual([samplePostRow]);
      expect(mockQuery).toHaveBeenCalledOnce();

      const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];

      // Core SQL fragments
      expect(sql).toContain('similarity(p.title, $1)');
      expect(sql).toContain('p.title % $1');
      expect(sql).toContain('similarity(p.title, $1) > 0.3');
      expect(sql).toContain('p.deleted_at IS NULL');
      expect(sql).toContain("p.visibility = 'public'");
      expect(sql).toContain('LEFT(pr.content, 200) AS excerpt');
      expect(sql).toContain('LEFT JOIN LATERAL');
      expect(sql).toContain('JOIN users u ON u.id = p.author_id');
      expect(sql).toContain('ORDER BY rank DESC');

      // No content_type or tag filter
      expect(sql).not.toContain('p.content_type =');
      expect(sql).not.toContain('post_tags');

      // Params: $1 = q, $2 = limit (default 20), $3 = offset (default 0)
      expect(params).toEqual(['typescript basics', 20, 0]);
    });

    it('adds content_type filter when contentType is provided', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await searchPostsByTrigram('test', { contentType: 'snippet' });

      const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];

      expect(sql).toContain('p.content_type = $2');
      expect(params).toEqual(['test', 'snippet', 20, 0]);
    });

    it('adds tag filter when tag is provided', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await searchPostsByTrigram('test', { tag: 'javascript' });

      const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];

      expect(sql).toContain('post_tags');
      expect(sql).toContain('t.name = $2');
      expect(params).toEqual(['test', 'javascript', 20, 0]);
    });

    it('adds both contentType and tag filters', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await searchPostsByTrigram('test', { contentType: 'snippet', tag: 'javascript' });

      const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];

      expect(sql).toContain('p.content_type = $2');
      expect(sql).toContain('t.name = $3');
      expect(params).toEqual(['test', 'snippet', 'javascript', 20, 0]);
    });

    it('respects custom limit', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await searchPostsByTrigram('test', { limit: 10 });

      const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
      // Final two params: limit=10, offset=0
      expect(params[params.length - 2]).toBe(10);
      expect(params[params.length - 1]).toBe(0);
    });

    it('handles single-quote in query via parameterisation (no interpolation)', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await searchPostsByTrigram("it's a test", {});

      const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];

      expect(sql).not.toContain("it's");
      expect(params[0]).toBe("it's a test");
    });
  });

  // ─── searchUsers ───

  describe('searchUsers', () => {
    it('builds correct SQL and params', async () => {
      mockQuery.mockResolvedValue({ rows: [sampleUserRow], rowCount: 1 });

      const result = await searchUsers('Alice', {});

      expect(result).toEqual([sampleUserRow]);
      expect(mockQuery).toHaveBeenCalledOnce();

      const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];

      expect(sql).toContain('u.display_name');
      expect(sql).toContain('u.avatar_url');
      expect(sql).toContain('post_count');
      expect(sql).toContain(
        "p.deleted_at IS NULL AND p.visibility = 'public' AND p.is_draft = false",
      );
      expect(sql).toContain('LEFT JOIN posts p ON p.author_id = u.id');
      expect(sql).toContain('GROUP BY u.id');
      expect(sql).toContain('similarity(u.display_name, $1)');
      expect(sql).toContain('ILIKE');
      expect(sql).toContain('ORDER BY similarity(u.display_name, $1) DESC');

      // $1 = q, $2 = q (for ILIKE), $3 = limit
      expect(params).toEqual(['Alice', 'Alice', 10]);
    });

    it('respects custom limit', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await searchUsers('Bob', { limit: 5 });

      const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
      expect(params[params.length - 1]).toBe(5);
    });

    it('handles single-quote in query via parameterisation (no interpolation)', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await searchUsers("O'Brien", {});

      const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];

      expect(sql).not.toContain("O'Brien");
      expect(params[0]).toBe("O'Brien");
      expect(params[1]).toBe("O'Brien");
    });
  });

  // ─── Issue #49: author / since / page / countSearchPosts ───

  describe('searchPostsByTsvector — author filter', () => {
    it('adds case-insensitive author predicate when author is provided', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await searchPostsByTsvector('typescript', { author: 'Alice' });

      const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];

      expect(sql).toContain('LOWER(u.display_name) = LOWER($2)');
      expect(params).toEqual(['typescript', 'Alice', 20, 0]);
    });
  });

  describe('searchPostsByTsvector — since filter', () => {
    it.each([
      ['today', '1 day'],
      ['7d', '7 days'],
      ['30d', '30 days'],
    ] as const)('adds NOW() - interval predicate for since=%s', async (token, intervalStr) => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await searchPostsByTsvector('typescript', { since: token });

      const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];

      expect(sql).toContain('p.created_at >= NOW() - $2::interval');
      expect(params).toEqual(['typescript', intervalStr, 20, 0]);
    });
  });

  describe('searchPostsByTsvector — pagination', () => {
    it('uses OFFSET 0 for page=1 (default)', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await searchPostsByTsvector('test', {});

      const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];

      expect(sql).toContain('OFFSET');
      // Final two params should be limit then offset
      expect(params).toEqual(['test', 20, 0]);
    });

    it('computes OFFSET = (page - 1) * limit for page=2', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await searchPostsByTsvector('test', { page: 2, limit: 20 });

      const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];

      // [q, limit, offset]
      expect(params).toEqual(['test', 20, 20]);
    });

    it('computes OFFSET = 40 for page=3 limit=20', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await searchPostsByTsvector('test', { page: 3, limit: 20 });

      const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
      expect(params).toEqual(['test', 20, 40]);
    });
  });

  describe('searchPostsByTrigram — author/since/page', () => {
    it('adds author predicate when author is provided', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await searchPostsByTrigram('test', { author: 'Bob' });

      const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];

      expect(sql).toContain('LOWER(u.display_name) = LOWER($2)');
      expect(params).toEqual(['test', 'Bob', 20, 0]);
    });

    it('adds since predicate when since is provided', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await searchPostsByTrigram('test', { since: '7d' });

      const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];

      expect(sql).toContain('p.created_at >= NOW() - $2::interval');
      expect(params).toEqual(['test', '7 days', 20, 0]);
    });

    it('computes OFFSET for page=2', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await searchPostsByTrigram('test', { page: 2, limit: 10 });

      const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
      expect(params).toEqual(['test', 10, 10]);
    });
  });

  describe('searchPostsByTsvector — combined filters', () => {
    it('chains contentType, tag, author, since, and pagination together', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await searchPostsByTsvector('test', {
        contentType: 'snippet',
        tag: 'javascript',
        author: 'Alice',
        since: 'today',
        limit: 10,
        page: 2,
      });

      const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];

      expect(sql).toContain('p.content_type = $2');
      expect(sql).toContain('t.name = $3');
      expect(sql).toContain('LOWER(u.display_name) = LOWER($4)');
      expect(sql).toContain('p.created_at >= NOW() - $5::interval');
      // [q, contentType, tag, author, intervalStr, limit, offset]
      expect(params).toEqual(['test', 'snippet', 'javascript', 'Alice', '1 day', 10, 10]);
    });
  });

  describe('countSearchPosts', () => {
    it('issues a SELECT COUNT(*) over the same WHERE clause', async () => {
      mockQuery.mockResolvedValue({ rows: [{ count: '42' }], rowCount: 1 });

      const total = await countSearchPosts('typescript', {});

      const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];

      expect(sql).toContain('SELECT COUNT(*)');
      expect(sql).toContain("plainto_tsquery('forge_search', $1)");
      expect(sql).toContain('p.search_vector @@ query');
      expect(sql).toContain('p.deleted_at IS NULL');
      expect(sql).toContain("p.visibility = 'public'");
      // No ORDER BY / LIMIT / OFFSET in count query
      expect(sql).not.toContain('ORDER BY');
      expect(sql).not.toContain('LIMIT');
      expect(sql).not.toContain('OFFSET');
      expect(params).toEqual(['typescript']);
      expect(total).toBe(42);
    });

    it('counts with all filters (contentType, tag, author, since)', async () => {
      mockQuery.mockResolvedValue({ rows: [{ count: '7' }], rowCount: 1 });

      const total = await countSearchPosts('test', {
        contentType: 'snippet',
        tag: 'javascript',
        author: 'Alice',
        since: '30d',
      });

      const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];

      expect(sql).toContain('p.content_type = $2');
      expect(sql).toContain('t.name = $3');
      expect(sql).toContain('LOWER(u.display_name) = LOWER($4)');
      expect(sql).toContain('p.created_at >= NOW() - $5::interval');
      expect(params).toEqual(['test', 'snippet', 'javascript', 'Alice', '30 days']);
      expect(total).toBe(7);
    });

    it('returns 0 when the count row is missing', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const total = await countSearchPosts('nothing', {});
      expect(total).toBe(0);
    });

    it('handles numeric (non-string) count values from drivers that already cast', async () => {
      mockQuery.mockResolvedValue({ rows: [{ count: 5 }], rowCount: 1 });

      const total = await countSearchPosts('test', {});
      expect(total).toBe(5);
    });
  });
});
