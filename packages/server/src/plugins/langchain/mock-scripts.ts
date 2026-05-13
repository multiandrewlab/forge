import { mockScriptStorage } from './mock-provider.js';

export const DEFAULT_SCRIPT_KEY = 'default';

// Issue #102: stable, importable keys for callers that need to seed the
// mock-script context outside of an HTTP request (e.g., webhook handlers and
// the video reconciler call `withMockScript(MOCK_SCRIPT_KEYS.videoMetadata, …)`).
export const MOCK_SCRIPT_KEYS = {
  videoMetadata: 'video-metadata',
} as const;

const defaultChunks: string[] = ['Hello', ' world', '[done]'];

export const mockScripts: Record<string, string[]> = {
  default: defaultChunks,
  'autocomplete-typescript-react': [
    'export const Button = ({ ',
    'children, onClick }: Props) => (',
    '\n  <button onClick={onClick}>{children}</button>',
    '\n);',
    '[done]',
  ],
  'generate-readme-short': ['# README\n', '\n', 'TODO: write content.', '[done]'],
  'error-rate-limit': ['[error:rate_limit]'],
  'mid-stream-cancel': ['partial ', 'output '],
  // Issue #49: deterministic AI-search resolution for the e2e spec.
  // Concatenated chunks form valid JSON parsable by aiSearchFiltersSchema,
  // resolving to tags=['typescript'], language=null, contentType=null,
  // textQuery='typescript'.
  'search-resolves-to-typescript-tag': [
    '{"tags":["typescript"],',
    '"language":null,',
    '"contentType":null,',
    '"textQuery":"typescript"}',
  ],
  // Issue #102: deterministic AI video metadata extraction for unit tests
  // and the video pipeline mock path. Concatenated chunks (excluding the
  // [done] sentinel) form valid JSON parsable by videoMetadataSchema.
  [MOCK_SCRIPT_KEYS.videoMetadata]: [
    '{"title":"Mock video title",',
    '"description":"A deterministic mock description used by the video pipeline test seam.",',
    '"tags":["mock","video","typescript"]}',
    '[done]',
  ],
};

export function resolveMockScript(key: string | undefined): string[] {
  if (key === undefined) return defaultChunks;
  const found = mockScripts[key];
  if (found !== undefined) return found;
  if (process.env.NODE_ENV !== 'production') {
    console.warn(
      `[mock-scripts] unknown X-Mock-Script key "${key}" — falling back to "${DEFAULT_SCRIPT_KEY}"`,
    );
  }
  return defaultChunks;
}

/**
 * Seeds the mock-script AsyncLocalStorage with `key` for the duration of `fn`,
 * propagating it through any awaited operations (including ChatMock streaming).
 *
 * The video pipeline (webhook-initiated + reconciler-initiated) is NOT request-
 * scoped, so `X-Mock-Script` headers cannot reach it. Callers wrap their LLM
 * chain invocation in `withMockScript(key, …)` to give it a deterministic mock
 * output for unit/Bruno/Playwright tests. In production (real provider), the
 * key is read but ignored by the real model — the helper is effectively a
 * no-op.
 */
export function withMockScript<T>(key: string, fn: () => Promise<T>): Promise<T> {
  return mockScriptStorage.run(key, fn);
}

/**
 * Reads the currently-seeded mock-script key from AsyncLocalStorage. Returns
 * `undefined` when called outside any `withMockScript` (or `mockScriptStorage.run`)
 * context. Provided so chain code that runs inside `withMockScript` can log
 * which script seeded the call without taking the storage handle directly.
 */
export function getCurrentMockScriptKey(): string | undefined {
  return mockScriptStorage.getStore();
}
