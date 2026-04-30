# Issues #63–#67 Post-#47 Follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. See "Execution Method" below — the user will pick at hand-off.

**Goal:** Land five issues together (#63 post-view tags, #64 LinkPreviewCard mount, #65 PostDetail panel render in e2e, #66 presence broadcast on join, #67 workers=4 flake fix) on a single branch with one PR, removing all five `test.fixme` markers and the `retries: 1` band-aid.

**Architecture:** Five logically-independent fixes spanning server (presence broadcast, post-tags query), shared types (`PostWithRevision.tags`), client (`LinkPreviewCard` mount + tag chips on `PostViewPage`), e2e (rate-limit/storageState hardening). Sequenced so reliability fixes (#67, #65) land first to make the downstream feature/fix verifications stable.

**Tech Stack:** Fastify 4, Postgres (`pg`), Vue 3, Pinia, Tailwind v4, Vite preview, Playwright, Bruno, Vitest.

**Branch:** `feat/post47-followups-63-67` (already created, based on `main`).

---

## Work Unit Sequencing & Dependencies

**WU labels are issue-bound identifiers; execution order honors the user's stated preference (#67→#65→#66→#63→#64) within the dependency constraints below.**

Dependency graph:

```
WU0 (prep)
   │
   ├── WU1 (#67 e2e flake hardening) ── orthogonal, lands first so downstream validation is reliable
   │
   ├── WU2 (#65 PostDetail panel render fix) ── prerequisite for WU5 verification
   │       │
   │       └── WU5 (#64 LinkPreviewCard mount) ── HomePage specs require WU2 done first
   │
   ├── WU3 (#66 presence broadcast on join) ── server-only, no dependencies
   │
   └── WU4 (#63 post-view tags) ── server + shared + client + Bruno, no dependencies
       │
       └── WU6 (final verification + PR) ── all 6 `test.fixme(` removed, full e2e at workers=4 retries=0 green
```

**Execution order (matches user's request):** WU1 → WU2 → WU3 → WU4 → WU5 → WU6 (which is exactly #67 → #65 → #66 → #63 → #64). #66 (WU3) and #63 (WU4) have zero dependencies, so they slot between #65 and #64 without conflict.

---

## Definition of Done (epic-level)

All five issues ship in this branch:

- [ ] Issue #63 closed: `GET /api/posts/:id` returns `tags`, `PostViewPage` renders `post-tag-chip-<name>`, the spec is un-fixme'd and passes.
- [ ] Issue #64 closed: `LinkPreviewCard` mounted on `PostDetail` (HomePage inline panel — the surface the e2e specs target), `data-testid="link-preview-card"` on root, refresh wired, two specs un-fixme'd and passing.
- [ ] Issue #65 closed: PostDetail panel renders at Playwright's default 1280×720; root cause documented; smoke spec asserts the panel.
- [ ] Issue #66 closed: server emits `presence:update` to all channel subscribers (including the joiner) on every authenticated `presence` frame, replacing the eviction-only emission path; spec un-fixme'd and passing. The issue body's "(excluding the joiner)" parenthetical is documented as relaxed in WU3's decision block (single-emission path; same observable behavior as broadcast-excluding-self + direct-send-to-self).
- [ ] Issue #67 closed: full e2e at `workers=4 --retries=0` passes; `retries: 1` band-aid removed from `playwright.config.ts`.
- [ ] All 6 `test.fixme(` markers removed from `e2e/specs/posts/`: 4 directly from issues #63/#64/#66 (1 tags + 2 link-preview + 1 presence) plus 2 `home-code-runner-*` specs (which were `test.fixme` against #65 and unblock once the panel-render fix lands — per #65's DoD bullet 3).
- [ ] **Server AND client coverage thresholds** in `.coverage-thresholds.json` met (no regressions in either package).
- [ ] All Bruno requests under `bruno/posts/` pass against a running server.
- [ ] PR description references all five issues with closes/fixes annotations.

---

## WU0: Branch prep & TaskCreate todos (5 minutes)

**Files:** none.

- [ ] **Step 0.1: Verify branch state**

```bash
git status
git log --oneline -5
```

Expected: clean tree, on `feat/post47-followups-63-67`, head is `3995dec`.

- [ ] **Step 0.2: Run the existing e2e suite once to capture the baseline**

```bash
cd e2e && npx playwright test specs/posts --workers=4 --retries=0 --reporter=list 2>&1 | tail -40
```

Expected: 4 specs marked `test.fixme` (skipped); other failures, if any, indicate a problem unrelated to this plan and must be reported back before starting.

- [ ] **Step 0.3: No commit needed for WU0** — proceed to WU1.

---

## WU1: Issue #67 — e2e workers=4 flake hardening

**Why first:** Every downstream WU's verification runs the e2e suite at workers=4. If those flakes remain, every WU validation step risks false negatives.

**Files:**

- Modify: `packages/server/src/routes/auth.ts` — add `E2E_MODE` rate-limit branch on `POST /refresh` (line 188 area, currently has no `config.rateLimit`). Pre-audit other auth routes for missing branches.
- Modify: `packages/server/src/routes/posts.ts` — IF the pre-audit (Step 1.1) finds rate-limit configs without an `E2E_MODE` branch on `/publish`, `/refresh-preview`, `/fork`, or `/revisions`, add the branch. Issue #67's repro section explicitly cites `POST /api/posts/:id/publish` non-2xx mid-test as a flake mode.
- Modify: `packages/server/src/routes/votes.ts`, `comments.ts`, `tags.ts` — same audit, same pattern. Apply only if a rate-limit config exists and lacks the E2E branch.
- Modify: `packages/server/src/plugins/rate-limit.ts` — confirm or raise the `E2E_MODE=1` global ceiling if 10_000/min is being exhausted (current value at line 12).
- Modify: `e2e/playwright.config.ts:17` — remove the `retries: process.env.CI ? 1 : 0` band-aid (revert to `retries: 0`).
- Modify (optional): `e2e/support/global-setup.ts` — keep as-is (already does once-per-suite login). Do NOT add per-worker re-login — the fixture re-uses storageState, so refresh-token churn comes from page-level usage, not setup.

**Investigation hypothesis (read first):** `POST /api/auth/refresh` carries no `config.rateLimit`, so it inherits the global plugin ceiling (`@fastify/rate-limit` `max=10_000` in E2E mode per `packages/server/src/plugins/rate-limit.ts:12`). 4 workers × N specs × auto-refresh hits could in theory exceed this for cold-cache CI runs. The likely real cause is **per-IP keying** — all workers share `127.0.0.1`, so the 10K bucket is shared. Verify by adding refresh-specific instrumentation, then either:

1. Add explicit `config.rateLimit: process.env.E2E_MODE === '1' ? { max: 10_000, timeWindow: '1 minute' } : <default>` on `/refresh` (matches the established `/login` pattern at `routes/auth.ts:130`).
2. If step 1 isn't enough, raise the global ceiling for E2E_MODE to `1_000_000` (effectively unlimited) — this is safe because non-E2E branch keeps the strict 100/min default.

**DoD bullets (verbatim from issue #67):**

- [ ] Full e2e suite passes at `workers=4` with `retries=0`
- [ ] Remove the `retries: process.env.CI ? 1 : 0` workaround from `e2e/playwright.config.ts`

**Steps:**

- [ ] **Step 1.1a: Pre-audit — enumerate every `config.rateLimit` and check for E2E_MODE branch**

```bash
grep -rn "config.*rateLimit\|rateLimit:" packages/server/src/routes/ | head -40
grep -rn "process.env.E2E_MODE" packages/server/src/routes/ | head -20
```

For every match: note (a) the route, (b) the production cap, (c) whether an `E2E_MODE` branch exists. Currently confirmed:

- `routes/auth.ts:127` — `/login` HAS E2E branch ✓
- `routes/auth.ts:76` — `/register` HAS E2E branch ✓
- `routes/auth.ts:188` — `/refresh` MISSING ✗ (WU1 fixes)
- Other matches — record and apply the same pattern if (a) the route is hit by the e2e suite AND (b) the production cap is below ~50/minute (which 4 workers can plausibly exhaust).

Do NOT modify routes that are not hit by e2e or whose production cap is already generous.

- [ ] **Step 1.1b: Reproduce the flake**

```bash
cd e2e && for i in 1 2 3; do npx playwright test specs/posts specs/revisions --workers=4 --retries=0 --reporter=list 2>&1 | tail -5; echo "---run $i---"; done
```

Expected: at least one of the three runs fails with a 429 on `/api/auth/refresh`, a non-2xx on `/publish`, or a `tag-input`/`published-badge` timeout. Capture the error in a scratch note for the implementer's record.

- [ ] **Step 1.2: Write the failing test for the auth refresh rate-limit branch**

Add to `packages/server/src/__tests__/routes/auth.test.ts` (find the existing `describe('POST /refresh')` block; add a sibling `it`):

```typescript
it('lifts rate-limit cap on /refresh when E2E_MODE=1', async () => {
  process.env.E2E_MODE = '1';
  // Build app afresh so the rate-limit config picks up the env
  const testApp = await buildTestApp();
  // 200 requests in tight succession should all succeed (none hit 429)
  for (let i = 0; i < 200; i++) {
    const res = await testApp.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      cookies: { refresh_token: 'invalid' }, // we expect 401, not 429
    });
    expect(res.statusCode).toBe(401);
  }
  delete process.env.E2E_MODE;
  await testApp.close();
});
```

- [ ] **Step 1.3: Run it; expect FAIL with at least one 429**

```bash
cd packages/server && npx vitest run src/__tests__/routes/auth.test.ts -t "E2E_MODE"
```

Expected: FAIL — without the per-route exemption the global limiter or any default plugin keying may surface a 429 in the burst.

- [ ] **Step 1.4: Add the per-route E2E_MODE rate-limit branch**

Edit `packages/server/src/routes/auth.ts` around the `POST /refresh` handler at line 188. Wrap the registration with a `config: { rateLimit: ... }` block matching the pattern used by `/login` (see `routes/auth.ts:127–134`):

```typescript
app.post(
  '/refresh',
  {
    config: {
      // Workers=4 e2e runs hit /refresh many times across 3 fixtures + per-spec
      // page navigations. Lift the per-route cap when E2E_MODE=1 so cross-test
      // bursts can't surface as 429s. Production branch unchanged.
      rateLimit:
        process.env.E2E_MODE === '1'
          ? { max: 10_000, timeWindow: '1 minute' }
          : { max: 30, timeWindow: '1 minute' },
    },
  },
  async (request, reply) => {
    // ...existing handler body unchanged...
  },
);
```

- [ ] **Step 1.5: Run the test; expect PASS**

```bash
cd packages/server && npx vitest run src/__tests__/routes/auth.test.ts -t "E2E_MODE"
```

Expected: PASS.

- [ ] **Step 1.6: Run the full server test suite (no regressions)**

```bash
cd packages/server && npm test
```

Expected: all green.

- [ ] **Step 1.6b: Apply E2E_MODE branch to additional routes flagged by the pre-audit**

For each route flagged in Step 1.1a as hit-by-e2e + low-cap + no-E2E-branch, add a `config.rateLimit` block matching the `/refresh` pattern from Step 1.4. After each, re-run the offending spec to confirm the 429 / failure is gone before moving on. If the audit found zero additional offenders, mark this step done and skip.

- [ ] **Step 1.7: Remove the retries band-aid from playwright config**

Edit `e2e/playwright.config.ts:17` — change `retries: process.env.CI ? 1 : 0` → `retries: 0`. Remove the comment about workers=4 absorption (lines 13–16); replace with a one-liner comment: `// Specs run deterministically at workers=4 once auth-rate-limit + reset-window contention are addressed (issue #67).`

- [ ] **Step 1.8: Run the full e2e suite at workers=4 retries=0 three times in a row**

```bash
cd e2e && for i in 1 2 3; do npx playwright test --workers=4 --retries=0 --reporter=list 2>&1 | tail -10; echo "---run $i---"; done
```

Expected: 3/3 runs green (excluding the 4 `test.fixme`s — those count as skipped, not failures).

If any run fails, identify the offending endpoint(s) and apply the same E2E_MODE branch pattern (`votes`, `comments`, `tags` routes — already audited but verify). DO NOT re-introduce retries.

- [ ] **Step 1.9: Coverage check**

```bash
cd packages/server && npx vitest run --coverage
```

Expected: thresholds in `.coverage-thresholds.json` met for the modified files.

- [ ] **Step 1.10: Commit**

```bash
git add packages/server/src/routes/auth.ts packages/server/src/__tests__/routes/auth.test.ts e2e/playwright.config.ts
git commit -m "fix(e2e): lift /auth/refresh rate-limit in E2E_MODE; remove retries band-aid (#67)"
```

---

## WU2: Issue #65 — PostDetail panel render in e2e

**Why second:** WU5 (LinkPreviewCard) needs the HomePage path working to verify its specs.

**Files:**

- Modify: `packages/client/src/pages/HomePage.vue:17` — possibly change the `hidden flex-1 md:block` surface; depends on root cause.
- Inspect: `packages/client/tailwind.config*` (if any), `packages/client/src/main.ts`, `packages/client/src/style.css` (or equivalent) — Tailwind v4 entry point.
- Inspect: `packages/client/vite.config.ts` for `@tailwindcss/vite` setup.
- Add: `e2e/specs/posts/home-postdetail-panel-renders.spec.ts` — smoke spec asserting `<PostDetail>`'s container is in DOM and visible at 1280×720.

**Investigation hypothesis (most → least likely):**

1. **Tailwind v4 purging `md:block`** — Tailwind v4 uses content-based class detection. If only one file (`HomePage.vue:17`) emits `md:block`, the production build _should_ still pick it up — but check the actual emitted CSS via:

   ```bash
   cd packages/client && npm run build && grep -E "@media.*768|md\\\\:block|hidden" dist/assets/*.css | head -20
   ```

   If `md:block` is missing from prod CSS, force inclusion via a Tailwind safelist or by ensuring at least one always-rendered surface uses `md:block`.

2. **`display:none` + Playwright accessibility-tree snapshot** — Playwright's text snapshot in the issue may simply be hiding the panel due to `display:none` rather than DOM-absence. Verify with:

   ```typescript
   // in a temporary spec
   const html = await page.content();
   console.log(html.includes('hidden flex-1 md:block')); // true means present, just hidden
   ```

   If the markup IS present but `display:none`, the cause is media-query (Tailwind purge) — go to fix #1.

3. **PostDetail's `v-if="post"` is null** — `PostDetail.vue:2` short-circuits when `post` is null; auto-select on `posts` watcher should set `selectedPost`. Verify by logging `selectedPost.value` from a temp watcher.

**Most likely fix:** explicit safelist of `md:block` (or change the responsive scheme entirely).

**Recommended fix (Option A — safelist):** Add to the Tailwind theme block (likely `packages/client/src/style.css` per memory `project_tailwind_v4.md` — uses `@theme` not `tailwind.config.*`):

```css
/* Safelist: ensure md:block is always emitted in prod CSS even if HomePage is the only consumer. */
@source inline("md:block hidden");
```

(Tailwind v4 uses `@source inline(...)` for safelisting; verify against actual project conventions.)

**Recommended fix (Option B — restructure):** Replace `hidden flex-1 md:block` with an always-block surface and conditionally render PostDetail:

```vue
<div class="flex-1">
  <PostDetail v-if="$mq.md" :post="selectedPost" />
</div>
```

But this requires a `useMediaQuery` composable (or similar). Option A is cheaper.

**DoD bullets (verbatim from issue #65):**

- [ ] Diagnose why PostDetail panel isn't in DOM at Playwright's default desktop viewport
- [ ] Fix root cause (Tailwind config, viewport, or PostDetail mounting logic)
- [ ] Re-enable `test.fixme` specs in WU10 (the two `home-code-runner-*.spec.ts`) and WU9 (link-preview specs — un-fixme'd by WU5 of this plan)
- [ ] Add a smoke spec that asserts PostDetail panel is rendered at 1280×720 with a selected post

**Steps:**

- [ ] **Step 2.1: Diagnose — capture current preview-build CSS**

```bash
cd packages/client && npm run build 2>&1 | tail -5 && grep -lE "md:block|md\\\\:block" dist/assets/*.css 2>/dev/null
```

Capture findings. If no match, hypothesis #1 confirmed.

- [ ] **Step 2.2: Confirm DOM-vs-display via temporary spec**

Add `e2e/specs/posts/_diagnose-postdetail.spec.ts` (deleted after WU2):

```typescript
import { test, expect } from '../../fixtures/reset.js';

test('diagnose: PostDetail panel DOM presence', async ({ alice }) => {
  await alice.goto('/');
  const panelMarkupPresent = await alice.evaluate(() =>
    document.body.innerHTML.includes('hidden flex-1 md:block'),
  );
  console.log('panel-markup-present', panelMarkupPresent);
  const panel = alice.locator('div.hidden.flex-1.md\\:block');
  console.log('panel-count', await panel.count());
  console.log(
    'panel-is-visible',
    await panel
      .first()
      .isVisible()
      .catch(() => 'n/a'),
  );
  // Take a screenshot so we have visual confirmation
  await alice.screenshot({ path: '/tmp/postdetail-diag.png', fullPage: true });
});
```

```bash
cd e2e && npx playwright test specs/posts/_diagnose-postdetail.spec.ts --reporter=list
```

Expected output reveals whether markup is present and whether it's hidden.

- [ ] **Step 2.3: Apply the fix matching the diagnosis**

If hypothesis #1 (Tailwind purge): edit the Tailwind v4 entry CSS (likely `packages/client/src/style.css`) to add a safelist of `md:block` and `hidden`. Find the existing `@theme` directive and add:

```css
@source inline("md:block hidden flex-1");
```

If hypothesis #3 (PostDetail v-if): trace `useFeed.selectPost` and ensure auto-select fires before Playwright queries.

- [ ] **Step 2.4: Rebuild and re-verify**

```bash
cd packages/client && npm run build && grep -E "md:block|md\\\\:block" dist/assets/*.css | head -5
```

Expected: at least one match.

- [ ] **Step 2.5: Re-run the diagnose spec; expect panel visible**

```bash
cd e2e && npx playwright test specs/posts/_diagnose-postdetail.spec.ts --reporter=list
```

Expected: `panel-is-visible: true`, `panel-count: 1`.

- [ ] **Step 2.6a: Add a stable testid to the PostDetail panel container**

Edit `packages/client/src/pages/HomePage.vue:17` — add `data-testid="postdetail-panel"`:

```vue
<div data-testid="postdetail-panel" class="hidden flex-1 md:block">
  <PostDetail :post="selectedPost" />
</div>
```

This testid is the smoke-spec's anchor — independent of any inner content rendered by PostDetail.

- [ ] **Step 2.6b: Write the smoke spec (replaces the diagnose spec)**

Create `e2e/specs/posts/home-postdetail-panel-renders.spec.ts`:

```typescript
import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';

test('home: PostDetail panel renders at default desktop viewport with a selected post', async ({
  alice,
}) => {
  // Default Playwright viewport is 1280×720 (Desktop Chrome) — the md: breakpoint.
  await alice.goto('/');

  // Assert the panel container is in the DOM AND visible (i.e. md:block applied).
  const panel = alice.getByTestId('postdetail-panel');
  await expect(panel).toBeVisible();

  // Auto-select picks the first post; assert PostDetail rendered the post-author
  // surface (a stable inner testid). This affirmatively verifies "with a selected
  // post" — DoD bullet 4.
  await expect(panel.getByTestId('author-avatar').first()).toBeVisible();
});
```

- [ ] **Step 2.7: Delete the diagnose spec**

```bash
rm e2e/specs/posts/_diagnose-postdetail.spec.ts
```

- [ ] **Step 2.8: Run the smoke spec at workers=4 retries=0**

```bash
cd e2e && npx playwright test specs/posts/home-postdetail-panel-renders.spec.ts --workers=4 --retries=0 --reporter=list
```

Expected: PASS.

- [ ] **Step 2.8b: Un-fixme the two `home-code-runner-*` specs (issue #65 DoD bullet 3)**

The two specs `e2e/specs/posts/home-code-runner-on-snippet.spec.ts` and `home-code-runner-execution.spec.ts` were `test.fixme`'d in #47 WU10 because they target the HomePage inline panel that wasn't rendering — exactly what WU2 fixes. Edit each:

- Replace `test.fixme(` with `test(`.
- Trim the FIXME comment block to a one-liner pointing at #65.

Then run them at workers=4 retries=0:

```bash
cd e2e && npx playwright test specs/posts/home-code-runner-on-snippet.spec.ts specs/posts/home-code-runner-execution.spec.ts --workers=4 --retries=0 --reporter=list
```

Expected: PASS. If they still fail, the root cause from Step 2.1 may be incomplete — investigate before moving to WU3 (presence).

- [ ] **Step 2.9: Vitest unit tests untouched (no client unit changes if Option A)**

```bash
cd packages/client && npm test
```

Expected: all green. (If Option B was used, write a unit test for the new `useMediaQuery` mounting logic.)

- [ ] **Step 2.10: Commit**

```bash
git add packages/client/src/pages/HomePage.vue \
  packages/client/src/assets/main.css \
  e2e/specs/posts/home-postdetail-panel-renders.spec.ts \
  e2e/specs/posts/home-code-runner-on-snippet.spec.ts \
  e2e/specs/posts/home-code-runner-execution.spec.ts
git commit -m "fix(client): safelist md:block + add postdetail-panel testid; un-fixme code-runner specs (#65)"
```

Adjust `git add` to the actual files modified — the entry CSS file is most likely `packages/client/src/assets/main.css` (verified during diagnosis); fall back to whatever Tailwind v4 entry CSS the project uses. Document the actual root cause in the commit body.

---

## WU3: Issue #66 — presence:update broadcast on join

**Files:**

- Modify: `packages/server/src/plugins/websocket/handler.ts:207–220` — after `deps.presence.update(...)`, broadcast `presence:update` to channel subscribers.
- Modify (extend): `packages/server/src/__tests__/plugins/websocket/handler.test.ts` (if it exists) or add unit test that verifies the broadcast.
- Edit: `e2e/specs/posts/view-presence-indicator.spec.ts:26` — remove `test.fixme`.

**DoD bullets (verbatim from issue #66):**

- [ ] Server broadcasts `presence:update` to channel subscribers (excluding the joiner) on initial registration
- [ ] Optionally also on heartbeat to refresh client snapshot
- [ ] Re-enable `e2e/specs/posts/view-presence-indicator.spec.ts` (currently `test.fixme`) once broadcast-on-join lands

**Decision:** Broadcast `presence:update` to ALL channel subscribers (including the joiner) on every authenticated `presence` frame. Documented deviation from issue #66's "(excluding the joiner)" parenthetical:

- The DoD's CORE requirement is "Server broadcasts `presence:update` to channel subscribers on initial registration." The "(excluding the joiner)" parenthetical was the issue author's proposed implementation detail.
- The e2e spec asserts the joiner sees their OWN avatar (`PresenceIndicator` renders one chip per viewer). With "excluding the joiner," the joiner would never receive a snapshot and `viewers.length` stays 0 — same bug as before.
- Three resolutions were considered:
  1. **Broadcast to all (chosen).** One emission path. Joiner immediately sees themselves. PresenceIndicator's existing de-dup-by-userId is the right place for that responsibility.
  2. Broadcast excluding self + direct-send to self. Two emission paths. Slightly more code; same observable behavior.
  3. Broadcast excluding self + client-side self-insert. Spreads logic across client and server.
- Choosing #1 for simplicity. Will note in the commit message and PR description that the issue body's parenthetical is being relaxed; the issue author can confirm or push back.

Broadcast on every authenticated `presence` frame (initial + heartbeat) — covers DoD bullet 2 ("optionally also on heartbeat") for free.

**Steps:**

- [ ] **Step 3.1a: Extend the test harness (`createDeps`) to support broadcast + getViewers**

The existing harness in `packages/server/src/__tests__/plugins/websocket/handler.test.ts` (lines 49–63) defines `createDeps()` with `presence: { update: vi.fn() }` and `channels: { subscribe, unsubscribe, removeFromAll }` only. WU3's handler edit (Step 3.3 below) calls `deps.channels.broadcast(...)` and `deps.presence.getViewers(...)` — both must be added to the stub or the production code throws `TypeError: ... is not a function`. Edit `createDeps()`:

```typescript
function createDeps() {
  return {
    connections: {
      addConnection: vi.fn(),
      removeConnection: vi.fn(),
    } as unknown as ConnectionManager,
    channels: {
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      removeFromAll: vi.fn(),
      broadcast: vi.fn(),
    } as unknown as ChannelManager,
    presence: {
      update: vi.fn(),
      getViewers: vi.fn().mockReturnValue([]),
    } as unknown as PresenceTracker,
  };
}
```

Verify the existing tests still pass after this stub extension:

```bash
cd packages/server && npx vitest run src/__tests__/plugins/websocket/handler.test.ts
```

Expected: PASS — additive stub has no behavior change for existing tests.

- [ ] **Step 3.1b: Write a failing unit test for the broadcast path**

Add inside the existing `describe('handleConnection', () => { ... })` block. The harness uses `fakeSocket` (NOT `socket`), `fakeApp`, `fakeReq`, and `_handlers` to dispatch events (NOT `.emit`). Match the harness verbatim:

```typescript
it('broadcasts presence:update to all channel subscribers when an authenticated presence frame arrives', () => {
  // Arrange: ensure getViewers returns a populated snapshot
  const fakeUsers = [
    {
      id: 'user-1',
      email: 'test@example.com',
      displayName: 'Test User',
      avatarUrl: null,
      authProvider: 'local',
      createdAt: new Date(0),
      updatedAt: new Date(0),
    },
  ];
  (deps.presence.getViewers as ReturnType<typeof vi.fn>).mockReturnValue(fakeUsers);

  handleConnection(
    fakeApp as Parameters<typeof handleConnection>[0],
    fakeSocket as unknown as Parameters<typeof handleConnection>[1],
    fakeReq,
    deps,
  );

  // Act: auth then presence
  fakeSocket._handlers['message']!(JSON.stringify({ type: 'auth', token: 'tok' }));
  fakeSocket._handlers['message']!(JSON.stringify({ type: 'presence', channel: 'post:abc' }));

  // Assert: broadcast called with full snapshot (no excludeWs — Decision: broadcast to all)
  expect(deps.channels.broadcast).toHaveBeenCalledWith('post:abc', {
    type: 'presence:update',
    channel: 'post:abc',
    data: { users: fakeUsers },
  });
});

it('updates presence tracker before broadcasting (order matters for snapshot freshness)', () => {
  handleConnection(
    fakeApp as Parameters<typeof handleConnection>[0],
    fakeSocket as unknown as Parameters<typeof handleConnection>[1],
    fakeReq,
    deps,
  );
  fakeSocket._handlers['message']!(JSON.stringify({ type: 'auth', token: 'tok' }));
  fakeSocket._handlers['message']!(JSON.stringify({ type: 'presence', channel: 'post:abc' }));

  const updateOrder = (deps.presence.update as ReturnType<typeof vi.fn>).mock
    .invocationCallOrder[0];
  const broadcastOrder = (deps.channels.broadcast as ReturnType<typeof vi.fn>).mock
    .invocationCallOrder[0];
  expect(updateOrder).toBeLessThan(broadcastOrder);
});
```

- [ ] **Step 3.2: Run it; expect FAIL**

```bash
cd packages/server && npx vitest run src/__tests__/plugins/websocket/handler.test.ts -t "broadcasts presence"
```

Expected: FAIL — broadcast not called.

- [ ] **Step 3.3: Fix handler.ts**

Edit `packages/server/src/plugins/websocket/handler.ts:207–220` (the `if (type === 'presence')` block). After `deps.presence.update(...)`, broadcast the full viewer snapshot to all channel subscribers (Decision: include the joiner — see decision block above):

```typescript
if (type === 'presence') {
  const result = presenceMessageSchema.safeParse(parsed);
  if (result.success && userId) {
    const user = jwtToUser(
      app.jwt.verify(storedToken as string) as {
        id: string;
        email: string;
        displayName: string;
      },
    );
    deps.presence.update(result.data.channel, userId, user);
    deps.channels.broadcast(result.data.channel, {
      type: 'presence:update',
      channel: result.data.channel,
      data: { users: deps.presence.getViewers(result.data.channel) },
    });
  }
  return;
}
```

Schema compatibility verification (per Feasibility review concern): `packages/shared/src/types/websocket.ts:35–43` defines `userSchema` with `avatarUrl: z.string().nullable()`, `authProvider: z.string()`, `createdAt`/`updatedAt: z.union([z.string(), z.date()])`. `jwtToUser()` at `handler.ts:30–40` populates: `avatarUrl: null`, `authProvider: 'local' as const`, `createdAt: new Date(0)`, `updatedAt: new Date(0)`. Every required field of `userSchema` is satisfied. The broadcast payload validates against `presenceUpdateMessageSchema` at `websocket.ts:161–165`. No schema work needed.

- [ ] **Step 3.4: Run the unit test; expect PASS**

```bash
cd packages/server && npx vitest run src/__tests__/plugins/websocket/handler.test.ts
```

Expected: PASS.

- [ ] **Step 3.5: Run the full server suite (no regressions)**

```bash
cd packages/server && npm test
```

Expected: all green.

- [ ] **Step 3.6: Un-fixme the e2e spec**

Edit `e2e/specs/posts/view-presence-indicator.spec.ts:26` — `test.fixme(` → `test(`. Replace the FIXME comment block (lines 10–25) with a one-liner: `// Issue #66: server broadcasts presence:update on every presence frame (handler.ts:217).`

- [ ] **Step 3.7: Run the spec at workers=4 retries=0**

```bash
cd e2e && npx playwright test specs/posts/view-presence-indicator.spec.ts --workers=4 --retries=0 --reporter=list
```

Expected: PASS.

- [ ] **Step 3.8: Coverage check**

```bash
cd packages/server && npx vitest run --coverage
```

Expected: thresholds met.

- [ ] **Step 3.9: Commit**

```bash
git add packages/server/src/plugins/websocket/handler.ts \
  packages/server/src/__tests__/plugins/websocket/handler.test.ts \
  e2e/specs/posts/view-presence-indicator.spec.ts
git commit -m "fix(ws): broadcast presence:update on every authenticated presence frame (#66)"
```

---

## WU4: Issue #63 — `/posts/:id` returns tags, PostViewPage renders tag chips

**Type-cascade reality:** Adding required `tags: string[]` to `PostWithRevision` breaks 12+ test fixture sites. The Completeness reviewer enumerated them; they are listed below as a pre-mapped step.

**Files (production code):**

- Modify: `packages/shared/src/types/post.ts:16–19` — extend `PostWithRevision` with `tags: string[]`.
- Modify: `packages/server/src/db/queries/posts.ts:69–75` — `findPostWithLatestRevision`: add `string_agg` tags subquery (mirror `findFeedPostById` at `db/queries/feed.ts:38–43`).
- Modify: `packages/server/src/db/queries/types.ts` — extend `PostWithRevisionRow` with `tags: string | null`.
- Modify: `packages/server/src/services/posts.ts:52–70` — `toPostWithRevision`: emit `tags: row.tags ? row.tags.split(',') : []`.
- Modify: `packages/client/src/pages/PostViewPage.vue` — render tag chips inline in the existing meta-block (lines 174–178 area), using `data-testid="post-tag-chip-${tag}"`. Do NOT modify `buildPostForActions` — keep `tags: []` synth as-is (out of scope for this issue).
- Modify: `bruno/posts/get-post.bru` — add a `tests` block with a JS assertion on the response body's `tags` array.

**Files (test fixtures that construct `PostWithRevision` or `PostWithRevisionRow` literals — MUST be updated to include `tags`):**

Server:

- Modify: `packages/server/src/__tests__/db/queries/posts.test.ts:205` — `samplePostWithRevision: PostWithRevisionRow` (add `tags: null`).
- Modify: `packages/server/src/__tests__/routes/posts-visibility.test.ts:68, 76` — two PostWithRevisionRow literals (add `tags: null` to each).
- Modify: `packages/server/src/__tests__/routes/posts-fork-files.test.ts:104` — `sourceWithRevisionRow` (add `tags: null`).
- Modify: `packages/server/src/__tests__/routes/posts.test.ts:104` — `samplePostWithRevisionRow` (add `tags: null`).
- Modify: `packages/server/src/__tests__/services/posts.test.ts:34` — `samplePostWithRevisionRow` (add `tags: null`).

Shared:

- Modify: `packages/shared/src/__tests__/validators/post.test.ts:598` — `PostWithRevision` literal (add `tags: []`).
- Modify: `packages/shared/src/__tests__/types/file.test.ts` — `basePost: PostWithRevision` literal at line ~75 + 3 spread sites (`{ ...basePost, ... }`) at lines ~97, 102, 126. Add `tags: []` to `basePost`; spread sites inherit it. Verify by re-running `npx tsc --noEmit` after the edit.

Client:

- Modify: `packages/client/src/__tests__/composables/usePosts.test.ts:7` — `createMockPost` (add `tags: []`).
- Modify: `packages/client/src/__tests__/composables/useVotes.test.ts:314` — `makePostWithRevision` (add `tags: []`).
- Modify: `packages/client/src/__tests__/stores/posts.test.ts:7` — `createMockPost` (add `tags: []`).
- Modify: `packages/client/src/__tests__/pages/PostEditPage.test.ts:64` — `createMockPost` (add `tags: []`).
- Modify: `packages/client/src/__tests__/pages/PostViewPage.test.ts:147` — `createMockPost` (add `tags: []`).
- Modify: `packages/client/src/__tests__/components/post/PostDetail.test.ts:86` — `mockPostWithRevision: PostWithRevision` (add `tags: []`).

**Files (route-level test additions):**

- Modify: `packages/server/src/__tests__/routes/posts.test.ts` — add a test that `GET /:id` returns `tags`.
- Modify: `packages/server/src/__tests__/services/posts.test.ts` — `toPostWithRevision` emits tags (3 cases: populated, null, empty string).
- Modify: `packages/client/src/__tests__/pages/PostViewPage.test.ts` — assert tag-chip rendering.

**Files (e2e):**

- Edit: `e2e/specs/posts/tags-view-page-shows-chips.spec.ts:17` — remove `test.fixme`.

**DoD bullets (verbatim from issue #63):**

- [ ] `GET /api/posts/:id` response includes `tags: string[]`
- [ ] `PostViewPage.vue` renders one `data-testid="post-tag-chip-<name>"` per tag
- [ ] Re-enable `e2e/specs/posts/tags-view-page-shows-chips.spec.ts`
- [ ] Vitest unit tests for the new field + render
- [ ] Bruno spec asserts the new field on the response

**Steps:**

- [ ] **Step 4.1: Extend the shared type**

Edit `packages/shared/src/types/post.ts:16–19`:

```typescript
export interface PostWithRevision extends Post {
  revisions: PostRevision[];
  tags: string[];
  files?: PostFile[];
}
```

- [ ] **Step 4.2: Rebuild @forge/shared**

```bash
cd packages/shared && npm run build
```

Per memory `project_shared_package_dist_staleness.md`: server typecheck reads the dist, not src. Rebuild is mandatory.

- [ ] **Step 4.2b: Pre-test type widening — extend `PostWithRevisionRow` AND update every literal**

Two things must happen before the failing test in Step 4.3 can compile:

1. Widen `PostWithRevisionRow` (server-side row type) so `tags: string | null` is allowed.
2. Update every `PostWithRevision` and `PostWithRevisionRow` literal to satisfy the now-required `tags` field.

**(a)** Edit `packages/server/src/db/queries/types.ts` — find `PostWithRevisionRow` and extend:

```typescript
export type PostWithRevisionRow = PostRow & {
  revision_id: string;
  content: string;
  revision_number: number;
  message: string | null;
  tags: string | null;
};
```

(If the existing type already differs in shape, reconcile — preserve every existing field and add `tags: string | null`.)

**(b)** Add `tags: null` (for `PostWithRevisionRow` literals) or `tags: []` (for `PostWithRevision` literals) to every site enumerated in the "Files (test fixtures)" list above. Use a single sweep:

```bash
grep -rn "PostWithRevision\b\|PostWithRevisionRow" packages/ --include="*.ts" --include="*.vue" | grep -v "node_modules\|/dist/" | head -60
```

Cross-check against the enumerated list. Any site not in the list that constructs a literal must also be updated. Run `npx tsc --noEmit` after each package to confirm:

```bash
cd packages/shared && npx tsc --noEmit
cd ../server && npx tsc --noEmit
cd ../client && npx vue-tsc --noEmit
```

Expected: zero errors after all literals are updated.

- [ ] **Step 4.3: Write a failing test for `toPostWithRevision` emitting tags**

Edit `packages/server/src/__tests__/services/posts.test.ts`. Add three cases:

```typescript
it('toPostWithRevision splits the comma-separated tags column into an array', () => {
  const row = { ...samplePostWithRevisionRow, tags: 'rust,typescript' };
  const dto = toPostWithRevision(row);
  expect(dto.tags).toEqual(['rust', 'typescript']);
});

it('toPostWithRevision returns empty tags when row.tags is null', () => {
  const row = { ...samplePostWithRevisionRow, tags: null };
  const dto = toPostWithRevision(row);
  expect(dto.tags).toEqual([]);
});

it('toPostWithRevision returns empty tags when row.tags is empty string', () => {
  const row = { ...samplePostWithRevisionRow, tags: '' };
  const dto = toPostWithRevision(row);
  expect(dto.tags).toEqual([]);
});
```

Note the third case: empty string must produce `[]` not `['']`. This means the implementation in Step 4.7 must check truthiness of the string (which it does — `row.tags ? row.tags.split(',') : []` — empty string is falsy).

- [ ] **Step 4.4: Run; expect FAIL**

```bash
cd packages/server && npx vitest run src/__tests__/services/posts.test.ts -t "tags"
```

Expected: FAIL — `tags` is undefined.

- [ ] **Step 4.5: (Already done in Step 4.2b) — confirm `PostWithRevisionRow` carries `tags: string | null`**

Step 4.2b widened `PostWithRevisionRow` so the test in Step 4.3 could compile. Re-verify by reading `packages/server/src/db/queries/types.ts` and confirming the field is present.

- [ ] **Step 4.6: Update the SQL query**

Edit `packages/server/src/db/queries/posts.ts:69–75`. Replace the body of `findPostWithLatestRevision` with:

```typescript
export async function findPostWithLatestRevision(id: string): Promise<PostWithRevisionRow | null> {
  const result = await query<PostWithRevisionRow>(
    `SELECT p.*, pr.id AS revision_id, pr.content, pr.revision_number, pr.message,
       (
         SELECT string_agg(t.name, ',' ORDER BY t.name)
         FROM post_tags pt
         JOIN tags t ON t.id = pt.tag_id
         WHERE pt.post_id = p.id
       ) AS tags
     FROM posts p
     INNER JOIN post_revisions pr ON pr.post_id = p.id
     WHERE p.id = $1 AND p.deleted_at IS NULL
     ORDER BY pr.revision_number DESC
     LIMIT 1`,
    [id],
  );
  return result.rows[0] ?? null;
}
```

- [ ] **Step 4.7: Update `toPostWithRevision`**

Edit `packages/server/src/services/posts.ts:52–70`:

```typescript
export function toPostWithRevision(row: PostWithRevisionRow): PostWithRevision {
  return {
    ...toPost(row),
    revisions: [
      {
        id: row.revision_id,
        postId: row.id,
        authorId: row.author_id,
        authorDisplayName: null,
        authorAvatarUrl: null,
        content: row.content,
        message: row.message,
        revisionNumber: row.revision_number,
        createdAt: row.created_at,
      },
    ],
    tags: row.tags ? row.tags.split(',') : [],
  };
}
```

- [ ] **Step 4.8: Run service tests; expect PASS**

```bash
cd packages/server && npx vitest run src/__tests__/services/posts.test.ts
```

Expected: PASS.

- [ ] **Step 4.9: Add a route-level test**

Find the existing `GET /api/posts/:id` test (in `packages/server/src/__tests__/routes/posts.test.ts`). Add (or extend):

```typescript
it('GET /api/posts/:id returns tags array', async () => {
  // Seed: post with two tags 'rust' and 'typescript'
  const { post } = await seedPostWithTags(['rust', 'typescript']);
  const res = await app.inject({
    method: 'GET',
    url: `/api/posts/${post.id}`,
    headers: { authorization: `Bearer ${authToken}` },
  });
  expect(res.statusCode).toBe(200);
  expect(res.json().post.tags).toEqual(['rust', 'typescript']);
});

it('GET /api/posts/:id returns empty tags when post has none', async () => {
  const { post } = await seedPostWithTags([]);
  const res = await app.inject({
    method: 'GET',
    url: `/api/posts/${post.id}`,
    headers: { authorization: `Bearer ${authToken}` },
  });
  expect(res.statusCode).toBe(200);
  expect(res.json().post.tags).toEqual([]);
});
```

(Match the existing test fixture conventions — `app`, `authToken`, `seedPost*` helpers.)

- [ ] **Step 4.10: Run route tests**

```bash
cd packages/server && npx vitest run src/__tests__/routes/posts.test.ts
```

Expected: PASS.

- [ ] **Step 4.11: Update Bruno spec**

Edit `bruno/posts/get-post.bru`. **CRITICAL: the existing `assert { res.status: eq 200 }` block MUST remain unchanged regardless of how the body assertion is added** — CLAUDE.md's `bruno-regression` workflow has a lint-guard that fails CI if the status-assertion block is missing.

Approach A (preferred — extend the existing assert block):

```
assert {
  res.status: eq 200
  res.body.post.tags: isArray
}
```

Approach B (fallback — only if Approach A's `isArray` matcher is unsupported in this project's Bruno DSL): keep the assert block intact AND add a separate `tests` block:

```
assert {
  res.status: eq 200
}

tests {
  test("response includes tags array", function() {
    expect(res.body.post.tags).to.be.an('array');
  });
}
```

Verify your choice by reading a peer `.bru` file that already asserts on body shape (try `bruno/posts/create-post.bru`, `get-feed.bru`, or `get-private-post-as-owner.bru`) and matching the established style. Whichever approach you pick, the `res.status: eq 200` assertion stays.

- [ ] **Step 4.12: Run Bruno against a running server**

```bash
# In one terminal:
set -a && source .env && set +a && cd packages/server && npx tsx src/server.ts

# In another terminal:
cd bruno && npx @usebruno/cli run posts/get-post.bru --env local
```

Expected: PASS.

- [ ] **Step 4.13: Update PostViewPage.vue to render chips**

Edit `packages/client/src/pages/PostViewPage.vue`. In the meta block (after the `Rev {{ latestRevision.revisionNumber }}` span at line 177, before the closing `</div>` at line 178), add:

```vue
<span v-if="currentPost.tags.length > 0" class="flex flex-wrap items-center gap-1">
  <span
    v-for="tag in currentPost.tags"
    :key="tag"
    :data-testid="`post-tag-chip-${tag}`"
    class="rounded bg-gray-700 px-2 py-0.5 text-xs text-gray-300"
  >
    #{{ tag }}
  </span>
</span>
```

Do NOT modify `buildPostForActions` (lines 54–67). Per scope review, the `tags: []` synth simplification is out of scope for issue #63 and would expand blast radius into PostActions paths.

- [ ] **Step 4.14: Update PostViewPage unit tests**

Edit `packages/client/src/__tests__/pages/PostViewPage.test.ts`. Add a test:

```typescript
it('renders post-tag-chip for each tag in currentPost.tags', async () => {
  // Mock currentPost with tags
  const { wrapper } = await mountPostViewPage({ tags: ['rust', 'typescript'] });
  expect(wrapper.find('[data-testid="post-tag-chip-rust"]').exists()).toBe(true);
  expect(wrapper.find('[data-testid="post-tag-chip-typescript"]').exists()).toBe(true);
});
```

(Match existing test conventions — likely a `mountPostViewPage` helper or a Pinia stub.)

- [ ] **Step 4.15: Run client unit tests**

```bash
cd packages/client && npx vitest run src/__tests__/pages/PostViewPage.test.ts
```

Expected: PASS.

- [ ] **Step 4.16: Un-fixme the e2e spec**

Edit `e2e/specs/posts/tags-view-page-shows-chips.spec.ts:17` — `test.fixme(` → `test(`. Replace the FIXME comment block (lines 4–16) with: `// Issue #63: PostWithRevision now carries tags; PostViewPage renders chips.`

- [ ] **Step 4.17: Run the spec at workers=4 retries=0**

```bash
cd e2e && npx playwright test specs/posts/tags-view-page-shows-chips.spec.ts --workers=4 --retries=0 --reporter=list
```

Expected: PASS.

- [ ] **Step 4.17b: Verify PostEditPage flow still loads & saves**

Run the existing PostEditPage tests after the type-cascade updates from Step 4.2b:

```bash
cd packages/client && npx vitest run src/__tests__/pages/PostEditPage.test.ts
```

Expected: PASS. PostEditPage consumes `PostWithRevision`; the test fixture at line 64 was updated to include `tags: []`. If the PostEditPage component itself reads `post.tags`, ensure the read site doesn't crash on the now-required field.

- [ ] **Step 4.18: Run all server + client tests + coverage**

```bash
cd packages/server && npm test && npx vitest run --coverage
cd ../../packages/client && npm test && npx vitest run --coverage
```

Expected: all green; coverage thresholds in `.coverage-thresholds.json` met for BOTH packages.

- [ ] **Step 4.19: Commit**

```bash
git add packages/shared/src/types/post.ts \
  packages/server/src/db/queries/posts.ts \
  packages/server/src/db/queries/types.ts \
  packages/server/src/services/posts.ts \
  packages/server/src/__tests__/services/posts.test.ts \
  packages/server/src/__tests__/routes/posts.test.ts \
  packages/server/src/__tests__/db/queries/posts.test.ts \
  packages/server/src/__tests__/routes/posts-visibility.test.ts \
  packages/server/src/__tests__/routes/posts-fork-files.test.ts \
  packages/shared/src/__tests__/validators/post.test.ts \
  packages/shared/src/__tests__/types/file.test.ts \
  packages/client/src/pages/PostViewPage.vue \
  packages/client/src/__tests__/pages/PostViewPage.test.ts \
  packages/client/src/__tests__/pages/PostEditPage.test.ts \
  packages/client/src/__tests__/composables/usePosts.test.ts \
  packages/client/src/__tests__/composables/useVotes.test.ts \
  packages/client/src/__tests__/stores/posts.test.ts \
  packages/client/src/__tests__/components/post/PostDetail.test.ts \
  bruno/posts/get-post.bru \
  e2e/specs/posts/tags-view-page-shows-chips.spec.ts
git commit -m "feat: GET /posts/:id returns tags; PostViewPage renders chips (#63)"
```

---

## WU5: Issue #64 — LinkPreviewCard mount + testid

**Scope decision (per scope review):** Single-mount on `PostDetail` (HomePage inline panel) — the surface the e2e specs target. Issue #64's DoD says "at least one user-facing route"; PostDetail satisfies it. No PostViewPage mount in this WU.

**Files:**

- Modify: `packages/client/src/components/post/LinkPreviewCard.vue` — add `data-testid="link-preview-card"` to root `<div v-if="linkPreview">` AND `<div v-else>` (the fallback). One testid covers both branches.
- Modify: `packages/client/src/components/post/PostDetail.vue` — mount LinkPreviewCard in the inline panel (HomePage flow); wire `@refresh` to a new `handleRefreshPreview()` that POSTs to `/api/posts/:id/refresh-preview` and updates `fullPost.linkPreview`.
- Modify: `packages/client/src/__tests__/components/post/LinkPreviewCard.test.ts` — add assertion for the new root testid.
- Add: `packages/client/src/__tests__/components/post/PostDetail.linkpreview.test.ts` — unit test for mount on PostDetail (refresh wires through correctly).
- Edit: `e2e/specs/posts/home-link-preview-on-link-post.spec.ts` — remove `test.fixme`.
- Edit: `e2e/specs/posts/home-link-preview-refresh.spec.ts` — remove `test.fixme`.

**DoD bullets (verbatim from issue #64):**

- [ ] LinkPreviewCard renders for link-type posts on at least one user-facing route
- [ ] `data-testid="link-preview-card"` on root
- [ ] Refresh-preview action triggers POST /refresh-preview and updates the card
- [ ] Re-enable the two `test.fixme` specs at `e2e/specs/posts/home-link-preview-on-link-post.spec.ts` and `e2e/specs/posts/home-link-preview-refresh.spec.ts`
- [ ] Vitest unit tests for the new mount

**Steps:**

- [ ] **Step 5.1: Add root testid to LinkPreviewCard.vue**

Edit `packages/client/src/components/post/LinkPreviewCard.vue:3` and `:65` — add `data-testid="link-preview-card"` to BOTH the `v-if="linkPreview"` div and the `v-else` div. This guarantees the testid matches whether or not preview metadata has been fetched yet.

```vue
<template>
  <div v-if="linkPreview" data-testid="link-preview-card">
    <!-- ...existing... -->
  </div>
  <div v-else data-testid="link-preview-card" class="flex items-center gap-2 ...">
    <!-- ...existing fallback... -->
  </div>
</template>
```

- [ ] **Step 5.2: Update LinkPreviewCard unit test for the new testid**

Edit `packages/client/src/__tests__/components/post/LinkPreviewCard.test.ts` — add at least one test:

```typescript
it('renders the root data-testid="link-preview-card" in both states', () => {
  const withPreview = mount(LinkPreviewCard, {
    props: {
      linkUrl: 'https://example.com',
      linkPreview: { title: 't', description: 'd', image: null, readingTime: null },
      isAuthor: false,
    },
  });
  expect(withPreview.find('[data-testid="link-preview-card"]').exists()).toBe(true);

  const withoutPreview = mount(LinkPreviewCard, {
    props: { linkUrl: 'https://example.com', linkPreview: null, isAuthor: false },
  });
  expect(withoutPreview.find('[data-testid="link-preview-card"]').exists()).toBe(true);
});
```

- [ ] **Step 5.3: Run LinkPreviewCard unit tests**

```bash
cd packages/client && npx vitest run src/__tests__/components/post/LinkPreviewCard.test.ts
```

Expected: PASS.

- [ ] **Step 5.4: Write a failing unit test for PostDetail rendering LinkPreviewCard**

Create `packages/client/src/__tests__/components/post/PostDetail.linkpreview.test.ts`. Pattern after the existing `PostDetail.test.ts`. Mock the `apiFetch` to return a `PostWithRevision` with `linkUrl` and `linkPreview` set, then mount PostDetail with that post and assert `wrapper.find('[data-testid="link-preview-card"]').exists()` is `true`. Also test the refresh path: clicking the refresh button calls `apiFetch(`/api/posts/${id}/refresh-preview`, { method: 'POST' })` and the new linkPreview is reflected in the rendered card.

- [ ] **Step 5.5: Run the failing unit test; expect FAIL**

```bash
cd packages/client && npx vitest run src/__tests__/components/post/PostDetail.linkpreview.test.ts
```

Expected: FAIL — LinkPreviewCard not yet imported by PostDetail.

- [ ] **Step 5.6: Mount LinkPreviewCard in PostDetail.vue (HomePage inline path)**

Edit `packages/client/src/components/post/PostDetail.vue`:

Import (after CodeViewer at line 85):

```typescript
import LinkPreviewCard from './LinkPreviewCard.vue';
```

Add a refresh handler near `handleFork`:

```typescript
async function handleRefreshPreview(): Promise<void> {
  if (!fullPost.value) return;
  const id = fullPost.value.id;
  const res = await apiFetch(`/api/posts/${id}/refresh-preview`, { method: 'POST' });
  if (res.ok) {
    const body = (await res.json()) as { post: PostWithRevision };
    if (fullPost.value) {
      fullPost.value.linkPreview = body.post.linkPreview;
    }
  }
}
```

In the template, inside the `v-else` single-file block (before `<CodeViewer>` at line 28), insert:

```vue
<LinkPreviewCard
  v-if="fullPost?.linkUrl"
  class="mb-3"
  :link-url="fullPost.linkUrl"
  :link-preview="fullPost.linkPreview"
  :is-author="fullPost.authorId === authStore.user?.id"
  @refresh="handleRefreshPreview"
/>
```

- [ ] **Step 5.7: Re-run the unit test; expect PASS**

```bash
cd packages/client && npx vitest run src/__tests__/components/post/PostDetail.linkpreview.test.ts
```

Expected: PASS.

- [ ] **Step 5.8: Run all client unit tests**

```bash
cd packages/client && npm test
```

Expected: all green.

- [ ] **Step 5.9: Un-fixme the two e2e specs**

Edit `e2e/specs/posts/home-link-preview-on-link-post.spec.ts:13` — change `test.fixme(` → `test(`. Remove the FIXME comment block at lines 4–12 (replace with a one-liner: `// Issue #64: LinkPreviewCard mounted on PostDetail and PostViewPage; refresh wired.`).

Same for `e2e/specs/posts/home-link-preview-refresh.spec.ts:6`.

- [ ] **Step 5.10: Run the two e2e specs; expect PASS**

```bash
cd e2e && npx playwright test specs/posts/home-link-preview-on-link-post.spec.ts specs/posts/home-link-preview-refresh.spec.ts --workers=4 --retries=0 --reporter=list
```

Expected: PASS. (Requires WU2 fix — verify branch contains it.)

- [ ] **Step 5.11: Commit**

```bash
git add packages/client/src/components/post/LinkPreviewCard.vue \
  packages/client/src/components/post/PostDetail.vue \
  packages/client/src/__tests__/components/post/LinkPreviewCard.test.ts \
  packages/client/src/__tests__/components/post/PostDetail.linkpreview.test.ts \
  e2e/specs/posts/home-link-preview-on-link-post.spec.ts \
  e2e/specs/posts/home-link-preview-refresh.spec.ts
git commit -m "feat(client): mount LinkPreviewCard on PostDetail with refresh wiring (#64)"
```

---

## WU6: Final verification + PR

**Files:** none (verification + PR creation).

**Steps:**

- [ ] **Step 6.1: Run full server suite + coverage**

```bash
cd packages/server && npm test && npx vitest run --coverage
```

Expected: all green; thresholds met.

- [ ] **Step 6.2: Run full client suite + coverage**

```bash
cd packages/client && npm test && npx vitest run --coverage
```

Expected: all green; thresholds in `.coverage-thresholds.json` met (CLAUDE.md source of truth applies to client too, not just server).

- [ ] **Step 6.3: Run full Bruno collection**

```bash
# Server must be running (set -a && source .env && set +a && cd packages/server && npx tsx src/server.ts)
cd bruno && npx @usebruno/cli run -r --env local
```

Expected: all green.

- [ ] **Step 6.4: Run full e2e suite at workers=4 retries=0 (×3)**

```bash
cd e2e && for i in 1 2 3; do npx playwright test --workers=4 --retries=0 --reporter=list 2>&1 | tail -10; echo "---run $i---"; done
```

Expected: 3/3 green. Zero `test.fixme`. Zero retries.

- [ ] **Step 6.5: Verify no `test.fixme(` in posts specs (6 markers must be gone)**

```bash
grep -rn "test\.fixme(" e2e/specs/posts/
```

Expected: zero output. The 6 markers that must be removed:

- `tags-view-page-shows-chips.spec.ts` (#63)
- `home-link-preview-on-link-post.spec.ts` (#64)
- `home-link-preview-refresh.spec.ts` (#64)
- `view-presence-indicator.spec.ts` (#66)
- `home-code-runner-on-snippet.spec.ts` (#65 secondary effect)
- `home-code-runner-execution.spec.ts` (#65 secondary effect)

If any `test.fixme(` remains, a WU was not completed.

- [ ] **Step 6.6: Run typecheck on all packages**

```bash
cd packages/shared && npx tsc --noEmit
cd ../server && npx tsc --noEmit
cd ../client && npx vue-tsc --noEmit
cd ../../e2e && npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 6.7: Lint**

```bash
cd /Users/andrew/Code/forge && npm run lint
```

Expected: zero errors.

- [ ] **Step 6.8: Run `/self-reflect` to extract learnings**

(Per CLAUDE.md "Pre-PR Knowledge Capture": run before PR creation so KB updates land in the PR.)

- [ ] **Step 6.9: Commit any KB updates**

```bash
git add .beads/knowledge/
git commit -m "docs: knowledge base updates from #63-67 follow-ups"
```

(Skip if no KB changes.)

- [ ] **Step 6.10: Push branch**

```bash
git push -u origin feat/post47-followups-63-67
```

- [ ] **Step 6.11: Open PR**

```bash
gh pr create --title "feat: post-#47 follow-ups (#63 #64 #65 #66 #67)" --body "$(cat <<'EOF'
## Summary

Lands five post-#47 follow-up issues on a single branch:

- **#63** — `GET /api/posts/:id` returns `tags: string[]`; `PostViewPage` renders `post-tag-chip-<name>` chips.
- **#64** — `LinkPreviewCard` mounted on `PostDetail` (HomePage inline panel); `data-testid="link-preview-card"` on root; refresh wired to `POST /:id/refresh-preview`. (Single-mount — DoD requires "at least one user-facing route".)
- **#65** — Root cause: <fill in>. Fix: <fill in>. Smoke spec asserts panel renders at 1280×720.
- **#66** — Server broadcasts `presence:update` to all channel subscribers on every authenticated `presence` frame, not just eviction. The issue body's "(excluding the joiner)" parenthetical is intentionally relaxed so the joiner immediately sees their own avatar via the same broadcast — see WU3 decision rationale.
- **#67** — `/auth/refresh` lifts rate-limit cap in `E2E_MODE`; `retries: 1` band-aid removed from `playwright.config.ts`; full suite passes at workers=4 retries=0.

All five `test.fixme` markers in `e2e/specs/posts/` removed.

Closes #63
Closes #64
Closes #65
Closes #66
Closes #67

## Test plan

- [x] Server unit tests pass; coverage thresholds met
- [x] Client unit tests pass
- [x] Bruno collection passes against running server
- [x] Full e2e suite at workers=4 retries=0 — three consecutive green runs
- [x] No `test.fixme` markers remaining in posts specs
- [x] Typecheck clean across all packages
- [x] Lint clean

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 6.12: Capture PR URL**

The PR URL is the deliverable. Run `/pr-shepherd <PR#>` if CI flakes.

---

## Self-Review (per writing-plans)

**1. Spec coverage.** Each issue's DoD is mapped (WU labels reflect the renumbered/reordered execution sequence #67→#65→#66→#63→#64):

- #67 — WU1, Steps 1.1a–1.10 (pre-audit, rate-limit branch on /refresh, additional E2E_MODE branches, retries removal, ×3 verification).
- #65 — WU2, Steps 2.1–2.10 (diagnose, fix, panel testid, smoke spec, un-fixme code-runner specs).
- #66 — WU3, Steps 3.1a–3.9 (harness extension, failing tests, broadcast-to-all fix, un-fixme presence spec).
- #63 — WU4, Steps 4.1–4.19 (shared type widening, fixture cascade, SQL/service updates, route + Bruno + client tests, un-fixme tags spec).
- #64 — WU5, Steps 5.1–5.11 (LinkPreviewCard testid, PostDetail mount, refresh handler, un-fixme link-preview specs).

**2. Placeholder scan.** Plan deliberately uses "match existing test conventions" / "match the existing Bruno DSL" placeholders in 4 spots — these are unavoidable because the executing agent must read the actual fixture style. NOT a "TODO" in the prohibited sense; they explicitly point at concrete files to read first.

**3. Type consistency.** `PostWithRevision.tags: string[]` (shared) ↔ `PostWithRevisionRow.tags: string | null` (server) ↔ `currentPost.tags` (client) — consistent. `LinkPreview` type re-used from `@forge/shared` (already imported in LinkPreviewCard.vue:92). `presenceMessageSchema` and `getViewers` references match existing handler.ts and presence.ts.

**4. Required vs. optional `tags` field.** Considered both options:

|                                | Required `tags: string[]` (chosen)                         | Optional `tags?: string[]`                    |
| ------------------------------ | ---------------------------------------------------------- | --------------------------------------------- |
| Consumer code                  | `currentPost.tags.length > 0` — clean                      | `currentPost.tags?.length > 0` — needs `?.`   |
| Type symmetry                  | Matches `PostWithAuthor.tags: string[]` (already required) | Asymmetric — same field different optionality |
| Migration cost                 | 13 fixture sites (mechanical add `tags: []`)               | None                                          |
| Runtime semantics              | Server always emits `[]` for zero tags                     | Same                                          |
| Risk of undefined at consumers | Zero                                                       | Real (consumers may forget the `?.`)          |

Required is the cleaner long-term choice. The 13-site sweep is mechanical and one-time; the `?.` cost compounds across every consumer for the lifetime of the codebase. Mirrors the established `PostWithAuthor.tags: string[]` shape.

**Known caveats for the executing agent:**

- WU2 root cause is investigation-driven — the proposed fix (Tailwind v4 `@source inline`) may not be the actual fix. Expect to spend 30 minutes on diagnosis before applying.
- WU5's PostDetail.vue mount uses `apiFetch` — confirm the import path matches your project (likely `'../../lib/api.js'` based on PostDetail.vue:83).
- WU4's Bruno DSL — the precise body-assertion syntax may differ from the example. Read at least 2 existing `.bru` files in `bruno/posts/` that have body assertions before writing the new one. The `assert { res.status: eq 200 }` block stays no matter which body-assertion style you pick.

---

## Execution Method

After this plan passes the **plan review gate** (3 adversarial reviewers must PASS) and the user approves, ask the user to pick:

1. **Metaswarm orchestrated execution** — 4-phase loop per WU (IMPLEMENT → VALIDATE → ADVERSARIAL REVIEW → COMMIT). Most thorough.
2. **Subagent-driven development** — fresh subagent per WU, code review between WUs. Faster.
3. **Inline / parallel-session executing-plans** — batch checkpoints in a separate session.

The user picks; do NOT auto-select.
