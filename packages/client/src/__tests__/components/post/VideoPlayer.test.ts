import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

// ── Mock apiFetch ──────────────────────────────────────────────────────

const mockApiFetch = vi.fn();
vi.mock('../../../lib/api.js', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args) as unknown,
}));

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
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fetches /api/posts/:id/video/playback on mount', async () => {
    mockApiFetch.mockResolvedValue(jsonResponse({ playbackUrl: PLAYBACK_URL }));
    mount(VideoPlayer, { props: { postId: 'p1' } });
    await flushPromises();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/posts/p1/video/playback');
  });

  it('binds the playback URL to the rendered video element', async () => {
    mockApiFetch.mockResolvedValue(jsonResponse({ playbackUrl: PLAYBACK_URL }));
    const w = mount(VideoPlayer, { props: { postId: 'p1' } });
    await flushPromises();
    const html = w.html();
    expect(html).toContain(PLAYBACK_URL);
    expect(w.find('video').exists()).toBe(true);
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
});
