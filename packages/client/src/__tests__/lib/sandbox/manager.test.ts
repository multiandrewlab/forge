import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { SandboxLanguage } from '../../../lib/sandbox/languages.js';
import { SandboxManager } from '../../../lib/sandbox/manager.js';
import type { ExecuteOptions, ExecuteHandle, WorkerFactory } from '../../../lib/sandbox/manager.js';

// ---------------------------------------------------------------------------
// Mock Worker helper
// ---------------------------------------------------------------------------
interface MockWorker {
  postMessage: ReturnType<typeof vi.fn>;
  terminate: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  _emit(data: unknown): void;
  _emitEvent(type: 'error' | 'messageerror', payload: Partial<ErrorEvent>): void;
}

function createMockWorker(): MockWorker {
  const listeners: Record<string, ((e: Event) => void)[]> = {};
  const worker: MockWorker = {
    postMessage: vi.fn(),
    terminate: vi.fn(),
    addEventListener: vi.fn((event: string, handler: (e: Event) => void) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(handler);
    }),
    removeEventListener: vi.fn(),
    _emit(data: unknown) {
      const event = { data } as MessageEvent;
      listeners['message']?.forEach((h) => h(event));
    },
    _emitEvent(type, payload) {
      const event = { type, ...payload } as Event;
      listeners[type]?.forEach((h) => h(event));
    },
  };
  return worker;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------
function baseOptions(overrides: Partial<ExecuteOptions> = {}): ExecuteOptions {
  return {
    language: 'python' as SandboxLanguage,
    files: [{ filename: 'main.py', content: 'print("hello")' }],
    entryFile: 'main.py',
    onOutput: vi.fn(),
    onLoading: vi.fn(),
    onComplete: vi.fn(),
    onError: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('SandboxManager', () => {
  let mockWorker: MockWorker;
  let factory: WorkerFactory;
  let manager: SandboxManager;

  beforeEach(() => {
    vi.useFakeTimers();
    mockWorker = createMockWorker();
    factory = vi.fn(() => mockWorker as never);
    manager = new SandboxManager(factory);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // Construction
  // -------------------------------------------------------------------------
  describe('constructor', () => {
    it('accepts a WorkerFactory and creates an instance', () => {
      expect(manager).toBeInstanceOf(SandboxManager);
    });
  });

  // -------------------------------------------------------------------------
  // execute() basics
  // -------------------------------------------------------------------------
  describe('execute()', () => {
    it('returns an ExecuteHandle with an abort method', () => {
      const handle: ExecuteHandle = manager.execute(baseOptions());
      expect(handle).toBeDefined();
      expect(typeof handle.abort).toBe('function');
    });

    it('calls the WorkerFactory to create a worker', () => {
      manager.execute(baseOptions());
      expect(factory).toHaveBeenCalledOnce();
    });

    it('calls onLoading when execution starts', () => {
      const opts = baseOptions();
      manager.execute(opts);
      // Manager no longer calls onLoading on init — worker posts 'loading' messages
      expect(opts.onLoading).not.toHaveBeenCalled();
    });

    it('sends files and language to the worker via postMessage', () => {
      const opts = baseOptions({
        files: [{ filename: 'main.js', content: 'console.log(1)' }],
        entryFile: 'main.js',
        language: 'javascript' as SandboxLanguage,
      });
      manager.execute(opts);
      expect(mockWorker.postMessage).toHaveBeenCalledWith({
        type: 'execute',
        language: 'javascript',
        files: [{ filename: 'main.js', content: 'console.log(1)' }],
        entryFile: 'main.js',
        stdin: undefined,
      });
    });

    it('passes stdin to the worker via postMessage when provided', () => {
      const opts = baseOptions({ stdin: 'some input' });
      manager.execute(opts);
      expect(mockWorker.postMessage).toHaveBeenCalledWith({
        type: 'execute',
        language: opts.language,
        files: opts.files,
        entryFile: opts.entryFile,
        stdin: 'some input',
      });
    });
  });

  // -------------------------------------------------------------------------
  // Worker message routing
  // -------------------------------------------------------------------------
  describe('message routing', () => {
    it('routes stdout messages to onOutput("stdout", text)', () => {
      const opts = baseOptions();
      manager.execute(opts);

      mockWorker._emit({ type: 'stdout', data: 'hello world' });

      expect(opts.onOutput).toHaveBeenCalledWith('stdout', 'hello world');
    });

    it('routes stderr messages to onOutput("stderr", text)', () => {
      const opts = baseOptions();
      manager.execute(opts);

      mockWorker._emit({ type: 'stderr', data: 'oops' });

      expect(opts.onOutput).toHaveBeenCalledWith('stderr', 'oops');
    });

    it('routes loading messages to onLoading(stage)', () => {
      const opts = baseOptions();
      manager.execute(opts);

      mockWorker._emit({ type: 'loading', phase: 'installing' });

      expect(opts.onLoading).toHaveBeenCalledWith('installing');
    });

    it('routes ready messages to onLoading("executing")', () => {
      const opts = baseOptions();
      manager.execute(opts);

      mockWorker._emit({ type: 'ready' });

      expect(opts.onLoading).toHaveBeenCalledWith('executing');
    });

    it('routes done messages to onComplete and terminates the worker', () => {
      const opts = baseOptions();
      manager.execute(opts);

      mockWorker._emit({ type: 'done', exitCode: 0, executionTimeMs: 50 });

      expect(opts.onComplete).toHaveBeenCalledWith({ exitCode: 0, executionTimeMs: 50 });
      expect(mockWorker.terminate).toHaveBeenCalledOnce();
    });

    it('routes done messages with nonzero exit code', () => {
      const opts = baseOptions();
      manager.execute(opts);

      mockWorker._emit({ type: 'done', exitCode: 1, executionTimeMs: 100 });

      expect(opts.onComplete).toHaveBeenCalledWith({ exitCode: 1, executionTimeMs: 100 });
      expect(mockWorker.terminate).toHaveBeenCalledOnce();
    });

    it('routes error messages to onError and terminates the worker', () => {
      const opts = baseOptions();
      manager.execute(opts);

      mockWorker._emit({ type: 'error', message: 'something broke' });

      expect(opts.onError).toHaveBeenCalledWith('something broke');
      expect(mockWorker.terminate).toHaveBeenCalledOnce();
    });

    it('ignores messages with unknown type', () => {
      const opts = baseOptions();
      manager.execute(opts);

      mockWorker._emit({ type: 'unknown_type', data: 'whatever' });

      expect(opts.onOutput).not.toHaveBeenCalled();
      expect(opts.onComplete).not.toHaveBeenCalled();
      expect(opts.onError).not.toHaveBeenCalled();
      expect(opts.onLoading).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Timeout enforcement
  // -------------------------------------------------------------------------
  describe('timeout', () => {
    it('terminates the worker and fires onError after 30 seconds', () => {
      const opts = baseOptions();
      manager.execute(opts);

      vi.advanceTimersByTime(30_000);

      expect(mockWorker.terminate).toHaveBeenCalledOnce();
      expect(opts.onError).toHaveBeenCalledWith('Execution timed out (30s limit)');
    });

    it('does not fire timeout if execution completes before 30s', () => {
      const opts = baseOptions();
      manager.execute(opts);

      // Complete before timeout
      mockWorker._emit({ type: 'done', exitCode: 0, executionTimeMs: 50 });

      vi.advanceTimersByTime(30_000);

      // onError should never have been called
      expect(opts.onError).not.toHaveBeenCalled();
      // terminate called once (for done), not twice
      expect(mockWorker.terminate).toHaveBeenCalledTimes(1);
    });

    it('does not fire timeout if execution errors before 30s', () => {
      const opts = baseOptions();
      manager.execute(opts);

      mockWorker._emit({ type: 'error', message: 'crash' });

      vi.advanceTimersByTime(30_000);

      // onError called once (for the error message), not twice
      expect(opts.onError).toHaveBeenCalledTimes(1);
      expect(opts.onError).toHaveBeenCalledWith('crash');
    });
  });

  // -------------------------------------------------------------------------
  // abort()
  // -------------------------------------------------------------------------
  describe('abort()', () => {
    it('terminates the worker and fires onError("Execution aborted")', () => {
      const opts = baseOptions();
      const handle = manager.execute(opts);

      handle.abort();

      expect(mockWorker.terminate).toHaveBeenCalledOnce();
      expect(opts.onError).toHaveBeenCalledWith('Execution aborted');
    });

    it('clears the timeout so it does not fire after abort', () => {
      const opts = baseOptions();
      const handle = manager.execute(opts);

      handle.abort();

      vi.advanceTimersByTime(30_000);

      // onError called once (for abort), not twice
      expect(opts.onError).toHaveBeenCalledTimes(1);
      expect(opts.onError).toHaveBeenCalledWith('Execution aborted');
    });

    it('is idempotent — calling abort() twice does not double-terminate', () => {
      const opts = baseOptions();
      const handle = manager.execute(opts);

      handle.abort();
      handle.abort();

      expect(mockWorker.terminate).toHaveBeenCalledTimes(1);
      expect(opts.onError).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // Messages after termination are ignored
  // -------------------------------------------------------------------------
  describe('post-termination messages', () => {
    it('ignores messages received after done', () => {
      const opts = baseOptions();
      manager.execute(opts);

      mockWorker._emit({ type: 'done', exitCode: 0, executionTimeMs: 50 });

      // These should be silently ignored
      mockWorker._emit({ type: 'stdout', data: 'late message' });
      mockWorker._emit({ type: 'error', message: 'late error' });

      expect(opts.onOutput).not.toHaveBeenCalled();
      expect(opts.onError).not.toHaveBeenCalled();
    });

    it('ignores messages received after abort', () => {
      const opts = baseOptions();
      const handle = manager.execute(opts);

      handle.abort();

      mockWorker._emit({ type: 'stdout', data: 'late message' });
      mockWorker._emit({ type: 'done', exitCode: 0, executionTimeMs: 50 });

      expect(opts.onOutput).not.toHaveBeenCalled();
      expect(opts.onComplete).not.toHaveBeenCalled();
    });

    it('ignores messages received after error', () => {
      const opts = baseOptions();
      manager.execute(opts);

      mockWorker._emit({ type: 'error', message: 'crash' });

      mockWorker._emit({ type: 'stdout', data: 'late message' });
      mockWorker._emit({ type: 'done', exitCode: 0, executionTimeMs: 50 });

      expect(opts.onOutput).not.toHaveBeenCalled();
      expect(opts.onComplete).not.toHaveBeenCalled();
    });

    it('ignores messages received after timeout', () => {
      const opts = baseOptions();
      manager.execute(opts);

      vi.advanceTimersByTime(30_000);

      mockWorker._emit({ type: 'stdout', data: 'late message' });
      mockWorker._emit({ type: 'done', exitCode: 0, executionTimeMs: 50 });

      expect(opts.onOutput).not.toHaveBeenCalled();
      expect(opts.onComplete).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Abort-and-restart (calling execute while running)
  // -------------------------------------------------------------------------
  describe('abort-and-restart', () => {
    it('terminates the previous worker when execute() is called again', () => {
      const firstWorker = createMockWorker();
      const secondWorker = createMockWorker();
      let callCount = 0;
      const switchingFactory: WorkerFactory = vi.fn(() => {
        callCount++;
        return (callCount === 1 ? firstWorker : secondWorker) as never;
      });
      const mgr = new SandboxManager(switchingFactory);

      const firstOpts = baseOptions();
      mgr.execute(firstOpts);

      const secondOpts = baseOptions({
        files: [{ filename: 'main.py', content: 'print("second")' }],
        entryFile: 'main.py',
      });
      mgr.execute(secondOpts);

      // First worker should be terminated
      expect(firstWorker.terminate).toHaveBeenCalledOnce();
      // First execution's onError should fire with abort message
      expect(firstOpts.onError).toHaveBeenCalledWith('Execution aborted');
    });

    it('the second execution works independently after abort-and-restart', () => {
      const firstWorker = createMockWorker();
      const secondWorker = createMockWorker();
      let callCount = 0;
      const switchingFactory: WorkerFactory = vi.fn(() => {
        callCount++;
        return (callCount === 1 ? firstWorker : secondWorker) as never;
      });
      const mgr = new SandboxManager(switchingFactory);

      mgr.execute(baseOptions());

      const secondOpts = baseOptions({
        files: [{ filename: 'main.py', content: 'print("second")' }],
        entryFile: 'main.py',
      });
      mgr.execute(secondOpts);

      // Second worker receives messages normally
      secondWorker._emit({ type: 'stdout', data: 'output from second' });
      expect(secondOpts.onOutput).toHaveBeenCalledWith('stdout', 'output from second');

      secondWorker._emit({ type: 'done', exitCode: 0, executionTimeMs: 50 });
      expect(secondOpts.onComplete).toHaveBeenCalledWith({ exitCode: 0, executionTimeMs: 50 });
      expect(secondWorker.terminate).toHaveBeenCalledOnce();
    });

    it('messages from the first worker are ignored after restart', () => {
      const firstWorker = createMockWorker();
      const secondWorker = createMockWorker();
      let callCount = 0;
      const switchingFactory: WorkerFactory = vi.fn(() => {
        callCount++;
        return (callCount === 1 ? firstWorker : secondWorker) as never;
      });
      const mgr = new SandboxManager(switchingFactory);

      const firstOpts = baseOptions();
      mgr.execute(firstOpts);

      const secondOpts = baseOptions({
        files: [{ filename: 'main.py', content: 'print("second")' }],
        entryFile: 'main.py',
      });
      mgr.execute(secondOpts);

      // Reset mock to only count calls after restart
      firstOpts.onOutput = vi.fn();
      firstOpts.onComplete = vi.fn();

      // Messages from first worker should be ignored
      firstWorker._emit({ type: 'stdout', data: 'late from first' });
      firstWorker._emit({ type: 'done', exitCode: 0, executionTimeMs: 50 });

      expect(firstOpts.onOutput).not.toHaveBeenCalled();
      expect(firstOpts.onComplete).not.toHaveBeenCalled();
    });

    it('clears the first timeout when restarting', () => {
      const firstWorker = createMockWorker();
      const secondWorker = createMockWorker();
      let callCount = 0;
      const switchingFactory: WorkerFactory = vi.fn(() => {
        callCount++;
        return (callCount === 1 ? firstWorker : secondWorker) as never;
      });
      const mgr = new SandboxManager(switchingFactory);

      const firstOpts = baseOptions();
      mgr.execute(firstOpts);

      const secondOpts = baseOptions({
        files: [{ filename: 'main.py', content: 'print("second")' }],
        entryFile: 'main.py',
      });
      mgr.execute(secondOpts);

      // Advance past original timeout
      vi.advanceTimersByTime(30_000);

      // First worker's timeout should not fire again (only the abort error)
      expect(firstOpts.onError).toHaveBeenCalledTimes(1);
      expect(firstOpts.onError).toHaveBeenCalledWith('Execution aborted');

      // Second worker's timeout fires
      expect(secondOpts.onError).toHaveBeenCalledWith('Execution timed out (30s limit)');
      expect(secondWorker.terminate).toHaveBeenCalledOnce();
    });
  });

  // -------------------------------------------------------------------------
  // Worker-level error events (load failures, message deserialization)
  // -------------------------------------------------------------------------
  describe('worker error events', () => {
    it('routes worker "error" events to onError with the error message', () => {
      const opts = baseOptions();
      manager.execute(opts);

      mockWorker._emitEvent('error', { message: 'SyntaxError: bad worker module' });

      expect(opts.onError).toHaveBeenCalledWith(
        expect.stringContaining('SyntaxError: bad worker module'),
      );
      expect(mockWorker.terminate).toHaveBeenCalledOnce();
    });

    it('uses a fallback message when "error" event has no message', () => {
      const opts = baseOptions();
      manager.execute(opts);

      mockWorker._emitEvent('error', {});

      expect(opts.onError).toHaveBeenCalledWith(expect.stringMatching(/worker.*error/i));
    });

    it('routes worker "messageerror" events to onError', () => {
      const opts = baseOptions();
      manager.execute(opts);

      mockWorker._emitEvent('messageerror', {});

      expect(opts.onError).toHaveBeenCalledWith(expect.stringMatching(/messageerror|deseriali/i));
      expect(mockWorker.terminate).toHaveBeenCalledOnce();
    });

    it('does not double-fire onError if the worker errors after a done message', () => {
      const opts = baseOptions();
      manager.execute(opts);

      mockWorker._emit({ type: 'done', exitCode: 0, executionTimeMs: 1 });
      mockWorker._emitEvent('error', { message: 'late error' });

      expect(opts.onComplete).toHaveBeenCalledOnce();
      expect(opts.onError).not.toHaveBeenCalled();
    });

    it('does not double-fire onError if a messageerror arrives after done', () => {
      const opts = baseOptions();
      manager.execute(opts);

      mockWorker._emit({ type: 'done', exitCode: 0, executionTimeMs: 1 });
      mockWorker._emitEvent('messageerror', {});

      expect(opts.onComplete).toHaveBeenCalledOnce();
      expect(opts.onError).not.toHaveBeenCalled();
    });
  });
});
