// Video routes for the Cloudflare Stream pipeline (issue #102, plan WU5a).
//
// Endpoints (all prefixed by `/api/posts/:id/video` via app.register):
//
//   POST   /:id/video/upload-url   — owner, 10/min, mints CF tus URL
//   DELETE /:id/video              — owner, draft-only, CF delete + cancel
//   GET    /:id/video/playback     — auth, 60/min, visibility-before-existence
//   GET    /:id/video/poster       — auth, visibility-before-existence
//   GET    /:id/video/suggestions  — owner, latest AI run + status
//   POST   /:id/video/ai-rerun     — owner, 5/min, advisory-lock guarded
//
// The handlers depend on:
//   - `cloudflareStream` (ICloudflareStreamService) for CF API + token mint.
//   - `runExtractVideoMetadata` for the AI re-run path; injected so the same
//     route file can be unit-tested with a stub without standing up LangChain.
//
// Visibility-before-existence (spec §8.2): `assertCanReadPost` MUST run BEFORE
// any `getPostVideo` lookup so private-post leaks become 404s instead of 403s.
//
// Audit-log emissions (`video.cancelled`, `video.ai-rerun.requested`,
// `video.uploaded`, …) are reserved for Sub-WU5b; TODO markers point at the
// exact call sites.

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requestVideoUploadUrlSchema } from '@forge/shared';
import * as q from '../db/queries/video.js';
import { findPostById } from '../db/queries/posts.js';
import { withTransaction } from '../db/connection.js';
import { assertCanReadPost } from '../lib/visibility.js';
import type { ICloudflareStreamService } from '../services/cloudflare-stream.js';
import type { VideoPipelineService } from '../services/video-pipeline.js';
import { AiExtractionFailedError } from '../plugins/langchain/chains/extract-video-metadata.js';
import { isE2EFlagSet } from '../lib/env-guards.js';

// 10 GiB — mirrors `MAX_VIDEO_BYTES` in `@forge/shared/validators/video.ts`.
// Duplicated here so the 413 response can include the constant in `details`.
const MAX_VIDEO_BYTES = 10 * 1024 * 1024 * 1024;

export interface VideoRouteDeps {
  cloudflareStream: ICloudflareStreamService;
  videoPipeline: VideoPipelineService;
  runExtractVideoMetadata: (input: { transcript: string }) => Promise<{
    title: string;
    description: string;
    tags: string[];
  }>;
  promptVersion: string;
  model: string;
}

function rateLimitConfig(max: number): { rateLimit: { max: number; timeWindow: string } } {
  return {
    rateLimit: isE2EFlagSet(process.env.E2E_MODE)
      ? { max: 10_000, timeWindow: '1 minute' }
      : { max, timeWindow: '1 minute' },
  };
}

export async function videoRoutes(app: FastifyInstance, deps: VideoRouteDeps): Promise<void> {
  const { cloudflareStream: cf, runExtractVideoMetadata, promptVersion, model } = deps;

  // ─── POST /:id/video/upload-url ─────────────────────────────────────────
  app.post(
    '/:id/video/upload-url',
    {
      preHandler: [app.authenticate],
      config: rateLimitConfig(10),
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const post = await findPostById(id);
      if (!post) {
        return reply.status(404).send({ error: 'Post not found' });
      }
      if (post.author_id !== request.user.id) {
        return reply.status(403).send({
          error: 'Video post owner required',
          code: 'VIDEO_OWNERSHIP_REQUIRED',
        });
      }

      // File-size cap is a discrete error class (413) distinct from the
      // generic Zod failure (400) — check it BEFORE schema validation so the
      // response distinguishes "file too big" from "missing filename".
      const rawBody = request.body as { fileSizeBytes?: unknown } | null;
      if (
        rawBody &&
        typeof rawBody.fileSizeBytes === 'number' &&
        rawBody.fileSizeBytes > MAX_VIDEO_BYTES
      ) {
        return reply.status(413).send({
          error: 'Upload exceeds maximum allowed size',
          code: 'UPLOAD_LIMIT_EXCEEDED',
          maxBytes: MAX_VIDEO_BYTES,
        });
      }

      const parsed = requestVideoUploadUrlSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Invalid request body',
          code: 'VALIDATION_FAILED',
          issues: parsed.error.issues,
        });
      }

      const existing = await q.getPostVideo(id);
      if (existing && existing.pendingCfUid) {
        return reply.status(409).send({
          error: 'A video replacement is already in progress',
          code: 'VIDEO_REPLACE_IN_PROGRESS',
        });
      }

      const { uploadUrl, cfUid } = await cf.requestUploadUrl({
        maxDurationSeconds: 21600, // CF max — 6 hours
        maxSizeBytes: parsed.data.fileSizeBytes,
        requireSignedURLs: post.visibility === 'private',
      });

      if (!existing) {
        await q.insertPostVideo({ postId: id, cfUid });
      } else {
        await q.setPendingCfUid({ postId: id, pendingCfUid: cfUid });
      }

      // TODO[WU5b]: emit audit log `video.upload-url.requested` here.
      return reply.status(201).send({ uploadUrl, cfUid });
    },
  );

  // ─── DELETE /:id/video (cancel) ────────────────────────────────────────
  app.delete(
    '/:id/video',
    {
      preHandler: [app.authenticate],
      config: rateLimitConfig(10),
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const post = await findPostById(id);
      if (!post) {
        return reply.status(404).send({ error: 'Post not found' });
      }
      if (post.author_id !== request.user.id) {
        return reply.status(403).send({
          error: 'Video post owner required',
          code: 'VIDEO_OWNERSHIP_REQUIRED',
        });
      }
      if (!post.is_draft) {
        return reply.status(400).send({
          error: 'Can only cancel drafts',
          code: 'VIDEO_CANCEL_DRAFTS_ONLY',
        });
      }
      const video = await q.getPostVideo(id);
      if (!video) {
        return reply.status(404).send({ error: 'No video on this post' });
      }

      try {
        await cf.deleteAsset(video.cfUid);
        if (video.pendingCfUid) {
          await cf.deleteAsset(video.pendingCfUid);
        }
        // CF delete succeeded — drop the post (cascade removes post_videos
        // + post_video_ai_runs). The actual post deletion query lives in
        // db/queries/posts.ts; for WU5a we proxy via raw SQL inside the
        // existing transaction helper to avoid coupling to that module's
        // softDelete vs hard-delete semantics (still being finalised in
        // Sub-WU5b).
        await withTransaction(async (client) => {
          await client.query('DELETE FROM posts WHERE id = $1', [id]);
        });
        // TODO[WU5b]: emit audit log `video.cancelled` here.
        return reply.status(204).send();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'cf delete failed';
        await q.setPostVideoStatus({
          postId: id,
          from: video.status,
          to: 'pending_cancel',
          lastError: message,
        });
        // TODO[WU5b]: emit audit log `video.cancelled` with retry note.
        return reply.status(204).send();
      }
    },
  );

  // ─── GET /:id/video/playback ───────────────────────────────────────────
  app.get(
    '/:id/video/playback',
    {
      preHandler: [app.authenticate],
      config: rateLimitConfig(60),
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const post = await findPostById(id);
      if (!post) {
        return reply.status(404).send({ error: 'Post not found' });
      }

      // CRITICAL: visibility-before-existence per spec §8.2 — assertCanReadPost
      // MUST run BEFORE any post_videos lookup so private+non-owner gets 404
      // without leaking existence.
      if (!assertCanReadPostInternal(post, request, reply)) return;

      const video = await q.getPostVideo(id);
      if (!video) {
        return reply.status(404).send({ error: 'No video on this post' });
      }
      if (video.status !== 'ready') {
        return reply.status(409).send({
          error: 'Video is not ready for playback',
          code: 'VIDEO_NOT_READY',
        });
      }

      const playbackUrl = await buildPlaybackUrl(cf, post, video.cfUid, 'manifest/video.m3u8');
      return reply.send({ playbackUrl });
    },
  );

  // ─── GET /:id/video/poster ─────────────────────────────────────────────
  app.get(
    '/:id/video/poster',
    {
      preHandler: [app.authenticate],
      config: rateLimitConfig(60),
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const post = await findPostById(id);
      if (!post) {
        return reply.status(404).send({ error: 'Post not found' });
      }
      if (!assertCanReadPostInternal(post, request, reply)) return;

      const video = await q.getPostVideo(id);
      if (!video) {
        return reply.status(404).send({ error: 'No video on this post' });
      }

      const posterUrl = await buildPlaybackUrl(cf, post, video.cfUid, 'thumbnails/thumbnail.jpg');
      return reply.send({ posterUrl });
    },
  );

  // ─── GET /:id/video/suggestions ────────────────────────────────────────
  app.get(
    '/:id/video/suggestions',
    {
      preHandler: [app.authenticate],
      config: rateLimitConfig(60),
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const post = await findPostById(id);
      if (!post) {
        return reply.status(404).send({ error: 'Post not found' });
      }
      if (post.author_id !== request.user.id) {
        return reply.status(403).send({
          error: 'Video post owner required',
          code: 'VIDEO_OWNERSHIP_REQUIRED',
        });
      }
      const video = await q.getPostVideo(id);
      if (!video) {
        return reply.status(404).send({ error: 'No video on this post' });
      }

      const suggestion = await q.getLatestAiRunForPost(id);
      return reply.send({
        status: video.status,
        lastError: video.lastError,
        suggestion,
      });
    },
  );

  // ─── POST /:id/video/ai-rerun ──────────────────────────────────────────
  app.post(
    '/:id/video/ai-rerun',
    {
      preHandler: [app.authenticate],
      config: rateLimitConfig(5),
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const post = await findPostById(id);
      if (!post) {
        return reply.status(404).send({ error: 'Post not found' });
      }
      if (post.author_id !== request.user.id) {
        return reply.status(403).send({
          error: 'Video post owner required',
          code: 'VIDEO_OWNERSHIP_REQUIRED',
        });
      }
      const video = await q.getPostVideo(id);
      if (!video) {
        return reply.status(404).send({ error: 'No video on this post' });
      }
      // Status precondition: must be ready or failed
      if (video.status !== 'ready' && video.status !== 'failed') {
        return reply.status(409).send({
          error: 'Video is not ready for re-run',
          code: 'VIDEO_NOT_READY',
        });
      }
      if (!video.transcript) {
        return reply.status(409).send({
          error: 'AI re-run requires a transcript',
          code: 'AI_RUN_PRECONDITION_FAILED',
        });
      }

      // TODO[WU5b]: emit audit log `video.ai-rerun.requested` here.

      const transcript = video.transcript;
      const fromStatus = video.status;
      try {
        return await withTransaction(async (client) => {
          const got = await q.tryAdvisoryXactLock({ postId: id }, client);
          if (!got) {
            return reply.status(409).send({
              error: 'An AI re-run is already in progress',
              code: 'AI_RUN_IN_PROGRESS',
            });
          }
          const result = await runExtractVideoMetadata({ transcript });
          const run = await q.insertAiRun({
            postId: id,
            title: result.title,
            description: result.description,
            tags: result.tags,
            model,
            transcriptChars: transcript.length,
            wasTruncated: false,
            promptVersion,
          });
          if (fromStatus === 'failed') {
            await q.setPostVideoStatus({ postId: id, from: 'failed', to: 'ready' });
          }
          return reply.send({
            runId: run.id,
            title: result.title,
            description: result.description,
            tags: result.tags,
          });
        });
      } catch (err) {
        if (err instanceof AiExtractionFailedError) {
          return reply.status(502).send({
            error: 'AI extraction failed',
            code: 'AI_EXTRACTION_FAILED',
          });
        }
        throw err;
      }
    },
  );
}

// ─── helpers ────────────────────────────────────────────────────────────────

function assertCanReadPostInternal(
  post: { visibility: string; author_id: string },
  request: FastifyRequest,
  reply: FastifyReply,
): boolean {
  return assertCanReadPost(post, request.user.id, reply);
}

async function buildPlaybackUrl(
  cf: ICloudflareStreamService,
  post: { visibility: string },
  cfUid: string,
  suffix: string,
): Promise<string> {
  const base = `https://customer-${cf.customerSubdomain}.cloudflarestream.com`;
  if (post.visibility === 'private') {
    const token = await cf.mintPlaybackToken(cfUid);
    return `${base}/${token}/${suffix}`;
  }
  return `${base}/${cfUid}/${suffix}`;
}
