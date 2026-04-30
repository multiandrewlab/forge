import { ref, onScopeDispose } from 'vue';
import type { SandboxLanguage } from '../lib/sandbox/languages.js';
import { SandboxManager } from '../lib/sandbox/manager.js';
import type { ExecuteHandle } from '../lib/sandbox/manager.js';
// Vite `?worker` suffix imports compile and bundle the worker module
// (TS → JS, with all dynamic imports). Using `new Worker(new URL(...))`
// inline previously fell back to copying the raw .ts source as a static
// asset because the URL was assigned to a variable before construction,
// defeating Vite's static worker analyzer (issue #70).
import JsWorker from '../lib/sandbox/workers/js-worker.ts?worker';
import PythonWorker from '../lib/sandbox/workers/python-worker.ts?worker';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_OUTPUT_LINES = 10_000;
const MAX_OUTPUT_BYTES = 1_048_576; // 1 MB

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OutputLine {
  stream: 'stdout' | 'stderr';
  text: string;
  timestamp: number;
}

export type CodeRunnerStatus = 'idle' | 'loading' | 'running' | 'done' | 'error';

// ---------------------------------------------------------------------------
// Worker factory — exported for testability
// ---------------------------------------------------------------------------

/* v8 ignore start — Worker constructor unavailable in jsdom */
export function createWorker(language: SandboxLanguage): Worker {
  return language === 'python' ? new PythonWorker() : new JsWorker();
}
/* v8 ignore stop */

// ---------------------------------------------------------------------------
// Module-level SandboxManager (shared across all instances)
// ---------------------------------------------------------------------------

const manager = new SandboxManager(createWorker);

// ---------------------------------------------------------------------------
// Composable
// ---------------------------------------------------------------------------

export function useCodeRunner() {
  const output = ref<OutputLine[]>([]);
  const status = ref<CodeRunnerStatus>('idle');
  const executionTime = ref<number | null>(null);
  const exitCode = ref<number | null>(null);
  const truncated = ref(false);

  let currentHandle: ExecuteHandle | null = null;
  let totalBytes = 0;

  const encoder = new TextEncoder();

  function run(options: {
    language: SandboxLanguage;
    files: Array<{ filename: string; content: string }>;
    entryFile: string;
    stdin?: string;
  }): void {
    // Reset state for new execution
    output.value = [];
    status.value = 'loading';
    executionTime.value = null;
    exitCode.value = null;
    truncated.value = false;
    totalBytes = 0;

    currentHandle = manager.execute({
      ...options,
      onOutput(stream: 'stdout' | 'stderr', data: string) {
        if (truncated.value) return;

        const byteLength = encoder.encode(data).length;

        if (output.value.length >= MAX_OUTPUT_LINES) {
          truncated.value = true;
          return;
        }

        if (totalBytes + byteLength > MAX_OUTPUT_BYTES) {
          truncated.value = true;
          return;
        }

        totalBytes += byteLength;
        output.value.push({
          stream,
          text: data,
          timestamp: Date.now(),
        });
      },
      onLoading(phase: 'runtime' | 'executing') {
        if (phase === 'executing') {
          status.value = 'running';
        }
      },
      onComplete(result: { exitCode: number; executionTimeMs: number }) {
        status.value = 'done';
        exitCode.value = result.exitCode;
        executionTime.value = result.executionTimeMs;
        currentHandle = null;
      },
      onError(message: string) {
        status.value = 'error';
        output.value.push({
          stream: 'stderr',
          text: message,
          timestamp: Date.now(),
        });
        currentHandle = null;
      },
    });
  }

  function abort(): void {
    if (currentHandle) {
      currentHandle.abort();
      currentHandle = null;
    }
  }

  function clear(): void {
    output.value = [];
    status.value = 'idle';
    executionTime.value = null;
    exitCode.value = null;
    truncated.value = false;
  }

  // Cleanup on component/scope teardown
  onScopeDispose(() => {
    abort();
  });

  return { output, status, executionTime, exitCode, truncated, run, abort, clear };
}
