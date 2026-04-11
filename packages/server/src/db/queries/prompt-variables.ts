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
