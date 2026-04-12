import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

vi.mock('../../../db/connection.js', () => ({
  query: vi.fn(),
}));

import { query } from '../../../db/connection.js';
import { createBookmark, deleteBookmark, getUserBookmark } from '../../../db/queries/bookmarks.js';
import type { BookmarkRow } from '../../../db/queries/types.js';

const mockQuery = query as Mock;

const sampleBookmark: BookmarkRow = {
  user_id: '550e8400-e29b-41d4-a716-446655440000',
  post_id: '660e8400-e29b-41d4-a716-446655440000',
  created_at: new Date('2026-01-01'),
};

describe('bookmark queries', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('createBookmark', () => {
    it('inserts a bookmark and returns the row', async () => {
      mockQuery.mockResolvedValue({ rows: [sampleBookmark], rowCount: 1 });
      const result = await createBookmark(sampleBookmark.user_id, sampleBookmark.post_id);
      expect(mockQuery).toHaveBeenCalledWith(
        'INSERT INTO bookmarks (user_id, post_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING *',
        [sampleBookmark.user_id, sampleBookmark.post_id],
      );
      expect(result).toEqual(sampleBookmark);
    });

    it('returns null when bookmark already exists (ON CONFLICT)', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
      const result = await createBookmark('u1', 'p1');
      expect(result).toBeNull();
    });
  });

  describe('deleteBookmark', () => {
    it('deletes a bookmark and returns true when deleted', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });
      const result = await deleteBookmark(sampleBookmark.user_id, sampleBookmark.post_id);
      expect(mockQuery).toHaveBeenCalledWith(
        'DELETE FROM bookmarks WHERE user_id = $1 AND post_id = $2',
        [sampleBookmark.user_id, sampleBookmark.post_id],
      );
      expect(result).toBe(true);
    });

    it('returns false when no bookmark existed', async () => {
      mockQuery.mockResolvedValue({ rowCount: 0 });
      const result = await deleteBookmark('u1', 'p1');
      expect(result).toBe(false);
    });

    it('returns false when rowCount is null', async () => {
      mockQuery.mockResolvedValue({ rowCount: null });
      const result = await deleteBookmark('u1', 'p1');
      expect(result).toBe(false);
    });
  });

  describe('getUserBookmark', () => {
    it('returns the bookmark row when it exists', async () => {
      mockQuery.mockResolvedValue({ rows: [sampleBookmark], rowCount: 1 });
      const result = await getUserBookmark(sampleBookmark.user_id, sampleBookmark.post_id);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM bookmarks WHERE user_id = $1 AND post_id = $2',
        [sampleBookmark.user_id, sampleBookmark.post_id],
      );
      expect(result).toEqual(sampleBookmark);
    });

    it('returns null when no bookmark exists', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
      const result = await getUserBookmark('u1', 'p1');
      expect(result).toBeNull();
    });
  });
});
