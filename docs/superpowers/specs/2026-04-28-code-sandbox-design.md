# Code Execution Sandbox — Design Spec

**Issue**: #8 — [19/19] Code execution sandbox
**Date**: 2026-04-28
**Status**: Design Review Round 2
**Review iteration**: 2 (addressing Round 1 feedback from PM, Architect, Designer, Security, CTO)

## Use Cases

**UC1 — Verify a snippet works**: A developer viewing a Python or JS code snippet on Forge wants to run it in-browser to verify it works before copying it into their project, so they can trust shared knowledge without context-switching to a local terminal.

**UC2 — Learn by running examples**: A developer reading a tutorial post with code examples wants to execute them inline to see output and build understanding, so they can learn interactively without setting up a local environment.

**UC3 — Test multi-file projects**: A developer viewing a multi-file post (e.g., `main.py` + `utils.py`) wants to run the entry file with all imports resolving, so they can see the complete project behavior in one click.

**UC4 — Validate before copying**: A developer wants to confirm a snippet produces the expected output before pasting it into production code, reducing the risk of copying broken examples.

**Out of scope for v1**: Code editing before execution (read-only run of posted code). Editing is a v2 feature.

## Success Metrics

- **First-run latency**: Runtime download + initialization + execution completes in < 15s on broadband (> 10 Mbps) for a simple "Hello World"
- **Subsequent-run latency**: Execution starts within 2s (runtime cached by browser HTTP cache)
- **Reliability**: Run button works in Chrome, Firefox, Safari, Edge (latest 2 versions) — all support Web Workers + WASM

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
│  Worker Layer (Web Workers, TypeScript)      │
│  python-worker.ts  │  js-worker.ts          │
│  Loads WASM runtime, mounts VFS, executes   │
│  Posts stdout/stderr back incrementally      │
└─────────────────────────────────────────────┘
```

### Data Flow

1. User clicks Run on a snippet post
2. `useCodeRunner()` composable resolves file contents (see Content Resolution below)
3. Composable calls `sandboxManager.execute()` with `{ filename, content }` pairs
4. SandboxManager spawns a dedicated Web Worker via Vite's native worker support
5. Worker neutralizes browser APIs (`fetch`, `XMLHttpRequest`, `WebSocket`) — see Security
6. Worker lazy-loads the WASM runtime (posts `{ type: 'loading' }`)
7. Worker posts `{ type: 'ready' }` once runtime is initialized
8. Worker mounts all post files in the WASM virtual filesystem
9. Worker runs the entry file, posting stdout/stderr messages back incrementally
10. UI streams output into `ExecutionOutput.vue` in real time (capped at 10,000 lines / 1MB)
11. On completion: worker posts `{ type: 'done', exitCode, executionTimeMs }`
12. On timeout (30s): main thread calls `worker.terminate()`, shows timeout error

### Content Resolution (Multi-File)

`PostFile` is metadata-only — it has no `content` field. File content lives on the server and is fetched via `GET /api/posts/:postId/files/:fileId`.

When the user clicks Run on a multi-file post:

1. `useCodeRunner` reads the file list from `filesStore.filesByRevision[revisionId]`
2. For each text file (skip images/binaries based on `mimeType`), fetch content via `apiFetch(`/api/posts/${postId}/files/${file.id}`)`
3. Fetches run in parallel via `Promise.all()`
4. If any fetch fails, abort and show error: "Failed to load file: {filename}"
5. Pass resolved `Array<{ filename, content }>` to `sandboxManager.execute()`

For single-file posts, content comes directly from `revision.content` — no fetch needed.

### Language Detection & Mapping

`Post.language` is `string | null` in the shared types. The sandbox needs an explicit bridge:

```typescript
// packages/client/src/lib/sandbox/languages.ts
export const SANDBOX_LANGUAGES = ['python', 'javascript', 'typescript'] as const;
export type SandboxLanguage = typeof SANDBOX_LANGUAGES[number];

export function isSandboxLanguage(lang: string | null): lang is SandboxLanguage {
  return lang !== null && SANDBOX_LANGUAGES.includes(lang as SandboxLanguage);
}

export const LANGUAGE_EXTENSIONS: Record<SandboxLanguage, string> = {
  python: '.py',
  javascript: '.js',
  typescript: '.ts',
};
```

For multi-file posts, the sandbox language is determined by the **entry file's extension**, not the post-level `language` field. This handles mixed-language posts correctly — if the active file is `main.py`, the Python worker spawns regardless of the post's `language` field.

For single-file posts, the post's `language` field determines the runtime, and the synthetic filename uses the extension map (e.g., `main.py` for `language: 'python'`).

## Design Decisions

### Client-Side Only (No Server Endpoint)

The original issue proposed `POST /api/sandbox/run` as a server endpoint. This design replaces it with a client-side `sandboxManager.execute()` call that provides the same contract (language, code, stdin -> stdout, stderr, exit_code, execution_time_ms). Rationale:

- Zero server infrastructure cost
- No security surface on the server (no arbitrary code execution on backend)
- No latency from network round-trips
- Execution is sandboxed by WASM VM boundary + Web Worker isolation
- A server logging endpoint can be added later if analytics are needed

### Web Worker + WASM VM Double Isolation

User code runs inside a WASM virtual machine (QuickJS or Pyodide) which itself runs inside a Web Worker. This provides two layers of isolation:

1. **WASM VM boundary** (primary): User code executes in WASM linear memory. It has no access to JavaScript APIs unless the host worker explicitly bridges them. We bridge only stdout/stderr callbacks — no network, no storage, no DOM.
2. **Web Worker boundary** (defense-in-depth): Even if the WASM VM had a bug, the worker's browser APIs are neutralized before the VM loads (see Security section).

Properties enforced:
- **Timeout**: `setTimeout(30_000)` + `worker.terminate()` — unconditional, cannot be blocked
- **Memory isolation**: Worker memory is separate; termination reclaims everything
- **No persistence**: Fresh worker per execution; VFS destroyed on termination
- **Non-blocking**: Main thread stays responsive during execution

### Vite Native Worker Bundling

Worker files are TypeScript (`.ts`) and use Vite's native worker support:

```typescript
const worker = new Worker(
  new URL('../lib/sandbox/workers/python-worker.ts', import.meta.url),
  { type: 'module' }
);
```

This integrates with Vite's dev server (HMR, ESM) and production bundler. Workers use ESM `import` syntax, not `importScripts()`. For CDN-loaded Pyodide, the worker uses dynamic `import()` or `fetch()` + `WebAssembly.instantiate()`.

### Separate Workers Per Language

Pyodide (~11MB) and QuickJS (~1MB) are loaded in separate worker files. A JS execution never pays the Pyodide download cost. Worker code stays focused and testable.

### CDN-Loaded Pyodide with Version Pinning

Pyodide WASM binary is loaded from CDN with an exact version pin:

```
https://cdn.jsdelivr.net/pyodide/v0.27.1/full/pyodide.mjs
```

- **Version pinned**: Exact minor version, not `v0.27.x`
- **Error handling**: If CDN is unreachable (corporate firewall, offline), the worker posts `{ type: 'error', message: 'Failed to load Python runtime. Check your network connection.' }` and the UI shows a retry button
- **CSP considerations**: If the app adds CSP headers in the future, `connect-src` must include `cdn.jsdelivr.net` and `worker-src 'self'`. Document this in deployment notes
- **SharedArrayBuffer**: NOT used. Pyodide runs in single-threaded mode. No cross-origin isolation headers required

QuickJS and esbuild-wasm are npm dependencies bundled by Vite into the worker — no CDN dependency.

### Lazy Loading on First Run

WASM runtimes are not preloaded. They load on the first "Run" click with a loading indicator. Browser HTTP caching handles repeat visits. This respects bandwidth — most users viewing a post won't run the code.

### esbuild-wasm for TypeScript

TypeScript is transpiled to JavaScript via esbuild-wasm before execution in QuickJS. esbuild-wasm provides robust TS support (type stripping, enums, JSX, decorators). The transpilation happens inside the JS worker before QuickJS execution. esbuild-wasm is lazy-loaded only for TypeScript files — JS execution skips it entirely.

### Multi-File as Project

For multi-file posts, all text files are mounted in the WASM virtual filesystem and the currently-viewed file is executed as the entry point. This means `import utils` (Python) and `import './utils.js'` (JS) work across files in the same post. Single-file posts work identically since there's only one file.

### Stdin Not Exposed in UI (v1)

The `sandboxManager.execute()` API accepts optional `stdin` for programmatic use, but v1 does not expose a stdin input field in the UI. This keeps the interface simple. A collapsible stdin input can be added in v2 if needed.

## Runtimes

| Language | Runtime | Size | Source |
|----------|---------|------|--------|
| Python | Pyodide v0.27.1 | ~11MB | `cdn.jsdelivr.net/pyodide/v0.27.1/full/` |
| JavaScript | quickjs-emscripten | ~1MB | npm package, bundled by Vite into worker |
| TypeScript | esbuild-wasm + QuickJS | ~9MB total | npm packages, bundled by Vite into worker |

## Execution Service

### SandboxManager

Singleton service at `packages/client/src/lib/sandbox/manager.ts`. Not a Pinia store — it manages Web Workers, not reactive state. Exported as a named module export (not side-effecting) so it can be mocked in tests.

Accepts an injectable worker factory for testability:

```typescript
type WorkerFactory = (language: SandboxLanguage) => Worker;

const defaultWorkerFactory: WorkerFactory = (language) => {
  const url = language === 'python'
    ? new URL('./workers/python-worker.ts', import.meta.url)
    : new URL('./workers/js-worker.ts', import.meta.url);
  return new Worker(url, { type: 'module' });
};

interface ExecuteOptions {
  language: SandboxLanguage;
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

class SandboxManager {
  constructor(private createWorker: WorkerFactory = defaultWorkerFactory) {}
  execute(options: ExecuteOptions): ExecuteHandle;
}

export function createSandboxManager(factory?: WorkerFactory): SandboxManager;
```

Responsibilities:
- Create and terminate workers per execution
- Enforce 30s timeout via `setTimeout` + `worker.terminate()`
- Route messages from worker to calling composable via callbacks
- If `run()` is called while already running, terminate the previous worker first (abort-and-restart)
- Track loading state per runtime

### Worker Message Protocol

**Main thread -> Worker:**
```typescript
{ type: 'execute'; language: string; files: Array<{ filename: string; content: string }>; entryFile: string; stdin?: string }
```

**Worker -> Main thread:**
```typescript
{ type: 'ready' }                                          // Runtime loaded, about to execute
{ type: 'stdout'; data: string }
{ type: 'stderr'; data: string }
{ type: 'loading'; phase: 'runtime' | 'executing' }
{ type: 'done'; exitCode: number; executionTimeMs: number }
{ type: 'error'; message: string }
```

The `ready` message distinguishes "runtime loading" from "code executing" so `executionTimeMs` measures only code execution, not runtime initialization.

### Worker Implementations

**`python-worker.ts`**:
- Neutralizes browser APIs before loading runtime (see Security)
- Loads Pyodide via dynamic import from pinned CDN URL
- `loadPackagesFromImports` is NOT called — no automatic package installation. Only the standard library is available
- Creates fresh Pyodide instance per execution
- Mounts files to `/home/user/` in virtual FS
- Redirects `sys.stdout`/`sys.stderr` to `postMessage` callbacks for streaming output
- Sets `sys.path` to include `/home/user/` so inter-file imports work
- If stdin provided, monkey-patches `input()` to read from a line buffer

**`js-worker.ts`**:
- Neutralizes browser APIs before loading runtime (see Security)
- Imports `quickjs-emscripten` (bundled by Vite)
- For TypeScript: also lazy-loads `esbuild-wasm` to transpile TS -> JS before execution
- Creates QuickJS runtime with `setMemoryLimit(256MB)`
- Intercepts `console.log`/`console.error` to post as stdout/stderr messages
- Module loader callback resolves ONLY from the in-memory VFS file list — never triggers network fetches
- If stdin provided, exposes global `readline()` function reading from buffer

## UI Components

### New Components

**`CodeRunner.vue`** — Wrapper composing RunButton + ExecutionOutput:
- Props: `postId: string`, `revisionId: string`, `language: string | null`, `singleFileContent?: string`
- For multi-file: fetches file contents when Run is clicked (see Content Resolution)
- For single-file: uses `singleFileContent` prop directly
- Manages `useCodeRunner()` composable internally
- Only renders when `isSandboxLanguage(language)` returns true
- Slots into PostDetail cleanly — PostDetail passes data, CodeRunner handles execution

**`RunButton.vue`** — Overlay button on code blocks:
- Appears in top-right toolbar, next to existing copy button
- States: idle (play icon), loading (spinner), running (stop/square icon for cancel)
- Click triggers execution; click again during execution triggers abort
- Only renders for supported languages
- For unsupported but recognized programming languages (e.g., `go`, `rust`, `java`): renders in disabled state with tooltip "Run not available for {language}"
- For non-code content types or null language: does not render

**`ExecutionOutput.vue`** — Output panel below code:
- Renders below CodeViewer (single-file) or FilePreview (multi-file)
- **All output rendered via `{{ }}` text interpolation — NEVER `v-html`** (prevents XSS from crafted output)
- Monospace `<pre>` block with streaming line-by-line output
- Stdout and stderr interleaved chronologically (single stream, stderr lines styled in red)
- Output capped at **10,000 lines / 1MB total**. When exceeded: stops appending, shows "Output truncated (limit: 10,000 lines)" indicator, worker continues running until done/timeout
- Status bar: elapsed time (updates live during execution), exit code (green=0, red=nonzero), "Timed out" indicator
- "Clear" button to dismiss output
- Collapsed by default, expands on first output line

### Modifications to Existing Components

**`PostDetail.vue`**:
- Single-file layout: Adds `CodeRunner` below `CodeViewer`, passing `language`, `postId`, `revisionId`, and `singleFileContent: revision.content`
- Multi-file layout: Adds `CodeRunner` below `FilePreview`, passing `language`, `postId`, `revisionId` (CodeRunner fetches files itself)
- Only renders `CodeRunner` when `contentType === 'snippet'`
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

const MAX_OUTPUT_LINES = 10_000;
const MAX_OUTPUT_BYTES = 1_048_576; // 1MB

function useCodeRunner() {
  const output: Ref<OutputLine[]>;
  const status: Ref<'idle' | 'loading' | 'running' | 'done' | 'error'>;
  const executionTime: Ref<number | null>;
  const exitCode: Ref<number | null>;
  const truncated: Ref<boolean>;

  function run(options: {
    language: SandboxLanguage;
    files: Array<{ filename: string; content: string }>;
    entryFile: string;
    stdin?: string;
  }): void;
  function abort(): void;
  function clear(): void;

  // Terminates worker on component unmount via onUnmounted
  // If run() called while already running, aborts previous execution first
}
```

## Security

### Threat Model

| Threat | Risk | Mitigation |
|--------|------|------------|
| Sandbox escape via WASM VM | Low | User code runs in WASM linear memory; no JS API access unless host bridges it. We bridge only stdout/stderr callbacks |
| Worker browser API abuse | Medium | **Workers DO have `fetch`, `XHR`, `WebSocket`, `indexedDB` by default.** Worker scripts neutralize these before loading WASM (see below) |
| Output XSS | High if v-html | **All output uses `{{ }}` text interpolation, never `v-html`.** Output is always plain text |
| Output flooding / memory exhaustion | Medium | Output capped at 10,000 lines / 1MB. 30s timeout kills worker |
| CDN WASM supply chain | Medium | Exact version pin. Browser HTTP cache. Self-hosting is a future option |
| Pyodide auto-package install | Medium | `loadPackagesFromImports` never called. Only stdlib available |
| Crypto mining via WASM | Low | 30s timeout + worker.terminate() limits computation |
| Phishing via crafted output | Low | Output in distinct `<pre>` block with sandbox styling. Plain text only |

### Browser API Neutralization in Workers

Both worker scripts execute this before loading any WASM runtime:

```typescript
// Defense-in-depth: remove browser APIs from worker global scope
// Primary isolation is the WASM VM boundary, but this prevents
// accidental API exposure and mitigates hypothetical VM escapes
declare const self: DedicatedWorkerGlobalScope;
// @ts-expect-error — intentional deletion of global APIs
delete self.fetch;
// @ts-expect-error
delete self.XMLHttpRequest;
// @ts-expect-error
delete self.WebSocket;
// @ts-expect-error
delete self.indexedDB;
// @ts-expect-error
delete self.caches;
```

This runs before any WASM runtime is imported. Even if a WASM VM had a bug allowing access to the host environment, the dangerous APIs are gone.

### Security Properties

| Property | Mechanism |
|----------|-----------|
| Execution timeout (30s) | `setTimeout` + `worker.terminate()` on main thread — unconditional |
| Memory limit | QuickJS: `setMemoryLimit(256MB)`. Pyodide: WASM linear memory, backstopped by 30s timeout. No explicit cap — a memory bomb may crash the tab (acceptable: only affects the user who ran the code) |
| No network access | WASM VM boundary (primary) + browser API neutralization in worker (defense-in-depth) + Pyodide package loading disabled |
| No filesystem persistence | Fresh worker per execution; VFS in-memory, destroyed on terminate |
| CPU isolation | Worker runs on separate thread; main thread stays responsive |
| No DOM access | Web Workers cannot access document, window, localStorage, sessionStorage |
| Output safety | `{{ }}` text interpolation only — no HTML interpretation of sandbox output |

## Testing Strategy

### Testability by Layer

**SandboxManager** (`lib/sandbox/manager.ts`):
- Accepts injectable `WorkerFactory` — tests pass a mock that implements `Worker` interface (`postMessage`, `onmessage`, `terminate`)
- Test cases: timeout enforcement, abort handling, message routing, rapid re-run (abort previous), error propagation

**useCodeRunner composable** (`composables/useCodeRunner.ts`):
- Mock `SandboxManager` module via `vi.mock()`
- Test reactive state transitions: idle -> loading -> running -> done/error
- Test output accumulation, truncation at limits, clear
- Test `onUnmounted` cleanup

**Worker logic** (`lib/sandbox/workers/*.ts`):
- Extract pure logic (message routing, VFS mounting, stdout interception) into testable functions in separate files (e.g., `lib/sandbox/workers/python-runtime.ts`)
- Unit test the pure functions with WASM parts mocked
- The thin worker entry point (which just wires message handlers) is covered by SandboxManager integration tests with the mock worker

**Vue components** (CodeRunner, RunButton, ExecutionOutput):
- Standard `@vue/test-utils` with composable mocked
- Test: supported/unsupported language rendering, button states, output rendering, truncation indicator, disabled tooltip for unsupported languages
- Test: output uses text interpolation (no v-html) — assert output element's `textContent` matches, not `innerHTML`

**Integration testing** (optional, not required for coverage gate):
- Playwright E2E test with a real browser to verify actual WASM execution works end-to-end
- Not gated on coverage thresholds since it requires actual CDN access

## Acceptance Criteria Coverage

| # | Criterion | Satisfied By |
|---|-----------|-------------|
| 1 | Sandbox runtime selected and documented | Pyodide, QuickJS, esbuild-wasm — this document |
| 2 | Supported languages defined (JS/TS, Python) | JavaScript, TypeScript, Python via `SANDBOX_LANGUAGES` constant |
| 3 | Execution API with language/code/stdin -> stdout/stderr/exit_code/time | `sandboxManager.execute()` — same contract, client-side |
| 4 | Execution timeout (30s) | `setTimeout` + `worker.terminate()` |
| 5 | Resource limits (memory, CPU, disk, network) | WASM memory limits, 30s timeout, in-memory VFS, API neutralization |
| 6 | No network access | WASM VM boundary + worker API neutralization + Pyodide package loading disabled |
| 7 | No filesystem persistence | Fresh worker per execution |
| 8 | UI integrated into post detail view | `CodeRunner.vue` in both single-file and multi-file layouts |
| 9 | Run button triggers execution and displays output | `RunButton.vue` + `ExecutionOutput.vue` |
| 10 | Streaming output | Worker `postMessage` -> composable reactive array -> real-time UI (capped at 10K lines / 1MB) |

## File Scope

### New Files
```
packages/client/src/lib/sandbox/languages.ts             — SANDBOX_LANGUAGES constant, isSandboxLanguage guard, extension map
packages/client/src/lib/sandbox/manager.ts               — SandboxManager with injectable WorkerFactory
packages/client/src/lib/sandbox/workers/python-worker.ts  — Pyodide Web Worker
packages/client/src/lib/sandbox/workers/js-worker.ts      — QuickJS + esbuild Web Worker
packages/client/src/composables/useCodeRunner.ts          — Vue composable bridge
packages/client/src/components/post/CodeRunner.vue        — Wrapper component
packages/client/src/components/post/RunButton.vue         — Play/stop button overlay
packages/client/src/components/post/ExecutionOutput.vue   — Output display panel
```

### Modified Files
```
packages/client/src/components/post/PostDetail.vue        — Add CodeRunner to both layouts
```

### Unchanged
```
packages/client/src/components/post/CodeViewer.vue        — No changes
packages/client/src/components/post/FilePreview.vue       — No changes
packages/client/src/components/post/FileSidebar.vue       — No changes
packages/client/src/pages/PostViewPage.vue                — No changes
packages/client/src/stores/files.ts                       — No changes
packages/server/                                          — No server changes
packages/shared/                                          — No shared package changes
```

## Dependencies (npm)

```
packages/client:
  quickjs-emscripten       — QuickJS WASM runtime (bundled by Vite into worker)
  esbuild-wasm             — TypeScript transpilation (bundled by Vite into worker)
```

Pyodide is loaded from CDN at runtime — no npm dependency needed (types are available via `@pyodide/pyodide` if needed, but can be typed inline to avoid the large package).

No server-side dependency changes. No Bruno API tests needed (no server endpoints).
