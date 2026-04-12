import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

vi.mock('../../../db/connection.js', () => ({
  query: vi.fn(),
}));

import { query } from '../../../db/connection.js';
import {
  findCommentsByPostId,
  createComment,
  findCommentsByPostIdWithAuthor,
  findCommentsByPostIdWithAuthorForRevision,
  findCommentById,
  updateComment,
  deleteComment,
} from '../../../db/queries/comments.js';
import type { CommentRow, CommentWithAuthorRow } from '../../../db/queries/types.js';

const mockQuery = query as Mock;

const sampleComment: CommentRow = {
  id: '990e8400-e29b-41d4-a716-446655440000',
  post_id: '660e8400-e29b-41d4-a716-446655440000',
  author_id: '550e8400-e29b-41d4-a716-446655440000',
  parent_id: null,
  line_number: null,
  revision_id: null,
  body: 'Great post!',
  created_at: new Date('2026-01-01'),
  updated_at: new Date('2026-01-01'),
};

const sampleRevisionId = '770e8400-e29b-41d4-a716-446655440000';

const sampleCommentWithAuthor: CommentWithAuthorRow = {
  ...sampleComment,
  revision_id: sampleRevisionId,
  author_display_name: 'Jane Doe',
  author_avatar_url: 'https://example.com/avatar.png',
  revision_number: 1,
};

describe('comment queries', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('findCommentsByPostId', () => {
    it('returns comments ordered by created_at', async () => {
      mockQuery.mockResolvedValue({ rows: [sampleComment], rowCount: 1 });
      const result = await findCommentsByPostId(sampleComment.post_id);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM comments WHERE post_id = $1 ORDER BY created_at ASC',
        [sampleComment.post_id],
      );
      expect(result).toEqual([sampleComment]);
    });
  });

  describe('createComment', () => {
    it('inserts a comment and returns the row', async () => {
      mockQuery.mockResolvedValue({ rows: [sampleComment], rowCount: 1 });
      const result = await createComment({
        postId: sampleComment.post_id,
        authorId: sampleComment.author_id as string,
        parentId: null,
        lineNumber: null,
        revisionId: null,
        body: 'Great post!',
      });
      expect(mockQuery).toHaveBeenCalledWith(
        `INSERT INTO comments (post_id, author_id, parent_id, line_number, revision_id, body) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [sampleComment.post_id, sampleComment.author_id, null, null, null, 'Great post!'],
      );
      expect(result).toEqual(sampleComment);
    });
  });

  describe('findCommentsByPostIdWithAuthor', () => {
    it('returns comments with author info ordered by created_at', async () => {
      mockQuery.mockResolvedValue({ rows: [sampleCommentWithAuthor], rowCount: 1 });
      const result = await findCommentsByPostIdWithAuthor(sampleComment.post_id);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('LEFT JOIN users u ON u.id = c.author_id'),
        [sampleComment.post_id],
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('LEFT JOIN post_revisions pr ON pr.id = c.revision_id'),
        [sampleComment.post_id],
      );
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('WHERE c.post_id = $1'), [
        sampleComment.post_id,
      ]);
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('ORDER BY c.created_at ASC'), [
        sampleComment.post_id,
      ]);
      expect(result).toEqual([sampleCommentWithAuthor]);
    });

    it('returns empty array when no comments exist', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
      const result = await findCommentsByPostIdWithAuthor(sampleComment.post_id);
      expect(result).toEqual([]);
    });
  });

  describe('findCommentsByPostIdWithAuthorForRevision', () => {
    it('returns comments for a specific revision or with null revision_id', async () => {
      mockQuery.mockResolvedValue({ rows: [sampleCommentWithAuthor], rowCount: 1 });
      const result = await findCommentsByPostIdWithAuthorForRevision(
        sampleComment.post_id,
        sampleRevisionId,
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('c.revision_id = $2 OR c.revision_id IS NULL'),
        [sampleComment.post_id, sampleRevisionId],
      );
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('ORDER BY c.created_at ASC'), [
        sampleComment.post_id,
        sampleRevisionId,
      ]);
      expect(result).toEqual([sampleCommentWithAuthor]);
    });

    it('returns empty array when no comments match', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
      const result = await findCommentsByPostIdWithAuthorForRevision(
        sampleComment.post_id,
        sampleRevisionId,
      );
      expect(result).toEqual([]);
    });
  });

  describe('findCommentById', () => {
    it('returns a comment when found', async () => {
      mockQuery.mockResolvedValue({ rows: [sampleComment], rowCount: 1 });
      const result = await findCommentById(sampleComment.id);
      expect(mockQuery).toHaveBeenCalledWith('SELECT * FROM comments WHERE id = $1', [
        sampleComment.id,
      ]);
      expect(result).toEqual(sampleComment);
    });

    it('returns null when comment not found', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
      const result = await findCommentById('nonexistent-id');
      expect(mockQuery).toHaveBeenCalledWith('SELECT * FROM comments WHERE id = $1', [
        'nonexistent-id',
      ]);
      expect(result).toBeNull();
    });
  });

  describe('updateComment', () => {
    it('updates the body and returns the updated row', async () => {
      const updatedComment = {
        ...sampleComment,
        body: 'Updated body',
        updated_at: new Date('2026-02-01'),
      };
      mockQuery.mockResolvedValue({ rows: [updatedComment], rowCount: 1 });
      const result = await updateComment(sampleComment.id, 'Updated body');
      expect(mockQuery).toHaveBeenCalledWith(
        'UPDATE comments SET body = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
        ['Updated body', sampleComment.id],
      );
      expect(result).toEqual(updatedComment);
    });

    it('returns null when comment does not exist', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
      const result = await updateComment('nonexistent-id', 'Updated body');
      expect(result).toBeNull();
    });
  });

  describe('deleteComment', () => {
    it('returns true when a comment is deleted', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });
      const result = await deleteComment(sampleComment.id);
      expect(mockQuery).toHaveBeenCalledWith('DELETE FROM comments WHERE id = $1', [
        sampleComment.id,
      ]);
      expect(result).toBe(true);
    });

    it('returns false when comment does not exist', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
      const result = await deleteComment('nonexistent-id');
      expect(result).toBe(false);
    });

    it('returns false when rowCount is null', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: null });
      const result = await deleteComment('nonexistent-id');
      expect(result).toBe(false);
    });
  });
});
