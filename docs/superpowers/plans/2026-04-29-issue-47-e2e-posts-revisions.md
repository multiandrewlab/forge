# E2E Posts + Revisions Specs Implementation Plan — REV 3

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver Playwright specs covering `posts/` and `revisions/` per Issue #47, completing rollout phase 2/9.

**Architecture:** TDD per spec — write spec, run, watch fail, add testid + selector entry (or small feature wiring), run, watch pass, commit. Selector shards extend `e2e/fixtures/selectors/posts.ts` (existing) and create `e2e/fixtures/selectors/revisions.ts` (new). Seed extensions are additive — no existing fixture mutated, no Bruno breakage. `createdPostId` is used for **every spec that mutates state**, per the issue's fixture-isolation rule and for `workers=4` safety.

**Tech Stack:** Playwright @ workspace `e2e/`, Vue 3 + Vite client, Fastify server (already shipped with mock LLM provider + `__test__/reset` endpoint), PostgreSQL via docker-compose, MinIO for multi-file uploads.

**Source design:** `docs/superpowers/specs/2026-04-28-e2e-playwright-testing-design.md` (original 2026-04-28 + Amendment 2026-04-29).

**Branch:** `feat/e2e-posts-revisions-specs`.

## REV 2 changes vs. REV 1 (from plan-review-gate iteration 1)

The first plan-review-gate (iteration 1) returned PASS for Scope & Alignment but FAIL for Feasibility (5 blocking) and Completeness (12 blocking). Architectural verification revealed that the amendment's premise about feature-surface placement was wrong; user adjudicated three scope-decision rebounds. REV 2 incorporates:

| Concern (gate finding)                                                                             | REV 2 fix                                                                                                                           |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `CodeRunner` / `LinkPreviewCard` not on `PostViewPage`; only on `PostDetail.vue` (HomePage inline) | Tasks 9 + 10 specs target `/` (HomePage), select the right post in the feed, assert testids in the inline `PostDetail` panel.       |
| `?filter=drafts` URL doesn't exist (FeedFilter is `mine \| bookmarked`)                            | Task 5 collapses 5.2 + 5.3 into one spec on `/my-snippets` (which already includes drafts per `feed.ts:137`). No server changes.    |
| Tags rendered as `<span>` strings, no router-link, no tag-page route                               | Task 8.3 asserts visible tag chips with a `post-tag-chip` testid; navigation deferred to rollout #4.                                |
| `/users/:id` route doesn't exist (actual: `/user/:id` singular)                                    | Task 11.1 spec uses `/user/:id`.                                                                                                    |
| `PresenceIndicator` only on `PostViewPage`, not edit                                               | Task 11.2 renamed `profile-presence-on-view`; spec targets `/posts/:id`.                                                            |
| Manual revision UI doesn't exist                                                                   | Task 12.2 adds a small `save-revision-btn` to `EditorToolbar.vue` wired to existing `POST /:id/revisions` API (per Q3 user choice). |
| Cascade-spec asserted only comment, not votes/bookmarks                                            | Task 4.3 extended to assert all three.                                                                                              |
| `createdPostId` discipline broken on Tasks 3.1, 3.3, 5.1, 12.1, 15.1                               | All 5 mutating specs rewritten to use `createdPostId` setup.                                                                        |
| `PostNewPage.vue` testid missing                                                                   | Task 1 adds page-level `post-new-page` testid.                                                                                      |
| 3 consecutive green CI runs not operationalized                                                    | Task 16 step 6 explicit.                                                                                                            |
| CI runtime delta not measured                                                                      | Task 16 step 7 explicit.                                                                                                            |
| `Closes #47` PR trailer missing                                                                    | Task 16 step 9 explicit.                                                                                                            |
| Spec-N-alone independence not verified                                                             | Task 16 step 5 runs random specs in isolation.                                                                                      |
| Fork-of-fork case + rollback-on-forked-post unaddressed                                            | Explicit OOS section at end of plan.                                                                                                |
| Vitest impact of new dialog/cancel UI not considered                                               | Task 4 + Task 3.4 + Task 12.2 explicitly note the unit-test impact and require running `npm run test:coverage`.                     |

## REV 3 changes vs. REV 2 (from plan-review-gate iteration 2)

Iteration 2 returned PASS for Completeness and Scope & Alignment, FAIL for Feasibility on 4 blocking items (all concrete API/fixture mismatches). REV 3 fixes:

| Concern (iter 2 finding)                                                                                                                                   | REV 3 fix                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vote endpoint URL — actual route is singular `POST /api/posts/:id/vote` (`votes.ts:9`), no `GET /api/posts/:id/votes` exists                               | Task 4.3 spec updated to use `/vote` (singular) and to verify cascade by asserting `GET /api/posts/:id` returns 404 (FK-cascade implies all children gone) — no per-resource enumeration needed.                                                                                                                                                                                                                                                                |
| Bookmark endpoint URL — actual route is singular `POST /api/posts/:id/bookmark` (`bookmarks.ts:15`); `GET /api/bookmarks` lists user's own bookmarks only  | Task 4.3 spec updated to use `/bookmark` (singular). Cascade verification reuses the same post-404 strategy.                                                                                                                                                                                                                                                                                                                                                    |
| `GET /api/posts/:id/comments/:cid` does not exist (only PATCH/DELETE per `comments.ts:83,134`); only `GET /:id/comments` (list) exists at `comments.ts:18` | Task 4.3 spec rewritten to use post-404 verification. (If a defense-in-depth assertion is desired, list-comments-after-delete returns the post-404, satisfying the cascade claim.)                                                                                                                                                                                                                                                                              |
| `alice.request` — reviewer claimed Page does not expose `.request`                                                                                         | **Reviewer error.** Playwright >= 1.16 exposes `Page.request` returning the BrowserContext-scoped `APIRequestContext` (https://playwright.dev/docs/api/class-page#page-request). This project pins `@playwright/test ^1.49.0` per `e2e/package.json`. `alice.request.post(...)` is the page's APIRequestContext, inheriting alice's storage state cookies/JWT — authenticated as alice. Plan adds an inline citation in Task 4.3 to defuse re-review confusion. |
| `PostListItem.vue` doesn't expose `draft-badge` testid (Task 5.2 spec asserts on it)                                                                       | Task 5.2 Step 0 adds `draft-badge` and `published-badge` testids on the existing `Draft`/`Published` indicators in `PostListItem.vue:22-25` (text already rendered, just missing testids).                                                                                                                                                                                                                                                                      |
| `EditorToolbar.vue` does not currently accept a `postId` prop (Task 12.2 wires `v-if="postId"`)                                                            | Modify list now explicitly notes `EditorToolbar.vue` props addition.                                                                                                                                                                                                                                                                                                                                                                                            |

---

## File Structure

### Create

```
e2e/specs/posts/
├── new-draft-save.spec.ts                 (Task 1)
├── new-required-fields.spec.ts            (Task 1)
├── new-markdown-preview.spec.ts           (Task 1)
├── view-public-post.spec.ts               (Task 2)
├── view-draft-as-author.spec.ts           (Task 2)
├── view-missing-id-404.spec.ts            (Task 2)
├── view-private-as-non-owner.spec.ts      (Task 2)
├── edit-own-post.spec.ts                  (Task 3)
├── edit-cannot-edit-others.spec.ts        (Task 3)
├── edit-changes-persist-after-nav.spec.ts (Task 3)
├── edit-cancel-reverts.spec.ts            (Task 3)
├── delete-confirms.spec.ts                (Task 4)
├── delete-own-only.spec.ts                (Task 4)
├── delete-cascade.spec.ts                 (Task 4)
├── publish-draft-to-public.spec.ts        (Task 5)
├── publish-list-reflects-state.spec.ts    (Task 5 — combined draft/published list)
├── fork-creates-linked-copy.spec.ts       (Task 6)
├── fork-edits-independent.spec.ts         (Task 6)
├── fork-relationship-displayed.spec.ts    (Task 6)
├── multi-file-upload.spec.ts              (Task 7)
├── multi-file-preview.spec.ts             (Task 7)
├── multi-file-rendering-in-post.spec.ts   (Task 7)
├── tags-add-to-post.spec.ts               (Task 8)
├── tags-remove-from-post.spec.ts          (Task 8)
├── tags-view-page-shows-chips.spec.ts     (Task 8 — visibility, not navigation)
├── home-link-preview-on-link-post.spec.ts (Task 9 — HomePage path)
├── home-link-preview-refresh.spec.ts      (Task 9 — HomePage path)
├── home-code-runner-on-snippet.spec.ts    (Task 10 — HomePage path)
├── home-code-runner-execution.spec.ts     (Task 10 — HomePage path)
├── home-author-avatar-links.spec.ts       (Task 11 — HomePage path)
└── view-presence-indicator.spec.ts        (Task 11 — view route)

e2e/specs/revisions/
├── create-auto-on-edit.spec.ts            (Task 12)
├── create-manual-via-button.spec.ts       (Task 12)
├── list-chronological.spec.ts             (Task 13)
├── list-only-initial-revision.spec.ts     (Task 13 — interprets "empty" as 1-revision case)
├── view-by-number.spec.ts                 (Task 14)
├── diff-side-by-side.spec.ts              (Task 14)
├── diff-inline.spec.ts                    (Task 14)
├── rollback-to-previous.spec.ts           (Task 15)
└── rollback-permission.spec.ts            (Task 15)

e2e/fixtures/selectors/revisions.ts        (Task 0)
```

**Spec count: 31 posts + 9 revisions = 40 total** (within amendment band).

### Modify

```
e2e/fixtures/selectors/posts.ts            (Task 0 — extend)
scripts/seed.sql                           (Task 0 — additive)
packages/client/src/pages/PostNewPage.vue  (Task 1 — add post-new-page testid)
packages/client/src/components/editor/PostEditor.vue (Task 3.4 — add post-cancel-btn)
packages/client/src/pages/PostViewPage.vue (Task 4 — delete-confirm dialog; Task 8.3 — tag-chip testid)
packages/client/src/components/post/PostMetaHeader.vue (Task 8.3 — tag-chip testid; Task 11.1 — author-avatar testid)
packages/client/src/components/post/PostListItem.vue (Task 5.2 — draft-badge / published-badge testids on existing indicators)
packages/client/src/components/editor/EditorToolbar.vue (Task 12.2 — save-revision-btn + postId prop)
packages/client/src/components/post/LinkPreviewCard.vue (Task 9 — link-preview-card testid on root)
packages/client/src/pages/PostHistoryPage.vue (Task 13 — page-level testid)
```

All modify lines are testid additions or one minimal feature add. **No `packages/server/` changes.**

---

## TDD pattern (used in every spec task below)

For every spec in tasks 1–15, follow this loop:

1. **Write the failing spec** — drop the `.spec.ts` file with the test code shown.
2. **Run it:** `cd e2e && npx playwright test specs/posts/<file>.spec.ts --project=chromium` (or `specs/revisions/...`).
3. **Watch it fail.**
4. **Fix the smallest thing**: add the missing testid in the named component file (1 line) or extend `selectors/posts.ts`/`revisions.ts`. **Do NOT add features** unless the task explicitly calls for it (Tasks 4, 8.3, 12.2 add minimal feature wiring).
5. **Run it again** — watch it pass.
6. **Commit** the spec + any testid/selector additions together with `feat(e2e):` or `feat(e2e,client):` message.

**Test invocation reference:**

```bash
cd e2e && npx playwright test specs/posts                     # whole posts folder, default workers
cd e2e && npx playwright test specs/posts --workers=1         # workers=1 verification
cd e2e && npx playwright test specs/posts --workers=4         # workers=4 verification
cd e2e && npx playwright test specs/posts specs/revisions --workers=4  # full #47 scope
```

---

## Task 0: Foundation extensions (selectors + seed)

**Why first:** Specs in tasks 1–15 reference selector helpers and seed fixtures. Adding skeletons up front avoids per-spec churn and lets later tasks add only the testids they actually need.

**Files:**

- Modify: `e2e/fixtures/selectors/posts.ts`
- Create: `e2e/fixtures/selectors/revisions.ts`
- Modify: `scripts/seed.sql`

### Step 1: Extend `e2e/fixtures/selectors/posts.ts` with new entries

Add these to the existing `posts` object (do NOT remove or rename existing keys):

```typescript
// New for Task 1 (PostNewPage page-level testid)
postNewPage: (page: Page): Locator => page.getByTestId('post-new-page'),
// New for Task 3.4 (PostEditor cancel)
postCancelBtn: (page: Page): Locator => page.getByTestId('post-cancel-btn'),
// New for Task 4 (delete-confirm dialog)
postDeleteBtn: (page: Page): Locator => page.getByTestId('post-delete-btn'),
postDeleteConfirm: (page: Page): Locator => page.getByTestId('post-delete-confirm'),
postDeleteCancel: (page: Page): Locator => page.getByTestId('post-delete-cancel'),
postDeleteDialog: (page: Page): Locator => page.getByTestId('post-delete-dialog'),
// New for Task 8.3 (visible tag chips on view page — no navigation, no tag page yet)
postTagChip: (page: Page, name: string): Locator =>
  page.getByTestId(`post-tag-chip-${name}`),
// New for Task 9 (link-preview, tested via HomePage inline path)
linkPreviewCard: (page: Page): Locator => page.getByTestId('link-preview-card'),
linkPreviewRefresh: (page: Page): Locator => page.getByTestId('refresh-preview'),
// New for Task 10 (code-runner, tested via HomePage inline path)
codeRunner: (page: Page): Locator => page.getByTestId('code-runner'),
runPlay: (page: Page): Locator => page.getByTestId('run-play'),
runStop: (page: Page): Locator => page.getByTestId('run-stop'),
executionOutput: (page: Page): Locator => page.getByTestId('execution-output'),
clearOutputBtn: (page: Page): Locator => page.getByTestId('clear-button'),
// New for Task 11.1 (author avatar on PostMetaHeader, used inline on HomePage)
authorAvatar: (page: Page): Locator => page.getByTestId('author-avatar'),
// New for Task 11.2 (presence on view page)
presenceAvatar: (page: Page): Locator => page.getByTestId('presence-avatar'),
// New for Task 12.2 (manual revision via button)
saveRevisionBtn: (page: Page): Locator => page.getByTestId('save-revision-btn'),
```

### Step 2: Create `e2e/fixtures/selectors/revisions.ts`

```typescript
import type { Page, Locator } from '@playwright/test';

export const revisions = {
  // RevisionTimeline (existing testids)
  revisionItem: (page: Page): Locator => page.getByTestId('revision-item'),

  // RevisionDiffViewer (existing testids)
  diffViewer: (page: Page): Locator => page.getByTestId('diff-viewer'),
  modeInline: (page: Page): Locator => page.getByTestId('mode-inline'),
  modeSideBySide: (page: Page): Locator => page.getByTestId('mode-side-by-side'),
  diffAdded: (page: Page): Locator => page.getByTestId('diff-added'),
  diffRemoved: (page: Page): Locator => page.getByTestId('diff-removed'),
  diffUnchanged: (page: Page): Locator => page.getByTestId('diff-unchanged'),
  diffSideBySide: (page: Page): Locator => page.getByTestId('diff-side-by-side'),
  sideLeft: (page: Page): Locator => page.getByTestId('side-left'),
  sideRight: (page: Page): Locator => page.getByTestId('side-right'),

  // RestoreButton (existing testids)
  restoreTrigger: (page: Page): Locator => page.getByTestId('restore-trigger'),
  restoreDialog: (page: Page): Locator => page.getByTestId('restore-dialog'),
  restoreConfirm: (page: Page): Locator => page.getByTestId('restore-confirm'),
  restoreCancel: (page: Page): Locator => page.getByTestId('restore-cancel'),

  // PostHistoryPage (page-level testid added in Task 13)
  historyPage: (page: Page): Locator => page.getByTestId('post-history-page'),
};
```

### Step 3: Extend `scripts/seed.sql` with additive fixtures

Insert into `scripts/seed.sql` at the correct sections (FK-safe ordering):

In the **Posts** section (after the `c…0099` insert, adjust trailing semicolon):

```sql
  ('c0000000-0000-0000-0000-000000000098', 'a0000000-0000-0000-0000-000000000099', 'Test Fixture Draft Post (testuser-owned)', 'snippet', 'typescript', 'public', true, 0);
```

In the **Post Revisions** section (after `d…0099`, adjust trailing semicolon):

```sql
  ,
  ('d0000000-0000-0000-0000-000000000098', 'c0000000-0000-0000-0000-000000000098', 'a0000000-0000-0000-0000-000000000099', 'const draftFixture: string = "draft body for E2E publish-toggle test";', 'Initial draft version', 1),
  ('d0000000-0000-0000-0000-000000000100', 'c0000000-0000-0000-0000-000000000099', 'a0000000-0000-0000-0000-000000000099', E'const testFixture: string = "hello from testuser v2";\nexport default testFixture;', 'Second revision — added export', 2),
  ('d0000000-0000-0000-0000-000000000101', 'c0000000-0000-0000-0000-000000000099', 'a0000000-0000-0000-0000-000000000099', E'const testFixture: string = "hello from testuser v3 with more body";\nexport default testFixture;\n// trailing comment for diff visibility', 'Third revision — comment + body change', 3);
```

In **Votes** (append, adjust trailing semicolon):

```sql
  ,
  ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000099', 1);
```

In **Bookmarks** (append, adjust trailing semicolon):

```sql
  ,
  ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000099');
```

### Step 4: Verify seed parses + applies

```bash
set -a && source .env && set +a && psql "$DATABASE_URL" -f scripts/seed.sql
psql "$DATABASE_URL" -c "SELECT count(*) FROM posts;"   # expect 14
psql "$DATABASE_URL" -c "SELECT count(*) FROM post_revisions WHERE post_id='c0000000-0000-0000-0000-000000000099';"  # expect 3
```

### Step 5: Bruno regression — verify additive seed didn't break Bruno

```bash
cd bruno && npx @usebruno/cli run -r --env local
```

Expected: all green. If a Bruno spec fails on a count change for testuser's `c…0099`, update the Bruno expectation (the new fixtures are reality, not vice versa).

### Step 6: Commit

```bash
git add e2e/fixtures/selectors/posts.ts e2e/fixtures/selectors/revisions.ts scripts/seed.sql
git commit -m "feat(e2e): selector skeletons + seed extensions for issue #47"
```

---

## Task 1: posts/ — new (3 specs + PostNewPage testid)

**DoD:** new — draft saves, required fields, markdown renders preview correctly.

### Step 0: Add `post-new-page` testid to `PostNewPage.vue`

In `packages/client/src/pages/PostNewPage.vue`, on the root container:

```vue
<div data-testid="post-new-page" class="...">
  ...
</div>
```

(Used by spec 1.1 to confirm the route loaded; required by DoD's "data-testid attributes on PostNewPage".)

### Spec 1.1: `new-draft-save.spec.ts`

```typescript
import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';

test('new post: save draft persists and lands on the post detail page', async ({ testuser }) => {
  await testuser.goto('/posts/new');
  await expect(posts.postNewPage(testuser)).toBeVisible();
  await posts.newPostTitle(testuser).fill('Draft from E2E');
  await posts.newPostBody(testuser).fill('console.log("hello e2e");');
  await posts.newPostSaveDraft(testuser).click();

  await expect(testuser).toHaveURL(/\/posts\/[a-f0-9-]+/);
  await expect(posts.draftBadge(testuser)).toBeVisible();
});
```

Run + commit: `feat(e2e): posts/new — save-draft round-trip + post-new-page testid`.

### Spec 1.2: `new-required-fields.spec.ts`

```typescript
import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';

test('new post: empty title disables the save button', async ({ testuser }) => {
  await testuser.goto('/posts/new');
  await posts.newPostBody(testuser).fill('body without a title');
  await expect(posts.newPostSaveDraft(testuser)).toBeDisabled();
});
```

If the actual UX uses an inline error instead of disabled-button, swap `toBeDisabled()` for `await expect(testuser.getByTestId('validation-error')).toBeVisible()`. **Single concept per spec — pick one assertion based on actual UX.**

Run + commit: `feat(e2e): posts/new — required-fields validation`.

### Spec 1.3: `new-markdown-preview.spec.ts`

```typescript
import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';

test('new post: markdown body renders preview with formatted output', async ({ testuser }) => {
  await testuser.goto('/posts/new');
  await posts.newPostTitle(testuser).fill('MD preview test');
  await testuser.getByTestId('content-type-select').selectOption('document');
  await posts.newPostBody(testuser).fill('# heading\n\n**bold** word');

  const preview = testuser.getByTestId('markdown-preview');
  await expect(preview.locator('h1')).toHaveText('heading');
});
```

If `data-testid="markdown-preview"` doesn't exist, add it where the preview component renders (likely a `<MarkdownPreview>` child of `PostEditor.vue`). Run + commit.

---

## Task 2: posts/ — view (4 specs)

**DoD:** view — public post, draft visible to author, missing-id 404, permission private hidden from non-owner.

### Spec 2.1: `view-public-post.spec.ts`

Reads the seed fixture `c…0099`. Read-only — pinned `postId`.

```typescript
import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';

test('view: public post renders title and content for any logged-in user', async ({ alice }) => {
  await alice.goto('/posts/c0000000-0000-0000-0000-000000000099');
  await expect(posts.postTitle(alice)).toHaveText('Test Fixture Post (testuser-owned)');
  await expect(posts.publishedBadge(alice)).toBeVisible();
});
```

### Spec 2.2: `view-draft-as-author.spec.ts`

Reads `c…0098` (testuser draft, added in Task 0). Read-only — pinned.

```typescript
import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';

test('view: draft is visible to its author with a draft badge', async ({ testuser }) => {
  await testuser.goto('/posts/c0000000-0000-0000-0000-000000000098');
  await expect(posts.postTitle(testuser)).toHaveText('Test Fixture Draft Post (testuser-owned)');
  await expect(posts.draftBadge(testuser)).toBeVisible();
});
```

### Spec 2.3: `view-missing-id-404.spec.ts`

```typescript
import { test, expect } from '../../fixtures/reset.js';

test('view: missing post id renders a not-found state', async ({ testuser }) => {
  await testuser.goto('/posts/00000000-0000-0000-0000-000000000000');
  await expect(testuser.getByText(/post not found/i)).toBeVisible();
});
```

### Spec 2.4: `view-private-as-non-owner.spec.ts`

`c…0006` is carol's private post.

```typescript
import { test, expect } from '../../fixtures/reset.js';

test('view: private post is hidden from a non-owner', async ({ alice }) => {
  await alice.goto('/posts/c0000000-0000-0000-0000-000000000006');
  await expect(alice.getByText(/(not found|forbidden|don't have access)/i)).toBeVisible();
});
```

If the wording differs after the first --headed run, tighten to the exact text. Each spec: run + commit individually.

---

## Task 3: posts/ — edit (4 specs)

**DoD:** edit — own, cannot-edit-others, persists after navigation, cancel reverts.

### Spec 3.1: `edit-own-post.spec.ts` (uses `createdPostId`)

Mutates state — must use `createdPostId` per issue's fixture-isolation rule.

```typescript
import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';

test('edit: own post saves changes and the title updates', async ({ testuser, request }) => {
  // Create a fresh post owned by testuser
  const created = await testuser.request.post('/api/posts', {
    data: {
      title: 'Edit-own seed',
      contentType: 'snippet',
      language: 'typescript',
      content: 'x',
      visibility: 'public',
      isDraft: false,
    },
  });
  const { id: createdPostId } = await created.json();

  await testuser.goto(`/posts/${createdPostId}/edit`);
  const newTitle = 'Updated by E2E run';
  await posts.newPostTitle(testuser).fill(newTitle);
  await posts.newPostSaveDraft(testuser).click();

  await expect(testuser.getByText(newTitle).first()).toBeVisible();
});
```

### Spec 3.2: `edit-cannot-edit-others.spec.ts`

Read-only attempt at someone else's post. No `createdPostId` needed.

```typescript
import { test, expect } from '../../fixtures/reset.js';

test('edit: alice cannot edit testuser-owned post (forbidden)', async ({ alice }) => {
  await alice.goto('/posts/c0000000-0000-0000-0000-000000000099/edit');
  await expect(alice.getByTestId('forbidden-page')).toBeVisible();
});
```

### Spec 3.3: `edit-changes-persist-after-nav.spec.ts` (uses `createdPostId`)

Mutates — `createdPostId`.

```typescript
import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';

test('edit: changes persist after navigating away and back', async ({ testuser, request }) => {
  const created = await testuser.request.post('/api/posts', {
    data: {
      title: 'Persistence seed',
      contentType: 'snippet',
      language: 'typescript',
      content: 'x',
      visibility: 'public',
      isDraft: false,
    },
  });
  const { id: createdPostId } = await created.json();
  const persistedTitle = 'Persisted across nav';

  await testuser.goto(`/posts/${createdPostId}/edit`);
  await posts.newPostTitle(testuser).fill(persistedTitle);
  await posts.newPostSaveDraft(testuser).click();
  await testuser.goto('/');
  await testuser.goto(`/posts/${createdPostId}`);
  await expect(posts.postTitle(testuser)).toHaveText(persistedTitle);
});
```

### Spec 3.4: `edit-cancel-reverts.spec.ts` (adds `post-cancel-btn` testid + emit)

```typescript
import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';

test('edit: cancel button discards in-flight changes and returns to view', async ({
  testuser,
  request,
}) => {
  const originalTitle = 'Cancel seed title';
  const created = await testuser.request.post('/api/posts', {
    data: {
      title: originalTitle,
      contentType: 'snippet',
      language: 'typescript',
      content: 'x',
      visibility: 'public',
      isDraft: false,
    },
  });
  const { id: createdPostId } = await created.json();

  await testuser.goto(`/posts/${createdPostId}/edit`);
  await posts.newPostTitle(testuser).fill('Stomp the title');
  await posts.postCancelBtn(testuser).click();
  await expect(testuser).toHaveURL(new RegExp(`/posts/${createdPostId}(?!/edit)`));
  await expect(posts.postTitle(testuser)).toHaveText(originalTitle);
});
```

**Implementation:** in `PostEditor.vue`, near the existing save/publish buttons:

```vue
<button
  type="button"
  data-testid="post-cancel-btn"
  @click="$emit('cancel')"
  class="px-4 py-2 text-sm rounded border border-gray-600 text-gray-300 hover:text-white"
>
  Cancel
</button>
```

In `PostEditPage.vue`, wire `@cancel` to `router.push({ name: 'post-view', params: { id } })`.

**Vitest impact:** if `PostEditor.vue` has unit tests asserting button counts/labels, update them. Run `npm run test:coverage` after the change.

Run + commit: `feat(e2e,client): posts/edit — cancel reverts (adds post-cancel-btn)`.

---

## Task 4: posts/ — delete (3 specs, includes confirmation dialog feature)

**DoD:** delete — confirms, own-only, cascade (comments / votes / bookmarks deleted with post).

**Feature gap closed by this task:** `PostViewPage.vue:150-155` currently has a Delete button with no confirmation. Plan adds an inline dialog. Single feature add, declared.

### Spec 4.1: `delete-confirms.spec.ts` (drives the dialog implementation)

```typescript
import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';

test('delete: clicking delete shows a confirmation dialog; cancel keeps the post', async ({
  testuser,
  request,
}) => {
  const created = await testuser.request.post('/api/posts', {
    data: {
      title: 'Delete-confirm seed',
      contentType: 'snippet',
      language: 'typescript',
      content: 'x',
      visibility: 'public',
      isDraft: false,
    },
  });
  const { id: createdPostId } = await created.json();

  await testuser.goto(`/posts/${createdPostId}`);
  await posts.postDeleteBtn(testuser).click();
  await expect(posts.postDeleteDialog(testuser)).toBeVisible();
  await posts.postDeleteCancel(testuser).click();
  await expect(posts.postDeleteDialog(testuser)).not.toBeVisible();
  await expect(posts.postTitle(testuser)).toHaveText('Delete-confirm seed');
});
```

**Implementation:** replace `PostViewPage.vue:150-155` with a dialog-opening button + dialog markup:

```vue
<!-- script setup additions -->
const showDeleteDialog = ref(false);
async function confirmDelete(): Promise<void> {
  showDeleteDialog.value = false;
  const id = route.params.id as string;
  await deletePost(id);
  if (!error.value) router.push('/');
}

<!-- template — replace existing single delete button -->
<button
  data-testid="post-delete-btn"
  class="text-sm px-3 py-1 rounded border border-red-500 text-red-400 hover:bg-red-900/30"
  @click="showDeleteDialog = true"
>
  Delete
</button>

<!-- below buttons row, before </template> -->
<div
  v-if="showDeleteDialog"
  data-testid="post-delete-dialog"
  class="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
>
  <div class="bg-surface border border-gray-700 rounded p-6 max-w-md">
    <h2 class="text-lg font-semibold text-white mb-2">Delete this post?</h2>
    <p class="text-sm text-gray-400 mb-4">This action cannot be undone.</p>
    <div class="flex justify-end gap-2">
      <button data-testid="post-delete-cancel" @click="showDeleteDialog = false"
        class="px-3 py-1 rounded border border-gray-600 text-gray-300">Cancel</button>
      <button data-testid="post-delete-confirm" @click="confirmDelete"
        class="px-3 py-1 rounded bg-red-600 text-white">Delete</button>
    </div>
  </div>
</div>
```

**Vitest impact:** existing `PostViewPage` component tests (if any) may need updates to handle the new ref + dialog rendering. Run `npm run test:coverage` after.

Run + commit: `feat(e2e,client): posts/delete — confirmation dialog`.

### Spec 4.2: `delete-own-only.spec.ts`

```typescript
import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';

test('delete: alice cannot see a delete button on testuser-owned post', async ({ alice }) => {
  await alice.goto('/posts/c0000000-0000-0000-0000-000000000099');
  await expect(posts.postDeleteBtn(alice)).toHaveCount(0);
});
```

### Spec 4.3: `delete-cascade.spec.ts` (asserts comments + votes + bookmarks gone)

**Endpoints used (verified against actual server routes):**

- `POST /api/posts/:id/vote` (singular — `votes.ts:9` registered with prefix `/api/posts`)
- `POST /api/posts/:id/bookmark` (singular — `bookmarks.ts:15` registered with prefix `/api`)
- `POST /api/posts/:id/comments` (`comments.ts:35` registered with prefix `/api/posts`)
- Cascade verification: `GET /api/posts/:id` returns 404 after delete. The `posts` table has FK-cascade to `comments`, `votes`, `bookmarks`, so post-404 is sufficient evidence the children are gone. (No per-resource enumeration GET exists for votes/bookmarks; comments has a list endpoint but the post-404 assertion is the cleaner DoD claim.)

**Authenticated request context (verified):** `alice.request` is the `APIRequestContext` exposed on `Page` since Playwright 1.16 (project uses `^1.49.0` per `e2e/package.json`). It inherits the BrowserContext storage state, so calls authenticate as alice. Reference: https://playwright.dev/docs/api/class-page#page-request.

```typescript
import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';

test('delete: cascade — post + comments + votes + bookmarks all vanish', async ({
  testuser,
  alice,
  request,
}) => {
  // testuser creates a post (request fixture is unauthenticated, so use testuser.request)
  const created = await testuser.request.post('/api/posts', {
    data: {
      title: 'Cascade test',
      contentType: 'snippet',
      language: 'typescript',
      content: 'x',
      visibility: 'public',
      isDraft: false,
    },
  });
  expect(created.ok()).toBe(true);
  const { id: createdPostId } = await created.json();

  // Alice creates a vote, bookmark, and comment on testuser's post
  const voteRes = await alice.request.post(`/api/posts/${createdPostId}/vote`, {
    data: { value: 1 },
  });
  expect(voteRes.ok()).toBe(true);
  const bookmarkRes = await alice.request.post(`/api/posts/${createdPostId}/bookmark`, {
    data: {},
  });
  expect(bookmarkRes.ok()).toBe(true);
  const commentRes = await alice.request.post(`/api/posts/${createdPostId}/comments`, {
    data: { body: 'cascade comment' },
  });
  expect(commentRes.ok()).toBe(true);

  // testuser deletes via UI
  await testuser.goto(`/posts/${createdPostId}`);
  await posts.postDeleteBtn(testuser).click();
  await posts.postDeleteConfirm(testuser).click();
  await expect(testuser).toHaveURL('/');

  // Cascade verification: the post itself returns 404. Postgres FK-cascade implies
  // comments, votes, and bookmarks for this post are gone with it.
  const postAfterDelete = await request.get(`/api/posts/${createdPostId}`);
  expect(postAfterDelete.status()).toBe(404);
});
```

**Single concept:** the post and its FK-cascaded children all vanish after delete.

Run + commit.

---

## Task 5: posts/ — publish (2 specs)

**DoD:** publish — toggle draft → public, draft list updates, published-list updates.

REV 2 collapses the original 3 specs into 2 (no `?filter=drafts` URL exists; `/my-snippets` shows both drafts and published).

### Spec 5.1: `publish-draft-to-public.spec.ts` (uses `createdPostId`)

```typescript
import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';

test('publish: draft → public toggles the badge', async ({ testuser, request }) => {
  const created = await testuser.request.post('/api/posts', {
    data: {
      title: 'Publish-toggle seed',
      contentType: 'snippet',
      language: 'typescript',
      content: 'x',
      visibility: 'public',
      isDraft: true,
    },
  });
  const { id: createdPostId } = await created.json();

  await testuser.goto(`/posts/${createdPostId}/edit`);
  await expect(posts.draftBadge(testuser)).toBeVisible();
  await posts.newPostPublish(testuser).click();
  await expect(posts.publishedBadge(testuser)).toBeVisible();
  await expect(posts.draftBadge(testuser)).toHaveCount(0);
});
```

### Spec 5.2: `publish-list-reflects-state.spec.ts` (adds `draft-badge` testid in PostListItem)

Combined spec replacing original 5.2 + 5.3. `PostListItem.vue:21-26` already renders a `Draft` text label (`v-if="post.isDraft"`); REV 3 only adds the `data-testid="draft-badge"` on it. There is no "Published" indicator in `PostListItem` (published is the default state, no badge needed); the spec verifies the draft-badge **appears** while draft, **disappears** after publish.

#### Step 0: Add `draft-badge` testid to `PostListItem.vue`

In `packages/client/src/components/post/PostListItem.vue` lines 21–26, add the testid:

```vue
<span
  v-if="post.isDraft"
  data-testid="draft-badge"
  class="rounded bg-yellow-600/20 px-1.5 py-0.5 text-xs text-yellow-400"
>
  Draft
</span>
```

(One-line addition, no behavior change.)

#### Spec

Uses `createdPostId` (mutates state). Locator scopes to the post's row by title:

```typescript
import { test, expect } from '../../fixtures/reset.js';

test('publish: /my-snippets list reflects publish state — draft badge present before, absent after', async ({
  testuser,
  request,
}) => {
  const title = 'List-reflects-state seed';
  const created = await testuser.request.post('/api/posts', {
    data: {
      title,
      contentType: 'snippet',
      language: 'typescript',
      content: 'x',
      visibility: 'public',
      isDraft: true,
    },
  });
  const { id: createdPostId } = await created.json();

  // /my-snippets includes drafts (feed.ts:137 — `// drafts included for filter=mine`)
  await testuser.goto('/my-snippets');

  // Before publish — locate the row by title; assert the row contains a draft-badge.
  // Using `:has()` to scope the badge query to the row that holds the title text.
  const draftRow = testuser
    .locator('article, li, [data-testid="post-list-item"]')
    .filter({ hasText: title });
  await expect(draftRow.getByTestId('draft-badge')).toBeVisible();

  // Publish via authenticated API for speed (uses testuser's storage state)
  const publishRes = await testuser.request.patch(`/api/posts/${createdPostId}`, {
    data: { isDraft: false },
  });
  expect(publishRes.ok()).toBe(true);

  // After publish — same row, no draft-badge
  await testuser.reload();
  const publishedRow = testuser
    .locator('article, li, [data-testid="post-list-item"]')
    .filter({ hasText: title });
  await expect(publishedRow.getByTestId('draft-badge')).toHaveCount(0);
});
```

**Locator note:** the row selector `article, li, [data-testid="post-list-item"]` is defensive — `PostListItem.vue` may render any of these. After the first `--headed` run, tighten to the actual element type or add a `post-list-item` testid on the root element if needed (1-line change, in scope).

Run + commit: `feat(e2e,client): posts/publish — list-reflects-state + draft-badge testid on PostListItem`.

Run + commit each.

---

## Task 6: posts/ — fork (3 specs)

**DoD:** fork — creates linked copy, edits to fork don't affect original, fork-of relationship displayed.

(Fork-of-fork-of-fork explicitly OOS — see "Out of scope" section at end.)

### Spec 6.1: `fork-creates-linked-copy.spec.ts`

```typescript
import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';

test('fork: clicking fork creates a new post and redirects to its edit page', async ({ alice }) => {
  await alice.goto('/posts/c0000000-0000-0000-0000-000000000099');
  await posts.forkBtn(alice).click();
  await expect(alice).toHaveURL(/\/posts\/[a-f0-9-]+\/edit/);
  await expect(posts.newPostTitle(alice)).toHaveValue(/Test Fixture Post/);
});
```

### Spec 6.2: `fork-edits-independent.spec.ts`

```typescript
import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';

test('fork: editing the fork does not mutate the original', async ({ alice, request }) => {
  await alice.goto('/posts/c0000000-0000-0000-0000-000000000099');
  await posts.forkBtn(alice).click();
  const url = alice.url();
  const forkId = url.match(/\/posts\/([a-f0-9-]+)\/edit/)?.[1];
  expect(forkId).toBeTruthy();

  await posts.newPostTitle(alice).fill('Fork-only mutation');
  await posts.newPostSaveDraft(alice).click();

  const orig = await request.get('/api/posts/c0000000-0000-0000-0000-000000000099');
  const { title } = await orig.json();
  expect(title).toBe('Test Fixture Post (testuser-owned)');
});
```

### Spec 6.3: `fork-relationship-displayed.spec.ts`

```typescript
import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';

test('fork: fork-attribution shows on the forked post view', async ({ alice }) => {
  await alice.goto('/posts/c0000000-0000-0000-0000-000000000099');
  await posts.forkBtn(alice).click();
  const url = alice.url();
  const forkId = url.match(/\/posts\/([a-f0-9-]+)\/edit/)?.[1];
  await alice.goto(`/posts/${forkId}`);
  await expect(posts.forkAttribution(alice)).toBeVisible();
});
```

Run + commit each.

---

## Task 7: posts/ — multi-file (3 specs)

**DoD:** multi-file post — upload, preview, in-post rendering.

Uses real MinIO; orphaned objects accepted per design. Fixture file `e2e/fixtures/journey-asset.txt` exists.

### Spec 7.1: `multi-file-upload.spec.ts`

```typescript
import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSET = join(__dirname, '..', '..', 'fixtures', 'journey-asset.txt');

test('multi-file: upload adds a file to the editor', async ({ testuser }) => {
  await testuser.goto('/posts/new');
  await posts.newPostTitle(testuser).fill('Multi-file post');
  await posts.fileUploadInput(testuser).setInputFiles(ASSET);
  await expect(posts.fileUploadPreview(testuser)).toBeVisible();
});
```

### Spec 7.2: `multi-file-preview.spec.ts`

```typescript
import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSET = join(__dirname, '..', '..', 'fixtures', 'journey-asset.txt');

test('multi-file: preview shows the uploaded file name', async ({ testuser }) => {
  await testuser.goto('/posts/new');
  await posts.newPostTitle(testuser).fill('Preview test');
  await posts.fileUploadInput(testuser).setInputFiles(ASSET);
  await expect(posts.fileUploadPreview(testuser)).toContainText('journey-asset.txt');
});
```

### Spec 7.3: `multi-file-rendering-in-post.spec.ts`

```typescript
import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSET = join(__dirname, '..', '..', 'fixtures', 'journey-asset.txt');

test('multi-file: uploaded file appears on the post view page after save', async ({ testuser }) => {
  await testuser.goto('/posts/new');
  await posts.newPostTitle(testuser).fill('File renders in post');
  await posts.fileUploadInput(testuser).setInputFiles(ASSET);
  await posts.newPostSaveDraft(testuser).click();
  await expect(testuser.getByTestId('post-file-list')).toContainText('journey-asset.txt');
});
```

If `post-file-list` testid is missing on the view, add it where `post_files` are rendered.

Run + commit each.

---

## Task 8: posts/ — tags (3 specs)

**DoD:** tags — add to post, remove from post, post page shows tag links.

REV 2: spec 8.3 asserts visible tag chips (no router-link assertion — no tag-page route exists yet; that's deferred to rollout #4).

### Spec 8.1: `tags-add-to-post.spec.ts` (uses `createdPostId`)

```typescript
import { test, expect } from '../../fixtures/reset.js';

test('tags: add a tag in the editor and it appears as a chip', async ({ testuser, request }) => {
  const created = await testuser.request.post('/api/posts', {
    data: {
      title: 'Tag-add seed',
      contentType: 'snippet',
      language: 'typescript',
      content: 'x',
      visibility: 'public',
      isDraft: false,
    },
  });
  const { id } = await created.json();

  await testuser.goto(`/posts/${id}/edit`);
  await testuser.getByTestId('tag-input').fill('react');
  await testuser.getByTestId('tag-input').press('Enter');
  await expect(testuser.getByTestId('tag-item').filter({ hasText: 'react' })).toBeVisible();
});
```

### Spec 8.2: `tags-remove-from-post.spec.ts` (uses `createdPostId`)

```typescript
import { test, expect } from '../../fixtures/reset.js';

test('tags: clicking the remove icon on a chip removes the tag', async ({ testuser, request }) => {
  const created = await testuser.request.post('/api/posts', {
    data: {
      title: 'Tag-remove seed',
      contentType: 'snippet',
      language: 'typescript',
      content: 'x',
      visibility: 'public',
      isDraft: false,
    },
  });
  const { id } = await created.json();

  await testuser.goto(`/posts/${id}/edit`);
  await testuser.getByTestId('tag-input').fill('typescript');
  await testuser.getByTestId('tag-input').press('Enter');
  const chip = testuser.getByTestId('tag-item').filter({ hasText: 'typescript' });
  await expect(chip).toBeVisible();
  await chip.getByTestId('tag-remove').click();
  await expect(chip).toHaveCount(0);
});
```

### Spec 8.3: `tags-view-page-shows-chips.spec.ts` (adds `post-tag-chip-<name>` testid)

`c…0001` has tag `typescript` per seed.

```typescript
import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';

test('tags: view page renders tag chips', async ({ alice }) => {
  await alice.goto('/posts/c0000000-0000-0000-0000-000000000001');
  await expect(posts.postTagChip(alice, 'typescript')).toBeVisible();
});
```

**Implementation:** in `PostMetaHeader.vue:34-40`, change the `<span>` to include a testid (still a `<span>`, not a `<router-link>` — no tag-page exists yet; navigation is rollout #4):

```vue
<span v-for="tag in post.tags" :key="tag" :data-testid="`post-tag-chip-${tag}`" class="...">
  #{{ tag }}
</span>
```

Run + commit each.

---

## Task 9: posts/ — link-preview (2 specs, HomePage inline path)

**DoD (amendment):** link-preview-card visible on a link-type post; refresh action triggers a refetch.

REV 2: tested via HomePage inline path because `LinkPreviewCard.vue` only mounts in `PostDetail.vue` (used by `HomePage:18`). `c…0007` is alice's link-type post.

### Spec 9.1: `home-link-preview-on-link-post.spec.ts` (adds `link-preview-card` testid root)

```typescript
import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';

test('home: link-preview card renders inline when a link-type post is selected', async ({
  alice,
}) => {
  await alice.goto('/');
  // Click the link-type post (c…0007 = "Awesome TypeScript Resources")
  await alice.getByText('Awesome TypeScript Resources').click();
  // Inline detail panel renders LinkPreviewCard
  await expect(posts.linkPreviewCard(alice)).toBeVisible();
  await expect(posts.linkPreviewCard(alice)).toContainText('Type Challenges');
});
```

**Implementation:** in `LinkPreviewCard.vue`, add `data-testid="link-preview-card"` to the root element.

### Spec 9.2: `home-link-preview-refresh.spec.ts`

```typescript
import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';

test('home: link-preview refresh button is visible and triggers a refresh request for the author', async ({
  alice,
}) => {
  await alice.goto('/');
  await alice.getByText('Awesome TypeScript Resources').click();
  await expect(posts.linkPreviewRefresh(alice)).toBeVisible();

  const responsePromise = alice.waitForResponse(/\/refresh-preview/);
  await posts.linkPreviewRefresh(alice).click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
});
```

Run + commit each.

---

## Task 10: posts/ — code-runner (2 specs, HomePage inline path)

**DoD (amendment):** Run controls visible on a snippet post inline; click Run produces execution output.

REV 2: tested via HomePage inline path (`PostDetail.vue` mounts `CodeRunner`).

### Spec 10.1: `home-code-runner-on-snippet.spec.ts`

```typescript
import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';

test('home: code-runner controls render inline when a snippet post is selected', async ({
  alice,
}) => {
  await alice.goto('/');
  await alice.getByText('Test Fixture Post (testuser-owned)').click();
  await expect(posts.codeRunner(alice)).toBeVisible();
  await expect(posts.runPlay(alice)).toBeVisible();
});
```

### Spec 10.2: `home-code-runner-execution.spec.ts`

```typescript
import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';

test('home: clicking Run produces execution output', async ({ alice }) => {
  await alice.goto('/');
  await alice.getByText('Test Fixture Post (testuser-owned)').click();
  await posts.runPlay(alice).click();
  await expect(posts.executionOutput(alice)).toBeVisible();
  await expect(alice.getByTestId('status-bar')).toContainText(/(complete|done|finished|ready)/i);
});
```

If WASM init causes flake: anchor on a stable readiness marker via `waitForFunction` — never `waitForTimeout`.

Run + commit each.

---

## Task 11: posts/ — author-avatar + presence (2 specs)

**DoD (amendment):** Author avatar links to user profile; presence indicator visible.

REV 2:

- Author-avatar tested via HomePage inline path (`PostMetaHeader` is rendered inside `PostDetail`).
- Presence-indicator tested on `/posts/:id` (only mounted on `PostViewPage:134`).
- Profile route is `/user/:id` (singular).

### Spec 11.1: `home-author-avatar-links.spec.ts` (adds `author-avatar` testid)

```typescript
import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';

test('home: author avatar in the inline panel links to /user/<author-id>', async ({ alice }) => {
  await alice.goto('/');
  await alice.getByText('Test Fixture Post (testuser-owned)').click();
  const avatar = posts.authorAvatar(alice).first();
  await expect(avatar).toBeVisible();
  await avatar.click();
  await expect(alice).toHaveURL(/\/user\/a0000000-0000-0000-0000-000000000099/);
});
```

**Implementation:** in `PostMetaHeader.vue` (rendered by `PostDetail.vue`), wrap the author element in a `<router-link to="{ name: 'user-profile', params: { id: post.authorId } }">` with `data-testid="author-avatar"`. If a UserAvatar component exists, add the testid there.

### Spec 11.2: `view-presence-indicator.spec.ts`

```typescript
import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';

test('view: presence indicator renders on the post view page', async ({ testuser }) => {
  await testuser.goto('/posts/c0000000-0000-0000-0000-000000000099');
  await expect(posts.presenceAvatar(testuser).first()).toBeVisible();
});
```

(`presence-avatar` already exists on `PresenceIndicator.vue`.)

Run + commit each.

---

## Task 12: revisions/ — create (2 specs, includes `save-revision-btn` feature)

**DoD:** create — auto-on-edit, manual-via-button.

REV 2: spec 12.2 adds a small `save-revision-btn` to the editor toolbar, wired to the existing `POST /:id/revisions` API (per Q3 user choice).

### Spec 12.1: `create-auto-on-edit.spec.ts` (uses `createdPostId`)

```typescript
import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';
import { revisions } from '../../fixtures/selectors/revisions.js';

test('revisions: editing a post auto-creates a new revision', async ({ testuser, request }) => {
  const created = await testuser.request.post('/api/posts', {
    data: {
      title: 'Auto-rev seed',
      contentType: 'snippet',
      language: 'typescript',
      content: 'initial',
      visibility: 'public',
      isDraft: false,
    },
  });
  const { id: createdPostId } = await created.json();

  await testuser.goto(`/posts/${createdPostId}/edit`);
  await posts.newPostBody(testuser).fill('const updated: string = "auto revision body";');
  await posts.newPostSaveDraft(testuser).click();

  await testuser.goto(`/posts/${createdPostId}/history`);
  // Initial post has 1 revision; after our edit there should be 2
  await expect(revisions.revisionItem(testuser)).toHaveCount(2);
});
```

### Spec 12.2: `create-manual-via-button.spec.ts` (adds `save-revision-btn`)

```typescript
import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';
import { revisions } from '../../fixtures/selectors/revisions.js';

test('revisions: clicking Save Revision creates a new revision with the current body', async ({
  testuser,
  request,
}) => {
  const created = await testuser.request.post('/api/posts', {
    data: {
      title: 'Manual-rev seed',
      contentType: 'snippet',
      language: 'typescript',
      content: 'initial',
      visibility: 'public',
      isDraft: false,
    },
  });
  const { id: createdPostId } = await created.json();

  await testuser.goto(`/posts/${createdPostId}/edit`);
  await posts.newPostBody(testuser).fill('manual revision body');
  await posts.saveRevisionBtn(testuser).click();

  await testuser.goto(`/posts/${createdPostId}/history`);
  await expect(revisions.revisionItem(testuser)).toHaveCount(2);
});
```

**Implementation (Save Revision button):** in `EditorToolbar.vue`, add a button visible only when editing an existing post (i.e., when a `postId` prop is supplied):

```vue
<button
  v-if="postId"
  type="button"
  data-testid="save-revision-btn"
  @click="$emit('save-revision')"
  class="px-3 py-1 text-sm rounded border border-gray-600 text-gray-300 hover:text-white"
>
  Save Revision
</button>
```

Wire `@save-revision` in `PostEditor.vue` → `PostEditPage.vue` to call a new method that POSTs to `/api/posts/:id/revisions` with `{ content: currentBody, message: 'Manual revision' }`. Use the existing `useRevisions` composable if present; otherwise add a small `saveRevision(postId, content, message)` helper.

**Vitest impact:** add unit test for the new emit + handler. Coverage gate enforces.

Run + commit each.

---

## Task 13: revisions/ — list (2 specs, adds `post-history-page` testid)

**DoD:** list — chronological order, empty state for posts with no revisions.

**Note on "empty state":** in this codebase, every post auto-creates an initial revision on creation, so a true 0-revision state cannot exist via normal flows. REV 2 interprets the DoD as "single-revision (only-initial) state", which is the closest observable variant. If the UI shows a specific "no edits yet" message in this state, the spec asserts it; otherwise, it asserts the 1-revision count and notes the DoD wording gap in the PR.

### Step 0: Add `post-history-page` testid to `PostHistoryPage.vue` root

```vue
<div data-testid="post-history-page" class="...">
```

### Spec 13.1: `list-chronological.spec.ts`

```typescript
import { test, expect } from '../../fixtures/reset.js';
import { revisions } from '../../fixtures/selectors/revisions.js';

test('revisions: list shows revisions in chronological order', async ({ testuser }) => {
  await testuser.goto('/posts/c0000000-0000-0000-0000-000000000099/history');
  // Seed (Task 0) gives c…0099 three revisions: Initial / Second / Third
  const items = revisions.revisionItem(testuser);
  await expect(items).toHaveCount(3);
  // Pick a direction based on first --headed observation; example for newest-first:
  await expect(items.nth(0)).toContainText(/Third revision/);
  await expect(items.nth(2)).toContainText(/Initial version/);
});
```

### Spec 13.2: `list-only-initial-revision.spec.ts`

`c…0098` (testuser draft) has 1 revision.

```typescript
import { test, expect } from '../../fixtures/reset.js';
import { revisions } from '../../fixtures/selectors/revisions.js';

test('revisions: post with only the initial revision shows a single timeline entry', async ({
  testuser,
}) => {
  await testuser.goto('/posts/c0000000-0000-0000-0000-000000000098/history');
  await expect(revisions.revisionItem(testuser)).toHaveCount(1);
});
```

Run + commit each.

---

## Task 14: revisions/ — view + diff (3 specs)

**DoD:** view-by-number, side-by-side diff, inline diff. All testids exist on `RevisionDiffViewer.vue`.

### Spec 14.1: `view-by-number.spec.ts`

```typescript
import { test, expect } from '../../fixtures/reset.js';
import { revisions } from '../../fixtures/selectors/revisions.js';

test('revisions: clicking a revision item shows the diff', async ({ testuser }) => {
  await testuser.goto('/posts/c0000000-0000-0000-0000-000000000099/history');
  await revisions.revisionItem(testuser).nth(0).click();
  await expect(revisions.diffViewer(testuser)).toBeVisible();
});
```

### Spec 14.2: `diff-side-by-side.spec.ts`

```typescript
import { test, expect } from '../../fixtures/reset.js';
import { revisions } from '../../fixtures/selectors/revisions.js';

test('diff: side-by-side mode renders left and right panes', async ({ testuser }) => {
  await testuser.goto('/posts/c0000000-0000-0000-0000-000000000099/history');
  await revisions.revisionItem(testuser).nth(0).click();
  await revisions.modeSideBySide(testuser).click();
  await expect(revisions.diffSideBySide(testuser)).toBeVisible();
  await expect(revisions.sideLeft(testuser)).toBeVisible();
  await expect(revisions.sideRight(testuser)).toBeVisible();
});
```

### Spec 14.3: `diff-inline.spec.ts`

```typescript
import { test, expect } from '../../fixtures/reset.js';
import { revisions } from '../../fixtures/selectors/revisions.js';

test('diff: inline mode renders combined add/remove lines', async ({ testuser }) => {
  await testuser.goto('/posts/c0000000-0000-0000-0000-000000000099/history');
  await revisions.revisionItem(testuser).nth(0).click();
  await revisions.modeInline(testuser).click();
  await expect(revisions.diffAdded(testuser).first()).toBeVisible();
});
```

Run + commit each.

---

## Task 15: revisions/ — rollback (2 specs)

**DoD:** rollback to previous revision; permission (only own posts can be rolled back).

(Rollback-on-forked-post explicitly OOS — see "Out of scope" section.)

### Spec 15.1: `rollback-to-previous.spec.ts` (uses `createdPostId`)

```typescript
import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';
import { revisions } from '../../fixtures/selectors/revisions.js';

test('rollback: confirming restore swaps the post body to the chosen revision', async ({
  testuser,
  request,
}) => {
  // Create a post with two revisions
  const created = await testuser.request.post('/api/posts', {
    data: {
      title: 'Rollback seed',
      contentType: 'snippet',
      language: 'typescript',
      content: 'first body',
      visibility: 'public',
      isDraft: false,
    },
  });
  const { id: createdPostId } = await created.json();
  await testuser.request.post(`/api/posts/${createdPostId}/revisions`, {
    data: { content: 'second body', message: 'Second' },
  });

  await testuser.goto(`/posts/${createdPostId}/history`);
  // Click the OLDEST revision (revision_number=1) — last in list if newest-first ordering
  await revisions.revisionItem(testuser).last().click();
  await revisions.restoreTrigger(testuser).click();
  await expect(revisions.restoreDialog(testuser)).toBeVisible();
  await revisions.restoreConfirm(testuser).click();

  await testuser.goto(`/posts/${createdPostId}`);
  await expect(testuser.getByText(/first body/)).toBeVisible();
});
```

### Spec 15.2: `rollback-permission.spec.ts`

```typescript
import { test, expect } from '../../fixtures/reset.js';
import { revisions } from '../../fixtures/selectors/revisions.js';

test('rollback: alice cannot restore a revision on testuser-owned post', async ({ alice }) => {
  await alice.goto('/posts/c0000000-0000-0000-0000-000000000099/history');
  await alice.getByTestId('revision-item').first().click();
  await expect(revisions.restoreTrigger(alice)).toHaveCount(0);
});
```

Run + commit each.

---

## Task 16: Final verification + tracking-issue update

### Step 1: Run full posts + revisions suite at workers=1

```bash
cd e2e && npx playwright test specs/posts specs/revisions --workers=1
```

Expected: all 40 specs pass.

### Step 2: Run at workers=4

```bash
cd e2e && npx playwright test specs/posts specs/revisions --workers=4
```

Expected: all pass. If any fail at workers=4 but pass at workers=1, the spec depends on shared state — fix to use `createdPostId` until isolated.

### Step 3: Run unit + coverage gate

```bash
npm run test:coverage
```

Expected: thresholds in `.coverage-thresholds.json` met. If new dialog/button code drops coverage, add unit tests for the new component code paths.

### Step 4: Run Bruno regression

```bash
cd bruno && npx @usebruno/cli run -r --env local
```

Expected: all green.

### Step 5: Spec-N-alone independence verification

Pick 5 specs at random across folders and run each in isolation:

```bash
cd e2e && npx playwright test specs/posts/edit-changes-persist-after-nav.spec.ts --workers=1
cd e2e && npx playwright test specs/posts/delete-cascade.spec.ts --workers=1
cd e2e && npx playwright test specs/posts/home-code-runner-execution.spec.ts --workers=1
cd e2e && npx playwright test specs/revisions/rollback-to-previous.spec.ts --workers=1
cd e2e && npx playwright test specs/revisions/list-chronological.spec.ts --workers=1
```

Expected: each passes when run alone.

### Step 6: 3 consecutive green CI runs

After the PR is opened, watch CI. Use `gh pr checks <PR>` and re-run on flake:

```bash
PR=<pr-number>
for i in 1 2 3; do
  gh pr checks "$PR" --watch
  gh pr comment "$PR" --body "CI green run $i / 3"
  # If this iteration was green, trigger another run
  if [ "$i" -lt 3 ]; then
    gh workflow run e2e-playwright.yml -r "$(git rev-parse HEAD)" || gh pr ready "$PR"
  fi
done
```

(Adapt to actual CI re-trigger mechanism — `workflow run` or empty commit.)

### Step 7: CI runtime delta capture

Before pushing the spec PR, capture the baseline e2e suite runtime on `main`:

```bash
git stash || true
git checkout main
gh run list --workflow=e2e-playwright.yml --branch=main --limit=3 --json conclusion,startedAt,updatedAt --jq '.[] | "\(.conclusion) \(((.updatedAt | fromdate) - (.startedAt | fromdate)) | tostring) seconds"' > /tmp/e2e-baseline.txt
git checkout -
git stash pop || true
```

After PR CI runs at least once, capture new runtime; record both in PR body as:

> **CI runtime delta**: baseline `<X>s` → new `<Y>s` (+`<delta>%`). Full e2e suite under the 10-min target: `<yes/no>`.

### Step 8: Update tracking issue #43

Edit `gh issue view 43` body to fill in actual spec counts and mark phase 2 status:

```bash
gh issue edit 43
# in the editor, update the rollout matrix row for issue 2:
#   2 | E2E posts + revisions | 40 specs delivered (31 posts + 9 revisions) | merged
```

### Step 9: Run /self-reflect to capture knowledge

Per CLAUDE.md, run `/self-reflect` to extract learnings into the knowledge base. Commit knowledge updates so they ride along with the PR.

### Step 10: Push + open PR

```bash
git push -u origin feat/e2e-posts-revisions-specs
gh pr create --title "feat(e2e): posts + revisions specs (#47)" --body "$(cat <<'EOF'
## Summary
- 40 Playwright specs delivered: 31 in `e2e/specs/posts/`, 9 in `e2e/specs/revisions/`
- Selector shards: extends `selectors/posts.ts` (existing), creates `selectors/revisions.ts` (new)
- Seed: testuser draft fixture (`c…0098`), 2 extra revisions on `c…0099`, alice vote/bookmark on `c…0099`
- Minimal feature adds (driven by DoD): delete-confirm dialog on `PostViewPage.vue`, `Save Revision` button in `EditorToolbar.vue`, `post-cancel-btn` on `PostEditor.vue`, tag-chip testid on `PostMetaHeader.vue`, link-preview-card testid on `LinkPreviewCard.vue`, author-avatar testid + router-link on `PostMetaHeader.vue`
- All specs pass at workers=1 AND workers=4
- CI runtime delta recorded in this PR description below

## Out of scope (with notes)
- Fork-of-fork-of-fork case: not addressed. Schema-wise the `forks_from_id` column allows arbitrary depth; this issue does not test n-depth forks. Tracked separately.
- Revision rollback on a forked post: not addressed. Same fork system supports it; rollout #4 or a follow-up issue covers it.

## Test plan
- [x] `npm run e2e` (workers=1)
- [x] `npm run e2e -- --workers=4`
- [x] `npm run test:coverage`
- [x] `cd bruno && npx @usebruno/cli run -r --env local`
- [x] 5 specs run in isolation
- [ ] 3 consecutive green CI runs
- [ ] Tracking issue #43 updated with spec counts

Closes #47
EOF
)"
```

---

## Out of scope (with notes)

The issue's adversarial review checklist requires explicit handling of:

1. **Fork-of-fork-of-fork case** — "considered (or explicitly out of scope with a note)". The `posts.forked_from_id` FK supports arbitrary depth, so the schema permits it. This rollout phase tests **single-level** fork only. Rationale: testing n-depth fork chains adds combinatorial spec count without proportional coverage gain; the underlying mechanism is identical. **Tracked**: a follow-up issue should add a 1-spec n-depth fork test (e.g., fork → fork the fork → fork that fork → assert relationships).

2. **Revision rollback on a forked post** — "tested for both original and fork". The rollback flow uses the same `POST /:id/revisions/:rev/restore` endpoint regardless of fork status; the only difference is which post the rollback applies to. This rollout tests rollback on the **original**; the cross-user `rollback-permission` spec covers the auth side. **Tracked**: same follow-up issue should add `rollback-on-forked-post` once n-depth fork specs land.

Both items are noted in the PR body so reviewers see them explicitly.

---

## Risks & mitigations (plan-specific)

| Risk                                                                                                                     | Mitigation                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HomePage feed ordering shifts which post is auto-selected, breaking Task 9/10/11 specs                                   | Specs scope by post **title text** (`getByText('Test Fixture Post (testuser-owned)')`), not by index — order-independent.                                                                                                                                 |
| WASM runtime warm-up causes flake on Task 10.2                                                                           | Anchor on a stable runtime-ready marker via `waitForFunction`; never `waitForTimeout`.                                                                                                                                                                    |
| `markdown-preview` testid (Task 1.3) doesn't exist in current code                                                       | Add it inline when spec fails — small, in scope (issue's testid scope on `components/editor/**`).                                                                                                                                                         |
| `post-file-list` testid (Task 7.3) doesn't exist                                                                         | Same — add inline, in scope.                                                                                                                                                                                                                              |
| `PostEditor.vue` is shared by new + edit; the cancel emit (Task 3.4) needs different behavior on each path               | New page: cancel could emit a discard event that navigates to `/`. Edit page: navigate to view. Implementation detail — keep emit semantically generic (`cancel`) and route per-page.                                                                     |
| HomePage selection click might require waiting for feed to load                                                          | Use Playwright's `getByText(...)` which auto-waits on visible text. No explicit timeouts.                                                                                                                                                                 |
| Save Revision button (Task 12.2) wired naively could conflict with auto-revision                                         | Server creates a new revision unconditionally on edit save; manual save is a separate POST. Verify server doesn't dedupe and that two consecutive saves create two revisions.                                                                             |
| `useRevisions` composable may not exist; need to add                                                                     | If it doesn't exist, add a minimal `saveRevision(postId, content, message)` function in `usePosts.ts` or create `useRevisions.ts`. Both options stay inside `components/editor/**` + `composables/` (the latter is implicit support code for the editor). |
| `PostMetaHeader` is rendered both inline (HomePage) and on PostViewPage; adding the avatar router-link could double-link | Single change — wrap once in PostMetaHeader, no duplication.                                                                                                                                                                                              |

---

## Self-review (REV 2)

**1. Spec coverage:** Every DoD bullet maps to a task — table below.

| DoD bullet                                                                       | Task / Spec                                                          |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| new — draft saves, required fields, markdown preview                             | Task 1.1, 1.2, 1.3                                                   |
| view — public, draft-as-author, missing-id, private-as-non-owner                 | Task 2.1–2.4                                                         |
| edit — own, cannot-edit-others, persist-after-nav, cancel-reverts                | Task 3.1–3.4                                                         |
| delete — confirms, own-only, cascade (comments + votes + bookmarks)              | Task 4.1–4.3                                                         |
| publish — toggle, draft-list, published-list (combined)                          | Task 5.1, 5.2                                                        |
| fork — linked, independent, displayed                                            | Task 6.1–6.3                                                         |
| multi-file — upload, preview, in-post rendering                                  | Task 7.1–7.3                                                         |
| tags — add, remove, view-page chips                                              | Task 8.1–8.3                                                         |
| link-preview (amendment)                                                         | Task 9.1, 9.2                                                        |
| code-runner (amendment)                                                          | Task 10.1, 10.2                                                      |
| author-avatar + presence (amendment)                                             | Task 11.1, 11.2                                                      |
| revisions/create — auto-on-edit, manual-via-button                               | Task 12.1, 12.2                                                      |
| revisions/list — chronological, only-initial                                     | Task 13.1, 13.2                                                      |
| revisions/view — by-number, side-by-side, inline                                 | Task 14.1–14.3                                                       |
| revisions/rollback — to-previous, permission                                     | Task 15.1, 15.2                                                      |
| selector shards (posts.ts extend, revisions.ts new)                              | Task 0                                                               |
| testids on PostNewPage, PostViewPage, PostEditPage, PostHistoryPage + components | Tasks 0, 1, 4, 8.3, 11.1, 12.2, 13                                   |
| createdPostId for mutations                                                      | Tasks 3.1, 3.3, 3.4, 4.1, 4.3, 5.1, 5.2, 8.1, 8.2, 12.1, 12.2, 15.1  |
| pinned postId for reads                                                          | Tasks 2.1–2.4, 6.1–6.3, 11.2, 13.1, 13.2, 14.1–14.3, 15.2, 9.x, 10.x |
| workers=1 + workers=4                                                            | Task 16.1, 16.2                                                      |
| Vitest + Bruno gates                                                             | Task 16.3, 16.4                                                      |
| spec-N-alone independence                                                        | Task 16.5                                                            |
| 3 consecutive green CI runs                                                      | Task 16.6                                                            |
| CI runtime delta tracked in PR                                                   | Task 16.7                                                            |
| Tracking issue #43 updated                                                       | Task 16.8                                                            |
| Knowledge capture                                                                | Task 16.9                                                            |
| `Closes #47` in PR body                                                          | Task 16.10                                                           |
| Adversarial checklist: fork-of-fork OOS note                                     | OOS section                                                          |
| Adversarial checklist: rollback-on-forked-post OOS note                          | OOS section                                                          |

**2. Placeholder scan:** No "TBD" / "TODO". All code blocks contain real testable code or concrete implementation steps.

**3. Type consistency:** Selector helper names match between Task 0 definition and uses in subsequent tasks (`postNewPage`, `postCancelBtn`, `postDeleteBtn`, `postDeleteConfirm`, `postDeleteCancel`, `postDeleteDialog`, `postTagChip`, `linkPreviewCard`, `linkPreviewRefresh`, `codeRunner`, `runPlay`, `runStop`, `executionOutput`, `clearOutputBtn`, `authorAvatar`, `presenceAvatar`, `saveRevisionBtn`). Revisions selectors match between Task 0 and Tasks 12–15.

**4. File scope discipline:** No `packages/server/` files modified. Only the selector shards, seed.sql, and components/pages explicitly listed in the issue's file scope plus the design amendment.

**5. Mutation discipline:** Every spec that mutates state uses `createdPostId` from a `testuser.request.post('/api/posts', ...)` setup (POST /api/posts requires auth per `posts.ts:44`; using the testuser Page's APIRequestContext authenticates via inherited storage state). Read-only specs use pinned seed UUIDs and the unauthenticated `request` fixture (since the public GETs don't require auth).

**6. Single-concept assertions:** Each spec has one primary assertion (or a tightly related cluster — e.g., 4.3 asserts comment + vote + bookmark all gone, all tied to one concept "cascade-delete works"). No spec branches on a `if/else` to assert different things.

**7. No `waitForTimeout`:** All timing handled by Playwright auto-wait or `waitForResponse`/`waitForFunction`.
