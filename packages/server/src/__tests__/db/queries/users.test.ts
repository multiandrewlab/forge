import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

vi.mock('../../../db/connection.js', () => ({
  query: vi.fn(),
}));

import { query } from '../../../db/connection.js';
import { findUserById, findUserByEmail, createUser } from '../../../db/queries/users.js';
import type { UserRow } from '../../../db/queries/types.js';

const mockQuery = query as Mock;

const sampleUser: UserRow = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  email: 'alice@example.com',
  display_name: 'Alice',
  avatar_url: null,
  auth_provider: 'local',
  password_hash: '$2b$12$hash',
  created_at: new Date('2026-01-01'),
  updated_at: new Date('2026-01-01'),
};

describe('user queries', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('findUserById', () => {
    it('returns the user when found', async () => {
      mockQuery.mockResolvedValue({ rows: [sampleUser], rowCount: 1 });
      const result = await findUserById(sampleUser.id);
      expect(mockQuery).toHaveBeenCalledWith('SELECT * FROM users WHERE id = $1', [sampleUser.id]);
      expect(result).toEqual(sampleUser);
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
      const result = await findUserById('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('findUserByEmail', () => {
    it('returns the user when found', async () => {
      mockQuery.mockResolvedValue({ rows: [sampleUser], rowCount: 1 });
      const result = await findUserByEmail(sampleUser.email);
      expect(mockQuery).toHaveBeenCalledWith('SELECT * FROM users WHERE email = $1', [
        sampleUser.email,
      ]);
      expect(result).toEqual(sampleUser);
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
      const result = await findUserByEmail('nobody@example.com');
      expect(result).toBeNull();
    });
  });

  describe('createUser', () => {
    it('inserts a user and returns the row', async () => {
      mockQuery.mockResolvedValue({ rows: [sampleUser], rowCount: 1 });
      const result = await createUser({
        email: 'alice@example.com',
        displayName: 'Alice',
        avatarUrl: null,
        authProvider: 'local',
        passwordHash: '$2b$12$hash',
      });
      expect(mockQuery).toHaveBeenCalledWith(
        `INSERT INTO users (email, display_name, avatar_url, auth_provider, password_hash) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        ['alice@example.com', 'Alice', null, 'local', '$2b$12$hash'],
      );
      expect(result).toEqual(sampleUser);
    });
  });
});
