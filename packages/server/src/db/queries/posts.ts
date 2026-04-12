import { query } from '../connection.js';
import type { PostRow, PostWithRevisionRow } from './types.js';

export async function findPostById(id: string): Promise<PostRow | null> {
  const result = await query<PostRow>('SELECT * FROM posts WHERE id = $1 AND deleted_at IS NULL', [
    id,
  ]);
  return result.rows[0] ?? null;
}

export interface CreatePostInput {
  authorId: string;
  title: string;
  contentType: string;
  language: string | null;
  visibility: string;
  isDraft: boolean;
}

export async function createPost(input: CreatePostInput): Promise<PostRow> {
  const result = await query<PostRow>(
    `INSERT INTO posts (author_id, title, content_type, language, visibility, is_draft) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [
      input.authorId,
      input.title,
      input.contentType,
      input.language,
      input.visibility,
      input.isDraft,
    ],
  );
  return result.rows[0] as PostRow;
}

export async function findPostWithLatestRevision(id: string): Promise<PostWithRevisionRow | null> {
  const result = await query<PostWithRevisionRow>(
    `SELECT p.*, pr.content, pr.revision_number, pr.message FROM posts p INNER JOIN post_revisions pr ON pr.post_id = p.id WHERE p.id = $1 AND p.deleted_at IS NULL ORDER BY pr.revision_number DESC LIMIT 1`,
    [id],
  );
  return result.rows[0] ?? null;
}

export interface UpdatePostFields {
  title?: string;
  contentType?: string;
  language?: string | null;
  visibility?: string;
  isDraft?: boolean;
}

const fieldColumnMap: Record<string, string> = {
  title: 'title',
  contentType: 'content_type',
  language: 'language',
  visibility: 'visibility',
  isDraft: 'is_draft',
};

export async function updatePost(id: string, fields: UpdatePostFields): Promise<PostRow | null> {
  const entries = Object.entries(fields).filter(([key]) => key in fieldColumnMap);

  if (entries.length === 0) {
    return findPostById(id);
  }

  const setClauses: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of entries) {
    values.push(value);
    setClauses.push(`${fieldColumnMap[key]} = $${values.length}`);
  }

  setClauses.push('updated_at = NOW()');
  values.push(id);

  const sql = `UPDATE posts SET ${setClauses.join(', ')} WHERE id = $${values.length} AND deleted_at IS NULL RETURNING *`;
  const result = await query<PostRow>(sql, values);
  return result.rows[0] ?? null;
}

export async function softDeletePost(id: string): Promise<boolean> {
  const result = await query<{ id: string }>(
    'UPDATE posts SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id',
    [id],
  );
  return result.rows.length > 0;
}

export async function publishPost(id: string): Promise<PostRow | null> {
  const result = await query<PostRow>(
    'UPDATE posts SET is_draft = false, updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING *',
    [id],
  );
  return result.rows[0] ?? null;
}
