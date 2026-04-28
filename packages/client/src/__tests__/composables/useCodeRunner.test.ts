import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { effectScope, type EffectScope } from 'vue';

/* ------------------------------------------------------------------ */
/*  Mock SandboxManager – vi.hoisted ensures these exist before the   */
/*  hoisted vi.mock factory runs                                       */
/* ------------------------------------------------------------------ */
const { mockExecute, mockAbort } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
  mockAbort: vi.fn(),
}));

vi.mock('../../lib/sandbox/manager.js', () => ({
  SandboxManager: vi.fn().mockImplementation(() => ({
    execute: mockExecute.mockReturnValue({ abort: mockAbort }),
  })),
}));

import { useCodeRunner, createWorker } from '../../composables/useCodeRunner.js';
import type { OutputLine } from '../../composables/useCodeRunner.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Runs useCodeRunner inside an effect scope (simulates component mount). */
function mountComposable() {
  const scope = effectScope();
  let result: ReturnType<typeof useCodeRunner> | undefined;
  scope.run(() => {
    result = useCodeRunner();
  });
  return { result: result as ReturnType<typeof useCodeRunner>, scope };
}

/** Captures the callbacks passed to the most recent mockExecute call. */
function captureCallbacks() {
  const opts = mockExecute.mock.calls.at(-1)?.[0] as {
    onOutput: (stream: 'stdout' | 'stderr', text: string) => void;
    onLoading: (stage: string) => void;
    onComplete: (exitCode: number) => void;
    onError: (message: string) => void;
  };
  return opts;
}

describe('useCodeRunner', () => {
  let scope: EffectScope;
  let composable: ReturnType<typeof useCodeRunner>;

  beforeEach(() => {
    mockExecute.mockClear();
    mockAbort.mockClear();
    // Re-set the default return value after clear
    mockExecute.mockReturnValue({ abort: mockAbort });

    const mounted = mountComposable();
    scope = mounted.scope;
    composable = mounted.result;
  });

  afterEach(() => {
    scope.stop();
  });

  /* ================================================================ */
  /*  Initial state                                                    */
  /* ================================================================ */
  describe('initial state', () => {
    it('returns idle status, empty output, null time/code, not truncated', () => {
      const { output, status, executionTime, exitCode, truncated } = composable;

      expect(status.value).toBe('idle');
      expect(output.value).toEqual([]);
      expect(executionTime.value).toBeNull();
      expect(exitCode.value).toBeNull();
      expect(truncated.value).toBe(false);
    });
  });

  /* ================================================================ */
  /*  run() — status transitions                                       */
  /* ================================================================ */
  describe('run()', () => {
    it('transitions status idle -> loading immediately on run()', () => {
      const { run, status } = composable;
      expect(status.value).toBe('idle');

      run('console.log("hi")', 'javascript');

      expect(status.value).toBe('loading');
    });

    it('calls SandboxManager.execute with correct options', () => {
      const { run } = composable;

      run('print("hi")', 'python', 'some input');

      expect(mockExecute).toHaveBeenCalledOnce();
      const opts = mockExecute.mock.calls[0][0];
      expect(opts.code).toBe('print("hi")');
      expect(opts.language).toBe('python');
      expect(opts.stdin).toBe('some input');
      expect(typeof opts.onOutput).toBe('function');
      expect(typeof opts.onLoading).toBe('function');
      expect(typeof opts.onComplete).toBe('function');
      expect(typeof opts.onError).toBe('function');
    });

    it('passes undefined stdin when not provided', () => {
      const { run } = composable;
      run('code', 'javascript');

      const opts = mockExecute.mock.calls[0][0];
      expect(opts.stdin).toBeUndefined();
    });

    it('clears previous state on new run', () => {
      const { run, output, status, executionTime, exitCode, truncated } = composable;

      // First run
      run('code', 'javascript');
      const cb1 = captureCallbacks();
      cb1.onOutput('stdout', 'hello');
      cb1.onComplete(0);

      expect(output.value).toHaveLength(1);
      expect(status.value).toBe('done');
      expect(exitCode.value).toBe(0);

      // Second run should reset everything
      run('code2', 'javascript');

      expect(output.value).toEqual([]);
      expect(status.value).toBe('loading');
      expect(executionTime.value).toBeNull();
      expect(exitCode.value).toBeNull();
      expect(truncated.value).toBe(false);
    });
  });

  /* ================================================================ */
  /*  onOutput — output accumulation                                   */
  /* ================================================================ */
  describe('onOutput', () => {
    it('accumulates output lines with stream, text, timestamp', () => {
      const { run, output } = composable;
      run('code', 'javascript');
      const cb = captureCallbacks();

      const before = Date.now();
      cb.onOutput('stdout', 'line 1');
      cb.onOutput('stderr', 'error line');
      const after = Date.now();

      expect(output.value).toHaveLength(2);

      const line0: OutputLine = output.value[0];
      expect(line0.stream).toBe('stdout');
      expect(line0.text).toBe('line 1');
      expect(line0.timestamp).toBeGreaterThanOrEqual(before);
      expect(line0.timestamp).toBeLessThanOrEqual(after);

      const line1: OutputLine = output.value[1];
      expect(line1.stream).toBe('stderr');
      expect(line1.text).toBe('error line');
    });
  });

  /* ================================================================ */
  /*  onLoading — status transitions                                   */
  /* ================================================================ */
  describe('onLoading', () => {
    it('sets status to running when stage is "executing"', () => {
      const { run, status } = composable;
      run('code', 'javascript');
      const cb = captureCallbacks();

      expect(status.value).toBe('loading');

      cb.onLoading('executing');
      expect(status.value).toBe('running');
    });

    it('does not change status for other loading stages', () => {
      const { run, status } = composable;
      run('code', 'javascript');
      const cb = captureCallbacks();

      cb.onLoading('booting');
      expect(status.value).toBe('loading');
    });
  });

  /* ================================================================ */
  /*  onComplete                                                       */
  /* ================================================================ */
  describe('onComplete', () => {
    it('sets status to done and records exitCode', () => {
      const { run, status, exitCode } = composable;
      run('code', 'javascript');
      const cb = captureCallbacks();

      cb.onComplete(42);

      expect(status.value).toBe('done');
      expect(exitCode.value).toBe(42);
    });

    it('records executionTime as non-negative number', () => {
      const { run, executionTime } = composable;
      run('code', 'javascript');
      const cb = captureCallbacks();

      cb.onComplete(0);

      expect(executionTime.value).toBeTypeOf('number');
      expect(executionTime.value).toBeGreaterThanOrEqual(0);
    });
  });

  /* ================================================================ */
  /*  onError                                                          */
  /* ================================================================ */
  describe('onError', () => {
    it('sets status to error and adds stderr output line', () => {
      const { run, status, output } = composable;
      run('code', 'javascript');
      const cb = captureCallbacks();

      cb.onError('Something went wrong');

      expect(status.value).toBe('error');
      expect(output.value).toHaveLength(1);
      expect(output.value[0].stream).toBe('stderr');
      expect(output.value[0].text).toBe('Something went wrong');
      expect(output.value[0].timestamp).toBeTypeOf('number');
    });
  });

  /* ================================================================ */
  /*  abort()                                                          */
  /* ================================================================ */
  describe('abort()', () => {
    it('calls the handle abort function', () => {
      const { run, abort } = composable;
      run('code', 'javascript');

      abort();

      expect(mockAbort).toHaveBeenCalledOnce();
    });

    it('is a no-op when nothing is running', () => {
      const { abort } = composable;
      // Should not throw
      expect(() => abort()).not.toThrow();
      expect(mockAbort).not.toHaveBeenCalled();
    });
  });

  /* ================================================================ */
  /*  clear()                                                          */
  /* ================================================================ */
  describe('clear()', () => {
    it('resets all state to initial values', () => {
      const { run, clear, output, status, executionTime, exitCode, truncated } = composable;

      // Run and complete to populate state
      run('code', 'javascript');
      const cb = captureCallbacks();
      cb.onOutput('stdout', 'some output');
      cb.onComplete(1);

      expect(output.value).toHaveLength(1);
      expect(status.value).toBe('done');
      expect(exitCode.value).toBe(1);

      clear();

      expect(output.value).toEqual([]);
      expect(status.value).toBe('idle');
      expect(executionTime.value).toBeNull();
      expect(exitCode.value).toBeNull();
      expect(truncated.value).toBe(false);
    });
  });

  /* ================================================================ */
  /*  Line-count truncation                                            */
  /* ================================================================ */
  describe('line-count truncation', () => {
    it('truncates at MAX_OUTPUT_LINES (10,000) and sets truncated=true', () => {
      const { run, output, truncated } = composable;
      run('code', 'javascript');
      const cb = captureCallbacks();

      // Emit 10,001 lines
      for (let i = 0; i < 10_001; i++) {
        cb.onOutput('stdout', `line ${i}`);
      }

      expect(output.value).toHaveLength(10_000);
      expect(truncated.value).toBe(true);
    });

    it('ignores further output after truncation is set', () => {
      const { run, output, truncated } = composable;
      run('code', 'javascript');
      const cb = captureCallbacks();

      // Fill to the limit
      for (let i = 0; i < 10_001; i++) {
        cb.onOutput('stdout', `line ${i}`);
      }
      expect(truncated.value).toBe(true);
      const countAfterTruncation = output.value.length;

      // Additional output after truncation should be silently dropped
      cb.onOutput('stdout', 'this should be ignored');
      cb.onOutput('stderr', 'this too');

      expect(output.value).toHaveLength(countAfterTruncation);
    });

    it('does not truncate at exactly 10,000 lines', () => {
      const { run, output, truncated } = composable;
      run('code', 'javascript');
      const cb = captureCallbacks();

      for (let i = 0; i < 10_000; i++) {
        cb.onOutput('stdout', `line ${i}`);
      }

      expect(output.value).toHaveLength(10_000);
      expect(truncated.value).toBe(false);
    });
  });

  /* ================================================================ */
  /*  Byte-count truncation                                            */
  /* ================================================================ */
  describe('byte-count truncation', () => {
    it('truncates when total bytes exceed MAX_OUTPUT_BYTES (1MB)', () => {
      const { run, output, truncated } = composable;
      run('code', 'javascript');
      const cb = captureCallbacks();

      // Each line is 1024 bytes of 'x' -- 1025 lines * 1024 bytes = 1,049,600 > 1,048,576
      const bigLine = 'x'.repeat(1024);
      for (let i = 0; i < 1025; i++) {
        cb.onOutput('stdout', bigLine);
      }

      // Should have stopped before all 1025 lines were added
      expect(output.value.length).toBeLessThan(1025);
      expect(truncated.value).toBe(true);
    });

    it('does not truncate when total bytes are under 1MB', () => {
      const { run, output, truncated } = composable;
      run('code', 'javascript');
      const cb = captureCallbacks();

      // 1000 lines of 1000 bytes = 1,000,000 < 1,048,576
      const line = 'x'.repeat(1000);
      for (let i = 0; i < 1000; i++) {
        cb.onOutput('stdout', line);
      }

      expect(output.value).toHaveLength(1000);
      expect(truncated.value).toBe(false);
    });
  });

  /* ================================================================ */
  /*  onUnmounted cleanup                                              */
  /* ================================================================ */
  describe('onUnmounted cleanup', () => {
    it('aborts current handle when scope is stopped', () => {
      // Use a dedicated scope for this test (don't rely on the shared one)
      const { result: dedicated, scope: dedicatedScope } = mountComposable();
      const { run } = dedicated;

      run('code', 'javascript');
      mockAbort.mockClear(); // clear any prior abort calls

      // Simulate component unmount
      dedicatedScope.stop();

      expect(mockAbort).toHaveBeenCalledOnce();
    });

    it('does not throw on unmount when no execution is active', () => {
      const { scope: dedicatedScope } = mountComposable();

      expect(() => dedicatedScope.stop()).not.toThrow();
    });
  });

  /* ================================================================ */
  /*  createWorker (exported factory)                                  */
  /* ================================================================ */
  describe('createWorker', () => {
    it('constructs a Worker with module type', () => {
      const MockWorker = vi.fn();
      vi.stubGlobal('Worker', MockWorker);

      try {
        createWorker();

        expect(MockWorker).toHaveBeenCalledOnce();
        const [url, opts] = MockWorker.mock.calls[0] as [URL, WorkerOptions];
        expect(url).toBeInstanceOf(URL);
        expect(url.href).toContain('js-worker');
        expect(opts).toEqual({ type: 'module' });
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });
});
