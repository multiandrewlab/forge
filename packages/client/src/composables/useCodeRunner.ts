import { ref, onScopeDispose } from 'vue';
import type { SandboxLanguage } from '../lib/sandbox/languages.js';
import { SandboxManager } from '../lib/sandbox/manager.js';
import type { ExecuteHandle } from '../lib/sandbox/manager.js';

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

export function createWorker(): Worker {
  return new Worker(
    new URL('../lib/sandbox/workers/js-worker.ts', import.meta.url),
    { type: 'module' },
  );
}

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
  let startTime = 0;

  const encoder = new TextEncoder();

  function run(code: string, language: SandboxLanguage, stdin?: string): void {
    // Reset state for new execution
    output.value = [];
    status.value = 'loading';
    executionTime.value = null;
    exitCode.value = null;
    truncated.value = false;
    totalBytes = 0;
    startTime = Date.now();

    currentHandle = manager.execute({
      code,
      language,
      stdin,
      onOutput(stream: 'stdout' | 'stderr', text: string) {
        if (truncated.value) return;

        const byteLength = encoder.encode(text).length;

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
          text,
          timestamp: Date.now(),
        });
      },
      onLoading(stage: string) {
        if (stage === 'executing') {
          status.value = 'running';
        }
      },
      onComplete(code: number) {
        status.value = 'done';
        exitCode.value = code;
        executionTime.value = Date.now() - startTime;
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
