import type { Post, PostRevision, PostWithRevision } from '@forge/shared';
import type { PostRow, PostRevisionRow, PostWithRevisionRow } from '../db/queries/types.js';

/**
 * Transform a database PostRow into the public Post DTO.
 * Maps snake_case columns to camelCase properties.
 */
export function toPost(row: PostRow): Post {
  return {
    id: row.id,
    authorId: row.author_id,
    title: row.title,
    contentType: row.content_type as Post['contentType'],
    language: row.language,
    visibility: row.visibility as Post['visibility'],
    isDraft: row.is_draft,
    forkedFromId: row.forked_from_id,
    linkUrl: row.link_url,
    linkPreview: row.link_preview as Post['linkPreview'],
    voteCount: row.vote_count,
    viewCount: row.view_count,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Transform a database PostRevisionRow into the public PostRevision DTO.
 */
export function toRevision(row: PostRevisionRow): PostRevision {
  return {
    id: row.id,
    postId: row.post_id,
    content: row.content,
    message: row.message,
    revisionNumber: row.revision_number,
    createdAt: row.created_at,
  };
}

/**
 * Transform a PostWithRevisionRow (joined post + latest revision) into PostWithRevision DTO.
 * Embeds the revision data into the revisions array.
 */
export function toPostWithRevision(row: PostWithRevisionRow): PostWithRevision {
  return {
    ...toPost(row),
    revisions: [
      {
        id: row.revision_id,
        postId: row.id,
        content: row.content,
        message: row.message,
        revisionNumber: row.revision_number,
        createdAt: row.created_at,
      },
    ],
  };
}
