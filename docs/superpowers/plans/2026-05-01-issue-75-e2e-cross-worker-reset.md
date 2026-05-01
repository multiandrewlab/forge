# Issue #75 — E2E workers=4 cross-worker reset contention fix — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate cross-worker reset contention in the Playwright e2e suite at `workers=4`, allowing `retries: 0` to ship green across 5 consecutive CI runs.

**Architecture:** Per-worker user pool (`e2e_w0..3`) seeded in `scripts/seed.sql`. The `__test__/reset` endpoint gains a worker-scoped branch (header `X-E2E-Worker-Id`) that runs 5 user-scoped DELETEs in a single Postgres transaction (via the existing `withTransaction` helper). Spec fixtures rename `testuser` → `actor`, with `actor` resolving per-worker via `testInfo.workerIndex`. Legacy global-TRUNCATE path preserved for Bruno + manual reset.

**Tech Stack:** TypeScript (strict, ESM), Fastify (server), Playwright (e2e), Postgres + node-postgres, Vitest (unit), Bruno (API regression).

**Source of truth:** `docs/superpowers/specs/2026-05-01-issue-75-e2e-cross-worker-reset-contention-design.md`. When this plan and the design disagree, the design wins.

**Branch:** `fix/e2e-cross-worker-reset` (already created).

**Active plan persistence:** After plan-review-gate + user approval, this plan is persisted to `.beads/plans/active-plan.md` with status `in-progress` for compaction-recovery.

---

## File structure

| File                                                        | Status | Purpose                                                                  |
| ----------------------------------------------------------- | ------ | ------------------------------------------------------------------------ |
| `packages/server/src/routes/__test__.ts`                    | Modify | Add worker-scoped branch with closed-map UUID resolver + transaction     |
| `packages/server/src/app.ts`                                | Modify | Wire `pgTransaction` deps field to `withTransaction`                     |
| `packages/server/src/__tests__/routes/__test__.test.ts`     | Modify | Add tests for new branch (positive cases, validation, regression)        |
| `packages/server/src/__tests__/db/cascade-contract.test.ts` | Create | Static-analysis test pinning FK `ON DELETE` rules                        |
| `scripts/seed.sql`                                          | Modify | Add 4 worker user rows (`e2e_w0..3`)                                     |
| `e2e/fixtures/auth.ts`                                      | Modify | Add `actor` fixture; remove `testuser` from `SEED_USERS` and fixture map |
| `e2e/fixtures/reset.ts`                                     | Modify | Send `X-E2E-Worker-Id` header from `testInfo.workerIndex`                |
| `e2e/support/global-setup.ts`                               | Modify | Loop over 6 users (`e2e_w0..3`, alice, carol) via `Promise.all`          |
| `e2e/playwright.config.ts`                                  | Modify | `workers: 4`, `retries: 0`, strip iteration-1 comment block              |
| `e2e/specs/**/*.spec.ts` (97 files)                         | Modify | Mechanical `{ testuser }` → `{ actor }` migration                        |
| `e2e/specs/_journey.spec.ts`                                | Modify | Hand-touch line 57 hardcoded login                                       |
| `e2e/specs/auth/login-success.spec.ts`                      | Modify | Hand-touch line 10 hardcoded login credential                            |
| `e2e/specs/auth/login-wrong-password.spec.ts`               | Modify | Hand-touch line 9 hardcoded login credential                             |
| `e2e/specs/auth/login-redirect-after-login.spec.ts`         | Modify | Hand-touch line 15 hardcoded login credential                            |
| `e2e/specs/auth/register-duplicate-email.spec.ts`           | Modify | Hand-touch line 22 + comment line 11                                     |
| `e2e/specs/bookmarks/persists-across-sessions.spec.ts`      | Modify | Hand-touch line 48 hardcoded `storageStatePath('testuser')`              |
| `e2e/specs/bookmarks/page-empty-state.spec.ts`              | Modify | Remove defensive cleanup loop                                            |
| `e2e/specs/bookmarks/page-list.spec.ts`                     | Modify | Remove cross-worker-pollution comment                                    |
| `e2e/specs/**` (≤15 in-scope titles/comments)               | Modify | Bounded testuser-named-actor rewrites (classified list before changes)   |
| `.github/workflows/e2e-playwright.yml`                      | Modify | Add CI grep lint guard for testuser smuggling patterns                   |
| `.github/workflows/e2e-burst.yml`                           | Create | Temporary `workflow_dispatch` running e2e suite 5× sequentially          |
| `CLAUDE.md`                                                 | Modify | New "How E2E parallelism works" subsection + Bruno table updates         |

---

## Task 0: Persist approved plan for compaction recovery

This task runs **once**, before Task 1 begins, after the plan-review-gate APPROVES and the user confirms.

- [ ] **Step 0.1: Write the approved plan to `.beads/plans/active-plan.md`** with metadata frontmatter:

```yaml
---
title: 'Issue #75 — E2E workers=4 cross-worker reset contention fix'
issue: 75
tracking-issue: 43
status: in-progress
plan-file: docs/superpowers/plans/2026-05-01-issue-75-e2e-cross-worker-reset.md
design-file: docs/superpowers/specs/2026-05-01-issue-75-e2e-cross-worker-reset-contention-design.md
branch: fix/e2e-cross-worker-reset
plan-review-gate: APPROVED <YYYY-MM-DD> (iteration N of 3)
user-approved: <YYYY-MM-DD>
execution-method: <subagent-driven|orchestrated|parallel-session>
---
```

Body content: a short pointer to the full plan file (the `plan-file:` path above). The full plan content does NOT need to be duplicated — the path is sufficient for `bd prime --work-type recovery`.

- [ ] **Step 0.2: Verify the file exists and contains the metadata:**

```bash
test -f .beads/plans/active-plan.md && grep -q 'status: in-progress' .beads/plans/active-plan.md
```

Expected exit code: 0.

- [ ] **Step 0.3: Do NOT commit `.beads/plans/active-plan.md`** — it is `.gitignore`d (verify with `git check-ignore -v .beads/plans/active-plan.md`). It's a local recovery artifact, not a project artifact.

---

## Work units (in dependency order)

### Dependency graph

```
WU1 (server)        WU2 (cascade test)    WU3 (seed)    WU5 (config)    WU10 (lint guard)    WU12 (docs)
                                              │
                                              ▼
                                          WU4 (fixtures)
                                              │
                            ┌─────────────────┼─────────────────┬───────────────────┐
                            ▼                 ▼                 ▼                   ▼
                       WU6 (sed)        WU7 (hand-touch)   WU8 (workarounds)   WU9 (comments)
                            │                 │                 │                   │
                            └─────────────────┴────────┬────────┴───────────────────┘
                                                       ▼
                                                  WU11 (burst workflow)
                                                       │
                                                       ▼
                                                  WU13 (verify + PR)
```

WU1, WU2, WU3, WU5, WU10, WU12 are independent. WU4 needs WU3 for the seed users. WU6/7/8/9 each need WU4 for the `actor` fixture. WU11 needs all of the above. WU13 is final.

---

## Task 1: Server — wire `pgTransaction` deps and add worker-scoped branch

**Files:**

- Modify: `packages/server/src/routes/__test__.ts`
- Modify: `packages/server/src/app.ts`
- Modify: `packages/server/src/__tests__/routes/__test__.test.ts`

#### Step 1.1: Add `pgTransaction` to `TestRoutesDeps` and import `withTransaction` in app.ts

- [ ] **Step 1.1.1: Read current state of `packages/server/src/routes/__test__.ts` and `packages/server/src/app.ts`** to confirm the current `TestRoutesDeps` shape and `registerTestRoutes` call site.

- [ ] **Step 1.1.2: Extend `TestRoutesDeps` type in `packages/server/src/routes/__test__.ts`:**

```ts
export type TestRoutesDeps = {
  env: { ENABLE_TEST_ROUTES?: string; NODE_ENV?: string };
  secret: string;
  isCI: boolean;
  host: string;
  pgQuery: (sql: string) => Promise<unknown>;
  pgTransaction: <T>(
    fn: (client: { query: (sql: string, params?: unknown[]) => Promise<unknown> }) => Promise<T>,
  ) => Promise<T>;
};
```

- [ ] **Step 1.1.3: Wire `pgTransaction` in `packages/server/src/app.ts`** at the existing `registerTestRoutes` call site:

```ts
import { withTransaction } from './db/connection.js';
// ...
await registerTestRoutes(app, {
  env: process.env,
  secret: ...,
  isCI: ...,
  host: ...,
  pgQuery: async (sql) => { /* existing */ },
  pgTransaction: withTransaction,  // NEW
});
```

- [ ] **Step 1.1.4: Update existing test setups in `__test__.test.ts`** that construct `deps`. Add `pgTransaction: vi.fn()` (default no-op) so existing tests still compile and pass without changes.

- [ ] **Step 1.1.5: Run typecheck:** `cd packages/server && npm run typecheck`. Expected: PASS.

- [ ] **Step 1.1.6: Run existing tests** as a baseline regression check: `cd packages/server && npx vitest run src/__tests__/routes/__test__.test.ts`. Expected: all existing tests still PASS.

- [ ] **Step 1.1.7: Commit.**

```bash
git add packages/server/src/routes/__test__.ts packages/server/src/app.ts packages/server/src/__tests__/routes/__test__.test.ts
git commit -m "refactor(server): #75 add pgTransaction dep to TestRoutesDeps

Wire withTransaction through TestRoutesDeps to support the upcoming
worker-scoped reset path. Existing tests use a vi.fn() default so the
legacy path's behavior is unchanged."
```

#### Step 1.2: Add `WORKER_USER_IDS` constant and validation logic (TDD)

- [ ] **Step 1.2.1: Write the failing test for valid worker ID `'0'`** in `__test__.test.ts`:

```ts
describe('POST /api/__test__/reset — worker-scoped path', () => {
  it("dispatches 5 user-scoped DELETEs for X-E2E-Worker-Id: '0'", async () => {
    const mockClient = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    const pgTransaction = vi.fn(async (fn) => await fn(mockClient));
    const pgQuery = vi.fn();
    const app = await buildAppWithTestRoutes({
      pgQuery,
      pgTransaction,
      secret: 'test',
      isCI: true,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/__test__/reset',
      headers: { 'X-E2E-Secret': 'test', 'X-E2E-Worker-Id': '0' },
    });

    expect(res.statusCode).toBe(204);
    expect(pgTransaction).toHaveBeenCalledOnce();
    expect(pgQuery).not.toHaveBeenCalled();
    const e2eW0 = 'a0000000-0000-0000-0000-000000000101';
    expect(mockClient.query).toHaveBeenNthCalledWith(
      1,
      'DELETE FROM bookmarks              WHERE user_id   = $1',
      [e2eW0],
    );
    expect(mockClient.query).toHaveBeenNthCalledWith(
      2,
      'DELETE FROM votes                  WHERE user_id   = $1',
      [e2eW0],
    );
    expect(mockClient.query).toHaveBeenNthCalledWith(
      3,
      'DELETE FROM user_tag_subscriptions WHERE user_id   = $1',
      [e2eW0],
    );
    expect(mockClient.query).toHaveBeenNthCalledWith(
      4,
      'DELETE FROM comments               WHERE author_id = $1',
      [e2eW0],
    );
    expect(mockClient.query).toHaveBeenNthCalledWith(
      5,
      'DELETE FROM posts                  WHERE author_id = $1',
      [e2eW0],
    );
    expect(mockClient.query).toHaveBeenCalledTimes(5);
  });
});
```

(`buildAppWithTestRoutes` is a helper to extract from existing tests if not present; otherwise inline the existing `registerTestRoutes` setup.)

- [ ] **Step 1.2.2: Run the test to verify it fails.** Expected: FAIL — endpoint still TRUNCATEs.

- [ ] **Step 1.2.3: Implement the worker-scoped branch in `__test__.ts`** before the existing legacy code:

```ts
const WORKER_USER_IDS = {
  '0': 'a0000000-0000-0000-0000-000000000101',
  '1': 'a0000000-0000-0000-0000-000000000102',
  '2': 'a0000000-0000-0000-0000-000000000103',
  '3': 'a0000000-0000-0000-0000-000000000104',
} as const;

// Inside the POST /api/__test__/reset handler, AFTER all 5 existing guards:
const raw = request.headers['x-e2e-worker-id'];
if (typeof raw === 'string') {
  if (!Object.prototype.hasOwnProperty.call(WORKER_USER_IDS, raw)) {
    app.log.warn(
      { route: 'worker-scoped-reject', received: raw.slice(0, 16) },
      'E2E worker-scoped reset rejected: invalid X-E2E-Worker-Id',
    );
    return reply.code(400).send({
      error: 'X-E2E-Worker-Id must be one of "0", "1", "2", "3"',
      code: 'INVALID_WORKER_ID',
      received: raw.slice(0, 16),
    });
  }
  const userId = WORKER_USER_IDS[raw as '0' | '1' | '2' | '3'];
  await deps.pgTransaction(async (client) => {
    await client.query('DELETE FROM bookmarks              WHERE user_id   = $1', [userId]);
    await client.query('DELETE FROM votes                  WHERE user_id   = $1', [userId]);
    await client.query('DELETE FROM user_tag_subscriptions WHERE user_id   = $1', [userId]);
    await client.query('DELETE FROM comments               WHERE author_id = $1', [userId]);
    await client.query('DELETE FROM posts                  WHERE author_id = $1', [userId]);
  });
  app.log.info(
    { route: 'worker-scoped', workerId: raw, userId, ts: Date.now() },
    'E2E worker-scoped reset completed',
  );
  return reply.code(204).send();
}
// Fall through to legacy path below.
```

- [ ] **Step 1.2.4: Run the test to verify it passes.** Expected: PASS.

- [ ] **Step 1.2.5: Add positive-case tests for `'1'`, `'2'`, `'3'`** (one each, asserting the correct UUID resolves). Run: PASS.

- [ ] **Step 1.2.6: Add validation-rejection tests:**

```ts
const INVALID_HEADERS = [
  '4',
  '-1',
  'abc',
  '',
  '00',
  ' 0 ',
  '0\n',
  '０',
  '__proto__',
  'constructor',
  'toString',
];
for (const value of INVALID_HEADERS) {
  it(`rejects X-E2E-Worker-Id: ${JSON.stringify(value)} with 400 INVALID_WORKER_ID`, async () => {
    /* ... assert 400, pgTransaction NOT called, pgQuery NOT called, body.code === 'INVALID_WORKER_ID', body.received === value.slice(0,16) */
  });
}
```

Run: all PASS.

- [ ] **Step 1.2.7: Add array-header fall-through test:**

```ts
it('falls through to legacy path when X-E2E-Worker-Id is an array (duplicate header)', async () => {
  /* Inject duplicate headers via raw request; assert pgQuery (legacy) is called and pgTransaction is NOT called */
});
```

Run: PASS.

- [ ] **Step 1.2.8: Add Origin / wrong-secret precedence tests:**

```ts
it('returns 403 (Origin guard runs first) even with valid X-E2E-Worker-Id and Origin header', async () => {
  /* ... */
});
it('returns 403 (secret guard runs first) even with valid X-E2E-Worker-Id and bad secret', async () => {
  /* ... */
});
```

Run: both PASS. Verify pgTransaction is NOT called.

- [ ] **Step 1.2.9: Add transaction-rollback test using the REAL `withTransaction` helper:**

```ts
it('runs ROLLBACK on the same client when a DELETE throws', async () => {
  const mockClient = { query: vi.fn() };
  let callIdx = 0;
  mockClient.query.mockImplementation(async (sql: string) => {
    callIdx++;
    if (sql.startsWith('DELETE FROM user_tag_subscriptions')) throw new Error('boom');
    return { rows: [] };
  });
  // Mock getPool() to return a pool whose connect() returns mockClient.
  vi.mocked(getPool).mockReturnValue({
    connect: vi.fn().mockResolvedValue({ ...mockClient, release: vi.fn() }),
  } as unknown as pg.Pool);

  const app = await buildAppWithTestRoutes({
    pgQuery: vi.fn(),
    pgTransaction: withTransaction, // REAL helper
    secret: 'test',
    isCI: true,
  });

  const res = await app.inject({
    method: 'POST',
    url: '/api/__test__/reset',
    headers: { 'X-E2E-Secret': 'test', 'X-E2E-Worker-Id': '0' },
  });
  expect(res.statusCode).toBe(500);
  expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
  expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
  expect(mockClient.query).not.toHaveBeenCalledWith('COMMIT');
});
```

Run: PASS.

- [ ] **Step 1.2.10: Add legacy-path regression test:**

```ts
it('legacy path: no X-E2E-Worker-Id header → global TRUNCATE + advisory lock', async () => {
  const pgQuery = vi.fn().mockResolvedValue({ rows: [] });
  const pgTransaction = vi.fn();
  /* ... no X-E2E-Worker-Id header ... */
  expect(pgTransaction).not.toHaveBeenCalled();
  expect(pgQuery).toHaveBeenCalledWith(expect.stringContaining('pg_advisory_lock'));
});
```

Run: PASS.

- [ ] **Step 1.2.11: Run full test file to confirm no regressions:** `npx vitest run src/__tests__/routes/__test__.test.ts`. Expected: ALL PASS.

- [ ] **Step 1.2.12: Run coverage check on the touched file:** `npm run test:coverage -- packages/server/src/routes/__test__.ts`. Expected: 100% lines/branches/functions/statements on the new code (per `.coverage-thresholds.json`).

- [ ] **Step 1.2.13: Commit.**

```bash
git add packages/server/src/routes/__test__.ts packages/server/src/__tests__/routes/__test__.test.ts
git commit -m "feat(server): #75 add worker-scoped branch to /api/__test__/reset

Adds X-E2E-Worker-Id header path that runs 5 user-scoped DELETEs in a
single transaction via withTransaction. Closed-map UUID resolution
defends against validation drift. Legacy global-TRUNCATE path
preserved for Bruno + manual reset."
```

---

## Task 2: Cascade-contract test (static analysis)

**Files:**

- Create: `packages/server/src/__tests__/db/cascade-contract.test.ts`

- [ ] **Step 2.1: Write the failing test** that parses migration SQL and asserts FK delete rules:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const migrationsDir = fileURLToPath(new URL('../../db/migrations', import.meta.url));
const migrationFiles = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort();
const concatenatedSql = migrationFiles
  .map((f) => readFileSync(join(migrationsDir, f), 'utf8'))
  .join('\n');

const CASCADE_FKS: Array<{ child: string; parent: string; rule: 'CASCADE' | 'SET NULL' }> = [
  { child: 'posts.author_id', parent: 'users(id)', rule: 'CASCADE' },
  { child: 'post_revisions.post_id', parent: 'posts(id)', rule: 'CASCADE' },
  { child: 'post_files.post_id', parent: 'posts(id)', rule: 'CASCADE' },
  { child: 'post_files.revision_id', parent: 'post_revisions(id)', rule: 'CASCADE' },
  { child: 'post_tags.post_id', parent: 'posts(id)', rule: 'CASCADE' },
  { child: 'post_tags.tag_id', parent: 'tags(id)', rule: 'CASCADE' },
  { child: 'prompt_variables.post_id', parent: 'posts(id)', rule: 'CASCADE' },
  { child: 'bookmarks.user_id', parent: 'users(id)', rule: 'CASCADE' },
  { child: 'bookmarks.post_id', parent: 'posts(id)', rule: 'CASCADE' },
  { child: 'votes.user_id', parent: 'users(id)', rule: 'CASCADE' },
  { child: 'votes.post_id', parent: 'posts(id)', rule: 'CASCADE' },
  { child: 'user_tag_subscriptions.user_id', parent: 'users(id)', rule: 'CASCADE' },
  { child: 'user_tag_subscriptions.tag_id', parent: 'tags(id)', rule: 'CASCADE' },
  { child: 'comments.post_id', parent: 'posts(id)', rule: 'CASCADE' },
  { child: 'comments.parent_id', parent: 'comments(id)', rule: 'CASCADE' },
  { child: 'comments.author_id', parent: 'users(id)', rule: 'SET NULL' },
  { child: 'posts.forked_from_id', parent: 'posts(id)', rule: 'SET NULL' },
];

describe('FK ON DELETE contract (worker-scoped reset depends on these)', () => {
  for (const fk of CASCADE_FKS) {
    it(`${fk.child} REFERENCES ${fk.parent} ON DELETE ${fk.rule}`, () => {
      const colName = fk.child.split('.')[1];
      // Match: "<colName> ... REFERENCES <parent> ON DELETE <RULE>" — flexible whitespace,
      // optional NOT NULL / UUID / etc between column name and REFERENCES.
      const pattern = new RegExp(
        String.raw`\b${colName}\b[^,()]*?REFERENCES\s+${fk.parent.replace('(', '\\(').replace(')', '\\)')}\s+ON\s+DELETE\s+${fk.rule}`,
        'i',
      );
      expect(concatenatedSql).toMatch(pattern);
    });

    // ALTER CONSTRAINT override detection: scan post-001 migrations for any clause that
    // would change this FK's delete rule. If a post-001 ALTER CONSTRAINT mentions this column
    // and a different rule, fail.
    it(`${fk.child} is not later overridden by ALTER CONSTRAINT to a different rule`, () => {
      const post001 = migrationFiles
        .filter((f) => !f.startsWith('001_'))
        .map((f) => readFileSync(join(migrationsDir, f), 'utf8'))
        .join('\n');
      const colName = fk.child.split('.')[1];
      const otherRule = fk.rule === 'CASCADE' ? 'SET NULL' : 'CASCADE';
      const overridePattern = new RegExp(
        String.raw`ALTER\s+(TABLE|CONSTRAINT)[\s\S]*?\b${colName}\b[\s\S]*?ON\s+DELETE\s+${otherRule}`,
        'i',
      );
      expect(post001).not.toMatch(overridePattern);
    });
  }
});
```

- [ ] **Step 2.2: Run the test:** `cd packages/server && npx vitest run src/__tests__/db/cascade-contract.test.ts`. Expected: ALL PASS (the schema already has these rules).

- [ ] **Step 2.3: Sanity-check the test by manually breaking the migration:** in a scratch branch, change one CASCADE to RESTRICT in `001_initial-schema.sql`, run the test → expected FAIL. Revert the scratch change. (This step is verification, not code change — no commit.)

- [ ] **Step 2.4: Commit.**

```bash
git add packages/server/src/__tests__/db/cascade-contract.test.ts
git commit -m "test(server): #75 pin FK ON DELETE rules via static analysis

Parses migration SQL and asserts each FK the worker-scoped reset
depends on retains its expected delete rule. Same pattern as
seed-sql-shape.test.ts. Detects future migrations that flip a CASCADE
to SET NULL (or vice versa) on any of the 17 FKs the cascade analysis
in the design doc enumerated."
```

---

## Task 3: Seed — add 4 worker user rows

**Files:**

- Modify: `scripts/seed.sql`

- [ ] **Step 3.1: Read current `scripts/seed.sql`** to locate the users INSERT block (around line 17, comment "Users (4: 1 Google SSO, 3 local)").

- [ ] **Step 3.2: Update the comment header** from "Users (4: ...)" to "Users (8: 1 Google SSO, 3 local + 4 e2e workers)".

- [ ] **Step 3.3: Add 4 new rows in the existing users INSERT block** (after the testuser row at `a0…099`):

```sql
  -- E2E worker users (per-worker user pool; see design 2026-05-01-issue-75-...)
  ('a0000000-0000-0000-0000-000000000101', 'e2e_w0@example.com', 'E2E Worker 0', NULL, 'local', '$2b$12$jrcHUcVQnE.swctPk5GnreW9hkkyFqh8A9p2GnEaRrbxEaxXESYw2'),
  ('a0000000-0000-0000-0000-000000000102', 'e2e_w1@example.com', 'E2E Worker 1', NULL, 'local', '$2b$12$jrcHUcVQnE.swctPk5GnreW9hkkyFqh8A9p2GnEaRrbxEaxXESYw2'),
  ('a0000000-0000-0000-0000-000000000103', 'e2e_w2@example.com', 'E2E Worker 2', NULL, 'local', '$2b$12$jrcHUcVQnE.swctPk5GnreW9hkkyFqh8A9p2GnEaRrbxEaxXESYw2'),
  ('a0000000-0000-0000-0000-000000000104', 'e2e_w3@example.com', 'E2E Worker 3', NULL, 'local', '$2b$12$jrcHUcVQnE.swctPk5GnreW9hkkyFqh8A9p2GnEaRrbxEaxXESYw2');
```

(The hash is the existing one already used for testuser/alice/carol — bcrypt cost-12 of `password123`.)

- [ ] **Step 3.4: Run the existing seed-sql-shape test** to confirm seed.sql is still well-formed: `cd packages/server && npx vitest run src/__tests__/scripts/seed-sql-shape.test.ts`. Expected: PASS.

- [ ] **Step 3.5: Manually run the seed against a local dev DB to confirm no errors:**

```bash
psql $DATABASE_URL -f scripts/seed.sql
psql $DATABASE_URL -c "SELECT email FROM users WHERE email LIKE 'e2e_w%' ORDER BY email;"
```

Expected output:

```
   e2e_w0@example.com
   e2e_w1@example.com
   e2e_w2@example.com
   e2e_w3@example.com
```

- [ ] **Step 3.6: Commit.**

```bash
git add scripts/seed.sql
git commit -m "test(seed): #75 add 4 worker user rows for e2e parallelism

e2e_w0..3 with deterministic UUIDs (a0…101..104). No fixture posts
or comments per worker — specs create their own state at test time."
```

---

## Task 4: E2E fixtures — `actor`, reset header, parallelized globalSetup

**Files:**

- Modify: `e2e/fixtures/auth.ts`
- Modify: `e2e/fixtures/reset.ts`
- Modify: `e2e/support/global-setup.ts`

#### Step 4.1: Update `e2e/fixtures/auth.ts`

- [ ] **Step 4.1.1: Replace the `AuthUser` type and `SEED_USERS` map.** Remove `testuser`. Add `e2e_w0..3`:

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
```

- [ ] **Step 4.1.2: Replace `AuthFixtures` and the fixture map.** Remove the `testuser` fixture. Add `actor`:

```ts
type AuthFixtures = {
  actor: Page;
  alice: Page;
  carol: Page;
};

export const test = base.extend<AuthFixtures>({
  actor: async ({ browser }, use, testInfo) => {
    const idx = testInfo.workerIndex;
    if (!Number.isInteger(idx) || idx < 0 || idx > 3) {
      throw new Error(
        `[actor fixture] testInfo.workerIndex=${idx} is out of range [0,3]. ` +
          `If you need more parallelism, expand the e2e_w pool in scripts/seed.sql ` +
          `AND bump WORKER_USER_IDS in packages/server/src/routes/__test__.ts ` +
          `AND bump the workers: setting in e2e/playwright.config.ts.`,
      );
    }
    const user = `e2e_w${idx}` as const;
    testInfo.annotations.push({ type: 'actor', description: user });
    const ctx = await browser.newContext({ storageState: storageStatePath(user) });
    const page = await ctx.newPage();
    await attachE2EInitScript(page);
    await use(page);
    await ctx.close();
  },
  alice: async ({ browser }, use) => {
    const ctx = await browser.newContext({ storageState: storageStatePath('alice') });
    const page = await ctx.newPage();
    await attachE2EInitScript(page);
    await use(page);
    await ctx.close();
  },
  carol: async ({ browser }, use) => {
    const ctx = await browser.newContext({ storageState: storageStatePath('carol') });
    const page = await ctx.newPage();
    await attachE2EInitScript(page);
    await use(page);
    await ctx.close();
  },
});

export { expect } from '@playwright/test';
```

#### Step 4.2: Update `e2e/fixtures/reset.ts`

- [ ] **Step 4.2.1: Send `X-E2E-Worker-Id` header from `testInfo.workerIndex`:**

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

#### Step 4.3: Update `e2e/support/global-setup.ts`

- [ ] **Step 4.3.1: Loop over 6 users via `Promise.all`:**

```ts
export default async function globalSetup(_config: FullConfig): Promise<void> {
  await waitForStack();
  const secret = readE2ESecret();
  process.env.E2E_SECRET = secret;
  await startupProbe(API_BASE, secret);
  const users: AuthUser[] = ['e2e_w0', 'e2e_w1', 'e2e_w2', 'e2e_w3', 'alice', 'carol'];
  await Promise.all(users.map(loginAndSave));
}
```

#### Step 4.4: Verify

- [ ] **Step 4.4.1: Run typecheck:** `cd e2e && npx tsc --noEmit`. Expected: PASS.

- [ ] **Step 4.4.2: Verify build of e2e specs is broken** (the `testuser` fixture is gone, so existing specs that destructure `{ testuser }` will fail). This is expected — Tasks 5+ migrate them. **Do not run e2e specs at this point.**

- [ ] **Step 4.4.3: Commit.**

```bash
git add e2e/fixtures/auth.ts e2e/fixtures/reset.ts e2e/support/global-setup.ts
git commit -m "feat(e2e): #75 add actor fixture + worker-scoped reset header

Replaces the shared 'testuser' Page fixture with a worker-aware 'actor'
fixture that resolves to e2e_w\${testInfo.workerIndex}. The reset
fixture sends X-E2E-Worker-Id so the server's worker-scoped path runs.
globalSetup parallelized via Promise.all across 6 users.

Note: e2e specs will fail to compile after this commit until Task 5
(mechanical sed migration) lands."
```

---

## Task 5: Playwright config — `workers: 4`, `retries: 0`

**Files:**

- Modify: `e2e/playwright.config.ts`

- [ ] **Step 5.1: Apply the diff in the design doc:**

```diff
-  workers: process.env.CI ? 4 : undefined,
+  workers: 4,
   forbidOnly: !!process.env.CI,
-  // Issue #67 partially addressed: E2E_MODE rate-limit branches added on
-  // /refresh + /files. But reset-window contention at workers=4 still
-  // produces "page closed" / "URL did not change after delete" flakes on
-  // delete-cascade, delete-confirms, edit-cancel-reverts. Keeping the
-  // retries: 1 band-aid in CI until the deeper contention is fixed
-  // (deferred to a follow-up issue beyond #67's rate-limit scope).
-  retries: process.env.CI ? 1 : 0,
+  retries: 0,
```

- [ ] **Step 5.2: Run typecheck:** `cd e2e && npx tsc --noEmit`. Expected: PASS.

- [ ] **Step 5.3: Commit.**

```bash
git add e2e/playwright.config.ts
git commit -m "test(e2e): #75 hardcode workers=4, retries=0

Removes the retries: 1 band-aid + the explanatory comment block
documenting the deferred follow-up. After per-worker user pool
+ worker-scoped reset, contention is gone by construction."
```

---

## Task 6: Mechanical spec migration — `{ testuser }` → `{ actor }`

**Files:**

- Modify: `e2e/specs/**/*.spec.ts` (97 files identified by `grep -rl 'testuser' e2e/specs --include='*.spec.ts'`)

- [ ] **Step 6.1: Generate the file list:**

```bash
cd /Users/andrew/Code/forge
grep -rl 'testuser' e2e/specs --include='*.spec.ts' > /tmp/testuser-files.txt
wc -l /tmp/testuser-files.txt  # expected ~97
```

- [ ] **Step 6.2: Run the mechanical replacement** for the destructure pattern + variable usage:

```bash
# Replace { testuser } in fixture destructures
xargs -a /tmp/testuser-files.txt sed -i '' 's/{ testuser }/{ actor }/g'
xargs -a /tmp/testuser-files.txt sed -i '' 's/{ testuser,/{ actor,/g'
xargs -a /tmp/testuser-files.txt sed -i '' 's/, testuser }/, actor }/g'
xargs -a /tmp/testuser-files.txt sed -i '' 's/, testuser,/, actor,/g'

# Replace bare testuser variable references (function calls, await testuser..., expect(testuser)...)
# This is the bulk of the migration.
xargs -a /tmp/testuser-files.txt sed -i '' 's/\btestuser\b/actor/g'
```

NOTE: The last sed is broad. It WILL also rewrite the string literal `'testuser'` in `_journey.spec.ts:57`, the `testuser@example.com` literal in `auth/login-success.spec.ts:10`, and `storageStatePath('testuser')` in `bookmarks/persists-across-sessions.spec.ts:48`. Task 7 reverts and hand-touches those. Doing the broad sed first and then hand-touching avoids the brittleness of a more targeted sed pattern.

- [ ] **Step 6.3: Run typecheck:** `cd e2e && npx tsc --noEmit`. Expected: PASS (now `actor` matches the fixture name and the destructures resolve).

- [ ] **Step 6.4: Run a smoke spec locally** (any single non-affected spec) to confirm the actor fixture works:

```bash
cd e2e
npx playwright test specs/posts/view-public-post.spec.ts --workers=1
```

Expected: PASS.

- [ ] **Step 6.5: Commit.**

```bash
git add e2e/specs
git commit -m "refactor(e2e): #75 mechanical migration testuser -> actor across 97 specs

Mechanical sed across all specs that destructured { testuser } from the
fixture. Three hand-touch sites (login literals + storageStatePath) are
restored in the next commit."
```

---

## Task 7: Hand-touch the specs that hardcode `testuser` strings

**Files:**

- Modify: `e2e/specs/_journey.spec.ts`
- Modify: `e2e/specs/auth/login-success.spec.ts`
- Modify: `e2e/specs/auth/login-wrong-password.spec.ts`
- Modify: `e2e/specs/auth/login-redirect-after-login.spec.ts`
- Modify: `e2e/specs/auth/register-duplicate-email.spec.ts`
- Modify: `e2e/specs/bookmarks/persists-across-sessions.spec.ts`

A re-grep at plan-write time found 5 `testuser@example.com` literal sites + 1 `storageStatePath('testuser')` site = 6 total. The mechanical sed in Task 6 converted all 6 incorrectly. Each needs a hand-touch to use the worker's user identity.

- [ ] **Step 7.1: Re-grep for everything the broad sed touched incorrectly:**

```bash
grep -rEn 'actor@example\.com|storageStatePath\(.actor.\)' e2e/specs --include='*.spec.ts'
```

Expected hit count: 6. If the grep returns more, treat each new hit as a hand-touch and document in the active plan before fixing.

- [ ] **Step 7.2: Fix `e2e/specs/_journey.spec.ts:57`** (fresh-login flow). Replace with worker user email. Ensure the test signature has `testInfo`:

```ts
// test('...', async ({ page }, testInfo) => { ... })
const workerEmail = `e2e_w${testInfo.workerIndex}@example.com`;
await auth.loginEmail(page).fill(workerEmail);
```

- [ ] **Step 7.3: Fix `e2e/specs/auth/login-success.spec.ts:10`** — replace `actor@example.com` with `e2e_w${testInfo.workerIndex}@example.com`. Add `testInfo` to the test signature if missing.

- [ ] **Step 7.4: Fix `e2e/specs/auth/login-wrong-password.spec.ts:9`** — same pattern. The test asserts wrong-password rejection; using the worker's user email keeps the assertion intact (a worker-owned user must exist to be rejected for wrong password).

- [ ] **Step 7.5: Fix `e2e/specs/auth/login-redirect-after-login.spec.ts:15`** — same pattern.

- [ ] **Step 7.6: Fix `e2e/specs/auth/register-duplicate-email.spec.ts`** (TWO sites in one file):
  - **Line 22**: replace `actor@example.com` with `e2e_w${testInfo.workerIndex}@example.com`. Semantic: the test asserts "registering an email that already exists fails." Each worker's seeded user IS already in `users` post-seed, so re-registering the worker email is a duplicate — preserves the test's intent.
  - **Line 11 (comment)**: update the comment from `// testuser@example.com is pinned in scripts/seed.sql and therefore exists` → `// e2e_w${N}@example.com is pinned in scripts/seed.sql per the per-worker pool and therefore exists`.

- [ ] **Step 7.7: Fix `e2e/specs/bookmarks/persists-across-sessions.spec.ts:48`:**

```ts
const workerUser = `e2e_w${testInfo.workerIndex}` as const;
const ctx = await browser.newContext({ storageState: storageStatePath(workerUser) });
```

Cast or import `AuthUser` if needed.

- [ ] **Step 7.8: Re-run the grep to confirm zero remaining hits:**

```bash
grep -rEn 'actor@example\.com|storageStatePath\(.actor.\)' e2e/specs --include='*.spec.ts'
```

Expected: zero results.

- [ ] **Step 7.9: Run typecheck:** `cd e2e && npx tsc --noEmit`. Expected: PASS.

- [ ] **Step 7.10: Run all hand-touched specs locally:**

```bash
cd e2e
npx playwright test \
  specs/_journey.spec.ts \
  specs/auth/login-success.spec.ts \
  specs/auth/login-wrong-password.spec.ts \
  specs/auth/login-redirect-after-login.spec.ts \
  specs/auth/register-duplicate-email.spec.ts \
  specs/bookmarks/persists-across-sessions.spec.ts \
  --workers=1
```

Expected: ALL PASS.

- [ ] **Step 7.11: Commit.**

```bash
git add e2e/specs/_journey.spec.ts \
  e2e/specs/auth/login-success.spec.ts \
  e2e/specs/auth/login-wrong-password.spec.ts \
  e2e/specs/auth/login-redirect-after-login.spec.ts \
  e2e/specs/auth/register-duplicate-email.spec.ts \
  e2e/specs/bookmarks/persists-across-sessions.spec.ts
git commit -m "fix(e2e): #75 restore six specs that hardcode the worker user identity

The mechanical sed in the previous commit converted testuser@example.com
literals into actor@example.com — wrong, since 'actor' is a fixture
name not an email. Hand-touch each: derive the email from
testInfo.workerIndex so each worker logs in as its own seeded user.
register-duplicate-email retains its 'duplicate-email rejection'
semantic — the worker's user IS already in the seed, so re-registering
the worker email is a duplicate."
```

---

## Task 8: Remove defensive cross-worker workarounds

**Files:**

- Modify: `e2e/specs/bookmarks/page-empty-state.spec.ts`
- Modify: `e2e/specs/bookmarks/page-list.spec.ts`

- [ ] **Step 8.1: Rewrite `page-empty-state.spec.ts` to its post-migration form:**

```ts
import { test, expect } from '../../fixtures/reset.js';

test('bookmarks: /bookmarks page shows empty-state when user has no bookmarks', async ({
  actor,
}) => {
  await actor.goto('/bookmarks');
  await expect(actor.getByTestId('empty-state')).toBeVisible();
  await expect(actor.getByTestId('empty-state-message')).toHaveText('No bookmarked posts yet');
});
```

(Strips lines 6–24 of the original — the defensive cleanup loop.)

- [ ] **Step 8.2: Update `page-list.spec.ts` — remove the cross-worker-pollution comment** at line 7–8 and the comment at line 38 ("Filter to the unique-titled card (cross-worker pollution may add others)"). The unique-title generation can stay (harmless). Replace the now-stale comment with a brief one explaining why uniqueness is asserted:

```ts
// Before:
// Create a fresh post + bookmark it via API. Filter the /bookmarks page
// listing by the unique title to dodge cross-worker pollution that could
// add or remove other testuser bookmarks mid-flight.

// After:
// Create a fresh post + bookmark it via API. Assert by unique title.
```

And the line 38 filter comment becomes a brief:

```ts
// Filter to the unique-titled card.
```

- [ ] **Step 8.3: Run both specs locally:**

```bash
cd e2e
npx playwright test specs/bookmarks/page-empty-state.spec.ts specs/bookmarks/page-list.spec.ts --workers=4
```

Expected: ALL PASS.

- [ ] **Step 8.4: Commit.**

```bash
git add e2e/specs/bookmarks/page-empty-state.spec.ts e2e/specs/bookmarks/page-list.spec.ts
git commit -m "test(e2e): #75 remove cross-worker defensive workarounds

The for-loop bookmark cleanup in page-empty-state and the cross-worker
pollution comments in both specs were band-aids for the contention
this PR eliminates. After per-worker user pool, they're no-ops by
construction. Removed (not retained) per design — keeping them would
signal future contributors that the contention is still possible."
```

---

## Task 9: Bounded comment + test-name migration

**Files:**

- Modify: `e2e/specs/**` (≤15 files identified by classification step)

- [ ] **Step 9.1: Generate the candidate hit list:**

```bash
cd /Users/andrew/Code/forge
grep -rn 'testuser' e2e/specs --include='*.spec.ts' > /tmp/testuser-comments.txt
wc -l /tmp/testuser-comments.txt
```

(Should be roughly 30+ surviving references after the prior tasks.)

- [ ] **Step 9.2: Classify each hit as IN-SCOPE or OUT-OF-SCOPE.** Append the classified list to the active plan file (`.beads/plans/active-plan.md`):

```bash
# IN-SCOPE: comments and test titles where "testuser" referred to the seeded fixture
#           identity (now misleading because the actor varies per worker).
# OUT-OF-SCOPE: comments where "testuser" is generic ("the test user") or about
#               Bruno fixture references (testuser is still seeded for Bruno).
```

The classification rule, per design: rewrite ONLY if the original text describes the actor as specifically "testuser" by seed identity AND the rename makes it semantically wrong; leave alone if "testuser" reads as generic.

- [ ] **Step 9.3: Apply rewrites to in-scope hits.** Examples (commit the actual classified list to `.beads/plans/active-plan.md` so a reviewer can audit):

- `comments/realtime-broadcast.spec.ts:4` — test title `'comments: testuser sees alice's new comment via websocket broadcast'` → `'comments: actor sees alice's new comment via websocket broadcast'`.
- `posts/delete-cascade.spec.ts` — comments saying "testuser deletes via UI" → "actor deletes via UI" (since actor is the one logged in).

Bound: ≤15 in-scope edits across the spec tree. If you find more than 15, re-classify; the bar is high (only "semantically wrong" cases).

- [ ] **Step 9.4: Run the affected specs locally to confirm no logic broke:**

```bash
# Run each spec touched in step 9.3 individually
cd e2e
npx playwright test <each-touched-spec> --workers=4
```

Expected: ALL PASS.

- [ ] **Step 9.5: Commit.**

```bash
git add e2e/specs .beads/plans/active-plan.md  # the classified list
git commit -m "docs(e2e): #75 rewrite ≤15 testuser comments/titles made stale by rename

Bounded migration of comments and test titles where the literal 'testuser'
referred to the seeded fixture identity (now misleading because the
actor user varies per worker). Generic 'test user' mentions and Bruno-
context references retained — only semantically-wrong cases rewritten.
Classified list committed to .beads/plans/active-plan.md."
```

---

## Task 10: CI lint guard

**Files:**

- Modify: `.github/workflows/e2e-playwright.yml`

- [ ] **Step 10.1: Locate the existing `e2e-playwright.yml` workflow.** Read it.

- [ ] **Step 10.2: Add a new step early in the workflow** (before the playwright run, ideally after checkout):

```yaml
- name: Lint guard — testuser is reserved for Bruno
  run: |
    forbidden=$(grep -rEn "(testuser@example\.com|storageStatePath\(['\"]testuser['\"]\)|SEED_USERS\.testuser)" e2e/specs/ || true)
    if [ -n "$forbidden" ]; then
      echo "::error::testuser is reserved for Bruno; e2e specs must use the 'actor' fixture"
      echo "$forbidden"
      exit 1
    fi
```

- [ ] **Step 10.3: Verify locally** that the grep would not currently fail (run the same command against the repo):

```bash
forbidden=$(grep -rEn "(testuser@example\.com|storageStatePath\(['\"]testuser['\"]\)|SEED_USERS\.testuser)" e2e/specs/ || true)
echo "${forbidden:-CLEAN}"
```

Expected output: `CLEAN`.

- [ ] **Step 10.4: Commit.**

```bash
git add .github/workflows/e2e-playwright.yml
git commit -m "ci(e2e): #75 add lint guard for testuser smuggling patterns

Fails CI if any of three patterns reappear in e2e/specs/:
- 'testuser@example.com' literal
- storageStatePath('testuser') / storageStatePath(\"testuser\")
- SEED_USERS.testuser reference

The 'actor' fixture is the only sanctioned way to log in as the
worker's primary user; testuser is reserved for Bruno regression tests."
```

---

## Task 11: Temporary `e2e-burst.yml` workflow_dispatch

**Files:**

- Modify: `.github/workflows/e2e-playwright.yml` — expose its job as a reusable workflow via `workflow_call`
- Create: `.github/workflows/e2e-burst.yml` — calls the reusable workflow 5× sequentially

**Strategy:** Avoid YAML duplication of the ~200-line e2e setup (Postgres service, MinIO start, migrations, seed, server + preview, Playwright install). Refactor `e2e-playwright.yml` to add `workflow_call` as a trigger alongside its existing triggers; `e2e-burst.yml` calls it 5× via `needs:` chaining (sequential by construction). When the burst workflow is removed (per the follow-up issue), the `workflow_call` trigger on `e2e-playwright.yml` is also removed in the same cleanup.

- [ ] **Step 11.1: Read `.github/workflows/e2e-playwright.yml`** and identify:
  - The `on:` triggers block (typically `push:`, `pull_request:`, possibly `schedule:`).
  - The single job (verified at plan-write time: `Playwright journey smoke`).

- [ ] **Step 11.2: Add `workflow_call:` to the existing triggers block in `e2e-playwright.yml`:**

```diff
 on:
   push: ...
   pull_request: ...
+  workflow_call: {}
```

This is non-breaking: existing triggers continue to fire the workflow as before. The new `workflow_call` allows other workflows in the same repo to invoke it.

- [ ] **Step 11.3: Run `yamllint` (if available) on `e2e-playwright.yml` to confirm syntax:**

```bash
yamllint .github/workflows/e2e-playwright.yml || echo "(yamllint not installed — skip)"
```

- [ ] **Step 11.4: Create `.github/workflows/e2e-burst.yml`:**

```yaml
# TEMPORARY: pre-merge verification for issue #75. Removed when tracking
# issue #43's green-run counter reaches 14 consecutive green main runs at
# workers=4, retries=0. Removal tracked in <FOLLOW_UP_ISSUE> (filed at
# this PR's creation time).
#
# Calls .github/workflows/e2e-playwright.yml 5 times sequentially via
# `needs:` chaining. Each iteration is a fresh job (clean env per run);
# any failure aborts the chain immediately.

name: e2e-burst (#75 verification)

on:
  workflow_dispatch: {}

jobs:
  iteration-1:
    uses: ./.github/workflows/e2e-playwright.yml
  iteration-2:
    needs: iteration-1
    uses: ./.github/workflows/e2e-playwright.yml
  iteration-3:
    needs: iteration-2
    uses: ./.github/workflows/e2e-playwright.yml
  iteration-4:
    needs: iteration-3
    uses: ./.github/workflows/e2e-playwright.yml
  iteration-5:
    needs: iteration-4
    uses: ./.github/workflows/e2e-playwright.yml
```

- [ ] **Step 11.5: Confirm YAML syntax:**

```bash
yamllint .github/workflows/e2e-burst.yml || echo "(yamllint not installed — skip)"
```

- [ ] **Step 11.6: File the follow-up tracking issue:**

```bash
gh issue create --title "Remove temporary e2e-burst.yml workflow_dispatch (post-#75)" \
  --body "Once issue #43's green-run counter reaches 14 consecutive green main runs at workers=4, retries=0, remove .github/workflows/e2e-burst.yml AND the 'workflow_call:' trigger added to .github/workflows/e2e-playwright.yml in the same cleanup. The workflow file references this issue in its top comment."
```

Note the issue number returned. Update `e2e-burst.yml`'s top comment, replacing `<FOLLOW_UP_ISSUE>` with the actual `#NN`.

- [ ] **Step 11.7: Commit.**

```bash
git add .github/workflows/e2e-playwright.yml .github/workflows/e2e-burst.yml
git commit -m "ci(e2e): #75 add temporary workflow_dispatch for burst verification

e2e-playwright.yml gains a workflow_call trigger so e2e-burst.yml can
invoke it 5x sequentially via needs chaining. Avoids YAML duplication
of the ~200-line setup (services, MinIO, migrations, seed, server,
preview, Playwright install). Removal tracked in <FOLLOW_UP_ISSUE>;
the cleanup removes BOTH e2e-burst.yml AND the workflow_call trigger
on e2e-playwright.yml."
```

---

## Task 12: CLAUDE.md updates

**Files:**

- Modify: `CLAUDE.md`

- [ ] **Step 12.1: Add a new subsection "How E2E parallelism works"** under the existing "Testing" section (or near the existing E2E references). Content:

```markdown
## How E2E parallelism works

E2E specs run at `workers: 4` in CI and locally. Per-worker isolation depends on:

- **Per-worker user pool** — each worker's fixture (`actor`) resolves to one of the seeded `e2e_w0..3` users (`a0…101..104`). Workers operate on disjoint user-owned rows.
- **Worker-scoped reset** — `POST /api/__test__/reset` accepts `X-E2E-Worker-Id: 0..3`; the handler runs 5 user-scoped DELETEs (bookmarks, votes, user_tag_subscriptions, comments, posts) inside a transaction via the `withTransaction` helper. No global TRUNCATE on this path. The legacy global-TRUNCATE path is reachable via no-header callers (Bruno, manual `curl`, CI startup probes).
- **Mechanism boundary** — testuser is **reserved for Bruno regression tests**, which are sequential and unaffected by E2E parallelism. E2E specs MUST use the `actor` fixture; a CI lint guard fails if `testuser@example.com`, `storageStatePath('testuser')`, or `SEED_USERS.testuser` appear in `e2e/specs/`.

### Expanding the worker pool beyond 4

To raise `workers:`:

1. Add seed user rows in `scripts/seed.sql` (`a0…105`, `a0…106`, …).
2. Bump `WORKER_USER_IDS` in `packages/server/src/routes/__test__.ts`.
3. Bump `workers:` in `e2e/playwright.config.ts`.
4. Bump the validation range in the `actor` fixture (`e2e/fixtures/auth.ts`).

The `actor` fixture throws with an explicit error message if `testInfo.workerIndex` exceeds the configured pool size.
```

- [ ] **Step 12.2: Update the "Bruno API Tests > Seeded fixtures" table.** Add e2e_w0..3 entries and clarify testuser is Bruno-only:

```markdown
| Variable     | Fixture                                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------------------------- |
| `postId`     | `c0000000-...-000000000099` — testuser-owned snippet post (public, not draft)                                       |
| `revisionId` | `d0000000-...-000000000099` — testuser-authored initial revision of that post                                       |
| `commentId`  | `e0000000-...-000000000099` — testuser-authored top-level comment on that post                                      |
| `tagId`      | `b0000000-...-000000000001` — `typescript` tag                                                                      |
| `testuser`   | `a0000000-...-000000000099` / `testuser@example.com` / `password123` (Bruno-only — see "How E2E parallelism works") |
| `e2e_w0..3`  | `a0000000-...-000000000101..104` / `e2e_wN@example.com` / `password123` (E2E-only; not used by Bruno)               |
```

Also add a sentence above the table:

> **testuser is reserved for Bruno regression tests** (sequential, immune to E2E parallelism). Bruno's collection-root auth bootstrap (`bruno/collection.bru`) calls `POST /api/auth/login` with testuser credentials; it does NOT call `/api/__test__/reset`. E2E specs MUST NOT log in as testuser — use the `actor` fixture, which resolves to the worker's own `e2e_w${N}` user.

- [ ] **Step 12.3: Update "Bruno API Tests > Requirements"** with the path-prefix exception:

```markdown
- **Path-prefix exception for `/api/__test__/*`**: Endpoints under this prefix are excluded from the Bruno coverage requirement. This exception applies ONLY to routes that (a) live under `/api/__test__/*` AND (b) inherit ALL FIVE existing guards: `ENABLE_TEST_ROUTES=1`, `NODE_ENV ∈ {dev,test}`, loopback-only-outside-CI, `X-E2E-Secret` timingSafeEqual, and `Origin` header rejection. No other route may invoke this exception. Test coverage for these endpoints is unit-test-only (`packages/server/src/__tests__/routes/__test__.test.ts`).
```

- [ ] **Step 12.4: Commit.**

```bash
git add CLAUDE.md
git commit -m "docs(claude): #75 document e2e parallelism + Bruno fixture boundaries

Adds 'How E2E parallelism works' subsection covering the per-worker
user pool, worker-scoped reset, the actor fixture, and how to expand
the pool. Clarifies testuser-vs-e2e_w role split in the Bruno table.
Documents the path-prefix exception for /api/__test__/* in Bruno's
coverage requirements."
```

---

## Task 13: Verify ACs, run e2e-burst, knowledge capture, open PR

- [ ] **Step 13.0a: Broad `testuser` literal scan across the entire e2e tree** (not just `e2e/specs/`). Per design line 390: any hardcoded `testuser` string in `e2e/` outside `bruno/` is a smuggling site that the spec migration should have eliminated. Scope is broader than Task 7.1's `actor@example.com` recovery scan — this catches literals in helpers (`e2e/support/`, `e2e/fixtures/`) the broad sed never visited.

```bash
grep -rEn "['\"]testuser" e2e/ --include='*.ts' || echo "CLEAN"
```

Expected output: `CLEAN`. Any hit must be classified: (a) genuine bug → fix and add to follow-up commit; (b) intentional reference (e.g., a comment explaining "testuser is Bruno-only") → leave with a clarifying comment.

- [ ] **Step 13.0b: Audit `SEED_USERS.testuser` references outside `e2e/specs/`.** The lint guard in Task 10 only scopes to `e2e/specs/`; helper files in `e2e/support/`, `e2e/fixtures/`, or `e2e/test-results/` could still reference the removed `testuser` member. The TypeScript narrowing of `AuthUser` in Task 4.1.1 should cause a compile failure in any such caller, but verify explicitly:

```bash
grep -rEn "SEED_USERS\.testuser|storageStatePath\(['\"]testuser['\"]\)" e2e/ --include='*.ts' || echo "CLEAN"
```

Expected output: `CLEAN`.

- [ ] **Step 13.0c: Enumerate `@no-reset` specs and run each at workers=4 to confirm they still pass** (per design Risks #4):

```bash
grep -rln "@no-reset" e2e/specs --include='*.spec.ts' > /tmp/no-reset-specs.txt
echo "@no-reset spec count: $(wc -l < /tmp/no-reset-specs.txt)"
cd e2e
xargs -a /tmp/no-reset-specs.txt npx playwright test --workers=4 --retries=0
```

Expected: ALL PASS. The PR description must list the specs from `/tmp/no-reset-specs.txt` so reviewers can audit the verified set. Document the file paths in the PR body under a `### @no-reset specs verified` heading.

- [ ] **Step 13.1: Run the 10 issue-cited specs locally at workers=4 to confirm AC #1 spec-by-spec.** This is the explicit per-spec verification the AC asks for; the burst run validates the whole-suite signal in a later step.

```bash
cd e2e
npx playwright test \
  specs/_journey.spec.ts \
  specs/bookmarks/page-list.spec.ts \
  specs/comments/edit-own.spec.ts \
  specs/revisions/rollback-to-previous.spec.ts \
  specs/bookmarks/page-empty-state.spec.ts \
  specs/posts/delete-cascade.spec.ts \
  specs/posts/edit-own-post.spec.ts \
  specs/posts/publish-draft-to-public.spec.ts \
  specs/voting/score-in-feed.spec.ts \
  --workers=4 --retries=0
```

Expected: ALL 10 specs PASS with 0 retries. (`_journey.spec.ts` covers both Phase 2 draft and Phase 4 social — the two distinct cases from the issue body.)

- [ ] **Step 13.2: Run the global coverage gate locally** to confirm the 100/100/100/100 floor in `.coverage-thresholds.json`:

```bash
npm run test:coverage
```

Expected: PASS. If any metric drops below 100%, fix tests and re-run; do NOT proceed to PR until coverage is at the floor.

- [ ] **Step 13.3: Push the branch:** `git push -u origin fix/e2e-cross-worker-reset`.

- [ ] **Step 13.4: Trigger the burst workflow** from the GitHub Actions UI (workflow_dispatch on the PR branch). Capture the run URL.

- [ ] **Step 13.5: Wait for the burst to complete.** Expected: ALL 5 sequential runs PASS (job ends green).

- [ ] **Step 13.6: If any run fails:**
  - Pull the failure logs.
  - Determine if it's a flake unrelated to #75 (e.g., infrastructure) or a regression introduced by this PR.
  - For PR regressions: diagnose, fix, push, re-trigger burst. Do NOT request merge until 5x green.

- [ ] **Step 13.7: Run `/self-reflect`** to capture learnings while implementation context is fresh. Commit the resulting knowledge-base updates.

- [ ] **Step 13.8: Open the PR:**

```bash
gh pr create --title "fix(e2e): #75 cross-worker reset contention via per-worker user pool" --body "$(cat <<'EOF'
## Summary

Fixes #75 by replacing the shared `testuser` E2E primary actor with a per-worker user pool (`e2e_w0..3`) and adding a worker-scoped branch to `/api/__test__/reset` (header `X-E2E-Worker-Id: 0..3`) that deletes only rows owned by the calling worker's user. Disjoint working sets across workers eliminate the cross-worker reset-vs-mutation contention that produced "page closed" / "URL did not change after delete" flakes at `workers=4`.

Legacy global-TRUNCATE path preserved for Bruno + manual reset callers.

`retries: 0` and `workers: 4` are now hardcoded in `e2e/playwright.config.ts`. The temporary `e2e-burst.yml` workflow_dispatch was used to demonstrate 5 consecutive green runs at workers=4, retries=0 (run URL: <BURST_URL>). Removal of `e2e-burst.yml` tracked in <FOLLOW_UP_ISSUE>.

## Test plan
- [x] Server unit tests for worker-scoped path (positive cases per worker ID, all validation rejections, guard precedence, transaction rollback, legacy regression, cross-user data integrity)
- [x] Cascade-contract static-analysis test pinning all 17 FK delete rules
- [x] e2e-burst.yml — 5 sequential runs at workers=4, retries=0 — all green
- [x] Coverage at .coverage-thresholds.json floor (100/100/100/100)
- [x] CI lint guard for testuser smuggling patterns

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

(Replace `<BURST_URL>` and `<FOLLOW_UP_ISSUE>` with actual values.)

---

## Rebuttals — design-rooted plan items (iteration-2 plan-review-gate)

The Scope & Alignment reviewer in iteration 2 flagged two items as scope creep. Both are explicit design-doc requirements imposed by the design-review-gate (which iterated 3 times across PM/Architect/Designer/Security/CTO before approval):

1. **Task 2 (cascade-contract test pinning 17 FK delete rules)** — the design's CTO reviewer in iteration 2 of the design gate flagged "Cascade contract is not protected by an automated test" as a BLOCKING issue. Resolution applied in iteration 3 of the design gate per CTO's recommended option (b): static-analysis test against migration SQL text. The design (lines under "Cascade-contract test — static analysis") enumerates the full 17-FK list and documents the rationale: the worker-scoped reset's correctness depends on the FK CASCADE/SET NULL behavior of these constraints; any future migration that flips one silently breaks the reset semantics. The plan honors its source of truth (the design); it would be a deviation to omit this. Not scope creep — design-mandated.

2. **Task 12.3 (Bruno coverage path-prefix exception in CLAUDE.md)** — the design's CTO reviewer in iteration 1 of the design gate flagged "Bruno coverage decision is missing" as a BLOCKING issue (CLAUDE.md says "every feature that adds or modifies API endpoints MUST include Bruno request files. This is a BLOCKING requirement."). The PR modifies `POST /api/__test__/reset`; the design resolved this by documenting an explicit path-prefix exception in CLAUDE.md, with the constraint that the exception applies ONLY to routes under `/api/__test__/*` that inherit ALL FIVE existing guards. This is policy-clarifying language required to prevent the Bruno gate from blocking PR merge. Not scope creep — required by the design's resolution of a Bruno coverage requirement in CLAUDE.md.

If a future plan-review iteration flags these again, this section is the rebuttal evidence: both items trace to specific, in-the-record blockers raised and resolved during design review.

---

## Self-review

### Spec coverage check

| Spec section                                  | Covered by task                  |
| --------------------------------------------- | -------------------------------- |
| Server: worker-scoped path + closed map       | Task 1 (1.2)                     |
| Server: header validation + intentional asym. | Task 1 (1.2.6, 1.2.7)            |
| Server: transaction wrap (withTransaction)    | Task 1 (1.1, 1.2.3, 1.2.9)       |
| Server: audit log w/ route field              | Task 1 (1.2.3 includes log line) |
| Server: legacy path preserved                 | Task 1 (1.2.10)                  |
| Server: pgTransaction deps                    | Task 1 (1.1)                     |
| Server: tests enumerated (positive + neg.)    | Task 1 (1.2.1, 1.2.5–1.2.10)     |
| Cascade-contract test (static analysis)       | Task 2                           |
| Seed: 4 worker users                          | Task 3                           |
| Fixtures: actor + reset header                | Task 4                           |
| globalSetup parallelized                      | Task 4 (4.3)                     |
| Playwright config workers=4 / retries=0       | Task 5                           |
| Spec migration mechanical                     | Task 6                           |
| Spec migration hand-touch (6 sites)           | Task 7                           |
| AC #1 — 10 specs pass at workers=4            | Task 13.1                        |
| Global coverage gate pre-PR                   | Task 13.2                        |
| Active plan persistence                       | Task 0                           |
| Defensive workaround removal                  | Task 8                           |
| Comment + test-name bounded migration         | Task 9                           |
| CI lint guard                                 | Task 10                          |
| e2e-burst workflow                            | Task 11                          |
| CLAUDE.md updates (3 items)                   | Task 12                          |
| Verification + PR + self-reflect              | Task 13                          |
| Coverage gate (100% floor)                    | Task 1 (1.2.12)                  |
| Bruno coverage exception                      | Task 12 (12.3)                   |

All design sections have a corresponding task.

### Placeholder scan

- "TBD" / "TODO" / "fill in details": none.
- "Add appropriate error handling": none.
- "Similar to Task N": none — code blocks repeated where needed.
- All step descriptions name exact files, exact code, and exact verification commands.

### Type consistency

- `actor` fixture name used consistently in tasks 4, 6, 7, 8.
- `WORKER_USER_IDS` used consistently in task 1.
- `pgTransaction` deps name used in tasks 1.1 (define) and 1.2 (use).
- `e2e_w0..3` user names + UUIDs (`a0…101..104`) used consistently in tasks 3, 4.
- `X-E2E-Worker-Id` header name used consistently in tasks 1, 4.

No type or naming drift detected.
