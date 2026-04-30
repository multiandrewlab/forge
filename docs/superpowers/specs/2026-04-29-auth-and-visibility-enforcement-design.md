# Auth + Visibility Enforcement on Read Endpoints — Design

**Date:** 2026-04-29
**Status:** Draft REV 3 (after design-review-gate iter 2 — Designer blockers incorporated)
**Closes:** [#62](https://github.com/multiandrewlab/forge/issues/62)
**Provenance:** Issue #62 was filed during the issue #47 E2E rollout. The DoD bullet "view: permission private hidden from non-owner" assumed visibility enforcement on `GET /api/posts/:id`, but enforcement does not exist. The audit during this brainstorm widened the scope to all read endpoints.

## Overview

Forge currently has read endpoints that (a) accept anonymous callers and (b) return private posts to non-owners. This design closes both gaps in one PR via a uniform auth + visibility model:

1. **Auth required on all read endpoints** (except `auth/`, `health`, OAuth callbacks, E2E test routes).
2. **403 on private-post-not-yours** for direct lookup endpoints (`GET /:id`, comments, revisions, files).
3. **Filter (not error)** for list endpoints (feed, WebSocket broadcasts) — non-owner private posts are silently omitted.

This is an architectural policy change (no public reads) plus a security fix (visibility filter on the feed and direct-lookup endpoints). All changes are server-side except for the e2e spec un-fixme.

## Decisions (adjudicated by user)

| #   | Decision                          | Choice                              |
| --- | --------------------------------- | ----------------------------------- |
| Q1  | Status code for private-not-yours | **403** (existence revealed)        |
| Q2  | Public reads allowed?             | **No** — auth required on all reads |
| Q3  | Scope of this PR                  | **Audit and fix all** in one PR     |

### Status-code matrix

| Caller state                                                     | Target                                    | Response                                                    |
| ---------------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------- |
| No / invalid token                                               | any read endpoint (except whitelist)      | **401** Unauthorized (existing `app.authenticate` behavior) |
| Valid token, post is private, you are NOT the owner              | direct lookup (`GET /:id`, sub-resources) | **403** Forbidden                                           |
| Valid token, post truly doesn't exist                            | direct lookup                             | **404** Not Found (unchanged)                               |
| Valid token, list endpoint, contains private posts you don't own | feed, WS broadcasts                       | **200** with private posts filtered out (no 403 per item)   |

## Audit results

### Endpoints requiring `app.authenticate` (10 routes currently public)

| #   | Route                               | Source                | Why                                      |
| --- | ----------------------------------- | --------------------- | ---------------------------------------- |
| 1   | `GET /api/posts/:id`                | `posts.ts:148`        | Direct lookup; original issue #62        |
| 2   | `GET /api/posts/:id/comments`       | `comments.ts:18`      | Comments inherit parent-post visibility  |
| 3   | `GET /api/posts/:id/revisions`      | `posts.ts:558`        | Revisions inherit parent-post visibility |
| 4   | `GET /api/posts/:id/revisions/:rev` | `posts.ts:571`        | Same                                     |
| 5   | `GET /api/posts/:id/files`          | `files.ts:123`        | Same                                     |
| 6   | `GET /api/posts/:id/files/:fileId`  | `files.ts:197`        | Same                                     |
| 7   | `GET /api/users/:id`                | `user-profiles.ts:18` | User profile metadata                    |
| 8   | `GET /api/tags`                     | `tags.ts:32`          | Tag list                                 |
| 9   | `GET /api/tags/popular`             | `tags.ts:46`          | Tag list (popular sort)                  |
| 10  | `GET /api/search`                   | `search.ts:13`        | Search results                           |

### Endpoints with missing visibility filter

| #   | Route                                                          | Source                             | Gap                                                                                                                                                               |
| --- | -------------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | `GET /api/posts` (feed)                                        | `posts.ts:112` + `feed.ts:130-140` | Already auth-required, but `feed.ts` filters only `is_draft`, not `visibility`. Returns ALL non-draft posts including others' private ones. Larger leak than #62. |
| B   | WebSocket `post:new` / `post:updated` events on `feed` channel | (see Architecture §3)              | Likely broadcasts events for private posts to all `feed` subscribers — needs verification + filter.                                                               |

### Endpoints with visibility filter that ARE OK

- `GET /api/search` — `search.ts:88,119,136` filter `visibility = 'public'`
- `GET /api/users/:id/posts` — `user-profiles.ts:39,47-48,115-116,209-210,245-246` filter `visibility = 'public' AND is_draft = false`

### Public routes that MUST remain open (whitelist)

- `GET /api/health` (operational)
- `POST /api/auth/{login,register,refresh,logout}`
- `GET /api/auth/google` + `link-google` + Google callbacks
- `POST /api/__test__/reset` (gated by `ENABLE_TEST_ROUTES`, not affected)

## Architecture

### 1. Auth-everywhere mechanism

**Per-route preHandler addition.** No global default-with-opt-out — explicit `{ preHandler: [app.authenticate] }` on each of the 10 currently-public routes. Rationale: explicit is easier to audit, reviewers can grep for `preHandler` to see the auth surface, and accidentally adding a new public route in the future is more visible than accidentally adding a public-by-default opt-in.

### 2. Visibility check for direct-lookup endpoints

After fetching the post (or its parent post for sub-resources), apply this gate:

```typescript
if (post.visibility === 'private' && post.author_id !== request.user.id) {
  return reply.status(403).send({ error: 'Forbidden' });
}
```

Sub-resource endpoints (comments, revisions, files) need to fetch the parent post first to check visibility — adds one extra DB lookup. Acceptable cost (these aren't hot paths).

### 3. Visibility filter for list endpoints

#### Feed (`GET /api/posts`)

In `feed.ts:130-140`, after the `is_draft` clause, add:

```typescript
// Visibility: callers see public posts AND their own private posts.
// `mine` filter does not need this clause (it already constrains to author).
if (filter !== 'mine') {
  const userParam = nextParam(userId);
  conditions.push(`(p.visibility = 'public' OR p.author_id = ${userParam})`);
}
```

#### WebSocket `feed`-channel broadcasts

Need to verify in `packages/server/src/plugins/websocket/handler.ts` whether `post:new` / `post:updated` events emitted on the `feed` channel are filtered by recipient. Two options:

- **Filter at broadcast time** — for each connected subscriber, skip the event if the post is private and the subscriber isn't the author. More work per event but accurate.
- **Filter at subscription** — only broadcast public-post events to `feed`; private-post events go to the per-post channel only (`post:<id>`). Simpler; private-post live updates only flow to authors who are explicitly subscribed.

This design picks **filter at broadcast time** for `post:new` (every connected user sees public posts in their feed; only the author sees their own private posts in real-time). Implementation detail for the plan.

### 4. UX layer

The fixme spec at `e2e/specs/posts/view-private-as-non-owner.spec.ts` currently asserts `getByText('Post not found')`. That string came from the e2e cancellation: when the API returned 200 (the leak), the page rendered the post normally. With the API now returning 403:

- The client's `usePosts.fetchPost` composable already maps non-2xx to `error.value` via `parseErrorMessage`. The view page should render an "access denied" state for 403 distinct from the missing-id 404 state.
- The `forbidden-page` testid already exists on `PostEditPage.vue:101` (conditional on `/forbidden/i.test(error)`). `PostViewPage.vue` should adopt the same pattern.

The e2e spec assertion changes from `getByText('Post not found')` to `posts.forbiddenPage.toBeVisible()`. This is a small client change to `PostViewPage.vue` — render a forbidden state when error is 403.

## Components and data flow

### Server changes

| File                                               | Change                                                                                                       |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `packages/server/src/routes/posts.ts:148-157`      | Add preHandler + visibility check                                                                            |
| `packages/server/src/routes/posts.ts:558-585`      | Add preHandler + parent-post visibility check on revisions list and detail                                   |
| `packages/server/src/routes/comments.ts:18-30`     | Add preHandler + parent-post visibility check                                                                |
| `packages/server/src/routes/files.ts:123-260`      | Add preHandler + parent-post visibility check on file list and detail                                        |
| `packages/server/src/routes/user-profiles.ts:18`   | Add preHandler                                                                                               |
| `packages/server/src/routes/tags.ts:32, 46`        | Add preHandler on `/` and `/popular`                                                                         |
| `packages/server/src/routes/search.ts:13`          | Add preHandler                                                                                               |
| `packages/server/src/db/queries/feed.ts:130-140`   | Add visibility clause                                                                                        |
| `packages/server/src/plugins/websocket/handler.ts` | Filter `post:new` / `post:updated` broadcasts on `feed` channel by recipient (TBD precise mechanism in plan) |

### Client changes

| File                                                | Change                                                                                         |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `packages/client/src/pages/PostViewPage.vue`        | Render `forbidden-page` testid when error matches `/forbidden/i` (mirror PostEditPage pattern) |
| `e2e/specs/posts/view-private-as-non-owner.spec.ts` | Un-fixme; update assertion to `forbidden-page` testid                                          |

### Test changes

- **Vitest unit tests** (5+ new): cover the visibility branch on each affected route. Pattern: mock authenticated request, mock private post owned by another user, expect 403.
- **Bruno specs**:
  - New: alice-as-non-owner gets 403 on carol's `c…0006` private post
  - New: alice-as-non-owner gets 403 on `GET /api/posts/c…0006/comments`
  - New: alice-as-non-owner gets 403 on revisions/files routes
  - Existing Bruno collection's `bruno/collection.bru` `script:pre-request` already populates `accessToken` for authenticated calls — no bootstrap changes needed
  - Audit pass: any Bruno test currently relying on anonymous reads will need the auth header (most likely none, since the collection's pre-request is already universal)
- **E2E**: re-enable the one fixme spec with assertion update (1 file, ~5-line change)

## Edge cases

| Scenario                                                                                                            | Behavior                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| User logs out (token expires), reads a public post                                                                  | 401 (token required); user must re-login                                                                                                                                                |
| Author views their own private post                                                                                 | 200 (authorization passes)                                                                                                                                                              |
| Author views their own private post's comments / revisions / files                                                  | 200                                                                                                                                                                                     |
| Non-owner views public post                                                                                         | 200 (visibility=public always allowed)                                                                                                                                                  |
| Non-owner views public post that has been forked from a private post (`forked_from_id` references a private source) | 200 — fork is public; we do not chase the source's visibility for the response. (Source-link UI may show "Forked from <private post>" — already permitted per existing fork semantics.) |
| Non-owner views a comment whose `post_id` is private                                                                | 403                                                                                                                                                                                     |
| Public post is deleted (`deleted_at` set)                                                                           | 404 (existing behavior, unchanged)                                                                                                                                                      |
| Search query that would return private posts                                                                        | Already filtered to `visibility = 'public'`; private posts never appear in results regardless of caller                                                                                 |
| Tag detail page shows post counts that include private posts                                                        | Out of scope — tag `post_count` is a pre-computed trigger field. Aggregate count is acceptable to leak (counts only, no contents). May open separate enhancement issue.                 |
| WebSocket `post:new` event for a private post                                                                       | Only broadcast to the author's connections; not to general `feed` subscribers                                                                                                           |
| WebSocket `presence:update` events on a private post's `post:<id>` channel                                          | Channel subscription requires fetch-then-subscribe — visibility check happens on fetch, so non-owners can't subscribe; presence events naturally don't reach them                       |

## Out of scope

- **Tag post_count visibility** — counts-only leak; not addressed in this PR
- **Audit log** — no logging changes; existing audit log behavior unchanged
- **Rate limiting** — no rate-limit changes
- **Front-end UX overhaul** — only the minimal `forbidden-page` testid + state on `PostViewPage` is added; full forbidden-state design (e.g., "Request access" CTA) is deferred
- **Migration of existing private posts** — no data migration; visibility is already a column
- **Performance review** — adding an extra DB lookup on sub-resource endpoints (parent-post visibility check) is acceptable; no benchmarking planned

## Risks and mitigations

| Risk                                                                                     | Mitigation                                                                                                                                                            |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Adding `app.authenticate` to a route breaks an existing client that calls it anonymously | The Vue app already requires login for the AppLayout; all API calls from the app go from authenticated contexts. Audit Bruno tests for anonymous calls (likely none). |
| The feed visibility clause changes query plan / performance                              | The `posts` table has indexes on `visibility` and `author_id`. The new clause uses both; query plans should remain efficient. Manual EXPLAIN check during validation. |
| WebSocket broadcast filter has perf cost (per-recipient check)                           | Acceptable: post:new events are infrequent; the filter is a simple author_id comparison.                                                                              |
| Existing E2E suite breaks because some specs hit previously-public reads anonymously     | All existing specs use authenticated fixtures (`testuser`, `alice`, `carol`); none hit anonymous reads. Manual audit during validation.                               |
| Bruno regression breaks because some specs hit previously-public reads anonymously       | Audit during plan; likely no breakage since the collection's pre-request hook populates `accessToken` for all requests.                                               |
| Status-code change from leak-200 to 403 breaks the e2e fixme spec's assertion            | The spec is currently `test.fixme`; the un-fixme step also updates the assertion, both in one commit.                                                                 |
| Missing route in audit                                                                   | Cross-check by grepping for routes without `preHandler: [app.authenticate]` after the change.                                                                         |

## Acceptance criteria for the design

- [x] All 10 currently-public read routes identified
- [x] All visibility-leak gaps in queries identified (feed, WebSocket)
- [x] Status-code matrix specified (401/403/404)
- [x] Whitelist of public-by-design routes defined
- [x] Direct-lookup vs list policy specified (403 vs filter-silently)
- [x] Edge cases enumerated
- [x] Out-of-scope items called out (tag count, full UX)
- [x] Risks + mitigations captured
- [x] Test surface defined (vitest, bruno, e2e)

---

## REV 2 amendments (design-review-gate iteration 1)

Round 1 verdict: PM/Architect/CTO APPROVED; Designer/Security NEEDS_REVISION (6 blockers). REV 2 incorporates blockers + key suggestions. Numbered sections below SUPERSEDE the corresponding sections above where they conflict.

### Audit additions (Security blockers #1, #2)

The following routes were missed in the original audit and are now in scope:

| #   | Route                                       | Source                          | Action                                                                                                                                                                                                                                                                                                   |
| --- | ------------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6b  | `GET /api/posts/:id/files/:fileId`          | `files.ts:197-262`              | Already in audit row #6, but **also has an optional-auth block at `files.ts:216-244`** that becomes dead code after `preHandler: [app.authenticate]`. Plan must DELETE the optional-auth block, not just guard it.                                                                                       |
| C   | `POST /api/posts/:id/refresh-preview`       | `posts.ts:250`                  | Auth-required but **does not check ownership** before issuing outbound HTTP fetch on the post URL. Non-owner can trigger SSRF on a private post's URL (existence + URL leak). Add ownership check: `if (post.author_id !== request.user.id) return reply.status(403)`.                                   |
| D   | `findFeedPosts` with `filter: 'bookmarked'` | `bookmarks.ts:35` → `feed.ts`   | The new feed visibility clause (`(visibility = 'public' OR author_id = $userId)`) MUST also apply to the `bookmarked` filter branch — if a user bookmarked a post that later went private and they're not the owner, the bookmarks list silently filters it (same "filter, don't error" policy as feed). |
| E   | WebSocket `/ws` handshake auth              | `plugins/websocket/index.ts:47` | The handshake itself must be authenticated. Without recipient identity per socket, the broadcast-time visibility filter is impossible to implement correctly. Plan must verify `connections.ts` stores `userId` per socket; if not, that's a prerequisite step.                                          |

### JWT hardening (Security blockers #3, #4)

Add to scope of this PR (server config, in `packages/server/src/app.ts`):

1. **Pin JWT verify algorithm.** Change `app.register(jwt, { secret: ... })` to:

   ```typescript
   app.register(jwt, {
     secret: process.env.JWT_SECRET ?? 'dev-secret-change-in-production',
     verify: { algorithms: ['HS256'] },
   });
   ```

   Closes algorithm-confusion class of attacks.

2. **Fail-fast on missing JWT secret in non-test envs.** Add to `app.ts` startup:
   ```typescript
   if (process.env.NODE_ENV !== 'test' && !process.env.JWT_SECRET) {
     throw new Error('JWT_SECRET environment variable is required outside test environments');
   }
   ```
   Both are co-located in the same file edit; trivial to land in this PR.

### Visibility helper (Architect + CTO suggestion)

Replace the inline 6-route copy-paste check with a single helper at `packages/server/src/lib/visibility.ts`:

```typescript
import type { FastifyReply } from 'fastify';
import type { PostRow } from '../db/queries/types.js';

/**
 * Enforce read-visibility on a post for the calling user.
 * Returns true if the caller is allowed to read; sends 403 + returns false otherwise.
 */
export function assertCanReadPost(
  post: Pick<PostRow, 'visibility' | 'author_id'>,
  callerId: string,
  reply: FastifyReply,
): boolean {
  if (post.visibility === 'private' && post.author_id !== callerId) {
    reply.status(403).send({ error: 'This post is private' });
    return false;
  }
  return true;
}
```

Used by `posts.ts`, `comments.ts`, `files.ts`, `posts.ts` (revisions endpoints). One unit test covers all routes' visibility branch via this helper.

### 403 message text (Designer blocker #1)

Standard 403 body: `{ error: 'This post is private' }` — descriptive, matches existing 403 patterns elsewhere (`'Cannot fork a private post'`, `'Only the author can refresh the link preview'`). Bare `'Forbidden'` is rejected.

The frontend's existing regex `/forbidden/i.test(error)` becomes `/private|forbidden/i` — safer fallback. The rendered `{{ error }}` shows the descriptive text.

### Client-side forbidden states (Designer blocker #2)

Add to client changes:

| File                                            | Change                                                                                                                                              |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/client/src/pages/PostViewPage.vue`    | Render `forbidden-page` testid + descriptive message when error matches `/private\|forbidden/i` (mirror PostEditPage:101 pattern)                   |
| `packages/client/src/pages/PostHistoryPage.vue` | **Currently has no error UI at all.** Add an `error` v-if block + `forbidden-page` testid + descriptive message when revisions endpoint returns 403 |

### Database index (Architect suggestion)

Add migration `packages/server/src/db/migrations/00X-add-posts-visibility-author-index.sql`:

```sql
CREATE INDEX IF NOT EXISTS idx_posts_visibility_author ON posts(visibility, author_id) WHERE deleted_at IS NULL;
```

Supports the new feed visibility clause `(p.visibility = 'public' OR p.author_id = $userId)` efficiently. Existing `idx_posts_author_id` is preserved.

### Sub-resource parent fetch (Architect suggestion)

Comments/revisions/files endpoints already call `findPostById` (or equivalent) at the top of their handlers — there is no NEW DB lookup. The visibility check reuses the row already in scope. The plan must explicitly state "reuse existing parent-post fetch; do not add a query" so reviewers don't re-litigate.

### Coverage matrix (CTO suggestion #2)

Plan must include a 6×4 coverage matrix:

| Route                     | public-post-non-owner | private-post-owner | private-post-non-owner | missing-token |
| ------------------------- | --------------------- | ------------------ | ---------------------- | ------------- |
| `GET /:id`                | 200                   | 200                | 403                    | 401           |
| `GET /:id/comments`       | 200                   | 200                | 403                    | 401           |
| `GET /:id/revisions`      | 200                   | 200                | 403                    | 401           |
| `GET /:id/revisions/:rev` | 200                   | 200                | 403                    | 401           |
| `GET /:id/files`          | 200                   | 200                | 403                    | 401           |
| `GET /:id/files/:fileId`  | 200                   | 200                | 403                    | 401           |

Vitest: 24 unit tests minimum (one per cell). Bruno: at least 1 negative spec per route (private-non-owner → 403).

### WebSocket broadcast filter mechanism (CTO suggestion #3)

Plan-time decision: read `packages/server/src/plugins/websocket/handler.ts` and pick:

- **Per-recipient filter** — for each connected `feed` subscriber, skip event if `post.visibility === 'private' && post.author_id !== subscriberUserId`.
- **Channel split** — only broadcast public-post events on `feed`; private-post events go to `post:<id>` only.

If `connections.ts` already tracks `userId` per socket, prefer per-recipient. Otherwise prefer channel-split (cheaper, no socket-state addition).

### Forbidden-state UX text (Designer suggestion + PM suggestion)

User-visible string for the forbidden state: **"This post is private. The owner has not shared it with you."**

Renders consistently on `PostViewPage` and `PostHistoryPage`. The `forbidden-page` testid is the e2e anchor; the visible text is the user-facing affordance.

### Bruno coverage minimum (CTO suggestion #4)

New Bruno specs (4 negative + 1 positive):

1. `bruno/posts/get-private-post-as-non-owner.bru` — alice GETs carol's `c…0006` → 403
2. `bruno/posts/get-private-post-comments-as-non-owner.bru` — same → 403
3. `bruno/posts/get-private-post-revisions-as-non-owner.bru` — same → 403
4. `bruno/posts/get-private-post-files-as-non-owner.bru` — same → 403
5. `bruno/posts/get-private-post-as-owner.bru` (positive) — carol GETs own → 200

### CI grep guard (Security suggestion)

Add a CI step (or pre-commit hook) that greps every `app.get/post/patch/delete/put` call NOT in the public-route whitelist for `preHandler: [app.authenticate]`. Fails CI if a new route lands without auth.

This is **deferred to a follow-up issue** unless trivial to add in this PR (TBD by plan).

### Updated risk row

| Risk                                                                               | Mitigation                                                                                                  |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `forked_from_id` references private source post → UUID leak in fork's GET response | Acceptable — UUID is opaque; no traversal possible (the source GET will 403). Documented; no change needed. |
| Tag `post_count` includes private posts → count-only enumeration                   | Acceptable per Q3 brainstorm. Not in this PR. Tracked at follow-up issue (TBD).                             |
| Bookmarks-list user lost access to a previously-bookmarked post                    | Now covered by audit row D — feed visibility clause applies via `findFeedPosts({filter: 'bookmarked'})`.    |
| MinIO signed-URL TTL/scope                                                         | Out of scope but verified during plan; signed URLs have TTL by design.                                      |
| `post:deleted` WebSocket event references unknown ID for non-owner subscribers     | Acceptable — UUID-only is opaque; no leak. Documented.                                                      |

### Updated acceptance criteria

- [x] All audit-additions captured (`files.ts:197` optional-auth block, `refresh-preview` ownership, bookmarks visibility, WS handshake auth)
- [x] JWT hardening in scope
- [x] Visibility helper specified
- [x] 403 message text + frontend regex updated
- [x] PostHistoryPage forbidden UI added to client changes
- [x] Database index migration added
- [x] Coverage matrix specified (6×4 = 24 unit tests minimum)
- [x] WebSocket broadcast mechanism decision deferred to plan with explicit selection rule

---

## REV 3 amendments (design-review-gate iteration 2 — Designer blockers)

Iter 2 verdict: PM/Architect/Security/CTO APPROVED. Designer NEEDS_REVISION on 3 blockers. REV 3 sections below SUPERSEDE conflicting REV 2 / base content.

### 1. Existing `'Forbidden'` strings updated for consistency (Designer blocker #1)

The codebase has 5 existing bare `{ error: 'Forbidden' }` returns in `posts.ts` (lines 169, 208, 227, 381, 610). REV 2's "matches existing patterns" claim was wrong — there is NO consistent pattern; some 403s are bare, some descriptive.

**REV 3 decision: update all 5 existing bare strings to descriptive ones in this PR.** Co-located change; trivial; eliminates inconsistency permanently.

| Line                                              | Current       | New                                                  |
| ------------------------------------------------- | ------------- | ---------------------------------------------------- |
| `posts.ts:169` (PATCH /:id)                       | `'Forbidden'` | `'You can only edit your own posts'`                 |
| `posts.ts:208` (DELETE /:id)                      | `'Forbidden'` | `'You can only delete your own posts'`               |
| `posts.ts:227` (POST /:id/publish)                | `'Forbidden'` | `'You can only publish your own posts'`              |
| `posts.ts:381` (POST /:id/revisions)              | `'Forbidden'` | `'You can only add revisions to your own posts'`     |
| `posts.ts:610` (POST /:id/revisions/:rev/restore) | `'Forbidden'` | `'You can only restore revisions on your own posts'` |

Plus the new visibility helper's 403 from REV 2: `'This post is private'`.

After this change, all 403 responses in the codebase carry actionable strings.

### 2. Frontend forbidden detection by status code, not message text (Designer blocker #2)

REV 2 specified `/private|forbidden/i.test(error)` regex matching. Designer correctly flagged this as fragile (i18n-hostile, false positives on future "private" errors).

**REV 3 decision: surface HTTP status from the composable; gate forbidden state on `error.status === 403`.**

Two-step change:

#### 2a. Update `packages/client/src/composables/usePosts.ts`

Replace `error: Ref<string | null>` with a structured shape. Add an `errorStatus: Ref<number | null>` ref alongside, populated via `response.status` in the catch path of `fetchPost`/`fetchPostHistory`/etc. (Or replace the existing `error` with an object `{ message, status }`. Plan picks the less-invasive option — a separate `errorStatus` ref preserves the existing `error.value` string for backwards compatibility with components that show it.)

```typescript
const errorStatus = ref<number | null>(null);

async function fetchPost(id: string): Promise<void> {
  error.value = null;
  errorStatus.value = null;
  try {
    const response = await apiFetch(`/api/posts/${id}`);
    if (!response.ok) {
      errorStatus.value = response.status;
      error.value = await parseErrorMessage(response, 'Failed to fetch post');
      return;
    }
    // ...
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to fetch post';
  }
}
```

Export `errorStatus` from the composable's return.

#### 2b. PostViewPage / PostHistoryPage forbidden state

```vue
<div v-if="errorStatus === 403" data-testid="forbidden-page" class="...">
  <h2>This post is private</h2>
  <p>{{ error || "The owner has not shared it with you." }}</p>
</div>
<div v-else-if="error" class="...">{{ error }}</div>
```

i18n-friendly + future-proof.

### 3. Client route entry-point audit (Designer blocker #3)

Designer asked: which client routes hit the 6 audited endpoints, and does each render `forbidden-page`?

**REV 3 audit result:**

| Client route                            | Server endpoints called                                                                                   | Forbidden-state component                                                                |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `/posts/:id`                            | `GET /:id`, `GET /:id/comments`, `GET /:id/files` (inline), `GET /:id/files/:fileId` (signed-URL fetches) | `PostViewPage.vue` (REV 2 §"Client-side forbidden states")                               |
| `/posts/:id/edit`                       | `GET /:id`, `PATCH /:id`, etc.                                                                            | `PostEditPage.vue:101` already has `forbidden-page` testid (existing pattern, unchanged) |
| `/posts/:id/history`                    | `GET /:id/revisions`, `GET /:id/revisions/:rev`                                                           | `PostHistoryPage.vue` (REV 2 — error UI added)                                           |
| `/posts/:id/files/<fileId>`             | n/a — files are NOT a Vue route; they're served via signed URLs                                           | Page-level forbidden state on the calling page handles                                   |
| `/posts/:id#comment-<id>` (hash anchor) | n/a — hash anchors are within `PostViewPage`                                                              | PostViewPage's forbidden state covers                                                    |

**Conclusion: the three pages (PostViewPage, PostEditPage, PostHistoryPage) are the ONLY client entry points to the 6 audited endpoints.** PostEditPage already has the pattern; PostViewPage and PostHistoryPage are the changes in this PR. No deep-link route gaps.

For the sub-resource endpoints (`/comments`, `/revisions`, `/files`): they're called from WITHIN the three pages. The page-level `GET /:id` 403 short-circuits the page render BEFORE those sub-fetches fire (the existing `v-if` / loading state on currentPost gates the children). So sub-resource 403s never reach the user as a separate UX state — the page-level forbidden state is the only state.

Plan-time verification: confirm that `PostViewPage`'s `onMounted` order is `fetchPost → fetchComments / fetchFiles` and that the post-fetch 403 prevents the children from firing. If not (race condition possible), the design holds either way because EVERY child also gets a 403 and we'd render the same forbidden state for the first one to land.

### REV 3 acceptance criteria

- [x] 5 bare `'Forbidden'` strings updated to descriptive (server-side consistency)
- [x] Frontend forbidden detection switched to HTTP status code (`error.status === 403`) — i18n-friendly
- [x] Client entry-point audit: 3 Vue routes (PostView, PostEdit, PostHistory) are the only entry points to the 6 audited endpoints; sub-resource gaps are covered by page-level forbidden state
- [x] Composable change: `errorStatus` ref added to `usePosts`
