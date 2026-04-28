import { query } from '../connection.js';

// ── Row type interfaces ─────────────────────────────────────────────

export interface TopTagRow {
  tag_id: string;
  tag_name: string;
  vote_sum: number;
}

export interface TopContributorRow {
  author_id: string;
  display_name: string;
  avatar_url: string | null;
  post_count: number;
  vote_sum: number;
}

export interface TagExpertRow {
  tag_id: string;
  tag_name: string;
  post_count: number;
  vote_sum: number;
}

export interface UserPublicPostRow {
  id: string;
  title: string;
  content_type: string;
  language: string | null;
  vote_count: number;
  created_at: Date;
  tags: string | null;
}

// ── Queries ─────────────────────────────────────────────────────────

/**
 * Count of public, non-draft, non-deleted posts by a user.
 * PostgreSQL returns COUNT as a string, so we parseInt.
 */
export async function getUserPostCount(userId: string): Promise<number> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM posts
     WHERE author_id = $1
       AND visibility = 'public'
       AND is_draft = false
       AND deleted_at IS NULL`,
    [userId],
  );
  const row = result.rows[0];
  return row ? parseInt(row.count, 10) : 0;
}

/**
 * COALESCE'd sum of vote_count across a user's non-deleted posts.
 * PostgreSQL returns SUM as a string (or null when no rows), so we parseInt.
 */
export async function getUserTotalVotes(userId: string): Promise<number> {
  const result = await query<{ total: string }>(
    `SELECT COALESCE(SUM(vote_count), 0) AS total
     FROM posts
     WHERE author_id = $1
       AND deleted_at IS NULL`,
    [userId],
  );
  const row = result.rows[0];
  return row ? parseInt(row.total, 10) : 0;
}

/**
 * Top 5 tags for a user ranked by the sum of vote_count on their posts.
 * JOINs through post_tags to tags.
 */
export async function getUserTopTags(userId: string): Promise<TopTagRow[]> {
  const result = await query<{ tag_id: string; tag_name: string; vote_sum: string }>(
    `SELECT t.id AS tag_id, t.name AS tag_name, SUM(p.vote_count)::text AS vote_sum
     FROM posts p
     JOIN post_tags pt ON pt.post_id = p.id
     JOIN tags t ON t.id = pt.tag_id
     WHERE p.author_id = $1
       AND p.deleted_at IS NULL
     GROUP BY t.id, t.name
     ORDER BY SUM(p.vote_count) DESC
     LIMIT 5`,
    [userId],
  );
  return result.rows.map((r) => ({
    tag_id: r.tag_id,
    tag_name: r.tag_name,
    vote_sum: parseInt(r.vote_sum, 10),
  }));
}

/**
 * Top 3 contributors by vote sum, requiring at least 3 public non-draft posts
 * and a total vote sum >= 5.
 */
export async function getTopContributors(): Promise<TopContributorRow[]> {
  const result = await query<{
    author_id: string;
    display_name: string;
    avatar_url: string | null;
    post_count: string;
    vote_sum: string;
  }>(
    `SELECT p.author_id,
            u.display_name,
            u.avatar_url,
            COUNT(*)::text AS post_count,
            SUM(p.vote_count)::text AS vote_sum
     FROM posts p
     JOIN users u ON u.id = p.author_id
     WHERE p.visibility = 'public'
       AND p.is_draft = false
       AND p.deleted_at IS NULL
     GROUP BY p.author_id, u.display_name, u.avatar_url
     HAVING COUNT(*) >= 3 AND SUM(p.vote_count) >= 5
     ORDER BY SUM(p.vote_count) DESC
     LIMIT 3`,
    [],
  );
  return result.rows.map((r) => ({
    author_id: r.author_id,
    display_name: r.display_name,
    avatar_url: r.avatar_url,
    post_count: parseInt(r.post_count, 10),
    vote_sum: parseInt(r.vote_sum, 10),
  }));
}

/**
 * Tags where the given user is the TOP contributor AND meets minimum
 * thresholds (>= 3 posts, >= 5 total votes for that tag).
 *
 * Uses a CTE to find the #1 contributor per tag, then filters to only
 * tags where the requested user holds that #1 position.
 */
export async function getTagExperts(userId: string): Promise<TagExpertRow[]> {
  const result = await query<{
    tag_id: string;
    tag_name: string;
    post_count: string;
    vote_sum: string;
  }>(
    `WITH user_tag_stats AS (
       SELECT t.id AS tag_id, t.name AS tag_name,
              COUNT(*)::text AS post_count,
              SUM(p.vote_count)::text AS vote_sum
       FROM posts p
       JOIN post_tags pt ON pt.post_id = p.id
       JOIN tags t ON t.id = pt.tag_id
       WHERE p.author_id = $1
         AND p.deleted_at IS NULL
       GROUP BY t.id, t.name
       HAVING COUNT(*) >= 3 AND SUM(p.vote_count) >= 5
     ),
     top_per_tag AS (
       SELECT DISTINCT ON (t.id) t.id AS tag_id, p.author_id
       FROM posts p
       JOIN post_tags pt ON pt.post_id = p.id
       JOIN tags t ON t.id = pt.tag_id
       WHERE p.deleted_at IS NULL
       GROUP BY t.id, p.author_id
       ORDER BY t.id, SUM(p.vote_count) DESC
     )
     SELECT uts.tag_id, uts.tag_name, uts.post_count, uts.vote_sum
     FROM user_tag_stats uts
     JOIN top_per_tag tpt ON tpt.tag_id = uts.tag_id
     WHERE tpt.author_id = $1
     ORDER BY uts.vote_sum::int DESC`,
    [userId],
  );
  return result.rows.map((r) => ({
    tag_id: r.tag_id,
    tag_name: r.tag_name,
    post_count: parseInt(r.post_count, 10),
    vote_sum: parseInt(r.vote_sum, 10),
  }));
}

/**
 * Paginated list of a user's public posts with STRING_AGG'd tag names.
 * Uses cursor-based pagination on created_at.
 */
export async function getUserPublicPosts(
  userId: string,
  limit: number,
  cursor?: Date,
): Promise<UserPublicPostRow[]> {
  if (cursor) {
    const result = await query<{
      id: string;
      title: string;
      content_type: string;
      language: string | null;
      vote_count: string;
      created_at: Date;
      tags: string | null;
    }>(
      `SELECT p.id, p.title, p.content_type, p.language,
              p.vote_count::text AS vote_count, p.created_at,
              STRING_AGG(t.name, ',' ORDER BY t.name) AS tags
       FROM posts p
       LEFT JOIN post_tags pt ON pt.post_id = p.id
       LEFT JOIN tags t ON t.id = pt.tag_id
       WHERE p.author_id = $1
         AND p.visibility = 'public'
         AND p.is_draft = false
         AND p.deleted_at IS NULL
         AND p.created_at < $2
       GROUP BY p.id, p.title, p.content_type, p.language, p.vote_count, p.created_at
       ORDER BY p.created_at DESC
       LIMIT $3`,
      [userId, cursor, limit],
    );
    return result.rows.map((r) => ({
      id: r.id,
      title: r.title,
      content_type: r.content_type,
      language: r.language,
      vote_count: parseInt(r.vote_count, 10),
      created_at: r.created_at,
      tags: r.tags,
    }));
  }

  const result = await query<{
    id: string;
    title: string;
    content_type: string;
    language: string | null;
    vote_count: string;
    created_at: Date;
    tags: string | null;
  }>(
    `SELECT p.id, p.title, p.content_type, p.language,
            p.vote_count::text AS vote_count, p.created_at,
            STRING_AGG(t.name, ',' ORDER BY t.name) AS tags
     FROM posts p
     LEFT JOIN post_tags pt ON pt.post_id = p.id
     LEFT JOIN tags t ON t.id = pt.tag_id
     WHERE p.author_id = $1
       AND p.visibility = 'public'
       AND p.is_draft = false
       AND p.deleted_at IS NULL
     GROUP BY p.id, p.title, p.content_type, p.language, p.vote_count, p.created_at
     ORDER BY p.created_at DESC
     LIMIT $2`,
    [userId, limit],
  );
  return result.rows.map((r) => ({
    id: r.id,
    title: r.title,
    content_type: r.content_type,
    language: r.language,
    vote_count: parseInt(r.vote_count, 10),
    created_at: r.created_at,
    tags: r.tags,
  }));
}
