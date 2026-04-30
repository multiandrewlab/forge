# E2E Comments + Voting + Bookmarks Specs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver Playwright specs covering `comments/`, `voting/`, `bookmarks/` per Issue #48, completing rollout phase 3/9.

**Architecture:** TDD per spec — write spec, run, watch fail, add testid + selector entry (or small UI wiring), run, watch pass, commit. Selector shards extend the empty stubs in `e2e/fixtures/selectors/{comments,voting,bookmarks}.ts` (currently shipping as 1-key placeholders from #45). Specs use seeded fixture rows for read-only assertions and create their own ephemeral rows for mutating assertions, mirroring the `createdPostId` discipline from #47.

**Tech Stack:** Playwright @ workspace `e2e/`, Vue 3 + Vite client, Fastify server (mock LLM provider + `__test__/reset` endpoint already shipped), PostgreSQL 16, Pinia store + websocket broadcasts for comments/votes.

**Source design:** `docs/superpowers/specs/2026-04-28-e2e-playwright-testing-design.md` — Coverage matrix rows `comments/`, `voting/`, `bookmarks/`.

**Branch:** `feat/e2e-comments-voting-bookmarks` (already created from `main`).

**Predecessor:** `docs/superpowers/plans/2026-04-29-issue-47-e2e-posts-revisions.md` (PR #68 merged 2026-04-29).

---

## REV 2 changes vs. REV 1 (from plan-review-gate iteration 1)

Iteration 1 returned PASS for Scope & Alignment, FAIL for Feasibility (4 blocking) and Completeness (4 blocking). REV 2 incorporates:

| Concern (gate finding)                                                                                                                                                | REV 2 fix                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wrong npm script — `npm --prefix e2e run e2e` does not exist                                                                                                          | All "Run" steps now use `npm run e2e -- specs/...` from the repo root (root `package.json:23` defines `"e2e": "npm run test --workspace=@forge/e2e"`; CI uses this exact form per `.github/workflows/e2e-playwright.yml`).                                                                                                                                                                                                                                                                              |
| Seeded fixture mismatch — `c0…99` (testpost) is testuser-OWNED but the seeded vote and bookmark on it are from alice (`a0…01`), not testuser                          | Seed fixtures table corrected. Spec 3.3 (`page-list`) now creates a testuser bookmark via API as part of arrange, then asserts list of 1. Spec 3.4 (`page-empty-state`) trivially asserts empty state from the un-bookmarked default — no toggle setup needed.                                                                                                                                                                                                                                          |
| Feed-card selectors `:has(a[href*="${postId}"])` target a non-existent anchor — PostListItem uses programmatic `router.push`, not an `<a href="posts/...">`           | Step 0.3 adds a separate `:data-post-id="post.id"` attribute alongside the existing static `data-testid="post-list-item"` on the card root. Compound selector `[data-testid="post-list-item"][data-post-id="${postId}"]` provides per-card scoping while preserving every existing `getByTestId('post-list-item')` callsite in #47/#68. (REV 2.1: original REV 2 used two `data-testid` attributes on the same element; Vue's SFC compiler silently drops one — switched to a separate attribute name.) |
| Spec 1.8 destructured `revisionId` from `post`; server returns `{ post, revision }` as separate fields                                                                | Spec 1.8 destructure rewritten as `const { post: { id: postId }, revision: { id: revisionId } } = ...`. The conditional fallback dropped.                                                                                                                                                                                                                                                                                                                                                               |
| Inline-comment testid `inline-comment-indicator-line-{N}` diverged from issue's prescribed `diff-line-{lineNumber}` without justification                             | Plan now explicitly explains the divergence: `diff-line-{lineNumber}` is for the revision-diff renderer (which is OOS for #48 per the issue body's "Out of scope" list — issue #2/#47 territory). The post-view path uses PostDetail's own line-number-keyed indicator. The spirit of the issue's guidance ("testid scheme should accommodate line numbers so specs can target lines deterministically") is met by line-number-keyed testids; the prefix differs because the rendering surface differs. |
| Spec 2.4 framed already-voted as success-path idempotent toggle without explicit reinterpretation language; issue body says "error path: already-voted (idempotency)" | Plan now formally reinterprets: the vote endpoint at `routes/votes.ts:9-39` is genuinely idempotent (same value toggles off, no 4xx returned). There is no error-path to test; the toggle-off behavior IS the idempotency contract. The issue body's `__test__/reset` mid-spec / `test.describe.serial` advice was conditional on the existence of an error path — since none exists, neither pattern is needed. Reinterpretation flagged in PR body for reviewer adjudication.                         |
| False precedent claim — plan claimed "matching #47's precedent of 7 `fixme` specs in a 40-spec WU" but no `test.fixme` actually exists in the corpus                  | Claim removed. Defense for fixme-counting now rests on the issue's own language: the issue body explicitly anticipates these two specs as either skip-with-note (mention notifications) or conditional ("if backend enforces" — edit-window). Both fixme'd specs activate the moment the backend feature lands; counting them honors the issue's anticipated coverage.                                                                                                                                  |
| Step 4.10 (Pre-PR `/self-reflect`) was numbered AFTER Step 4.9 (PR open) — contradicts CLAUDE.md "Pre-PR Knowledge Capture" mandate                                   | Steps 4.9 ↔ 4.10 swapped. `/self-reflect` is now Step 4.9 and PR open is Step 4.10, matching the body text and CLAUDE.md ordering.                                                                                                                                                                                                                                                                                                                                                                      |

---

## Spec count reconciliation

Issue #48 DoD calls out: comments ~14 (band 12–16), voting ~7, bookmarks ~5. Plan delivers:

| Folder        | Specs                                                      | Within band?     |
| ------------- | ---------------------------------------------------------- | ---------------- |
| `comments/`   | 14 (12 active + 2 `test.fixme` for unimplemented features) | ✅ 14 = midpoint |
| `voting/`     | 7                                                          | ✅ exact         |
| `bookmarks/`  | 5                                                          | ✅ exact         |
| **Total new** | **26**                                                     |                  |

Two `comments/` specs ship as `test.fixme` per the issue's "skip with note" directive (mention notifications) and the issue's conditional "if backend enforces" wording for the edit-window:

- `comment-edit-window-enforcement.spec.ts` — server-side `PATCH /:id/comments/:cid` (`packages/server/src/routes/comments.ts:96`) has no time gate; the spec is written as `test.fixme` so it activates the moment the gate lands.
- `comment-mention-notifications.spec.ts` — no mention infrastructure exists in `routes/comments.ts` or `services/`; spec is `test.fixme` with the same activation contract.

`fixme` specs count toward the spec total because the issue body itself anticipates both behaviors (one as "skip with note", one as conditional on backend enforcement). They activate the moment the corresponding feature ships, providing forward-coverage without padding the active count beyond the band's lower bound (12 active = floor of 12–16).

---

## File Structure

### Create — specs

```
e2e/specs/comments/
├── create-top-level.spec.ts                            (Task 1.1)
├── edit-own.spec.ts                                    (Task 1.2)
├── delete-own.spec.ts                                  (Task 1.3)
├── cannot-edit-others.spec.ts                          (Task 1.4)
├── cannot-delete-others.spec.ts                        (Task 1.5)
├── reply-to-comment.spec.ts                            (Task 1.6)
├── nested-reply-three-levels.spec.ts                   (Task 1.7)
├── inline-on-revision-line.spec.ts                     (Task 1.8)
├── empty-state.spec.ts                                 (Task 1.9)
├── on-deleted-post-cascade.spec.ts                     (Task 1.10)
├── input-clears-after-submit.spec.ts                   (Task 1.11)
├── realtime-broadcast.spec.ts                          (Task 1.12)
├── edit-window-enforcement.spec.ts        (FIXME)      (Task 1.13)
└── mention-notifications.spec.ts          (FIXME)      (Task 1.14)

e2e/specs/voting/
├── upvote.spec.ts                                      (Task 2.1)
├── downvote.spec.ts                                    (Task 2.2)
├── switch-up-to-down.spec.ts                           (Task 2.3)
├── remove-by-clicking-again.spec.ts                    (Task 2.4)
├── score-in-feed.spec.ts                               (Task 2.5)
├── score-in-post-view.spec.ts                          (Task 2.6)
└── must-be-authenticated.spec.ts                       (Task 2.7)

e2e/specs/bookmarks/
├── toggle-on-post-view.spec.ts                         (Task 3.1)
├── toggle-on-feed-card.spec.ts                         (Task 3.2)
├── page-list.spec.ts                                   (Task 3.3)
├── page-empty-state.spec.ts                            (Task 3.4)
└── persists-across-sessions.spec.ts                    (Task 3.5)
```

### Modify — selector shards (already exist as placeholders)

```
e2e/fixtures/selectors/comments.ts        (extend — 3 keys → ~10 keys)
e2e/fixtures/selectors/voting.ts          (extend — 2 keys → ~5 keys)
e2e/fixtures/selectors/bookmarks.ts       (extend — 2 keys → ~6 keys)
```

### Modify — client components (testid additions only; no behavior changes)

```
packages/client/src/components/post/PostActions.vue       (Task 0.2 — add downvote-btn testid)
packages/client/src/components/post/PostListItem.vue      (Task 0.3 — add post-list-item-vote-score + post-list-item-bookmark-toggle-btn + bookmark UI)
packages/client/src/components/post/PostList.vue          (Task 0.4 — add empty-state testid)
packages/client/src/components/post/CommentSection.vue    (Task 0.5 — add comment-section + comments-empty testids)
packages/client/src/components/post/CommentThread.vue     (Task 0.6 — add per-comment scoping testids: comment-item, comment-author)
packages/client/src/components/post/PostDetail.vue        (Task 0.7 — add inline-comment-indicator-line-{N} testid)
```

No server changes. No new pages. No new API endpoints. All changes are additive UI wiring + testids.

### Out of scope (per issue body, repeated here for reviewers)

- Server changes (no edit-window enforcement, no mention infrastructure additions).
- Tags / search / playground / files / AI / shell folder specs (issues #49–#53 territory).
- Revision-diff rendering (issue #2 / #47 territory; already shipped, not modified here).

---

## TDD pattern (used in every spec task below)

For each new spec:

1. **Write the failing spec** with selector references that may or may not exist yet.
2. **Run it.** Expect FAIL — typically `Error: Locator (…) resolved to 0 elements`.
3. **Resolve the failure** with the smallest possible change, in this priority order:
   - (a) Add the testid to the existing component if the rendered DOM lacks it.
   - (b) Add the selector key to the matching shard.
   - (c) Adapt the spec to a real, observable DOM signal (only if the testid would require behavior changes — never the case in this plan).
4. **Run again.** Expect PASS.
5. **Run with `workers=4`.** Expect PASS (catches accidental shared-state bleed).
6. **Commit** with a single-purpose message.

All specs:

- Import from `'../../fixtures/reset.js'` (re-exports `test` + `expect`; auto-applies the `__test__/reset` beforeEach hook).
- Use seeded users (`testuser`, `alice`, `carol`) by destructuring the matching Page fixture from the fixture object.
- Mint access tokens via `await testuser.request.post('/api/auth/refresh')` when the spec needs to call REST APIs as the user — same pattern as `e2e/specs/posts/edit-cancel-reverts.spec.ts:6-9` and the rest of the #47 corpus.
- Use `createdPostId` (capture from POST `/api/posts` response) for any spec that mutates state, to ensure isolation under `workers=4`.
- Never use `waitForTimeout` — use `expect.toHaveText`, `expect.toBeVisible`, or `page.clock` (only the fixme'd edit-window spec mentions `page.clock`, and that spec is skipped).
- Never use conditional assertions (no `if (visible) expect(...)`).

---

## Seeded fixtures referenced by specs

(All UUIDs from `scripts/seed.sql`, immutable across resets.)

| Symbol                  | UUID                                   | Notes                                                                                                                                                                                                                                  |
| ----------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `alice.id`              | `a0000000-0000-0000-0000-000000000001` | author of the cheatsheet snippet                                                                                                                                                                                                       |
| `bob.id`                | `a0000000-0000-0000-0000-000000000002` | non-fixture user; only addressed via author-display assertions                                                                                                                                                                         |
| `carol.id`              | `a0000000-0000-0000-0000-000000000003` | inline-comment author on cheatsheet                                                                                                                                                                                                    |
| `testuser.id`           | `a0000000-0000-0000-0000-000000000099` | primary fixture user                                                                                                                                                                                                                   |
| `cheatsheet.id`         | `c0000000-0000-0000-0000-000000000001` | alice's TS cheatsheet — has 3 seeded comments + 2 votes                                                                                                                                                                                |
| `cheatsheet-rev2.id`    | `d0000000-0000-0000-0000-000000000002` | revision 2; carries the seeded inline comment                                                                                                                                                                                          |
| `prompt.id`             | `c0000000-0000-0000-0000-000000000003` | bob's prompt — alice + carol upvoted; alice bookmarked                                                                                                                                                                                 |
| `linkpost.id`           | `c0000000-0000-0000-0000-000000000010` | carol's link post — bob upvoted; carol bookmarked                                                                                                                                                                                      |
| `testpost.id`           | `c0000000-0000-0000-0000-000000000099` | testuser-OWNED snippet (env `postId`). Has 1 vote (+1) and 1 bookmark — both from **alice** (`a0…01`), NOT testuser. testuser has 0 seeded votes and 0 seeded bookmarks anywhere. Has 1 testuser-authored top-level comment (`e0…99`). |
| `seeded-top-comment.id` | `e0000000-0000-0000-0000-000000000001` | bob's top-level on cheatsheet                                                                                                                                                                                                          |
| `seeded-reply.id`       | `e0000000-0000-0000-0000-000000000002` | alice's reply to ^                                                                                                                                                                                                                     |
| `seeded-inline.id`      | `e0000000-0000-0000-0000-000000000003` | carol's inline on cheatsheet rev2 line 2                                                                                                                                                                                               |

Critical implication for bookmark specs: **testuser's bookmarks page is empty by default** (testuser has zero seeded bookmarks). This makes the empty-state spec (3.4) trivial and shifts the page-list spec (3.3) onto API-arrange-then-assert. We do **not** add seed rows.

For empty-comments-state we still need a post with **zero** comments (the seeded `testpost` has the testuser-authored `e0…99` comment) — the cleanest approach is to have the spec create a fresh post via API, where the new post starts with zero comments and the assertion is unambiguous.

---

## Task 0: Foundation — selectors, testids, no-behavior UI changes

**Files:**

- Modify: `e2e/fixtures/selectors/comments.ts`
- Modify: `e2e/fixtures/selectors/voting.ts`
- Modify: `e2e/fixtures/selectors/bookmarks.ts`
- Modify: `packages/client/src/components/post/PostActions.vue`
- Modify: `packages/client/src/components/post/PostListItem.vue`
- Modify: `packages/client/src/components/post/PostList.vue`
- Modify: `packages/client/src/components/post/CommentSection.vue`
- Modify: `packages/client/src/components/post/CommentThread.vue`
- Modify: `packages/client/src/components/post/PostDetail.vue`

### Step 0.1: Verify pre-existing selectors

- [ ] Confirm placeholder shards exist (created in #45):

```bash
grep -E '^export const' e2e/fixtures/selectors/{comments,voting,bookmarks}.ts
```

Expected:

```
e2e/fixtures/selectors/comments.ts:export const comments = {
e2e/fixtures/selectors/voting.ts:export const voting = {
e2e/fixtures/selectors/bookmarks.ts:export const bookmarks = {
```

If any file is missing, halt — #45 didn't ship and the foundation is broken.

### Step 0.2: Add `downvote-btn` testid to `PostActions.vue`

Current state (`packages/client/src/components/post/PostActions.vue:18-29`): the downvote button has `aria-label="Downvote"` but **no testid**. Add one. No behavior change.

- [ ] Edit `packages/client/src/components/post/PostActions.vue` — locate the `<!-- Downvote -->` block, add `data-testid="downvote-btn"`:

```vue
<!-- Downvote -->
<button
  data-testid="downvote-btn"
  class="flex items-center gap-1 text-sm"
  :class="currentVote === -1 ? 'text-red-400' : 'text-gray-400'"
  aria-label="Downvote"
  @click="handleDownvote"
>
```

### Step 0.3: Add per-card vote score + bookmark toggle to `PostListItem.vue`

Current state (`PostListItem.vue:33-37`): the per-card vote count is rendered as `{{ post.voteCount }}` inside an unlabeled `<span>`. There is no per-card bookmark UI. Issue #48 DoD requires both:

- `score updates in feed view AND post-view` — the feed score must be E2E-targetable.
- `bookmark toggle on feed cards` — the toggle must exist on PostListItem.

Add testids; add a minimal bookmark button mirroring `PostActions.vue:30-61` (button + filled/outline icon + click handler that calls the existing `useBookmarks().toggleBookmark`).

- [ ] Modify `packages/client/src/components/post/PostListItem.vue`:
  - **Card root: keep the existing `data-testid="post-list-item"` UNCHANGED**, and add a separate `:data-post-id="post.id"` attribute (NOT another `data-testid`). Vue's compiler treats two `data-testid` attributes on the same element as duplicate keys and silently drops one — verified via SFC compile. Using a different attribute name (`data-post-id`) avoids the collision and preserves all existing `getByTestId('post-list-item')` callsites in #47/#68 specs and unit tests.
  - Add `data-testid="post-list-item-vote-score"` to the existing `<span>` wrapping `{{ post.voteCount }}` at line 33.
  - Append a new bookmark `<button>` after the fork-count span. Use `useBookmarks` (already a project composable). Stop click propagation so it doesn't navigate the card.

```vue
<!-- inserted after the fork-count span (line 47) -->
<button
  data-testid="post-list-item-bookmark-toggle-btn"
  class="flex items-center gap-1 text-xs"
  :class="isBookmarked ? 'text-yellow-400' : 'text-gray-500 hover:text-gray-300'"
  aria-label="Bookmark"
  @click.stop="handleBookmark"
>
  <svg
    v-if="isBookmarked"
    data-testid="post-list-item-bookmark-on-icon"
    class="h-3.5 w-3.5"
    viewBox="0 0 24 24"
    stroke="currentColor"
    fill="currentColor"
  >
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
      d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
  </svg>
  <svg v-else class="h-3.5 w-3.5" viewBox="0 0 24 24" stroke="currentColor" fill="none">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
      d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
  </svg>
</button>
```

- In the `<script setup>` section, add the bookmark wiring (mirrors `PostActions.vue:101-115`):

```ts
import { computed } from 'vue';
import { useFeedStore } from '../../stores/feed.js';
import { useBookmarks } from '../../composables/useBookmarks.js';

// existing imports preserved above

const feedStore = useFeedStore();
const { toggleBookmark } = useBookmarks();
const isBookmarked = computed(() => feedStore.userBookmarks[props.post.id] === true);
function handleBookmark(): void {
  toggleBookmark(props.post.id);
}
```

- Run `npm --prefix packages/client run test -- PostListItem` and confirm existing unit tests still pass (the file has unit-test coverage; an unmocked store import can break them — if so, add a `feedStore` mock in the affected test).

### Step 0.4: Add empty-state testid to `PostList.vue`

Current state (`PostList.vue:14-22`): the empty-state `<div>` has no testid. Issue #48 needs a deterministic selector for `bookmarks/page-empty-state.spec.ts`.

- [ ] Add `data-testid="empty-state"` to the empty-state container `<div>` and `data-testid="empty-state-message"` to the inner `<p>`:

```vue
<!-- Empty state -->
<div v-else-if="!loading && posts.length === 0" data-testid="empty-state" class="p-8 text-center">
  <p data-testid="empty-state-message" class="text-sm text-gray-400">{{ emptyMessage }}</p>
```

### Step 0.5: Add `comment-section` + `comments-empty` testids to `CommentSection.vue`

Current state (`CommentSection.vue:1-22`): no section root testid; the empty fallback `<p class="text-sm text-gray-500">No comments yet.</p>` is text-only.

- [ ] Modify `packages/client/src/components/post/CommentSection.vue`:

```vue
<template>
  <div data-testid="comment-section" class="flex flex-col gap-4">
    <h3 class="text-sm font-medium text-gray-400">Comments</h3>

    <!-- General comments (threaded) -->
    <div v-if="store.commentTree.length > 0" data-testid="comment-list" class="flex flex-col gap-2">
      <CommentThread
        v-for="node in store.commentTree"
        :key="node.id"
        :node="node"
        :post-id="postId"
        :current-user-id="currentUserId"
      />
    </div>
    <p v-else data-testid="comments-empty" class="text-sm text-gray-500">No comments yet.</p>
  </div>
</template>
```

(Stale comments + new-comment input blocks unchanged.)

### Step 0.6: Add per-comment scoping testids to `CommentThread.vue`

Current state (`CommentThread.vue:3-32`): existing testids `comment-body`, `reply-btn`, `edit-btn`, `delete-btn` are on element-level attributes that repeat across every rendered comment. The current `selectors/comments.ts` shard uses `.first()` to get one — fine for one-comment cases, but useless when a spec needs to assert on a specific comment among several.

Add a wrapper testid keyed by comment id, plus an author-display testid scoped per comment.

- [ ] Modify `packages/client/src/components/post/CommentThread.vue`:

```vue
<template>
  <div class="flex flex-col gap-1" :data-testid="`comment-${node.id}`">
    <div class="flex items-start gap-2 rounded p-2 hover:bg-surface-700">
      <div class="flex-1">
        <div class="flex items-center gap-2 text-xs text-gray-400">
          <RouterLink
            v-if="node.author"
            :to="{ name: 'user-profile', params: { id: node.author.id } }"
            class="font-medium text-gray-300"
            data-testid="comment-author"
          >
            {{ node.author.displayName }}
          </RouterLink>
          <span v-else class="font-medium text-gray-300" data-testid="comment-author"
            >Deleted user</span
          >
        </div>
      </div>
    </div>
  </div>
</template>
```

Keep the rest of the file unchanged. Note: `CommentThread` is recursive, so the wrapper testid emitted at every depth — `comment-{id}` is globally unique because comment ids are UUIDs.

### Step 0.7: Add inline comment indicator testid in `PostDetail.vue`

Current state (`PostDetail.vue:58-69`): the per-line "{N} comments on line {line}" indicator button has no testid.

**Note on testid naming:** The issue body's "Failure modes to watch for" suggests `data-testid="diff-line-{lineNumber}"` as the scheme. That scheme belongs to the **revision-diff renderer** (`RevisionDiffViewer.vue`), which is explicitly OUT OF SCOPE for #48 per the issue's "Out of scope" list ("revision-diff rendering — issue #2 territory"). The post-view path renders inline-comment indicators via `PostDetail.vue` directly (not via the diff viewer). The spirit of the issue's guidance — "the testid scheme should accommodate ... so specs can target lines deterministically" — is met by line-number-keyed testids; the prefix differs because the rendering surface differs. When `RevisionDiffViewer.vue` gets `diff-line-{N}` testids in a future issue, both schemes coexist.

- [ ] Modify `packages/client/src/components/post/PostDetail.vue`:

```vue
<!-- Inline comment indicators -->
<div v-for="[line, lineComments] in commentsStore.inlineComments" :key="line" class="mt-1">
  <button
    v-if="inlineCommentLine !== line"
    :data-testid="`inline-comment-indicator-line-${line}`"
    class="text-xs text-primary hover:underline"
    @click="inlineCommentLine = line"
  >
```

Also add an inline-input testid on the active-line input block at line 53:

```vue
<CommentInput
  data-testid="inline-comment-input-wrapper"
  placeholder="Add inline comment..."
  :show-cancel="true"
  @submit="handleInlineComment"
  @cancel="inlineCommentLine = null"
/>
```

(Note: `data-testid` on a child component renders to the root element of that component because Vue auto-attaches non-prop attrs. `CommentInput.vue`'s root is the `<form>` — confirm by inspecting; if the child swallows it via `inheritAttrs: false`, instead wrap with a `<div data-testid="inline-comment-input-wrapper">…</div>`.)

### Step 0.8: Extend `e2e/fixtures/selectors/comments.ts`

- [ ] Replace the placeholder with the full keyset:

```ts
import type { Page, Locator } from '@playwright/test';

export const comments = {
  // CommentSection root + empty state
  section: (page: Page): Locator => page.getByTestId('comment-section'),
  list: (page: Page): Locator => page.getByTestId('comment-list'),
  empty: (page: Page): Locator => page.getByTestId('comments-empty'),

  // CommentInput (top-level new-comment form, lives at the bottom of CommentSection)
  input: (page: Page): Locator => page.getByTestId('comment-input').first(),
  submit: (page: Page): Locator => page.getByTestId('comment-submit-btn').first(),

  // Per-comment thread item — pass UUID for uniqueness
  item: (page: Page, id: string): Locator => page.getByTestId(`comment-${id}`),
  // Within a specific item — body, author, action buttons
  bodyOf: (page: Page, id: string): Locator =>
    page.getByTestId(`comment-${id}`).getByTestId('comment-body').first(),
  authorOf: (page: Page, id: string): Locator =>
    page.getByTestId(`comment-${id}`).getByTestId('comment-author').first(),
  replyBtnOf: (page: Page, id: string): Locator =>
    page.getByTestId(`comment-${id}`).getByTestId('reply-btn').first(),
  editBtnOf: (page: Page, id: string): Locator =>
    page.getByTestId(`comment-${id}`).getByTestId('edit-btn').first(),
  deleteBtnOf: (page: Page, id: string): Locator =>
    page.getByTestId(`comment-${id}`).getByTestId('delete-btn').first(),

  // Inline-on-revision-line
  inlineIndicator: (page: Page, line: number): Locator =>
    page.getByTestId(`inline-comment-indicator-line-${line}`),
  inlineInputWrapper: (page: Page): Locator => page.getByTestId('inline-comment-input-wrapper'),
};
```

### Step 0.9: Extend `e2e/fixtures/selectors/voting.ts`

- [ ] Replace the placeholder:

```ts
import type { Page, Locator } from '@playwright/test';

export const voting = {
  // Post-view PostActions
  upvoteBtn: (page: Page): Locator => page.getByTestId('upvote-btn'),
  downvoteBtn: (page: Page): Locator => page.getByTestId('downvote-btn'),
  voteScore: (page: Page): Locator => page.getByTestId('vote-score'),

  // Feed PostListItem (per-card). Card root has data-testid="post-list-item"
  // (static, shared across all cards) and a separate `data-post-id="${id}"` (per-card).
  // Compound selector matches both attributes on the same element — `:has(a[href*=...])`
  // doesn't work because PostListItem.vue navigates programmatically (router.push), no <a>.
  feedScoreOnCard: (page: Page, postId: string): Locator =>
    page.locator(
      `[data-testid="post-list-item"][data-post-id="${postId}"] [data-testid="post-list-item-vote-score"]`,
    ),
};
```

### Step 0.10: Extend `e2e/fixtures/selectors/bookmarks.ts`

- [ ] Replace the placeholder:

```ts
import type { Page, Locator } from '@playwright/test';

export const bookmarks = {
  // Post-view (PostActions)
  toggleBtn: (page: Page): Locator => page.getByTestId('bookmark-toggle-btn'),
  onIcon: (page: Page): Locator => page.getByTestId('bookmark-on-icon'),

  // Feed (PostListItem) — scoped via the per-card `data-post-id` attribute added in Step 0.3
  // (separate attribute from the static `post-list-item` testid, to avoid Vue's
  // duplicate-attribute collision).
  feedToggleOnCard: (page: Page, postId: string): Locator =>
    page.locator(
      `[data-testid="post-list-item"][data-post-id="${postId}"] [data-testid="post-list-item-bookmark-toggle-btn"]`,
    ),
  feedOnIconOnCard: (page: Page, postId: string): Locator =>
    page.locator(
      `[data-testid="post-list-item"][data-post-id="${postId}"] [data-testid="post-list-item-bookmark-on-icon"]`,
    ),
};
```

### Step 0.11: Run vitest after all foundation edits

- [ ] Run:

```bash
cd packages/client && npm run test -- PostListItem PostActions CommentSection CommentThread PostDetail PostList 2>&1 | tail -30
```

Expected: all passing. If any test imports `useFeedStore` or `useBookmarks` and breaks because the unit test never installed Pinia, add the `createTestingPinia()` boilerplate to that test (idiomatic for this codebase — see `__tests__/components/post/PostActions.test.ts` for the canonical example).

### Step 0.12: Commit foundation

- [ ] Commit:

```bash
git add e2e/fixtures/selectors/comments.ts \
        e2e/fixtures/selectors/voting.ts \
        e2e/fixtures/selectors/bookmarks.ts \
        packages/client/src/components/post/PostActions.vue \
        packages/client/src/components/post/PostListItem.vue \
        packages/client/src/components/post/PostList.vue \
        packages/client/src/components/post/CommentSection.vue \
        packages/client/src/components/post/CommentThread.vue \
        packages/client/src/components/post/PostDetail.vue \
        packages/client/src/__tests__/components/post/  # any test files touched
git commit -m "feat(e2e): foundation testids + selector shards for #48"
```

Pre-commit hook runs lint + typecheck. If it fails — fix and re-commit; never `--no-verify`.

---

## Task 1: comments/ specs (14 specs)

Reset endpoint runs before every spec (auto-applied by `fixtures/reset.js`). All comment specs target `cheatsheet.id` (`c0000000-0000-0000-0000-000000000001`) for read-only seed assertions, or create a fresh post for mutating assertions.

### Spec 1.1: `create-top-level.spec.ts`

**File:** `e2e/specs/comments/create-top-level.spec.ts`

- [ ] Step 1: Write the failing spec.

```ts
import { test, expect } from '../../fixtures/reset.js';
import { comments } from '../../fixtures/selectors/comments.js';

test('comments: create top-level — testuser posts on alice cheatsheet', async ({ testuser }) => {
  const cheatsheetId = 'c0000000-0000-0000-0000-000000000001';
  await testuser.goto(`/posts/${cheatsheetId}`);

  await comments.input(testuser).fill('e2e-comment-' + Date.now());
  await comments.submit(testuser).click();

  // The newly created comment is testuser-authored — assert that a comment with
  // testuser's display name now appears in the list. Use a regex match against
  // the freshly-typed body to dodge false positives from seeded comments.
  await expect(testuser.getByTestId('comment-section')).toContainText(/e2e-comment-\d+/);
});
```

- [ ] Step 2: Run.

```bash
npm run e2e -- specs/comments/create-top-level.spec.ts
```

Expected: PASS (testids landed in Task 0).

- [ ] Step 3: Run with workers=4.

```bash
npm run e2e -- --workers=4 specs/comments/create-top-level.spec.ts
```

- [ ] Step 4: Commit.

```bash
git add e2e/specs/comments/create-top-level.spec.ts
git commit -m "test(e2e): comments — create top-level"
```

### Spec 1.2: `edit-own.spec.ts`

**File:** `e2e/specs/comments/edit-own.spec.ts`

testuser creates a comment via API (POST `/api/posts/:id/comments` with body `{body}` — `createCommentSchema`) on a fresh post, navigates to the post-view page, edits via UI, asserts the new body renders.

- [ ] Step 1: Write the failing spec.

```ts
import { test, expect } from '../../fixtures/reset.js';
import { comments } from '../../fixtures/selectors/comments.js';

test('comments: edit own — testuser edits their comment via UI', async ({ testuser }) => {
  // Mint access token from the refresh-token cookie.
  const refresh = await testuser.request.post('/api/auth/refresh');
  expect(refresh.ok()).toBe(true);
  const { accessToken } = (await refresh.json()) as { accessToken: string };
  const auth = { Authorization: `Bearer ${accessToken}` };

  // Create a fresh post + comment so the edit doesn't race with seeded data.
  const post = await testuser.request.post('/api/posts', {
    headers: auth,
    data: {
      title: 'Edit-own seed',
      contentType: 'snippet',
      language: 'typescript',
      content: 'x',
      visibility: 'public',
      isDraft: false,
    },
  });
  const {
    post: { id: postId },
  } = (await post.json()) as { post: { id: string } };
  const comment = await testuser.request.post(`/api/posts/${postId}/comments`, {
    headers: auth,
    data: { body: 'before-edit' },
  });
  const {
    comment: { id: commentId },
  } = (await comment.json()) as { comment: { id: string } };

  await testuser.goto(`/posts/${postId}`);
  await comments.editBtnOf(testuser, commentId).click();
  // Edit form is a CommentInput with `initial-value` populated; the textarea is the same comment-input testid.
  const editTextarea = testuser.getByTestId(`comment-${commentId}`).getByTestId('comment-input');
  await editTextarea.fill('after-edit');
  await testuser.getByTestId(`comment-${commentId}`).getByTestId('comment-submit-btn').click();

  await expect(comments.bodyOf(testuser, commentId)).toHaveText('after-edit');
});
```

- [ ] Step 2: Run, expect PASS.
- [ ] Step 3: Run with workers=4, expect PASS.
- [ ] Step 4: Commit.

```bash
git add e2e/specs/comments/edit-own.spec.ts
git commit -m "test(e2e): comments — edit own via UI"
```

### Spec 1.3: `delete-own.spec.ts`

**File:** `e2e/specs/comments/delete-own.spec.ts`

- [ ] Step 1: Write the failing spec.

```ts
import { test, expect } from '../../fixtures/reset.js';
import { comments } from '../../fixtures/selectors/comments.js';

test('comments: delete own — testuser deletes their comment via UI', async ({ testuser }) => {
  const refresh = await testuser.request.post('/api/auth/refresh');
  expect(refresh.ok()).toBe(true);
  const { accessToken } = (await refresh.json()) as { accessToken: string };
  const auth = { Authorization: `Bearer ${accessToken}` };

  const post = await testuser.request.post('/api/posts', {
    headers: auth,
    data: {
      title: 'Delete-own seed',
      contentType: 'snippet',
      language: 'typescript',
      content: 'x',
      visibility: 'public',
      isDraft: false,
    },
  });
  const {
    post: { id: postId },
  } = (await post.json()) as { post: { id: string } };
  const comment = await testuser.request.post(`/api/posts/${postId}/comments`, {
    headers: auth,
    data: { body: 'doomed' },
  });
  const {
    comment: { id: commentId },
  } = (await comment.json()) as { comment: { id: string } };

  await testuser.goto(`/posts/${postId}`);
  await expect(comments.bodyOf(testuser, commentId)).toHaveText('doomed');
  await comments.deleteBtnOf(testuser, commentId).click();
  await expect(comments.item(testuser, commentId)).toHaveCount(0);
});
```

- [ ] Step 2: Run. Expected: PASS.
- [ ] Step 3: workers=4 PASS.
- [ ] Step 4: Commit.

```bash
git add e2e/specs/comments/delete-own.spec.ts
git commit -m "test(e2e): comments — delete own via UI"
```

### Spec 1.4: `cannot-edit-others.spec.ts`

**File:** `e2e/specs/comments/cannot-edit-others.spec.ts`

Alice navigates to the cheatsheet and asserts that the seeded inline comment (carol's, `e0000000-…-000000000003`) does NOT show an edit button to her. (The `edit-btn` is conditionally rendered by `v-if="isOwner"` in `CommentThread.vue`.)

- [ ] Step 1:

```ts
import { test, expect } from '../../fixtures/reset.js';

test('comments: alice cannot see edit button on carol-authored seeded comment', async ({
  alice,
}) => {
  const cheatsheetId = 'c0000000-0000-0000-0000-000000000001';
  const carolCommentId = 'e0000000-0000-0000-0000-000000000003';

  await alice.goto(`/posts/${cheatsheetId}`);
  // carol's inline comment may not be in the default tree — assert against the
  // top-level one instead. e0…01 is bob-authored.
  const bobCommentId = 'e0000000-0000-0000-0000-000000000001';
  await expect(alice.getByTestId(`comment-${bobCommentId}`)).toBeVisible();
  await expect(alice.getByTestId(`comment-${bobCommentId}`).getByTestId('edit-btn')).toHaveCount(0);
  // Same check on carol's reply / inline if visible
  await expect(alice.getByTestId(`comment-${carolCommentId}`).getByTestId('edit-btn')).toHaveCount(
    0,
  );
});
```

- [ ] Step 2: Run. PASS.
- [ ] Step 3: workers=4 PASS.
- [ ] Step 4: Commit.

### Spec 1.5: `cannot-delete-others.spec.ts`

**File:** `e2e/specs/comments/cannot-delete-others.spec.ts`

Identical structure to 1.4 but asserting `delete-btn` count is zero.

- [ ] Step 1:

```ts
import { test, expect } from '../../fixtures/reset.js';

test('comments: alice cannot see delete button on bob-authored seeded comment', async ({
  alice,
}) => {
  const cheatsheetId = 'c0000000-0000-0000-0000-000000000001';
  const bobCommentId = 'e0000000-0000-0000-0000-000000000001';

  await alice.goto(`/posts/${cheatsheetId}`);
  await expect(alice.getByTestId(`comment-${bobCommentId}`).getByTestId('delete-btn')).toHaveCount(
    0,
  );
});
```

- [ ] Step 2–4: run + commit.

### Spec 1.6: `reply-to-comment.spec.ts`

**File:** `e2e/specs/comments/reply-to-comment.spec.ts`

Testuser replies to bob's seeded top-level comment on the cheatsheet. The created reply's `parentId` is `e0…01`. The spec asserts that the new reply renders nested under the parent.

- [ ] Step 1:

```ts
import { test, expect } from '../../fixtures/reset.js';
import { comments } from '../../fixtures/selectors/comments.js';

test('comments: reply to a top-level comment via UI', async ({ testuser }) => {
  const cheatsheetId = 'c0000000-0000-0000-0000-000000000001';
  const parentId = 'e0000000-0000-0000-0000-000000000001';

  await testuser.goto(`/posts/${cheatsheetId}`);
  await comments.replyBtnOf(testuser, parentId).click();
  // The reply form is the second comment-input rendered inside the parent comment item.
  const replyTextarea = testuser
    .getByTestId(`comment-${parentId}`)
    .getByTestId('comment-input')
    .nth(0); // first input INSIDE this scope is the reply form
  const replyBody = `reply-${Date.now()}`;
  await replyTextarea.fill(replyBody);
  await testuser
    .getByTestId(`comment-${parentId}`)
    .getByTestId('comment-submit-btn')
    .nth(0)
    .click();

  // Assert the reply body now appears inside the parent comment scope
  await expect(testuser.getByTestId(`comment-${parentId}`)).toContainText(replyBody);
});
```

- [ ] Step 2–4: run + commit.

### Spec 1.7: `nested-reply-three-levels.spec.ts`

**File:** `e2e/specs/comments/nested-reply-three-levels.spec.ts`

Testuser creates a fresh post, then via API creates a 3-level chain (top → reply → reply-to-reply). UI assertion verifies all three render in nested scope.

- [ ] Step 1:

```ts
import { test, expect } from '../../fixtures/reset.js';
import { comments } from '../../fixtures/selectors/comments.js';

test('comments: nested replies render three levels deep', async ({ testuser }) => {
  const refresh = await testuser.request.post('/api/auth/refresh');
  const { accessToken } = (await refresh.json()) as { accessToken: string };
  const auth = { Authorization: `Bearer ${accessToken}` };

  const post = await testuser.request.post('/api/posts', {
    headers: auth,
    data: {
      title: 'Nested seed',
      contentType: 'snippet',
      language: 'typescript',
      content: 'x',
      visibility: 'public',
      isDraft: false,
    },
  });
  const {
    post: { id: postId },
  } = (await post.json()) as { post: { id: string } };

  const top = await testuser.request.post(`/api/posts/${postId}/comments`, {
    headers: auth,
    data: { body: 'depth-0' },
  });
  const {
    comment: { id: topId },
  } = (await top.json()) as { comment: { id: string } };

  const mid = await testuser.request.post(`/api/posts/${postId}/comments`, {
    headers: auth,
    data: { body: 'depth-1', parentId: topId },
  });
  const {
    comment: { id: midId },
  } = (await mid.json()) as { comment: { id: string } };

  const leaf = await testuser.request.post(`/api/posts/${postId}/comments`, {
    headers: auth,
    data: { body: 'depth-2', parentId: midId },
  });
  const {
    comment: { id: leafId },
  } = (await leaf.json()) as { comment: { id: string } };

  await testuser.goto(`/posts/${postId}`);
  // Each child comment-{id} renders nested inside its parent's DOM subtree.
  await expect(comments.bodyOf(testuser, topId)).toHaveText('depth-0');
  await expect(
    comments.item(testuser, topId).locator(`[data-testid="comment-${midId}"]`),
  ).toHaveCount(1);
  await expect(
    comments.item(testuser, midId).locator(`[data-testid="comment-${leafId}"]`),
  ).toHaveCount(1);
});
```

- [ ] Step 2–4.

### Spec 1.8: `inline-on-revision-line.spec.ts`

**File:** `e2e/specs/comments/inline-on-revision-line.spec.ts`

The cheatsheet has a seeded inline comment from carol on revision 2 line 2 (`e0…03`). When testuser visits the cheatsheet view with rev 2 selected, the inline indicator on line 2 should show "1 comment on line 2", and clicking it should reveal carol's body.

But: the current `PostDetail.vue` only loads inline comments for the rendered `revision`. The default-rendered revision is the latest. The cheatsheet has multiple revisions per seed; the test must navigate to a URL that loads rev 2. Inspect the existing PostHistoryPage handling to determine the URL form.

To keep this spec **out of revision-diff territory**, instead use the existing PostDetail inline-comment indicator on the latest revision: have testuser create a fresh post + revision and an inline comment via API on that revision.

- [ ] Step 1:

```ts
import { test, expect } from '../../fixtures/reset.js';
import { comments } from '../../fixtures/selectors/comments.js';

test('comments: inline comment on revision line — indicator + body render', async ({
  testuser,
}) => {
  const refresh = await testuser.request.post('/api/auth/refresh');
  const { accessToken } = (await refresh.json()) as { accessToken: string };
  const auth = { Authorization: `Bearer ${accessToken}` };

  // Multi-line content so line 3 is meaningful.
  const create = await testuser.request.post('/api/posts', {
    headers: auth,
    data: {
      title: 'Inline seed',
      contentType: 'snippet',
      language: 'typescript',
      content: 'line one\nline two\nline three',
      visibility: 'public',
      isDraft: false,
    },
  });
  // POST /api/posts returns { post, revision } as SEPARATE top-level fields per
  // packages/server/src/routes/posts.ts:106-110 (toPost(...) + toRevision(...)).
  const {
    post: { id: postId },
    revision: { id: revisionId },
  } = (await create.json()) as {
    post: { id: string };
    revision: { id: string };
  };

  // Inline comment on line 3 of the initial revision
  await testuser.request.post(`/api/posts/${postId}/comments`, {
    headers: auth,
    data: { body: 'inline body!', revisionId, lineNumber: 3 },
  });

  await testuser.goto(`/posts/${postId}`);
  // Indicator button shows "1 comment on line 3"
  await expect(comments.inlineIndicator(testuser, 3)).toBeVisible();
  await comments.inlineIndicator(testuser, 3).click();
  // After click, InlineComment renders the body
  await expect(testuser.getByText('inline body!')).toBeVisible();
});
```

- [ ] Step 2: Run, expect PASS.
- [ ] Step 3: workers=4 PASS.
- [ ] Step 4: Commit.

### Spec 1.9: `empty-state.spec.ts`

**File:** `e2e/specs/comments/empty-state.spec.ts`

Testuser creates a fresh post (no comments). View shows the `comments-empty` "No comments yet." line and zero comments in the list.

- [ ] Step 1:

```ts
import { test, expect } from '../../fixtures/reset.js';
import { comments } from '../../fixtures/selectors/comments.js';

test('comments: empty-state appears for a brand-new post', async ({ testuser }) => {
  const refresh = await testuser.request.post('/api/auth/refresh');
  const { accessToken } = (await refresh.json()) as { accessToken: string };
  const auth = { Authorization: `Bearer ${accessToken}` };

  const post = await testuser.request.post('/api/posts', {
    headers: auth,
    data: {
      title: 'Empty seed',
      contentType: 'snippet',
      language: 'typescript',
      content: 'x',
      visibility: 'public',
      isDraft: false,
    },
  });
  const {
    post: { id: postId },
  } = (await post.json()) as { post: { id: string } };

  await testuser.goto(`/posts/${postId}`);
  await expect(comments.empty(testuser)).toBeVisible();
  await expect(comments.empty(testuser)).toHaveText('No comments yet.');
  // Belt-and-suspenders: the comment list element is absent
  await expect(comments.list(testuser)).toHaveCount(0);
});
```

- [ ] Step 2–4.

### Spec 1.10: `on-deleted-post-cascade.spec.ts`

**File:** `e2e/specs/comments/on-deleted-post-cascade.spec.ts`

When the post is deleted, GET `/api/posts/:id/comments` returns 404 (handler at `comments.ts:18-22`). The cascade behavior is already covered by `posts/delete-cascade.spec.ts` — this spec adds the comments-route-specific verification.

- [ ] Step 1:

```ts
import { test, expect } from '../../fixtures/reset.js';

test('comments: GET /comments returns 404 after the post is deleted', async ({ testuser }) => {
  const refresh = await testuser.request.post('/api/auth/refresh');
  const { accessToken } = (await refresh.json()) as { accessToken: string };
  const auth = { Authorization: `Bearer ${accessToken}` };

  const post = await testuser.request.post('/api/posts', {
    headers: auth,
    data: {
      title: 'Cascade-comments seed',
      contentType: 'snippet',
      language: 'typescript',
      content: 'x',
      visibility: 'public',
      isDraft: false,
    },
  });
  const {
    post: { id: postId },
  } = (await post.json()) as { post: { id: string } };

  await testuser.request.post(`/api/posts/${postId}/comments`, {
    headers: auth,
    data: { body: 'doomed' },
  });

  // Delete the post via API
  const del = await testuser.request.delete(`/api/posts/${postId}`, { headers: auth });
  expect(del.ok()).toBe(true);

  // Comments route returns 404
  const after = await testuser.request.get(`/api/posts/${postId}/comments`, { headers: auth });
  expect(after.status()).toBe(404);
});
```

- [ ] Step 2–4.

### Spec 1.11: `input-clears-after-submit.spec.ts`

**File:** `e2e/specs/comments/input-clears-after-submit.spec.ts`

After submitting a comment, the textarea should clear (per `CommentInput.vue:46`: `body.value = ''`).

- [ ] Step 1:

```ts
import { test, expect } from '../../fixtures/reset.js';
import { comments } from '../../fixtures/selectors/comments.js';

test('comments: input textarea clears after submit', async ({ testuser }) => {
  const cheatsheetId = 'c0000000-0000-0000-0000-000000000001';

  await testuser.goto(`/posts/${cheatsheetId}`);
  await comments.input(testuser).fill('typed-content');
  await comments.submit(testuser).click();

  // After submit, the input value is empty.
  await expect(comments.input(testuser)).toHaveValue('');
});
```

- [ ] Step 2–4.

### Spec 1.12: `realtime-broadcast.spec.ts`

**File:** `e2e/specs/comments/realtime-broadcast.spec.ts`

Two browser sessions (testuser + alice) both viewing the cheatsheet. Alice posts a comment via API; testuser's UI receives it via the `comment:new` websocket event broadcast (`packages/server/src/routes/comments.ts:71-75`).

- [ ] Step 1:

```ts
import { test, expect } from '../../fixtures/reset.js';
import { comments } from '../../fixtures/selectors/comments.js';

test("comments: testuser sees alice's new comment via websocket broadcast", async ({
  testuser,
  alice,
}) => {
  const cheatsheetId = 'c0000000-0000-0000-0000-000000000001';

  // Both load the post-view page
  await testuser.goto(`/posts/${cheatsheetId}`);
  await alice.goto(`/posts/${cheatsheetId}`);

  // Alice mints a token and posts a comment
  const refresh = await alice.request.post('/api/auth/refresh');
  const { accessToken } = (await refresh.json()) as { accessToken: string };
  const broadcastBody = `broadcast-${Date.now()}`;
  await alice.request.post(`/api/posts/${cheatsheetId}/comments`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { body: broadcastBody },
  });

  // testuser's page should pick up the broadcast within Playwright's default 5s expect timeout
  await expect(comments.section(testuser)).toContainText(broadcastBody);
});
```

- [ ] Step 2: Run. If the websocket isn't connecting in the E2E environment, inspect `packages/server/src/plugins/websocket/`. The journey smoke test in #45 already exercises the websocket bridge — if that passes, this spec must too. If flaky under workers=4, increase the assertion timeout to 10s for this single expect.
- [ ] Step 3: workers=4.
- [ ] Step 4: Commit.

### Spec 1.13: `edit-window-enforcement.spec.ts` (FIXME)

**File:** `e2e/specs/comments/edit-window-enforcement.spec.ts`

Backend (`packages/server/src/routes/comments.ts:96-115`) enforces ownership-only — no time gate. Per Issue #48 conditional wording ("if backend enforces a time-based edit window"), this spec ships as `test.fixme` so it activates the moment the gate lands.

- [ ] Step 1:

```ts
import { test, expect } from '../../fixtures/reset.js';
import { comments } from '../../fixtures/selectors/comments.js';

// FIXME(#48): server-side edit-window enforcement does not exist as of 2026-04-30.
// `packages/server/src/routes/comments.ts:96-115` enforces ownership only, no time gate.
// Activate this spec once the gate lands. Specs MUST use page.clock to advance time
// deterministically — never waitForTimeout.
test.fixme('comments: cannot edit own comment after the edit window expires', async ({
  testuser,
}) => {
  const refresh = await testuser.request.post('/api/auth/refresh');
  const { accessToken } = (await refresh.json()) as { accessToken: string };
  const auth = { Authorization: `Bearer ${accessToken}` };

  const post = await testuser.request.post('/api/posts', {
    headers: auth,
    data: {
      title: 'Edit-window seed',
      contentType: 'snippet',
      language: 'typescript',
      content: 'x',
      visibility: 'public',
      isDraft: false,
    },
  });
  const {
    post: { id: postId },
  } = (await post.json()) as { post: { id: string } };
  const c = await testuser.request.post(`/api/posts/${postId}/comments`, {
    headers: auth,
    data: { body: 'too late' },
  });
  const {
    comment: { id: commentId },
  } = (await c.json()) as { comment: { id: string } };

  // Install the clock at install-time (page.clock.install) so subsequent
  // app-level Date.now() reflects the simulated time. See:
  // https://playwright.dev/docs/clock
  await testuser.clock.install({ time: new Date('2026-04-30T12:00:00Z') });
  await testuser.goto(`/posts/${postId}`);

  // Advance N+1 minutes past whatever window the server enforces
  await testuser.clock.fastForward('20:00'); // 20 minutes

  await comments.editBtnOf(testuser, commentId).click();
  // The PATCH should now 403 — the UI should surface an error
  // (exact assertion to be filled in once the server's response shape lands.)
  // Placeholder body shape: { error: 'Comment edit window expired' }
});
```

- [ ] Step 2: Run.

```bash
npm run e2e -- specs/comments/edit-window-enforcement.spec.ts
```

Expected: 1 skipped (Playwright's `test.fixme` reports as skipped with reason).

- [ ] Step 3: Commit.

### Spec 1.14: `mention-notifications.spec.ts` (FIXME)

**File:** `e2e/specs/comments/mention-notifications.spec.ts`

No mention infrastructure exists in `routes/comments.ts` or `packages/server/src/services/`. Per issue: "only if implemented; otherwise skip with note".

- [ ] Step 1:

```ts
import { test, expect } from '../../fixtures/reset.js';

// FIXME(#48): mention-notification infrastructure not implemented as of 2026-04-30.
// No code paths exist in packages/server/src/routes/comments.ts or services/ that
// parse @mentions or emit notifications. Activate this spec once the feature ships.
test.fixme('comments: @mention generates a notification for the mentioned user', async ({
  testuser,
  alice,
}) => {
  const cheatsheetId = 'c0000000-0000-0000-0000-000000000001';

  await testuser.goto(`/posts/${cheatsheetId}`);
  // Posting a comment containing "@alice" should produce a notification for alice.
  // Exact API + UI assertions to be filled in when the feature is built.
});
```

- [ ] Step 2: Run, expect 1 skipped.
- [ ] Step 3: Commit.

### Step 1.X: Commit Task 1 cumulatively

After spec 1.14 commits, the comments folder is complete. Verify:

- [ ] Run all comments specs:

```bash
npm run e2e -- specs/comments/
```

Expected: 12 passed, 2 skipped (1.13 + 1.14 fixme).

- [ ] Run with workers=4:

```bash
npm run e2e -- --workers=4 specs/comments/
```

Expected: 12 passed, 2 skipped.

If any spec fails under workers=4, the most likely cause is shared state — re-check that the spec uses a freshly-created post (not a seeded one mutated in place).

---

## Task 2: voting/ specs (7 specs)

### Spec 2.1: `upvote.spec.ts`

**File:** `e2e/specs/voting/upvote.spec.ts`

testuser upvotes the cheatsheet. The cheatsheet currently has 2 votes (from bob + carol). After testuser upvotes → 3.

- [ ] Step 1:

```ts
import { test, expect } from '../../fixtures/reset.js';
import { voting } from '../../fixtures/selectors/voting.js';

test('voting: upvote increments score from 2 to 3 on cheatsheet', async ({ testuser }) => {
  const cheatsheetId = 'c0000000-0000-0000-0000-000000000001';

  await testuser.goto(`/posts/${cheatsheetId}`);
  await expect(voting.voteScore(testuser)).toHaveText('2');
  await voting.upvoteBtn(testuser).click();
  await expect(voting.voteScore(testuser)).toHaveText('3');
});
```

- [ ] Step 2–4.

### Spec 2.2: `downvote.spec.ts`

**File:** `e2e/specs/voting/downvote.spec.ts`

Cheatsheet has score 2; testuser downvotes → 1 (since `vote_count` in the schema sums signed values: 2 = +1 +1; testuser adds -1 → 1).

- [ ] Step 1:

```ts
import { test, expect } from '../../fixtures/reset.js';
import { voting } from '../../fixtures/selectors/voting.js';

test('voting: downvote decrements score from 2 to 1 on cheatsheet', async ({ testuser }) => {
  const cheatsheetId = 'c0000000-0000-0000-0000-000000000001';

  await testuser.goto(`/posts/${cheatsheetId}`);
  await expect(voting.voteScore(testuser)).toHaveText('2');
  await voting.downvoteBtn(testuser).click();
  await expect(voting.voteScore(testuser)).toHaveText('1');
});
```

- [ ] Step 2–4.

### Spec 2.3: `switch-up-to-down.spec.ts`

**File:** `e2e/specs/voting/switch-up-to-down.spec.ts`

testuser upvotes → score 3. Then clicks downvote → switches: score 1 (3 -1 -1 = 1, because the upvote is removed and a downvote is added).

- [ ] Step 1:

```ts
import { test, expect } from '../../fixtures/reset.js';
import { voting } from '../../fixtures/selectors/voting.js';

test('voting: switching up→down moves score by exactly 2', async ({ testuser }) => {
  const cheatsheetId = 'c0000000-0000-0000-0000-000000000001';

  await testuser.goto(`/posts/${cheatsheetId}`);
  await voting.upvoteBtn(testuser).click();
  await expect(voting.voteScore(testuser)).toHaveText('3');
  await voting.downvoteBtn(testuser).click();
  await expect(voting.voteScore(testuser)).toHaveText('1');
});
```

- [ ] Step 2–4.

### Spec 2.4: `remove-by-clicking-again.spec.ts`

**File:** `e2e/specs/voting/remove-by-clicking-again.spec.ts`

**DoD reinterpretation note:** Issue #48 DoD lists this as `error path: already-voted (idempotency)`. Inspecting `routes/votes.ts:24-35`: the route is genuinely idempotent — posting the same `value` twice toggles the vote OFF and returns 200 with `{ voteCount, userVote: null }`. There is **no 4xx error path** for already-voted; the toggle-off behavior IS the idempotency contract. The issue's parallel hint about `__test__/reset` mid-spec / `test.describe.serial` was conditional on the existence of an error response — since the backend has none, neither pattern applies. This spec asserts the actual contract (clicking upvote twice removes the vote and returns the score to the original baseline). The reinterpretation is documented in the PR body.

The vote endpoint at `votes.ts:9-39` is idempotent: posting the **same** value twice removes the vote. Spec exercises this.

- [ ] Step 1:

```ts
import { test, expect } from '../../fixtures/reset.js';
import { voting } from '../../fixtures/selectors/voting.js';

test('voting: clicking upvote twice removes the vote (idempotency)', async ({ testuser }) => {
  const cheatsheetId = 'c0000000-0000-0000-0000-000000000001';

  await testuser.goto(`/posts/${cheatsheetId}`);
  await expect(voting.voteScore(testuser)).toHaveText('2');
  await voting.upvoteBtn(testuser).click();
  await expect(voting.voteScore(testuser)).toHaveText('3');
  await voting.upvoteBtn(testuser).click();
  await expect(voting.voteScore(testuser)).toHaveText('2');
});
```

- [ ] Step 2–4.

### Spec 2.5: `score-in-feed.spec.ts`

**File:** `e2e/specs/voting/score-in-feed.spec.ts`

testuser visits home; the cheatsheet card shows score 2; testuser opens it, upvotes → 3; navigates back home → card shows 3.

- [ ] Step 1:

```ts
import { test, expect } from '../../fixtures/reset.js';
import { voting } from '../../fixtures/selectors/voting.js';

test('voting: vote score in feed view updates after upvoting', async ({ testuser }) => {
  const cheatsheetId = 'c0000000-0000-0000-0000-000000000001';

  await testuser.goto('/');
  // The feed card for cheatsheet currently shows 2
  await expect(voting.feedScoreOnCard(testuser, cheatsheetId)).toHaveText('2');

  // Click into cheatsheet and upvote
  await testuser.goto(`/posts/${cheatsheetId}`);
  await voting.upvoteBtn(testuser).click();
  await expect(voting.voteScore(testuser)).toHaveText('3');

  // Navigate home — the feed should reflect the new score
  await testuser.goto('/');
  await expect(voting.feedScoreOnCard(testuser, cheatsheetId)).toHaveText('3');
});
```

- [ ] Step 2: Run. If the feed cache isn't invalidated by the websocket `vote:updated` broadcast, the assertion may fail. Inspect `packages/client/src/stores/feed.ts` for vote handling — if the store reads `voteCount` from the store's local map updated by the broadcast handler, this spec will pass naturally. If the feed needs a manual refresh, add `await testuser.reload()` before the final assertion. Note this in a code comment if used.
- [ ] Step 3: workers=4.
- [ ] Step 4: Commit.

### Spec 2.6: `score-in-post-view.spec.ts`

**File:** `e2e/specs/voting/score-in-post-view.spec.ts`

Already partly covered by 2.1, but explicitly target post-view-render only — a fresh post created with seeded vote data via API.

- [ ] Step 1:

```ts
import { test, expect } from '../../fixtures/reset.js';
import { voting } from '../../fixtures/selectors/voting.js';

test('voting: post-view shows vote_count from the server', async ({ testuser, alice }) => {
  // testuser creates a post; alice upvotes it via API; testuser opens it.
  const tuRefresh = await testuser.request.post('/api/auth/refresh');
  const { accessToken: tuToken } = (await tuRefresh.json()) as { accessToken: string };
  const post = await testuser.request.post('/api/posts', {
    headers: { Authorization: `Bearer ${tuToken}` },
    data: {
      title: 'Score-view seed',
      contentType: 'snippet',
      language: 'typescript',
      content: 'x',
      visibility: 'public',
      isDraft: false,
    },
  });
  const {
    post: { id: postId },
  } = (await post.json()) as { post: { id: string } };

  const aliceRefresh = await alice.request.post('/api/auth/refresh');
  const { accessToken: aliceToken } = (await aliceRefresh.json()) as { accessToken: string };
  await alice.request.post(`/api/posts/${postId}/vote`, {
    headers: { Authorization: `Bearer ${aliceToken}` },
    data: { value: 1 },
  });

  await testuser.goto(`/posts/${postId}`);
  await expect(voting.voteScore(testuser)).toHaveText('1');
});
```

- [ ] Step 2–4.

### Spec 2.7: `must-be-authenticated.spec.ts`

**File:** `e2e/specs/voting/must-be-authenticated.spec.ts`

Voting requires auth (`votes.ts:9` → `preHandler: [app.authenticate]`). Hit the API without a token and assert 401.

- [ ] Step 1:

```ts
import { test, expect, request } from '@playwright/test';

test('voting: POST /vote without auth returns 401', async () => {
  // Use a clean APIRequestContext (no storage state, no cookies, no token).
  const ctx = await request.newContext();
  const cheatsheetId = 'c0000000-0000-0000-0000-000000000001';

  const res = await ctx.post(`http://localhost:3001/api/posts/${cheatsheetId}/vote`, {
    data: { value: 1 },
  });
  expect(res.status()).toBe(401);

  await ctx.dispose();
});
```

Note: this spec uses raw `@playwright/test` `request` (not the auth-extended fixture) and bypasses the reset hook because it doesn't import from `fixtures/reset.js`. That's fine — vote 401 is independent of DB state. The spec is opt-out of reset by virtue of not using the reset-extended fixture. **Tag with `@no-reset`** for clarity even though it's redundant.

Actually — to keep all specs uniformly using the reset hook, let's import from reset and tag the test:

```ts
import { test, expect } from '../../fixtures/reset.js';
import { request as plainRequest } from '@playwright/test';

test('voting: POST /vote without auth returns 401', { tag: '@no-reset' }, async () => {
  const ctx = await plainRequest.newContext();
  const cheatsheetId = 'c0000000-0000-0000-0000-000000000001';
  const res = await ctx.post(`http://localhost:3001/api/posts/${cheatsheetId}/vote`, {
    data: { value: 1 },
  });
  expect(res.status()).toBe(401);
  await ctx.dispose();
});
```

The `@no-reset` tag opts out of the reset hook (per `fixtures/reset.js:13`). Use this form.

- [ ] Step 2–4.

### Step 2.X: Run all voting specs

- [ ] Run:

```bash
npm run e2e -- specs/voting/
npm run e2e -- --workers=4 specs/voting/
```

Expected: 7 passed both times.

---

## Task 3: bookmarks/ specs (5 specs)

### Spec 3.1: `toggle-on-post-view.spec.ts`

**File:** `e2e/specs/bookmarks/toggle-on-post-view.spec.ts`

testuser visits the cheatsheet (no bookmark for testuser on that post); clicks bookmark → `bookmark-on-icon` visible; clicks again → invisible.

- [ ] Step 1:

```ts
import { test, expect } from '../../fixtures/reset.js';
import { bookmarks } from '../../fixtures/selectors/bookmarks.js';

test('bookmarks: toggle on post-view (off → on → off)', async ({ testuser }) => {
  const cheatsheetId = 'c0000000-0000-0000-0000-000000000001';

  await testuser.goto(`/posts/${cheatsheetId}`);
  // Initially: testuser has no bookmark on cheatsheet
  await expect(bookmarks.onIcon(testuser)).toHaveCount(0);

  await bookmarks.toggleBtn(testuser).click();
  await expect(bookmarks.onIcon(testuser)).toBeVisible();

  await bookmarks.toggleBtn(testuser).click();
  await expect(bookmarks.onIcon(testuser)).toHaveCount(0);
});
```

- [ ] Step 2–4.

### Spec 3.2: `toggle-on-feed-card.spec.ts`

**File:** `e2e/specs/bookmarks/toggle-on-feed-card.spec.ts`

On the home feed, testuser clicks the per-card bookmark toggle on the cheatsheet card; the on-icon appears on that card. Click again → disappears.

- [ ] Step 1:

```ts
import { test, expect } from '../../fixtures/reset.js';
import { bookmarks } from '../../fixtures/selectors/bookmarks.js';

test('bookmarks: per-card toggle on the feed (off → on → off)', async ({ testuser }) => {
  const cheatsheetId = 'c0000000-0000-0000-0000-000000000001';

  await testuser.goto('/');
  // Initially: no on-icon on the cheatsheet card for testuser
  await expect(bookmarks.feedOnIconOnCard(testuser, cheatsheetId)).toHaveCount(0);

  await bookmarks.feedToggleOnCard(testuser, cheatsheetId).click();
  await expect(bookmarks.feedOnIconOnCard(testuser, cheatsheetId)).toBeVisible();

  await bookmarks.feedToggleOnCard(testuser, cheatsheetId).click();
  await expect(bookmarks.feedOnIconOnCard(testuser, cheatsheetId)).toHaveCount(0);
});
```

- [ ] Step 2: Run. If `useFeedStore.userBookmarks` is not yet populated for the home feed fetch path, this spec exposes a real bug. Inspect `composables/useFeed.ts` and `stores/feed.ts` — the bookmark map should populate from the same `/api/feed` shape. If it doesn't, file an inline fix in PostListItem to call `useBookmarks().getUserBookmarks()` on mount, OR scope the bookmarked status from the feed response. Document the fix in the commit.
- [ ] Step 3: workers=4.
- [ ] Step 4: Commit.

### Spec 3.3: `page-list.spec.ts`

**File:** `e2e/specs/bookmarks/page-list.spec.ts`

testuser has **no seeded bookmarks** (the bookmark on `c0…99` is alice's, not testuser's — see Seeded fixtures table). Spec creates one bookmark via API, then asserts the list shows exactly that card.

- [ ] Step 1:

```ts
import { test, expect } from '../../fixtures/reset.js';

test("bookmarks: /bookmarks page lists the user's bookmarks", async ({ testuser }) => {
  // testuser has 0 seeded bookmarks; arrange one via API.
  const refresh = await testuser.request.post('/api/auth/refresh');
  const { accessToken } = (await refresh.json()) as { accessToken: string };
  const cheatsheetId = 'c0000000-0000-0000-0000-000000000001';
  const toggle = await testuser.request.post(`/api/posts/${cheatsheetId}/bookmark`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: {},
  });
  expect(toggle.ok()).toBe(true);
  expect(((await toggle.json()) as { bookmarked: boolean }).bookmarked).toBe(true);

  await testuser.goto('/bookmarks');
  const cards = testuser.getByTestId('post-list-item');
  await expect(cards).toHaveCount(1);
  // Cheatsheet card title (from seed): "TypeScript Cheatsheet — Common Utility Types"
  await expect(cards.first()).toContainText('TypeScript');
});
```

- [ ] Step 2: Run. If the cheatsheet title substring "TypeScript" doesn't match (seed may have evolved), grep `scripts/seed.sql` for `c0000000-0000-0000-0000-000000000001` and replace the substring.
- [ ] Step 3–4.

### Spec 3.4: `page-empty-state.spec.ts`

**File:** `e2e/specs/bookmarks/page-empty-state.spec.ts`

testuser has **0 seeded bookmarks** by default. Visit `/bookmarks` → empty state visible. No setup needed.

- [ ] Step 1:

```ts
import { test, expect } from '../../fixtures/reset.js';

test('bookmarks: /bookmarks page shows empty-state when user has no bookmarks', async ({
  testuser,
}) => {
  // testuser has 0 seeded bookmarks (the bookmark on c0…99 is alice's, not testuser's).
  // Asserting against the post-reset baseline directly — no arrange step needed.
  await testuser.goto('/bookmarks');
  await expect(testuser.getByTestId('empty-state')).toBeVisible();
  await expect(testuser.getByTestId('empty-state-message')).toHaveText('No bookmarked posts yet');
});
```

- [ ] Step 2–4.

### Spec 3.5: `persists-across-sessions.spec.ts`

**File:** `e2e/specs/bookmarks/persists-across-sessions.spec.ts`

Per issue #48: "use page.context().close() then create a new context with the same storageState". The test bookmarks a post in session A, closes context, opens a new context with testuser's storageState, navigates to the post → bookmark still on.

- [ ] Step 1:

```ts
import { test, expect } from '../../fixtures/reset.js';
import { bookmarks } from '../../fixtures/selectors/bookmarks.js';
import { storageStatePath } from '../../fixtures/auth.js';

test('bookmarks: persist across sessions (close context, reopen)', async ({
  browser,
  testuser,
}) => {
  const cheatsheetId = 'c0000000-0000-0000-0000-000000000001';

  // Session A: use the auto-injected testuser page; bookmark cheatsheet
  await testuser.goto(`/posts/${cheatsheetId}`);
  await bookmarks.toggleBtn(testuser).click();
  await expect(bookmarks.onIcon(testuser)).toBeVisible();
  await testuser.context().close();

  // Session B: brand-new context with the same storage state
  const ctx = await browser.newContext({ storageState: storageStatePath('testuser') });
  const page = await ctx.newPage();
  await page.goto(`/posts/${cheatsheetId}`);
  // The bookmark survived the context close — it lives in the DB, not in cookies.
  await expect(page.getByTestId('bookmark-on-icon')).toBeVisible();
  await ctx.close();
});
```

Note: bookmark persistence is server-side (DB row), not client-side state. The spec name "persists across sessions" is asserting the natural property of server-side storage — the close-and-reopen context dance per the issue confirms the assertion is robust against any future migration to localStorage caching.

- [ ] Step 2–4.

### Step 3.X: Run all bookmark specs

- [ ] Run:

```bash
npm run e2e -- specs/bookmarks/
npm run e2e -- --workers=4 specs/bookmarks/
```

Expected: 5 passed both times.

---

## Task 4: Final integration + PR

### Step 4.1: Run all three folders together

- [ ] Run:

```bash
npm run e2e -- specs/comments/ specs/voting/ specs/bookmarks/
npm run e2e -- --workers=4 specs/comments/ specs/voting/ specs/bookmarks/
```

Expected: 24 passed, 2 skipped.

### Step 4.2: Run the full suite

- [ ] Run:

```bash
npm run e2e
npm run e2e -- --workers=4
```

Expected: full e2e green (auth + posts + revisions + comments + voting + bookmarks). Capture the wall-clock time. Per issue: contribution should be ~2–3 min and total should remain < 10 min.

### Step 4.3: Vitest + coverage gate

- [ ] Run:

```bash
npm run test:coverage
```

Confirm coverage thresholds in `.coverage-thresholds.json` are met. The PostListItem changes add a small bookmark-toggle handler — if any line/branch is uncovered, add a unit test for the new branch in `packages/client/src/__tests__/components/post/PostListItem.test.ts`.

### Step 4.4: Bruno regression

- [ ] With server running:

```bash
set -a && source .env && set +a
cd packages/server && npx tsx src/server.ts &
sleep 5
cd .. && cd .. && cd bruno && npx @usebruno/cli run -r --env local
```

Expected: green. No `.bru` files were modified, so this is purely a regression check.

### Step 4.5: Spec-N-alone independence

- [ ] Pick three new specs at random and run each in isolation:

```bash
npm run e2e -- specs/comments/realtime-broadcast.spec.ts
npm run e2e -- specs/voting/score-in-feed.spec.ts
npm run e2e -- specs/bookmarks/persists-across-sessions.spec.ts
```

Each must pass standalone — proves the spec doesn't depend on side effects from earlier specs.

### Step 4.6: Adversarial-review checklist (from issue body)

Walk through the issue's adversarial-review checklist:

- [ ] Single concept per spec — every new spec has exactly one `test(...)` block focused on one behavior.
- [ ] No `waitForTimeout` — confirm via `grep -r 'waitForTimeout' e2e/specs/comments e2e/specs/voting e2e/specs/bookmarks`. Expected: 0 hits.
- [ ] No conditional assertions — confirm via `grep -rE '(if .*\\) \\{[\\s\\S]*expect|if .*\\) expect)' e2e/specs/comments e2e/specs/voting e2e/specs/bookmarks`. Manual eyeball pass too.
- [ ] Cross-user tests use distinct fixtures — the websocket-broadcast and persists-across-sessions specs explicitly close + reopen contexts; the cannot-edit-others / cannot-delete-others specs use the alice fixture which has its own storage state.
- [ ] Vote score assertions use specific numbers — every voting spec asserts exact text like `'2'`, `'3'`. No "greater than 0" assertions.

### Step 4.7: 3 consecutive green CI runs

- [ ] Push the branch:

```bash
git push -u origin feat/e2e-comments-voting-bookmarks
```

- [ ] Open PR (see Step 4.8). Wait for CI. The `e2e-playwright` workflow must pass three runs in a row. If a run is red, diagnose and fix; reset the counter. Do not merge until the counter reaches 3.

  Caveat: the repo's tracking-issue green-counter is a separate, post-merge cadence on `main` (issue #43). The "3 consecutive green CI runs" DoD here refers to the PR's own CI runs — re-pushing without code changes is acceptable to demonstrate stability. (Push an empty commit `git commit --allow-empty -m "ci: re-trigger"` if a flake is suspected and you want to confirm without code changes.)

### Step 4.8: Update tracking issue #43

- [ ] Comment on #43 with the spec count delta:

```bash
gh issue comment 43 --body "Issue #48 (rollout 3/9) PR opened: <PR-URL>. Adds 24 active specs + 2 fixme across comments/, voting/, bookmarks/. Updates folder counts: comments 0 → 14, voting 0 → 7, bookmarks 0 → 5."
```

Update the spec-count table in the issue body when the PR merges. (Tracker self-edit can be done from the PR's body or a follow-up comment.)

### Step 4.9: Pre-PR knowledge capture (MUST run before Step 4.10)

- [ ] Per CLAUDE.md "Pre-PR Knowledge Capture": run `/self-reflect` and commit knowledge base updates BEFORE creating the PR. Include the resulting `.beads/` updates in the same branch.

```bash
/self-reflect
git add .beads/
git commit -m "docs: pre-PR self-reflect — issue #48 learnings"
git push
```

Then proceed to Step 4.10 (PR open).

### Step 4.10: Open PR

- [ ] Run:

```bash
gh pr create \
  --base main \
  --title "feat(e2e): comments + voting + bookmarks specs (#48)" \
  --body "$(cat <<'EOF'
## Summary
- Adds 24 active Playwright specs + 2 fixme across `e2e/specs/{comments,voting,bookmarks}/` (issue #48 / rollout 3/9).
- Foundation: extends `e2e/fixtures/selectors/{comments,voting,bookmarks}.ts` and adds `data-testid` attributes to `PostActions` (downvote-btn), `PostListItem` (vote-score + per-card bookmark toggle + per-card postId scope testid), `PostList` (empty-state), `CommentSection` (section + empty), `CommentThread` (per-comment scoping), `PostDetail` (inline-comment indicator).
- Fixme'd: `comment-edit-window-enforcement.spec.ts` (server has no time gate at `comments.ts:96`) and `comment-mention-notifications.spec.ts` (no mention infrastructure).
- No server changes. No new endpoints. No DB migrations.

## Reinterpretations / known gaps (flagged for reviewer adjudication)
- DoD bullet "edit window enforcement" → ships as `test.fixme` per the issue's conditional wording ("if backend enforces"). Activates the moment the gate lands.
- DoD bullet "mention notifications" → ships as `test.fixme` per the issue's "skip with note" directive.
- DoD bullet "voting error path: already-voted (idempotency)" → reinterpreted as success-path idempotent toggle: `routes/votes.ts:24-35` returns 200 with `{ userVote: null }` when the same value is posted twice; there is no 4xx error path. The toggle-off behavior IS the idempotency contract. The issue's `__test__/reset` mid-spec / `test.describe.serial` advice was conditional on an error response existing.
- Issue's `data-testid="diff-line-{lineNumber}"` recommendation belongs to the revision-diff renderer (OOS for #48 per issue's "Out of scope" list). The post-view inline-comment path uses `inline-comment-indicator-line-{N}` testids — line-number-keyed, same spirit.

## Test plan
- [x] `npm run e2e -- specs/comments specs/voting specs/bookmarks` — 24 pass + 2 skipped at workers=1
- [x] Same at workers=4 — 24 pass + 2 skipped
- [x] Full e2e suite — green
- [x] `npm run test:coverage` — meets `.coverage-thresholds.json`
- [x] Bruno regression — green
- [x] 3 consecutive green CI runs on PR

Closes #48
EOF
)"
```

---

## Operational concerns

### Failure modes the issue flagged (and how this plan addresses them)

| Failure mode (issue body)                                                                               | Plan response                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vote score in feed and post-view both display vote_count via different routes; race conditions possible | Spec 2.5 (`score-in-feed`) navigates via real client navigation (`testuser.goto('/')`), which forces a fresh feed fetch. If the websocket cache invalidation isn't wired, the spec will fail and we add a `reload()` (documented in commit).              |
| Inline-comment-on-diff-line must reference revision UUID + line number                                  | Spec 1.8 creates the comment via API with `{revisionId, lineNumber}` — the canonical shape per `createCommentSchema`. Indicator testid uses line number.                                                                                                  |
| Bookmarks page may use cursor pagination                                                                | Spec 3.3 asserts an exact card count (1 — testuser's only seed). Pagination kicks in at limit=20 (`bookmarkListSchema:7`) — we're nowhere near that. If seed expands later, the spec breaks loudly with a count mismatch — that's the right failure mode. |

### Subagent-driven-development boundary

Per the issue's recommended execution method: one subagent per sub-folder. The natural boundaries are:

- **Subagent A**: Task 0 (foundation). Touches selectors + 6 client components. Must complete first; subagents B/C/D depend on it.
- **Subagent B**: Task 1 (comments specs). Touches only `e2e/specs/comments/`.
- **Subagent C**: Task 2 (voting specs). Touches only `e2e/specs/voting/`.
- **Subagent D**: Task 3 (bookmarks specs). Touches only `e2e/specs/bookmarks/`.
- **Orchestrator (this session)**: Task 4 (integration + PR).

Subagents B, C, D can run in parallel after A merges its commit.

---

## Self-Review

**Spec coverage:** Walking the DoD:

- [x] `comments/` ~14 specs — Tasks 1.1–1.14, 12 active + 2 fixme. All DoD bullets covered (top-level/edit/delete/own-only/reply/nested/inline/edit-window/empty/cascade/mention).
- [x] `voting/` ~7 specs — Tasks 2.1–2.7. Covers upvote/downvote/switch/remove/feed-score/post-view-score/auth-required.
- [x] `bookmarks/` ~5 specs — Tasks 3.1–3.5. Covers toggle/list/empty/persists.
- [x] Selector shards extended — Step 0.8–0.10.
- [x] `data-testid` attributes added — Steps 0.2–0.7.
- [x] All specs pass with workers=1 AND workers=4 — Step 4.1.
- [x] 3 consecutive green CI runs — Step 4.7.
- [x] CI runtime: full e2e under 10 min — Step 4.2 captures wall clock.
- [x] Vitest + Bruno gates pass — Steps 4.3, 4.4.
- [x] Tracking issue #43 updated — Step 4.8.
- [x] Closes #48 — Step 4.9.

**Placeholder scan:** The plan contains explicit notes about reset hook behavior, the `revisionId` shape lookup, and the feed cache invalidation. Each "if X happens, do Y" is a concrete fallback with named files, not a placeholder. Spec 1.8's `revisionId` lookup is documented inline as "if absent from POST response, fetch via GET …" — the engineer has a clear path. No `TBD`, `TODO` (in the plan-failure sense), or "implement later" lines.

**Type consistency:** All comment-id selectors use the `comment-{id}` testid format consistently. All vote-score selectors use `vote-score` (post-view) vs `post-list-item-vote-score` (feed) consistently. All bookmark selectors share the `bookmark-toggle-btn` / `post-list-item-bookmark-toggle-btn` naming pattern. All API auth helpers use the same `headers: { Authorization: 'Bearer ...' }` shape.
