// VideoPipelineService — state machine + reconciler + visibility-flip SAGA
// for the Cloudflare Stream video-post pipeline (issue #102).
//
// The service is split into three responsibility surfaces:
//
//  1. `handleWebhook(event)` — invoked by the CF Stream webhook route. Drives
//     the per-row state machine (uploading → processing → captions →
//     suggesting → ready|failed). All long-running steps (HTTP fan-out to
//     CF, AI extraction, etc.) are scheduled via `setImmediate` so the
//     webhook handler can respond fast; deferred-task failures land in the
//     `video.pipeline.deferred-error` audit channel.
//
//  2. `runReconcilerSweep()` — invoked at boot (no staleness gate) and on a
//     periodic interval (per the `reconcilerStalenessMs` window). For each
//     non-terminal candidate it runs a per-state recovery handler and a
//     CF-vs-DB drift check on `playback_requires_signed_url`.
//
//  3. `flipVisibility(...)` — the public ↔ private SAGA per spec §8.4.
//     public → private flips CF first (more restrictive), then commits the
//     DB transaction, then purges cache. private → public commits the DB
//     transaction first, then relaxes CF. Each direction has a compensating
//     branch that reverts on the other side; a compensating failure logs
//     `video.visibility.drift-detected` so the reconciler picks it up.

import * as q from '../db/queries/video.js';
import { query, withTransaction } from '../db/connection.js';
import { parseWebVttToTranscript } from '../lib/parse-webvtt.js';
import type { VideoStatus } from '@forge/shared';
import type { ICloudflareStreamService } from './cloudflare-stream.js';

// ── public types ──────────────────────────────────────────────────────────

export interface VideoPipelineLogger {
  info: (obj: object, msg?: string) => void;
  warn: (obj: object, msg?: string) => void;
  error: (obj: object, msg?: string) => void;
}

export type RunExtractVideoMetadata = (input: { transcript: string }) => Promise<{
  title: string;
  description: string;
  tags: string[];
  inputTokens?: number;
  outputTokens?: number;
}>;

export interface VideoPipelineConfig {
  cloudflareStream: ICloudflareStreamService;
  runExtractVideoMetadata: RunExtractVideoMetadata;
  logger: VideoPipelineLogger;
  maxTranscriptChars: number;
  promptVersion: string;
  model: string;
  /** Defaults to 10 minutes. */
  reconcilerStalenessMs?: number;
}

export type CfWebhookEvent =
  | { type: 'video.ready'; cfUid: string; sizeBytes?: number; durationSec?: number }
  | { type: 'captions.ready'; cfUid: string; captionsUrl?: string }
  | { type: 'video.error'; cfUid: string; message?: string };

export interface ReconcilerHandle {
  interval: NodeJS.Timeout;
}

// ── service ───────────────────────────────────────────────────────────────

const DEFAULT_RECONCILER_STALENESS_MS = 10 * 60 * 1000;

export class VideoPipelineService {
  constructor(private readonly cfg: VideoPipelineConfig) {}

  // ─── webhook entry point ────────────────────────────────────────────────

  async handleWebhook(event: CfWebhookEvent): Promise<void> {
    switch (event.type) {
      case 'video.ready':
        await this.onVideoReady(event);
        return;
      case 'captions.ready':
        await this.onCaptionsReady(event);
        return;
      case 'video.error':
        await this.onVideoError(event);
        return;
      default:
        this.cfg.logger.warn(
          { event: 'video.pipeline.unknown-event', evt: event },
          'unknown webhook event type',
        );
    }
  }

  // ─── state handlers ─────────────────────────────────────────────────────

  private async onVideoReady(e: {
    cfUid: string;
    sizeBytes?: number;
    durationSec?: number;
  }): Promise<void> {
    const row = await this.findRowByCfUid(e.cfUid);
    if (!row) return;
    const advanced = await q.setPostVideoStatus({
      postId: row.postId,
      from: 'uploading',
      to: 'processing',
    });
    if (!advanced) return;

    this.cfg.logger.info(
      {
        event: 'video.uploaded',
        postId: row.postId,
        cfUid: e.cfUid,
        sizeBytes: e.sizeBytes,
        durationSec: e.durationSec,
      },
      'video upload reached processing',
    );

    this.defer(
      async () => {
        await this.cfg.cloudflareStream.requestCaptions(e.cfUid);
        await q.setPostVideoStatus({
          postId: row.postId,
          from: 'processing',
          to: 'captions',
        });
      },
      { postId: row.postId, step: 'request-captions' },
    );
  }

  private async onCaptionsReady(e: { cfUid: string }): Promise<void> {
    const row = await this.findRowByCfUid(e.cfUid);
    if (!row) return;
    const advanced = await q.setPostVideoStatus({
      postId: row.postId,
      from: 'captions',
      to: 'suggesting',
    });
    if (!advanced) return;

    this.defer(
      async () => {
        const url = `https://customer-${this.cfg.cloudflareStream.customerSubdomain}.cloudflarestream.com/${e.cfUid}/captions/en`;
        const vtt = await this.cfg.cloudflareStream.fetchCaptionsWebVTT(url);
        const { text, wasTruncated } = parseWebVttToTranscript(vtt, this.cfg.maxTranscriptChars);
        await q.setPostVideoTranscript({ postId: row.postId, transcript: text });
        await this.runAiAndAdvance({
          postId: row.postId,
          transcript: text,
          transcriptChars: text.length,
          wasTruncated,
        });
      },
      { postId: row.postId, step: 'captions-fetch-and-ai' },
    );
  }

  private async runAiAndAdvance(args: {
    postId: string;
    transcript: string;
    transcriptChars: number;
    wasTruncated: boolean;
  }): Promise<void> {
    const t0 = Date.now();
    const retryCount = 0;
    try {
      const result = await this.cfg.runExtractVideoMetadata({ transcript: args.transcript });
      this.cfg.logger.info(
        {
          event: 'video.ai-extract',
          postId: args.postId,
          model: this.cfg.model,
          promptVersion: this.cfg.promptVersion,
          transcriptChars: args.transcriptChars,
          wasTruncated: args.wasTruncated,
          elapsedMs: Date.now() - t0,
          retryCount,
          outcome: 'success',
        },
        'ai extraction succeeded',
      );
      await q.insertAiRun({
        postId: args.postId,
        title: result.title,
        description: result.description,
        tags: result.tags,
        model: this.cfg.model,
        transcriptChars: args.transcriptChars,
        wasTruncated: args.wasTruncated,
        promptVersion: this.cfg.promptVersion,
      });
      const row = await q.getPostVideo(args.postId);
      if (row?.pendingCfUid) {
        const oldCfUid = row.cfUid;
        const newCfUid = row.pendingCfUid;
        await q.swapPostVideoCfUid({ postId: args.postId });
        this.cfg.logger.info(
          { event: 'video.replaced', postId: args.postId, oldCfUid, newCfUid },
          'video replaced atomically',
        );
        await this.cfg.cloudflareStream.deleteAsset(oldCfUid).catch((err) => {
          this.cfg.logger.error(
            { event: 'video.pipeline.orphan-cf-asset', err, oldCfUid, postId: args.postId },
            'orphaned cf asset after replace',
          );
        });
      } else {
        await q.setPostVideoStatus({
          postId: args.postId,
          from: 'suggesting',
          to: 'ready',
        });
      }
    } catch (err) {
      this.cfg.logger.info(
        {
          event: 'video.ai-extract',
          postId: args.postId,
          model: this.cfg.model,
          promptVersion: this.cfg.promptVersion,
          transcriptChars: args.transcriptChars,
          wasTruncated: args.wasTruncated,
          elapsedMs: Date.now() - t0,
          retryCount,
          outcome: 'failure',
        },
        'ai extraction failed',
      );
      await q.setPostVideoStatus({
        postId: args.postId,
        from: 'suggesting',
        to: 'failed',
        lastError: 'ai extraction returned invalid output',
      });
      this.cfg.logger.error(
        { event: 'video.pipeline.deferred-error', postId: args.postId, err },
        'ai extraction failed',
      );
    }
  }

  private async onVideoError(e: { cfUid: string; message?: string }): Promise<void> {
    const row = await this.findRowByCfUid(e.cfUid);
    if (!row) return;
    const message = e.message ?? 'cf reported error';
    for (const from of ['uploading', 'processing', 'captions', 'suggesting'] as const) {
      const ok = await q.setPostVideoStatus({
        postId: row.postId,
        from,
        to: 'failed',
        lastError: message,
      });
      if (ok) return;
    }
  }

  // ─── reconciler ─────────────────────────────────────────────────────────

  async runReconcilerSweep(opts: { staleness?: 'boot' | 'interval' } = {}): Promise<void> {
    const staleness = opts.staleness ?? 'interval';
    const stalenessIntervalMs =
      staleness === 'boot'
        ? undefined
        : (this.cfg.reconcilerStalenessMs ?? DEFAULT_RECONCILER_STALENESS_MS);
    const candidates = await q.selectReconcilerCandidates({ stalenessIntervalMs });
    for (const c of candidates) {
      try {
        await this.reconcileRow(c);
      } catch (err) {
        this.cfg.logger.error(
          { event: 'video.pipeline.reconciler-error', postId: c.postId, err },
          'reconciler error',
        );
      }
    }
  }

  private async reconcileRow(c: {
    postId: string;
    cfUid: string;
    pendingCfUid: string | null;
    status: VideoStatus;
  }): Promise<void> {
    switch (c.status) {
      case 'uploading':
        return this.reconcileUploading(c);
      case 'processing':
        return this.reconcileProcessing(c);
      case 'captions':
        return this.reconcileCaptions(c);
      case 'suggesting':
        return this.reconcileSuggesting(c);
      case 'pending_cancel':
        return this.reconcilePendingCancel(c);
      default:
        return;
    }
  }

  private async reconcileUploading(c: { postId: string; cfUid: string }): Promise<void> {
    const cfStatus = await this.cfg.cloudflareStream.getVideoStatus(c.cfUid);
    if (!cfStatus) {
      await q.setPostVideoStatus({
        postId: c.postId,
        from: 'uploading',
        to: 'failed',
        lastError: 'upload timed out',
      });
      return;
    }
    if (cfStatus.readyToStream) {
      await this.onVideoReady({ cfUid: c.cfUid });
    }
    await this.reconcileSignedUrlDrift(c.postId, cfStatus.requireSignedURLs);
  }

  private async reconcileProcessing(c: { postId: string; cfUid: string }): Promise<void> {
    const cfStatus = await this.cfg.cloudflareStream.getVideoStatus(c.cfUid);
    if (!cfStatus) return;
    if (cfStatus.readyToStream) {
      await this.cfg.cloudflareStream.requestCaptions(c.cfUid);
      await q.setPostVideoStatus({
        postId: c.postId,
        from: 'processing',
        to: 'captions',
      });
    }
    await this.reconcileSignedUrlDrift(c.postId, cfStatus.requireSignedURLs);
  }

  private async reconcileCaptions(c: { cfUid: string }): Promise<void> {
    // The captions-ready handler already does CAS + defer; safe to re-drive.
    await this.onCaptionsReady({ cfUid: c.cfUid });
  }

  private async reconcileSuggesting(c: { postId: string }): Promise<void> {
    const row = await q.getPostVideo(c.postId);
    if (!row?.transcript) return;
    await this.runAiAndAdvance({
      postId: c.postId,
      transcript: row.transcript,
      transcriptChars: row.transcript.length,
      wasTruncated: false,
    });
  }

  private async reconcilePendingCancel(c: {
    postId: string;
    cfUid: string;
    pendingCfUid: string | null;
  }): Promise<void> {
    try {
      await this.cfg.cloudflareStream.deleteAsset(c.cfUid);
      if (c.pendingCfUid) {
        await this.cfg.cloudflareStream.deleteAsset(c.pendingCfUid);
      }
      await q.deletePostVideo({ postId: c.postId });
    } catch (err) {
      this.cfg.logger.warn(
        { event: 'video.pipeline.cancel-retry', postId: c.postId, err },
        'cancel retry — will retry next sweep',
      );
    }
  }

  private async reconcileSignedUrlDrift(postId: string, cfValue: boolean): Promise<void> {
    const row = await q.getPostVideo(postId);
    if (!row) return;
    if (row.playbackRequiresSignedUrl !== cfValue) {
      await query(
        `UPDATE post_videos SET playback_requires_signed_url = $2, updated_at = NOW() WHERE post_id = $1`,
        [postId, cfValue],
      );
      this.cfg.logger.warn(
        {
          event: 'video.visibility.drift-detected',
          postId,
          dbValue: row.playbackRequiresSignedUrl,
          cfValue,
        },
        'playback_requires_signed_url drift — reconciled to cf',
      );
    }
  }

  // ─── visibility-flip SAGA (spec §8.4) ───────────────────────────────────

  async flipVisibility(args: {
    postId: string;
    from: 'public' | 'private';
    to: 'public' | 'private';
    cfUid: string;
  }): Promise<void> {
    if (args.from === args.to) return;
    if (args.to === 'private') {
      await this.flipPublicToPrivate(args);
    } else {
      await this.flipPrivateToPublic(args);
    }
  }

  private async flipPublicToPrivate(args: {
    postId: string;
    from: 'public' | 'private';
    to: 'public' | 'private';
    cfUid: string;
  }): Promise<void> {
    // 1) CF first — restrict before relaxing DB.
    try {
      await this.cfg.cloudflareStream.setRequireSignedUrls(args.cfUid, true);
    } catch (err) {
      throw new Error(`VIDEO_VISIBILITY_FLIP_FAILED: ${(err as Error).message}`);
    }

    // 2) DB commit.
    try {
      await withTransaction(async (client) => {
        await client.query(
          `UPDATE posts SET visibility = 'private', updated_at = NOW() WHERE id = $1`,
          [args.postId],
        );
        await client.query(
          `UPDATE post_videos SET playback_requires_signed_url = true, updated_at = NOW() WHERE post_id = $1`,
          [args.postId],
        );
      });
    } catch (dbErr) {
      // Compensating: relax CF back to public.
      try {
        await this.cfg.cloudflareStream.setRequireSignedUrls(args.cfUid, false);
      } catch (cfErr) {
        this.cfg.logger.warn(
          {
            event: 'video.visibility.drift-detected',
            postId: args.postId,
            stage: 'compensating-after-db-fail',
            err: cfErr,
          },
          'compensating CF revert failed — reconciler will fix',
        );
      }
      throw new Error(`VIDEO_VISIBILITY_FLIP_FAILED: ${(dbErr as Error).message}`);
    }

    // 3) Best-effort purge — failure here does NOT throw or trigger compensating revert.
    try {
      await this.cfg.cloudflareStream.purgeCache(args.cfUid);
    } catch (purgeErr) {
      this.cfg.logger.warn(
        { event: 'video.visibility.purge-failed', postId: args.postId, err: purgeErr },
        'purgeCache failed after visibility flip (DB committed)',
      );
    }

    this.cfg.logger.info(
      { event: 'video.visibility.flipped', postId: args.postId, from: args.from, to: args.to },
      'visibility flipped',
    );
  }

  private async flipPrivateToPublic(args: {
    postId: string;
    from: 'public' | 'private';
    to: 'public' | 'private';
    cfUid: string;
  }): Promise<void> {
    // 1) DB first — restrict-while-relaxing means we widen DB before CF.
    try {
      await withTransaction(async (client) => {
        await client.query(
          `UPDATE posts SET visibility = 'public', updated_at = NOW() WHERE id = $1`,
          [args.postId],
        );
        await client.query(
          `UPDATE post_videos SET playback_requires_signed_url = false, updated_at = NOW() WHERE post_id = $1`,
          [args.postId],
        );
      });
    } catch (dbErr) {
      throw new Error(`VIDEO_VISIBILITY_FLIP_FAILED: ${(dbErr as Error).message}`);
    }

    // 2) CF relax.
    try {
      await this.cfg.cloudflareStream.setRequireSignedUrls(args.cfUid, false);
    } catch (cfErr) {
      // Compensating: revert DB.
      try {
        await withTransaction(async (client) => {
          await client.query(
            `UPDATE posts SET visibility = 'private', updated_at = NOW() WHERE id = $1`,
            [args.postId],
          );
          await client.query(
            `UPDATE post_videos SET playback_requires_signed_url = true, updated_at = NOW() WHERE post_id = $1`,
            [args.postId],
          );
        });
      } catch (revertErr) {
        this.cfg.logger.warn(
          {
            event: 'video.visibility.drift-detected',
            postId: args.postId,
            stage: 'compensating-after-cf-fail',
            err: revertErr,
          },
          'compensating DB revert failed — reconciler will fix',
        );
      }
      throw new Error(`VIDEO_VISIBILITY_FLIP_FAILED: ${(cfErr as Error).message}`);
    }

    this.cfg.logger.info(
      { event: 'video.visibility.flipped', postId: args.postId, from: args.from, to: args.to },
      'visibility flipped',
    );
  }

  // ─── helpers ────────────────────────────────────────────────────────────

  private async findRowByCfUid(cfUid: string): Promise<{ postId: string } | null> {
    const result = await query<{ post_id: string }>(
      `SELECT post_id FROM post_videos WHERE cf_uid = $1 OR pending_cf_uid = $1`,
      [cfUid],
    );
    const row = result.rows[0];
    return row ? { postId: row.post_id } : null;
  }

  private defer(task: () => Promise<void>, ctx: { postId: string; step: string }): void {
    setImmediate(() => {
      task().catch((err) => {
        this.cfg.logger.error(
          { event: 'video.pipeline.deferred-error', ...ctx, err },
          'deferred pipeline task failed',
        );
      });
    });
  }
}

// ─── reconciler wrapper (boot sweep + interval) ─────────────────────────────

export function startReconciler(args: {
  service: VideoPipelineService;
  intervalMs: number;
}): ReconcilerHandle {
  void args.service.runReconcilerSweep({ staleness: 'boot' }).catch(() => {
    /* swallowed — boot sweep failures are logged inside the sweep itself */
  });
  const interval = setInterval(() => {
    void args.service.runReconcilerSweep({ staleness: 'interval' }).catch(() => {
      /* swallowed — interval sweep failures are logged inside the sweep itself */
    });
  }, args.intervalMs);
  return { interval };
}

export function stopReconciler(handle: ReconcilerHandle): void {
  clearInterval(handle.interval);
}
