import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

vi.mock('../../../db/connection.js', () => ({
  query: vi.fn(),
}));

import { query } from '../../../db/connection.js';
import { findPostById, createPost } from '../../../db/queries/posts.js';
import type { PostRow } from '../../../db/queries/types.js';

const mockQuery = query as Mock;

const samplePost: PostRow = {
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
  vote_count: 0,
  view_count: 0,
  search_vector: null,
  deleted_at: null,
  created_at: new Date('2026-01-01'),
  updated_at: new Date('2026-01-01'),
};

describe('post queries', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('findPostById', () => {
    it('returns the post when found and not deleted', async () => {
      mockQuery.mockResolvedValue({ rows: [samplePost], rowCount: 1 });
      const result = await findPostById(samplePost.id);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM posts WHERE id = $1 AND deleted_at IS NULL',
        [samplePost.id],
      );
      expect(result).toEqual(samplePost);
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
      const result = await findPostById('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('createPost', () => {
    it('inserts a post and returns the row', async () => {
      mockQuery.mockResolvedValue({ rows: [samplePost], rowCount: 1 });
      const result = await createPost({
        authorId: samplePost.author_id,
        title: 'Test Post',
        contentType: 'snippet',
        language: 'typescript',
        visibility: 'public',
        isDraft: false,
      });
      expect(mockQuery).toHaveBeenCalledWith(
        `INSERT INTO posts (author_id, title, content_type, language, visibility, is_draft) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [samplePost.author_id, 'Test Post', 'snippet', 'typescript', 'public', false],
      );
      expect(result).toEqual(samplePost);
    });
  });
});
