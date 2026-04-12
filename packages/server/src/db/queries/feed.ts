import { query } from '../connection.js';
import type { PostRow } from './types.js';
import type { FeedSort, FeedFilter, FeedContentType } from '@forge/shared';

export type PostWithAuthorRow = PostRow & {
  author_display_name: string;
  author_avatar_url: string | null;
  tags: string | null;
};

export interface FindFeedPostsInput {
  userId: string;
  sort?: FeedSort;
  filter?: FeedFilter;
  tag?: string;
  type?: FeedContentType;
  cursor?: string;
  limit?: number;
}

export interface FindFeedPostsResult {
  posts: PostWithAuthorRow[];
  hasMore: boolean;
}

interface CursorData {
  createdAt: string;
  id: string;
}

export async function findFeedPosts(input: FindFeedPostsInput): Promise<FindFeedPostsResult> {
  const { userId, sort = 'trending', filter, tag, type, cursor, limit } = input;

  const clampedLimit = Math.min(limit ?? 20, 100);
  const fetchLimit = clampedLimit + 1;

  const params: unknown[] = [];

  const nextParam = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };

  // Base SELECT with author join and tags subquery
  const selectClause = `
    SELECT
      p.*,
      u.display_name AS author_display_name,
      u.avatar_url   AS author_avatar_url,
      (
        SELECT string_agg(t.name, ',' ORDER BY t.name)
        FROM post_tags pt
        JOIN tags t ON t.id = pt.tag_id
        WHERE pt.post_id = p.id
      ) AS tags
    FROM posts p
    JOIN users u ON u.id = p.author_id
  `.trim();

  // Optional joins
  const joins: string[] = [];

  if (filter === 'bookmarked') {
    joins.push(`JOIN bookmarks b ON b.post_id = p.id AND b.user_id = ${nextParam(userId)}`);
  }

  if (tag !== undefined) {
    joins.push(`JOIN post_tags pt_filter ON pt_filter.post_id = p.id`);
    joins.push(
      `JOIN tags t_filter ON t_filter.id = pt_filter.tag_id AND t_filter.name = ${nextParam(tag)}`,
    );
  }

  // WHERE conditions
  const conditions: string[] = ['p.deleted_at IS NULL'];

  if (filter === 'mine') {
    conditions.push(`p.author_id = ${nextParam(userId)}`);
    // drafts included for filter=mine — no is_draft constraint
  } else {
    conditions.push('p.is_draft = false');
  }

  if (type !== undefined) {
    conditions.push(`p.content_type = ${nextParam(type)}`);
  }

  // Cursor-based pagination (keyset)
  if (cursor !== undefined) {
    const decoded = Buffer.from(cursor, 'base64').toString('utf8');
    const cursorData = JSON.parse(decoded) as CursorData;
    const cursorCreatedAt = nextParam(cursorData.createdAt);
    const cursorId = nextParam(cursorData.id);
    // For all sort modes, fall back to created_at / id for the tie-break
    conditions.push(
      `(p.created_at < ${cursorCreatedAt} OR (p.created_at = ${cursorCreatedAt} AND p.id < ${cursorId}))`,
    );
  }

  // ORDER BY
  let orderByClause: string;
  if (sort === 'recent') {
    orderByClause = 'ORDER BY p.created_at DESC, p.id DESC';
  } else if (sort === 'top') {
    orderByClause = 'ORDER BY p.vote_count DESC, p.created_at DESC, p.id DESC';
  } else {
    // trending: vote_count with time decay (Wilson-style approximation using epoch seconds)
    orderByClause =
      'ORDER BY (p.vote_count::float / GREATEST(1, EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600)) DESC, p.created_at DESC, p.id DESC';
  }

  const limitParam = nextParam(fetchLimit);

  const sql = [
    selectClause,
    joins.length > 0 ? joins.join('\n') : '',
    `WHERE ${conditions.join(' AND ')}`,
    orderByClause,
    `LIMIT ${limitParam}`,
  ]
    .filter(Boolean)
    .join('\n');

  const result = await query<PostWithAuthorRow>(sql, params);
  const rows = result.rows;

  const hasMore = rows.length > clampedLimit;
  const posts = hasMore ? rows.slice(0, clampedLimit) : rows;

  return { posts, hasMore };
}
