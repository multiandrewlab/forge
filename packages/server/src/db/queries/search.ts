import { query } from '../connection.js';

// ─── Row types (local to this module, per WU scope rules) ───

export interface SearchPostRow {
  id: string;
  title: string;
  content_type: string;
  language: string | null;
  author_id: string;
  author_display_name: string;
  author_avatar_url: string | null;
  excerpt: string | null;
  rank: number;
}

export interface SearchUserRow {
  id: string;
  display_name: string;
  avatar_url: string | null;
  post_count: number;
}

interface CountRow {
  count: string | number;
}

// ─── Filter options ───

export interface SearchPostOptions {
  contentType?: string;
  tag?: string;
  limit?: number;
  // Issue #49 additions:
  /** Case-insensitive display_name exact match. */
  author?: string;
  /** Time-window filter on posts.created_at. */
  since?: 'today' | '7d' | '30d';
  /** 1-indexed page number. Default 1. */
  page?: number;
}

export interface SearchUserOptions {
  limit?: number;
}

// ─── Helpers ───

const SINCE_INTERVALS: Record<NonNullable<SearchPostOptions['since']>, string> = {
  today: '1 day',
  '7d': '7 days',
  '30d': '30 days',
};

/**
 * Build the shared filter clauses (content_type, tag, author, since) used by
 * both the primary search queries and the count helper. Mutates `params` and
 * returns the joined SQL fragment.
 */
function buildFilterClauses(params: unknown[], options: SearchPostOptions): string {
  const filterParts: string[] = [];

  if (options.contentType !== undefined) {
    params.push(options.contentType);
    filterParts.push(`AND p.content_type = $${params.length}`);
  }

  if (options.tag !== undefined) {
    params.push(options.tag);
    filterParts.push(
      `AND EXISTS (SELECT 1 FROM post_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.post_id = p.id AND t.name = $${params.length})`,
    );
  }

  if (options.author !== undefined) {
    params.push(options.author);
    filterParts.push(`AND LOWER(u.display_name) = LOWER($${params.length})`);
  }

  if (options.since !== undefined) {
    params.push(SINCE_INTERVALS[options.since]);
    filterParts.push(`AND p.created_at >= NOW() - $${params.length}::interval`);
  }

  return filterParts.join('\n  ');
}

/**
 * Build the LIMIT/OFFSET tail used by the primary search queries.
 * Mutates `params` and returns the SQL fragment.
 */
function buildPaginationClause(
  params: unknown[],
  options: SearchPostOptions,
): { limitParam: string; offsetParam: string } {
  const limit = options.limit ?? 20;
  const page = options.page ?? 1;
  const offset = (page - 1) * limit;

  params.push(limit);
  const limitParam = `$${params.length}`;
  params.push(offset);
  const offsetParam = `$${params.length}`;

  return { limitParam, offsetParam };
}

// ─── Queries ───

export async function searchPostsByTsvector(
  q: string,
  options: SearchPostOptions,
): Promise<SearchPostRow[]> {
  const params: unknown[] = [q];

  const filterClauses = buildFilterClauses(params, options);
  const { limitParam, offsetParam } = buildPaginationClause(params, options);

  const sql = `
SELECT
  p.id, p.title, p.content_type, p.language,
  u.id AS author_id, u.display_name AS author_display_name, u.avatar_url AS author_avatar_url,
  LEFT(pr.content, 200) AS excerpt,
  ts_rank(p.search_vector, query) AS rank
FROM posts p
JOIN users u ON u.id = p.author_id
LEFT JOIN LATERAL (
  SELECT content FROM post_revisions WHERE post_id = p.id ORDER BY revision_number DESC LIMIT 1
) pr ON true,
plainto_tsquery('forge_search', $1) query
WHERE p.search_vector @@ query
  AND p.deleted_at IS NULL
  AND p.visibility = 'public'
  ${filterClauses}
ORDER BY rank DESC
LIMIT ${limitParam} OFFSET ${offsetParam}`.trim();

  const result = await query<SearchPostRow>(sql, params);
  return result.rows;
}

export async function searchPostsByTrigram(
  q: string,
  options: SearchPostOptions,
): Promise<SearchPostRow[]> {
  const params: unknown[] = [q];

  const filterClauses = buildFilterClauses(params, options);
  const { limitParam, offsetParam } = buildPaginationClause(params, options);

  const sql = `
SELECT
  p.id, p.title, p.content_type, p.language,
  u.id AS author_id, u.display_name AS author_display_name, u.avatar_url AS author_avatar_url,
  LEFT(pr.content, 200) AS excerpt,
  similarity(p.title, $1) AS rank
FROM posts p
JOIN users u ON u.id = p.author_id
LEFT JOIN LATERAL (
  SELECT content FROM post_revisions WHERE post_id = p.id ORDER BY revision_number DESC LIMIT 1
) pr ON true
WHERE p.title % $1
  AND similarity(p.title, $1) > 0.3
  AND p.deleted_at IS NULL
  AND p.visibility = 'public'
  ${filterClauses}
ORDER BY rank DESC
LIMIT ${limitParam} OFFSET ${offsetParam}`.trim();

  const result = await query<SearchPostRow>(sql, params);
  return result.rows;
}

/**
 * Count posts matching the same WHERE clause as `searchPostsByTsvector`.
 * Used to compute totalPages without fetching extra rows. Excludes
 * ORDER BY / LIMIT / OFFSET — the count is page-independent.
 */
export async function countSearchPosts(q: string, options: SearchPostOptions): Promise<number> {
  const params: unknown[] = [q];
  const filterClauses = buildFilterClauses(params, options);

  const sql = `
SELECT COUNT(*) AS count
FROM posts p
JOIN users u ON u.id = p.author_id,
plainto_tsquery('forge_search', $1) query
WHERE p.search_vector @@ query
  AND p.deleted_at IS NULL
  AND p.visibility = 'public'
  ${filterClauses}`.trim();

  const result = await query<CountRow>(sql, params);
  const row = result.rows[0];
  if (!row) return 0;
  return typeof row.count === 'number' ? row.count : Number.parseInt(row.count, 10);
}

export async function searchUsers(q: string, options: SearchUserOptions): Promise<SearchUserRow[]> {
  const limit = options.limit ?? 10;
  const params: unknown[] = [q, q, limit];

  const sql = `
SELECT
  u.id, u.display_name, u.avatar_url,
  COALESCE(COUNT(p.id) FILTER (
    WHERE p.deleted_at IS NULL AND p.visibility = 'public' AND p.is_draft = false
  ), 0) AS post_count
FROM users u
LEFT JOIN posts p ON p.author_id = u.id
WHERE u.display_name % $1 OR u.display_name ILIKE '%' || $2 || '%'
GROUP BY u.id
ORDER BY similarity(u.display_name, $1) DESC
LIMIT $3`.trim();

  const result = await query<SearchUserRow>(sql, params);
  return result.rows;
}
