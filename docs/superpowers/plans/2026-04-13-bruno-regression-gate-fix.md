# Bruno Regression Gate Fix Implementation Plan

> **For agentic workers:** Execution method to be selected by the user after plan approval. Candidates: metaswarm orchestrated execution (4-phase loop per WU), superpowers:subagent-driven-development, or superpowers:executing-plans.

**Goal:** Make `cd bruno && npx @usebruno/cli run -r --env local` a meaningful BLOCKING regression gate. Today it silently passes while 11 of 41 requests return 5xx/4xx, because no `.bru` file asserts status codes and the run depends on folder-alphabetical ordering that doesn't match test-data dependencies.

**Non-goal:** Fixing server code. Static analysis of all 11 failures shows **every handler is correct** — failures are purely test-infrastructure (missing seeded UUIDs, missing `tests { }` blocks, producer/consumer mismatch on `revisionId`).

**Architecture:**

The fix has three pillars:

1. **Order-independence by pinning Bruno env vars to the seed's existing deterministic UUIDs.** `scripts/seed.sql` already inserts posts at `c0000000-0000-0000-0000-00000000000N`, revisions at `d0000000-...`, tags at `b0000000-...`, and users at `a0000000-...`. Update `bruno/environments/local.bru` to pin `{{postId}}`, `{{revisionId}}`, `{{tagId}}` to these existing fixture IDs. Add a `testuser` row to the seed (with a known bcrypt hash of `password123`) and a fixture `commentId` if one doesn't already exist at a deterministic UUID. Every request has valid IDs on a fresh seed — regardless of which folder Bruno runs first.
2. **Auth bootstrap at collection root.** Add `script:pre-request` in `bruno/collection.bru` that performs a login against the seeded `testuser` and sets `{{accessToken}}` / `{{refreshToken}}` before any request runs. No more dependency on `auth/login.bru` happening first alphabetically. If Bruno CLI `-r` does not execute the collection-level hook, fall back to a `_auth-bootstrap/login.bru` file that sorts before all other folders alphabetically.
3. **Status assertions on all 41 request `.bru` files.** Every `.bru` file (excluding `environments/local.bru` and `collection.bru`) gets a `tests { }` block asserting the expected happy-path status (200/201/204) and — where the endpoint documents one — a sibling `.bru` exercising a documented error path (400/401/404). Once assertions exist, Bruno's `✓ PASS` summary will actually reflect reality.

Pillars 1+2 eliminate the current 11 failures without touching server code. Pillar 3 ensures future regressions cannot hide.

**Tech Stack:** Bruno CLI `@usebruno/cli` (version pinned by project), Fastify + pg server on `localhost:3001`, PostgreSQL via docker-compose for local and GitHub Actions service containers for CI, `scripts/seed.sql` for deterministic fixtures. No new runtime dependencies.

**GitHub Issue:** multiandrewlab/forge#28 (`bug: Bruno regression silently passes despite pre-existing 500s/404s`)

---

## TDD Discipline (applies to every Work Unit)

Per `CLAUDE.md`, TDD is mandatory. For this plan, the **.bru status assertions themselves are the tests** — they assert behaviour against a live server. Red/green sequence:

1. **Red** — Add the `tests { test("status is N", function() { expect(res.getStatus()).to.equal(N); }); }` block first (Bruno uses Chai assertions) and run `bruno run <file> --env local` against the current server. For files whose endpoint currently 500s/404s (the 11 from the issue), the assertion MUST fail. If it passes, the WU's premise is wrong — stop and re-investigate.
2. **Green** — Apply the infrastructure fix (seed UUID, pre-request bootstrap, producer-side `setVar`) that makes the assertion pass.
3. **Refactor** — Extract repeated patterns if warranted; keep assertions intact.
4. **Coverage check** — `.coverage-thresholds.json` applies to `packages/**` Vitest coverage, not to `.bru` files. This plan touches only `bruno/`, `scripts/seed.sql`, and CI config — no production TypeScript changes. Coverage gate is a no-op here; verify by running `npm run test:coverage` after each commit and confirming thresholds still hold.
5. **Commit** — conventional-commit message, no `--no-verify`.

For WU-005 (CI workflow) the "test" is the GitHub Actions run itself — merged only after one green run on a branch push.

---

## Context Recovery / `.beads/` Persistence

Per `CLAUDE.md`, approved plans and execution state MUST be persisted to `.beads/`.

**After plan approval:** Write `.beads/plans/active-plan.md`:

```yaml
---
title: "bug: Bruno regression gate fix (#28)"
issue: 28
status: in-progress
approved: <YYYY-MM-DD>
gate-iterations: <N>
user-approved: true
execution-method: <chosen-method>
plan-file: docs/superpowers/plans/2026-04-13-bruno-regression-gate-fix.md
branch: fix/bruno-regression-gate-28
---

# Active Plan: Bruno regression gate fix

See full plan at: `docs/superpowers/plans/2026-04-13-bruno-regression-gate-fix.md`

## Work Units
1. WU-001: Seeded deterministic UUIDs for Bruno fixtures
2. WU-002: Collection-root auth bootstrap
3. WU-003: Producer/consumer fix for revisionId + inline-comment ids
4. WU-004: Status assertions on all 41 request .bru files
5. WU-005: CI workflow — Bruno regression gate
6. WU-006: Documentation — CLAUDE.md + bruno/README.md
```

**Between WUs:** Orchestrator updates `.beads/context/execution-state.md` after each commit, and refreshes `.beads/context/project-context.md` with any stable facts discovered (e.g., "Bruno env vars pinned to seed UUIDs"). **On completion:** flip frontmatter to `status: completed`, record `merged-pr` and `merged-commit`.

---

## Definition of Done (from Issue #28)

- [ ] Every endpoint in the 11-endpoint failure table returns a clean status code on a freshly seeded DB (2xx happy path; 4xx only where documented).
- [ ] Every `.bru` file has a `tests { }` block asserting the expected status code for the happy path and — where documented — the error path.
- [ ] `scripts/seed.sql` is updated so Bruno requests referencing `{{postId}}`, `{{commentId}}`, `{{revisionId}}`, `{{tagId}}` resolve against a clean DB with no manual setup.
- [ ] Running `cd bruno && npx @usebruno/cli run -r --env local` against a freshly seeded DB reports **zero** 5xx/4xx responses and all `tests { }` blocks pass.
- [ ] A CI job runs the full Bruno regression and fails the build on any non-asserted 5xx.

---

## Work Units

### WU-001: Pin Bruno env vars to seeded fixtures + seed `testuser`

**Goal:** Break the run-order dependency. Any `.bru` file referencing `{{postId}}` / `{{commentId}}` / `{{revisionId}}` / `{{revisionNumber}}` / `{{tagId}}` resolves to a real seeded row regardless of which folder ran first. The existing seed already creates deterministic UUIDs — reuse them rather than introducing a parallel fixture set.

**DoD:**

- `bruno/environments/local.bru` hardcodes defaults pointing at existing seed rows:
  - `postId = c0000000-0000-0000-0000-000000000001` (alice's first post)
  - `revisionId = d0000000-0000-0000-0000-000000000001` (initial revision of that post)
  - `revisionNumber = 1` (preserved as-is — still used by any .bru filtering by revision number)
  - `tagId = b0000000-0000-0000-0000-000000000001` (typescript tag)
  - `commentId` — audit existing seed's `comments` INSERT block; if deterministic UUID already seeded (e.g., `e0000000-...`), pin to that; otherwise add `e0000000-0000-0000-0000-000000000001` to seed AND pin it here.
- `scripts/seed.sql` adds a `testuser` user row (`a0000000-0000-0000-0000-000000000099`) with `email='testuser@example.com'`, `auth_provider='local'`, `password_hash` = a fresh bcrypt-12 hash of `password123` (same plaintext that `bruno/auth/login.bru` sends). Document how the hash was generated in a comment above the INSERT so future maintainers can regenerate.
- `accessToken` and `refreshToken` stay empty in local.bru (WU-002 fills them).
- `testEmail` (`testuser@example.com`) and `testPassword` (`password123`) added as env vars in local.bru so WU-002's bootstrap is parameterised.
- Verification: after `psql -f scripts/seed.sql` and WU-002's bootstrap, running each of the 11 failing .bru files individually returns 2xx — no more 500s or 404s.

**File scope:**

- `scripts/seed.sql` — add `testuser` row + any missing deterministic comment UUID
- `bruno/environments/local.bru` — pin defaults to existing seed UUIDs

**Dependencies:** none.

**Red test:** `bruno run bruno/votes/upvote.bru --env local` against current seed returns 404. After WU-001 (with `accessToken` manually set for the red test), same command returns 200.

**Note on existing seed idempotency:** `scripts/seed.sql` currently uses `TRUNCATE ... CASCADE` then `INSERT` — this is already safe to re-run. No need for `ON CONFLICT` clauses.

---

### WU-002: Collection-root auth bootstrap

**Goal:** Remove dependency on `auth/login.bru` running before everything else. Login happens automatically at collection start.

**DoD:**

- `bruno/collection.bru` contains a `script:pre-request` that: checks if `{{accessToken}}` is empty → issues `POST /api/auth/login` against `{{baseUrl}}` with `{{testEmail}}` / `{{testPassword}}` → calls `bru.setVar("accessToken", ...)` and `bru.setVar("refreshToken", ...)`. Skips login when the var is already populated (idempotent across requests in a single run).
- Alternative (investigate first): the WU's first action is a ≤30-min spike running a minimal test to confirm Bruno CLI `-r` executes `collection.bru` `script:pre-request`. If it does, proceed. If not, pivot to a `bruno/_auth-bootstrap/login.bru` file (folder name starts with `_` so it sorts before `auth/`, `bookmarks/`, etc.) that does the same login and setVar logic. Document the choice in the WU's commit message. The plan accepts either outcome — do not re-open the plan.
- Running `bruno run -r --env local` from empty `accessToken` logs in once and all downstream requests authenticate successfully.

**File scope:**

- `bruno/collection.bru` — pre-request hook (or fallback: `bruno/_auth-bootstrap/login.bru` as a new file)
- (Test credentials already added in WU-001)

**Dependencies:** WU-001 (seeded `testuser` with known password hash + `testEmail`/`testPassword` env vars).

**Red test:** With `{{accessToken}}` blank, `bruno run bruno/posts/create-post.bru --env local` currently 401s. After WU-002, same command returns 201 because the collection-level hook logs in first.

---

### WU-003: Producer/consumer fix for revisionId and variable lifecycle audit

**Goal:** `list-comments-by-revision.bru` currently dereferences `{{revisionId}}`, but `posts/revisions/create-revision.bru` only sets `revisionNumber`. Close the gap, and audit every .bru variable to confirm producer/consumer pairs line up.

**DoD:**

- `posts/revisions/create-revision.bru` post-response script ALSO calls `bru.setVar("revisionId", res.body.revision.id)` (in addition to `revisionNumber`).
- `posts/revisions/get-revision.bru` and `list-revisions.bru` confirmed to use the correct variable name (`revisionNumber` vs `revisionId`) — audit and adjust if wrong.
- Both `{{revisionNumber}}` and `{{revisionId}}` resolve correctly after WU-001: `revisionNumber` default is `1` in local.bru, `revisionId` default is `d0000000-...0001`. Any .bru file using either variable finds a valid seeded value on a fresh seed.
- Audit inline-comment .bru files (`comments/create-inline-comment.bru`, `create-reply.bru`) for similar producer/consumer mismatches; document findings and fix.
- Produce a variable-lifecycle table as part of the commit message: column 1 = variable name, column 2 = producer (seed default or .bru file that sets it), column 3 = consumers (.bru files that read it).

**File scope:**

- `bruno/posts/revisions/*.bru`
- `bruno/comments/create-inline-comment.bru`, `create-reply.bru`
- (Variable defaults in `bruno/environments/local.bru` already handled in WU-001)

**Dependencies:** WU-001.

---

### WU-004: Status assertions on all 41 request `.bru` files

**Goal:** Every `.bru` file asserts the expected HTTP status. Bruno's `✓ PASS` becomes meaningful.

**DoD:**

- All 41 request `.bru` files (excluding `environments/local.bru` and `collection.bru`) have a `tests { }` block with at least `test("responds with expected status", function() { expect(res.getStatus()).to.equal(N); });`. First action in the WU: spike this on one file to confirm Bruno CLI's exact Chai syntax works as expected; document the confirmed snippet in the commit message and reuse it verbatim.
- Expected status codes are read from each endpoint's `docs { }` block or derived from the route handler (e.g., `POST /api/posts` returns 201, `DELETE` returns 200 or 204, etc.). Document the mapping in a table in `bruno/README.md` (WU-006 owns the README but the status table is authored here).
- For endpoints with documented error paths (e.g. "returns 404 if no vote exists" for `remove-vote`), add a sibling `.bru` exercising that path (pre-state: no existing vote; expect 404). Limit to endpoints that already document an error path — don't invent new error cases.
- Intra-folder mutation ordering: Bruno runs files within a folder in `seq` order (or alphabetical if seq absent). For folders that mutate state (`comments/`, `votes/`, `bookmarks/`, `posts/` with `delete-post.bru`), audit seq numbers so dependent reads happen before destructive writes. If `delete-post.bru` targets the seeded fixture post, subsequent folder runs that expect the fixture will fail — the WU's audit MUST either (a) reassign destructive ops to target non-fixture seeded rows, or (b) document the expected order in a comment at the top of each destructive .bru.
- After WU-001+002+003+004 applied, `bruno run -r --env local` reports all tests green AND all response status codes are 2xx (or documented 4xx for error-path files).

**File scope:** 41 request `.bru` files in `bruno/` — counts derived from `find bruno -name '*.bru' | grep -vE 'collection\.bru|environments/'`. Split commits by sub-bundle for review granularity:

- `auth/` (8 files)
- `bookmarks/` (2 files)
- `comments/` (7 files)
- `health/` (1 file)
- `posts/` (6 files) + `posts/revisions/` (3 files) = 9 files
- `search/` (6 files)
- `tags/` (5 files)
- `votes/` (3 files + possibly 1 new error-path file for `remove-vote-no-existing`)

Total: 8+2+7+1+9+6+5+3 = **41** (plus up to 1 added error-path sibling).

**Dependencies:** WU-001, WU-002, WU-003 (so assertions don't all start red for infrastructure reasons).

**Red test:** Before infra fixes land, `bruno run -r --env local` after WU-004 shows N failed assertions equal to the 11 broken endpoints. After infra WUs land, same run shows 0 failed.

---

### WU-005: CI workflow — Bruno regression gate

**Goal:** Fail the build when `.bru` assertions fail OR when any `.bru` file lacks a `tests { }` block. This is the BLOCKING gate `CLAUDE.md` already declares.

**DoD:**

- New GitHub Actions workflow at `.github/workflows/bruno-regression.yml`:
  - Triggers on `pull_request` and `push` to `main`.
  - Spins up PostgreSQL via service container (match the Postgres version used in `docker-compose.yml`).
  - Runs DB migrations using the actual project command — audit the existing workflow at `.github/workflows/ci.yml` and `packages/server/package.json` to confirm; current known command is `cd packages/server && npm run migrate:up` (not `npm run db:migrate`). Use whichever is authoritative at the time of WU execution.
  - Runs `psql -f scripts/seed.sql`.
  - Starts the server in the background (`set -a && source .env.ci && set +a && cd packages/server && npx tsx src/server.ts &`) and waits for `/health` to 200 (poll with timeout).
  - **Coverage lint step (completeness guard)** — BEFORE running the suite, fail the job if any `.bru` file under `bruno/` (excluding `environments/` and `collection.bru`) lacks a `tests {` block:
    ```bash
    missing=$(find bruno -name '*.bru' -not -path 'bruno/environments/*' -not -name 'collection.bru' | xargs grep -L 'tests {' || true)
    if [ -n "$missing" ]; then
      echo "FAIL: .bru files without tests {} block:"; echo "$missing"; exit 1
    fi
    ```
    This guarantees Issue #28 DoD item 5 ("fails the build on any non-asserted 5xx") — a silent 5xx from an un-asserted file is impossible because no un-asserted file is permitted.
  - Runs `cd bruno && npx @usebruno/cli run -r --env ci` (new `bruno/environments/ci.bru` mirrors local.bru with CI-appropriate `baseUrl`).
  - Exits non-zero on any failed `tests { }` assertion.
- New `bruno/environments/ci.bru` matches local.bru's shape, with CI-appropriate `baseUrl` (likely `http://localhost:3001` on the runner).
- `.env.ci` (if doesn't exist) added or the workflow sets required env vars inline (`JWT_SECRET`, `DATABASE_URL`, etc.) — audit what the server actually needs.
- Workflow tested by pushing a deliberate regression (temporary commit that breaks one endpoint or removes one assertion) — confirm the job fails for the right reason — then revert.

**File scope:**

- `.github/workflows/bruno-regression.yml` (new) — or extend existing `.github/workflows/ci.yml`; choose based on existing project convention
- `bruno/environments/ci.bru` (new)
- Possibly `package.json` script entry `bruno:regression` for ergonomic local reproduction

**Dependencies:** WU-001 through WU-004 (the regression must be passing locally before CI is gated on it).

**Reversibility:** The workflow is a standalone file — disabling the gate is a single-file revert without touching `.bru` or seed changes.

---

### WU-006: Documentation — CLAUDE.md + bruno/README.md

**Goal:** Future contributors know how to write `.bru` files correctly and what the gate guarantees.

**DoD:**

- `CLAUDE.md` Bruno section updated with:
  - Explicit rule: "every `.bru` file MUST contain a `tests { }` block asserting the expected HTTP status code"
  - How the collection-root auth bootstrap works (WU-002)
  - The seeded-UUID contract (WU-001) — what IDs exist in the seed, what `.bru` files can rely on
  - The CI gate (WU-005) — what triggers it, how to reproduce locally
- New `bruno/README.md` documents the conventions with examples (assertion block template, post-response setVar template, how to add a new endpoint's `.bru` coverage).
- Status-code-per-endpoint table in `bruno/README.md` as a quick reference (derived from WU-004 commit message).

**File scope:**

- `CLAUDE.md` — Bruno section rewrite
- `bruno/README.md` (new)

**Dependencies:** WU-001 through WU-005.

---

## Final Review (after all WUs commit)

Orchestrator runs the FULL loop end-to-end against a wiped DB:

```bash
docker compose down -v && docker compose up -d
# wait for DB healthy
cd packages/server && npm run migrate:up && cd ../..
psql "$DATABASE_URL" -f scripts/seed.sql
# start server in background (require .env loaded)
set -a && source .env && set +a && cd packages/server && npx tsx src/server.ts &
# wait for /health to 200
cd bruno && npx @usebruno/cli run -r --env local
```

Expected output: every request returns its documented status code, every `tests { }` block passes, exit code 0. ANY non-2xx response that isn't a documented error-path test is a final-review blocker.

Cross-cutting checks the final reviewer runs:

- grep `bruno/` for any `.bru` without a `tests {` block → must be empty.
- `git log --oneline fix/bruno-regression-gate-28 ^main` → commits follow conventional format, no `--no-verify`.
- `.beads/plans/active-plan.md` flipped to `status: completed`.
- Knowledge capture: run `/self-reflect` (per `CLAUDE.md` pre-PR requirement), commit KB updates, THEN open the PR so learnings land atomically.

---

## Risks & Mitigations

| Risk                                                                     | Mitigation                                                                                                                        |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Bruno CLI `collection.bru` pre-request doesn't fire in `-r` mode         | WU-002 first action is a spike; fallback to `_auth-bootstrap/login.bru` folder approach                                           |
| Seeded UUIDs collide with randomly generated IDs elsewhere in the system | Use `00000000-0000-0000-0000-00000000000X` pattern — effectively reserved; confirm no code paths compare UUIDs against this range |
| `DELETE` endpoints on seeded rows leave state dirty across runs          | CI always re-seeds; document "re-run `seed.sql` before re-running the regression suite" in `bruno/README.md`                      |
| WU-004 is mechanically large (41 files)                                  | Split commits by folder for review granularity; use a shared assertion snippet pattern documented in the first commit             |
| `.coverage-thresholds.json` gate doesn't apply but confusion arises      | Plan explicitly states coverage is a no-op for this change; verify thresholds unchanged after each commit                         |
| Changing `.bru` URLs inadvertently breaks an existing passing test       | All `.bru` URL text stays byte-identical — only `tests { }` blocks and `script:post-response` blocks are added/modified           |

---

## Out of scope

- Refactoring server route handlers (they are correct).
- Adding new Bruno requests for endpoints not already in the collection.
- Replacing Bruno with a different API-testing tool.
- Adding unit-test coverage for server routes (separate concern; already handled by Vitest).
- Extending the seed script with domain data beyond what the 11 failing endpoints need.
