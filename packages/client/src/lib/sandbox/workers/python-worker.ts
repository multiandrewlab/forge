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
  files: readonly SandboxFile[];
  entryFile: string;
  stdin?: string;
}

interface PyodideInterface {
  FS: {
    writeFile(path: string, content: string): void;
    mkdir(path: string): void;
  };
  runPythonAsync(code: string): Promise<unknown>;
}

type LoadPyodideFn = (options: {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}) => Promise<PyodideInterface>;

const PYODIDE_CDN_URL = 'https://cdn.jsdelivr.net/pyodide/v0.27.1/full/pyodide.mjs';

async function loadPyodideRuntime(): Promise<{
  loadPyodide: LoadPyodideFn;
}> {
  // Dynamic import from CDN -- Vite-ignored to avoid bundling
  // SAFETY: URL is a trusted CDN constant defined above
  const mod: { loadPyodide: LoadPyodideFn } = await (
    Function('url', 'return import(url)') as (
      url: string,
    ) => Promise<{ loadPyodide: LoadPyodideFn }>
  )(PYODIDE_CDN_URL);
  return mod;
}

self.onmessage = async (event: MessageEvent<ExecuteMessage>) => {
  if (event.data.type !== 'execute') return;

  const { files, entryFile, stdin = '' } = event.data;
  const startTime = performance.now();

  try {
    self.postMessage({ type: 'loading', runtime: 'pyodide' });

    const { loadPyodide } = await loadPyodideRuntime();
    const pyodide = await loadPyodide({
      stdout: (text: string) => {
        self.postMessage({ type: 'stdout', data: text + '\n' });
      },
      stderr: (text: string) => {
        self.postMessage({ type: 'stderr', data: text + '\n' });
      },
    });

    self.postMessage({ type: 'ready', runtime: 'pyodide' });

    // Mount VFS files
    try {
      pyodide.FS.mkdir('/home/user');
    } catch {
      // Directory may already exist
    }

    for (const file of files) {
      pyodide.FS.writeFile(`/home/user/${file.filename}`, file.content);
    }

    // Configure sys.path and stdin
    const stdinLines = stdin.split('\n');

    await pyodide.runPythonAsync(`
import sys
sys.path.insert(0, '/home/user')
`);

    // Monkey-patch stdin for input() support
    await pyodide.runPythonAsync(`
import sys
from io import StringIO

class StdinWrapper:
    def __init__(self, lines):
        self._lines = lines
        self._index = 0
    def readline(self):
        if self._index < len(self._lines):
            line = self._lines[self._index]
            self._index += 1
            return line + '\\n'
        return ''
    def read(self):
        remaining = '\\n'.join(self._lines[self._index:])
        self._index = len(self._lines)
        return remaining

sys.stdin = StdinWrapper(${JSON.stringify(stdinLines)})
`);

    // Resolve entry source from the manager's files[] / entryFile contract.
    // Throws (caught below) if the manager omitted the entry file.
    const code = pickEntrySource(files, entryFile);

    // Execute the user code
    await pyodide.runPythonAsync(code);

    const executionTimeMs = Math.round(performance.now() - startTime);
    self.postMessage({ type: 'done', exitCode: 0, executionTimeMs });
  } catch (error: unknown) {
    const executionTimeMs = Math.round(performance.now() - startTime);
    const message = error instanceof Error ? error.message : String(error);
    self.postMessage({ type: 'stderr', data: message + '\n' });
    self.postMessage({ type: 'done', exitCode: 1, executionTimeMs });
  }
};
/* v8 ignore stop */
