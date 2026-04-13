import type { SearchSnippet, AiAction, UserSummary } from '@forge/shared';
import type { ContentType } from '@forge/shared';
import type { SearchPostRow, SearchUserRow } from '../db/queries/search.js';

/**
 * Transform a database SearchPostRow into the public SearchSnippet DTO.
 * Maps snake_case columns to camelCase properties.
 */
export function toSearchSnippet(
  row: SearchPostRow,
  matchedBy: 'tsvector' | 'trigram' = 'tsvector',
): SearchSnippet {
  return {
    id: row.id,
    title: row.title,
    contentType: row.content_type as ContentType,
    language: row.language,
    excerpt: row.excerpt ?? '',
    authorId: row.author_id,
    authorDisplayName: row.author_display_name,
    authorAvatarUrl: row.author_avatar_url,
    rank: row.rank,
    matchedBy,
  };
}

/**
 * Transform a database SearchUserRow into the public UserSummary DTO.
 */
export function toUserSummary(row: SearchUserRow): UserSummary {
  return {
    id: row.id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    postCount: row.post_count,
  };
}

/**
 * Build stub AI action suggestions for a search query.
 * Returns empty array if query is too short (< 2 chars).
 */
export function buildAiActions(q: string): AiAction[] {
  if (q.length < 2) {
    return [];
  }

  return [
    {
      label: `Generate a ${q} tutorial`,
      action: 'generate',
      params: { topic: q },
    },
    {
      label: `Explain ${q}`,
      action: 'explain',
      params: { topic: q },
    },
  ];
}
