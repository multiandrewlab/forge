import type { FastifyInstance } from 'fastify';
import { registerSchema, loginSchema, updateProfileSchema } from '@forge/shared';
import type { User } from '@forge/shared';
import { findUserByEmail, findUserById, createUser, updateUser } from '../db/queries/users.js';
import type { UserRow } from '../db/queries/types.js';
import {
  hashPassword,
  verifyPassword,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from '../services/auth.js';

function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    authProvider: row.auth_provider as User['authProvider'],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getRefreshCookieOptions(): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'strict';
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/auth/refresh',
    maxAge: 7 * 24 * 60 * 60,
  };
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // POST /register
  app.post('/register', async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: parsed.error.errors.map((e) => e.message).join(', ') });
    }

    const { email, display_name, password } = parsed.data;

    const existing = await findUserByEmail(email);
    if (existing) {
      return reply.status(409).send({ error: 'Email already in use' });
    }

    const passwordHash = await hashPassword(password);
    const row = await createUser({
      email,
      displayName: display_name,
      avatarUrl: null,
      authProvider: 'local',
      passwordHash,
    });

    const user = toUser(row);
    const accessToken = generateAccessToken(app, {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
    });
    const refreshToken = generateRefreshToken(app, { id: user.id });

    void reply.setCookie('refresh_token', refreshToken, getRefreshCookieOptions());

    return reply.send({ user, accessToken });
  });

  // POST /login
  app.post('/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: parsed.error.errors.map((e) => e.message).join(', ') });
    }

    const { email, password } = parsed.data;

    const row = await findUserByEmail(email);
    if (!row) {
      return reply.status(401).send({ error: 'Invalid email or password' });
    }

    if (row.auth_provider === 'google') {
      return reply.status(401).send({ error: 'Use Google sign-in for this account' });
    }

    const valid = await verifyPassword(password, row.password_hash as string);
    if (!valid) {
      return reply.status(401).send({ error: 'Invalid email or password' });
    }

    const user = toUser(row);
    const accessToken = generateAccessToken(app, {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
    });
    const refreshToken = generateRefreshToken(app, { id: user.id });

    void reply.setCookie('refresh_token', refreshToken, getRefreshCookieOptions());

    return reply.send({ user, accessToken });
  });

  // POST /refresh
  app.post('/refresh', async (request, reply) => {
    const token = request.cookies.refresh_token;
    if (!token) {
      return reply.status(401).send({ error: 'No refresh token' });
    }

    let payload: { id: string };
    try {
      payload = verifyRefreshToken(app, token);
    } catch {
      return reply.status(401).send({ error: 'Invalid refresh token' });
    }

    const row = await findUserById(payload.id);
    if (!row) {
      return reply.status(401).send({ error: 'User not found' });
    }

    const user = toUser(row);
    const accessToken = generateAccessToken(app, {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
    });
    const newRefreshToken = generateRefreshToken(app, { id: user.id });

    void reply.setCookie('refresh_token', newRefreshToken, getRefreshCookieOptions());

    return reply.send({ accessToken });
  });

  // POST /logout
  app.post('/logout', async (_request, reply) => {
    void reply.clearCookie('refresh_token', { path: '/api/auth/refresh' });
    return reply.status(204).send();
  });

  // GET /me (authenticated)
  app.get('/me', { preHandler: [app.authenticate] }, async (request, reply) => {
    const row = await findUserById(request.user.id);
    if (!row) {
      return reply.status(401).send({ error: 'User not found' });
    }

    return reply.send(toUser(row));
  });

  // PATCH /me (authenticated)
  app.patch('/me', { preHandler: [app.authenticate] }, async (request, reply) => {
    const row = await findUserById(request.user.id);
    if (!row) {
      return reply.status(401).send({ error: 'User not found' });
    }

    const parsed = updateProfileSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: parsed.error.errors.map((e) => e.message).join(', ') });
    }

    const fields: { displayName?: string; avatarUrl?: string | null } = {};
    if (parsed.data.display_name !== undefined) {
      fields.displayName = parsed.data.display_name;
    }
    if (parsed.data.avatar_url !== undefined) {
      fields.avatarUrl = parsed.data.avatar_url;
    }

    const updatedRow = await updateUser(request.user.id, fields);
    if (!updatedRow) {
      return reply.status(401).send({ error: 'User not found' });
    }

    return reply.send(toUser(updatedRow));
  });
}
