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
