import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { authPlugin } from '../../plugins/auth.js';

const JWT_SECRET = 'test-secret-for-auth-plugin';

async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  await app.register(fastifyJwt, { secret: JWT_SECRET });
  await app.register(authPlugin);

  // Test route protected by authenticate preHandler
  app.get('/protected', { preHandler: [app.authenticate] }, async (request) => {
    return { user: request.user };
  });

  return app;
}

describe('authPlugin', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 200 with user payload for a valid token', async () => {
    const token = app.jwt.sign({
      id: 'user-123',
      email: 'alice@example.com',
      displayName: 'Alice',
    });

    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ user: { id: string; email: string; displayName: string } }>();
    expect(body.user).toMatchObject({
      id: 'user-123',
      email: 'alice@example.com',
      displayName: 'Alice',
    });
  });

  it('returns 401 for an expired token', async () => {
    // Sign with iat in the past and a 1s expiry so the token is already expired
    const pastIat = Math.floor(Date.now() / 1000) - 3600;
    const token = app.jwt.sign(
      { id: 'user-123', email: 'alice@example.com', displayName: 'Alice', iat: pastIat },
      { expiresIn: '1s' },
    );

    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json<{ error: string }>()).toEqual({ error: 'Unauthorized' });
  });

  it('returns 401 when authorization header is missing', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/protected',
    });

    expect(response.statusCode).toBe(401);
    expect(response.json<{ error: string }>()).toEqual({ error: 'Unauthorized' });
  });

  it('returns 401 for a malformed token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: {
        authorization: 'Bearer not-a-valid-jwt-token',
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json<{ error: string }>()).toEqual({ error: 'Unauthorized' });
  });

  it('returns 401 when authorization header has no Bearer prefix', async () => {
    const token = app.jwt.sign({
      id: 'user-123',
      email: 'alice@example.com',
      displayName: 'Alice',
    });

    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: {
        authorization: token,
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json<{ error: string }>()).toEqual({ error: 'Unauthorized' });
  });

  it('decorates the fastify instance with authenticate', async () => {
    expect(app.authenticate).toBeDefined();
    expect(typeof app.authenticate).toBe('function');
  });
});
