import { query } from '../connection.js';
import type { CommentRow, CommentWithAuthorRow } from './types.js';

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

export async function findCommentsByPostIdWithAuthor(
  postId: string,
): Promise<CommentWithAuthorRow[]> {
  const result = await query<CommentWithAuthorRow>(
    `SELECT c.*,
      u.display_name AS author_display_name,
      u.avatar_url AS author_avatar_url,
      pr.revision_number
    FROM comments c
    LEFT JOIN users u ON u.id = c.author_id
    LEFT JOIN post_revisions pr ON pr.id = c.revision_id
    WHERE c.post_id = $1
    ORDER BY c.created_at ASC`,
    [postId],
  );
  return result.rows;
}

export async function findCommentsByPostIdWithAuthorForRevision(
  postId: string,
  revisionId: string,
): Promise<CommentWithAuthorRow[]> {
  const result = await query<CommentWithAuthorRow>(
    `SELECT c.*,
      u.display_name AS author_display_name,
      u.avatar_url AS author_avatar_url,
      pr.revision_number
    FROM comments c
    LEFT JOIN users u ON u.id = c.author_id
    LEFT JOIN post_revisions pr ON pr.id = c.revision_id
    WHERE c.post_id = $1 AND (c.revision_id = $2 OR c.revision_id IS NULL)
    ORDER BY c.created_at ASC`,
    [postId, revisionId],
  );
  return result.rows;
}

export async function findCommentById(id: string): Promise<CommentRow | null> {
  const result = await query<CommentRow>('SELECT * FROM comments WHERE id = $1', [id]);
  return result.rows[0] ?? null;
}

export async function updateComment(id: string, body: string): Promise<CommentRow | null> {
  const result = await query<CommentRow>(
    'UPDATE comments SET body = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
    [body, id],
  );
  return result.rows[0] ?? null;
}

export async function deleteComment(id: string): Promise<boolean> {
  const result = await query('DELETE FROM comments WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}
