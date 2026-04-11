import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import '@fastify/jwt';

/** Bcrypt cost factor. Must be >= 12 for production security. */
export const BCRYPT_ROUNDS = 12;

/**
 * Hash a plaintext password using bcrypt.
 * Returns the bcrypt hash string.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * Compare a plaintext password against a bcrypt hash.
 * Returns true if the password matches.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Sign a short-lived access token (15 min) containing user identity claims.
 * Uses the default JWT secret configured on the Fastify instance.
 */
export function generateAccessToken(
  fastify: FastifyInstance,
  user: { id: string; email: string; displayName: string },
): string {
  return fastify.jwt.sign(
    { id: user.id, email: user.email, displayName: user.displayName },
    { expiresIn: '15m' },
  );
}

function getRefreshSecret(): string {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret) {
    throw new Error('JWT_REFRESH_SECRET environment variable is not set');
  }
  return secret;
}

/**
 * Sign a long-lived refresh token (7 days) containing only the user id.
 * Uses a separate secret (JWT_REFRESH_SECRET) from the access token.
 */
export function generateRefreshToken(fastify: FastifyInstance, user: { id: string }): string {
  const refreshSecret = getRefreshSecret();
  return fastify.jwt.sign({ id: user.id }, { expiresIn: '7d', key: refreshSecret });
}

/**
 * Verify a refresh token and return the decoded payload.
 * Throws if the token is invalid, expired, or JWT_REFRESH_SECRET is not set.
 */
export function verifyRefreshToken(fastify: FastifyInstance, token: string): { id: string } {
  const refreshSecret = getRefreshSecret();
  return fastify.jwt.verify<{ id: string }>(token, { key: refreshSecret });
}
