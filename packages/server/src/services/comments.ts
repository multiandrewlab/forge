import type { Comment } from '@forge/shared';
import type { CommentWithAuthorRow } from '../db/queries/types.js';

export function toComment(row: CommentWithAuthorRow): Comment {
  return {
    id: row.id,
    postId: row.post_id,
    author: row.author_id
      ? {
          id: row.author_id,
          displayName: row.author_display_name ?? 'Unknown',
          avatarUrl: row.author_avatar_url,
        }
      : null,
    parentId: row.parent_id,
    lineNumber: row.line_number,
    revisionId: row.revision_id,
    revisionNumber: row.revision_number,
    body: row.body,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}
