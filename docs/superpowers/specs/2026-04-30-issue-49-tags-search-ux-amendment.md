# Issue #49 — Tags + Search UX Amendment (E2E rollout 4/9, scope expansion)

**Date:** 2026-04-30
**Parent design:** [`2026-04-28-e2e-playwright-testing-design.md`](./2026-04-28-e2e-playwright-testing-design.md)
**Tracking issue:** [#43 — E2E Playwright rollout](https://github.com/multiandrewlab/forge/issues/43)
**Issue under amendment:** [#49 — E2E rollout 4/9: tags + search + flip-to-blocking](https://github.com/multiandrewlab/forge/issues/49)
**Branch:** `feat/e2e-tags-search`
**Status:** Drafted; round 1 design review feedback applied (see §Round 1 review response); pending round 2.

---

## Why this amendment exists

Issue #49 was filed on the assumption that the underlying tag and search UX **already existed** in the application, and that the PR's job was to add `data-testid` attributes plus write Playwright specs. A pre-implementation feature audit on 2026-04-30 found that the majority of the DoD line items in #49 reference UI features that **do not exist** in the codebase:

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

Issue #49's original `Out of scope` clause read **"server changes; other feature folders"**, which made it impossible to land a passing test suite for the listed DoD items without first shipping the missing UX in a separate PR. The maintainer chose to **expand the scope of #49 itself** (rather than file a prep sub-issue). This document justifies that expansion and pins down each open UX decision before any implementation work begins.

---

## Decisions

| #   | Decision                           | Choice                                                                                                      | Rationale                                                                                  |
| --- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 1   | Popular-tags widget placement      | New section in `TheSidebar.vue` below the existing Following list                                           | Lowest-cost surface; fits sidebar's tag-navigation role; no new route.                     |
| 2   | Subscribe / unsubscribe affordance | Shared `<TagSubscribeButton>` mounted in **both** the sidebar's popular-tags list **and** the new `TagPage` | Comprehensive without UI duplication; one component, one selector pattern, two contexts.   |
| 3   | TagPage URL                        | `/tags/:name`                                                                                               | Mirrors existing `/posts/:id`, `/user/:id` route conventions; composes with `?tag=<name>`. |
| 4   | TagPage content                    | Title + `<TagSubscribeButton>` + reused `<PostList>` of `/api/posts/feed?tag=<name>`                        | Minimal viable surface; DoD says "tag page", not "tag analytics".                          |
| 5   | "My subscriptions" list            | The existing `TheSidebar.vue` Following list                                                                | List already exists; bug is that there is no in-app subscribe affordance — Q2 fixes that.  |
| 6   | Subscribed-tag-feed filter         | Extend `FeedFilter` with `'subscribed'`; new sibling route `/following` rendering `HomePage`                | Mirrors `/my-snippets` and `/bookmarks` shape exactly.                                     |
| 7   | Click-tag-from-post                | Tag chip becomes a `<RouterLink>` to `/tags/:name`                                                          | Closes the discover→subscribe loop. SearchPage tag-filter remains reachable via `?tag=`.   |
| 8   | Author filter                      | Click an author name on a search result → adds `filter-chip-author`; URL `?author=<displayName>`            | Same UX paradigm as existing `filter-chip-tag` and `filter-chip-type`.                     |
| 9   | Date filter                        | Preset chips: Today / 7d / 30d / All time; URL `?since=<today\|7d\|30d>` (omitted = All)                    | Covers 95% of intent without pulling a date-picker dependency.                             |
| 10  | Pagination                         | Numbered pagination, `[Prev] page X of Y [Next]`; URL `?page=<n>`; response includes `page`, `totalPages`   | URL persistence is test-friendly; spec asserts URL + rendered indicator.                   |

---

## User benefit summary

This amendment unblocks two end-to-end user journeys that the codebase exposes APIs for but has no UI for:

1. **Discover → subscribe → consume.** A user reading a post sees its tag chip, clicks it, lands on the tag page, subscribes, and from then on sees that tag's posts aggregated under `/following`. The popular-tags widget on the sidebar opens this loop for users browsing the home feed.
2. **Search → narrow → paginate.** A user searches a query, refines by clicking an author name (or picking a preset since-chip), pages through the matching results, and clicks through to a post. Author and date filters are inert today; pagination is required for usable result sets.

---

## Round 1 review response (changelog)

The 5-agent design review gate flagged 20 blockers across Architect, Designer, Security, and CTO reviewers (PM approved). This document was revised in place to address every blocker. Summary of changes from the round-1 draft:

- **Pagination contract** is now pinned against the existing tsvector + trigram-fallback architecture (see §Server route changes / search).
- **AI-search × pagination interaction** explicitly resolved: AI resolution runs only on page=1; resolved filters are encoded into the URL for page≥2.
- **Subscribe-spec contention** resolved: each subscribe/unsubscribe spec uses a distinct seeded popular tag (typescript / python / langchain / svelte) so cross-spec interference is impossible at workers=4.
- **Page parameter** capped at `max(1000)` (DoS bound); `author` capped at `max(100)` (matches displayName ceiling); `since` is a strict `z.enum`. All three reject empty strings with 400.
- **Auth-optional handler pattern** for `GET /api/tags/:name` is now defined as **fully public** — no auth-derived branches in the handler. Subscribe state is hydrated by a separate authed call from the client.
- **False production-guard claim removed** from the risks table. `scripts/seed.sql` has no guard today; this amendment does not add one (out of scope for this PR; flagged for a future amendment).
- **Coverage strategy** drops the "delta coverage" framing. Every file in this PR's diff (new and modified) hits 100% per `.coverage-thresholds.json`. Modified files enumerated explicitly.
- **Bruno files** now specify per-file auth posture and verbatim `assert { res.status: eq <CODE> }` block.
- **Seed change** moved from "25 testuser-owned posts" to a **new seeded user `paginationuser`** so existing testuser-post-count assertions are not affected.
- **Spec atomicity** carve-out added: render checklists (one page-load, multiple presence assertions) count as one spec per parent design §Test-author conventions §1; state-transition specs (action then check different surface) are split.
- **Component states** for `<TagSubscribeButton>`, `<SearchPagination>`, `<TagPage>` are now specified including loading, error, disabled, empty, 404 states.
- **Selector strings** are pinned as kebab-case in DOM; helper functions in selector shards may use camelCase.
- **Route paths corrected**: feed is mounted at `/api/posts/feed` (not `/api/feed`); Bruno files live under `bruno/posts/`. Server changes live in `packages/server/src/routes/posts.ts` (extending the existing `feedQuerySchema`).
- **`/self-reflect` step** added to DoD before PR creation per CLAUDE.md mandate.

---

## Architecture changes

### Type changes — `@forge/shared`

```ts
// types/feed.ts
export type FeedFilter = 'mine' | 'bookmarked' | 'subscribed'; // ← added 'subscribed'

// types/search.ts
export interface SearchResponse {
  query: string;
  snippets: PostWithAuthor[];
  aiActions: AiAction[];
  people: UserSummary[];
  totalResults: number;
  page: number; // ← new (always present, ≥ 1)
  totalPages: number; // ← new (always present, ≥ 0; 0 if no results)
}

export interface SearchRequestQuery {
  q: string;
  type?: ContentType;
  tag?: string;
  fuzzy?: boolean;
  ai?: boolean;
  limit?: number;
  author?: string; // ← new — display name, case-insensitive exact match
  since?: 'today' | '7d' | '30d'; // ← new — omit ⇒ no date filter
  page?: number; // ← new — default 1; min 1; max 1000 (DoS bound)
}
```

**Exhaustiveness contract (FeedFilter):** every existing client-side `switch` / `if` ladder over `FeedFilter` is updated to handle `'subscribed'` and uses a TypeScript `never` exhaustiveness check (`const _exhaustive: never = filter; throw new Error(...)`) so adding the new variant fails to compile anywhere it isn't handled. Server zod validator for `/api/posts/feed` updated symmetrically; a Bruno error-path file covers `?filter=invalid` returning 400.

**Build order:** `@forge/shared` is rebuilt (`npm run -w @forge/shared build`) after editing its `src/types/*.ts` and BEFORE running server typecheck. This is a documented gotcha (see auto-memory note `project_shared_package_dist_staleness`).

### Server route changes — Fastify

#### `GET /api/posts/feed` (existing route, extended)

The feed endpoint is registered on the `posts` router at the prefix `/api/posts`, so the URL is `/api/posts/feed`. The existing `feedQuerySchema` in `packages/server/src/routes/posts.ts` (line 34) is extended with two new optional params:

- `?filter=subscribed` — joins via the EXISTS predicate already present in `findFeedPosts` (line 156 of `db/queries/feed.ts`) for `sort='personalized'`. We reuse that predicate; we do NOT introduce a parallel join path. When the user has zero subscriptions, the handler short-circuits to an empty `{ posts: [] }` response (no SQL fired).
- `?tag=<name>` — extends the existing `WHERE` builder to add `EXISTS (SELECT 1 FROM post_tags pt JOIN tags t ON pt.tag_id = t.id WHERE pt.post_id = p.id AND LOWER(t.name) = LOWER($n))`.

Both params validated through the extended `feedQuerySchema`. Bruno: 2 happy-path + 1 error-path file under `bruno/posts/`.

#### `GET /api/search` (existing route, extended)

**Auth posture:** unchanged — remains `preHandler: [app.authenticate]`.

**Validator extension** (zod):

```ts
const searchQuerySchema = z.object({
  q: z.string().min(1).max(200),
  type: z.enum([...contentTypes]).optional(),
  tag: z.string().min(1).max(80).optional(),
  fuzzy: z.coerce.boolean().optional(),
  ai: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  author: z.string().min(1).max(100).optional(), // ← new — matches displayName ceiling
  since: z.enum(['today', '7d', '30d']).optional(), // ← new — strict enum
  page: z.coerce.number().int().min(1).max(1000).default(1), // ← new — DoS bound
});
```

Empty string for `author`, `tag`, `q` rejected with 400. The frontend strips empty-value params before pushing the route so the chip never renders with an empty value.

**Author resolution:** `WHERE LOWER(u.display_name) = LOWER($author)` against the existing users join. Display-name uniqueness is not enforced at the DB level, so this returns posts from ALL matching authors. Acceptable until display-name editing or display-name uniqueness is introduced (out of scope).

**Since resolution:** `'today'` ⇒ `created_at >= NOW() - interval '1 day'` (rolling 24h, NOT calendar day; documented in route JSDoc); `'7d'` ⇒ 7 days; `'30d'` ⇒ 30 days. Omitted ⇒ no `created_at` predicate.

**Pagination contract — pinned against the tsvector + trigram architecture:**

The existing `search.ts` runs a tsvector query first; if it returns fewer than 5 rows (and `fuzzy` is not requested), it falls back to a trigram similarity query. Today the two row sets are concatenated and `slice(0, limit)`'d in JavaScript. Naïve `LIMIT/OFFSET` on each underlying query yields wrong page boundaries.

This amendment pins the contract:

1. The **primary path** (tsvector when `fuzzy=false`, trigram when `fuzzy=true`) is the canonical paginated query. `LIMIT 20 OFFSET (page-1)*20` is applied to the primary path SQL.
2. The **trigram top-up fallback** (the existing "tsvector returned <5, top-up with trigram") **only fires on page=1**. On page≥2, the trigram top-up is skipped. This means page 1 may contain a mix of tsvector + trigram results; pages 2..N are pure tsvector.
3. **`totalPages`** is computed as `CEIL(primary_count / 20)` where `primary_count` is the result of `SELECT COUNT(*) FROM (<primary_query_without_limit_offset>) sub`. The trigram top-up is excluded from the count so the user does not see "page 2 of N" change between page 1 and page 2.
4. **Server-side clamp**: if the requested `page > totalPages`, the handler returns `{ ..., page: Math.min(requested, Math.max(1, totalPages)), snippets: [], aiActions: [], people: [] }`. The client never displays "page 999 of 5".

**AI-search × pagination interaction — pinned:**

When `ai=true` and `page=1`, the handler invokes `aiAcquire()` and `runSearchChain()`. The chain may resolve to an AI-augmented filter set (e.g., `tag: 'typescript'`); these are encoded into the response via a new field `aiResolvedFilters?: { tag?: string; type?: string }`. The client, on receiving the response, **rewrites the URL** to include those resolved filters as plain query params and **removes `ai=true`** from page≥2 navigation. As a result:

- `aiAcquire` is called **at most once per query**, not once per page.
- Page≥2 navigation is a plain authenticated search; rate limiter is not consulted.
- The pagination spec at `workers=4` does not contend on the AI rate limit.

This is implemented client-side in the search store. The handler ignores `ai=true` when `page > 1` (treats it as `false`) so even a hostile client cannot consume rate-limit budget by paginating with `ai=true` repeatedly.

**Indexes verified:** `posts(author_id)` (existing), `posts(created_at)` (existing), `tags(name)` UNIQUE → btree (existing), `post_tags(post_id, tag_id)` PK (existing), `user_tag_subscriptions(user_id, tag_id)` PK (existing). No new indexes required.

**Bruno:** 5 new files under `bruno/search/` covering happy paths (author, since, pagination, ai-page-1) and error paths (page=0, since=banana, author=empty).

#### `GET /api/tags/:name` (new endpoint)

**Auth posture:** **fully public — no `preHandler` array.** This is a deliberate deviation from the rest of `tags.ts` (which uniformly applies `[app.authenticate]`). The handler:

```ts
// FULLY PUBLIC — no auth, no jwtVerify, no try/catch on auth.
// The handler reads tag rows + aggregate counts only; it never references request.user.
// Subscribe state is hydrated by a SEPARATE authenticated call from the client
// (the existing useTags.loadSubscriptions over /api/tags/subscriptions, which retains
// preHandler: [app.authenticate]).
app.get('/:name', async (request, reply) => { ... });
```

State-changing endpoints (`POST /:id/subscribe`, `DELETE /:id/subscribe`) **remain authed** — their `preHandler: [app.authenticate]` is unchanged.

**Query:**

```sql
SELECT
  t.id,
  t.name,
  t.post_count,
  (SELECT COUNT(*) FROM user_tag_subscriptions WHERE tag_id = t.id) AS subscriber_count
FROM tags t
WHERE LOWER(t.name) = LOWER($1)
LIMIT 1;
```

Single query with subquery aggregate (no N+1). 404 with body `{ error: 'Tag not found' }` if no row matches. Same error body for "deleted" and "never existed" — no enumeration channel.

**Bruno:** 3 new files under `bruno/tags/`:

| File                                   | Auth                                         | Asserted status |
| -------------------------------------- | -------------------------------------------- | --------------- |
| `bruno/tags/get-by-name.bru`           | none                                         | 200             |
| `bruno/tags/get-by-name-anonymous.bru` | none (explicit no-Authorization-header test) | 200             |
| `bruno/tags/get-by-name-not-found.bru` | none                                         | 404             |

The anonymous `.bru` locks in the public-access contract against accidental future regressions (someone adding `app.authenticate` by reflex).

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
  meta: { requiresAuth: false },   // public per Q3+the auth-optional decision above
},
```

### New / modified Vue components

| File                                                         | Change                                                                              | LOC est. |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------- | -------- |
| `packages/client/src/pages/TagPage.vue`                      | NEW                                                                                 | ~110     |
| `packages/client/src/components/tags/TagSubscribeButton.vue` | NEW                                                                                 | ~80      |
| `packages/client/src/components/search/SearchPagination.vue` | NEW                                                                                 | ~70      |
| `packages/client/src/components/shell/TheSidebar.vue`        | + popular-tags-list section beneath Following                                       | ~50      |
| `packages/client/src/components/post/PostMetaHeader.vue`     | tag chip span → `<RouterLink>`                                                      | ~15      |
| `packages/client/src/pages/SearchPage.vue`                   | + `filter-chip-author`, `filter-chip-since`, `<SearchPagination>`, since-preset row | ~110     |
| `packages/client/src/components/search/SearchResultItem.vue` | author-name becomes clickable with `event.stopPropagation()`                        | ~20      |
| `packages/client/src/stores/search.ts`                       | track `page`, `totalPages`, `author`, `since`                                       | ~40      |
| `packages/client/src/composables/useSearch.ts`               | build URL with all new params; rewrite URL on AI-resolved filters                   | ~25      |
| `packages/client/src/stores/feed.ts`                         | accept `'subscribed'` filter value                                                  | ~10      |

#### Component state contracts

**`<TagSubscribeButton>`** (props: `tag: Tag` — id + name; reads `subscribedTags` from `useTagsStore`):

| State                                         | Visual                                                 | DOM                 | Testid                                                                                  |
| --------------------------------------------- | ------------------------------------------------------ | ------------------- | --------------------------------------------------------------------------------------- |
| Not subscribed                                | "Subscribe" label, `aria-pressed="false"`              | `<button>`          | `subscribe-btn-${tag.name}`                                                             |
| Subscribed                                    | "Unsubscribe" label, `aria-pressed="true"`             | `<button>`          | `subscribe-btn-${tag.name}` (unchanged — same testid; specs assert via `aria-pressed`)  |
| Loading (request in flight)                   | label unchanged, `aria-busy="true"`, button `disabled` | `<button disabled>` | `subscribe-btn-${tag.name}`                                                             |
| Error (last call rejected)                    | "Try again" label, error tooltip                       | `<button>`          | `subscribe-btn-${tag.name}`; sibling `<span data-testid="subscribe-error-${tag.name}">` |
| Anonymous (auth store says not authenticated) | hidden (`v-if="authStore.isAuthenticated"`)            | (no DOM)            | —                                                                                       |

The testid is **scoped by tag name** so multiple instances (sidebar list + TagPage header) coexist on the same page without ambiguity. Specs assert state via `aria-pressed`, not by testid swap.

**`<SearchPagination>`** (props: `page: number`, `totalPages: number`, `@change`):

| State                        | Visual                                                  | DOM      | Testid                                                                  |
| ---------------------------- | ------------------------------------------------------- | -------- | ----------------------------------------------------------------------- |
| Multi-page (totalPages > 1)  | `[Prev] page X of Y [Next]`                             | rendered | `search-pagination`, `prev-page-btn`, `next-page-btn`, `page-indicator` |
| At page 1                    | Prev visible but `disabled`; Next visible               | rendered | testids preserved; `prev-page-btn[disabled]`                            |
| At page = totalPages         | Next visible but `disabled`                             | rendered | `next-page-btn[disabled]`                                               |
| Single page (totalPages ≤ 1) | hidden (`v-if="totalPages > 1"`)                        | (no DOM) | —                                                                       |
| Past-end (server clamped)    | clamps to last page; renders matching that page's state | rendered | normal                                                                  |

Disabled buttons retain testids so specs can assert `[disabled]`. The `page-indicator` testid renders text "page X of Y".

**`<TagPage>`**:

| State                                               | Visual                                                                                  | DOM      | Testid                                                                                 |
| --------------------------------------------------- | --------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------- |
| Loading initial fetch                               | spinner                                                                                 | `<div>`  | `tag-page-loading`                                                                     |
| Tag exists, posts ≥ 1                               | title `#name`, Subscribe button, post list                                              | rendered | `tag-page`, `tag-page-title`, `subscribe-btn-${name}`, `post-list-item` (per existing) |
| Tag exists, posts = 0                               | title + subscribe button + "No posts tagged #name yet" copy                             | rendered | `tag-page`, `tag-page-empty`                                                           |
| Tag does not exist (404 from `GET /api/tags/:name`) | "Tag not found" copy + link to home                                                     | rendered | `tag-not-found`                                                                        |
| Anonymous viewer                                    | title + (no subscribe button per `TagSubscribeButton` rules) + post list (still public) | rendered | `tag-page`, no `subscribe-btn`                                                         |

### Selector shards

DOM `data-testid` strings are kebab-case throughout, matching the parent design's selector convention. Helper function names in the shard files may use camelCase for ergonomics.

| Shard                              | Status                                                     | DOM testids exposed (kebab-case)                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `e2e/fixtures/selectors/tags.ts`   | NEW                                                        | `popular-tags-list`, `popular-tag-row-:name`, `subscribe-btn-:name`, `subscribe-error-:name`, `tag-page`, `tag-page-title`, `tag-page-loading`, `tag-page-empty`, `tag-not-found`, `following-nav-link`, `subscribed-tag-link-:name`                                                                                                                                                                                                                                   |
| `e2e/fixtures/selectors/search.ts` | EXTEND (existing has `search-input`, `search-result-item`) | `ai-toggle`, `search-page-loading`, `try-fuzzy-link`, `filter-chip-type`, `remove-filter-type`, `filter-chip-tag`, `remove-filter-tag`, `filter-chip-author`, `remove-filter-author`, `filter-chip-since`, `remove-filter-since`, `since-preset-:token` (today/7d/30d/all), `search-pagination`, `prev-page-btn`, `next-page-btn`, `page-indicator`, `recent-searches`, `recent-query`, `search-result-author`, `search-trigger`, `open-search-cta`, `see-all-results` |
| `e2e/fixtures/selectors/shell.ts`  | EXTEND if needed                                           | (cross-cutting only — none expected)                                                                                                                                                                                                                                                                                                                                                                                                                                   |

---

## E2E spec inventory

**Atomicity rule (from parent design §Test-author conventions §1):** one assertion concept per spec. Multi-element renders on a single page load (e.g., "title + subscribe button + post list visible") count as **one** assertion concept (a render checklist). State-transition specs (action then check a different surface) are **split** into separate specs.

### `e2e/specs/tags/` — 9 specs

1. `popular-tags-render.spec.ts` — visit `/`; assert `popular-tags-list` is visible with ≥ 1 row. (Render checklist: count = 1 assertion.)
2. `subscribe-from-sidebar.spec.ts` — log in as testuser; click `subscribe-btn-typescript` in sidebar popular-tags; assert `aria-pressed="true"` on that button. **Tag: typescript.**
3. `subscribed-tag-appears-in-following.spec.ts` — pre-state: testuser subscribes to `typescript` via API in beforeEach; visit `/`; assert sidebar Following list contains `subscribed-tag-link-typescript`. (Split out of #2 per atomicity rule.)
4. `unsubscribe-from-sidebar.spec.ts` — pre-state: testuser pre-subscribed to `python` via API in beforeEach; click `subscribe-btn-python` (the same button — its label flips); assert `aria-pressed="false"` after click. **Tag: python.**
5. `subscribed-tag-feed.spec.ts` — pre-state: testuser pre-subscribed to `langchain`; visit `/following`; assert ≥1 post visible AND each visible `post-list-item` has `langchain` among its tags. **Tag: langchain.**
6. `tag-page.spec.ts` — visit `/tags/typescript`; assert `tag-page` rendered, `tag-page-title` text contains `typescript`, post list has ≥ 1 item. (Render checklist.)
7. `my-subscriptions-list.spec.ts` — log in as alice (seeded with 1 sub: tag `b0000000-...-000000000003`); assert sidebar Following list shows that tag's `subscribed-tag-link-${name}`. (Render checklist.)
8. `click-tag-from-post.spec.ts` — visit a seeded post with tag `typescript`; click `post-tag-chip-typescript`; assert URL is `/tags/typescript`.
9. `subscribe-from-tag-page.spec.ts` — visit `/tags/svelte` as testuser (no pre-state); click `subscribe-btn-svelte`; assert `aria-pressed="true"`. **Tag: svelte.**

**Subscribe-spec contention resolution:** specs #2/#3 use `typescript`, #4 uses `python`, #5 uses `langchain`, #9 uses `svelte`. All four are seeded popular tags (post_count > 0). Across workers, two specs may run in parallel as testuser — but each manipulates a different `(testuser, tag)` row in `user_tag_subscriptions`, and the PK is `(user_id, tag_id)` so there is no row contention. The reset fixture (`fixtures/reset.ts`) zeroes `user_tag_subscriptions` rows for testuser between specs.

### `e2e/specs/search/` — 12 specs

1. `plain-query.spec.ts` — type "typescript"; assert ≥ 1 result containing the query string.
2. `no-results.spec.ts` — query a nonsense string; assert no-results state with `try-fuzzy-link` button.
3. `fuzzy-match.spec.ts` — query a typo; click `try-fuzzy-link`; assert URL `?fuzzy=true` AND ≥ 1 result.
4. `ai-toggle.spec.ts` — open modal; click `ai-toggle`; set `withMockScript('search-resolves-to-typescript-tag')`; type query; assert page=1 results matching the mock-script's resolved filter set. **Named mock script key.**
5. `filter-chip-tag.spec.ts` — deep-link `/search?q=ts&tag=typescript`; assert `filter-chip-tag` visible AND results all carry tag.
6. `filter-chip-tag-remove.spec.ts` — deep-link as #5; click `remove-filter-tag`; assert URL drops `?tag=` AND chip gone. (Split per atomicity.)
7. `filter-chip-type.spec.ts` — deep-link `/search?q=ts&type=snippet`; assert `filter-chip-type` AND results all `contentType==='snippet'`.
8. `filter-chip-author.spec.ts` — search "the"; click `search-result-author` on a result by alice; assert URL `?author=Alice` AND `filter-chip-author` visible AND all results by alice.
9. `filter-chip-since.spec.ts` — search "fixture"; click `since-preset-7d`; assert URL `?since=7d` AND results' `created_at` within 7 days.
10. `result-click.spec.ts` — click first result; assert navigation to `/posts/:id`.
11. `cmd-k-shortcut.spec.ts` — press `Meta+K` on darwin / `Control+K` on others (or use Playwright's `Mod` shorthand); assert search modal opens.
12. `pagination.spec.ts` — query `?q=fixture&tag=tag-pagination-fixture` (matches the 25 seeded posts); assert `page-indicator` shows "page 1 of 2"; click `next-page-btn`; assert URL `?page=2` AND result set differs from page 1.
13. `recent-searches.spec.ts` — open modal; type "abc" + Enter; close; reopen; assert "abc" appears in `recent-searches` list. **Note: Pinia store-backed; same-session only — survives modal close, NOT page reload. Spec stays inside one page lifetime.**

**Spec count: 13 in search/** (one over the original 12 due to the atomicity-driven split of `filter-chip-tag` apply vs remove). 13 is within the parent design's ±15% band (10–14). Spec count for tags/ remains 9 (within 8–10 band).

### Workers=1 vs workers=4 stability

- **Subscribe / unsubscribe specs**: distinct seeded tags per spec (above).
- **Pagination spec**: requires >20 posts. Solution: extend `scripts/seed.sql` to add a NEW seeded user `paginationuser` (UUID `a0000000-0000-0000-0000-000000000004`) who owns 25 fixture posts tagged `tag-pagination-fixture` (a new seeded tag). The pagination spec queries `?q=fixture&tag=tag-pagination-fixture`. **No testuser-post-count assertion in the codebase is affected**, because the new posts are owned by `paginationuser` not testuser.
- **filter-chip-since spec**: relies on the 25 fixture posts having an explicit `created_at` set in seed (e.g., `NOW() - interval '2 days'`). Since they have a fixed offset relative to `NOW()` at seed-load time, the 7d window assertion is deterministic for any test run within ~5 days of seed load. The CI workflow re-runs seed at the start of each job, so the offset is always fresh.

---

## Coverage strategy

`.coverage-thresholds.json` mandates 100% lines, branches, functions, and statements — **no per-file carve-out**. Every file in this PR's diff (new and modified) must hit 100%. The full set of files under coverage:

**New files (100% required):**

- `packages/client/src/pages/TagPage.vue`
- `packages/client/src/components/tags/TagSubscribeButton.vue`
- `packages/client/src/components/search/SearchPagination.vue`

**Modified files (100% on existing + new lines):**

- `packages/client/src/components/shell/TheSidebar.vue`
- `packages/client/src/components/post/PostMetaHeader.vue`
- `packages/client/src/pages/SearchPage.vue`
- `packages/client/src/components/search/SearchResultItem.vue`
- `packages/client/src/stores/search.ts`
- `packages/client/src/stores/feed.ts`
- `packages/client/src/composables/useSearch.ts`
- `packages/client/src/composables/useTags.ts` _(if any change)_
- `packages/client/src/plugins/router.ts`
- `packages/server/src/routes/posts.ts`
- `packages/server/src/routes/search.ts`
- `packages/server/src/routes/tags.ts`
- `packages/server/src/db/queries/feed.ts`
- `packages/server/src/db/queries/search.ts`
- `packages/server/src/db/queries/tags.ts`
- `packages/shared/src/types/feed.ts`
- `packages/shared/src/types/search.ts`

**Per-component unit-test contracts (TDD)**:

- `<TagSubscribeButton>`: renders "Subscribe" / "Unsubscribe" reflecting `subscribedTags`; emits subscribe / unsubscribe via `useTags`; reflects `aria-pressed` correctly; disabled+`aria-busy` during pending request; renders error-sibling on rejection; hidden when `authStore.isAuthenticated === false`.
- `<SearchPagination>`: renders `page X of Y` correctly; Prev disabled at page=1; Next disabled at page=totalPages; entire component hidden when totalPages ≤ 1; emits `change(page+1)` on Next click; emits `change(page-1)` on Prev click.
- `<TagPage>`: loading → success render path; loading → 404 render path; success+empty-posts render path; anonymous (no subscribe button) render path; subscribe-button-click triggers `useTags.subscribe`.

**E2E** is not part of the coverage gate (different layer).

---

## Bruno coverage

Every modified or new endpoint gets a `.bru` file with a verbatim:

```
assert {
  res.status: eq <CODE>
}
```

block. The CI lint-guard in `.github/workflows/bruno-regression.yml` rejects files lacking this exact block syntax.

| File                                    | Auth                                                                         | Endpoint                                | Asserted status |
| --------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------- | --------------- |
| `bruno/posts/feed-list-subscribed.bru`  | bearer `{{accessToken}}`                                                     | `GET /api/posts/feed?filter=subscribed` | 200             |
| `bruno/posts/feed-list-by-tag.bru`      | bearer `{{accessToken}}`                                                     | `GET /api/posts/feed?tag=typescript`    | 200             |
| `bruno/posts/feed-list-bad-filter.bru`  | bearer `{{accessToken}}`                                                     | `GET /api/posts/feed?filter=invalid`    | 400             |
| `bruno/search/by-author.bru`            | bearer `{{accessToken}}`                                                     | `GET /api/search?q=ts&author=alice`     | 200             |
| `bruno/search/by-since.bru`             | bearer `{{accessToken}}`                                                     | `GET /api/search?q=ts&since=7d`         | 200             |
| `bruno/search/pagination.bru`           | bearer `{{accessToken}}`                                                     | `GET /api/search?q=fixture&page=2`      | 200             |
| `bruno/search/ai-page-1.bru`            | bearer `{{accessToken}}`                                                     | `GET /api/search?q=ts&ai=true&page=1`   | 200             |
| `bruno/search/by-author-empty.bru`      | bearer `{{accessToken}}`                                                     | `GET /api/search?q=ts&author=`          | 400             |
| `bruno/search/by-since-bad.bru`         | bearer `{{accessToken}}`                                                     | `GET /api/search?q=ts&since=banana`     | 400             |
| `bruno/search/pagination-bad-page.bru`  | bearer `{{accessToken}}`                                                     | `GET /api/search?q=ts&page=0`           | 400             |
| `bruno/search/pagination-too-large.bru` | bearer `{{accessToken}}`                                                     | `GET /api/search?q=ts&page=1001`        | 400             |
| `bruno/tags/get-by-name.bru`            | bearer `{{accessToken}}` (acts as authed-but-uses-public-handler smoke test) | `GET /api/tags/typescript`              | 200             |
| `bruno/tags/get-by-name-anonymous.bru`  | NONE (no Authorization header)                                               | `GET /api/tags/typescript`              | 200             |
| `bruno/tags/get-by-name-not-found.bru`  | bearer `{{accessToken}}`                                                     | `GET /api/tags/does-not-exist-12345`    | 404             |

**14 `.bru` files** — 8 happy-path + 6 error-path. Existing `.bru` files unchanged.

---

## Flip-to-blocking decision

Tracking issue #43's green-run counter is **0/14** as of 2026-04-30. This PR therefore does **NOT** flip the workflow. Concrete consequences:

- `.github/workflows/e2e-playwright.yml` — **NOT** modified.
- `CLAUDE.md` — **NOT** modified.
- PR description — explicitly states "Counter at merge time: N/14 (not flipping); flip will land in whichever subsequent #43 sub-issue's PR coincides with the 14th green main run."

If the counter happens to hit 14 between PR open and merge, the maintainer manually amends the PR before merge.

---

## File scope (amended for #49)

**In scope (this PR):**

```
# E2E specs (new)
e2e/specs/tags/**
e2e/specs/search/**
e2e/fixtures/selectors/tags.ts
e2e/fixtures/selectors/search.ts          # extended

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

# Server (modify only — no new route files)
packages/server/src/routes/posts.ts          (modify — extend feedQuerySchema with subscribed/tag filters)
packages/server/src/routes/search.ts         (modify — author/since/page params; AI-page-1 logic)
packages/server/src/routes/tags.ts           (modify — add public GET /:name handler)
packages/server/src/db/queries/search.ts     (modify — pagination COUNT, author/since predicates)
packages/server/src/db/queries/feed.ts       (modify — reuse EXISTS predicate for filter='subscribed', new tag predicate)
packages/server/src/db/queries/tags.ts       (modify — findTagByName with subscriber count)

# Shared types
packages/shared/src/types/feed.ts            (modify — FeedFilter union)
packages/shared/src/types/search.ts          (modify — SearchRequestQuery, SearchResponse + aiResolvedFilters)

# Bruno
bruno/posts/feed-list-subscribed.bru                                  (new)
bruno/posts/feed-list-by-tag.bru                                      (new)
bruno/posts/feed-list-bad-filter.bru                                  (new)
bruno/search/by-author.bru                                            (new)
bruno/search/by-since.bru                                             (new)
bruno/search/pagination.bru                                           (new)
bruno/search/ai-page-1.bru                                            (new)
bruno/search/by-author-empty.bru                                      (new)
bruno/search/by-since-bad.bru                                         (new)
bruno/search/pagination-bad-page.bru                                  (new)
bruno/search/pagination-too-large.bru                                 (new)
bruno/tags/get-by-name.bru                                            (new)
bruno/tags/get-by-name-anonymous.bru                                  (new)
bruno/tags/get-by-name-not-found.bru                                  (new)

# Seed (deterministic pagination + since fixtures)
scripts/seed.sql                             (modify — append paginationuser + tag-pagination-fixture + 25 posts with explicit created_at)

# Unit tests (new + modify, alongside source)
packages/client/src/__tests__/...            (per file)
packages/server/src/__tests__/...            (per route/query)
```

**Out of scope (unchanged from #49 except for the server-changes carve-in):**

- Other feature folders (`playground/`, `files/`, `ai/`, `shell/`).
- The flip-to-blocking flow itself (workflow YAML + CLAUDE.md).
- Tag rename UX.
- Tag descriptions, related-tags graph, follower analytics.
- Author auto-complete in the search input (Q8 affords clicking author on a result; no free-text autocomplete).
- Date-range picker (Q9 picked preset chips).
- On-screen "apply" affordances for tag and type filters in SearchPage (set via deep link or via existing affordances; remove via existing chip-remove buttons). Adding clickable "add tag/type filter" controls is a future additive change.
- Adding a production guard to `scripts/seed.sql` (preexisting condition — flagged for a future amendment).

---

## Definition of Done (replaces #49's DoD)

- [ ] `@forge/shared` rebuilt and consumed; type changes propagate to server typecheck.
- [ ] **Server changes:**
  - [ ] `GET /api/posts/feed?filter=subscribed` returns posts whose tag the auth user subscribes to (reuses existing EXISTS predicate).
  - [ ] `GET /api/posts/feed?tag=<name>` returns posts with that tag.
  - [ ] `GET /api/posts/feed?filter=invalid` returns 400.
  - [ ] `GET /api/search?author=<displayName>` filters by author (case-insensitive exact match).
  - [ ] `GET /api/search?since=<today\|7d\|30d>` filters by recency; invalid values 400.
  - [ ] `GET /api/search?page=<n>` paginates (n in [1, 1000]); response carries `page` + `totalPages`; invalid values 400.
  - [ ] `GET /api/search?ai=true&page=1` resolves AI filters; `?page>1` ignores `ai=true`; rate limiter consulted at most once per query.
  - [ ] `GET /api/tags/:name` returns `{ id, name, postCount, subscriberCount }` for public callers; 404 with consistent body for missing tag; same body for "deleted" and "never existed".
  - [ ] State-changing tag endpoints (`POST/DELETE /:id/subscribe`) retain `preHandler: [app.authenticate]`.
- [ ] **Client changes:**
  - [ ] `TheSidebar` renders `popular-tags-list` with inline `<TagSubscribeButton>`.
  - [ ] `TagPage` renders at `/tags/:name`; supports loading, success, empty-posts, 404, anonymous states.
  - [ ] Tag chips on `PostMetaHeader` are `<RouterLink>` to `/tags/:name`.
  - [ ] `/following` route renders `HomePage` with `filter='subscribed'`; sidebar nav has `following-nav-link`.
  - [ ] SearchPage renders `filter-chip-author`, `filter-chip-since`, `<SearchPagination>` with disabled-state semantics.
  - [ ] Author display name on a result is clickable with `event.stopPropagation()` (parent click handler does NOT fire).
  - [ ] Search store rewrites the URL with AI-resolved filters and removes `ai=true` for page≥2.
  - [ ] `FeedFilter` exhaustive `never` check passes typecheck.
- [ ] **Tests:**
  - [ ] `e2e/specs/tags/`: 9 specs, all pass at workers=1 AND workers=4.
  - [ ] `e2e/specs/search/`: 13 specs, all pass at workers=1 AND workers=4.
  - [ ] All 14 new Bruno `.bru` files pass against a running server with seed loaded.
  - [ ] `npm run test:coverage` passes at thresholds defined in `.coverage-thresholds.json` (100% on every modified file).
  - [ ] `npm test` passes.
- [ ] **CI gates:**
  - [ ] 3 consecutive green CI runs on the PR branch before merge.
  - [ ] `bruno-regression` workflow passes (lint-guard + suite).
- [ ] **PR / process:**
  - [ ] PR description states the green-run counter (N/14) and explains why this PR is NOT flipping the workflow to blocking.
  - [ ] Tracking issue #43 updated: status of issue #4 set to "merged"; spec counts filled in.
  - [ ] **`/self-reflect` run before PR creation; knowledge-base updates committed atomically with the implementation** (per CLAUDE.md §Pre-PR Knowledge Capture).

---

## Risks & mitigations

| Risk                                                                                      | Mitigation                                                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pagination semantics ambiguous against existing tsvector + trigram fallback               | Pinned: tsvector path is canonical for non-fuzzy; trigram top-up only on page=1; `totalPages` reflects primary path only. Server clamps `page > totalPages` to last page.                                          |
| AI-search rate-limit consumed per page                                                    | Pinned: AI resolution only on page=1; resolved filters encoded in URL; page≥2 ignores `ai=true` server-side.                                                                                                       |
| `aiResolvedFilters` URL rewrite confuses the user (URL changes after first AI response)   | Acceptable UX trade-off — the rewritten URL is meaningful and shareable; the user sees the filter chips that AI added. Documented in the search store JSDoc.                                                       |
| Cross-spec contention on shared tag rows in subscribe specs                               | Distinct seeded popular tags per spec (typescript / python / langchain / svelte). PK on `user_tag_subscriptions` makes per-(user,tag) row updates conflict-free. Reset fixture zeroes testuser subs between specs. |
| Seed change breaks unrelated tests                                                        | New posts owned by NEW seeded user `paginationuser`, NOT testuser. No existing test asserts `paginationuser` post count. New tag `tag-pagination-fixture` is unique.                                               |
| `since=today` ambiguous between rolling 24h vs calendar day                               | Pinned as rolling 24h; documented in route JSDoc. UI chip label "Today" is informal; URL token is the contract.                                                                                                    |
| `FeedFilter` extension breaks downstream clients                                          | Server zod validator updated; client switch ladders use `never` exhaustiveness check; failing-compile semantics catch regressions. Bruno covers the new value AND a `?filter=invalid` 400 case.                    |
| `<RouterLink>` change on `PostMetaHeader` breaks existing `post-tag-chip-${tag}` selector | Selector is unchanged — testid moved from `<span>` to the rendered `<a>` element.                                                                                                                                  |
| Author display-name collisions return posts from multiple authors                         | Acceptable — no display-name editing or uniqueness today. Documented; spec uses display name `Alice` from seed where uniqueness holds.                                                                             |
| OFFSET DoS via `?page=999999999`                                                          | Schema caps `page` at 1000. `?page=1001` returns 400 (covered by Bruno).                                                                                                                                           |
| Long `?author=` strings burn parser cycles                                                | Schema caps at 100 chars (matches displayName ceiling).                                                                                                                                                            |
| `seed.sql` has no production guard (preexisting condition; not introduced here)           | This PR does NOT add a guard (out of scope; flagged for future amendment). The reset endpoint and `ENABLE_TEST_ROUTES` gate (foundation #44) prevent seed use in production.                                       |
| `recent-searches` Pinia state lost on full page reload                                    | Spec stays inside one page lifetime — does NOT exercise reload. Future amendment can move to localStorage if persistence-on-reload is needed.                                                                      |

---

## Adversarial review checklist (carried into Plan Review Gate)

- [ ] Mock LLM script for the AI-search spec is a NAMED key from the shared registry, not `default`.
- [ ] AI-search resolution runs on page=1 only; page≥2 server-side ignores `ai=true`.
- [ ] No spec relies on `recent searches` surviving a full-page reload.
- [ ] Cmd+K spec uses Playwright's `Mod` shorthand or branches on platform.
- [ ] Pagination fixture posts owned by `paginationuser`, NOT testuser.
- [ ] `since` fixture posts have explicit `created_at` set in seed.
- [ ] Subscribe specs use four distinct seeded tags (typescript, python, langchain, svelte).
- [ ] `<TagSubscribeButton>` testid is `subscribe-btn-${tag.name}` (scoped); state asserted via `aria-pressed`, not testid swap.
- [ ] All 14 new Bruno files contain verbatim `assert { res.status: eq <CODE> }` block.
- [ ] Author filter URL is `?author=<displayName>` (matches Q8).
- [ ] Date filter URL token is one of `today | 7d | 30d` (omitted = all); validator rejects all other values with 400.
- [ ] `page` validator: `min(1).max(1000)`; rejects 0 and 1001 with 400.
- [ ] `author` validator: `min(1).max(100)`; rejects empty with 400.
- [ ] `GET /api/tags/:name` has NO `preHandler` array; handler never references `request.user`.
- [ ] State-changing tag endpoints (`POST/DELETE /:id/subscribe`) retain `preHandler: [app.authenticate]`.
- [ ] Author-name click on `SearchResultItem` uses `event.stopPropagation()`.
- [ ] `<SearchPagination>` Prev disabled at page=1; Next disabled at page=totalPages; testids retained on disabled buttons.
- [ ] `<TagPage>` empty-posts state has `tag-page-empty` testid; 404 state has `tag-not-found` testid.
- [ ] Coverage hits 100% on every file in the diff per `.coverage-thresholds.json` (no carve-out).
- [ ] PR description states the green-run counter and explains the no-flip decision.
- [ ] `/self-reflect` run before PR creation; knowledge-base updates committed atomically.
- [ ] Spec atomicity: state-transition checks are split into separate specs; render checklists permitted as one spec.
- [ ] No spec is `test.fixme()` — every DoD item has a passing spec.

---

## Acceptance for this amendment

- [ ] All 5 design-review-gate agents (PM, Architect, Designer, Security, CTO) approve in round 2.
- [ ] Issue #49 body is updated to point at this amendment and reflect the new file scope and DoD.
- [ ] No change to the parent design (`2026-04-28-e2e-playwright-testing-design.md`); this amendment is additive and scoped to the #49 surface area.
