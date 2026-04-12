import { query } from '../connection.js';
import type { TagRow, PostTagRow, UserTagSubscriptionRow } from './types.js';

export async function findTagByName(name: string): Promise<TagRow | null> {
  const result = await query<TagRow>('SELECT * FROM tags WHERE name = $1', [name]);
  return result.rows[0] ?? null;
}

export async function findTagById(id: string): Promise<TagRow | null> {
  const result = await query<TagRow>('SELECT * FROM tags WHERE id = $1', [id]);
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

export async function searchTags(prefix: string, limit: number): Promise<TagRow[]> {
  const result = await query<TagRow>(
    'SELECT * FROM tags WHERE name ILIKE $1 ORDER BY post_count DESC LIMIT $2',
    [`${prefix}%`, limit],
  );
  return result.rows;
}

export async function findPopularTags(limit: number): Promise<TagRow[]> {
  const result = await query<TagRow>(
    'SELECT * FROM tags WHERE post_count > 0 ORDER BY post_count DESC LIMIT $1',
    [limit],
  );
  return result.rows;
}

export async function subscribeToTag(userId: string, tagId: string): Promise<boolean> {
  const result = await query<UserTagSubscriptionRow>(
    'INSERT INTO user_tag_subscriptions (user_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING *',
    [userId, tagId],
  );
  return result.rows.length > 0;
}

export async function unsubscribeFromTag(userId: string, tagId: string): Promise<boolean> {
  const result = await query(
    'DELETE FROM user_tag_subscriptions WHERE user_id = $1 AND tag_id = $2',
    [userId, tagId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function getUserSubscriptions(userId: string): Promise<TagRow[]> {
  const result = await query<TagRow>(
    'SELECT t.* FROM tags t JOIN user_tag_subscriptions uts ON uts.tag_id = t.id WHERE uts.user_id = $1 ORDER BY t.name',
    [userId],
  );
  return result.rows;
}
