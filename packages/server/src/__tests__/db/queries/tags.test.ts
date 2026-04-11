import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

vi.mock('../../../db/connection.js', () => ({
  query: vi.fn(),
}));

import { query } from '../../../db/connection.js';
import { findTagByName, createTag, addPostTag, removePostTag } from '../../../db/queries/tags.js';
import type { TagRow, PostTagRow } from '../../../db/queries/types.js';

const mockQuery = query as Mock;

const sampleTag: TagRow = {
  id: '880e8400-e29b-41d4-a716-446655440000',
  name: 'typescript',
  post_count: 5,
};

describe('tag queries', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('findTagByName', () => {
    it('returns the tag when found', async () => {
      mockQuery.mockResolvedValue({ rows: [sampleTag], rowCount: 1 });
      const result = await findTagByName('typescript');
      expect(mockQuery).toHaveBeenCalledWith('SELECT * FROM tags WHERE name = $1', ['typescript']);
      expect(result).toEqual(sampleTag);
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
      const result = await findTagByName('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('createTag', () => {
    it('inserts a tag and returns the row', async () => {
      mockQuery.mockResolvedValue({ rows: [sampleTag], rowCount: 1 });
      const result = await createTag('typescript');
      expect(mockQuery).toHaveBeenCalledWith('INSERT INTO tags (name) VALUES ($1) RETURNING *', [
        'typescript',
      ]);
      expect(result).toEqual(sampleTag);
    });
  });

  describe('addPostTag', () => {
    it('inserts a post_tag row', async () => {
      const row: PostTagRow = { post_id: 'post-1', tag_id: 'tag-1' };
      mockQuery.mockResolvedValue({ rows: [row], rowCount: 1 });
      const result = await addPostTag('post-1', 'tag-1');
      expect(mockQuery).toHaveBeenCalledWith(
        'INSERT INTO post_tags (post_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING *',
        ['post-1', 'tag-1'],
      );
      expect(result).toEqual(row);
    });
  });

  describe('removePostTag', () => {
    it('deletes a post_tag row and returns true when deleted', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });
      const result = await removePostTag('post-1', 'tag-1');
      expect(mockQuery).toHaveBeenCalledWith(
        'DELETE FROM post_tags WHERE post_id = $1 AND tag_id = $2',
        ['post-1', 'tag-1'],
      );
      expect(result).toBe(true);
    });

    it('returns false when no row existed', async () => {
      mockQuery.mockResolvedValue({ rowCount: 0 });
      const result = await removePostTag('post-1', 'tag-1');
      expect(result).toBe(false);
    });
  });
});
