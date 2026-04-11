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
  revisionId: string;
  filename: string;
  content: string | null;
  storageKey: string | null;
  mimeType: string | null;
  sortOrder: number;
}

export async function createPostFile(input: CreatePostFileInput): Promise<PostFileRow> {
  const result = await query<PostFileRow>(
    `INSERT INTO post_files (post_id, revision_id, filename, content, storage_key, mime_type, sort_order) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [
      input.postId,
      input.revisionId,
      input.filename,
      input.content,
      input.storageKey,
      input.mimeType,
      input.sortOrder,
    ],
  );
  return result.rows[0] as PostFileRow;
}
