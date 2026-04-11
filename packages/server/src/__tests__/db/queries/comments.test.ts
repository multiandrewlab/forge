import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

vi.mock('../../../db/connection.js', () => ({
  query: vi.fn(),
}));

import { query } from '../../../db/connection.js';
import { findCommentsByPostId, createComment } from '../../../db/queries/comments.js';
import type { CommentRow } from '../../../db/queries/types.js';

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
});
