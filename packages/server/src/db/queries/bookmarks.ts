import { query } from '../connection.js';
import type { BookmarkRow } from './types.js';

export async function createBookmark(userId: string, postId: string): Promise<BookmarkRow | null> {
  const result = await query<BookmarkRow>(
    'INSERT INTO bookmarks (user_id, post_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING *',
    [userId, postId],
  );
  return result.rows[0] ?? null;
}

export async function deleteBookmark(userId: string, postId: string): Promise<boolean> {
  const result = await query('DELETE FROM bookmarks WHERE user_id = $1 AND post_id = $2', [
    userId,
    postId,
  ]);
  return (result.rowCount ?? 0) > 0;
}
