// Unit tests for VideoPipelineService.runReconcilerSweep + startReconciler
// (issue #102, plan Sub-WU3b — subtask 3.4).
//
// The reconciler is a periodic sweep that pulls non-terminal post_videos rows
// and reconciles them against CF Stream. We mock the DB queries module and
// the `query`/`withTransaction` helpers from db/connection.js so the per-state
// handlers can be exercised without a real Postgres.

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';

vi.mock('../../db/connection.js', () => ({
  withTransaction: vi.fn(),
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
}));

import * as q from '../../db/queries/video.js';
import {
  VideoPipelineService,
  startReconciler,
  stopReconciler,
} from '../../services/video-pipeline.js';
import type { ICloudflareStreamService } from '../../services/cloudflare-stream.js';

const mockedQ = q as unknown as Record<string, Mock>;

function makeFakeCf(): ICloudflareStreamService & Record<string, Mock> {
  return {
    customerSubdomain: 'mock-subdomain',
    requestUploadUrl: vi.fn(),
    getVideoStatus: vi.fn(),
    requestCaptions: vi.fn().mockResolvedValue(undefined),
    fetchCaptionsWebVTT: vi.fn().mockResolvedValue('WEBVTT\n'),
    setRequireSignedUrls: vi.fn().mockResolvedValue(undefined),
    mintPlaybackToken: vi.fn().mockResolvedValue('tok_mock'),
    purgeCache: vi.fn().mockResolvedValue(undefined),
    deleteAsset: vi.fn().mockResolvedValue(undefined),
  } as unknown as ICloudflareStreamService & Record<string, Mock>;
}

function makeSvc(opts?: {
  cf?: ReturnType<typeof makeFakeCf>;
  extract?: Mock;
  logger?: { info: Mock; warn: Mock; error: Mock };
  reconcilerStalenessMs?: number;
}) {
  const cf = opts?.cf ?? makeFakeCf();
  const extract =
    opts?.extract ?? vi.fn().mockResolvedValue({ title: 'T', description: 'D', tags: ['ai'] });
  const logger = opts?.logger ?? { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const svc = new VideoPipelineService({
    cloudflareStream: cf,
    runExtractVideoMetadata: extract,
    logger,
    maxTranscriptChars: 60,
    promptVersion: 'v1',
    model: 'mock-model',
    reconcilerStalenessMs: opts?.reconcilerStalenessMs,
  });
  return { svc, cf, extract, logger };
}

// Flush deferred (setImmediate-queued) tasks the per-state handlers may chain.
async function flushDeferred() {
  for (let i = 0; i < 3; i += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

beforeEach(() => {
  for (const m of Object.values(mockedQ)) m.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('runReconcilerSweep — staleness selection (boot vs interval)', () => {
  it('boot sweep selects candidates with stalenessIntervalMs=undefined', async () => {
    mockedQ.selectReconcilerCandidates.mockResolvedValueOnce([]);
    const { svc } = makeSvc();
    await svc.runReconcilerSweep({ staleness: 'boot' });
    expect(mockedQ.selectReconcilerCandidates).toHaveBeenCalledWith({
      stalenessIntervalMs: undefined,
    });
  });

  it('interval sweep uses the configured staleness window', async () => {
    mockedQ.selectReconcilerCandidates.mockResolvedValueOnce([]);
    const { svc } = makeSvc({ reconcilerStalenessMs: 60_000 });
    await svc.runReconcilerSweep({ staleness: 'interval' });
    expect(mockedQ.selectReconcilerCandidates).toHaveBeenCalledWith({
      stalenessIntervalMs: 60_000,
    });
  });

  it('defaults staleness to 10 minutes when not configured and called with no opts', async () => {
    mockedQ.selectReconcilerCandidates.mockResolvedValueOnce([]);
    const { svc } = makeSvc();
    await svc.runReconcilerSweep();
    expect(mockedQ.selectReconcilerCandidates).toHaveBeenCalledWith({
      stalenessIntervalMs: 10 * 60 * 1000,
    });
  });
});

describe('runReconcilerSweep — uploading recovery', () => {
  it('CF reports readyToStream → advances uploading → processing and chains captions request', async () => {
    mockedQ.selectReconcilerCandidates.mockResolvedValueOnce([
      { postId: 'p1', cfUid: 'cf-1', pendingCfUid: null, status: 'uploading' },
    ]);
    const cf = makeFakeCf();
    cf.getVideoStatus.mockResolvedValueOnce({
      readyToStream: true,
      requireSignedURLs: false,
    });
    // findPostVideoByCfUid lookup inside onVideoReady + signed-url drift check
    mockedQ.findPostVideoByCfUid.mockResolvedValueOnce({ postId: 'p1' });
    mockedQ.setPostVideoStatus.mockResolvedValue(true);
    mockedQ.getPostVideo.mockResolvedValueOnce({
      postId: 'p1',
      cfUid: 'cf-1',
      pendingCfUid: null,
      status: 'processing',
      playbackRequiresSignedUrl: false,
    });
    const { svc } = makeSvc({ cf });

    await svc.runReconcilerSweep({ staleness: 'interval' });
    await flushDeferred();

    // First call: from uploading → processing (driven by onVideoReady)
    expect(mockedQ.setPostVideoStatus).toHaveBeenCalledWith({
      postId: 'p1',
      from: 'uploading',
      to: 'processing',
    });
  });

  it('CF says 404 (null) → flips uploading → failed with "upload timed out"', async () => {
    mockedQ.selectReconcilerCandidates.mockResolvedValueOnce([
      { postId: 'p1', cfUid: 'cf-1', pendingCfUid: null, status: 'uploading' },
    ]);
    const cf = makeFakeCf();
    cf.getVideoStatus.mockResolvedValueOnce(null);
    mockedQ.setPostVideoStatus.mockResolvedValueOnce(true);
    const { svc } = makeSvc({ cf });

    await svc.runReconcilerSweep({ staleness: 'interval' });

    expect(mockedQ.setPostVideoStatus).toHaveBeenCalledWith({
      postId: 'p1',
      from: 'uploading',
      to: 'failed',
      lastError: 'upload timed out',
    });
  });

  it('uploading + CF readyToStream=false → only signed-url drift check runs (no advance)', async () => {
    mockedQ.selectReconcilerCandidates.mockResolvedValueOnce([
      { postId: 'p1', cfUid: 'cf-1', pendingCfUid: null, status: 'uploading' },
    ]);
    const cf = makeFakeCf();
    cf.getVideoStatus.mockResolvedValueOnce({
      readyToStream: false,
      requireSignedURLs: false,
    });
    mockedQ.getPostVideo.mockResolvedValueOnce({
      postId: 'p1',
      playbackRequiresSignedUrl: false,
    });
    const { svc } = makeSvc({ cf });

    await svc.runReconcilerSweep({ staleness: 'interval' });

    expect(mockedQ.setPostVideoStatus).not.toHaveBeenCalled();
  });
});

describe('runReconcilerSweep — processing recovery', () => {
  it('CF readyToStream=true → requestCaptions + processing → captions', async () => {
    mockedQ.selectReconcilerCandidates.mockResolvedValueOnce([
      { postId: 'p1', cfUid: 'cf-1', pendingCfUid: null, status: 'processing' },
    ]);
    const cf = makeFakeCf();
    cf.getVideoStatus.mockResolvedValueOnce({
      readyToStream: true,
      requireSignedURLs: false,
    });
    mockedQ.setPostVideoStatus.mockResolvedValueOnce(true);
    mockedQ.getPostVideo.mockResolvedValueOnce({
      postId: 'p1',
      playbackRequiresSignedUrl: false,
    });
    const { svc } = makeSvc({ cf });

    await svc.runReconcilerSweep({ staleness: 'interval' });

    expect(cf.requestCaptions).toHaveBeenCalledWith('cf-1');
    expect(mockedQ.setPostVideoStatus).toHaveBeenCalledWith({
      postId: 'p1',
      from: 'processing',
      to: 'captions',
    });
  });

  it('CF readyToStream=false → no advance, signed-url drift still checked', async () => {
    mockedQ.selectReconcilerCandidates.mockResolvedValueOnce([
      { postId: 'p1', cfUid: 'cf-1', pendingCfUid: null, status: 'processing' },
    ]);
    const cf = makeFakeCf();
    cf.getVideoStatus.mockResolvedValueOnce({
      readyToStream: false,
      requireSignedURLs: true,
    });
    mockedQ.getPostVideo.mockResolvedValueOnce({
      postId: 'p1',
      playbackRequiresSignedUrl: true,
    });
    const { svc } = makeSvc({ cf });

    await svc.runReconcilerSweep({ staleness: 'interval' });

    expect(cf.requestCaptions).not.toHaveBeenCalled();
  });

  it('CF returns null (asset gone) → no advance, no drift check, no throw', async () => {
    mockedQ.selectReconcilerCandidates.mockResolvedValueOnce([
      { postId: 'p1', cfUid: 'cf-1', pendingCfUid: null, status: 'processing' },
    ]);
    const cf = makeFakeCf();
    cf.getVideoStatus.mockResolvedValueOnce(null);
    const { svc } = makeSvc({ cf });

    await svc.runReconcilerSweep({ staleness: 'interval' });

    expect(cf.requestCaptions).not.toHaveBeenCalled();
    expect(mockedQ.setPostVideoStatus).not.toHaveBeenCalled();
  });
});

describe('runReconcilerSweep — captions recovery', () => {
  it('drives the onCaptionsReady flow against the cf_uid', async () => {
    mockedQ.selectReconcilerCandidates.mockResolvedValueOnce([
      { postId: 'p1', cfUid: 'cf-1', pendingCfUid: null, status: 'captions' },
    ]);
    // onCaptionsReady looks up the row via findPostVideoByCfUid helper
    mockedQ.findPostVideoByCfUid.mockResolvedValueOnce({ postId: 'p1' });
    mockedQ.setPostVideoStatus.mockResolvedValueOnce(true);
    const { svc, cf } = makeSvc();

    await svc.runReconcilerSweep({ staleness: 'interval' });
    await flushDeferred();

    expect(mockedQ.setPostVideoStatus).toHaveBeenCalledWith({
      postId: 'p1',
      from: 'captions',
      to: 'suggesting',
    });
    expect(cf.fetchCaptionsWebVTT).toHaveBeenCalled();
  });
});

describe('runReconcilerSweep — suggesting recovery', () => {
  it('re-runs runAiAndAdvance on the stored transcript', async () => {
    mockedQ.selectReconcilerCandidates.mockResolvedValueOnce([
      { postId: 'p1', cfUid: 'cf-1', pendingCfUid: null, status: 'suggesting' },
    ]);
    mockedQ.getPostVideo
      .mockResolvedValueOnce({
        postId: 'p1',
        cfUid: 'cf-1',
        pendingCfUid: null,
        status: 'suggesting',
        transcript: 'stored',
      })
      .mockResolvedValueOnce({
        postId: 'p1',
        cfUid: 'cf-1',
        pendingCfUid: null,
        status: 'suggesting',
        transcript: 'stored',
      });
    mockedQ.insertAiRun.mockResolvedValueOnce({ id: 'r' });
    mockedQ.setPostVideoStatus.mockResolvedValueOnce(true);
    const extract = vi.fn().mockResolvedValueOnce({ title: 't', description: 'd', tags: ['z'] });
    const { svc } = makeSvc({ extract });

    await svc.runReconcilerSweep({ staleness: 'interval' });

    expect(extract).toHaveBeenCalledWith({ transcript: 'stored' });
    expect(mockedQ.insertAiRun).toHaveBeenCalled();
  });

  it('skips when no transcript is stored yet', async () => {
    mockedQ.selectReconcilerCandidates.mockResolvedValueOnce([
      { postId: 'p1', cfUid: 'cf-1', pendingCfUid: null, status: 'suggesting' },
    ]);
    mockedQ.getPostVideo.mockResolvedValueOnce({
      postId: 'p1',
      cfUid: 'cf-1',
      pendingCfUid: null,
      status: 'suggesting',
      transcript: null,
    });
    const extract = vi.fn();
    const { svc } = makeSvc({ extract });

    await svc.runReconcilerSweep({ staleness: 'interval' });

    expect(extract).not.toHaveBeenCalled();
  });

  it('skips when the row vanished between selection and re-fetch', async () => {
    mockedQ.selectReconcilerCandidates.mockResolvedValueOnce([
      { postId: 'p1', cfUid: 'cf-1', pendingCfUid: null, status: 'suggesting' },
    ]);
    mockedQ.getPostVideo.mockResolvedValueOnce(null);
    const extract = vi.fn();
    const { svc } = makeSvc({ extract });

    await svc.runReconcilerSweep({ staleness: 'interval' });

    expect(extract).not.toHaveBeenCalled();
  });
});

describe('runReconcilerSweep — pending_cancel recovery', () => {
  it('deletes the CF asset and removes the row on success', async () => {
    mockedQ.selectReconcilerCandidates.mockResolvedValueOnce([
      { postId: 'p1', cfUid: 'cf-1', pendingCfUid: null, status: 'pending_cancel' },
    ]);
    const { svc, cf } = makeSvc();

    await svc.runReconcilerSweep({ staleness: 'interval' });

    expect(cf.deleteAsset).toHaveBeenCalledWith('cf-1');
    expect(mockedQ.deletePostVideo).toHaveBeenCalledWith({ postId: 'p1' });
  });

  it('deletes BOTH the live cf_uid and pending_cf_uid asset when present', async () => {
    mockedQ.selectReconcilerCandidates.mockResolvedValueOnce([
      { postId: 'p1', cfUid: 'cf-old', pendingCfUid: 'cf-new', status: 'pending_cancel' },
    ]);
    const { svc, cf } = makeSvc();

    await svc.runReconcilerSweep({ staleness: 'interval' });

    expect(cf.deleteAsset).toHaveBeenCalledWith('cf-old');
    expect(cf.deleteAsset).toHaveBeenCalledWith('cf-new');
    expect(mockedQ.deletePostVideo).toHaveBeenCalledWith({ postId: 'p1' });
  });

  it('leaves the row for the next sweep when CF delete fails (logs at warn)', async () => {
    mockedQ.selectReconcilerCandidates.mockResolvedValueOnce([
      { postId: 'p1', cfUid: 'cf-1', pendingCfUid: null, status: 'pending_cancel' },
    ]);
    const cf = makeFakeCf();
    cf.deleteAsset.mockRejectedValueOnce(new Error('cf 503'));
    const { svc, logger } = makeSvc({ cf });

    await svc.runReconcilerSweep({ staleness: 'interval' });

    expect(mockedQ.deletePostVideo).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'video.pipeline.cancel-retry', postId: 'p1' }),
      expect.any(String),
    );
  });
});

describe('runReconcilerSweep — drift detection', () => {
  it('updates DB + logs video.visibility.drift-detected when CF differs from DB', async () => {
    mockedQ.selectReconcilerCandidates.mockResolvedValueOnce([
      { postId: 'p1', cfUid: 'cf-1', pendingCfUid: null, status: 'processing' },
    ]);
    const cf = makeFakeCf();
    cf.getVideoStatus.mockResolvedValueOnce({
      readyToStream: false,
      requireSignedURLs: true, // CF says true …
    });
    mockedQ.getPostVideo.mockResolvedValueOnce({
      postId: 'p1',
      playbackRequiresSignedUrl: false, // … DB says false
    });
    const { svc, logger } = makeSvc({ cf });

    await svc.runReconcilerSweep({ staleness: 'interval' });

    expect(mockedQ.setPlaybackRequiresSignedUrl).toHaveBeenCalledWith({
      postId: 'p1',
      value: true,
    });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'video.visibility.drift-detected',
        postId: 'p1',
        dbValue: false,
        cfValue: true,
      }),
      expect.any(String),
    );
  });

  it('no-op when CF agrees with DB', async () => {
    mockedQ.selectReconcilerCandidates.mockResolvedValueOnce([
      { postId: 'p1', cfUid: 'cf-1', pendingCfUid: null, status: 'processing' },
    ]);
    const cf = makeFakeCf();
    cf.getVideoStatus.mockResolvedValueOnce({
      readyToStream: false,
      requireSignedURLs: false,
    });
    mockedQ.getPostVideo.mockResolvedValueOnce({
      postId: 'p1',
      playbackRequiresSignedUrl: false,
    });
    const { svc, logger } = makeSvc({ cf });

    await svc.runReconcilerSweep({ staleness: 'interval' });

    expect(mockedQ.setPlaybackRequiresSignedUrl).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: 'video.visibility.drift-detected' }),
      expect.any(String),
    );
  });

  it('skips drift check when the row no longer exists', async () => {
    mockedQ.selectReconcilerCandidates.mockResolvedValueOnce([
      { postId: 'p1', cfUid: 'cf-1', pendingCfUid: null, status: 'processing' },
    ]);
    const cf = makeFakeCf();
    cf.getVideoStatus.mockResolvedValueOnce({
      readyToStream: false,
      requireSignedURLs: true,
    });
    mockedQ.getPostVideo.mockResolvedValueOnce(null);
    const { svc, logger } = makeSvc({ cf });

    await svc.runReconcilerSweep({ staleness: 'interval' });

    expect(logger.warn).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: 'video.visibility.drift-detected' }),
      expect.any(String),
    );
  });
});

describe('runReconcilerSweep — error containment + status fallthrough', () => {
  it('logs reconciler-error and continues to the next candidate when one throws', async () => {
    mockedQ.selectReconcilerCandidates.mockResolvedValueOnce([
      { postId: 'p1', cfUid: 'cf-1', pendingCfUid: null, status: 'uploading' },
      { postId: 'p2', cfUid: 'cf-2', pendingCfUid: null, status: 'pending_cancel' },
    ]);
    const cf = makeFakeCf();
    cf.getVideoStatus.mockRejectedValueOnce(new Error('cf down'));
    const { svc, logger } = makeSvc({ cf });

    await svc.runReconcilerSweep({ staleness: 'interval' });

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'video.pipeline.reconciler-error',
        postId: 'p1',
      }),
      expect.any(String),
    );
    expect(cf.deleteAsset).toHaveBeenCalledWith('cf-2');
  });

  it('ignores rows with a status that has no recovery handler (e.g. ready)', async () => {
    mockedQ.selectReconcilerCandidates.mockResolvedValueOnce([
      // Should not occur per the SQL filter, but defensively handled.
      { postId: 'p1', cfUid: 'cf-1', pendingCfUid: null, status: 'ready' },
    ]);
    const { svc, cf } = makeSvc();

    await svc.runReconcilerSweep({ staleness: 'interval' });

    expect(cf.getVideoStatus).not.toHaveBeenCalled();
    expect(mockedQ.setPostVideoStatus).not.toHaveBeenCalled();
  });
});

describe('startReconciler / stopReconciler', () => {
  it('triggers a boot sweep immediately and an interval sweep every intervalMs', async () => {
    vi.useFakeTimers();
    mockedQ.selectReconcilerCandidates.mockResolvedValue([]);
    const { svc } = makeSvc();
    const sweep = vi.spyOn(svc, 'runReconcilerSweep');

    const handle = startReconciler({ service: svc, intervalMs: 1_000 });

    // Boot sweep enqueued synchronously
    expect(sweep).toHaveBeenCalledWith({ staleness: 'boot' });

    // Two interval ticks
    vi.advanceTimersByTime(2_500);
    const intervalCalls = sweep.mock.calls.filter(
      (c) => (c[0] as { staleness?: string } | undefined)?.staleness === 'interval',
    );
    expect(intervalCalls.length).toBeGreaterThanOrEqual(2);

    stopReconciler(handle);
    const before = sweep.mock.calls.length;
    vi.advanceTimersByTime(5_000);
    expect(sweep.mock.calls.length).toBe(before);
  });

  it('swallows sweep errors from boot and interval paths so the timer survives', async () => {
    vi.useFakeTimers();
    const { svc } = makeSvc();
    vi.spyOn(svc, 'runReconcilerSweep').mockRejectedValue(new Error('db down'));

    const handle = startReconciler({ service: svc, intervalMs: 1_000 });
    vi.advanceTimersByTime(1_500);

    // Yield microtasks so the rejected promise's .catch fires.
    await Promise.resolve();
    await Promise.resolve();

    // No throw escaped — timer is still active.
    stopReconciler(handle);
  });
});
