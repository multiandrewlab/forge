import { query } from '../connection.js';
import type { CommentRow } from './types.js';

export async function findCommentsByPostId(postId: string): Promise<CommentRow[]> {
  const result = await query<CommentRow>(
    'SELECT * FROM comments WHERE post_id = $1 ORDER BY created_at ASC',
    [postId],
  );
  return result.rows;
}

export interface CreateCommentInput {
  postId: string;
  authorId: string;
  parentId: string | null;
  lineNumber: number | null;
  revisionId: string | null;
  body: string;
}

export async function createComment(input: CreateCommentInput): Promise<CommentRow> {
  const result = await query<CommentRow>(
    `INSERT INTO comments (post_id, author_id, parent_id, line_number, revision_id, body) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [input.postId, input.authorId, input.parentId, input.lineNumber, input.revisionId, input.body],
  );
  return result.rows[0] as CommentRow;
}
