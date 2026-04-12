import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

vi.mock('../../../db/connection.js', () => ({
  query: vi.fn(),
}));

import { query } from '../../../db/connection.js';
import {
  findRevisionsByPostId,
  findRevision,
  createRevision,
  createRevisionAtomic,
} from '../../../db/queries/revisions.js';
import type { PostRevisionRow } from '../../../db/queries/types.js';

const mockQuery = query as Mock;

const sampleRevision: PostRevisionRow = {
  id: '770e8400-e29b-41d4-a716-446655440000',
  post_id: '660e8400-e29b-41d4-a716-446655440000',
  author_id: '550e8400-e29b-41d4-a716-446655440000',
  content: '# Hello World',
  message: 'Initial version',
  revision_number: 1,
  created_at: new Date('2026-01-01'),
};

describe('revision queries', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('findRevisionsByPostId', () => {
    it('returns revisions ordered by revision_number desc', async () => {
      mockQuery.mockResolvedValue({ rows: [sampleRevision], rowCount: 1 });
      const result = await findRevisionsByPostId(sampleRevision.post_id);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM post_revisions WHERE post_id = $1 ORDER BY revision_number DESC',
        [sampleRevision.post_id],
      );
      expect(result).toEqual([sampleRevision]);
    });
  });

  describe('findRevision', () => {
    it('returns a specific revision by post and number', async () => {
      mockQuery.mockResolvedValue({ rows: [sampleRevision], rowCount: 1 });
      const result = await findRevision(sampleRevision.post_id, 1);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM post_revisions WHERE post_id = $1 AND revision_number = $2',
        [sampleRevision.post_id, 1],
      );
      expect(result).toEqual(sampleRevision);
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
      const result = await findRevision('id', 999);
      expect(result).toBeNull();
    });
  });

  describe('createRevision', () => {
    it('inserts a revision and returns the row', async () => {
      mockQuery.mockResolvedValue({ rows: [sampleRevision], rowCount: 1 });
      const result = await createRevision({
        postId: sampleRevision.post_id,
        authorId: sampleRevision.author_id as string,
        content: '# Hello World',
        message: 'Initial version',
        revisionNumber: 1,
      });
      expect(mockQuery).toHaveBeenCalledWith(
        `INSERT INTO post_revisions (post_id, author_id, content, message, revision_number) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [sampleRevision.post_id, sampleRevision.author_id, '# Hello World', 'Initial version', 1],
      );
      expect(result).toEqual(sampleRevision);
    });
  });

  describe('createRevisionAtomic', () => {
    it('inserts a revision with auto-incremented revision_number and returns the row', async () => {
      const atomicRevision: PostRevisionRow = {
        ...sampleRevision,
        revision_number: 3,
        message: 'Atomic revision',
      };
      mockQuery.mockResolvedValue({ rows: [atomicRevision], rowCount: 1 });
      const result = await createRevisionAtomic({
        postId: sampleRevision.post_id,
        authorId: sampleRevision.author_id as string,
        content: '# Hello World',
        message: 'Atomic revision',
      });
      expect(mockQuery).toHaveBeenCalledWith(
        `INSERT INTO post_revisions (post_id, author_id, content, message, revision_number)
     SELECT $1, $2, $3, $4, COALESCE(MAX(revision_number), 0) + 1
     FROM post_revisions WHERE post_id = $1
     RETURNING *`,
        [sampleRevision.post_id, sampleRevision.author_id, '# Hello World', 'Atomic revision'],
      );
      expect(result).toEqual(atomicRevision);
    });

    it('handles null message', async () => {
      const atomicRevision: PostRevisionRow = {
        ...sampleRevision,
        revision_number: 1,
        message: null,
      };
      mockQuery.mockResolvedValue({ rows: [atomicRevision], rowCount: 1 });
      const result = await createRevisionAtomic({
        postId: sampleRevision.post_id,
        authorId: sampleRevision.author_id as string,
        content: '# Hello World',
        message: null,
      });
      expect(mockQuery).toHaveBeenCalledWith(
        `INSERT INTO post_revisions (post_id, author_id, content, message, revision_number)
     SELECT $1, $2, $3, $4, COALESCE(MAX(revision_number), 0) + 1
     FROM post_revisions WHERE post_id = $1
     RETURNING *`,
        [sampleRevision.post_id, sampleRevision.author_id, '# Hello World', null],
      );
      expect(result).toEqual(atomicRevision);
    });
  });
});
