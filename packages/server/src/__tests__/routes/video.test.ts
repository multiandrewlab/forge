import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — declared BEFORE imports
// ---------------------------------------------------------------------------

vi.mock('../../db/connection.js', () => ({
  query: vi.fn(),
  withTransaction: vi.fn(
    async (fn: (client: { query: ReturnType<typeof vi.fn> }) => Promise<unknown>) =>
      fn({ query: vi.fn().mockResolvedValue({ rows: [], rowCount: 1 }) }),
  ),
}));

vi.mock('../../db/queries/video.js', () => ({
  insertPostVideo: vi.fn(),
  getPostVideo: vi.fn(),
  setPostVideoStatus: vi.fn(),
  setPendingCfUid: vi.fn(),
  swapPostVideoCfUid: vi.fn(),
  setPostVideoTranscript: vi.fn(),
  selectReconcilerCandidates: vi.fn(),
  insertAiRun: vi.fn(),
  deletePostVideo: vi.fn(),
  tryAdvisoryXactLock: vi.fn(),
  insertWebhookEvent: vi.fn(),
  findPostVideoByCfUid: vi.fn(),
  setPlaybackRequiresSignedUrl: vi.fn(),
  setPostVideoLastError: vi.fn(),
  getLatestAiRunForPost: vi.fn(),
}));

vi.mock('../../db/queries/posts.js', () => ({
  findPostById: vi.fn(),
}));

vi.mock('../../lib/visibility.js', () => ({
  assertCanReadPost: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import Fastify, { type FastifyInstance, type FastifyRequest, type FastifyReply } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';

import { findPostById } from '../../db/queries/posts.js';
import * as q from '../../db/queries/video.js';
import { assertCanReadPost } from '../../lib/visibility.js';
import { videoRoutes, type VideoRouteDeps } from '../../routes/video.js';
import type { PostRow } from '../../db/queries/types.js';
import type { ICloudflareStreamService } from '../../services/cloudflare-stream.js';
import { AiExtractionFailedError } from '../../plugins/langchain/chains/extract-video-metadata.js';

const findPostByIdMock = findPostById as Mock;
const assertCanReadPostMock = assertCanReadPost as Mock;
const getPostVideoMock = q.getPostVideo as Mock;
const insertPostVideoMock = q.insertPostVideo as Mock;
const setPendingCfUidMock = q.setPendingCfUid as Mock;
const setPostVideoStatusMock = q.setPostVideoStatus as Mock;
const deletePostVideoMock = q.deletePostVideo as Mock;
const tryAdvisoryXactLockMock = q.tryAdvisoryXactLock as Mock;
const insertAiRunMock = q.insertAiRun as Mock;
const getLatestAiRunForPostMock = q.getLatestAiRunForPost as Mock;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ownerId = '11111111-1111-1111-1111-111111111111';
const otherUserId = '22222222-2222-2222-2222-222222222222';
const postId = '33333333-3333-3333-3333-333333333333';

function makePost(overrides: Partial<PostRow> = {}): PostRow {
  return {
    id: postId,
    author_id: ownerId,
    title: 'A video',
    content_type: 'video',
    language: null,
    visibility: 'public',
    is_draft: true,
    forked_from_id: null,
    link_url: null,
    link_preview: null,
    vote_count: 0,
    view_count: 0,
    search_vector: null,
    deleted_at: null,
    created_at: new Date('2026-05-13'),
    updated_at: new Date('2026-05-13'),
    ...overrides,
  };
}

function makeVideo(overrides: Partial<Awaited<ReturnType<typeof q.getPostVideo>>> = {}) {
  return {
    postId,
    cfUid: 'cf-existing',
    pendingCfUid: null,
    status: 'ready' as const,
    durationSec: 10,
    sizeBytes: 1024,
    transcript: 'sample transcript',
    playbackRequiresSignedUrl: false,
    lastError: null,
    createdAt: new Date('2026-05-13'),
    updatedAt: new Date('2026-05-13'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mini CloudflareStream mock
// ---------------------------------------------------------------------------

function makeCf(overrides: Partial<ICloudflareStreamService> = {}): ICloudflareStreamService {
  return {
    customerSubdomain: 'test-subdomain',
    requestUploadUrl: vi.fn(async () => ({ uploadUrl: 'https://mock/up', cfUid: 'cf-new' })),
    getVideoStatus: vi.fn(async () => null),
    requestCaptions: vi.fn(async () => undefined),
    fetchCaptionsWebVTT: vi.fn(async () => 'WEBVTT'),
    setRequireSignedUrls: vi.fn(async () => undefined),
    mintPlaybackToken: vi.fn(async () => 'tok_abc'),
    purgeCache: vi.fn(async () => undefined),
    deleteAsset: vi.fn(async () => undefined),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// App builder
// ---------------------------------------------------------------------------

interface BuildOpts {
  cf?: ICloudflareStreamService;
  runExtract?: (input: { transcript: string }) => Promise<{
    title: string;
    description: string;
    tags: string[];
  }>;
  promptVersion?: string;
  model?: string;
  videoPipeline?: VideoRouteDeps['videoPipeline'];
}

async function buildTestApp(opts: BuildOpts = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(fastifyJwt, { secret: 'test-secret' });
  await app.register(rateLimit, { global: false });
  app.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply) {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
  });

  const cf = opts.cf ?? makeCf();
  const runExtract =
    opts.runExtract ??
    (async () => ({ title: 'AI Title', description: 'AI Description', tags: ['ai', 'video'] }));
  const promptVersion = opts.promptVersion ?? 'v1';
  const model = opts.model ?? 'mock';

  const videoPipeline =
    opts.videoPipeline ??
    ({
      // routes/video.ts uses the pipeline only for flipVisibility in posts.ts,
      // not in routes/video.ts itself. A minimal stub is fine.
      flipVisibility: vi.fn(),
      handleWebhook: vi.fn(),
      runReconcilerSweep: vi.fn(),
    } as unknown as VideoRouteDeps['videoPipeline']);

  await app.register(
    async (instance) => {
      await videoRoutes(instance, {
        cloudflareStream: cf,
        videoPipeline,
        runExtractVideoMetadata: runExtract,
        promptVersion,
        model,
      });
    },
    { prefix: '/api/posts' },
  );

  await app.ready();
  return app;
}

function token(app: FastifyInstance, userId: string): string {
  return app.jwt.sign({ id: userId, email: `${userId}@example.com`, displayName: 'u' });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('routes/video', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // default: assertCanReadPost permits owner reads
    assertCanReadPostMock.mockImplementation(
      (post: { visibility: string; author_id: string }, callerId: string, reply: FastifyReply) => {
        if (post.visibility === 'private' && post.author_id !== callerId) {
          reply.status(404).send({ error: 'Post not found' });
          return false;
        }
        return true;
      },
    );
  });

  // ─── 5.2 POST /api/posts/:id/video/upload-url ─────────────────────────────
  describe('POST /:id/video/upload-url', () => {
    it('owner first upload: mints URL and inserts post_videos row', async () => {
      findPostByIdMock.mockResolvedValue(makePost({ is_draft: true }));
      getPostVideoMock.mockResolvedValue(null);
      const cf = makeCf({
        requestUploadUrl: vi.fn(async () => ({ uploadUrl: 'https://mock/up', cfUid: 'cf-new1' })),
      });
      const app = await buildTestApp({ cf });
      const res = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/video/upload-url`,
        headers: { authorization: `Bearer ${token(app, ownerId)}` },
        payload: { filename: 'v.mp4', fileSizeBytes: 1024 },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json()).toEqual({ uploadUrl: 'https://mock/up', cfUid: 'cf-new1' });
      expect(insertPostVideoMock).toHaveBeenCalledWith({ postId, cfUid: 'cf-new1' });
      expect(setPendingCfUidMock).not.toHaveBeenCalled();
      await app.close();
    });

    it('non-owner returns 403 VIDEO_OWNERSHIP_REQUIRED', async () => {
      findPostByIdMock.mockResolvedValue(makePost());
      const app = await buildTestApp();
      const res = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/video/upload-url`,
        headers: { authorization: `Bearer ${token(app, otherUserId)}` },
        payload: { filename: 'v.mp4', fileSizeBytes: 1024 },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe('VIDEO_OWNERSHIP_REQUIRED');
      await app.close();
    });

    it('404 when post does not exist', async () => {
      findPostByIdMock.mockResolvedValue(null);
      const app = await buildTestApp();
      const res = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/video/upload-url`,
        headers: { authorization: `Bearer ${token(app, ownerId)}` },
        payload: { filename: 'v.mp4', fileSizeBytes: 1024 },
      });
      expect(res.statusCode).toBe(404);
      await app.close();
    });

    it('replace flow: sets pending_cf_uid when an existing post_videos row has no pending', async () => {
      findPostByIdMock.mockResolvedValue(makePost({ is_draft: false }));
      getPostVideoMock.mockResolvedValue(makeVideo({ cfUid: 'cf-old', pendingCfUid: null }));
      const cf = makeCf({
        requestUploadUrl: vi.fn(async () => ({
          uploadUrl: 'https://mock/up2',
          cfUid: 'cf-pending',
        })),
      });
      const app = await buildTestApp({ cf });
      const res = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/video/upload-url`,
        headers: { authorization: `Bearer ${token(app, ownerId)}` },
        payload: { filename: 'v.mp4', fileSizeBytes: 1024 },
      });
      expect(res.statusCode).toBe(201);
      expect(setPendingCfUidMock).toHaveBeenCalledWith({ postId, pendingCfUid: 'cf-pending' });
      expect(insertPostVideoMock).not.toHaveBeenCalled();
      await app.close();
    });

    it('returns 409 VIDEO_REPLACE_IN_PROGRESS when pending_cf_uid already set', async () => {
      findPostByIdMock.mockResolvedValue(makePost({ is_draft: false }));
      getPostVideoMock.mockResolvedValue(
        makeVideo({ cfUid: 'cf-old', pendingCfUid: 'cf-in-flight' }),
      );
      const app = await buildTestApp();
      const res = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/video/upload-url`,
        headers: { authorization: `Bearer ${token(app, ownerId)}` },
        payload: { filename: 'v.mp4', fileSizeBytes: 1024 },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe('VIDEO_REPLACE_IN_PROGRESS');
      await app.close();
    });

    it('413 UPLOAD_LIMIT_EXCEEDED when fileSizeBytes > 10 GB', async () => {
      findPostByIdMock.mockResolvedValue(makePost({ is_draft: true }));
      getPostVideoMock.mockResolvedValue(null);
      const app = await buildTestApp();
      const res = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/video/upload-url`,
        headers: { authorization: `Bearer ${token(app, ownerId)}` },
        payload: { filename: 'v.mp4', fileSizeBytes: 10 * 1024 * 1024 * 1024 + 1 },
      });
      expect(res.statusCode).toBe(413);
      const body = res.json();
      expect(body.code).toBe('UPLOAD_LIMIT_EXCEEDED');
      expect(body.maxBytes).toBe(10 * 1024 * 1024 * 1024);
      await app.close();
    });

    it('400 VALIDATION_FAILED when filename is missing', async () => {
      findPostByIdMock.mockResolvedValue(makePost({ is_draft: true }));
      const app = await buildTestApp();
      const res = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/video/upload-url`,
        headers: { authorization: `Bearer ${token(app, ownerId)}` },
        payload: { fileSizeBytes: 1024 },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe('VALIDATION_FAILED');
      await app.close();
    });

    it('returns 401 when no auth token', async () => {
      const app = await buildTestApp();
      const res = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/video/upload-url`,
        payload: { filename: 'v.mp4', fileSizeBytes: 1 },
      });
      expect(res.statusCode).toBe(401);
      await app.close();
    });

    it('uses E2E_MODE high rate-limit cap when E2E_MODE=1', async () => {
      const prev = process.env.E2E_MODE;
      process.env.E2E_MODE = '1';
      try {
        findPostByIdMock.mockResolvedValue(makePost({ is_draft: true }));
        getPostVideoMock.mockResolvedValue(null);
        const app = await buildTestApp();
        const res = await app.inject({
          method: 'POST',
          url: `/api/posts/${postId}/video/upload-url`,
          headers: { authorization: `Bearer ${token(app, ownerId)}` },
          payload: { filename: 'v.mp4', fileSizeBytes: 1024 },
        });
        expect(res.statusCode).toBe(201);
        await app.close();
      } finally {
        if (prev === undefined) delete process.env.E2E_MODE;
        else process.env.E2E_MODE = prev;
      }
    });
  });

  // ─── 5.3 DELETE /api/posts/:id/video (cancel) ─────────────────────────────
  describe('DELETE /:id/video', () => {
    it('owner draft cancel: deletes CF asset(s) + DB row', async () => {
      findPostByIdMock.mockResolvedValue(makePost({ is_draft: true }));
      getPostVideoMock.mockResolvedValue(
        makeVideo({ cfUid: 'cf-old', pendingCfUid: 'cf-pending' }),
      );
      const cf = makeCf();
      const app = await buildTestApp({ cf });
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/posts/${postId}/video`,
        headers: { authorization: `Bearer ${token(app, ownerId)}` },
      });
      expect(res.statusCode).toBe(204);
      expect(cf.deleteAsset).toHaveBeenCalledWith('cf-old');
      expect(cf.deleteAsset).toHaveBeenCalledWith('cf-pending');
      await app.close();
    });

    it('owner draft without pending only deletes primary cfUid', async () => {
      findPostByIdMock.mockResolvedValue(makePost({ is_draft: true }));
      getPostVideoMock.mockResolvedValue(makeVideo({ cfUid: 'cf-only', pendingCfUid: null }));
      const cf = makeCf();
      const app = await buildTestApp({ cf });
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/posts/${postId}/video`,
        headers: { authorization: `Bearer ${token(app, ownerId)}` },
      });
      expect(res.statusCode).toBe(204);
      expect(cf.deleteAsset).toHaveBeenCalledTimes(1);
      expect(cf.deleteAsset).toHaveBeenCalledWith('cf-only');
      await app.close();
    });

    it('non-draft returns 400', async () => {
      findPostByIdMock.mockResolvedValue(makePost({ is_draft: false }));
      const app = await buildTestApp();
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/posts/${postId}/video`,
        headers: { authorization: `Bearer ${token(app, ownerId)}` },
      });
      expect(res.statusCode).toBe(400);
      await app.close();
    });

    it('CF failure marks status=pending_cancel and returns 204', async () => {
      findPostByIdMock.mockResolvedValue(makePost({ is_draft: true }));
      getPostVideoMock.mockResolvedValue(
        makeVideo({ status: 'uploading', cfUid: 'cf-fail', pendingCfUid: null }),
      );
      const cf = makeCf({
        deleteAsset: vi.fn(async () => {
          throw new Error('cf down');
        }),
      });
      setPostVideoStatusMock.mockResolvedValue(true);
      const app = await buildTestApp({ cf });
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/posts/${postId}/video`,
        headers: { authorization: `Bearer ${token(app, ownerId)}` },
      });
      expect(res.statusCode).toBe(204);
      expect(setPostVideoStatusMock).toHaveBeenCalledWith({
        postId,
        from: 'uploading',
        to: 'pending_cancel',
        lastError: 'cf down',
      });
      expect(deletePostVideoMock).not.toHaveBeenCalled();
      await app.close();
    });

    it('non-Error CF failure falls back to "cf delete failed" message', async () => {
      findPostByIdMock.mockResolvedValue(makePost({ is_draft: true }));
      getPostVideoMock.mockResolvedValue(
        makeVideo({ status: 'uploading', cfUid: 'cf-fail', pendingCfUid: null }),
      );
      const cf = makeCf({
        // CF service throws a non-Error value — exercise the fallback string branch.
        deleteAsset: vi.fn(async () => {
          throw 'string-not-error';
        }),
      });
      setPostVideoStatusMock.mockResolvedValue(true);
      const app = await buildTestApp({ cf });
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/posts/${postId}/video`,
        headers: { authorization: `Bearer ${token(app, ownerId)}` },
      });
      expect(res.statusCode).toBe(204);
      expect(setPostVideoStatusMock).toHaveBeenCalledWith({
        postId,
        from: 'uploading',
        to: 'pending_cancel',
        lastError: 'cf delete failed',
      });
      await app.close();
    });

    it('non-owner returns 403 VIDEO_OWNERSHIP_REQUIRED', async () => {
      findPostByIdMock.mockResolvedValue(makePost({ is_draft: true }));
      const app = await buildTestApp();
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/posts/${postId}/video`,
        headers: { authorization: `Bearer ${token(app, otherUserId)}` },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe('VIDEO_OWNERSHIP_REQUIRED');
      await app.close();
    });

    it('404 when post does not exist', async () => {
      findPostByIdMock.mockResolvedValue(null);
      const app = await buildTestApp();
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/posts/${postId}/video`,
        headers: { authorization: `Bearer ${token(app, ownerId)}` },
      });
      expect(res.statusCode).toBe(404);
      await app.close();
    });

    it('404 when post has no post_videos row', async () => {
      findPostByIdMock.mockResolvedValue(makePost({ is_draft: true }));
      getPostVideoMock.mockResolvedValue(null);
      const app = await buildTestApp();
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/posts/${postId}/video`,
        headers: { authorization: `Bearer ${token(app, ownerId)}` },
      });
      expect(res.statusCode).toBe(404);
      await app.close();
    });
  });

  // ─── 5.4 GET /api/posts/:id/video/playback ────────────────────────────────
  describe('GET /:id/video/playback', () => {
    it('public + ready returns unsigned manifest URL', async () => {
      findPostByIdMock.mockResolvedValue(makePost({ visibility: 'public', is_draft: false }));
      getPostVideoMock.mockResolvedValue(makeVideo({ cfUid: 'cf-pub', status: 'ready' }));
      const cf = makeCf();
      const app = await buildTestApp({ cf });
      const res = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}/video/playback`,
        headers: { authorization: `Bearer ${token(app, otherUserId)}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.playbackUrl).toBe(
        'https://customer-test-subdomain.cloudflarestream.com/cf-pub/manifest/video.m3u8',
      );
      expect(cf.mintPlaybackToken).not.toHaveBeenCalled();
      await app.close();
    });

    it('private + owner + ready returns token URL', async () => {
      findPostByIdMock.mockResolvedValue(makePost({ visibility: 'private', is_draft: false }));
      getPostVideoMock.mockResolvedValue(makeVideo({ cfUid: 'cf-priv', status: 'ready' }));
      const cf = makeCf({ mintPlaybackToken: vi.fn(async () => 'tok_xyz') });
      const app = await buildTestApp({ cf });
      const res = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}/video/playback`,
        headers: { authorization: `Bearer ${token(app, ownerId)}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().playbackUrl).toBe(
        'https://customer-test-subdomain.cloudflarestream.com/tok_xyz/manifest/video.m3u8',
      );
      expect(cf.mintPlaybackToken).toHaveBeenCalledWith('cf-priv');
      await app.close();
    });

    it('private + non-owner returns 404 BEFORE q.getPostVideo is called (visibility-before-existence)', async () => {
      findPostByIdMock.mockResolvedValue(makePost({ visibility: 'private', is_draft: false }));
      // assertCanReadPost will set 404 reply
      const app = await buildTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}/video/playback`,
        headers: { authorization: `Bearer ${token(app, otherUserId)}` },
      });
      expect(res.statusCode).toBe(404);
      expect(getPostVideoMock).not.toHaveBeenCalled();
      await app.close();
    });

    it('returns 409 VIDEO_NOT_READY when post_videos.status != ready', async () => {
      findPostByIdMock.mockResolvedValue(makePost({ visibility: 'public' }));
      getPostVideoMock.mockResolvedValue(makeVideo({ status: 'processing' }));
      const app = await buildTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}/video/playback`,
        headers: { authorization: `Bearer ${token(app, ownerId)}` },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe('VIDEO_NOT_READY');
      await app.close();
    });

    it('returns 404 when post does not exist', async () => {
      findPostByIdMock.mockResolvedValue(null);
      const app = await buildTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}/video/playback`,
        headers: { authorization: `Bearer ${token(app, ownerId)}` },
      });
      expect(res.statusCode).toBe(404);
      await app.close();
    });

    it('returns 404 when post_videos row missing', async () => {
      findPostByIdMock.mockResolvedValue(makePost({ visibility: 'public' }));
      getPostVideoMock.mockResolvedValue(null);
      const app = await buildTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}/video/playback`,
        headers: { authorization: `Bearer ${token(app, ownerId)}` },
      });
      expect(res.statusCode).toBe(404);
      await app.close();
    });
  });

  // ─── 5.5 GET /api/posts/:id/video/poster ──────────────────────────────────
  describe('GET /:id/video/poster', () => {
    it('public returns unsigned thumbnail URL', async () => {
      findPostByIdMock.mockResolvedValue(makePost({ visibility: 'public' }));
      getPostVideoMock.mockResolvedValue(makeVideo({ cfUid: 'cf-pub', status: 'ready' }));
      const cf = makeCf();
      const app = await buildTestApp({ cf });
      const res = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}/video/poster`,
        headers: { authorization: `Bearer ${token(app, otherUserId)}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().posterUrl).toBe(
        'https://customer-test-subdomain.cloudflarestream.com/cf-pub/thumbnails/thumbnail.jpg',
      );
      expect(cf.mintPlaybackToken).not.toHaveBeenCalled();
      await app.close();
    });

    it('private + owner returns signed thumbnail URL', async () => {
      findPostByIdMock.mockResolvedValue(makePost({ visibility: 'private' }));
      getPostVideoMock.mockResolvedValue(makeVideo({ cfUid: 'cf-priv', status: 'ready' }));
      const cf = makeCf({ mintPlaybackToken: vi.fn(async () => 'tok_poster') });
      const app = await buildTestApp({ cf });
      const res = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}/video/poster`,
        headers: { authorization: `Bearer ${token(app, ownerId)}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().posterUrl).toBe(
        'https://customer-test-subdomain.cloudflarestream.com/tok_poster/thumbnails/thumbnail.jpg',
      );
      await app.close();
    });

    it('private + non-owner returns 404 visibility-before-existence', async () => {
      findPostByIdMock.mockResolvedValue(makePost({ visibility: 'private' }));
      const app = await buildTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}/video/poster`,
        headers: { authorization: `Bearer ${token(app, otherUserId)}` },
      });
      expect(res.statusCode).toBe(404);
      expect(getPostVideoMock).not.toHaveBeenCalled();
      await app.close();
    });

    it('404 when post missing', async () => {
      findPostByIdMock.mockResolvedValue(null);
      const app = await buildTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}/video/poster`,
        headers: { authorization: `Bearer ${token(app, ownerId)}` },
      });
      expect(res.statusCode).toBe(404);
      await app.close();
    });

    it('404 when post_videos row missing', async () => {
      findPostByIdMock.mockResolvedValue(makePost({ visibility: 'public' }));
      getPostVideoMock.mockResolvedValue(null);
      const app = await buildTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}/video/poster`,
        headers: { authorization: `Bearer ${token(app, ownerId)}` },
      });
      expect(res.statusCode).toBe(404);
      await app.close();
    });
  });

  // ─── 5.6 GET /api/posts/:id/video/suggestions ─────────────────────────────
  describe('GET /:id/video/suggestions', () => {
    it('owner: returns latest run + status + lastError', async () => {
      findPostByIdMock.mockResolvedValue(makePost());
      const created = new Date('2026-05-13T01:02:03Z');
      getLatestAiRunForPostMock.mockResolvedValue({
        id: 'run-1',
        title: 'T',
        description: 'D',
        tags: ['t1'],
        createdAt: created,
      });
      getPostVideoMock.mockResolvedValue(makeVideo({ status: 'ready', lastError: 'prior boom' }));
      const app = await buildTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}/video/suggestions`,
        headers: { authorization: `Bearer ${token(app, ownerId)}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe('ready');
      expect(body.lastError).toBe('prior boom');
      expect(body.suggestion).toMatchObject({
        id: 'run-1',
        title: 'T',
        description: 'D',
        tags: ['t1'],
      });
      await app.close();
    });

    it('owner: returns null suggestion when no run exists', async () => {
      findPostByIdMock.mockResolvedValue(makePost());
      getLatestAiRunForPostMock.mockResolvedValue(null);
      getPostVideoMock.mockResolvedValue(makeVideo({ status: 'suggesting', lastError: null }));
      const app = await buildTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}/video/suggestions`,
        headers: { authorization: `Bearer ${token(app, ownerId)}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.suggestion).toBeNull();
      expect(body.status).toBe('suggesting');
      await app.close();
    });

    it('non-owner returns 403 VIDEO_OWNERSHIP_REQUIRED', async () => {
      findPostByIdMock.mockResolvedValue(makePost());
      const app = await buildTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}/video/suggestions`,
        headers: { authorization: `Bearer ${token(app, otherUserId)}` },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe('VIDEO_OWNERSHIP_REQUIRED');
      await app.close();
    });

    it('404 when post missing', async () => {
      findPostByIdMock.mockResolvedValue(null);
      const app = await buildTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}/video/suggestions`,
        headers: { authorization: `Bearer ${token(app, ownerId)}` },
      });
      expect(res.statusCode).toBe(404);
      await app.close();
    });

    it('404 when post has no post_videos row', async () => {
      findPostByIdMock.mockResolvedValue(makePost());
      getPostVideoMock.mockResolvedValue(null);
      const app = await buildTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}/video/suggestions`,
        headers: { authorization: `Bearer ${token(app, ownerId)}` },
      });
      expect(res.statusCode).toBe(404);
      await app.close();
    });
  });

  // ─── 5.7 POST /api/posts/:id/video/ai-rerun ───────────────────────────────
  describe('POST /:id/video/ai-rerun', () => {
    it('owner + ready + transcript present → 200 with new run id', async () => {
      findPostByIdMock.mockResolvedValue(makePost());
      getPostVideoMock.mockResolvedValue(makeVideo({ status: 'ready', transcript: 'hello' }));
      tryAdvisoryXactLockMock.mockResolvedValue(true);
      insertAiRunMock.mockResolvedValue({ id: 'run-new' });
      const runExtract = vi
        .fn()
        .mockResolvedValue({ title: 'NT', description: 'ND', tags: ['nt'] });
      const app = await buildTestApp({ runExtract });
      const res = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/video/ai-rerun`,
        headers: { authorization: `Bearer ${token(app, ownerId)}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toEqual({
        runId: 'run-new',
        title: 'NT',
        description: 'ND',
        tags: ['nt'],
      });
      expect(insertAiRunMock).toHaveBeenCalledWith({
        postId,
        title: 'NT',
        description: 'ND',
        tags: ['nt'],
        model: 'mock',
        transcriptChars: 'hello'.length,
        wasTruncated: false,
        promptVersion: 'v1',
      });
      // status was ready already — should not flip
      expect(setPostVideoStatusMock).not.toHaveBeenCalled();
      await app.close();
    });

    it('failed + transcript present → succeeds and flips status failed→ready', async () => {
      findPostByIdMock.mockResolvedValue(makePost());
      getPostVideoMock.mockResolvedValue(
        makeVideo({ status: 'failed', transcript: 'tx', lastError: 'prior' }),
      );
      tryAdvisoryXactLockMock.mockResolvedValue(true);
      insertAiRunMock.mockResolvedValue({ id: 'run-new' });
      setPostVideoStatusMock.mockResolvedValue(true);
      const app = await buildTestApp();
      const res = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/video/ai-rerun`,
        headers: { authorization: `Bearer ${token(app, ownerId)}` },
      });
      expect(res.statusCode).toBe(200);
      expect(setPostVideoStatusMock).toHaveBeenCalledWith({
        postId,
        from: 'failed',
        to: 'ready',
      });
      await app.close();
    });

    it('transcript missing → 409 AI_RUN_PRECONDITION_FAILED', async () => {
      findPostByIdMock.mockResolvedValue(makePost());
      getPostVideoMock.mockResolvedValue(makeVideo({ status: 'ready', transcript: null }));
      const app = await buildTestApp();
      const res = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/video/ai-rerun`,
        headers: { authorization: `Bearer ${token(app, ownerId)}` },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe('AI_RUN_PRECONDITION_FAILED');
      await app.close();
    });

    it('status not in (ready, failed) → 409 VIDEO_NOT_READY', async () => {
      findPostByIdMock.mockResolvedValue(makePost());
      getPostVideoMock.mockResolvedValue(makeVideo({ status: 'processing', transcript: 'x' }));
      const app = await buildTestApp();
      const res = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/video/ai-rerun`,
        headers: { authorization: `Bearer ${token(app, ownerId)}` },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe('VIDEO_NOT_READY');
      await app.close();
    });

    it('non-owner → 403 VIDEO_OWNERSHIP_REQUIRED', async () => {
      findPostByIdMock.mockResolvedValue(makePost());
      const app = await buildTestApp();
      const res = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/video/ai-rerun`,
        headers: { authorization: `Bearer ${token(app, otherUserId)}` },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe('VIDEO_OWNERSHIP_REQUIRED');
      await app.close();
    });

    it('advisory lock held → 409 AI_RUN_IN_PROGRESS', async () => {
      findPostByIdMock.mockResolvedValue(makePost());
      getPostVideoMock.mockResolvedValue(makeVideo({ status: 'ready', transcript: 'hi' }));
      tryAdvisoryXactLockMock.mockResolvedValue(false);
      const app = await buildTestApp();
      const res = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/video/ai-rerun`,
        headers: { authorization: `Bearer ${token(app, ownerId)}` },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe('AI_RUN_IN_PROGRESS');
      expect(insertAiRunMock).not.toHaveBeenCalled();
      await app.close();
    });

    it('AiExtractionFailedError → 502 AI_EXTRACTION_FAILED', async () => {
      findPostByIdMock.mockResolvedValue(makePost());
      getPostVideoMock.mockResolvedValue(makeVideo({ status: 'ready', transcript: 'hi' }));
      tryAdvisoryXactLockMock.mockResolvedValue(true);
      const runExtract = vi.fn().mockRejectedValue(new AiExtractionFailedError(new Error('twice')));
      const app = await buildTestApp({ runExtract });
      const res = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/video/ai-rerun`,
        headers: { authorization: `Bearer ${token(app, ownerId)}` },
      });
      expect(res.statusCode).toBe(502);
      expect(res.json().code).toBe('AI_EXTRACTION_FAILED');
      expect(insertAiRunMock).not.toHaveBeenCalled();
      await app.close();
    });

    it('non-AiExtractionFailedError surfaces as 500', async () => {
      findPostByIdMock.mockResolvedValue(makePost());
      getPostVideoMock.mockResolvedValue(makeVideo({ status: 'ready', transcript: 'hi' }));
      tryAdvisoryXactLockMock.mockResolvedValue(true);
      const runExtract = vi.fn().mockRejectedValue(new Error('something else'));
      const app = await buildTestApp({ runExtract });
      const res = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/video/ai-rerun`,
        headers: { authorization: `Bearer ${token(app, ownerId)}` },
      });
      expect(res.statusCode).toBe(500);
      await app.close();
    });

    it('404 when post missing', async () => {
      findPostByIdMock.mockResolvedValue(null);
      const app = await buildTestApp();
      const res = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/video/ai-rerun`,
        headers: { authorization: `Bearer ${token(app, ownerId)}` },
      });
      expect(res.statusCode).toBe(404);
      await app.close();
    });

    it('404 when post_videos row missing', async () => {
      findPostByIdMock.mockResolvedValue(makePost());
      getPostVideoMock.mockResolvedValue(null);
      const app = await buildTestApp();
      const res = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/video/ai-rerun`,
        headers: { authorization: `Bearer ${token(app, ownerId)}` },
      });
      expect(res.statusCode).toBe(404);
      await app.close();
    });
  });

  // ─── WU5b 5.15 — audit-log emissions ────────────────────────────────────
  describe('audit-log emissions', () => {
    it('emits video.upload-url.requested on successful upload-url mint', async () => {
      findPostByIdMock.mockResolvedValue(makePost({ is_draft: true }));
      getPostVideoMock.mockResolvedValue(null);
      const cf = makeCf({
        requestUploadUrl: vi.fn(async () => ({
          uploadUrl: 'https://mock/up',
          cfUid: 'cf-audit-1',
        })),
      });
      const app = await buildTestApp({ cf });
      const infoSpy = vi.spyOn(app.log, 'info');

      const res = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/video/upload-url`,
        headers: { authorization: `Bearer ${token(app, ownerId)}` },
        payload: { filename: 'v.mp4', fileSizeBytes: 1024 },
      });
      expect(res.statusCode).toBe(201);
      const call = infoSpy.mock.calls.find(
        (args) => (args[0] as { event?: string })?.event === 'video.upload-url.requested',
      );
      expect(call, 'expected video.upload-url.requested log').toBeDefined();
      const payload = call?.[0] as { postId: string; cfUid: string };
      expect(payload.postId).toBe(postId);
      expect(payload.cfUid).toBe('cf-audit-1');
      await app.close();
    });

    it('emits video.cancelled on successful cancel', async () => {
      findPostByIdMock.mockResolvedValue(makePost({ is_draft: true }));
      getPostVideoMock.mockResolvedValue(makeVideo({ cfUid: 'cf-cancel-1', pendingCfUid: null }));
      const cf = makeCf();
      const app = await buildTestApp({ cf });
      const infoSpy = vi.spyOn(app.log, 'info');

      const res = await app.inject({
        method: 'DELETE',
        url: `/api/posts/${postId}/video`,
        headers: { authorization: `Bearer ${token(app, ownerId)}` },
      });
      expect(res.statusCode).toBe(204);
      const call = infoSpy.mock.calls.find(
        (args) => (args[0] as { event?: string })?.event === 'video.cancelled',
      );
      expect(call, 'expected video.cancelled log').toBeDefined();
      const payload = call?.[0] as { postId: string; cfUid: string; retry?: boolean };
      expect(payload.postId).toBe(postId);
      expect(payload.cfUid).toBe('cf-cancel-1');
      expect(payload.retry).toBeUndefined();
      await app.close();
    });

    it('emits video.cancelled with retry=true on CF failure', async () => {
      findPostByIdMock.mockResolvedValue(makePost({ is_draft: true }));
      getPostVideoMock.mockResolvedValue(
        makeVideo({ cfUid: 'cf-cancel-2', pendingCfUid: null, status: 'ready' }),
      );
      const cf = makeCf({
        deleteAsset: vi.fn(async () => {
          throw new Error('cf 500');
        }),
      });
      const app = await buildTestApp({ cf });
      const infoSpy = vi.spyOn(app.log, 'info');

      const res = await app.inject({
        method: 'DELETE',
        url: `/api/posts/${postId}/video`,
        headers: { authorization: `Bearer ${token(app, ownerId)}` },
      });
      expect(res.statusCode).toBe(204);
      const call = infoSpy.mock.calls.find((args) => {
        const p = args[0] as { event?: string; retry?: boolean };
        return p?.event === 'video.cancelled' && p.retry === true;
      });
      expect(call, 'expected video.cancelled retry log').toBeDefined();
      await app.close();
    });

    it('emits video.ai-rerun.requested before locking', async () => {
      findPostByIdMock.mockResolvedValue(makePost({ visibility: 'public' }));
      getPostVideoMock.mockResolvedValue(
        makeVideo({ status: 'ready', transcript: 'good transcript' }),
      );
      tryAdvisoryXactLockMock.mockResolvedValue(true);
      insertAiRunMock.mockResolvedValue({ id: 'run-1' });
      setPostVideoStatusMock.mockResolvedValue(true);
      const app = await buildTestApp();
      const infoSpy = vi.spyOn(app.log, 'info');

      const res = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/video/ai-rerun`,
        headers: { authorization: `Bearer ${token(app, ownerId)}` },
      });
      expect(res.statusCode).toBe(200);
      const call = infoSpy.mock.calls.find(
        (args) => (args[0] as { event?: string })?.event === 'video.ai-rerun.requested',
      );
      expect(call, 'expected video.ai-rerun.requested log').toBeDefined();
      const payload = call?.[0] as { postId: string; userId: string; fromStatus: string };
      expect(payload.postId).toBe(postId);
      expect(payload.userId).toBe(ownerId);
      expect(payload.fromStatus).toBe('ready');
      await app.close();
    });
  });
});
