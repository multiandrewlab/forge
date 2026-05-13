// Unit tests for VideoPipelineService.flipVisibility — the
// CF ↔ DB consistency SAGA per spec §8.4 (issue #102, plan Sub-WU3b — 3.5).

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

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

import { withTransaction } from '../../db/connection.js';
import * as q from '../../db/queries/video.js';
import { VideoPipelineService } from '../../services/video-pipeline.js';
import type { ICloudflareStreamService } from '../../services/cloudflare-stream.js';

const mockedQ = q as unknown as Record<string, Mock>;
const mockWithTransaction = withTransaction as Mock;

function makeFakeCf(): ICloudflareStreamService & Record<string, Mock> {
  return {
    customerSubdomain: 'mock-subdomain',
    requestUploadUrl: vi.fn(),
    getVideoStatus: vi.fn(),
    requestCaptions: vi.fn().mockResolvedValue(undefined),
    fetchCaptionsWebVTT: vi.fn(),
    setRequireSignedUrls: vi.fn().mockResolvedValue(undefined),
    mintPlaybackToken: vi.fn().mockResolvedValue('tok_mock'),
    purgeCache: vi.fn().mockResolvedValue(undefined),
    deleteAsset: vi.fn().mockResolvedValue(undefined),
  } as unknown as ICloudflareStreamService & Record<string, Mock>;
}

function makeSvc(cf: ICloudflareStreamService) {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const svc = new VideoPipelineService({
    cloudflareStream: cf,
    runExtractVideoMetadata: vi.fn(),
    logger,
    maxTranscriptChars: 60,
    promptVersion: 'v1',
    model: 'mock-model',
  });
  return { svc, logger };
}

// Default: withTransaction immediately invokes the fn with a minimal fake
// client. Individual tests override the implementation to inject failures.
function defaultWithTransaction() {
  mockWithTransaction.mockImplementation(
    async (fn: (client: { query: Mock }) => Promise<unknown>) => {
      const client = { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 1 }) };
      return fn(client);
    },
  );
}

beforeEach(() => {
  for (const m of Object.values(mockedQ)) m.mockReset();
  mockWithTransaction.mockReset();
  defaultWithTransaction();
});

describe('flipVisibility — public → private (CF first, then DB)', () => {
  it('happy path: CF setRequireSignedUrls(true) → DB tx → purgeCache, ordered, and audit-logged', async () => {
    const cf = makeFakeCf();
    const { svc, logger } = makeSvc(cf);

    await svc.flipVisibility({ postId: 'p1', from: 'public', to: 'private', cfUid: 'cf-1' });

    expect(cf.setRequireSignedUrls).toHaveBeenCalledWith('cf-1', true);
    expect(mockWithTransaction).toHaveBeenCalled();
    expect(cf.purgeCache).toHaveBeenCalledWith('cf-1');
    // Order: setRequireSignedUrls before purgeCache
    const signedUrlOrder = cf.setRequireSignedUrls.mock.invocationCallOrder[0] as number;
    const purgeOrder = cf.purgeCache.mock.invocationCallOrder[0] as number;
    expect(signedUrlOrder < purgeOrder).toBe(true);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'video.visibility.flipped',
        postId: 'p1',
        from: 'public',
        to: 'private',
      }),
      expect.any(String),
    );
  });

  it('inside the DB transaction: UPDATE posts.visibility AND UPDATE post_videos.playback_requires_signed_url', async () => {
    const cf = makeFakeCf();
    const calls: string[] = [];
    const fakeClient = {
      query: vi.fn(async (sql: string) => {
        calls.push(sql);
        return { rows: [], rowCount: 1 };
      }),
    };
    mockWithTransaction.mockImplementation(async (fn: (c: typeof fakeClient) => Promise<unknown>) =>
      fn(fakeClient),
    );
    const { svc } = makeSvc(cf);

    await svc.flipVisibility({ postId: 'p1', from: 'public', to: 'private', cfUid: 'cf-1' });

    expect(calls.some((s) => /UPDATE posts.*visibility/i.test(s))).toBe(true);
    expect(calls.some((s) => /UPDATE post_videos.*playback_requires_signed_url/i.test(s))).toBe(
      true,
    );
  });

  it('CF first-call fails → throws VIDEO_VISIBILITY_FLIP_FAILED with cause, no DB tx, no purge', async () => {
    const cf = makeFakeCf();
    cf.setRequireSignedUrls.mockRejectedValueOnce(new Error('cf 502'));
    const { svc } = makeSvc(cf);

    await expect(
      svc.flipVisibility({ postId: 'p1', from: 'public', to: 'private', cfUid: 'cf-1' }),
    ).rejects.toThrow(/VIDEO_VISIBILITY_FLIP_FAILED.*cf 502/);
    expect(mockWithTransaction).not.toHaveBeenCalled();
    expect(cf.purgeCache).not.toHaveBeenCalled();
  });

  it('CF ok, DB fails → compensating setRequireSignedUrls(false) is called', async () => {
    const cf = makeFakeCf();
    mockWithTransaction.mockRejectedValueOnce(new Error('pg explode'));
    const { svc } = makeSvc(cf);

    await expect(
      svc.flipVisibility({ postId: 'p1', from: 'public', to: 'private', cfUid: 'cf-1' }),
    ).rejects.toThrow();
    expect(cf.setRequireSignedUrls).toHaveBeenNthCalledWith(1, 'cf-1', true);
    expect(cf.setRequireSignedUrls).toHaveBeenNthCalledWith(2, 'cf-1', false);
  });

  it('CF ok, DB fails, compensating CF also fails → stamps last_error AND emits video.visibility.drift-detected audit log', async () => {
    const cf = makeFakeCf();
    cf.setRequireSignedUrls
      .mockResolvedValueOnce(undefined) // initial flip succeeds
      .mockRejectedValueOnce(new Error('cf 503')); // compensating fails
    mockWithTransaction.mockRejectedValueOnce(new Error('pg explode'));
    const { svc, logger } = makeSvc(cf);

    await expect(
      svc.flipVisibility({ postId: 'p1', from: 'public', to: 'private', cfUid: 'cf-1' }),
    ).rejects.toThrow();

    expect(mockedQ.setPostVideoLastError).toHaveBeenCalledWith({
      postId: 'p1',
      lastError: 'visibility-flip-drift',
    });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'video.visibility.drift-detected',
        postId: 'p1',
      }),
      expect.any(String),
    );
  });

  it('public→private compensating-CF-failed branch: setPostVideoLastError throw is contained (warn-logged, original error still surfaces)', async () => {
    const cf = makeFakeCf();
    cf.setRequireSignedUrls
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('cf 503'));
    mockWithTransaction.mockRejectedValueOnce(new Error('pg explode'));
    mockedQ.setPostVideoLastError.mockRejectedValueOnce(new Error('last_error write failed'));
    const { svc, logger } = makeSvc(cf);

    await expect(
      svc.flipVisibility({ postId: 'p1', from: 'public', to: 'private', cfUid: 'cf-1' }),
    ).rejects.toThrow(/VIDEO_VISIBILITY_FLIP_FAILED.*pg explode/);
    expect(mockedQ.setPostVideoLastError).toHaveBeenCalled();
    // Drift-detected log still emitted; the helper failure is logged in addition.
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'video.visibility.drift-detected', postId: 'p1' }),
      expect.any(String),
    );
  });

  it('purgeCache after-flip failure does NOT throw or trigger compensating CF (DB already committed)', async () => {
    const cf = makeFakeCf();
    cf.purgeCache.mockRejectedValueOnce(new Error('purge 500'));
    const { svc, logger } = makeSvc(cf);

    await svc.flipVisibility({ postId: 'p1', from: 'public', to: 'private', cfUid: 'cf-1' });

    // setRequireSignedUrls called exactly once (no compensating call)
    expect(cf.setRequireSignedUrls).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'video.visibility.purge-failed', postId: 'p1' }),
      expect.any(String),
    );
  });
});

describe('flipVisibility — private → public (DB first, then CF)', () => {
  it('happy path: DB tx first, then CF setRequireSignedUrls(false), audit-logged', async () => {
    const cf = makeFakeCf();
    const { svc, logger } = makeSvc(cf);

    await svc.flipVisibility({ postId: 'p1', from: 'private', to: 'public', cfUid: 'cf-1' });

    expect(mockWithTransaction).toHaveBeenCalled();
    expect(cf.setRequireSignedUrls).toHaveBeenCalledWith('cf-1', false);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'video.visibility.flipped',
        postId: 'p1',
        from: 'private',
        to: 'public',
      }),
      expect.any(String),
    );
  });

  it('DB tx UPDATES posts.visibility AND post_videos.playback_requires_signed_url', async () => {
    const cf = makeFakeCf();
    const calls: string[] = [];
    const fakeClient = {
      query: vi.fn(async (sql: string) => {
        calls.push(sql);
        return { rows: [], rowCount: 1 };
      }),
    };
    mockWithTransaction.mockImplementation(async (fn: (c: typeof fakeClient) => Promise<unknown>) =>
      fn(fakeClient),
    );
    const { svc } = makeSvc(cf);

    await svc.flipVisibility({ postId: 'p1', from: 'private', to: 'public', cfUid: 'cf-1' });

    expect(calls.some((s) => /UPDATE posts.*visibility/i.test(s))).toBe(true);
    expect(calls.some((s) => /UPDATE post_videos.*playback_requires_signed_url/i.test(s))).toBe(
      true,
    );
  });

  it('DB fails → throws VIDEO_VISIBILITY_FLIP_FAILED, CF never called', async () => {
    const cf = makeFakeCf();
    mockWithTransaction.mockRejectedValueOnce(new Error('pg explode'));
    const { svc } = makeSvc(cf);

    await expect(
      svc.flipVisibility({ postId: 'p1', from: 'private', to: 'public', cfUid: 'cf-1' }),
    ).rejects.toThrow(/VIDEO_VISIBILITY_FLIP_FAILED.*pg explode/);
    expect(cf.setRequireSignedUrls).not.toHaveBeenCalled();
  });

  it('DB ok, CF fails → compensating DB revert is run', async () => {
    const cf = makeFakeCf();
    cf.setRequireSignedUrls.mockRejectedValueOnce(new Error('cf 502'));
    const { svc } = makeSvc(cf);

    await expect(
      svc.flipVisibility({ postId: 'p1', from: 'private', to: 'public', cfUid: 'cf-1' }),
    ).rejects.toThrow();
    // Two withTransaction calls: original commit + compensating revert
    expect(mockWithTransaction).toHaveBeenCalledTimes(2);
  });

  it('DB ok, CF fails, compensating DB also fails → stamps last_error AND drift-detected audit log', async () => {
    const cf = makeFakeCf();
    cf.setRequireSignedUrls.mockRejectedValueOnce(new Error('cf 502'));
    // First withTransaction succeeds (initial commit), second one (compensating) fails
    mockWithTransaction
      .mockImplementationOnce(async (fn: (c: { query: Mock }) => Promise<unknown>) =>
        fn({ query: vi.fn().mockResolvedValue({ rows: [], rowCount: 1 }) }),
      )
      .mockRejectedValueOnce(new Error('pg revert failed'));
    const { svc, logger } = makeSvc(cf);

    await expect(
      svc.flipVisibility({ postId: 'p1', from: 'private', to: 'public', cfUid: 'cf-1' }),
    ).rejects.toThrow();

    expect(mockedQ.setPostVideoLastError).toHaveBeenCalledWith({
      postId: 'p1',
      lastError: 'visibility-flip-drift',
    });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'video.visibility.drift-detected',
        postId: 'p1',
      }),
      expect.any(String),
    );
  });

  it('private→public compensating-DB-failed branch: setPostVideoLastError throw is contained (warn-logged, original error still surfaces)', async () => {
    const cf = makeFakeCf();
    cf.setRequireSignedUrls.mockRejectedValueOnce(new Error('cf 502'));
    mockWithTransaction
      .mockImplementationOnce(async (fn: (c: { query: Mock }) => Promise<unknown>) =>
        fn({ query: vi.fn().mockResolvedValue({ rows: [], rowCount: 1 }) }),
      )
      .mockRejectedValueOnce(new Error('pg revert failed'));
    mockedQ.setPostVideoLastError.mockRejectedValueOnce(new Error('last_error write failed'));
    const { svc, logger } = makeSvc(cf);

    await expect(
      svc.flipVisibility({ postId: 'p1', from: 'private', to: 'public', cfUid: 'cf-1' }),
    ).rejects.toThrow(/VIDEO_VISIBILITY_FLIP_FAILED.*cf 502/);
    expect(mockedQ.setPostVideoLastError).toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'video.visibility.drift-detected', postId: 'p1' }),
      expect.any(String),
    );
  });
});

describe('flipVisibility — guard rails', () => {
  it('no-op when from === to (no CF, no DB writes, no log)', async () => {
    const cf = makeFakeCf();
    const { svc, logger } = makeSvc(cf);

    await svc.flipVisibility({ postId: 'p1', from: 'public', to: 'public', cfUid: 'cf-1' });

    expect(cf.setRequireSignedUrls).not.toHaveBeenCalled();
    expect(mockWithTransaction).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();
  });
});
