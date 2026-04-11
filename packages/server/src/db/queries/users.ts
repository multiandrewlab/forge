import { query } from '../connection.js';
import type { UserRow } from './types.js';

export async function findUserById(id: string): Promise<UserRow | null> {
  const result = await query<UserRow>('SELECT * FROM users WHERE id = $1', [id]);
  return result.rows[0] ?? null;
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const result = await query<UserRow>('SELECT * FROM users WHERE email = $1', [email]);
  return result.rows[0] ?? null;
}

export interface CreateUserInput {
  email: string;
  displayName: string;
  avatarUrl: string | null;
  authProvider: string;
  passwordHash: string | null;
}

export async function createUser(input: CreateUserInput): Promise<UserRow> {
  const result = await query<UserRow>(
    `INSERT INTO users (email, display_name, avatar_url, auth_provider, password_hash) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [input.email, input.displayName, input.avatarUrl, input.authProvider, input.passwordHash],
  );
  return result.rows[0] as UserRow;
}

export interface UpdateUserFields {
  displayName?: string;
  avatarUrl?: string | null;
}

export async function updateUser(id: string, fields: UpdateUserFields): Promise<UserRow | null> {
  const setClauses: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (fields.displayName !== undefined) {
    setClauses.push(`display_name = $${String(paramIndex)}`);
    params.push(fields.displayName);
    paramIndex++;
  }

  if (fields.avatarUrl !== undefined) {
    setClauses.push(`avatar_url = $${String(paramIndex)}`);
    params.push(fields.avatarUrl);
    paramIndex++;
  }

  setClauses.push('updated_at = NOW()');
  params.push(id);

  const sql = `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${String(paramIndex)} RETURNING *`;
  const result = await query<UserRow>(sql, params);
  return result.rows[0] ?? null;
}
