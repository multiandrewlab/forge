import Fastify, { type FastifyInstance, type FastifyBaseLogger } from 'fastify';
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
import { videoRoutes } from './routes/video.js';
import { cfStreamWebhookRoutes } from './routes/cf-stream-webhook.js';
import { websocketPlugin } from './plugins/websocket/index.js';
import { langchainPlugin } from './plugins/langchain/index.js';
import { findStaleStagedFiles, deleteStagedFilesByIds } from './db/queries/post-files.js';
import { registerTestRoutes } from './routes/__test__.js';
import { isE2EFlagSet } from './lib/env-guards.js';
import { query, withTransaction } from './db/connection.js';
import {
  createCloudflareStream,
  type ICloudflareStreamService,
} from './services/cloudflare-stream.js';
import {
  VideoPipelineService,
  startReconciler,
  stopReconciler,
} from './services/video-pipeline.js';
import {
  createExtractVideoMetadataChain,
  runExtractVideoMetadata,
} from './plugins/langchain/chains/extract-video-metadata.js';
import { EXTRACT_VIDEO_METADATA_PROMPT_VERSION } from './plugins/langchain/prompts/extract-video-metadata.js';
import { createLogger } from './logger.js';

declare module 'fastify' {
  interface FastifyInstance {
    cloudflareStream: ICloudflareStreamService;
    videoPipeline: VideoPipelineService;
  }
}

export async function buildApp() {
  // Type-unify the two branches: `Fastify({ logger: false })` and
  // `Fastify({ loggerInstance: pinoLogger })` produce DIFFERENT generic
  // instantiations of FastifyInstance (the second carries pino's Logger type
  // in the type parameters, which makes the union "not callable" when
  // calling app.register / app.addHook). Force both to the default
  // FastifyInstance shape so the rest of the wiring typechecks cleanly.
  const app: FastifyInstance =
    process.env.NODE_ENV === 'test'
      ? Fastify({ logger: false })
      : Fastify({ loggerInstance: createLogger() as unknown as FastifyBaseLogger });

  await app.register(cors);
  await app.register(cookie);
  if (process.env.NODE_ENV !== 'test' && !process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is required outside test environments');
  }
  await app.register(jwt, {
    secret: process.env.JWT_SECRET ?? 'dev-secret-change-in-production',
    verify: { algorithms: ['HS256'] },
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

  // Cloudflare Stream + video pipeline wiring (issue #102, WU5b).
  // Constructed AFTER langchainPlugin so the chat model is available.
  const cloudflareStream = createCloudflareStream(process.env);
  const extractChain = createExtractVideoMetadataChain(app.aiProvider());
  // Thin closure adapter; behaviour is covered by the VideoPipelineService
  // and extract-video-metadata chain tests.
  /* v8 ignore next 2 */
  const runExtract = (input: { transcript: string }) =>
    runExtractVideoMetadata(extractChain, input);
  const videoPipeline = new VideoPipelineService({
    cloudflareStream,
    runExtractVideoMetadata: runExtract,
    logger: app.log,
    maxTranscriptChars: 120_000,
    promptVersion: EXTRACT_VIDEO_METADATA_PROMPT_VERSION,
    model: process.env.LLM_PROVIDER ?? 'mock',
  });
  app.decorate('cloudflareStream', cloudflareStream as ICloudflareStreamService);
  app.decorate('videoPipeline', videoPipeline);

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

  // Video routes — registered with the pipeline + chain deps. The wrapper
  // closure passes `deps` through to videoRoutes so app.ts owns construction.
  await app.register(
    async (instance) => {
      await videoRoutes(instance, {
        cloudflareStream,
        videoPipeline,
        runExtractVideoMetadata: runExtract,
        promptVersion: EXTRACT_VIDEO_METADATA_PROMPT_VERSION,
        model: process.env.LLM_PROVIDER ?? 'mock',
      });
    },
    { prefix: '/api/posts' },
  );

  // CF Stream webhook — POST /api/cf-stream/webhook
  await app.register(
    async (instance) => {
      await cfStreamWebhookRoutes(instance, {
        videoPipeline,
        webhookSecret: process.env.CF_STREAM_WEBHOOK_SECRET ?? '',
      });
    },
    { prefix: '/api/cf-stream' },
  );

  // Reconciler sweep — boot + 5-minute interval. Skipped in test envs so unit
  // tests don't hang on the interval timer.
  if (process.env.NODE_ENV !== 'test') {
    const reconcilerHandle = startReconciler({
      service: videoPipeline,
      intervalMs: 5 * 60 * 1000,
    });
    app.addHook('onClose', async () => {
      stopReconciler(reconcilerHandle);
    });
  }

  if (isE2EFlagSet(process.env.ENABLE_TEST_ROUTES)) {
    await registerTestRoutes(app, {
      env: {
        ENABLE_TEST_ROUTES: process.env.ENABLE_TEST_ROUTES,
        NODE_ENV: process.env.NODE_ENV,
      },
      secret: process.env.E2E_SECRET ?? '',
      isCI: process.env.CI === 'true',
      host: process.env.HOST ?? '0.0.0.0',
      pgQuery: async (sql) => {
        await query(sql);
      },
      pgTransaction: withTransaction,
      cloudflareStream,
      videoPipeline,
    });
  }

  app.addHook('onReady', async () => {
    try {
      const staleFiles = await findStaleStagedFiles();
      if (staleFiles.length === 0) return;

      // Delete storage objects first (best-effort)
      if (app.storage) {
        for (const file of staleFiles) {
          if (file.storage_key) {
            try {
              await app.storage.delete(file.storage_key);
            } catch {
              app.log.warn(
                { storageKey: file.storage_key },
                'Failed to delete stale storage object',
              );
            }
          }
        }
      }

      // Then delete DB rows
      const cleaned = await deleteStagedFilesByIds(staleFiles.map((f) => f.id));
      if (cleaned > 0) {
        app.log.info({ count: cleaned }, 'Cleaned up orphaned staged files');
      }
    } catch (err) {
      app.log.warn({ err }, 'Failed to clean up staged files');
    }
  });

  return app;
}
