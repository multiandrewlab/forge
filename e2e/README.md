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

## Periodic audit

Once per quarter, run `cd e2e && npx playwright test --grep @no-reset` to list all opt-outs. Any without a clear reason in the test body should be re-evaluated.

## Commands reference

- `npm run e2e` — headless run, all specs.
- `npm run e2e -- specs/_journey.spec.ts` — run only the journey smoke.
- `npm run e2e -- --grep "Phase 4"` — run a sub-section.
- `npm run e2e:ui` — Playwright UI mode.
- `npm run e2e -- --workers=1` — serialize for debugging (the journey passes at workers=4 in CI).
