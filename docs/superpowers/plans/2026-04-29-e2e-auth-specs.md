---
title: 'E2E Auth Specs (Issue #46 — E2E rollout 1c/9)'
issue: 46
tracking-issue: 43
status: completed
approved: 2026-04-29
user-approved: true
execution-method: metaswarm-orchestrated-execution
current-work-unit: WU1
plan-review-gate: PASSED (REV 3 iter 1 — Feasibility PASS, Completeness PASS, Scope & Alignment PASS)
design-file: docs/superpowers/specs/2026-04-28-e2e-playwright-testing-design.md
branch: feat/e2e-auth-specs
base: main
prior-revs: REV 1 abandoned; REV 2 abandoned (3-iter gate, user picked option D — re-scope). REV 3 reflects user's A1+B3+C3 choices on the three open scope questions.
---

# Implementation Plan: E2E Auth Specs (Issue #46) — REV 3

## Goal

Add 16 Playwright `test()` cases (within issue's 12–16 range) under `e2e/specs/auth/` covering login, register, logout, session-refresh, OAuth-stub, account-link, AuthCallback redirect, and redirect-when-authenticated guards. Foundation rig from #45 is merged and stable.

## Constraints (from issue)

- Workers: pass at `workers: 1` AND `workers: 4`.
- Stability: 3 consecutive green CI runs on the PR branch + 5 consecutive green local runs of `e2e/specs/auth/` (issue's adversarial-checklist).
- Runtime: total e2e suite under 3-min foundation cap; `auth/` adds ~30–60s.
- Selector convention: ALL selection via `getByTestId` from `e2e/fixtures/selectors/auth.ts`. Cross-cutting → `selectors/shell.ts`.
- testid naming: kebab + role suffix for interactive (`*-btn`, `*-input`); bare kebab nouns for content/state (`error-message`).
- One assertion concept per `test()`. No `waitForTimeout`. No conditional assertions.
- Concrete-text assertions against fixture/server-literal text.
- Reset: `beforeEach` runs the global reset; register specs opt out via `{ tag: '@no-reset' }`.
- File scope respected. No `--no-verify`. No force-push.

## Architecture facts (verified against current `main`)

These are the codebase realities that drive the plan; they were validated by an independent feasibility reviewer in the prior gate iteration.

### Fact 1 — `/api/auth/google` is NOT registered in E2E mode

`packages/server/src/app.ts:41` registers `@fastify/oauth2` only when `process.env.GOOGLE_CLIENT_ID` is truthy. `.env`/`.env.example` ship `GOOGLE_CLIENT_ID=` (empty). CI does not set it. Therefore:

- `GET /api/auth/google` → Fastify default 404.
- `GET /api/auth/google/callback` → 501 `{"error":"Google OAuth is not configured"}` (`packages/server/src/routes/auth.ts:259-260`).

The 501 stub lives only on `/google/callback`. The plan's `oauth-stub` spec navigates directly to that callback URL with a junk `code` param. **(User decision: B3.)**

### Fact 2 — Access token is in-memory Pinia state

`packages/client/src/stores/auth.ts:6` declares `accessToken = ref<string | null>(null)` — never persisted. Refresh fires only when an API request returns 401 AND `store.accessToken !== null` (`packages/client/src/lib/api.ts:65-67`). On boot, `restore-session.ts` calls `/api/auth/refresh` from the `refresh_token` HttpOnly cookie.

**Implication for session-refresh spec**: use one-shot route interception on `/api/posts?...` (the HomePage feed endpoint, verified at `packages/client/src/composables/useFeed.ts:33`).

### Fact 3 — `RegisterPage.test.ts:232` reads `data-testid="error-message"`

Renaming would break the unit test. REV 3 does NOT rename — new selector entries target the existing testids by page context.

### Fact 4 — `AccountLinkPage.vue:44` has a snake/camel body bug

Sends `{ link_token, password }`; server expects `{ linkToken, password }`. Server returns 400 (validation), so the 401 path the issue calls out is unreachable in current `main`. **REV 3 fixes the bug in WU1** (one line in `.vue`, one line in `.test.ts`). Server tests already use camelCase. **(User decision: A1.)**

### Fact 5 — AuthCallbackPage redirects to `/login` when URL hash lacks `access_token`

`packages/client/src/pages/AuthCallbackPage.vue:18-22` reads `route.hash`, parses for `access_token`, and if missing routes to `{ name: 'login' }`. This is testable without any real OAuth: anonymous user navigates to `/auth/callback` with no hash → page bounces to `/login`. **REV 3 adds a small spec exercising this path**, which means the AuthCallback testid added in WU1 is actually consumed (no DoD-coverage placeholder). **(User decision: C3.)**

## Spec inventory (16 `test()` cases — within 12–16 range)

**Login (5)**

1. `login-success.spec.ts` — anonymous, seeded creds → URL `/`.
2. `login-wrong-password.spec.ts` — `auth.loginError` `toContainText('Invalid email or password')`.
3. `login-unknown-email.spec.ts` — same 401 path, same literal text.
4. `login-empty-form-validation.spec.ts` — submit blank; `auth.loginEmail` `toHaveJSProperty('validity.valid', false)`; URL stays `/login`. (One concept: client-side validity blocks submit.)
5. `login-redirect-after-login.spec.ts` — anonymous → `/posts/new` → bounced to `/login?redirect=/posts/new` → submit → URL `/posts/new`.

**Register (4 — all `@no-reset`)** 6. `register-success.spec.ts` — fresh randomized email (via `crypto.randomUUID()`) → URL `/`. 7. `register-duplicate-email.spec.ts` — seeded testuser email; assert literal server text (text confirmed during TDD red). 8. `register-weak-password.spec.ts` — Zod path; assert `auth.registerValidationError` literal (text confirmed during TDD red). 9. `register-email-validation.spec.ts` — invalid email; `auth.registerEmail` `toHaveJSProperty('validity.valid', false)`.

**Logout (1)** 10. `logout.spec.ts` — `testuser` fixture, user-menu → logout, URL `/login`.

**Session refresh (1)** 11. `session-refresh.spec.ts` — `testuser` fixture, intercept `**/api/posts?**` once via `page.route(handler, { times: 1 })` returning 401, navigate to `/`, then `await page.waitForRequest(r => r.url().endsWith('/api/auth/refresh') && r.method() === 'POST', { timeout: 10000 })`. The wait IS the assertion. Spec body documents that boot-time refresh from `restore-session.ts:16` may also fire and that the spec waits for the **second** refresh (the 401-triggered one) by counting requests.

**OAuth-stub (1)** 12. `oauth-stub.spec.ts` — anonymous, `await page.goto('/api/auth/google/callback?code=fake.code')`, assert `await expect(page.locator('body')).toContainText('Google OAuth is not configured')`. Spec body comments explain the deviation from "click Sign in with Google" (the start URL 404s in E2E because `GOOGLE_CLIENT_ID` is unset; the 501 stub lives only on the callback path).

**Account-link (1)** 13. `account-link.spec.ts` — anonymous, `/auth/link#link_token=eyJhbGciOiJIUzI1NiJ9.fake.signature` (junk JWT-shaped token), fill password, submit. After WU1's bug fix, server returns 401 with `'Invalid or expired link token'`. Assert `auth.accountLinkError` `toContainText('Invalid or expired link token')`.

**AuthCallback redirect (1)** _(new in REV 3)_ 14. `auth-callback-no-token.spec.ts` — anonymous, `await page.goto('/auth/callback')` (no hash). Page's `onMounted` parses empty hash, fails to find `access_token`, calls `router.push({ name: 'login' })`. Assert `await expect(page).toHaveURL(/\/login/)`. This exercises the AuthCallbackPage and consumes the testid added in WU1.

**Redirect-when-authenticated (2 tests in one file)** 15. `redirect-when-authenticated.spec.ts` — `testuser` fixture; one `test()` for `/login` → `/`, one `test()` for `/auth/link` → `/`. (Coverage chosen: `/login` is the issue example; `/auth/link` is the route the issue's `meta: { guest: true }` warning specifically named. `/register` and `/auth/callback` redirect-when-authenticated are not covered — `/register` is symmetric to `/login` and adding it would push us to 17 tests; `/auth/callback` redirect-when-authenticated overlaps with spec 14's no-token redirect.)

**Total**: 16 `test()` cases across 14 files. Within 12–16 range.

### One-assertion-rule clarification (test 4 and test 11)

The "single assertion concept" rule does not forbid multiple `expect()` calls — it forbids testing multiple _concepts_. Test 4 corroborates ONE concept ("client-side validity blocks submission") via two related checks. Test 11 has ONE assertion (`waitForRequest`) — the success of the wait IS the test.

## Work-unit decomposition

### WU1 — Foundation: testids, selector-shard expansion, AccountLink bug fix

**Files** (exhaustive):

- `packages/client/src/pages/LoginPage.vue` — add `data-testid="login-google-btn"` on the Sign-in-with-Google `<a>`.
- `packages/client/src/pages/AuthCallbackPage.vue` — add `data-testid="auth-callback-loading"` on the `v-if="loading"` Loading container. (Now consumed by spec 14.)
- `packages/client/src/pages/AccountLinkPage.vue` — TWO changes:
  - Add testids: `account-link-form` (the `v-if="ready"` container), `account-link-password-input`, `account-link-submit-btn`, `account-link-cancel-link`, `account-link-heading`.
  - Fix snake/camel bug at line 44: `JSON.stringify({ link_token: linkToken.value, ...` → `JSON.stringify({ linkToken: linkToken.value, ...`. URL-hash parsing on line 26 (`params.get('link_token')`) stays unchanged because the server emits the hash with `link_token=` (verified at `packages/server/src/routes/auth.ts:317`).
- `packages/client/src/__tests__/pages/AccountLinkPage.test.ts` — update line 110 from `body: JSON.stringify({ link_token: ... })` to `body: JSON.stringify({ linkToken: ... })`. Cosmetic touch-up of the test description on line 93 if desired (non-blocking).
- `e2e/fixtures/selectors/auth.ts` — extend (do NOT rename existing entries):
  - LoginPage group: `googleSigninLink(page) => getByTestId('login-google-btn')`.
  - RegisterPage group: `registerServerError(page) => getByTestId('error-message')`; `registerValidationError(page) => getByTestId('validation-error')`.
  - AuthCallbackPage group: `authCallbackLoading(page) => getByTestId('auth-callback-loading')`.
  - AccountLinkPage group: `accountLinkForm`, `accountLinkPasswordInput`, `accountLinkSubmitBtn`, `accountLinkCancelLink`, `accountLinkHeading`, `accountLinkError(page) => getByTestId('error-message')` (page-scoped).

  Shard grouped by page (existing TopBar group preserved); entries alphabetized within each group.

(No edits to `RegisterPage.vue` — REV 3 keeps existing testids intact, so `RegisterPage.test.ts:232` is unaffected.)

**DoD**:

- All 4 Vue auth pages have testid coverage (DoD line 3 satisfied).
- AccountLink bug fixed; corresponding unit test updated.
- `auth.ts` selector shard grouped by page, alphabetized within each group.
- `npm run typecheck` passes.
- `npm test` passes (Vitest unit tests including AccountLinkPage.test.ts and RegisterPage.test.ts).
- No edits outside the 5-file list.

### WU2 — Login specs (5)

**Files**: 5 new files in `e2e/specs/auth/login-*.spec.ts`.

**Pattern**: anonymous browser context per spec; reset `beforeEach` runs by default.

**DoD**:

- 5 files, 5 tests.
- All selection via `getByTestId`. Zero `getByText`/CSS for selection.
- Copy assertions via `toContainText` against literal strings.
- Pass at `workers: 1` AND `workers: 4`.
- TDD: write spec, watch fail, fix until pass.
- No `waitForTimeout`; no conditional assertions.

### WU3 — Register specs (4, all `@no-reset`)

**Files**: 4 new files in `e2e/specs/auth/register-*.spec.ts`.

**Pattern**: every spec carries `{ tag: '@no-reset' }`. `register-success` uses `crypto.randomUUID()`-derived email.

**DoD**:

- 4 files, 4 tests; all `@no-reset`.
- `register-success` uses randomized email.
- Pass at `workers: 1` AND `workers: 4`.

### WU4 — Logout, session-refresh, redirect-when-authenticated

**Files**:

- `e2e/specs/auth/logout.spec.ts` (1 test)
- `e2e/specs/auth/session-refresh.spec.ts` (1 test)
- `e2e/specs/auth/redirect-when-authenticated.spec.ts` (2 tests: `/login`, `/auth/link`)

**Notes**:

- Session-refresh: uses `page.route('**/api/posts?**', ..., { times: 1 })` for one-shot 401 injection. Spec body comments explain the choice (in-memory token; refresh triggered only by 401 in `api.ts:66`) and explicitly handles the boot-time refresh from `restore-session.ts:16` by waiting for the **second** refresh request after the navigation. If the boot-time refresh and the 401-triggered refresh cannot be reliably distinguished, the spec falls back to asserting the request count (≥2 refreshes observed in a window).
- Redirect-when-authenticated: 2 tests inside one file, both using `testuser` fixture, both asserting `await expect(page).toHaveURL('/')`.

**DoD**:

- 3 files; 4 tests total.
- Session-refresh mechanism documented in spec body.
- Pass at `workers: 1` AND `workers: 4`.

### WU5 — OAuth-stub, account-link, AuthCallback (3 files, 3 tests)

**Files**:

- `e2e/specs/auth/oauth-stub.spec.ts` (1 test) — direct-navigate to `/api/auth/google/callback?code=fake.code`; assert body `toContainText('Google OAuth is not configured')`. Spec body explains the deviation from a click flow (the start URL 404s; the 501 stub lives only on the callback path).
- `e2e/specs/auth/account-link.spec.ts` (1 test) — anonymous, `/auth/link#link_token=eyJhbGciOiJIUzI1NiJ9.fake.signature`, fill password, submit. Assert `accountLinkError` `toContainText('Invalid or expired link token')`. (Server text verified at `packages/server/src/routes/auth.ts:334`.)
- `e2e/specs/auth/auth-callback-no-token.spec.ts` (1 test) — anonymous, `/auth/callback` (no hash). Assert `await expect(page).toHaveURL(/\/login/)`. Spec body cites the AuthCallbackPage:18-22 onMounted path that handles missing `access_token`. The `auth-callback-loading` testid is asserted briefly visible during navigation if useful for stability (optional inside the same `test()` — does not violate one-concept rule because both observations corroborate "page mounted and redirected").

**DoD**:

- 3 files, 3 tests.
- All concrete-text or URL assertions against fixture/server-literal values.
- Pass at `workers: 1` AND `workers: 4`.

### WU6 — Stabilization, README updates, tracking-issue update

**Files**:

- `e2e/README.md` — append:
  - One-shot route interception for session-refresh (with code snippet).
  - Direct-URL navigation pattern for OAuth-stub (and why).
  - Randomized-email pattern for register-success.
  - Note on AuthCallback no-token redirect path (pattern for testing OAuth-adjacent pages without real OAuth).
- `gh issue comment 43` — note `auth/` shipped with 16 specs.

**Validation**:

- `npm run e2e specs/auth -- --workers=1` — green.
- `npm run e2e specs/auth -- --workers=4` — green.
- `for i in 1 2 3 4 5; do npm run e2e specs/auth || { echo "Run $i FAILED"; exit 1; }; done` — all 5 green.
- `npm run e2e` — full suite green; total runtime measured and reported in PR description (under 3-min cap).
- `npm test` — Vitest green.
- `npm run test:coverage` — coverage gate per `.coverage-thresholds.json` passes.
- `cd bruno && npx @usebruno/cli run -r --env local` — Bruno gate passes (server up).
- `npm run lint` — clean.
- 3 consecutive green CI runs after PR is open (push empty commits or `gh workflow run` to confirm).

**DoD**:

- All gates green.
- Local 5-runs verified.
- `e2e/README.md` updated.
- Tracking issue #43 updated.

## Execution dependencies

```
WU1 (testids + bug fix + selector shard)
  └→ WU2 (login)         ─┐
  └→ WU3 (register)       ├→ WU6 (stabilization + README + #43)
  └→ WU4 (logout/refresh/guards) ─┤
  └→ WU5 (oauth-stub/account-link/auth-callback) ─┘
```

WU2–WU5 are parallel-safe after WU1.

## Risks and mitigations

| Risk                                                                                              | Likelihood   | Mitigation                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Session-refresh: distinguishing boot-time refresh from 401-triggered refresh in `waitForRequest`. | Medium       | Spec waits for second refresh (counter-based) or uses `expect.poll` to count requests in a window. Documented in spec body.                                                       |
| Session-refresh interception target `/api/posts?**` doesn't fire for some reason.                 | Low          | TDD red phase catches it (timeout). Backup: intercept `/api/auth/me` (fired by `restore-session.ts`).                                                                             |
| OAuth-stub spec direct-navigation isn't the click flow.                                           | Acknowledged | Documented in spec body. The login link's existence is implicitly covered by the journey smoke (`_journey.spec.ts`) using LoginPage.                                              |
| `register-duplicate-email`/`register-weak-password` server-error text drift.                      | Low          | TDD red phase confirms literal text. If ever changes upstream, spec fails loudly — that's the intent.                                                                             |
| Account-link bug fix introduces regression in unit test.                                          | Low          | WU1 updates the unit test in lock-step with the client. `npm test` validates before WU1 lands.                                                                                    |
| Browser-native validity assertions across Chromium versions.                                      | Low          | Playwright config runs only Chromium; `toHaveJSProperty('validity.valid', false)` is stable.                                                                                      |
| Concurrent reset flake at `workers: 4`.                                                           | Low          | Reset uses Postgres advisory lock (foundation #44). Journey already passes at workers=4.                                                                                          |
| Total e2e runtime exceeds 3-min cap.                                                              | Low          | 16 × ~3.5s ≈ 56s expected for `auth/`. WU6 measures actual.                                                                                                                       |
| Local 5-runs reveals a flake.                                                                     | Medium       | Discovery is the point. If a spec flakes, `test.fixme()` with tracking-issue link; PR proceeds with 15 active (still in 12–16 range).                                             |
| AuthCallback no-token spec races against the redirect (page may not finish mounting).             | Low          | Use `await expect(page).toHaveURL(/\/login/)` with default 5s timeout; the redirect is synchronous within `onMounted`. If flaky, fall back to `await page.waitForURL(/\/login/)`. |

## Out of scope (explicit)

- Adding any spec under `packages/server/`.
- Adding new fixtures or support files.
- Bucket teardown for MinIO.
- Real OAuth integration.
- Refactoring `RegisterPage.vue`'s testids (keep `error-message` and `validation-error` as-is).
- Refactoring `AccountLinkPage.vue`'s `error-message` testid name (keep, page-scoped).
- Setting `GOOGLE_CLIENT_ID` in E2E config to register the start-redirect path (intentionally out of scope per user decision B3).

## Test commands

```bash
# Local development
npm run e2e specs/auth                                 # all auth specs
npm run e2e specs/auth/login-success.spec.ts           # single spec
npm run e2e -- --headed --grep "wrong password"        # debug

# WU6 validation
npm run e2e specs/auth -- --workers=1
npm run e2e specs/auth -- --workers=4
for i in 1 2 3 4 5; do npm run e2e specs/auth || { echo "Run $i FAILED"; exit 1; }; done
npm run e2e
npm test
npm run test:coverage
npm run lint
cd bruno && npx @usebruno/cli run -r --env local
```

## Adversarial-review checklist

- [ ] All 16 `test()` cases have a single-concept name and assert ONE thing.
- [ ] No spec uses `waitForTimeout`.
- [ ] No conditional assertions.
- [ ] All specs pass deterministically across 5 consecutive runs locally (WU6 explicit gate).
- [ ] All specs pass at `workers: 1` AND `workers: 4`.
- [ ] data-testid additions are kebab + role-suffix (interactive) or kebab nouns (state).
- [ ] All register specs carry `@no-reset`.
- [ ] Selector entries grouped by page, alphabetized within groups.
- [ ] All copy assertions use `toContainText` with literal text.
- [ ] No edits outside declared file scope per WU.
- [ ] DoD: testid coverage on all 4 auth Vue pages (Login, Register, AuthCallback, AccountLink).

## Closes

Closes #46.

## REV 3 deltas vs REV 2

1. **AuthCallback testid is consumed**: spec 14 (`auth-callback-no-token.spec.ts`) exercises AuthCallbackPage's no-token redirect path, addressing the iter-3 Scope reviewer's concern that the testid was a placeholder. (User decision: C3.)
2. **Spec count rebalanced**: dropped redirect-from-`/register`-when-authenticated to make room for `auth-callback-no-token`, keeping total at 16 (within 12–16 range). The redirect spec now covers `/login` (issue example) and `/auth/link` (the meta:guest warning's named route).
3. **Bug fix retained (A1)**: AccountLinkPage snake/camel fix and corresponding unit-test edit remain in WU1. The Scope reviewer's iter-3 concern was that the fix was creep beyond `(modify — data-testid)`. User accepted the deviation as a necessary unblock for the 401 path the issue named.
4. **OAuth-stub direct navigation retained (B3)**: spec 12 still navigates directly to `/api/auth/google/callback?code=fake.code`. The Scope reviewer's iter-3 concern was that this skips the click flow. User accepted the deviation; the spec body documents why the click flow can't reach 501 in E2E (the start URL is unregistered without `GOOGLE_CLIENT_ID`).
5. **Iteration history**: Iter 1 — all FAIL. Iter 2 — Feasibility FAIL (route pattern), Completeness PASS, Scope PASS. Iter 3 — Feasibility PASS, Completeness PASS, Scope FAIL. User chose option D (cancel) and re-scoped via A1+B3+C3. REV 3 reflects those decisions.
