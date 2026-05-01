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

`POST /api/__test__/reset` gains a worker-scoped branch. All five existing guards (ENABLE_TEST_ROUTES, NODE_ENV ∈ dev/test, loopback OR isCI, X-E2E-Secret timingSafeEqual, no Origin header) run BEFORE branch selection — both branches are unreachable in production and from cross-origin requests.

#### Worker-scoped path (header present and valid)

Header validation:

```ts
// Closed lookup table — never construct a UUID by string interpolation.
const WORKER_USER_IDS = {
  '0': 'a0000000-0000-0000-0000-000000000101',
  '1': 'a0000000-0000-0000-0000-000000000102',
  '2': 'a0000000-0000-0000-0000-000000000103',
  '3': 'a0000000-0000-0000-0000-000000000104',
} as const;

const raw = request.headers['x-e2e-worker-id'];
// Defensively reject array headers (Fastify yields arrays for duplicate header lines).
if (typeof raw !== 'string') return /* fall through to legacy path */;
if (!Object.prototype.hasOwnProperty.call(WORKER_USER_IDS, raw)) {
  return reply.code(400).send({
    error: 'X-E2E-Worker-Id must be one of "0", "1", "2", "3"',
    code: 'INVALID_WORKER_ID',
    received: typeof raw === 'string' ? raw.slice(0, 16) : '<non-string>',
  });
}
const userId = WORKER_USER_IDS[raw];
```

Why a closed map (not a regex + UUID template): bounds blast radius if validation drifts in a future change. An attacker (or a confused future caller) passing `'constructor'`, `'__proto__'`, `'99'`, or any non-`'0'..'3'` value cannot resolve to a non-fixture UUID — the lookup returns `undefined` and the branch returns 400.

Execution:

```sql
BEGIN;
  DELETE FROM bookmarks              WHERE user_id   = $1;
  DELETE FROM votes                  WHERE user_id   = $1;
  DELETE FROM user_tag_subscriptions WHERE user_id   = $1;
  DELETE FROM comments               WHERE author_id = $1;
  DELETE FROM posts                  WHERE author_id = $1;
COMMIT;
```

The five DELETEs are wrapped in a single transaction so a mid-sequence failure leaves the worker's working set fully intact rather than half-wiped (Architect review's atomicity concern). `$1` is parameterized — never string-interpolated. No advisory lock (disjoint working sets across workers; row-level locks on shared `tags` rows via the `tag_post_count` triggers suffice — see Concurrency note below).

Cascade analysis (verified against `packages/server/src/db/migrations/001_initial-schema.sql`):

- `DELETE FROM posts` cascades to `post_revisions`, `post_files`, `post_tags`, `prompt_variables`, child `bookmarks`, child `votes`, child `comments` (all FKs are `ON DELETE CASCADE` by `post_id`).
- `DELETE FROM comments` cascades to child comments via `parent_id ON DELETE CASCADE`. Side effect: a reply by alice to an actor comment is collateral-deleted; tests do not rely on cross-test comment persistence, so this is acceptable.
- The explicit `DELETE FROM comments WHERE author_id = $1` is required (not redundant with `DELETE FROM posts`) because actor may have commented on alice's / carol's / testuser's posts; those comments are not reached by the post cascade since `comments.author_id` is `ON DELETE SET NULL`, not CASCADE.
- The explicit `DELETE FROM bookmarks` / `DELETE FROM votes` / `DELETE FROM user_tag_subscriptions` are required for the same reason: actor may have bookmarked / voted / subscribed against rows owned by other users.
- `posts.forked_from_id` is `ON DELETE SET NULL` — when actor's posts are deleted, any forks owned by alice/carol/sibling workers will have their `forked_from_id` silently NULLed. No current spec asserts on cross-user fork relationships; flagged in Risks.

The actor user row stays. The refresh_token cookie in the test's storage state continues to validate (server is stateless — no sessions table; the `/api/auth/refresh` route does call `findUserById(payload.id)` and returns 401 if the user is missing, but since the design preserves the user row, the cookie remains valid).

Audit log on the scoped branch logs the worker ID from the validated header (not `process.env.TEST_WORKER_INDEX`, which is a Playwright env var with no meaning on the server):

```ts
app.log.info({ workerId: raw, userId, ts: Date.now() }, 'E2E worker-scoped reset completed');
```

Return `204 No Content`.

#### Legacy path (no header)

Existing global-TRUNCATE + re-seed + advisory lock behavior — preserved unchanged. Used by Bruno's collection-root auth bootstrap, local manual resets via curl, and any future caller that wants a full wipe.

#### Concurrency note (refines "disjoint working sets")

The worker-scoped DELETEs touch rows owned by `e2e_wN`. Two side channels could still produce brief row-lock contention without correctness impact:

- `tags` table updates via the `tag_post_count` trigger — when actor's posts referencing a shared tag (e.g., `typescript`) are deleted, the trigger UPDATEs the global `tags` row. Concurrent workers deleting posts that share the same tag will serialize on the row-level lock, briefly. Correctness is preserved; throughput cost is negligible.
- Postgres sequences and shared search-vector triggers — unaffected by `tags` aside, no shared state in the user-owned DELETE working set.

So "fully disjoint" is true at the row-ownership layer; "fully lock-free" is not strictly true. Acceptable.

#### Tests required (`packages/server/src/__tests__/routes/__test__.test.ts`)

All test cases below MUST be added; no `/* istanbul ignore */` exclusions are permitted on the new code paths. Coverage gate (`.coverage-thresholds.json`) is enforced as a blocking step before PR.

Worker-scoped path:

- header `X-E2E-Worker-Id: '0'` → 5 expected DELETE statements with `e2e_w0`'s UUID, in a transaction (BEGIN…COMMIT), `pg_advisory_lock` is NOT called, audit log includes `workerId: '0'`, `userId: 'a0…101'`. Returns 204.
- same for `'1'`, `'2'`, `'3'` — at minimum one positive case per worker ID to confirm the closed map.
- header `X-E2E-Worker-Id: '0'` plus `Origin` header present → 403 (Origin guard runs first). Audit log not invoked.
- header `X-E2E-Worker-Id: '0'` plus invalid X-E2E-Secret → 403 (secret guard runs first). Audit log not invoked.
- header `X-E2E-Worker-Id: '0'` plus a DELETE that throws → transaction rolls back; no rows deleted; 500 with envelope `{ error, code }`.

Header validation (each returns 400 `{ error, code: 'INVALID_WORKER_ID', received }` and pgQuery is NOT called):

- `'4'`, `'-1'`, `'abc'`, `''` (empty string), `'00'` (leading zero), `' 0 '` (whitespace), `'0\n'` (trailing newline), `'０'` (full-width Unicode digit), `'__proto__'`, `'constructor'`.
- Header value is an array (duplicate header lines): rejected as non-string.

Legacy path (regression):

- no header → existing global-TRUNCATE + re-seed + advisory-lock-then-unlock behavior. Audit log unchanged. Returns 204. Confirms Bruno path is unaffected.

Cross-user data integrity (regression — confirms the worker-scoped reset never wipes a sibling user):

- seed alice/carol/testuser with rows; run worker-scoped reset for `'0'`; assert alice's, carol's, and testuser's rows are unchanged.

The `pgQuery` signature in `TestRoutesDeps` is currently `(sql: string) => Promise<unknown>` — single-arg, no params. The worker-scoped path needs parameterized binding, so the signature is extended to `(sql: string, params?: unknown[]) => Promise<unknown>` (backward-compatible). Existing callers (legacy path) remain untyped-params, the worker-scoped path passes `[userId]`. Test mocks update accordingly.

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
export type AuthUser = 'e2e_w0' | 'e2e_w1' | 'e2e_w2' | 'e2e_w3' | 'alice' | 'carol';

export const SEED_USERS = {
  e2e_w0: { email: 'e2e_w0@example.com', password: 'password123' },
  e2e_w1: { email: 'e2e_w1@example.com', password: 'password123' },
  e2e_w2: { email: 'e2e_w2@example.com', password: 'password123' },
  e2e_w3: { email: 'e2e_w3@example.com', password: 'password123' },
  alice: { email: 'alice@example.com', password: 'password123' },
  carol: { email: 'carol@example.com', password: 'password123' },
} as const;

type AuthFixtures = {
  actor: Page; // worker-aware: returns Page logged in as e2e_w${testInfo.workerIndex}
  alice: Page; // unchanged
  carol: Page; // unchanged
};
```

`testuser` is removed from `AuthFixtures` AND from `SEED_USERS` (the e2e fixture surface). The seeded `testuser` row remains in `scripts/seed.sql` for Bruno regression tests — Bruno reads its own credentials from `bruno/environments/local.bru`, not from `e2e/fixtures/auth.ts`. Removing testuser from `SEED_USERS` prevents a future contributor from importing it and re-introducing the contention by mistake.

The `actor` fixture is implemented per-test using Playwright's `testInfo.workerIndex`:

```ts
actor: async ({ browser }, use, testInfo) => {
  const idx = testInfo.workerIndex;
  if (!Number.isInteger(idx) || idx < 0 || idx > 3) {
    throw new Error(
      `[actor fixture] testInfo.workerIndex=${idx} is out of range [0,3]. ` +
      `If you need more parallelism, expand the e2e_w pool in scripts/seed.sql ` +
      `and bump WORKER_USER_IDS in __test__.ts.`,
    );
  }
  const user = `e2e_w${idx}` as const;
  testInfo.annotations.push({ type: 'actor', description: user });  // surfaces in HTML report + traces
  const ctx = await browser.newContext({ storageState: storageStatePath(user) });
  const page = await ctx.newPage();
  await attachE2EInitScript(page);
  await use(page);
  await ctx.close();
},
```

Two debugging affordances are required so a CI failure on `e2e_w2` can be diagnosed without spelunking:

1. `testInfo.annotations.push({ type: 'actor', description: 'e2e_wN' })` — Playwright surfaces annotations in the HTML report and JSON trace per failed test, naming the resolved worker user.
2. The reset fixture (next section) logs the worker user identity to console on first call per worker, so log-grepping a CI run shows `[reset:w2] e2e_w2 scoped reset → 204` for each worker.

The fixture name `actor` reflects intent — "the test's primary user, not a specific named human." `me` was considered (more ergonomic at the destructure site) but rejected because of mild collision with Vue's `useUserStore` patterns and to make the new mental model explicit at every call site (`{ actor }` is harder to overlook than `{ me }`).

### E2E reset fixture: `e2e/fixtures/reset.ts`

The auto-fixture sends `X-E2E-Worker-Id` derived from `testInfo.workerIndex` (Playwright sets this 0..N-1):

```ts
const workerId = String(testInfo.workerIndex);
const res = await ctx.post(`${API_BASE}/api/__test__/reset`, {
  headers: {
    'X-E2E-Secret': secret,
    'X-E2E-Worker-Id': workerId,
  },
});
if (!res.ok()) {
  const body = await res.text().catch(() => '<unreadable>');
  throw new Error(`[e2e/reset:w${workerId}] reset failed: HTTP ${res.status()}\n${body}`);
}
```

The error message includes `w${workerId}` so a CI log line surfaces which worker hit the failure.

### globalSetup: `e2e/support/global-setup.ts`

Loop over `['e2e_w0', 'e2e_w1', 'e2e_w2', 'e2e_w3', 'alice', 'carol']` — 6 logins, parallelized via `Promise.all`. testuser is NOT logged into during E2E setup — it's only seeded for Bruno's own auth bootstrap inside `bruno/collection.bru`.

Parallelizing keeps globalSetup wall-clock time roughly constant vs today's 3-user sequential setup (was ~3× single-login time; now ~1× single-login time even though we doubled the user count).

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

`workers: 4` is hardcoded for CI and local. The seed-pool size (4 worker users) bounds maximum parallelism; setting workers > 4 would index past the pool and the `actor` fixture throws with a message naming both files that need to grow (`scripts/seed.sql` and `WORKER_USER_IDS` in `__test__.ts`). To extend the pool: add user rows in seed.sql, add UUIDs to `WORKER_USER_IDS`, bump `workers:` here, and bump the `0..3` validators in the fixture and the server.

### Spec migration

97 specs destructure `{ testuser }` → `{ actor }`. The base sed replacement covers fixture destructuring and most usage. Manual review and hand-touches required:

**Hand-touch specs (hardcoded `testuser` strings):**

- `e2e/specs/_journey.spec.ts:57` — hardcodes `testuser@example.com` in a fresh-login test. Replace with `e2e_w${testInfo.workerIndex}@example.com`.
- `e2e/specs/auth/login-success.spec.ts:10` — hardcodes `testuser@example.com` as a login credential in a non-fixture context. Replace with `e2e_w${testInfo.workerIndex}@example.com`.
- `e2e/specs/bookmarks/persists-across-sessions.spec.ts:48` — hardcodes `storageStatePath('testuser')`. Replace with `storageStatePath(\`e2e_w${testInfo.workerIndex}\`)`(cast as`AuthUser` if needed).
- A grep across all 115 specs (`grep -rn "['\"]testuser" e2e/specs`) is required during implementation to catch any other hardcoded literals before the PR opens. The implementation work unit lists this grep as a verification step.

**Comment + test-name migration:** The fixture rename leaves comments and `test('...')` titles that reference "testuser" by name (e.g., "testuser deletes via UI", "comments: testuser sees alice's new comment"). These are misleading after the migration ("which testuser?"). The implementation work unit reworks affected comments and test titles to use neutral language (e.g., "actor deletes via UI", "comments: actor sees alice's new comment via websocket broadcast"). A grep across `e2e/specs/` for the literal `testuser` (case-sensitive) drives the rewrite list — expected count is approximately 30+ surviving references after the mechanical sed.

**Defensive-workaround removal:** Two specs contain workarounds for the contention this PR eliminates. They are REMOVED as part of this PR (not retained as defense-in-depth — keeping them would signal to future contributors that cross-worker pollution is still possible in user-owned state, which by construction it is not):

- `e2e/specs/bookmarks/page-empty-state.spec.ts` lines 6–24 (the `for (const p of posts) { toggle off }` cleanup loop) — strip and rewrite the spec to its post-migration form: simply navigate and assert the empty state.
- `e2e/specs/bookmarks/page-list.spec.ts` line 8 ("filter to dodge cross-worker pollution") comment + line 39 `.filter({ hasText: uniqueTitle })` — the unique-title generation can stay (it's harmless and disambiguates failure messages), but the comment about cross-worker pollution is removed.

**Lint guard:** Add a CI check (`grep -E '\bSEED_USERS\.testuser\b' e2e/specs/` or similar) that fails if a future spec re-introduces `testuser` as a logged-in fixture user. The exact mechanism (eslint rule, pre-commit grep, or CI job) is implementer's choice; the design's invariant is "no e2e spec logs in as testuser."

### Documentation: `CLAUDE.md`

Three updates:

1. **New subsection: "How E2E parallelism works"** — placed near the existing "Testing" section. Explains: per-worker user pool (`e2e_w0..3`), worker-scoped reset via `X-E2E-Worker-Id` header, the `actor` fixture pattern, why testuser stayed Bruno-only, why `workers: 4` is hardcoded (pool size), what to do if pool needs to grow (expand `WORKER_USER_IDS` in `__test__.ts` AND seed.sql AND bump `workers:`).

2. **Bruno > Seeded fixtures table update** — add `e2e_w0..3` rows alongside the existing `testuser`/`alice`/`carol`/etc. entries, noting they are E2E-only and Bruno does not use them. Make explicit that testuser is the Bruno-only fixture: "testuser is reserved for Bruno regression tests (sequential, immune to E2E parallelism). E2E specs MUST NOT log in as testuser — use the `actor` fixture, which resolves to the worker's own `e2e_w${N}` user."

3. **Bruno coverage exception for `__test__/*`** — add a note in the "Bruno API Tests > Requirements" section: "Endpoints under `/api/__test__/*` are excluded from the Bruno coverage requirement. They are gated by `ENABLE_TEST_ROUTES=1` + `NODE_ENV ∈ {dev,test}` + loopback-only-outside-CI + `X-E2E-Secret` and are unreachable in production. Test coverage for these endpoints is unit-test-only (`packages/server/src/__tests__/routes/__test__.test.ts`)."

## Data flow (per-test lifecycle)

```
Worker N starts test
  │
  ▼
fixture: actor (worker-aware Page)
  │   - read testInfo.workerIndex = N
  │   - load storageState from e2e_wN.json
  │   - testInfo.annotations.push({ type: 'actor', description: 'e2e_wN' })
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

**Why "5x sequential in one job" is at-least-equivalent evidence to "5 separate CI runs":** the AC reads "5 consecutive green CI runs"; a literal reading would suggest 5 separate workflow invocations. 5x sequential in one job is _stricter_ in three ways: (a) every run uses the same Docker layer cache, the same DB seed, and the same JIT-warmed Node — so cache effects cannot mask a flake; (b) one failure aborts the chain immediately, vs. 5 separate runs where you'd discover failure asynchronously; (c) the runs share the same runner — eliminating the rare "this runner has a bad SSD" confound. Under any reasonable model of what the AC is trying to verify (deterministic absence of cross-worker contention), 5x in one job either matches or beats 5 separate runs.

**Removal criteria for `e2e-burst.yml`:** remove this temporary workflow when **issue #43's green-run counter reaches 14 consecutive green main runs at workers=4, retries=0** — the same threshold #43 uses to decide the e2e workflow flips to blocking. A separate follow-up issue is opened at PR creation time; its title is `Remove temporary e2e-burst.yml workflow_dispatch (post-#75)` and the closing condition is the #43 counter milestone. The workflow file itself includes a top-of-file comment pointing at the follow-up issue ID.

The regular `e2e` workflow on main runs at workers=4, retries=0 from merge onward; tracking issue #43's green-run counter resumes incrementing from there.

## Risks

1. **Global-state flakes (tags, public feed, search)** — a future test that creates a new tag at runtime would leak across workers (tags table is global, never reset). None of the 10 affected specs do this today. **Detection:** the pre-merge `e2e-burst.yml` (5 sequential runs at workers=4, retries=0) would surface global-state contention if it materialized within the PR. **Escalation path:** if a workers=4 flake post-merge involves tags/search, file under a #75 follow-up labeled `e2e-cross-worker-pool-extension`; the recommended remedy is per-worker schemas (alternative #2 in "Alternatives considered").
2. **`alice` / `carol` direct mutation leaks** — a future spec that mutates alice's bio or carol's avatar would leak across workers (their rows are never reset). No current spec does this. Flagged as a future hazard with the same escalation path as risk #1.
3. **`posts.forked_from_id ON DELETE SET NULL` cross-user side effect** — when worker N's posts are deleted, any forks owned by alice/carol/sibling workers will have their `forked_from_id` NULLed. No current spec asserts on cross-user fork relationships; flagged so a future fork-relationship spec is written with this in mind.
4. **`@no-reset` specs** — specs tagged `@no-reset` skip the reset entirely. **Verification step (concrete):** during implementation, run `grep -rn "@no-reset" e2e/specs/` to enumerate affected specs; run each locally once at workers=4 to confirm they still pass when the `actor` fixture is unused. Document the list in the PR description.
5. **Worker-pool size mismatch** — bumping `workers: 4` to 8 without expanding the pool throws via `actor` fixture validation. The error message is explicit (see fixture code) and points at both files that need to grow (`scripts/seed.sql` + `WORKER_USER_IDS` in `__test__.ts`). Loud failure, not silent contention.
6. **Hardcoded `testuser` references in specs** — Three known sites listed in "Spec migration"; one explicit grep is the verification step. If grep finds a fourth, treat as a hand-touch and document in the PR.

## Non-goals

- **Eliminating cross-worker visibility entirely** — pursued under per-worker schemas only if needed; not this PR.
- **Migrating Bruno tests to per-worker users** — Bruno is sequential; no contention to fix.
- **Splitting global vs. user-owned reset semantics in seed.sql** — legacy global path is preserved as-is for Bruno + manual reset paths.
- **Removing `retries: 1` from the Bruno workflow** — only the workers=4 e2e suite is affected by this change.
- **Adding Bruno coverage for `__test__/*` routes** — they are unreachable in production; unit-test-only coverage is the documented exception (see CLAUDE.md update in Components > Documentation).

## Process artifacts

- **Branch:** `fix/e2e-cross-worker-reset` (created off `main`).
- **PR target:** `main`.
- **Approved plan persistence:** after the Plan Review Gate passes and the user approves, the implementation plan is written to `.beads/plans/active-plan.md` per the CLAUDE.md "Context Recovery" protocol so a compaction-recovery agent can resume from disk.
- **Self-reflect before PR:** `/self-reflect` runs after the final work unit and the knowledge-base updates are committed, so learnings land atomically with the code in the PR per the CLAUDE.md "Pre-PR Knowledge Capture" rule.

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
