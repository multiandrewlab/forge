import { describe, it, expect, beforeAll, afterAll, beforeEach, vi, type Mock } from 'vitest';

vi.mock('../../db/connection.js', () => ({
  query: vi.fn(),
}));

vi.mock('../../services/auth.js', () => ({
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
  generateAccessToken: vi.fn(),
  generateRefreshToken: vi.fn(),
  verifyRefreshToken: vi.fn(),
}));

import { query } from '../../db/connection.js';
import {
  hashPassword,
  verifyPassword,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from '../../services/auth.js';
import { buildApp } from '../../app.js';
import type { FastifyInstance } from 'fastify';
import type { UserRow } from '../../db/queries/types.js';

const mockQuery = query as Mock;
const mockHashPassword = hashPassword as Mock;
const mockVerifyPassword = verifyPassword as Mock;
const mockGenerateAccessToken = generateAccessToken as Mock;
const mockGenerateRefreshToken = generateRefreshToken as Mock;
const mockVerifyRefreshToken = verifyRefreshToken as Mock;

const sampleUserRow: UserRow = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  email: 'alice@example.com',
  display_name: 'Alice',
  avatar_url: null,
  auth_provider: 'local',
  password_hash: '$2b$12$hashed',
  created_at: new Date('2026-01-01'),
  updated_at: new Date('2026-01-01'),
};

describe('auth routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.JWT_REFRESH_SECRET;
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/auth/register', () => {
    it('registers a new user and returns user with accessToken', async () => {
      // findUserByEmail returns null (email not taken)
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      // createUser returns the new user
      mockQuery.mockResolvedValueOnce({ rows: [sampleUserRow], rowCount: 1 });
      mockHashPassword.mockResolvedValue('$2b$12$hashed');
      mockGenerateAccessToken.mockReturnValue('access-token-123');
      mockGenerateRefreshToken.mockReturnValue('refresh-token-456');

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          email: 'alice@example.com',
          display_name: 'Alice',
          password: 'password1A',
          confirm_password: 'password1A',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.user).toMatchObject({
        id: sampleUserRow.id,
        email: 'alice@example.com',
        displayName: 'Alice',
        authProvider: 'local',
      });
      expect(body.user).not.toHaveProperty('password_hash');
      expect(body.user).not.toHaveProperty('passwordHash');
      expect(body.accessToken).toBe('access-token-123');
      expect(mockHashPassword).toHaveBeenCalledWith('password1A');

      // Check refresh cookie was set
      const setCookieHeader = response.headers['set-cookie'];
      expect(setCookieHeader).toBeDefined();
      const cookieStr = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
      expect(cookieStr).toContain('refresh_token=refresh-token-456');
      expect(cookieStr).toContain('HttpOnly');
      expect(cookieStr).toContain('SameSite=Strict');
      expect(cookieStr).toContain('Path=/api/auth/refresh');
    });

    it('returns 409 when email is already taken', async () => {
      // findUserByEmail returns existing user
      mockQuery.mockResolvedValueOnce({ rows: [sampleUserRow], rowCount: 1 });

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          email: 'alice@example.com',
          display_name: 'Alice',
          password: 'password1A',
          confirm_password: 'password1A',
        },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({ error: 'Email already in use' });
    });

    it('returns 400 for invalid input (missing email)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          display_name: 'Alice',
          password: 'password1A',
          confirm_password: 'password1A',
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toHaveProperty('error');
    });

    it('returns 400 for invalid input (passwords do not match)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          email: 'alice@example.com',
          display_name: 'Alice',
          password: 'password1A',
          confirm_password: 'differentPassword1',
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toHaveProperty('error');
    });

    it('returns 400 for invalid input (password too short)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          email: 'alice@example.com',
          display_name: 'Alice',
          password: 'short1',
          confirm_password: 'short1',
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toHaveProperty('error');
    });

    it('returns 400 for invalid email format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          email: 'not-an-email',
          display_name: 'Alice',
          password: 'password1A',
          confirm_password: 'password1A',
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toHaveProperty('error');
    });
  });

  describe('POST /api/auth/login', () => {
    it('logs in a local user and returns user with accessToken', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleUserRow], rowCount: 1 });
      mockVerifyPassword.mockResolvedValue(true);
      mockGenerateAccessToken.mockReturnValue('access-token-login');
      mockGenerateRefreshToken.mockReturnValue('refresh-token-login');

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          email: 'alice@example.com',
          password: 'password1A',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.user).toMatchObject({
        id: sampleUserRow.id,
        email: 'alice@example.com',
        displayName: 'Alice',
      });
      expect(body.user).not.toHaveProperty('password_hash');
      expect(body.accessToken).toBe('access-token-login');
      expect(mockVerifyPassword).toHaveBeenCalledWith('password1A', '$2b$12$hashed');

      const setCookieHeader = response.headers['set-cookie'];
      expect(setCookieHeader).toBeDefined();
      const cookieStr = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
      expect(cookieStr).toContain('refresh_token=refresh-token-login');
    });

    it('returns 401 when user not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          email: 'nobody@example.com',
          password: 'password1A',
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: 'Invalid email or password' });
    });

    it('returns 401 with message for Google auth user', async () => {
      const googleUser: UserRow = {
        ...sampleUserRow,
        auth_provider: 'google',
        password_hash: null,
      };
      mockQuery.mockResolvedValueOnce({ rows: [googleUser], rowCount: 1 });

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          email: 'alice@example.com',
          password: 'password1A',
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: 'Use Google sign-in for this account' });
    });

    it('returns 401 when password is incorrect', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleUserRow], rowCount: 1 });
      mockVerifyPassword.mockResolvedValue(false);

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          email: 'alice@example.com',
          password: 'wrongpassword1',
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: 'Invalid email or password' });
    });

    it('returns 400 for invalid input (missing password)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          email: 'alice@example.com',
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toHaveProperty('error');
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('returns a new accessToken when refresh token is valid', async () => {
      mockVerifyRefreshToken.mockReturnValue({ id: sampleUserRow.id });
      mockQuery.mockResolvedValueOnce({ rows: [sampleUserRow], rowCount: 1 });
      mockGenerateAccessToken.mockReturnValue('new-access-token');
      mockGenerateRefreshToken.mockReturnValue('new-refresh-token');

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        cookies: {
          refresh_token: 'valid-refresh-token',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ accessToken: 'new-access-token' });
      expect(mockVerifyRefreshToken).toHaveBeenCalledWith(expect.anything(), 'valid-refresh-token');

      const setCookieHeader = response.headers['set-cookie'];
      expect(setCookieHeader).toBeDefined();
      const cookieStr = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
      expect(cookieStr).toContain('refresh_token=new-refresh-token');
    });

    it('returns 401 when no refresh token cookie is present', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: 'No refresh token' });
    });

    it('returns 401 when refresh token is invalid', async () => {
      mockVerifyRefreshToken.mockImplementation(() => {
        throw new Error('invalid token');
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        cookies: {
          refresh_token: 'bad-refresh-token',
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: 'Invalid refresh token' });
    });

    it('returns 401 when user no longer exists', async () => {
      mockVerifyRefreshToken.mockReturnValue({ id: 'deleted-user-id' });
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        cookies: {
          refresh_token: 'valid-but-orphan-token',
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: 'User not found' });
    });
  });

  describe('POST /api/auth/logout', () => {
    it('clears the refresh cookie and returns 204', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
      });

      expect(response.statusCode).toBe(204);
      expect(response.body).toBe('');

      const setCookieHeader = response.headers['set-cookie'];
      expect(setCookieHeader).toBeDefined();
      const cookieStr = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
      expect(cookieStr).toContain('refresh_token=');
      expect(cookieStr).toContain('Max-Age=0');
    });
  });

  describe('GET /api/auth/me', () => {
    it('returns the authenticated user (without password_hash)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleUserRow], rowCount: 1 });

      // Generate a real JWT token for this test
      const token = app.jwt.sign({
        id: sampleUserRow.id,
        email: sampleUserRow.email,
        displayName: sampleUserRow.display_name,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toMatchObject({
        id: sampleUserRow.id,
        email: 'alice@example.com',
        displayName: 'Alice',
      });
      expect(body).not.toHaveProperty('password_hash');
      expect(body).not.toHaveProperty('passwordHash');
    });

    it('returns 401 when not authenticated', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: 'Unauthorized' });
    });

    it('returns 401 when user no longer exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const token = app.jwt.sign({
        id: 'deleted-user-id',
        email: 'gone@example.com',
        displayName: 'Gone',
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: 'User not found' });
    });
  });

  describe('PATCH /api/auth/me', () => {
    it('updates the user profile and returns updated user', async () => {
      const updatedRow: UserRow = {
        ...sampleUserRow,
        display_name: 'Alice Updated',
      };
      // findUserById for auth check
      mockQuery.mockResolvedValueOnce({ rows: [sampleUserRow], rowCount: 1 });
      // updateUser returns updated row
      mockQuery.mockResolvedValueOnce({ rows: [updatedRow], rowCount: 1 });

      const token = app.jwt.sign({
        id: sampleUserRow.id,
        email: sampleUserRow.email,
        displayName: sampleUserRow.display_name,
      });

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/auth/me',
        headers: {
          authorization: `Bearer ${token}`,
        },
        payload: {
          display_name: 'Alice Updated',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toMatchObject({
        id: sampleUserRow.id,
        displayName: 'Alice Updated',
      });
      expect(body).not.toHaveProperty('password_hash');
    });

    it('returns 401 when not authenticated', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/auth/me',
        payload: {
          display_name: 'Alice Updated',
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: 'Unauthorized' });
    });

    it('returns 400 for invalid input', async () => {
      // findUserById for the auth check inside the route handler
      mockQuery.mockResolvedValueOnce({ rows: [sampleUserRow], rowCount: 1 });

      const token = app.jwt.sign({
        id: sampleUserRow.id,
        email: sampleUserRow.email,
        displayName: sampleUserRow.display_name,
      });

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/auth/me',
        headers: {
          authorization: `Bearer ${token}`,
        },
        payload: {
          display_name: '', // min length 1
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toHaveProperty('error');
    });

    it('returns 400 for invalid avatar_url', async () => {
      // findUserById for the auth check inside the route handler
      mockQuery.mockResolvedValueOnce({ rows: [sampleUserRow], rowCount: 1 });

      const token = app.jwt.sign({
        id: sampleUserRow.id,
        email: sampleUserRow.email,
        displayName: sampleUserRow.display_name,
      });

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/auth/me',
        headers: {
          authorization: `Bearer ${token}`,
        },
        payload: {
          avatar_url: 'not-a-url',
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toHaveProperty('error');
    });

    it('updates avatar_url successfully', async () => {
      const updatedRow: UserRow = {
        ...sampleUserRow,
        avatar_url: 'https://example.com/avatar.png',
      };
      // findUserById for auth check
      mockQuery.mockResolvedValueOnce({ rows: [sampleUserRow], rowCount: 1 });
      // updateUser returns updated row
      mockQuery.mockResolvedValueOnce({ rows: [updatedRow], rowCount: 1 });

      const token = app.jwt.sign({
        id: sampleUserRow.id,
        email: sampleUserRow.email,
        displayName: sampleUserRow.display_name,
      });

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/auth/me',
        headers: {
          authorization: `Bearer ${token}`,
        },
        payload: {
          avatar_url: 'https://example.com/avatar.png',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toMatchObject({
        avatarUrl: 'https://example.com/avatar.png',
      });
    });

    it('returns 401 when user no longer exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const token = app.jwt.sign({
        id: 'deleted-user-id',
        email: 'gone@example.com',
        displayName: 'Gone',
      });

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/auth/me',
        headers: {
          authorization: `Bearer ${token}`,
        },
        payload: {
          display_name: 'New Name',
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: 'User not found' });
    });

    it('returns 401 when user disappears between auth check and update', async () => {
      // findUserById succeeds for auth check
      mockQuery.mockResolvedValueOnce({ rows: [sampleUserRow], rowCount: 1 });
      // updateUser returns null (user deleted between checks)
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const token = app.jwt.sign({
        id: sampleUserRow.id,
        email: sampleUserRow.email,
        displayName: sampleUserRow.display_name,
      });

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/auth/me',
        headers: {
          authorization: `Bearer ${token}`,
        },
        payload: {
          display_name: 'New Name',
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: 'User not found' });
    });
  });
});
