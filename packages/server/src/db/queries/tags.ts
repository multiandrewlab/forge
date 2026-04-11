import { query } from '../connection.js';
import type { TagRow, PostTagRow } from './types.js';

export async function findTagByName(name: string): Promise<TagRow | null> {
  const result = await query<TagRow>('SELECT * FROM tags WHERE name = $1', [name]);
  return result.rows[0] ?? null;
}

export async function createTag(name: string): Promise<TagRow> {
  const result = await query<TagRow>('INSERT INTO tags (name) VALUES ($1) RETURNING *', [name]);
  return result.rows[0] as TagRow;
}

export async function addPostTag(postId: string, tagId: string): Promise<PostTagRow | null> {
  const result = await query<PostTagRow>(
    'INSERT INTO post_tags (post_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING *',
    [postId, tagId],
  );
  return result.rows[0] ?? null;
}

export async function removePostTag(postId: string, tagId: string): Promise<boolean> {
  const result = await query('DELETE FROM post_tags WHERE post_id = $1 AND tag_id = $2', [
    postId,
    tagId,
  ]);
  return (result.rowCount ?? 0) > 0;
}
