# Code Execution Sandbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a client-side WASM code execution sandbox that lets users run JavaScript, TypeScript, and Python code snippets from posts in the browser.

**Architecture:** Purely client-side. Web Workers run WASM runtimes (QuickJS for JS/TS, Pyodide for Python) in isolation. Browser APIs neutralized in workers as defense-in-depth. UI integrates into PostDetail with RunButton + ExecutionOutput components. No server changes.

**Tech Stack:** Vue 3 Composition API, Vite worker bundling, quickjs-emscripten, esbuild-wasm, Pyodide (CDN), Vitest + vue-test-utils

**Design spec:** `docs/superpowers/specs/2026-04-28-code-sandbox-design.md`

---

## File Map

### New Files (9)
```
packages/client/src/lib/sandbox/languages.ts                    — Language constants, guards, extension map
packages/client/src/lib/sandbox/manager.ts                       — SandboxManager with injectable WorkerFactory
packages/client/src/lib/sandbox/workers/neutralize-apis.ts       — Extracted testable helper: deletes browser APIs from worker scope
packages/client/src/lib/sandbox/workers/python-worker.ts         — Pyodide Web Worker (thin entry point)
packages/client/src/lib/sandbox/workers/js-worker.ts             — QuickJS + esbuild-wasm Web Worker (thin entry point)
packages/client/src/composables/useCodeRunner.ts                 — Vue composable bridge
packages/client/src/components/post/CodeRunner.vue               — Wrapper (fetches content, composes RunButton + ExecutionOutput)
packages/client/src/components/post/RunButton.vue                — Play/stop/loading button overlay
packages/client/src/components/post/ExecutionOutput.vue          — Streaming output panel with truncation
```

### Test Files (7)
```
packages/client/src/__tests__/lib/sandbox/languages.test.ts
packages/client/src/__tests__/lib/sandbox/manager.test.ts
packages/client/src/__tests__/lib/sandbox/workers/neutralize-apis.test.ts
packages/client/src/__tests__/composables/useCodeRunner.test.ts
packages/client/src/__tests__/components/post/RunButton.test.ts
packages/client/src/__tests__/components/post/ExecutionOutput.test.ts
packages/client/src/__tests__/components/post/CodeRunner.test.ts
```

### Modified Files (1)
```
packages/client/src/components/post/PostDetail.vue         — Add CodeRunner to both layouts
```

### Dependencies
```
packages/client devDependencies:
  quickjs-emscripten       — QuickJS WASM runtime
  esbuild-wasm             — TypeScript transpilation
```

---

## Task Dependencies

```
Task 1 (Languages)     ──┐
Task 2 (Manager)       ──┤── Task 5 (useCodeRunner) ──┐
Task 3 (Workers)       ──┘                             │
Task 4a (RunButton)    ────────────────────────────────┤── Task 6 (CodeRunner) ── Task 7 (PostDetail)
Task 4b (ExecOutput)   ────────────────────────────────┘
```

Tasks 1, 4a, 4b are independent (can be parallelized).
Tasks 2-3 depend on Task 1.
Task 5 depends on Tasks 2-3.
Task 6 depends on Tasks 4a, 4b, 5.
Task 7 depends on Task 6.

---

## Task 0: Install Dependencies

**Files:**
- Modify: `packages/client/package.json`

- [ ] **Step 1: Install npm packages**

```bash
cd packages/client && npm install --save-dev quickjs-emscripten esbuild-wasm
```

- [ ] **Step 2: Verify installation**

```bash
node -e "require('quickjs-emscripten')" && echo "quickjs-emscripten OK"
node -e "require('esbuild-wasm')" && echo "esbuild-wasm OK"
```

- [ ] **Step 3: Commit**

```bash
git add packages/client/package.json package-lock.json
git commit -m "chore: add quickjs-emscripten and esbuild-wasm dependencies"
```

---

## Task 1: Language Constants & Guards

**Files:**
- Create: `packages/client/src/lib/sandbox/languages.ts`
- Test: `packages/client/src/__tests__/lib/sandbox/languages.test.ts`

This module defines the supported sandbox languages, a type guard for runtime checking, and a mapping from language to file extension.

- [ ] **Step 1: Write failing tests**

```typescript
// packages/client/src/__tests__/lib/sandbox/languages.test.ts
import { describe, it, expect } from 'vitest';
import {
  SANDBOX_LANGUAGES,
  isSandboxLanguage,
  languageToExtension,
  extensionToLanguage,
  type SandboxLanguage,
} from '../../lib/sandbox/languages.js';

describe('SANDBOX_LANGUAGES', () => {
  it('contains exactly python, javascript, typescript', () => {
    expect(SANDBOX_LANGUAGES).toEqual(['python', 'javascript', 'typescript']);
  });

  it('is readonly', () => {
    expect(Object.isFrozen(SANDBOX_LANGUAGES)).toBe(true);
  });
});

describe('isSandboxLanguage', () => {
  it('returns true for python', () => {
    expect(isSandboxLanguage('python')).toBe(true);
  });

  it('returns true for javascript', () => {
    expect(isSandboxLanguage('javascript')).toBe(true);
  });

  it('returns true for typescript', () => {
    expect(isSandboxLanguage('typescript')).toBe(true);
  });

  it('returns false for null', () => {
    expect(isSandboxLanguage(null)).toBe(false);
  });

  it('returns false for unsupported language', () => {
    expect(isSandboxLanguage('go')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isSandboxLanguage('')).toBe(false);
  });
});

describe('languageToExtension', () => {
  it('maps python to .py', () => {
    expect(languageToExtension('python')).toBe('.py');
  });

  it('maps javascript to .js', () => {
    expect(languageToExtension('javascript')).toBe('.js');
  });

  it('maps typescript to .ts', () => {
    expect(languageToExtension('typescript')).toBe('.ts');
  });
});

describe('extensionToLanguage', () => {
  it('maps .py to python', () => {
    expect(extensionToLanguage('.py')).toBe('python');
  });

  it('maps .js to javascript', () => {
    expect(extensionToLanguage('.js')).toBe('javascript');
  });

  it('maps .ts to typescript', () => {
    expect(extensionToLanguage('.ts')).toBe('typescript');
  });

  it('maps .mjs to javascript', () => {
    expect(extensionToLanguage('.mjs')).toBe('javascript');
  });

  it('maps .mts to typescript', () => {
    expect(extensionToLanguage('.mts')).toBe('typescript');
  });

  it('returns null for unsupported extension', () => {
    expect(extensionToLanguage('.go')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(extensionToLanguage('')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run packages/client/src/__tests__/lib/sandbox/languages.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement languages.ts**

```typescript
// packages/client/src/lib/sandbox/languages.ts
export const SANDBOX_LANGUAGES = Object.freeze([
  'python',
  'javascript',
  'typescript',
] as const);

export type SandboxLanguage = (typeof SANDBOX_LANGUAGES)[number];

export function isSandboxLanguage(lang: string | null): lang is SandboxLanguage {
  if (lang === null) return false;
  return (SANDBOX_LANGUAGES as readonly string[]).includes(lang);
}

const LANGUAGE_TO_EXTENSION: Record<SandboxLanguage, string> = {
  python: '.py',
  javascript: '.js',
  typescript: '.ts',
};

const EXTENSION_TO_LANGUAGE: Record<string, SandboxLanguage> = {
  '.py': 'python',
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.ts': 'typescript',
  '.mts': 'typescript',
};

export function languageToExtension(lang: SandboxLanguage): string {
  return LANGUAGE_TO_EXTENSION[lang];
}

export function extensionToLanguage(ext: string): SandboxLanguage | null {
  return EXTENSION_TO_LANGUAGE[ext] ?? null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run packages/client/src/__tests__/lib/sandbox/languages.test.ts
```

Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/lib/sandbox/languages.ts packages/client/src/__tests__/lib/sandbox/languages.test.ts
git commit -m "feat(sandbox): add language constants, guards, and extension mapping"
```

---

## Task 2: SandboxManager

**Files:**
- Create: `packages/client/src/lib/sandbox/manager.ts`
- Test: `packages/client/src/__tests__/lib/sandbox/manager.test.ts`

The SandboxManager creates Web Workers, routes messages, enforces timeouts, and handles abort. It accepts an injectable WorkerFactory for testability (jsdom lacks real Worker support).

- [ ] **Step 1: Write failing tests**

```typescript
// packages/client/src/__tests__/lib/sandbox/manager.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SandboxManager } from '../../lib/sandbox/manager.js';
import type { SandboxLanguage } from '../../lib/sandbox/languages.js';

// Mock Worker that simulates the worker message protocol
function createMockWorker() {
  const listeners: Record<string, ((e: MessageEvent) => void)[]> = {};
  const worker = {
    postMessage: vi.fn(),
    terminate: vi.fn(),
    addEventListener: vi.fn((event: string, handler: (e: MessageEvent) => void) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(handler);
    }),
    removeEventListener: vi.fn(),
    // Helper to simulate messages from worker
    _emit(data: unknown) {
      const event = { data } as MessageEvent;
      listeners['message']?.forEach((h) => h(event));
    },
  };
  return worker;
}

type MockWorker = ReturnType<typeof createMockWorker>;

describe('SandboxManager', () => {
  let manager: SandboxManager;
  let mockWorker: MockWorker;
  let mockFactory: (lang: SandboxLanguage) => MockWorker;

  beforeEach(() => {
    vi.useFakeTimers();
    mockWorker = createMockWorker();
    mockFactory = vi.fn(() => mockWorker);
    manager = new SandboxManager(mockFactory as unknown as (lang: SandboxLanguage) => Worker);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates a worker via factory when execute is called', () => {
    const onOutput = vi.fn();
    const onComplete = vi.fn();
    const onError = vi.fn();
    const onLoading = vi.fn();

    manager.execute({
      language: 'python',
      files: [{ filename: 'main.py', content: 'print("hi")' }],
      entryFile: 'main.py',
      onOutput,
      onComplete,
      onError,
      onLoading,
    });

    expect(mockFactory).toHaveBeenCalledWith('python');
  });

  it('posts execute message to worker', () => {
    const onOutput = vi.fn();
    const onComplete = vi.fn();
    const onError = vi.fn();
    const onLoading = vi.fn();

    manager.execute({
      language: 'javascript',
      files: [{ filename: 'main.js', content: 'console.log("hi")' }],
      entryFile: 'main.js',
      onOutput,
      onComplete,
      onError,
      onLoading,
    });

    expect(mockWorker.postMessage).toHaveBeenCalledWith({
      type: 'execute',
      language: 'javascript',
      files: [{ filename: 'main.js', content: 'console.log("hi")' }],
      entryFile: 'main.js',
      stdin: undefined,
    });
  });

  it('routes stdout messages to onOutput', () => {
    const onOutput = vi.fn();
    const onComplete = vi.fn();
    const onError = vi.fn();
    const onLoading = vi.fn();

    manager.execute({
      language: 'python',
      files: [{ filename: 'main.py', content: '' }],
      entryFile: 'main.py',
      onOutput,
      onComplete,
      onError,
      onLoading,
    });

    mockWorker._emit({ type: 'stdout', data: 'hello' });

    expect(onOutput).toHaveBeenCalledWith('stdout', 'hello');
  });

  it('routes stderr messages to onOutput', () => {
    const onOutput = vi.fn();
    const onComplete = vi.fn();
    const onError = vi.fn();
    const onLoading = vi.fn();

    manager.execute({
      language: 'python',
      files: [{ filename: 'main.py', content: '' }],
      entryFile: 'main.py',
      onOutput,
      onComplete,
      onError,
      onLoading,
    });

    mockWorker._emit({ type: 'stderr', data: 'error msg' });

    expect(onOutput).toHaveBeenCalledWith('stderr', 'error msg');
  });

  it('routes loading messages to onLoading', () => {
    const onOutput = vi.fn();
    const onComplete = vi.fn();
    const onError = vi.fn();
    const onLoading = vi.fn();

    manager.execute({
      language: 'python',
      files: [{ filename: 'main.py', content: '' }],
      entryFile: 'main.py',
      onOutput,
      onComplete,
      onError,
      onLoading,
    });

    mockWorker._emit({ type: 'loading', phase: 'runtime' });

    expect(onLoading).toHaveBeenCalledWith('runtime');
  });

  it('routes ready message to onLoading with executing phase', () => {
    const onOutput = vi.fn();
    const onComplete = vi.fn();
    const onError = vi.fn();
    const onLoading = vi.fn();

    manager.execute({
      language: 'python',
      files: [{ filename: 'main.py', content: '' }],
      entryFile: 'main.py',
      onOutput,
      onComplete,
      onError,
      onLoading,
    });

    mockWorker._emit({ type: 'ready' });

    expect(onLoading).toHaveBeenCalledWith('executing');
  });

  it('routes done messages to onComplete and terminates worker', () => {
    const onOutput = vi.fn();
    const onComplete = vi.fn();
    const onError = vi.fn();
    const onLoading = vi.fn();

    manager.execute({
      language: 'python',
      files: [{ filename: 'main.py', content: '' }],
      entryFile: 'main.py',
      onOutput,
      onComplete,
      onError,
      onLoading,
    });

    mockWorker._emit({ type: 'done', exitCode: 0, executionTimeMs: 123 });

    expect(onComplete).toHaveBeenCalledWith({ exitCode: 0, executionTimeMs: 123 });
    expect(mockWorker.terminate).toHaveBeenCalled();
  });

  it('routes error messages to onError and terminates worker', () => {
    const onOutput = vi.fn();
    const onComplete = vi.fn();
    const onError = vi.fn();
    const onLoading = vi.fn();

    manager.execute({
      language: 'python',
      files: [{ filename: 'main.py', content: '' }],
      entryFile: 'main.py',
      onOutput,
      onComplete,
      onError,
      onLoading,
    });

    mockWorker._emit({ type: 'error', message: 'boom' });

    expect(onError).toHaveBeenCalledWith('boom');
    expect(mockWorker.terminate).toHaveBeenCalled();
  });

  it('enforces 30s timeout', () => {
    const onOutput = vi.fn();
    const onComplete = vi.fn();
    const onError = vi.fn();
    const onLoading = vi.fn();

    manager.execute({
      language: 'python',
      files: [{ filename: 'main.py', content: '' }],
      entryFile: 'main.py',
      onOutput,
      onComplete,
      onError,
      onLoading,
    });

    vi.advanceTimersByTime(30_000);

    expect(onError).toHaveBeenCalledWith('Execution timed out (30s limit)');
    expect(mockWorker.terminate).toHaveBeenCalled();
  });

  it('does not fire timeout if execution completes before 30s', () => {
    const onOutput = vi.fn();
    const onComplete = vi.fn();
    const onError = vi.fn();
    const onLoading = vi.fn();

    manager.execute({
      language: 'python',
      files: [{ filename: 'main.py', content: '' }],
      entryFile: 'main.py',
      onOutput,
      onComplete,
      onError,
      onLoading,
    });

    mockWorker._emit({ type: 'done', exitCode: 0, executionTimeMs: 50 });
    vi.advanceTimersByTime(30_000);

    expect(onError).not.toHaveBeenCalled();
  });

  it('abort() terminates worker and fires onError', () => {
    const onOutput = vi.fn();
    const onComplete = vi.fn();
    const onError = vi.fn();
    const onLoading = vi.fn();

    const handle = manager.execute({
      language: 'python',
      files: [{ filename: 'main.py', content: '' }],
      entryFile: 'main.py',
      onOutput,
      onComplete,
      onError,
      onLoading,
    });

    handle.abort();

    expect(mockWorker.terminate).toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith('Execution aborted');
  });

  it('terminates previous worker when execute is called again', () => {
    const firstWorker = createMockWorker();
    const secondWorker = createMockWorker();
    let callCount = 0;
    const factory = vi.fn(() => {
      callCount++;
      return callCount === 1 ? firstWorker : secondWorker;
    });
    const mgr = new SandboxManager(factory as unknown as (lang: SandboxLanguage) => Worker);

    const opts = {
      language: 'python' as SandboxLanguage,
      files: [{ filename: 'main.py', content: '' }],
      entryFile: 'main.py',
      onOutput: vi.fn(),
      onComplete: vi.fn(),
      onError: vi.fn(),
      onLoading: vi.fn(),
    };

    mgr.execute(opts);
    mgr.execute(opts);

    expect(firstWorker.terminate).toHaveBeenCalled();
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('passes stdin when provided', () => {
    const onOutput = vi.fn();
    const onComplete = vi.fn();
    const onError = vi.fn();
    const onLoading = vi.fn();

    manager.execute({
      language: 'python',
      files: [{ filename: 'main.py', content: '' }],
      entryFile: 'main.py',
      stdin: 'hello world',
      onOutput,
      onComplete,
      onError,
      onLoading,
    });

    expect(mockWorker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ stdin: 'hello world' }),
    );
  });

  it('ignores messages after worker is terminated', () => {
    const onOutput = vi.fn();
    const onComplete = vi.fn();
    const onError = vi.fn();
    const onLoading = vi.fn();

    const handle = manager.execute({
      language: 'python',
      files: [{ filename: 'main.py', content: '' }],
      entryFile: 'main.py',
      onOutput,
      onComplete,
      onError,
      onLoading,
    });

    handle.abort();
    onError.mockClear();

    // Messages after abort should be ignored
    mockWorker._emit({ type: 'stdout', data: 'late message' });
    mockWorker._emit({ type: 'done', exitCode: 0, executionTimeMs: 100 });

    expect(onOutput).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run packages/client/src/__tests__/lib/sandbox/manager.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement manager.ts**

```typescript
// packages/client/src/lib/sandbox/manager.ts
import type { SandboxLanguage } from './languages.js';

const TIMEOUT_MS = 30_000;

export interface ExecuteOptions {
  language: SandboxLanguage;
  files: Array<{ filename: string; content: string }>;
  entryFile: string;
  stdin?: string;
  onOutput: (stream: 'stdout' | 'stderr', data: string) => void;
  onComplete: (result: { exitCode: number; executionTimeMs: number }) => void;
  onError: (error: string) => void;
  onLoading: (phase: 'runtime' | 'executing') => void;
}

export interface ExecuteHandle {
  abort: () => void;
}

type WorkerFactory = (language: SandboxLanguage) => Worker;

export class SandboxManager {
  private currentWorker: Worker | null = null;
  private currentTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private terminated = false;

  constructor(private createWorker: WorkerFactory) {}

  execute(options: ExecuteOptions): ExecuteHandle {
    // Abort any previous execution
    if (this.currentWorker) {
      this.currentWorker.terminate();
      if (this.currentTimeoutId !== null) {
        clearTimeout(this.currentTimeoutId);
      }
    }

    this.terminated = false;

    const worker = this.createWorker(options.language);
    this.currentWorker = worker;

    const cleanup = () => {
      this.terminated = true;
      if (this.currentTimeoutId !== null) {
        clearTimeout(this.currentTimeoutId);
        this.currentTimeoutId = null;
      }
      worker.terminate();
      this.currentWorker = null;
    };

    worker.addEventListener('message', (event: MessageEvent) => {
      if (this.terminated) return;

      const msg = event.data as {
        type: string;
        data?: string;
        phase?: string;
        exitCode?: number;
        executionTimeMs?: number;
        message?: string;
      };

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
          options.onComplete({
            exitCode: msg.exitCode as number,
            executionTimeMs: msg.executionTimeMs as number,
          });
          cleanup();
          break;
        case 'error':
          options.onError(msg.message as string);
          cleanup();
          break;
      }
    });

    worker.postMessage({
      type: 'execute',
      language: options.language,
      files: options.files,
      entryFile: options.entryFile,
      stdin: options.stdin,
    });

    this.currentTimeoutId = setTimeout(() => {
      if (!this.terminated) {
        options.onError('Execution timed out (30s limit)');
        cleanup();
      }
    }, TIMEOUT_MS);

    return {
      abort: () => {
        if (!this.terminated) {
          options.onError('Execution aborted');
          cleanup();
        }
      },
    };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run packages/client/src/__tests__/lib/sandbox/manager.test.ts
```

Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/lib/sandbox/manager.ts packages/client/src/__tests__/lib/sandbox/manager.test.ts
git commit -m "feat(sandbox): add SandboxManager with injectable WorkerFactory"
```

---

## Task 3: Web Worker Implementations

**Files:**
- Create: `packages/client/src/lib/sandbox/workers/neutralize-apis.ts`
- Create: `packages/client/src/lib/sandbox/workers/python-worker.ts`
- Create: `packages/client/src/lib/sandbox/workers/js-worker.ts`
- Test: `packages/client/src/__tests__/lib/sandbox/workers/neutralize-apis.test.ts`

Per the design spec's testing strategy, testable pure logic is extracted into separate files. The worker entry points are thin wiring that loads a WASM runtime and delegates to extracted helpers. Worker entry points use `/* v8 ignore start */` only for the minimal WASM-loading glue; all logic that CAN be tested IS tested.

- [ ] **Step 1: Write tests for neutralize-apis.ts**

```typescript
// packages/client/src/__tests__/lib/sandbox/workers/neutralize-apis.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { neutralizeBrowserApis } from '../../../lib/sandbox/workers/neutralize-apis.js';

describe('neutralizeBrowserApis', () => {
  let fakeScope: Record<string, unknown>;

  beforeEach(() => {
    fakeScope = {
      fetch: vi.fn(),
      XMLHttpRequest: vi.fn(),
      WebSocket: vi.fn(),
      indexedDB: {},
      caches: {},
      EventSource: vi.fn(),
      postMessage: vi.fn(), // should NOT be deleted
    };
  });

  it('deletes fetch from the scope', () => {
    neutralizeBrowserApis(fakeScope);
    expect(fakeScope.fetch).toBeUndefined();
  });

  it('deletes XMLHttpRequest from the scope', () => {
    neutralizeBrowserApis(fakeScope);
    expect(fakeScope.XMLHttpRequest).toBeUndefined();
  });

  it('deletes WebSocket from the scope', () => {
    neutralizeBrowserApis(fakeScope);
    expect(fakeScope.WebSocket).toBeUndefined();
  });

  it('deletes indexedDB from the scope', () => {
    neutralizeBrowserApis(fakeScope);
    expect(fakeScope.indexedDB).toBeUndefined();
  });

  it('deletes caches from the scope', () => {
    neutralizeBrowserApis(fakeScope);
    expect(fakeScope.caches).toBeUndefined();
  });

  it('deletes EventSource from the scope', () => {
    neutralizeBrowserApis(fakeScope);
    expect(fakeScope.EventSource).toBeUndefined();
  });

  it('does not delete postMessage', () => {
    neutralizeBrowserApis(fakeScope);
    expect(fakeScope.postMessage).toBeDefined();
  });

  it('handles missing properties gracefully', () => {
    const emptyScope: Record<string, unknown> = {};
    expect(() => neutralizeBrowserApis(emptyScope)).not.toThrow();
  });
});
```

- [ ] **Step 2: Implement neutralize-apis.ts**

```typescript
// packages/client/src/lib/sandbox/workers/neutralize-apis.ts

// Defense-in-depth: neutralize browser APIs before loading any WASM runtime.
// Primary isolation is the WASM VM boundary (user code runs in WASM linear memory).
// This removes APIs from the worker global scope as a second layer of defense.
const APIS_TO_REMOVE = [
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'indexedDB',
  'caches',
  'EventSource',
] as const;

export function neutralizeBrowserApis(scope: Record<string, unknown>): void {
  for (const api of APIS_TO_REMOVE) {
    delete scope[api];
  }
}
```

- [ ] **Step 3: Run tests to verify they pass**

```bash
npx vitest run packages/client/src/__tests__/lib/sandbox/workers/neutralize-apis.test.ts
```

- [ ] **Step 4: Create python-worker.ts**

```typescript
// packages/client/src/lib/sandbox/workers/python-worker.ts
/* v8 ignore start — Worker entry point: loads WASM from CDN, untestable without real runtime */
import { neutralizeBrowserApis } from './neutralize-apis.js';

neutralizeBrowserApis(self as unknown as Record<string, unknown>);

interface ExecuteMessage {
  type: 'execute';
  files: Array<{ filename: string; content: string }>;
  entryFile: string;
  stdin?: string;
}

// Pyodide types (minimal, no npm dependency needed)
interface PyodideInterface {
  runPython(code: string): unknown;
  FS: {
    mkdir(path: string): void;
    writeFile(path: string, data: string): void;
  };
  setStdout(options: { batched: (text: string) => void }): void;
  setStderr(options: { batched: (text: string) => void }): void;
  runPythonAsync(code: string): Promise<unknown>;
}

declare function loadPyodide(options?: {
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
}): Promise<PyodideInterface>;

const PYODIDE_CDN = 'https://cdn.jsdelivr.net/pyodide/v0.27.1/full/pyodide.mjs';

self.addEventListener('message', (event: MessageEvent) => {
  const msg = event.data as ExecuteMessage;
  if (msg.type !== 'execute') return;
  void runPython(msg);
});

async function runPython(msg: ExecuteMessage): Promise<void> {
  const startTime = performance.now();

  try {
    self.postMessage({ type: 'loading', phase: 'runtime' });

    // Dynamic import from CDN — Pyodide is NOT an npm dependency
    const { loadPyodide: load } = (await import(/* @vite-ignore */ PYODIDE_CDN)) as {
      loadPyodide: typeof loadPyodide;
    };

    const pyodide = await load({
      stdout: (text: string) => self.postMessage({ type: 'stdout', data: text }),
      stderr: (text: string) => self.postMessage({ type: 'stderr', data: text }),
    });

    self.postMessage({ type: 'ready' });
    self.postMessage({ type: 'loading', phase: 'executing' });

    // Mount files in virtual filesystem
    try {
      pyodide.FS.mkdir('/home/user');
    } catch {
      // Directory may already exist
    }

    for (const file of msg.files) {
      pyodide.FS.writeFile(`/home/user/${file.filename}`, file.content);
    }

    // Set sys.path so imports between files work
    pyodide.runPython(`
import sys
if '/home/user' not in sys.path:
    sys.path.insert(0, '/home/user')
`);

    // Handle stdin if provided
    if (msg.stdin) {
      const stdinLines = msg.stdin.split('\n');
      pyodide.runPython(`
import sys, io
_stdin_lines = ${JSON.stringify(stdinLines)}
_stdin_idx = 0
class _StdinReader(io.TextIOBase):
    def readline(self, size=-1):
        global _stdin_idx
        if _stdin_idx < len(_stdin_lines):
            line = _stdin_lines[_stdin_idx] + '\\n'
            _stdin_idx += 1
            return line
        return ''
sys.stdin = _StdinReader()
`);
    }

    // Read and execute entry file
    const entryContent = msg.files.find((f) => f.filename === msg.entryFile)?.content ?? '';

    try {
      await pyodide.runPythonAsync(entryContent);
      const elapsed = performance.now() - startTime;
      self.postMessage({ type: 'done', exitCode: 0, executionTimeMs: Math.round(elapsed) });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      self.postMessage({ type: 'stderr', data: errorMessage });
      const elapsed = performance.now() - startTime;
      self.postMessage({ type: 'done', exitCode: 1, executionTimeMs: Math.round(elapsed) });
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    self.postMessage({
      type: 'error',
      message: `Failed to load Python runtime: ${errorMessage}`,
    });
  }
}
/* v8 ignore stop */
```

- [ ] **Step 5: Create js-worker.ts**

```typescript
// packages/client/src/lib/sandbox/workers/js-worker.ts
/* v8 ignore start — Worker entry point: loads WASM runtimes, untestable without real runtime */
import { neutralizeBrowserApis } from './neutralize-apis.js';

neutralizeBrowserApis(self as unknown as Record<string, unknown>);

interface ExecuteMessage {
  type: 'execute';
  language: string;
  files: Array<{ filename: string; content: string }>;
  entryFile: string;
  stdin?: string;
}

self.addEventListener('message', (event: MessageEvent) => {
  const msg = event.data as ExecuteMessage;
  if (msg.type !== 'execute') return;
  void runJavaScript(msg);
});

async function runJavaScript(msg: ExecuteMessage): Promise<void> {
  const startTime = performance.now();

  try {
    self.postMessage({ type: 'loading', phase: 'runtime' });

    const { getQuickJS } = await import('quickjs-emscripten');
    const QuickJS = await getQuickJS();

    let code = msg.files.find((f) => f.filename === msg.entryFile)?.content ?? '';

    // Transpile TypeScript if needed
    if (msg.language === 'typescript') {
      const esbuild = await import('esbuild-wasm');
      await esbuild.initialize({ wasmURL: '/node_modules/esbuild-wasm/esbuild.wasm' });
      const result = await esbuild.transform(code, {
        loader: 'ts',
        target: 'es2022',
      });
      code = result.code;
    }

    self.postMessage({ type: 'ready' });
    self.postMessage({ type: 'loading', phase: 'executing' });

    const runtime = QuickJS.newRuntime();
    runtime.setMemoryLimit(256 * 1024 * 1024); // 256MB
    runtime.setMaxStackSize(1024 * 1024); // 1MB stack

    const context = runtime.newContext();

    // Bridge console.log -> stdout
    const consoleHandle = context.newObject();

    const logHandle = context.newFunction('log', (...args) => {
      const parts = args.map((arg) => {
        const str = context.getString(arg);
        return str;
      });
      self.postMessage({ type: 'stdout', data: parts.join(' ') });
    });

    const errorHandle = context.newFunction('error', (...args) => {
      const parts = args.map((arg) => {
        const str = context.getString(arg);
        return str;
      });
      self.postMessage({ type: 'stderr', data: parts.join(' ') });
    });

    context.setProp(consoleHandle, 'log', logHandle);
    context.setProp(consoleHandle, 'error', errorHandle);
    context.setProp(consoleHandle, 'warn', errorHandle);
    context.setProp(context.global, 'console', consoleHandle);

    logHandle.dispose();
    errorHandle.dispose();
    consoleHandle.dispose();

    // Handle stdin if provided
    if (msg.stdin) {
      const stdinLines = msg.stdin.split('\n');
      const readlineHandle = context.newFunction('readline', () => {
        const line = stdinLines.shift() ?? '';
        return context.newString(line);
      });
      context.setProp(context.global, 'readline', readlineHandle);
      readlineHandle.dispose();
    }

    // Execute code
    const result = context.evalCode(code, msg.entryFile);

    if (result.error) {
      const errorStr = context.dump(result.error);
      result.error.dispose();
      self.postMessage({ type: 'stderr', data: String(errorStr) });
      const elapsed = performance.now() - startTime;
      self.postMessage({ type: 'done', exitCode: 1, executionTimeMs: Math.round(elapsed) });
    } else {
      result.value.dispose();
      const elapsed = performance.now() - startTime;
      self.postMessage({ type: 'done', exitCode: 0, executionTimeMs: Math.round(elapsed) });
    }

    context.dispose();
    runtime.dispose();
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    self.postMessage({
      type: 'error',
      message: `Failed to load JavaScript runtime: ${errorMessage}`,
    });
  }
}
/* v8 ignore stop */
```

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/lib/sandbox/workers/ packages/client/src/__tests__/lib/sandbox/workers/
git commit -m "feat(sandbox): add Web Workers with extracted neutralize-apis helper"
```

---

## Task 4a: RunButton Component

**Files:**
- Create: `packages/client/src/components/post/RunButton.vue`
- Test: `packages/client/src/__tests__/components/post/RunButton.test.ts`

A small overlay button with three states: idle (play), loading (spinner), running (stop).

- [ ] **Step 1: Write failing tests**

```typescript
// packages/client/src/__tests__/components/post/RunButton.test.ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import RunButton from '../../components/post/RunButton.vue';

describe('RunButton', () => {
  it('renders play icon when status is idle', () => {
    const wrapper = mount(RunButton, { props: { status: 'idle' } });
    expect(wrapper.find('[data-testid="run-play"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="run-stop"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="run-spinner"]').exists()).toBe(false);
  });

  it('renders spinner when status is loading', () => {
    const wrapper = mount(RunButton, { props: { status: 'loading' } });
    expect(wrapper.find('[data-testid="run-spinner"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="run-play"]').exists()).toBe(false);
  });

  it('renders stop icon when status is running', () => {
    const wrapper = mount(RunButton, { props: { status: 'running' } });
    expect(wrapper.find('[data-testid="run-stop"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="run-play"]').exists()).toBe(false);
  });

  it('renders play icon when status is done', () => {
    const wrapper = mount(RunButton, { props: { status: 'done' } });
    expect(wrapper.find('[data-testid="run-play"]').exists()).toBe(true);
  });

  it('renders play icon when status is error', () => {
    const wrapper = mount(RunButton, { props: { status: 'error' } });
    expect(wrapper.find('[data-testid="run-play"]').exists()).toBe(true);
  });

  it('emits run when clicked in idle state', async () => {
    const wrapper = mount(RunButton, { props: { status: 'idle' } });
    await wrapper.find('button').trigger('click');
    expect(wrapper.emitted('run')).toHaveLength(1);
  });

  it('emits abort when clicked in running state', async () => {
    const wrapper = mount(RunButton, { props: { status: 'running' } });
    await wrapper.find('button').trigger('click');
    expect(wrapper.emitted('abort')).toHaveLength(1);
  });

  it('does not emit when clicked in loading state', async () => {
    const wrapper = mount(RunButton, { props: { status: 'loading' } });
    await wrapper.find('button').trigger('click');
    expect(wrapper.emitted('run')).toBeUndefined();
    expect(wrapper.emitted('abort')).toBeUndefined();
  });

  it('shows tooltip for disabled unsupported language', () => {
    const wrapper = mount(RunButton, {
      props: { status: 'idle', disabled: true, disabledReason: 'Run not available for Go' },
    });
    expect(wrapper.find('button').attributes('disabled')).toBeDefined();
    expect(wrapper.find('button').attributes('title')).toBe('Run not available for Go');
  });

  it('has accessible aria-label for idle state', () => {
    const wrapper = mount(RunButton, { props: { status: 'idle' } });
    expect(wrapper.find('button').attributes('aria-label')).toBe('Run code');
  });

  it('has accessible aria-label for running state', () => {
    const wrapper = mount(RunButton, { props: { status: 'running' } });
    expect(wrapper.find('button').attributes('aria-label')).toBe('Stop execution');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run packages/client/src/__tests__/components/post/RunButton.test.ts
```

- [ ] **Step 3: Implement RunButton.vue**

```vue
<!-- packages/client/src/components/post/RunButton.vue -->
<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  status: 'idle' | 'loading' | 'running' | 'done' | 'error';
  disabled?: boolean;
  disabledReason?: string;
}>();

const emit = defineEmits<{
  run: [];
  abort: [];
}>();

function handleClick() {
  if (props.disabled) return;
  if (props.status === 'loading') return;
  if (props.status === 'running') {
    emit('abort');
  } else {
    emit('run');
  }
}

const showPlay = computed(() => ['idle', 'done', 'error'].includes(props.status));
</script>

<template>
  <button
    :disabled="disabled || status === 'loading'"
    :title="disabled ? disabledReason : undefined"
    :aria-label="status === 'running' ? 'Stop execution' : 'Run code'"
    class="inline-flex items-center justify-center rounded p-1.5 text-sm transition-colors"
    :class="[
      disabled
        ? 'cursor-not-allowed text-gray-400 dark:text-gray-600'
        : status === 'running'
          ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20'
          : 'bg-primary/10 text-primary hover:bg-primary/20',
    ]"
    @click="handleClick"
  >
    <!-- Play icon -->
    <svg
      v-if="showPlay"
      data-testid="run-play"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      class="h-4 w-4"
    >
      <path d="M6.3 2.84A1.5 1.5 0 004 4.11v11.78a1.5 1.5 0 002.3 1.27l9.344-5.891a1.5 1.5 0 000-2.538L6.3 2.841z" />
    </svg>

    <!-- Spinner -->
    <svg
      v-else-if="status === 'loading'"
      data-testid="run-spinner"
      class="h-4 w-4 animate-spin"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>

    <!-- Stop icon -->
    <svg
      v-else-if="status === 'running'"
      data-testid="run-stop"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      class="h-4 w-4"
    >
      <rect x="4" y="4" width="12" height="12" rx="1" />
    </svg>
  </button>
</template>
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run packages/client/src/__tests__/components/post/RunButton.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/post/RunButton.vue packages/client/src/__tests__/components/post/RunButton.test.ts
git commit -m "feat(sandbox): add RunButton component with play/stop/loading states"
```

---

## Task 4b: ExecutionOutput Component

**Files:**
- Create: `packages/client/src/components/post/ExecutionOutput.vue`
- Test: `packages/client/src/__tests__/components/post/ExecutionOutput.test.ts`

Displays streaming output below the code viewer. All output via `{{ }}` text interpolation — never `v-html`. Output capped at 10,000 lines / 1MB.

- [ ] **Step 1: Write failing tests**

```typescript
// packages/client/src/__tests__/components/post/ExecutionOutput.test.ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ExecutionOutput from '../../components/post/ExecutionOutput.vue';

interface OutputLine {
  stream: 'stdout' | 'stderr';
  text: string;
  timestamp: number;
}

describe('ExecutionOutput', () => {
  it('renders nothing when output is empty and status is idle', () => {
    const wrapper = mount(ExecutionOutput, {
      props: { output: [], status: 'idle', executionTime: null, exitCode: null, truncated: false },
    });
    expect(wrapper.find('[data-testid="execution-output"]').exists()).toBe(false);
  });

  it('renders output panel when output has lines', () => {
    const output: OutputLine[] = [
      { stream: 'stdout', text: 'Hello, world!', timestamp: 1 },
    ];
    const wrapper = mount(ExecutionOutput, {
      props: { output, status: 'done', executionTime: 50, exitCode: 0, truncated: false },
    });
    expect(wrapper.find('[data-testid="execution-output"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Hello, world!');
  });

  it('renders stdout lines without special styling', () => {
    const output: OutputLine[] = [
      { stream: 'stdout', text: 'normal output', timestamp: 1 },
    ];
    const wrapper = mount(ExecutionOutput, {
      props: { output, status: 'done', executionTime: 50, exitCode: 0, truncated: false },
    });
    const line = wrapper.find('[data-testid="output-line-0"]');
    expect(line.text()).toBe('normal output');
    expect(line.classes()).not.toContain('text-red-400');
  });

  it('renders stderr lines with red styling', () => {
    const output: OutputLine[] = [
      { stream: 'stderr', text: 'error output', timestamp: 1 },
    ];
    const wrapper = mount(ExecutionOutput, {
      props: { output, status: 'done', executionTime: 50, exitCode: 1, truncated: false },
    });
    const line = wrapper.find('[data-testid="output-line-0"]');
    expect(line.text()).toBe('error output');
    expect(line.classes()).toContain('text-red-400');
  });

  it('uses text interpolation not v-html', () => {
    const output: OutputLine[] = [
      { stream: 'stdout', text: '<script>alert("xss")</script>', timestamp: 1 },
    ];
    const wrapper = mount(ExecutionOutput, {
      props: { output, status: 'done', executionTime: 50, exitCode: 0, truncated: false },
    });
    // Text content should contain the raw HTML string, not interpret it
    expect(wrapper.text()).toContain('<script>alert("xss")</script>');
    // innerHTML should have escaped entities
    const line = wrapper.find('[data-testid="output-line-0"]');
    expect(line.element.innerHTML).not.toContain('<script>');
  });

  it('shows exit code 0 with success styling', () => {
    const wrapper = mount(ExecutionOutput, {
      props: {
        output: [{ stream: 'stdout' as const, text: 'ok', timestamp: 1 }],
        status: 'done',
        executionTime: 123,
        exitCode: 0,
        truncated: false,
      },
    });
    const statusBar = wrapper.find('[data-testid="status-bar"]');
    expect(statusBar.text()).toContain('Exit: 0');
    expect(statusBar.text()).toContain('123ms');
  });

  it('shows exit code 1 with error styling', () => {
    const wrapper = mount(ExecutionOutput, {
      props: {
        output: [{ stream: 'stderr' as const, text: 'err', timestamp: 1 }],
        status: 'done',
        executionTime: 456,
        exitCode: 1,
        truncated: false,
      },
    });
    const statusBar = wrapper.find('[data-testid="status-bar"]');
    expect(statusBar.text()).toContain('Exit: 1');
  });

  it('shows truncation indicator when truncated', () => {
    const wrapper = mount(ExecutionOutput, {
      props: {
        output: [{ stream: 'stdout' as const, text: 'line', timestamp: 1 }],
        status: 'done',
        executionTime: 50,
        exitCode: 0,
        truncated: true,
      },
    });
    expect(wrapper.text()).toContain('Output truncated');
  });

  it('does not show truncation indicator when not truncated', () => {
    const wrapper = mount(ExecutionOutput, {
      props: {
        output: [{ stream: 'stdout' as const, text: 'line', timestamp: 1 }],
        status: 'done',
        executionTime: 50,
        exitCode: 0,
        truncated: false,
      },
    });
    expect(wrapper.text()).not.toContain('Output truncated');
  });

  it('shows timed out indicator when status is error and no exit code', () => {
    const wrapper = mount(ExecutionOutput, {
      props: {
        output: [{ stream: 'stderr' as const, text: 'timeout', timestamp: 1 }],
        status: 'error',
        executionTime: 30000,
        exitCode: null,
        truncated: false,
      },
    });
    const statusBar = wrapper.find('[data-testid="status-bar"]');
    expect(statusBar.text()).toContain('30000ms');
  });

  it('emits clear when clear button is clicked', async () => {
    const wrapper = mount(ExecutionOutput, {
      props: {
        output: [{ stream: 'stdout' as const, text: 'line', timestamp: 1 }],
        status: 'done',
        executionTime: 50,
        exitCode: 0,
        truncated: false,
      },
    });
    await wrapper.find('[data-testid="clear-button"]').trigger('click');
    expect(wrapper.emitted('clear')).toHaveLength(1);
  });

  it('renders panel when status is loading even with empty output', () => {
    const wrapper = mount(ExecutionOutput, {
      props: { output: [], status: 'loading', executionTime: null, exitCode: null, truncated: false },
    });
    expect(wrapper.find('[data-testid="execution-output"]').exists()).toBe(true);
  });

  it('renders panel when status is running even with empty output', () => {
    const wrapper = mount(ExecutionOutput, {
      props: { output: [], status: 'running', executionTime: null, exitCode: null, truncated: false },
    });
    expect(wrapper.find('[data-testid="execution-output"]').exists()).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run packages/client/src/__tests__/components/post/ExecutionOutput.test.ts
```

- [ ] **Step 3: Implement ExecutionOutput.vue**

```vue
<!-- packages/client/src/components/post/ExecutionOutput.vue -->
<script setup lang="ts">
import { computed } from 'vue';

interface OutputLine {
  stream: 'stdout' | 'stderr';
  text: string;
  timestamp: number;
}

const props = defineProps<{
  output: OutputLine[];
  status: 'idle' | 'loading' | 'running' | 'done' | 'error';
  executionTime: number | null;
  exitCode: number | null;
  truncated: boolean;
}>();

defineEmits<{ clear: [] }>();

const isVisible = computed(() => ['loading', 'running', 'done', 'error'].includes(props.status) || props.output.length > 0);
</script>

<template>
  <div
    v-if="isVisible"
    data-testid="execution-output"
    class="mt-2 overflow-hidden rounded-lg border border-gray-200 bg-gray-900 dark:border-gray-700"
  >
    <!-- Output area -->
    <div class="max-h-80 overflow-y-auto p-3">
      <pre class="font-mono text-sm leading-relaxed"><template
          v-for="(line, i) in output"
          :key="i"
        ><span
            :data-testid="`output-line-${i}`"
            :class="line.stream === 'stderr' ? 'text-red-400' : 'text-gray-100'"
          >{{ line.text }}
</span></template></pre>
      <div
        v-if="status === 'loading'"
        class="text-sm text-gray-400"
      >
        Loading runtime...
      </div>
      <div
        v-if="status === 'running' && output.length === 0"
        class="text-sm text-gray-400"
      >
        Running...
      </div>
    </div>

    <!-- Truncation indicator -->
    <div
      v-if="truncated"
      class="border-t border-yellow-500/30 bg-yellow-500/10 px-3 py-1.5 text-xs text-yellow-400"
    >
      Output truncated (limit: 10,000 lines)
    </div>

    <!-- Status bar -->
    <div
      v-if="status === 'done' || status === 'error' || executionTime !== null"
      data-testid="status-bar"
      class="flex items-center justify-between border-t border-gray-700 px-3 py-1.5 text-xs"
    >
      <div class="flex items-center gap-3">
        <span
          v-if="exitCode !== null"
          :class="exitCode === 0 ? 'text-green-400' : 'text-red-400'"
        >
          Exit: {{ exitCode }}
        </span>
        <span
          v-if="executionTime !== null"
          class="text-gray-400"
        >
          {{ executionTime }}ms
        </span>
      </div>
      <button
        data-testid="clear-button"
        class="text-gray-400 hover:text-gray-200"
        @click="$emit('clear')"
      >
        Clear
      </button>
    </div>
  </div>
</template>
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run packages/client/src/__tests__/components/post/ExecutionOutput.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/post/ExecutionOutput.vue packages/client/src/__tests__/components/post/ExecutionOutput.test.ts
git commit -m "feat(sandbox): add ExecutionOutput component with streaming display and XSS-safe rendering"
```

---

## Task 5: useCodeRunner Composable

**Files:**
- Create: `packages/client/src/composables/useCodeRunner.ts`
- Test: `packages/client/src/__tests__/composables/useCodeRunner.test.ts`

Reactive bridge between Vue and SandboxManager. Manages output accumulation with truncation limits, status transitions, and cleanup on unmount.

- [ ] **Step 1: Write failing tests**

```typescript
// packages/client/src/__tests__/composables/useCodeRunner.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { nextTick } from 'vue';

// Mock the manager module
const mockExecute = vi.fn();
const mockAbort = vi.fn();

vi.mock('../../lib/sandbox/manager.js', () => ({
  SandboxManager: vi.fn().mockImplementation(() => ({
    execute: mockExecute.mockReturnValue({ abort: mockAbort }),
  })),
}));

// Must import after mock
import { useCodeRunner } from '../../composables/useCodeRunner.js';

describe('useCodeRunner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockReturnValue({ abort: mockAbort });
  });

  it('starts with idle status and empty output', () => {
    const { status, output, executionTime, exitCode, truncated } = useCodeRunner();
    expect(status.value).toBe('idle');
    expect(output.value).toEqual([]);
    expect(executionTime.value).toBeNull();
    expect(exitCode.value).toBeNull();
    expect(truncated.value).toBe(false);
  });

  it('sets status to loading when run is called', () => {
    const { run, status } = useCodeRunner();
    run({
      language: 'python',
      files: [{ filename: 'main.py', content: 'print("hi")' }],
      entryFile: 'main.py',
    });
    expect(status.value).toBe('loading');
  });

  it('calls sandboxManager.execute with correct options', () => {
    const { run } = useCodeRunner();
    run({
      language: 'python',
      files: [{ filename: 'main.py', content: 'print("hi")' }],
      entryFile: 'main.py',
    });
    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        language: 'python',
        files: [{ filename: 'main.py', content: 'print("hi")' }],
        entryFile: 'main.py',
      }),
    );
  });

  it('accumulates output lines from onOutput callback', async () => {
    let capturedOnOutput: ((stream: 'stdout' | 'stderr', data: string) => void) | undefined;
    mockExecute.mockImplementation((opts: { onOutput: typeof capturedOnOutput }) => {
      capturedOnOutput = opts.onOutput;
      return { abort: mockAbort };
    });

    const { run, output } = useCodeRunner();
    run({
      language: 'python',
      files: [{ filename: 'main.py', content: '' }],
      entryFile: 'main.py',
    });

    capturedOnOutput?.('stdout', 'line 1');
    capturedOnOutput?.('stderr', 'error line');
    await nextTick();

    expect(output.value).toHaveLength(2);
    expect(output.value[0]?.stream).toBe('stdout');
    expect(output.value[0]?.text).toBe('line 1');
    expect(output.value[1]?.stream).toBe('stderr');
    expect(output.value[1]?.text).toBe('error line');
  });

  it('sets status to done and records results on onComplete', async () => {
    let capturedOnComplete: ((result: { exitCode: number; executionTimeMs: number }) => void) | undefined;
    mockExecute.mockImplementation((opts: { onComplete: typeof capturedOnComplete }) => {
      capturedOnComplete = opts.onComplete;
      return { abort: mockAbort };
    });

    const { run, status, executionTime, exitCode } = useCodeRunner();
    run({
      language: 'python',
      files: [{ filename: 'main.py', content: '' }],
      entryFile: 'main.py',
    });

    capturedOnComplete?.({ exitCode: 0, executionTimeMs: 123 });
    await nextTick();

    expect(status.value).toBe('done');
    expect(executionTime.value).toBe(123);
    expect(exitCode.value).toBe(0);
  });

  it('sets status to error on onError', async () => {
    let capturedOnError: ((error: string) => void) | undefined;
    mockExecute.mockImplementation((opts: { onError: typeof capturedOnError }) => {
      capturedOnError = opts.onError;
      return { abort: mockAbort };
    });

    const { run, status, output } = useCodeRunner();
    run({
      language: 'python',
      files: [{ filename: 'main.py', content: '' }],
      entryFile: 'main.py',
    });

    capturedOnError?.('Execution timed out (30s limit)');
    await nextTick();

    expect(status.value).toBe('error');
    expect(output.value).toHaveLength(1);
    expect(output.value[0]?.stream).toBe('stderr');
    expect(output.value[0]?.text).toBe('Execution timed out (30s limit)');
  });

  it('updates status to running when onLoading phase is executing', async () => {
    let capturedOnLoading: ((phase: 'runtime' | 'executing') => void) | undefined;
    mockExecute.mockImplementation((opts: { onLoading: typeof capturedOnLoading }) => {
      capturedOnLoading = opts.onLoading;
      return { abort: mockAbort };
    });

    const { run, status } = useCodeRunner();
    run({
      language: 'python',
      files: [{ filename: 'main.py', content: '' }],
      entryFile: 'main.py',
    });

    capturedOnLoading?.('executing');
    await nextTick();

    expect(status.value).toBe('running');
  });

  it('abort calls the handle abort function', () => {
    const { run, abort } = useCodeRunner();
    run({
      language: 'python',
      files: [{ filename: 'main.py', content: '' }],
      entryFile: 'main.py',
    });
    abort();
    expect(mockAbort).toHaveBeenCalled();
  });

  it('clear resets output and status to idle', async () => {
    let capturedOnOutput: ((stream: 'stdout' | 'stderr', data: string) => void) | undefined;
    let capturedOnComplete: ((result: { exitCode: number; executionTimeMs: number }) => void) | undefined;
    mockExecute.mockImplementation((opts: { onOutput: typeof capturedOnOutput; onComplete: typeof capturedOnComplete }) => {
      capturedOnOutput = opts.onOutput;
      capturedOnComplete = opts.onComplete;
      return { abort: mockAbort };
    });

    const { run, clear, output, status, executionTime, exitCode, truncated } = useCodeRunner();
    run({
      language: 'python',
      files: [{ filename: 'main.py', content: '' }],
      entryFile: 'main.py',
    });

    capturedOnOutput?.('stdout', 'hi');
    capturedOnComplete?.({ exitCode: 0, executionTimeMs: 50 });
    await nextTick();

    clear();
    await nextTick();

    expect(output.value).toEqual([]);
    expect(status.value).toBe('idle');
    expect(executionTime.value).toBeNull();
    expect(exitCode.value).toBeNull();
    expect(truncated.value).toBe(false);
  });

  it('truncates output at MAX_OUTPUT_LINES (10000)', async () => {
    let capturedOnOutput: ((stream: 'stdout' | 'stderr', data: string) => void) | undefined;
    mockExecute.mockImplementation((opts: { onOutput: typeof capturedOnOutput }) => {
      capturedOnOutput = opts.onOutput;
      return { abort: mockAbort };
    });

    const { run, output, truncated } = useCodeRunner();
    run({
      language: 'python',
      files: [{ filename: 'main.py', content: '' }],
      entryFile: 'main.py',
    });

    // Add 10001 lines
    for (let i = 0; i < 10_001; i++) {
      capturedOnOutput?.('stdout', `line ${i}`);
    }
    await nextTick();

    expect(output.value).toHaveLength(10_000);
    expect(truncated.value).toBe(true);
  });

  it('truncates output at MAX_OUTPUT_BYTES (1MB)', async () => {
    let capturedOnOutput: ((stream: 'stdout' | 'stderr', data: string) => void) | undefined;
    mockExecute.mockImplementation((opts: { onOutput: typeof capturedOnOutput }) => {
      capturedOnOutput = opts.onOutput;
      return { abort: mockAbort };
    });

    const { run, output, truncated } = useCodeRunner();
    run({
      language: 'python',
      files: [{ filename: 'main.py', content: '' }],
      entryFile: 'main.py',
    });

    // Each line is ~1KB, so ~1024 lines should exceed 1MB
    const bigLine = 'x'.repeat(1024);
    for (let i = 0; i < 1025; i++) {
      capturedOnOutput?.('stdout', bigLine);
    }
    await nextTick();

    expect(truncated.value).toBe(true);
    // Should have stopped before reaching 10,000 lines
    expect(output.value.length).toBeLessThan(1025);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run packages/client/src/__tests__/composables/useCodeRunner.test.ts
```

- [ ] **Step 3: Implement useCodeRunner.ts**

```typescript
// packages/client/src/composables/useCodeRunner.ts
import { ref, onUnmounted } from 'vue';
import { SandboxManager } from '../lib/sandbox/manager.js';
import type { SandboxLanguage } from '../lib/sandbox/languages.js';
import type { ExecuteHandle } from '../lib/sandbox/manager.js';

export interface OutputLine {
  stream: 'stdout' | 'stderr';
  text: string;
  timestamp: number;
}

const MAX_OUTPUT_LINES = 10_000;
const MAX_OUTPUT_BYTES = 1_048_576; // 1MB

const manager = new SandboxManager((language: SandboxLanguage) => {
  const url =
    language === 'python'
      ? new URL('../lib/sandbox/workers/python-worker.ts', import.meta.url)
      : new URL('../lib/sandbox/workers/js-worker.ts', import.meta.url);
  return new Worker(url, { type: 'module' });
});

export function useCodeRunner() {
  const output = ref<OutputLine[]>([]);
  const status = ref<'idle' | 'loading' | 'running' | 'done' | 'error'>('idle');
  const executionTime = ref<number | null>(null);
  const exitCode = ref<number | null>(null);
  const truncated = ref(false);
  let currentHandle: ExecuteHandle | null = null;
  let totalBytes = 0;

  function run(options: {
    language: SandboxLanguage;
    files: Array<{ filename: string; content: string }>;
    entryFile: string;
    stdin?: string;
  }): void {
    // Reset state
    output.value = [];
    truncated.value = false;
    totalBytes = 0;
    executionTime.value = null;
    exitCode.value = null;
    status.value = 'loading';

    currentHandle = manager.execute({
      ...options,
      onOutput(stream, data) {
        if (truncated.value) return;

        const byteLength = new TextEncoder().encode(data).length;
        if (output.value.length >= MAX_OUTPUT_LINES || totalBytes + byteLength > MAX_OUTPUT_BYTES) {
          truncated.value = true;
          return;
        }

        totalBytes += byteLength;
        output.value.push({ stream, text: data, timestamp: Date.now() });
      },
      onComplete(result) {
        status.value = 'done';
        executionTime.value = result.executionTimeMs;
        exitCode.value = result.exitCode;
        currentHandle = null;
      },
      onError(error) {
        status.value = 'error';
        output.value.push({ stream: 'stderr', text: error, timestamp: Date.now() });
        currentHandle = null;
      },
      onLoading(phase) {
        if (phase === 'executing') {
          status.value = 'running';
        }
      },
    });
  }

  function abort(): void {
    currentHandle?.abort();
  }

  function clear(): void {
    output.value = [];
    status.value = 'idle';
    executionTime.value = null;
    exitCode.value = null;
    truncated.value = false;
    totalBytes = 0;
  }

  onUnmounted(() => {
    currentHandle?.abort();
  });

  return { output, status, executionTime, exitCode, truncated, run, abort, clear };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run packages/client/src/__tests__/composables/useCodeRunner.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/composables/useCodeRunner.ts packages/client/src/__tests__/composables/useCodeRunner.test.ts
git commit -m "feat(sandbox): add useCodeRunner composable with output truncation"
```

---

## Task 6: CodeRunner Wrapper Component

**Files:**
- Create: `packages/client/src/components/post/CodeRunner.vue`
- Test: `packages/client/src/__tests__/components/post/CodeRunner.test.ts`

Composes RunButton + ExecutionOutput. Handles content resolution for multi-file posts (fetches file content via API on Run click). For single-file posts uses content passed as prop.

- [ ] **Step 1: Write failing tests**

```typescript
// packages/client/src/__tests__/components/post/CodeRunner.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

const mockRun = vi.fn();
const mockAbort = vi.fn();
const mockClear = vi.fn();

vi.mock('../../composables/useCodeRunner.js', () => ({
  useCodeRunner: vi.fn(() => ({
    output: { value: [] },
    status: { value: 'idle' },
    executionTime: { value: null },
    exitCode: { value: null },
    truncated: { value: false },
    run: mockRun,
    abort: mockAbort,
    clear: mockClear,
  })),
}));

vi.mock('../../lib/api.js', () => ({
  apiFetch: vi.fn(),
}));

import CodeRunner from '../../components/post/CodeRunner.vue';
import { apiFetch } from '../../lib/api.js';

describe('CodeRunner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders disabled RunButton for recognized but unsupported language (go)', () => {
    const wrapper = mount(CodeRunner, {
      props: { postId: '1', revisionId: 'r1', language: 'go' },
    });
    expect(wrapper.find('[data-testid="code-runner"]').exists()).toBe(true);
    const runButton = wrapper.findComponent({ name: 'RunButton' });
    expect(runButton.exists()).toBe(true);
    expect(runButton.props('disabled')).toBe(true);
    expect(runButton.props('disabledReason')).toBe('Run not available for go');
  });

  it('does not render when language is null', () => {
    const wrapper = mount(CodeRunner, {
      props: { postId: '1', revisionId: 'r1', language: null },
    });
    expect(wrapper.find('[data-testid="code-runner"]').exists()).toBe(false);
  });

  it('does not render when language is unrecognized (brainfuck)', () => {
    const wrapper = mount(CodeRunner, {
      props: { postId: '1', revisionId: 'r1', language: 'brainfuck' },
    });
    expect(wrapper.find('[data-testid="code-runner"]').exists()).toBe(false);
  });

  it('renders RunButton for supported language', () => {
    const wrapper = mount(CodeRunner, {
      props: { postId: '1', revisionId: 'r1', language: 'python', singleFileContent: 'print("hi")' },
    });
    expect(wrapper.find('[data-testid="code-runner"]').exists()).toBe(true);
    expect(wrapper.findComponent({ name: 'RunButton' }).exists()).toBe(true);
  });

  it('calls run with single-file content on Run click', async () => {
    const wrapper = mount(CodeRunner, {
      props: { postId: '1', revisionId: 'r1', language: 'python', singleFileContent: 'print("hi")' },
    });

    const runButton = wrapper.findComponent({ name: 'RunButton' });
    runButton.vm.$emit('run');
    await flushPromises();

    expect(mockRun).toHaveBeenCalledWith({
      language: 'python',
      files: [{ filename: 'main.py', content: 'print("hi")' }],
      entryFile: 'main.py',
    });
  });

  it('fetches file contents for multi-file posts on Run click', async () => {
    const mockResponse = { ok: true, text: vi.fn().mockResolvedValue('file content') };
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

    const wrapper = mount(CodeRunner, {
      props: {
        postId: 'p1',
        revisionId: 'r1',
        language: 'python',
        files: [
          { id: 'f1', postId: 'p1', revisionId: 'r1', filename: 'main.py', mimeType: 'text/x-python', fileSize: 100, sortOrder: 0, createdAt: new Date() },
          { id: 'f2', postId: 'p1', revisionId: 'r1', filename: 'utils.py', mimeType: 'text/x-python', fileSize: 50, sortOrder: 1, createdAt: new Date() },
        ],
        activeFilename: 'main.py',
      },
    });

    const runButton = wrapper.findComponent({ name: 'RunButton' });
    runButton.vm.$emit('run');
    await flushPromises();

    expect(apiFetch).toHaveBeenCalledWith('/api/posts/p1/files/f1');
    expect(apiFetch).toHaveBeenCalledWith('/api/posts/p1/files/f2');
    expect(mockRun).toHaveBeenCalledWith({
      language: 'python',
      files: [
        { filename: 'main.py', content: 'file content' },
        { filename: 'utils.py', content: 'file content' },
      ],
      entryFile: 'main.py',
    });
  });

  it('skips binary files when fetching multi-file content', async () => {
    const mockResponse = { ok: true, text: vi.fn().mockResolvedValue('code') };
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

    const wrapper = mount(CodeRunner, {
      props: {
        postId: 'p1',
        revisionId: 'r1',
        language: 'python',
        files: [
          { id: 'f1', postId: 'p1', revisionId: 'r1', filename: 'main.py', mimeType: 'text/x-python', fileSize: 100, sortOrder: 0, createdAt: new Date() },
          { id: 'f2', postId: 'p1', revisionId: 'r1', filename: 'photo.png', mimeType: 'image/png', fileSize: 5000, sortOrder: 1, createdAt: new Date() },
        ],
        activeFilename: 'main.py',
      },
    });

    const runButton = wrapper.findComponent({ name: 'RunButton' });
    runButton.vm.$emit('run');
    await flushPromises();

    // Should only fetch the text file, not the image
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledWith('/api/posts/p1/files/f1');
  });

  it('emits abort on abort click', () => {
    const wrapper = mount(CodeRunner, {
      props: { postId: '1', revisionId: 'r1', language: 'python', singleFileContent: 'x' },
    });
    const runButton = wrapper.findComponent({ name: 'RunButton' });
    runButton.vm.$emit('abort');
    expect(mockAbort).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run packages/client/src/__tests__/components/post/CodeRunner.test.ts
```

- [ ] **Step 3: Implement CodeRunner.vue**

```vue
<!-- packages/client/src/components/post/CodeRunner.vue -->
<script setup lang="ts">
import { useCodeRunner } from '../../composables/useCodeRunner.js';
import { isSandboxLanguage, languageToExtension } from '../../lib/sandbox/languages.js';
import type { SandboxLanguage } from '../../lib/sandbox/languages.js';
import { apiFetch } from '../../lib/api.js';
import type { PostFile } from '@forge/shared';
import RunButton from './RunButton.vue';
import ExecutionOutput from './ExecutionOutput.vue';

const props = defineProps<{
  postId: string;
  revisionId: string;
  language: string | null;
  singleFileContent?: string;
  files?: PostFile[];
  activeFilename?: string;
}>();

const supported = isSandboxLanguage(props.language);
const { output, status, executionTime, exitCode, truncated, run, abort, clear } = useCodeRunner();

// Known programming languages that could plausibly have a Run button
const RECOGNIZED_LANGUAGES = [
  'python', 'javascript', 'typescript', 'go', 'rust', 'java', 'c', 'cpp',
  'csharp', 'ruby', 'php', 'swift', 'kotlin', 'scala', 'haskell', 'lua',
  'perl', 'r', 'dart', 'elixir', 'clojure', 'zig', 'nim',
] as const;

const isRecognizedLanguage = props.language !== null && RECOGNIZED_LANGUAGES.includes(props.language as (typeof RECOGNIZED_LANGUAGES)[number]);
const showDisabled = !supported && isRecognizedLanguage;

function isTextMimeType(mimeType: string | null): boolean {
  if (!mimeType) return true; // Assume text if unknown
  return mimeType.startsWith('text/') || mimeType === 'application/json' || mimeType === 'application/javascript';
}

async function handleRun(): Promise<void> {
  if (!supported) return;
  const lang = props.language as SandboxLanguage;

  if (props.singleFileContent !== undefined) {
    // Single-file post
    const ext = languageToExtension(lang);
    const filename = `main${ext}`;
    run({
      language: lang,
      files: [{ filename, content: props.singleFileContent }],
      entryFile: filename,
    });
    return;
  }

  // Multi-file post: fetch content for all text files
  if (!props.files?.length) return;

  const textFiles = props.files.filter((f) => isTextMimeType(f.mimeType));

  try {
    const contents = await Promise.all(
      textFiles.map(async (file) => {
        const response = await apiFetch(`/api/posts/${props.postId}/files/${file.id}`);
        if (!response.ok) throw new Error(`Failed to load file: ${file.filename}`);
        const content = await response.text();
        return { filename: file.filename, content };
      }),
    );

    const entryFile = props.activeFilename ?? textFiles[0]?.filename ?? 'main.js';

    run({ language: lang, files: contents, entryFile });
  } catch (err) {
    // Content fetch failed — show error in output
    output.value = [
      {
        stream: 'stderr',
        text: err instanceof Error ? err.message : 'Failed to load files',
        timestamp: Date.now(),
      },
    ];
    status.value = 'error';
  }
}
</script>

<template>
  <div
    v-if="supported || showDisabled"
    data-testid="code-runner"
  >
    <div class="flex items-center justify-end py-1">
      <RunButton
        v-if="supported"
        :status="status"
        @run="handleRun"
        @abort="abort"
      />
      <RunButton
        v-else
        status="idle"
        :disabled="true"
        :disabled-reason="`Run not available for ${language}`"
      />
    </div>
    <ExecutionOutput
      v-if="supported"
      :output="output"
      :status="status"
      :execution-time="executionTime"
      :exit-code="exitCode"
      :truncated="truncated"
      @clear="clear"
    />
  </div>
</template>
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run packages/client/src/__tests__/components/post/CodeRunner.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/post/CodeRunner.vue packages/client/src/__tests__/components/post/CodeRunner.test.ts
git commit -m "feat(sandbox): add CodeRunner wrapper with content resolution"
```

---

## Task 7: PostDetail Integration

**Files:**
- Modify: `packages/client/src/components/post/PostDetail.vue`

Add CodeRunner to both single-file and multi-file layouts. Only renders when `contentType === 'snippet'` and language is sandbox-supported.

- [ ] **Step 1: Add import to PostDetail.vue script section**

Add after existing component imports (around line 82):

```typescript
import CodeRunner from './CodeRunner.vue';
```

- [ ] **Step 2: Add CodeRunner to multi-file layout**

In the multi-file layout section (after `<FilePreview>`, around line 18), add:

```vue
<CodeRunner
  v-if="fullPost?.contentType === 'snippet'"
  :post-id="fullPost.id"
  :revision-id="revision?.id ?? ''"
  :language="fullPost.language ?? null"
  :files="files"
  :active-filename="filesStore.activeFileId ? files.find(f => f.id === filesStore.activeFileId)?.filename : undefined"
/>
```

- [ ] **Step 3: Add CodeRunner to single-file layout**

In the single-file layout section (after `</CodeViewer>`, around line 29), add:

```vue
<CodeRunner
  v-if="fullPost?.contentType === 'snippet'"
  :post-id="fullPost.id"
  :revision-id="revision?.id ?? ''"
  :language="fullPost.language ?? null"
  :single-file-content="revision?.content ?? ''"
/>
```

- [ ] **Step 4: Add PostDetail integration tests for CodeRunner**

Add tests to the existing PostDetail test file (`packages/client/src/__tests__/components/post/PostDetail.test.ts`) that verify the new CodeRunner conditional rendering branches. The exact test approach depends on the existing test structure, but must cover:

```typescript
// Add to existing PostDetail test file
describe('CodeRunner integration', () => {
  it('renders CodeRunner when contentType is snippet and language is supported', async () => {
    // Mount PostDetail with a post that has contentType: 'snippet', language: 'python'
    // Assert CodeRunner component is present
    const wrapper = mount(PostDetail, {
      props: {
        post: { ...mockPost, contentType: 'snippet', language: 'python' },
      },
      global: { stubs: { CodeRunner: true, CodeViewer: true, CommentSection: true } },
    });
    // After fullPost loads (mock API response), verify CodeRunner renders
    await flushPromises();
    expect(wrapper.findComponent({ name: 'CodeRunner' }).exists()).toBe(true);
  });

  it('does not render CodeRunner when contentType is not snippet', async () => {
    const wrapper = mount(PostDetail, {
      props: {
        post: { ...mockPost, contentType: 'document', language: null },
      },
      global: { stubs: { CodeRunner: true, CodeViewer: true, CommentSection: true } },
    });
    await flushPromises();
    expect(wrapper.findComponent({ name: 'CodeRunner' }).exists()).toBe(false);
  });

  it('does not render CodeRunner when contentType is prompt', async () => {
    const wrapper = mount(PostDetail, {
      props: {
        post: { ...mockPost, contentType: 'prompt', language: 'python' },
      },
      global: { stubs: { CodeRunner: true, CodeViewer: true, CommentSection: true } },
    });
    await flushPromises();
    expect(wrapper.findComponent({ name: 'CodeRunner' }).exists()).toBe(false);
  });
});
```

The exact mock setup must match the existing PostDetail test file's patterns (mock API, mock stores, etc.). Read the existing test file first and follow its conventions.

- [ ] **Step 5: Run full test suite**

```bash
npm test
```

Verify no regressions in existing PostDetail tests and new tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/components/post/PostDetail.vue packages/client/src/__tests__/components/post/PostDetail.test.ts
git commit -m "feat(sandbox): integrate CodeRunner into PostDetail for single and multi-file posts"
```

---

## Task 8: Coverage & Build Verification

- [ ] **Step 1: Run full test suite with coverage**

```bash
npm run test:coverage
```

Verify all thresholds from `.coverage-thresholds.json` are met (100% lines, functions, branches, statements).

- [ ] **Step 2: Fix any coverage gaps**

If any branches/lines are uncovered, add targeted tests. Common gaps:
- Template v-if false branches (test with props that hit both paths)
- Optional chaining fallbacks (test with null/undefined inputs)
- Error catch blocks (test with failing fetch responses)

- [ ] **Step 3: Run build**

```bash
npm run build
```

Verify Vite bundles successfully with worker files.

- [ ] **Step 4: Run lint**

```bash
npm run lint
```

- [ ] **Step 5: Final commit if any coverage fixes were needed**

```bash
git add -A
git commit -m "test(sandbox): close coverage gaps for code execution sandbox"
```
