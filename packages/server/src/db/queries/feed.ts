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

/**
 * Fetch a single post by ID with author and tags — the same shape as findFeedPosts
 * but without cursor/limit/sort logic. Used by mutation routes to build broadcast payloads.
 */
export async function findFeedPostById(postId: string): Promise<PostWithAuthorRow | null> {
  const sql = `
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
    WHERE p.id = $1 AND p.deleted_at IS NULL
  `.trim();

  const result = await query<PostWithAuthorRow>(sql, [postId]);
  return result.rows[0] ?? null;
}

export async function findFeedPosts(input: FindFeedPostsInput): Promise<FindFeedPostsResult> {
  const { userId, sort = 'trending', filter, tag, type, cursor, limit } = input;

  let effectiveSort: FeedSort = sort;
  let filterBySubscriptions = false;

  if (sort === 'personalized') {
    const subCheck = await query(
      'SELECT 1 FROM user_tag_subscriptions WHERE user_id = $1 LIMIT 1',
      [userId],
    );
    if (subCheck.rows.length > 0) {
      filterBySubscriptions = true;
    } else {
      effectiveSort = 'trending';
    }
  }

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

  if (filterBySubscriptions) {
    const userParam = nextParam(userId);
    conditions.push(
      `EXISTS (SELECT 1 FROM post_tags pt_sub JOIN user_tag_subscriptions uts ON uts.tag_id = pt_sub.tag_id WHERE pt_sub.post_id = p.id AND uts.user_id = ${userParam})`,
    );
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
  if (effectiveSort === 'recent') {
    orderByClause = 'ORDER BY p.created_at DESC, p.id DESC';
  } else if (effectiveSort === 'top') {
    orderByClause = 'ORDER BY p.vote_count DESC, p.created_at DESC, p.id DESC';
  } else if (effectiveSort === 'personalized') {
    // personalized: hotness score (vote_count with time decay, no GREATEST denominator)
    orderByClause =
      'ORDER BY (p.vote_count + 1) * (1.0 / (EXTRACT(EPOCH FROM NOW() - p.created_at) / 3600 + 2)) DESC, p.created_at DESC, p.id DESC';
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
