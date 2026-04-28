import type { SandboxLanguage } from './languages.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type WorkerFactory = () => Worker;

export interface ExecuteOptions {
  code: string;
  language: SandboxLanguage;
  stdin?: string;
  onOutput: (stream: 'stdout' | 'stderr', text: string) => void;
  onLoading: (stage: string) => void;
  onComplete: (exitCode: number) => void;
  onError: (message: string) => void;
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

    const worker = this.createWorker();

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

    // Notify caller that we are booting
    options.onLoading('booting');

    // Route worker messages to the appropriate callbacks
    worker.addEventListener('message', (event: MessageEvent) => {
      if (finished) return;

      const data = event.data as { type: string; [key: string]: unknown };

      switch (data.type) {
        case 'stdout':
          options.onOutput('stdout', data.text as string);
          break;
        case 'stderr':
          options.onOutput('stderr', data.text as string);
          break;
        case 'loading':
          options.onLoading(data.stage as string);
          break;
        case 'ready':
          options.onLoading('executing');
          break;
        case 'done':
          teardown();
          options.onComplete(data.exitCode as number);
          break;
        case 'error':
          teardown();
          options.onError(data.message as string);
          break;
        default:
          // Unknown message types are silently ignored
          break;
      }
    });

    // Send code to the worker
    const message: Record<string, unknown> = {
      type: 'run',
      code: options.code,
      language: options.language,
    };
    if (options.stdin !== undefined) {
      message.stdin = options.stdin;
    }
    worker.postMessage(message);

    // Enforce 30-second execution timeout
    timeoutId = setTimeout(() => {
      teardown();
      options.onError('Execution timed out');
    }, EXECUTION_TIMEOUT_MS);

    return { abort };
  }
}
