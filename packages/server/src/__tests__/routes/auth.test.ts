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

vi.mock('../../services/lockout.js', () => ({
  lockoutService: {
    checkLockout: vi.fn().mockReturnValue({ locked: false }),
    recordFailure: vi.fn(),
    resetFailures: vi.fn(),
  },
}));

// Disable rate limiting in auth route tests to avoid interference
vi.mock('../../plugins/rate-limit.js', () => ({
  rateLimitPlugin: async () => {
    // no-op: rate limiting is tested separately in plugins/rate-limit.test.ts
  },
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { query } from '../../db/connection.js';
import {
  hashPassword,
  verifyPassword,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from '../../services/auth.js';
import { lockoutService } from '../../services/lockout.js';
import { buildApp } from '../../app.js';
import type { FastifyInstance } from 'fastify';
import type { UserRow } from '../../db/queries/types.js';

const mockQuery = query as Mock;
const mockHashPassword = hashPassword as Mock;
const mockVerifyPassword = verifyPassword as Mock;
const mockGenerateAccessToken = generateAccessToken as Mock;
const mockGenerateRefreshToken = generateRefreshToken as Mock;
const mockVerifyRefreshToken = verifyRefreshToken as Mock;
const mockCheckLockout = lockoutService.checkLockout as Mock;
const mockRecordFailure = lockoutService.recordFailure as Mock;
const mockResetFailures = lockoutService.resetFailures as Mock;

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

const mockGetAccessToken = vi.fn();

describe('auth routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
    app = await buildApp();
    // Decorate with mock googleOAuth2 before app is started (before first inject)
    app.decorate('googleOAuth2', {
      getAccessTokenFromAuthorizationCodeFlow: mockGetAccessToken,
    });
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

    it('returns 423 when account is locked', async () => {
      mockCheckLockout.mockReturnValueOnce({ locked: true, remainingMs: 600000 });

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          email: 'locked@example.com',
          password: 'password1A',
        },
      });

      expect(response.statusCode).toBe(423);
      const body = response.json();
      expect(body.error).toBe('Account locked due to too many failed attempts. Try again later.');
      expect(body.retryAfter).toBe(600000);
      expect(mockCheckLockout).toHaveBeenCalledWith('locked@example.com');
    });

    it('returns 423 even with correct password when account is locked', async () => {
      mockCheckLockout.mockReturnValueOnce({ locked: true, remainingMs: 300000 });

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          email: 'alice@example.com',
          password: 'password1A',
        },
      });

      expect(response.statusCode).toBe(423);
      // Password should NOT have been checked
      expect(mockVerifyPassword).not.toHaveBeenCalled();
    });

    it('records failure on wrong password', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleUserRow], rowCount: 1 });
      mockVerifyPassword.mockResolvedValue(false);

      await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          email: 'alice@example.com',
          password: 'wrongpassword1',
        },
      });

      expect(mockRecordFailure).toHaveBeenCalledWith('alice@example.com');
    });

    it('resets failures on successful login', async () => {
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
      expect(mockResetFailures).toHaveBeenCalledWith('alice@example.com');
    });

    it('does not record failure when user is not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          email: 'nobody@example.com',
          password: 'password1A',
        },
      });

      expect(mockRecordFailure).not.toHaveBeenCalled();
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

  describe('GET /api/auth/google/callback', () => {
    const googleUserRow: UserRow = {
      id: '660e8400-e29b-41d4-a716-446655440000',
      email: 'bob@gmail.com',
      display_name: 'Bob Google',
      avatar_url: 'https://lh3.googleusercontent.com/old-avatar',
      auth_provider: 'google',
      password_hash: null,
      created_at: new Date('2026-01-01'),
      updated_at: new Date('2026-01-01'),
    };

    function setupOAuthMock(accessToken: string): void {
      mockGetAccessToken.mockResolvedValue({
        token: { access_token: accessToken, token_type: 'Bearer', expires_in: 3600 },
      });
    }

    function mockGoogleProfile(profile: { email?: string; name?: string; picture?: string }): void {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => profile,
      });
    }

    it('creates a new user when Google email does not exist', async () => {
      setupOAuthMock('google-access-token');
      mockGoogleProfile({
        email: 'new@gmail.com',
        name: 'New User',
        picture: 'https://lh3.googleusercontent.com/new-avatar',
      });

      // findUserByEmail returns null (no existing user)
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      // createUser returns the new user
      const newGoogleUser: UserRow = {
        id: '770e8400-e29b-41d4-a716-446655440000',
        email: 'new@gmail.com',
        display_name: 'New User',
        avatar_url: 'https://lh3.googleusercontent.com/new-avatar',
        auth_provider: 'google',
        password_hash: null,
        created_at: new Date('2026-01-01'),
        updated_at: new Date('2026-01-01'),
      };
      mockQuery.mockResolvedValueOnce({ rows: [newGoogleUser], rowCount: 1 });
      mockGenerateAccessToken.mockReturnValue('new-google-access');
      mockGenerateRefreshToken.mockReturnValue('new-google-refresh');

      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/google/callback?code=auth-code',
      });

      expect(response.statusCode).toBe(302);
      const location = response.headers.location as string;
      expect(location).toContain('/auth/callback#access_token=new-google-access');

      // Verify createUser was called with google auth_provider
      expect(mockQuery).toHaveBeenCalledTimes(2);
      const createCall = mockQuery.mock.calls[1];
      expect(createCall[0]).toContain('INSERT INTO users');
      expect(createCall[1]).toContain('google');
    });

    it('updates avatar and generates tokens for existing Google user', async () => {
      setupOAuthMock('google-access-token');
      mockGoogleProfile({
        email: 'bob@gmail.com',
        name: 'Bob Google',
        picture: 'https://lh3.googleusercontent.com/updated-avatar',
      });

      // findUserByEmail returns existing google user
      mockQuery.mockResolvedValueOnce({ rows: [googleUserRow], rowCount: 1 });
      // updateUserAvatar returns updated user
      const updatedRow: UserRow = {
        ...googleUserRow,
        avatar_url: 'https://lh3.googleusercontent.com/updated-avatar',
      };
      mockQuery.mockResolvedValueOnce({ rows: [updatedRow], rowCount: 1 });
      mockGenerateAccessToken.mockReturnValue('existing-google-access');
      mockGenerateRefreshToken.mockReturnValue('existing-google-refresh');

      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/google/callback?code=auth-code',
      });

      expect(response.statusCode).toBe(302);
      const location = response.headers.location as string;
      expect(location).toContain('/auth/callback#access_token=existing-google-access');

      // Verify updateUserAvatar was called
      const updateCall = mockQuery.mock.calls[1];
      expect(updateCall[0]).toContain('UPDATE users SET avatar_url');
    });

    it('redirects to link page with link token for existing local user', async () => {
      setupOAuthMock('google-access-token');
      mockGoogleProfile({
        email: 'alice@example.com',
        name: 'Alice',
        picture: 'https://lh3.googleusercontent.com/alice-avatar',
      });

      // findUserByEmail returns existing local user
      mockQuery.mockResolvedValueOnce({ rows: [sampleUserRow], rowCount: 1 });

      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/google/callback?code=auth-code',
      });

      expect(response.statusCode).toBe(302);
      const location = response.headers.location as string;
      expect(location).toContain('/auth/link#link_token=');

      // Verify the link token is a valid JWT containing userId and googleAvatarUrl
      const linkToken = location.split('link_token=')[1];
      const decoded = app.jwt.verify<{ userId: string; googleAvatarUrl: string }>(linkToken);
      expect(decoded.userId).toBe(sampleUserRow.id);
      expect(decoded.googleAvatarUrl).toBe('https://lh3.googleusercontent.com/alice-avatar');
    });

    it('returns 502 when Google profile has no email', async () => {
      setupOAuthMock('google-access-token');
      mockGoogleProfile({
        name: 'No Email User',
        picture: 'https://lh3.googleusercontent.com/no-email',
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/google/callback?code=auth-code',
      });

      expect(response.statusCode).toBe(502);
      expect(response.json()).toEqual({ error: 'Google did not return an email address' });
    });

    it('uses email as displayName when Google profile has no name', async () => {
      setupOAuthMock('google-access-token');
      mockGoogleProfile({
        email: 'noname@gmail.com',
        // no name or picture
      });

      // findUserByEmail returns null (new user)
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      // createUser returns new user
      const newUser: UserRow = {
        id: '880e8400-e29b-41d4-a716-446655440000',
        email: 'noname@gmail.com',
        display_name: 'noname@gmail.com',
        avatar_url: null,
        auth_provider: 'google',
        password_hash: null,
        created_at: new Date('2026-01-01'),
        updated_at: new Date('2026-01-01'),
      };
      mockQuery.mockResolvedValueOnce({ rows: [newUser], rowCount: 1 });
      mockGenerateAccessToken.mockReturnValue('noname-access');
      mockGenerateRefreshToken.mockReturnValue('noname-refresh');

      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/google/callback?code=auth-code',
      });

      expect(response.statusCode).toBe(302);
      // Verify createUser was called with email as displayName and null avatarUrl
      const createCall = mockQuery.mock.calls[1];
      expect(createCall[1]).toContain('noname@gmail.com'); // displayName
      expect(createCall[1]).toContain(null); // avatarUrl
    });

    it('falls back to existing avatar_url when Google profile has no picture (existing google user)', async () => {
      setupOAuthMock('google-access-token');
      mockGoogleProfile({
        email: 'bob@gmail.com',
        name: 'Bob Google',
        // no picture
      });

      // findUserByEmail returns existing google user
      mockQuery.mockResolvedValueOnce({ rows: [googleUserRow], rowCount: 1 });
      // updateUserAvatar
      mockQuery.mockResolvedValueOnce({ rows: [googleUserRow], rowCount: 1 });
      mockGenerateAccessToken.mockReturnValue('nopic-access');
      mockGenerateRefreshToken.mockReturnValue('nopic-refresh');

      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/google/callback?code=auth-code',
      });

      expect(response.statusCode).toBe(302);
      // updateUserAvatar should fall back to existing avatar_url
      const updateCall = mockQuery.mock.calls[1];
      expect(updateCall[1][0]).toBe('https://lh3.googleusercontent.com/old-avatar');
    });

    it('falls back to empty string when google user has no picture and no existing avatar', async () => {
      const googleUserNullAvatar: UserRow = {
        ...googleUserRow,
        avatar_url: null,
      };
      setupOAuthMock('google-access-token');
      mockGoogleProfile({
        email: 'bob@gmail.com',
        name: 'Bob Google',
        // no picture
      });

      // findUserByEmail returns existing google user with null avatar
      mockQuery.mockResolvedValueOnce({ rows: [googleUserNullAvatar], rowCount: 1 });
      // updateUserAvatar
      mockQuery.mockResolvedValueOnce({ rows: [googleUserNullAvatar], rowCount: 1 });
      mockGenerateAccessToken.mockReturnValue('nullav-access');
      mockGenerateRefreshToken.mockReturnValue('nullav-refresh');

      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/google/callback?code=auth-code',
      });

      expect(response.statusCode).toBe(302);
      // updateUserAvatar should fall back to empty string
      const updateCall = mockQuery.mock.calls[1];
      expect(updateCall[1][0]).toBe('');
    });

    it('uses empty string for googleAvatarUrl in link token when no picture (local user)', async () => {
      setupOAuthMock('google-access-token');
      mockGoogleProfile({
        email: 'alice@example.com',
        name: 'Alice',
        // no picture
      });

      // findUserByEmail returns existing local user
      mockQuery.mockResolvedValueOnce({ rows: [sampleUserRow], rowCount: 1 });

      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/google/callback?code=auth-code',
      });

      expect(response.statusCode).toBe(302);
      const location = response.headers.location as string;
      expect(location).toContain('/auth/link#link_token=');

      const linkToken = location.split('link_token=')[1];
      const decoded = app.jwt.verify<{ userId: string; googleAvatarUrl: string }>(linkToken);
      expect(decoded.googleAvatarUrl).toBe('');
    });
  });

  describe('POST /api/auth/link-google', () => {
    it('converts local account to Google and returns tokens', async () => {
      const linkToken = app.jwt.sign(
        {
          userId: sampleUserRow.id,
          googleAvatarUrl: 'https://lh3.googleusercontent.com/alice-avatar',
        },
        { expiresIn: '10m' },
      );

      mockVerifyPassword.mockResolvedValue(true);

      // findUserById returns local user
      mockQuery.mockResolvedValueOnce({ rows: [sampleUserRow], rowCount: 1 });
      // convertToGoogle returns updated user
      const convertedUser: UserRow = {
        ...sampleUserRow,
        auth_provider: 'google',
        avatar_url: 'https://lh3.googleusercontent.com/alice-avatar',
        password_hash: null,
      };
      mockQuery.mockResolvedValueOnce({ rows: [convertedUser], rowCount: 1 });
      mockGenerateAccessToken.mockReturnValue('linked-access-token');
      mockGenerateRefreshToken.mockReturnValue('linked-refresh-token');

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/link-google',
        payload: {
          linkToken,
          password: 'password1A',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.user.authProvider).toBe('google');
      expect(body.user.avatarUrl).toBe('https://lh3.googleusercontent.com/alice-avatar');
      expect(body.accessToken).toBe('linked-access-token');

      // Verify password was checked
      expect(mockVerifyPassword).toHaveBeenCalledWith('password1A', '$2b$12$hashed');

      // Verify refresh cookie was set
      const setCookieHeader = response.headers['set-cookie'];
      expect(setCookieHeader).toBeDefined();
      const cookieStr = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
      expect(cookieStr).toContain('refresh_token=linked-refresh-token');
    });

    it('returns 401 for wrong password', async () => {
      const linkToken = app.jwt.sign(
        {
          userId: sampleUserRow.id,
          googleAvatarUrl: 'https://lh3.googleusercontent.com/alice-avatar',
        },
        { expiresIn: '10m' },
      );

      // findUserById returns local user
      mockQuery.mockResolvedValueOnce({ rows: [sampleUserRow], rowCount: 1 });
      mockVerifyPassword.mockResolvedValue(false);

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/link-google',
        payload: {
          linkToken,
          password: 'wrongpassword1',
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: 'Invalid password' });
    });

    it('returns 401 for expired link token', async () => {
      // Sign a token with an expiry time in the past
      const linkToken = app.jwt.sign(
        {
          userId: sampleUserRow.id,
          googleAvatarUrl: 'https://lh3.googleusercontent.com/alice-avatar',
          // Force expiry in the past by setting iat manually
          iat: Math.floor(Date.now() / 1000) - 120,
        },
        { expiresIn: '1s' },
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/link-google',
        payload: {
          linkToken,
          password: 'password1A',
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: 'Invalid or expired link token' });
    });

    it('returns 401 for invalid link token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/link-google',
        payload: {
          linkToken: 'totally-invalid-token',
          password: 'password1A',
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: 'Invalid or expired link token' });
    });

    it('returns 400 when linkToken is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/link-google',
        payload: {
          password: 'password1A',
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: 'linkToken and password are required' });
    });

    it('returns 400 when password is missing', async () => {
      const linkToken = app.jwt.sign(
        {
          userId: sampleUserRow.id,
          googleAvatarUrl: 'https://lh3.googleusercontent.com/alice-avatar',
        },
        { expiresIn: '10m' },
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/link-google',
        payload: {
          linkToken,
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: 'linkToken and password are required' });
    });

    it('returns 401 when user not found during link', async () => {
      const linkToken = app.jwt.sign(
        {
          userId: 'nonexistent-id',
          googleAvatarUrl: 'https://lh3.googleusercontent.com/avatar',
        },
        { expiresIn: '10m' },
      );

      // findUserById returns null
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/link-google',
        payload: {
          linkToken,
          password: 'password1A',
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: 'User not found' });
    });

    it('returns 401 when user disappears between password check and convert', async () => {
      const linkToken = app.jwt.sign(
        {
          userId: sampleUserRow.id,
          googleAvatarUrl: 'https://lh3.googleusercontent.com/alice-avatar',
        },
        { expiresIn: '10m' },
      );

      mockVerifyPassword.mockResolvedValue(true);

      // findUserById returns user
      mockQuery.mockResolvedValueOnce({ rows: [sampleUserRow], rowCount: 1 });
      // convertToGoogle returns null (user deleted between checks)
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/link-google',
        payload: {
          linkToken,
          password: 'password1A',
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: 'User not found' });
    });
  });

  describe('GET /api/auth/google/callback (no OAuth configured)', () => {
    it('returns 501 when googleOAuth2 is not registered', async () => {
      // Temporarily remove the googleOAuth2 decorator to simulate unconfigured OAuth
      const original = app.googleOAuth2;
      // Use Object.defineProperty to override without triggering Fastify's decorator system
      Object.defineProperty(app, 'googleOAuth2', { value: undefined, configurable: true });

      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/google/callback?code=auth-code',
      });

      // Restore
      Object.defineProperty(app, 'googleOAuth2', { value: original, configurable: true });

      expect(response.statusCode).toBe(501);
      expect(response.json()).toEqual({ error: 'Google OAuth is not configured' });
    });
  });
});

describe('app with Google OAuth configured', () => {
  let oauthApp: FastifyInstance;

  beforeAll(async () => {
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
    process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
    // Intentionally NOT setting GOOGLE_CLIENT_SECRET to cover the ?? '' fallback
    delete process.env.GOOGLE_CLIENT_SECRET;
    oauthApp = await buildApp();
  });

  afterAll(async () => {
    await oauthApp.close();
    delete process.env.JWT_REFRESH_SECRET;
    delete process.env.GOOGLE_CLIENT_ID;
  });

  it('registers the googleOAuth2 plugin when GOOGLE_CLIENT_ID is set', () => {
    expect(oauthApp.googleOAuth2).toBeDefined();
  });
});
