import type { SandboxLanguage } from './languages.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type WorkerFactory = (language: SandboxLanguage) => Worker;

export interface ExecuteOptions {
  language: SandboxLanguage;
  files: Array<{ filename: string; content: string }>;
  entryFile: string;
  stdin?: string;
  onOutput: (stream: 'stdout' | 'stderr', data: string) => void;
  onLoading: (phase: 'runtime' | 'executing') => void;
  onComplete: (result: { exitCode: number; executionTimeMs: number }) => void;
  onError: (error: string) => void;
}

export interface ExecuteHandle {
  abort: () => void;
}

// ---------------------------------------------------------------------------
// Timeout constant
// ---------------------------------------------------------------------------
const EXECUTION_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// SandboxManager
//
// Manages a single active Web Worker execution at a time. Calling execute()
// while a previous execution is still running terminates the previous worker
// and fires its onError callback with 'Execution aborted'.
// ---------------------------------------------------------------------------

export class SandboxManager {
  /** Stored abort function for the current execution (used by abort-and-restart). */
  private currentAbort: (() => void) | null = null;

  constructor(private readonly createWorker: WorkerFactory) {}

  execute(options: ExecuteOptions): ExecuteHandle {
    // Abort-and-restart: if there is a running execution, abort it first
    if (this.currentAbort) {
      this.currentAbort();
      this.currentAbort = null;
    }

    const worker = this.createWorker(options.language);

    // Per-execution flag: once set, all callbacks for this execution are ignored
    let finished = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const teardown = () => {
      finished = true;
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      worker.terminate();

      // Clear instance reference if this is still the active execution
      if (this.currentAbort === abort) {
        this.currentAbort = null;
      }
    };

    const abort = () => {
      if (finished) return;
      teardown();
      options.onError('Execution aborted');
    };

    // Register as the active execution
    this.currentAbort = abort;

    // Route worker messages to the appropriate callbacks
    worker.addEventListener('message', (event: MessageEvent) => {
      if (finished) return;

      const msg = event.data as { type: string; [key: string]: unknown };

      switch (msg.type) {
        case 'stdout':
          options.onOutput('stdout', msg.data as string);
          break;
        case 'stderr':
          options.onOutput('stderr', msg.data as string);
          break;
        case 'loading':
          options.onLoading(msg.phase as 'runtime' | 'executing');
          break;
        case 'ready':
          options.onLoading('executing');
          break;
        case 'done':
          teardown();
          options.onComplete({
            exitCode: msg.exitCode as number,
            executionTimeMs: msg.executionTimeMs as number,
          });
          break;
        case 'error':
          teardown();
          options.onError(msg.message as string);
          break;
        default:
          break;
      }
    });

    // Surface worker-level failures (module load errors, uncaught throws,
    // postMessage deserialization failures). Without this, a worker that
    // fails to instantiate is silently lost until the 30s execution timeout.
    worker.addEventListener('error', (event: Event) => {
      if (finished) return;
      const errEvent = event as ErrorEvent;
      const message = errEvent.message ?? 'Worker error (no message)';
      teardown();
      options.onError(`Worker error: ${message}`);
    });

    worker.addEventListener('messageerror', (_event: Event) => {
      if (finished) return;
      teardown();
      options.onError('Worker messageerror: failed to deserialize a message');
    });

    // Send execute message to the worker
    worker.postMessage({
      type: 'execute',
      language: options.language,
      files: options.files,
      entryFile: options.entryFile,
      stdin: options.stdin,
    });

    // Enforce 30-second execution timeout
    timeoutId = setTimeout(() => {
      teardown();
      options.onError('Execution timed out (30s limit)');
    }, EXECUTION_TIMEOUT_MS);

    return { abort };
  }
}
