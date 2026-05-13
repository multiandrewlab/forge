import { describe, it, expect, vi } from 'vitest';
import { MockCloudflareStreamService } from '../../services/cloudflare-stream.js';

function makeMock(): MockCloudflareStreamService {
  return new MockCloudflareStreamService();
}

describe('MockCloudflareStreamService', () => {
  it('requestUploadUrl returns deterministic uploadUrl + cfUid prefix', async () => {
    const r = await makeMock().requestUploadUrl({
      maxDurationSeconds: 1,
      maxSizeBytes: 1,
      requireSignedURLs: false,
    });
    expect(r.cfUid).toMatch(/^cf_mock_\d+$/);
    expect(r.uploadUrl).toMatch(/^https:\/\/mock\.cf\.local/);
  });

  it('counter advances across calls so each upload gets a unique cfUid', async () => {
    const m = makeMock();
    const a = await m.requestUploadUrl({
      maxDurationSeconds: 1,
      maxSizeBytes: 1,
      requireSignedURLs: false,
    });
    const b = await m.requestUploadUrl({
      maxDurationSeconds: 1,
      maxSizeBytes: 1,
      requireSignedURLs: false,
    });
    expect(a.cfUid).not.toBe(b.cfUid);
  });

  it('getVideoStatus returns null for unknown cfUid', async () => {
    expect(await makeMock().getVideoStatus('nope')).toBeNull();
  });

  it('getVideoStatus returns ready=true with stored values for known cfUid', async () => {
    const m = makeMock();
    const { cfUid } = await m.requestUploadUrl({
      maxDurationSeconds: 42,
      maxSizeBytes: 9999,
      requireSignedURLs: true,
    });
    const status = await m.getVideoStatus(cfUid);
    expect(status).toEqual({
      readyToStream: true,
      state: 'ready',
      durationSec: 42,
      sizeBytes: 9999,
      requireSignedURLs: true,
    });
  });

  it('requestCaptions is a no-op (does not throw)', async () => {
    await expect(makeMock().requestCaptions('any')).resolves.toBeUndefined();
  });

  it('simulateLifecycle dispatches video.ready then captions.ready', async () => {
    const mock = makeMock();
    const { cfUid } = await mock.requestUploadUrl({
      maxDurationSeconds: 1,
      maxSizeBytes: 1,
      requireSignedURLs: false,
    });
    const handler = { handleWebhook: vi.fn().mockResolvedValue(undefined) };
    await mock.simulateLifecycle(cfUid, { handler });
    const events = handler.handleWebhook.mock.calls.map((c) => c[0]);
    expect(events).toEqual([
      { type: 'video.ready', cfUid, durationSec: 12, sizeBytes: 1024 },
      { type: 'captions.ready', cfUid },
    ]);
  });

  it('deleteAsset removes the asset and getVideoStatus returns null', async () => {
    const mock = makeMock();
    const { cfUid } = await mock.requestUploadUrl({
      maxDurationSeconds: 1,
      maxSizeBytes: 1,
      requireSignedURLs: false,
    });
    await mock.deleteAsset(cfUid);
    expect(await mock.getVideoStatus(cfUid)).toBeNull();
  });

  it('mintPlaybackToken returns deterministic tok_<cfUid>', async () => {
    const m = makeMock();
    expect(await m.mintPlaybackToken('abc')).toBe('tok_abc');
  });

  it('fetchCaptionsWebVTT returns the bundled fixture content', async () => {
    const m = makeMock();
    const vtt = await m.fetchCaptionsWebVTT(
      'https://customer-xyz.cloudflarestream.com/abc/captions/en',
    );
    expect(vtt).toMatch(/^WEBVTT/);
  });

  it('setRequireSignedUrls updates getVideoStatus', async () => {
    const m = makeMock();
    const { cfUid } = await m.requestUploadUrl({
      maxDurationSeconds: 1,
      maxSizeBytes: 1,
      requireSignedURLs: false,
    });
    await m.setRequireSignedUrls(cfUid, true);
    const status = await m.getVideoStatus(cfUid);
    expect(status?.requireSignedURLs).toBe(true);
  });

  it('setRequireSignedUrls on unknown cfUid is a no-op', async () => {
    const m = makeMock();
    await expect(m.setRequireSignedUrls('missing', true)).resolves.toBeUndefined();
  });

  it('purgeCache records the cfUid in purgeCalls', async () => {
    const m = makeMock();
    await m.purgeCache('any');
    await m.purgeCache('another');
    expect(m.purgeCalls).toEqual(['any', 'another']);
  });
});
