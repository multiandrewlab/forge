import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

vi.mock('../../../db/connection.js', () => ({
  query: vi.fn(),
}));

import { query } from '../../../db/connection.js';
import { findFilesByRevisionId, createPostFile } from '../../../db/queries/post-files.js';
import type { PostFileRow } from '../../../db/queries/types.js';

const mockQuery = query as Mock;

const sampleFile: PostFileRow = {
  id: 'ff000000-0000-0000-0000-000000000001',
  post_id: '660e8400-e29b-41d4-a716-446655440000',
  revision_id: '770e8400-e29b-41d4-a716-446655440000',
  filename: 'main.ts',
  content: 'console.log("hello")',
  storage_key: null,
  mime_type: 'text/typescript',
  sort_order: 0,
  created_at: new Date('2026-01-01'),
};

describe('post file queries', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('findFilesByRevisionId', () => {
    it('returns files ordered by sort_order', async () => {
      mockQuery.mockResolvedValue({ rows: [sampleFile], rowCount: 1 });
      const result = await findFilesByRevisionId(sampleFile.revision_id);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM post_files WHERE revision_id = $1 ORDER BY sort_order ASC',
        [sampleFile.revision_id],
      );
      expect(result).toEqual([sampleFile]);
    });
  });

  describe('createPostFile', () => {
    it('inserts a file and returns the row', async () => {
      mockQuery.mockResolvedValue({ rows: [sampleFile], rowCount: 1 });
      const result = await createPostFile({
        postId: sampleFile.post_id,
        revisionId: sampleFile.revision_id,
        filename: 'main.ts',
        content: 'console.log("hello")',
        storageKey: null,
        mimeType: 'text/typescript',
        sortOrder: 0,
      });
      expect(mockQuery).toHaveBeenCalledWith(
        `INSERT INTO post_files (post_id, revision_id, filename, content, storage_key, mime_type, sort_order) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [
          sampleFile.post_id,
          sampleFile.revision_id,
          'main.ts',
          'console.log("hello")',
          null,
          'text/typescript',
          0,
        ],
      );
      expect(result).toEqual(sampleFile);
    });
  });
});
