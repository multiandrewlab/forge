import { query } from '../connection.js';
import type { PostRevisionRow } from './types.js';

export async function findRevisionsByPostId(postId: string): Promise<PostRevisionRow[]> {
  const result = await query<PostRevisionRow>(
    'SELECT * FROM post_revisions WHERE post_id = $1 ORDER BY revision_number DESC',
    [postId],
  );
  return result.rows;
}

export async function findRevision(
  postId: string,
  revisionNumber: number,
): Promise<PostRevisionRow | null> {
  const result = await query<PostRevisionRow>(
    'SELECT * FROM post_revisions WHERE post_id = $1 AND revision_number = $2',
    [postId, revisionNumber],
  );
  return result.rows[0] ?? null;
}

export interface CreateRevisionInput {
  postId: string;
  authorId: string;
  content: string;
  message: string | null;
  revisionNumber: number;
}

export async function createRevision(input: CreateRevisionInput): Promise<PostRevisionRow> {
  const result = await query<PostRevisionRow>(
    `INSERT INTO post_revisions (post_id, author_id, content, message, revision_number) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [input.postId, input.authorId, input.content, input.message, input.revisionNumber],
  );
  return result.rows[0] as PostRevisionRow;
}
