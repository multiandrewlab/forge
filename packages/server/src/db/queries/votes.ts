import { query } from '../connection.js';
import type { VoteRow } from './types.js';

export async function upsertVote(userId: string, postId: string, value: number): Promise<VoteRow> {
  const result = await query<VoteRow>(
    `INSERT INTO votes (user_id, post_id, value) VALUES ($1, $2, $3) ON CONFLICT (user_id, post_id) DO UPDATE SET value = EXCLUDED.value RETURNING *`,
    [userId, postId, value],
  );
  return result.rows[0] as VoteRow;
}

export async function getUserVote(userId: string, postId: string): Promise<VoteRow | null> {
  const result = await query<VoteRow>('SELECT * FROM votes WHERE user_id = $1 AND post_id = $2', [
    userId,
    postId,
  ]);
  return result.rows[0] ?? null;
}

export async function deleteVote(userId: string, postId: string): Promise<boolean> {
  const result = await query('DELETE FROM votes WHERE user_id = $1 AND post_id = $2', [
    userId,
    postId,
  ]);
  return (result.rowCount ?? 0) > 0;
}
