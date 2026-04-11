import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import { authPlugin } from './plugins/auth.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';

export async function buildApp() {
  const app = Fastify({
    logger: process.env.NODE_ENV !== 'test',
  });

  await app.register(cors);
  await app.register(cookie);
  await app.register(jwt, {
    secret: process.env.JWT_SECRET ?? 'dev-secret-change-in-production',
  });
  await app.register(authPlugin);
  await app.register(healthRoutes);
  await app.register(authRoutes, { prefix: '/api/auth' });

  return app;
}
