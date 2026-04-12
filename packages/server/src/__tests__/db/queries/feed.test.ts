import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

vi.mock('../../../db/connection.js', () => ({
  query: vi.fn(),
}));

import { query } from '../../../db/connection.js';
import { findFeedPosts } from '../../../db/queries/feed.js';
import type { PostWithAuthorRow } from '../../../db/queries/feed.js';

const mockQuery = query as Mock;

const sampleRow: PostWithAuthorRow = {
  id: '660e8400-e29b-41d4-a716-446655440000',
  author_id: '550e8400-e29b-41d4-a716-446655440000',
  title: 'Test Post',
  content_type: 'snippet',
  language: 'typescript',
  visibility: 'public',
  is_draft: false,
  forked_from_id: null,
  link_url: null,
  link_preview: null,
  vote_count: 10,
  view_count: 100,
  search_vector: null,
  deleted_at: null,
  created_at: new Date('2026-01-01'),
  updated_at: new Date('2026-01-01'),
  author_display_name: 'Alice',
  author_avatar_url: null,
  tags: 'typescript,node',
};

const userId = '550e8400-e29b-41d4-a716-446655440000';

describe('findFeedPosts', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('default (no options)', () => {
    it('queries with deleted_at IS NULL, is_draft = false, trending sort, limit 21', async () => {
      mockQuery.mockResolvedValue({ rows: [sampleRow], rowCount: 1 });
      const result = await findFeedPosts({ userId });
      expect(mockQuery).toHaveBeenCalledOnce();
      const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('p.deleted_at IS NULL');
      expect(sql).toContain('p.is_draft = false');
      // trending sort uses vote_count decay
      expect(sql).toContain('vote_count');
      expect(result.posts).toHaveLength(1);
      expect(result.hasMore).toBe(false);
      // userId should be in params even for default query (needed for bookmarks left join or just unused)
      expect(Array.isArray(params)).toBe(true);
    });

    it('returns hasMore=true when limit+1 rows returned', async () => {
      const rows = Array.from({ length: 21 }, (_, i) => ({ ...sampleRow, id: `id-${i}` }));
      mockQuery.mockResolvedValue({ rows, rowCount: 21 });
      const result = await findFeedPosts({ userId });
      expect(result.hasMore).toBe(true);
      expect(result.posts).toHaveLength(20);
    });
  });

  describe('sort options', () => {
    it('uses created_at DESC for sort=recent', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
      await findFeedPosts({ userId, sort: 'recent' });
      const [sql] = mockQuery.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('p.created_at DESC');
    });

    it('uses vote_count DESC for sort=top', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
      await findFeedPosts({ userId, sort: 'top' });
      const [sql] = mockQuery.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('p.vote_count DESC');
    });

    it('defaults to trending sort when sort is undefined', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
      await findFeedPosts({ userId });
      const [sql] = mockQuery.mock.calls[0] as [string, unknown[]];
      // trending sort formula includes time decay
      expect(sql.toLowerCase()).toContain('epoch');
    });
  });

  describe('filter=mine', () => {
    it('filters by author_id and includes drafts', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
      await findFeedPosts({ userId, filter: 'mine' });
      const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('p.author_id =');
      // should NOT contain is_draft = false constraint
      expect(sql).not.toContain('p.is_draft = false');
      expect(params).toContain(userId);
    });
  });

  describe('filter=bookmarked', () => {
    it('joins bookmarks table for the user', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
      await findFeedPosts({ userId, filter: 'bookmarked' });
      const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
      expect(sql.toLowerCase()).toContain('bookmarks');
      expect(params).toContain(userId);
    });
  });

  describe('tag filter', () => {
    it('joins post_tags and tags tables when tag is provided', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
      await findFeedPosts({ userId, tag: 'typescript' });
      const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
      expect(sql.toLowerCase()).toContain('post_tags');
      expect(sql.toLowerCase()).toContain('tags');
      expect(params).toContain('typescript');
    });
  });

  describe('type filter', () => {
    it('adds WHERE content_type = $N when type is provided', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
      await findFeedPosts({ userId, type: 'snippet' });
      const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('p.content_type =');
      expect(params).toContain('snippet');
    });
  });

  describe('cursor pagination', () => {
    it('adds WHERE clause from base64-decoded cursor', async () => {
      const cursorData = { createdAt: '2026-01-01T00:00:00.000Z', id: 'abc-123' };
      const cursor = Buffer.from(JSON.stringify(cursorData)).toString('base64');
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
      await findFeedPosts({ userId, cursor });
      const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
      // cursor values must be parameterized
      expect(params).toContain('abc-123');
      expect(sql).toContain('p.created_at');
    });
  });

  describe('limit clamping', () => {
    it('clamps limit to max 100', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
      await findFeedPosts({ userId, limit: 999 });
      const [sql] = mockQuery.mock.calls[0] as [string, unknown[]];
      // LIMIT in SQL should be 101 (100 + 1 for hasMore detection)
      expect(sql).toContain('LIMIT');
      const limitMatch = sql.match(/LIMIT\s+\$(\d+)/);
      expect(limitMatch).not.toBeNull();
      const matchResult = limitMatch as RegExpMatchArray;
      const limitParamIndex = Number(matchResult[1]) - 1;
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[limitParamIndex]).toBe(101);
    });

    it('uses provided limit+1 for hasMore detection', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
      await findFeedPosts({ userId, limit: 5 });
      const [sql] = mockQuery.mock.calls[0] as [string, unknown[]];
      const limitMatch = sql.match(/LIMIT\s+\$(\d+)/);
      expect(limitMatch).not.toBeNull();
      const matchResult = limitMatch as RegExpMatchArray;
      const limitParamIndex = Number(matchResult[1]) - 1;
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[limitParamIndex]).toBe(6);
    });
  });

  describe('SQL injection safety', () => {
    it('never uses string interpolation for user inputs', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
      await findFeedPosts({ userId, tag: "'; DROP TABLE posts; --", type: 'snippet' });
      const [sql] = mockQuery.mock.calls[0] as [string, unknown[]];
      expect(sql).not.toContain("'; DROP TABLE posts; --");
    });
  });
});
