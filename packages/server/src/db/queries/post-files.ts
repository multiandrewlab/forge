import { query } from '../connection.js';
import type { PostFileRow } from './types.js';

export async function findFilesByRevisionId(revisionId: string): Promise<PostFileRow[]> {
  const result = await query<PostFileRow>(
    'SELECT * FROM post_files WHERE revision_id = $1 ORDER BY sort_order ASC',
    [revisionId],
  );
  return result.rows;
}

export interface CreatePostFileInput {
  postId: string;
  revisionId: string | null;
  filename: string;
  content: string | null;
  storageKey: string | null;
  mimeType: string | null;
  sortOrder: number;
  fileSize: number | null;
}

export async function createPostFile(input: CreatePostFileInput): Promise<PostFileRow> {
  const result = await query<PostFileRow>(
    `INSERT INTO post_files (post_id, revision_id, filename, content, storage_key, mime_type, sort_order, file_size) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [
      input.postId,
      input.revisionId,
      input.filename,
      input.content,
      input.storageKey,
      input.mimeType,
      input.sortOrder,
      input.fileSize,
    ],
  );
  return result.rows[0] as PostFileRow;
}

export async function findStagedFilesByPostId(postId: string): Promise<PostFileRow[]> {
  const result = await query<PostFileRow>(
    'SELECT * FROM post_files WHERE post_id = $1 AND revision_id IS NULL ORDER BY sort_order ASC',
    [postId],
  );
  return result.rows;
}

export async function findStagedFileById(
  fileId: string,
  postId: string,
): Promise<PostFileRow | undefined> {
  const result = await query<PostFileRow>(
    'SELECT * FROM post_files WHERE id = $1 AND post_id = $2 AND revision_id IS NULL',
    [fileId, postId],
  );
  return result.rows[0];
}

export async function getNextSortOrder(postId: string): Promise<number> {
  const result = await query<{ next: number }>(
    'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM post_files WHERE post_id = $1 AND revision_id IS NULL',
    [postId],
  );
  return (result.rows[0] as { next: number }).next;
}

export async function setStagedFileRevision(
  fileId: string,
  postId: string,
  revisionId: string,
  storageKey: string | null,
): Promise<PostFileRow | undefined> {
  const result = await query<PostFileRow>(
    'UPDATE post_files SET revision_id = $3, storage_key = $4 WHERE id = $1 AND post_id = $2 AND revision_id IS NULL RETURNING *',
    [fileId, postId, revisionId, storageKey],
  );
  return result.rows[0];
}

export async function carryForwardFile(
  sourceFile: PostFileRow,
  newRevisionId: string,
): Promise<PostFileRow> {
  const result = await query<PostFileRow>(
    `INSERT INTO post_files (post_id, revision_id, filename, content, storage_key, mime_type, sort_order, file_size) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [
      sourceFile.post_id,
      newRevisionId,
      sourceFile.filename,
      sourceFile.content,
      sourceFile.storage_key,
      sourceFile.mime_type,
      sourceFile.sort_order,
      sourceFile.file_size,
    ],
  );
  return result.rows[0] as PostFileRow;
}

export async function deleteFileById(fileId: string, postId: string): Promise<boolean> {
  const result = await query(
    'DELETE FROM post_files WHERE id = $1 AND post_id = $2 AND revision_id IS NULL',
    [fileId, postId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function findStaleStagedFiles(): Promise<PostFileRow[]> {
  const result = await query<PostFileRow>(
    "SELECT * FROM post_files WHERE revision_id IS NULL AND created_at < NOW() - INTERVAL '24 hours'",
    [],
  );
  return result.rows;
}

export async function deleteStagedFilesByIds(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const result = await query(
    'DELETE FROM post_files WHERE id = ANY($1) AND revision_id IS NULL',
    [ids],
  );
  return result.rowCount ?? 0;
}
