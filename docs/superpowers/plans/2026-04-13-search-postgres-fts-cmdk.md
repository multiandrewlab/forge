# Search (PostgreSQL full-text + Cmd+K modal) Implementation Plan

> **For agentic workers:** Target execution method is metaswarm orchestrated execution — 4-phase loop (IMPLEMENT → VALIDATE → ADVERSARIAL REVIEW → COMMIT) per work unit. Each work unit below has a DoD, file scope, and dependency graph. Alternative: superpowers:subagent-driven-development (one fresh subagent per WU, code review between).

**Goal:** Ship PostgreSQL full-text search (tsvector + pg_trgm fuzzy fallback) and a Cmd+K modal that lets users jump to Snippets, People, and (stub) AI Actions from anywhere in the app, plus a full `/search` results page for deep links.

**Architecture:** Reuse the `search_vector` tsvector column, `forge_search` text search config, weighted trigger, and GIN indexes **already present in migration `001_initial-schema.sql`**. Build a server query layer that runs tsvector first, falls back to pg_trgm on title when fewer than 5 results, and unions in a separate `users` match for the People group. Expose via `GET /api/search`. Client consumes via a Pinia store + `useSearch` composable (300ms debounce) + `useKeyboard` composable (Cmd+K / Ctrl+K). `TheSearchModal` is the first modal in the codebase and must implement focus trap, Esc-to-close, arrow navigation, Enter-to-select. `Search.vue` page renders the same store data at `/search?q=...`.

**Tech Stack:** Fastify + pg (raw SQL, parameterised) on the server; Vue 3.5 + Pinia + vue-router + Tailwind v4 on the client; vitest + @vue/test-utils for tests; Bruno for API E2E; 100% coverage enforced via `.coverage-thresholds.json`.

**GitHub Issue:** multiandrewlab/forge#3 (`[9/19] Search (PostgreSQL full-text + Cmd+K modal)`)

---

## TDD Discipline (applies to every Work Unit)

Per `CLAUDE.md`, TDD is **mandatory**. For every WU below, the implementer MUST follow the red → green → refactor sequence, and must NOT write implementation code before a failing test exists:

1. **Red** — Create or extend the test file listed in the WU's File scope. Encode the DoD behaviour as assertions. Run `npm test -- <test-file>` and confirm the tests FAIL for the right reason (missing module, missing export, missing behaviour — not a syntax error).
2. **Green** — Write the minimum implementation code needed to make the tests pass. Re-run the tests and confirm they PASS.
3. **Refactor** — With tests green, clean up naming, DRY, extract helpers if warranted. Tests stay green.
4. **Coverage check** — `npm run test:coverage`; verify 100% on the new files per `.coverage-thresholds.json`.
5. **Commit** — `git add` scoped files + conventional-commit message. No `--no-verify`.

Orchestrated-execution Phase 1 (IMPLEMENT) encompasses steps 1–3; Phase 2 (VALIDATE) runs step 4 and the wider gates; Phase 3 (ADVERSARIAL REVIEW) confirms tests-first was actually followed (reviewer inspects commit sequence); Phase 4 (COMMIT) persists step 5.

If a WU appears to have no way to write a test first (pure type declarations, trivial re-exports), explicitly note it in the WU body and justify. Shared-types WU-2 is one such case and is flagged there.

---

## Context Recovery / `.beads/` Persistence

Per `CLAUDE.md`, approved plans and execution state MUST be persisted to `.beads/` so agents can recover after context compaction or session interruption.

### After plan approval (before any WU begins)

The orchestrator writes the approved plan reference to `.beads/plans/active-plan.md` with the following frontmatter shape (matching the existing pattern at `.beads/plans/active-plan.md` from the prior WebSocket plan):

```yaml
---
title: "[9/19] Search (PostgreSQL full-text + Cmd+K modal)"
issue: 3
status: in-progress
approved: <YYYY-MM-DD>
gate-iterations: <N>
user-approved: true
execution-method: <metaswarm-orchestrated-execution|subagent-driven-development|executing-plans>
plan-file: docs/superpowers/plans/2026-04-13-search-postgres-fts-cmdk.md
branch: feat/search-postgres-fts-cmdk
---

# Active Plan: Search (PostgreSQL full-text + Cmd+K modal)

See full plan at: `docs/superpowers/plans/2026-04-13-search-postgres-fts-cmdk.md`

## Work Units
1. WU-001: Verify existing search_vector trigger
2. WU-002: Shared search types + Zod schemas
3. WU-003: Server query layer
4. WU-004: Service + route
5. WU-005: Bruno API tests
6. WU-006: Debounce util + Pinia store
7. WU-007: useSearch composable
8. WU-008: useKeyboard composable
9. WU-009: Result components
10. WU-010: TheSearchModal
11. WU-011: Search page + router + shell wiring
```

### Between WUs (execution state)

After each WU commits, the orchestrator updates `.beads/context/execution-state.md` with the current WU index, completed WUs, outstanding blockers, and the next action. After each commit it also refreshes `.beads/context/project-context.md` with any stable facts discovered during the WU (e.g., "TheTopBar input replaced with button").

### On completion

When WU-11 commits, final review passes, and `/self-reflect` is committed, the orchestrator flips the frontmatter to `status: completed`, records `merged-pr:` and `merge-commit:` fields (mirrors the WebSocket plan file).

### On context loss

If an agent resumes mid-execution, it reads `.beads/plans/active-plan.md` for the approved plan pointer, then `.beads/context/execution-state.md` for its position, then rehydrates the next WU — no need to re-run the plan-review-gate.

---

## Prior-Art Audit — What's Already Built

Before scheduling work, we verified what migration 001 already ships:

| DoD item from issue                                                                            | Status      | Evidence (001_initial-schema.sql)              |
| ---------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------- |
| `pg_trgm` and `unaccent` extensions enabled via migration                                      | ✅ Done      | Lines 4–5                                      |
| Custom `forge_search` text search configuration created                                        | ✅ Done      | Lines 7–9                                      |
| `search_vector` tsvector column on `posts` table auto-populated via trigger on insert/update  | ✅ Done      | Line 35 (column) + 129–157 (trigger)           |
| Weighted search: title (A weight) > content (B weight) > tags (C weight)                      | ✅ Done      | Lines 145–148 (`setweight(... 'A' / 'B' / 'C')`) |
| GIN indexes on `search_vector` and `title` (trigram)                                          | ✅ Done      | Lines 121–122                                  |
| Refresh search_vector when revisions or tags change                                            | ✅ Done      | Lines 238–259 (refresh triggers)               |
| `GET /api/search` endpoint with query params: `?q`, `?type`, `?tag`, `?fuzzy`                  | ❌ Not yet   | No `routes/search.ts` exists                   |
| tsvector primary path, trigram fallback when <5 results                                        | ❌ Not yet   | No query layer exists                          |
| `TheSearchModal.vue` on Cmd+K / Ctrl+K                                                         | ❌ Not yet   | No modals exist in codebase                    |
| `Search.vue` page at `/search`                                                                 | ❌ Not yet   | Not in router                                  |
| `useSearch`, `useKeyboard` composables + `search` store                                        | ❌ Not yet   | Not present                                    |
| Shared types (`SearchResponse`, `AiAction`, `UserSummary`)                                     | ❌ Not yet   | Not in `packages/shared`                       |
| Tests (server + client) + Bruno `.bru` files                                                   | ❌ Not yet   | Collection needs `bruno/search/`               |

**Consequence:** No new migration is required. WU-1 (Verification) runs a short integration check against a dev DB to confirm the trigger actually populates `search_vector` end-to-end (insert → revision → tag → search). This protects us from shipping a client that depends on DB behaviour we assumed.

---

## File Structure

### Server (`packages/server/src/`)

| File                                                   | Responsibility                                                                                    |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `db/queries/search.ts` (create)                        | `searchPostsByTsvector`, `searchPostsByTrigram`, `searchUsers` — raw SQL, parameterised           |
| `services/search.ts` (create)                          | `toSearchResult`, `toUserSummary`, `combineResults` — row → DTO transform, dedupe, stub aiActions |
| `routes/search.ts` (create)                            | `GET /api/search` — Zod validation, orchestrates queries → service → `SearchResponse`             |
| `app.ts` (modify)                                      | Register `searchRoutes` with prefix `/api`                                                        |
| `__tests__/db/queries/search.test.ts` (create)         | Unit tests of SQL query construction and parameter binding                                        |
| `__tests__/services/search.test.ts` (create)           | Pure-function transform tests                                                                     |
| `__tests__/routes/search.test.ts` (create)             | Route handler tests via `app.inject()`                                                            |
| `__tests__/integration/search-trigger.test.ts` (create, WU-1) | End-to-end: insert post → add revision/tag → trigger populates `search_vector`             |

### Shared (`packages/shared/src/`)

| File                                 | Responsibility                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------------ |
| `types/search.ts` (create)           | `SearchQuery`, `SearchResponse`, `SearchSnippet`, `AiAction`, `UserSummary`, zod schemas   |
| `types/index.ts` (modify)            | Re-export new search types                                                                 |
| `__tests__/types/search.test.ts` (create) | Schema round-trip tests                                                                   |

### Client (`packages/client/src/`)

| File                                                     | Responsibility                                                                      |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `lib/debounce.ts` (create)                               | Tiny debounce utility (no @vueuse dep)                                              |
| `lib/apiClient.search.ts` (create) *or inline in composable* | `apiFetch('/api/search?...')` helper                                            |
| `stores/search.ts` (create)                              | Pinia store: `query`, `results`, `recentQueries[]`, `isOpen`, setters              |
| `composables/useSearch.ts` (create)                      | Debounced search, API call, store updates                                           |
| `composables/useKeyboard.ts` (create)                    | Global Cmd+K / Ctrl+K registration, cleanup on unmount                              |
| `components/search/SearchResultItem.vue` (create)        | Renders one snippet / user / aiAction row                                           |
| `components/search/SearchResultGroup.vue` (create)       | Renders a grouped section with heading                                              |
| `components/shell/TheSearchModal.vue` (create)           | Modal shell: focus trap, Esc, arrow nav, Enter select, debounced typeahead          |
| `pages/Search.vue` (create)                              | Full results page driven by `?q` / `?type` / `?tag` query                           |
| `plugins/router.ts` (modify)                             | Register `/search` route                                                            |
| `layouts/AppLayout.vue` (modify)                         | Mount `<TheSearchModal />` so it's globally available                               |
| `__tests__/lib/debounce.test.ts` (create)                | Timing-controlled unit test                                                         |
| `__tests__/stores/search.test.ts` (create)               | Store mutation tests                                                                |
| `__tests__/composables/useSearch.test.ts` (create)       | Mock fetch; assert debounce + store behaviour                                       |
| `__tests__/composables/useKeyboard.test.ts` (create)     | `dispatchEvent(new KeyboardEvent(...))` tests for meta/ctrl                        |
| `__tests__/components/search/SearchResultItem.test.ts` (create) | Rendering per variant + emitted events                                       |
| `__tests__/components/search/SearchResultGroup.test.ts` (create) | Group heading + item iteration                                              |
| `__tests__/components/shell/TheSearchModal.test.ts` (create) | Open/close, keyboard navigation, focus trap                                     |
| `__tests__/pages/Search.test.ts` (create)                | Route param handling + results rendering                                            |
| `__tests__/layouts/AppLayout.test.ts` (modify if present, else create) | Modal mount smoke test                                         |

### Bruno (`bruno/search/`)

| File                                      | Request                                                                |
| ----------------------------------------- | ---------------------------------------------------------------------- |
| `basic-query.bru`                         | `GET /api/search?q=react`                                              |
| `filter-by-type.bru`                      | `GET /api/search?q=react&type=snippet`                                 |
| `filter-by-tag.bru`                       | `GET /api/search?q=hooks&tag=javascript`                               |
| `fuzzy-search.bru`                        | `GET /api/search?q=reakt&fuzzy=true`  (trigram forced)                 |
| `empty-query.bru`                         | `GET /api/search?q=` — expects empty result shape, not 500             |
| `people-match.bru`                        | `GET /api/search?q=<seeded-user-name>` — expects a hit in `people`     |

---

## Dependency Graph

```
WU-1 (Verify trigger)
   │
   ▼
WU-2 (Shared types)
   │
   ├──► WU-3 (Query layer)
   │       │
   │       ▼
   │    WU-4 (Service + route)
   │       │
   │       ▼
   │    WU-5 (Bruno E2E)
   │
   └──► WU-6 (Debounce util + store)
           │
           ▼
        WU-7 (useSearch composable)
           │
           ▼
        WU-8 (useKeyboard composable)
           │
           ▼
        WU-9 (Result components)
           │
           ▼
        WU-10 (TheSearchModal)
           │
           ▼
        WU-11 (Search page + router + shell wiring)
```

WU-2 unblocks both server (WU-3..5) and client (WU-6..11) branches, so those can run in parallel once WU-2 lands. WU-5 requires a running server.

---

## Chunk 1: Work Units 1–5 (Server + Verification)

### Work Unit 1: Verify existing search_vector trigger end-to-end

**Why:** 5 DoD items depend on this infrastructure. Before the client is built against it, confirm the trigger actually populates `search_vector` through the full path: post insert → revision insert (refresh) → tag add (refresh).

**File scope:**
- Create: `packages/server/src/__tests__/integration/search-trigger.test.ts`
- Optional modify: none

**DoD:**
- [ ] Integration test creates a user, inserts a post, inserts a revision, adds a tag
- [ ] Asserts `SELECT search_vector FROM posts WHERE id = $1` is NOT NULL after each step
- [ ] Asserts weighted tsvector contains stemmed forms of title (weight A), content (weight B), tag (weight C) via `strip(search_vector)` + regex on the text representation
- [ ] Asserts `plainto_tsquery('forge_search', 'react')` matches via `@@` operator when title contains "React"
- [ ] Test uses the real dev DB (same config as existing integration tests if any) OR sets `SKIP_INTEGRATION=1` env to skip in unit runs — document the decision
- [ ] **Gate:** if no integration-test harness exists yet, the WU delivers a `.skip` test with a TODO and opens a follow-up issue. Do NOT fabricate DB pooling in tests.
- [ ] Coverage: integration file is `exclude`d from coverage (add to `vitest.config.ts` if needed) to avoid polluting unit coverage metrics

**Notes:**
- First check `packages/server/vitest.config.ts` and `packages/server/src/__tests__/` for existing integration test setup. If nothing exists: deliver as `describe.skip` with a note in the plan — do not invent infrastructure.
- If setup exists (test container, truncate helpers), mirror it. Do not add `pg` mocks to this test.

**TDD sequence:** Integration test IS the WU — write the `describe.skip` or running test first, ensure it exists and fails/skips deterministically before any other file is touched. Refactor as needed.

**Key assertion sample:**
```ts
// after seeding
const { rows } = await pool.query(
  "SELECT search_vector::text AS v FROM posts WHERE id = $1",
  [postId],
);
expect(rows[0].v).toMatch(/react/i);       // title word (stemmed)
expect(rows[0].v).toMatch(/hook/i);        // content word
expect(rows[0].v).toMatch(/javascript/i);  // tag word
// ranking proof: tsvector @@ plainto_tsquery must match
const match = await pool.query(
  "SELECT 1 FROM posts WHERE id = $1 AND search_vector @@ plainto_tsquery('forge_search', 'react')",
  [postId],
);
expect(match.rowCount).toBe(1);
```

---

### Work Unit 2: Shared search types + Zod schemas

**Files:**
- Create: `packages/shared/src/types/search.ts`
- Modify: `packages/shared/src/types/index.ts` — add `export type { ... } from './search.js'` block
- Create: `packages/shared/src/__tests__/types/search.test.ts` (schema round-trip)

**DoD:**
- [ ] `SearchQuerySchema` (Zod) accepts `{ q: string, type?: 'snippet'|'prompt'|'document'|'link', tag?: string (≤50 chars), fuzzy?: boolean, limit?: number (1..50, default 20) }`
- [ ] Interfaces exported: `SearchSnippet`, `AiAction`, `UserSummary`, `SearchResponse`
- [ ] `SearchResponse` exact shape: `{ snippets: SearchSnippet[]; aiActions: AiAction[]; people: UserSummary[]; query: string; totalResults: number }`
- [ ] `SearchSnippet` reuses existing `PostSummary` fields if one exists, otherwise defines the subset needed for a list row (id, title, contentType, language, excerpt, author { id, displayName, avatarUrl }, rank)
- [ ] `AiAction` shape: `{ label: string; action: string; params: Record<string, string> }`
- [ ] `UserSummary` shape: `{ id: string; displayName: string; avatarUrl: string | null; postCount: number }`
- [ ] All types re-exported from `packages/shared/src/types/index.ts`
- [ ] Unit test verifies Zod `safeParse` accepts a canonical payload and rejects a payload with `limit: 0`
- [ ] `npm run typecheck` in `packages/shared` passes
- [ ] 100% coverage on the new file

**TDD sequence (shared-types exception):** Zod schema is testable behaviour — write the `search.test.ts` round-trip + rejection cases FIRST, watch them fail (`cannot find module './search.js'`), THEN create `search.ts`. Pure interface/type aliases cannot be tested directly; they're validated via the `npm run typecheck` gate.

**Key code:**
```ts
// packages/shared/src/types/search.ts
import { z } from 'zod';
import type { ContentType } from '../constants/index.js';

export const searchQuerySchema = z.object({
  q: z.string().max(200),
  type: z.enum(['snippet', 'prompt', 'document', 'link']).optional(),
  tag: z.string().max(50).optional(),
  fuzzy: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type SearchQuery = z.infer<typeof searchQuerySchema>;

export interface SearchSnippet {
  id: string;
  title: string;
  contentType: ContentType;
  language: string | null;
  excerpt: string;           // first ~160 chars of latest revision, server-trimmed
  authorId: string;
  authorDisplayName: string;
  authorAvatarUrl: string | null;
  rank: number;              // ts_rank OR trigram similarity
  matchedBy: 'tsvector' | 'trigram';
}

export interface AiAction {
  label: string;
  action: string;
  params: Record<string, string>;
}

export interface UserSummary {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  postCount: number;
}

export interface SearchResponse {
  snippets: SearchSnippet[];
  aiActions: AiAction[];
  people: UserSummary[];
  query: string;
  totalResults: number;
}
```

**Guardrails:**
- Do NOT use `any`. Do NOT use non-null assertions (`!`) — `as Type` on `RETURNING *` results only, per project ESLint rules.
- `import type` for type-only imports.

---

### Work Unit 3: Server query layer (`db/queries/search.ts`)

**Files:**
- Create: `packages/server/src/db/queries/search.ts`
- Create: `packages/server/src/__tests__/db/queries/search.test.ts`

**DoD:**
- [ ] `searchPostsByTsvector(q, { contentType?, tag?, limit }): Promise<SearchRow[]>` uses `plainto_tsquery('forge_search', $1)` and `ts_rank(p.search_vector, query)`
- [ ] `searchPostsByTrigram(q, { contentType?, tag?, limit }): Promise<SearchRow[]>` uses `similarity(p.title, $1) > 0.3 AND p.title % $1`
- [ ] Both queries: `WHERE p.deleted_at IS NULL AND p.visibility = 'public'`
- [ ] Both queries: `LEFT JOIN users u ON u.id = p.author_id` so we can return author fields in a single row
- [ ] Optional filter: `WHEN contentType provided → AND p.content_type = $n`
- [ ] Optional filter: `WHEN tag provided → AND EXISTS (SELECT 1 FROM post_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.post_id = p.id AND t.name = $n)`
- [ ] Each query returns max `limit` rows, ordered by rank/similarity DESC
- [ ] `searchUsers(q, { limit }): Promise<UserRow[]>` uses `ILIKE` or trigram on `display_name` + returns `post_count` via `COUNT(posts.id) FILTER (WHERE posts.deleted_at IS NULL AND posts.visibility = 'public' AND posts.is_draft = false)`
- [ ] Excerpt: SELECT `LEFT(pr.content, 200) AS excerpt` from the latest revision via a `LATERAL` join on `post_revisions`
- [ ] Unit tests mock `query` from `connection.js`, assert SQL substring for each branch, assert parameter order
- [ ] Test each filter branch: no filter, `type` only, `tag` only, both
- [ ] Test the "q with single quotes" case — confirm parameterisation (no string concat)
- [ ] 100% coverage

**TDD sequence:** Write `search.test.ts` with assertions on SQL substring + parameter order for each branch (no filter, type only, tag only, both, single-quote injection, users). Mock `query` from `../connection.js`. Watch all cases fail (module missing). Implement `queries/search.ts`. Re-run until green. Refactor.

**Key SQL (tsvector primary):**
```sql
SELECT
  p.id, p.title, p.content_type, p.language,
  u.id AS author_id, u.display_name AS author_display_name, u.avatar_url AS author_avatar_url,
  LEFT(pr.content, 200) AS excerpt,
  ts_rank(p.search_vector, query) AS rank
FROM posts p
JOIN users u ON u.id = p.author_id
LEFT JOIN LATERAL (
  SELECT content FROM post_revisions WHERE post_id = p.id ORDER BY revision_number DESC LIMIT 1
) pr ON true,
plainto_tsquery('forge_search', $1) query
WHERE p.search_vector @@ query
  AND p.deleted_at IS NULL
  AND p.visibility = 'public'
  [AND p.content_type = $n]
  [AND EXISTS (SELECT 1 FROM post_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.post_id = p.id AND t.name = $n)]
ORDER BY rank DESC
LIMIT $limit;
```

**Key SQL (trigram fallback):**
```sql
SELECT
  p.id, p.title, p.content_type, p.language,
  u.id AS author_id, u.display_name AS author_display_name, u.avatar_url AS author_avatar_url,
  LEFT(pr.content, 200) AS excerpt,
  similarity(p.title, $1) AS sml
FROM posts p
JOIN users u ON u.id = p.author_id
LEFT JOIN LATERAL (
  SELECT content FROM post_revisions WHERE post_id = p.id ORDER BY revision_number DESC LIMIT 1
) pr ON true
WHERE p.title % $1
  AND similarity(p.title, $1) > 0.3
  AND p.deleted_at IS NULL
  AND p.visibility = 'public'
  [AND p.content_type = $n]
  [AND EXISTS (...)]
ORDER BY sml DESC
LIMIT $limit;
```

**Key SQL (users):**
```sql
SELECT
  u.id, u.display_name, u.avatar_url,
  COALESCE(COUNT(p.id) FILTER (
    WHERE p.deleted_at IS NULL AND p.visibility = 'public' AND p.is_draft = false
  ), 0) AS post_count
FROM users u
LEFT JOIN posts p ON p.author_id = u.id
WHERE u.display_name % $1 OR u.display_name ILIKE '%' || $1 || '%'
GROUP BY u.id
ORDER BY similarity(u.display_name, $1) DESC
LIMIT $2;
```

**Guardrails:**
- Never interpolate user input into SQL — always parameters.
- Build parameter list in one place; append filters in a deterministic order so tests are stable.
- Tag filter uses `EXISTS` (not `JOIN`) to avoid duplicate post rows.

---

### Work Unit 4: Service + route (`services/search.ts`, `routes/search.ts`)

**Files:**
- Create: `packages/server/src/services/search.ts`
- Create: `packages/server/src/routes/search.ts`
- Modify: `packages/server/src/app.ts` — register `searchRoutes` with `{ prefix: '/api' }`
- Create: `packages/server/src/__tests__/services/search.test.ts`
- Create: `packages/server/src/__tests__/routes/search.test.ts`

**DoD:**
- [ ] `services/search.ts` exports `toSearchSnippet(row)`, `toUserSummary(row)`, `buildAiActions(q)` — all pure
- [ ] `buildAiActions(q)` returns two stub actions so Phase 3 can wire real AI later: `[{ label: 'Generate a ${q} tutorial', action: 'generate', params: { topic: q } }, { label: 'Explain ${q}', action: 'explain', params: { topic: q } }]`. Empty array if `q.length < 2`.
- [ ] `routes/search.ts` registers `app.get('/search', ...)` with **no auth guard** (public endpoint — matches issue spec of app-wide reach)
- [ ] Query string validated via `searchQuerySchema` (from shared). On failure → `400` with `{ error }`
- [ ] Empty `q` (trimmed length 0) → return `{ snippets: [], aiActions: [], people: [], query: '', totalResults: 0 }` with 200 (NOT 400 — modal sends empty queries as user types)
- [ ] Non-empty `q`:
  1. Run `searchPostsByTsvector(q, filters)` OR, if `fuzzy === true`, skip to trigram
  2. If tsvector returned `< 5` rows, also run `searchPostsByTrigram`, merge, dedupe by `id`
  3. Run `searchUsers(q, { limit: 5 })`
  4. Build `aiActions` via `buildAiActions(q)`
  5. Compose `SearchResponse` — `totalResults = snippets.length + people.length + aiActions.length`
- [ ] Service test covers all transforms + the empty-q aiActions edge
- [ ] Route test covers:
  - empty q → empty response
  - non-empty q, tsvector returns ≥ 5 → no trigram call
  - non-empty q, tsvector returns < 5 → trigram call, merged + deduped
  - `fuzzy=true` → tsvector skipped, trigram called
  - `type=snippet` + `tag=javascript` passed through to query layer
  - bad `type` → 400
  - query DB throws → 500 with sanitized error
- [ ] `app.ts` registration added and `buildApp` test (if any) still passes
- [ ] 100% coverage on both files

**TDD sequence:** Write `services/search.test.ts` (pure transforms, aiAction stubs, empty-q edge) and `routes/search.test.ts` (app.inject paths: empty q, tsvector≥5, tsvector<5→trigram merge+dedupe, fuzzy=true, filters pass-through, 400 on bad type, 500 on DB throw) FIRST. Watch fail (module missing). Implement service + route. Register in `app.ts`. Re-run tests until green. Refactor.

**Route skeleton:**
```ts
// packages/server/src/routes/search.ts
import type { FastifyInstance } from 'fastify';
import { searchQuerySchema } from '@forge/shared';
import {
  searchPostsByTsvector,
  searchPostsByTrigram,
  searchUsers,
} from '../db/queries/search.js';
import { toSearchSnippet, toUserSummary, buildAiActions } from '../services/search.js';

const TRIGRAM_FALLBACK_THRESHOLD = 5;

export async function searchRoutes(app: FastifyInstance): Promise<void> {
  app.get('/search', async (request, reply) => {
    const parsed = searchQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        error: parsed.error.errors.map((e) => e.message).join(', '),
      });
    }
    const { q, type, tag, fuzzy, limit } = parsed.data;
    const trimmed = q.trim();
    if (trimmed.length === 0) {
      return reply.send({
        snippets: [],
        aiActions: [],
        people: [],
        query: '',
        totalResults: 0,
      });
    }

    const filters = { contentType: type, tag, limit };

    let snippetRows = fuzzy
      ? []
      : await searchPostsByTsvector(trimmed, filters);

    if (fuzzy || snippetRows.length < TRIGRAM_FALLBACK_THRESHOLD) {
      const trigramRows = await searchPostsByTrigram(trimmed, filters);
      const seen = new Set(snippetRows.map((r) => r.id));
      for (const row of trigramRows) {
        if (!seen.has(row.id)) snippetRows.push(row);
      }
    }

    const [userRows, aiActions] = await Promise.all([
      searchUsers(trimmed, { limit: 5 }),
      Promise.resolve(buildAiActions(trimmed)),
    ]);

    const snippets = snippetRows.slice(0, limit).map(toSearchSnippet);
    const people = userRows.map(toUserSummary);

    return reply.send({
      snippets,
      aiActions,
      people,
      query: trimmed,
      totalResults: snippets.length + people.length + aiActions.length,
    });
  });
}
```

**Guardrails:**
- Use `import type` for Fastify types.
- Never log raw query strings at `info` level — user-provided input. `debug` only if needed.
- Route is unauthenticated but still must run through the rate-limit plugin (already globally registered).

---

### Work Unit 5: Bruno API tests for `/api/search`

**Files:**
- Create: `bruno/search/basic-query.bru`
- Create: `bruno/search/filter-by-type.bru`
- Create: `bruno/search/filter-by-tag.bru`
- Create: `bruno/search/fuzzy-search.bru`
- Create: `bruno/search/empty-query.bru`
- Create: `bruno/search/people-match.bru`

**DoD:**
- [ ] One `.bru` per listed file, each mirroring the `meta / get / ... / assert` structure used in `bruno/posts/*.bru`
- [ ] `basic-query.bru` asserts `res.status === 200` and `res.body.snippets` is an array
- [ ] `empty-query.bru` asserts `res.status === 200` and `res.body.totalResults === 0`
- [ ] Scripts (`script:post-response`) capture `bru.setVar("firstSnippetId", res.body.snippets[0]?.id)` where appropriate, so follow-up requests can reference them (mirrors existing pattern)
- [ ] All `.bru` files reference `{{baseUrl}}` and do not hardcode localhost URLs
- [ ] **Gate:** run `cd bruno && npx @usebruno/cli run search --env local` against a running server (`set -a && source .env && set +a && cd packages/server && npx tsx src/server.ts`); every request must return 2xx
- [ ] This gate blocks WU completion — no handwave

**TDD sequence (Bruno exception):** Bruno requests ARE the tests. Write all `.bru` files with `assert` blocks first (they will fail if endpoint does not respond correctly). Start the server, run `npx @usebruno/cli run bruno/search --env local`. Every assertion must pass before the WU commits. If any asserts fail, fix the server — not the assertion.

**Bruno file template (copy pattern from `bruno/posts/create-post.bru`):**
```
meta {
  name: Basic search query
  type: http
  seq: 1
}

get {
  url: {{baseUrl}}/api/search?q=react
  body: none
  auth: none
}

script:post-response {
  bru.setVar("firstSnippetId", res.body.snippets?.[0]?.id);
}

assert {
  res.status: eq 200
  res.body.snippets: isArray
}
```

---

## Chunk 2: Work Units 6–11 (Client)

### Work Unit 6: Debounce utility + Pinia search store

**Files:**
- Create: `packages/client/src/lib/debounce.ts`
- Create: `packages/client/src/stores/search.ts`
- Create: `packages/client/src/__tests__/lib/debounce.test.ts`
- Create: `packages/client/src/__tests__/stores/search.test.ts`

**DoD:**
- [ ] `debounce<T extends (...args: never[]) => void>(fn: T, wait: number): T & { cancel(): void }` — uses `setTimeout`, `clearTimeout`, no dependencies
- [ ] Debounce unit tests use `vi.useFakeTimers()` to verify:
  - Multiple calls within window → single invocation
  - Call beyond window → new invocation
  - `cancel()` prevents pending invocation
- [ ] Pinia store `useSearchStore()` exposes (refs): `query`, `results` (`SearchResponse | null`), `isLoading`, `isOpen`, `recentQueries` (`string[]`, capped at 10), `activeIndex` (number, for keyboard nav)
- [ ] Mutations: `setQuery(q)`, `setResults(r)`, `setLoading(v)`, `open()`, `close()`, `pushRecent(q)`, `clearResults()`, `setActiveIndex(i)`
- [ ] `pushRecent(q)` dedupes case-insensitively, moves existing to front, caps at 10
- [ ] `recentQueries` persisted to `localStorage` key `forge:search:recent` on `pushRecent` (best-effort, wrap in try/catch — `localStorage` missing in SSR/test cases must not throw)
- [ ] Store test covers each mutation + localStorage failure path (mock `localStorage.setItem` to throw)
- [ ] 100% coverage

**TDD sequence:** Write `debounce.test.ts` (fake timers; multi-call collapsing; beyond-window re-firing; cancel()) + `stores/search.test.ts` (each mutation + localStorage throw path) FIRST. Watch fail. Implement `debounce.ts` + `stores/search.ts`. Re-run green. Refactor.

**Debounce impl:**
```ts
export function debounce<T extends (...args: never[]) => void>(
  fn: T,
  wait: number,
): T & { cancel(): void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const wrapped = ((...args: Parameters<T>) => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, wait);
  }) as T & { cancel(): void };
  wrapped.cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  return wrapped;
}
```

---

### Work Unit 7: `useSearch` composable

**Files:**
- Create: `packages/client/src/composables/useSearch.ts`
- Create: `packages/client/src/__tests__/composables/useSearch.test.ts`

**DoD:**
- [ ] Exports `useSearch()` — returns `{ query, results, isLoading, search, clearResults }`
- [ ] `search(q: string)` is a debounced function (300ms) that:
  1. trims `q`; if empty → `clearResults()` and return
  2. `setLoading(true)`
  3. `fetch('/api/search?q=...&type=...&tag=...&fuzzy=...')` via existing `apiFetch` helper
  4. On 2xx → `setResults(body)`, `pushRecent(q)`
  5. On non-2xx or network error → `setResults(null)`, log warn, do not throw
  6. `setLoading(false)` in `finally`
- [ ] `clearResults()` clears results and query, cancels pending debounced calls
- [ ] Composable returns unwrapped refs via `storeToRefs(useSearchStore())`
- [ ] Tests mock `apiFetch` with `vi.fn()`:
  - empty query → fetch NOT called, results cleared
  - non-empty query after 300ms → fetch called exactly once
  - rapid queries within window → fetch called once with latest query
  - fetch rejects → results become null, composable swallows error
  - fetch returns 500 → results become null
- [ ] 100% coverage

**TDD sequence:** Write `useSearch.test.ts` — mock `apiFetch` with `vi.fn()`; each of the 5 test cases above authored with expected assertions FIRST. Watch fail. Implement `composables/useSearch.ts`. Re-run green. Refactor.

---

### Work Unit 8: `useKeyboard` composable

**Files:**
- Create: `packages/client/src/composables/useKeyboard.ts`
- Create: `packages/client/src/__tests__/composables/useKeyboard.test.ts`

**DoD:**
- [ ] `useKeyboard()` returns `{ register(shortcut: string, handler: () => void): () => void }`
- [ ] Shortcut string format: `'mod+k'` where `mod` maps to `metaKey` on macOS, `ctrlKey` otherwise
- [ ] Platform detection via `navigator.platform.includes('Mac')` — gate behind `typeof navigator !== 'undefined'` to survive SSR/test env
- [ ] Attaches `keydown` listener to `window` once on first `register`, dispatches to matching registered handlers
- [ ] `preventDefault()` on match (so browser `Cmd+K` address bar doesn't trigger)
- [ ] Supports additional shortcuts: `'escape'`, `'arrowup'`, `'arrowdown'`, `'enter'` (used by modal) — keep the shape extensible
- [ ] Returned `unregister` cleans up when the last handler for a shortcut is removed
- [ ] `onScopeDispose` or `onUnmounted` hook auto-unregisters handlers tied to a component scope
- [ ] Tests dispatch synthetic `KeyboardEvent`:
  - `new KeyboardEvent('keydown', { key: 'k', metaKey: true })` on Mac → handler fires, defaultPrevented true
  - `new KeyboardEvent('keydown', { key: 'k', ctrlKey: true })` on non-Mac → fires
  - other keys → does not fire
  - after `unregister()` → does not fire
- [ ] Mock `navigator.platform` via `vi.stubGlobal` between cases
- [ ] 100% coverage

**TDD sequence:** Write `useKeyboard.test.ts` with synthetic `KeyboardEvent` dispatches (mac meta+k, non-mac ctrl+k, other keys, unregister) FIRST. Watch fail. Implement `composables/useKeyboard.ts`. Re-run green. Refactor.

---

### Work Unit 9: `SearchResultItem` + `SearchResultGroup` components

**Files:**
- Create: `packages/client/src/components/search/SearchResultItem.vue`
- Create: `packages/client/src/components/search/SearchResultGroup.vue`
- Create: `packages/client/src/__tests__/components/search/SearchResultItem.test.ts`
- Create: `packages/client/src/__tests__/components/search/SearchResultGroup.test.ts`

**DoD (SearchResultItem):**
- [ ] Props: `{ variant: 'snippet' | 'person' | 'aiAction'; data: SearchSnippet | UserSummary | AiAction; active: boolean }` — discriminated union via `variant` prop
- [ ] Emits: `{ select: [] }` — fires on click or Enter (Enter handled by modal, click here). The parent decides navigation; the item only emits intent.
- [ ] Renders per variant:
  - `snippet` → title (highlighted on hover/active), excerpt (truncated, 1 line), author display name, language badge, content-type icon
  - `person` → avatar (fallback to initials), display name, `${postCount} posts`
  - `aiAction` → sparkle icon, label
- [ ] `active` prop drives a `bg-primary-50 dark:bg-primary-900/40` class (matches existing Tailwind patterns)
- [ ] `role="option"` and `aria-selected="{{ active }}"` — a11y
- [ ] Tests cover each variant renders the right text + icon, click emits `select`, active class toggles
- [ ] 100% coverage

**DoD (SearchResultGroup):**
- [ ] Props: `{ title: string; items: unknown[]; variant: 'snippet' | 'person' | 'aiAction'; activeGlobalIndex: number; startIndex: number }`
- [ ] Hides itself when `items.length === 0`
- [ ] Renders section heading + v-for over items; computes per-item `active` as `activeGlobalIndex === startIndex + i`
- [ ] Bubbles `select` events up with the clicked item's index payload
- [ ] Tests cover empty-state hidden, items rendered, active computation, bubbling
- [ ] 100% coverage

**TDD sequence:** Write both component test files FIRST using `@vue/test-utils` `mount()` — assert per-variant rendering, click→select emission, active class, empty-group hiding. Watch fail (SFC missing). Scaffold components. Re-run green. Refactor.

---

### Work Unit 10: `TheSearchModal.vue`

**Files:**
- Create: `packages/client/src/components/shell/TheSearchModal.vue`
- Create: `packages/client/src/__tests__/components/shell/TheSearchModal.test.ts`

**DoD:**
- [ ] Modal is rendered via a fixed-position backdrop div with `role="dialog"` and `aria-modal="true"`
- [ ] Visibility bound to `searchStore.isOpen`
- [ ] Autofocuses the search input on open via `nextTick()` + `ref`
- [ ] Input is `v-model`-bound to local `inputValue`, which calls `search(inputValue)` on change (debounced by `useSearch`)
- [ ] Keyboard behaviour (via `useKeyboard` OR direct `@keydown` on the dialog — prefer the latter since it scopes to modal):
  - `Esc` → `close()` + unregister global Cmd+K handler stays registered (just closes modal)
  - `ArrowDown` / `ArrowUp` → increments/decrements `activeIndex`, wraps around total results (snippets + aiActions + people)
  - `Enter` → triggers `select` on the currently-active item
- [ ] Focus trap: `Tab` cycles between the input and the close button; shift+Tab reverses. Implement by listening for `keydown.tab` and restricting `document.activeElement` to modal descendants.
- [ ] On close: input cleared, results cleared, `activeIndex = 0`, focus returned to the element that was focused before open (store `previouslyFocused` ref)
- [ ] Clicking the backdrop closes the modal; clicks inside the dialog do not bubble
- [ ] "See all results" footer link → navigates to `/search?q=...` and closes the modal
- [ ] **Per-variant select handling (decided here, not in child component):**
  - **Snippet** → `router.push({ name: 'post-detail', params: { id: snippet.id } })` (or existing route path — check `plugins/router.ts` for the actual post detail route name; fall back to `router.push('/posts/' + snippet.id)`). Then `close()` the modal.
  - **Person** → no navigation target exists (no user profile page in codebase). Behaviour: `close()` the modal and `router.push({ path: '/search', query: { q: person.displayName, type: undefined } })` so the full results page shows the person's match context. If a dedicated `Profile.vue` is added later, update this handler.
  - **AI Action** → stubbed. Behaviour: `close()` the modal and log `console.info('[search] aiAction selected', aiAction)` — no navigation. Phase 3 will replace this with real dispatch; the stub keeps the click wired up so it doesn't feel dead.
  - All three paths MUST also call `searchStore.pushRecent(inputValue)` so the query lands in recent history.
  - Test each branch: snippet click emits push-with-id; person click pushes to `/search`; aiAction click logs + closes without push.
- [ ] Groups rendered in order: Snippets → AI Actions → People, each via `SearchResultGroup`
- [ ] Empty state (no query): show "Recent searches" list from `searchStore.recentQueries`; clicking a recent query populates input
- [ ] Loading state: skeleton/spinner in the results area
- [ ] Tests cover:
  - opens when store.isOpen becomes true; autofocus fires
  - Esc closes; backdrop click closes; dialog click does not close
  - arrow up/down updates activeIndex, wraps at boundaries
  - Enter on an aiAction fires select (we can stub the handler)
  - "See all results" calls `router.push({ path: '/search', query: { q: 'react' } })`
  - recent-query click populates input and fires search
- [ ] 100% coverage, including focus-trap edges

**TDD sequence:** Write `TheSearchModal.test.ts` FIRST covering: open auto-focus, Esc close, backdrop click close, dialog click no-close, arrow nav wrap, Enter selects active, "See all results" router.push, recent-query click, Tab/Shift+Tab focus trap. Watch fail (component missing). Scaffold modal template + setup logic incrementally until every test is green. Refactor.

**Focus trap sketch:**
```ts
function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Tab') return;
  const focusables = dialogRef.value?.querySelectorAll<HTMLElement>(
    'input, button, a[href]'
  );
  if (!focusables || focusables.length === 0) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}
```

---

### Work Unit 11: Search page + router + shell wiring

**Files:**
- Create: `packages/client/src/pages/Search.vue`
- Modify: `packages/client/src/plugins/router.ts` — add `{ path: 'search', component: () => import('@/pages/Search.vue'), meta: { requiresAuth: false } }` under AppLayout (or auth layout if public pages live elsewhere — verify at implementation time)
- Modify: `packages/client/src/layouts/AppLayout.vue` — mount `<TheSearchModal />` once
- Modify: `packages/client/src/components/shell/TheTopBar.vue` — add a search button that calls `searchStore.open()` and register the Cmd+K shortcut via `useKeyboard`
- Modify (or create if absent): `packages/client/src/__tests__/components/shell/TheTopBar.test.ts` — add tests for the new search button (click calls `searchStore.open`) and the Cmd+K registration (synthetic KeyboardEvent triggers `open`)
- Create: `packages/client/src/__tests__/pages/Search.test.ts`

**DoD:**
- [ ] `Search.vue` reads `q`, `type`, `tag` from `route.query`, calls `useSearch().search(q)` on mount and on route change
- [ ] Renders header ("Results for X"), filter chips for `type` + `tag`, full `SearchResultGroup` sections (snippets, aiActions, people)
- [ ] Empty state when no `q` → copy "Start typing to search" + CTA to open modal
- [ ] Loading state shows skeleton
- [ ] 404-ish state when results empty: "No results for X" + suggestion to try fuzzy
- [ ] Fuzzy toggle: a link that updates `?fuzzy=true` and re-searches
- [ ] Router registers `/search` publicly (no auth required — matches issue intent)
- [ ] AppLayout mounts `<TheSearchModal />` at layout root (so it's global)
- [ ] TheTopBar adds a search button (visible on md+), and registers Cmd+K globally so the modal opens from any route
- [ ] Tests cover:
  - route-query-driven search fires on mount
  - route-query change triggers re-search
  - filter chips remove when X clicked (updates query)
  - empty state / loading / no-results branches
- [ ] TheTopBar test coverage: new/updated tests assert (a) clicking the search button calls `searchStore.open()` and (b) dispatching a synthetic `Cmd+K` (mac) / `Ctrl+K` (other) `KeyboardEvent` calls `searchStore.open()` exactly once, and that the handler is removed on unmount. Existing TheTopBar tests still pass.
- [ ] 100% coverage (including the modified TheTopBar.vue)
- [ ] Manual smoke: `npm run dev`, press Cmd+K from `/feed`, type "react", press Enter on first snippet → navigates to post
- [ ] Dev console is clean (no a11y warnings, no unhandled promise rejections)

**TDD sequence:** Write `Search.test.ts` FIRST covering route-query-driven search, re-search on query change, filter-chip removal, empty/loading/no-results states. Watch fail (page missing). Scaffold `Search.vue`, then wire router + AppLayout mount + TheTopBar button. Re-run tests green. Manual smoke last (not auto-testable).

---

## Cross-Cutting Quality Gates (must all pass before PR)

- [ ] `npm test` green across all packages
- [ ] `npm run test:coverage` meets every threshold in `.coverage-thresholds.json` (100 / 100 / 100 / 100)
- [ ] `npm run typecheck` green in client, server, shared
- [ ] `npm run lint` (if configured) green with zero warnings
- [ ] `bruno/search/` suite passes against a running server
- [ ] Full Bruno collection (`npx @usebruno/cli run -r --env local`) still passes — confirm no regressions to existing suites
- [ ] All 11 issue DoD items mapped — see the table below
- [ ] `/self-reflect` run before PR; knowledge-base diff committed on the same branch

### DoD Mapping to Work Units

| Issue DoD item                                                                 | Covered by               |
| ------------------------------------------------------------------------------ | ------------------------ |
| pg_trgm / unaccent extensions                                                  | Pre-existing; WU-1 verifies |
| `forge_search` configuration                                                   | Pre-existing; WU-1 verifies |
| `search_vector` column + trigger                                               | Pre-existing; WU-1 verifies |
| Weighted A/B/C                                                                 | Pre-existing; WU-1 verifies |
| GIN indexes                                                                    | Pre-existing; WU-1 verifies |
| `GET /api/search` with params                                                  | WU-4                     |
| tsvector primary, trigram fallback < 5                                         | WU-4                     |
| Typo tolerance via pg_trgm                                                     | WU-3 + WU-4              |
| Cmd+K / Ctrl+K opens modal                                                     | WU-8 + WU-10 + WU-11     |
| Focus trap, Esc, arrow nav                                                     | WU-10                    |
| Snippets / AI Actions / People groups                                          | WU-9 + WU-10             |
| Debounced 300ms typeahead                                                      | WU-6 + WU-7              |
| `/search` deep-link page                                                       | WU-11                    |
| `useKeyboard` composable                                                       | WU-8                     |
| `useSearch` composable                                                         | WU-7                     |
| `search` store                                                                 | WU-6                     |
| Tests cover query construction, tsvector/trigram, API, shortcut, modal         | WU-3..11                 |

---

## Risk Register

| Risk                                                                                        | Mitigation                                                                                   |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| No integration-test harness → WU-1 delivers a skipped test                                   | Explicitly plan for skipped + follow-up issue; do NOT block PR on it                         |
| `search_vector` is NULL for older posts (pre-trigger rows) — unlikely since migration 001 is initial, but check | During WU-1 verification, if any posts have NULL `search_vector`, add a one-off backfill step |
| `pg_trgm`-based user search performance on scale                                             | Already have GIN on title; add `idx_users_display_name_trgm` only if WU-1 benchmark shows >200ms on 10k rows (not part of this plan — out of scope) |
| First modal in codebase → bespoke focus trap can be buggy                                    | Keep focus-trap logic minimal (input + close button + footer link); heavy test coverage on Tab/Shift+Tab cycles |
| `@vueuse/core` not installed → hand-rolled debounce/keyboard                                 | Hand-rolled is ≤40 lines each, fully tested; no runtime dep cost                             |
| Cmd+K collides with browser address-bar shortcut                                             | `preventDefault()` in the handler (tested)                                                   |
| Search endpoint is unauthenticated → scraping / rate abuse                                   | Rate-limit plugin is already global; acceptable for public search UX                         |
| Route regression on existing Bruno suites                                                    | WU-5 gate includes full collection run                                                       |

---

## Out of Scope (explicitly NOT in this plan)

- Regex search (deferred to future enhancement, per issue text)
- Real AI Actions (Phase 3; `buildAiActions` returns static stubs)
- Search analytics / click tracking
- Saved searches
- Advanced filters beyond `type` + `tag` (e.g. date ranges, language)
- Search within comments / files — only titles, latest revision content, tags, and user display names are searched
- Infinite-scroll pagination on `/search` — first page only (limit 20), "Load more" can be a follow-up
- Highlighting matched terms in the excerpt — deferred to a polish issue

---

## Execution Notes for the Orchestrator

- Create a worktree (`superpowers:using-git-worktrees`) on a branch such as `feat/search-postgres-fts-cmdk`; do not work on `main`.
- Each WU ends in a single commit with a conventional-commit message (e.g. `feat(search): add server query layer (WU-3)`). Do NOT `--no-verify`.
- Between WUs, the orchestrator runs Phase 2 (VALIDATE) and Phase 3 (ADVERSARIAL REVIEW) per the metaswarm 4-phase loop.
- After WU-11, run `/self-reflect` and commit any knowledge-base updates BEFORE opening the PR.
- Server must be running for WU-5 gate (`set -a && source .env && set +a && cd packages/server && npx tsx src/server.ts` in a background terminal).
- PR title: `feat: search (PostgreSQL full-text + Cmd+K modal) (#3)` — link the issue in the body.
