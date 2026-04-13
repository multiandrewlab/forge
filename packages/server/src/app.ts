import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import oauthPlugin from '@fastify/oauth2';
import { authPlugin } from './plugins/auth.js';
import { rateLimitPlugin } from './plugins/rate-limit.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { postRoutes } from './routes/posts.js';
import { voteRoutes } from './routes/votes.js';
import { bookmarkRoutes } from './routes/bookmarks.js';
import { tagRoutes } from './routes/tags.js';
import { commentRoutes } from './routes/comments.js';
import { searchRoutes } from './routes/search.js';
import { aiRoutes } from './routes/ai.js';
import { langchainPlugin } from './plugins/langchain/index.js';
import { websocketPlugin } from './plugins/websocket/index.js';

export async function buildApp() {
  const app = Fastify({
    logger: process.env.NODE_ENV !== 'test',
  });

  await app.register(cors);
  await app.register(cookie);
  await app.register(jwt, {
    secret: process.env.JWT_SECRET ?? 'dev-secret-change-in-production',
  });

  // Only register Google OAuth if credentials are configured
  if (process.env.GOOGLE_CLIENT_ID) {
    await app.register(oauthPlugin, {
      name: 'googleOAuth2',
      credentials: {
        client: {
          id: process.env.GOOGLE_CLIENT_ID,
          secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
        },
        auth: {
          authorizeHost: 'https://accounts.google.com',
          authorizePath: '/o/oauth2/v2/auth',
          tokenHost: 'https://www.googleapis.com',
          tokenPath: '/oauth2/v4/token',
        },
      },
      startRedirectPath: '/api/auth/google',
      callbackUri:
        process.env.GOOGLE_CALLBACK_URL ?? 'http://localhost:3000/api/auth/google/callback',
      scope: ['profile', 'email'],
    });
  }

  await app.register(rateLimitPlugin);
  await app.register(authPlugin);
  await app.register(langchainPlugin);
  await app.register(websocketPlugin);
  await app.register(healthRoutes);
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(postRoutes, { prefix: '/api/posts' });
  await app.register(searchRoutes, { prefix: '/api' });
  await app.register(voteRoutes, { prefix: '/api/posts' });
  await app.register(bookmarkRoutes, { prefix: '/api' });
  await app.register(tagRoutes, { prefix: '/api/tags' });
  await app.register(commentRoutes, { prefix: '/api/posts' });
  await app.register(aiRoutes, { prefix: '/api/ai' });

  return app;
}
