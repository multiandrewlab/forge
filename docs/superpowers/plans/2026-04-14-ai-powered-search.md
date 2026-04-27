# Implementation Plan: AI-powered Search (Issue #11)

**Issue**: [12/19] AI-powered search
**Branch**: `feat/ai-powered-search` (off `main` @ `ffd0c9c`)
**Date**: 2026-04-14

## Overview

Add an "Ask AI" toggle to the Cmd+K search modal. When enabled, the search query is routed through a LangChain search chain that interprets natural language into structured filters before querying PostgreSQL. AI Actions in search results link to the AI generate feature with pre-filled descriptions. Falls back to plain search on chain failure.

## Key Design Decisions

| Decision                                             | Rationale                                                                                                                                                                                                                   |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Expose `app.aiAcquire(userId)` from langchain plugin | Search route needs rate limiting without preHandler (since non-AI search must remain unauthenticated). A simple decorator returns `AiSlot \| null` without sending error responses, letting the route fall back gracefully. |
| Graceful fallback on any AI failure                  | Auth failure, rate limit, chain error, invalid JSON — all silently fall back to plain search. Users always get results.                                                                                                     |
| `aiEnabled` as session-scoped ref (not localStorage) | Per issue spec: "persisted across modal open/close within the session" but resets on page reload.                                                                                                                           |
| Keep `AiAction.params` as `Record<string, string>`   | Narrowing the type would break existing `buildAiActions` callers between WUs. Instead, keep the flexible type and change only the keys used at the implementation level (`topic` → `description`/`contentType`).            |
| Overload `buildAiActions(q, filters?)`               | When AI filters available, generate smarter actions with `description`/`contentType`/`language` keys in params. When not, existing stub behavior unchanged.                                                                 |
| JSON output parser with Zod validation               | Chain output parsed as JSON, validated against `AiSearchFilters` schema. Invalid JSON triggers fallback — never surfaces to user.                                                                                           |

## Reuses from existing code

- `app.aiProvider()` — cached LLM model instance
- `AiRateLimiter` / `AiSlot` — rate limiting infrastructure
- `searchPostsByTsvector` / `searchPostsByTrigram` — existing DB queries (accept `SearchPostOptions` with `contentType`, `tag`, `limit`)
- `ChatPromptTemplate.fromMessages` — prompt pattern from autocomplete/generate
- `StringOutputParser` — chain output parsing pattern
- `apiFetch` — client API call utility
- `useSearchStore` / `useSearch` — client search state

## Work Units

### WU-001: Shared types — `ai` param + `AiSearchFilters`

**Files**:

- `packages/shared/src/types/search.ts`
- `packages/shared/src/types/index.ts` (add re-exports for new types)
- `packages/shared/src/__tests__/types/search.test.ts`

**Changes**:

1. Add `ai` boolean field to `searchQuerySchema` (optional, preprocessed from string like `fuzzy`)
2. Add `AiSearchFilters` interface: `{ tags: string[], language: string | null, contentType: string | null, textQuery: string }`
3. Export `aiSearchFiltersSchema` (Zod) for server-side validation of chain output
4. Add `AiSearchFilters` and `aiSearchFiltersSchema` to `packages/shared/src/types/index.ts` re-exports
5. Keep `AiAction.params` as `Record<string, string>` — no type narrowing (avoids breaking existing consumers between WUs)

**Tests**:

- Schema validation: `ai=true`, `ai='true'` (string preprocess), `ai=false`, `ai` omitted
- `AiSearchFilters` Zod schema validates valid/invalid structures

**DoD items**: Foundation for all other WUs

---

### WU-002: Search prompt template

**Files**:

- `packages/server/src/plugins/langchain/prompts/search.ts` (new)
- `packages/server/src/__tests__/plugins/langchain/search-prompt.test.ts` (new)

**Changes**:

1. Create `searchPrompt` — `ChatPromptTemplate.fromMessages` with system prompt explaining how to extract structured filters from natural language queries
2. System prompt includes examples (per issue spec): NL → JSON with tags, language, contentType, textQuery
3. Human template: `{query}`

**Tests**:

- Prompt template creates successfully
- Format with sample input produces expected message structure
- Follows same pattern as `autocompletePrompt` and `generatePrompt`

**DoD items**: Foundation for WU-003

---

### WU-003: Search chain — create + run with JSON parsing

**Files**:

- `packages/server/src/plugins/langchain/chains/search.ts` (new)
- `packages/server/src/__tests__/plugins/langchain/search-chain.test.ts` (new)

**Changes**:

1. `SearchInput` type: `{ query: string }`
2. `SearchChain` type: `Runnable<SearchInput, string>`
3. `createSearchChain(model: BaseChatModel): SearchChain` — pipes `searchPrompt → model → StringOutputParser`
4. `runSearchChain(chain: SearchChain, query: string): Promise<AiSearchFilters | null>` — invokes chain, parses JSON output, validates with `aiSearchFiltersSchema`. Returns `null` on any error (invalid JSON, validation failure, timeout).

**Tests**:

- Chain creation succeeds with mock model
- `runSearchChain` with valid JSON response returns parsed `AiSearchFilters`
- `runSearchChain` with invalid JSON returns `null`
- `runSearchChain` with model error returns `null`
- `runSearchChain` with partial/malformed fields returns `null`

**DoD items**: DoD #2 (NL queries interpreted into structured filters)

---

### WU-004: Server AI search path — route + service + plugin

**Files**:

- `packages/server/src/plugins/langchain/index.ts` (modify — add `aiAcquire` decorator)
- `packages/server/src/routes/search.ts` (modify — add AI path)
- `packages/server/src/services/search.ts` (modify — upgrade `buildAiActions`)
- `packages/server/src/__tests__/routes/search.test.ts` (modify)
- `packages/server/src/__tests__/services/search.test.ts` (modify)
- `packages/server/src/__tests__/plugins/langchain/plugin.test.ts` (modify)

**Changes**:

_Plugin (`index.ts`)_:

1. Add `aiAcquire` to FastifyInstance declaration: `aiAcquire: (userId: string) => AiSlot | null`
2. Decorate: `app.decorate('aiAcquire', (userId: string) => limiter.acquire(userId))`

_Route (`search.ts`)_:

1. Parse `ai` from validated query params
2. When `ai === true`:
   a. Try `await request.jwtVerify()` — if fails, set `useAi = false`
   b. Try `app.aiAcquire(request.user.id)` — if null, set `useAi = false`
   c. If slot acquired, create search chain from `app.aiProvider()`, run `runSearchChain(chain, trimmedQ)`
   d. Release slot immediately after chain completes
   e. If chain returns `AiSearchFilters`, use filters to set `contentType`, `tag` (first tag), and search with `textQuery`
   f. If chain returns `null`, fall back to plain search with original query
3. Pass filters (or undefined) to upgraded `buildAiActions`

_Service (`search.ts`)_:

1. Upgrade `buildAiActions(q: string, filters?: AiSearchFilters): AiAction[]`
2. When filters provided:
   - If `filters.language`: `{ label: "Generate a {language} {textQuery} implementation", action: "generate", params: { description: textQuery, contentType: "snippet", language } }`
   - If `filters.contentType === 'prompt'`: `{ label: "Generate a prompt for {textQuery}", action: "generate", params: { description: textQuery, contentType: "prompt" } }`
   - Always: `{ label: "Generate content about {textQuery}", action: "generate", params: { description: textQuery, contentType: "document" } }`
3. When no filters (existing behavior): keep existing stub actions unchanged (params uses `topic` key)

**Tests**:

- Route: `ai=true` with valid auth → uses AI search path
- Route: `ai=true` without auth → falls back to plain search
- Route: `ai=true` with chain failure → falls back to plain search
- Route: `ai=false` or omitted → existing behavior unchanged
- Service: `buildAiActions` with filters → context-aware actions
- Service: `buildAiActions` without filters → stub actions (backward compatible)
- Plugin: `aiAcquire` decorator exists and returns slot/null
- **Existing tests requiring update**: `search.test.ts` tests for `buildAiActions` (lines 85-125) assert old stub output with `topic` key and 2 specific labels. When `buildAiActions` gains the optional `filters` parameter, these existing tests must be preserved (they test the no-filters path) but their assertions remain valid since the no-filters behavior is unchanged. New tests are added alongside for the with-filters path.
- **Route test scaffolding for `ai=true`**: The existing `search.test.ts` `buildApp()` helper does not register the langchain plugin. Tests for the `ai=true` path need mock decorators: `app.decorate('aiProvider', () => mockModel)`, `app.decorate('aiAcquire', () => mockSlot)`. Add these to `buildApp()` (conditionally or always — they're no-ops when `ai` param is absent). Mock the search chain module (`vi.mock('../plugins/langchain/chains/search.js')`) to control chain output in tests.

**DoD items**: DoD #2, #3, #4, #5, #7

---

### WU-005: Client — store, composable, modal toggle + AI Action navigation

**Files**:

- `packages/client/src/stores/search.ts` (modify)
- `packages/client/src/composables/useSearch.ts` (modify)
- `packages/client/src/components/shell/TheSearchModal.vue` (modify)
- `packages/client/src/pages/PostNewPage.vue` (modify — read query params for AI Action pre-fill)
- Corresponding test files

**Changes**:

_Store (`stores/search.ts`)_:

1. Add `aiEnabled = ref(false)` — session-scoped, no localStorage
2. Add `toggleAi(): void` — flips `aiEnabled.value`
3. Export `aiEnabled` and `toggleAi` from store
4. Ensure `close()` does NOT reset `aiEnabled` (it survives modal open/close)

_Composable (`useSearch.ts`)_:

1. Read `aiEnabled` from store
2. Build URL: `/api/search?q=${encodeURIComponent(trimmed)}${aiEnabled.value ? '&ai=true' : ''}`
3. Return `aiEnabled` and `toggleAi` from composable

_Modal (`TheSearchModal.vue`)_:

1. Add "Ask AI" toggle button in the search input row (between input and close button)
2. Toggle appearance: small pill/switch with sparkle icon, highlighted when active
3. On toggle: call `toggleAi()`, then re-run current query if non-empty
4. AI Action selection: navigate to `/posts/new?description={encodeURIComponent(params.description)}&contentType={params.contentType}&language={params.language}`

_PostNewPage.vue_:

1. Add `useRoute()` import and read `route.query.description`, `route.query.contentType`, `route.query.language`
2. If query params present, pre-fill: `description` → `title` ref, `contentType` → `contentType` ref, `language` → `language` ref + set `manualLanguage = true`
3. This enables AI Actions to link directly to the editor with pre-filled generation context
4. Note: slot acquired via `app.aiAcquire()` is NOT attached to `request.aiSlot` — the `onResponse`/`onError` safety-net hooks only release `request.aiSlot`, so no double-release risk

**Tests**:

- Store: `aiEnabled` defaults to false, `toggleAi` flips it, not persisted to localStorage
- Store: `close()` does NOT reset `aiEnabled`
- Composable: passes `&ai=true` when aiEnabled, omits when not
- Modal: toggle renders, clicking it changes state, re-runs query
- Modal: AI Action click navigates to editor with params
- PostNewPage: renders with query params pre-filled into editor fields
- PostNewPage: renders normally (empty) when no query params
- **Existing tests requiring update**:
  - `TheSearchModal.test.ts` Test 20 (~line 302): currently asserts AI Action selection calls `console.info` and does NOT navigate (`expect(pushSpy).not.toHaveBeenCalled()`). Must be **replaced** with assertion that AI Action selection navigates to `/posts/new?description=...&contentType=...&language=...`.
  - `TheSearchModal.test.ts` router fixture (~lines 84-87): currently defines routes `/`, `/posts/:id`, `/search`. Must add `/posts/new` route (with `name: 'post-new'`) to support AI Action navigation tests.
  - `search.ts` (store) test for `close()` (~lines 169-180): extend to verify `aiEnabled` is NOT cleared by `close()`.

**DoD items**: DoD #1, #4, #6

---

### WU-006: Bruno API tests

**Files**:

- `bruno/search/ai-search.bru` (new)

**Changes**:

1. `GET {{baseUrl}}/api/search?q=python+csv+parsing&ai=true` with auth bearer `{{accessToken}}`
2. Assert: `res.status: eq 200`
3. Assert: `res.body.snippets: isArray`
4. Assert: `res.body.aiActions: isArray`
5. Assert: `res.body.people: isArray`
6. Assert: `res.body.totalResults: isNumber`
7. Run existing search Bruno files to verify no regressions

**DoD items**: Bruno file with assert block, Bruno regression passes

---

## Dependency Graph

```
WU-001 (shared types)
  └── WU-002 (search prompt)
        └── WU-003 (search chain)
              └── WU-004 (server route/service/plugin)
                    └── WU-005 (client toggle + navigation)
                          └── WU-006 (Bruno API tests)
```

All WUs are sequential — each builds on the previous.

## Definition of Done Mapping

| DoD Item                                                              | WU             |
| --------------------------------------------------------------------- | -------------- |
| 1. "Ask AI" toggle appears in Cmd+K modal                             | WU-005         |
| 2. NL queries interpreted into structured filters                     | WU-003, WU-004 |
| 3. Search results improve with AI (better tag/language/type matching) | WU-004         |
| 4. AI Actions appear and link to editor with pre-filled description   | WU-004, WU-005 |
| 5. Plain search fallback when AI chain fails                          | WU-004         |
| 6. Toggle state persists across modal open/close within session       | WU-005         |
| 7. Plain search unchanged when AI toggle is off                       | WU-004         |
| 8. 100% test coverage per `.coverage-thresholds.json`                 | All WUs        |
| 9. All tests pass: `npm test`                                         | All WUs        |
| Bruno file with assert block                                          | WU-006         |
| Bruno regression passes                                               | WU-006         |

## Risks & Mitigations

| Risk                                                             | Mitigation                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LLM returns non-JSON output                                      | `runSearchChain` validates with Zod, returns `null` on any parse failure → silent fallback                                                                                                                                                                |
| Search chain latency adds UX delay                               | Chain runs server-side only when `ai=true`; loading state already exists in modal                                                                                                                                                                         |
| Rate limiter blocks search                                       | `aiAcquire` returns null → graceful fallback to plain search, no error shown                                                                                                                                                                              |
| `AiAction.params` key change (`topic` → `description`) in WU-004 | Existing `buildAiActions` tests in `search.test.ts` updated in same WU. `AiAction.params` type stays `Record<string, string>` — no type-level break. `SearchResultItem.test.ts` only uses `label`/`action` for rendering, not `params` keys — unaffected. |
