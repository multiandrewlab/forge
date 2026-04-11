import { query } from '../connection.js';
import type { PostRow } from './types.js';

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
