import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

vi.mock('../../../db/connection.js', () => ({
  query: vi.fn(),
}));

import { query } from '../../../db/connection.js';
import {
  getUserPostCount,
  getUserTotalVotes,
  getUserTopTags,
  getTopContributors,
  getTagExperts,
  getUserPublicPosts,
} from '../../../db/queries/user-profiles.js';
import type {
  TopTagRow,
  TopContributorRow,
  TagExpertRow,
  UserPublicPostRow,
} from '../../../db/queries/user-profiles.js';

const mockQuery = query as Mock;

const userId = '550e8400-e29b-41d4-a716-446655440000';

describe('user-profiles queries', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('getUserPostCount', () => {
    it('returns the count of public non-draft non-deleted posts', async () => {
      mockQuery.mockResolvedValue({ rows: [{ count: '7' }] });
      const result = await getUserPostCount(userId);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('COUNT(*)'),
        [userId],
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("visibility = 'public'"),
        [userId],
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('is_draft = false'),
        [userId],
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('deleted_at IS NULL'),
        [userId],
      );
      expect(result).toBe(7);
    });

    it('returns 0 when no rows returned', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      const result = await getUserPostCount(userId);
      expect(result).toBe(0);
    });
  });

  describe('getUserTotalVotes', () => {
    it('returns the COALESCE sum of vote_count across non-deleted posts', async () => {
      mockQuery.mockResolvedValue({ rows: [{ total: '42' }] });
      const result = await getUserTotalVotes(userId);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('COALESCE'),
        [userId],
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('vote_count'),
        [userId],
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('deleted_at IS NULL'),
        [userId],
      );
      expect(result).toBe(42);
    });

    it('returns 0 when no rows returned', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      const result = await getUserTotalVotes(userId);
      expect(result).toBe(0);
    });
  });

  describe('getUserTopTags', () => {
    it('returns top 5 tags by vote sum with JOINs through post_tags', async () => {
      const rows: TopTagRow[] = [
        { tag_id: 't1', tag_name: 'typescript', vote_sum: 20 },
        { tag_id: 't2', tag_name: 'rust', vote_sum: 15 },
      ];
      mockQuery.mockResolvedValue({ rows: rows.map((r) => ({ ...r, vote_sum: String(r.vote_sum) })) });
      const result = await getUserTopTags(userId);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('post_tags'),
        [userId],
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('tags'),
        [userId],
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT 5'),
        [userId],
      );
      expect(result).toEqual(rows);
    });

    it('returns empty array when user has no tagged posts', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      const result = await getUserTopTags(userId);
      expect(result).toEqual([]);
    });
  });

  describe('getTopContributors', () => {
    it('returns top 3 authors with HAVING COUNT>=3 AND SUM>=5', async () => {
      const rows: TopContributorRow[] = [
        { author_id: 'a1', display_name: 'Alice', avatar_url: 'https://img/a', post_count: 10, vote_sum: 50 },
        { author_id: 'a2', display_name: 'Bob', avatar_url: null, post_count: 5, vote_sum: 20 },
      ];
      mockQuery.mockResolvedValue({
        rows: rows.map((r) => ({
          ...r,
          post_count: String(r.post_count),
          vote_sum: String(r.vote_sum),
        })),
      });
      const result = await getTopContributors();
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('HAVING'),
        [],
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT 3'),
        [],
      );
      expect(result).toEqual(rows);
    });

    it('returns empty array when no contributors meet thresholds', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      const result = await getTopContributors();
      expect(result).toEqual([]);
    });
  });

  describe('getTagExperts', () => {
    it('returns tags where user is top contributor with CTE and HAVING thresholds', async () => {
      const rows: TagExpertRow[] = [
        { tag_id: 't1', tag_name: 'typescript', post_count: 5, vote_sum: 30 },
      ];
      mockQuery.mockResolvedValue({
        rows: rows.map((r) => ({
          ...r,
          post_count: String(r.post_count),
          vote_sum: String(r.vote_sum),
        })),
      });
      const result = await getTagExperts(userId);
      // Verify CTE finds top contributor per tag
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DISTINCT ON'),
        [userId],
      );
      // Verify minimum thresholds
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('HAVING'),
        [userId],
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('post_tags'),
        [userId],
      );
      expect(result).toEqual(rows);
    });

    it('returns empty array when user has no expert tags', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      const result = await getTagExperts(userId);
      expect(result).toEqual([]);
    });
  });

  describe('getUserPublicPosts', () => {
    it('returns paginated public posts with STRING_AGG tags', async () => {
      const rows: UserPublicPostRow[] = [
        {
          id: 'p1',
          title: 'My Post',
          content_type: 'snippet',
          language: 'typescript',
          vote_count: 5,
          created_at: new Date('2026-01-01'),
          tags: 'typescript,rust',
        },
      ];
      mockQuery.mockResolvedValue({
        rows: rows.map((r) => ({ ...r, vote_count: String(r.vote_count) })),
      });
      const result = await getUserPublicPosts(userId, 10);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('STRING_AGG'),
        [userId, 10],
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("visibility = 'public'"),
        [userId, 10],
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('is_draft = false'),
        [userId, 10],
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('deleted_at IS NULL'),
        [userId, 10],
      );
      expect(result).toEqual(rows);
    });

    it('applies cursor-based pagination when cursor is provided', async () => {
      const cursor = new Date('2026-01-15');
      const rows: UserPublicPostRow[] = [
        {
          id: 'p3',
          title: 'Older Post',
          content_type: 'snippet',
          language: 'go',
          vote_count: 3,
          created_at: new Date('2026-01-10'),
          tags: 'go',
        },
      ];
      mockQuery.mockResolvedValue({
        rows: rows.map((r) => ({ ...r, vote_count: String(r.vote_count) })),
      });
      const result = await getUserPublicPosts(userId, 10, cursor);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('created_at <'),
        [userId, cursor, 10],
      );
      expect(result).toEqual(rows);
    });

    it('returns empty array when user has no public posts', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      const result = await getUserPublicPosts(userId, 10);
      expect(result).toEqual([]);
    });

    it('returns posts with null tags when post has no tags', async () => {
      const rows: UserPublicPostRow[] = [
        {
          id: 'p2',
          title: 'Untagged Post',
          content_type: 'snippet',
          language: null,
          vote_count: 0,
          created_at: new Date('2026-02-01'),
          tags: null,
        },
      ];
      mockQuery.mockResolvedValue({
        rows: rows.map((r) => ({ ...r, vote_count: String(r.vote_count) })),
      });
      const result = await getUserPublicPosts(userId, 5);
      expect(result).toEqual(rows);
    });
  });
});
