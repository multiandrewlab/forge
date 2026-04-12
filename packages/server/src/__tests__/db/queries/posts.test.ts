import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

vi.mock('../../../db/connection.js', () => ({
  query: vi.fn(),
}));

import { query } from '../../../db/connection.js';
import {
  findPostById,
  createPost,
  findPostWithLatestRevision,
  updatePost,
  softDeletePost,
  publishPost,
} from '../../../db/queries/posts.js';
import type { PostRow, PostWithRevisionRow } from '../../../db/queries/types.js';

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

  describe('findPostWithLatestRevision', () => {
    const samplePostWithRevision: PostWithRevisionRow = {
      ...samplePost,
      revision_id: '880e8400-e29b-41d4-a716-446655440000',
      content: '# Hello World',
      revision_number: 2,
      message: 'Updated content',
    };

    it('returns post joined with latest revision', async () => {
      mockQuery.mockResolvedValue({ rows: [samplePostWithRevision], rowCount: 1 });
      const result = await findPostWithLatestRevision(samplePost.id);
      expect(mockQuery).toHaveBeenCalledWith(
        `SELECT p.*, pr.id AS revision_id, pr.content, pr.revision_number, pr.message FROM posts p INNER JOIN post_revisions pr ON pr.post_id = p.id WHERE p.id = $1 AND p.deleted_at IS NULL ORDER BY pr.revision_number DESC LIMIT 1`,
        [samplePost.id],
      );
      expect(result).toEqual(samplePostWithRevision);
    });

    it('returns null when post not found', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
      const result = await findPostWithLatestRevision('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('updatePost', () => {
    it('updates a single field and returns the updated row', async () => {
      const updatedPost = { ...samplePost, title: 'New Title' };
      mockQuery.mockResolvedValue({ rows: [updatedPost], rowCount: 1 });
      const result = await updatePost(samplePost.id, { title: 'New Title' });
      expect(mockQuery).toHaveBeenCalledWith(
        'UPDATE posts SET title = $1, updated_at = NOW() WHERE id = $2 AND deleted_at IS NULL RETURNING *',
        ['New Title', samplePost.id],
      );
      expect(result).toEqual(updatedPost);
    });

    it('updates multiple fields and returns the updated row', async () => {
      const updatedPost = { ...samplePost, title: 'New Title', visibility: 'private' };
      mockQuery.mockResolvedValue({ rows: [updatedPost], rowCount: 1 });
      const result = await updatePost(samplePost.id, {
        title: 'New Title',
        visibility: 'private',
      });
      expect(mockQuery).toHaveBeenCalledWith(
        'UPDATE posts SET title = $1, visibility = $2, updated_at = NOW() WHERE id = $3 AND deleted_at IS NULL RETURNING *',
        ['New Title', 'private', samplePost.id],
      );
      expect(result).toEqual(updatedPost);
    });

    it('falls back to findPostById when no fields provided', async () => {
      mockQuery.mockResolvedValue({ rows: [samplePost], rowCount: 1 });
      const result = await updatePost(samplePost.id, {});
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM posts WHERE id = $1 AND deleted_at IS NULL',
        [samplePost.id],
      );
      expect(result).toEqual(samplePost);
    });

    it('returns null when post not found', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
      const result = await updatePost('nonexistent', { title: 'New' });
      expect(result).toBeNull();
    });
  });

  describe('softDeletePost', () => {
    it('sets deleted_at and returns true when post exists', async () => {
      mockQuery.mockResolvedValue({ rows: [samplePost], rowCount: 1 });
      const result = await softDeletePost(samplePost.id);
      expect(mockQuery).toHaveBeenCalledWith(
        'UPDATE posts SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id',
        [samplePost.id],
      );
      expect(result).toBe(true);
    });

    it('returns false when post not found or already deleted', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
      const result = await softDeletePost('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('publishPost', () => {
    it('sets is_draft to false and returns the updated row', async () => {
      const publishedPost = { ...samplePost, is_draft: false };
      mockQuery.mockResolvedValue({ rows: [publishedPost], rowCount: 1 });
      const result = await publishPost(samplePost.id);
      expect(mockQuery).toHaveBeenCalledWith(
        'UPDATE posts SET is_draft = false, updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING *',
        [samplePost.id],
      );
      expect(result).toEqual(publishedPost);
    });

    it('returns null when post not found', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
      const result = await publishPost('nonexistent');
      expect(result).toBeNull();
    });
  });
});
