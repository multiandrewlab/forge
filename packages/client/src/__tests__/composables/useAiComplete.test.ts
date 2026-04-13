import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function sseStreamOf(frames: string[]): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(ctrl) {
      for (const f of frames) ctrl.enqueue(enc.encode(f));
      ctrl.close();
    },
  });
  return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
}

import { useAiComplete } from '../../composables/useAiComplete.js';

describe('useAiComplete', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockFetch.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with null suggestion, not loading', () => {
    const c = useAiComplete();
    expect(c.suggestion.value).toBeNull();
    expect(c.isLoading.value).toBe(false);
  });

  it('debounces requestCompletion by 300ms', async () => {
    mockFetch.mockResolvedValue(sseStreamOf(['event: done\ndata: {}\n\n']));
    const c = useAiComplete();
    c.requestCompletion({ before: 'x', after: 'y', language: 'js' });
    expect(mockFetch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(299);
    expect(mockFetch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('accumulates token events into suggestion', async () => {
    mockFetch.mockResolvedValue(
      sseStreamOf([
        'event: token\ndata: {"text":"hel"}\n\n',
        'event: token\ndata: {"text":"lo"}\n\n',
        'event: done\ndata: {}\n\n',
      ]),
    );
    const c = useAiComplete();
    c.requestCompletion({ before: '', after: '', language: 'js' });
    await vi.advanceTimersByTimeAsync(300);
    await Promise.resolve();
    await Promise.resolve();
    // Wait for streaming to drain
    await vi.runAllTimersAsync();
    expect(c.suggestion.value).toBe('hello');
    expect(c.isLoading.value).toBe(false);
  });

  it('acceptSuggestion returns text and clears', async () => {
    mockFetch.mockResolvedValue(
      sseStreamOf(['event: token\ndata: {"text":"42"}\n\n', 'event: done\ndata: {}\n\n']),
    );
    const c = useAiComplete();
    c.requestCompletion({ before: '', after: '', language: 'js' });
    await vi.advanceTimersByTimeAsync(300);
    await vi.runAllTimersAsync();
    const accepted = c.acceptSuggestion();
    expect(accepted).toBe('42');
    expect(c.suggestion.value).toBeNull();
  });

  it('dismissSuggestion clears suggestion and calls abort', async () => {
    const abortSpy = vi.fn();
    mockFetch.mockImplementation((_url: string, init: RequestInit) => {
      (init.signal as AbortSignal).addEventListener('abort', abortSpy);
      // Return a stream that never closes so the controller stays alive
      const body = new ReadableStream<Uint8Array>({
        start() {
          /* hang */
        },
      });
      return Promise.resolve(
        new Response(body, { headers: { 'content-type': 'text/event-stream' } }),
      );
    });
    const c = useAiComplete();
    c.requestCompletion({ before: '', after: '', language: 'js' });
    await vi.advanceTimersByTimeAsync(300);
    // Allow the fetch promise to resolve
    await Promise.resolve();
    c.dismissSuggestion();
    expect(c.suggestion.value).toBeNull();
    expect(abortSpy).toHaveBeenCalled();
  });

  it('new requestCompletion cancels in-flight request', async () => {
    const abortSpies: ReturnType<typeof vi.fn>[] = [];
    mockFetch.mockImplementation((_url: string, init: RequestInit) => {
      const spy = vi.fn();
      abortSpies.push(spy);
      (init.signal as AbortSignal).addEventListener('abort', spy);
      // Return a stream that never closes so the controller stays alive
      const body = new ReadableStream<Uint8Array>({
        start() {
          /* hang */
        },
      });
      return Promise.resolve(
        new Response(body, { headers: { 'content-type': 'text/event-stream' } }),
      );
    });
    const c = useAiComplete();
    c.requestCompletion({ before: 'a', after: '', language: 'js' });
    await vi.advanceTimersByTimeAsync(300);
    // Allow the fetch promise to resolve
    await Promise.resolve();
    c.requestCompletion({ before: 'b', after: '', language: 'js' });
    await vi.advanceTimersByTimeAsync(300);
    expect(abortSpies[0]).toHaveBeenCalled();
  });

  it('handles error events by clearing suggestion', async () => {
    mockFetch.mockResolvedValue(sseStreamOf(['event: error\ndata: {"message":"boom"}\n\n']));
    const c = useAiComplete();
    c.requestCompletion({ before: '', after: '', language: 'js' });
    await vi.advanceTimersByTimeAsync(300);
    await vi.runAllTimersAsync();
    expect(c.suggestion.value).toBeNull();
    expect(c.isLoading.value).toBe(false);
  });

  it('handles network fetch rejection', async () => {
    mockFetch.mockRejectedValue(new Error('network fail'));
    const c = useAiComplete();
    c.requestCompletion({ before: '', after: '', language: 'js' });
    await vi.advanceTimersByTimeAsync(300);
    await vi.runAllTimersAsync();
    expect(c.suggestion.value).toBeNull();
    expect(c.isLoading.value).toBe(false);
  });

  it('cancel() clears a pending debounce timer before it fires', async () => {
    mockFetch.mockResolvedValue(sseStreamOf(['event: done\ndata: {}\n\n']));
    const c = useAiComplete();
    c.requestCompletion({ before: 'x', after: '', language: 'js' });
    // Debounce is scheduled but not yet fired — cancel() must hit the
    // clearTimeout branch.
    c.cancel();
    // Advance past the original debounce window; fetch should NEVER be called.
    await vi.advanceTimersByTimeAsync(500);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('cancel() is a no-op when nothing is pending', () => {
    const c = useAiComplete();
    // No debounce scheduled, no controller in flight — both guards skipped.
    c.cancel();
    expect(c.isLoading.value).toBe(false);
    expect(c.suggestion.value).toBeNull();
  });

  it('handles a non-ok fetch response by clearing suggestion', async () => {
    mockFetch.mockResolvedValue(
      new Response('', { status: 500, headers: { 'content-type': 'text/plain' } }),
    );
    const c = useAiComplete();
    c.requestCompletion({ before: '', after: '', language: 'js' });
    await vi.advanceTimersByTimeAsync(300);
    await vi.runAllTimersAsync();
    expect(c.suggestion.value).toBeNull();
    expect(c.isLoading.value).toBe(false);
  });
});
