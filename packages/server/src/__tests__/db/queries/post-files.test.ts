import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

vi.mock('../../../db/connection.js', () => ({
  query: vi.fn(),
}));

import { query } from '../../../db/connection.js';
import {
  findFilesByRevisionId,
  createPostFile,
  findStagedFilesByPostId,
  findStagedFileById,
  getNextSortOrder,
  setStagedFileRevision,
  carryForwardFile,
  deleteFileById,
  findStaleStagedFiles,
  deleteStagedFilesByIds,
} from '../../../db/queries/post-files.js';
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
  file_size: null,
  created_at: new Date('2026-01-01'),
};

const stagedFile: PostFileRow = {
  id: 'ff000000-0000-0000-0000-000000000002',
  post_id: '660e8400-e29b-41d4-a716-446655440000',
  revision_id: null,
  filename: 'staged.ts',
  content: 'const x = 1;',
  storage_key: null,
  mime_type: 'text/typescript',
  sort_order: 0,
  file_size: 42,
  created_at: new Date('2026-01-01'),
};

describe('post file queries', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('findFilesByRevisionId', () => {
    it('returns files ordered by sort_order', async () => {
      mockQuery.mockResolvedValue({ rows: [sampleFile], rowCount: 1 });
      const result = await findFilesByRevisionId(sampleFile.revision_id as string);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM post_files WHERE revision_id = $1 ORDER BY sort_order ASC',
        [sampleFile.revision_id],
      );
      expect(result).toEqual([sampleFile]);
    });
  });

  describe('createPostFile', () => {
    it('inserts a file with all 8 columns and returns the row', async () => {
      mockQuery.mockResolvedValue({ rows: [sampleFile], rowCount: 1 });
      const result = await createPostFile({
        postId: sampleFile.post_id,
        revisionId: sampleFile.revision_id,
        filename: 'main.ts',
        content: 'console.log("hello")',
        storageKey: null,
        mimeType: 'text/typescript',
        sortOrder: 0,
        fileSize: null,
      });
      expect(mockQuery).toHaveBeenCalledWith(
        `INSERT INTO post_files (post_id, revision_id, filename, content, storage_key, mime_type, sort_order, file_size) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [
          sampleFile.post_id,
          sampleFile.revision_id,
          'main.ts',
          'console.log("hello")',
          null,
          'text/typescript',
          0,
          null,
        ],
      );
      expect(result).toEqual(sampleFile);
    });

    it('inserts a staged file with null revision_id', async () => {
      mockQuery.mockResolvedValue({ rows: [stagedFile], rowCount: 1 });
      const result = await createPostFile({
        postId: stagedFile.post_id,
        revisionId: null,
        filename: 'staged.ts',
        content: 'const x = 1;',
        storageKey: null,
        mimeType: 'text/typescript',
        sortOrder: 0,
        fileSize: 42,
      });
      expect(mockQuery).toHaveBeenCalledWith(
        `INSERT INTO post_files (post_id, revision_id, filename, content, storage_key, mime_type, sort_order, file_size) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [stagedFile.post_id, null, 'staged.ts', 'const x = 1;', null, 'text/typescript', 0, 42],
      );
      expect(result).toEqual(stagedFile);
    });
  });

  describe('findStagedFilesByPostId', () => {
    it('returns staged files (revision_id IS NULL) ordered by sort_order', async () => {
      mockQuery.mockResolvedValue({ rows: [stagedFile], rowCount: 1 });
      const result = await findStagedFilesByPostId(stagedFile.post_id);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM post_files WHERE post_id = $1 AND revision_id IS NULL ORDER BY sort_order ASC',
        [stagedFile.post_id],
      );
      expect(result).toEqual([stagedFile]);
    });

    it('returns empty array when no staged files exist', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
      const result = await findStagedFilesByPostId('nonexistent-post-id');
      expect(result).toEqual([]);
    });
  });

  describe('findStagedFileById', () => {
    it('returns a staged file matching id and post_id', async () => {
      mockQuery.mockResolvedValue({ rows: [stagedFile], rowCount: 1 });
      const result = await findStagedFileById(stagedFile.id, stagedFile.post_id);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM post_files WHERE id = $1 AND post_id = $2 AND revision_id IS NULL',
        [stagedFile.id, stagedFile.post_id],
      );
      expect(result).toEqual(stagedFile);
    });

    it('returns undefined when file is not found', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
      const result = await findStagedFileById('nonexistent', stagedFile.post_id);
      expect(result).toBeUndefined();
    });
  });

  describe('getNextSortOrder', () => {
    it('returns next sort order based on max of staged files', async () => {
      mockQuery.mockResolvedValue({ rows: [{ next: 3 }], rowCount: 1 });
      const result = await getNextSortOrder(stagedFile.post_id);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM post_files WHERE post_id = $1 AND revision_id IS NULL',
        [stagedFile.post_id],
      );
      expect(result).toBe(3);
    });

    it('returns 0 when no staged files exist', async () => {
      mockQuery.mockResolvedValue({ rows: [{ next: 0 }], rowCount: 1 });
      const result = await getNextSortOrder('empty-post');
      expect(result).toBe(0);
    });
  });

  describe('setStagedFileRevision', () => {
    it('updates revision_id and storage_key for a staged file', async () => {
      const updatedFile: PostFileRow = {
        ...stagedFile,
        revision_id: '770e8400-e29b-41d4-a716-446655440000',
        storage_key: 'uploads/file.ts',
      };
      mockQuery.mockResolvedValue({ rows: [updatedFile], rowCount: 1 });
      const result = await setStagedFileRevision(
        stagedFile.id,
        stagedFile.post_id,
        '770e8400-e29b-41d4-a716-446655440000',
        'uploads/file.ts',
      );
      expect(mockQuery).toHaveBeenCalledWith(
        'UPDATE post_files SET revision_id = $3, storage_key = $4 WHERE id = $1 AND post_id = $2 AND revision_id IS NULL RETURNING *',
        [
          stagedFile.id,
          stagedFile.post_id,
          '770e8400-e29b-41d4-a716-446655440000',
          'uploads/file.ts',
        ],
      );
      expect(result).toEqual(updatedFile);
    });

    it('returns undefined when no matching staged file exists', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
      const result = await setStagedFileRevision(
        'nonexistent',
        stagedFile.post_id,
        '770e8400-e29b-41d4-a716-446655440000',
        null,
      );
      expect(result).toBeUndefined();
    });
  });

  describe('carryForwardFile', () => {
    it('inserts a new row copying fields from sourceFile with new revision_id', async () => {
      const carriedFile: PostFileRow = {
        ...sampleFile,
        id: 'ff000000-0000-0000-0000-000000000099',
        revision_id: '880e8400-e29b-41d4-a716-446655440000',
      };
      mockQuery.mockResolvedValue({ rows: [carriedFile], rowCount: 1 });
      const result = await carryForwardFile(sampleFile, '880e8400-e29b-41d4-a716-446655440000');
      expect(mockQuery).toHaveBeenCalledWith(
        `INSERT INTO post_files (post_id, revision_id, filename, content, storage_key, mime_type, sort_order, file_size) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [
          sampleFile.post_id,
          '880e8400-e29b-41d4-a716-446655440000',
          sampleFile.filename,
          sampleFile.content,
          sampleFile.storage_key,
          sampleFile.mime_type,
          sampleFile.sort_order,
          sampleFile.file_size,
        ],
      );
      expect(result).toEqual(carriedFile);
    });
  });

  describe('deleteFileById', () => {
    it('deletes a staged file and returns true', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });
      const result = await deleteFileById(stagedFile.id, stagedFile.post_id);
      expect(mockQuery).toHaveBeenCalledWith(
        'DELETE FROM post_files WHERE id = $1 AND post_id = $2 AND revision_id IS NULL',
        [stagedFile.id, stagedFile.post_id],
      );
      expect(result).toBe(true);
    });

    it('returns false when no matching staged file exists', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
      const result = await deleteFileById('nonexistent', stagedFile.post_id);
      expect(result).toBe(false);
    });

    it('returns false when rowCount is null (nullish coalescing branch)', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: null });
      const result = await deleteFileById(stagedFile.id, stagedFile.post_id);
      expect(result).toBe(false);
    });
  });

  describe('findStaleStagedFiles', () => {
    it('returns staged files older than 24 hours', async () => {
      const staleFile: PostFileRow = { ...stagedFile, created_at: new Date('2025-01-01') };
      mockQuery.mockResolvedValue({ rows: [staleFile], rowCount: 1 });
      const result = await findStaleStagedFiles();
      expect(mockQuery).toHaveBeenCalledWith(
        "SELECT * FROM post_files WHERE revision_id IS NULL AND created_at < NOW() - INTERVAL '24 hours'",
        [],
      );
      expect(result).toEqual([staleFile]);
    });

    it('returns empty array when no stale staged files exist', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
      const result = await findStaleStagedFiles();
      expect(result).toEqual([]);
    });
  });

  describe('deleteStagedFilesByIds', () => {
    it('deletes staged files by ids and returns count', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 3 });
      const ids = ['id-1', 'id-2', 'id-3'];
      const result = await deleteStagedFilesByIds(ids);
      expect(mockQuery).toHaveBeenCalledWith(
        'DELETE FROM post_files WHERE id = ANY($1) AND revision_id IS NULL',
        [ids],
      );
      expect(result).toBe(3);
    });

    it('returns 0 and skips DB call when ids array is empty', async () => {
      const result = await deleteStagedFilesByIds([]);
      expect(mockQuery).not.toHaveBeenCalled();
      expect(result).toBe(0);
    });

    it('returns 0 when rowCount is null (nullish coalescing branch)', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: null });
      const result = await deleteStagedFilesByIds(['id-1']);
      expect(result).toBe(0);
    });
  });
});
