# Issue #50 — Playground + AI Feature Additions + E2E Specs (Design)

**Issue:** [#50 — E2E rollout 5/9](https://github.com/multiandrewlab/forge/issues/50)
**Tracking issue:** [#43 — E2E Playwright rollout](https://github.com/multiandrewlab/forge/issues/43)
**Status:** APPROVED 2026-05-01
**Predecessor:** PR #74 (issue #49) merged 2026-05-01

## Why this design exists

The original issue body assumed several playground/AI features were already shipped (in #1a, the mock-LLM PR). The plan-review gate revealed they aren't. Eight of the planned specs would have tested behavior the codebase doesn't produce:

- `kind: 'playground'` post field (does not exist; `Post` schema uses `contentType` only)
- Required-variable validation (`PromptVariable` has no `required` field; Run is never gated)
- Missing-variable server rejection (`/api/playground/run` accepts empty `variables`; `assemblePrompt` silently leaves `{{var}}` placeholders)
- Fork-from-playground UI (fork button lives only on `PostDetail`; redirects to `/posts/{id}/edit`)
- AiGeneratePanel local output rendering (tokens dispatch directly into the CodeMirror editor; the panel has no `streamedOutput` ref)

Rather than skip the affected DoD bullets or test features that don't exist, this design extends scope to **build the missing features** and **then** assert them via E2E. This is consistent with the user's option-2 decision after the plan-review gate failed.

## Decision log (Q1–Q6)

| #   | Decision                                               | Choice                                                                                                                               |
| --- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Required-variable model                                | **A.** Implicit required, `defaultValue` as opt-out. No new schema field.                                                            |
| 2   | Fork-from-playground UI placement                      | **A.** New fork button in `PlaygroundHeader`.                                                                                        |
| 3   | AI generate streaming assertion                        | **A.** Test against `.cm-content` (the editor). No panel-local mirror.                                                               |
| 4   | `page.evaluate(AbortController.abort)` honor mechanism | **A.** Playwright `addInitScript` sets `window.__E2E__ = true`; `useAiGenerate.ts` conditionally exposes `window.__forgeE2eAiAbort`. |
| 5   | Fork semantics                                         | **A.** Fork = clone source content; modifications optional and post-fork.                                                            |
| 6   | `kind: 'playground'` field                             | **A.** Skip; use existing `contentType: 'prompt'` as the playground signal.                                                          |

## Architecture

### Feature 1 — Required-variable validation

**Source of truth:** A variable is **required** iff its `PromptVariable.defaultValue` is undefined or empty string. No new schema field.

**Shared helper (new):** `extractRequiredVariables(content: string, variables: PromptVariable[]): string[]`

- Lives in `packages/shared/src/types/prompt.ts` next to `extractVariables` and `assemblePrompt`.
- Returns the names of variables present in `extractVariables(content)` whose `defaultValue` is undefined or empty.
- Pure function, no side effects.

**Server (`packages/server/src/routes/playground.ts`):**

- In the `/api/playground/run` handler, before invoking the LLM:
  ```ts
  const required = extractRequiredVariables(latest.content, post.variables);
  const missing = required.filter((name) => !submitted.variables[name]);
  if (missing.length) {
    return reply.status(400).send({
      error: 'MISSING_REQUIRED_VARIABLES',
      missing,
    });
  }
  ```
- Emits a structured 400 JSON body that the client can parse for the missing-variable UI surface.

**Client (`packages/client/src/composables/usePlayground.ts`):**

- New computed `requiredVariables: ComputedRef<string[]>` derived from the post's variables and content.
- New computed `canRun: ComputedRef<boolean>` returning `false` when any required variable's input is empty.
- `run()` catches the 400 response, parses the structured error, sets a reactive `error: Ref<string | null>` with a user-friendly message ("Missing required variables: name, role").

**Client (`packages/client/src/components/playground/PlaygroundHeader.vue`):**

- Run button receives `:disabled="!canRun"` from `usePlayground`.
- New `data-testid="playground-run-btn"` (or whichever the existing button has — preserve if any).

**Client (`packages/client/src/components/playground/PromptVariableInput.vue`):**

- Renders a `*` indicator next to the label when the variable is required.
- New `data-testid="prompt-variable-input-{name}"`, `data-testid="prompt-variable-label-{name}"`, `data-testid="prompt-variable-required-{name}"`.

**Client (`packages/client/src/pages/PlaygroundPage.vue`):**

- New `<div v-if="error" data-testid="playground-error">{{ error }}</div>` region.
- Renders the prompt source content in a `<pre data-testid="playground-prompt-content">` block (currently no such display — adds visibility of the template that's about to run).

**Soft break-change:** prompts authored before this PR whose variables have no `defaultValue` will now show the Run button gated until inputs are filled. Considered acceptable because users were always expected to fill `{{vars}}`. Documented in PR description; no migration shipped.

### Feature 2 — Missing-variable error path

Implemented as a side effect of Feature 1's server validation. The structured 400 response surfaces in two places:

**Server contract:** `POST /api/playground/run` with empty/missing required vars returns:

```json
{
  "error": "MISSING_REQUIRED_VARIABLES",
  "missing": ["name", "role"]
}
```

Status 400.

**Client UI:** When `usePlayground.run()` receives a 400, it sets `error.value = 'Missing required variables: ' + missing.join(', ')`. The PlaygroundPage `playground-error` region renders this.

### Feature 3 — Fork from playground

**Client (`packages/client/src/components/playground/PlaygroundHeader.vue`):**

- New fork button next to Run/Stop. Testid `playground-fork-btn`.
- On click: calls existing `usePosts().forkPost(sourceId)`.

**Client (`packages/client/src/composables/usePosts.ts`):**

- `forkPost(sourceId)` is updated (or a sibling `forkPostAndRedirect` is added) so post-fork navigation branches on `source.contentType`:
  ```ts
  if (source.contentType === 'prompt') {
    router.push(`/playground/${newPost.id}`);
  } else {
    router.push(`/posts/${newPost.id}/edit`);
  }
  ```
- The existing PostDetail fork path continues to work for non-prompt content types.

**Server:** No change. Existing `POST /api/posts/:id/fork` returns the new post object.

### Feature 4 — AI generate panel testing path

**No source change** to `AiGeneratePanel.vue` or `useAiGenerate.ts`'s token-flow logic. The panel continues to dispatch tokens directly into the CodeMirror editor via `editorView.dispatch(...)`.

**E2E selector:** `ai.editorContent(page)` returns `page.locator('.cm-content').first()`. AI generate-from-prompt + streaming-ui-states + mid-stream-cancel specs assert against this locator.

**Caveat:** `.cm-content` is a CodeMirror-internal class. If a CodeMirror major-version bump renames it, every AI spec breaks. Routed through the selector shard for one-line fix-up.

### Feature 5 — E2E abort hook

**Client (`packages/client/src/composables/useAiGenerate.ts`):**

- After creating the AbortController:
  ```ts
  const win = window as Window & {
    __E2E__?: boolean;
    __forgeE2eAiAbort?: () => void;
  };
  if (win.__E2E__) {
    win.__forgeE2eAiAbort = () => controller.abort();
  }
  ```
- Cleanup in stream-end and unmount paths:
  ```ts
  if (win.__E2E__) {
    delete win.__forgeE2eAiAbort;
  }
  ```
- Adds three runtime-gated lines. Reviewers will rightly flag this as test-shaped production code; the tradeoff is honoring the DoD's explicit `page.evaluate` requirement.

**E2E (`e2e/fixtures/init-script.ts` — new):**

```ts
import type { Page } from '@playwright/test';
export async function attachE2EInitScript(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as Window & { __E2E__?: boolean }).__E2E__ = true;
  });
}
```

**E2E (`e2e/fixtures/reset.ts` — modify):**

- Existing reset fixture's per-page setup additionally calls `attachE2EInitScript(page)` before any navigation. Every test page has `window.__E2E__ === true` before client code runs.

## Test surface — 16 specs

### Playground (9 specs, `e2e/specs/playground/`)

Every spec calls `withMockScript(testuser, '<key>')` explicitly — no spec relies on the default-fallback path.

| #   | File                                    | Script                  | Assertion summary                                                                                            |
| --- | --------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------ |
| 1   | `open-prompt-page.spec.ts`              | `default`               | Page renders header, prompt content, run button.                                                             |
| 2   | `fill-and-run-streams.spec.ts`          | `default`               | Fill required var, run, assert streamed chunks via `expect.poll` on PromptOutput; covers progressive render. |
| 3   | `copy-output.spec.ts`                   | `default`               | After run, copy button writes streamed content to clipboard (Chromium permissions granted in spec).          |
| 4   | `variable-validation-required.spec.ts`  | `default`               | Run button disabled when required var empty; enabled when filled. Required `*` indicator visible.            |
| 5   | `variable-defaultvalue-opt-out.spec.ts` | `default`               | Variable with `defaultValue` is NOT required; Run button enabled even when input empty.                      |
| 6   | `save-as-fork.spec.ts`                  | `default`               | Fork button creates new prompt post; navigates to `/playground/{newId}`; new post owned by current user.     |
| 7   | `missing-variable-error.spec.ts`        | `default`               | Direct API call with empty required vars returns 400 + `MISSING_REQUIRED_VARIABLES` + `missing: [...]`.      |
| 8   | `multiple-variables.spec.ts`            | `default`               | Post with 2+ required vars; all rendered, all gated, fill all → run.                                         |
| 9   | `mock-script-readme.spec.ts`            | `generate-readme-short` | README chunks rendered; deterministic substring assertion (e.g., `## ` from script).                         |

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

  runBtn: (p: Page): Locator => p.getByTestId('playground-run-btn'),
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
e2e/specs/playground/*.spec.ts                                                         (10 specs)
e2e/specs/ai/*.spec.ts                                                                 (7 specs)
```

**Modify:**

```
packages/shared/src/types/prompt.ts                                                    (extractRequiredVariables helper)
packages/server/src/routes/playground.ts                                               (server-side required-var validation)
packages/client/src/composables/usePlayground.ts                                       (canRun, error, requiredVariables computeds)
packages/client/src/composables/usePosts.ts                                            (fork redirect branch)
packages/client/src/composables/useAiGenerate.ts                                       (E2E abort hook, gated)
packages/client/src/pages/PlaygroundPage.vue                                           (data-testids + error region + prompt-content render)
packages/client/src/components/playground/PlaygroundHeader.vue                         (data-testids + fork button + Run button gating)
packages/client/src/components/playground/PromptVariableInput.vue                      (data-testids + required indicator)
packages/client/src/components/playground/PromptOutput.vue                             (data-testid additions)
packages/client/src/components/editor/AiGeneratePanel.vue                              (data-testid additions on existing elements)
packages/client/src/lib/ai/ghost-text.ts                                               (data-testid on widget span)
e2e/fixtures/selectors/ai.ts                                                           (expand)
e2e/fixtures/reset.ts                                                                  (wire init-script into per-page setup)
```

**Tests added/updated:**

```
packages/shared/src/__tests__/types/prompt.test.ts                                     (extractRequiredVariables coverage)
packages/server/src/__tests__/routes/playground.test.ts                                (missing-var 400 contract)
packages/client/src/__tests__/composables/usePlayground.test.ts                        (canRun + error)
packages/client/src/__tests__/composables/usePosts.test.ts                             (fork redirect branch)
packages/client/src/__tests__/lib/ai/ghost-text.test.ts                                (widget testid)
```

## Non-goals

- `kind: 'playground'` post-schema field (Q6.A)
- Inline prompt-template editing on PlaygroundPage (Q5 rejected option C)
- AiGeneratePanel local output rendering (Q3.A)
- Back-compat migration setting `defaultValue: ''` on existing variable rows (accepted soft break)
- Bruno changes (no new API endpoints; existing endpoints' contracts change with the structured 400 — Bruno auth/posts/playground tests should be re-run as a regression check, but no new `.bru` files are required)

## Risks

1. **Soft break-change for existing prompts.** Authored prompts whose `{{vars}}` lack `defaultValue` will start gating Run. Acceptable per user decision (accepted as documented in PR).
2. **`.cm-content` selector dependency.** CodeMirror class-name changes break AI specs. One-line fix in selector shard.
3. **`window.__E2E__` source-code intrusion.** Three runtime-gated lines in `useAiGenerate.ts`. Necessary to honor the DoD's explicit `page.evaluate` requirement; gate is unambiguous (only the test runtime sets `__E2E__`).
4. **Per-userId AI rate-limiter at workers=4.** Four parallel testuser specs will collide on the per-user 1-concurrent limit. Mitigation tiers (in plan): `test.describe.configure({ mode: 'serial' })` for the AI file; spread to `alice`/`carol`; reduce e2e workers to 2 in `playwright.config.ts`.
5. **Issue body still says "Out of scope: any other feature folder".** Must be amended before merge — see Section 7.
6. **AI panel mid-stream cancel coupling.** The mid-stream-cancel spec depends on both the `__forgeE2eAiAbort` window hook AND the rate-limiter's `onError`/`onResponse` slot release. If the slot release is itself broken, the spec correctly fails — but the failure mode points at the abort hook even though the bug is upstream. Mitigation: the unit test in `useAiGenerate.test.ts` covers the abort path; the rate-limiter's slot release is covered by existing server unit tests. The E2E spec is the integration verifier.

## Issue body amendment plan

After the design doc is approved AND the design-review-gate passes AND the implementation plan is drafted AND the plan-review-gate passes (i.e., immediately before user picks execution method), the issue body will be amended via `gh issue edit 50` (or a comment) to:

1. Replace `Out of scope: server changes (mock provider lives in #1a); any other feature folder.` with:

   > Out of scope: `kind: 'playground'` schema field; inline prompt-template editing on PlaygroundPage; AiGeneratePanel local output rendering; back-compat migration for prompts without `defaultValue`.

2. Add a new section "Now in scope (per design)":

   > - `extractRequiredVariables` helper in `packages/shared/src/types/prompt.ts`
   > - Server-side missing-required-var validation in `/api/playground/run`
   > - Client `canRun` gating + `error` surface in `usePlayground`
   > - Required-variable `*` indicator in `PromptVariableInput`
   > - Fork button + redirect logic on `PlaygroundPage` / `PlaygroundHeader`
   > - E2E abort hook in `useAiGenerate.ts` (gated by `window.__E2E__` set via Playwright `addInitScript`)

3. Update spec count: `(~10 + ~8) → (9 + 7) = 16`. (Playground band 8–12; AI band 7–9 — both still satisfied.)

User confirms the amendment before I edit the issue.

## Acceptance criteria (binary)

- [ ] `extractRequiredVariables` shipped + unit-tested
- [ ] `/api/playground/run` rejects empty required vars with 400 `MISSING_REQUIRED_VARIABLES` + `missing[]`
- [ ] PlaygroundHeader renders Run button (gated), Stop button, and new fork button
- [ ] PromptVariableInput renders `*` indicator on required vars
- [ ] `usePosts.forkPost` redirects to `/playground/{newId}` for prompt sources
- [ ] `useAiGenerate.ts` exposes `window.__forgeE2eAiAbort` only when `window.__E2E__` is set
- [ ] `e2e/fixtures/init-script.ts` + reset fixture wiring sets `__E2E__` on every test page
- [ ] 9 playground specs + 7 ai specs all explicitly set `X-Mock-Script` and pass at workers=1 AND workers=4
- [ ] 3 consecutive green CI runs on the branch
- [ ] Vitest coverage thresholds met (per `.coverage-thresholds.json`)
- [ ] Bruno regression suite green
- [ ] Tracking issue #43 updated
- [ ] Issue #50 body amended per Section 7
- [ ] Closes #50
