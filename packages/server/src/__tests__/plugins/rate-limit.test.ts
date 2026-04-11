import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

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

import { buildApp } from '../../app.js';
import type { FastifyInstance } from 'fastify';

describe('rate-limit plugin', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.JWT_REFRESH_SECRET;
  });

  describe('POST /api/auth/login rate limit', () => {
    it('returns 429 after exceeding 5 requests per minute', async () => {
      // Make 5 allowed requests
      for (let i = 0; i < 5; i++) {
        const response = await app.inject({
          method: 'POST',
          url: '/api/auth/login',
          payload: { email: 'test@example.com', password: 'password1A' },
        });
        expect(response.statusCode).not.toBe(429);
      }

      // The 6th request should be rate limited
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'test@example.com', password: 'password1A' },
      });

      expect(response.statusCode).toBe(429);
    });

    it('includes rate limit headers in responses', async () => {
      // Use a fresh app to avoid interference from other tests
      const freshApp = await buildApp();

      const response = await freshApp.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'test@example.com', password: 'password1A' },
      });

      expect(response.headers['x-ratelimit-limit']).toBeDefined();
      expect(response.headers['x-ratelimit-remaining']).toBeDefined();

      await freshApp.close();
    });
  });

  describe('POST /api/auth/register rate limit', () => {
    it('returns 429 after exceeding 3 requests per hour', async () => {
      const freshApp = await buildApp();

      // Make 3 allowed requests
      for (let i = 0; i < 3; i++) {
        const response = await freshApp.inject({
          method: 'POST',
          url: '/api/auth/register',
          payload: {
            email: `test${i}@example.com`,
            display_name: 'Test',
            password: 'password1A',
            confirm_password: 'password1A',
          },
        });
        expect(response.statusCode).not.toBe(429);
      }

      // The 4th request should be rate limited
      const response = await freshApp.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          email: 'test4@example.com',
          display_name: 'Test',
          password: 'password1A',
          confirm_password: 'password1A',
        },
      });

      expect(response.statusCode).toBe(429);

      await freshApp.close();
    });
  });

  describe('GET /api/auth/google/callback rate limit', () => {
    it('returns 429 after exceeding 10 requests per minute', async () => {
      const freshApp = await buildApp();

      // Make 10 allowed requests (they will fail with 501 since OAuth isn't configured, but not 429)
      for (let i = 0; i < 10; i++) {
        const response = await freshApp.inject({
          method: 'GET',
          url: '/api/auth/google/callback?code=test',
        });
        expect(response.statusCode).not.toBe(429);
      }

      // The 11th request should be rate limited
      const response = await freshApp.inject({
        method: 'GET',
        url: '/api/auth/google/callback?code=test',
      });

      expect(response.statusCode).toBe(429);

      await freshApp.close();
    });
  });
});
