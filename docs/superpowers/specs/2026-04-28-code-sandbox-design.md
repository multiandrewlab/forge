# Code Execution Sandbox — Design Spec

**Issue**: #8 — [19/19] Code execution sandbox
**Date**: 2026-04-28
**Status**: Approved

## Summary

Client-side WASM code execution sandbox for the Forge platform. Users can run JavaScript, TypeScript, and Python code snippets directly from posts in the browser. All execution happens client-side via Web Workers — no server endpoints, no infrastructure changes.

## Architecture

Three-layer client-side architecture:

```
┌─────────────────────────────────────────────┐
│  UI Layer (Vue components)                  │
│  CodeRunner.vue  │  ExecutionOutput.vue      │
│  RunButton overlay on CodeViewer/FilePreview │
└──────────────┬──────────────────────────────┘
               │ useCodeRunner() composable
┌──────────────▼──────────────────────────────┐
│  Execution Layer (sandbox service)          │
│  SandboxManager — creates/manages workers   │
│  Handles runtime loading, timeout, cleanup  │
└──────────────┬──────────────────────────────┘
               │ postMessage / onmessage
┌──────────────▼──────────────────────────────┐
│  Worker Layer (Web Workers)                 │
│  python-worker.js  │  js-worker.js          │
│  Loads WASM runtime, mounts VFS, executes   │
│  Posts stdout/stderr back incrementally      │
└─────────────────────────────────────────────┘
```

### Data Flow

1. User clicks Run on a snippet post
2. `useCodeRunner()` composable calls `sandboxManager.execute()`
3. SandboxManager spawns a dedicated Web Worker for the language
4. Worker lazy-loads the WASM runtime (shows "Loading runtime..." on first run)
5. Worker mounts all post files in the WASM virtual filesystem
6. Worker runs the entry file, posting stdout/stderr messages back incrementally
7. UI streams output into `ExecutionOutput.vue` in real time
8. On completion: worker posts `{ type: 'done', exitCode, executionTimeMs }`
9. On timeout (30s): main thread calls `worker.terminate()`, shows timeout error

## Design Decisions

### Client-Side Only (No Server Endpoint)

The original issue proposed `POST /api/sandbox/run` as a server endpoint. This design replaces it with a client-side `sandboxManager.execute()` call that provides the same contract (language, code, stdin -> stdout, stderr, exit_code, execution_time_ms). Rationale:

- Zero server infrastructure cost
- No security surface on the server (no arbitrary code execution on backend)
- No latency from network round-trips
- Execution is inherently sandboxed by the browser's Web Worker isolation
- A server logging endpoint can be added later if analytics are needed

### Web Worker Isolation

All WASM runtimes run inside dedicated Web Workers (one per execution). This enforces security properties by construction:

- **Timeout**: `setTimeout(30_000)` + `worker.terminate()` — unconditional, cannot be blocked
- **Memory isolation**: Worker memory is separate; termination reclaims everything
- **No network**: Workers have no DOM access; worker scripts don't expose fetch/XHR
- **No persistence**: Fresh worker per execution; VFS destroyed on termination
- **Non-blocking**: Main thread stays responsive during execution

### Separate Workers Per Language

Pyodide (~11MB) and QuickJS (~1MB) are loaded in separate worker files. A JS execution never pays the Pyodide download cost. Worker code stays focused and testable.

### CDN-Loaded WASM Runtimes

Pyodide and QuickJS WASM binaries are loaded from CDN (jsdelivr) rather than bundled into the Vite build. This keeps the client bundle small and leverages CDN caching.

### Lazy Loading on First Run

WASM runtimes are not preloaded. They load on the first "Run" click with a loading indicator. Browser HTTP caching handles repeat visits. This respects bandwidth — most users viewing a post won't run the code.

### esbuild-wasm for TypeScript

TypeScript is transpiled to JavaScript via esbuild-wasm before execution in QuickJS. esbuild-wasm provides robust TS support (type stripping, enums, JSX, decorators) at the cost of ~8MB additional WASM. The transpilation happens inside the JS worker before QuickJS execution.

### Multi-File as Project

For multi-file posts, all files are mounted in the WASM virtual filesystem and the currently-viewed file is executed as the entry point. This means `import utils` (Python) and `import './utils.js'` (JS) work across files in the same post. Single-file posts work identically since there's only one file.

## Runtimes

| Language | Runtime | Size | Source |
|----------|---------|------|--------|
| Python | Pyodide v0.27.x | ~11MB | `cdn.jsdelivr.net/pyodide/v0.27.x/full/` |
| JavaScript | quickjs-emscripten | ~1MB | npm package, loaded in worker |
| TypeScript | esbuild-wasm + QuickJS | ~9MB total | npm packages, loaded in worker |

## Execution Service

### SandboxManager

Singleton service (not a Pinia store — manages Web Workers, not reactive state).

```typescript
interface ExecuteOptions {
  language: 'python' | 'javascript' | 'typescript';
  files: Array<{ filename: string; content: string }>;
  entryFile: string;
  stdin?: string;
  onOutput: (stream: 'stdout' | 'stderr', data: string) => void;
  onComplete: (result: { exitCode: number; executionTimeMs: number }) => void;
  onError: (error: string) => void;
  onLoading: (phase: 'runtime' | 'executing') => void;
}

interface ExecuteHandle {
  abort: () => void;
}

sandboxManager.execute(options: ExecuteOptions): ExecuteHandle
```

Responsibilities:
- Create and terminate workers per execution
- Enforce 30s timeout via `setTimeout` + `worker.terminate()`
- Route messages from worker to calling composable via callbacks
- Track loading state per runtime (show "Loading Python..." only on first run)

### Worker Message Protocol

**Main thread -> Worker:**
```typescript
{ type: 'execute'; language: string; files: Array<{ filename: string; content: string }>; entryFile: string; stdin?: string }
```

**Worker -> Main thread:**
```typescript
{ type: 'stdout'; data: string }
{ type: 'stderr'; data: string }
{ type: 'loading'; phase: 'runtime' | 'executing' }
{ type: 'done'; exitCode: number; executionTimeMs: number }
{ type: 'error'; message: string }
```

### Worker Implementations

**`python-worker.js`**:
- Imports Pyodide via `importScripts()` from CDN
- Creates fresh Pyodide instance per execution
- Mounts files to `/home/user/` in virtual FS
- Redirects `sys.stdout`/`sys.stderr` to `postMessage` callbacks for streaming output
- Sets `sys.path` to include `/home/user/` so inter-file imports work
- If stdin provided, monkey-patches `input()` to read from a line buffer

**`js-worker.js`**:
- Imports `quickjs-emscripten` WASM module
- For TypeScript: also loads `esbuild-wasm` to transpile TS -> JS before execution
- Creates QuickJS runtime with `setMemoryLimit(256MB)`
- Intercepts `console.log`/`console.error` to post as stdout/stderr messages
- Implements module loader callback for multi-file `import` support
- If stdin provided, exposes global `readline()` function reading from buffer

## UI Components

### New Components

**`CodeRunner.vue`** — Wrapper composing RunButton + ExecutionOutput:
- Props: `language: string`, `files: Array<{ filename: string; content: string }>`, `entryFile: string`
- Manages `useCodeRunner()` composable internally
- Only renders when `language` is a supported sandbox language
- Slots into PostDetail cleanly — PostDetail passes data, CodeRunner handles execution

**`RunButton.vue`** — Overlay button on code blocks:
- Appears in top-right toolbar, next to existing copy button
- States: idle (play icon), loading (spinner), running (stop/square icon for cancel)
- Click triggers execution; click again during execution triggers abort
- Only renders for supported languages (`python`, `javascript`, `typescript`)

**`ExecutionOutput.vue`** — Output panel below code:
- Renders below CodeViewer (single-file) or FilePreview (multi-file)
- Monospace pre-formatted block with streaming line-by-line output
- Two sections: stdout (default visible) and stderr (tab/toggle, shown if non-empty)
- Status bar: execution time, exit code (green=0, red=nonzero), "Timed out" indicator
- "Clear" button to dismiss output
- Collapsed by default, expands on first output line

### Modifications to Existing Components

**`PostDetail.vue`**:
- Single-file layout: Adds `CodeRunner` below `CodeViewer`, passing `language`, `[{ filename: 'main.<ext>', content: revision.content }]` (where ext is derived from language — e.g., `main.py`, `main.js`, `main.ts`), entry `'main.<ext>'`
- Multi-file layout: Adds `CodeRunner` below `FilePreview`, passing `language`, all files from `filesStore`, and `activeFile.filename` as entry
- Only renders `CodeRunner` when `contentType === 'snippet'` and language is supported
- No structural changes to existing template — CodeRunner is additive

**No changes needed** to: `CodeViewer.vue`, `FilePreview.vue`, `FileSidebar.vue`, `PostViewPage.vue`, file stores, or any server-side code.

### useCodeRunner Composable

Reactive bridge between Vue and SandboxManager:

```typescript
interface OutputLine {
  stream: 'stdout' | 'stderr';
  text: string;
  timestamp: number;
}

function useCodeRunner() {
  const output: Ref<OutputLine[]>;
  const status: Ref<'idle' | 'loading' | 'running' | 'done' | 'error'>;
  const executionTime: Ref<number | null>;
  const exitCode: Ref<number | null>;

  function run(options: { language: string; files: Array<{ filename: string; content: string }>; entryFile: string; stdin?: string }): void;
  function abort(): void;
  function clear(): void;

  // Cleans up worker on component unmount via onUnmounted
}
```

## Security Properties

All enforced by construction via Web Worker isolation:

| Property | Mechanism |
|----------|-----------|
| Execution timeout (30s) | `setTimeout` + `worker.terminate()` on main thread |
| Memory limit | QuickJS: `setMemoryLimit(256MB)`. Pyodide: WASM linear memory bounded by browser |
| No network access | Workers have no DOM; scripts don't expose fetch/XHR; Pyodide network installs disabled |
| No filesystem persistence | Fresh worker per execution; VFS in-memory, destroyed on terminate |
| CPU isolation | Worker runs on separate thread; main thread stays responsive |
| No DOM access | Web Workers cannot access document, window, or any DOM APIs |

## Acceptance Criteria Coverage

| # | Criterion | Satisfied By |
|---|-----------|-------------|
| 1 | Sandbox runtime selected and documented | Pyodide, QuickJS, esbuild-wasm — this document |
| 2 | Supported languages defined (JS/TS, Python) | JavaScript, TypeScript, Python |
| 3 | Execution API with language/code/stdin -> stdout/stderr/exit_code/time | `sandboxManager.execute()` — same contract, client-side |
| 4 | Execution timeout (30s) | `setTimeout` + `worker.terminate()` |
| 5 | Resource limits (memory, CPU, disk, network) | WASM memory limits, 30s timeout, in-memory VFS, no network |
| 6 | No network access | Worker isolation + no networking APIs exposed |
| 7 | No filesystem persistence | Fresh worker per execution |
| 8 | UI integrated into post detail view | `CodeRunner.vue` in both single-file and multi-file layouts |
| 9 | Run button triggers execution and displays output | `RunButton.vue` + `ExecutionOutput.vue` |
| 10 | Streaming output | Worker `postMessage` -> composable reactive array -> real-time UI |

## File Scope

### New Files
```
packages/client/src/services/sandbox.ts              — SandboxManager singleton
packages/client/src/workers/python-worker.js          — Pyodide Web Worker
packages/client/src/workers/js-worker.js              — QuickJS + esbuild Web Worker
packages/client/src/composables/useCodeRunner.ts      — Vue composable bridge
packages/client/src/components/post/CodeRunner.vue    — Wrapper component
packages/client/src/components/post/RunButton.vue     — Play/stop button overlay
packages/client/src/components/post/ExecutionOutput.vue — Output display panel
```

### Modified Files
```
packages/client/src/components/post/PostDetail.vue    — Add CodeRunner to both layouts
```

### Unchanged
```
packages/client/src/components/post/CodeViewer.vue    — No changes
packages/client/src/components/post/FilePreview.vue   — No changes
packages/client/src/components/post/FileSidebar.vue   — No changes
packages/client/src/pages/PostViewPage.vue            — No changes
packages/client/src/stores/files.ts                   — No changes
packages/server/                                      — No server changes
packages/shared/                                      — No shared package changes
```

## Dependencies (npm)

```
packages/client:
  pyodide                  — Python WASM runtime (CDN-loaded, but types needed)
  quickjs-emscripten       — QuickJS WASM runtime
  esbuild-wasm             — TypeScript transpilation
```

No server-side dependency changes.
