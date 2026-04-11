import type { FastifyInstance } from 'fastify';
import type { OAuth2Namespace } from '@fastify/oauth2';
import { registerSchema, loginSchema, updateProfileSchema } from '@forge/shared';
import type { User } from '@forge/shared';

declare module 'fastify' {
  interface FastifyInstance {
    googleOAuth2?: OAuth2Namespace;
  }
}
import {
  findUserByEmail,
  findUserById,
  createUser,
  updateUser,
  updateUserAvatar,
  convertToGoogle,
} from '../db/queries/users.js';
import type { UserRow } from '../db/queries/types.js';
import {
  hashPassword,
  verifyPassword,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from '../services/auth.js';

interface GoogleProfile {
  email?: string;
  name?: string;
  picture?: string;
}

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

  // GET /google/callback — handles the OAuth2 callback from Google
  app.get('/google/callback', async (request, reply) => {
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';

    const oauth2 = app.googleOAuth2;
    if (!oauth2) {
      return reply.status(501).send({ error: 'Google OAuth is not configured' });
    }

    // Exchange authorization code for access token
    const { token } = await oauth2.getAccessTokenFromAuthorizationCodeFlow(request);

    // Fetch Google profile
    const profileResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    const profile = (await profileResponse.json()) as GoogleProfile;

    if (!profile.email) {
      return reply.status(502).send({ error: 'Google did not return an email address' });
    }

    const existing = await findUserByEmail(profile.email);

    // Case 1: New user — create with google auth_provider
    if (!existing) {
      const row = await createUser({
        email: profile.email,
        displayName: profile.name ?? profile.email,
        avatarUrl: profile.picture ?? null,
        authProvider: 'google',
        passwordHash: null,
      });
      const user = toUser(row);
      const accessToken = generateAccessToken(app, {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
      });
      const refreshToken = generateRefreshToken(app, { id: user.id });
      void reply.setCookie('refresh_token', refreshToken, getRefreshCookieOptions());
      return reply.redirect(`${frontendUrl}/auth/callback#access_token=${accessToken}`);
    }

    // Case 2: Existing Google user — update avatar, generate tokens
    if (existing.auth_provider === 'google') {
      await updateUserAvatar(existing.id, profile.picture ?? existing.avatar_url ?? '');
      const user = toUser(existing);
      const accessToken = generateAccessToken(app, {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
      });
      const refreshToken = generateRefreshToken(app, { id: user.id });
      void reply.setCookie('refresh_token', refreshToken, getRefreshCookieOptions());
      return reply.redirect(`${frontendUrl}/auth/callback#access_token=${accessToken}`);
    }

    // Case 3: Existing local user — generate link token and redirect to link page
    const linkToken = app.jwt.sign(
      { userId: existing.id, googleAvatarUrl: profile.picture ?? '' },
      { expiresIn: '10m' },
    );
    return reply.redirect(`${frontendUrl}/auth/link#link_token=${linkToken}`);
  });

  // POST /link-google — links a local account to Google
  app.post('/link-google', async (request, reply) => {
    const body = request.body as { linkToken?: string; password?: string } | undefined;

    if (!body?.linkToken || !body?.password) {
      return reply.status(400).send({ error: 'linkToken and password are required' });
    }

    // Verify the link token
    let payload: { userId: string; googleAvatarUrl: string };
    try {
      payload = app.jwt.verify<{ userId: string; googleAvatarUrl: string }>(body.linkToken);
    } catch {
      return reply.status(401).send({ error: 'Invalid or expired link token' });
    }

    // Look up the user
    const row = await findUserById(payload.userId);
    if (!row) {
      return reply.status(401).send({ error: 'User not found' });
    }

    // Verify the password
    const valid = await verifyPassword(body.password, row.password_hash as string);
    if (!valid) {
      return reply.status(401).send({ error: 'Invalid password' });
    }

    // Convert account to Google
    const updatedRow = await convertToGoogle(row.id, payload.googleAvatarUrl);
    if (!updatedRow) {
      return reply.status(401).send({ error: 'User not found' });
    }
    const user = toUser(updatedRow);
    const accessToken = generateAccessToken(app, {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
    });
    const refreshToken = generateRefreshToken(app, { id: user.id });

    void reply.setCookie('refresh_token', refreshToken, getRefreshCookieOptions());

    return reply.send({ user, accessToken });
  });
}
