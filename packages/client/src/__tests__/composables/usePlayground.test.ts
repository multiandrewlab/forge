import { describe, it, expect, beforeEach, vi } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Mock apiFetch – must come before importing the composable          */
/* ------------------------------------------------------------------ */
const mockApiFetch = vi.fn();
vi.mock('../../lib/api.js', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args) as unknown,
}));

/* ------------------------------------------------------------------ */
/*  SSE test helpers (same pattern as useAiGenerate tests)             */
/* ------------------------------------------------------------------ */
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

import { usePlayground } from '../../composables/usePlayground.js';

describe('usePlayground', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  /* ================================================================ */
  /*  fetchVariables                                                   */
  /* ================================================================ */
  describe('fetchVariables', () => {
    it('populates variables ref on success', async () => {
      const vars = [
        {
          id: '1',
          postId: 'p1',
          name: 'lang',
          placeholder: null,
          defaultValue: 'ts',
          sortOrder: 0,
        },
      ];
      mockApiFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ variables: vars }),
      } as unknown as Response);

      const { fetchVariables, variables } = usePlayground();
      await fetchVariables('p1');

      expect(mockApiFetch).toHaveBeenCalledWith('/api/posts/p1/variables');
      expect(variables.value).toEqual(vars);
    });

    it('sets error on non-ok response', async () => {
      mockApiFetch.mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({}),
      } as unknown as Response);

      const { fetchVariables, error } = usePlayground();
      await fetchVariables('p1');

      expect(error.value).toBe('Failed to load variables');
    });

    it('sets error when fetch rejects', async () => {
      mockApiFetch.mockRejectedValue(new Error('network down'));

      const { fetchVariables, error } = usePlayground();
      await fetchVariables('p1');

      expect(error.value).toBe('network down');
    });

    it('sets fallback error when fetch rejects with non-Error', async () => {
      mockApiFetch.mockRejectedValue('string rejection');

      const { fetchVariables, error } = usePlayground();
      await fetchVariables('p1');

      expect(error.value).toBe('Failed to load variables');
    });

    it('clears previous error on new call', async () => {
      // First call fails
      mockApiFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({}),
      } as unknown as Response);

      const { fetchVariables, error } = usePlayground();
      await fetchVariables('p1');
      expect(error.value).toBe('Failed to load variables');

      // Second call succeeds — error should be cleared
      mockApiFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ variables: [] }),
      } as unknown as Response);
      await fetchVariables('p1');
      expect(error.value).toBeNull();
    });
  });

  /* ================================================================ */
  /*  run                                                              */
  /* ================================================================ */
  describe('run', () => {
    it('streams tokens into output ref', async () => {
      mockApiFetch.mockResolvedValue(
        sseStreamOf([
          'event: token\ndata: {"text":"hel"}\n\n',
          'event: token\ndata: {"text":"lo"}\n\n',
          'event: done\ndata: {}\n\n',
        ]),
      );

      const { run, output } = usePlayground();
      await run('p1', { lang: 'ts' });

      expect(output.value).toBe('hello');
    });

    it('calls apiFetch with correct POST payload', async () => {
      mockApiFetch.mockResolvedValue(sseStreamOf(['event: done\ndata: {}\n\n']));

      const { run } = usePlayground();
      await run('p1', { lang: 'ts' });

      expect(mockApiFetch).toHaveBeenCalledWith('/api/playground/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId: 'p1', variables: { lang: 'ts' } }),
        signal: expect.any(AbortSignal),
      });
    });

    it('sets isRunning true during streaming, false after', async () => {
      mockApiFetch.mockResolvedValue(sseStreamOf(['event: done\ndata: {}\n\n']));

      const { run, isRunning } = usePlayground();
      expect(isRunning.value).toBe(false);

      const promise = run('p1', {});
      // isRunning should be true synchronously after calling run
      expect(isRunning.value).toBe(true);

      await promise;
      expect(isRunning.value).toBe(false);
    });

    it('handles SSE error events by setting error ref', async () => {
      mockApiFetch.mockResolvedValue(
        sseStreamOf(['event: error\ndata: {"message":"model overloaded"}\n\n']),
      );

      const { run, error } = usePlayground();
      await run('p1', {});

      expect(error.value).toBe('model overloaded');
    });

    it('uses fallback message when SSE error has no message field', async () => {
      mockApiFetch.mockResolvedValue(sseStreamOf(['event: error\ndata: {"code":500}\n\n']));

      const { run, error } = usePlayground();
      await run('p1', {});

      expect(error.value).toBe('Generation failed');
    });

    it('sets error on non-ok response', async () => {
      mockApiFetch.mockResolvedValue(new Response('Internal Server Error', { status: 500 }));

      const { run, error, isRunning } = usePlayground();
      await run('p1', {});

      expect(error.value).toBe('Request failed');
      expect(isRunning.value).toBe(false);
    });

    it('sets error on response with no body', async () => {
      mockApiFetch.mockResolvedValue({
        ok: true,
        body: null,
      } as unknown as Response);

      const { run, error } = usePlayground();
      await run('p1', {});

      expect(error.value).toBe('Request failed');
    });

    it('clears output on each new run', async () => {
      // First run produces output
      mockApiFetch.mockResolvedValueOnce(
        sseStreamOf(['event: token\ndata: {"text":"first"}\n\n', 'event: done\ndata: {}\n\n']),
      );

      const { run, output } = usePlayground();
      await run('p1', {});
      expect(output.value).toBe('first');

      // Second run should clear previous output
      mockApiFetch.mockResolvedValueOnce(
        sseStreamOf(['event: token\ndata: {"text":"second"}\n\n', 'event: done\ndata: {}\n\n']),
      );
      await run('p1', {});
      expect(output.value).toBe('second');
    });

    it('sets error on network failure', async () => {
      mockApiFetch.mockRejectedValue(new Error('network fail'));

      const { run, error, isRunning } = usePlayground();
      await run('p1', {});

      expect(error.value).toBe('network fail');
      expect(isRunning.value).toBe(false);
    });

    it('sets fallback error when catch receives non-Error', async () => {
      mockApiFetch.mockRejectedValue('string rejection');

      const { run, error, isRunning } = usePlayground();
      await run('p1', {});

      expect(error.value).toBe('Generation failed');
      expect(isRunning.value).toBe(false);
    });
  });

  /* ================================================================ */
  /*  stop                                                             */
  /* ================================================================ */
  describe('stop', () => {
    it('aborts in-flight request via AbortController', async () => {
      let capturedSignal: AbortSignal | undefined;
      mockApiFetch.mockImplementation((_url: string, init: RequestInit) => {
        capturedSignal = init.signal as AbortSignal;
        return Promise.resolve(abortAwareHangingResponse(capturedSignal));
      });

      const { run, stop, isRunning } = usePlayground();
      const promise = run('p1', {});
      // Let fetch resolve so the stream loop begins
      await Promise.resolve();
      await Promise.resolve();

      stop();
      expect(capturedSignal?.aborted).toBe(true);

      // The run promise should resolve (AbortError is swallowed)
      await promise;
      expect(isRunning.value).toBe(false);
    });

    it('is a no-op when nothing is in flight', () => {
      const { stop } = usePlayground();
      expect(() => stop()).not.toThrow();
    });

    it('calling run while running cancels the previous request', async () => {
      const signals: AbortSignal[] = [];
      mockApiFetch.mockImplementation((_url: string, init: RequestInit) => {
        const signal = init.signal as AbortSignal;
        signals.push(signal);
        return Promise.resolve(abortAwareHangingResponse(signal));
      });

      const { run, stop } = usePlayground();
      // Start first request (do not await — it hangs until aborted)
      const p1 = run('p1', {});
      await Promise.resolve();
      await Promise.resolve();

      // Start second request — should abort the first
      void run('p1', {});
      await Promise.resolve();
      await Promise.resolve();

      // First controller was aborted by the second run() call
      expect(signals[0]?.aborted).toBe(true);
      // Second controller is still active
      expect(signals[1]?.aborted).toBe(false);
      // First promise should have settled (AbortError swallowed)
      await p1;
      // Cleanup
      stop();
    });
  });
});
