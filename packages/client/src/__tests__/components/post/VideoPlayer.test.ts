import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

// ── Mock apiFetch ──────────────────────────────────────────────────────

const mockApiFetch = vi.fn();
vi.mock('../../../lib/api.js', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args) as unknown,
}));

// ── Mock hls.js ────────────────────────────────────────────────────────
// Track every Hls instance so tests can assert loadSource/attachMedia/destroy
// calls and toggle isSupported() return value.

const hlsInstances: Array<{
  loadSource: ReturnType<typeof vi.fn>;
  attachMedia: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
}> = [];
let hlsIsSupportedReturn = true;

vi.mock('hls.js', () => {
  const Ctor = vi.fn().mockImplementation(() => {
    const instance = {
      loadSource: vi.fn(),
      attachMedia: vi.fn(),
      destroy: vi.fn(),
    };
    hlsInstances.push(instance);
    return instance;
  });
  // hls.js exposes static `isSupported` on the constructor.
  // We return a getter so tests can toggle the value at runtime.
  Object.defineProperty(Ctor, 'isSupported', {
    value: () => hlsIsSupportedReturn,
  });
  return { default: Ctor };
});

import VideoPlayer from '../../../components/post/VideoPlayer.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const PLAYBACK_URL = 'https://customer-x.cloudflarestream.com/abc/manifest/video.m3u8';

describe('VideoPlayer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockApiFetch.mockReset();
    hlsInstances.length = 0;
    hlsIsSupportedReturn = true;
    // Default: non-Safari (canPlayType returns empty string for HLS) so the
    // hls.js code path is exercised by all the legacy tests.
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('');
  });

  afterEach(() => {
    vi.useRealTimers();
    // Restore only the canPlayType spy — using vi.restoreAllMocks() would
    // unwire the hls.js module mock as well.
    (HTMLMediaElement.prototype.canPlayType as { mockRestore?: () => void }).mockRestore?.();
  });

  it('fetches /api/posts/:id/video/playback on mount', async () => {
    mockApiFetch.mockResolvedValue(jsonResponse({ playbackUrl: PLAYBACK_URL }));
    mount(VideoPlayer, { props: { postId: 'p1' } });
    await flushPromises();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/posts/p1/video/playback');
  });

  it('renders a <video> element after the playback URL is fetched', async () => {
    mockApiFetch.mockResolvedValue(jsonResponse({ playbackUrl: PLAYBACK_URL }));
    const w = mount(VideoPlayer, { props: { postId: 'p1' }, attachTo: document.body });
    await flushPromises();
    expect(w.find('video').exists()).toBe(true);
    // In the non-Safari default path the URL is loaded via hls.js (see
    // dedicated playback-path tests). On the Safari path the URL appears as
    // <video src=…>; on the hls.js path it appears in Hls.loadSource(url).
    expect(hlsInstances.length).toBe(1);
    const inst = hlsInstances[0] as (typeof hlsInstances)[number];
    expect(inst.loadSource).toHaveBeenCalledWith(PLAYBACK_URL);
    w.unmount();
  });

  it('shows loading state before fetch resolves', () => {
    mockApiFetch.mockReturnValue(new Promise(() => undefined));
    const w = mount(VideoPlayer, { props: { postId: 'p1' } });
    expect(w.find('[data-testid="video-player-loading"]').exists()).toBe(true);
  });

  it('refreshes URL 5 min before the 1h expiry (refetch at ~55 min)', async () => {
    // Use a factory so each call gets a fresh Response (avoids body-reuse).
    mockApiFetch.mockImplementation(() =>
      Promise.resolve(jsonResponse({ playbackUrl: PLAYBACK_URL })),
    );
    mount(VideoPlayer, { props: { postId: 'p1' } });
    await flushPromises();
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(55 * 60_000);
    await flushPromises();
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
  });

  it('on refresh FAILURE: shows refresh toast and retries with exponential backoff (1s, 2s, 4s, 8s, cap 30s)', async () => {
    // First call (mount) → 200. Refreshes after that → all 503s.
    mockApiFetch
      .mockResolvedValueOnce(jsonResponse({ playbackUrl: PLAYBACK_URL }))
      .mockResolvedValue(new Response(null, { status: 503 }));

    const w = mount(VideoPlayer, { props: { postId: 'p1' } });
    await flushPromises();
    expect(mockApiFetch).toHaveBeenCalledTimes(1);

    // Trigger the scheduled refresh attempt (55 min later).
    await vi.advanceTimersByTimeAsync(55 * 60_000);
    await flushPromises();
    // 1st refresh attempt has fired and failed.
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
    expect(w.find('[data-testid="video-player-refresh-toast"]').exists()).toBe(true);
    expect(w.find('[data-testid="video-player-refresh-toast"]').text()).toMatch(/refresh/i);

    // 1st retry: 1s.
    await vi.advanceTimersByTimeAsync(1_000);
    await flushPromises();
    expect(mockApiFetch).toHaveBeenCalledTimes(3);
    // 2nd retry: 2s.
    await vi.advanceTimersByTimeAsync(2_000);
    await flushPromises();
    expect(mockApiFetch).toHaveBeenCalledTimes(4);
    // 3rd retry: 4s.
    await vi.advanceTimersByTimeAsync(4_000);
    await flushPromises();
    expect(mockApiFetch).toHaveBeenCalledTimes(5);
    // 4th retry: 8s.
    await vi.advanceTimersByTimeAsync(8_000);
    await flushPromises();
    expect(mockApiFetch).toHaveBeenCalledTimes(6);
    // 5th retry: 16s.
    await vi.advanceTimersByTimeAsync(16_000);
    await flushPromises();
    expect(mockApiFetch).toHaveBeenCalledTimes(7);
    // 6th retry: capped at 30s.
    await vi.advanceTimersByTimeAsync(30_000);
    await flushPromises();
    expect(mockApiFetch).toHaveBeenCalledTimes(8);
    // 7th retry: still 30s (cap).
    await vi.advanceTimersByTimeAsync(30_000);
    await flushPromises();
    expect(mockApiFetch).toHaveBeenCalledTimes(9);
  });

  it('clears the refresh toast once a refresh succeeds', async () => {
    mockApiFetch
      .mockResolvedValueOnce(jsonResponse({ playbackUrl: PLAYBACK_URL }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(jsonResponse({ playbackUrl: PLAYBACK_URL }));

    const w = mount(VideoPlayer, { props: { postId: 'p1' } });
    await flushPromises();
    await vi.advanceTimersByTimeAsync(55 * 60_000);
    await flushPromises();
    expect(w.find('[data-testid="video-player-refresh-toast"]').exists()).toBe(true);

    // The retry succeeds 1s later.
    await vi.advanceTimersByTimeAsync(1_000);
    await flushPromises();
    expect(w.find('[data-testid="video-player-refresh-toast"]').exists()).toBe(false);
  });

  it('shows initial-load error state when first fetch fails', async () => {
    mockApiFetch.mockResolvedValue(new Response(null, { status: 500 }));
    const w = mount(VideoPlayer, { props: { postId: 'p1' } });
    await flushPromises();
    expect(w.find('[data-testid="video-player-error"]').exists()).toBe(true);
  });

  it('cancels the scheduled refresh timer on unmount', async () => {
    mockApiFetch.mockImplementation(() =>
      Promise.resolve(jsonResponse({ playbackUrl: PLAYBACK_URL })),
    );
    const w = mount(VideoPlayer, { props: { postId: 'p1' } });
    await flushPromises();
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    w.unmount();
    // After unmount, advancing time must NOT trigger another fetch.
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
  });

  it('cancels the retry timer when unmounted mid-backoff', async () => {
    mockApiFetch
      .mockResolvedValueOnce(jsonResponse({ playbackUrl: PLAYBACK_URL }))
      .mockResolvedValue(new Response(null, { status: 503 }));
    const w = mount(VideoPlayer, { props: { postId: 'p1' } });
    await flushPromises();
    await vi.advanceTimersByTimeAsync(55 * 60_000);
    await flushPromises();
    const callsBeforeUnmount = mockApiFetch.mock.calls.length;
    w.unmount();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mockApiFetch.mock.calls.length).toBe(callsBeforeUnmount);
  });

  // ── Cross-browser HLS playback (#102 WU8 #1) ─────────────────────────

  it('Safari path: when canPlayType("application/vnd.apple.mpegurl") is truthy, sets video.src directly and skips hls.js', async () => {
    // Override the default empty-string mock for this test only.
    (HTMLMediaElement.prototype.canPlayType as ReturnType<typeof vi.fn>)
      .mockReset()
      .mockReturnValue('maybe');
    mockApiFetch.mockResolvedValue(jsonResponse({ playbackUrl: PLAYBACK_URL }));
    const w = mount(VideoPlayer, { props: { postId: 'p1' }, attachTo: document.body });
    await flushPromises();
    const videoEl = w.find('video').element as HTMLVideoElement;
    expect(videoEl.src).toBe(PLAYBACK_URL);
    expect(hlsInstances.length).toBe(0);
    w.unmount();
  });

  it('non-Safari path: when canPlayType returns "" and Hls.isSupported() is true, instantiates Hls and calls loadSource + attachMedia', async () => {
    mockApiFetch.mockResolvedValue(jsonResponse({ playbackUrl: PLAYBACK_URL }));
    const w = mount(VideoPlayer, { props: { postId: 'p1' }, attachTo: document.body });
    await flushPromises();
    expect(hlsInstances.length).toBe(1);
    const inst = hlsInstances[0] as (typeof hlsInstances)[number];
    expect(inst.loadSource).toHaveBeenCalledWith(PLAYBACK_URL);
    expect(inst.attachMedia).toHaveBeenCalledTimes(1);
    const firstAttachCall = inst.attachMedia.mock.calls[0] as [HTMLVideoElement];
    expect(firstAttachCall[0]).toBeInstanceOf(HTMLVideoElement);
    w.unmount();
  });

  it('fallback path: when neither native HLS nor Hls.isSupported() is available, sets video.src directly', async () => {
    hlsIsSupportedReturn = false;
    mockApiFetch.mockResolvedValue(jsonResponse({ playbackUrl: PLAYBACK_URL }));
    const w = mount(VideoPlayer, { props: { postId: 'p1' }, attachTo: document.body });
    await flushPromises();
    const videoEl = w.find('video').element as HTMLVideoElement;
    expect(videoEl.src).toBe(PLAYBACK_URL);
    expect(hlsInstances.length).toBe(0);
    w.unmount();
  });

  it('calls hls.destroy() on unmount to prevent leaks', async () => {
    mockApiFetch.mockResolvedValue(jsonResponse({ playbackUrl: PLAYBACK_URL }));
    const w = mount(VideoPlayer, { props: { postId: 'p1' }, attachTo: document.body });
    await flushPromises();
    expect(hlsInstances.length).toBe(1);
    const inst = hlsInstances[0] as (typeof hlsInstances)[number];
    w.unmount();
    expect(inst.destroy).toHaveBeenCalledTimes(1);
  });

  it('destroys the previous Hls instance and creates a new one on refresh', async () => {
    mockApiFetch.mockImplementation(() =>
      Promise.resolve(jsonResponse({ playbackUrl: PLAYBACK_URL })),
    );
    const w = mount(VideoPlayer, { props: { postId: 'p1' }, attachTo: document.body });
    await flushPromises();
    expect(hlsInstances.length).toBe(1);
    const first = hlsInstances[0] as (typeof hlsInstances)[number];

    // Trigger refresh (55 min later).
    await vi.advanceTimersByTimeAsync(55 * 60_000);
    await flushPromises();
    expect(hlsInstances.length).toBe(2);
    expect(first.destroy).toHaveBeenCalled();
    w.unmount();
  });
});
