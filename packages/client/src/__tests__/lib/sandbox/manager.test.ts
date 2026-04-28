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
}

function createMockWorker(): MockWorker {
  const listeners: Record<string, ((e: MessageEvent) => void)[]> = {};
  const worker: MockWorker = {
    postMessage: vi.fn(),
    terminate: vi.fn(),
    addEventListener: vi.fn((event: string, handler: (e: MessageEvent) => void) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(handler);
    }),
    removeEventListener: vi.fn(),
    _emit(data: unknown) {
      const event = { data } as MessageEvent;
      listeners['message']?.forEach((h) => h(event));
    },
  };
  return worker;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------
function baseOptions(overrides: Partial<ExecuteOptions> = {}): ExecuteOptions {
  return {
    code: 'print("hello")',
    language: 'python' as SandboxLanguage,
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
      expect(opts.onLoading).toHaveBeenCalledWith('booting');
    });

    it('sends code and language to the worker via postMessage', () => {
      const opts = baseOptions({ code: 'console.log(1)', language: 'javascript' as SandboxLanguage });
      manager.execute(opts);
      expect(mockWorker.postMessage).toHaveBeenCalledWith({
        type: 'run',
        code: 'console.log(1)',
        language: 'javascript',
      });
    });

    it('passes stdin to the worker via postMessage when provided', () => {
      const opts = baseOptions({ stdin: 'some input' });
      manager.execute(opts);
      expect(mockWorker.postMessage).toHaveBeenCalledWith({
        type: 'run',
        code: opts.code,
        language: opts.language,
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

      mockWorker._emit({ type: 'stdout', text: 'hello world' });

      expect(opts.onOutput).toHaveBeenCalledWith('stdout', 'hello world');
    });

    it('routes stderr messages to onOutput("stderr", text)', () => {
      const opts = baseOptions();
      manager.execute(opts);

      mockWorker._emit({ type: 'stderr', text: 'oops' });

      expect(opts.onOutput).toHaveBeenCalledWith('stderr', 'oops');
    });

    it('routes loading messages to onLoading(stage)', () => {
      const opts = baseOptions();
      manager.execute(opts);

      mockWorker._emit({ type: 'loading', stage: 'installing' });

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

      mockWorker._emit({ type: 'done', exitCode: 0 });

      expect(opts.onComplete).toHaveBeenCalledWith(0);
      expect(mockWorker.terminate).toHaveBeenCalledOnce();
    });

    it('routes done messages with nonzero exit code', () => {
      const opts = baseOptions();
      manager.execute(opts);

      mockWorker._emit({ type: 'done', exitCode: 1 });

      expect(opts.onComplete).toHaveBeenCalledWith(1);
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
      // onLoading is called once at start with 'booting', but not again
      expect(opts.onLoading).toHaveBeenCalledTimes(1);
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
      expect(opts.onError).toHaveBeenCalledWith('Execution timed out');
    });

    it('does not fire timeout if execution completes before 30s', () => {
      const opts = baseOptions();
      manager.execute(opts);

      // Complete before timeout
      mockWorker._emit({ type: 'done', exitCode: 0 });

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

      mockWorker._emit({ type: 'done', exitCode: 0 });

      // These should be silently ignored
      mockWorker._emit({ type: 'stdout', text: 'late message' });
      mockWorker._emit({ type: 'error', message: 'late error' });

      expect(opts.onOutput).not.toHaveBeenCalled();
      expect(opts.onError).not.toHaveBeenCalled();
    });

    it('ignores messages received after abort', () => {
      const opts = baseOptions();
      const handle = manager.execute(opts);

      handle.abort();

      mockWorker._emit({ type: 'stdout', text: 'late message' });
      mockWorker._emit({ type: 'done', exitCode: 0 });

      expect(opts.onOutput).not.toHaveBeenCalled();
      expect(opts.onComplete).not.toHaveBeenCalled();
    });

    it('ignores messages received after error', () => {
      const opts = baseOptions();
      manager.execute(opts);

      mockWorker._emit({ type: 'error', message: 'crash' });

      mockWorker._emit({ type: 'stdout', text: 'late message' });
      mockWorker._emit({ type: 'done', exitCode: 0 });

      expect(opts.onOutput).not.toHaveBeenCalled();
      expect(opts.onComplete).not.toHaveBeenCalled();
    });

    it('ignores messages received after timeout', () => {
      const opts = baseOptions();
      manager.execute(opts);

      vi.advanceTimersByTime(30_000);

      mockWorker._emit({ type: 'stdout', text: 'late message' });
      mockWorker._emit({ type: 'done', exitCode: 0 });

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

      const secondOpts = baseOptions({ code: 'print("second")' });
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

      const secondOpts = baseOptions({ code: 'print("second")' });
      mgr.execute(secondOpts);

      // Second worker receives messages normally
      secondWorker._emit({ type: 'stdout', text: 'output from second' });
      expect(secondOpts.onOutput).toHaveBeenCalledWith('stdout', 'output from second');

      secondWorker._emit({ type: 'done', exitCode: 0 });
      expect(secondOpts.onComplete).toHaveBeenCalledWith(0);
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

      const secondOpts = baseOptions({ code: 'print("second")' });
      mgr.execute(secondOpts);

      // Reset mock to only count calls after restart
      firstOpts.onOutput = vi.fn();
      firstOpts.onComplete = vi.fn();

      // Messages from first worker should be ignored
      firstWorker._emit({ type: 'stdout', text: 'late from first' });
      firstWorker._emit({ type: 'done', exitCode: 0 });

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

      const secondOpts = baseOptions({ code: 'print("second")' });
      mgr.execute(secondOpts);

      // Advance past original timeout
      vi.advanceTimersByTime(30_000);

      // First worker's timeout should not fire again (only the abort error)
      expect(firstOpts.onError).toHaveBeenCalledTimes(1);
      expect(firstOpts.onError).toHaveBeenCalledWith('Execution aborted');

      // Second worker's timeout fires
      expect(secondOpts.onError).toHaveBeenCalledWith('Execution timed out');
      expect(secondWorker.terminate).toHaveBeenCalledOnce();
    });
  });
});
