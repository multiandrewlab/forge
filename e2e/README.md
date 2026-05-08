# E2E Tests (Playwright)

End-to-end browser tests for Forge. Mirrors the contributor model used by `bruno/`.

## Quickstart

```bash
docker compose up -d postgres minio
npm install
cd e2e && npx playwright install --with-deps chromium

# From repo root:
npm run e2e               # headless run (uses webServer block to start API + preview)
npm run e2e:ui            # Playwright UI mode (developer iteration)
npm run e2e:debug         # Playwright Inspector for step-through debugging
```

If your local `npm run dev` is already running the API + Vite, `webServer` will reuse them (`reuseExistingServer: !process.env.CI`).

> [!IMPORTANT]
> **Local fresh-start gotcha — pre-start the servers with env loaded.**
>
> `tsx` does **not** auto-load `.env`. Playwright's `webServer.command` runs `npx tsx src/server.ts` without sourcing env, so `DATABASE_URL`, `JWT_SECRET`, etc. would be missing and the server would crash on a fresh `npm run e2e`. The simplest local path is to pre-start both servers in separate terminals with env loaded, then run Playwright — `reuseExistingServer: !process.env.CI` will reuse them:
>
> ```bash
> # Terminal 1 — API server (env loaded via `set -a && source ../../.env && set +a`)
> cd packages/server && set -a && source ../../.env && set +a && \
>   ENABLE_TEST_ROUTES=1 LLM_PROVIDER=mock E2E_MODE=1 NODE_ENV=test \
>   npx tsx src/server.ts &
>
> # Terminal 2 — Vite preview (production build, served on :4173)
> cd packages/client && npm run build && npm run preview &
>
> # Terminal 3 — repo root
> npm run e2e
> ```
>
> **Why:** `tsx` does NOT load `.env` automatically. Playwright's `webServer.command` shells out to `npx tsx src/server.ts` with whatever environment Playwright itself was launched with. Pre-starting the server with `set -a && source ../../.env && set +a` (which exports every var declared in `.env` into the shell) sidesteps the missing-env crash. CI sets these explicitly in the workflow, so the issue is local-only.

## Required env vars (server-side)

The API server MUST be started with these for E2E to function:

```bash
ENABLE_TEST_ROUTES=1
LLM_PROVIDER=mock
E2E_MODE=1
NODE_ENV=test
```

> **CRITICAL:** these MUST be present in the **server process's** environment — not in your shell when you launch Playwright, but in the shell that launches `npx tsx src/server.ts`. Locally, the simplest pattern is `set -a && source .env && set +a` (or its `../../.env` variant from `packages/server/`) **before** starting the server, with the four vars above prefixed inline on the `npx tsx` command. `tsx` does NOT auto-load `.env`. If you skip this, a fresh `npm run e2e` will crash on startup with missing-env errors. The global-setup startup probe will fail fast with a clear error if any of the four E2E flags are missing.

If any of these are missing, the global-setup startup probe fails fast with a clear error.

## Conventions (copy from design doc 2026-04-28)

1. **One assertion concept per spec.** Each `test()` asserts a single outcome.
2. **No conditional assertions.** No `if (await locator.isVisible()) ...`. The test knows the expected state.
3. **Network discipline.** Tests hit the real (mocked-LLM) backend by default. Route mocking only for explicit failure-mode tests, via `fixtures/network-faults.ts`.
4. **Mock LLM script discipline.** AI-feature tests use `withMockScript(page, key)` (typed against `MockScriptKey`); never depend on the default.
5. **No `waitForTimeout`.** Use `await expect.poll(...)`, locator auto-waiting, or `waitForResponse`.
6. **Fixture data is canonical.** Assert against seeded post/comment/revision text — never invent expected text.
7. **No retries-as-bandaid.** A spec failing twice in CI gets `test.fixme()` with a tracking-issue link, not a retry count.
8. **Folder boundary.** When a spec could live in two feature folders, it lives in the deeper feature surface (e.g. inline comment on a revision diff line lives in `comments/`).

## Selector convention

- ALL element selection uses `getByTestId` from `fixtures/selectors/<feature>.ts`.
- Naming:
  - Interactive: kebab + role suffix (`reply-btn`, `tag-input`, `dark-mode-toggle`).
  - Content/state: bare kebab nouns (`error-message`, `post-title`).
- **Selection vs assertion:** select via `getByTestId(...)`. Assertions on copy use `toContainText`.

### Worked example

❌ **Wrong** — selects by visible text:

```ts
// Brittle: breaks when copy is reworded for accessibility/i18n.
await page.getByText('Cancel').click();
expect(await page.locator('h1').innerText()).toBe('Welcome back');
```

❌ **Wrong** — assertions through CSS / position:

```ts
// Brittle: testids are stable; CSS class names and DOM position are not.
expect(await page.locator('.toast.error').textContent()).toContain('Bad password');
```

✅ **Right** — selection via testid, assertion via `toContainText`:

```ts
import { auth } from '../fixtures/selectors/auth.js';

await auth.cancelBtn(page).click(); // selection: testid only
await expect(auth.welcomeHeading(page)).toContainText('Welcome back'); // copy assertion: toContainText
await expect(auth.loginError(page)).toContainText('Bad password'); // status assertion: toContainText
```

The testid (`cancel-btn`, `welcome-heading`, `login-error-message`) is the source of truth for "this element". The visible text is the source of truth for "this copy". Tests must not conflate the two.

## Selection vs. assertion

The single most common bug pattern in this suite is conflating **what to find**
with **what to verify**. A locator that uses an attribute that's only true at
the moment of assertion is a selector that races itself.

**Bad — selects on a property the assertion is about to check:**

```ts
// "Find the button that is enabled, then assert it is enabled" — tautology.
// If the page hasn't finished rendering, the locator finds 0 nodes and the
// assertion times out with a confusing 'expected 1, found 0'.
await expect(page.locator('button[aria-pressed="true"]')).toBeVisible();
```

**Good — selects by stable identity, asserts the dynamic state:**

```ts
const subscribeButton = page.getByTestId('subscribe-btn');
await expect(subscribeButton).toHaveAttribute('aria-pressed', 'true');
```

**Rule:** locators select by identity (testid, role+name, semantic structure).
Assertions check state (text, attribute value, visibility, count). If your
locator string mentions the thing your assertion checks, refactor.

## Sharded selector files — header template

Selectors live in `e2e/fixtures/selectors/<feature>.ts` (one file per feature
folder). Every file MUST start with this header:

```ts
// e2e/fixtures/selectors/<feature>.ts
//
// Selectors for the <feature> feature. Imported by:
//   - e2e/specs/<feature>/*.spec.ts
//
// Convention: selectors return Locator | string.
//   - Use Locator for selectors that need .first() / .nth(n) / chained .filter().
//   - Use string for plain CSS / role-name selectors that callers pass to .locator().
//
// Owner: <team> (@<github-handle>)
// Last reviewed: YYYY-MM-DD
```

When you modify a selector file, bump the "Last reviewed" date.

## Storage state security note

Saved auth state (`*.auth.json`) is **gitignored** AND defaults to `os.tmpdir()/forge-e2e-storage/<user>.json` to make accidental commits impossible. To inspect storageState alongside traces, set `E2E_STORAGE_IN_REPO=1` — files then go under `e2e/.auth/` (still gitignored). The repo's Husky pre-commit hook blocks staging `*.auth.json` and `forge-e2e-secret` as a backstop.

## Reset semantics

By default, `beforeEach` calls `/api/__test__/reset` which re-runs `scripts/seed.sql` under a Postgres advisory lock. To opt out (for tests that expect a fresh non-seeded state, e.g. the "register fresh account" sub-test):

```ts
test('fresh register', { tag: '@no-reset' }, async ({ browser }) => { ... });
```

**MinIO is NOT reset** between tests — file uploads accumulate during a run. The seeded post-files refer to deterministic UUIDs, so re-running the suite is idempotent for assertions, but the bucket is not pruned. (Future polish PR adds a teardown.)

## Decision log (ambiguous spec placement)

When a spec could plausibly live in two feature folders, log the decision here so reviewers can see precedent.

| Spec                                                                   | Initial home | Reason |
| ---------------------------------------------------------------------- | ------------ | ------ |
| _(empty for v1 — journey smoke is in its own home `_journey.spec.ts`)_ |              |        |

## Periodic audit — `@no-reset` specs

A small number of specs use `@no-reset` to opt out of the per-worker DB reset.
Once a quarter, run:

```bash
npm run e2e -- --grep @no-reset
```

…and confirm each `@no-reset` spec still avoids mutating state. A spec that
silently grew a write path while keeping the tag will pollute other workers'
fixtures and cause cross-spec flakes. If you find one, drop the tag.

## Patterns (introduced by `e2e/specs/auth/`)

These patterns were established by the auth spec batch (issue #46) and are reusable for future feature folders.

### Direct-URL navigation when the click flow can't reach the asserted state

Some pages return 5xx fixture responses that aren't reachable via the production click flow in E2E mode (e.g., `/api/auth/google` is conditionally registered when `GOOGLE_CLIENT_ID` is set; in E2E it 404s, but the always-registered `/google/callback` still returns the 501 stub). Asserting against the actual fixture text requires direct navigation:

```ts
// e2e/specs/auth/oauth-stub.spec.ts
await page.goto('/api/auth/google/callback?code=fake.code');
await expect(page.locator('body')).toContainText('Google OAuth is not configured');
```

The `page.locator('body')` assertion is a documented exception to the `getByTestId` rule — the response is a JSON body rendered as raw text, with no Vue surface to attach a testid to. Cite the rationale in the spec body.

### Randomized email for `@no-reset` register specs

Specs that opt out of the auto-reset and create new users must use a fresh, unique email per run — hardcoded emails would 409 on the second run. Use `crypto.randomUUID()`:

```ts
// e2e/specs/auth/register-success.spec.ts
import { randomUUID } from 'node:crypto';
const email = `register-${randomUUID()}@example.com`;
```

### One-shot route interception for retry-on-401 paths

The client retries authed requests through `/api/auth/refresh` when they return 401 and the access token is set (`packages/client/src/lib/api.ts:65-67`). To exercise this without actually expiring a token, intercept ONE matching request to return 401 — Playwright's `times: 1` option auto-detaches the route after the first match so the retry hits the real backend:

```ts
// e2e/specs/auth/session-refresh.spec.ts
await page.route('**/api/posts**', (route) => route.fulfill({ status: 401, body: '{}' }), {
  times: 1,
});
```

The `restore-session.ts:16` boot path also fires `/api/auth/refresh` on every authenticated load, so `waitForRequest` resolves on the boot-time refresh and never proves the 401-triggered path was exercised. Count refresh requests instead and assert `>= 2`:

```ts
let refreshCount = 0;
page.on('request', (req) => {
  if (req.method() === 'POST' && req.url().includes('/api/auth/refresh')) refreshCount += 1;
});
// ... navigate, then:
await expect.poll(() => refreshCount).toBeGreaterThanOrEqual(2);
```

### Browser-native validity assertions for client-side blocks

When a form field has HTML5 validity constraints (`type="email"`, `required`, `minlength`), submission is blocked by the browser before the form's own JS runs — no XHR, no error testid populated. Assert against the input's `validity.valid` JS property:

```ts
await auth.loginEmail(page).fill(''); // blank required input
await auth.loginSubmit(page).click();
await expect(page).toHaveURL('/login'); // submission blocked
await expect(auth.loginEmail(page)).toHaveJSProperty('validity.valid', false);
```

The two assertions corroborate ONE concept ("client-side validity blocks submission") and do not violate the one-concept-per-test rule.

## Server rate limit in E2E mode

`POST /api/auth/register` has a strict `max: 3, timeWindow: '1 hour'` rate limit in production. The E2E suite (journey + register tests) fires several registrations per run, so the route now bumps to `max: 10_000` when `E2E_MODE=1` — same pattern `/login` already uses. The production branch is unchanged and still covered by the dedicated rate-limit tests.

## Commands reference

- `npm run e2e` — headless run, all specs.
- `npm run e2e -- specs/_journey.spec.ts` — run only the journey smoke.
- `npm run e2e -- --grep "Phase 4"` — run a sub-section.
- `npm run e2e:ui` — Playwright UI mode.
- `npm run e2e -- --workers=1` — serialize for debugging (the journey passes at workers=4 in CI).

## Flake protocol

When a spec flakes:

1. **First flake on a PR**: the auto-flake-tracker (`.github/scripts/e2e-flake-tracker.ts`) posts a PR comment suggesting `test.fixme()` and links any existing tracking issue.
2. **Two consecutive failures on `main`**: detected by querying the previous main run's `playwright-report` artifact via the GitHub API. The tracker either creates a `flaky-e2e`-labeled tracking issue (per-spec) or comments on an umbrella issue if the spec matches `.github/known-flake-classes.json` (e.g., closed #75 was the umbrella for cross-worker reset contention before its fix).
3. **De-flake SLA**: once a `flaky-e2e` issue exists, the **on-call engineer** owns it. Target: fix or `test.fixme()` within 48 hours.
4. **Un-fixme'ing**: when un-`test.fixme()`-ing a spec, **run it first**. If it still fails, do NOT assume the gating fix was incomplete — diagnose whether a secondary unrelated bug was masked (cf. closed #65).
5. **Budget**: the workflow fails if `test.fixme(` count in `e2e/specs/` exceeds `E2E_FIXME_BUDGET` (default 7).

Dashboard: open issues with the `flaky-e2e` label — [`is:open label:flaky-e2e`](https://github.com/multiandrewlab/forge/issues?q=is%3Aopen+label%3Aflaky-e2e).

## Out of Scope

The following are intentionally not exercised by this suite:

- **WebKit (Safari) Playwright project** — permanently out of scope. Forge is
  Chromium-first; we do not have Safari-specific code paths and the marginal
  coverage does not justify the suite-runtime cost. If a Safari-specific bug is
  reported in the wild, file a focused regression spec under `e2e/specs/shell/`
  and tag it `@webkit`; only then revisit adding the project.
- **Firefox Playwright project** — same rationale.
- **Mobile beyond `@mobile`-tagged specs** — the `chromium-mobile` project runs
  only `register a fresh account` from the journey on a Pixel 5 device. Add
  `@mobile` tags sparingly when a mobile-specific surface needs coverage.
- **Visual regression / screenshot diffing** — `screenshot: only-on-failure`
  exists for debugging only.
- **MinIO bucket pruning between specs** — file uploads accumulate during a
  run; re-runs are idempotent against deterministic seed UUIDs.
