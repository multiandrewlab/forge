---
title: 'E2E workers=4 cross-worker reset contention — fix design'
issue: 75
predecessor: '#67 (auth-rate-limit slice — closed)'
tracking-issue: 43
date: 2026-05-01
status: approved
---

# E2E workers=4 cross-worker reset contention — fix design

## Context

`e2e/playwright.config.ts:13–18` documents this as a known follow-up beyond #67. PR #74's CI run on `27b6528` ([job 73921036730](https://github.com/multiandrewlab/forge/actions/runs/25210860054/job/73921036730)) at `workers=4` produced 4 hard failures and 6 flakes (passed on retry) across 10 distinct specs. All 10 are pre-existing specs that mutate cross-resource state owned by the shared `testuser`. Zero specs introduced in PR #74 itself flaked, confirming the contention is structural in the reset-reset-mutation interaction at `workers=4`, not in the new feature work.

The acceptance criteria from #75:

- All 10 currently-affected specs pass at `workers=4` across 5 consecutive CI runs without `retries: 1` providing the safety net.
- `playwright.config.ts:13–18` comment block updated/removed.
- `retries` reduced to 0 in CI.
- Tracking issue #43's green-run counter resumes incrementing reliably.

## Affected specs (the "10")

Hard failures (4):

- `specs/_journey.spec.ts:117:3` — Phase 4 social
- `specs/bookmarks/page-list.spec.ts:3:1`
- `specs/comments/edit-own.spec.ts:4:1`
- `specs/revisions/rollback-to-previous.spec.ts:4:1`

Flaky / passed on retry (6):

- `specs/_journey.spec.ts:66:3` — Phase 2 draft
- `specs/bookmarks/page-empty-state.spec.ts:3:1`
- `specs/posts/delete-cascade.spec.ts:4:1`
- `specs/posts/edit-own-post.spec.ts:4:1`
- `specs/posts/publish-draft-to-public.spec.ts:4:1`
- `specs/voting/score-in-feed.spec.ts:4:1`

## Root cause

`POST /api/__test__/reset` (`packages/server/src/routes/__test__.ts:35`) does:

1. Acquire `pg_advisory_lock(E2E_RESET_LOCK_ID)`.
2. Execute `scripts/seed.sql` which TRUNCATEs `users`, `posts`, `post_revisions`, `post_files`, `tags`, `post_tags`, `votes`, `bookmarks`, `user_tag_subscriptions`, `comments`, `prompt_variables` and re-inserts seed rows.
3. Release the advisory lock.

The advisory lock serializes _resets_ across workers but does not serialize **resets vs. in-flight requests from sibling workers**. Worker A's spec is mid-execution against `testuser`'s rows when worker B begins a reset; worker B's TRUNCATE acquires `ACCESS EXCLUSIVE` on the affected tables and either:

- Blocks worker A's queries until reset completes, by which time the rows worker A was operating on are gone — A's `DELETE /posts/:id` returns 404 ("URL did not change after delete"), or
- Cancels worker A's in-flight requests when the page navigates away ("page closed").

Per-worker isolation today depends entirely on the advisory lock, which only protects DB state during the seed re-load; it does not protect in-flight HTTP request streams from sibling workers.

## Decision: per-worker user pool + worker-scoped reset

The reset endpoint becomes worker-scoped: when called with `X-E2E-Worker-Id: N`, it deletes only rows owned by user `e2e_wN`. Each worker logs in as a distinct user (`e2e_w0..e2e_w3`); their working sets are disjoint, so concurrent resets never touch each other's rows. The legacy global-TRUNCATE path stays for Bruno and manual-reset callers.

### Alternatives considered

1. **Page-level barrier / longer-held lock** — extends the advisory lock to cover sibling workers' page activity. Effectively serializes the suite, defeating the point of `workers=4`. Rejected.
2. **Per-worker DB schema** — each worker connects to its own Postgres schema or DB. Provably isolates _all_ state including global tables (tags, public feed). Larger infrastructure change (DATABASE_URL templating per worker, N migrations, N seed runs). Rejected for this PR (acceptable as a future option if global-state flakes appear).
3. **Per-worker user pool + worker-scoped reset** (chosen) — smallest blast radius for the 10 cited specs. User-owned state isolates cleanly via row-level locks on disjoint working sets.

## Architecture

```
                Today (broken at workers=4)
─────────────────────────────────────────────
[W0] [W1] [W2] [W3] —── all use testuser
  │    │    │    │
  └────┴────┴────┴────┐
                      ▼
            POST /api/__test__/reset
            (TRUNCATE everything, advisory lock)

            Contention: W1's reset truncates the same rows W0 has
            in-flight requests against.


                After fix
─────────────────────────────────────────────
[W0]   [W1]   [W2]   [W3]
 │      │      │      │
 │      │      │      │      e2e_w0..3 (per-worker users; primary actors)
 │      │      │      │      alice / carol (shared, never reset)
 │      │      │      │      testuser (shared, Bruno-only)
 │      │      │      │
 ▼      ▼      ▼      ▼
 POST /api/__test__/reset
 with X-E2E-Worker-Id: N
 → DELETE FROM ... WHERE user_id = e2e_wN's UUID

 No cross-worker row contention. Disjoint working sets.
```

## Components

### Server: `packages/server/src/routes/__test__.ts`

`POST /api/__test__/reset` gains a worker-scoped branch.

- **Worker-scoped path** (header `X-E2E-Worker-Id: 0..3` present and valid):
  - Resolve worker ID → user UUID (`e2e_w${N}` → `a0000000-...-00000000010${N+1}`).
  - Execute scoped DELETEs (order matters only for clarity; all are independent):
    ```sql
    DELETE FROM bookmarks              WHERE user_id   = $1;
    DELETE FROM votes                  WHERE user_id   = $1;
    DELETE FROM user_tag_subscriptions WHERE user_id   = $1;
    DELETE FROM comments               WHERE author_id = $1;
    DELETE FROM posts                  WHERE author_id = $1;
    ```
  - Cascade analysis (verified against `packages/server/src/db/migrations/001_initial-schema.sql`):
    - `DELETE FROM posts` cascades to `post_revisions`, `post_files`, `post_tags`, `prompt_variables`, child `bookmarks`, child `votes`, child `comments` (all FKs are `ON DELETE CASCADE` by `post_id`).
    - `DELETE FROM comments` cascades to child comments via `parent_id ON DELETE CASCADE`. Side effect: a reply by alice to an actor comment is collateral-deleted; tests do not rely on cross-test comment persistence, so this is acceptable.
    - The explicit `DELETE FROM comments WHERE author_id = $1` is required (not redundant with `DELETE FROM posts`) because actor may have commented on alice's / carol's / testuser's posts; those comments are not reached by the post cascade since `comments.author_id` is `ON DELETE SET NULL`, not CASCADE.
    - The explicit `DELETE FROM bookmarks` / `DELETE FROM votes` / `DELETE FROM user_tag_subscriptions` are required for the same reason: actor may have bookmarked / voted / subscribed against rows owned by other users.
  - The actor user row stays. The refresh_token cookie in the test's storage state continues to validate (server is stateless — no sessions table; refresh_token is a signed JWT verified against the user UUID).
  - No advisory lock (disjoint working sets across workers; row-level locks suffice).
  - Return `204 No Content`.
- **Legacy path** (no header): existing global-TRUNCATE + re-seed + advisory lock behavior. Used by Bruno's collection-root auth bootstrap, local manual resets, and any future caller that wants a full wipe.
- Header validation: `X-E2E-Worker-Id` must be a string matching `/^[0-3]$/`. Other values → 400 `{ error: 'invalid X-E2E-Worker-Id', code: 'INVALID_WORKER_ID' }`.
- Tests in `packages/server/src/__tests__/routes/__test__.test.ts` cover both branches and the validation error.

### Seed: `scripts/seed.sql`

Add 4 user rows in the existing users INSERT block:

```sql
('a0000000-0000-0000-0000-000000000101', 'e2e_w0@example.com', 'E2E Worker 0', NULL, 'local', '<hash>'),
('a0000000-0000-0000-0000-000000000102', 'e2e_w1@example.com', 'E2E Worker 1', NULL, 'local', '<hash>'),
('a0000000-0000-0000-0000-000000000103', 'e2e_w2@example.com', 'E2E Worker 2', NULL, 'local', '<hash>'),
('a0000000-0000-0000-0000-000000000104', 'e2e_w3@example.com', 'E2E Worker 3', NULL, 'local', '<hash>'),
```

`<hash>` is the existing bcrypt cost-12 hash already used for `password123` in `scripts/seed.sql` (currently `$2b$12$jrcHUcVQnE.swctPk5GnreW9hkkyFqh8A9p2GnEaRrbxEaxXESYw2`). All 4 worker users share the same password. No fixture posts/comments/bookmarks/revisions per worker — specs create their own state at test time.

### E2E fixtures: `e2e/fixtures/auth.ts`

```ts
export type AuthUser = 'e2e_w0' | 'e2e_w1' | 'e2e_w2' | 'e2e_w3' | 'alice' | 'carol' | 'testuser';

export const SEED_USERS = {
  e2e_w0: { email: 'e2e_w0@example.com', password: 'password123' },
  e2e_w1: { email: 'e2e_w1@example.com', password: 'password123' },
  e2e_w2: { email: 'e2e_w2@example.com', password: 'password123' },
  e2e_w3: { email: 'e2e_w3@example.com', password: 'password123' },
  alice: { email: 'alice@example.com', password: 'password123' },
  carol: { email: 'carol@example.com', password: 'password123' },
  testuser: { email: 'testuser@example.com', password: 'password123' }, // Bruno fixture, kept in seed.sql
} as const;

type AuthFixtures = {
  actor: Page; // worker-aware: returns Page logged in as e2e_w${TEST_WORKER_INDEX}
  alice: Page; // unchanged
  carol: Page; // unchanged
};
```

The `actor` fixture reads `process.env.TEST_WORKER_INDEX`, parses to integer, validates `0 <= n <= 3`, throws otherwise. Loads `storageStatePath('e2e_w' + n)`. The fixture name `actor` reflects intent — "the test's primary user, not a specific named human."

`testuser` is removed from `AuthFixtures`. The seeded `testuser` row remains in `scripts/seed.sql` solely for Bruno regression tests, which are sequential and immune to this contention.

### E2E reset fixture: `e2e/fixtures/reset.ts`

The auto-fixture sends `X-E2E-Worker-Id` derived from `testInfo.workerIndex` (Playwright sets this 0..N-1):

```ts
const res = await ctx.post(`${API_BASE}/api/__test__/reset`, {
  headers: {
    'X-E2E-Secret': secret,
    'X-E2E-Worker-Id': String(testInfo.workerIndex),
  },
});
```

### globalSetup: `e2e/support/global-setup.ts`

Loop over `['e2e_w0', 'e2e_w1', 'e2e_w2', 'e2e_w3', 'alice', 'carol']`. testuser is NOT logged into during E2E setup — it's only seeded for Bruno.

### Playwright config: `e2e/playwright.config.ts`

```diff
-  workers: process.env.CI ? 4 : undefined,
+  workers: 4,
   forbidOnly: !!process.env.CI,
-  // Issue #67 partially addressed: ...
-  // (deferred to a follow-up issue beyond #67's rate-limit scope).
-  retries: process.env.CI ? 1 : 0,
+  retries: 0,
```

`workers: 4` is hardcoded for CI and local. The seed-pool size (4 worker users) bounds maximum parallelism; setting workers > 4 would index past the pool and the `actor` fixture throws.

### Spec migration (mechanical)

97 specs destructure `{ testuser }` → `{ actor }`. Two specs need a hand-touch:

- `e2e/specs/_journey.spec.ts:57` — hardcodes `testuser@example.com` in a fresh-login test. Replace with the worker user's email derived from `testInfo.workerIndex`.
- `e2e/specs/bookmarks/persists-across-sessions.spec.ts:48` — hardcodes `storageStatePath('testuser')`. Replace with `storageStatePath(\`e2e_w${testInfo.workerIndex}\`)`.

The defensive workarounds in `bookmarks/page-empty-state.spec.ts` (lines 7–24) and `bookmarks/page-list.spec.ts` (lines 7–8 + line 39) become no-ops post-migration but are retained for defense-in-depth. Stripping them is deferred to a follow-up.

### Documentation: `CLAUDE.md`

Update the "Bruno API Tests > Seeded fixtures (pin `.bru` env vars to these)" table to add a note that testuser is now Bruno-only; e2e specs use `e2e_w0..3` for parallelism.

## Data flow (per-test lifecycle)

```
Worker N starts test
  │
  ▼
fixture: actor (worker-aware Page)
  │   - read TEST_WORKER_INDEX = N
  │   - load storageState from e2e_wN.json
  │
  ▼
fixture: resetDatabase (auto, scope: 'test')
  │   - if @no-reset tag: skip
  │   - else: POST /api/__test__/reset
  │           Headers: X-E2E-Secret + X-E2E-Worker-Id: N
  │
  ▼
Server reset handler (worker-scoped path)
  │   - validate secret + worker ID
  │   - DELETE FROM bookmarks              WHERE user_id   = $1
  │   - DELETE FROM votes                  WHERE user_id   = $1
  │   - DELETE FROM user_tag_subscriptions WHERE user_id   = $1
  │   - DELETE FROM comments               WHERE author_id = $1
  │   - DELETE FROM posts                  WHERE author_id = $1
  │   - 204
  │
  ▼
Test body executes (creates own state via actor.request)
  │
  ▼
Next test in this worker repeats
```

Concurrency: all 4 workers run independently. Each worker's reset DELETEs operate on disjoint working sets (`user_id` / `author_id` matches one of `e2e_w0..3`). `alice`, `carol`, and `testuser` rows are never touched by worker-scoped reset.

## Verification

A new temporary GitHub Actions workflow (`.github/workflows/e2e-burst.yml`) provides pre-merge evidence that the AC is met.

- Trigger: `workflow_dispatch` (manual).
- Job: runs the e2e suite 5 times sequentially in one job, fails on first non-green.
- Same environment / same workers=4 / `retries: 0` — exactly the conditions the AC asks for.
- Run from the PR branch before requesting merge. PR description captures the run URL as evidence.

The workflow is removed in a follow-up issue once stability has been established on main. The regular `e2e` workflow on main runs at workers=4, retries=0 from merge onward; tracking issue #43's green-run counter resumes incrementing from there.

## Risks

1. **Global-state flakes (tags, public feed, search)** — a future test that creates a new tag at runtime would leak across workers (tags table is global, never reset). None of the 10 affected specs do this today. If this hazard manifests, escalate to per-worker schemas (alternative #2) in a separate issue.
2. **`alice` / `carol` direct mutation leaks** — a future spec that mutates alice's bio or carol's avatar would leak across workers. No current spec does this; flagged as a future hazard.
3. **`@no-reset` specs** — specs tagged `@no-reset` skip the reset entirely. They tend to use the base `page` fixture, not `actor`, so should be unaffected. Verify in PR smoke check.
4. **Worker-pool size mismatch** — bumping `workers: 4` to 8 without expanding the pool throws via `actor` fixture validation. Loud failure, not silent contention.
5. **One spec live-logs as `testuser`** (`_journey.spec.ts:57`) — mechanical change tracked in the spec migration list.

## Non-goals

- **Eliminating cross-worker visibility entirely** — pursued under per-worker schemas only if needed; not this PR.
- **Migrating Bruno tests to per-worker users** — Bruno is sequential; no contention to fix.
- **Splitting global vs. user-owned reset semantics in seed.sql** — legacy global path is preserved as-is for Bruno + manual reset paths.
- **Refactoring the bookmarks defensive workarounds** — they become no-ops post-migration and stay as defense-in-depth; strip in a follow-up if desired.
- **Removing `retries: 1` from the Bruno workflow** — only the workers=4 e2e suite is affected by this change.

## Acceptance criteria mapping

| AC                                                     | How met                                                                                                                               |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| All 10 affected specs pass at `workers=4`, 5× green CI | `e2e-burst.yml` workflow_dispatch run from PR branch — 5 sequential runs, fails on first non-green                                    |
| `playwright.config.ts:13–18` updated/removed           | Stripped in this PR (the `retries: 1` band-aid block)                                                                                 |
| `retries` reduced to 0 in CI                           | `retries: 0` (was `process.env.CI ? 1 : 0`)                                                                                           |
| #43 green-run counter resumes incrementing reliably    | The regular `e2e` workflow on main runs at workers=4, retries=0 from merge onward; pre-merge burst gives confidence the counter holds |

## Related

- #67 (closed) — predecessor; addressed the auth-rate-limit slice.
- #43 (open) — E2E rollout tracking issue + green-run counter.
- #53 (open) — E2E polish PR; will ship auto-flake-issue tooling. Recommended dedupe hint: include a "known-class" allowlist mapping spec names to umbrella issues like #75.
- PR #74 — the workers=4 run that surfaced #75 concretely.
