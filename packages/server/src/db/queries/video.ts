// DB query helpers for the video-post pipeline (issue #102, plan WU3).
//
// Each function is a thin, typed wrapper around a single SQL statement. They
// follow the project convention of using the module-level `query` helper from
// `db/connection.ts` so the unit tests can mock the connection module rather
// than spin up real Postgres. Functions that participate in a wider
// transaction (currently only `tryAdvisoryXactLock`) accept an optional
// `pg.PoolClient` so the caller can drive them inside a `withTransaction`
// block — advisory transaction locks are only meaningful on the same client
// the rest of the transaction uses.

import type { PoolClient } from 'pg';
import { query } from '../connection.js';
import type { PostVideo, VideoStatus } from '@forge/shared';

// ── row helpers ────────────────────────────────────────────────────────────

interface PostVideoRow {
  post_id: string;
  cf_uid: string;
  pending_cf_uid: string | null;
  status: VideoStatus;
  duration_sec: number | null;
  size_bytes: number | null;
  transcript: string | null;
  playback_requires_signed_url: boolean;
  last_error: string | null;
  created_at: Date;
  updated_at: Date;
}

function mapPostVideo(r: PostVideoRow): PostVideo {
  return {
    postId: r.post_id,
    cfUid: r.cf_uid,
    pendingCfUid: r.pending_cf_uid,
    status: r.status,
    durationSec: r.duration_sec,
    sizeBytes: r.size_bytes,
    transcript: r.transcript,
    playbackRequiresSignedUrl: r.playback_requires_signed_url,
    lastError: r.last_error,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// ── inserts / lookups ──────────────────────────────────────────────────────

export async function insertPostVideo(args: { postId: string; cfUid: string }): Promise<void> {
  await query(`INSERT INTO post_videos (post_id, cf_uid, status) VALUES ($1, $2, 'uploading')`, [
    args.postId,
    args.cfUid,
  ]);
}

export async function getPostVideo(postId: string): Promise<PostVideo | null> {
  const result = await query<PostVideoRow>('SELECT * FROM post_videos WHERE post_id = $1', [
    postId,
  ]);
  return result.rows[0] ? mapPostVideo(result.rows[0]) : null;
}

// ── status / transition helpers ────────────────────────────────────────────

/**
 * Compare-and-swap status transition. Returns true when the row was advanced,
 * false when the current status no longer matches `from` (race or duplicate
 * webhook). Always stamps `last_status_change_at` and `updated_at`.
 */
export async function setPostVideoStatus(args: {
  postId: string;
  from: VideoStatus;
  to: VideoStatus;
  lastError?: string;
}): Promise<boolean> {
  const result = await query(
    `UPDATE post_videos
        SET status = $3,
            last_error = $4,
            last_status_change_at = NOW(),
            updated_at = NOW()
      WHERE post_id = $1 AND status = $2`,
    [args.postId, args.from, args.to, args.lastError ?? null],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function setPendingCfUid(args: {
  postId: string;
  pendingCfUid: string;
}): Promise<void> {
  await query(
    `UPDATE post_videos
        SET pending_cf_uid = $2,
            updated_at = NOW()
      WHERE post_id = $1`,
    [args.postId, args.pendingCfUid],
  );
}

/**
 * Atomic swap for the replace flow: when a new CF asset is ready, move
 * `pending_cf_uid` → `cf_uid`, clear pending, and flip to `ready`. Guarded by
 * `pending_cf_uid IS NOT NULL` so a stray call against a non-replace row is a
 * no-op.
 */
export async function swapPostVideoCfUid(args: { postId: string }): Promise<void> {
  await query(
    `UPDATE post_videos
        SET cf_uid = pending_cf_uid,
            pending_cf_uid = NULL,
            status = 'ready',
            last_status_change_at = NOW(),
            updated_at = NOW()
      WHERE post_id = $1 AND pending_cf_uid IS NOT NULL`,
    [args.postId],
  );
}

export async function setPostVideoTranscript(args: {
  postId: string;
  transcript: string;
}): Promise<void> {
  await query(
    `UPDATE post_videos
        SET transcript = $2,
            updated_at = NOW()
      WHERE post_id = $1`,
    [args.postId, args.transcript],
  );
}

// ── reconciler / append-only AI run / cleanup ──────────────────────────────

/**
 * Candidates the reconciler sweeps for status reconciliation.
 *
 * - Boot path (`stalenessIntervalMs` omitted): every non-terminal row,
 *   regardless of age.
 * - Steady-state path (`stalenessIntervalMs` set): rows that have been stuck
 *   in a non-terminal status for longer than the interval, in milliseconds.
 *
 * Returns the minimal projection the reconciler needs — full PostVideo rows
 * are fetched per-candidate only when reconciliation actually advances state.
 */
export async function selectReconcilerCandidates(args: {
  stalenessIntervalMs?: number;
}): Promise<Array<Pick<PostVideo, 'postId' | 'cfUid' | 'status' | 'pendingCfUid'>>> {
  const intervalMs = args.stalenessIntervalMs;
  const sql =
    intervalMs == null
      ? `SELECT post_id, cf_uid, pending_cf_uid, status
           FROM post_videos
          WHERE status NOT IN ('ready', 'failed')`
      : `SELECT post_id, cf_uid, pending_cf_uid, status
           FROM post_videos
          WHERE status NOT IN ('ready', 'failed')
            AND last_status_change_at < NOW() - ($1::int || ' milliseconds')::interval`;
  const params = intervalMs == null ? [] : [intervalMs];
  const result = await query<{
    post_id: string;
    cf_uid: string;
    pending_cf_uid: string | null;
    status: VideoStatus;
  }>(sql, params);
  return result.rows.map((r) => ({
    postId: r.post_id,
    cfUid: r.cf_uid,
    pendingCfUid: r.pending_cf_uid,
    status: r.status,
  }));
}

export async function insertAiRun(args: {
  postId: string;
  title: string;
  description: string;
  tags: string[];
  model: string;
  transcriptChars: number;
  wasTruncated: boolean;
  promptVersion: string;
}): Promise<{ id: string }> {
  const result = await query<{ id: string }>(
    `INSERT INTO post_video_ai_runs
       (post_id, title, description, tags, model, transcript_chars, was_truncated, prompt_version)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      args.postId,
      args.title,
      args.description,
      args.tags,
      args.model,
      args.transcriptChars,
      args.wasTruncated,
      args.promptVersion,
    ],
  );
  // The INSERT ... RETURNING always yields a row on success; cast to satisfy
  // TS strict-undefined without leaning on `!`.
  const row = result.rows[0] as { id: string };
  return { id: row.id };
}

export async function deletePostVideo(args: { postId: string }): Promise<void> {
  await query('DELETE FROM post_videos WHERE post_id = $1', [args.postId]);
}

/**
 * Try to acquire a transaction-scoped advisory lock for the AI extraction of
 * a given post. The lock is keyed by `hashtext('video-ai:' || post_id)` so it
 * does not collide with other advisory locks the application might add later.
 *
 * MUST be called from inside a transaction — advisory **xact** locks are
 * released only on COMMIT/ROLLBACK and only on the connection that took them,
 * so callers pass the `pg.PoolClient` from `withTransaction` here. The
 * module-pool fallback exists for tests and ad-hoc callers that don't need
 * the cross-statement guarantee.
 */
export async function tryAdvisoryXactLock(
  args: { postId: string },
  client?: PoolClient,
): Promise<boolean> {
  const sql = `SELECT pg_try_advisory_xact_lock(hashtext('video-ai:' || $1::text)) AS ok`;
  const params = [args.postId];
  const result = client
    ? await client.query<{ ok: boolean }>(sql, params)
    : await query<{ ok: boolean }>(sql, params);
  // pg_try_advisory_xact_lock always returns exactly one row.
  const row = result.rows[0] as { ok: boolean };
  return row.ok === true;
}

/**
 * Idempotent insert for a CF Stream webhook event. Returns true when the
 * event was newly recorded, false when it was already present (duplicate
 * delivery — the handler should no-op).
 */
export async function insertWebhookEvent(args: {
  eventId: string;
  cfUid: string;
  eventType: string;
}): Promise<boolean> {
  const result = await query(
    `INSERT INTO cf_stream_webhook_events (event_id, cf_uid, event_type)
     VALUES ($1, $2, $3)
     ON CONFLICT (event_id) DO NOTHING`,
    [args.eventId, args.cfUid, args.eventType],
  );
  return (result.rowCount ?? 0) > 0;
}
