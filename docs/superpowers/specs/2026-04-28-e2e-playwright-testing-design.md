# E2E Playwright Testing — Design

**Date:** 2026-04-28
**Status:** Draft (pending design review gate)
**Scope:** Add full feature-complete E2E coverage of the Forge web application using Playwright, building on the existing Bruno seeded-fixture infrastructure.

## Overview

Forge currently has two test layers: Vitest at 100% line/branch coverage (unit & component) and Bruno enforcing status-code-per-endpoint at the HTTP boundary. There is no automated coverage of UI behavior, router transitions, store reactivity, SSE rendering, or integration glue between client + server + storage.

This design adds a third layer — Playwright — sized at ~135 specs across 12 feature folders plus a cross-cutting journey smoke. The suite drives a real Forge stack (Postgres + MinIO via docker-compose, Fastify, Vue/Vite) with two minimal server seams gated by `E2E_MODE=1`: a deterministic mock LLM provider and a `__test__/reset` endpoint that re-applies `scripts/seed.sql`. Bruno's seeded fixtures are reused as-is plus two additional seeded users (`otheruser` for permission tests, `adminuser` reserved for future admin-gated features).

The suite is delivered as 8 sequential GitHub issues (1 foundation + 6 feature batches + 1 polish), each filed in advance with full TDD plans, acceptance criteria, and agent instructions. CI starts non-blocking and flips to blocking after a stability gate (14 consecutive green runs on `main`, or 7 days, whichever comes first).

## Design Decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Coverage depth | Feature-complete (~100–200 specs) | Bruno already covers API status codes; Playwright targets UI behavior the API layer can't see. |
| External LLM | Mock at server level via new `LLM_PROVIDER=mock` | Solves the Bruno CI `OPENAI_API_KEY` gap as a side benefit; one mechanism instead of per-test route mocks. |
| External Postgres / MinIO | Real, via docker-compose | Already deterministic, already wired in Bruno. |
| External OAuth | Tested in current 501/401 stub state | No real Google credentials in CI; production OAuth flow tested manually until configured. |
| DB isolation | `POST /api/__test__/reset` in `beforeEach`, workers capped at 4 | Simplest mental model; 30 lines of code; reuses `scripts/seed.sql` directly. |
| Auth strategy | Multi-user `storageState` saved at global setup | testuser + otheruser (and a reserved adminuser slot) preloaded; no per-test login overhead. |
| Suite location | New top-level `e2e/` workspace | Matches Bruno's sibling pattern; keeps Playwright deps out of client/server. |
| Spec organization | Feature-folders + one journey smoke | Mirrors Bruno layout; the smoke is the canary that proves the rig works end-to-end. |
| CI integration | New workflow, non-blocking initially → blocking after stability gate | Flaky E2E suites that block PRs poison adoption. |
| Selector convention | `data-testid` attributes only, resolved via `fixtures/selectors.ts` | Decouples specs from copy and styling; survives dark-mode, future i18n. |
| Rollout | 8 sequential issues filed in advance | Predictable, reviewable PR cadence; foundation stable before content arrives. |
| Visual regression | Out of scope | Explicit choice — feature-complete level B, not exhaustive level C. |

## Architecture

### Three-layer test pyramid (after this lands)

```
       ┌────────────────────────────────────────┐
       │   Playwright (new) — UI behavior       │
       │   ~135 specs · feature-complete         │
       │   Real stack + mock LLM + reset gate    │
       ├────────────────────────────────────────┤
       │   Bruno — HTTP API contracts           │
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
                  │  (4 parallel workers)   │
                  └────────────┬────────────┘
                               │ HTTP/1.1
                               ▼
              ┌────────────────────────────────────┐
              │  Vue/Vite client on :3000          │
              └────────────────┬───────────────────┘
                               │ /api/*
                               ▼
              ┌────────────────────────────────────┐
              │  Fastify on :3001                  │
              │   E2E_MODE=1                       │
              │   ├─ /api/* (real routes)          │
              │   ├─ /api/__test__/reset (gated)   │
              │   └─ LLM_PROVIDER=mock             │
              └─────┬─────────────┬────────────────┘
                    │             │
              ┌─────▼─────┐ ┌─────▼─────┐
              │ Postgres  │ │  MinIO    │
              │ (seeded)  │ │  (S3)     │
              └───────────┘ └───────────┘
```

External services that exist in production but are stubbed/mocked here:
- **OpenAI / Ollama** → `LLM_PROVIDER=mock`, deterministic SSE chunks per `X-Mock-Script` header.
- **Google OAuth** → unchanged 501/401 stub state.

## Server-side additions

All gated by `E2E_MODE=1`. No-op in production builds.

### Mock LLM provider

**File:** `packages/server/src/services/llm/mock-provider.ts` (new)
**Interface:** Same as existing `OpenAIProvider` / `OllamaProvider`.
**Activation:** `LLM_PROVIDER=mock` selects this provider at boot.

A registry in `packages/server/src/services/llm/mock-scripts.ts` maps `X-Mock-Script` header values to ordered chunk arrays. Selected examples:

```ts
{
  'autocomplete-typescript-react': [
    'export const Button = ({ ',
    'children, onClick }: Props) => (',
    '\n  <button onClick={onClick}>{children}</button>',
    '\n);',
    '[done]',
  ],
  'generate-readme-short': ['# README\n', '\n', 'TODO: write content.', '[done]'],
  'error-rate-limit': ['[error:rate_limit]'],
  'mid-stream-cancel': ['partial ', 'output ', /* never sent */],
}
```

Default fallback (no header): `["// AI suggestion: ", "Hello", " world", "[done]"]`.

**Side benefit:** the open Bruno CI gap on `ai/complete.bru` (which currently requires `OPENAI_API_KEY` in workflow secrets) closes — the workflow gets `LLM_PROVIDER=mock` env vars and the `.bru` test asserts deterministic output.

### Test reset endpoint

**File:** `packages/server/src/routes/__test__.ts` (new)
**Mounted only when** `E2E_MODE=1`.

```
POST /api/__test__/reset
  Truncates: posts, comments, votes, bookmarks, revisions, files,
             tag_subscriptions, refresh_tokens
  Re-applies: scripts/seed.sql
  Idempotent. ~200ms. No request auth required — the `E2E_MODE=1` env flag is the access control.
```

The route file refuses to register if `E2E_MODE !== '1'` and emits a startup log line confirming "test routes mounted." The boot sequence additionally fail-fasts if `NODE_ENV=production && E2E_MODE=1` so the endpoint cannot ship.

**Not in v1:** `POST /api/__test__/seed-extra` for ad-hoc fixtures. Defer to a follow-on issue if a test demands data the canonical seed cannot provide.

### Additional seeded users

**File:** `scripts/seed.sql` (modify)

```sql
-- otheruser — for cross-user permission tests
INSERT INTO users (id, email, password_hash, name) VALUES (
  'a0000000-0000-0000-0000-000000000098',
  'otheruser@example.com',
  '<bcrypt cost-12 of "password123">',
  'Other User'
);

-- adminuser — reserved for future admin-gated features
INSERT INTO users (id, email, password_hash, name) VALUES (
  'a0000000-0000-0000-0000-000000000097',
  'adminuser@example.com',
  '<bcrypt cost-12 of "password123">',
  'Admin User'
);
```

`bruno/environments/local.bru` and `bruno/environments/ci.bru` add `otheruserId` pointing to `...-98`. No changes to existing Bruno requests.

## E2E suite scaffolding

### Directory layout

```
e2e/                                # new top-level workspace
├── README.md                       # conventions + commands (mirrors bruno/README.md)
├── package.json                    # @forge/e2e
├── playwright.config.ts            # workers: 4, projects, reporters, webServer
├── tsconfig.json
├── .auth/                          # gitignored — storageState files written by global-setup
│   ├── testuser.json
│   ├── otheruser.json
│   └── adminuser.json
├── fixtures/
│   ├── auth.ts                     # test extension: { testuser, otheruser, adminuser }
│   ├── reset.ts                    # auto-applied beforeEach reset
│   ├── mock-llm.ts                 # X-Mock-Script header helpers
│   ├── network-faults.ts           # opt-in route mocks for explicit failure-mode tests
│   └── selectors.ts                # central data-testid constants
├── support/
│   ├── global-setup.ts             # logs in 3 users, saves storageState
│   ├── global-teardown.ts          # placeholder for v1
│   ├── server-lifecycle.ts         # starts server with E2E_MODE=1 if not already running
│   └── wait-for-stack.ts           # polls /api/health, MinIO, Vite
└── specs/
    ├── _journey.spec.ts            # cross-cutting smoke
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

### Playwright config highlights

- `workers: process.env.CI ? 4 : undefined`. CI is capped at 4 to keep DB load predictable; local defaults to Playwright's half-cores heuristic for developer-experience speed.
- `fullyParallel: false` at project level — within a worker, specs run sequentially so per-test reset is monotonic. Across workers, true parallelism. Sound configuration for the chosen reset-endpoint isolation strategy.
- Projects: `chromium-desktop` only at v1. `webkit-desktop` and `chromium-mobile` deferred to a future issue.
- `reporter: [['html'], ['list'], ['github']]` — GitHub reporter annotates PR check output.
- `webServer` block managed by `support/server-lifecycle.ts`: starts server (`E2E_MODE=1 LLM_PROVIDER=mock`) and Vite preview server if not already running. `reuseExistingServer: !process.env.CI`.

### Auth fixture pattern

```ts
// fixtures/auth.ts
export const test = base.extend<{ testuser: Page; otheruser: Page; adminuser: Page }>({
  testuser: async ({ browser }, use) => {
    const ctx = await browser.newContext({ storageState: '.auth/testuser.json' });
    await use(await ctx.newPage());
    await ctx.close();
  },
  // … same for otheruser, adminuser
});
```

Specs needing a logged-in user write `test('thing', async ({ testuser }) => { … })` — zero per-test login overhead. `__test__/reset` truncates user data but does not touch the `users` table, so saved cookies/JWT remain valid across resets.

### Reset fixture pattern

```ts
// fixtures/reset.ts — auto-applied via test.beforeEach in project config
test.beforeEach(async ({ request }) => {
  await request.post(`${API_URL}/api/__test__/reset`);
});
```

Skips for `auth/register` specs (which test fresh-account creation and want no seed). Opt-out via `test.use({ resetBeforeEach: false })`.

### Selector convention

ALL specs reference elements by `data-testid` attributes resolved through `fixtures/selectors.ts`. No CSS selectors. No text-matching for clickable elements.

Adding `data-testid` attributes to Vue components is a per-PR ride-along during the feature-folder PRs — never a separate "add testids" PR. Each PR adds testids only to components it touches.

## Coverage matrix

Target ~135 specs (within ±15% of the 100–200 feature-complete band). Counts are budgeted, not strict.

| Folder | Specs | Coverage focus |
| --- | --- | --- |
| `_journey.spec.ts` | 1 | Register → login → create draft → AI autocomplete → upload file → publish → search → vote → bookmark → comment inline → fork → diff → logout → relogin as otheruser → permission denied → done. |
| `auth/` | ~14 | login (success / wrong-password / unknown-email / empty / redirect-after), register (success / duplicate-email / weak-password / email-validation), logout, session refresh, OAuth-stub flow, account-link page, redirect-when-authenticated guards. |
| `posts/` | ~22 | new (draft saves, required fields, markdown renders), view (public, draft-private, missing-id, permission), edit (own, cannot-edit-others, persists, cancel), delete (confirm, own-only, cascade), publish toggle, fork (creates linked copy, edits independent), multi-file post upload + preview, tags add/remove. |
| `revisions/` | ~10 | create (auto-on-edit, manual), list (chronological, empty), view-by-number, side-by-side diff, inline diff, rollback, permission. |
| `comments/` | ~14 | top-level / reply / nested-reply / inline-on-revision-line, edit (own only, edit window), delete (own only), empty state, comment-on-deleted-post, mention notifications if implemented. |
| `voting/` | ~7 | upvote, downvote, switch, remove, score updates in feed/post-view, error-path (already voted), permission. |
| `bookmarks/` | ~5 | toggle on/off, bookmarks page list, empty state, persists across sessions. |
| `tags/` | ~9 | popular-tags render, subscribe / unsubscribe, subscribed-tag-feed filter, tag page, my-subscriptions list, click-tag-from-post, search-by-tag. |
| `search/` | ~12 | plain query, no-results, fuzzy match, AI-search toggle, structured filters (tag / author / date / type), result click, Cmd+K, pagination, recent searches. |
| `playground/` | ~10 | open prompt, fill template variables, run (SSE streams), copy-to-clipboard, variable validation, save-as-fork, missing-variable error, mock-script selection. |
| `files/` | ~11 | drag-drop upload, picker upload, multi-file, preview (json / yaml / md / code / image), download, replace, remove, oversize rejection, mime rejection, in-post rendering. |
| `ai/` | ~8 | autocomplete (token-typing, accept, dismiss), generate-from-prompt, error during stream, mid-stream cancel, mock-script selection per test, streaming UI states. |
| `shell/` | ~12 | top nav, sidebar nav, dark-mode persists, keyboard shortcuts (Cmd+K, n, /, ?), error toast on 5xx, error boundary, 404 page, 401 redirects, breadcrumbs, mobile responsive smoke. |
| **Total** | **~135** | within target band. |

## Spec authoring conventions

Documented in `e2e/README.md`:

1. **One assertion concept per spec.** A spec called "voting → upvote increments score" asserts the score change, not also the button color.
2. **No conditional assertions.** No `if (await locator.isVisible()) { expect(…) }`. The test knows what state the app should be in.
3. **Network discipline.** Tests hit the real (mocked-LLM) backend by default. Route mocking is reserved for tests asserting a specific failure mode (e.g. "search 5xx renders error toast"). All such mocks live in `fixtures/network-faults.ts`.
4. **Mock LLM script discipline.** Tests using AI features set `X-Mock-Script` via a request fixture, never depending on the default. The default exists for the dev experience, not test determinism.
5. **No `waitForTimeout`.** Auto-waiting on locators or `waitForResponse` only.
6. **Fixture data is canonical.** Tests assert against the seeded post/comment/revision text — never invent expected text.
7. **No retries-as-bandaid.** A spec failing twice in CI gets `test.fixme()` with a tracking issue link, not a retry count.

## CI integration

### New workflow: `.github/workflows/e2e-playwright.yml`

```
Job: e2e
  Triggered on: pull_request, push to main
  Runs on: ubuntu-latest
  Steps:
    1.  Checkout
    2.  Setup Node 20 + npm cache
    3.  docker compose up -d postgres minio
    4.  Wait for /health on postgres + minio
    5.  npm ci
    6.  Build packages/shared
    7.  Run migrations + seed
    8.  Build client for production (vite build)
    9.  Start server with E2E_MODE=1 LLM_PROVIDER=mock in background
   10.  Start client preview server in background
   11.  Wait for /api/health and Vite preview server
   12.  npx playwright install --with-deps chromium
   13.  npm run e2e -- --reporter=github,html
   14.  Upload playwright-report/ as artifact (always)
   15.  Tear down docker compose
  Initially: continue-on-error=true, not a required check.
```

### Stability gate to flip blocking

14 consecutive successful runs on `main` after foundation merge, OR 7 days, whichever comes first. Tracked via the pinned tracking issue. When flipped:
- Branch protection: workflow becomes a required check.
- `CLAUDE.md` updated to add Playwright as a third blocking gate alongside coverage and Bruno.

### Bruno CI fix folded in (foundation PR)

`.github/workflows/bruno-regression.yml` gets `E2E_MODE=1` and `LLM_PROVIDER=mock` env vars so `ai/complete.bru` finally runs to completion in CI. `bruno/README.md` troubleshooting note replaced accordingly.

### Auto-fixme on flake (deferred to polish PR)

A post-step parses `playwright-report/results.json`. If a spec fails twice consecutively across CI runs (looked up via GitHub API), it opens a `flaky-e2e`-labeled tracking issue and posts a PR comment suggesting `test.fixme()`. Not in foundation PR — listed as the explicit polish-issue scope.

## Rollout phasing — 8 sequential issues

Filed in order via `/metaswarm:create-issue`, each blocked by the previous, sharing the `e2e-rollout` label.

| # | Title | Scope | Specs | Blocking? |
| --- | --- | --- | --- | --- |
| 1 | E2E foundation: Playwright + mock LLM + reset endpoint | All server seams, scaffolding, journey smoke, `auth/`, CI workflow non-blocking, Bruno CI fix | ~15 | n/a |
| 2 | E2E posts + revisions | `posts/` + `revisions/` | ~32 | non-blocking |
| 3 | E2E comments + voting + bookmarks | three folders | ~26 | non-blocking |
| 4 | E2E tags + search | two folders | ~21 | candidate flip-to-blocking after merge |
| 5 | E2E playground + AI | two folders, exercises mock LLM | ~18 | blocking |
| 6 | E2E files + multi-file posts | `files/`, MinIO-heavy | ~11 | blocking |
| 7 | E2E shell + accessibility | shell, keyboard, dark mode, error states | ~12 | blocking |
| 8 | E2E polish: auto-flake-issue, dashboard, doc updates | tooling, README final pass, decide on webkit/mobile projects | 0 | blocking |

Plus a tracking issue (`#0` in sequence, filed first) acting as the index — links to all 8 sub-issues, the design doc commit SHA, the rollout flip-to-blocking checkbox, and running spec count.

### Per-issue template

Each of the 8 follows this structure:

```
Title:        [E2E rollout N/8] <scope>
Labels:       e2e-rollout, e2e
Blocked-by:   #<previous issue> (except #1)

## Context
Pointer to the design doc section relevant to this PR.

## Definition of Done
- [ ] Spec files in e2e/specs/<folders>/ exist and pass
- [ ] Expected spec count: ~N (within ±15%)
- [ ] data-testid added to all touched Vue components
- [ ] No new flakes (3 consecutive green CI runs)
- [ ] Coverage gate (.coverage-thresholds.json) still passes
- [ ] Bruno gate still passes
- [ ] e2e/README.md updated with any new conventions introduced
- [ ] Closes #<this issue>

## File scope
e2e/specs/<folder>/**
packages/client/src/<components touched for data-testid>**
(no server changes after issue #1 unless noted)

## Pre-conditions
- Issue #<N-1> merged
- Local: docker compose up -d postgres minio; npm run dev
- E2E_MODE=1 LLM_PROVIDER=mock set in .env

## Test commands
npm run e2e
npm run e2e -- --headed
npm run e2e:ui

## Expected runtime
Local: ~Nm at 4 workers
CI:    ~Nm

## Agent instructions
- Use TDD: write spec first, watch fail, add data-testid, watch pass
- Reference fixtures/auth.ts for logged-in users (testuser/otheruser)
- Reset is automatic via beforeEach — only opt out for register-flow tests
- Use fixtures/selectors.ts for ALL element references
- Mock LLM script via header X-Mock-Script — never depend on default
- DO NOT use --no-verify on commits
- DO NOT mock at the network layer unless asserting a specific failure mode

## Failure modes to watch for
<scope-specific>

## Adversarial review checklist
- All data-testids added are stable identifiers, not DOM-position-coupled
- No spec uses waitForTimeout
- No conditional assertions
- All tests pass with workers=1 AND workers=4
```

### Sequencing guarantees

- #2 cannot start until #1 is merged (rig + journey smoke must exist).
- #4 is the gate where flip-to-blocking is evaluated based on stability.
- #5 explicitly assumes #1's mock LLM provider is present.
- #8 (polish) can start in parallel with #6 or #7 if a separate engineer picks it up.

## Out of scope

- Visual regression / screenshot diffs (explicit choice — feature-complete level B, not exhaustive level C).
- Real OpenAI / Ollama calls in CI.
- Real Google OAuth flow (still 501/401 stub state until OAuth is configured).
- Server-side error injection (5xx from real DB) — Bruno's job conceptually.
- Background job / cron behavior — none today.
- Multi-tab / cross-tab sync — defer to a focused issue if it becomes relevant.
- WebKit / mobile browser projects in v1 — decided in polish PR.
- `__test__/seed-extra` ad-hoc fixture endpoint — defer until a test demands it.
- Adding Playwright to the `.coverage-thresholds.json` enforcement command (E2E coverage is a separate gate, independent from line/branch coverage).

## Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| Flaky tests poison CI adoption | Non-blocking initially; auto-fixme on repeat failures (polish PR); strict no-`waitForTimeout` rule. |
| Mock LLM drift from real providers | Mock outputs deterministic content matching the SSE wire format; provider interface enforces parity at TypeScript level. |
| Reset endpoint accidentally shipped to prod | Boot fail-fast if `NODE_ENV=production && E2E_MODE=1`; route registration refuses without `E2E_MODE=1`; explicit log line on mount. |
| Worker collisions on shared seed data | Per-test reset returns DB to canonical state; workers capped at 4 to keep DB load reasonable. |
| `data-testid` churn across PRs | Each feature PR adds testids only to components it touches; no separate "add testids" PR. |
| Bruno fixtures divergence from new seeded users | New users added with `...-98` and `...-97` UUIDs that no existing Bruno test references. Bruno env files updated additively. |
| Foundation PR too large to review | Foundation is scoped tightly: scaffolding + journey smoke + `auth/` only (~15 specs). Feature PRs follow. |

## Acceptance criteria for the design

- [x] Coverage depth chosen and bounded (Q1: B / feature-complete).
- [x] External-service strategy chosen (Q2: B / mock at server level).
- [x] DB isolation strategy chosen (Q3: B / reset endpoint, workers capped at 4).
- [x] Auth strategy chosen (Q4: D / multi-user storageState).
- [x] Suite location, organization, CI integration chosen (Q5: e2e/, feature folders + journey smoke, non-blocking → blocking).
- [x] Rollout phasing chosen (Q6: foundation + journey first, then feature batches in priority order).
- [x] GitHub issues plan: 8 sequential issues + 1 tracking issue, filed via `/metaswarm:create-issue` with full TDD plans and DoDs.
