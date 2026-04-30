import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

vi.mock('../../../db/connection.js', () => ({
  query: vi.fn(),
}));

import { query } from '../../../db/connection.js';
import {
  findPostById,
  createPost,
  createForkedPost,
  findPostWithLatestRevision,
  updatePost,
  softDeletePost,
  publishPost,
  updateLinkPreview,
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
    it('inserts a post without link fields and passes null for link_url and link_preview', async () => {
      mockQuery.mockResolvedValue({ rows: [samplePost], rowCount: 1 });
      const result = await createPost({
        authorId: samplePost.author_id,
        title: 'Test Post',
        contentType: 'snippet',
        language: 'typescript',
        visibility: 'public',
        isDraft: false,
      });
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('link_url, link_preview'), [
        samplePost.author_id,
        'Test Post',
        'snippet',
        'typescript',
        'public',
        false,
        null,
        null,
      ]);
      expect(result).toEqual(samplePost);
    });

    it('inserts a post with linkUrl and linkPreview fields', async () => {
      const linkPreview = {
        title: 'Example',
        description: 'An example page',
        image: 'https://example.com/img.png',
        readingTime: 5,
      };
      const postWithLink: PostRow = {
        ...samplePost,
        link_url: 'https://example.com',
        link_preview: linkPreview,
      };
      mockQuery.mockResolvedValue({ rows: [postWithLink], rowCount: 1 });

      const result = await createPost({
        authorId: samplePost.author_id,
        title: 'Link Post',
        contentType: 'snippet',
        language: null,
        visibility: 'public',
        isDraft: false,
        linkUrl: 'https://example.com',
        linkPreview: linkPreview,
      });

      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('link_url, link_preview'), [
        samplePost.author_id,
        'Link Post',
        'snippet',
        null,
        'public',
        false,
        'https://example.com',
        JSON.stringify(linkPreview),
      ]);
      expect(result).toEqual(postWithLink);
    });

    it('inserts a post with linkUrl but no linkPreview', async () => {
      const postWithLinkUrl: PostRow = {
        ...samplePost,
        link_url: 'https://example.com',
        link_preview: null,
      };
      mockQuery.mockResolvedValue({ rows: [postWithLinkUrl], rowCount: 1 });

      const result = await createPost({
        authorId: samplePost.author_id,
        title: 'URL Only Post',
        contentType: 'snippet',
        language: null,
        visibility: 'public',
        isDraft: false,
        linkUrl: 'https://example.com',
      });

      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('link_url, link_preview'), [
        samplePost.author_id,
        'URL Only Post',
        'snippet',
        null,
        'public',
        false,
        'https://example.com',
        null,
      ]);
      expect(result).toEqual(postWithLinkUrl);
    });
  });

  describe('updateLinkPreview', () => {
    it('updates link_preview and updated_at for a post', async () => {
      const preview = {
        title: 'Updated Title',
        description: 'Updated desc',
        image: null,
        readingTime: 3,
      };
      const updatedPost: PostRow = {
        ...samplePost,
        link_preview: preview,
        updated_at: new Date('2026-06-01'),
      };
      mockQuery.mockResolvedValue({ rows: [updatedPost], rowCount: 1 });

      const result = await updateLinkPreview(samplePost.id, preview);

      expect(mockQuery).toHaveBeenCalledWith(
        `UPDATE posts SET link_preview = $1, updated_at = NOW()
     WHERE id = $2 AND deleted_at IS NULL
     RETURNING *`,
        [JSON.stringify(preview), samplePost.id],
      );
      expect(result).toEqual(updatedPost);
    });

    it('clears link_preview when null is passed', async () => {
      const clearedPost: PostRow = {
        ...samplePost,
        link_preview: null,
        updated_at: new Date('2026-06-01'),
      };
      mockQuery.mockResolvedValue({ rows: [clearedPost], rowCount: 1 });

      const result = await updateLinkPreview(samplePost.id, null);

      expect(mockQuery).toHaveBeenCalledWith(
        `UPDATE posts SET link_preview = $1, updated_at = NOW()
     WHERE id = $2 AND deleted_at IS NULL
     RETURNING *`,
        [null, samplePost.id],
      );
      expect(result).toEqual(clearedPost);
    });
  });

  describe('findPostWithLatestRevision', () => {
    const samplePostWithRevision: PostWithRevisionRow = {
      ...samplePost,
      revision_id: '880e8400-e29b-41d4-a716-446655440000',
      content: '# Hello World',
      revision_number: 2,
      message: 'Updated content',
      tags: null,
    };

    it('returns post joined with latest revision', async () => {
      mockQuery.mockResolvedValue({ rows: [samplePostWithRevision], rowCount: 1 });
      const result = await findPostWithLatestRevision(samplePost.id);
      // SQL contains the tags subquery via string_agg (mirrors findFeedPostById pattern).
      // Match by normalized substring to avoid coupling test to whitespace.
      const calls = mockQuery.mock.calls as Array<[string, unknown[]]>;
      expect(calls).toHaveLength(1);
      const firstCall = calls[0] as [string, unknown[]];
      const [sql, params] = firstCall;
      expect(sql).toContain(
        'SELECT p.*, pr.id AS revision_id, pr.content, pr.revision_number, pr.message',
      );
      expect(sql).toContain("string_agg(t.name, ',' ORDER BY t.name)");
      expect(sql).toContain('FROM post_tags pt');
      expect(sql).toContain('JOIN tags t ON t.id = pt.tag_id');
      expect(sql).toContain('AS tags');
      expect(sql).toContain('INNER JOIN post_revisions pr ON pr.post_id = p.id');
      expect(sql).toContain('ORDER BY pr.revision_number DESC');
      expect(sql).toContain('LIMIT 1');
      expect(params).toEqual([samplePost.id]);
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

  describe('createForkedPost', () => {
    it('creates a post with forked_from_id set', async () => {
      const forkedRow = { ...samplePost, forked_from_id: 'source-post-id' };
      mockQuery.mockResolvedValueOnce({ rows: [forkedRow], rowCount: 1 });

      const result = await createForkedPost({
        authorId: samplePost.author_id,
        title: 'Forked Post',
        contentType: 'snippet',
        language: 'typescript',
        visibility: 'private',
        isDraft: true,
        forkedFromId: 'source-post-id',
      });

      expect(result.forked_from_id).toBe('source-post-id');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('forked_from_id'),
        expect.arrayContaining(['source-post-id']),
      );
    });
  });
});
