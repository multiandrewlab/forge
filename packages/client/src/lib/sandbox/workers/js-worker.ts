/* v8 ignore start */
import { neutralizeBrowserApis } from './neutralize-apis.js';
import { pickEntrySource } from './pick-entry-source.js';
import type { SandboxFile } from './pick-entry-source.js';

/** Minimal worker global shape -- avoids dependency on WebWorker lib types */
interface WorkerGlobal {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage(message: unknown): void;
}

declare const self: WorkerGlobal & Record<string, unknown>;

neutralizeBrowserApis(self as Record<string, unknown>);

interface ExecuteMessage {
  type: 'execute';
  language: 'javascript' | 'typescript';
  files: readonly SandboxFile[];
  entryFile: string;
  stdin?: string;
}

interface QuickJSHandle {
  dispose(): void;
}

interface QuickJSContext {
  runtime: QuickJSRuntime;
  newString(value: string): QuickJSHandle;
  newFunction(name: string, fn: (...args: QuickJSHandle[]) => void): QuickJSHandle;
  getString(handle: QuickJSHandle): string;
  getProp(handle: QuickJSHandle, key: string): QuickJSHandle;
  setProp(handle: QuickJSHandle, key: string, value: QuickJSHandle): void;
  global: QuickJSHandle;
  evalCode(code: string): { error?: QuickJSHandle; value?: QuickJSHandle };
  dump(handle: QuickJSHandle): unknown;
  dispose(): void;
}

interface QuickJSRuntime {
  setMemoryLimit(bytes: number): void;
  setMaxStackSize(bytes: number): void;
}

interface QuickJSWASMModule {
  newContext(): QuickJSContext;
}

async function loadQuickJS(): Promise<QuickJSWASMModule> {
  const mod = (await import(
    /* @vite-ignore */
    'quickjs-emscripten'
  )) as { getQuickJS: () => Promise<QuickJSWASMModule> };
  return mod.getQuickJS();
}

async function transpileTypeScript(code: string): Promise<string> {
  const esbuild = (await import(
    /* @vite-ignore */
    'esbuild-wasm'
  )) as {
    initialize: (opts: { wasmURL: string }) => Promise<void>;
    transform: (code: string, opts: { loader: string }) => Promise<{ code: string }>;
  };

  await esbuild.initialize({
    wasmURL: 'https://cdn.jsdelivr.net/npm/esbuild-wasm@latest/esbuild.wasm',
  });

  const result = await esbuild.transform(code, { loader: 'ts' });
  return result.code;
}

function formatHandleArgs(ctx: QuickJSContext, args: QuickJSHandle[]): string {
  const parts = args.map((a) => {
    try {
      return JSON.stringify(ctx.dump(a));
    } catch {
      return String(ctx.getString(a));
    }
  });
  return parts.join(' ') + '\n';
}

self.onmessage = async (event: MessageEvent<ExecuteMessage>) => {
  if (event.data.type !== 'execute') return;

  const { language, files, entryFile, stdin = '' } = event.data;
  const startTime = performance.now();

  let context: QuickJSContext | null = null;

  try {
    self.postMessage({ type: 'loading', runtime: 'quickjs' });

    const quickJS = await loadQuickJS();

    self.postMessage({ type: 'ready', runtime: 'quickjs' });

    context = quickJS.newContext();
    const ctx = context;

    // Set resource limits
    const MEMORY_LIMIT = 256 * 1024 * 1024; // 256 MB
    const STACK_LIMIT = 1024 * 1024; // 1 MB
    ctx.runtime.setMemoryLimit(MEMORY_LIMIT);
    ctx.runtime.setMaxStackSize(STACK_LIMIT);

    // Bridge console.log -> stdout
    const consoleObj = ctx.newFunction('console', () => {});
    const logFn = ctx.newFunction('log', (...args: QuickJSHandle[]) => {
      self.postMessage({ type: 'stdout', data: formatHandleArgs(ctx, args) });
    });
    const errorFn = ctx.newFunction('error', (...args: QuickJSHandle[]) => {
      self.postMessage({ type: 'stderr', data: formatHandleArgs(ctx, args) });
    });

    ctx.setProp(consoleObj, 'log', logFn);
    ctx.setProp(consoleObj, 'warn', logFn);
    ctx.setProp(consoleObj, 'error', errorFn);
    ctx.setProp(ctx.global, 'console', consoleObj);

    logFn.dispose();
    errorFn.dispose();
    consoleObj.dispose();

    // Bridge stdin via readline()
    const stdinLines = stdin.split('\n');
    let stdinIndex = 0;
    const readlineFn = ctx.newFunction('readline', () => {
      const line = stdinLines[stdinIndex] ?? '';
      stdinIndex += 1;
      return ctx.newString(line);
    });
    ctx.setProp(ctx.global, 'readline', readlineFn);
    readlineFn.dispose();

    // Mount VFS files via module loader
    // Files are made available as global __files for require()-like access
    const filesJson = ctx.newString(
      JSON.stringify(Object.fromEntries(files.map((f) => [f.filename, f.content]))),
    );
    ctx.setProp(ctx.global, '__filesJson', filesJson);
    filesJson.dispose();

    ctx.evalCode(`
      const __files = JSON.parse(__filesJson);
      function require(name) {
        const content = __files[name] || __files[name + '.js'] || __files[name + '.ts'];
        if (!content) throw new Error('Module not found: ' + name);
        const module = { exports: {} };
        const fn = new Function('module', 'exports', 'require', content);
        fn(module, module.exports, require);
        return module.exports;
      }
    `);

    // Resolve entry source from the manager's files[] / entryFile contract.
    // Throws (caught below) if the manager omitted the entry file.
    let executableCode = pickEntrySource(files, entryFile);

    // Transpile TypeScript if needed
    if (language === 'typescript') {
      executableCode = await transpileTypeScript(executableCode);
    }

    // Execute the user code
    const result = ctx.evalCode(executableCode);

    if (result.error) {
      const msgHandle = ctx.getProp(result.error, 'message');
      const errorMessage = ctx.getString(msgHandle);
      msgHandle.dispose();
      self.postMessage({ type: 'stderr', data: errorMessage + '\n' });
      result.error.dispose();

      const executionTimeMs = Math.round(performance.now() - startTime);
      self.postMessage({ type: 'done', exitCode: 1, executionTimeMs });
    } else {
      if (result.value) result.value.dispose();
      const executionTimeMs = Math.round(performance.now() - startTime);
      self.postMessage({ type: 'done', exitCode: 0, executionTimeMs });
    }
  } catch (error: unknown) {
    const executionTimeMs = Math.round(performance.now() - startTime);
    const message = error instanceof Error ? error.message : String(error);
    self.postMessage({ type: 'stderr', data: message + '\n' });
    self.postMessage({ type: 'done', exitCode: 1, executionTimeMs });
  } finally {
    if (context) {
      try {
        context.dispose();
      } catch {
        // Context may already be disposed on error paths
      }
    }
  }
};
/* v8 ignore stop */
