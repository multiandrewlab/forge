// Unit tests for VideoPipelineService.handleWebhook + audit-log emissions
// (issue #102, plan Sub-WU3b — subtasks 3.3 and 3.6).
//
// These tests mock the DB layer (`db/connection.js` + `db/queries/video.js`)
// so the state machine can be exercised without spinning up Postgres. The
// CloudflareStreamService dependency is hand-rolled as a vi.fn() bag matching
// the ICloudflareStreamService interface; `runExtractVideoMetadata` is an
// injected vi.fn() — the real implementation lands in Sub-WU4.

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';

vi.mock('../../db/connection.js', () => ({
  query: vi.fn(),
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
}));

import { query } from '../../db/connection.js';
import * as q from '../../db/queries/video.js';
import { VideoPipelineService } from '../../services/video-pipeline.js';
import type { ICloudflareStreamService } from '../../services/cloudflare-stream.js';

const mockQuery = query as Mock;
const mockedQ = q as unknown as Record<string, Mock>;

function makeFakeCf(): ICloudflareStreamService & Record<string, Mock> {
  return {
    customerSubdomain: 'mock-subdomain',
    requestUploadUrl: vi.fn(),
    getVideoStatus: vi.fn(),
    requestCaptions: vi.fn().mockResolvedValue(undefined),
    fetchCaptionsWebVTT: vi.fn().mockResolvedValue(''),
    setRequireSignedUrls: vi.fn().mockResolvedValue(undefined),
    mintPlaybackToken: vi.fn().mockResolvedValue('tok_mock'),
    purgeCache: vi.fn().mockResolvedValue(undefined),
    deleteAsset: vi.fn().mockResolvedValue(undefined),
  } as unknown as ICloudflareStreamService & Record<string, Mock>;
}

// Flush all setImmediate-deferred work + microtasks. The service queues
// background tasks via setImmediate(); we wait one event-loop tick so the
// deferred callback runs, then drain microtasks so the `await`s inside
// resolve before assertions run.
async function flushDeferred() {
  // Two setImmediate ticks: one to release the queued callback, one to let
  // any nested setImmediate (chained deferrals) drain. Then yield microtasks
  // for the async/await machinery inside the deferred task.
  for (let i = 0; i < 3; i += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

interface TestBed {
  cf: ReturnType<typeof makeFakeCf>;
  extract: Mock;
  logger: { info: Mock; warn: Mock; error: Mock };
  svc: VideoPipelineService;
}

function makeBed(overrides: Partial<TestBed> = {}): TestBed {
  const cf = overrides.cf ?? makeFakeCf();
  const extract =
    overrides.extract ?? vi.fn().mockResolvedValue({ title: 'T', description: 'D', tags: ['ai'] });
  const logger = overrides.logger ?? { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const svc =
    overrides.svc ??
    new VideoPipelineService({
      cloudflareStream: cf,
      runExtractVideoMetadata: extract,
      logger,
      maxTranscriptChars: 60,
      promptVersion: 'v1',
      model: 'mock-model',
    });
  return { cf, extract, logger, svc };
}

beforeEach(() => {
  for (const m of Object.values(mockedQ)) m.mockReset();
  mockQuery.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('VideoPipelineService.handleWebhook — video.ready', () => {
  it('advances uploading → processing via CAS and defers requestCaptions + processing → captions', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ post_id: 'p1' }], rowCount: 1 });
    mockedQ.setPostVideoStatus.mockResolvedValueOnce(true).mockResolvedValueOnce(true);
    const { cf, svc } = makeBed();

    await svc.handleWebhook({
      type: 'video.ready',
      cfUid: 'cf-1',
      sizeBytes: 12345,
      durationSec: 7,
    });
    await flushDeferred();

    expect(mockedQ.setPostVideoStatus).toHaveBeenNthCalledWith(1, {
      postId: 'p1',
      from: 'uploading',
      to: 'processing',
    });
    expect(cf.requestCaptions).toHaveBeenCalledWith('cf-1');
    expect(mockedQ.setPostVideoStatus).toHaveBeenNthCalledWith(2, {
      postId: 'p1',
      from: 'processing',
      to: 'captions',
    });
  });

  it('looks up rows by cf_uid OR pending_cf_uid', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ post_id: 'p1' }], rowCount: 1 });
    mockedQ.setPostVideoStatus.mockResolvedValue(true);
    const { svc } = makeBed();

    await svc.handleWebhook({ type: 'video.ready', cfUid: 'cf-x' });
    await flushDeferred();

    expect(mockQuery).toHaveBeenCalled();
    const firstCall = mockQuery.mock.calls[0] as [string, unknown[]];
    const sql = firstCall[0];
    expect(sql).toMatch(/cf_uid\s*=\s*\$1\s+OR\s+pending_cf_uid\s*=\s*\$1/);
  });

  it('is a no-op when CAS loses (duplicate webhook after row already advanced)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ post_id: 'p1' }], rowCount: 1 });
    mockedQ.setPostVideoStatus.mockResolvedValueOnce(false);
    const { cf, svc } = makeBed();

    await svc.handleWebhook({ type: 'video.ready', cfUid: 'cf-1' });
    await flushDeferred();

    expect(cf.requestCaptions).not.toHaveBeenCalled();
    expect(mockedQ.setPostVideoStatus).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when the row is not found (unknown cf_uid)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const { cf, svc } = makeBed();

    await svc.handleWebhook({ type: 'video.ready', cfUid: 'orphan' });
    await flushDeferred();

    expect(mockedQ.setPostVideoStatus).not.toHaveBeenCalled();
    expect(cf.requestCaptions).not.toHaveBeenCalled();
  });

  it('logs deferred-error when the captions request throws after CAS', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ post_id: 'p1' }], rowCount: 1 });
    mockedQ.setPostVideoStatus.mockResolvedValueOnce(true);
    const cf = makeFakeCf();
    cf.requestCaptions.mockRejectedValueOnce(new Error('cf api 500'));
    const { svc, logger } = makeBed({ cf });

    await svc.handleWebhook({ type: 'video.ready', cfUid: 'cf-1' });
    await flushDeferred();

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'video.pipeline.deferred-error',
        postId: 'p1',
        step: 'request-captions',
      }),
      expect.any(String),
    );
  });
});

describe('VideoPipelineService.handleWebhook — captions.ready', () => {
  it('advances captions → suggesting then runs the deferred fetch+parse+AI+ready flow', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ post_id: 'p1' }], rowCount: 1 });
    mockedQ.setPostVideoStatus
      .mockResolvedValueOnce(true) // captions → suggesting
      .mockResolvedValueOnce(true); // suggesting → ready
    mockedQ.getPostVideo.mockResolvedValueOnce({
      postId: 'p1',
      cfUid: 'cf-1',
      pendingCfUid: null,
      status: 'suggesting',
      transcript: 'hello',
    });
    const cf = makeFakeCf();
    cf.fetchCaptionsWebVTT.mockResolvedValueOnce(
      'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nhello kibana\n',
    );
    const extract = vi
      .fn()
      .mockResolvedValueOnce({ title: 't', description: 'd', tags: ['hello'] });
    mockedQ.insertAiRun.mockResolvedValueOnce({ id: 'run-1' });
    const { svc } = makeBed({ cf, extract });

    await svc.handleWebhook({ type: 'captions.ready', cfUid: 'cf-1' });
    await flushDeferred();

    expect(mockedQ.setPostVideoStatus).toHaveBeenNthCalledWith(1, {
      postId: 'p1',
      from: 'captions',
      to: 'suggesting',
    });
    expect(cf.fetchCaptionsWebVTT).toHaveBeenCalledWith(
      'https://customer-mock-subdomain.cloudflarestream.com/cf-1/captions/en',
    );
    expect(mockedQ.setPostVideoTranscript).toHaveBeenCalledWith({
      postId: 'p1',
      transcript: 'hello kibana',
    });
    expect(extract).toHaveBeenCalledWith({ transcript: 'hello kibana' });
    expect(mockedQ.insertAiRun).toHaveBeenCalledWith(
      expect.objectContaining({
        postId: 'p1',
        title: 't',
        description: 'd',
        tags: ['hello'],
        model: 'mock-model',
        promptVersion: 'v1',
        wasTruncated: false,
      }),
    );
    expect(mockedQ.setPostVideoStatus).toHaveBeenNthCalledWith(2, {
      postId: 'p1',
      from: 'suggesting',
      to: 'ready',
    });
  });

  it('on AI failure flips suggesting → failed with lastError and emits deferred-error', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ post_id: 'p1' }], rowCount: 1 });
    mockedQ.setPostVideoStatus
      .mockResolvedValueOnce(true) // captions → suggesting
      .mockResolvedValueOnce(true); // suggesting → failed
    const cf = makeFakeCf();
    cf.fetchCaptionsWebVTT.mockResolvedValueOnce('WEBVTT\n');
    const extract = vi.fn().mockRejectedValueOnce(new Error('llm boom'));
    const { svc, logger } = makeBed({ cf, extract });

    await svc.handleWebhook({ type: 'captions.ready', cfUid: 'cf-1' });
    await flushDeferred();

    expect(mockedQ.setPostVideoStatus).toHaveBeenNthCalledWith(2, {
      postId: 'p1',
      from: 'suggesting',
      to: 'failed',
      lastError: 'ai extraction returned invalid output',
    });
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'video.pipeline.deferred-error',
        postId: 'p1',
      }),
      expect.any(String),
    );
  });

  it('replace flow: swaps cf_uid + deletes prior asset + emits video.replaced', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ post_id: 'p1' }], rowCount: 1 });
    mockedQ.setPostVideoStatus.mockResolvedValueOnce(true); // captions → suggesting
    mockedQ.getPostVideo.mockResolvedValueOnce({
      postId: 'p1',
      cfUid: 'cf-old',
      pendingCfUid: 'cf-new',
      status: 'suggesting',
      transcript: 'replacement',
    });
    const cf = makeFakeCf();
    cf.fetchCaptionsWebVTT.mockResolvedValueOnce(
      'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nreplacement\n',
    );
    const extract = vi.fn().mockResolvedValueOnce({ title: 't', description: 'd', tags: ['new'] });
    mockedQ.insertAiRun.mockResolvedValueOnce({ id: 'run-2' });
    const { svc, logger } = makeBed({ cf, extract });

    await svc.handleWebhook({ type: 'captions.ready', cfUid: 'cf-new' });
    await flushDeferred();

    expect(mockedQ.swapPostVideoCfUid).toHaveBeenCalledWith({ postId: 'p1' });
    expect(cf.deleteAsset).toHaveBeenCalledWith('cf-old');
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'video.replaced',
        postId: 'p1',
        oldCfUid: 'cf-old',
        newCfUid: 'cf-new',
      }),
      expect.any(String),
    );
  });

  it('replace flow: prior-asset deletion failure is logged but does not throw', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ post_id: 'p1' }], rowCount: 1 });
    mockedQ.setPostVideoStatus.mockResolvedValueOnce(true);
    mockedQ.getPostVideo.mockResolvedValueOnce({
      postId: 'p1',
      cfUid: 'cf-old',
      pendingCfUid: 'cf-new',
      status: 'suggesting',
      transcript: 'r',
    });
    const cf = makeFakeCf();
    cf.fetchCaptionsWebVTT.mockResolvedValueOnce('WEBVTT\n');
    cf.deleteAsset.mockRejectedValueOnce(new Error('cf 500'));
    mockedQ.insertAiRun.mockResolvedValueOnce({ id: 'run-3' });
    const extract = vi.fn().mockResolvedValueOnce({ title: 't', description: 'd', tags: ['x'] });
    const { svc, logger } = makeBed({ cf, extract });

    await svc.handleWebhook({ type: 'captions.ready', cfUid: 'cf-new' });
    await flushDeferred();

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'video.pipeline.orphan-cf-asset', oldCfUid: 'cf-old' }),
      expect.any(String),
    );
  });

  it('is a no-op when CAS loses on captions → suggesting', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ post_id: 'p1' }], rowCount: 1 });
    mockedQ.setPostVideoStatus.mockResolvedValueOnce(false);
    const { svc, cf } = makeBed();

    await svc.handleWebhook({ type: 'captions.ready', cfUid: 'cf-1' });
    await flushDeferred();

    expect(cf.fetchCaptionsWebVTT).not.toHaveBeenCalled();
  });

  it('is a no-op when the row is missing on captions.ready', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const { svc, cf } = makeBed();

    await svc.handleWebhook({ type: 'captions.ready', cfUid: 'orphan' });
    await flushDeferred();

    expect(mockedQ.setPostVideoStatus).not.toHaveBeenCalled();
    expect(cf.fetchCaptionsWebVTT).not.toHaveBeenCalled();
  });
});

describe('VideoPipelineService.handleWebhook — video.error', () => {
  it('flips the first in-flight status to failed (uploading→failed)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ post_id: 'p1' }], rowCount: 1 });
    mockedQ.setPostVideoStatus.mockResolvedValueOnce(true);
    const { svc } = makeBed();

    await svc.handleWebhook({ type: 'video.error', cfUid: 'cf-1', message: 'encode failed' });

    expect(mockedQ.setPostVideoStatus).toHaveBeenCalledTimes(1);
    expect(mockedQ.setPostVideoStatus).toHaveBeenCalledWith({
      postId: 'p1',
      from: 'uploading',
      to: 'failed',
      lastError: 'encode failed',
    });
  });

  it('falls through to the next status when CAS misses (covers processing/captions/suggesting)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ post_id: 'p1' }], rowCount: 1 });
    mockedQ.setPostVideoStatus
      .mockResolvedValueOnce(false) // uploading
      .mockResolvedValueOnce(false) // processing
      .mockResolvedValueOnce(true); // captions → failed
    const { svc } = makeBed();

    await svc.handleWebhook({ type: 'video.error', cfUid: 'cf-1' });

    expect(mockedQ.setPostVideoStatus).toHaveBeenCalledTimes(3);
    expect(mockedQ.setPostVideoStatus).toHaveBeenNthCalledWith(3, {
      postId: 'p1',
      from: 'captions',
      to: 'failed',
      lastError: 'cf reported error',
    });
  });

  it('exhausts all in-flight statuses without throwing when none match', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ post_id: 'p1' }], rowCount: 1 });
    mockedQ.setPostVideoStatus.mockResolvedValue(false);
    const { svc } = makeBed();

    await svc.handleWebhook({ type: 'video.error', cfUid: 'cf-1' });

    expect(mockedQ.setPostVideoStatus).toHaveBeenCalledTimes(4);
  });

  it('is a no-op when the row is missing', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const { svc } = makeBed();

    await svc.handleWebhook({ type: 'video.error', cfUid: 'orphan' });

    expect(mockedQ.setPostVideoStatus).not.toHaveBeenCalled();
  });
});

describe('VideoPipelineService.handleWebhook — unknown event', () => {
  it('logs at warn and no-ops', async () => {
    const { svc, logger } = makeBed();

    await svc.handleWebhook({ type: 'gibberish' } as unknown as Parameters<
      VideoPipelineService['handleWebhook']
    >[0]);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'video.pipeline.unknown-event' }),
      expect.any(String),
    );
    expect(mockedQ.setPostVideoStatus).not.toHaveBeenCalled();
  });
});

describe('VideoPipelineService audit-log emissions (3.6)', () => {
  it('emits video.uploaded after uploading → processing CAS succeeds', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ post_id: 'p1' }], rowCount: 1 });
    mockedQ.setPostVideoStatus.mockResolvedValue(true);
    const { svc, logger } = makeBed();

    await svc.handleWebhook({
      type: 'video.ready',
      cfUid: 'cf-1',
      sizeBytes: 123,
      durationSec: 4,
    });
    await flushDeferred();

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'video.uploaded',
        postId: 'p1',
        cfUid: 'cf-1',
        sizeBytes: 123,
        durationSec: 4,
      }),
      expect.any(String),
    );
  });

  it('emits video.ai-extract with outcome=success and timing on success', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ post_id: 'p1' }], rowCount: 1 });
    mockedQ.setPostVideoStatus.mockResolvedValue(true);
    mockedQ.getPostVideo.mockResolvedValueOnce({
      postId: 'p1',
      cfUid: 'cf-1',
      pendingCfUid: null,
      status: 'suggesting',
      transcript: 't',
    });
    const cf = makeFakeCf();
    cf.fetchCaptionsWebVTT.mockResolvedValueOnce('WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nbody\n');
    mockedQ.insertAiRun.mockResolvedValueOnce({ id: 'r' });
    const extract = vi.fn().mockResolvedValueOnce({ title: 't', description: 'd', tags: ['z'] });
    const { svc, logger } = makeBed({ cf, extract });

    await svc.handleWebhook({ type: 'captions.ready', cfUid: 'cf-1' });
    await flushDeferred();

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'video.ai-extract',
        postId: 'p1',
        model: 'mock-model',
        promptVersion: 'v1',
        transcriptChars: 4,
        wasTruncated: false,
        elapsedMs: expect.any(Number),
        retryCount: 0,
        outcome: 'success',
      }),
      expect.any(String),
    );
  });

  it('emits video.ai-extract with outcome=failure on failure', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ post_id: 'p1' }], rowCount: 1 });
    mockedQ.setPostVideoStatus.mockResolvedValue(true);
    const cf = makeFakeCf();
    cf.fetchCaptionsWebVTT.mockResolvedValueOnce('WEBVTT\n');
    const extract = vi.fn().mockRejectedValueOnce(new Error('boom'));
    const { svc, logger } = makeBed({ cf, extract });

    await svc.handleWebhook({ type: 'captions.ready', cfUid: 'cf-1' });
    await flushDeferred();

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'video.ai-extract',
        outcome: 'failure',
        retryCount: 0,
        elapsedMs: expect.any(Number),
      }),
      expect.any(String),
    );
  });

  it('truncates transcript at maxTranscriptChars and records wasTruncated=true', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ post_id: 'p1' }], rowCount: 1 });
    mockedQ.setPostVideoStatus.mockResolvedValue(true);
    mockedQ.getPostVideo.mockResolvedValueOnce({
      postId: 'p1',
      cfUid: 'cf-1',
      pendingCfUid: null,
      status: 'suggesting',
      transcript: 'long',
    });
    const cf = makeFakeCf();
    // 100-char single-cue VTT body — service is configured with maxTranscriptChars: 60
    const longBody = 'a'.repeat(100);
    cf.fetchCaptionsWebVTT.mockResolvedValueOnce(
      `WEBVTT\n\n00:00:00.000 --> 00:00:01.000\n${longBody}\n`,
    );
    mockedQ.insertAiRun.mockResolvedValueOnce({ id: 'r' });
    const extract = vi.fn().mockResolvedValueOnce({ title: 't', description: 'd', tags: ['z'] });
    const { svc, logger } = makeBed({ cf, extract });

    await svc.handleWebhook({ type: 'captions.ready', cfUid: 'cf-1' });
    await flushDeferred();

    expect(mockedQ.insertAiRun).toHaveBeenCalledWith(
      expect.objectContaining({ wasTruncated: true }),
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'video.ai-extract', wasTruncated: true }),
      expect.any(String),
    );
  });
});
