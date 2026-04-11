import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

vi.mock('../../../db/connection.js', () => ({
  query: vi.fn(),
}));

import { query } from '../../../db/connection.js';
import {
  findUserById,
  findUserByEmail,
  createUser,
  updateUser,
  updateUserAvatar,
  convertToGoogle,
} from '../../../db/queries/users.js';
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

  describe('updateUser', () => {
    it('updates display_name only and returns the updated row', async () => {
      const updatedUser = { ...sampleUser, display_name: 'Alice Updated' };
      mockQuery.mockResolvedValue({ rows: [updatedUser], rowCount: 1 });

      const result = await updateUser(sampleUser.id, { displayName: 'Alice Updated' });

      expect(mockQuery).toHaveBeenCalledWith(
        'UPDATE users SET display_name = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
        ['Alice Updated', sampleUser.id],
      );
      expect(result).toEqual(updatedUser);
    });

    it('updates avatar_url only and returns the updated row', async () => {
      const updatedUser = { ...sampleUser, avatar_url: 'https://example.com/avatar.png' };
      mockQuery.mockResolvedValue({ rows: [updatedUser], rowCount: 1 });

      const result = await updateUser(sampleUser.id, {
        avatarUrl: 'https://example.com/avatar.png',
      });

      expect(mockQuery).toHaveBeenCalledWith(
        'UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
        ['https://example.com/avatar.png', sampleUser.id],
      );
      expect(result).toEqual(updatedUser);
    });

    it('updates both display_name and avatar_url', async () => {
      const updatedUser = {
        ...sampleUser,
        display_name: 'New Name',
        avatar_url: 'https://example.com/new.png',
      };
      mockQuery.mockResolvedValue({ rows: [updatedUser], rowCount: 1 });

      const result = await updateUser(sampleUser.id, {
        displayName: 'New Name',
        avatarUrl: 'https://example.com/new.png',
      });

      expect(mockQuery).toHaveBeenCalledWith(
        'UPDATE users SET display_name = $1, avatar_url = $2, updated_at = NOW() WHERE id = $3 RETURNING *',
        ['New Name', 'https://example.com/new.png', sampleUser.id],
      );
      expect(result).toEqual(updatedUser);
    });

    it('updates avatar_url to null', async () => {
      const updatedUser = { ...sampleUser, avatar_url: null };
      mockQuery.mockResolvedValue({ rows: [updatedUser], rowCount: 1 });

      const result = await updateUser(sampleUser.id, { avatarUrl: null });

      expect(mockQuery).toHaveBeenCalledWith(
        'UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
        [null, sampleUser.id],
      );
      expect(result).toEqual(updatedUser);
    });

    it('returns null when user not found', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await updateUser('nonexistent', { displayName: 'Nobody' });

      expect(result).toBeNull();
    });
  });

  describe('updateUserAvatar', () => {
    it('updates only avatar_url and returns the updated row', async () => {
      const updatedUser = { ...sampleUser, avatar_url: 'https://example.com/google-avatar.png' };
      mockQuery.mockResolvedValue({ rows: [updatedUser], rowCount: 1 });

      const result = await updateUserAvatar(sampleUser.id, 'https://example.com/google-avatar.png');

      expect(mockQuery).toHaveBeenCalledWith(
        'UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
        ['https://example.com/google-avatar.png', sampleUser.id],
      );
      expect(result).toEqual(updatedUser);
    });

    it('returns null when user not found', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await updateUserAvatar('nonexistent', 'https://example.com/avatar.png');

      expect(result).toBeNull();
    });
  });

  describe('convertToGoogle', () => {
    it('sets auth_provider to google, updates avatar_url, and nullifies password_hash', async () => {
      const convertedUser: UserRow = {
        ...sampleUser,
        auth_provider: 'google',
        avatar_url: 'https://example.com/google-avatar.png',
        password_hash: null,
      };
      mockQuery.mockResolvedValue({ rows: [convertedUser], rowCount: 1 });

      const result = await convertToGoogle(sampleUser.id, 'https://example.com/google-avatar.png');

      expect(mockQuery).toHaveBeenCalledWith(
        'UPDATE users SET auth_provider = $1, avatar_url = $2, password_hash = NULL, updated_at = NOW() WHERE id = $3 RETURNING *',
        ['google', 'https://example.com/google-avatar.png', sampleUser.id],
      );
      expect(result).toEqual(convertedUser);
    });

    it('returns null when user not found', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await convertToGoogle('nonexistent', 'https://example.com/avatar.png');

      expect(result).toBeNull();
    });
  });
});
