# Issue #49 — Tags + Search UX + E2E Specs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> Per CLAUDE.md, the user chooses execution method. Do NOT auto-select.

**Goal:** Ship the missing tag and search UX (TagPage, popular-tags widget, TagSubscribeButton, /following route, author/since filters, numbered pagination), the server contract additions, the seed change, the Bruno coverage, and the 22 Playwright specs called out in Issue #49 — all in a single PR on branch `feat/e2e-tags-search`.

**Architecture:** TDD per work unit. Server changes extend existing routes (no new route files). Client adds two new pages (`TagPage`), three new shared components (`TagSubscribeButton`, `SearchPagination`, plus the popular-tags widget that lives inline in `TheSidebar`), and modifies four existing surfaces (`TheSidebar`, `PostMetaHeader`, `SearchPage`, `SearchResultItem`). Pagination respects the existing tsvector → trigram-fallback architecture by paginating the primary path only and gating the trigram top-up on `page === 1`. AI search resolution runs once per query (page 1) and rewrites the URL with resolved filters for page≥2 traversal.

**Tech Stack:** Vue 3 + Vite + Pinia + Tailwind v4 client, Fastify + Postgres server, zod validators in `@forge/shared`, Vitest unit tests at workspace level, Playwright at `e2e/`, Bruno for HTTP regression. LangChain mock provider via `X-Mock-Script` for AI tests.

**Source design:** [`docs/superpowers/specs/2026-04-30-issue-49-tags-search-ux-amendment.md`](../specs/2026-04-30-issue-49-tags-search-ux-amendment.md) (committed `f426bcc`; design-review-gate APPROVED 5/5 across 3 rounds).

**Branch:** `feat/e2e-tags-search` (already created from `main` at `e09d6b8`).

**Predecessor:** [`2026-04-30-issue-48-e2e-comments-voting-bookmarks.md`](./2026-04-30-issue-48-e2e-comments-voting-bookmarks.md) (PR #73 merged `8ed7a62`).

**Tracking issue:** [#43 — E2E Playwright rollout](https://github.com/multiandrewlab/forge/issues/43). Green-run counter at 0/14 — flip-to-blocking is **NOT** in scope this PR.

---

## REV 2 changes vs. REV 1 (from plan-review-gate iteration 1)

Iteration 1 returned PASS for Scope & Alignment, FAIL for Feasibility (3 blocking) and FAIL for Completeness (5 blocking). REV 2 incorporates:

| #   | Concern (gate finding)                                                                                                                                                                                   | REV 2 fix                                                                                                                                                                                                                                                                                                 |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | `<PostList :posts="posts" />` in TagPage violates the actual `PostList.vue` 8-required-prop contract (line 70-80)                                                                                        | TagPage code in WU5 Task 5.6 now passes all 8 props (`selected-post-id`, `loading`, `error`, `has-more`, `current-sort`, `current-filter`, `current-tag`). Inline comment cites the contract location.                                                                                                    |
| F2  | Plan said "Alice → ai-prompts" but seed.sql:128 has alice subscribed to **typescript** (`b0…0001`); bob is the ai-prompts subscriber                                                                     | `findTagByName` test comment at WU3 Task 3.3 corrected ("Bob is seeded as a subscriber to ai-prompts"). The 0-subscribers test switched from `devops` (which has carol) to `python` (which has 0 subs). Spec #7 `my-subscriptions-list.spec.ts` retargeted to `subscribed-tag-link-typescript` for alice. |
| F3  | WU2 declared only WU1 dep but pagination tests require WU4's `tag-pagination-fixture` rows                                                                                                               | WU2 `**Dependencies:**` line updated to `WU1 AND WU4`. Dependency graph in §Dependency graph adds the WU4 → WU2 edge.                                                                                                                                                                                     |
| C1  | `PostList.vue` has a `currentFilter` switch ladder (`'mine'/'bookmarked'`) but is NOT in WU6 modify scope; design's exhaustive-never DoD unreachable                                                     | New Task 6.8b added to WU6: extends `PostList.vue` switch with `'subscribed'` case + `_exhaustive: never` check + new unit test. `PostList.vue` added to WU6 file scope.                                                                                                                                  |
| C2  | `PostViewPage.vue:183` also renders `post-tag-chip-${tag}` as `<span>`; click-tag-from-post.spec.ts navigates to `/posts/<uuid>` which mounts THIS page (not PostMetaHeader) — span click won't navigate | New Task 6.8a added to WU6: replaces the `<span>` with `<RouterLink>` and adds a unit test for tag-chip nav behavior. `PostViewPage.vue` added to WU6 file scope.                                                                                                                                         |
| C3  | No verification command runs the `.coverage-thresholds.json` enforcement gate at the WORKSPACE-WIDE level (only per-package)                                                                             | WU9 Task 9.2 reorganized to run `npm run test:coverage` un-scoped (the canonical enforcement command per `.coverage-thresholds.json`'s `enforcement.command` field), with explicit step labels. Also added a workspace-wide `npm run typecheck` step to catch the new `_exhaustive: never` check.         |
| C4  | WU4's `psql "$DATABASE_URL"` lacks the `set -a && source .env && set +a` prelude; would fail in fresh subshell                                                                                           | WU4 Task 4.4 + verification command both gain the `.env`-sourcing prelude (matches the pattern used by predecessor PR #73's plan and CLAUDE.md "When to run").                                                                                                                                            |
| C5  | WU7 omitted the failing-test-FIRST step before implementation, violating CLAUDE.md "TDD is mandatory"                                                                                                    | WU7 expanded into 4 tasks: 7.1 (locate registry) → 7.2 (write failing test, verify it fails) → 7.3 (add implementation, verify it passes) → 7.4 (commit).                                                                                                                                                 |

All 8 blocking findings resolved. Scope & Alignment was PASS in REV 1; no regressions introduced (REV 2 changes are all within the design's amended file scope).

---

## Spec count reconciliation

| Folder                   | Issue #49 target (±15%) | This plan delivers                                                              | Within band?       |
| ------------------------ | ----------------------- | ------------------------------------------------------------------------------- | ------------------ |
| `e2e/specs/tags/`        | ~9 (8–10)               | 9                                                                               | ✅ exact midpoint  |
| `e2e/specs/search/`      | ~12 (10–14)             | 13 (one extra from atomicity-driven split of `filter-chip-tag` apply vs remove) | ✅                 |
| **Total new e2e specs**  | ~21                     | **22**                                                                          | ✅                 |
| Bruno `.bru` files (new) | ~10                     | **14** (8 happy + 6 error per design table)                                     | over but justified |

Bruno count grew vs. the design's first-pass figure because the design-review-gate (round 2) required:

- `bruno/tags/get-by-name-anonymous.bru` (locks the public-access contract)
- `bruno/posts/feed-list-bad-filter.bru` (covers `?filter=invalid` 400 — symmetric with new validator surface)
- `bruno/search/pagination-too-large.bru` (covers `?page=1001` 400 — DoS-bound contract)
- `bruno/search/ai-page-1.bru` (covers the AI×pagination decision: AI on page=1 only)

---

## Verified codebase facts (read once, baked into the plan)

- `e2e/fixtures/reset.ts` is **per-spec scope** (`scope: 'test'`, `auto: true`). The implementation note explicitly warns against worker-scoped reset. **Cross-spec write isolation is real** — each spec sees a fresh post-seed-load DB.
- `findTagByName(name)` already exists in `packages/server/src/db/queries/tags.ts:4`. We extend it with a subquery aggregate (subscriber_count + post_count via the existing `t.post_count` column).
- `searchQuerySchema` lives in `packages/shared/src/types/search.ts`, NOT in the server route. The server imports it. Validator extension goes in shared.
- `feedQuerySchema` lives inline in `packages/server/src/routes/posts.ts:34`. Extension goes there (not shared).
- `findFeedPosts` in `packages/server/src/db/queries/feed.ts:66` already implements the subscribed-tag EXISTS predicate (line 156) for `sort='personalized'`. We **reuse** that predicate when `filter='subscribed'` instead of introducing a parallel join path.
- Existing search route handles `trimmedQ === ''` by returning empty results (search.ts:24-32). We do NOT change `q.min(...)` — only add `.min(1)` to the new `author` and `tag` is already `.max(50)`, leaving its lack of `.min(1)` intact for backward compat. The new `author` validator gets `.min(1).max(100)` per the design.
- Vitest excludes `packages/shared/src/types/feed.ts` from coverage (types-only). It does NOT exclude `search.ts` (has zod schema). New code in `search.ts` MUST hit 100%; new code in `feed.ts` is types-only and out of coverage.
- Bruno: feed bruno files live in `bruno/posts/` (e.g., `get-feed.bru`). There is no `bruno/feed/` dir. Plan respects this.
- Playwright config (`e2e/playwright.config.ts`): `fullyParallel: false`, `workers: 4` in CI. Within a worker, specs run **sequentially**. Cross-worker isolation is enforced by a Postgres advisory lock inside `/api/__test__/reset`. This means two writing specs in DIFFERENT workers serialize on the lock; two specs in the SAME worker run one after the other anyway.
- Seeded tags (verified): `typescript`, `python`, `ai-prompts`, `react`, `devops`. No `langchain`, no `svelte`. Plan uses only seeded tag names.
- Seeded post→tag mapping (verified):
  - `typescript`: posts `001`, `007`, `009`, `011` (alice + bob authors)
  - `python`: post `002` (alice)
  - `ai-prompts`: posts `003`, `004`, `010` (bob + carol)
  - `react`: posts `004`, `011` (bob)
  - `devops`: post `005` (carol)
- testuser (`a0…0099`) has zero seeded subscriptions. Alice has 1 sub: `ai-prompts` (`b0…0003`).

---

## File structure

### Create

```
# Pages
packages/client/src/pages/TagPage.vue                                 (WU5)

# Components
packages/client/src/components/tags/TagSubscribeButton.vue            (WU5)
packages/client/src/components/search/SearchPagination.vue            (WU5)

# Selector shards
e2e/fixtures/selectors/tags.ts                                        (WU8)
# selectors/search.ts already exists; extended in WU8

# E2E specs
e2e/specs/tags/popular-tags-render.spec.ts                            (WU8)
e2e/specs/tags/subscribe-from-sidebar.spec.ts                         (WU8)
e2e/specs/tags/subscribed-tag-appears-in-following.spec.ts            (WU8)
e2e/specs/tags/unsubscribe-from-sidebar.spec.ts                       (WU8)
e2e/specs/tags/subscribed-tag-feed.spec.ts                            (WU8)
e2e/specs/tags/tag-page.spec.ts                                       (WU8)
e2e/specs/tags/my-subscriptions-list.spec.ts                          (WU8)
e2e/specs/tags/click-tag-from-post.spec.ts                            (WU8)
e2e/specs/tags/subscribe-from-tag-page.spec.ts                        (WU8)

e2e/specs/search/plain-query.spec.ts                                  (WU8)
e2e/specs/search/no-results.spec.ts                                   (WU8)
e2e/specs/search/fuzzy-match.spec.ts                                  (WU8)
e2e/specs/search/ai-toggle.spec.ts                                    (WU8)
e2e/specs/search/filter-chip-tag.spec.ts                              (WU8)
e2e/specs/search/filter-chip-tag-remove.spec.ts                       (WU8)
e2e/specs/search/filter-chip-type.spec.ts                             (WU8)
e2e/specs/search/filter-chip-author.spec.ts                           (WU8)
e2e/specs/search/filter-chip-since.spec.ts                            (WU8)
e2e/specs/search/result-click.spec.ts                                 (WU8)
e2e/specs/search/cmd-k-shortcut.spec.ts                               (WU8)
e2e/specs/search/pagination.spec.ts                                   (WU8)
e2e/specs/search/recent-searches.spec.ts                              (WU8)

# Bruno
bruno/posts/feed-list-subscribed.bru                                  (WU3)
bruno/posts/feed-list-by-tag.bru                                      (WU3)
bruno/posts/feed-list-bad-filter.bru                                  (WU3)
bruno/search/by-author.bru                                            (WU2)
bruno/search/by-since.bru                                             (WU2)
bruno/search/pagination.bru                                           (WU2)
bruno/search/ai-page-1.bru                                            (WU2)
bruno/search/by-author-empty.bru                                      (WU2)
bruno/search/by-since-bad.bru                                         (WU2)
bruno/search/pagination-bad-page.bru                                  (WU2)
bruno/search/pagination-too-large.bru                                 (WU2)
bruno/tags/get-by-name.bru                                            (WU3)
bruno/tags/get-by-name-anonymous.bru                                  (WU3)
bruno/tags/get-by-name-not-found.bru                                  (WU3)

# Unit tests (alongside source)
packages/client/src/__tests__/components/tags/TagSubscribeButton.test.ts          (WU5)
packages/client/src/__tests__/components/search/SearchPagination.test.ts          (WU5)
packages/client/src/__tests__/pages/TagPage.test.ts                                (WU5)
```

### Modify

```
# Shared types + zod
packages/shared/src/types/feed.ts                  (WU1 — FeedFilter union; types-only file, no coverage)
packages/shared/src/types/search.ts                (WU1 — searchQuerySchema + SearchResponse; coverage required)

# Server routes
packages/server/src/routes/posts.ts                (WU3 — feedQuerySchema + filter='subscribed'/tag handler branch)
packages/server/src/routes/search.ts               (WU2 — pagination contract, AI page=1, author/since logic)
packages/server/src/routes/tags.ts                 (WU3 — public GET /:name handler)

# Server queries
packages/server/src/db/queries/search.ts           (WU2 — author/since predicates, COUNT(*))
packages/server/src/db/queries/feed.ts             (WU3 — reuse EXISTS for filter='subscribed', new tag predicate)
packages/server/src/db/queries/tags.ts             (WU3 — extend findTagByName with subscriber_count subquery aggregate)

# Server tests
packages/server/src/__tests__/routes/search.test.ts                                (WU2)
packages/server/src/__tests__/routes/tags.test.ts                                  (WU3)
packages/server/src/__tests__/db/queries/tags.test.ts                              (WU3)

# Shared tests
packages/shared/src/__tests__/types/search.test.ts                                 (WU1)

# Client UI
packages/client/src/components/shell/TheSidebar.vue            (WU6 — popular-tags-list section)
packages/client/src/components/post/PostMetaHeader.vue         (WU6 — tag chip → RouterLink)
packages/client/src/pages/SearchPage.vue                       (WU6 — author/since chips, pagination)
packages/client/src/components/search/SearchResultItem.vue     (WU6 — clickable author + stopPropagation)
packages/client/src/stores/search.ts                           (WU6 — page/totalPages/author/since state, URL rewrite)
packages/client/src/composables/useSearch.ts                   (WU6 — URL builder)
packages/client/src/stores/feed.ts                             (WU6 — accept 'subscribed' filter)
packages/client/src/plugins/router.ts                          (WU6 — /following + /tags/:name routes)

# Existing client tests (extended — coverage)
packages/client/src/__tests__/components/shell/TheSidebar.test.ts                  (WU6)
packages/client/src/__tests__/components/post/PostMetaHeader.test.ts               (WU6)
packages/client/src/__tests__/pages/SearchPage.test.ts                             (WU6)
packages/client/src/__tests__/components/search/SearchResultItem.test.ts           (WU6)
packages/client/src/__tests__/stores/search.test.ts                                (WU6)
packages/client/src/__tests__/stores/feed.test.ts                                  (WU6)
packages/client/src/__tests__/composables/useSearch.test.ts                        (WU6)
packages/client/src/__tests__/plugins/router.test.ts                               (WU6)

# Seed
scripts/seed.sql                                   (WU4 — APPEND-ONLY: paginationuser + tag-pagination-fixture + 25 posts)
```

### Delete

None.

---

## Dependency graph

```
WU1 (shared types + zod)
  ├─→ WU2 (search route)
  ├─→ WU3 (feed/tags routes)
  ├─→ WU5 (new components)
  └─→ WU6 (modified components)

WU4 (seed) — independent of WU1; can run in parallel.
  └─→ WU2 (search route's pagination tests REQUIRE the tag-pagination-fixture rows
         from WU4; orchestrator MUST land WU4 before running WU2 verification)

WU2, WU3 ──→ Bruno verification (folded into each WU's verification step)
WU2, WU3, WU4, WU5, WU6 ──→ WU7 (server-side e2e prep — none beyond WU2-4)
WU2..WU6 ──→ WU8 (e2e specs)
WU8 ──→ WU9 (self-reflect + PR prep)
```

A subagent-driven execution can parallelize Phase A (WU1, WU4) and Phase B (WU2, WU3, WU5 once WU1 lands). WU6 must wait for WU5 (component imports). WU8 must wait for everything else. Phase F (WU9) is sequential.

---

## Atomic commit unit guarantees

Each WU below ends with a verification command that the orchestrator runs. The WU is "done" only when the verification command passes. **No work unit may be merged with failing tests, failing typecheck, or coverage below 100% on its file scope.** Verification is independent — no trust in subagent self-reports.

---

# Work Unit 1 — Shared types + zod validators

**Goal:** Land the type and validator changes required by every downstream WU. Small, foundational, fast to verify.

**Files:**

- Modify: `packages/shared/src/types/feed.ts`
- Modify: `packages/shared/src/types/search.ts`
- Modify: `packages/shared/src/__tests__/types/search.test.ts`
- Coverage scope: `packages/shared/src/types/search.ts` only (`feed.ts` is excluded per `vitest.config.ts`).

**Dependencies:** none.

### Task 1.1: Extend `FeedFilter` to add `'subscribed'`

**Files:**

- Modify: `packages/shared/src/types/feed.ts`

- [ ] **Step 1: Read the existing file**

```bash
cat packages/shared/src/types/feed.ts
```

- [ ] **Step 2: Edit the union type**

```ts
// packages/shared/src/types/feed.ts:18
export type FeedFilter = 'mine' | 'bookmarked' | 'subscribed';
```

- [ ] **Step 3: Run typecheck — confirms downstream compile errors at every consumer of FeedFilter (this is desired; we'll fix them in WU6)**

```bash
npm run -w @forge/shared build && npm run typecheck 2>&1 | grep -E "FeedFilter|filter:"
```

Expected: typecheck shows errors in `packages/client/src/stores/feed.ts`, `packages/server/src/routes/posts.ts`, etc. — these are the call sites we'll update in WU6/WU3.

(The build of `@forge/shared` is mandatory before server typecheck — see auto-memory `project_shared_package_dist_staleness`.)

### Task 1.2: Write failing tests for the extended `searchQuerySchema`

**Files:**

- Modify: `packages/shared/src/__tests__/types/search.test.ts`

- [ ] **Step 1: Read the existing test file to understand patterns**

```bash
sed -n '1,80p' packages/shared/src/__tests__/types/search.test.ts
```

- [ ] **Step 2: Append the new test cases**

Add at the end of the existing `describe('searchQuerySchema', ...)` block (before its closing `});`):

```ts
describe('author parameter', () => {
  it('accepts a non-empty string ≤ 100 chars', () => {
    const result = searchQuerySchema.safeParse({ q: 'test', author: 'Alice' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.author).toBe('Alice');
  });

  it('rejects empty string with min(1) error', () => {
    const result = searchQuerySchema.safeParse({ q: 'test', author: '' });
    expect(result.success).toBe(false);
  });

  it('rejects strings > 100 chars', () => {
    const result = searchQuerySchema.safeParse({ q: 'test', author: 'a'.repeat(101) });
    expect(result.success).toBe(false);
  });

  it('omits the field when not provided', () => {
    const result = searchQuerySchema.safeParse({ q: 'test' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.author).toBeUndefined();
  });
});

describe('since parameter', () => {
  it.each(['today', '7d', '30d'] as const)('accepts %s as a valid token', (token) => {
    const result = searchQuerySchema.safeParse({ q: 'test', since: token });
    expect(result.success).toBe(true);
  });

  it('rejects unknown tokens with 400-level error', () => {
    const result = searchQuerySchema.safeParse({ q: 'test', since: 'banana' });
    expect(result.success).toBe(false);
  });

  it('rejects empty string', () => {
    const result = searchQuerySchema.safeParse({ q: 'test', since: '' });
    expect(result.success).toBe(false);
  });

  it('omits the field when not provided', () => {
    const result = searchQuerySchema.safeParse({ q: 'test' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.since).toBeUndefined();
  });
});

describe('page parameter', () => {
  it('defaults to 1 when not provided', () => {
    const result = searchQuerySchema.safeParse({ q: 'test' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.page).toBe(1);
  });

  it('coerces a string number', () => {
    const result = searchQuerySchema.safeParse({ q: 'test', page: '5' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.page).toBe(5);
  });

  it('rejects 0 (must be ≥ 1)', () => {
    const result = searchQuerySchema.safeParse({ q: 'test', page: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects negative numbers', () => {
    const result = searchQuerySchema.safeParse({ q: 'test', page: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects values over 1000 (DoS bound)', () => {
    const result = searchQuerySchema.safeParse({ q: 'test', page: 1001 });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer values', () => {
    const result = searchQuerySchema.safeParse({ q: 'test', page: 1.5 });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 3: Run the tests — they MUST fail with "unknown key" or "expected X, received Y" errors**

```bash
npm test -- --run packages/shared/src/__tests__/types/search.test.ts 2>&1 | tail -40
```

Expected: failures in the new `author`, `since`, `page` describe blocks because the schema doesn't yet declare those keys.

### Task 1.3: Extend `searchQuerySchema` to make tests pass

**Files:**

- Modify: `packages/shared/src/types/search.ts`

- [ ] **Step 1: Edit the schema**

Replace the existing `searchQuerySchema` with:

```ts
// packages/shared/src/types/search.ts (replacing the existing const declaration)
export const searchQuerySchema = z.object({
  q: z.string().max(200),
  type: z.enum(['snippet', 'prompt', 'document', 'link']).optional(),
  tag: z.string().max(50).optional(),
  fuzzy: z
    .preprocess((val) => {
      if (typeof val === 'string') return val === 'true';
      return val;
    }, z.boolean())
    .optional(),
  ai: z
    .preprocess((val) => {
      if (typeof val === 'string') return val === 'true';
      return val;
    }, z.boolean())
    .optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  // New fields (Issue #49):
  author: z.string().min(1).max(100).optional(),
  since: z.enum(['today', '7d', '30d']).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});
```

- [ ] **Step 2: Run the tests — all should pass now**

```bash
npm test -- --run packages/shared/src/__tests__/types/search.test.ts 2>&1 | tail -20
```

Expected: all tests in `searchQuerySchema` describe block pass, including the new author/since/page sub-blocks.

### Task 1.4: Add `SearchResponse` type extensions

**Files:**

- Modify: `packages/shared/src/types/search.ts`

- [ ] **Step 1: Locate the SearchResponse interface**

```bash
grep -n "SearchResponse" packages/shared/src/types/search.ts
```

- [ ] **Step 2: Add `page`, `totalPages`, and `aiResolvedFilters?` fields**

If `SearchResponse` doesn't already exist in this file, add it (and re-export from `index.ts` later). If it does exist, extend:

```ts
// packages/shared/src/types/search.ts
export interface SearchResponse {
  query: string;
  snippets: SearchSnippet[];
  aiActions: AiAction[];
  people: UserSummary[];
  totalResults: number;
  // New fields (Issue #49):
  page: number;
  totalPages: number;
  aiResolvedFilters?: {
    tag?: string;
    type?: ContentType;
  };
}
```

- [ ] **Step 3: Confirm typecheck still passes (build the workspace package)**

```bash
npm run -w @forge/shared build 2>&1 | tail -10
```

Expected: build succeeds (any consumers downstream will fail until WU2/WU6 — that's expected).

### Task 1.5: Verify WU1 coverage

- [ ] **Step 1: Run coverage on shared package**

```bash
npm run test:coverage -- --run packages/shared 2>&1 | tail -20
```

Expected: 100% on `packages/shared/src/types/search.ts`. `feed.ts` is excluded from coverage.

### Task 1.6: Commit WU1

- [ ] **Step 1: Commit**

```bash
git add packages/shared/src/types/feed.ts \
        packages/shared/src/types/search.ts \
        packages/shared/src/__tests__/types/search.test.ts \
        packages/shared/dist/

git commit -m "$(cat <<'EOF'
feat(shared): extend FeedFilter and searchQuerySchema for #49

- FeedFilter union: add 'subscribed'
- searchQuerySchema: add author (min 1, max 100), since
  (z.enum today/7d/30d), page (coerce, min 1, max 1000, default 1)
- SearchResponse: add page, totalPages, optional aiResolvedFilters

Bounds chosen per design amendment §Server route changes:
- author max 100 matches displayName ceiling in validators/auth.ts
- page max 1000 caps OFFSET amplification at 20k results

WU1 of 9 for the #49 amendment. Downstream typecheck failures
expected until WU2 (server search) and WU6 (client) land.
EOF
)"
```

**Verification (orchestrator runs):**

```bash
npm test -- --run packages/shared 2>&1 | grep -E "(passed|failed)" && \
npm run test:coverage -- --run packages/shared 2>&1 | grep -E "search.ts" && \
echo "WU1 verified ✓"
```

Expected output: tests pass, search.ts shows 100/100/100/100 coverage, banner prints.

---

# Work Unit 2 — Server search route + db query extensions

**Goal:** Implement the pagination contract (tsvector primary, trigram top-up only on page=1, totalPages from primary path COUNT), AI-search × pagination interaction (resolution only on page=1, URL rewrite for page≥2), author/since predicates. Land 7 of the 14 new Bruno files.

**Files:**

- Modify: `packages/server/src/routes/search.ts`
- Modify: `packages/server/src/db/queries/search.ts`
- Modify: `packages/server/src/__tests__/routes/search.test.ts`
- Create: `bruno/search/by-author.bru`, `by-since.bru`, `pagination.bru`, `ai-page-1.bru`, `by-author-empty.bru`, `by-since-bad.bru`, `pagination-bad-page.bru`, `pagination-too-large.bru`

**Dependencies:** WU1 (uses extended `searchQuerySchema` and `SearchResponse`) **AND WU4** (the pagination unit tests in Task 2.2 require the seeded `tag-pagination-fixture` rows from WU4 to assert on >20 results). The dependency graph at §Dependency graph is updated to reflect this. Orchestrator MUST land WU4 before running WU2's verification.

### Task 2.1: Read existing search query helpers

- [ ] **Step 1: Inspect signatures**

```bash
grep -n "export\|interface\|type " packages/server/src/db/queries/search.ts | head -20
```

The plan extends `searchPostsByTsvector` and `searchPostsByTrigram` to accept `author?`, `since?`, `page?`, and adds a `countSearchPosts` helper for `totalPages`.

### Task 2.2: Write failing tests for new query helpers

**Files:**

- Modify: `packages/server/src/__tests__/queries/search.test.ts` (or wherever the search query tests live — locate first):

```bash
find packages/server/src/__tests__ -path "*search*" 2>&1
```

- [ ] **Step 1: Add tests for `searchPostsByTsvector` with author/since/page**

```ts
// Append to the appropriate describe block in the existing search query test file.
describe('searchPostsByTsvector — author filter', () => {
  it('returns only posts by the given author (case-insensitive display name)', async () => {
    const rows = await searchPostsByTsvector('typescript', {
      contentType: undefined,
      tag: undefined,
      limit: 20,
      author: 'Alice', // canonical case
      page: 1,
    });
    expect(rows.length).toBeGreaterThan(0);
    rows.forEach((r) => expect(r.author_display_name.toLowerCase()).toBe('alice'));
  });

  it('matches case-insensitively', async () => {
    const rows = await searchPostsByTsvector('typescript', {
      contentType: undefined,
      tag: undefined,
      limit: 20,
      author: 'aLiCe',
      page: 1,
    });
    expect(rows.length).toBeGreaterThan(0);
  });

  it('returns empty when no author matches', async () => {
    const rows = await searchPostsByTsvector('typescript', {
      contentType: undefined,
      tag: undefined,
      limit: 20,
      author: 'NoSuchUser',
      page: 1,
    });
    expect(rows).toHaveLength(0);
  });
});

describe('searchPostsByTsvector — since filter', () => {
  it('filters by created_at >= NOW() - 1 day for "today"', async () => {
    const rows = await searchPostsByTsvector('typescript', {
      contentType: undefined,
      tag: undefined,
      limit: 20,
      since: 'today',
      page: 1,
    });
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    rows.forEach((r) => expect(new Date(r.created_at).getTime()).toBeGreaterThanOrEqual(cutoff));
  });

  it('honors 7d / 30d windows', async () => {
    const sevenDay = await searchPostsByTsvector('typescript', {
      contentType: undefined,
      tag: undefined,
      limit: 20,
      since: '7d',
      page: 1,
    });
    const thirtyDay = await searchPostsByTsvector('typescript', {
      contentType: undefined,
      tag: undefined,
      limit: 20,
      since: '30d',
      page: 1,
    });
    expect(sevenDay.length).toBeLessThanOrEqual(thirtyDay.length);
  });
});

describe('searchPostsByTsvector — pagination', () => {
  it('returns at most LIMIT rows on page 1', async () => {
    const rows = await searchPostsByTsvector('fixture', {
      contentType: undefined,
      tag: 'tag-pagination-fixture',
      limit: 20,
      page: 1,
    });
    expect(rows.length).toBeLessThanOrEqual(20);
  });

  it('returns different rows on page 2', async () => {
    const p1 = await searchPostsByTsvector('fixture', {
      contentType: undefined,
      tag: 'tag-pagination-fixture',
      limit: 20,
      page: 1,
    });
    const p2 = await searchPostsByTsvector('fixture', {
      contentType: undefined,
      tag: 'tag-pagination-fixture',
      limit: 20,
      page: 2,
    });
    if (p2.length > 0) {
      const p1Ids = new Set(p1.map((r) => r.id));
      p2.forEach((r) => expect(p1Ids.has(r.id)).toBe(false));
    }
  });
});

describe('countSearchPosts', () => {
  it('counts the same filter set as searchPostsByTsvector primary path', async () => {
    const opts = {
      contentType: undefined,
      tag: 'tag-pagination-fixture' as const,
      limit: 20,
      page: 1,
    };
    const rows = await searchPostsByTsvector('fixture', opts);
    const count = await countSearchPosts('fixture', opts);
    expect(count).toBeGreaterThanOrEqual(rows.length);
  });
});
```

These tests REQUIRE the seed change from WU4 (the `tag-pagination-fixture` rows). Mark them with `it.todo` initially if WU4 hasn't landed, OR run WU4 first. Recommended: orchestrator runs WU4 in parallel, holds Task 2.2 verification until WU4 commits.

- [ ] **Step 2: Run the tests — they MUST fail (function signature doesn't accept author/since/page yet)**

```bash
npm test -- --run packages/server/src/__tests__/queries/search.test.ts 2>&1 | tail -30
```

Expected: TypeScript compile errors on the new test code OR runtime failures on the new options.

### Task 2.3: Extend `searchPostsByTsvector` and `searchPostsByTrigram` signatures

**Files:**

- Modify: `packages/server/src/db/queries/search.ts`

- [ ] **Step 1: Add the new option fields to the input types**

```ts
// packages/server/src/db/queries/search.ts
export interface SearchOptions {
  contentType: 'snippet' | 'prompt' | 'document' | 'link' | undefined;
  tag: string | undefined;
  limit: number;
  // New (Issue #49):
  author?: string; // case-insensitive display_name match
  since?: 'today' | '7d' | '30d';
  page?: number; // 1-indexed; default 1
}
```

- [ ] **Step 2: Add SQL WHERE-clause helpers**

Add a private helper that converts `since` to an interval predicate and one that adds the author predicate. Inject them into both query builders. Example pattern:

```ts
function sinceClause(
  since: SearchOptions['since'],
  paramIndex: number,
): { sql: string; param: unknown } | null {
  if (!since) return null;
  const intervals: Record<NonNullable<SearchOptions['since']>, string> = {
    today: '1 day',
    '7d': '7 days',
    '30d': '30 days',
  };
  return {
    sql: `p.created_at >= NOW() - $${paramIndex}::interval`,
    param: intervals[since],
  };
}
```

For `author`, push `LOWER(u.display_name) = LOWER($n)` into the existing JOIN'd query (the existing query already joins `users u`).

For `page`, compute offset as `(page - 1) * limit` and append `LIMIT $n OFFSET $m`.

- [ ] **Step 3: Add `countSearchPosts` helper**

```ts
export async function countSearchPosts(q: string, options: SearchOptions): Promise<number> {
  // Run the SAME query as searchPostsByTsvector but as SELECT COUNT(*)
  // wrapping the inner SELECT (drop ORDER BY / LIMIT / OFFSET).
  // Implementation must mirror the WHERE clause exactly so totals match.
  ...
}
```

- [ ] **Step 4: Run query tests — should pass**

```bash
npm test -- --run packages/server/src/__tests__/queries/search.test.ts 2>&1 | tail -30
```

### Task 2.4: Write failing route tests (search.ts)

**Files:**

- Modify: `packages/server/src/__tests__/routes/search.test.ts`

- [ ] **Step 1: Read existing pattern**

```bash
sed -n '1,80p' packages/server/src/__tests__/routes/search.test.ts
```

- [ ] **Step 2: Add tests for the new contract**

Add a new describe block at the end:

```ts
describe('GET /api/search — pagination contract (Issue #49)', () => {
  it('returns page=1 and totalPages in the response shape', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/search?q=typescript',
      headers: authHeaders,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ page: 1, totalPages: expect.any(Number) });
  });

  it('respects ?page=2 — returns disjoint result set', async () => {
    const p1 = await app.inject({
      method: 'GET',
      url: '/api/search?q=fixture&tag=tag-pagination-fixture&page=1',
      headers: authHeaders,
    });
    const p2 = await app.inject({
      method: 'GET',
      url: '/api/search?q=fixture&tag=tag-pagination-fixture&page=2',
      headers: authHeaders,
    });
    expect(p1.statusCode).toBe(200);
    expect(p2.statusCode).toBe(200);
    const ids1 = new Set(p1.json().snippets.map((s: any) => s.id));
    const ids2 = new Set(p2.json().snippets.map((s: any) => s.id));
    ids2.forEach((id) => expect(ids1.has(id)).toBe(false));
  });

  it('clamps page > totalPages to last page (no 4xx, empty snippets)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/search?q=fixture&tag=tag-pagination-fixture&page=999',
      headers: authHeaders,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.snippets).toHaveLength(0);
    expect(body.page).toBeLessThanOrEqual(body.totalPages || 1);
  });

  it('rejects ?page=0 with 400', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/search?q=typescript&page=0',
      headers: authHeaders,
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects ?page=1001 with 400', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/search?q=typescript&page=1001',
      headers: authHeaders,
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /api/search — author filter', () => {
  it('returns posts by the named author', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/search?q=typescript&author=Alice',
      headers: authHeaders,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    body.snippets.forEach((s: any) => expect(s.authorDisplayName.toLowerCase()).toBe('alice'));
  });

  it('rejects empty author with 400', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/search?q=typescript&author=',
      headers: authHeaders,
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /api/search — since filter', () => {
  it.each(['today', '7d', '30d'] as const)('accepts since=%s', async (token) => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/search?q=fixture&since=${token}`,
      headers: authHeaders,
    });
    expect(res.statusCode).toBe(200);
  });

  it('rejects unknown since token with 400', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/search?q=typescript&since=banana',
      headers: authHeaders,
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /api/search — AI × pagination', () => {
  it('aiResolvedFilters echoed on page=1 when ai=true', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/search?q=typescript&ai=true&page=1',
      headers: { ...authHeaders, 'X-Mock-Script': 'search-resolves-to-typescript-tag' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.aiResolvedFilters).toBeDefined();
    expect(body.aiResolvedFilters?.tag).toBe('typescript');
  });

  it('ignores ai=true on page>=2 (no aiResolvedFilters in response)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/search?q=typescript&ai=true&page=2',
      headers: { ...authHeaders, 'X-Mock-Script': 'search-resolves-to-typescript-tag' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.aiResolvedFilters).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run — tests must fail**

```bash
npm test -- --run packages/server/src/__tests__/routes/search.test.ts 2>&1 | tail -30
```

Expected: failures because the route handler doesn't compute totalPages, doesn't accept author/since/page, etc.

### Task 2.5: Implement the search route extensions

**Files:**

- Modify: `packages/server/src/routes/search.ts`

- [ ] **Step 1: Update the destructure to include new fields and compute pagination**

```ts
// packages/server/src/routes/search.ts (replacing the existing destructure block)
const { q, type, tag, fuzzy, ai, limit, author, since, page } = parsed.data;
const trimmedQ = q.trim();

if (trimmedQ === '') {
  return reply.send({
    snippets: [],
    aiActions: [],
    people: [],
    query: '',
    totalResults: 0,
    page: 1,
    totalPages: 0,
  });
}
```

- [ ] **Step 2: Add the AI page=1 gate**

Wrap the existing AI block:

```ts
let aiResolvedFilters: { tag?: string; type?: string } | undefined;

if (ai === true && page === 1) {
  // ← NEW: page-1 gate
  // existing aiAcquire + runSearchChain logic
  // ...
  if (filters !== null) {
    aiFilters = filters;
    effectiveQuery = filters.textQuery;
    searchOptions = {
      contentType: (filters.contentType as typeof type) ?? undefined,
      tag: filters.tags[0] ?? undefined,
      limit,
    };
    aiResolvedFilters = {
      tag: filters.tags[0],
      type: (filters.contentType as typeof type) ?? undefined,
    };
  }
}
```

- [ ] **Step 3: Pass `author`, `since`, `page` into the query helpers**

Replace `searchOptions = { contentType: type, tag, limit }` with the extended shape including `author`, `since`, `page`.

- [ ] **Step 4: Implement the trigram-top-up gate**

```ts
if (fuzzy) {
  // unchanged: trigram is the primary path; pass page through
  const trigramRows = await searchPostsByTrigram(effectiveQuery, searchOptions);
  snippets = trigramRows.map((row) => toSearchSnippet(row, 'trigram'));
} else {
  const tsvectorRows = await searchPostsByTsvector(effectiveQuery, searchOptions);
  snippets = tsvectorRows.map((row) => toSearchSnippet(row, 'tsvector'));

  // CHANGED: top-up fallback ONLY on page === 1.
  if (page === 1 && tsvectorRows.length < TRIGRAM_FALLBACK_THRESHOLD) {
    // existing top-up code
  }
}
```

- [ ] **Step 5: Compute totalPages from the primary path**

```ts
const totalCount = await countSearchPosts(effectiveQuery, {
  contentType: searchOptions.contentType,
  tag: searchOptions.tag,
  limit: searchOptions.limit,
  author,
  since,
  page: 1, // count is page-independent
});
const totalPages = Math.max(0, Math.ceil(totalCount / limit));

// Server-side clamp: if page > totalPages, return empty snippets but reflect the requested page.
const clampedPage = totalPages > 0 ? Math.min(page, totalPages) : 1;
const effectiveSnippets = page > totalPages && totalPages > 0 ? [] : snippets.slice(0, limit);
```

- [ ] **Step 6: Return the new response shape**

```ts
return reply.send({
  snippets: effectiveSnippets,
  aiActions,
  people,
  query: trimmedQ,
  totalResults: effectiveSnippets.length + people.length + aiActions.length,
  page: clampedPage,
  totalPages,
  ...(aiResolvedFilters && { aiResolvedFilters }),
});
```

- [ ] **Step 7: Run all server search tests**

```bash
npm test -- --run packages/server/src/__tests__/routes/search.test.ts 2>&1 | tail -20
```

Expected: all green.

### Task 2.6: Write 8 Bruno files for the new search contract

**Files (each new):**

- `bruno/search/by-author.bru`
- `bruno/search/by-since.bru`
- `bruno/search/pagination.bru`
- `bruno/search/ai-page-1.bru`
- `bruno/search/by-author-empty.bru`
- `bruno/search/by-since-bad.bru`
- `bruno/search/pagination-bad-page.bru`
- `bruno/search/pagination-too-large.bru`

- [ ] **Step 1: Look at an existing search .bru as template**

```bash
cat bruno/search/filter-by-tag.bru
```

- [ ] **Step 2: Write `bruno/search/by-author.bru`**

```
meta {
  name: search by author
  type: http
  seq: 8
}

get {
  url: {{baseUrl}}/api/search?q=typescript&author=Alice
  body: none
  auth: bearer
}

auth:bearer {
  token: {{accessToken}}
}

assert {
  res.status: eq 200
  res.body.page: eq 1
}
```

- [ ] **Step 3: Write the other 7 .bru files following the same structure.**

Auth posture for ALL search files: `auth: bearer` with `{{accessToken}}` (the search route still requires auth — see `packages/server/src/routes/search.ts:13`).

Asserted statuses (per design §Bruno coverage table):

- `by-author.bru` → 200
- `by-since.bru` → 200 (URL: `?q=fixture&since=7d`)
- `pagination.bru` → 200 (URL: `?q=fixture&tag=tag-pagination-fixture&page=2`)
- `ai-page-1.bru` → 200 (URL: `?q=ts&ai=true&page=1` — note: this uses the live AI provider OR mock; if mock, set `X-Mock-Script` header explicitly per `bruno/search/ai-search.bru` precedent)
- `by-author-empty.bru` → 400 (URL: `?q=typescript&author=`)
- `by-since-bad.bru` → 400 (URL: `?q=typescript&since=banana`)
- `pagination-bad-page.bru` → 400 (URL: `?q=typescript&page=0`)
- `pagination-too-large.bru` → 400 (URL: `?q=typescript&page=1001`)

- [ ] **Step 4: Run the search subset against a running server**

```bash
# From repo root, with server already running per CLAUDE.md
cd bruno && npx @usebruno/cli run search --env local
```

Expected: all assertions pass. If the server isn't running, see CLAUDE.md "Bruno API Tests > When to run".

### Task 2.7: Verify WU2 coverage

- [ ] **Step 1: Coverage on modified files**

```bash
npm run test:coverage -- --run packages/server 2>&1 | grep -E "search\.ts|search/"
```

Expected: `search.ts` (route) and `db/queries/search.ts` show 100/100/100/100.

### Task 2.8: Commit WU2

- [ ] **Step 1: Commit**

```bash
git add packages/server/src/routes/search.ts \
        packages/server/src/db/queries/search.ts \
        packages/server/src/__tests__/routes/search.test.ts \
        packages/server/src/__tests__/queries/search.test.ts \
        bruno/search/by-author.bru \
        bruno/search/by-since.bru \
        bruno/search/pagination.bru \
        bruno/search/ai-page-1.bru \
        bruno/search/by-author-empty.bru \
        bruno/search/by-since-bad.bru \
        bruno/search/pagination-bad-page.bru \
        bruno/search/pagination-too-large.bru

git commit -m "feat(server): #49 search route — author/since/page + AI page-1 gate

- Author filter: LOWER(u.display_name) = LOWER(\$1), max 100 chars
- Since filter: today/7d/30d → NOW() - interval predicate
- Pagination: tsvector (or trigram if fuzzy) is canonical paginated
  query; trigram top-up only fires on page=1; totalPages from
  countSearchPosts() over the primary path; server clamps
  page > totalPages
- AI × pagination: AI resolution runs only on page=1; resolved
  filters echoed in response; ai=true ignored when page>=2

8 new Bruno files (4 happy + 4 error) cover the contract.
Validators: page in [1,1000], author min(1).max(100), since strict
z.enum.

WU2 of 9. Depends on WU1 (shared types)."
```

**Verification (orchestrator runs):**

```bash
npm test -- --run packages/server/src/__tests__/routes/search.test.ts 2>&1 | grep -E "(passed|failed)" && \
npm run test:coverage -- --run packages/server 2>&1 | grep -E "search\.ts" && \
(cd bruno && npx @usebruno/cli run search --env local 2>&1 | tail -5) && \
echo "WU2 verified ✓"
```

---

# Work Unit 3 — Server feed/tags route extensions + 6 Bruno files

**Goal:** Extend `feedQuerySchema` to accept `filter='subscribed'` and `tag=<name>`. Reuse the existing `EXISTS` predicate in `findFeedPosts` for the subscribed branch. Add the public `GET /api/tags/:name` handler with subscriber_count subquery aggregate. Land 6 new Bruno files (3 feed, 3 tags).

**Files:**

- Modify: `packages/server/src/routes/posts.ts` (extends `feedQuerySchema`)
- Modify: `packages/server/src/db/queries/feed.ts` (extends `findFeedPosts` to accept `filter='subscribed'` and tag predicate)
- Modify: `packages/server/src/routes/tags.ts` (adds public `GET /:name`)
- Modify: `packages/server/src/db/queries/tags.ts` (extends `findTagByName` with subscriber_count)
- Modify: `packages/server/src/__tests__/routes/tags.test.ts`
- Modify: `packages/server/src/__tests__/db/queries/tags.test.ts`
- Create: `bruno/posts/feed-list-subscribed.bru`, `feed-list-by-tag.bru`, `feed-list-bad-filter.bru`
- Create: `bruno/tags/get-by-name.bru`, `get-by-name-anonymous.bru`, `get-by-name-not-found.bru`

**Dependencies:** WU1 (FeedFilter union extension).

### Task 3.1: Extend `feedQuerySchema` in posts.ts

- [ ] **Step 1: Read the current schema**

```bash
sed -n '34,65p' packages/server/src/routes/posts.ts
```

- [ ] **Step 2: Edit the enum and add the tag field**

```ts
// packages/server/src/routes/posts.ts:34
const feedQuerySchema = z.object({
  sort: z.enum(['trending', 'recent', 'top', 'personalized']).default('recent'),
  filter: z.enum(['mine', 'bookmarked', 'subscribed']).optional(), // ← added 'subscribed'
  tag: z.string().min(1).max(50).optional(), // ← new
  // ...other existing fields
});
```

- [ ] **Step 3: Update the handler to pass `filter` and `tag` to `findFeedPosts`**

Locate the existing handler at `posts.ts:112+` and add:

```ts
// Wherever the handler currently calls findFeedPosts:
const result = await findFeedPosts({
  sort,
  filter, // existing
  tag: parsed.data.tag, // new
  // ...other existing args
  userId: request.user?.id,
});
```

### Task 3.2: Extend `findFeedPosts` to handle `filter='subscribed'` and `tag=<name>`

**Files:**

- Modify: `packages/server/src/db/queries/feed.ts`

- [ ] **Step 1: Read the existing function**

```bash
sed -n '60,180p' packages/server/src/db/queries/feed.ts
```

- [ ] **Step 2: Reuse the existing personalized EXISTS predicate**

Around line 156 of `feed.ts`, the existing code has:

```ts
`EXISTS (SELECT 1 FROM post_tags pt_sub JOIN user_tag_subscriptions uts
   ON uts.tag_id = pt_sub.tag_id
 WHERE pt_sub.post_id = p.id AND uts.user_id = ${userParam})`;
```

We add a branch:

```ts
} else if (filter === 'subscribed') {
  // Reuse the personalized EXISTS predicate. Short-circuit to empty result
  // if the user has zero subscriptions.
  if (userId === undefined) {
    return { posts: [], hasMore: false };
  }
  const hasAnySub = await query<{ exists: boolean }>(
    'SELECT EXISTS (SELECT 1 FROM user_tag_subscriptions WHERE user_id = $1)::bool AS exists',
    [userId],
  );
  if (!hasAnySub.rows[0]?.exists) {
    return { posts: [], hasMore: false };
  }
  whereClauses.push(
    `EXISTS (SELECT 1 FROM post_tags pt_sub JOIN user_tag_subscriptions uts
       ON uts.tag_id = pt_sub.tag_id
     WHERE pt_sub.post_id = p.id AND uts.user_id = ${userParam})`,
  );
}
```

For the `tag` filter:

```ts
if (input.tag) {
  whereClauses.push(
    `EXISTS (SELECT 1 FROM post_tags pt_t JOIN tags t_t ON t_t.id = pt_t.tag_id
       WHERE pt_t.post_id = p.id AND LOWER(t_t.name) = LOWER(${tagParam}))`,
  );
  params.push(input.tag);
}
```

- [ ] **Step 3: Run feed-related tests — should pass**

```bash
npm test -- --run packages/server/src/__tests__/queries/feed-visibility.test.ts 2>&1 | tail -10
```

### Task 3.3: Write failing tests for new tag query (`findTagByName` with subscriber_count)

**Files:**

- Modify: `packages/server/src/__tests__/db/queries/tags.test.ts`

- [ ] **Step 1: Append tests**

```ts
describe('findTagByName — Issue #49 subscriber_count', () => {
  it('returns subscriber_count from user_tag_subscriptions aggregate', async () => {
    // Bob is seeded as a subscriber to ai-prompts (b0...0003) per
    // scripts/seed.sql:129. (Alice is subscribed to typescript, not ai-prompts —
    // verified against scripts/seed.sql:128.)
    const tag = await findTagByName('ai-prompts');
    expect(tag).not.toBeNull();
    expect(tag?.subscriber_count).toBeGreaterThanOrEqual(1);
  });

  it('returns 0 subscriber_count for a tag with no subscribers', async () => {
    // python has no seeded subscribers (typescript→alice, ai-prompts→bob,
    // devops→carol; python and react have zero seeded subs).
    const tag = await findTagByName('python');
    expect(tag?.subscriber_count).toBe(0);
  });

  it('returns null when tag does not exist', async () => {
    const tag = await findTagByName('does-not-exist-12345');
    expect(tag).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests — fail because subscriber_count isn't returned yet**

```bash
npm test -- --run packages/server/src/__tests__/db/queries/tags.test.ts 2>&1 | tail -20
```

### Task 3.4: Extend `findTagByName` SQL

**Files:**

- Modify: `packages/server/src/db/queries/tags.ts`

- [ ] **Step 1: Replace the simple SELECT with a subquery aggregate**

```ts
// packages/server/src/db/queries/tags.ts:4
export interface TagRowWithStats extends TagRow {
  subscriber_count: number;
}

export async function findTagByName(name: string): Promise<TagRowWithStats | null> {
  const result = await query<TagRowWithStats>(
    `SELECT t.*,
            (SELECT COUNT(*)::int FROM user_tag_subscriptions WHERE tag_id = t.id) AS subscriber_count
       FROM tags t
      WHERE LOWER(t.name) = LOWER($1)
      LIMIT 1`,
    [name],
  );
  return result.rows[0] ?? null;
}
```

(Note: existing callers of `findTagByName` should still typecheck because `TagRowWithStats` extends `TagRow`. Verify all call sites.)

- [ ] **Step 2: Run tests — should pass**

```bash
npm test -- --run packages/server/src/__tests__/db/queries/tags.test.ts 2>&1 | tail -10
```

### Task 3.5: Write failing tests for `GET /api/tags/:name` route

**Files:**

- Modify: `packages/server/src/__tests__/routes/tags.test.ts`

- [ ] **Step 1: Append the new describe block**

```ts
describe('GET /api/tags/:name — Issue #49 public endpoint', () => {
  it('returns 200 with tag data for an authenticated request', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/tags/typescript',
      headers: authHeaders,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      id: expect.any(String),
      name: 'typescript',
      postCount: expect.any(Number),
      subscriberCount: expect.any(Number),
    });
  });

  it('returns 200 for an UNAUTHENTICATED request (handler is fully public)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/tags/typescript',
      // no auth headers
    });
    expect(res.statusCode).toBe(200);
  });

  it('returns 404 for a non-existent tag', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/tags/does-not-exist-12345',
      headers: authHeaders,
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'Tag not found' });
  });

  it('returns the same 404 body for "deleted" and "never existed" cases (no enumeration channel)', async () => {
    const res1 = await app.inject({ method: 'GET', url: '/api/tags/never-existed-aa' });
    const res2 = await app.inject({ method: 'GET', url: '/api/tags/never-existed-bb' });
    expect(res1.json()).toEqual(res2.json());
    expect(res1.statusCode).toBe(res2.statusCode);
  });

  it('matches case-insensitively', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/tags/TypeScript',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe('typescript');
  });
});
```

- [ ] **Step 2: Run — fail (route doesn't exist)**

```bash
npm test -- --run packages/server/src/__tests__/routes/tags.test.ts 2>&1 | tail -20
```

### Task 3.6: Implement the public handler

**Files:**

- Modify: `packages/server/src/routes/tags.ts`

- [ ] **Step 1: Add the new handler at the end of `tagRoutes`**

```ts
// packages/server/src/routes/tags.ts (append before the closing brace of tagRoutes)
//
// IMPORTANT: This handler is FULLY PUBLIC — no preHandler array.
// State-changing endpoints (POST/DELETE /:id/subscribe) keep their auth.
// The handler reads tag rows + aggregates only; it never references request.user.
app.get('/:name', async (request, reply) => {
  const { name } = request.params as { name: string };
  if (!name || name.length === 0 || name.length > 50) {
    return reply.status(400).send({ error: 'Invalid tag name' });
  }
  const row = await findTagByName(name);
  if (!row) {
    return reply.status(404).send({ error: 'Tag not found' });
  }
  return reply.send({
    id: row.id,
    name: row.name,
    postCount: row.post_count,
    subscriberCount: row.subscriber_count,
  });
});
```

**Adversarial check (Security):** confirm there is no `preHandler: [app.authenticate]` on this handler.

- [ ] **Step 2: Run tests — should pass**

```bash
npm test -- --run packages/server/src/__tests__/routes/tags.test.ts 2>&1 | tail -20
```

### Task 3.7: Write 6 Bruno files

**Files (each new):**

- `bruno/posts/feed-list-subscribed.bru` (auth bearer, 200)
- `bruno/posts/feed-list-by-tag.bru` (auth bearer, 200)
- `bruno/posts/feed-list-bad-filter.bru` (auth bearer, 400)
- `bruno/tags/get-by-name.bru` (auth bearer, 200)
- `bruno/tags/get-by-name-anonymous.bru` (**auth: none — explicitly clears the collection-level bearer**, 200)
- `bruno/tags/get-by-name-not-found.bru` (auth bearer, 404)

- [ ] **Step 1: Look at existing patterns**

```bash
cat bruno/posts/get-feed.bru
cat bruno/tags/list-tags.bru
```

- [ ] **Step 2: Write each .bru file**

`bruno/tags/get-by-name-anonymous.bru` is the security-sensitive one. To override the collection-level bearer (set in `bruno/collection.bru`), use:

```
meta {
  name: get-by-name anonymous
  type: http
  seq: 6
}

get {
  url: {{baseUrl}}/api/tags/typescript
  body: none
  auth: none
}

assert {
  res.status: eq 200
}
```

`auth: none` at the file level overrides the collection-level `auth: bearer`. Verify after writing by running:

```bash
cd bruno && npx @usebruno/cli run tags/get-by-name-anonymous.bru --env local --verbose 2>&1 | grep -i "authorization"
```

If the request log shows an `Authorization` header, the override didn't take — switch to explicit `headers { Authorization: }` block instead.

- [ ] **Step 3: Run all new Bruno files**

```bash
cd bruno && npx @usebruno/cli run posts tags --env local 2>&1 | tail -10
```

### Task 3.8: Commit WU3

- [ ] **Step 1: Commit**

```bash
git add packages/server/src/routes/posts.ts \
        packages/server/src/routes/tags.ts \
        packages/server/src/db/queries/feed.ts \
        packages/server/src/db/queries/tags.ts \
        packages/server/src/__tests__/routes/tags.test.ts \
        packages/server/src/__tests__/db/queries/tags.test.ts \
        bruno/posts/feed-list-subscribed.bru \
        bruno/posts/feed-list-by-tag.bru \
        bruno/posts/feed-list-bad-filter.bru \
        bruno/tags/get-by-name.bru \
        bruno/tags/get-by-name-anonymous.bru \
        bruno/tags/get-by-name-not-found.bru

git commit -m "feat(server): #49 feed filter='subscribed'/tag + public GET /api/tags/:name

- feedQuerySchema accepts filter='subscribed' and tag=<name>
- findFeedPosts reuses existing personalized EXISTS predicate; short-
  circuits to empty when user has zero subscriptions
- findTagByName extended with subscriber_count subquery aggregate
- GET /api/tags/:name is FULLY PUBLIC (no preHandler) — subscribe
  state hydrated by separate authed call
- Same 404 body for 'deleted' and 'never existed' (no enumeration)
- Case-insensitive name lookup

6 new Bruno files: 3 posts/feed + 3 tags. Anonymous .bru explicitly
clears collection-level bearer to verify the public-access contract.

WU3 of 9. Depends on WU1."
```

**Verification (orchestrator runs):**

```bash
npm test -- --run packages/server/src/__tests__/routes/tags.test.ts \
            packages/server/src/__tests__/db/queries/tags.test.ts 2>&1 | grep -E "(passed|failed)" && \
npm run test:coverage -- --run packages/server 2>&1 | grep -E "tags\.ts|feed\.ts|posts\.ts" && \
(cd bruno && npx @usebruno/cli run posts tags --env local 2>&1 | tail -5) && \
echo "WU3 verified ✓"
```

---

# Work Unit 4 — Seed change (paginationuser + tag-pagination-fixture + 25 posts)

**Goal:** Add the deterministic fixture data the pagination + filter-chip-since e2e specs need, WITHOUT touching existing seed rows.

**Files:**

- Modify: `scripts/seed.sql` (APPEND-ONLY)

**Dependencies:** none. Can run in parallel with WU1/WU2/WU3/WU5.

### Task 4.1: Append paginationuser

- [ ] **Step 1: Locate the end of the existing INSERT INTO users block**

```bash
grep -n "INSERT INTO users" scripts/seed.sql
```

- [ ] **Step 2: Append the new user row to the INSERT**

Insert AFTER the existing testuser row (`a0...0099`). Use UUID `a0000000-0000-0000-0000-000000000004` to keep the namespace clean. The user's bcrypt hash matches the existing `password123` (12 rounds — copy from testuser's hash literal in seed.sql).

```sql
-- After the existing 4-user INSERT, change the trailing comma to a comma+newline and add:
  ('a0000000-0000-0000-0000-000000000004', 'paginationuser@example.com', 'Pagination User', NULL, 'local', '$2b$12$jrcHUcVQnE.swctPk5GnreW9hkkyFqh8A9p2GnEaRrbxEaxXESYw2');
```

**Adversarial check:** confirm the prior row's `;` was changed to `,` correctly. Run `psql` syntax check on the SQL block:

```bash
grep -A 1 "testuser@example.com" scripts/seed.sql | head -3
```

### Task 4.2: Append tag-pagination-fixture

- [ ] **Step 1: Locate the tags INSERT**

```bash
grep -n "INSERT INTO tags" scripts/seed.sql
```

- [ ] **Step 2: Append the new tag**

```sql
  ('b0000000-0000-0000-0000-000000000006', 'tag-pagination-fixture');
```

(Change the previous row's trailing `;` to `,` and add this as the new last row.)

### Task 4.3: Append 25 fixture posts owned by paginationuser, tagged with tag-pagination-fixture, with explicit `created_at`

- [ ] **Step 1: Append a new "Pagination fixture posts" section at the END of `scripts/seed.sql` BEFORE the `COMMIT;` line**

```sql
-- ============================================================
-- Pagination fixture posts (Issue #49 — deterministic data
-- for e2e/specs/search/pagination.spec.ts and filter-chip-since.spec.ts)
-- ============================================================

INSERT INTO posts (id, author_id, title, content_type, language, visibility, is_draft, view_count, created_at)
SELECT
  ('c0000000-0000-0000-0000-000000000' || lpad((100 + n)::text, 3, '0'))::uuid,
  'a0000000-0000-0000-0000-000000000004',
  'Pagination fixture post ' || n,
  'snippet',
  'typescript',
  'public',
  false,
  0,
  NOW() - interval '2 days'
FROM generate_series(1, 25) AS n;

INSERT INTO post_revisions (id, post_id, author_id, content, message, revision_number)
SELECT
  ('d0000000-0000-0000-0000-000000000' || lpad((100 + n)::text, 3, '0'))::uuid,
  ('c0000000-0000-0000-0000-000000000' || lpad((100 + n)::text, 3, '0'))::uuid,
  'a0000000-0000-0000-0000-000000000004',
  'pagination fixture body ' || n,
  'Initial pagination fixture',
  1
FROM generate_series(1, 25) AS n;

INSERT INTO post_tags (post_id, tag_id)
SELECT
  ('c0000000-0000-0000-0000-000000000' || lpad((100 + n)::text, 3, '0'))::uuid,
  'b0000000-0000-0000-0000-000000000006'
FROM generate_series(1, 25) AS n;
```

**`created_at`** is set explicitly to `NOW() - interval '2 days'` so:

- Pagination spec: `?q=fixture&tag=tag-pagination-fixture` returns all 25 (>1 page).
- filter-chip-since spec: `?q=fixture&since=7d` returns ≥1 (the fixture posts are within the 7d window); `?q=fixture&since=today` returns 0 (the fixtures are >24h old). This is testable.

**Note:** UUID range 100..124. Verify no conflict with existing `c0000000-...-100`+ posts. Per the audit, existing posts max out at `c0000000-...-012` and `c0000000-...-099`, so 100-124 is safe.

### Task 4.4: Run the seed and verify

- [ ] **Step 1: Re-run seed locally** (load `.env` first per CLAUDE.md "When to run" pattern)

```bash
set -a && source .env && set +a
psql "$DATABASE_URL" -f scripts/seed.sql
```

Expected: no errors, terminal-row count summary shows: 5 users (was 4), 6 tags (was 5), 38 posts (was 13), 38 revisions, 36 post_tags (was 11).

- [ ] **Step 2: Confirm the data** (`set -a && source .env && set +a` is from Step 1; if running this step in a fresh shell, re-source first)

```bash
set -a && source .env && set +a   # only if running in a new shell
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM posts WHERE author_id = 'a0000000-0000-0000-0000-000000000004';"
# Expected: 25

psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM posts p JOIN post_tags pt ON p.id = pt.post_id JOIN tags t ON t.id = pt.tag_id WHERE t.name = 'tag-pagination-fixture';"
# Expected: 25

psql "$DATABASE_URL" -c "SELECT MIN(created_at), MAX(created_at) FROM posts WHERE author_id = 'a0000000-0000-0000-0000-000000000004';"
# Expected: both timestamps within seconds of each other, ~2 days ago
```

### Task 4.5: Commit WU4

- [ ] **Step 1: Commit**

```bash
git add scripts/seed.sql
git commit -m "seed(scripts): #49 paginationuser + 25 fixture posts (append-only)

Adds the deterministic data e2e/specs/search/pagination.spec.ts and
filter-chip-since.spec.ts need, WITHOUT modifying existing rows:

- New user 'paginationuser' (UUID a0...0004) — independent of testuser
  so existing testuser-count assertions are preserved
- New tag 'tag-pagination-fixture' (UUID b0...0006)
- 25 posts owned by paginationuser, tagged tag-pagination-fixture,
  created_at = NOW() - 2 days (deterministic for 7d window assertion)

Verified: existing seed rows untouched, total counts match design.

WU4 of 9. Independent of all other WUs."
```

**Verification (orchestrator runs):**

```bash
set -a && source .env && set +a && \
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM posts WHERE author_id = 'a0000000-0000-0000-0000-000000000004';" 2>&1 | grep "25" && \
psql "$DATABASE_URL" -c "SELECT id FROM tags WHERE name = 'tag-pagination-fixture';" 2>&1 | grep "b0000000" && \
echo "WU4 verified ✓"
```

---

# Work Unit 5 — New Vue components (TDD per component)

**Goal:** Build the three new shared components. Each ships with a 100%-coverage unit test suite.

**Files:**

- Create: `packages/client/src/components/tags/TagSubscribeButton.vue`
- Create: `packages/client/src/components/search/SearchPagination.vue`
- Create: `packages/client/src/pages/TagPage.vue`
- Create: `packages/client/src/__tests__/components/tags/TagSubscribeButton.test.ts`
- Create: `packages/client/src/__tests__/components/search/SearchPagination.test.ts`
- Create: `packages/client/src/__tests__/pages/TagPage.test.ts`

**Dependencies:** WU1 (FeedFilter / SearchResponse types).

### Task 5.1: Write failing tests for `<TagSubscribeButton>`

- [ ] **Step 1: Create the test file**

```ts
// packages/client/src/__tests__/components/tags/TagSubscribeButton.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import TagSubscribeButton from '@/components/tags/TagSubscribeButton.vue';
import { useTagsStore } from '@/stores/tags';
import { useAuthStore } from '@/stores/auth';

const TAG = { id: 'b0000000-0000-0000-0000-000000000001', name: 'typescript', postCount: 4 };

describe('<TagSubscribeButton>', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('hidden when not authenticated', () => {
    const auth = useAuthStore();
    auth.$patch({ user: null });
    const wrapper = mount(TagSubscribeButton, { props: { tag: TAG } });
    expect(wrapper.find('[data-testid^="subscribe-btn-"]').exists()).toBe(false);
  });

  it('renders Subscribe label with aria-pressed=false when not subscribed', async () => {
    const auth = useAuthStore();
    auth.$patch({ user: { id: 'u1' } as never });
    const tags = useTagsStore();
    tags.setSubscribedTags([]);
    const wrapper = mount(TagSubscribeButton, { props: { tag: TAG } });
    const btn = wrapper.get(`[data-testid="subscribe-btn-${TAG.name}"]`);
    expect(btn.text()).toContain('Subscribe');
    expect(btn.attributes('aria-pressed')).toBe('false');
  });

  it('renders Unsubscribe label with aria-pressed=true when subscribed', async () => {
    const auth = useAuthStore();
    auth.$patch({ user: { id: 'u1' } as never });
    const tags = useTagsStore();
    tags.setSubscribedTags([TAG]);
    const wrapper = mount(TagSubscribeButton, { props: { tag: TAG } });
    const btn = wrapper.get(`[data-testid="subscribe-btn-${TAG.name}"]`);
    expect(btn.text()).toContain('Unsubscribe');
    expect(btn.attributes('aria-pressed')).toBe('true');
  });

  it('emits subscribe event on click when not subscribed', async () => {
    const auth = useAuthStore();
    auth.$patch({ user: { id: 'u1' } as never });
    const wrapper = mount(TagSubscribeButton, { props: { tag: TAG } });
    await wrapper.get(`[data-testid="subscribe-btn-${TAG.name}"]`).trigger('click');
    expect(wrapper.emitted('subscribe')).toBeTruthy();
  });

  it('emits unsubscribe event on click when subscribed', async () => {
    const tags = useTagsStore();
    tags.setSubscribedTags([TAG]);
    const auth = useAuthStore();
    auth.$patch({ user: { id: 'u1' } as never });
    const wrapper = mount(TagSubscribeButton, { props: { tag: TAG } });
    await wrapper.get(`[data-testid="subscribe-btn-${TAG.name}"]`).trigger('click');
    expect(wrapper.emitted('unsubscribe')).toBeTruthy();
  });

  it('shows aria-busy=true and is disabled while loading=true', () => {
    const auth = useAuthStore();
    auth.$patch({ user: { id: 'u1' } as never });
    const wrapper = mount(TagSubscribeButton, { props: { tag: TAG, loading: true } });
    const btn = wrapper.get(`[data-testid="subscribe-btn-${TAG.name}"]`);
    expect(btn.attributes('aria-busy')).toBe('true');
    expect(btn.attributes('disabled')).toBeDefined();
  });

  it('renders error sibling when error prop is set', () => {
    const auth = useAuthStore();
    auth.$patch({ user: { id: 'u1' } as never });
    const wrapper = mount(TagSubscribeButton, { props: { tag: TAG, error: 'Network down' } });
    expect(wrapper.find(`[data-testid="subscribe-error-${TAG.name}"]`).exists()).toBe(true);
  });
});
```

- [ ] **Step 2: Run — must fail (component doesn't exist)**

```bash
npm test -- --run packages/client/src/__tests__/components/tags/TagSubscribeButton.test.ts
```

### Task 5.2: Implement `<TagSubscribeButton>`

- [ ] **Step 1: Create the component**

```vue
<!-- packages/client/src/components/tags/TagSubscribeButton.vue -->
<template>
  <template v-if="authStore.isAuthenticated">
    <button
      :data-testid="`subscribe-btn-${tag.name}`"
      :aria-pressed="isSubscribed"
      :aria-busy="loading || undefined"
      :disabled="loading"
      class="rounded bg-primary px-2 py-1 text-xs text-white hover:bg-primary/90 disabled:opacity-50"
      @click="handleClick"
    >
      {{ isSubscribed ? 'Unsubscribe' : 'Subscribe' }}
    </button>
    <span
      v-if="error"
      :data-testid="`subscribe-error-${tag.name}`"
      class="ml-2 text-xs text-red-400"
    >
      {{ error }}
    </span>
  </template>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useTagsStore } from '@/stores/tags';
import { useAuthStore } from '@/stores/auth';
import type { Tag } from '@forge/shared';

const props = defineProps<{
  tag: Tag;
  loading?: boolean;
  error?: string | null;
}>();

const emit = defineEmits<{
  subscribe: [];
  unsubscribe: [];
}>();

const authStore = useAuthStore();
const tagsStore = useTagsStore();
const { subscribedTags } = storeToRefs(tagsStore);

const isSubscribed = computed(() => subscribedTags.value.some((t) => t.id === props.tag.id));

function handleClick(): void {
  if (isSubscribed.value) emit('unsubscribe');
  else emit('subscribe');
}
</script>
```

- [ ] **Step 2: Run — should pass**

```bash
npm test -- --run packages/client/src/__tests__/components/tags/TagSubscribeButton.test.ts 2>&1 | tail -10
```

### Task 5.3: Write failing tests for `<SearchPagination>`

- [ ] **Step 1: Create test file**

```ts
// packages/client/src/__tests__/components/search/SearchPagination.test.ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import SearchPagination from '@/components/search/SearchPagination.vue';

describe('<SearchPagination>', () => {
  it('hidden when totalPages <= 1', () => {
    const w0 = mount(SearchPagination, { props: { page: 1, totalPages: 0 } });
    const w1 = mount(SearchPagination, { props: { page: 1, totalPages: 1 } });
    expect(w0.find('[data-testid="search-pagination"]').exists()).toBe(false);
    expect(w1.find('[data-testid="search-pagination"]').exists()).toBe(false);
  });

  it('renders page-indicator with "page X of Y"', () => {
    const w = mount(SearchPagination, { props: { page: 2, totalPages: 5 } });
    expect(w.get('[data-testid="page-indicator"]').text()).toContain('page 2 of 5');
  });

  it('Prev disabled at page 1', () => {
    const w = mount(SearchPagination, { props: { page: 1, totalPages: 3 } });
    expect(w.get('[data-testid="prev-page-btn"]').attributes('disabled')).toBeDefined();
    expect(w.get('[data-testid="next-page-btn"]').attributes('disabled')).toBeUndefined();
  });

  it('Next disabled at page = totalPages', () => {
    const w = mount(SearchPagination, { props: { page: 3, totalPages: 3 } });
    expect(w.get('[data-testid="next-page-btn"]').attributes('disabled')).toBeDefined();
    expect(w.get('[data-testid="prev-page-btn"]').attributes('disabled')).toBeUndefined();
  });

  it('emits change(page+1) on Next click', async () => {
    const w = mount(SearchPagination, { props: { page: 1, totalPages: 3 } });
    await w.get('[data-testid="next-page-btn"]').trigger('click');
    expect(w.emitted('change')).toEqual([[2]]);
  });

  it('emits change(page-1) on Prev click', async () => {
    const w = mount(SearchPagination, { props: { page: 3, totalPages: 3 } });
    await w.get('[data-testid="prev-page-btn"]').trigger('click');
    expect(w.emitted('change')).toEqual([[2]]);
  });
});
```

- [ ] **Step 2: Run — fail**

```bash
npm test -- --run packages/client/src/__tests__/components/search/SearchPagination.test.ts
```

### Task 5.4: Implement `<SearchPagination>`

```vue
<!-- packages/client/src/components/search/SearchPagination.vue -->
<template>
  <nav v-if="totalPages > 1" data-testid="search-pagination" class="flex items-center gap-3 py-4">
    <button
      data-testid="prev-page-btn"
      :disabled="page <= 1"
      class="rounded border border-gray-700 px-3 py-1 text-sm disabled:opacity-40"
      @click="emit('change', page - 1)"
    >
      Prev
    </button>
    <span data-testid="page-indicator" class="text-sm text-gray-400">
      page {{ page }} of {{ totalPages }}
    </span>
    <button
      data-testid="next-page-btn"
      :disabled="page >= totalPages"
      class="rounded border border-gray-700 px-3 py-1 text-sm disabled:opacity-40"
      @click="emit('change', page + 1)"
    >
      Next
    </button>
  </nav>
</template>

<script setup lang="ts">
defineProps<{ page: number; totalPages: number }>();
const emit = defineEmits<{ change: [page: number] }>();
</script>
```

Run tests, confirm pass.

### Task 5.5: Write failing tests for `<TagPage>`

```ts
// packages/client/src/__tests__/pages/TagPage.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { flushPromises } from '@vue/test-utils';
import TagPage from '@/pages/TagPage.vue';

// fetch mock per test
beforeEach(() => {
  setActivePinia(createPinia());
  vi.stubGlobal('fetch', vi.fn());
});

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/tags/:name', name: 'tag-view', component: TagPage }],
});

async function navigateToTag(name: string) {
  await router.push(`/tags/${name}`);
}

describe('<TagPage>', () => {
  it('renders loading state during initial fetch', async () => {
    (global.fetch as any).mockImplementation(() => new Promise(() => {})); // never resolves
    const w = mount(TagPage, { global: { plugins: [router] } });
    await navigateToTag('typescript');
    expect(w.find('[data-testid="tag-page-loading"]').exists()).toBe(true);
  });

  it('renders tag-page-empty when API returns 0 posts', async () => {
    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'b1', name: 'devops', postCount: 0, subscriberCount: 0 }),
      }) // /api/tags/devops
      .mockResolvedValueOnce({ ok: true, json: async () => ({ posts: [], hasMore: false }) }); // /api/posts/feed?tag=devops
    const w = mount(TagPage, { global: { plugins: [router] } });
    await navigateToTag('devops');
    await flushPromises();
    expect(w.find('[data-testid="tag-page-empty"]').exists()).toBe(true);
  });

  it('renders tag-not-found on 404 from /api/tags/:name', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ error: 'Tag not found' }),
    });
    const w = mount(TagPage, { global: { plugins: [router] } });
    await navigateToTag('does-not-exist');
    await flushPromises();
    expect(w.find('[data-testid="tag-not-found"]').exists()).toBe(true);
  });

  it('renders tag-page with title and PostList when posts exist', async () => {
    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'b1', name: 'typescript', postCount: 4, subscriberCount: 1 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          posts: [{ id: 'p1', title: 'TS Cheat Sheet' /*...*/ }],
          hasMore: false,
        }),
      });
    const w = mount(TagPage, { global: { plugins: [router] } });
    await navigateToTag('typescript');
    await flushPromises();
    expect(w.find('[data-testid="tag-page"]').exists()).toBe(true);
    expect(w.get('[data-testid="tag-page-title"]').text()).toContain('typescript');
  });
});
```

### Task 5.6: Implement `<TagPage>`

```vue
<!-- packages/client/src/pages/TagPage.vue -->
<template>
  <div data-testid="tag-page-loading" v-if="state === 'loading'" class="p-6 text-center">
    Loading tag…
  </div>
  <div data-testid="tag-not-found" v-else-if="state === 'not-found'" class="p-6 text-center">
    <p class="text-gray-400">Tag not found</p>
    <RouterLink to="/" class="text-primary hover:underline">Back to home</RouterLink>
  </div>
  <div data-testid="tag-page" v-else class="mx-auto max-w-4xl px-4 py-6">
    <h1 data-testid="tag-page-title" class="mb-2 text-2xl font-bold text-white">
      #{{ tag!.name }}
    </h1>
    <p class="mb-4 text-sm text-gray-400">
      {{ tag!.postCount }} posts · {{ tag!.subscriberCount }} subscribers
    </p>
    <TagSubscribeButton
      :tag="tag!"
      :loading="subscribePending"
      :error="subscribeError"
      @subscribe="handleSubscribe"
      @unsubscribe="handleUnsubscribe"
    />
    <div
      v-if="posts.length === 0"
      data-testid="tag-page-empty"
      class="mt-8 text-center text-gray-500"
    >
      No posts tagged #{{ tag!.name }} yet.
    </div>
    <PostList
      v-else
      :posts="posts"
      :selected-post-id="null"
      :loading="false"
      :error="null"
      :has-more="false"
      :current-sort="'recent'"
      :current-filter="null"
      :current-tag="tag!.name"
    />
  </div>
</template>
<!--
  PostList contract: 8 required props per packages/client/src/components/post/PostList.vue:70-80
  (posts, selectedPostId, loading, error, hasMore, currentSort, currentFilter, currentTag).
  All passed here. WU6 also extends PostList's currentFilter switch ladder to handle 'subscribed'
  with a TypeScript never-exhaustiveness check; TagPage passes currentFilter=null which is the
  pre-existing default-branch path.
-->

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRoute, RouterLink } from 'vue-router';
import { apiFetch } from '@/lib/api';
import { useTags } from '@/composables/useTags';
import TagSubscribeButton from '@/components/tags/TagSubscribeButton.vue';
import PostList from '@/components/post/PostList.vue';
import type { Tag, PostWithAuthor } from '@forge/shared';

const route = useRoute();
const state = ref<'loading' | 'success' | 'not-found'>('loading');
const tag = ref<(Tag & { subscriberCount: number; postCount: number }) | null>(null);
const posts = ref<PostWithAuthor[]>([]);
const subscribePending = ref(false);
const subscribeError = ref<string | null>(null);
const { subscribe, unsubscribe } = useTags();

async function load(name: string): Promise<void> {
  state.value = 'loading';
  const tagRes = await apiFetch(`/api/tags/${encodeURIComponent(name)}`);
  if (!tagRes.ok) {
    state.value = tagRes.status === 404 ? 'not-found' : 'loading';
    return;
  }
  tag.value = await tagRes.json();
  const feedRes = await apiFetch(`/api/posts/feed?tag=${encodeURIComponent(name)}`);
  if (feedRes.ok) {
    const data = await feedRes.json();
    posts.value = data.posts;
  }
  state.value = 'success';
}

watch(
  () => route.params.name as string,
  (n) => {
    if (n) load(n);
  },
  { immediate: true },
);

async function handleSubscribe(): Promise<void> {
  if (!tag.value) return;
  subscribePending.value = true;
  subscribeError.value = null;
  try {
    await subscribe(tag.value);
  } catch (e) {
    subscribeError.value = String(e);
  } finally {
    subscribePending.value = false;
  }
}

async function handleUnsubscribe(): Promise<void> {
  if (!tag.value) return;
  subscribePending.value = true;
  subscribeError.value = null;
  try {
    await unsubscribe(tag.value.id);
  } catch (e) {
    subscribeError.value = String(e);
  } finally {
    subscribePending.value = false;
  }
}
</script>
```

(`PostList` component path: verify it exists at `packages/client/src/components/post/PostList.vue` — if not, the existing post-list rendering surface must be located and reused.)

### Task 5.7: Run all WU5 tests + coverage

```bash
npm test -- --run packages/client/src/__tests__/components/tags \
                  packages/client/src/__tests__/components/search/SearchPagination.test.ts \
                  packages/client/src/__tests__/pages/TagPage.test.ts 2>&1 | tail -20

npm run test:coverage -- --run packages/client/src/components/tags packages/client/src/components/search/SearchPagination.vue packages/client/src/pages/TagPage.vue 2>&1 | grep -E "(TagSubscribeButton|SearchPagination|TagPage)"
```

Expected: tests pass, all three new components show 100/100/100/100.

### Task 5.8: Commit WU5

```bash
git add packages/client/src/pages/TagPage.vue \
        packages/client/src/components/tags/TagSubscribeButton.vue \
        packages/client/src/components/search/SearchPagination.vue \
        packages/client/src/__tests__/components/tags/ \
        packages/client/src/__tests__/components/search/SearchPagination.test.ts \
        packages/client/src/__tests__/pages/TagPage.test.ts

git commit -m "feat(client): #49 new components — TagSubscribeButton, SearchPagination, TagPage

Three new shared/page components, TDD with 100% coverage:

- <TagSubscribeButton> — scoped testid subscribe-btn-{name}, aria-pressed
  state, loading + error variants, hidden when unauthenticated
- <SearchPagination> — Prev/Next with disabled boundary states; testids
  retained on disabled buttons; hidden when totalPages <= 1
- <TagPage> — loading / success+posts / success+empty / 404 states;
  reuses <PostList> for the post feed; uses useTags for subscribe wiring

WU5 of 9. Depends on WU1."
```

**Verification (orchestrator runs):**

```bash
npm test -- --run packages/client/src/__tests__/components/tags \
                  packages/client/src/__tests__/components/search/SearchPagination.test.ts \
                  packages/client/src/__tests__/pages/TagPage.test.ts 2>&1 | grep -E "(passed|failed)" && \
npm run test:coverage -- --run packages/client 2>&1 | grep -E "(TagSubscribeButton|SearchPagination|TagPage)" && \
echo "WU5 verified ✓"
```

---

# Work Unit 6 — Modified components + router additions

**Goal:** Wire the new components into existing surfaces and add the two new client routes.

**Files:**

- Modify: `packages/client/src/components/shell/TheSidebar.vue` (popular-tags-list section)
- Modify: `packages/client/src/components/post/PostMetaHeader.vue` (tag chip → RouterLink)
- Modify: `packages/client/src/pages/PostViewPage.vue` (tag chip span → RouterLink — same testid `post-tag-chip-${tag}` at line 183; the e2e click-tag-from-post.spec.ts navigates to `/posts/<uuid>` which mounts THIS page, not PostMetaHeader)
- Modify: `packages/client/src/components/post/PostList.vue` (extend `currentFilter` switch ladder at line 96 to handle `'subscribed'` and add a TypeScript `never` exhaustiveness check; the design's DoD requires "FeedFilter exhaustive `never` check passes typecheck")
- Modify: `packages/client/src/pages/SearchPage.vue` (chips + pagination)
- Modify: `packages/client/src/components/search/SearchResultItem.vue` (clickable author + stopPropagation)
- Modify: `packages/client/src/stores/search.ts` (page/totalPages/author/since state, URL rewrite for AI-resolved)
- Modify: `packages/client/src/composables/useSearch.ts` (URL builder)
- Modify: `packages/client/src/stores/feed.ts` (accept 'subscribed' filter)
- Modify: `packages/client/src/composables/useFeed.ts` (forward 'subscribed' filter to URL query — verify this composable's `setFilter` accepts the union; if it has its own switch ladder, extend with `never` check)
- Modify: `packages/client/src/plugins/router.ts` (add /following + /tags/:name routes)
- Modify: corresponding existing tests in `packages/client/src/__tests__/` — including a new test for `PostList.vue`'s `'subscribed'` branch and a new test for `PostViewPage.vue`'s tag-chip RouterLink behavior

**Dependencies:** WU1, WU5.

### Task 6.1: Add the two new routes

- [ ] **Step 1: Locate the AppLayout children block in router.ts**

```bash
grep -n "AppLayout\|children:" packages/client/src/plugins/router.ts
```

- [ ] **Step 2: Insert two new routes inside `children`** (alongside the existing `/my-snippets`, `/bookmarks` siblings):

```ts
{
  path: 'following',
  name: 'home-following',
  component: () => import('@/pages/HomePage.vue'),
  props: { filter: 'subscribed' },
},
{
  path: 'tags/:name',
  name: 'tag-view',
  component: () => import('@/pages/TagPage.vue'),
  meta: { requiresAuth: false },
},
```

- [ ] **Step 3: Update the router test to cover both new routes**

```ts
// packages/client/src/__tests__/plugins/router.test.ts (append)
it('resolves /following to home-with-subscribed filter', async () => {
  await router.push('/following');
  expect(router.currentRoute.value.name).toBe('home-following');
  expect(router.currentRoute.value.props).toMatchObject({ default: { filter: 'subscribed' } });
});

it('resolves /tags/:name to tag-view', async () => {
  await router.push('/tags/typescript');
  expect(router.currentRoute.value.name).toBe('tag-view');
  expect(router.currentRoute.value.params.name).toBe('typescript');
});

it('does NOT require auth for /tags/:name', async () => {
  // construct unauthenticated state
  // ...
  await router.push('/tags/typescript');
  // expect no redirect
});
```

### Task 6.2: Extend `feed` store to accept `'subscribed'`

Add a unit test asserting `setFilter('subscribed')` sets `filter.value = 'subscribed'` and that the resulting fetch URL includes `?filter=subscribed`. Then implement.

### Task 6.3: Extend `useSearch` composable to include new params

Update `runSearch` to construct URLs like `/api/search?q=...&author=...&since=...&page=...&ai=true`. When the response includes `aiResolvedFilters`, the composable also calls `router.replace()` with the resolved filters merged into the route query AND `ai` removed.

### Task 6.4: Extend search store

Track `page`, `totalPages`, `author`, `since` reactively. Action `setPage(n)` updates the route to `?page=n` and re-runs search. Document with JSDoc that `aiResolvedFilters` rewriting uses `router.replace` (not `push`) so the back button doesn't return to the pre-rewrite URL.

### Task 6.5: Modify `SearchPage.vue`

- Add the since-preset row (4 chips: Today / 7d / 30d / All time — first three set `?since=<token>`, "All time" omits the param).
- Add `filter-chip-author` rendering when `?author=` is set.
- Add `<SearchPagination>` below the result groups, wired to `searchStore.page` / `searchStore.totalPages` and `setPage` action.

### Task 6.6: Modify `SearchResultItem.vue`

- Wrap the author display name in a clickable element (button with `data-testid="search-result-author"`).
- Click handler emits a new event `addAuthorFilter(displayName)` AND calls `event.stopPropagation()` so the parent `@click="$emit('select')"` does NOT fire.

```vue
<!-- packages/client/src/components/search/SearchResultItem.vue (snippet around the author rendering) -->
<button
  data-testid="search-result-author"
  type="button"
  class="cursor-pointer text-xs text-gray-400 hover:text-gray-200 hover:underline focus-visible:ring-1 focus-visible:ring-primary"
  @click.stop="emit('addAuthorFilter', item.authorDisplayName)"
>
  {{ item.authorDisplayName }}
</button>
```

In SearchResultGroup, forward the event to SearchPage. In SearchPage, the handler pushes `?author=<displayName>` into the route.

### Task 6.7: Modify `TheSidebar.vue`

Add a new section beneath Following:

```vue
<!-- popular-tags section (around line 60+ of TheSidebar.vue, beneath "Following") -->
<div class="mt-6">
  <h3 class="px-3 text-xs font-medium uppercase text-gray-500">Popular Tags</h3>
  <div data-testid="popular-tags-list" class="space-y-1">
    <div
      v-for="tag in popularTags"
      :key="tag.id"
      :data-testid="`popular-tag-row-${tag.name}`"
      class="flex items-center justify-between px-3 py-1"
    >
      <RouterLink :to="{ name: 'tag-view', params: { name: tag.name } }" class="text-sm text-gray-300 hover:text-white">
        #{{ tag.name }}
      </RouterLink>
      <TagSubscribeButton
        :tag="tag"
        :loading="pendingTagId === tag.id"
        @subscribe="handleSubscribe(tag)"
        @unsubscribe="handleUnsubscribe(tag.id)"
      />
    </div>
  </div>
</div>

<!-- Add a Following nav link in the main nav block: -->
<RouterLink data-testid="following-nav-link" :to="{ name: 'home-following' }" class="...">
  Following
</RouterLink>
```

Mount `loadPopularTags(10)` in `onMounted`.

### Task 6.8a: Modify `PostViewPage.vue` tag chip → RouterLink

The post-detail page (`packages/client/src/pages/PostViewPage.vue:180-186`) renders its own tag chips as `<span data-testid="post-tag-chip-${tag}">`. The e2e `click-tag-from-post.spec.ts` navigates to `/posts/<uuid>` which mounts THIS page, NOT `PostMetaHeader.vue`. Without this change the e2e spec will fail because `<span>` clicks don't navigate.

- [ ] **Step 1: Locate the tag-chip block**

```bash
grep -n "post-tag-chip" packages/client/src/pages/PostViewPage.vue
```

- [ ] **Step 2: Replace the `<span>` with `<RouterLink>`**

```vue
<!-- packages/client/src/pages/PostViewPage.vue (around line 180–186, replacing the existing v-for span) -->
<RouterLink
  v-for="tag in currentPost.tags"
  :key="tag"
  :to="{ name: 'tag-view', params: { name: tag } }"
  :data-testid="`post-tag-chip-${tag}`"
  class="rounded bg-gray-700 px-2 py-0.5 text-xs text-gray-300 hover:bg-gray-600"
>
  #{{ tag }}
</RouterLink>
```

- [ ] **Step 3: Extend / write a unit test for PostViewPage tag-chip navigation**

Add a test in `packages/client/src/__tests__/pages/PostViewPage.test.ts` asserting that the tag chip is now an `<a>` element with `href` matching `/tags/:name` (or the equivalent VueRouter-resolved path).

### Task 6.8b: Modify `PostList.vue` `currentFilter` switch ladder for `'subscribed'`

`packages/client/src/components/post/PostList.vue:96` has `switch (props.currentFilter) { case 'mine': ...; case 'bookmarked': ... }`. The design's DoD requires the `FeedFilter` exhaustiveness `never` check; without updating this file the DoD is unreachable.

- [ ] **Step 1: Read the current switch**

```bash
sed -n '90,110p' packages/client/src/components/post/PostList.vue
```

- [ ] **Step 2: Extend the switch and add the `never` exhaustiveness check**

```vue
<!-- packages/client/src/components/post/PostList.vue (around line 96, replacing the existing switch) -->
<script setup lang="ts">
// ...existing imports...
import type { FeedFilter } from '@forge/shared';

// In the empty-state copy computed:
function emptyStateCopy(filter: FeedFilter | null): string {
  if (filter === null) return 'No posts yet.';
  switch (filter) {
    case 'mine':
      return "You haven't posted anything yet.";
    case 'bookmarked':
      return "You haven't bookmarked anything yet.";
    case 'subscribed':
      return 'No recent posts from tags you follow.';
    default: {
      const _exhaustive: never = filter;
      throw new Error(`Unhandled filter: ${String(_exhaustive)}`);
    }
  }
}
</script>
```

- [ ] **Step 3: Add a unit test for the `'subscribed'` branch**

In `packages/client/src/__tests__/components/post/PostList.test.ts` (create if missing or extend):

```ts
it('renders subscribed-filter empty-state copy', () => {
  const w = mount(PostList, {
    props: {
      posts: [],
      currentFilter: 'subscribed' /* + other required props with sensible defaults */,
    },
  });
  expect(w.text()).toContain('No recent posts from tags you follow');
});
```

- [ ] **Step 4: Verify typecheck catches future missing-case scenarios**

```bash
npm run typecheck 2>&1 | tail -5
```

If a developer later adds a new `FeedFilter` value without updating this switch, typecheck will fail at the `_exhaustive: never` line.

### Task 6.9: Modify `PostMetaHeader.vue`

Replace the `<span>` tag chip with a `<RouterLink>`:

```vue
<RouterLink
  v-for="tag in post.tags"
  :key="tag"
  :to="{ name: 'tag-view', params: { name: tag } }"
  :data-testid="`post-tag-chip-${tag}`"
  class="rounded bg-gray-700 px-2 py-0.5 text-xs text-gray-300 hover:bg-gray-600"
>
  #{{ tag }}
</RouterLink>
```

The testid stays the same (DOM-element type changed; selector still matches).

### Task 6.10: Update existing client unit tests

For each modified file, extend the existing test file to maintain 100% coverage. Each test should target a new branch added in this WU. Examples:

- `__tests__/components/shell/TheSidebar.test.ts`: add tests for popular-tags-list rendering, subscribe button click → API call, Following nav link presence
- `__tests__/components/post/PostMetaHeader.test.ts`: assert `post-tag-chip-${tag}` is now an `<a>` element with the correct `to` prop
- `__tests__/pages/SearchPage.test.ts`: tests for filter-chip-author rendering, since-preset chips, pagination component presence
- `__tests__/components/search/SearchResultItem.test.ts`: tests for author-name click emitting `addAuthorFilter` AND stopPropagation behavior
- `__tests__/stores/search.test.ts`: tests for `setPage`, `aiResolvedFilters` URL rewrite via mocked router
- `__tests__/stores/feed.test.ts`: tests for `setFilter('subscribed')`
- `__tests__/composables/useSearch.test.ts`: tests for URL construction with author/since/page; URL rewrite on aiResolvedFilters response
- `__tests__/plugins/router.test.ts`: tests already added in Task 6.1

### Task 6.11: Run full client test suite + coverage

```bash
npm test -- --run packages/client 2>&1 | tail -20
npm run test:coverage -- --run packages/client 2>&1 | tail -30
```

Expected: 100% on every file in the WU's modify scope.

### Task 6.12: Commit WU6

```bash
git add packages/client/src/components/ \
        packages/client/src/pages/SearchPage.vue \
        packages/client/src/stores/ \
        packages/client/src/composables/useSearch.ts \
        packages/client/src/plugins/router.ts \
        packages/client/src/__tests__/

git commit -m "feat(client): #49 wire new components + add /following and /tags/:name routes

- TheSidebar: popular-tags-list section with inline TagSubscribeButton;
  Following nav link
- PostMetaHeader: tag chip is now <RouterLink> to /tags/:name
- SearchPage: filter-chip-author + filter-chip-since chips + since-
  preset row + <SearchPagination>
- SearchResultItem: author display name is clickable; emits
  addAuthorFilter; event.stopPropagation prevents post navigation
- search store: tracks page/totalPages/author/since; rewrites URL with
  router.replace when aiResolvedFilters returned (so back button doesn't
  re-trigger AI)
- feed store: accepts 'subscribed' filter
- router: /following (home-with-subscribed-filter) and /tags/:name
  (public, no auth required)

100% coverage on every modified file. WU6 of 9. Depends on WU1, WU5."
```

**Verification (orchestrator runs):**

```bash
npm test -- --run packages/client 2>&1 | grep -E "(passed|failed)" && \
npm run test:coverage -- --run packages/client 2>&1 | grep -E "(SearchPage|TheSidebar|PostMetaHeader|SearchResultItem|stores/search|stores/feed|useSearch|router)\.(ts|vue)" && \
echo "WU6 verified ✓"
```

---

# Work Unit 7 — Server-side mock LLM script for AI-search e2e

**Goal:** Add the named mock script the AI-search e2e spec uses. Per the design's adversarial checklist: "Mock LLM script for the AI-search spec is a NAMED key from the shared registry, not `default`."

**Files:**

- Likely: extend `packages/shared/src/types/mock-script-keys.ts` (registry of named keys)
- Likely: extend the mock provider's script lookup table on the server

**Dependencies:** WU2 (the AI-search route changes must be in place).

### Task 7.1: Locate the mock script registry

```bash
grep -rn "MockScriptKey\|search-resolves\|mockScript" packages/shared/src packages/server/src 2>&1 | grep -v test | head -20
```

The exact files depend on what foundation #44 shipped. Identify (a) the named-key registry file (typically `packages/shared/src/types/mock-script-keys.ts`) and (b) the server-side script lookup table.

### Task 7.2: Write the failing test FIRST (TDD per CLAUDE.md)

- [ ] **Step 1: Add a unit test asserting the new key produces the expected resolved filters**

Locate the existing mock-provider test (likely `packages/server/src/__tests__/plugins/langchain/search-chain.test.ts` or similar). Append:

```ts
describe('search-resolves-to-typescript-tag mock script (Issue #49)', () => {
  it('returns deterministic AI filters with tags=["typescript"]', async () => {
    const provider = createMockProvider();
    const chain = createSearchChain(provider);
    // Set the named script key on the provider via the mock-LLM mechanism
    // (exact API depends on foundation #44 implementation)
    const filters = await runSearchChain(chain, 'typescript', {
      mockScriptKey: 'search-resolves-to-typescript-tag',
    });
    expect(filters).toEqual({
      tags: ['typescript'],
      language: null,
      contentType: null,
      textQuery: 'typescript',
    });
  });
});
```

- [ ] **Step 2: Run the test — it MUST fail** (the named key doesn't exist yet)

```bash
npm test -- --run packages/server/src/__tests__/plugins/langchain 2>&1 | tail -10
```

Expected: failure with "unknown mock-script key" or "key not found in registry".

### Task 7.3: Add the named key to the registry

- [ ] **Step 1: Edit the `MockScriptKey` registry**

```ts
// packages/shared/src/types/mock-script-keys.ts (or wherever foundation #44 defined it)
export const MOCK_SCRIPT_KEYS = [
  // ...existing keys...
  'search-resolves-to-typescript-tag',
] as const;

export type MockScriptKey = (typeof MOCK_SCRIPT_KEYS)[number];
```

- [ ] **Step 2: Add the script's deterministic output to the server-side lookup**

```ts
// packages/server/src/plugins/langchain/mock-provider.ts (or equivalent)
const SCRIPTS: Record<MockScriptKey, AiSearchFilters> = {
  // ...existing...
  'search-resolves-to-typescript-tag': {
    tags: ['typescript'],
    language: null,
    contentType: null,
    textQuery: 'typescript',
  },
};
```

- [ ] **Step 3: Re-run the test — it should pass**

```bash
npm test -- --run packages/server/src/__tests__/plugins/langchain 2>&1 | tail -10
```

### Task 7.4: Commit WU7

```bash
git add packages/shared/src/types/mock-script-keys.ts \
        packages/server/src/plugins/langchain/mock-provider.ts \
        packages/server/src/__tests__/plugins/langchain/

git commit -m "feat(mock-llm): #49 search-resolves-to-typescript-tag named script

Adds a deterministic mock script the e2e AI-search spec can use via
withMockScript() helper. Per design's adversarial checklist: spec
MUST use a named key, not 'default'.

WU7 of 9. Depends on WU2."
```

**Verification:**

```bash
npm test -- --run packages/server/src/__tests__/plugins/langchain 2>&1 | grep -E "(passed|failed)" && \
echo "WU7 verified ✓"
```

---

# Work Unit 8 — E2E specs + selector shards (22 specs)

**Goal:** Write the 22 Playwright specs (9 tags + 13 search) per the design inventory. All pass at workers=1 AND workers=4.

**Files:**

- Create: `e2e/fixtures/selectors/tags.ts`
- Modify: `e2e/fixtures/selectors/search.ts` (extend)
- Create: 22 new spec files (per the §File structure list above)

**Dependencies:** WU1, WU2, WU3, WU4, WU5, WU6, WU7.

### Task 8.1: Write the selector shards

- [ ] **Step 1: Create `e2e/fixtures/selectors/tags.ts`**

```ts
// e2e/fixtures/selectors/tags.ts
import type { Page, Locator } from '@playwright/test';

export const tags = {
  popularTagsList: (page: Page): Locator => page.getByTestId('popular-tags-list'),
  popularTagRow: (page: Page, name: string): Locator => page.getByTestId(`popular-tag-row-${name}`),
  subscribeBtn: (page: Page, name: string): Locator => page.getByTestId(`subscribe-btn-${name}`),
  subscribeError: (page: Page, name: string): Locator =>
    page.getByTestId(`subscribe-error-${name}`),
  tagPage: (page: Page): Locator => page.getByTestId('tag-page'),
  tagPageTitle: (page: Page): Locator => page.getByTestId('tag-page-title'),
  tagPageLoading: (page: Page): Locator => page.getByTestId('tag-page-loading'),
  tagPageEmpty: (page: Page): Locator => page.getByTestId('tag-page-empty'),
  tagNotFound: (page: Page): Locator => page.getByTestId('tag-not-found'),
  followingNavLink: (page: Page): Locator => page.getByTestId('following-nav-link'),
  subscribedTagLink: (page: Page, name: string): Locator =>
    page.getByTestId(`subscribed-tag-link-${name}`),
  postTagChip: (page: Page, name: string): Locator => page.getByTestId(`post-tag-chip-${name}`),
};
```

- [ ] **Step 2: Extend `e2e/fixtures/selectors/search.ts`** with the new selectors (per design selector-shards table — full enumeration there).

### Task 8.2: Write the 9 tags/ specs

Each spec follows this skeleton (using the established `import { test, expect } from '../../fixtures/reset.js'` pattern):

```ts
// e2e/specs/tags/popular-tags-render.spec.ts
import { test, expect } from '../../fixtures/reset.js';
import { tags } from '../../fixtures/selectors/tags.js';

test('tags: popular-tags list renders on home', async ({ testuser }) => {
  await testuser.goto('/');
  await expect(tags.popularTagsList(testuser)).toBeVisible();
  // Render checklist: ≥1 row visible (count = 1 assertion concept).
  await expect(tags.popularTagRow(testuser, 'typescript')).toBeVisible();
});
```

The other 8 follow the design's spec inventory verbatim. **Critical assertions per spec:**

- `subscribe-from-sidebar.spec.ts`: click `subscribe-btn-typescript`, assert `aria-pressed="true"`. Use `page.getByTestId('subscribe-btn-typescript').toHaveAttribute('aria-pressed', 'true')`.
- `subscribed-tag-appears-in-following.spec.ts`: pre-state — call `POST /api/tags/${pythonTagId}/subscribe` via `testuser.request.post(...)` with bearer token. Then visit `/`, assert `subscribed-tag-link-python` visible.
- `unsubscribe-from-sidebar.spec.ts`: pre-state subscribe to ai-prompts via API; click `subscribe-btn-ai-prompts`; assert `aria-pressed="false"`.
- `subscribed-tag-feed.spec.ts`: pre-state subscribe to react via API; visit `/following`; assert ≥1 post-list-item AND each visible item has `post-tag-chip-react`. **Confirm during impl: react-tagged seeded posts (004, 011) are NOT authored by testuser** — the feed shows posts from authors testuser follows, NOT testuser's own posts. Both are by bob (`a0…0002`), so OK.
- `tag-page.spec.ts`: visit `/tags/typescript`; render checklist for `tag-page`, `tag-page-title`, ≥1 `post-list-item`.
- `my-subscriptions-list.spec.ts`: log in as alice (seeded with sub to **typescript**, `b0...0001`, per scripts/seed.sql:128 — design doc had this wrong); assert `subscribed-tag-link-typescript` visible. Note: spec #2 (`subscribe-from-sidebar` as testuser) writes to a DIFFERENT row in `user_tag_subscriptions` (testuser, typescript) — alice and testuser are different users, PK is `(user_id, tag_id)`, so no contention.
- `click-tag-from-post.spec.ts`: visit `/posts/c0000000-0000-0000-0000-000000000001` (typescript-tagged); click `post-tag-chip-typescript`; `expect(page).toHaveURL('/tags/typescript')`.
- `subscribe-from-tag-page.spec.ts`: visit `/tags/devops` as testuser; click `subscribe-btn-devops`; assert `aria-pressed="true"`.

**Pre-state via API, NOT via UI**: gives deterministic state without depending on the very subscribe-button UX we're testing in #2. Follow the existing pattern from `e2e/specs/bookmarks/persists-across-sessions.spec.ts` for API-based pre-state setup.

### Task 8.3: Write the 13 search/ specs

Critical specs and their key assertions:

- `plain-query.spec.ts` — visit `/search?q=typescript`; ≥1 `search-result-item`.
- `no-results.spec.ts` — visit `/search?q=zzz123nope`; assert `try-fuzzy-link` visible.
- `fuzzy-match.spec.ts` — visit `/search?q=typscrpt` (typo); click `try-fuzzy-link`; `expect(page).toHaveURL(/.*[?&]fuzzy=true/)`; assert ≥1 result.
- `ai-toggle.spec.ts` — `withMockScript('search-resolves-to-typescript-tag')`; open modal; click `ai-toggle`; type query; navigate to results page; assert page-1 results match the mock-script's resolved filter.
- `filter-chip-tag.spec.ts` — visit `/search?q=ts&tag=typescript`; assert `filter-chip-tag` AND results all carry typescript.
- `filter-chip-tag-remove.spec.ts` — visit as above; click `remove-filter-tag`; URL drops `?tag=`; chip gone.
- `filter-chip-type.spec.ts` — visit `/search?q=ts&type=snippet`; assert chip + `contentType==='snippet'`.
- `filter-chip-author.spec.ts` — visit `/search?q=the`; click `search-result-author` of an alice-authored result; URL becomes `/search?q=the&author=Alice`; chip visible; results all by alice.
- `filter-chip-since.spec.ts` — visit `/search?q=fixture`; click `since-preset-7d`; URL `?since=7d`; assert ≥1 result (paginationuser fixture posts within 7d window).
- `result-click.spec.ts` — visit search; click first result; URL becomes `/posts/<uuid>`.
- `cmd-k-shortcut.spec.ts` — `await page.keyboard.press('Meta+K')` on macOS branch / `'Control+K'` elsewhere; assert search modal visible.
- `pagination.spec.ts` — visit `/search?q=fixture&tag=tag-pagination-fixture`; `page-indicator` shows "page 1 of 2"; click `next-page-btn`; URL becomes `?page=2`; result set differs.
- `recent-searches.spec.ts` — open modal; type "abc"; press Enter; close modal; reopen; assert `recent-query` containing "abc" visible.

### Task 8.4: Run all e2e specs locally — workers=1 first

```bash
# Pre-condition: server + client preview running per CLAUDE.md
npm run e2e -- specs/tags specs/search 2>&1 | tail -30
```

Expected: all 22 specs pass.

### Task 8.5: Run at workers=4

```bash
npm run e2e -- specs/tags specs/search --workers=4 2>&1 | tail -30
```

Expected: all 22 pass. If any flake on cross-worker contention, debug:

- Run individual flaky spec in isolation (workers=1) to confirm it's contention not logic
- Confirm `e2e/fixtures/reset.ts` is per-spec (verified earlier — should be)
- Confirm subscribe specs use distinct seeded tags (already confirmed in plan)

### Task 8.6: Commit WU8

```bash
git add e2e/fixtures/selectors/tags.ts \
        e2e/fixtures/selectors/search.ts \
        e2e/specs/tags/ \
        e2e/specs/search/

git commit -m "test(e2e): #49 tags + search specs (22 specs total)

- e2e/specs/tags/ (9 specs): popular-tags render, subscribe from
  sidebar, subscribe state appears in Following, unsubscribe,
  subscribed-tag feed, TagPage render, my-subscriptions list,
  click-tag-from-post, subscribe from TagPage
- e2e/specs/search/ (13 specs): plain query, no-results, fuzzy,
  AI-toggle (named mock script), filter-chip-{tag,type,author,since},
  filter-chip-tag-remove, result-click, Cmd+K, pagination, recent
  searches
- New e2e/fixtures/selectors/tags.ts; extended search.ts shard

All specs pass at workers=1 AND workers=4. Subscribe specs use 5
distinct seeded tags (typescript / python / ai-prompts / react /
devops) to eliminate per-row contention. Pagination spec uses the
new paginationuser fixture (WU4) so existing testuser-count
assertions are unaffected.

WU8 of 9. Depends on WU1-WU7."
```

**Verification (orchestrator runs):**

```bash
npm run e2e -- specs/tags specs/search 2>&1 | grep -E "passed|failed" && \
npm run e2e -- specs/tags specs/search --workers=4 2>&1 | grep -E "passed|failed" && \
echo "WU8 verified ✓"
```

---

# Work Unit 9 — Pre-PR self-reflect + final integration check + PR creation

**Goal:** Run `/self-reflect` to extract knowledge, commit any knowledge-base updates, run the FULL test suite (npm test, npm run test:coverage, full Bruno, full e2e), then open the PR with a description that states the green-run counter and the no-flip decision.

**Dependencies:** WU1–WU8 all merged into the branch.

### Task 9.1: Run `/self-reflect`

```bash
# Invoke the metaswarm self-reflect skill.
# It will:
# - Re-read the design and the plan
# - Compare against the diff on the branch
# - Extract durable knowledge (gotchas, patterns, decisions worth remembering)
# - Update knowledge-base files (CLAUDE.md, MEMORY.md if anchored, knowledge/ dir if present)
```

Per CLAUDE.md §Pre-PR Knowledge Capture: the knowledge-base updates land atomically with the implementation, NOT in a follow-up.

### Task 9.2: Run all gates locally — including the global coverage-threshold enforcement command

Per `.coverage-thresholds.json`'s `enforcement.command` field, the canonical coverage gate is `npm run test:coverage` run **without scoping to a single package** (so the global thresholds — lines/branches/functions/statements at 100% — are enforced across the entire diff). Per WU verification commands scope coverage to a package; this WU runs the global form to close the gate.

```bash
# 1) Unit + integration tests (entire workspace)
npm test 2>&1 | tail -10

# 2) GLOBAL coverage gate — the .coverage-thresholds.json enforcement command.
#    Vitest exits non-zero if any threshold is missed. This is the BLOCKING gate
#    per CLAUDE.md §Coverage and per .coverage-thresholds.json §enforcement.
npm run test:coverage 2>&1 | tail -30
# Verify: no "ERROR: Coverage for X (NN%) does not meet global threshold (100%)"

# 3) Bruno (full suite)
cd bruno && npx @usebruno/cli run -r --env local && cd ..

# 4) E2E at workers=4 (CI-equivalent)
npm run e2e -- --workers=4 2>&1 | tail -20

# 5) Build all packages
npm run build 2>&1 | tail -10

# 6) Typecheck (catches the FeedFilter exhaustive-never check from Task 6.8b)
npm run typecheck 2>&1 | tail -5
```

Each command must succeed. If any fails, fix before proceeding. If the coverage gate fails on a file outside this PR's diff (i.e., a pre-existing 100% file regressed), STOP and triage — do NOT lower thresholds or add `/* istanbul ignore */` to bypass.

### Task 9.3: Update tracking issue #43

Add a comment confirming issue #4 (this issue) is merged. Also update the spec count row for tags/ and search/ in the body.

### Task 9.4: Commit `/self-reflect` outputs and any final tweaks

```bash
git add CLAUDE.md MEMORY.md knowledge/ docs/ 2>/dev/null   # whatever self-reflect touched
git diff --cached --stat
git commit -m "docs(knowledge): #49 self-reflect — capture pagination contract + others

Self-reflect outputs from working through the issue. Captured
gotchas/patterns:

- Pagination respecting tsvector + trigram-fallback architecture
- AI × pagination interaction (resolution only on page=1)
- Public route handler pattern for tag info
- aiResolvedFilters URL rewrite via router.replace
- ...others as captured by self-reflect

WU9 of 9 — final knowledge capture before PR open."
```

### Task 9.5: Open the PR

```bash
gh pr create --title "feat(#49): tags + search UX + 22 e2e specs" --body "$(cat <<'EOF'
## Summary

Closes #49. Part of E2E rollout #43 (4/9).

This PR ships the tags + search UX, server contract additions, Bruno coverage, and 22 Playwright specs in a single cohesive change. **Scope was expanded from the original issue** because a pre-implementation audit found ~60% of #49's DoD referenced UI features that didn't exist. See `docs/superpowers/specs/2026-04-30-issue-49-tags-search-ux-amendment.md` for the design rationale (5/5 design-review-gate approved across 3 rounds).

### User journeys unblocked

1. **Discover → subscribe → consume.** Click a tag chip on a post → land on `/tags/:name` → subscribe → see the tag's posts under `/following`.
2. **Search → narrow → paginate.** Search a query, click an author name to filter by author, pick a since-preset for date filter, page through results.

### What ships

**Server**: `GET /api/posts/feed?filter=subscribed`, `?tag=<name>`; `GET /api/search?author=&since=&page=` with pagination contract pinned against the existing tsvector + trigram-fallback architecture; `GET /api/tags/:name` (fully public, no auth-derived branches); AI search resolution only on page=1 with URL rewrite for page≥2.

**Client**: 3 new components (`TagSubscribeButton`, `SearchPagination`, `TagPage`), 4 modified surfaces (`TheSidebar` popular-tags + Following nav, `PostMetaHeader` tag chips → `<RouterLink>`, `SearchPage` author/since/pagination, `SearchResultItem` clickable author), 2 new routes (`/following`, `/tags/:name`).

**Bruno**: 14 new `.bru` files (8 happy + 6 error). Anonymous `bruno/tags/get-by-name-anonymous.bru` locks the public-access contract.

**Seed**: append-only — new `paginationuser` (UUID a0…0004) owns 25 fixture posts tagged `tag-pagination-fixture` (UUID b0…0006), explicit `created_at` for deterministic since-window assertions. testuser counts unchanged.

**E2E**: 22 new specs (9 tags + 13 search). All pass at workers=1 AND workers=4. Subscribe specs use 5 distinct seeded tags (typescript / python / ai-prompts / react / devops); read-only specs reuse typescript safely.

### Stability gate (per #43)

**Counter at PR open: <FILL_IN>/14.** This PR does **NOT** flip the e2e workflow to blocking — that lands in whichever subsequent #43 sub-issue's PR coincides with the 14th green main run.

### Test plan

- [ ] `npm test` passes (unit + integration)
- [ ] `npm run test:coverage` meets `.coverage-thresholds.json` (100% lines/branches/functions/statements on all modified files)
- [ ] `cd bruno && npx @usebruno/cli run -r --env local` passes (all .bru files including 14 new ones)
- [ ] `npm run e2e --workers=4` passes (22 new specs)
- [ ] `npm run build` passes for all packages
- [ ] 3 consecutive green CI runs on this branch before merge

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

### Task 9.6: Update issue #49 body to point at the amendment

```bash
gh issue edit 49 --body "$(cat <<'EOF'
[full original body]

---

## 2026-04-30 amendment

Pre-implementation audit found ~60% of the original DoD referenced UI features that don't exist. Scope expanded to include the missing UX, server contract additions, Bruno coverage, and the e2e specs in a single cohesive PR. See:

- Amendment design: `docs/superpowers/specs/2026-04-30-issue-49-tags-search-ux-amendment.md`
- Implementation plan: `docs/superpowers/plans/2026-04-30-issue-49-tags-search-implementation.md`

Both passed metaswarm pipeline gates (design-review-gate 5/5, plan-review-gate 3/3) before implementation began.

The original DoD is superseded by the amendment's DoD. The amendment also updates the file scope to include server changes (which the original issue's `Out of scope` clause excluded).
EOF
)"
```

### Task 9.7: Final commit (anything `/self-reflect` adds)

If `/self-reflect` produced any pending changes, commit them. If not, this task is a no-op.

**Verification (orchestrator runs at PR-open time):**

```bash
npm test 2>&1 | grep -E "(passed|failed)" && \
npm run test:coverage 2>&1 | tail -5 && \
(cd bruno && npx @usebruno/cli run -r --env local 2>&1 | tail -5) && \
npm run e2e -- --workers=4 2>&1 | grep -E "passed|failed" && \
gh pr view --json url 2>&1 | grep -i "url" && \
echo "WU9 verified ✓ — PR open"
```

---

## Self-review

| Check                                                                                                                              | Status                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spec coverage — every DoD line item from the design has a task                                                                     | ✅ DoD enumerated in design §Definition of Done; cross-walked into WUs above                                                                              |
| Placeholder scan — no "TBD"/"add appropriate"/"similar to Task N"                                                                  | ✅ each step shows code or exact command                                                                                                                  |
| Type consistency — `subscribeBtn(scope)` is camelCase helper but DOM testid is `subscribe-btn-${name}` per design §Selector shards | ✅ pinned in WU8 selector shard                                                                                                                           |
| File path consistency — feed at `/api/posts/feed` (not `/api/feed`); Bruno files in `bruno/posts/`                                 | ✅ verified WU3                                                                                                                                           |
| Coverage gate — every modified file enumerated in §File structure §Modify                                                          | ✅                                                                                                                                                        |
| Bruno auth posture per file                                                                                                        | ✅ explicit per-file in WU2/WU3                                                                                                                           |
| Spec atomicity — render checklists vs state-transition splits                                                                      | ✅ design §E2E spec inventory carve-out applied; subscribe-from-sidebar split from subscribed-tag-appears-in-following                                    |
| Tag names — only seeded names used (typescript/python/ai-prompts/react/devops)                                                     | ✅ verified against `scripts/seed.sql:27-31`                                                                                                              |
| Open design questions — reset fixture scope, react-post authorship, alice's seeded sub                                             | ✅ resolved at planning time (reset is per-spec; react-tagged posts 004/011 are by bob, not testuser; alice's sub is auto-restored by the per-spec reset) |
| `/self-reflect` BEFORE PR                                                                                                          | ✅ WU9 task 9.1                                                                                                                                           |
| Flip-to-blocking NOT in this PR                                                                                                    | ✅ documented; PR description states counter                                                                                                              |

---

## Estimated effort

| WU        | Files               | Effort estimate                     |
| --------- | ------------------- | ----------------------------------- |
| WU1       | 3 modify            | ~30 min                             |
| WU2       | 3 modify + 8 create | ~3 h                                |
| WU3       | 5 modify + 6 create | ~3 h                                |
| WU4       | 1 modify            | ~30 min                             |
| WU5       | 6 create            | ~4 h                                |
| WU6       | 8 modify            | ~5 h                                |
| WU7       | 2-3 modify          | ~30 min                             |
| WU8       | 24 create           | ~6 h                                |
| WU9       | misc                | ~1 h                                |
| **Total** |                     | **~24 h** of focused implementation |

Parallelizable work (subagent-driven execution) can compress this to ~12 wall-clock hours by running WU1+WU4 in parallel, then WU2+WU3+WU5 in parallel, then WU6, then WU8.

---

## Plan-review-gate handoff

This plan needs to clear the metaswarm `plan-review-gate` (3 adversarial reviewers — Feasibility, Completeness, Scope & Alignment) before the user is asked to choose execution method. Do NOT begin implementation until all 3 reviewers PASS.
