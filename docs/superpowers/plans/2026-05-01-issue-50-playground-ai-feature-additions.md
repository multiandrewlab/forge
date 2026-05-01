# Issue #50 — Playground + AI Feature Additions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Per CLAUDE.md, the user chooses the execution method after the plan-review-gate passes. Options are (1) `metaswarm:orchestrated-execution` 4-phase loop per WU, (2) `superpowers:subagent-driven-development`, or (3) `superpowers:executing-plans`. Steps use checkbox (`- [ ]`) syntax for tracking. One commit per Work Unit (WU) per project convention.

**Goal:** Build 4 missing features (required-variable validation, missing-variable server rejection, fork-from-playground UI, E2E abort hook) AND add 16 Playwright specs (9 playground + 7 ai) that exercise the deterministic mock LLM provider, all per the approved design.

**Architecture:** Five-layer change. (1) Shared pure helper for required-var extraction. (2) Server validation pipeline restructure that runs `assertCanReadPost` before any leaks. (3) Seed updates so the demo prompt stays runnable + a dedicated fixture for the missing-required spec. (4) Client composable + component updates with locally-derived required-state, an `aria-described-by` live region, and an E2E-only abort hook on `useAiGenerate` gated by `MODE !== 'production' && window.__E2E__`. (5) E2E init-script fixture wiring + selector shards + 16 specs with deterministic per-user assignment for workers=4 rate-limit safety.

**Tech Stack:** TypeScript strict · Vue 3 (composition API) · Pinia · Vue Router · CodeMirror 6 · Fastify · Playwright · Vitest · Bruno · Tailwind v4.

**Approved design:** [`docs/superpowers/specs/2026-05-01-issue-50-playground-ai-feature-additions-design.md`](../specs/2026-05-01-issue-50-playground-ai-feature-additions-design.md) (REV 3).

---

## DoD reconciliation

| Issue #50 DoD bullet                                      | Plan WU                              |
| --------------------------------------------------------- | ------------------------------------ |
| `e2e/specs/playground/` (9 specs)                         | WU8                                  |
| `e2e/specs/ai/` (7 specs)                                 | WU9                                  |
| `e2e/fixtures/selectors/playground.ts` (new)              | WU7 Task 7.3                         |
| `e2e/fixtures/selectors/ai.ts` (expand)                   | WU7 Task 7.4                         |
| `data-testid` on Playground subtree + editor subtree      | WU6 (all tasks)                      |
| All specs use typed `mock-llm.ts`, never default fallback | WU8 + WU9 (every spec) + Self-Review |
| Mid-stream cancel verifies rate-limit slot release        | WU9 Task 9.6                         |
| Workers=1 AND workers=4 pass                              | WU10 Task 10.1                       |
| 3 consecutive green CI runs                               | WU10 Task 10.3                       |
| Vitest + Bruno gates pass                                 | WU10 Task 10.2                       |
| Tracking issue #43 updated                                | WU10 Task 10.4                       |
| Closes #50                                                | WU11 PR body                         |

## Now-in-scope (per approved design)

| Feature/Artifact                                                                                                              | Plan WU      |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------ |
| `extractRequiredVariables` shared helper                                                                                      | WU1          |
| Server validation pipeline + structured 400                                                                                   | WU2          |
| Seed update + new fixture post                                                                                                | WU3          |
| New + verified Bruno tests                                                                                                    | WU4          |
| `usePlayground` updates (`canRun`, `error`, `loadError`, `requiredVariables`, `missingVariables`, `currentPost`, `fetchPost`) | WU5 Task 5.1 |
| `useAiGenerate` E2E hook with try/catch/finally restructure                                                                   | WU5 Task 5.2 |
| `PromptVariableInput` (locally-derived required + a11y)                                                                       | WU6 Task 6.1 |
| `PromptOutput` testid additions                                                                                               | WU6 Task 6.2 |
| `PlaygroundHeader` (split Run/Stop, fork button, aria-describedby live region, content-type prop)                             | WU6 Task 6.3 |
| `PlaygroundPage` (page-level testids, two error regions, source disclosure, fetchPost wiring)                                 | WU6 Task 6.4 |
| `AiGeneratePanel` testid additions                                                                                            | WU6 Task 6.5 |
| `ghost-text.ts` widget testid                                                                                                 | WU6 Task 6.6 |
| E2E init-script + auth fixture wiring                                                                                         | WU7          |
| 9 playground specs                                                                                                            | WU8          |
| 7 AI specs                                                                                                                    | WU9          |
| Workers parity + axe-core + CI                                                                                                | WU10         |
| Follow-up issues + CLAUDE.md update + self-reflect + PR                                                                       | WU11         |

---

## Seeded fixtures (post-WU3)

| Fixture                   | UUID                              | Role                                                 |
| ------------------------- | --------------------------------- | ---------------------------------------------------- |
| testuser                  | `a0000000-...-000000000099`       | Default authenticated user                           |
| alice                     | `a0000000-...-000000000001`       | Author of the React Component Generator demo prompt  |
| carol                     | `a0000000-...-000000000003`       | Used by 2 AI specs to spread rate-limit at workers=4 |
| Demo prompt (alice)       | `c0000000-...-000000000004`       | Fully-defaulted after seed update (no required vars) |
| Required-var fixture post | `c0000000-...-000000000005` (NEW) | Has 1 NULL-default variable; used by Bruno + spec 7  |
| `props` variable row      | `f0000000-...-000000000002`       | Default updated to `'name: string, age: number'`     |
| New required-var row      | `f0000000-...-000000000004` (NEW) | NULL default; on the new fixture post                |
| New revision row          | `d0000000-...-000000000006` (NEW) | Initial revision for the new fixture post            |

(UUIDs are illustrative — implementer picks the next-available IDs in the seed file's range.)

---

## File structure

**Create (new files):**

```
docs/superpowers/plans/2026-05-01-issue-50-playground-ai-feature-additions.md  (this file)
e2e/fixtures/init-script.ts
e2e/fixtures/selectors/playground.ts
e2e/specs/playground/open-prompt-page.spec.ts
e2e/specs/playground/fill-and-run-streams.spec.ts
e2e/specs/playground/copy-output.spec.ts
e2e/specs/playground/variable-validation-required.spec.ts
e2e/specs/playground/variable-defaultvalue-opt-out.spec.ts
e2e/specs/playground/save-as-fork.spec.ts
e2e/specs/playground/missing-variable-error.spec.ts
e2e/specs/playground/multiple-variables.spec.ts
e2e/specs/playground/mock-script-readme.spec.ts
e2e/specs/ai/autocomplete-token-trigger.spec.ts
e2e/specs/ai/autocomplete-accept-tab.spec.ts
e2e/specs/ai/autocomplete-dismiss-esc.spec.ts
e2e/specs/ai/generate-from-prompt.spec.ts
e2e/specs/ai/error-during-stream.spec.ts
e2e/specs/ai/mid-stream-cancel.spec.ts
e2e/specs/ai/streaming-ui-states.spec.ts
bruno/playground/run-prompt-missing-required.bru
packages/client/src/__tests__/components/playground/PlaygroundHeader.test.ts
```

**Modify:**

```
scripts/seed.sql
packages/shared/src/types/prompt.ts
packages/shared/src/__tests__/types/prompt.test.ts
packages/server/src/routes/playground.ts
packages/server/src/__tests__/routes/playground.test.ts
packages/client/src/composables/usePlayground.ts
packages/client/src/composables/useAiGenerate.ts
packages/client/src/__tests__/composables/usePlayground.test.ts
packages/client/src/__tests__/composables/useAiGenerate.test.ts
packages/client/src/pages/PlaygroundPage.vue
packages/client/src/components/playground/PlaygroundHeader.vue
packages/client/src/components/playground/PromptVariableInput.vue
packages/client/src/components/playground/PromptOutput.vue
packages/client/src/components/editor/AiGeneratePanel.vue
packages/client/src/lib/ai/ghost-text.ts
packages/client/src/__tests__/lib/ai/ghost-text.test.ts
e2e/fixtures/auth.ts
e2e/fixtures/selectors/ai.ts
bruno/playground/run-prompt-invalid.bru
CLAUDE.md
```

---

## Dependency graph

```
WU1 (shared helper) ──────────────────┐
WU3 (seed updates) ───────┐           ↓
                          ↓           ↓
                       WU2 (server validation pipeline) ──┐
                          ↓                                ↓
                       WU4 (Bruno tests)                   ↓
                                                           ↓
                                                       WU5 (client composables) ──┐
                                                                                   ↓
                                                                              WU6 (components) ──┐
                                                                                                  ↓
                                                                                              WU7 (E2E infra) ──┐
                                                                                                                 ↓
                                                                                                          WU8 + WU9 (specs)
                                                                                                                 ↓
                                                                                                              WU10 (verification)
                                                                                                                 ↓
                                                                                                              WU11 (PR)
```

WU8 + WU9 can run in parallel. Every other WU is sequential.

---

## Work Unit 1 — Shared helper `extractRequiredVariables`

**Goal:** Add a pure shared helper exported from `packages/shared/src/types/prompt.ts` with 11 unit-test cases.

**Files:**

- Modify: `packages/shared/src/types/prompt.ts`
- Modify: `packages/shared/src/__tests__/types/prompt.test.ts`

**Dependencies:** None.

### Task 1.1 — Read existing prompt.ts to ground the addition

- [ ] **Step 1.1.1: Read the existing helper file**

  Run: `cat packages/shared/src/types/prompt.ts`

  Expected: confirm `PromptVariable` type shape (`name`, `placeholder?`, `defaultValue: string | null`, `sortOrder`), `extractVariables(content: string): string[]`, and `assemblePrompt(content: string, variables: Record<string, string>): string` exist. Note their exact signatures so the new helper is consistent.

### Task 1.2 — Write the failing tests

- [ ] **Step 1.2.1: Add 11 cases to the test file**

  Append to `packages/shared/src/__tests__/types/prompt.test.ts`:

  ```ts
  import { extractRequiredVariables } from '../../types/prompt.js';
  import type { PromptVariable } from '../../types/prompt.js';

  describe('extractRequiredVariables', () => {
    const v = (
      name: string,
      defaultValue: string | null | undefined = undefined,
    ): PromptVariable => ({
      name,
      placeholder: '',
      defaultValue: defaultValue ?? null,
      sortOrder: 0,
    });

    it('returns [] for empty content', () => {
      expect(extractRequiredVariables('', [])).toEqual([]);
    });

    it('returns [] when content has no {{vars}}', () => {
      expect(extractRequiredVariables('plain text', [v('name')])).toEqual([]);
    });

    it('marks {{var}} as required when defaultValue is undefined', () => {
      const vars = [
        {
          name: 'name',
          placeholder: '',
          defaultValue: undefined as unknown as string | null,
          sortOrder: 0,
        },
      ];
      expect(extractRequiredVariables('Hi {{name}}!', vars)).toEqual(['name']);
    });

    it('marks {{var}} as required when defaultValue is null', () => {
      expect(extractRequiredVariables('Hi {{name}}!', [v('name', null)])).toEqual(['name']);
    });

    it("marks {{var}} as required when defaultValue is ''", () => {
      expect(extractRequiredVariables('Hi {{name}}!', [v('name', '')])).toEqual(['name']);
    });

    it('marks {{var}} as required when defaultValue is whitespace-only', () => {
      expect(extractRequiredVariables('Hi {{name}}!', [v('name', '   ')])).toEqual(['name']);
    });

    it("does NOT mark {{var}} as required when defaultValue is '0'", () => {
      expect(extractRequiredVariables('Hi {{name}}!', [v('name', '0')])).toEqual([]);
    });

    it('does NOT mark {{var}} as required when defaultValue is a non-empty string', () => {
      expect(extractRequiredVariables('Hi {{name}}!', [v('name', 'world')])).toEqual([]);
    });

    it('treats variable in content but missing from variables[] as required', () => {
      expect(extractRequiredVariables('Hi {{stranger}}!', [v('name', 'world')])).toEqual([
        'stranger',
      ]);
    });

    it('returns [] for variable in variables[] but not in content', () => {
      expect(extractRequiredVariables('plain', [v('unused', null)])).toEqual([]);
    });

    it('deduplicates duplicate {{var}} references', () => {
      expect(extractRequiredVariables('{{name}} and {{name}}', [v('name', null)])).toEqual([
        'name',
      ]);
    });
  });
  ```

- [ ] **Step 1.2.2: Run tests, confirm they fail**

  Run: `npm test --workspace=@forge/shared -- prompt.test.ts`

  Expected: FAIL with "extractRequiredVariables is not a function" (or similar).

### Task 1.3 — Implement the helper

- [ ] **Step 1.3.1: Add the function to `packages/shared/src/types/prompt.ts`**

  Append after `assemblePrompt`:

  ```ts
  /**
   * Returns the names of variables that are REQUIRED for prompt assembly.
   *
   * A variable is required iff:
   *   - it appears in the content (`{{name}}` syntax), AND
   *   - its `PromptVariable.defaultValue` is null/undefined or empty-after-trim,
   *     OR it's missing from the `variables` array entirely.
   *
   * Note: a variable in `variables[]` but not in `content` is NOT required —
   * it's not extracted at all. A variable in `content` but not in `variables[]`
   * IS required (treated as undefaulted). This asymmetry is intentional: the
   * data model allows a "loose" variable in content with no metadata row,
   * which we treat as the strictest case (required).
   *
   * Pure function. No side effects.
   */
  export function extractRequiredVariables(content: string, variables: PromptVariable[]): string[] {
    const inContent = extractVariables(content);
    const meta = new Map(variables.map((v) => [v.name, v]));
    const required = new Set<string>();
    for (const name of inContent) {
      const v = meta.get(name);
      if (!v) {
        required.add(name);
        continue;
      }
      const dv = v.defaultValue;
      if (dv === null || dv === undefined || dv.trim() === '') {
        required.add(name);
      }
    }
    return Array.from(required);
  }
  ```

  Adjust import lines if `PromptVariable` isn't already in scope (it should be — same file).

- [ ] **Step 1.3.2: Run tests, confirm they pass**

  Run: `npm test --workspace=@forge/shared -- prompt.test.ts`

  Expected: 11 new tests PASS. Existing prompt tests untouched.

### Task 1.4 — Build shared package

- [ ] **Step 1.4.1: Build `@forge/shared`**

  Run: `npm run build --workspace=@forge/shared`

  Expected: 0 errors. The new export is now visible in `dist/`.

  (Per the project memory note about `Shared package dist staleness`, this is required before downstream packages can typecheck against the new symbol.)

### Task 1.5 — Commit WU1

- [ ] **Step 1.5.1: Commit**

  ```bash
  git add packages/shared/src/types/prompt.ts \
          packages/shared/src/__tests__/types/prompt.test.ts \
          packages/shared/dist
  git commit -m "feat(shared): #50 add extractRequiredVariables helper

  Pure function returning the names of {{vars}} in content whose
  PromptVariable.defaultValue is null/undefined or empty-after-trim,
  plus any {{vars}} in content with no metadata row at all.

  11 unit-test cases including null/undefined/empty/whitespace edges
  and the '0'-is-truthy edge case."
  ```

  If the build artifacts at `packages/shared/dist` aren't tracked, drop them from `git add` — only source + test get committed.

---

## Work Unit 2 — Server validation pipeline

**Goal:** Restructure `/api/playground/run` to validate required variables AFTER `assertCanReadPost` and BEFORE `writeHead`, returning the new structured 400 envelope. 12 server-test cases.

**Files:**

- Modify: `packages/server/src/routes/playground.ts`
- Modify: `packages/server/src/__tests__/routes/playground.test.ts`

**Dependencies:** WU1 (helper must exist).

### Task 2.1 — Read current handler structure

- [ ] **Step 2.1.1: Read current routes/playground.ts**

  Run: `cat packages/server/src/routes/playground.ts`

  Expected: confirm preHandler is `app.aiGate`, the SSE writeHead at line ~61, and how `assemblePromptForPost` is called inside the try block.

### Task 2.2 — Write failing tests for the new behavior

- [ ] **Step 2.2.1: Read existing playground.test.ts**

  Run: `cat packages/server/src/__tests__/routes/playground.test.ts | head -100`

  Note the test setup pattern (Fastify `inject`, auth bridge, post seeding).

- [ ] **Step 2.2.2: Add 12 cases for the new validation pipeline**

  Append to `packages/server/src/__tests__/routes/playground.test.ts` (inside the existing describe block for `/api/playground/run`):

  ```ts
  describe('missing-required-variables validation', () => {
    // Use the seeded required-var fixture post (added in WU3).
    const REQUIRED_VAR_FIXTURE_POST_ID = 'c0000000-0000-0000-0000-000000000050';
    const ALICE_PRIVATE_PROMPT_ID = '<seed alice's private prompt UUID>';

    it('case 1: missing single required var → 400 with code + missing[name]', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/playground/run',
        headers: { authorization: `Bearer ${testuserToken}` },
        payload: { postId: REQUIRED_VAR_FIXTURE_POST_ID, variables: {} },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.code).toBe('MISSING_REQUIRED_VARIABLES');
      expect(body.missing).toEqual(['<the NULL-default var name>']);
      expect(body.error).toMatch(/^Missing required variables/);
    });

    it('case 2: missing multiple required vars → 400 with all missing names', async () => {
      // Seed an inline post with 2 NULL-default vars OR use a fixture.
      // Implementer: use the api to create a post under testuser, then submit.
      // ... see test code skeleton below
    });

    it('case 3: all required vars present → 200 + SSE', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/playground/run',
        headers: { authorization: `Bearer ${testuserToken}` },
        payload: {
          postId: REQUIRED_VAR_FIXTURE_POST_ID,
          variables: { '<var name>': 'filled' },
        },
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/event-stream');
    });

    it('case 4: all vars empty → 400 with all in missing', async () => {
      // submit { variables: { '<var>': '' } }
      // expect 400 with code MISSING_REQUIRED_VARIABLES
    });

    it('case 5: partial fill → 400 with only the empty ones in missing', async () => {
      // (only relevant if fixture has multiple required vars; skip if only 1)
    });

    it('case 6: defaultValue present + submitted value empty → request proceeds', async () => {
      // Use the demo prompt c0000000-...-000000000004 (after seed update, all
      // its vars are defaulted). Submit { variables: {} }. Expect 200 SSE.
      const res = await app.inject({
        method: 'POST',
        url: '/api/playground/run',
        headers: { authorization: `Bearer ${testuserToken}` },
        payload: { postId: 'c0000000-0000-0000-0000-000000000004', variables: {} },
      });
      expect(res.statusCode).toBe(200);
    });

    it('case 7: template has no {{vars}} → request proceeds', async () => {
      // Seed a post with content that has no {{vars}} (or use the snippet
      // post that's already in seed.sql). Submit { variables: {} }.
      // Expect 200.
    });

    it('case 8: submitted vars include extras not in template → ignored, request proceeds', async () => {
      // Submit { variables: { '<var>': 'value', extra: 'ignored' } } against
      // the required-var fixture. Expect 200.
    });

    it('case 9: whitespace-only submitted value → treated as empty', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/playground/run',
        headers: { authorization: `Bearer ${testuserToken}` },
        payload: {
          postId: REQUIRED_VAR_FIXTURE_POST_ID,
          variables: { '<var>': '   ' },
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe('MISSING_REQUIRED_VARIABLES');
    });

    it('case 10: caller cannot read source post → 403, no missing field', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/playground/run',
        headers: { authorization: `Bearer ${testuserToken}` },
        payload: { postId: ALICE_PRIVATE_PROMPT_ID, variables: {} },
      });
      expect(res.statusCode).toBe(403);
      const body = res.json();
      expect(body.missing).toBeUndefined();
      expect(body.code).toBeUndefined();
    });

    it('case 11: 400 response is application/json, never SSE', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/playground/run',
        headers: { authorization: `Bearer ${testuserToken}` },
        payload: { postId: REQUIRED_VAR_FIXTURE_POST_ID, variables: {} },
      });
      expect(res.headers['content-type']).toContain('application/json');
      expect(res.headers['content-type']).not.toContain('text/event-stream');
    });

    it('case 12: rate-limit slot released after validation 400', async () => {
      // First request: 400
      const r1 = await app.inject({
        method: 'POST',
        url: '/api/playground/run',
        headers: { authorization: `Bearer ${testuserToken}` },
        payload: { postId: REQUIRED_VAR_FIXTURE_POST_ID, variables: {} },
      });
      expect(r1.statusCode).toBe(400);
      // Second request immediately: must not 429
      const r2 = await app.inject({
        method: 'POST',
        url: '/api/ai/generate',
        headers: { authorization: `Bearer ${testuserToken}` },
        payload: { description: 'hi', contentType: 'snippet', language: 'typescript' },
      });
      expect(r2.statusCode).not.toBe(429);
    });
  });
  ```

  **Note:** the implementer fills in the actual fixture variable names (depending on what WU3 seeds). The skeleton uses `<the NULL-default var name>` placeholders — replace with the actual name once WU3 commits.

- [ ] **Step 2.2.3: Run tests, confirm they fail**

  Run: `npm test --workspace=@forge/server -- playground.test.ts`

  Expected: FAIL — current handler doesn't return the new envelope.

  **Note:** WU3 must run before this test will pass. WU3 is sequenced in the dependency graph; if running this WU before WU3, the failures will mention the missing fixture post — that's the test failing correctly because the fixture doesn't exist yet.

### Task 2.3 — Implement the validation pipeline

- [ ] **Step 2.3.1: Restructure `packages/server/src/routes/playground.ts`**

  Before edits, identify the exact handler function that today calls `app.post('/playground/run', { preHandler: app.aiGate }, ...)` and writes SSE headers immediately. Restructure as follows (verbatim insertion at the top of the handler body, BEFORE existing SSE setup):

  ```ts
  import { findPostById } from '../db/queries/posts.js';
  import { findRevisionsByPostId } from '../db/queries/revisions.js';
  import { assertCanReadPost } from '../lib/visibility.js';
  import { extractRequiredVariables } from '@forge/shared';
  import { getVariablesForPost } from '../services/playground.js';

  // Inside the handler, BEFORE writeHead:
  const submitted = playgroundRunSchema.safeParse(request.body);
  if (!submitted.success) {
    return reply.status(400).send({
      error: submitted.error.errors.map((e) => e.message).join(', '),
      code: 'VALIDATION_ERROR',
    });
  }

  // (1) Fetch post — needed for both visibility and variables
  const post = await findPostById(submitted.data.postId);
  if (!post) {
    return reply.status(404).send({ error: 'Post not found', code: 'POST_NOT_FOUND' });
  }

  // (2) Authorization — short-circuit before any leak
  if (!assertCanReadPost(post, request.user.id, reply)) return;

  // (3) Fetch latest revision (DESC ordering — revisions[0] is latest)
  const revisions = await findRevisionsByPostId(submitted.data.postId);
  const latest = revisions[0];
  if (!latest) {
    return reply.status(404).send({ error: 'Post has no revisions', code: 'POST_NOT_FOUND' });
  }

  // (4) Variable list comes from prompt_variables table
  const variables = await getVariablesForPost(submitted.data.postId);
  const required = extractRequiredVariables(latest.content, variables);
  const missing = required.filter((name) => {
    const value = submitted.data.variables?.[name];
    return value === undefined || value.trim() === '';
  });
  if (missing.length) {
    return reply.status(400).send({
      error: `Missing required variables: ${missing.join(', ')}`,
      code: 'MISSING_REQUIRED_VARIABLES',
      missing,
    });
  }

  // (5) Now safe to begin SSE — existing logic continues from here
  reply.raw.writeHead(200, SSE_HEADERS);
  // ... existing SSE streaming logic via assemblePromptForPost + LLM
  ```

  Preserve all existing logic AFTER `writeHead`. Remove any duplicate post/revision fetch that the original `assemblePromptForPost` does internally — pass the already-loaded `post` and `latest.content` if the existing helper accepts them; otherwise leave the second internal fetch in place (correctness is unaffected; minor double-fetch is a known cost tracked as a follow-up suggestion).

- [ ] **Step 2.3.2: Run server typecheck**

  Run: `npm run typecheck --workspace=@forge/server`

  Expected: 0 errors.

- [ ] **Step 2.3.3: Run server tests**

  Run: `npm test --workspace=@forge/server -- playground.test.ts`

  Expected: 12 new cases PASS (plus all existing tests). If case 12 (rate-limit slot release) fails, verify by reading `packages/server/src/plugins/langchain/index.ts:61-63` that `onResponse` fires for 4xx — if it doesn't, the implementer must add a manual `request.aiSlot?.release()` call inside the 400 paths.

### Task 2.4 — Commit WU2

- [ ] **Step 2.4.1: Commit**

  ```bash
  git add packages/server/src/routes/playground.ts \
          packages/server/src/__tests__/routes/playground.test.ts
  git commit -m "feat(server): #50 missing-required-vars validation in /api/playground/run

  Restructured handler so visibility + required-var validation runs BEFORE
  writeHead. Returns structured 400 { error, code, missing[] } per the new
  project-wide error envelope convention.

  Order: authenticate → aiRateLimit (via app.aiGate) → fetch post →
  assertCanReadPost (403/404 short-circuit) → fetch latest revision →
  extractRequiredVariables → 400 if missing → SSE start.

  12 new test cases including authz precedence (case 10), Content-Type
  ordering (case 11), and rate-limit slot release (case 12)."
  ```

---

## Work Unit 3 — Seed updates

**Goal:** (1) Give the demo prompt's `props` variable a default to avoid surprise-gating after the new validation lands. (2) Add a new prompt post with at least one NULL-default variable as the dedicated required-var fixture for Bruno + spec #7.

**Files:**

- Modify: `scripts/seed.sql`

**Dependencies:** None (independent; can run before WU2 to keep WU2's tests green from the start).

### Task 3.1 — Read current seed structure

- [ ] **Step 3.1.1: Read seed.sql lines 140-160**

  Run: `sed -n '140,160p' scripts/seed.sql`

  Expected: confirm the `prompt_variables` block, the `props` row at line 151, and the demo prompt content at line 70.

### Task 3.2 — Update `props` default + add new fixture rows

- [ ] **Step 3.2.1: Edit `scripts/seed.sql`**

  Change line 151 from:

  ```sql
    ('f0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000004', 'props', 'e.g., name: string, age: number', 1, NULL),
  ```

  to:

  ```sql
    ('f0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000004', 'props', 'e.g., name: string, age: number', 1, 'name: string, age: number'),  -- #50: was NULL; required-var gating would surprise-block the demo prompt
  ```

  Then add new INSERT rows. Find the `posts` INSERT block (search for `INSERT INTO posts`) and add a new row for the required-var fixture post:

  ```sql
  -- #50: dedicated required-var fixture post (one NULL-default variable)
  INSERT INTO posts (id, author_id, title, content_type, language, visibility, is_draft, created_at, updated_at) VALUES
    ('c0000000-0000-0000-0000-000000000050', 'a0000000-0000-0000-0000-000000000099', 'Required-var Fixture (E2E + Bruno)', 'prompt', 'markdown', 'public', false, NOW(), NOW());
  ```

  Find the `post_revisions` INSERT block and add an initial revision:

  ```sql
  -- #50: initial revision for the required-var fixture post
  INSERT INTO post_revisions (id, post_id, author_id, content, summary, revision_number) VALUES
    ('d0000000-0000-0000-0000-000000000050', 'c0000000-0000-0000-0000-000000000050', 'a0000000-0000-0000-0000-000000000099', 'Hello {{required_name}}!', 'Initial fixture for #50', 1);
  ```

  Find the `prompt_variables` INSERT block and add the NULL-default row:

  ```sql
  -- #50: required-var fixture row (NULL default — always required)
  INSERT INTO prompt_variables (id, post_id, name, placeholder, sort_order, default_value) VALUES
    ('f0000000-0000-0000-0000-000000000050', 'c0000000-0000-0000-0000-000000000050', 'required_name', 'e.g., world', 0, NULL);
  ```

  **UUID note:** the implementer verifies `f0000000-...-000000000004` is unused before committing. If taken, pick the next-available `f0000000-...` UUID.

- [ ] **Step 3.2.2: Apply the seed locally**

  Run: `set -a && source .env && set +a && cd packages/server && npx tsx scripts/seed.ts` (or whatever the project's seed-application command is — check `package.json` scripts).

  Expected: 0 errors. New rows visible via `psql -c "SELECT id FROM posts WHERE id='c0000000-0000-0000-0000-000000000050'"` (or equivalent).

- [ ] **Step 3.2.3: Confirm `props` row default**

  Run: `psql -c "SELECT default_value FROM prompt_variables WHERE id='f0000000-0000-0000-0000-000000000002'"` (or equivalent for the project's DB driver).

  Expected: `name: string, age: number`.

### Task 3.3 — Commit WU3

- [ ] **Step 3.3.1: Commit**

  ```bash
  git add scripts/seed.sql
  git commit -m "feat(seed): #50 props default + required-var fixture post

  - props variable on c0000000-...-000000000004 (React Component Generator
    demo) gets default 'name: string, age: number'. Without this, after
    #50's required-var gating lands, the demo Run button would be blocked
    until users fill props.
  - New prompt post c0000000-...-000000000005 with one NULL-default variable
    (required_name). Used by Bruno run-prompt-missing-required.bru and
    e2e/specs/playground/missing-variable-error.spec.ts."
  ```

---

## Work Unit 4 — Bruno tests

**Goal:** Add `run-prompt-missing-required.bru`. Verify post-change behavior of `run-prompt-invalid.bru` and update assertions if needed.

**Files:**

- Create: `bruno/playground/run-prompt-missing-required.bru`
- Modify: `bruno/playground/run-prompt-invalid.bru` (verify — likely no change)

**Dependencies:** WU2 + WU3 (server validation + fixture post must exist).

### Task 4.1 — Read existing Bruno conventions

- [ ] **Step 4.1.1: Read existing playground .bru files**

  Run: `ls bruno/playground/ && cat bruno/playground/run-prompt-invalid.bru`

  Expected: confirm the file format, auth header pattern (`token: {{accessToken}}`), assertion block, and `tests {}` script style.

### Task 4.2 — Create the new Bruno test

- [ ] **Step 4.2.1: Write `bruno/playground/run-prompt-missing-required.bru`**

  ```
  meta {
    name: Run prompt with missing required variable returns 400
    type: http
    seq: 4
  }

  post {
    url: {{baseUrl}}/api/playground/run
    body: json
    auth: bearer
  }

  auth:bearer {
    token: {{accessToken}}
  }

  body:json {
    {
      "postId": "c0000000-0000-0000-0000-000000000050",
      "variables": {}
    }
  }

  assert {
    res.status: eq 400
  }

  tests {
    test("body has structured MISSING_REQUIRED_VARIABLES envelope", function() {
      const body = res.getBody();
      expect(body).to.have.property('error');
      expect(body).to.have.property('code', 'MISSING_REQUIRED_VARIABLES');
      expect(body).to.have.property('missing');
      expect(body.missing).to.be.an('array').that.is.not.empty;
      expect(body.missing).to.include('required_name');
    });
  }
  ```

  Adjust `seq: 4` to be the next-available sequence number in `bruno/playground/`.

### Task 4.3 — Verify existing run-prompt-invalid.bru

- [ ] **Step 4.3.1: Run the existing test against the new server**

  Start the server (`npm run dev` in another terminal), then:

  Run: `cd bruno && npx @usebruno/cli run playground/run-prompt-invalid.bru --env local`

  Expected: PASS (with the existing assertions). If it now fails because the new validation pipeline catches the request earlier, update the file's assertions to match the new code path (e.g., add `expect(body.code).to.equal('VALIDATION_ERROR')` if it's hitting the Zod-level rejection, or `MISSING_REQUIRED_VARIABLES` if it's hitting the new validator).

### Task 4.4 — Run the new Bruno test

- [ ] **Step 4.4.1: Run new test against running server**

  Run: `cd bruno && npx @usebruno/cli run playground/run-prompt-missing-required.bru --env local`

  Expected: PASS — status 400, structured envelope with `code: 'MISSING_REQUIRED_VARIABLES'`, `missing: ['required_name']`.

- [ ] **Step 4.4.2: Run full Bruno collection (regression)**

  Run: `npm run bruno`

  Expected: all suites green.

### Task 4.5 — Commit WU4

- [ ] **Step 4.5.1: Commit**

  ```bash
  git add bruno/playground/
  git commit -m "test(bruno): #50 missing-required-variables 400 contract

  - run-prompt-missing-required.bru (new): submits empty variables to the
    required-var fixture post (c0000000-...-000000000005) and asserts
    400 + MISSING_REQUIRED_VARIABLES envelope shape with missing[] array.
  - run-prompt-invalid.bru (verify): re-run after seed + validation
    changes. <If updated> Updated assertions to also check code field.
    <If not updated> No changes needed — assertions still pass."
  ```

---

## Work Unit 5 — Client composables

**Goal:** Update `usePlayground` (currentPost, fetchPost, canRun, error/loadError, requiredVariables, missingVariables) and `useAiGenerate` (E2E abort hook with try/catch/finally + MODE gate). Add unit tests.

**Files:**

- Modify: `packages/client/src/composables/usePlayground.ts`
- Modify: `packages/client/src/composables/useAiGenerate.ts`
- Modify: `packages/client/src/__tests__/composables/usePlayground.test.ts`
- Modify: `packages/client/src/__tests__/composables/useAiGenerate.test.ts`

**Dependencies:** WU1.

### Task 5.1 — `usePlayground.ts`

- [ ] **Step 5.1.1: Read current usePlayground.ts**

  Run: `cat packages/client/src/composables/usePlayground.ts`

  Identify the existing return type, refs, and `run()` implementation. Note the exact line where the non-ok branch sets `error.value = 'Request failed'`.

- [ ] **Step 5.1.2: Add 11 unit-test cases (failing tests first)**

  Append to `packages/client/src/__tests__/composables/usePlayground.test.ts`:

  ```ts
  describe('usePlayground — REV 3 additions', () => {
    // Mocks for fetch, etc., per existing test patterns in this file.

    it('case 1: 400 with MISSING_REQUIRED_VARIABLES sets error + missingVariables', async () => {
      mockFetch({
        status: 400,
        body: {
          error: 'Missing required variables: name',
          code: 'MISSING_REQUIRED_VARIABLES',
          missing: ['name'],
        },
      });
      const pg = usePlayground();
      await pg.run('post-1', {});
      expect(pg.error.value).toBe('Missing required variables: name');
      expect(pg.missingVariables.value).toEqual(['name']);
    });

    it('case 2: 400 with VALIDATION_ERROR sets error, missingVariables stays []', async () => {
      mockFetch({ status: 400, body: { error: 'Bad input', code: 'VALIDATION_ERROR' } });
      const pg = usePlayground();
      await pg.run('post-1', {});
      expect(pg.error.value).toBe('Bad input');
      expect(pg.missingVariables.value).toEqual([]);
    });

    it('case 3: network error sets error fallback', async () => {
      mockFetchReject(new Error('network'));
      const pg = usePlayground();
      await pg.run('post-1', {});
      expect(pg.error.value).toBe('Request failed');
      expect(pg.missingVariables.value).toEqual([]);
    });

    it('case 4: error.value cleared on next successful run', async () => {
      mockFetch({ status: 400, body: { error: 'fail', code: 'VALIDATION_ERROR' } });
      const pg = usePlayground();
      await pg.run('post-1', {});
      mockFetch({ status: 200, body: 'OK', sse: true });
      await pg.run('post-1', { name: 'world' });
      expect(pg.error.value).toBeNull();
    });

    it('case 5: missingVariables cleared on next successful run', async () => {
      mockFetch({
        status: 400,
        body: { error: 'x', code: 'MISSING_REQUIRED_VARIABLES', missing: ['name'] },
      });
      const pg = usePlayground();
      await pg.run('post-1', {});
      expect(pg.missingVariables.value).toEqual(['name']);
      mockFetch({ status: 200, body: 'OK', sse: true });
      await pg.run('post-1', { name: 'world' });
      expect(pg.missingVariables.value).toEqual([]);
    });

    it('case 6: missingVariables cleared when next run produces a non-MRV 400', async () => {
      mockFetch({
        status: 400,
        body: { error: 'x', code: 'MISSING_REQUIRED_VARIABLES', missing: ['name'] },
      });
      const pg = usePlayground();
      await pg.run('post-1', {});
      mockFetch({ status: 400, body: { error: 'other', code: 'VALIDATION_ERROR' } });
      await pg.run('post-1', {});
      expect(pg.missingVariables.value).toEqual([]);
      expect(pg.error.value).toBe('other');
    });

    it('case 7: canRun transitions empty→full→cleared', () => {
      const pg = usePlayground();
      // simulate state: post fetched with one required var
      pg._setStateForTest({
        currentPost: { content: 'Hi {{name}}!' },
        variables: [{ name: 'name', defaultValue: null, sortOrder: 0, placeholder: '' }],
      });
      expect(pg.canRun.value).toBe(false);
      pg._setInputForTest('name', 'world');
      expect(pg.canRun.value).toBe(true);
      pg._setInputForTest('name', '');
      expect(pg.canRun.value).toBe(false);
    });

    it('case 8: requiredVariables recomputes when post variables change', () => {
      const pg = usePlayground();
      pg._setStateForTest({
        currentPost: { content: 'Hi {{name}}!' },
        variables: [{ name: 'name', defaultValue: 'world', sortOrder: 0, placeholder: '' }],
      });
      expect(pg.requiredVariables.value).toEqual([]);
      pg._setStateForTest({
        currentPost: { content: 'Hi {{name}}!' },
        variables: [{ name: 'name', defaultValue: null, sortOrder: 0, placeholder: '' }],
      });
      expect(pg.requiredVariables.value).toEqual(['name']);
    });

    it('case 9: canRun true when post has only opt-out vars', () => {
      const pg = usePlayground();
      pg._setStateForTest({
        currentPost: { content: 'Hi {{name}}!' },
        variables: [{ name: 'name', defaultValue: 'world', sortOrder: 0, placeholder: '' }],
      });
      expect(pg.canRun.value).toBe(true);
    });

    it('case 10: fetchPost populates currentPost', async () => {
      mockFetch({
        status: 200,
        body: {
          post: {
            id: 'post-1',
            title: 'T',
            contentType: 'prompt',
            latestRevision: { content: 'Hi {{name}}!' },
          },
        },
      });
      const pg = usePlayground();
      await pg.fetchPost('post-1');
      expect(pg.currentPost.value).toMatchObject({
        id: 'post-1',
        title: 'T',
        contentType: 'prompt',
      });
      expect(pg.currentPost.value?.content).toBe('Hi {{name}}!');
    });

    it('case 11: fetchPost rejection sets loadError, currentPost stays null', async () => {
      mockFetchReject(new Error('not found'));
      const pg = usePlayground();
      await pg.fetchPost('post-1');
      expect(pg.loadError.value).toMatch(/not found|Failed/);
      expect(pg.currentPost.value).toBeNull();
    });
  });
  ```

  The `_setStateForTest` and `_setInputForTest` helpers are illustrative. The implementer adapts to the project's existing test harness (likely composable instances are easier to drive via reactive refs directly, no internal escape hatch needed).

- [ ] **Step 5.1.3: Run tests, confirm fail**

  Run: `npm test --workspace=@forge/client -- usePlayground`

  Expected: FAIL.

- [ ] **Step 5.1.4: Implement `usePlayground` updates**

  In `packages/client/src/composables/usePlayground.ts`:

  Add new refs/computeds:

  ```ts
  import { computed, ref } from 'vue';
  import type { ContentType, PromptVariable } from '@forge/shared';
  import { extractRequiredVariables } from '@forge/shared';

  // Inside the composable function:
  const currentPost = ref<{
    id: string;
    title: string;
    contentType: ContentType;
    content: string;
  } | null>(null);
  const loadError = ref<string | null>(null);
  const missingVariables = ref<string[]>([]);
  const inputValues = ref<Record<string, string>>({}); // existing or new — depends on current shape

  const requiredVariables = computed<string[]>(() => {
    const post = currentPost.value;
    if (!post) return [];
    return extractRequiredVariables(post.content, variables.value);
  });

  const canRun = computed<boolean>(() =>
    requiredVariables.value.every((name) => (inputValues.value[name] ?? '').trim() !== ''),
  );

  async function fetchPost(postId: string): Promise<void> {
    loadError.value = null;
    try {
      const res = await apiFetch(`/api/posts/${postId}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        loadError.value = body.error ?? 'Failed to load post';
        currentPost.value = null;
        return;
      }
      const data = await res.json();
      currentPost.value = {
        id: data.post.id,
        title: data.post.title,
        contentType: data.post.contentType,
        content: data.post.latestRevision?.content ?? '',
      };
    } catch (err) {
      loadError.value = err instanceof Error ? err.message : 'Failed to load post';
      currentPost.value = null;
    }
  }
  ```

  Replace the existing non-ok branch in `run()`:

  ```ts
  // Existing code before this edit:
  //   if (!res.ok) { error.value = 'Request failed'; return; }
  // Replaced with:
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (res.status === 400 && body.code === 'MISSING_REQUIRED_VARIABLES') {
      error.value = body.error;
      missingVariables.value = body.missing ?? [];
    } else if (res.status === 400) {
      error.value = body.error ?? 'Request failed';
      missingVariables.value = [];
    } else {
      error.value = 'Request failed';
      missingVariables.value = [];
    }
    return;
  }
  // On success path (after SSE consumption completes):
  error.value = null;
  missingVariables.value = [];
  ```

  Update the return statement to include the new fields:

  ```ts
  return {
    // existing
    variables,
    isRunning,
    error,
    output,
    fetchVariables,
    run,
    stop,
    // new
    currentPost,
    fetchPost,
    loadError,
    requiredVariables,
    canRun,
    missingVariables,
    // expose inputValues if not already (for components to bind v-model)
    inputValues,
  };
  ```

- [ ] **Step 5.1.5: Run tests, confirm pass**

  Run: `npm test --workspace=@forge/client -- usePlayground`

  Expected: 11 new cases PASS plus all existing tests.

### Task 5.2 — `useAiGenerate.ts` E2E abort hook

- [ ] **Step 5.2.1: Read current useAiGenerate.ts**

  Run: `cat packages/client/src/composables/useAiGenerate.ts`

  Identify: outer-scope `controller: AbortController | null` ref (line ~24), `stop()` function, `start()` body (try/catch shape, line 58-63 AbortError suppression, line 65-66 cleanup).

- [ ] **Step 5.2.2: Add 8 failing test cases**

  Append to `packages/client/src/__tests__/composables/useAiGenerate.test.ts`:

  ```ts
  describe('useAiGenerate — E2E abort hook', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
      delete (window as Window & { __E2E__?: boolean }).__E2E__;
      delete (window as Window & { __forgeE2eAiAbort?: () => void }).__forgeE2eAiAbort;
    });

    it('case 1: __E2E__=true + MODE=development exposes window.__forgeE2eAiAbort during stream', async () => {
      vi.stubEnv('MODE', 'development');
      (window as Window & { __E2E__?: boolean }).__E2E__ = true;
      const ai = useAiGenerate();
      const start = ai.start(
        { description: 'x', contentType: 'snippet', language: 'ts' },
        () => {},
      );
      // Mid-flight (mock the fetch to be pending)
      await tickEventLoop();
      expect(
        (window as Window & { __forgeE2eAiAbort?: () => void }).__forgeE2eAiAbort,
      ).toBeDefined();
      ai.stop();
      await start;
    });

    it('case 2: __E2E__=false + MODE=development does NOT expose hook', async () => {
      vi.stubEnv('MODE', 'development');
      const ai = useAiGenerate();
      const start = ai.start(
        { description: 'x', contentType: 'snippet', language: 'ts' },
        () => {},
      );
      await tickEventLoop();
      expect(
        (window as Window & { __forgeE2eAiAbort?: () => void }).__forgeE2eAiAbort,
      ).toBeUndefined();
      ai.stop();
      await start;
    });

    it('case 3: MODE=production + __E2E__=true does NOT expose hook (defense-in-depth)', async () => {
      vi.stubEnv('MODE', 'production');
      (window as Window & { __E2E__?: boolean }).__E2E__ = true;
      const ai = useAiGenerate();
      const start = ai.start(
        { description: 'x', contentType: 'snippet', language: 'ts' },
        () => {},
      );
      await tickEventLoop();
      expect(
        (window as Window & { __forgeE2eAiAbort?: () => void }).__forgeE2eAiAbort,
      ).toBeUndefined();
      ai.stop();
      await start;
    });

    it('case 4: __E2E__=undefined + MODE=development does NOT expose hook', async () => {
      vi.stubEnv('MODE', 'development');
      const ai = useAiGenerate();
      const start = ai.start(
        { description: 'x', contentType: 'snippet', language: 'ts' },
        () => {},
      );
      await tickEventLoop();
      expect(
        (window as Window & { __forgeE2eAiAbort?: () => void }).__forgeE2eAiAbort,
      ).toBeUndefined();
      ai.stop();
      await start;
    });

    it('case 5: hook calls controller.abort(); AbortError suppressed', async () => {
      vi.stubEnv('MODE', 'development');
      (window as Window & { __E2E__?: boolean }).__E2E__ = true;
      const ai = useAiGenerate();
      const start = ai.start(
        { description: 'x', contentType: 'snippet', language: 'ts' },
        () => {},
      );
      await tickEventLoop();
      const hook = (window as Window & { __forgeE2eAiAbort?: () => void }).__forgeE2eAiAbort;
      hook?.();
      await start;
      expect(ai.error.value).toBeNull(); // AbortError suppressed
    });

    it('case 6: hook deleted in finally on success path', async () => {
      vi.stubEnv('MODE', 'development');
      (window as Window & { __E2E__?: boolean }).__E2E__ = true;
      const ai = useAiGenerate();
      mockFetch({ status: 200, body: 'data: chunk\n\ndata: [done]\n\n', sse: true });
      await ai.start({ description: 'x', contentType: 'snippet', language: 'ts' }, () => {});
      expect(
        (window as Window & { __forgeE2eAiAbort?: () => void }).__forgeE2eAiAbort,
      ).toBeUndefined();
    });

    it('case 7: hook deleted in finally on AbortError path', async () => {
      vi.stubEnv('MODE', 'development');
      (window as Window & { __E2E__?: boolean }).__E2E__ = true;
      const ai = useAiGenerate();
      const start = ai.start(
        { description: 'x', contentType: 'snippet', language: 'ts' },
        () => {},
      );
      await tickEventLoop();
      ai.stop(); // triggers AbortError
      await start;
      expect(
        (window as Window & { __forgeE2eAiAbort?: () => void }).__forgeE2eAiAbort,
      ).toBeUndefined();
    });

    it('case 8: hook deleted in finally on non-Abort error path', async () => {
      vi.stubEnv('MODE', 'development');
      (window as Window & { __E2E__?: boolean }).__E2E__ = true;
      mockFetchReject(new Error('boom'));
      const ai = useAiGenerate();
      await ai.start({ description: 'x', contentType: 'snippet', language: 'ts' }, () => {});
      expect(
        (window as Window & { __forgeE2eAiAbort?: () => void }).__forgeE2eAiAbort,
      ).toBeUndefined();
      expect(ai.error.value).toBe('boom');
    });
  });
  ```

  `tickEventLoop()` is `await new Promise((r) => setTimeout(r, 0))` or per the existing test harness convention.

- [ ] **Step 5.2.3: Run tests, confirm fail**

  Run: `npm test --workspace=@forge/client -- useAiGenerate`

  Expected: FAIL.

- [ ] **Step 5.2.4: Implement the E2E hook restructure**

  In `packages/client/src/composables/useAiGenerate.ts`, restructure `start()` to wrap the existing fetch + SSE in try/catch/finally. **The current file has TWO distinct fallback strings — both are preserved verbatim, do NOT collapse them:**
  - Line ~41: `error.value = 'Request failed'` in the `!res.ok` branch (request-level failure)
  - Line ~50/61: `error.value = ... ?? 'Generation failed'` in the malformed-event / generic-catch branches (stream-level failure)

  Other things to preserve:
  - `stop()` idempotent re-call at the top
  - `controller = new AbortController()` assignment to the outer-scope ref
  - Existing AbortError suppression in the catch
  - Existing cleanup `isGenerating.value = false; controller = null;` in finally

  Add the THREE new lines (gated install, gated cleanup, plus the `e2eHookEnabled` const). See design §"Architecture/Feature 5" for the exact pseudocode.

- [ ] **Step 5.2.5: Run tests, confirm pass**

  Run: `npm test --workspace=@forge/client -- useAiGenerate`

  Expected: 8 new cases PASS plus all existing tests.

### Task 5.3 — Commit WU5

- [ ] **Step 5.3.1: Commit**

  ```bash
  git add packages/client/src/composables/usePlayground.ts \
          packages/client/src/composables/useAiGenerate.ts \
          packages/client/src/__tests__/composables/usePlayground.test.ts \
          packages/client/src/__tests__/composables/useAiGenerate.test.ts
  git commit -m "feat(client): #50 usePlayground feature additions + useAiGenerate E2E hook

  usePlayground:
  - Adds currentPost, fetchPost, loadError, missingVariables refs
  - Adds requiredVariables, canRun computeds
  - run() now parses 400 bodies and discriminates on body.code
  - 11 new unit-test cases

  useAiGenerate:
  - Restructure start() to try/catch/finally; preserves stop(), AbortError
    suppression, controller=null cleanup, 'Generation failed' string
  - Adds window.__forgeE2eAiAbort hook gated by MODE !== 'production' &&
    window.__E2E__ for E2E mid-stream-cancel spec
  - 8 new unit-test cases including MODE-mocking via vi.stubEnv"
  ```

---

## Work Unit 6 — Client components

**Goal:** Update PromptVariableInput, PromptOutput, PlaygroundHeader, PlaygroundPage, AiGeneratePanel, ghost-text. Add per-variable required indicator + a11y; split Run/Stop; add fork button + redirect logic; render error/loadError regions; render source disclosure; add testids on AiGeneratePanel; add testid on ghost-text widget.

**Files:**

- Modify: 6 Vue/TS source files
- Modify: 1 test file (ghost-text.test.ts)
- Create: 1 test file (PlaygroundHeader.test.ts)

**Dependencies:** WU5.

### Task 6.1 — PromptVariableInput.vue

- [ ] **Step 6.1.1: Read existing PromptVariableInput.vue**

  Run: `cat packages/client/src/components/playground/PromptVariableInput.vue`

  Note current props (likely `variable: PromptVariable`, `modelValue: string`), template structure, and any v-model emit pattern.

- [ ] **Step 6.1.2: Add data-testids + locally-derived required + a11y**

  Edit the template:

  ```vue
  <template>
    <div class="mb-3">
      <label
        :data-testid="`prompt-variable-label-${variable.name}`"
        :for="`prompt-var-${variable.name}`"
        class="mb-1 block text-sm font-medium text-gray-300"
      >
        {{ variable.name }}
        <span
          v-if="isRequired"
          aria-hidden="true"
          :data-testid="`prompt-variable-required-${variable.name}`"
          class="text-red-400 ml-0.5"
          >*</span
        >
        <span v-if="isRequired" class="sr-only">required</span>
      </label>
      <input
        :id="`prompt-var-${variable.name}`"
        :data-testid="`prompt-variable-input-${variable.name}`"
        :name="variable.name"
        :placeholder="variable.placeholder"
        :required="isRequired"
        :aria-required="isRequired"
        :value="modelValue"
        @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
        class="<existing input class string preserved>"
      />
    </div>
  </template>

  <script setup lang="ts">
  import { computed } from 'vue';
  import type { PromptVariable } from '@forge/shared';

  const props = defineProps<{
    variable: PromptVariable;
    modelValue: string;
  }>();

  defineEmits<{
    'update:modelValue': [value: string];
  }>();

  const isRequired = computed<boolean>(() => {
    const dv = props.variable.defaultValue;
    return dv === null || dv === undefined || dv.trim() === '';
  });
  </script>
  ```

  Preserve the existing input class string from the current file. Don't change `placeholder` or `name` semantics.

### Task 6.2 — PromptOutput.vue

- [ ] **Step 6.2.1: Add testids**

  Edit `packages/client/src/components/playground/PromptOutput.vue` to wrap the output in a section with testids:

  ```vue
  <section data-testid="prompt-output">
    <div v-if="isLoading" data-testid="prompt-output-loading">…</div>
    <pre data-testid="prompt-output-content">{{ streamedContent }}</pre>
    <button data-testid="copy-button" @click="copy">Copy</button>
  </section>
  ```

  Preserve existing `data-testid="copy-button"` (used by other specs). Preserve any existing classes.

### Task 6.3 — PlaygroundHeader.vue

- [ ] **Step 6.3.1: Read current PlaygroundHeader.vue**

  Run: `cat packages/client/src/components/playground/PlaygroundHeader.vue`

  Note the existing single-button Run/Stop toggle and the `:class` pattern. Note the title prop/render.

- [ ] **Step 6.3.2: Refactor to split Run/Stop + add fork + new props + aria-describedby**

  Replace the template:

  ```vue
  <template>
    <header data-testid="playground-header" class="<existing classes>">
      <h1 data-testid="playground-title">{{ title }}</h1>
      <div class="flex justify-between items-center mt-2">
        <div class="flex gap-2">
          <button
            v-if="!isRunning"
            data-testid="playground-run-btn"
            :disabled="!canRun"
            aria-describedby="playground-run-hint"
            class="bg-primary hover:bg-primary/80 text-white rounded px-4 py-1.5 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            @click="$emit('run')"
          >
            Run
          </button>
          <button
            v-else
            data-testid="playground-stop-btn"
            class="bg-red-600 hover:bg-red-700 text-white rounded px-4 py-1.5 text-sm font-medium"
            @click="$emit('stop')"
          >
            Stop
          </button>
        </div>
        <button
          data-testid="playground-fork-btn"
          class="rounded border border-surface-500 px-4 py-1.5 text-sm font-medium text-gray-300 hover:bg-surface-600 hover:text-white"
          @click="handleFork"
        >
          Fork
        </button>
      </div>
    </header>
  </template>

  <script setup lang="ts">
  import { useRouter } from 'vue-router';
  import { usePosts } from '@/composables/usePosts';
  import type { ContentType } from '@forge/shared';

  const props = defineProps<{
    title: string;
    isRunning: boolean;
    canRun: boolean;
    sourcePostId: string;
    contentType: ContentType;
  }>();

  defineEmits<{ run: []; stop: [] }>();

  const router = useRouter();

  async function handleFork(): Promise<void> {
    const newPostId = await usePosts().forkPost(props.sourcePostId);
    if (!newPostId) return;
    if (props.contentType === 'prompt') {
      await router.push(`/playground/${newPostId}`);
    } else {
      await router.push(`/posts/${newPostId}/edit`);
    }
  }
  </script>
  ```

  Preserve any existing imports and classes for the header element.

- [ ] **Step 6.3.3: Create PlaygroundHeader.test.ts (4 cases)**

  ```ts
  // packages/client/src/__tests__/components/playground/PlaygroundHeader.test.ts
  import { mount } from '@vue/test-utils';
  import { describe, it, expect, vi } from 'vitest';
  import PlaygroundHeader from '@/components/playground/PlaygroundHeader.vue';

  // Mock usePosts.forkPost and useRouter — adapt to existing test patterns.
  const mockForkPost = vi.fn();
  const mockPush = vi.fn();
  vi.mock('@/composables/usePosts', () => ({
    usePosts: () => ({ forkPost: mockForkPost }),
  }));
  vi.mock('vue-router', () => ({
    useRouter: () => ({ push: mockPush }),
  }));

  describe('PlaygroundHeader.handleFork', () => {
    beforeEach(() => {
      mockForkPost.mockReset();
      mockPush.mockReset();
    });

    it('case 1: contentType prompt → navigates to /playground/{newId}', async () => {
      mockForkPost.mockResolvedValue('new-id');
      const w = mount(PlaygroundHeader, {
        props: {
          title: 'T',
          isRunning: false,
          canRun: true,
          sourcePostId: 'src',
          contentType: 'prompt',
        },
      });
      await w.find('[data-testid="playground-fork-btn"]').trigger('click');
      await flushPromises();
      expect(mockPush).toHaveBeenCalledWith('/playground/new-id');
    });

    it('case 2: contentType snippet → navigates to /posts/{newId}/edit', async () => {
      mockForkPost.mockResolvedValue('new-id');
      const w = mount(PlaygroundHeader, {
        props: {
          title: 'T',
          isRunning: false,
          canRun: true,
          sourcePostId: 'src',
          contentType: 'snippet',
        },
      });
      await w.find('[data-testid="playground-fork-btn"]').trigger('click');
      await flushPromises();
      expect(mockPush).toHaveBeenCalledWith('/posts/new-id/edit');
    });

    it('case 3: forkPost returns null → no navigation', async () => {
      mockForkPost.mockResolvedValue(null);
      const w = mount(PlaygroundHeader, {
        props: {
          title: 'T',
          isRunning: false,
          canRun: true,
          sourcePostId: 'src',
          contentType: 'prompt',
        },
      });
      await w.find('[data-testid="playground-fork-btn"]').trigger('click');
      await flushPromises();
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('case 4: router.push is awaited (forkPost result resolves before navigation completes)', async () => {
      const order: string[] = [];
      mockForkPost.mockImplementation(async () => {
        order.push('fork');
        return 'new-id';
      });
      mockPush.mockImplementation(async () => {
        order.push('push');
      });
      const w = mount(PlaygroundHeader, {
        props: {
          title: 'T',
          isRunning: false,
          canRun: true,
          sourcePostId: 'src',
          contentType: 'prompt',
        },
      });
      await w.find('[data-testid="playground-fork-btn"]').trigger('click');
      await flushPromises();
      expect(order).toEqual(['fork', 'push']);
    });
  });
  ```

  `flushPromises()` from `@vue/test-utils` or the project's existing helper.

- [ ] **Step 6.3.4: Run tests, confirm pass**

  Run: `npm test --workspace=@forge/client -- PlaygroundHeader`

  Expected: 4 cases PASS.

### Task 6.4 — PlaygroundPage.vue

- [ ] **Step 6.4.1: Read current PlaygroundPage.vue**

  Run: `cat packages/client/src/pages/PlaygroundPage.vue`

  Identify: current `<script setup>` (likely fetches `{ title }` from `/api/posts/:id`), `<template>` structure, where variables are rendered, where the output goes.

- [ ] **Step 6.4.2: Wire up the new design**

  Replace the page's template + script per the design's §"Architecture/Feature 1 Client (PlaygroundPage)". Key changes:
  - Wrap root in `<div data-testid="playground-page">`.
  - Add `<div v-if="loadError" data-testid="playground-load-error" role="alert" class="mb-4 p-3 bg-red-900/30 border border-red-500 rounded text-red-400 text-sm">{{ loadError }}</div>` near the top.
  - Add `<div v-if="error" data-testid="playground-error" role="alert" class="mb-4 p-3 bg-red-900/30 border border-red-500 rounded text-red-400 text-sm">{{ error }}</div>` above the variables/output section.
  - Add the `<details data-testid="playground-prompt-source">` collapsed disclosure with the rotating chevron (per design).
  - Add `<p id="playground-run-hint" role="status" class="text-xs text-red-400/70 mt-1" v-if="!canRun && !isRunning">Fill required variables to run</p>` beneath the action row.
  - Pass `:source-post-id="postId"` and `:content-type="currentPost?.contentType ?? 'prompt'"` and `:can-run="canRun"` to PlaygroundHeader.
  - In `<script setup>`, replace the existing post-fetch code with `usePlayground().fetchPost(postId)` on mount alongside `fetchVariables(postId)`.

  Wire `inputValues` for variable inputs (already exposed by usePlayground after WU5). The PromptVariableInput components bind via `v-model="inputValues[variable.name]"`.

- [ ] **Step 6.4.3: Manual sanity check — page renders**

  Run: `npm run dev --workspace=@forge/client` (or the project's dev script). Navigate to `/playground/c0000000-0000-0000-0000-000000000004`. Verify:
  - Header + title visible
  - Variables form renders (3 inputs, all with defaults after seed update)
  - Source disclosure visible (collapsed, with `▶` chevron); expand it shows content
  - Run button enabled (all defaulted)
  - No load error visible

  Also navigate to `/playground/c0000000-0000-0000-0000-000000000050` (the new fixture). Verify:
  - One input rendered with `*` indicator
  - Run button DISABLED until input filled
  - Live region beneath shows "Fill required variables to run"

### Task 6.5 — AiGeneratePanel.vue

- [ ] **Step 6.5.1: Add testid additions**

  Edit `packages/client/src/components/editor/AiGeneratePanel.vue`. Existing testids preserved. Add:

  ```vue
  <section v-if="isOpen" data-testid="ai-generate-panel">
    <!-- existing children -->
    <div v-if="isStreaming" data-testid="ai-generate-loading">…</div>
  </section>
  ```

  Preserve the existing 5 testids (`ai-generate-toggle`, `ai-generate-description`, etc.).

  No source-code change to the token-flow logic (per design Feature 4 — AI tokens dispatch directly into the editor; the panel does not hold them in a ref).

### Task 6.6 — ghost-text.ts widget testid

- [ ] **Step 6.6.1: Edit `toDOM()` method**

  In `packages/client/src/lib/ai/ghost-text.ts`, find the `WidgetType.toDOM()` method (creates a `<span class="cm-ghost-text">`). Add:

  ```ts
  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'cm-ghost-text';
    span.setAttribute('data-testid', 'ai-autocomplete-suggestion');
    span.textContent = this.text;
    return span;
  }
  ```

  Preserve the existing className and text content.

- [ ] **Step 6.6.2: Update ghost-text.test.ts**

  In `packages/client/src/__tests__/lib/ai/ghost-text.test.ts`, add:

  ```ts
  it('renders the ghost-text widget with data-testid="ai-autocomplete-suggestion"', () => {
    // existing setup that renders ghost text
    const widget = view.dom.querySelector('[data-testid="ai-autocomplete-suggestion"]');
    expect(widget).not.toBeNull();
    expect(widget?.classList.contains('cm-ghost-text')).toBe(true);
  });
  ```

- [ ] **Step 6.6.3: Run ghost-text tests**

  Run: `npm test --workspace=@forge/client -- ghost-text`

  Expected: PASS.

### Task 6.7 — Run full client typecheck + tests

- [ ] **Step 6.7.1: Typecheck**

  Run: `npm run typecheck --workspace=@forge/client`

  Expected: 0 errors.

- [ ] **Step 6.7.2: Full client tests**

  Run: `npm test --workspace=@forge/client`

  Expected: all tests pass.

### Task 6.8 — Commit WU6

- [ ] **Step 6.8.1: Commit**

  ```bash
  git add packages/client/src/components/playground/{PlaygroundHeader,PromptVariableInput,PromptOutput}.vue \
          packages/client/src/components/editor/AiGeneratePanel.vue \
          packages/client/src/pages/PlaygroundPage.vue \
          packages/client/src/lib/ai/ghost-text.ts \
          packages/client/src/__tests__/lib/ai/ghost-text.test.ts \
          packages/client/src/__tests__/components/playground/PlaygroundHeader.test.ts
  git commit -m "feat(client): #50 component updates for playground/AI features

  - PromptVariableInput: locally-derived required, * + sr-only + aria-required
  - PromptOutput: prompt-output, prompt-output-content, prompt-output-loading testids
  - PlaygroundHeader: split Run (bg-primary) / Stop (bg-red-600), aria-describedby
    live region, fork button (PostEditor Cancel-button styling), 4 unit tests
  - PlaygroundPage: playground-page testid, two error regions
    (playground-load-error vs playground-error), source disclosure with
    list-none + custom rotating chevron, fetchPost wiring
  - AiGeneratePanel: ai-generate-panel + ai-generate-loading testid additions
  - ghost-text widget: data-testid='ai-autocomplete-suggestion' on the span"
  ```

---

## Work Unit 7 — E2E infrastructure

**Goal:** Add init-script fixture, wire it into auth.ts, add `selectors/playground.ts`, expand `selectors/ai.ts`.

**Files:**

- Create: `e2e/fixtures/init-script.ts`
- Create: `e2e/fixtures/selectors/playground.ts`
- Modify: `e2e/fixtures/auth.ts`
- Modify: `e2e/fixtures/selectors/ai.ts`

**Dependencies:** WU6 (testids must exist before specs reference them).

### Task 7.1 — init-script helper

- [ ] **Step 7.1.1: Create the file**

  ```ts
  // e2e/fixtures/init-script.ts
  import type { Page } from '@playwright/test';

  export async function attachE2EInitScript(page: Page): Promise<void> {
    await page.addInitScript(() => {
      (window as Window & { __E2E__?: boolean }).__E2E__ = true;
    });
  }
  ```

### Task 7.2 — Wire into auth.ts

- [ ] **Step 7.2.1: Read current auth.ts**

  Run: `cat e2e/fixtures/auth.ts`

  Identify where each user fixture (`testuser`, `alice`, `carol`) creates a context and a page.

- [ ] **Step 7.2.2: Add attachE2EInitScript call**

  Insert `await attachE2EInitScript(page);` after `const page = await context.newPage();` (or equivalent) and BEFORE `await use(page);` in each of the three fixtures. Three identical insertions.

  Add the import at the top:

  ```ts
  import { attachE2EInitScript } from './init-script.js';
  ```

### Task 7.3 — Create selectors/playground.ts

- [ ] **Step 7.3.1: Create the file**

  Use the verbatim shard from the design's §"Selector shards" → `e2e/fixtures/selectors/playground.ts (new)`. (Includes `loadError` per REV 3.)

- [ ] **Step 7.3.2: Quick syntax check**

  Run: `cd e2e && npx tsc --noEmit fixtures/selectors/playground.ts`

  Expected: 0 errors.

### Task 7.4 — Expand selectors/ai.ts

- [ ] **Step 7.4.1: Replace the file content**

  Use the verbatim shard from the design's §"Selector shards" → `e2e/fixtures/selectors/ai.ts (modified)`. Drops `acceptSuggestion`; adds generate-panel + editor selectors.

### Task 7.5 — Commit WU7

- [ ] **Step 7.5.1: Commit**

  ```bash
  git add e2e/fixtures/init-script.ts \
          e2e/fixtures/selectors/playground.ts \
          e2e/fixtures/selectors/ai.ts \
          e2e/fixtures/auth.ts
  git commit -m "feat(e2e): #50 init-script fixture + selector shards

  - init-script.ts: page.addInitScript sets window.__E2E__=true before navigation
  - auth.ts: per-user fixtures call attachE2EInitScript before use(page)
  - selectors/playground.ts (new): page/header/title/variables/run/stop/fork/error/loadError/output
  - selectors/ai.ts: drops acceptSuggestion (Tab via keyboard, no button);
    adds generate-panel + editor selectors"
  ```

---

## Work Unit 8 — Playground specs (9)

**Goal:** Author 9 Playwright specs in `e2e/specs/playground/`.

**Files:**

- Create: 9 `.spec.ts` files

**Dependencies:** WU7.

**Common helper at the top of each spec file:**

```ts
import { test, expect } from '../../fixtures/reset.js';
import { playground } from '../../fixtures/selectors/playground.js';
import { withMockScript } from '../../fixtures/mock-llm.js';

// (Optional) Helper to seed a playground post with one variable.
async function seedPromptPost(
  page: import('@playwright/test').Page,
  options: { content?: string; title?: string } = {},
): Promise<{ id: string }> {
  const refresh = await page.request.post('/api/auth/refresh');
  const { accessToken } = await refresh.json();
  const created = await page.request.post('/api/posts', {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: {
      title: options.title ?? `e2e-prompt-${Date.now()}`,
      contentType: 'prompt',
      language: 'markdown',
      content: options.content ?? 'Hello {{name}}!',
      visibility: 'public',
      isDraft: false,
    },
  });
  expect(created.ok()).toBeTruthy();
  const { post } = await created.json();
  return post;
}
```

If duplication grows, hoist this helper into `e2e/fixtures/playground-helpers.ts` after spec WU completes (DRY refactor; not blocking).

### Task 8.1 — `open-prompt-page.spec.ts`

- [ ] **Step 8.1.1: Create the spec**

  ```ts
  test('playground: open prompt page renders header, source disclosure (collapsed), run button', async ({
    testuser,
  }) => {
    await withMockScript(testuser, 'default');
    const post = await seedPromptPost(testuser, { title: 'Greeting', content: 'Hi {{name}}!' });

    await testuser.goto(`/playground/${post.id}`);

    await expect(playground.page(testuser)).toBeVisible();
    await expect(playground.title(testuser)).toContainText('Greeting');
    await expect(playground.runBtn(testuser)).toBeVisible();
    // Disclosure is present and collapsed by default
    const disclosure = testuser.getByTestId('playground-prompt-source');
    await expect(disclosure).toBeVisible();
    await expect(disclosure).not.toHaveAttribute('open', '');
  });
  ```

- [ ] **Step 8.1.2: Run the spec**

  Run: `npm run e2e -- specs/playground/open-prompt-page`

  Expected: PASS at workers=1.

### Task 8.2 — `fill-and-run-streams.spec.ts`

- [ ] **Step 8.2.1: Create the spec**

  ```ts
  test('playground: fill required var, run, output streams chunks (progressive)', async ({
    testuser,
  }) => {
    await withMockScript(testuser, 'default');
    const post = await seedPromptPost(testuser, { content: 'Hi {{name}}!' });

    await testuser.goto(`/playground/${post.id}`);
    await playground.variableInput(testuser, 'name').fill('world');
    await playground.runBtn(testuser).click();

    // Default script: ['Hello', ' world', '[done]']
    await expect
      .poll(async () => (await playground.outputContent(testuser).textContent()) ?? '', {
        timeout: 10_000,
      })
      .toContain('Hello world');
  });
  ```

### Task 8.3 — `copy-output.spec.ts`

- [ ] **Step 8.3.1: Create the spec**

  ```ts
  test('playground: copy button writes streamed content to clipboard', async ({
    testuser,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await withMockScript(testuser, 'default');
    const post = await seedPromptPost(testuser, { content: 'Hi {{name}}!' });

    await testuser.goto(`/playground/${post.id}`);
    await playground.variableInput(testuser, 'name').fill('there');
    await playground.runBtn(testuser).click();
    await expect(playground.outputContent(testuser)).toContainText('Hello world');

    await playground.copyBtn(testuser).click();
    const clipboardText = await testuser.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toContain('Hello world');
  });
  ```

### Task 8.4 — `variable-validation-required.spec.ts`

- [ ] **Step 8.4.1: Create the spec**

  ```ts
  test('playground: required var → Run disabled, * indicator, aria-required, run-hint live region', async ({
    testuser,
  }) => {
    await withMockScript(testuser, 'default');
    // Use the new fixture post (one NULL-default var)
    const fixturePostId = 'c0000000-0000-0000-0000-000000000050';
    await testuser.goto(`/playground/${fixturePostId}`);

    // Required indicator visible
    await expect(playground.variableRequiredMark(testuser, 'required_name')).toBeVisible();

    // aria-required asserted on the input
    const input = playground.variableInput(testuser, 'required_name');
    await expect(input).toHaveAttribute('aria-required', 'true');

    // Run button disabled, hint visible
    await expect(playground.runBtn(testuser)).toBeDisabled();
    await expect(playground.runHint(testuser)).toBeVisible();
    await expect(playground.runHint(testuser)).toContainText('Fill required variables');

    // Fill the input → enabled
    await input.fill('something');
    await expect(playground.runBtn(testuser)).toBeEnabled();
  });
  ```

### Task 8.5 — `variable-defaultvalue-opt-out.spec.ts`

- [ ] **Step 8.5.1: Create the spec**

  ```ts
  test('playground: variable with defaultValue is NOT required; Run enabled even when input empty', async ({
    testuser,
  }) => {
    await withMockScript(testuser, 'default');
    const post = await seedPromptPost(testuser, { content: 'Hi {{maybe}}!' });
    // Override defaultValue post-creation: easiest path is to seed the post
    // with a prompt_variable row that has defaultValue. If the public API
    // doesn't support this (post-creation), use the demo prompt
    // c0000000-...-000000000004 (all defaulted after WU3).
    const demoPostId = 'c0000000-0000-0000-0000-000000000004';
    await testuser.goto(`/playground/${demoPostId}`);

    // No * indicator on any variable
    await expect(playground.variableRequiredMark(testuser, 'props')).toHaveCount(0);
    // Run enabled even when inputs are at their default-empty state
    await expect(playground.runBtn(testuser)).toBeEnabled();
  });
  ```

### Task 8.6 — `save-as-fork.spec.ts`

- [ ] **Step 8.6.1: Create the spec**

  ```ts
  test('playground: fork button creates new prompt post; navigates to /playground/{newId}', async ({
    testuser,
  }) => {
    await withMockScript(testuser, 'default');
    // Use the demo prompt as source (alice-owned, fully defaulted)
    const sourceId = 'c0000000-0000-0000-0000-000000000004';
    await testuser.goto(`/playground/${sourceId}`);

    await playground.forkBtn(testuser).click();

    await testuser.waitForURL(/\/playground\/[0-9a-f-]+$/, { timeout: 10_000 });
    const forkedId = testuser.url().split('/').pop();
    expect(forkedId).not.toBe(sourceId);

    await expect(playground.page(testuser)).toBeVisible();
  });
  ```

### Task 8.7 — `missing-variable-error.spec.ts`

- [ ] **Step 8.7.1: Create the spec**

  ```ts
  test('playground: API call with empty required vars returns structured 400', async ({
    testuser,
  }) => {
    await withMockScript(testuser, 'default');

    const refresh = await testuser.request.post('/api/auth/refresh');
    const { accessToken } = await refresh.json();

    const res = await testuser.request.post('/api/playground/run', {
      headers: { Authorization: `Bearer ${accessToken}`, 'X-Mock-Script': 'default' },
      data: {
        postId: 'c0000000-0000-0000-0000-000000000050', // required-var fixture
        variables: {},
      },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('MISSING_REQUIRED_VARIABLES');
    expect(body.missing).toContain('required_name');
    expect(body.error).toMatch(/^Missing required variables/);
  });
  ```

### Task 8.8 — `multiple-variables.spec.ts`

- [ ] **Step 8.8.1: Create the spec**

  ```ts
  test('playground: post with multiple required vars renders all + gates Run', async ({
    testuser,
  }) => {
    await withMockScript(testuser, 'default');
    const post = await seedPromptPost(testuser, {
      content: 'Hello {{name}}, you are a {{role}} working on {{project}}.',
    });
    await testuser.goto(`/playground/${post.id}`);

    await expect(playground.variableInput(testuser, 'name')).toBeVisible();
    await expect(playground.variableInput(testuser, 'role')).toBeVisible();
    await expect(playground.variableInput(testuser, 'project')).toBeVisible();

    await expect(playground.runBtn(testuser)).toBeDisabled();
    await playground.variableInput(testuser, 'name').fill('Andrew');
    await expect(playground.runBtn(testuser)).toBeDisabled();
    await playground.variableInput(testuser, 'role').fill('engineer');
    await expect(playground.runBtn(testuser)).toBeDisabled();
    await playground.variableInput(testuser, 'project').fill('forge');
    await expect(playground.runBtn(testuser)).toBeEnabled();

    await playground.runBtn(testuser).click();
    await expect(playground.outputContent(testuser)).toContainText('Hello world');
  });
  ```

### Task 8.9 — `mock-script-readme.spec.ts`

- [ ] **Step 8.9.1: Create the spec**

  ```ts
  test('playground: generate-readme-short script renders deterministic README chunks', async ({
    testuser,
  }) => {
    await withMockScript(testuser, 'generate-readme-short');
    const post = await seedPromptPost(testuser, { content: 'Generate a README for {{project}}' });
    await testuser.goto(`/playground/${post.id}`);
    await playground.variableInput(testuser, 'project').fill('forge');
    await playground.runBtn(testuser).click();

    // Pick a deterministic substring from generate-readme-short script
    // (read packages/server/src/plugins/langchain/mock-scripts.ts to find one).
    await expect(playground.outputContent(testuser)).toContainText('## ', { timeout: 10_000 });
  });
  ```

  Implementer: open `mock-scripts.ts`, find an exact substring from the `generate-readme-short` chunk array, and use it (e.g., `## Installation` if present).

### Task 8.10 — Run all WU8 specs

- [ ] **Step 8.10.1: Run the playground suite**

  Run: `npm run e2e -- specs/playground`

  Expected: 9/9 PASS at workers=1.

### Task 8.11 — Commit WU8

- [ ] **Step 8.11.1: Commit**

  ```bash
  git add e2e/specs/playground/
  git commit -m "test(e2e): #50 add playground specs (9)

  All specs explicitly set X-Mock-Script via withMockScript helper.
  Covers: open-prompt-page (disclosure collapsed), fill-and-run-streams
  (progressive expect.poll), copy-output (clipboard), variable-validation-required
  (* indicator + aria-required + run-hint live region), variable-defaultvalue-opt-out,
  save-as-fork (redirect to /playground/{newId}), missing-variable-error
  (direct API + structured 400), multiple-variables (all gated), mock-script-readme."
  ```

---

## Work Unit 9 — AI specs (7)

**Goal:** Author 7 Playwright specs in `e2e/specs/ai/`.

**Files:**

- Create: 7 `.spec.ts` files

**Dependencies:** WU7.

**Per-user assignment** (from design): autocomplete-\* + generate-from-prompt and the trio on testuser; `generate-from-prompt` and `error-during-stream` on alice; `mid-stream-cancel` and `streaming-ui-states` on carol.

Wait — the design says: testuser=3 (autocomplete trio), alice=2 (generate-from-prompt, error-during-stream), carol=2 (mid-stream-cancel, streaming-ui-states). Use the user fixture per spec.

**Common helper at the top of each AI spec:**

```ts
import { test, expect } from '../../fixtures/reset.js';
import { ai } from '../../fixtures/selectors/ai.js';
import { withMockScript } from '../../fixtures/mock-llm.js';

async function openEditorOnNewPost(page: import('@playwright/test').Page) {
  await page.goto('/posts/new');
  await page.locator('.cm-content').first().waitFor();
  await page.locator('.cm-content').first().click();
}
```

### Task 9.1 — `autocomplete-token-trigger.spec.ts`

- [ ] **Step 9.1.1: Create the spec**

  ```ts
  test('ai: typing triggers autocomplete ghost text', async ({ testuser }) => {
    await withMockScript(testuser, 'autocomplete-typescript-react');
    await openEditorOnNewPost(testuser);
    await testuser.keyboard.type('export function ');
    await expect(ai.autocompleteSuggestion(testuser)).toBeVisible({ timeout: 5_000 });
  });
  ```

### Task 9.2 — `autocomplete-accept-tab.spec.ts`

- [ ] **Step 9.2.1: Create the spec**

  ```ts
  test('ai: Tab key inserts the suggested text', async ({ testuser }) => {
    await withMockScript(testuser, 'autocomplete-typescript-react');
    await openEditorOnNewPost(testuser);
    await testuser.keyboard.type('export function ');
    await expect(ai.autocompleteSuggestion(testuser)).toBeVisible();
    const ghostText = (await ai.autocompleteSuggestion(testuser).textContent()) ?? '';
    await testuser.keyboard.press('Tab');
    await expect(ai.autocompleteSuggestion(testuser)).toHaveCount(0);
    const editorText = (await ai.editorContent(testuser).textContent()) ?? '';
    expect(editorText).toContain(ghostText.trim().slice(0, 10));
  });
  ```

### Task 9.3 — `autocomplete-dismiss-esc.spec.ts`

- [ ] **Step 9.3.1: Create the spec**

  ```ts
  test('ai: Esc dismisses ghost text without inserting', async ({ testuser }) => {
    await withMockScript(testuser, 'autocomplete-typescript-react');
    await openEditorOnNewPost(testuser);
    await testuser.keyboard.type('export function ');
    await expect(ai.autocompleteSuggestion(testuser)).toBeVisible();
    const before = (await ai.editorContent(testuser).textContent()) ?? '';
    await testuser.keyboard.press('Escape');
    await expect(ai.autocompleteSuggestion(testuser)).toHaveCount(0);
    const after = (await ai.editorContent(testuser).textContent()) ?? '';
    expect(after).toBe(before);
  });
  ```

### Task 9.4 — `generate-from-prompt.spec.ts`

- [ ] **Step 9.4.1: Create the spec**

  ```ts
  test('ai: generate panel streams chunks INTO the editor (alice)', async ({ alice }) => {
    await withMockScript(alice, 'generate-readme-short');
    await alice.goto('/posts/new');
    await ai.generateToggle(alice).click();
    await expect(ai.generatePanel(alice)).toBeVisible();
    await ai.generateDescription(alice).fill('Generate a short README');
    await ai.generateSubmit(alice).click();
    await expect(ai.editorContent(alice)).toContainText('## ', { timeout: 10_000 });
  });
  ```

### Task 9.5 — `error-during-stream.spec.ts`

- [ ] **Step 9.5.1: Create the spec**

  ```ts
  test('ai: error-rate-limit script surfaces error UI (alice)', async ({ alice }) => {
    await withMockScript(alice, 'error-rate-limit');
    await alice.goto('/posts/new');
    await ai.generateToggle(alice).click();
    await ai.generateDescription(alice).fill('Anything');
    await ai.generateSubmit(alice).click();
    await expect(ai.generateError(alice)).toBeVisible({ timeout: 5_000 });
    await expect(ai.generateError(alice)).toContainText(/rate.?limit|too many/i);
  });
  ```

### Task 9.6 — `mid-stream-cancel.spec.ts` (CRITICAL — DoD pin)

- [ ] **Step 9.6.1: Create the spec**

  ```ts
  test('ai: mid-stream cancel via page.evaluate returns UI to idle + releases rate-limit slot (carol)', async ({
    carol,
  }) => {
    await withMockScript(carol, 'mid-stream-cancel');
    await carol.goto('/posts/new');
    await ai.generateToggle(carol).click();
    await ai.generateDescription(carol).fill('Anything');
    await ai.generateSubmit(carol).click();

    await expect(ai.generateLoading(carol)).toBeVisible();
    await expect(ai.editorContent(carol)).toContainText('partial', { timeout: 5_000 });

    // Cancel via the E2E hook (per DoD wording: page.evaluate)
    await carol.evaluate(() => {
      const win = window as Window & { __forgeE2eAiAbort?: () => void };
      win.__forgeE2eAiAbort?.();
    });

    await expect(ai.generateLoading(carol)).toHaveCount(0);

    // Verify rate-limit slot released — follow-up call must NOT 429
    const refresh = await carol.request.post('/api/auth/refresh');
    const { accessToken } = await refresh.json();
    const followup = await carol.request.post('/api/ai/generate', {
      headers: { Authorization: `Bearer ${accessToken}`, 'X-Mock-Script': 'default' },
      data: { description: 'Anything', contentType: 'snippet', language: 'typescript' },
    });
    expect(followup.status()).not.toBe(429);
  });
  ```

### Task 9.7 — `streaming-ui-states.spec.ts`

- [ ] **Step 9.7.1: Create the spec**

  ```ts
  test('ai: loading → partial → completion (carol)', async ({ carol }) => {
    await withMockScript(carol, 'generate-readme-short');
    await carol.goto('/posts/new');
    await ai.generateToggle(carol).click();
    await ai.generateDescription(carol).fill('Generate something');
    await ai.generateSubmit(carol).click();

    await expect(ai.generateLoading(carol)).toBeVisible();
    await expect
      .poll(async () => (await ai.editorContent(carol).textContent()) ?? '', { timeout: 10_000 })
      .toMatch(/.+/);
    await expect(ai.generateLoading(carol)).toHaveCount(0, { timeout: 10_000 });
  });
  ```

### Task 9.8 — Run all WU9 specs

- [ ] **Step 9.8.1: Run the AI suite**

  Run: `npm run e2e -- specs/ai`

  Expected: 7/7 PASS at workers=1.

### Task 9.9 — Commit WU9

- [ ] **Step 9.9.1: Commit**

  ```bash
  git add e2e/specs/ai/
  git commit -m "test(e2e): #50 add ai specs (7) with per-user assignment

  testuser: autocomplete-token-trigger, autocomplete-accept-tab, autocomplete-dismiss-esc
  alice: generate-from-prompt, error-during-stream
  carol: mid-stream-cancel, streaming-ui-states

  Per-user split spreads the per-userId AI rate-limiter so workers=4 doesn't
  collide. mid-stream-cancel uses page.evaluate(() => window.__forgeE2eAiAbort?.())
  per the DoD's explicit wording, then verifies the rate-limit slot release via
  a follow-up /api/ai/generate that must not 429."
  ```

---

## Work Unit 10 — Verification

**Goal:** Workers=1/4 parity; coverage; Bruno regression; 3 consecutive green CI runs; axe-core scan; tracking issue update.

**Dependencies:** WU8 + WU9.

### Task 10.1 — Workers=1 and workers=4 parity

- [ ] **Step 10.1.1: Workers=1**

  Run: `npm run e2e -- specs/playground specs/ai --workers=1`

  Expected: 16/16 PASS.

- [ ] **Step 10.1.2: Workers=4**

  Run: `npm run e2e -- specs/playground specs/ai --workers=4`

  Expected: 16/16 PASS. The per-user assignment (testuser=3, alice=2, carol=2) keeps each user under the 1-concurrent rate limit.

  If any AI spec fails at workers=4 with a 429, the immediate mitigation is `test.describe.configure({ mode: 'serial' })` at the top of the affected file. Last-resort: drop `playwright.config.ts` workers to 2.

### Task 10.2 — Coverage + Bruno gates

- [ ] **Step 10.2.1: Vitest coverage**

  Run: `npm run test:coverage`

  Expected: thresholds in `.coverage-thresholds.json` met.

- [ ] **Step 10.2.2: Bruno regression**

  Start the server: `set -a && source .env && set +a && cd packages/server && npx tsx src/server.ts`

  In another terminal: `cd bruno && npx @usebruno/cli run -r --env local`

  Expected: every request returns its asserted status.

### Task 10.3 — 3 consecutive green CI runs

- [ ] **Step 10.3.1: Push branch**

  Run: `git push -u origin feat/e2e-playground-ai`

- [ ] **Step 10.3.2: Wait for 3 green CI runs**

  Use the GitHub Actions UI or `gh run list --workflow=playwright-e2e --branch=feat/e2e-playground-ai`. Capture run URLs for the PR body.

  If a run flakes once, fix the flake source — do NOT add `test.fixme` to mask it.

### Task 10.4 — axe-core scan

- [ ] **Step 10.4.1: Add axe-core scan to one spec**

  In `e2e/specs/playground/variable-validation-required.spec.ts`, after the existing assertions, add:

  ```ts
  // axe-core scan
  await testuser.evaluate(() => {
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/axe-core@4/axe.min.js';
    document.head.appendChild(script);
    return new Promise<void>((r) => {
      script.onload = () => r();
    });
  });
  const results = await testuser.evaluate(() => (window as any).axe.run());
  expect(results.violations).toEqual([]);
  ```

  **Note:** the implementer prefers `@axe-core/playwright` if available in the project's deps. Otherwise the inline-injection approach above works as a one-off. If neither is available without adding a dep, leave the axe scan as a manual verification step and note it in the PR body.

### Task 10.5 — Update tracking issue #43

- [ ] **Step 10.5.1: Comment on #43**

  After the PR is approved (or near merge), run:

  ```bash
  gh issue comment 43 --body "✅ E2E rollout 5/9 (issue #50) — playground + AI specs added in PR #<N>. 16 specs (9 playground + 7 ai), all green at workers=1 and workers=4 across 3 consecutive CI runs."
  ```

### Task 10.6 — Commit any stabilization fixes (only if WU10 surfaces issues)

- [ ] **Step 10.6.1: Commit**

  ```bash
  git add <fixed-files>
  git commit -m "test(e2e): #50 stabilize <spec> at workers=4

  <root cause>"
  ```

---

## Work Unit 11 — Pre-PR / CLAUDE.md / follow-up issues / PR

**Goal:** Update CLAUDE.md with the error envelope convention. File the 3 follow-up issues. Run `/self-reflect`. Open the PR.

**Dependencies:** WU1-WU10.

### Task 11.1 — Update CLAUDE.md with error envelope convention

- [ ] **Step 11.1.1: Add a paragraph**

  Edit `CLAUDE.md`. Add a new subsection under "Code Quality" (or another suitable location):

  ````markdown
  ## Error Envelope Convention (introduced in #50)

  Structured error responses use the shape:

  ```ts
  { error: <human-readable string>, code: <UPPER_SNAKE>, ...details }
  ```
  ````

  - `error` is the human-readable message — safe to render verbatim in the client UI.
  - `code` is the machine-readable identifier for client-side branching.
  - `...details` are optional structured fields specific to the error class.

  Use this shape for any error where the client needs to branch on the error type or render structured details (e.g., `missing: ['name', 'role']` for missing required variables). For purely informational errors with no client-side discrimination, the legacy `{ error: '<string>' }` shape is acceptable. Existing routes are NOT retrofitted — apply the new shape going forward.

  ```

  ```

- [ ] **Step 11.1.2: Commit**

  ```bash
  git add CLAUDE.md
  git commit -m "docs(claude): #50 document error envelope convention { error, code, ...details }

  Establishes project-wide standard for structured error responses
  introduced in #50's /api/playground/run validation.

  Existing routes are NOT retrofitted — applies going forward."
  ```

### Task 11.2 — File 3 follow-up issues

- [ ] **Step 11.2.0: Create missing labels (one-time)**

  Verify which labels exist: `gh label list --json name --jq '.[].name'`. The repo currently has `security` but does NOT have `a11y` or `tech-debt`. Create them:

  ```bash
  gh label create a11y --description "Accessibility concerns" --color "#0E8A16" || true
  gh label create tech-debt --description "Technical debt or follow-up cleanup" --color "#FBCA04" || true
  ```

  The `|| true` guards against re-running this step on a branch where someone already created the labels.

- [ ] **Step 11.2.1: Issue (a) — a11y retrofit**

  ```bash
  gh issue create \
    --title "Retrofit Login/Register/PostNew with richer a11y pattern" \
    --label "a11y,tech-debt" \
    --body "Tracked from #50: PromptVariableInput now uses '*' indicator + aria-required + sr-only 'required' text. Existing forms (LoginPage, RegisterPage, PostNewPage) use only the native HTML 'required' attribute. Retrofit them for consistency and improved screen-reader UX."
  ```

  Capture the new issue number; record it in the PR body.

- [ ] **Step 11.2.2: Issue (b) — variables-endpoint visibility**

  ```bash
  gh issue create \
    --title "Tighten GET /api/posts/:id/variables visibility" \
    --label "security,tech-debt" \
    --body "Tracked from #50 design-review-gate: GET /api/posts/:id/variables returns the variable list without enforcing assertCanReadPost. Any authenticated user can enumerate variable names of private posts. The /api/playground/run validation tightens the parallel disclosure path; this sibling endpoint should match."
  ```

- [ ] **Step 11.2.3: Issue (c) — max-content-length**

  ```bash
  gh issue create \
    --title "Add max-content-length to createRevisionSchema.content" \
    --label "security,tech-debt" \
    --body "Tracked from #50 design-review-gate: createRevisionSchema.content has only z.string().min(1) — no upper bound. The new extractRequiredVariables regex pass and existing assemblePrompt run O(n) over content; an attacker creating a megabyte-sized post amplifies CPU cost on every /api/playground/run from any user with read access. Add a sensible max (e.g., 256KB)."
  ```

### Task 11.3 — `/self-reflect`

- [ ] **Step 11.3.1: Run /self-reflect**

  Invoke the `/self-reflect` skill or equivalent. Likely candidates worth capturing:
  - The new error envelope convention (project-wide)
  - The `window.__E2E__` + addInitScript pattern for E2E-only hooks
  - The CodeMirror widget data-testid pattern (toDOM().setAttribute)
  - The deterministic per-user assignment for E2E specs to avoid per-userId rate-limiter collisions at workers=4
  - The `findRevisionsByPostId` DESC ordering (latest is `revisions[0]`)
  - `assertCanReadPost` semantics (returns boolean + sends 403; pattern: `if (!assertCanReadPost(post, userId, reply)) return;`)

- [ ] **Step 11.3.2: Commit knowledge updates**

  ```bash
  git add .beads/ docs/knowledge/  # whichever paths self-reflect touched
  git commit -m "docs(knowledge): #50 capture learnings from playground+ai feature additions"
  ```

### Task 11.4 — Open the PR

- [ ] **Step 11.4.1: Push final branch state**

  Run: `git push origin feat/e2e-playground-ai`

- [ ] **Step 11.4.2: Open PR**

  ```bash
  gh pr create --title "feat(playground+ai): #50 required-var validation + fork-from-playground + 16 E2E specs" \
    --body "$(cat <<'EOF'
  ```

## Summary

Issue #50 expanded scope (per design-review-gate) to BUILD 4 missing features and ADD 16 E2E specs:

- **Required-variable validation** — `extractRequiredVariables` shared helper; client `canRun` gating; server-side rejection with structured 400 (`{ error, code: 'MISSING_REQUIRED_VARIABLES', missing: [...] }`).
- **Missing-variable error path** — server contract validated by Bruno + spec #7; client surface via `usePlayground.error` + `playground-error` region.
- **Fork-from-playground UI** — new fork button on `PlaygroundHeader`; redirects to `/playground/{newId}` for prompt sources, `/posts/{newId}/edit` otherwise. `usePosts.forkPost` itself unchanged.
- **E2E abort hook** — `window.__forgeE2eAiAbort` in `useAiGenerate.ts` gated by `MODE !== 'production' && window.__E2E__`; honors the DoD's explicit `page.evaluate` wording for mid-stream-cancel.

Plus 16 specs (9 playground + 7 ai), all explicitly setting `X-Mock-Script` via the typed helper. Per-user assignment (testuser=3, alice=2, carol=2) avoids the per-userId rate-limiter at workers=4.

## New conventions

- **Error envelope**: `{ error: <human>, code: <UPPER_SNAKE>, ...details }` documented in CLAUDE.md.
- **A11y on PromptVariableInput**: `*` + `aria-required` + sr-only "required" text. Follow-up issue filed for Login/Register/PostNew retrofit.

## Soft break-change

Prompts whose variables don't have a pre-filled default now require the user to fill them before Run is enabled. We confirmed no production legacy data exists; the only affected seeded row (`props` on the React Component Generator demo) is updated in this PR.

## Technical debt

The `__forgeE2eAiAbort` window hook adds 3 runtime-gated lines + try/finally restructure to `useAiGenerate.ts`. Tracked as known technical debt; the alternative (Stop-button click) was rejected because the DoD specifies `page.evaluate` to exercise the underlying abort path.

## Follow-up issues

- #<NEW> — retrofit Login/Register/PostNew with richer a11y pattern
- #<NEW> — tighten GET /api/posts/:id/variables visibility
- #<NEW> — add max-content-length to createRevisionSchema.content

## Test plan

- [x] `npm run e2e -- specs/playground specs/ai --workers=1` — 16/16 PASS
- [x] `npm run e2e -- specs/playground specs/ai --workers=4` — 16/16 PASS
- [x] 3 consecutive green CI runs (linked below)
- [x] `npm run test:coverage` — thresholds met
- [x] `cd bruno && npx @usebruno/cli run -r --env local` — green (incl. new run-prompt-missing-required.bru)
- [x] axe-core scan on PlaygroundPage with required vars empty — 0 violations

## CI runs

- <run URL 1>
- <run URL 2>
- <run URL 3>

Closes #50.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"

```

Replace `<NEW>` placeholders with the actual issue numbers from Task 11.2.

---

## Self-Review

### 1. Spec coverage

Walk every issue #50 DoD bullet:
- ✅ playground/ ~10 specs → WU8 (9; within 8-12 band)
- ✅ ai/ ~8 specs → WU9 (7; within 7-9 band)
- ✅ selectors/playground.ts (new) → WU7 Task 7.3
- ✅ selectors/ai.ts (expand) → WU7 Task 7.4
- ✅ data-testid additions → WU6 (all tasks)
- ✅ X-Mock-Script always set explicitly → WU8/WU9 spec tables
- ✅ Mid-stream cancel verifies slot release → WU9 Task 9.6 (follow-up request must not 429)
- ✅ workers=1 + workers=4 → WU10 Task 10.1
- ✅ 3 consecutive green CI → WU10 Task 10.3
- ✅ Vitest + Bruno gates → WU10 Task 10.2
- ✅ Tracking issue #43 update → WU10 Task 10.5
- ✅ Closes #50 → WU11 Task 11.4 PR body

Now-in-scope items (per design):
- ✅ extractRequiredVariables → WU1
- ✅ Server validation pipeline → WU2
- ✅ Seed updates → WU3
- ✅ New + verified Bruno tests → WU4
- ✅ usePlayground updates → WU5 Task 5.1
- ✅ useAiGenerate E2E hook → WU5 Task 5.2
- ✅ All 6 component updates → WU6
- ✅ E2E init-script + auth wiring → WU7
- ✅ axe-core scan → WU10 Task 10.4
- ✅ Follow-up issues → WU11 Task 11.2
- ✅ CLAUDE.md update → WU11 Task 11.1
- ✅ /self-reflect → WU11 Task 11.3

### 2. Placeholder scan

- "<the NULL-default var name>" appears once in WU2 Task 2.2.2 — replaced with `required_name` after WU3 commits.
- "<seed alice's private prompt UUID>" in WU2 Task 2.2.2 case 10 — implementer fills with whatever existing seed UUID is alice-owned + private.
- "<NEW>" placeholders in WU11 Task 11.4.2 — replaced with the actual issue numbers from Task 11.2.
- "<run URL N>" in PR body — filled in after CI runs.
- Each placeholder is explicit and resolvable; not vague TBDs.

### 3. Type / name consistency

- `requiredVariables` / `canRun` / `missingVariables` / `loadError` / `error` / `currentPost` / `fetchPost` named consistently across WU5, WU6, WU8.
- Mock script keys (`default`, `autocomplete-typescript-react`, `generate-readme-short`, `error-rate-limit`, `mid-stream-cancel`) match between specs and existing registry.
- testid strings match between WU6 (added) and WU7 (consumed): `playground-page`, `playground-run-btn`, `playground-stop-btn`, `playground-fork-btn`, `playground-error`, `playground-load-error`, `playground-prompt-source`, `playground-prompt-content`, `prompt-variable-input-{name}`, `prompt-variable-required-{name}`, `prompt-variable-label-{name}`, `prompt-output`, `prompt-output-content`, `prompt-output-loading`, `copy-button`, `ai-autocomplete-suggestion`, `ai-generate-toggle`, `ai-generate-panel`, `ai-generate-description`, `ai-generate-submit`, `ai-generate-stop`, `ai-generate-cancel`, `ai-generate-loading`, `ai-generate-error`.
- Per-user assignment matches between design and WU9 spec tables: testuser (autocomplete trio), alice (generate/error), carol (cancel/streaming).
- API error envelope `{ error, code, missing }` consistent in WU2, WU4, WU5, WU8.

### 4. CLAUDE.md compliance

- ✅ TDD: every code-introducing WU writes failing tests first, runs them, then implements.
- ✅ Bruno gate honored (WU4).
- ✅ Coverage gate honored (WU10 Task 10.2.1).
- ✅ One commit per WU.
- ✅ No `--no-verify`. No force-push.
- ✅ Pre-PR `/self-reflect` (WU11 Task 11.3).
- ✅ Plan-review-gate runs after this plan (sequenced by /metaswarm:start-task).
- ✅ User picks execution method after plan-review-gate.

### 5. Failure modes (per issue + design)

- ✅ Per-userId rate-limiter at workers=4 → per-user spec assignment in WU9.
- ✅ CodeMirror autocomplete absolute positioning → testid on widget span (WU6 Task 6.6).
- ✅ `mid-stream-cancel` script omits `[done]` → WU9 Task 9.6 doesn't wait for completion.
- ✅ `revisions.at(-1)` correctness → WU2 Task 2.3 uses `revisions[0]` (DESC order).
- ✅ `preHandler` double-auth → WU2 Task 2.3 uses `app.aiGate` only.
- ✅ `useAiGenerate` existing semantics preserved → WU5 Task 5.2.4 explicit list.
- ✅ Error envelope mismatch with existing routes → handled by keeping `error` human-readable + adding `code` (WU2).
```
