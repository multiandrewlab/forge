export const DEFAULT_SCRIPT_KEY = 'default';

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
