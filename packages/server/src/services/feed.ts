import type { PostWithAuthor } from '@forge/shared';
import type { PostWithAuthorRow } from '../db/queries/feed.js';
import { toPost } from './posts.js';

/**
 * Transform a PostWithAuthorRow (joined post + author + tags) into the public PostWithAuthor DTO.
 * Maps snake_case columns to camelCase and splits the comma-separated tags string into an array.
 */
export function toPostWithAuthor(row: PostWithAuthorRow): PostWithAuthor {
  return {
    ...toPost(row),
    author: {
      id: row.author_id,
      displayName: row.author_display_name,
      avatarUrl: row.author_avatar_url,
    },
    tags: row.tags ? row.tags.split(',') : [],
  };
}
