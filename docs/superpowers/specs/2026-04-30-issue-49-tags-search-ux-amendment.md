# Issue #49 — Tags + Search UX Amendment (E2E rollout 4/9, scope expansion)

**Date:** 2026-04-30
**Parent design:** [`2026-04-28-e2e-playwright-testing-design.md`](./2026-04-28-e2e-playwright-testing-design.md)
**Tracking issue:** [#43 — E2E Playwright rollout](https://github.com/multiandrewlab/forge/issues/43)
**Issue under amendment:** [#49 — E2E rollout 4/9: tags + search + flip-to-blocking](https://github.com/multiandrewlab/forge/issues/49)
**Branch:** `feat/e2e-tags-search`
**Status:** Drafted; pending Design Review Gate (5 agents)

---

## Why this amendment exists

Issue #49 was filed on the assumption that the underlying tag and search UX **already existed** in the application, and that the PR's job was to add `data-testid` attributes plus write Playwright specs. A pre-implementation feature audit on 2026-04-30 found that the majority of the DoD line items in #49 reference UI features that **do not exist** in the codebase. Specifically:

| DoD line item              | Implementation status before audit                                                                          |
| -------------------------- | ----------------------------------------------------------------------------------------------------------- |
| popular-tags render        | API exists (`GET /api/tags/popular`); **no UI consumer**                                                    |
| subscribe / unsubscribe    | API exists (`POST/DELETE /api/tags/:id/subscribe`); **no UI button anywhere**                               |
| subscribed-tag-feed filter | `FeedFilter` type is `'mine' \| 'bookmarked'` — **no `'subscribed'` value**                                 |
| tag page                   | **No route** — `/tags/:name` does not exist                                                                 |
| my-subscriptions list      | Sidebar shows `subscribedTags` ref but testuser seed has 0 subs and there is no in-app subscribe affordance |
| click-tag-from-post        | `<span>` chip with no `@click` and no `RouterLink`                                                          |
| structured filter — author | Server search route does not accept `author` param                                                          |
| structured filter — date   | Server search route does not accept `date`/`since` param                                                    |
| pagination                 | Server has `limit` only — no `page` / `offset` / cursor                                                     |

Issue #49's original `Out of scope` clause read **"server changes; other feature folders"**, which made it impossible to land a passing test suite for the listed DoD items without first shipping the missing UX in a separate PR.

The maintainer chose to **expand the scope of #49 itself** (rather than file a prep sub-issue) so that the missing UX, server contract additions, Bruno coverage, and the Playwright specs all land in a single cohesive PR. This document is the design that justifies that expansion and pins down each open UX decision before any implementation work begins.

---

## Decisions

Each row links a Q&A in brainstorming back to a single committed choice. Two-sentence rationale per row; details live in the relevant sub-section below.

| #   | Decision                           | Choice                                                                                                                    | Rationale (compressed)                                                                                                              |
| --- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Popular-tags widget placement      | New section in `TheSidebar.vue` below the existing Following list                                                         | Lowest-cost surface; fits sidebar's tag-navigation role; no new route.                                                              |
| 2   | Subscribe / unsubscribe affordance | Shared `<TagSubscribeButton>` mounted in **both** the sidebar's popular-tags list **and** the new `TagPage`               | Comprehensive without UI duplication; one component, one selector, two contexts.                                                    |
| 3   | TagPage URL                        | `/tags/:name`                                                                                                             | Mirrors existing `/posts/:id`, `/user/:id`, `/playground/:id` route conventions; composes with existing `?tag=<name>` server query. |
| 4   | TagPage content                    | Title + `<TagSubscribeButton>` + reused `<PostList>` (feed of posts tagged with this tag)                                 | Minimal viable surface — DoD says "tag page", not "tag analytics dashboard".                                                        |
| 5   | "My subscriptions" list            | The existing `TheSidebar.vue` Following list (no new page)                                                                | The list already exists in the DOM; the bug today is that there's no UI affordance to populate it — Q2 fixes that.                  |
| 6   | Subscribed-tag-feed filter         | Extend `FeedFilter` to add `'subscribed'`; new sibling route `/following` rendering `HomePage` with `filter='subscribed'` | Mirrors existing `/my-snippets` and `/bookmarks` route shape exactly.                                                               |
| 7   | Click-tag-from-post                | Tag chip becomes a `<RouterLink>` to `/tags/:name`                                                                        | Closes the discover→subscribe loop. SearchPage tag-filter is reachable separately via `?tag=`.                                      |
| 8   | Author filter                      | Click an author name on a search result → adds `filter-chip-author`; URL `?author=<displayName>`                          | Same UX paradigm as existing `filter-chip-tag` and `filter-chip-type`.                                                              |
| 9   | Date filter                        | Preset chips: Today / 7d / 30d / All time; URL `?since=<today\|7d\|30d>` (omitted = All)                                  | Covers 95% of intent without pulling in a date-picker dependency.                                                                   |
| 10  | Pagination                         | Numbered pagination, `[Prev] page X of Y [Next]`; URL `?page=<n>`; response includes `page`, `totalPages`                 | URL persistence is test-friendly; spec asserts URL transitions plus rendered page indicator.                                        |

---

## Architecture changes

### Type changes — `@forge/shared`

```ts
// types/feed.ts
export type FeedFilter = 'mine' | 'bookmarked' | 'subscribed'; // ← added 'subscribed'

// types/search.ts (or wherever SearchResponse lives)
export interface SearchResponse {
  query: string;
  snippets: PostWithAuthor[];
  aiActions: AiAction[];
  people: UserSummary[];
  totalResults: number;
  page: number; // ← new
  totalPages: number; // ← new
}

export interface SearchRequestQuery {
  q: string;
  type?: ContentType;
  tag?: string;
  fuzzy?: boolean;
  ai?: boolean;
  limit?: number;
  author?: string; // ← new (display name, case-insensitive exact match)
  since?: 'today' | '7d' | '30d'; // ← new (omit ⇒ no date filter)
  page?: number; // ← new (default 1, must be ≥ 1)
}
```

### Server route changes — Fastify

#### `GET /api/feed`

- New param: `filter=subscribed` — joins `user_tag_subscriptions × post_tags × posts` to return posts whose tag the requesting user follows.
- New param: `tag=<name>` — filters to posts tagged with the named tag (used by `TagPage` post list).
- Both params validated through the existing zod input schema for `/api/feed`.
- Bruno: 2 new `.bru` files (`bruno/feed/list-subscribed.bru`, `bruno/feed/list-by-tag.bru`).

#### `GET /api/search`

- New params: `author`, `since`, `page`. All optional. Validated by the existing zod schema (extended).
- Author resolution: `LOWER(u.display_name) = LOWER($author)` — exact match, case-insensitive. No fuzzy author lookup in this PR (YAGNI).
- Since resolution: `'today'` ⇒ `created_at >= NOW() - interval '1 day'`; `'7d'` ⇒ 7 days; `'30d'` ⇒ 30 days. Omitted ⇒ no `created_at` predicate.
- Pagination: `LIMIT 20 OFFSET (page - 1) * 20` on the snippets query. `totalPages = CEIL(total_count / 20.0)`. The server runs one extra `COUNT(*)` against the same filter set to compute `totalPages`.
- Bruno: 3 new `.bru` files (`bruno/search/by-author.bru`, `bruno/search/by-since.bru`, `bruno/search/pagination.bru`).

#### `GET /api/tags/:name` (new)

- Resolves a tag name to `{ id, name, postCount, subscriberCount }` so `TagPage` can render its header without an N+1.
- 404 if the name doesn't match any row.
- Auth: optional (TagPage is publicly viewable; subscribe button is hidden when not authenticated).
- Bruno: 1 new `.bru` (`bruno/tags/get-by-name.bru`).

### Client route additions — `packages/client/src/plugins/router.ts`

```ts
// Inside the AppLayout children array:
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
},
```

### New / modified Vue components

| File                                                         | Change                                                                                                                                 | LOC estimate |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| `packages/client/src/pages/TagPage.vue`                      | NEW — title, `<TagSubscribeButton>`, `<PostList>` of `/api/feed?tag=<name>`                                                            | ~80          |
| `packages/client/src/components/tags/TagSubscribeButton.vue` | NEW — emits subscribe/unsubscribe via `useTags`; reads from `subscribedTags` to compute current state                                  | ~50          |
| `packages/client/src/components/shell/TheSidebar.vue`        | Add `popular-tags-list` section beneath Following; inline `<TagSubscribeButton>` per row                                               | ~40 added    |
| `packages/client/src/components/post/PostMetaHeader.vue`     | Tag chip span → `<RouterLink :to="{ name: 'tag-view', params: { name: tag } }">`                                                       | ~10 changed  |
| `packages/client/src/pages/SearchPage.vue`                   | Add `filter-chip-author`, `filter-chip-since`, `<SearchPagination>`; date-preset chip row above results                                | ~80 added    |
| `packages/client/src/components/search/SearchResultItem.vue` | Author display name becomes a clickable element that, on click, emits `addAuthorFilter` (handled by SearchPage to add chip + push URL) | ~10 added    |
| `packages/client/src/components/search/SearchPagination.vue` | NEW — `[Prev] page X of Y [Next]` with three testids                                                                                   | ~50          |
| `packages/client/src/stores/search.ts`                       | Track `page`, `totalPages`, `author`, `since` in store state; round-trip with route query                                              | ~30 added    |
| `packages/client/src/composables/useSearch.ts`               | Build URL with all new params; pass `page` through                                                                                     | ~10 added    |
| `packages/client/src/composables/useTags.ts`                 | Already complete; no changes                                                                                                           |
| `packages/client/src/stores/feed.ts`                         | Accept `'subscribed'` filter value; pass `subscribed` to the feed API call                                                             | ~5 changed   |

### Selector shards

| File                               | Status | Selectors (new)                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `e2e/fixtures/selectors/tags.ts`   | NEW    | `popularTagsList`, `popularTagRow(name)`, `subscribeBtn(scope)`, `unsubscribeBtn(scope)`, `tagPage`, `tagPageTitle`, `tagPagePostList`, `subscribedTagLink(name)`, `followingNavLink`                                                                                                                                                                                    |
| `e2e/fixtures/selectors/search.ts` | EXTEND | already has `searchInput`, `searchResultItem` — add `aiToggle`, `searchPageLoading`, `tryFuzzyLink`, `filterChipType`, `removeFilterType`, `filterChipTag`, `removeFilterTag`, `filterChipAuthor`, `removeFilterAuthor`, `filterChipSince`, `removeFilterSince`, `searchPagination`, `prevPageBtn`, `nextPageBtn`, `recentSearches`, `recentQuery`, `searchResultAuthor` |
| `e2e/fixtures/selectors/shell.ts`  | EXTEND | add `searchTrigger`, `popularTags*` cross-cutting bits if needed                                                                                                                                                                                                                                                                                                         |

---

## E2E spec inventory

### `e2e/specs/tags/` — target ~9 specs (DoD ±15% band: 8–10)

1. `popular-tags-render.spec.ts` — `/`, sidebar shows `popular-tags-list` with ≥1 row.
2. `subscribe-from-sidebar.spec.ts` — log in as testuser (0 subs in seed); click subscribe-btn on a popular-tags row; assert that tag now appears in Following list.
3. `unsubscribe-from-sidebar.spec.ts` — pre-state: testuser with 1 sub (set up via UI in beforeEach OR via API call); click unsubscribe; assert removal.
4. `subscribed-tag-feed.spec.ts` — `/following` shows posts tagged with a tag testuser follows; if testuser follows none, page shows the canonical empty-state copy.
5. `tag-page.spec.ts` — visit `/tags/typescript`; assert title `#typescript`, subscribe button visible, post list renders ≥1 post.
6. `my-subscriptions-list.spec.ts` — log in as alice (seeded with 1 sub); assert sidebar Following list shows the seeded tag.
7. `click-tag-from-post.spec.ts` — open a seeded post with tags; click the `post-tag-chip-typescript` chip; assert URL is `/tags/typescript` and TagPage rendered.
8. `search-by-tag.spec.ts` — open search modal, type query, click a `tag-suggestion-item` or use a deep link to `/search?q=ts&tag=typescript`; assert all results carry the tag.
9. `subscribe-from-tag-page.spec.ts` — visit `/tags/python` as testuser; click `<TagSubscribeButton>`; assert button toggles state AND tag appears in sidebar Following list.

### `e2e/specs/search/` — target ~12 specs (DoD ±15% band: 10–14)

1. `plain-query.spec.ts` — type "typescript"; assert ≥1 result, all contain "typescript" in title or body.
2. `no-results.spec.ts` — query a nonsense string; assert no-results state and `try-fuzzy-link` button.
3. `fuzzy-match.spec.ts` — query a typo, click try-fuzzy, assert URL `?fuzzy=true`, assert results.
4. `ai-toggle.spec.ts` — open search modal, click `ai-toggle`; with `withMockScript('search-ts-typescript')` set; type query; assert AI-search path renders mock-script-defined results. Use a NAMED mock script key.
5. `filter-chip-tag.spec.ts` — deep-link to `/search?q=ts&tag=typescript`; assert `filter-chip-tag` rendered, all results carry the tag, click `remove-filter-tag` → URL drops `?tag=` and chip disappears.
6. `filter-chip-type.spec.ts` — deep-link to `/search?q=ts&type=snippet`; assert `filter-chip-type` rendered, all results have `contentType='snippet'`, click `remove-filter-type` → URL drops `?type=` and chip disappears.
7. `filter-chip-author.spec.ts` — search a query that returns alice's posts; click alice's name on a result; assert URL `?author=alice`, assert all results are by alice.
8. `filter-chip-since.spec.ts` — search; click the "7d" preset chip; assert URL `?since=7d`, assert all results have `created_at` within 7 days.
9. `result-click.spec.ts` — click a result; assert navigation to `/posts/:id` and post is visible.
10. `cmd-k-shortcut.spec.ts` — press `Meta+K` (mac) / `Control+K` (others); assert search modal opens.
11. `pagination.spec.ts` — search query that yields >20 results; assert `page X of Y` text; click Next; assert URL `?page=2`; assert different result set.
12. `recent-searches.spec.ts` — open modal, type "abc" + Enter; close; reopen; assert "abc" appears in recent-searches list.

### Workers=1 vs workers=4 stability

All specs must pass at both `workers=1` and `workers=4`. Cross-worker contention rules of thumb:

- **subscribe/unsubscribe specs**: each spec creates its own test post AND uses a unique tag name (e.g., `tag-${Date.now()}`) so there is no shared tag-row state.
- **pagination spec**: requires >20 posts. Either (a) seed a deterministic batch of 21+ posts with a known tag, or (b) the spec creates them inline. Choice: **(a)** — extend `scripts/seed.sql` to add 25 testuser posts with `tag-pagination-fixture`. The pagination spec then queries `?q=fixture&tag=tag-pagination-fixture`. Other specs ignore this fixture by querying with different filters.
- **filter-chip-since spec**: queries `since=7d` against seeded posts whose `created_at` is `NOW() - interval '2 days'`. Seed needs to set `created_at` explicitly on the fixture posts so the test is deterministic regardless of when the suite runs.

---

## Bruno coverage

Every modified or new endpoint gets a `.bru` file with a `res.status: eq <CODE>` assertion (per CLAUDE.md mandatory gate). All files added in this PR.

| File                                   | Endpoint                               | Asserted status |
| -------------------------------------- | -------------------------------------- | --------------- |
| `bruno/feed/list-subscribed.bru`       | `GET /api/feed?filter=subscribed`      | 200             |
| `bruno/feed/list-by-tag.bru`           | `GET /api/feed?tag=typescript`         | 200             |
| `bruno/search/by-author.bru`           | `GET /api/search?q=ts&author=alice`    | 200             |
| `bruno/search/by-since.bru`            | `GET /api/search?q=ts&since=7d`        | 200             |
| `bruno/search/pagination.bru`          | `GET /api/search?q=fixture&page=2`     | 200             |
| `bruno/tags/get-by-name.bru`           | `GET /api/tags/typescript`             | 200             |
| `bruno/tags/get-by-name-not-found.bru` | `GET /api/tags/does-not-exist`         | 404             |
| `bruno/search/by-author-bad-name.bru`  | `GET /api/search?q=ts&author=` (empty) | 400             |
| `bruno/search/by-since-bad-value.bru`  | `GET /api/search?q=ts&since=banana`    | 400             |
| `bruno/search/pagination-bad-page.bru` | `GET /api/search?q=ts&page=0`          | 400             |

Existing `.bru` files are unchanged.

---

## Coverage strategy

- **Server**: 100% line / branch / function / statement on the new search/feed/tags handler branches and new query helpers (per `.coverage-thresholds.json`). New branches in existing handlers are tested by adding cases to existing route tests, not by creating duplicate test files.
- **Client**: 100% on the new `<TagPage>`, `<TagSubscribeButton>`, `<SearchPagination>` components. The existing `SearchPage` and `TheSidebar` get **delta** coverage on the new branches — the existing coverage on unchanged branches must not regress.
- **E2E**: Not part of the coverage gate (e2e is a different layer). The `e2e-playwright.yml` workflow remains non-blocking until the 14-run counter completes (see "Flip-to-blocking" below).

---

## Flip-to-blocking decision

Tracking issue #43's green-run counter is **0/14** as of this amendment date (2026-04-30). Per the rule in #43, the flip from `continue-on-error: true` → required check is triggered when the counter reaches 14, **not** when issue #4 lands. This PR therefore does **NOT** flip the workflow.

Concrete consequences for this PR:

- `.github/workflows/e2e-playwright.yml` — **NOT** modified (no `continue-on-error` change, no `retention-days` bump).
- `CLAUDE.md` — **NOT** modified (no third-blocking-gate language added).
- PR description — explicitly states "Counter at merge time: N/14 (not flipping); flip will land in whichever subsequent #43 sub-issue's PR coincides with the 14th green main run."

If the counter happens to hit 14 between the time this PR is opened and the time it merges, the maintainer will manually amend the PR to include the workflow + CLAUDE.md changes before merge. This is documented in the PR description's checklist as a pre-merge step.

---

## File scope (amended for #49)

**In scope (this PR):**

```
# E2E specs (new)
e2e/specs/tags/**
e2e/specs/search/**
e2e/fixtures/selectors/tags.ts
e2e/fixtures/selectors/search.ts        # extended

# Client (new + modify)
packages/client/src/pages/TagPage.vue                                 (new)
packages/client/src/components/tags/TagSubscribeButton.vue            (new)
packages/client/src/components/search/SearchPagination.vue            (new)
packages/client/src/components/shell/TheSidebar.vue                   (modify)
packages/client/src/components/post/PostMetaHeader.vue                (modify)
packages/client/src/pages/SearchPage.vue                              (modify)
packages/client/src/components/search/SearchResultItem.vue            (modify)
packages/client/src/stores/search.ts                                  (modify)
packages/client/src/stores/feed.ts                                    (modify)
packages/client/src/composables/useSearch.ts                          (modify)
packages/client/src/plugins/router.ts                                 (modify — 2 new routes)

# Server (new + modify)
packages/server/src/routes/search.ts                                  (modify — author/since/page params)
packages/server/src/routes/feed.ts                                    (modify — subscribed/tag filters)
packages/server/src/routes/tags.ts                                    (modify — GET /api/tags/:name)
packages/server/src/db/queries/search.ts                              (modify)
packages/server/src/db/queries/feed.ts                                (modify)
packages/server/src/db/queries/tags.ts                                (modify)

# Shared types
packages/shared/src/types/feed.ts                                     (modify — FeedFilter union)
packages/shared/src/types/search.ts                                   (modify — SearchRequestQuery, SearchResponse)

# Bruno
bruno/feed/list-subscribed.bru                                        (new)
bruno/feed/list-by-tag.bru                                            (new)
bruno/search/by-author.bru                                            (new)
bruno/search/by-since.bru                                             (new)
bruno/search/pagination.bru                                           (new)
bruno/search/by-author-bad-name.bru                                   (new)
bruno/search/by-since-bad-value.bru                                   (new)
bruno/search/pagination-bad-page.bru                                  (new)
bruno/tags/get-by-name.bru                                            (new)
bruno/tags/get-by-name-not-found.bru                                  (new)

# Seed (deterministic pagination + since fixtures)
scripts/seed.sql                                                      (modify — append 25 fixture posts + tag)

# Unit tests (new + modify, alongside source)
packages/client/src/__tests__/...                                     (per file)
packages/server/src/__tests__/...                                     (per route/query)
```

**Out of scope (unchanged from #49):**

- Other feature folders (`playground/`, `files/`, `ai/`, `shell/`).
- The flip-to-blocking flow itself (workflow + CLAUDE.md).
- Tag rename UX (no rename feature exists; the URL-by-name design is fine without it).
- Tag descriptions, related-tags graph, follower analytics — explicitly punted (Q4 Option C rejected).
- Author auto-complete in the search input — `?author=` is set by clicking an author on a result; free-text autocomplete is YAGNI here.
- Date-range picker (vs preset chips) — Q9 Option B rejected.
- On-screen "apply" affordances for tag and type filters in SearchPage. Tag and type filters are URL-set (deep link) in this PR; the existing remove-button remains the only on-screen mutation for these two chips. Adding clickable "add tag filter" / "add type filter" controls is a future additive change that mirrors the Q8 author pattern but is not required to satisfy the DoD spec "structured filters (tag/author/date/type)" — chip rendering, result filtering, and removal are sufficient to validate the filter mechanism.

---

## Definition of Done (replaces #49's DoD)

- [ ] Type changes in `@forge/shared` published and consumed.
- [ ] Server changes:
  - [ ] `GET /api/feed?filter=subscribed` returns posts tagged with one of the auth user's followed tags.
  - [ ] `GET /api/feed?tag=<name>` returns posts with that tag.
  - [ ] `GET /api/search?author=<displayName>` filters by author.
  - [ ] `GET /api/search?since=<today|7d|30d>` filters by recency; invalid values 400.
  - [ ] `GET /api/search?page=<n>` paginates; response carries `page` + `totalPages`; `page<1` 400s.
  - [ ] `GET /api/tags/:name` returns `{ id, name, postCount, subscriberCount }` or 404.
- [ ] Client changes:
  - [ ] `TheSidebar` renders popular-tags list with inline subscribe button.
  - [ ] `TagPage` renders at `/tags/:name`.
  - [ ] Tag chips on `PostMetaHeader` are `<RouterLink>` to `/tags/:name`.
  - [ ] `/following` route renders subscribed-tag feed.
  - [ ] SearchPage renders `filter-chip-author`, `filter-chip-since`, and pagination.
  - [ ] Author display name on a result is clickable → adds author chip + URL.
- [ ] `e2e/specs/tags/`: 9 specs, all pass at `workers=1` and `workers=4`.
- [ ] `e2e/specs/search/`: 12 specs, all pass at `workers=1` and `workers=4`.
- [ ] All 10 new Bruno `.bru` files pass against a running server with seed loaded.
- [ ] `npm run test:coverage` passes at thresholds defined in `.coverage-thresholds.json`.
- [ ] `npm test` passes.
- [ ] 3 consecutive green CI runs on the PR branch before merge.
- [ ] PR description states the green-run counter (0/14 → whatever it is) and explains why this PR is NOT flipping the workflow to blocking.
- [ ] Tracking issue #43 updated: status of issue #4 set to "merged"; spec counts filled in.

---

## Risks & mitigations

| Risk                                                                                      | Mitigation                                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Seed change breaks unrelated tests                                                        | Append fixture posts at the END of `scripts/seed.sql`; do not modify existing rows. New posts use a dedicated `tag-pagination-fixture` tag and a fixed `created_at` so non-pagination tests can't accidentally match. |
| AI-search rate-limit (`aiAcquire`) flakes the `ai-toggle` spec                            | Use the foundation #44 mock provider via `withMockScript()` (no rate-limit budget consumed); spec sets a NAMED key, not the default.                                                                                  |
| Author filter using display name collides if two users share a display name               | The seed never reuses a display name; the server query is `LOWER(u.display_name) = LOWER($1)` and returns posts from ALL matching authors. Acceptable until users can change display names (out of scope).            |
| Pagination `COUNT(*)` query is slow                                                       | At our scale (seed: ~30 posts, dev DB: a few thousand), `COUNT(*)` over an indexed query is sub-millisecond. If perf later matters, switch to a cursor-based contract — that's a future amendment.                    |
| Date filter ambiguity — `since=today` on a UTC server vs. local time                      | Server interprets `today` as `created_at >= NOW() - interval '1 day'` (rolling 24h, not calendar day). Documented in the route's JSDoc. The chip label "Today" in the UI is informal; the URL token is the contract.  |
| Extending `FeedFilter` breaks downstream clients                                          | Only one consumer in the codebase (`HomePage.vue`); type narrowing carries through. Server zod validator updated. Bruno covers the new value.                                                                         |
| `<RouterLink>` change on `PostMetaHeader` breaks existing `post-tag-chip-${tag}` selector | Selector is unchanged — testid stays on the link element. The 7 existing posts/specs that use this selector still match.                                                                                              |

---

## Adversarial review checklist (carried into Plan Review Gate)

- [ ] Mock LLM script for the AI-search spec is a NAMED key from the shared registry (not `default`).
- [ ] No spec relies on `recent searches` being seeded — each recent-searches spec creates its own history.
- [ ] Cmd+K spec works on Mac and Linux runners (uses the existing platform-aware `useKeyboard` registration).
- [ ] Pagination fixture posts are appended to `scripts/seed.sql`, not interleaved.
- [ ] Filter-since spec uses fixture posts with explicit `created_at` so it's deterministic regardless of when the suite runs.
- [ ] `<TagSubscribeButton>` is the SAME component instance in sidebar and TagPage — no UI duplication.
- [ ] PR description states the green-run counter and explains the no-flip decision.
- [ ] All 10 new Bruno files contain `res.status: eq <CODE>` assertions (CI lint-guard would reject otherwise).
- [ ] Author filter URL uses `?author=<displayName>` (not `?authorId=`) per Q8.
- [ ] Date filter URL token is one of `today | 7d | 30d` (omitted = all) per Q9; the validator rejects all other values with 400.
- [ ] No specs are `test.fixme()` — every DoD item has a passing spec.

---

## Acceptance for this amendment

- [ ] All 5 design-review-gate agents (PM, Architect, Designer, Security, CTO) approve.
- [ ] Issue #49 body is updated to point at this amendment and reflect the new file scope and DoD.
- [ ] No change to the parent design (`2026-04-28-e2e-playwright-testing-design.md`); this amendment is additive and scoped to the #49 surface area.
