import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import oauthPlugin from '@fastify/oauth2';
import { authPlugin } from './plugins/auth.js';
import { rateLimitPlugin } from './plugins/rate-limit.js';
import { storagePlugin } from './plugins/storage.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { postRoutes } from './routes/posts.js';
import { voteRoutes } from './routes/votes.js';
import { bookmarkRoutes } from './routes/bookmarks.js';
import { tagRoutes } from './routes/tags.js';
import { commentRoutes } from './routes/comments.js';
import { searchRoutes } from './routes/search.js';
import { aiRoutes } from './routes/ai.js';
import { playgroundRoutes } from './routes/playground.js';
import { fileRoutes } from './routes/files.js';
import { userProfileRoutes } from './routes/user-profiles.js';
import { websocketPlugin } from './plugins/websocket/index.js';
import { langchainPlugin } from './plugins/langchain/index.js';
import { cleanupStagedFiles } from './db/queries/post-files.js';

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
  await app.register(multipart, {
    limits: { fileSize: 10_485_760 },
    throwFileSizeLimit: false,
  });

  // Register object storage when MinIO credentials are configured.
  // In test environments the storage plugin is typically mocked.
  if (process.env.MINIO_ACCESS_KEY) {
    await app.register(storagePlugin, {
      endpoint: process.env.MINIO_ENDPOINT ?? 'localhost',
      port: process.env.MINIO_PORT ?? '9000',
      accessKey: process.env.MINIO_ACCESS_KEY,
      secretKey: process.env.MINIO_SECRET_KEY ?? '',
      bucket: process.env.MINIO_BUCKET,
    });
  }

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
  await app.register(playgroundRoutes, { prefix: '/api' });
  await app.register(fileRoutes, { prefix: '/api/posts' });
  await app.register(userProfileRoutes, { prefix: '/api/users' });

  app.addHook('onReady', async () => {
    try {
      const cleaned = await cleanupStagedFiles();
      if (cleaned > 0) {
        app.log.info({ count: cleaned }, 'Cleaned up orphaned staged files');
      }
    } catch (err) {
      app.log.warn({ err }, 'Failed to clean up staged files');
    }
  });

  return app;
}
