# Issue #50 — Playground + AI Feature Additions + E2E Specs (Design)

**Issue:** [#50 — E2E rollout 5/9](https://github.com/multiandrewlab/forge/issues/50)
**Tracking issue:** [#43 — E2E Playwright rollout](https://github.com/multiandrewlab/forge/issues/43)
**Status:** REV 1 (design-review-gate iteration 2 of 3) — APPROVED 2026-05-01 pending re-review
**Predecessor:** PR #74 (issue #49) merged 2026-05-01

## REV 1 changes — design-review-gate iteration 1 findings (May 1, 2026)

| #   | Finding                                                                                                                                                                         | Reviewer                    | Resolution                                                                                                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | API error envelope `{ error: 'MISSING_REQUIRED_VARIABLES' }` shadows existing `{ error: '<human-readable string>' }` convention; client renders `error` verbatim across 6 pages | Designer #1                 | Changed to `{ error: 'Missing required variables: name, role', code: 'MISSING_REQUIRED_VARIABLES', missing: ['name', 'role'] }`. `error` stays human-readable; new `code` field carries the machine-readable id. |
| 2   | Fork redirect placement: today the redirect lives in CALLERS (`PostDetail.vue:203`, `PostViewPage.vue:112`), not in the composable. Pushing it inward breaks both               | Architect #1                | Reverted: `usePosts.forkPost` is unchanged. The new caller (`PlaygroundHeader`'s click handler) decides the redirect by branching on `source.contentType`.                                                       |
| 3   | E2E init-script wiring: `reset.ts` has no `page` fixture (uses ephemeral APIRequestContext). `addInitScript` belongs in the page-bearing fixture                                | Architect #2                | Init-script wiring moved to `e2e/fixtures/auth.ts` (the page-bearing fixture extended by reset).                                                                                                                 |
| 4   | Bruno gate: `/api/playground/run` contract changes; existing `run-prompt-invalid.bru` doesn't assert the new shape. CLAUDE.md is BLOCKING for this                              | CTO #1                      | New `bruno/playground/run-prompt-missing-required.bru` added; existing `run-prompt-invalid.bru` updated to assert new code/missing shape too.                                                                    |
| 5   | TDD test cases not enumerated per branch — fails 100% coverage planning                                                                                                         | CTO #2                      | New §"TDD test enumeration" lists every branch case for each new code site.                                                                                                                                      |
| 6   | Server validation must run BEFORE `reply.raw.writeHead(200, SSE_HEADERS)`                                                                                                       | Security medium-risk        | Architecture/Feature 1 explicitly notes ordering; example code restructured.                                                                                                                                     |
| 7   | E2E hook cleanup needs explicit `finally` block                                                                                                                                 | Security medium-risk        | Architecture/Feature 5 spells out `try { ... } finally { ... }` placement.                                                                                                                                       |
| 8   | No spec for legacy-prompt path (no defaultValue → gated). User confirmed no production legacy data exists                                                                       | PM #4                       | Added inline note: legacy data is theoretical; spec #4 + spec #5 cover the gating semantics on freshly-seeded prompts.                                                                                           |
| 9   | Disabled Run button: no `why-disabled` feedback                                                                                                                                 | Designer suggestion + PM #3 | Run button gets `:title="canRun ? '' : 'Fill required variables to run'"`; PromptVariableInput renders inline hint when empty + required.                                                                        |
| 10  | A11y: `*` indicator has no screen-reader semantics                                                                                                                              | PM #4, Designer             | Required indicator: `<span aria-hidden="true">*</span>` + visually-hidden `<span class="sr-only">required</span>` + `aria-required="true"` on the input.                                                         |
| 11  | E2E hook alternatives undocumented                                                                                                                                              | PM #2                       | New §"Alternatives considered for Feature 5" lists CustomEvent / exported handle / network-route options + why `__E2E__` is preferred.                                                                           |
| 12  | Soft break-change should also surface in amended issue body                                                                                                                     | CTO suggestion + PM         | Issue body amendment plan now includes the soft break-change line.                                                                                                                                               |
| 13  | Acceptance criteria are 100% technical, no user outcomes                                                                                                                        | PM #3                       | New user-outcome bullets added.                                                                                                                                                                                  |
| 14  | PlaygroundPage doesn't currently expose `contentType` from store; fork click handler needs it                                                                                   | Architect Q1                | Architecture/Feature 3 explicitly threads `contentType` through `usePlayground`.                                                                                                                                 |
| 15  | PromptVariableInput required derivation: derive locally from `defaultValue`, not new prop                                                                                       | Architect suggestion        | Architecture/Feature 1 specifies local derivation.                                                                                                                                                               |
| 16  | Validation order vs assemblePrompt: validate raw payload before merge-with-defaults                                                                                             | Architect Q3                | Architecture/Feature 1 calls out raw-payload-first ordering.                                                                                                                                                     |
| 17  | Error region styling unspecified                                                                                                                                                | Designer #2                 | Specifies canonical class string `mb-4 p-3 bg-red-900/30 border border-red-500 rounded text-red-400 text-sm`.                                                                                                    |
| 18  | Split-button selectors: add `playground.stopBtn`                                                                                                                                | Designer suggestion         | Selector shard adds `stopBtn`.                                                                                                                                                                                   |
| 19  | Fork button placement risk (next to Run = mis-click)                                                                                                                            | Designer suggestion         | Architecture/Feature 3 specifies right-aligned slot with visual separation.                                                                                                                                      |
| 20  | NODE_ENV defense-in-depth on E2E hook                                                                                                                                           | Security #5, CTO suggestion | Gate now: `import.meta.env.MODE !== 'production' && win.__E2E__`.                                                                                                                                                |

User decisions on iteration-1 questions (recorded May 1, 2026):

- **Q-A (legacy data migration):** A — no migration. User confirmed no legacy data exists.
- **Q-B (E2E hook alternative):** A — stick with `window.__E2E__` + `__forgeE2eAiAbort`.
- **Q-C (NODE_ENV defense-in-depth):** A — yes, add the gate.

## Why this design exists

The original issue body assumed several playground/AI features were already shipped (in #1a, the mock-LLM PR). The plan-review gate revealed they aren't. Eight of the planned specs would have tested behavior the codebase doesn't produce:

- `kind: 'playground'` post field (does not exist; `Post` schema uses `contentType` only)
- Required-variable validation (`PromptVariable` has no `required` field; Run is never gated)
- Missing-variable server rejection (`/api/playground/run` accepts empty `variables`; `assemblePrompt` silently leaves `{{var}}` placeholders)
- Fork-from-playground UI (fork button lives only on `PostDetail`; redirects to `/posts/{id}/edit`)
- AiGeneratePanel local output rendering (tokens dispatch directly into the CodeMirror editor; the panel has no `streamedOutput` ref)

Rather than skip the affected DoD bullets or test features that don't exist, this design extends scope to **build the missing features** and **then** assert them via E2E. This is consistent with the user's option-2 decision after the plan-review gate failed.

## Decision log (Q1–Q6 + Q-A through Q-C in REV 1)

| #   | Decision                                               | Choice                                                                                                                                                                              |
| --- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Required-variable model                                | **A.** Implicit required, `defaultValue` as opt-out. No new schema field.                                                                                                           |
| 2   | Fork-from-playground UI placement                      | **A.** New fork button in `PlaygroundHeader` (right-aligned slot with visual separation from Run/Stop).                                                                             |
| 3   | AI generate streaming assertion                        | **A.** Test against `.cm-content` (the editor). No panel-local mirror.                                                                                                              |
| 4   | `page.evaluate(AbortController.abort)` honor mechanism | **A.** Playwright `addInitScript` sets `window.__E2E__ = true`; `useAiGenerate.ts` conditionally exposes `window.__forgeE2eAiAbort`, gated additionally by `MODE !== 'production'`. |
| 5   | Fork semantics                                         | **A.** Fork = clone source content; modifications optional and post-fork.                                                                                                           |
| 6   | `kind: 'playground'` field                             | **A.** Skip; use existing `contentType: 'prompt'` as the playground signal.                                                                                                         |
| A   | Legacy-data migration                                  | **A.** No migration. User confirmed no production legacy data exists.                                                                                                               |
| B   | E2E hook alternative mechanism                         | **A.** Stick with `__E2E__` flag (alternatives evaluated below).                                                                                                                    |
| C   | NODE_ENV defense-in-depth on E2E hook                  | **A.** Yes — add `MODE !== 'production'` to the gate.                                                                                                                               |

## Architecture

### Feature 1 — Required-variable validation

**Source of truth:** A variable is **required** iff its `PromptVariable.defaultValue` is undefined or empty string. No new schema field.

**Shared helper (new):** `extractRequiredVariables(content: string, variables: PromptVariable[]): string[]`

- Lives in `packages/shared/src/types/prompt.ts` next to `extractVariables` and `assemblePrompt`.
- Returns the names of variables present in `extractVariables(content)` whose `defaultValue` is undefined or empty.
- Pure function, no side effects.
- **Required-vs-missing distinction:** "required" is a property of the variable schema (evaluated against `defaultValue`); "missing" is a property of the request payload (evaluated against `submitted.variables[name]`). The two are computed separately.

**Server (`packages/server/src/routes/playground.ts`):**

- Validation runs BEFORE `reply.raw.writeHead(200, SSE_HEADERS)` so a JSON 400 body can be sent. The current handler writes SSE headers immediately at line 61 — restructuring required: post-fetch, then variable validation, then SSE headers, then LLM invocation.
- Validate the **raw submitted payload** before any merge-with-defaults. (If we validated the merged payload, a defaulted variable with an explicitly-cleared submitted value would mask as filled.)

```ts
// At handler top, before writeHead:
const post = await getPostForPlayground(postId, request.user.id);
const latest = await getLatestRevision(postId);
const submitted = request.body as PlaygroundRunRequest;

const required = extractRequiredVariables(latest.content, post.variables);
const missing = required.filter((name) => {
  const value = submitted.variables?.[name];
  return value === undefined || value.trim() === '';
});

if (missing.length) {
  return reply.status(400).send({
    error: `Missing required variables: ${missing.join(', ')}`,
    code: 'MISSING_REQUIRED_VARIABLES',
    missing,
  });
}

// Now safe to begin SSE
reply.raw.writeHead(200, SSE_HEADERS);
// ... LLM streaming
```

- The 400 envelope `{ error, code, missing }` shape: `error` is the human-readable message (matches existing routes' convention); `code` is the new machine-readable identifier; `missing` is the new structured array. This avoids shadowing the `error` field's existing semantic.

**Client (`packages/client/src/composables/usePlayground.ts`):**

- New computed `requiredVariables: ComputedRef<string[]>` derived from the post's variables and content via `extractRequiredVariables`.
- New computed `canRun: ComputedRef<boolean>` returning `false` when any required variable's input is empty (after `.trim()`).
- `run()` catches the 400 response, parses `body.error` (already human-readable) into `error.value`. Also caches `body.missing` as a separate `missingVariables: Ref<string[]>` if the UI wants to highlight which fields are missing.
- New `UsePlaygroundReturn` fields: `canRun`, `requiredVariables`, `missingVariables` (in addition to existing `error`).

**Client (`packages/client/src/components/playground/PlaygroundHeader.vue`):**

- Run button receives `:disabled="!canRun"` and `:title="canRun ? '' : 'Fill required variables to run'"` from `usePlayground`.
- Run/Stop button keeps its existing testid behavior — adds `data-testid="playground-run-btn"` (visible when not running) and `data-testid="playground-stop-btn"` (visible when running). Implementation: bind `:data-testid="isRunning ? 'playground-stop-btn' : 'playground-run-btn'"`.

**Client (`packages/client/src/components/playground/PromptVariableInput.vue`):**

- **Required-ness derived locally** from the `PromptVariable` prop: `const isRequired = computed(() => !props.variable.defaultValue || props.variable.defaultValue.trim() === '');`. No new prop.
- Renders:
  - Label with `<span aria-hidden="true" class="text-red-400 ml-0.5" data-testid="prompt-variable-required-{name}">*</span>` when required
  - Visually-hidden screen-reader text: `<span class="sr-only">required</span>` next to the label
  - Input gets `:aria-required="isRequired"` and existing HTML `:required="isRequired"` for native browser hint
- Inline hint: `<span v-if="isRequired && isEmpty" class="text-red-400/70 text-xs">This variable is required</span>` (small, subtle).
- New testids: `prompt-variable-input-{name}`, `prompt-variable-label-{name}`, `prompt-variable-required-{name}`, `prompt-variable-hint-{name}`.

**Client (`packages/client/src/pages/PlaygroundPage.vue`):**

- New `<div v-if="error" data-testid="playground-error" class="mb-4 p-3 bg-red-900/30 border border-red-500 rounded text-red-400 text-sm">{{ error }}</div>` region. Class string is the canonical error-banner format used by 6 existing pages (LoginPage, RegisterPage, PostNewPage, PostEditPage, PostViewPage, AccountLinkPage).
- Renders the prompt source content in a `<pre data-testid="playground-prompt-content">` block (currently no such display). UX intent: surfaces the raw template so the user can see what's about to run.
- Fetches `contentType` from the post (already returned by `GET /api/posts/:id`; just thread through `usePlayground`'s state) so the click handler in `PlaygroundHeader` has access for the fork redirect branch.

**Soft break-change for theoretical legacy data:** prompts authored before this PR whose variables have no `defaultValue` will now show the Run button gated until inputs are filled. **Per user confirmation, no production legacy data exists**, so this is a theoretical concern. Documented in PR description; no migration shipped.

### Feature 2 — Missing-variable error path

Implemented as a side effect of Feature 1's server validation. The structured 400 response surfaces in two places:

**Server contract:** `POST /api/playground/run` with empty/missing required vars returns:

```json
{
  "error": "Missing required variables: name, role",
  "code": "MISSING_REQUIRED_VARIABLES",
  "missing": ["name", "role"]
}
```

Status 400. The `error` field is the human-readable message (consistent with existing `{ error: '...' }` envelope across the codebase). The `code` field is the machine-readable identifier. The `missing` field is the structured array for clients that want to highlight specific fields.

**Client UI:** When `usePlayground.run()` receives a 400, it sets `error.value = body.error` (already human-readable; no client-side composition needed) and `missingVariables.value = body.missing`. The PlaygroundPage `playground-error` region renders `error`.

### Feature 3 — Fork from playground

**Client (`packages/client/src/components/playground/PlaygroundHeader.vue`):**

- New fork button placed in a **right-aligned slot with visual separation** from Run/Stop (e.g., a `flex justify-between` parent or an explicit divider). Avoids accidental clicks while filling vars.
- Testid `playground-fork-btn`.
- Click handler:

  ```ts
  async function handleFork(): Promise<void> {
    const newPostId = await usePosts().forkPost(props.sourcePostId);
    if (!newPostId) return;
    if (props.contentType === 'prompt') {
      await router.push(`/playground/${newPostId}`);
    } else {
      await router.push(`/posts/${newPostId}/edit`);
    }
  }
  ```

- New props on `PlaygroundHeader`: `sourcePostId: string`, `contentType: 'prompt' | 'snippet' | 'document' | 'link'` (or a typed union if exported).

**Client (`packages/client/src/composables/usePosts.ts`):**

- **Unchanged.** `forkPost(sourceId)` continues to return `Promise<string | null>` (the new post id). Existing call sites in `PostDetail.vue:203` and `PostViewPage.vue:112` are untouched. The redirect branch lives in the new caller (`PlaygroundHeader.handleFork`) — same pattern as the existing callers.

**Server:** No change. Existing `POST /api/posts/:id/fork` returns the new post object.

### Feature 4 — AI generate panel testing path

**No source change** to `AiGeneratePanel.vue` or `useAiGenerate.ts`'s token-flow logic. The panel continues to dispatch tokens directly into the CodeMirror editor via `editorView.dispatch(...)`.

**E2E selector:** `ai.editorContent(page)` returns `page.locator('.cm-content').first()`. AI generate-from-prompt + streaming-ui-states + mid-stream-cancel specs assert against this locator.

**Caveat:** `.cm-content` is a CodeMirror-internal class. If a CodeMirror major-version bump renames it, every AI spec breaks. Routed through the selector shard for one-line fix-up.

### Feature 5 — E2E abort hook

**Alternatives considered:**

- **B (CustomEvent):** spec dispatches `window.dispatchEvent(new CustomEvent('forge:e2e:ai-abort'))`; composable adds `addEventListener` when `__E2E__` is set. Same intrusion size (3+ lines), slightly more idiomatic but requires the composable to register a listener with cleanup. **Trade-off:** marginally cleaner separation; no cleaner gate.
- **C (exported handle):** refactor `useAiGenerate` so the AbortController is reachable via the existing `stop()` method on its return. Spec calls `await page.evaluate(() => (window as any).__playgroundStop?.())` after exposing `stop` on `window`. **Trade-off:** still requires a window export; doesn't reduce intrusion.
- **D (network-route):** Playwright's `route` API intercepts the in-flight `/api/ai/generate` request and aborts the response from the network layer. **Forbidden by issue's adversarial checklist** ("No spec mocks at the network layer").
- **A (window flag, chosen):** three runtime-gated lines in `useAiGenerate.ts` exposing a single function on window. Smallest intrusion. Honors DoD's exact `page.evaluate` wording. Defense-in-depth: gate is doubly-checked against `MODE !== 'production'` so even if `__E2E__` were somehow set in a production build, the hook stays cold.

**Client (`packages/client/src/composables/useAiGenerate.ts`):**

- Restructured to a `try { ... } finally { ... }` flow so cleanup runs on success, error, AND abort paths. The current composable has no finally block; this is a small refactor.

```ts
async function start(req: AiGenerateRequest, onToken: (text: string) => void): Promise<void> {
  const controller = new AbortController();
  const win = window as Window & {
    __E2E__?: boolean;
    __forgeE2eAiAbort?: () => void;
  };

  if (import.meta.env.MODE !== 'production' && win.__E2E__) {
    win.__forgeE2eAiAbort = () => controller.abort();
  }

  try {
    // existing fetch + SSE consumption
    const resp = await fetch('/api/ai/generate', {
      method: 'POST',
      headers: {
        /* ... */
      },
      body: JSON.stringify(req),
      signal: controller.signal,
    });
    // ... existing onToken loop
  } finally {
    if (import.meta.env.MODE !== 'production' && win.__E2E__) {
      delete win.__forgeE2eAiAbort;
    }
  }
}
```

Adds three runtime-gated lines plus a try/finally restructure. Reviewers will rightly flag this as test-shaped production code; the trade-off is honoring the DoD's explicit `page.evaluate` requirement. Defense-in-depth: `MODE !== 'production'` ensures the hook is dead code in production bundles even if `__E2E__` is somehow set.

**E2E (`e2e/fixtures/init-script.ts` — new):**

```ts
import type { Page } from '@playwright/test';

export async function attachE2EInitScript(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as Window & { __E2E__?: boolean }).__E2E__ = true;
  });
}
```

**E2E (`e2e/fixtures/auth.ts` — modify):**

- The page-bearing fixture (`auth.ts`) extends Playwright's base test and creates pre-authenticated `Page` instances per user (`testuser`, `alice`, `carol`). This is where `addInitScript` belongs — before any navigation occurs.
- Each user fixture's setup additionally calls `attachE2EInitScript(page)` after creating the context but before the first navigation. Every test page has `window.__E2E__ === true` before client code runs.

## TDD test enumeration

Each new code site has explicit test cases planned upfront. This satisfies CLAUDE.md's 100% branch coverage requirement.

### `extractRequiredVariables` (`packages/shared/src/__tests__/types/prompt.test.ts`)

8 cases:

1. Empty content → returns `[]`
2. Content with no `{{vars}}` → returns `[]`
3. Single `{{var}}` with `defaultValue: undefined` → returns `['var']`
4. Single `{{var}}` with `defaultValue: ''` → returns `['var']`
5. Single `{{var}}` with `defaultValue: '0'` → returns `[]` (truthy non-empty edge — `'0'` is a valid default)
6. Single `{{var}}` with `defaultValue: 'hello'` → returns `[]`
7. Variable in content but missing from `variables[]` array → returns `['var']` (treated as required-but-undefaulted)
8. Variable in `variables[]` array but not in content → returns `[]` (not extracted)
9. Duplicate `{{var}}` references in content → returns `['var']` once (deduped)

### Server `/api/playground/run` (`packages/server/src/__tests__/routes/playground.test.ts`)

8 cases (extending existing test file):

1. Missing single required var → 400 with `code: 'MISSING_REQUIRED_VARIABLES'`, `missing: ['name']`, human-readable `error`
2. Missing multiple required vars → 400 with `missing: ['name', 'role']`
3. All required vars present → 200 + SSE
4. All vars empty → 400 with `missing` containing every required var
5. Partial fill (some required filled, some empty) → 400 with `missing` containing only the empty ones
6. Variable has `defaultValue` and submitted value is empty → not required, request proceeds
7. Template has no `{{vars}}` at all → no validation runs, request proceeds
8. Submitted vars include extras not in template → ignored, request proceeds (extras don't break validation)
9. Whitespace-only submitted value → treated as empty (matches `.trim() === ''` semantics)
10. Order check: validation completes BEFORE `reply.raw.writeHead(200, ...)` — assert response is `application/json`, not `text/event-stream`

### `usePlayground` (`packages/client/src/__tests__/composables/usePlayground.test.ts`)

7 cases:

1. 400 with structured `MISSING_REQUIRED_VARIABLES` → `error.value` set to `body.error`, `missingVariables.value` set to `body.missing`
2. 400 with non-structured error → `error.value` set to fallback message
3. Network error → `error.value` set to network-failure message
4. `error.value` cleared on next successful run
5. `canRun` transitions: empty required → false; all filled → true; one cleared → false again
6. `requiredVariables` recomputes when post variables change
7. `canRun` returns true when no required variables exist (post has only opt-out vars)

### `usePosts.forkPost` (existing — no behavior change)

No new tests needed. The composable's existing return contract is unchanged. The new redirect-branch logic lives in `PlaygroundHeader.handleFork`, which is unit-tested alongside the component.

### `PlaygroundHeader.handleFork` (`packages/client/src/__tests__/components/playground/PlaygroundHeader.test.ts` — new or extended)

3 cases:

1. Source `contentType: 'prompt'` → router pushed to `/playground/{newId}`
2. Source `contentType: 'snippet'` → router pushed to `/posts/{newId}/edit`
3. `forkPost` returns `null` → no navigation occurs, no error thrown

### `useAiGenerate` E2E hook (`packages/client/src/__tests__/composables/useAiGenerate.test.ts`)

4 cases:

1. `__E2E__ === true` AND `MODE !== 'production'` → `window.__forgeE2eAiAbort` exposed during stream
2. `__E2E__ === false` → `window.__forgeE2eAiAbort` is NOT set (negative branch)
3. `MODE === 'production'` (mocked) AND `__E2E__ === true` → `window.__forgeE2eAiAbort` is NOT set (defense-in-depth gate active)
4. Hook calls `controller.abort()` when invoked
5. Hook deleted in `finally` on success path
6. Hook deleted in `finally` on error path
7. Hook deleted in `finally` on abort path

### `ghost-text` widget testid (`packages/client/src/__tests__/lib/ai/ghost-text.test.ts`)

1 case (extending existing test):

1. Rendered widget DOM has `data-testid="ai-autocomplete-suggestion"`

### Bruno (`bruno/playground/`)

- `run-prompt-missing-required.bru` (new): submits a prompt with required vars, empty `variables{}`. Asserts `res.status: eq 400` AND inspects body via post-response script: `expect(res.body.code).to.equal('MISSING_REQUIRED_VARIABLES')` AND `expect(res.body.missing).to.be.an('array').that.is.not.empty`.
- `run-prompt-invalid.bru` (existing — verify): re-run after the change to confirm whether it now hits the new validation path (was previously reaching some other 400). If it does, update its assertions to include the new `code` field. If it still hits a Zod-level 400, leave it but add a note in the file.

## Test surface — 16 specs

### Playground (9 specs, `e2e/specs/playground/`)

Every spec calls `withMockScript(testuser, '<key>')` explicitly — no spec relies on the default-fallback path.

| #   | File                                    | Script                  | Assertion summary                                                                                                                                                                                          |
| --- | --------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `open-prompt-page.spec.ts`              | `default`               | Page renders header, prompt content, run button.                                                                                                                                                           |
| 2   | `fill-and-run-streams.spec.ts`          | `default`               | Fill required var, run, assert streamed chunks via `expect.poll` on PromptOutput; covers progressive render.                                                                                               |
| 3   | `copy-output.spec.ts`                   | `default`               | After run, copy button writes streamed content to clipboard (Chromium permissions granted in spec).                                                                                                        |
| 4   | `variable-validation-required.spec.ts`  | `default`               | Run button disabled when required var empty; enabled when filled. Required `*` indicator visible. `aria-required="true"` on input. Title attribute "Fill required variables to run" present when disabled. |
| 5   | `variable-defaultvalue-opt-out.spec.ts` | `default`               | Variable with `defaultValue` is NOT required; Run button enabled even when input empty. No `*` indicator.                                                                                                  |
| 6   | `save-as-fork.spec.ts`                  | `default`               | Fork button creates new prompt post; navigates to `/playground/{newId}`; new post owned by current user.                                                                                                   |
| 7   | `missing-variable-error.spec.ts`        | `default`               | Direct API call with empty required vars returns 400 + `code: 'MISSING_REQUIRED_VARIABLES'` + `missing: [...]` + human-readable `error`.                                                                   |
| 8   | `multiple-variables.spec.ts`            | `default`               | Post with 2+ required vars; all rendered, all gated, fill all → run.                                                                                                                                       |
| 9   | `mock-script-readme.spec.ts`            | `generate-readme-short` | README chunks rendered; deterministic substring assertion (e.g., `## ` from script).                                                                                                                       |

**UI error-surface coverage:** the client side of "server 400 → `error.value` → playground-error region" is covered by `usePlayground.test.ts` (Vitest unit), not E2E. Reasoning: forcing the UI to call `/api/playground/run` with empty vars from an E2E spec requires either (a) a test-only window hook that bypasses `canRun` gating (additional production-source intrusion), or (b) a query-param escape hatch (worse — visible to users). The unit test directly drives the composable's 400 → error path with no DOM intrusion. The DoD bullet "missing-variable error path" is satisfied by spec #7 (server contract) + the unit test (composable mapping) + spec #4 (UI gate prevents the user from ever reaching the error in normal use).

### AI (7 specs, `e2e/specs/ai/`)

| #   | File                                 | Script                          | Assertion summary                                                                                                                                                                                                                          |
| --- | ------------------------------------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `autocomplete-token-trigger.spec.ts` | `autocomplete-typescript-react` | Typing tokens triggers ghost text (testid `ai-autocomplete-suggestion` visible).                                                                                                                                                           |
| 2   | `autocomplete-accept-tab.spec.ts`    | `autocomplete-typescript-react` | Tab key inserts the suggestion text into the editor.                                                                                                                                                                                       |
| 3   | `autocomplete-dismiss-esc.spec.ts`   | `autocomplete-typescript-react` | Esc removes ghost text without inserting; editor content unchanged.                                                                                                                                                                        |
| 4   | `generate-from-prompt.spec.ts`       | `generate-readme-short`         | Generate panel streams chunks INTO the editor; assert via `ai.editorContent(page)` `.cm-content` locator.                                                                                                                                  |
| 5   | `error-during-stream.spec.ts`        | `error-rate-limit`              | `ai-generate-error` UI surfaces with rate-limit message.                                                                                                                                                                                   |
| 6   | `mid-stream-cancel.spec.ts`          | `mid-stream-cancel`             | `await page.evaluate(() => window.__forgeE2eAiAbort?.())` mid-stream → UI returns to idle (`ai-generate-loading` count 0, `ai-generate-stop` count 0); follow-up `/api/ai/generate` request does NOT 429 (proves rate-limit slot release). |
| 7   | `streaming-ui-states.spec.ts`        | `generate-readme-short`         | Loading visible → partial content polled via `expect.poll` on `.cm-content` → completion (loading disappears).                                                                                                                             |

## Selector shards

### `e2e/fixtures/selectors/playground.ts` (new)

```ts
import type { Page, Locator } from '@playwright/test';

export const playground = {
  page: (p: Page): Locator => p.getByTestId('playground-page'),
  header: (p: Page): Locator => p.getByTestId('playground-header'),
  title: (p: Page): Locator => p.getByTestId('playground-title'),
  promptContent: (p: Page): Locator => p.getByTestId('playground-prompt-content'),

  variableInput: (p: Page, name: string): Locator => p.getByTestId(`prompt-variable-input-${name}`),
  variableLabel: (p: Page, name: string): Locator => p.getByTestId(`prompt-variable-label-${name}`),
  variableRequiredMark: (p: Page, name: string): Locator =>
    p.getByTestId(`prompt-variable-required-${name}`),
  variableHint: (p: Page, name: string): Locator => p.getByTestId(`prompt-variable-hint-${name}`),

  runBtn: (p: Page): Locator => p.getByTestId('playground-run-btn'),
  stopBtn: (p: Page): Locator => p.getByTestId('playground-stop-btn'),
  forkBtn: (p: Page): Locator => p.getByTestId('playground-fork-btn'),

  error: (p: Page): Locator => p.getByTestId('playground-error'),

  output: (p: Page): Locator => p.getByTestId('prompt-output'),
  outputContent: (p: Page): Locator => p.getByTestId('prompt-output-content'),
  outputLoading: (p: Page): Locator => p.getByTestId('prompt-output-loading'),
  copyBtn: (p: Page): Locator => p.getByTestId('copy-button'),
};
```

### `e2e/fixtures/selectors/ai.ts` (modified)

```ts
import type { Page, Locator } from '@playwright/test';

export const ai = {
  // Autocomplete (CodeMirror ghost-text widget)
  autocompleteSuggestion: (p: Page): Locator => p.getByTestId('ai-autocomplete-suggestion'),

  // Generate panel
  generateToggle: (p: Page): Locator => p.getByTestId('ai-generate-toggle'),
  generatePanel: (p: Page): Locator => p.getByTestId('ai-generate-panel'),
  generateDescription: (p: Page): Locator => p.getByTestId('ai-generate-description'),
  generateSubmit: (p: Page): Locator => p.getByTestId('ai-generate-submit'),
  generateStop: (p: Page): Locator => p.getByTestId('ai-generate-stop'),
  generateCancel: (p: Page): Locator => p.getByTestId('ai-generate-cancel'),
  generateLoading: (p: Page): Locator => p.getByTestId('ai-generate-loading'),
  generateError: (p: Page): Locator => p.getByTestId('ai-generate-error'),

  // Editor where AI tokens land
  editorContent: (p: Page): Locator => p.locator('.cm-content').first(),
};
```

`acceptSuggestion` is dropped — Tab-key acceptance is a keyboard interaction with no separate accept button.

## File scope

**Create:**

```
docs/superpowers/specs/2026-05-01-issue-50-playground-ai-feature-additions-design.md  (this file)
e2e/fixtures/init-script.ts                                                            (E2E init helper)
e2e/fixtures/selectors/playground.ts                                                   (selector shard)
e2e/specs/playground/*.spec.ts                                                         (9 specs)
e2e/specs/ai/*.spec.ts                                                                 (7 specs)
bruno/playground/run-prompt-missing-required.bru                                       (new Bruno test for missing-required-vars 400)
```

**Modify:**

```
packages/shared/src/types/prompt.ts                              (extractRequiredVariables helper)
packages/server/src/routes/playground.ts                         (server-side validation BEFORE writeHead)
packages/client/src/composables/usePlayground.ts                 (canRun, error, requiredVariables, missingVariables; fetch contentType)
packages/client/src/composables/useAiGenerate.ts                 (E2E abort hook with try/finally + MODE gate)
packages/client/src/pages/PlaygroundPage.vue                     (data-testids + canonical-styled error region + prompt-content render)
packages/client/src/components/playground/PlaygroundHeader.vue   (data-testids + fork button right-aligned + Run/Stop split testids + title attr + new props)
packages/client/src/components/playground/PromptVariableInput.vue (data-testids + locally-derived required + a11y semantics + inline hint)
packages/client/src/components/playground/PromptOutput.vue       (prompt-output, prompt-output-content, prompt-output-loading testids)
packages/client/src/components/editor/AiGeneratePanel.vue        (data-testid additions on existing elements: panel, loading)
packages/client/src/lib/ai/ghost-text.ts                         (data-testid="ai-autocomplete-suggestion" on widget span)
e2e/fixtures/selectors/ai.ts                                     (expand)
e2e/fixtures/auth.ts                                             (wire init-script into per-user page setup)
bruno/playground/run-prompt-invalid.bru                          (verify post-change behavior; update assertions if it now hits new validation)
```

**Tests added/updated:**

```
packages/shared/src/__tests__/types/prompt.test.ts                (extractRequiredVariables — 9 cases)
packages/server/src/__tests__/routes/playground.test.ts           (missing-var 400 — 10 cases)
packages/client/src/__tests__/composables/usePlayground.test.ts   (canRun + error + requiredVariables — 7 cases)
packages/client/src/__tests__/composables/useAiGenerate.test.ts   (E2E hook — 7 cases)
packages/client/src/__tests__/components/playground/PlaygroundHeader.test.ts (fork redirect branch — 3 cases) [new]
packages/client/src/__tests__/lib/ai/ghost-text.test.ts           (widget testid — 1 case)
```

`usePosts.test.ts` is NOT modified — `usePosts.forkPost` is unchanged. The redirect-branch logic moved to `PlaygroundHeader.handleFork`.

## Non-goals

- `kind: 'playground'` post-schema field (Q6.A)
- Inline prompt-template editing on PlaygroundPage (Q5 rejected option C)
- AiGeneratePanel local output rendering (Q3.A)
- Back-compat migration setting `defaultValue: ''` on existing variable rows (accepted soft break; user confirmed no legacy data exists)

(Bruno changes ARE in scope per REV 1 — the `/api/playground/run` contract changes; new `.bru` for the missing-required path required per CLAUDE.md.)

## Risks

1. **Theoretical soft break-change for hypothetical legacy data.** Per user confirmation, no production legacy data exists. Risk is moot in practice; documented anyway.
2. **`.cm-content` selector dependency.** CodeMirror class-name changes break AI specs. One-line fix in selector shard.
3. **`window.__E2E__` source-code intrusion.** Three runtime-gated lines + try/finally restructure in `useAiGenerate.ts`. Necessary to honor the DoD's explicit `page.evaluate` requirement; doubly-gated by `MODE !== 'production'` for defense-in-depth.
4. **Per-userId AI rate-limiter at workers=4.** Four parallel testuser specs will collide on the per-user 1-concurrent limit. Plan-time mitigation: spread AI specs across `testuser`/`alice`/`carol` (least token-cost, most parallelism preserved). Fallback: `test.describe.configure({ mode: 'serial' })` for the AI file.
5. **Issue body still says "Out of scope: any other feature folder".** Must be amended before merge — see §"Issue body amendment plan".
6. **AI panel mid-stream cancel coupling.** The mid-stream-cancel spec depends on both the `__forgeE2eAiAbort` window hook AND the rate-limiter's `onError`/`onResponse` slot release. Mitigated by the `useAiGenerate.test.ts` unit cases covering the abort path; the rate-limiter's slot release is covered by existing server unit tests. The E2E spec is the integration verifier.

## Issue body amendment plan

After the design doc is approved AND the design-review-gate passes AND the implementation plan is drafted AND the plan-review-gate passes (i.e., immediately before user picks execution method), the issue body will be amended via `gh issue edit 50` to:

1. Replace `Out of scope: server changes (mock provider lives in #1a); any other feature folder.` with:

   > Out of scope: `kind: 'playground'` schema field; inline prompt-template editing on PlaygroundPage; AiGeneratePanel local output rendering; back-compat migration for prompts without `defaultValue` (no legacy data exists).

2. Add a new section "Now in scope (per design)":

   > - `extractRequiredVariables` helper in `packages/shared/src/types/prompt.ts`
   > - Server-side missing-required-var validation in `/api/playground/run` (returns 400 with `{ error, code: 'MISSING_REQUIRED_VARIABLES', missing: [...] }`)
   > - Client `canRun` gating + `error` surface in `usePlayground`
   > - Required-variable `*` indicator + `aria-required` semantics in `PromptVariableInput`
   > - Fork button on `PlaygroundHeader` with redirect branch (prompt → `/playground/{newId}`, else → `/posts/{newId}/edit`); `usePosts.forkPost` itself unchanged
   > - E2E abort hook in `useAiGenerate.ts` (gated by `window.__E2E__` set via Playwright `addInitScript`, plus `MODE !== 'production'` defense-in-depth)
   > - New Bruno test `bruno/playground/run-prompt-missing-required.bru` for the new 400 contract

3. Add a "Soft break-change" note:

   > Authored prompts whose `{{vars}}` lack `defaultValue` will now show the Run button gated until inputs are filled. No production legacy data exists, so this is a theoretical concern only.

4. Update spec count: `(~10 + ~8) → (9 + 7) = 16`. (Playground band 8–12; AI band 7–9 — both still satisfied.)

User confirms the amendment text before I run `gh issue edit 50`.

## Acceptance criteria (binary)

### Technical

- [ ] `extractRequiredVariables` shipped + 9 unit-test cases passing
- [ ] `/api/playground/run` rejects empty required vars with 400 `{ error, code: 'MISSING_REQUIRED_VARIABLES', missing: [...] }`; validation runs BEFORE `writeHead`
- [ ] PlaygroundHeader renders Run button (gated, with `title` attr), Stop button, and new fork button (right-aligned with separation)
- [ ] PromptVariableInput renders `*` indicator on required vars + `aria-required="true"` on input + visually-hidden "required" SR text
- [ ] PlaygroundHeader's `handleFork` redirects to `/playground/{newId}` for prompt sources and `/posts/{newId}/edit` otherwise (`usePosts.forkPost` unchanged)
- [ ] `useAiGenerate.ts` exposes `window.__forgeE2eAiAbort` only when both `MODE !== 'production'` AND `window.__E2E__` are set; cleanup in `finally`
- [ ] `e2e/fixtures/init-script.ts` + `auth.ts` fixture wiring sets `__E2E__` on every test page before navigation
- [ ] `bruno/playground/run-prompt-missing-required.bru` asserts the new 400 shape
- [ ] 9 playground specs + 7 ai specs all explicitly set `X-Mock-Script` and pass at workers=1 AND workers=4
- [ ] 3 consecutive green CI runs on the branch
- [ ] Vitest coverage thresholds met (per `.coverage-thresholds.json`)
- [ ] Bruno regression suite green
- [ ] Tracking issue #43 updated
- [ ] Issue #50 body amended per §"Issue body amendment plan"
- [ ] Closes #50

### User outcomes

- [ ] A user opening a prompt with required vars sees the Run button gated AND understands why (visible `*` indicator + tooltip when hovering disabled button)
- [ ] A user with a screen reader hears each required variable announced as required (via `aria-required="true"` + visually-hidden "required" text)
- [ ] A user clicking Fork on a prompt lands on `/playground/{newId}` with their copy ready to edit (not on a snippet edit page)
- [ ] A user submitting empty required vars (via direct API call) gets a human-readable error message naming every missing variable, not just the first
- [ ] A user mid-stream of an AI generate call can cancel via the UI Stop button (E2E hook does NOT replace the existing UX — it adds a test affordance)
