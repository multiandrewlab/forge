import { query } from '../connection.js';
import type { PromptVariableRow } from './types.js';

export async function findPromptVariablesByPostId(postId: string): Promise<PromptVariableRow[]> {
  const result = await query<PromptVariableRow>(
    'SELECT * FROM prompt_variables WHERE post_id = $1 ORDER BY sort_order ASC',
    [postId],
  );
  return result.rows;
}

export interface CreatePromptVariableInput {
  postId: string;
  name: string;
  placeholder: string | null;
  sortOrder: number;
  defaultValue: string | null;
}

export async function createPromptVariable(
  input: CreatePromptVariableInput,
): Promise<PromptVariableRow> {
  const result = await query<PromptVariableRow>(
    `INSERT INTO prompt_variables (post_id, name, placeholder, sort_order, default_value) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [input.postId, input.name, input.placeholder, input.sortOrder, input.defaultValue],
  );
  return result.rows[0] as PromptVariableRow;
}

export interface UpsertPromptVariableInput {
  postId: string;
  name: string;
  sortOrder: number;
}

export async function upsertPromptVariable(
  input: UpsertPromptVariableInput,
): Promise<PromptVariableRow> {
  const result = await query<PromptVariableRow>(
    `INSERT INTO prompt_variables (post_id, name, sort_order) VALUES ($1, $2, $3) ON CONFLICT (post_id, name) DO UPDATE SET sort_order = EXCLUDED.sort_order RETURNING *`,
    [input.postId, input.name, input.sortOrder],
  );
  return result.rows[0] as PromptVariableRow;
}

export async function deleteStalePromptVariables(
  postId: string,
  keepNames: string[],
): Promise<void> {
  if (keepNames.length === 0) {
    await query(`DELETE FROM prompt_variables WHERE post_id = $1`, [postId]);
  } else {
    await query(`DELETE FROM prompt_variables WHERE post_id = $1 AND name != ALL($2)`, [
      postId,
      keepNames,
    ]);
  }
}
