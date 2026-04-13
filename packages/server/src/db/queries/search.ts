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

// ─── Filter options ───

export interface SearchPostOptions {
  contentType?: string;
  tag?: string;
  limit?: number;
}

export interface SearchUserOptions {
  limit?: number;
}

// ─── Helpers ───

/** Shared LATERAL join + author join + base WHERE for both post search queries. */
function buildPostSearchSuffix(
  params: unknown[],
  options: SearchPostOptions,
): { filterClauses: string; limitParam: string } {
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

  const limit = options.limit ?? 20;
  params.push(limit);
  const limitParam = `$${params.length}`;

  return { filterClauses: filterParts.join('\n  '), limitParam };
}

// ─── Queries ───

export async function searchPostsByTsvector(
  q: string,
  options: SearchPostOptions,
): Promise<SearchPostRow[]> {
  const params: unknown[] = [q];

  const { filterClauses, limitParam } = buildPostSearchSuffix(params, options);

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
LIMIT ${limitParam}`.trim();

  const result = await query<SearchPostRow>(sql, params);
  return result.rows;
}

export async function searchPostsByTrigram(
  q: string,
  options: SearchPostOptions,
): Promise<SearchPostRow[]> {
  const params: unknown[] = [q];

  const { filterClauses, limitParam } = buildPostSearchSuffix(params, options);

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
LIMIT ${limitParam}`.trim();

  const result = await query<SearchPostRow>(sql, params);
  return result.rows;
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
