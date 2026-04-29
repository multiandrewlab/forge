# Auth + Visibility Enforcement on Read Endpoints — Design

**Date:** 2026-04-29
**Status:** Draft (pre-design-review-gate)
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
