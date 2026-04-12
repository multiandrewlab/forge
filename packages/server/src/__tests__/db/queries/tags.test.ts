import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

vi.mock('../../../db/connection.js', () => ({
  query: vi.fn(),
}));

import { query } from '../../../db/connection.js';
import {
  findTagByName,
  findTagById,
  createTag,
  addPostTag,
  removePostTag,
  searchTags,
  findPopularTags,
  subscribeToTag,
  unsubscribeFromTag,
  getUserSubscriptions,
} from '../../../db/queries/tags.js';
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

  describe('findTagById', () => {
    it('returns the tag when found', async () => {
      mockQuery.mockResolvedValue({ rows: [sampleTag], rowCount: 1 });
      const result = await findTagById(sampleTag.id);
      expect(mockQuery).toHaveBeenCalledWith('SELECT * FROM tags WHERE id = $1', [sampleTag.id]);
      expect(result).toEqual(sampleTag);
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
      const result = await findTagById('nonexistent');
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

    it('returns null when post_tag already exists (ON CONFLICT)', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
      const result = await addPostTag('post-1', 'tag-1');
      expect(result).toBeNull();
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

    it('returns false when rowCount is null', async () => {
      mockQuery.mockResolvedValue({ rowCount: null });
      const result = await removePostTag('post-1', 'tag-1');
      expect(result).toBe(false);
    });
  });

  describe('searchTags', () => {
    it('returns matching tags ordered by post_count', async () => {
      const tags: TagRow[] = [
        { id: 'tag-1', name: 'typescript', post_count: 10 },
        { id: 'tag-2', name: 'types', post_count: 3 },
      ];
      mockQuery.mockResolvedValue({ rows: tags, rowCount: 2 });

      const result = await searchTags('typ', 20);

      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM tags WHERE name ILIKE $1 ORDER BY post_count DESC LIMIT $2',
        ['typ%', 20],
      );
      expect(result).toEqual(tags);
    });

    it('returns empty array when no tags match', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await searchTags('zzz', 10);

      expect(result).toEqual([]);
    });
  });

  describe('findPopularTags', () => {
    it('returns tags with post_count > 0 ordered by post_count', async () => {
      const tags: TagRow[] = [
        { id: 'tag-1', name: 'javascript', post_count: 50 },
        { id: 'tag-2', name: 'typescript', post_count: 30 },
      ];
      mockQuery.mockResolvedValue({ rows: tags, rowCount: 2 });

      const result = await findPopularTags(10);

      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM tags WHERE post_count > 0 ORDER BY post_count DESC LIMIT $1',
        [10],
      );
      expect(result).toEqual(tags);
    });

    it('returns empty array when no popular tags exist', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await findPopularTags(10);

      expect(result).toEqual([]);
    });
  });

  describe('subscribeToTag', () => {
    it('returns true when subscription is created', async () => {
      mockQuery.mockResolvedValue({
        rows: [{ user_id: 'user-1', tag_id: 'tag-1' }],
        rowCount: 1,
      });

      const result = await subscribeToTag('user-1', 'tag-1');

      expect(mockQuery).toHaveBeenCalledWith(
        'INSERT INTO user_tag_subscriptions (user_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING *',
        ['user-1', 'tag-1'],
      );
      expect(result).toBe(true);
    });

    it('returns false when subscription already exists (ON CONFLICT)', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await subscribeToTag('user-1', 'tag-1');

      expect(result).toBe(false);
    });
  });

  describe('unsubscribeFromTag', () => {
    it('returns true when subscription is deleted', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });

      const result = await unsubscribeFromTag('user-1', 'tag-1');

      expect(mockQuery).toHaveBeenCalledWith(
        'DELETE FROM user_tag_subscriptions WHERE user_id = $1 AND tag_id = $2',
        ['user-1', 'tag-1'],
      );
      expect(result).toBe(true);
    });

    it('returns false when no subscription existed', async () => {
      mockQuery.mockResolvedValue({ rowCount: 0 });

      const result = await unsubscribeFromTag('user-1', 'tag-1');

      expect(result).toBe(false);
    });

    it('returns false when rowCount is null', async () => {
      mockQuery.mockResolvedValue({ rowCount: null });

      const result = await unsubscribeFromTag('user-1', 'tag-1');

      expect(result).toBe(false);
    });
  });

  describe('getUserSubscriptions', () => {
    it('returns tags the user is subscribed to', async () => {
      const tags: TagRow[] = [
        { id: 'tag-1', name: 'javascript', post_count: 50 },
        { id: 'tag-2', name: 'typescript', post_count: 30 },
      ];
      mockQuery.mockResolvedValue({ rows: tags, rowCount: 2 });

      const result = await getUserSubscriptions('user-1');

      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT t.* FROM tags t JOIN user_tag_subscriptions uts ON uts.tag_id = t.id WHERE uts.user_id = $1 ORDER BY t.name',
        ['user-1'],
      );
      expect(result).toEqual(tags);
    });

    it('returns empty array when user has no subscriptions', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await getUserSubscriptions('user-1');

      expect(result).toEqual([]);
    });
  });
});
