/**
 * Type-only export of the names of mock-LLM scripts. Lives in @forge/shared so
 * Playwright fixtures (issue #45) can use it for type-safety on the
 * X-Mock-Script header.
 *
 * Implementation lives at packages/server/src/plugins/langchain/mock-scripts.ts.
 * Keep these in sync.
 */
export type MockScriptKey =
  | 'default'
  | 'autocomplete-typescript-react'
  | 'generate-readme-short'
  | 'error-rate-limit'
  | 'mid-stream-cancel'
  | 'search-resolves-to-typescript-tag';
