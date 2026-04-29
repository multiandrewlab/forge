# E2E Playwright Testing — Design

**Date:** 2026-04-28
**Status:** Draft (revision 2 — addressing design review gate round 1 feedback)
**Scope:** Add full feature-complete E2E coverage of the Forge web application using Playwright, building on the existing Bruno seeded-fixture infrastructure.

## Overview

Forge currently has two test layers: Vitest at 100% line/branch coverage (unit & component) and Bruno enforcing status-code-per-endpoint at the HTTP boundary. There is no automated coverage of UI behavior, router transitions, store reactivity, SSE rendering, or integration glue between client + server + storage.

This design adds a third layer — Playwright — sized at ~135 specs across 12 feature folders plus a cross-cutting journey smoke. The suite drives a real Forge stack (Postgres + MinIO via docker-compose, Fastify, Vue/Vite) with three minimal server seams gated by environment flags: a deterministic mock LLM provider, a `__test__/reset` endpoint that re-runs `scripts/seed.sql`, and a per-boot shared-secret header for the reset endpoint. Bruno's seeded fixtures are reused as-is — the existing seed already provides four local-auth users (`alice`, `bob`, `carol`, `testuser`) that satisfy multi-user permission scenarios; no new seed users are added in v1.

The suite is delivered as 9 sequential GitHub issues (1a server seams, 1b scaffolding, 1c auth specs, then 6 feature batches and 1 polish), each filed in advance with full TDD plans, acceptance criteria, and agent instructions. CI starts non-blocking and flips to blocking after 14 consecutive green main runs (no calendar bound).

**Revision-2 changes** vs. revision-1:

- Mock LLM provider relocated to match real codebase (`packages/server/src/plugins/langchain/`) and shaped as a LangChain `BaseChatModel` implementation with `AsyncLocalStorage`-based per-request script selection.
- Reset endpoint truncate list replaced with "shells out to `seed.sql`" — no parallel list to drift.
- Boot fail-fast located at top of `packages/server/src/server.ts` (already coverage-excluded).
- Defense-in-depth on the test surface: separate `ENABLE_TEST_ROUTES=1` flag, per-boot `X-E2E-Secret` header, `NODE_ENV` allowlist, strict env parsing.
- Seed-script production guard (`npm run seed` refuses non-localhost `DATABASE_URL` without `ALLOW_DESTRUCTIVE_SEED=1`).
- Foundation PR split into three reviewable PRs (1a / 1b / 1c).
- Coverage strategy specified concretely (which new files get Vitest unit tests; which are excluded).
- Multi-user fixtures use existing `alice` (otheruser-equivalent) and `carol` from seed.sql — no new seed users added. `adminuser` deferred until an admin-gated feature exists.
- `data-testid` naming convention specified (kebab-case + role suffixes for interactive elements).
- Stability gate criterion tightened to "14 consecutive green main runs" (no time-bound OR clause).

## Design Decisions

| Decision                     | Choice                                                                                                                                                          | Rationale                                                                                      |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Coverage depth               | Feature-complete (~135 specs)                                                                                                                                   | Bruno already covers API status codes; Playwright targets UI behavior the API layer can't see. |
| External LLM                 | Mock as fourth case in `createChatModel()` switch, gated by env allowlist                                                                                       | Reuses the existing provider seam; solves the Bruno CI `OPENAI_API_KEY` gap as a side benefit. |
| External Postgres / MinIO    | Real, via docker-compose                                                                                                                                        | Already deterministic, already wired in Bruno.                                                 |
| External OAuth               | Tested in current 501/401 stub state                                                                                                                            | No real Google credentials in CI; production OAuth flow tested manually.                       |
| DB isolation                 | `POST /api/__test__/reset` shelling out to `scripts/seed.sql` in `beforeEach`, workers capped at 4                                                              | Single source of truth for seeded state; no hand-maintained truncate list.                     |
| Test endpoint access control | `ENABLE_TEST_ROUTES=1` (separate from `E2E_MODE`) + `X-E2E-Secret` header + NODE_ENV allowlist + bind-address check                                             | Defense in depth; single-flag gate is too thin for an endpoint that wipes the DB.              |
| Auth strategy                | Multi-user `storageState` saved at global setup using existing seeded users                                                                                     | testuser primary, alice as cross-user, carol as third. No new seed users.                      |
| Suite location               | New top-level `e2e/` workspace                                                                                                                                  | Matches Bruno's sibling pattern; keeps Playwright deps out of client/server.                   |
| Spec organization            | Feature-folders + one journey smoke                                                                                                                             | Mirrors Bruno layout.                                                                          |
| CI integration               | New workflow, non-blocking initially → blocking after 14 consecutive green main runs                                                                            | Flaky E2E suites that block PRs poison adoption.                                               |
| Selector convention          | `data-testid` only for selection (kebab-case, role-suffixed for interactive); content assertions may use `toContainText`. Selectors sharded per feature folder. | Decouples specs from copy/styling; sharded to avoid central-file merge conflicts.              |
| Reset opt-out                | Playwright tag `@no-reset` checked via `testInfo.tags` in `beforeEach`                                                                                          | Documented Playwright pattern; survives without inventing new fixture-option declarations.     |
| Rollout                      | 9 sequential issues filed in advance (1a/1b/1c + 2..7 + polish)                                                                                                 | Reviewable PR cadence; foundation split into three independently reviewable PRs.               |
| Visual regression            | Out of scope                                                                                                                                                    | Explicit choice — feature-complete level B, not exhaustive level C.                            |

## Architecture

### Three-layer test pyramid (after this lands)

```
       ┌────────────────────────────────────────┐
       │   Playwright (new) — UI behavior        │
       │   ~135 specs · feature-complete         │
       │   Real stack + mock LLM + reset gate    │
       ├────────────────────────────────────────┤
       │   Bruno — HTTP API contracts            │
       │   Status-code-per-endpoint              │
       ├────────────────────────────────────────┤
       │   Vitest — unit / component             │
       │   100% lines / branches / functions     │
       └────────────────────────────────────────┘
```

No layer overlaps. Bruno asserts API contracts, Playwright asserts UI behavior on top of those contracts, Vitest asserts implementation details.

### Stack under test

```
                  ┌─────────────────────────┐
                  │  Playwright runner      │
                  │  (4 parallel workers in CI)
                  └────────────┬────────────┘
                               │ HTTP/1.1
                               ▼
              ┌────────────────────────────────────┐
              │  Vue/Vite preview on :3000         │
              └────────────────┬───────────────────┘
                               │ /api/*
                               ▼
              ┌────────────────────────────────────┐
              │  Fastify on :3001                  │
              │   ENABLE_TEST_ROUTES=1              │
              │   LLM_PROVIDER=mock                 │
              │   ├─ /api/* (real routes)          │
              │   ├─ /api/__test__/reset (gated)   │
              │   └─ Mock LangChain BaseChatModel  │
              └─────┬─────────────┬────────────────┘
                    │             │
              ┌─────▼─────┐ ┌─────▼─────┐
              │ Postgres  │ │  MinIO    │
              │ (seeded)  │ │  (S3)     │
              └───────────┘ └───────────┘
```

External services that exist in production but are stubbed/mocked here:

- **OpenAI / Ollama / Vertex** → `LLM_PROVIDER=mock`, deterministic SSE chunks per `X-Mock-Script` request header.
- **Google OAuth** → unchanged 501/401 stub state.

## Server-side additions

Three new files plus modifications. All gated by environment allowlists. Production fail-fasts ensure none can ship live.

### 1. Mock LangChain provider

**File:** `packages/server/src/plugins/langchain/mock-provider.ts` (new)
**Co-located with:** existing `provider.ts` (the real-provider switch)
**Shape:** A class extending LangChain's `BaseChatModel` that overrides `_streamResponseChunks(messages, options, runManager)` to emit scripted chunks and `_llmType()` to return `'mock'`.
**Script selection:** Uses Node's `AsyncLocalStorage` to thread the `X-Mock-Script` header from the request through to the model's `_streamResponseChunks` method without breaking the existing `cachedModel` singleton in `index.ts`.

```ts
// Approximate shape — full implementation in TDD step
import { AsyncLocalStorage } from 'node:async_hooks';
import {
  BaseChatModel,
  type BaseChatModelParams,
} from '@langchain/core/language_models/chat_models';
import { AIMessageChunk } from '@langchain/core/messages';
import type { ChatGenerationChunk } from '@langchain/core/outputs';
import { mockScripts, DEFAULT_SCRIPT_KEY } from './mock-scripts.js';

export const mockScriptStorage = new AsyncLocalStorage<string>();

export class ChatMock extends BaseChatModel<BaseChatModelParams> {
  _llmType(): string {
    return 'mock';
  }

  async *_streamResponseChunks(): AsyncGenerator<ChatGenerationChunk> {
    const key = mockScriptStorage.getStore() ?? DEFAULT_SCRIPT_KEY;
    const chunks = mockScripts[key] ?? mockScripts[DEFAULT_SCRIPT_KEY];
    for (const text of chunks) {
      yield { text, message: new AIMessageChunk({ content: text }) } as ChatGenerationChunk;
    }
  }

  async _generate() {
    throw new Error('mock provider only supports streaming');
  }
}
```

A new `mockScriptHeaderHook` in `index.ts` reads `X-Mock-Script` from the incoming request (when `LLM_PROVIDER=mock`) and runs the request handler inside `mockScriptStorage.run(value, () => …)` so any downstream `_streamResponseChunks` call sees the per-request script. The `cachedModel` singleton survives unchanged.

`createChatModel()` in `provider.ts` adds a fourth case:

```ts
case 'mock':
  if (process.env.NODE_ENV === 'production') {
    throw new Error('LLM_PROVIDER=mock refused in production');
  }
  return new ChatMock({}) as unknown as BaseChatModel;
```

**Mock script registry:** `packages/server/src/plugins/langchain/mock-scripts.ts` (new). Hardcoded in-source object — no filesystem reads, no user-supplied keys. Unknown keys silently fall back to `DEFAULT_SCRIPT_KEY` rather than throwing (so a typo in a test doesn't 500 the request).

```ts
export const DEFAULT_SCRIPT_KEY = 'default';
export const mockScripts: Record<string, string[]> = {
  default: ['Hello', ' world', '[done]'],
  'autocomplete-typescript-react': [
    'export const Button = ({ ',
    'children, onClick }: Props) => (',
    '\n  <button onClick={onClick}>{children}</button>',
    '\n);',
    '[done]',
  ],
  'generate-readme-short': ['# README\n', '\n', 'TODO: write content.', '[done]'],
  'error-rate-limit': ['[error:rate_limit]'],
  // …additional named scripts
};
```

A shared TypeScript type for the script keys is exported from `packages/shared/src/llm/mock-scripts.ts` so e2e fixtures can reference it without a typo silently falling back. The fixture wraps `setExtraHTTPHeaders({ 'X-Mock-Script': key })` with the typed key.

**Side benefit:** the open Bruno CI gap on `ai/complete.bru` (which currently requires `OPENAI_API_KEY` in workflow secrets) closes — the workflow gets `LLM_PROVIDER=mock` and the `.bru` test asserts deterministic mock output. **Behavior change:** the Bruno test no longer asserts against a real LLM; it asserts the mock provider's deterministic SSE shape. Local devs who want to test against a real provider continue to set `LLM_PROVIDER=openai` etc. The Bruno README's troubleshooting note is updated in the foundation PR.

### 2. Test reset endpoint

**File:** `packages/server/src/routes/__test__.ts` (new)
**Mounted only when** `ENABLE_TEST_ROUTES=1` AND `NODE_ENV` is `development` or `test` (allowlist).

```
POST /api/__test__/reset
  Headers: X-E2E-Secret: <per-boot random token>
  Body:    none
  Action:  executes the contents of scripts/seed.sql against the configured DATABASE_URL
  Idempotent. ~200ms typical.
```

#### Defense-in-depth gating

Layered checks, in order. Failure of any layer means the route is not reachable:

1. **Boot fail-fast** in `packages/server/src/server.ts` (top of file, before `buildApp()`):
   - If `NODE_ENV === 'production'` AND any of `ENABLE_TEST_ROUTES=1` / `LLM_PROVIDER=mock` / `E2E_MODE=1` is set → `process.exit(1)` with an explanatory message. (Allowlist semantics: anything other than `development` / `test` is treated as production-equivalent.)
   - `server.ts` is already in `vitest.config.ts` `exclude`, so this guard does not need 100% coverage. The factored helper `assertProductionGuards(env)` lives in `packages/server/src/lib/env-guards.ts` (covered by Vitest unit tests at 100%).
2. **Strict env parsing.** All flags accepted only as the literal string `'1'` after `.trim()`. Helper `isE2EFlagSet(value: string | undefined): boolean`. Centralized in `env-guards.ts`.
3. **Bind-address guard** in the route plugin: if `process.env.HOST` is anything other than `127.0.0.1` / `localhost` / `::1` AND `process.env.CI !== 'true'`, refuse to register and emit a startup warning. (CI runners bind to `0.0.0.0` by default, so the CI escape hatch is required.)
4. **Route-registration gate.** `__test__.ts` exports a function `registerTestRoutes(app)` that returns immediately without registering if any of the above checks fail. The function is only ever called from `app.ts` inside an `if (isE2EFlagSet(process.env.ENABLE_TEST_ROUTES))` block.
5. **Per-request shared-secret check.** Every request to `/api/__test__/reset` requires header `X-E2E-Secret: <token>`. The token is generated at boot via `crypto.randomBytes(32).toString('hex')` and written to `process.env.RUNNER_TEMP/forge-e2e-secret` (or `os.tmpdir()/forge-e2e-secret` locally). The Playwright `support/server-lifecycle.ts` reads it back and sets it on the test fixture's request context. Mismatch → 403.
6. **Origin/CORS check.** The route plugin rejects any request with an `Origin` header (browser-originated) — only same-process / curl / non-browser callers are allowed. Defeats the CSRF-from-malicious-tab scenario.

Why three flags (`E2E_MODE`, `ENABLE_TEST_ROUTES`, `LLM_PROVIDER=mock`) instead of one? Each gates a distinct concern. `E2E_MODE` is for the Playwright runner to know it's running against a test rig (used in fixtures). `ENABLE_TEST_ROUTES` is the privileged flag that mounts the destructive endpoint. `LLM_PROVIDER=mock` is the existing provider knob. Decoupling means an operator can run "mock LLM in staging" without inadvertently exposing the reset endpoint.

#### Implementation: shells out to seed.sql

The handler executes `scripts/seed.sql` against the configured `DATABASE_URL` rather than maintaining a parallel TRUNCATE list:

```ts
// Pseudocode
import { readFile } from 'node:fs/promises';
const seedSql = await readFile('scripts/seed.sql', 'utf8');
await app.pg.query(seedSql);
```

This guarantees the reset endpoint's contract == seed.sql's contract. No drift. (If `seed.sql` adds a table tomorrow, reset includes it automatically.) MinIO state is NOT reset by this — the design accepts that orphaned objects remain across tests; specs that assert MinIO bucket state must use unique file names per test (documented in `e2e/README.md`).

#### Concurrency

The reset endpoint takes a Postgres advisory lock (`pg_advisory_lock(0xE2E_RESET)`) before executing the seed and releases it after. With `workers: 4`, four concurrent reset calls serialize on the lock; total cost across a `beforeEach` cohort is ~200ms × 4 = ~800ms in the worst case. This trades parallelism for correctness — a worker's `beforeEach` cannot run while another worker is mid-reset, eliminating the race where one worker's TRUNCATE wipes another's in-flight test data.

### 3. Seed-script production guard

**File:** `packages/server/scripts/seed-guard.ts` (new) called from `npm run seed`.

The current `seed` script is `psql $DATABASE_URL -f ../../scripts/seed.sql`. This becomes a small Node wrapper that:

1. Parses `DATABASE_URL`, refuses to proceed unless host is `localhost`, `127.0.0.1`, `::1`, or matches `host.docker.internal` (CI containers).
2. Allows override via `ALLOW_DESTRUCTIVE_SEED=1` for explicit ops use.
3. Then shells out to `psql`.

Vitest unit tests cover the URL-parsing branches at 100%.

### 4. Coverage strategy (explicit)

| File                                                                    | Coverage approach                                                                                                                                   |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/server/src/plugins/langchain/mock-provider.ts`                | Vitest unit tests covering: each script key in registry, default fallback, AsyncLocalStorage threading, the `_generate()` throw.                    |
| `packages/server/src/plugins/langchain/mock-scripts.ts`                 | Vitest unit tests asserting the registry shape and DEFAULT_SCRIPT_KEY existence.                                                                    |
| `packages/server/src/plugins/langchain/provider.ts` (`mock` case added) | Existing test pattern extended; mock case + production-throw branch covered.                                                                        |
| `packages/server/src/plugins/langchain/index.ts` (mockScriptHeaderHook) | Vitest unit tests with mock Fastify request.                                                                                                        |
| `packages/server/src/routes/__test__.ts`                                | Vitest unit tests calling `registerTestRoutes(app)` directly with a Fastify test instance; covers all gating branches and the secret-mismatch path. |
| `packages/server/src/lib/env-guards.ts`                                 | Vitest unit tests covering `isE2EFlagSet`, `assertProductionGuards`, all env-string variants.                                                       |
| `packages/server/scripts/seed-guard.ts`                                 | Vitest unit tests covering URL host parsing branches.                                                                                               |
| `packages/server/src/server.ts`                                         | Already in `vitest.config.ts` exclude list; the boot guard delegates to `assertProductionGuards()` (covered separately).                            |
| `e2e/**`                                                                | Already excluded by `vitest.config.ts` `coverage.include` (which globs only `packages/*/src/**`). No change needed.                                 |
| `packages/shared/src/llm/mock-scripts.ts` (the type-only shared key)    | Type-only file; either a `.d.ts` (type-only files are excluded) or a small re-export covered by an explicit type test.                              |

## E2E suite scaffolding

### Directory layout

```
e2e/                                # new top-level workspace (added to root package.json workspaces)
├── README.md                       # conventions + commands (mirrors bruno/README.md)
├── package.json                    # @forge/e2e — declares Playwright deps
├── playwright.config.ts            # workers: 4 in CI, projects, reporters, webServer
├── tsconfig.json                   # extends ../tsconfig.base.json
├── .auth/                          # gitignored — storageState files (see security note below)
├── fixtures/
│   ├── auth.ts                     # test extension: { testuser, alice, carol }
│   ├── reset.ts                    # auto-applied beforeEach reset (skip via @no-reset tag)
│   ├── mock-llm.ts                 # X-Mock-Script header helpers, typed against shared registry
│   ├── network-faults.ts           # opt-in route mocks for explicit failure-mode tests
│   └── selectors/                  # SHARDED registry, one file per feature folder
│       ├── shell.ts                # cross-cutting selectors: nav, error toast, modals
│       ├── auth.ts
│       ├── posts.ts
│       ├── comments.ts
│       └── …                       # one per spec folder
├── support/
│   ├── global-setup.ts             # logs in 3 users via API, saves storageState; reads X-E2E-Secret
│   ├── global-teardown.ts          # placeholder for v1
│   ├── server-lifecycle.ts         # starts server with the right env if not already running
│   └── wait-for-stack.ts           # polls /api/health, MinIO, Vite preview
└── specs/
    ├── _journey.spec.ts            # cross-cutting smoke (test.describe.serial blocks per phase)
    ├── auth/                       # ~14 specs
    ├── posts/                      # ~22 specs
    ├── revisions/                  # ~10 specs
    ├── comments/                   # ~14 specs
    ├── voting/                     #  ~7 specs
    ├── bookmarks/                  #  ~5 specs
    ├── tags/                       #  ~9 specs
    ├── search/                     # ~12 specs
    ├── playground/                 # ~10 specs
    ├── files/                      # ~11 specs
    ├── ai/                         #  ~8 specs
    └── shell/                      # ~12 specs
```

### Workspace wiring (concrete)

- Root `package.json` `workspaces` array gets `'e2e'` appended.
- `vitest.workspace.ts` is **NOT** modified — `e2e/` does not contain Vitest tests; adding it would cause Vitest to attempt discovery of `*.spec.ts` files.
- `vitest.config.ts` `coverage.include` already globs only `packages/*/src/**` so `e2e/**` is automatically excluded from coverage scope. No change needed.
- `tsconfig.base.json` has no `references`; `e2e/tsconfig.json` simply `extends: '../tsconfig.base.json'` so strict-mode rules apply to spec code.

### Playwright config highlights

- `workers: process.env.CI ? 4 : undefined`. CI is capped at 4 to keep DB load predictable; local defaults to Playwright's half-cores heuristic for developer-experience speed.
- `fullyParallel: false` at project level — within a worker, specs run sequentially. Cross-worker isolation is handled by the Postgres advisory lock in the reset endpoint (Section 2 above).
- Projects: `chromium-desktop` only at v1. `webkit-desktop` and `chromium-mobile` deferred to issue #8.
- `reporter: [['html', { open: 'never' }], ['list'], ['github']]` — GitHub reporter annotates PR check output.
- `webServer` block managed by `support/server-lifecycle.ts`: starts server with `ENABLE_TEST_ROUTES=1 LLM_PROVIDER=mock E2E_MODE=1` and Vite preview if not already running. `reuseExistingServer: !process.env.CI`.
- **Startup probe.** `server-lifecycle.ts` hits `/api/__test__/reset` once (with the secret header) and aborts the run with a clear error if it 404s — saves the "engineer ran `npm run dev` without the env flag" debugging loop.
- **Artifact retention.** `playwright-report/` uploaded as artifact with `retention-days: 14` during non-blocking phase, bumped to 30 once blocking.
- **PR comment with report link.** Workflow appends a PR comment linking to the artifact when E2E fails (so reviewers don't have to navigate Actions → run → artifacts manually).

### Auth fixture pattern

Three users from the existing seed.sql (no new users added):

| Fixture    | Seed user              | UUID            | Use                                                                                                   |
| ---------- | ---------------------- | --------------- | ----------------------------------------------------------------------------------------------------- |
| `testuser` | `testuser@example.com` | `a0000000-…-99` | Primary actor (matches Bruno bootstrap).                                                              |
| `alice`    | `alice@example.com`    | `a0000000-…-01` | Cross-user permission tests (other-user posts, etc.).                                                 |
| `carol`    | `carol@example.com`    | `a0000000-…-03` | Third-party in 3-actor flows (e.g., comment thread with replies from multiple users). Used sparingly. |

```ts
// fixtures/auth.ts
export const test = base.extend<{ testuser: Page; alice: Page; carol: Page }>({
  testuser: async ({ browser }, use) => {
    const ctx = await browser.newContext({ storageState: '.auth/testuser.json' });
    await use(await ctx.newPage());
    await ctx.close();
  },
  // … same for alice, carol
});
```

Specs that need a logged-in user write `test('thing', async ({ testuser }) => { … })` — zero per-test login overhead. Specs with multiple actors write `test('cross-user', async ({ testuser, alice }) => { … })` — both pages live in separate contexts with separate cookies.

`__test__/reset` re-runs `seed.sql` which re-inserts the same user rows with the same UUIDs and password hashes. JWTs in the saved storageState remain valid because the `users` row is recreated identically.

`adminuser` is **not** added in v1. When the first admin-gated feature ships, the seed user and the auth fixture entry are added in that feature's PR.

### Reset fixture pattern

```ts
// fixtures/reset.ts — auto-applied via test.beforeEach in project config
test.beforeEach(async ({ request }, testInfo) => {
  if (testInfo.tags.includes('@no-reset')) return;
  await request.post(`${API_URL}/api/__test__/reset`, {
    headers: { 'X-E2E-Secret': process.env.E2E_SECRET ?? '' },
  });
});
```

Specs opt out via Playwright's tag mechanism: `test('register fresh account', { tag: '@no-reset' }, async () => { … })`. This is documented in Playwright's API and survives without inventing a new fixture-option declaration.

### Storage state file location

`.auth/*.json` is **gitignored**, but the design also writes the files to `os.tmpdir()` rather than the repo by default. The repo-relative `.auth/` directory is used only when `E2E_STORAGE_IN_REPO=1` is set (developer convenience for trace inspection). This eliminates the "engineer accidentally commits auth state" risk class. `e2e/README.md` carries an explicit security note. A pre-commit hook (in the project's existing `.husky/`) refuses to stage any `*.auth.json` or `e2e-secret` file as a backstop.

### Selector convention

#### Naming

- **Interactive elements**: kebab-case + role suffix (`reply-btn`, `cancel-btn`, `tag-input`, `dark-mode-toggle`, `nav-search-link`).
- **Content / state elements**: bare kebab nouns (`error-message`, `empty-state`, `post-title`, `comment-thread`).
- This matches the most common existing pattern (`reply-btn`, `cancel-btn`, `restore-confirm`, `search-close-btn`) while allowing short content-only nouns. Documented in `e2e/README.md`. PR reviewers enforce.

#### Sharded registry

ALL specs reference elements by `data-testid` attributes resolved through `fixtures/selectors/<feature>.ts`. One file per feature folder + a `shell.ts` for cross-cutting selectors (nav, error toast, modals). Issue #2 (posts) only modifies `selectors/posts.ts` and `selectors/shell.ts` (if a new shared selector is needed). Issue #3 only modifies its own files. Merge conflicts are local to the feature.

#### Selection vs assertion

- **Selection** (locating, clicking): MUST use `getByTestId(...)` from the sharded registry. No CSS, no text-matching for click targets.
- **Content assertion**: `expect(locator).toContainText('Welcome back')` is allowed and encouraged for asserting UI copy against fixture/canonical strings. Documented as the rule in `e2e/README.md`.

### Test-author conventions

Documented in `e2e/README.md`:

1. **One assertion concept per spec.** A spec called "voting → upvote increments score" asserts the score change, not also the button color.
2. **No conditional assertions.** No `if (await locator.isVisible()) { expect(…) }`. The test knows what state the app should be in.
3. **Network discipline.** Tests hit the real (mocked-LLM) backend by default. Route mocking is reserved for tests asserting a specific failure mode. All such mocks live in `fixtures/network-faults.ts`, organized by feature.
4. **Mock LLM script discipline.** Tests using AI features set `X-Mock-Script` via the typed `mock-llm.ts` helper, never depending on the default. The default exists for the dev experience, not test determinism.
5. **No `waitForTimeout`.** Auto-waiting on locators or `waitForResponse` only.
6. **Fixture data is canonical.** Tests assert against the seeded post/comment/revision text — never invent expected text.
7. **No retries-as-bandaid.** A spec failing twice in CI gets `test.fixme()` with a tracking issue link, not a retry count.
8. **Folder boundary.** Inline comment on a revision diff line lives in `comments/` (it's a comment feature). Diff-rendering correctness lives in `revisions/`. When in doubt, owner is the deeper feature surface. Documented per-spec ambiguities in `e2e/README.md` decision log.

## Coverage matrix

Target ~135 specs. Counts are per-folder ±15% (not just total) to avoid one folder ballooning while another atrophies.

| Folder             | Specs                                   | Coverage focus                                                                                                                                                                                                                                                                                                                         |
| ------------------ | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `_journey.spec.ts` | 1 spec, 6 `test.describe.serial` blocks | register → login → create draft → AI autocomplete → upload file → publish → search → vote → bookmark → comment inline → fork → diff → logout → relogin as alice → permission denied → done. Phased blocks make traces easier to debug.                                                                                                 |
| `auth/`            | ~14                                     | login (success / wrong-password / unknown-email / empty / redirect-after), register (success / duplicate-email / weak-password / email-validation), logout, session refresh, OAuth-stub flow (asserts the 501 toast and the link page's 401 message — concrete, not hand-wavy), account-link page, redirect-when-authenticated guards. |
| `posts/`           | ~22                                     | new (draft saves, required fields, markdown renders), view (public, draft-private, missing-id, permission), edit (own, cannot-edit-others, persists, cancel), delete (confirm, own-only, cascade), publish toggle, fork (creates linked copy, edits independent), multi-file post upload + preview, tags add/remove.                   |
| `revisions/`       | ~10                                     | create (auto-on-edit, manual), list (chronological, empty), view-by-number, side-by-side diff, inline diff, rollback, permission.                                                                                                                                                                                                      |
| `comments/`        | ~14                                     | top-level / reply / nested-reply / inline-on-revision-line, edit (own only, edit window), delete (own only), empty state, comment-on-deleted-post, mention notifications if implemented.                                                                                                                                               |
| `voting/`          | ~7                                      | upvote, downvote, switch, remove, score updates in feed/post-view, error-path (already voted), permission.                                                                                                                                                                                                                             |
| `bookmarks/`       | ~5                                      | toggle on/off, bookmarks page list, empty state, persists across sessions.                                                                                                                                                                                                                                                             |
| `tags/`            | ~9                                      | popular-tags render, subscribe / unsubscribe, subscribed-tag-feed filter, tag page, my-subscriptions list, click-tag-from-post, search-by-tag.                                                                                                                                                                                         |
| `search/`          | ~12                                     | plain query, no-results, fuzzy match, AI-search toggle, structured filters (tag / author / date / type), result click, Cmd+K, pagination, recent searches.                                                                                                                                                                             |
| `playground/`      | ~10                                     | open prompt, fill template variables, run (SSE streams), copy-to-clipboard, variable validation, save-as-fork, missing-variable error, mock-script selection.                                                                                                                                                                          |
| `files/`           | ~11                                     | drag-drop upload, picker upload, multi-file, preview (json / yaml / md / code / image), download, replace, remove, oversize rejection, mime rejection, in-post rendering.                                                                                                                                                              |
| `ai/`              | ~8                                      | autocomplete (token-typing, accept, dismiss), generate-from-prompt, error during stream, mid-stream cancel, mock-script selection per test, streaming UI states.                                                                                                                                                                       |
| `shell/`           | ~12                                     | top nav, sidebar nav, dark-mode persists, keyboard shortcuts (Cmd+K, n, /, ?), error toast on 5xx, error boundary, 404 page, 401 redirects, breadcrumbs, mobile responsive smoke.                                                                                                                                                      |
| **Total**          | **~135**                                |                                                                                                                                                                                                                                                                                                                                        |

### Runtime budget

Soft target: **CI suite < 10 minutes wall-clock at 4 workers** for the full 135-spec run after foundation. Foundation PR (issue #1c, ~14 auth specs + journey smoke) target < 3 minutes. Each per-issue DoD checks the run-time delta does not push the total over the soft cap; if it does, the issue's specs need shrinking or splitting.

## CI integration

### New workflow: `.github/workflows/e2e-playwright.yml`

```
Job: e2e
  Triggered on:
    - pull_request          (NOT pull_request_target — secrets and write tokens stay scoped)
    - push to main
  Runs on: ubuntu-latest
  Env at job level:
    ENABLE_TEST_ROUTES: '1'
    LLM_PROVIDER: 'mock'
    E2E_MODE: '1'
    NODE_ENV: 'test'
    CI: 'true'
  Steps:
    1.  Checkout
    2.  Setup Node 20 + npm cache
    3.  docker compose up -d postgres minio
    4.  Wait for /health on postgres + minio
    5.  npm ci
    6.  Build packages/shared
    7.  Run migrations + seed
    8.  Build client for production (vite build)
    9.  Start server in background; secret written to RUNNER_TEMP/forge-e2e-secret
   10.  Start client preview server in background
   11.  Wait for /api/health and Vite preview server
   12.  npx playwright install --with-deps chromium
   13.  npm run e2e -- --reporter=github,html
   14.  Upload playwright-report/ as artifact (always, retention-days: 14 → 30 post-flip)
   15.  Post PR comment with artifact link if status=failure
   16.  Tear down docker compose
  Initially: continue-on-error=true, not a required check.
```

The workflow uses `pull_request` (not `pull_request_target`) — confirmed and called out as a comment in the workflow YAML. This means PRs from forks cannot exploit the test routes against the main repo's secrets, since fork PRs run with `GITHUB_TOKEN` scoped to read-only.

### Stability gate

**Single criterion: 14 consecutive green main-branch runs after foundation merge.** No time-bound OR clause. Tracked via the pinned tracking issue (counter incremented in a comment after each green main run; reset to zero on any red run).

When the counter hits 14:

- Branch protection: workflow becomes a required check.
- `CLAUDE.md` is updated in a follow-up PR (filed by issue #4 or whichever issue is current at the time) to add Playwright as a third blocking gate alongside coverage and Bruno.
- Artifact retention bumps to 30 days.

**Inverse criterion (rollback from blocking → non-blocking):** if the suite has 3 red runs on main within any 7-day window post-flip, the workflow is reverted to non-blocking via PR and the tracking issue's flake-investigation checkbox is opened. Counter resets and the 14-run gate must be cleared again.

### Bruno CI fix

`.github/workflows/bruno-regression.yml` adds `LLM_PROVIDER=mock`, `ENABLE_TEST_ROUTES=1`, `E2E_MODE=1`, `NODE_ENV=test` to the workflow's top-level `env:` block. **Behavior change documented:** `bruno/ai/complete.bru` now asserts the deterministic mock provider's SSE shape rather than against a real OpenAI response. The existing `.bru` assertion is updated in the same PR. `bruno/README.md`'s troubleshooting note about `OPENAI_API_KEY` is replaced with a note explaining the mock-provider behavior. Local devs who want to test against a real provider continue to set their own `LLM_PROVIDER` in `.env`.

This change couples the Bruno CI fix to the foundation #1a PR. If #1a is reverted, Bruno CI reverts with it. Acceptable risk — the alternative (Bruno CI fix in a separate PR) means it can't actually be merged until #1a's mock provider exists.

### Auto-fixme on flake (deferred to polish PR #8)

A post-step parses `playwright-report/results.json`. If a spec fails twice consecutively across CI runs (looked up via GitHub API), it opens a `flaky-e2e`-labeled tracking issue and posts a PR comment suggesting `test.fixme()`. Polish PR #8 also adds a guard step that fails CI if more than N specs are currently `test.fixme()`'d, forcing the team to drain the queue rather than let it grow.

## Rollout phasing — 9 sequential issues

Filed in order via `/metaswarm:create-issue`, each blocked by the previous, sharing the `e2e-rollout` label. The foundation is split into three reviewable PRs (1a/1b/1c) per CTO blocker.

| #   | Title                                                                        | Scope                                                                                                                                                                                                                                            | Specs                | CI                      |
| --- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- | ----------------------- |
| 1a  | Server seams: mock LLM provider + reset endpoint + seed guard + Bruno CI fix | All Server-side additions in this design (mock-provider, mock-scripts, env-guards, `__test__.ts` route, seed-guard, server.ts boot fail-fast, `bruno-regression.yml` env vars, `bruno/ai/complete.bru` assertion update, `bruno/README.md` note) | 0 (no E2E specs yet) | n/a                     |
| 1b  | E2E scaffolding + journey smoke + new CI workflow                            | `e2e/` workspace, Playwright config, fixtures, support, selector shards, `_journey.spec.ts`, the new `e2e-playwright.yml` workflow non-blocking                                                                                                  | ~1 (journey only)    | non-blocking            |
| 1c  | E2E auth specs                                                               | `e2e/specs/auth/` only                                                                                                                                                                                                                           | ~14                  | non-blocking            |
| 2   | E2E posts + revisions                                                        | `posts/` + `revisions/`                                                                                                                                                                                                                          | ~32                  | non-blocking            |
| 3   | E2E comments + voting + bookmarks                                            | three folders                                                                                                                                                                                                                                    | ~26                  | non-blocking            |
| 4   | E2E tags + search                                                            | two folders + flip-to-blocking decision (`CLAUDE.md` update if 14-run gate hit)                                                                                                                                                                  | ~21                  | non-blocking → blocking |
| 5   | E2E playground + AI                                                          | two folders, exercises mock LLM                                                                                                                                                                                                                  | ~18                  | blocking                |
| 6   | E2E files + multi-file posts                                                 | `files/`, MinIO-heavy                                                                                                                                                                                                                            | ~11                  | blocking                |
| 7   | E2E shell + accessibility                                                    | shell folder                                                                                                                                                                                                                                     | ~12                  | blocking                |
| 8   | E2E polish                                                                   | auto-flake-issue tooling, fixme-budget guard, decide on webkit/mobile, doc updates                                                                                                                                                               | 0                    | blocking                |

Plus a **tracking issue** (filed first as `[E2E rollout 0/9] tracking`) acting as the index — links to all 9 sub-issues, the design doc commit SHA, the green-run counter, the flip-to-blocking decision log, and the running spec count.

### Sequencing

- 1b cannot start until 1a is merged (1b's CI workflow depends on the mock provider existing).
- 1c cannot start until 1b is merged (1c's specs need the rig).
- 2 cannot start until 1c is merged.
- 4 is the gate where 14-run criterion is evaluated.
- 5 explicitly requires the mock LLM provider from 1a.
- 8 may run in parallel with 6 or 7 if a separate engineer picks up the polish work — declared as `blocked-by 5` so the orchestrator's BEADS graph permits parallel execution after #5 ships.

### Per-issue template

Each issue follows this structure:

```
Title:        [E2E rollout N/9] <scope>
Labels:       e2e-rollout, e2e
Blocked-by:   #<previous issue> (except #1a)

## Context
Pointer to the design doc section relevant to this PR (link to commit SHA).

## Definition of Done
- [ ] Spec files in e2e/specs/<folders>/ exist and pass
- [ ] Expected spec count: ~N (within ±15% per folder)
- [ ] data-testid added to all touched Vue components (kebab-case naming convention)
- [ ] Selector entries added to the relevant fixtures/selectors/<feature>.ts shard
- [ ] No new flakes (3 consecutive green CI runs on the PR branch)
- [ ] Vitest coverage gate (.coverage-thresholds.json) still passes — ran `npm run test:coverage`
- [ ] Bruno gate still passes — ran `cd bruno && npx @usebruno/cli run -r --env local`
- [ ] CI runtime delta does not push total e2e suite over 10-min cap
- [ ] e2e/README.md updated with any new conventions introduced
- [ ] Closes #<this issue>

## File scope
e2e/specs/<folder>/**
e2e/fixtures/selectors/<feature>.ts
packages/client/src/<components touched for data-testid>**
(no server changes after issue #1a unless explicitly noted)

## Pre-conditions
- Issue #<N-1> merged
- Local: docker compose up -d postgres minio; npm run dev (server + client)
- ENABLE_TEST_ROUTES=1 LLM_PROVIDER=mock E2E_MODE=1 NODE_ENV=test set in .env

## Test commands
npm run e2e
npm run e2e -- --headed       # debug
npm run e2e:ui                # Playwright UI mode
npm run test:coverage         # Vitest coverage gate
cd bruno && npx @usebruno/cli run -r --env local   # Bruno gate

## Expected runtime (filled in per issue)
Local: ~Nm at 4 workers
CI:    ~Nm

## Agent instructions
- Use TDD throughout:
  * For server changes (only #1a has any): write Vitest tests first, watch fail, implement.
  * For E2E specs: write spec first, watch fail, add data-testid + selector entry, watch pass.
- Reference fixtures/auth.ts for logged-in users (testuser/alice/carol)
- Reset is automatic via beforeEach — opt out via test tag '@no-reset' for register-flow tests
- Use fixtures/selectors/<feature>.ts for ALL element references
- Mock LLM script via typed header helper — never depend on default
- DO NOT use --no-verify on commits
- DO NOT force-push
- DO NOT mock at the network layer unless asserting a specific failure mode
- Stay within declared file scope

## Execution-method choice
Per CLAUDE.md, after the agent reads this issue, the orchestrator presents the standard execution choice prompt (orchestrated execution / subagent-driven / parallel session). Default recommendation for these issues is metaswarm orchestrated execution, but the user always confirms.

## Failure modes to watch for
<scope-specific>

## Adversarial review checklist
- All data-testids added are stable identifiers, not DOM-position-coupled
- Naming follows kebab-case + role-suffix convention
- No spec uses waitForTimeout
- No conditional assertions
- All tests pass with workers=1 AND workers=4
- Vitest coverage at 100% for any new server-side code
- Bruno suite still green
```

## Out of scope

- Visual regression / screenshot diffs (explicit choice — feature-complete level B, not exhaustive level C).
- Real OpenAI / Ollama / Vertex calls in CI.
- Real Google OAuth flow (still 501/401 stub state until OAuth is configured).
- Server-side error injection (5xx from real DB) — Bruno's job conceptually.
- Background job / cron behavior — none today.
- Multi-tab / cross-tab sync — defer to a focused issue if it becomes relevant.
- WebKit / mobile browser projects in v1 — decided in polish PR.
- `__test__/seed-extra` ad-hoc fixture endpoint — defer until a test demands it.
- New seeded users (`otheruser`, `adminuser`) — defer; existing seed has alice/carol/bob already.
- MinIO bucket reset — orphaned objects accepted; specs use unique file names per test (documented in README).
- Adding Playwright to the `.coverage-thresholds.json` enforcement command (E2E coverage is a separate gate, independent from line/branch coverage).

## Risks & mitigations

| Risk                                           | Mitigation                                                                                                                                                                                                                  |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reset endpoint accidentally shipped to prod    | Six-layer defense (boot fail-fast on NODE_ENV allowlist, strict env parsing, bind-address guard, route-registration gate, X-E2E-Secret per-request header, Origin/CORS check). Vitest tests assert each gate independently. |
| Seed script run against prod DB                | `seed-guard.ts` refuses non-localhost DATABASE_URL without `ALLOW_DESTRUCTIVE_SEED=1`.                                                                                                                                      |
| `LLM_PROVIDER=mock` in production              | Boot fail-fast + provider-creation throw if NODE_ENV=production.                                                                                                                                                            |
| Mock LLM drift from real provider wire format  | Mock is a `BaseChatModel` impl using LangChain's official chunk types; provider interface enforces parity at TypeScript level. Vitest tests assert the chunk shape.                                                         |
| Storage state JWT leaked via git               | Default location is `os.tmpdir()`; repo location is opt-in via `E2E_STORAGE_IN_REPO=1`. Pre-commit hook refuses to stage `*.auth.json` or `e2e-secret`.                                                                     |
| Worker-collision on shared seed data           | Postgres advisory lock around `seed.sql` execution serializes resets across workers. Worst case ~800ms cumulative wait per `beforeEach` cohort.                                                                             |
| `data-testid` central-registry merge conflicts | Sharded by feature folder; each PR touches only its own shard + (rarely) shell.ts.                                                                                                                                          |
| Foundation PR too large to review              | Split into 1a (server, no specs) / 1b (rig + journey) / 1c (auth specs). Each independently reviewable.                                                                                                                     |
| Bruno CI fix coupling to foundation            | Acceptable: the fix can't exist before the mock provider exists. Documented in the PR description.                                                                                                                          |
| Bruno test contract change (real → mock)       | Documented in PR; `ai/complete.bru` assertion updated explicitly; README troubleshooting note replaced.                                                                                                                     |
| Stability gate gameable                        | Single criterion (14 green main runs); rollback criterion (3 red in 7 days) keeps the loop closed.                                                                                                                          |
| Test routes exploitable from forks via CI      | Workflow uses `pull_request` (not `pull_request_target`); GITHUB_TOKEN scoped read-only for fork PRs.                                                                                                                       |
| `data-testid` naming inconsistency             | Single canonical convention (kebab-case + role suffix for interactive, bare nouns for content) documented in README.                                                                                                        |
| `_journey.spec.ts` failure trace too large     | Phased into `test.describe.serial` blocks per phase (auth, draft, publish, social, fork, permission); failures isolate to a phase.                                                                                          |

## Acceptance criteria for the design

- [x] Coverage depth chosen and bounded (Q1: B / feature-complete).
- [x] External-service strategy chosen (Q2: B / mock at server level).
- [x] DB isolation strategy chosen (Q3: B / reset endpoint, workers capped at 4, advisory lock for cross-worker safety).
- [x] Auth strategy chosen (Q4: D-equivalent / multi-user storageState using existing seed users).
- [x] Suite location, organization, CI integration chosen (Q5: e2e/, feature folders + journey smoke, non-blocking → blocking).
- [x] Rollout phasing chosen (Q6: foundation split 1a/1b/1c, then feature batches in priority order).
- [x] GitHub issues plan: 9 sequential issues + 1 tracking issue, filed via `/metaswarm:create-issue` with full TDD plans and DoDs.
- [x] Codebase-grounded: real LangChain provider shape, real seed.sql truncate behavior, real boot sequence location, real coverage configuration.
- [x] Defense-in-depth on the destructive test endpoint (six layers).
- [x] Coverage strategy concrete per file.
- [x] Test-author DX details (opt-out mechanism, sharded selectors, naming convention, selection-vs-assertion rule).

---

## Amendment 2026-04-29 — Issue #47 scope clarification

Drafted during pre-plan brainstorm for [Issue #47 (E2E posts + revisions)](https://github.com/multiandrewlab/forge/issues/47), after foundation work (#44/#45/#46) shipped to `main`. The original design was committed 2026-04-28 15:44; foundation PR #61 merged 2026-04-29 morning. This section captures drift between the original design's assumptions and the on-disk reality, plus scope decisions made during the brainstorm.

### Drift findings

1. **Foundation already shipped most testids and the posts selector shard.**
   - `e2e/fixtures/selectors/posts.ts` exists with 17 entries (issue #47 says "(new)" — actually "(extend)").
   - `PostEditor.vue` carries `new-post-title-input`, `new-post-save-draft-btn`, `new-post-publish-btn`, `editor-drop-zone`, `new-post-body-editor`, `file-upload-input`, `file-upload-preview`.
   - `PostViewPage.vue` carries `post-title`, `draft-badge`, `published-badge`.
   - `PostEditPage.vue` carries `fork-attribution`, conditional `forbidden-page`.
   - `PostActions.vue` carries `fork-btn`, `upvote-btn`, `vote-score`, `bookmark-toggle-btn`, `bookmark-on-icon`.
   - `PostMetaHeader.vue` carries `fork-attribution`.
   - `PostListItem.vue` carries `fork-count`, `link-icon`.
   - `EditorToolbar.vue` carries `language-select`, `content-type-select`, `visibility-toggle`, `tag-input`, `tag-item`, `tag-remove`.
   - `RevisionDiffViewer.vue` is fully covered (`diff-viewer`, `mode-inline`, `mode-side-by-side`, `diff-added/-removed/-unchanged`, `diff-side-by-side`, `side-left`, `side-right`).
   - `RevisionTimeline.vue` carries `revision-item`, `author-avatar`.
   - `RestoreButton.vue` carries `restore-trigger`, `restore-dialog`, `restore-cancel`, `restore-confirm`.
   - **Implication:** issue #47's "modify ~22 component files for testids" line overstates the work. Real testid additions are small (4 gaps, see below).

2. **Three feature surfaces landed post-design and are visible on every post page.**
   - **Link previews (#6 / PR-merged):** `LinkPreviewCard.vue` with `image-placeholder`, `refresh-preview` testids. Renders on link-type posts.
   - **WASM code execution (#8 / #42):** `CodeRunner.vue`, `RunButton.vue`, `ExecutionOutput.vue` with `code-runner`, `run-play`, `run-spinner`, `run-stop`, `execution-output`, `output-line-${i}`, `status-bar`, `clear-button`. Renders on snippet-type posts.
   - **User profiles (#7):** Author avatar/name links to `/users/:id`. Presence indicator (`presence-avatar`, `presence-overflow`) renders on edit page.
   - These are NOT in the original design's coverage matrix or in #47's DoD.

3. **Seed data fixtures are insufficient for several DoD items as written.**
   - Testuser owns only `c0000000-…-000000000099` (public, not draft) with 1 revision (`d…0099`), no votes/bookmarks, 1 comment.
   - DoD items affected: publish-toggle (no testuser draft), revision chronological list (only 1 testuser revision), cascade-delete (sparse artifacts).

### Scope decisions

**Decision A — feature-surface coverage in scope of `posts/`** (chosen during brainstorm).
The three new feature surfaces (link-preview, code-runner, profile-avatar) get full spec coverage inside `posts/`. Rationale: they're rendered on every post page; specs that exercise post pages need to assert their presence/absence and basic correctness rather than ignore them.

**Decision B — hybrid seed strategy** (chosen during brainstorm; aligns with issue #47's own guidance).
Extend `scripts/seed.sql` for _fixed_ read fixtures shared across multiple specs. Use `createdPostId` (API-driven `beforeEach` setup) for mutation specs. Avoids per-spec seed dependencies for mutations and keeps seed deterministic for reads.

### Updated coverage matrix for #47

| Folder        | Spec count | Delta vs. original       | Sub-coverage                                                             |
| ------------- | ---------- | ------------------------ | ------------------------------------------------------------------------ |
| `posts/`      | ~28–30     | +6–7                     | original 22 + link-preview (~2) + code-runner (~2) + profile-avatar (~2) |
| `revisions/`  | ~10        | unchanged                | per original DoD                                                         |
| **Total #47** | **~38–40** | **+6–8 vs. original 32** |                                                                          |

### Seed data additions

Append to `scripts/seed.sql` (additive only — no existing rows mutated, preserving Bruno fixture invariants):

- **`c0000000-0000-0000-0000-000000000098`** — testuser draft snippet (typescript, public, `is_draft=true`) for publish-toggle specs.
- **`d0000000-0000-0000-0000-000000000098`** — initial revision of `c…0098`.
- **2 extra revisions on `c…0099`** (revision_number 2 and 3, both testuser-authored) → 3 revisions total for chronological-list / view-by-number / diff specs.
- **1 vote on `c…0099` from alice** (`value=1`) — for cascade-delete observability.
- **1 bookmark on `c…0099` from alice** — for cascade-delete observability.

### Component testid gaps (TDD-driven during spec implementation)

Per #47's agent instructions ("write spec, watch fail, add testid + selector, watch pass"), these get added as specs require them, not upfront:

- `post-delete-btn` + delete confirmation dialog (`post-delete-confirm`, `post-delete-cancel`) — likely in `PostMetaHeader.vue` or a new `DeletePostDialog.vue`.
- `post-cancel-btn` for editor discard/cancel — likely in `PostEditor.vue`.
- `tag-link` for tag chips on `PostViewPage.vue` (distinct from `tag-item` which is the editor-toolbar chip).
- Page-level testid on `PostHistoryPage.vue` (e.g., `post-history-page`) for navigation assertions.

### Selector shard plan

**`e2e/fixtures/selectors/posts.ts` — extend** (not new):
Add `postDeleteBtn`, `postDeleteConfirm`, `postDeleteCancel`, `postCancelBtn`, `tagLink`, `linkPreviewCard`, `linkPreviewRefresh`, `codeRunner`, `runPlay`, `runStop`, `executionOutput`, `clearOutputBtn`, `authorAvatar`, `presenceAvatar`.

**`e2e/fixtures/selectors/revisions.ts` — new shard:**
Mostly aliases to existing testids in `components/history/*` (`revisionItem`, `modeInline`, `modeSideBySide`, `diffAdded`, `diffRemoved`, `diffUnchanged`, `restoreTrigger`, `restoreConfirm`, `restoreCancel`, `restoreDialog`).

### File scope amendment

| Original (issue #47 text)                   | Amended (reality)                                                    |
| ------------------------------------------- | -------------------------------------------------------------------- |
| `e2e/fixtures/selectors/posts.ts` (new)     | extend                                                               |
| `e2e/fixtures/selectors/revisions.ts` (new) | new (unchanged)                                                      |
| `PostNewPage.vue` (modify – testid)         | likely no change                                                     |
| `PostViewPage.vue` (modify – testid)        | modify (`tag-link`)                                                  |
| `PostEditPage.vue` (modify – testid)        | likely no change                                                     |
| `PostHistoryPage.vue` (modify – testid)     | modify (page-level testid)                                           |
| `components/post/**` (modify – testid)      | modify only `PostMetaHeader.vue` (`post-delete-btn` + dialog wiring) |
| `components/editor/**` (modify – testid)    | modify only `PostEditor.vue` (`post-cancel-btn`)                     |
| `components/history/**` (modify – testid)   | likely no change                                                     |
| **Added**                                   | `scripts/seed.sql` (extend, additive)                                |

### Risks & mitigations (additions)

| Risk                                                                        | Mitigation                                                                                                                                                                                                |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spec count climbs past +20% from original 32 (now 38–40)                    | Plan-review-gate flags scope; if reviewer escalates, split feature-surface specs (link-preview / code-runner / profile-avatar) into a follow-up issue and revert `posts/` to ~22.                         |
| Seed extension breaks Bruno fixture invariants                              | Additive-only: testuser's `c…0099` keeps its current author/visibility/draft/title; new revisions/vote/bookmark don't change Bruno's existing reads. New `c…0098` is a separate post Bruno doesn't query. |
| `createdPostId` setup steps make specs slow                                 | Use `request` fixture for direct API calls (no UI), parallelize with `workers: 4`; runtime budget per design (4 min local for both folders) still applies.                                                |
| Feature-surface specs duplicate coverage that later rollout issues will own | This is intentional for #47 — verify presence/basic behavior on post pages now; deeper coverage (e.g., link-preview SSRF blocking, code-runner sandbox isolation) lives in their own rollout folders.     |

### Acceptance for the amendment

- [x] Drift findings documented with concrete file paths.
- [x] Both scope decisions (A: feature surfaces; B: hybrid seed) recorded with rationale.
- [x] Updated coverage matrix and seed additions concrete enough to plan against.
- [x] File scope re-aligned to reality.
- [x] Risks specific to the amended scope captured.
