---
title: 'AI content generation (Issue #10) — streaming generate endpoint + editor panel'
issue: 10
created: 2026-04-14
status: draft
branch: feat/ai-content-generation
base: main
---

# AI content generation (Issue #10)

POST `/api/ai/generate` SSE endpoint + `AiGeneratePanel.vue` so a user can describe content in natural language and watch the LLM stream full content into the CodeMirror editor. Reuses the autocomplete infrastructure (provider factory, rate limiter, SSE helpers, abort handlers) landed in #9.

Upstream #9 is merged; CLAUDE.md + `.beads/knowledge/*` are primed. All decisions below respect the project's established conventions.

## Scope

**In scope**

- Zod schema `aiGenerateRequestSchema` in `packages/shared/src/validators/ai.ts`
- Prompt template + generation chain (`prompts/generate.ts`, `chains/generate.ts`)
- `POST /api/ai/generate` SSE route (extend `routes/ai.ts`) — same event format as `/complete` (`token`, `done`, `error`)
- `useAiGenerate()` client composable — `start(request, onToken)` / `stop()` / state refs
- `AiGeneratePanel.vue` component — 3 states (collapsed, expanded, generating), stop button
- Mount in `PostEditor.vue`, progressive CodeMirror insertion via `EditorView.dispatch`
- `bruno/ai/generate.bru` with declarative `assert { res.status: eq 200 }` block
- Tests (unit + integration) to 100% coverage per `.coverage-thresholds.json`

**Out of scope**

- Changing `aiGate` / rate-limiter semantics (already covers shared 1-in-flight-per-user)
- Changing `/api/ai/complete` behavior
- Content-type `link` (issue explicitly lists snippet/prompt/document)
- Multi-turn / follow-up generation (single-shot only for #10)
- Streaming markdown rendering during generation (raw text insert only)
- Non-snippet `language` field (only snippet uses language; prompt/document generate in English/markdown)

## Design decisions

| Decision                                                                                                   | Rationale                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------ |
| Extend `routes/ai.ts` rather than split into a new file                                                    | Mirror `complete` pattern, share `SSE_HEADERS`/`writeEvent`/`createAbortHandlers`. Consistency with existing route file.                                                           |
| Reuse `app.aiGate` verbatim                                                                                | Satisfies DoD #5 "rate limiting shared with autocomplete" by construction. No new code path, no regression risk.                                                                   |
| Single `Runnable` prompt-per-content-type, or one prompt with conditional text                             | One `ChatPromptTemplate` with a conditional rendered in the system message via per-type string interpolation at chain-build time. Per-type prompt files would duplicate structure. |
| Progressive insertion dispatches a CodeMirror transaction per token                                        | Matches simple SSE cadence; no visible lag at typical token rates (~20/s). A debounce/batch would add complexity with no user-visible win.                                         |
| AbortController-based stop                                                                                 | Already the established pattern in `useAiComplete`. Aborting the fetch closes the SSE reader and ends the server stream.                                                           |
| Autocomplete requests during generation are 429'd by the shared limiter and silently discarded client-side | DoD explicitly requires shared rate limiting; decoupling composables keeps tests independent. No cross-composable coupling needed.                                                 |
| Language field is optional and only echoed into the prompt when content_type === `snippet`                 | Matches issue's "language?: string" and avoids noise in prompt/document prompts.                                                                                                   |
| Content-type enum = `snippet                                                                               | prompt                                                                                                                                                                             | document`(not`link`) | Issue only lists these three. Generating a URL doesn't make sense. |
| Prompt template literal braces escaped as `{{` / `}}`                                                      | Enforced by `gotcha-langchain-prompt-brace-escape-001`. Must cover few-shot examples containing code.                                                                              |
| All test-file non-null assertions use `?.[i]` not `![i]`                                                   | Enforced by `gotcha-non-null-assertion-in-tests`.                                                                                                                                  |
| No defensive `??` on required fields                                                                       | Enforced by `gotcha-vitest-v8-nullish-branch-001` (creates dead branches).                                                                                                         |

## File scope

**New files**

- `packages/shared/src/validators/ai.ts` — _extend_: add `aiGenerateRequestSchema`, export `AiGenerateRequest`, add `AI_DESCRIPTION_MAX = 2000`
- `packages/server/src/plugins/langchain/prompts/generate.ts`
- `packages/server/src/plugins/langchain/chains/generate.ts`
- `packages/server/src/routes/ai.ts` — _extend_: add `POST /generate` handler below `POST /complete`
- `packages/client/src/composables/useAiGenerate.ts`
- `packages/client/src/components/editor/AiGeneratePanel.vue`
- `packages/client/src/components/editor/PostEditor.vue` — _extend_: mount `<AiGeneratePanel>` in the editor area
- `bruno/ai/generate.bru`
- Test files for each new module under the conventional `__tests__/` mirror paths

**Not touched**

- `provider.ts`, `rate-limiter.ts`, `langchain/index.ts`, `prompts/autocomplete.ts`, `chains/autocomplete.ts`
- Any auth, DB, or migration code
- `AiSuggestion.vue`, `useAiComplete.ts`, `CodeEditor.vue`

## Work units

### WU-001 — Shared Zod schema `aiGenerateRequestSchema`

**Files:** `packages/shared/src/validators/ai.ts`, `packages/shared/src/__tests__/validators/ai.test.ts`

**TDD test list:**

- Valid snippet with language → parses
- Valid prompt without language → parses (language optional)
- Valid document without language → parses
- Invalid content_type `"link"` → rejects (not in enum for AI generate)
- Empty description → rejects
- Description over `AI_DESCRIPTION_MAX` (2000) → rejects
- Language over 32 chars → rejects
- Missing content_type → rejects

**DoD:** schema validates all combinations; type export `AiGenerateRequest` available from `@forge/shared`.

**Export wiring note:** `packages/shared/src/validators/index.ts` already has `export * from './ai.js'`, so the new schema + type are re-exported automatically. If that barrel is ever changed to named re-exports, this WU must update it explicitly. Verify via a type-level import in the server chain test (WU-003).

### WU-002 — Prompt template `generatePrompt`

**Files:** `packages/server/src/plugins/langchain/prompts/generate.ts`, `packages/server/src/__tests__/plugins/langchain/generate-prompt.test.ts` (flat convention matching existing `autocomplete-chain.test.ts`)

**Approach:** `ChatPromptTemplate.fromMessages([['system', SYS], ['human', HUMAN]])` where SYS contains per-type instructions (snippet/prompt/document) and uses `{contentType}` + `{language}` as template variables. Literal `{` / `}` inside few-shot examples escaped as `{{` / `}}` per LangChain rule.

**TDD test list:**

- `prompt.format({ contentType: 'snippet', language: 'python', description: 'fibonacci' })` includes `Language: python` and `fibonacci`
- `prompt.format({ contentType: 'prompt', language: '', description: 'summarize article' })` renders without a language line (or includes empty-language-tolerant branch)
- `prompt.format({ contentType: 'document', language: '', description: 'readme for X' })` renders document-oriented instructions
- Literal `{` in a few-shot example does NOT throw "Missing variable" at `.format()` time — regression test for gotcha-langchain-prompt-brace-escape-001

**DoD:** prompt renders for all three content types; no `Missing variable` errors; output contains per-type guidance strings (asserted by substring).

### WU-003 — Generation chain `createGenerateChain` + `streamGenerate`

**Files:** `packages/server/src/plugins/langchain/chains/generate.ts`, `packages/server/src/__tests__/plugins/langchain/generate-chain.test.ts` (flat convention matching existing `autocomplete-chain.test.ts`)

**Depends on:** WU-002.

**Approach:**

```ts
export type GenerateInput = { description: string; contentType: ContentType; language?: string };
export type GenerateChain = Runnable<GenerateInput, string>;
export function createGenerateChain(model: BaseChatModel): GenerateChain { ... }
export async function* streamGenerate(chain, input, { signal }): AsyncIterable<string> { ... }
```

Mirror the shape of `createAutocompleteChain` / `streamAutocomplete`. `language` defaults to empty string before passing into the prompt (required by `ChatPromptTemplate.format`), but the empty value is rendered gracefully by the prompt.

**TDD test list:**

- `createGenerateChain(FakeListChatModel)` returns a Runnable — per pattern `gotcha-langchain-fake-pipe-001`, use `FakeListChatModel` not a hand-rolled fake with `.pipe()`
- `streamGenerate` yields each token from the model in order
- `streamGenerate` respects `AbortSignal` (aborted before iteration → stream ends empty)
- `streamGenerate` surfaces model errors (throws from the iterator)
- **Zero-token case** — model that emits `['']` (empty response) still completes cleanly without yielding anything; iterator terminates; no hang

**DoD:** chain constructs correctly; streaming works with fake model; abort is honored; zero-token terminates.

### WU-004 — `POST /api/ai/generate` SSE route

**Files:** `packages/server/src/routes/ai.ts` (extend), `packages/server/src/__tests__/routes/ai.test.ts` (extend), `bruno/ai/generate.bru` (new)

**Depends on:** WU-001, WU-003.

**Approach:** Append a second `app.post('/generate', { preHandler: app.aiGate }, handler)`. The handler mirrors `/complete` — validate body via `aiGenerateRequestSchema.safeParse`, build chain from `app.aiProvider()`, install `createAbortHandlers`, write SSE with `writeEvent`. Reuse `SSE_HEADERS` and `TIMEOUT_MS` constants from the same file.

**TDD test list (in `ai.test.ts`):**

- Happy path: valid body → 200, content-type `text/event-stream`, response contains `event: token` frames then `event: done`
- 400 on invalid body (description too long, missing content_type, bad content_type)
- 401 when Authorization header absent (proves `aiGate` is wired — reuses preHandler from autocomplete's tests)
- 429 when rate limiter already has an in-flight slot for the user — proves shared limiter (mock the limiter to reject the second request)
- `error` event emitted when the chain throws mid-stream
- `cleanupAborts` invoked on success path (timer cleared, listener removed)
- AbortSignal from `request.aiSlot.controller` threaded into `streamGenerate` (mock chain records the signal received)

**Bruno (`bruno/ai/generate.bru`):**

- `post { url: {{baseUrl}}/api/ai/generate }` with bearer auth
- Body: `{ "description": "a fibonacci function", "contentType": "snippet", "language": "python" }`
- Pre-request login guard (mirror `complete.bru`)
- `assert { res.status: eq 200 }` block (MANDATORY per CLAUDE.md lint-guard)
- `tests { ... }` block asserting status + `content-type` matches `/text\/event-stream/`
- Post-response check that body contains `event: done`

**DoD:** route returns SSE stream; all failure modes covered by tests; Bruno file has declarative assert block; endpoint passes when run against a live server seeded via `scripts/seed.sql`.

### WU-005 — Client composable `useAiGenerate`

**Files:** `packages/client/src/composables/useAiGenerate.ts`, `packages/client/src/__tests__/composables/useAiGenerate.test.ts`

**Shape:**

```ts
type UseAiGenerateReturn = {
  isGenerating: Ref<boolean>;
  error: Ref<string | null>;
  start: (req: AiGenerateRequest, onToken: (text: string) => void) => Promise<void>;
  stop: () => void;
};
```

Uses `parseSseStream` from `lib/ai/sse-stream`. On `start`, aborts any in-flight request, creates fresh `AbortController`, `fetch('/api/ai/generate', ...)`, iterates SSE events calling `onToken(text)` for each `token` event, sets `error` on `error` event or network failure, flips `isGenerating` to false on `done` or `error`. `stop()` aborts the controller.

**TDD test list:**

- `start` streams tokens to `onToken` in order (mock global `fetch` with a ReadableStream that emits SSE frames)
- `stop` aborts the in-flight request (AbortController.signal.aborted becomes true)
- `start` sets `isGenerating` true then false
- `error` event sets `error.value` to the message
- Network error (fetch rejects) sets `error.value` to a non-empty string
- Calling `start` while generating cancels the previous request first
- `stop` when nothing in flight is a no-op (does not throw)
- **Zero-token stream** — SSE stream that emits only `event: done` (no `token` events): `onToken` is never called, `isGenerating` still transitions to false, no error is set

**DoD:** 100% coverage; no `!` non-null assertions in tests; no `finally`-only cleanup (split between try/catch per `gotcha-v8-finally-coverage`).

### WU-006 — `AiGeneratePanel.vue` component

**Files:** `packages/client/src/components/editor/AiGeneratePanel.vue`, `packages/client/src/__tests__/components/editor/AiGeneratePanel.test.ts`

**Depends on:** WU-005.

**Props:**

```ts
defineProps<{ editorView: EditorView; contentType: ContentType; language: string }>();
```

**Template states:**

1. Collapsed: a `button` with text "Generate with AI" (bottom-right floating)
2. Expanded: a `textarea` (`data-testid="ai-generate-description"`) + Generate/Cancel buttons
3. Generating: progress indicator text + Stop button

**Behavior:**

- On Generate click, call `useAiGenerate().start({ description, contentType, language }, onToken)`
- `onToken(text)`: dispatch `editorView.dispatch({ changes: { from: cursor, insert: text }, selection: { anchor: cursor + text.length }, scrollIntoView: true })` where `cursor` is the current main selection head (re-read from `view.state` each token so subsequent inserts advance correctly)
- On Stop click, call `stop()` — partial content stays in editor (DoD #3)
- After `done`, panel collapses

**TDD test list:**

- Renders the collapsed button by default (`data-testid="ai-generate-toggle"`)
- Click toggle → shows textarea + Generate button
- Click Generate with empty description → Generate button disabled
- Click Generate with description → calls `useAiGenerate.start` with correct payload (mock composable via `vi.mock`)
- Tokens arriving → `editorView.dispatch` called with the `changes` insert at current cursor
- Stop button visible only while generating
- Stop button → calls `useAiGenerate.stop`
- After `done`, returns to collapsed state
- **Error path (explicit behavior)** → panel stays expanded and renders the error text from `error.value`; content already streamed remains in the editor; clicking the toggle or Cancel returns to collapsed state and clears error
- **Double-start click behavior** → while in `generating` state, the Generate button is hidden/disabled (only Stop is visible); clicking the toggle during generation is a no-op. This removes the need to test "click Generate while already generating" at the component level — the UX prevents the action. The composable-level test in WU-005 covers the programmatic cancel-and-restart path.
- Uses multi-word component name (`AiGeneratePanel`) to satisfy `vue/multi-word-component-names`
- Any `setTimeout`/`setInterval` usage includes `/* global setTimeout, clearTimeout */` per project convention (only add if actually used; otherwise skip)

**Panel state machine (explicit):**

| State      | Generate button                         | Stop button | Error text                                             | Toggle click                     |
| ---------- | --------------------------------------- | ----------- | ------------------------------------------------------ | -------------------------------- |
| collapsed  | hidden                                  | hidden      | hidden                                                 | → expanded                       |
| expanded   | visible (disabled if empty description) | hidden      | hidden if no error, visible if error from last attempt | → collapsed (clears error)       |
| generating | hidden                                  | visible     | hidden                                                 | no-op                            |
| on `done`  | —                                       | —           | —                                                      | → auto-collapse                  |
| on `error` | —                                       | —           | —                                                      | → stays expanded with error text |

**DoD:** 100% coverage; handles all states per the table; does not modify `EditorToolbar.vue` directly (mounted alongside it).

### WU-007 — Mount `AiGeneratePanel` in `PostEditor.vue`

**Files:** `packages/client/src/components/editor/PostEditor.vue` (extend), `packages/client/src/__tests__/components/editor/PostEditor.test.ts` (extend)

**Depends on:** WU-006.

**Change:** inside the editor area `<div class="flex-1">`, after `<CodeEditor>` and `<AiSuggestion>`, conditionally render:

```vue
<AiGeneratePanel
  v-if="editorView"
  :editor-view="editorView as EditorView"
  :content-type="contentType"
  :language="language"
  class="absolute bottom-4 right-4"
/>
```

Wrap the editor area in `relative` positioning so the absolute panel anchors correctly.

**TDD test list:**

- PostEditor renders `AiGeneratePanel` when editor view is available
- Passes `contentType` and `language` props through
- Does NOT render `AiGeneratePanel` when editor view is null (mirror `AiSuggestion` guard)

**DoD:** PostEditor still passes existing tests; AiGeneratePanel is mounted and visible in manual testing.

## Test strategy

- **Server unit tests:** schema (WU-001), prompt render (WU-002), chain construction + streaming (WU-003) — use `FakeListChatModel` per `gotcha-langchain-fake-pipe-001`.
- **Server route tests:** `app.inject` for `/generate` (WU-004). Reuse the in-memory mocks pattern from existing `ai.test.ts`. Mock `aiRateLimit` for 429 case; mock `createChatModel` → `FakeListChatModel` for streaming.
- **Client composable tests:** mock global `fetch` with a `ReadableStream` emitting SSE frames — same pattern as `useAiComplete.test.ts`.
- **Client component tests:** `@vue/test-utils` mount with a stub `EditorView` (just `state`, `dispatch`). Mock `useAiGenerate` via `vi.mock`.
- **Integration:** `bruno run ai --env local` against a running seeded server — verifies end-to-end SSE against a real model (or stubbed via `LLM_PROVIDER=fake` if that flag exists; otherwise asserts 200 + content-type header and presence of `event: done`).

## Coverage plan

`.coverage-thresholds.json` enforces 100%. Risk areas:

- Abort handlers: use the same `createAbortHandlers` from `routes/ai.ts` — already tested, no duplication needed. If I add any new timer/signal code, extract to a pure helper and unit-test directly.
- `finally` blocks: keep existing pattern in `ai.ts` (the autocomplete handler passes at 100%). If V8 flags a branch, split cleanup across `try` + `catch`.
- No `??` fallback on required props (e.g. don't write `language ?? ''` in the chain if the schema guarantees string-or-undefined — branch on presence instead).

## Rollout / validation sequence

1. WU-001 → unit tests + commit
2. WU-002 → unit tests + commit
3. WU-003 → unit tests + commit (depends on WU-002)
4. WU-004 → route tests + Bruno file + commit (depends on WU-001, WU-003); run `npm test` + Bruno smoke against running server
5. WU-005 → composable tests + commit
6. WU-006 → component tests + commit (depends on WU-005)
7. WU-007 → integration test + commit (depends on WU-006)
8. Final review: cross-unit integration check (all 8 DoD items verified with file:line evidence), coverage gate (`npm run test:coverage`), Bruno regression gate against live server.
9. `/self-reflect` → commit knowledge updates.
10. Open PR.

## Risks and mitigations

| Risk                                                                               | Mitigation                                                                                                                                                                        |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `streamGenerate` ignores AbortSignal because of LangChain Runnable internals       | Same risk existed for autocomplete and was covered by explicit signal test — replicate that test.                                                                                 |
| Progressive insert races cursor movement (user clicks elsewhere during generation) | Re-read cursor from `view.state.selection.main.head` each token; inserts advance at whatever the current head is. Accept that user can move cursor and split insertion.           |
| `AiGeneratePanel` collides visually with `EditorToolbar` sticky elements           | Use `absolute bottom-4 right-4` with a z-index if needed; manual verification.                                                                                                    |
| Autocomplete fires during generation and pollutes server logs with 429s            | Accepted per shared-limiter design decision. If log volume becomes a problem, add a single boolean to pause the `AiSuggestion` watcher — but only if observed; not pre-optimized. |
| Bruno's alphabetical `-r` ordering runs `ai/` before `auth/` → missing token       | `complete.bru` already has a pre-request login guard; mirror it verbatim in `generate.bru`.                                                                                       |
| New content_type enum narrower than `ContentType` from constants                   | Document in code comment: AI generation supports 3 of 4 content types; `link` is intentionally excluded.                                                                          |

## Definition of Done (maps to Issue #10)

- [ ] DoD #1 — user describes → AI generates — covered by WU-006 + WU-007
- [ ] DoD #2 — content streams progressively into CodeMirror (not buffered) — covered by WU-006 per-token `dispatch`
- [ ] DoD #3 — stop aborts mid-stream, partial content remains — covered by WU-005 `stop()` + WU-006 no-undo behavior
- [ ] DoD #4 — different content types produce different output — covered by WU-002 per-type prompt branches
- [ ] DoD #5 — rate limiting shared with autocomplete — covered by WU-004 reusing `app.aiGate`
- [ ] DoD #6 — AiGeneratePanel UI clean (collapsed by default, expands, shows progress) — covered by WU-006
- [ ] DoD #7 — 100% coverage per `.coverage-thresholds.json` — enforced at each commit + final gate
- [ ] DoD #8 — all tests pass `npm test` — enforced at each commit + final gate
- [ ] Bruno file with assert block in `bruno/ai/generate.bru` — required by CLAUDE.md (bonus to issue DoD)
- [ ] Bruno regression passes against running server — required by CLAUDE.md

## Execution method

TBD — user will pick after plan approval:

1. metaswarm orchestrated execution (4-phase per WU)
2. `superpowers:subagent-driven-development`
3. `superpowers:executing-plans` (separate session)

## Context recovery

After approval, this plan file is the durable reference. `.beads/plans/active-plan.md` will be updated with a pointer + status. `.beads/context/project-context.md` will be updated after each work-unit commit.
