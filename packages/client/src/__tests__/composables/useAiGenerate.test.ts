import { describe, it, expect, beforeEach, vi } from 'vitest';

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

/**
 * Creates a Response whose body stream hangs until the given AbortSignal fires,
 * at which point the stream errors with an AbortError (mimicking real browser behavior).
 */
function abortAwareHangingResponse(signal: AbortSignal): Response {
  const body = new ReadableStream<Uint8Array>({
    start(ctrl) {
      signal.addEventListener('abort', () => {
        ctrl.error(new DOMException('The operation was aborted.', 'AbortError'));
      });
    },
  });
  return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
}

import { useAiGenerate } from '../../composables/useAiGenerate.js';

describe('useAiGenerate', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  // (a) start streams tokens to onToken in order
  it('start streams tokens to onToken in order', async () => {
    mockFetch.mockResolvedValue(
      sseStreamOf([
        'event: token\ndata: {"text":"hel"}\n\n',
        'event: token\ndata: {"text":"lo"}\n\n',
        'event: done\ndata: {}\n\n',
      ]),
    );
    const { start } = useAiGenerate();
    const tokens: string[] = [];
    await start({ description: 'write code', contentType: 'snippet' }, (text) => {
      tokens.push(text);
    });
    expect(tokens).toEqual(['hel', 'lo']);
  });

  // (b) stop aborts the in-flight request
  it('stop aborts the in-flight request', async () => {
    let capturedSignal: AbortSignal | undefined;
    mockFetch.mockImplementation((_url: string, init: RequestInit) => {
      capturedSignal = init.signal as AbortSignal;
      return Promise.resolve(abortAwareHangingResponse(capturedSignal));
    });
    const { start, stop, isGenerating } = useAiGenerate();
    const promise = start({ description: 'x', contentType: 'snippet' }, () => {});
    // Let fetch resolve so the stream loop begins
    await Promise.resolve();
    await Promise.resolve();
    stop();
    expect(capturedSignal?.aborted).toBe(true);
    // The start promise should resolve (AbortError is swallowed)
    await promise;
    expect(isGenerating.value).toBe(false);
  });

  // (c) start sets isGenerating true during, false after
  it('start sets isGenerating true during, false after', async () => {
    mockFetch.mockResolvedValue(sseStreamOf(['event: done\ndata: {}\n\n']));
    const { start, isGenerating } = useAiGenerate();
    expect(isGenerating.value).toBe(false);
    const promise = start({ description: 'x', contentType: 'snippet' }, () => {});
    // isGenerating should be true synchronously after calling start
    expect(isGenerating.value).toBe(true);
    await promise;
    expect(isGenerating.value).toBe(false);
  });

  // (d) error event sets error.value to a non-empty string
  it('error event sets error.value to a non-empty string', async () => {
    mockFetch.mockResolvedValue(
      sseStreamOf(['event: error\ndata: {"message":"model overloaded"}\n\n']),
    );
    const { start, error } = useAiGenerate();
    await start({ description: 'x', contentType: 'snippet' }, () => {});
    expect(error.value).toBe('model overloaded');
  });

  // (e) Network error (fetch rejects with non-abort error) sets error.value
  it('network error sets error.value', async () => {
    mockFetch.mockRejectedValue(new Error('network fail'));
    const { start, error, isGenerating } = useAiGenerate();
    await start({ description: 'x', contentType: 'snippet' }, () => {});
    expect(error.value).toBe('network fail');
    expect(isGenerating.value).toBe(false);
  });

  // (f) Calling start while generating cancels the previous request first
  it('calling start while generating cancels the previous request', async () => {
    const signals: AbortSignal[] = [];
    mockFetch.mockImplementation((_url: string, init: RequestInit) => {
      const signal = init.signal as AbortSignal;
      signals.push(signal);
      return Promise.resolve(abortAwareHangingResponse(signal));
    });
    const { start, stop } = useAiGenerate();
    // Start first request (do not await — it hangs until aborted)
    const p1 = start({ description: 'first', contentType: 'snippet' }, () => {});
    // Allow fetch to resolve so the stream loop begins
    await Promise.resolve();
    await Promise.resolve();
    // Start second request — should abort the first
    void start({ description: 'second', contentType: 'snippet' }, () => {});
    await Promise.resolve();
    await Promise.resolve();
    // First controller was aborted by the second start() call
    expect(signals[0]?.aborted).toBe(true);
    // Second controller is still active
    expect(signals[1]?.aborted).toBe(false);
    // First promise should have settled (AbortError swallowed)
    await p1;
    // Cleanup: abort the second hanging request
    stop();
  });

  // (g) stop when nothing in flight is a no-op (does not throw)
  it('stop when nothing in flight is a no-op', () => {
    const { stop } = useAiGenerate();
    expect(() => stop()).not.toThrow();
  });

  // (h) Zero-token stream: emits only event: done
  it('zero-token stream: onToken never called, isGenerating false, error null', async () => {
    mockFetch.mockResolvedValue(sseStreamOf(['event: done\ndata: {}\n\n']));
    const { start, isGenerating, error } = useAiGenerate();
    const tokens: string[] = [];
    await start({ description: 'x', contentType: 'snippet' }, (text) => {
      tokens.push(text);
    });
    expect(tokens).toEqual([]);
    expect(isGenerating.value).toBe(false);
    expect(error.value).toBeNull();
  });

  // Additional: non-ok response sets error
  it('non-ok response sets error.value', async () => {
    mockFetch.mockResolvedValue(new Response('Internal Server Error', { status: 500 }));
    const { start, error, isGenerating } = useAiGenerate();
    await start({ description: 'x', contentType: 'snippet' }, () => {});
    expect(error.value).toBe('Request failed');
    expect(isGenerating.value).toBe(false);
  });

  // Cover fallback error message when error event data has no message string
  it('error event without message field uses fallback', async () => {
    mockFetch.mockResolvedValue(sseStreamOf(['event: error\ndata: {"code":500}\n\n']));
    const { start, error } = useAiGenerate();
    await start({ description: 'x', contentType: 'snippet' }, () => {});
    expect(error.value).toBe('Generation failed');
  });

  // Cover catch branch where thrown value is not an Error instance
  it('non-Error thrown in catch sets fallback error', async () => {
    mockFetch.mockRejectedValue('string rejection');
    const { start, error, isGenerating } = useAiGenerate();
    await start({ description: 'x', contentType: 'snippet' }, () => {});
    expect(error.value).toBe('Generation failed');
    expect(isGenerating.value).toBe(false);
  });
});
