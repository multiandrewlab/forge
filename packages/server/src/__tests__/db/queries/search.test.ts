import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

vi.mock('../../../db/connection.js', () => ({
  query: vi.fn(),
}));

import { query } from '../../../db/connection.js';
import {
  searchPostsByTsvector,
  searchPostsByTrigram,
  searchUsers,
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

      // Params: $1 = q, $2 = limit (default 20)
      expect(params).toEqual(['typescript basics', 20]);
    });

    it('adds content_type filter when contentType is provided', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await searchPostsByTsvector('test', { contentType: 'snippet' });

      const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];

      expect(sql).toContain('p.content_type = $2');
      expect(params).toEqual(['test', 'snippet', 20]);
    });

    it('adds tag filter when tag is provided', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await searchPostsByTsvector('test', { tag: 'javascript' });

      const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];

      expect(sql).toContain('EXISTS');
      expect(sql).toContain('post_tags');
      expect(sql).toContain('t.name = $2');
      expect(params).toEqual(['test', 'javascript', 20]);
    });

    it('adds both contentType and tag filters', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await searchPostsByTsvector('test', { contentType: 'snippet', tag: 'javascript' });

      const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];

      expect(sql).toContain('p.content_type = $2');
      expect(sql).toContain('t.name = $3');
      expect(params).toEqual(['test', 'snippet', 'javascript', 20]);
    });

    it('respects custom limit', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await searchPostsByTsvector('test', { limit: 5 });

      const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
      expect(params[params.length - 1]).toBe(5);
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

      // Params: $1 = q, $2 = limit (default 20)
      expect(params).toEqual(['typescript basics', 20]);
    });

    it('adds content_type filter when contentType is provided', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await searchPostsByTrigram('test', { contentType: 'snippet' });

      const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];

      expect(sql).toContain('p.content_type = $2');
      expect(params).toEqual(['test', 'snippet', 20]);
    });

    it('adds tag filter when tag is provided', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await searchPostsByTrigram('test', { tag: 'javascript' });

      const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];

      expect(sql).toContain('post_tags');
      expect(sql).toContain('t.name = $2');
      expect(params).toEqual(['test', 'javascript', 20]);
    });

    it('adds both contentType and tag filters', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await searchPostsByTrigram('test', { contentType: 'snippet', tag: 'javascript' });

      const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];

      expect(sql).toContain('p.content_type = $2');
      expect(sql).toContain('t.name = $3');
      expect(params).toEqual(['test', 'snippet', 'javascript', 20]);
    });

    it('respects custom limit', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await searchPostsByTrigram('test', { limit: 10 });

      const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
      expect(params[params.length - 1]).toBe(10);
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
});
