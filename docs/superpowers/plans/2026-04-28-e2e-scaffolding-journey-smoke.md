# E2E Scaffolding + Journey Smoke (Issue #45) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Note (per CLAUDE.md):** The execution-method choice is presented to the _user_ after this plan passes the plan-review-gate. The "REQUIRED SUB-SKILL" line above is a planning-skill default, not binding — the user always picks.

**Goal:** Scaffold a Playwright E2E suite at `e2e/` plus a single 6-phase journey smoke spec, plus a non-blocking `.github/workflows/e2e-playwright.yml` workflow. Foundation #44 (mock LLM provider, `/api/__test__/reset`, env guards, bootstrap-side secret writer) is already merged on main; this PR layers the client-side rig on top.

**Architecture:**

- New top-level workspace `e2e/` (sibling of `packages/*`), wired into root `package.json` `workspaces`. Not added to `vitest.workspace.ts`. Vitest already excludes `e2e/**` (verified in `vitest.config.ts`).
- Three Page fixtures (`testuser`, `alice`, `carol`) backed by saved storageState JSON. Storage location defaults to `os.tmpdir()/forge-e2e-storage/<user>.json`; opt into `e2e/.auth/` via `E2E_STORAGE_IN_REPO=1` for trace inspection.
- Auto-applied `beforeEach` reset via `/api/__test__/reset` with `X-E2E-Secret` header; opt-out via `@no-reset` tag.
- Selectors sharded by feature (`fixtures/selectors/<feature>.ts`); journey only seeds `shell.ts` and `auth.ts`.
- Single journey smoke (`specs/_journey.spec.ts`) with 6 `test.describe.serial` blocks: **auth, draft, publish, social, fork, permission**.
- New CI workflow uses `pull_request` (not `pull_request_target`); `continue-on-error: true` initially.

**Tech Stack:** Playwright 1.49+, TypeScript strict (extends `tsconfig.base.json`), Node 22, Vue 3 SFC for `data-testid` additions, GitHub Actions, Husky 9.

**Foundation context (already on main, do NOT modify):**

- `packages/server/src/app.ts` registers `/api/__test__/reset` when `ENABLE_TEST_ROUTES=1` (env guarded).
- `packages/server/src/lib/bootstrap.ts:runBootGuards()` writes `forge-e2e-secret` to `RUNNER_TEMP ?? os.tmpdir()` and mutates `env.E2E_SECRET`.
- `packages/server/src/plugins/langchain/mock-scripts.ts` exports `mockScripts` registry; `index.ts` reads `x-mock-script` header.
- `packages/shared/src/types/mock-script-keys.ts` exports `MockScriptKey` union (`'default' | 'autocomplete-typescript-react' | 'generate-readme-short' | 'error-rate-limit' | 'mid-stream-cancel'`); already excluded from coverage as a type-only file.
- Seeded users in `scripts/seed.sql`:
  - `testuser@example.com` → `a0000000-0000-0000-0000-000000000099`
  - `alice@example.com` → `a0000000-0000-0000-0000-000000000001`
  - `carol@example.com` → `a0000000-0000-0000-0000-000000000003`
  - All use `password123` (bcrypt cost-12).
- Migrations live at `packages/server/src/db/migrations/`. The CI workflow uses `cd packages/server && npm run migrate:up` to apply them (matches `.github/workflows/bruno-regression.yml` pattern). `docker/init-db.sql` is a docker-compose-only convenience (auto-mounted via `docker-entrypoint-initdb.d/`); migration `001_initial-schema.sql` already runs `CREATE EXTENSION IF NOT EXISTS` for `uuid-ossp`, `pg_trgm`, `unaccent`, so CI does not need to apply `init-db.sql` separately.

**Critical client-side gaps discovered during plan review (addressed in Tasks 3.5 and 6.5):**

Two architectural issues block the journey from working as written; both are fixed inside `packages/client/` and require nothing in `packages/server/`:

1. **`vite preview` does not proxy `/api/*`** (Task 3.5). `packages/client/vite.config.ts:14-23` defines `server.proxy` for `/api` and `/ws` — but Vite's `server.proxy` only applies to the dev server (`vite dev`), not the production-build preview (`vite preview`). The plan's `playwright.config.ts` boots the SPA via `npm run preview` on port 4173 with the API on 3001. The SPA uses purely relative URLs (`fetch('/api/auth/refresh')` etc.); without a preview-mode proxy, those requests hit Vite preview's static file server and 404. Task 3.5 adds a `preview.proxy` block mirroring `server.proxy`. Same-host (`localhost`) on both ports keeps `sameSite: 'strict'` cookie attachment intact.

2. **No boot-time session restore in the SPA** (Task 6.5). `packages/client/src/stores/auth.ts` keeps `accessToken` only in memory (Pinia `ref`); `apiFetch` (`packages/client/src/lib/api.ts:66`) only attempts a refresh on a 401 response that already had an `Authorization` header. There is no boot-time refresh today — meaning a user with a valid `refresh_token` cookie still lands on `/login` after a page reload. The journey smoke would hit this immediately: `global-setup` saves a storageState with the cookie, but on each test's first navigation the SPA boots without an access token and the router guard redirects to `/login`. Task 6.5 fixes this with a small, behaviour-correct addition (boot-time `tryRestoreSession()` in `main.ts`).

Both are legitimate journey-prerequisite client changes — on the same footing as the `data-testid` additions in later tasks. The plan keeps both surgical: `vite.config.ts` gets a copy-and-paste of the existing `server.proxy` block; `main.ts` gets a wrapped async bootstrap with a single new module under unit test.

---

## File Structure

| Path                                                        | Purpose                                                                                                                                                                                                                                        | Create / Modify |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| `e2e/package.json`                                          | `@forge/e2e` workspace; declares `@playwright/test` + `@types/node` deps.                                                                                                                                                                      | Create          |
| `e2e/tsconfig.json`                                         | Extends `../tsconfig.base.json`.                                                                                                                                                                                                               | Create          |
| `e2e/playwright.config.ts`                                  | Workers, reporters, `webServer`, `globalSetup`, project-level `beforeEach` reset hook.                                                                                                                                                         | Create          |
| `e2e/.gitignore`                                            | Local artifacts (`.auth/`, `test-results/`, `playwright-report/`, `forge-e2e-secret`).                                                                                                                                                         | Create          |
| `e2e/README.md`                                             | Conventions doc, mirrors `bruno/README.md` style.                                                                                                                                                                                              | Create          |
| `e2e/support/wait-for-stack.ts`                             | Polls `/api/health`, MinIO live endpoint, Vite preview root.                                                                                                                                                                                   | Create          |
| `e2e/support/server-lifecycle.ts`                           | Helpers used by `webServer.command` to start API + Vite preview with the right env; runs the `/api/__test__/reset` startup probe.                                                                                                              | Create          |
| `e2e/support/global-setup.ts`                               | Reads `forge-e2e-secret`, exposes `process.env.E2E_SECRET`, logs in 3 users via `/api/auth/login`, saves storageState.                                                                                                                         | Create          |
| `e2e/support/global-teardown.ts`                            | Placeholder no-op (v1).                                                                                                                                                                                                                        | Create          |
| `e2e/fixtures/auth.ts`                                      | Page fixtures `testuser`, `alice`, `carol`, all reading saved storageState.                                                                                                                                                                    | Create          |
| `e2e/fixtures/reset.ts`                                     | Re-exports the typed `test` extended with `beforeEach` reset (auto-applied; skipped when `testInfo.tags.includes('@no-reset')`).                                                                                                               | Create          |
| `e2e/fixtures/mock-llm.ts`                                  | Typed `withMockScript(page, key: MockScriptKey)` helper.                                                                                                                                                                                       | Create          |
| `e2e/fixtures/network-faults.ts`                            | Placeholder file with helper signature stub; no faults yet.                                                                                                                                                                                    | Create          |
| `e2e/fixtures/selectors/shell.ts`                           | Cross-cutting selectors used by the journey (nav, error toast, etc.).                                                                                                                                                                          | Create          |
| `e2e/fixtures/selectors/auth.ts`                            | Auth-page selectors used by phase 1.                                                                                                                                                                                                           | Create          |
| `e2e/specs/_journey.spec.ts`                                | Single spec; 6 `test.describe.serial` blocks.                                                                                                                                                                                                  | Create          |
| `package.json`                                              | Add `e2e` to `workspaces`; add `e2e`, `e2e:ui`, `e2e:debug` scripts.                                                                                                                                                                           | Modify          |
| `.gitignore`                                                | Mirror `e2e/.gitignore` patterns at repo root.                                                                                                                                                                                                 | Modify          |
| `.husky/pre-commit`                                         | Refuse staging `*.auth.json` and `forge-e2e-secret` before delegating to `lint-staged`.                                                                                                                                                        | Modify          |
| `.github/workflows/e2e-playwright.yml`                      | New non-blocking E2E CI workflow.                                                                                                                                                                                                              | Create          |
| `packages/client/vite.config.ts`                            | Add `preview.proxy` mirroring the existing `server.proxy` so `/api/*` and `/ws/*` from the production-build preview server route to the API on `localhost:3001`. Without this, the journey cannot work — see "Critical client-side gap" below. | Modify          |
| `packages/client/src/lib/restore-session.ts`                | Boot-time session restore: calls `/api/auth/refresh` + `/api/auth/me`, populates the Pinia auth store before app mount.                                                                                                                        | Create          |
| `packages/client/src/main.ts`                               | Wrap mount in async bootstrap; call `tryRestoreSession()` after Pinia install, before `app.use(router)`.                                                                                                                                       | Modify          |
| `packages/client/src/__tests__/lib/restore-session.test.ts` | Unit tests for the new module (3 paths: success, refresh-fails, me-fetch-fails).                                                                                                                                                               | Create          |
| `packages/client/src/**/*.vue`                              | Add `data-testid` ONLY to components touched by the journey smoke. Explicit list captured in PR description.                                                                                                                                   | Modify (scoped) |

---

## Task 1: Create the `e2e/` workspace skeleton

**Files:**

- Create: `e2e/package.json`
- Create: `e2e/tsconfig.json`
- Create: `e2e/.gitignore`
- Modify: `package.json` (root) — add `e2e` to `workspaces`, add scripts.
- Modify: `.gitignore` (root) — mirror e2e patterns.

- [ ] **Step 1: Create `e2e/package.json`**

```json
{
  "name": "@forge/e2e",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "playwright test",
    "test:ui": "playwright test --ui",
    "test:debug": "playwright test --debug"
  },
  "devDependencies": {
    "@playwright/test": "^1.49.0",
    "@types/node": "^22.0.0"
  },
  "dependencies": {
    "@forge/shared": "*"
  }
}
```

- [ ] **Step 2: Create `e2e/tsconfig.json`**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "types": ["@playwright/test", "node"],
    "outDir": "./dist",
    "rootDir": "./"
  },
  "include": ["**/*.ts"],
  "exclude": ["node_modules", "dist", "test-results", "playwright-report", ".auth"]
}
```

- [ ] **Step 3: Create `e2e/.gitignore`**

```gitignore
.auth/
test-results/
playwright-report/
forge-e2e-secret
node_modules/
dist/
```

- [ ] **Step 4: Update root `package.json`**

In `/Users/andrew/Code/forge/package.json`:

- Add `"e2e"` to the `workspaces` array (after `"packages/client"`).
- Add to the `scripts` object:

```json
"e2e": "npm run test --workspace=@forge/e2e",
"e2e:ui": "npm run test:ui --workspace=@forge/e2e",
"e2e:debug": "npm run test:debug --workspace=@forge/e2e"
```

Final root `workspaces` array:

```json
"workspaces": [
  "packages/shared",
  "packages/server",
  "packages/client",
  "e2e"
]
```

- [ ] **Step 5: Update root `.gitignore`**

Append a new section at the end of `/Users/andrew/Code/forge/.gitignore`:

```gitignore

# E2E artifacts (mirrored in e2e/.gitignore)
e2e/.auth/
e2e/test-results/
e2e/playwright-report/
forge-e2e-secret
```

- [ ] **Step 6: Install workspace + Playwright browsers**

Run:

```bash
npm install
cd e2e && npx playwright install --with-deps chromium
```

Expected: `npm install` succeeds; `playwright install` downloads Chromium.

- [ ] **Step 7: Verify scaffold**

Run:

```bash
npm run e2e -- --version
```

Expected: prints `Version 1.49.x` (no specs run yet because we haven't authored the config — this is just a smoke test of the workspace wiring).

If this command fails because `playwright.config.ts` is missing, that's expected — proceed to Task 3. The point of this step is to verify `npm` resolves the workspace.

- [ ] **Step 8: Commit**

```bash
git add e2e/package.json e2e/tsconfig.json e2e/.gitignore package.json package-lock.json .gitignore
git commit -m "feat(e2e): scaffold @forge/e2e workspace and gitignore patterns"
```

---

## Task 2: Husky pre-commit guard for auth state and secret files

**Files:**

- Modify: `.husky/pre-commit`

The current hook runs `npx lint-staged` only. We prepend a hard guard.

- [ ] **Step 1: Write the guard**

Replace `/Users/andrew/Code/forge/.husky/pre-commit` with:

```sh
# Refuse to stage E2E auth state or the test-route secret. Defense-in-depth on
# top of .gitignore — covers `git add -f` and accidental moves.
staged=$(git diff --cached --name-only --diff-filter=ACM)
if printf '%s\n' "$staged" | grep -E '(\.auth\.json$|(^|/)forge-e2e-secret$)' >/dev/null; then
  echo "✖ pre-commit: refusing to stage auth state or e2e secret:" >&2
  printf '%s\n' "$staged" | grep -E '(\.auth\.json$|(^|/)forge-e2e-secret$)' >&2
  echo "  These files contain credentials and must never be committed." >&2
  echo "  Remove from index: git restore --staged <file>" >&2
  exit 1
fi

npx lint-staged
```

- [ ] **Step 2: Ensure executable bit (CLAUDE.md flagged a prior incident here)**

Run:

```bash
chmod +x .husky/pre-commit
ls -l .husky/pre-commit
```

Expected: file is mode `-rwxr-xr-x` (or includes user+exec).

- [ ] **Step 3: Test the guard fires (manual end-to-end)**

```bash
mkdir -p /tmp/forge-husky-test && cd /tmp/forge-husky-test
echo "secret" > forge-e2e-secret
echo "state" > testuser.auth.json
cd /Users/andrew/Code/forge
cp /tmp/forge-husky-test/forge-e2e-secret ./forge-e2e-secret
cp /tmp/forge-husky-test/testuser.auth.json ./testuser.auth.json
git add forge-e2e-secret testuser.auth.json 2>&1 || true
git commit -m "test: should be blocked" 2>&1 | tee /tmp/husky-output.txt
```

Expected: commit fails with `pre-commit: refusing to stage auth state or e2e secret:` and the listed files.

- [ ] **Step 4: Clean up the test artefacts**

```bash
git restore --staged forge-e2e-secret testuser.auth.json
rm forge-e2e-secret testuser.auth.json
git status -s
```

Expected: clean working tree (no untracked test files left).

- [ ] **Step 5: Commit the hook**

```bash
git add .husky/pre-commit
git commit -m "feat(husky): block staging *.auth.json and forge-e2e-secret"
```

---

## Task 3: Playwright config + support layer

**Files:**

- Create: `e2e/playwright.config.ts`
- Create: `e2e/support/wait-for-stack.ts`
- Create: `e2e/support/server-lifecycle.ts`
- Create: `e2e/support/global-teardown.ts`

`global-setup.ts` lands in Task 4 (it depends on the auth fixture).

- [ ] **Step 1: Create `e2e/support/wait-for-stack.ts`**

```ts
import { setTimeout as sleep } from 'node:timers/promises';

const API_BASE = process.env.API_URL ?? 'http://localhost:3001';
const PREVIEW_BASE = process.env.PREVIEW_URL ?? 'http://localhost:4173';
const MINIO_HEALTH = process.env.MINIO_HEALTH_URL ?? 'http://localhost:9000/minio/health/live';

async function poll(url: string, name: string, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown = null;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (res.ok) return;
      lastError = new Error(`${name}: HTTP ${res.status}`);
    } catch (err) {
      lastError = err;
    }
    await sleep(500);
  }
  throw new Error(
    `[wait-for-stack] ${name} did not become ready at ${url} within ${timeoutMs}ms (last error: ${String(lastError)})`,
  );
}

export async function waitForStack(): Promise<void> {
  await Promise.all([
    poll(`${API_BASE}/api/health`, 'API'),
    poll(MINIO_HEALTH, 'MinIO'),
    poll(`${PREVIEW_BASE}/`, 'Vite preview'),
  ]);
}
```

- [ ] **Step 2: Create `e2e/support/server-lifecycle.ts`**

```ts
import { readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SECRET_FILENAME = 'forge-e2e-secret';

/**
 * Resolve the file path that the server's bootstrap (lib/bootstrap.ts) writes
 * the e2e secret to: RUNNER_TEMP in CI, os.tmpdir() locally.
 */
export function resolveSecretPath(env: NodeJS.ProcessEnv = process.env): string {
  const dir = env.RUNNER_TEMP ?? tmpdir();
  return join(dir, SECRET_FILENAME);
}

/**
 * Read the secret file written by the server bootstrap. Throws a clear error
 * if the file is missing — usually means the server was started without
 * ENABLE_TEST_ROUTES=1.
 */
export function readE2ESecret(env: NodeJS.ProcessEnv = process.env): string {
  const path = resolveSecretPath(env);
  if (!existsSync(path)) {
    throw new Error(
      `[e2e] secret file missing at ${path}. ` +
        `Did the server start with ENABLE_TEST_ROUTES=1? ` +
        `See e2e/README.md for the local-dev env vars.`,
    );
  }
  const secret = readFileSync(path, 'utf-8').trim();
  if (secret.length === 0) {
    throw new Error(`[e2e] secret file at ${path} is empty.`);
  }
  return secret;
}

/**
 * Hit /api/__test__/reset once at startup with the secret, to fail fast if
 * the server is missing ENABLE_TEST_ROUTES=1 (would 404) or the secret is
 * stale (would 403).
 */
export async function startupProbe(apiBase: string, secret: string): Promise<void> {
  const res = await fetch(`${apiBase}/api/__test__/reset`, {
    method: 'POST',
    headers: { 'X-E2E-Secret': secret },
  });
  if (res.status === 404) {
    throw new Error(
      `[e2e] startup probe: /api/__test__/reset returned 404. ` +
        `The server is running without ENABLE_TEST_ROUTES=1.`,
    );
  }
  if (res.status === 403) {
    throw new Error(
      `[e2e] startup probe: /api/__test__/reset returned 403. ` +
        `The X-E2E-Secret in ${resolveSecretPath()} does not match what the server has.`,
    );
  }
  if (!res.ok) {
    throw new Error(`[e2e] startup probe: /api/__test__/reset returned HTTP ${res.status}`);
  }
}
```

- [ ] **Step 3: Create `e2e/support/global-teardown.ts`**

```ts
import type { FullConfig } from '@playwright/test';

// v1 placeholder. When file uploads in fork specs land, this will clear MinIO
// e2e bucket residue. For the journey smoke, the per-test reset endpoint is
// enough.
export default async function globalTeardown(_config: FullConfig): Promise<void> {
  // intentionally empty
}
```

- [ ] **Step 4: Create `e2e/playwright.config.ts`**

```ts
import { defineConfig, devices } from '@playwright/test';

const API_BASE = process.env.API_URL ?? 'http://localhost:3001';
const PREVIEW_BASE = process.env.PREVIEW_URL ?? 'http://localhost:4173';

export default defineConfig({
  testDir: './specs',
  // Within a worker, specs run sequentially. Cross-worker isolation is held by
  // the Postgres advisory lock inside /api/__test__/reset (see foundation #44).
  fullyParallel: false,
  workers: process.env.CI ? 4 : undefined,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['html', { open: 'never' }], ['list'], ['github']],
  globalSetup: './support/global-setup.ts',
  globalTeardown: './support/global-teardown.ts',
  use: {
    baseURL: PREVIEW_BASE,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    extraHTTPHeaders: {
      // populated per-request inside fixtures, kept here for visibility
    },
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command:
        'cd ../packages/server && ENABLE_TEST_ROUTES=1 LLM_PROVIDER=mock E2E_MODE=1 NODE_ENV=test npx tsx src/server.ts',
      url: `${API_BASE}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      // --host localhost (NOT 127.0.0.1) keeps the preview origin same-site
      // with the API origin so the refresh_token cookie (sameSite: strict)
      // attaches to /api/auth/refresh requests proxied through preview.
      command: 'cd ../packages/client && npm run preview -- --port 4173 --host localhost',
      url: PREVIEW_BASE,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
```

Also update the URL constants at the top of the file so all defaults use `localhost`:

```ts
const API_BASE = process.env.API_URL ?? 'http://localhost:3001';
const PREVIEW_BASE = process.env.PREVIEW_URL ?? 'http://localhost:4173';
```

(These are already `localhost` in the snippet above; the change is to make sure no `127.0.0.1` slips into other support files. Search-and-replace at the end of this task to be safe — see Step 5.)

> **Why two `webServer` entries:** Playwright supports an array of `webServer` blocks; each is launched and waited on independently. `reuseExistingServer: !process.env.CI` lets local devs keep their `npm run dev` API and preview servers running.

> **Why `localhost` everywhere:** the `refresh_token` cookie is `sameSite: 'strict'` and `Path=/api/auth/refresh` (`packages/server/src/routes/auth.ts:57`). For Task 4's `global-setup` API login → Task 6.5's boot-time refresh chain to work, both origins must be same-site. `localhost:4173` and `localhost:3001` qualify (registrable domain `localhost`). Mixing `127.0.0.1` and `localhost` would NOT be same-site and the cookie would silently fail to attach.

- [ ] **Step 5: Verify config parses + ensure no `127.0.0.1` leaks**

```bash
cd /Users/andrew/Code/forge
cd e2e && npx playwright test --list 2>&1 | head -20
# Search for stray 127.0.0.1 references that would break same-site cookie
# attachment. There should be NONE in e2e/ — all hosts use 'localhost'.
grep -rn "127\.0\.0\.1" e2e/ 2>&1 | tail -5
```

Expected output: a parse-time error about missing `support/global-setup.ts` or zero specs (we haven't authored `global-setup.ts` yet — that's Task 4). The grep must return zero matches. If grep returns matches, replace each `127.0.0.1` with `localhost` before continuing.

- [ ] **Step 6: Commit**

```bash
git add e2e/support/wait-for-stack.ts e2e/support/server-lifecycle.ts e2e/support/global-teardown.ts e2e/playwright.config.ts
git commit -m "feat(e2e): playwright config + support layer (server lifecycle, stack wait)"
```

---

## Task 3.5: Vite preview proxy for `/api/*`

**Why this task exists:** `packages/client/vite.config.ts` defines a `server.proxy` block that forwards `/api/*` and `/ws/*` to `http://localhost:3001` — but Vite's `server.proxy` only applies to `vite dev`. The journey runs against `vite preview` (the production-build static server), which silently ignores `server.proxy`. Without a preview-mode proxy, the SPA's relative `fetch('/api/auth/refresh')` (and every other API call) hits the static server and 404s. This task adds a `preview.proxy` block mirroring `server.proxy` so the same routing applies to the preview server.

**Files:**

- Modify: `packages/client/vite.config.ts`

- [ ] **Step 1: Update `packages/client/vite.config.ts`**

Replace the `defineConfig({...})` body so it contains a `preview` block alongside the existing `server` block. Final file:

```ts
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

const apiProxy = {
  '/api': {
    target: 'http://localhost:3001',
    changeOrigin: true,
  },
  '/ws': {
    target: 'ws://localhost:3001',
    ws: true,
  },
};

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 3000,
    proxy: apiProxy,
  },
  preview: {
    port: 4173,
    proxy: apiProxy,
  },
});
```

> **Why same-host (`localhost`) matters:** the `refresh_token` cookie is set with `sameSite: 'strict'` (`packages/server/src/routes/auth.ts:57`). `localhost:4173` and `localhost:3001` are same-site under browser sameSite rules (registrable domain `localhost`); the cookie attaches on requests proxied from `localhost:4173` → `localhost:3001`. Using `127.0.0.1` for one and `localhost` for the other would NOT be same-site (different hosts) and the cookie would silently fail to attach.

- [ ] **Step 2: Verify the existing dev workflow still works**

```bash
cd packages/client && npx vite --version 2>&1 | tail -3
```

Expected: prints a Vite version (≥4). The config refactor (extracting `apiProxy` into a constant) keeps the same shape, so `npm run dev` and `npm run preview` both still get the proxy block. No behavioural change for existing dev.

- [ ] **Step 3: Run client unit tests + coverage**

```bash
cd /Users/andrew/Code/forge && npm run test:coverage 2>&1 | tail -10
```

Expected: 100% coverage held. `vite.config.ts` is excluded from coverage (the existing `**/*.config.*` pattern in `vitest.config.ts`).

- [ ] **Step 4: Commit**

```bash
git add packages/client/vite.config.ts
git commit -m "feat(client): mirror server.proxy into preview.proxy for E2E"
```

---

## Task 4: Auth fixture + global-setup (3-user storage state)

**Files:**

- Create: `e2e/fixtures/auth.ts`
- Create: `e2e/support/global-setup.ts`

The seed users `testuser`, `alice`, `carol` already exist with password `password123`.

- [ ] **Step 1: Create `e2e/fixtures/auth.ts`**

```ts
import { test as base, type Page } from '@playwright/test';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// `e2e/package.json` declares `"type": "module"`, so __dirname is undefined.
// Derive it from import.meta.url for ESM compatibility.
const __dirname = dirname(fileURLToPath(import.meta.url));

export type AuthUser = 'testuser' | 'alice' | 'carol';

export const SEED_USERS = {
  testuser: { email: 'testuser@example.com', password: 'password123' },
  alice: { email: 'alice@example.com', password: 'password123' },
  carol: { email: 'carol@example.com', password: 'password123' },
} as const;

/**
 * Resolve the saved storageState file path for a user. Defaults to a
 * tmpdir-scoped location so engineers can never accidentally `git add` it.
 * Set `E2E_STORAGE_IN_REPO=1` to put it under `e2e/.auth/` for trace inspection.
 */
export function storageStatePath(user: AuthUser): string {
  if (process.env.E2E_STORAGE_IN_REPO === '1') {
    return join(__dirname, '..', '.auth', `${user}.json`);
  }
  return join(tmpdir(), 'forge-e2e-storage', `${user}.json`);
}

type AuthFixtures = {
  testuser: Page;
  alice: Page;
  carol: Page;
};

export const test = base.extend<AuthFixtures>({
  testuser: async ({ browser }, use) => {
    const ctx = await browser.newContext({ storageState: storageStatePath('testuser') });
    const page = await ctx.newPage();
    await use(page);
    await ctx.close();
  },
  alice: async ({ browser }, use) => {
    const ctx = await browser.newContext({ storageState: storageStatePath('alice') });
    const page = await ctx.newPage();
    await use(page);
    await ctx.close();
  },
  carol: async ({ browser }, use) => {
    const ctx = await browser.newContext({ storageState: storageStatePath('carol') });
    const page = await ctx.newPage();
    await use(page);
    await ctx.close();
  },
});

export { expect } from '@playwright/test';
```

- [ ] **Step 2: Create `e2e/support/global-setup.ts` (API-driven login)**

The DoD says "logs in 3 users via API, saves storageState files." We honour that literally: a Playwright `APIRequestContext` posts to `/api/auth/login`, the server's response sets the HttpOnly `refresh_token` cookie scoped to `/api/auth/refresh`, and `ctx.storageState()` captures that cookie. On a journey test's first navigation, Task 6.5's boot-time restore consumes the cookie via `/api/auth/refresh` + `/api/auth/me` and primes the Pinia store before the router guard runs. End-to-end: API login → cookie persisted → SPA boot-restore → logged-in state.

```ts
import { request, type FullConfig } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { SEED_USERS, storageStatePath, type AuthUser } from '../fixtures/auth.js';
import { readE2ESecret, startupProbe } from './server-lifecycle.js';
import { waitForStack } from './wait-for-stack.js';

const API_BASE = process.env.API_URL ?? 'http://localhost:3001';

async function loginAndSave(user: AuthUser): Promise<void> {
  const ctx = await request.newContext({ baseURL: API_BASE });
  const { email, password } = SEED_USERS[user];
  const res = await ctx.post('/api/auth/login', { data: { email, password } });
  if (!res.ok()) {
    const body = await res.text().catch(() => '<unreadable>');
    await ctx.dispose();
    throw new Error(
      `[global-setup] login failed for ${user} (${email}): HTTP ${res.status()}\n${body}`,
    );
  }
  const path = storageStatePath(user);
  mkdirSync(dirname(path), { recursive: true });
  await ctx.storageState({ path });
  await ctx.dispose();
}

export default async function globalSetup(_config: FullConfig): Promise<void> {
  await waitForStack();
  const secret = readE2ESecret();
  process.env.E2E_SECRET = secret;
  await startupProbe(API_BASE, secret);
  for (const user of ['testuser', 'alice', 'carol'] as const) {
    await loginAndSave(user);
  }
}
```

> **Why API login is correct here:** the server's `POST /api/auth/login` handler (`packages/server/src/routes/auth.ts`) sets `Set-Cookie: refresh_token=…; HttpOnly; Path=/api/auth/refresh`. `ctx.storageState()` captures cookies regardless of who set them (browser or APIRequestContext). When a journey test opens a Page using that storageState, the cookie is restored automatically; the SPA's `tryRestoreSession()` from Task 6.5 then exchanges it for an access token before the router activates. This satisfies the DoD wording verbatim and keeps `global-setup` fast (no browser launch).

> **Verification step (deferred to T7 Step 5 first journey run):** after the first run of the journey spec, inspect `<tmpdir>/forge-e2e-storage/testuser.json`. It must contain a non-empty `cookies` array with an entry for `refresh_token`. If empty, the server response did not include `Set-Cookie` (likely a server-side bug or a CORS / `credentials` mismatch), in which case the journey will redirect to `/login` and the implementer must investigate the server's auth-cookie response shape.

- [ ] **Step 3: Verify global-setup wiring (no tests yet)**

```bash
cd e2e && npx playwright test --list 2>&1 | head -20
```

Expected: `Listing tests:` with zero specs and no errors. If it errors on missing imports, fix paths before proceeding.

- [ ] **Step 4: Commit**

```bash
git add e2e/fixtures/auth.ts e2e/support/global-setup.ts
git commit -m "feat(e2e): auth fixture + global-setup (3-user storage state via API login)"
```

---

## Task 5: Reset + mock-LLM + network-faults fixtures

**Files:**

- Create: `e2e/fixtures/reset.ts`
- Create: `e2e/fixtures/mock-llm.ts`
- Create: `e2e/fixtures/network-faults.ts`

- [ ] **Step 1: Create `e2e/fixtures/reset.ts`**

```ts
import { test as authTest } from './auth.js';

const API_BASE = process.env.API_URL ?? 'http://localhost:3001';

/**
 * Re-export the auth-extended test, plus an auto-applied beforeEach that
 * resets the database via the foundation #44 endpoint. Specs opt out via
 * Playwright's tag mechanism: `test('fresh register', { tag: '@no-reset' }, ...)`.
 */
export const test = authTest.extend<Record<string, never>>({});

test.beforeEach(async ({ request }, testInfo) => {
  if (testInfo.tags.includes('@no-reset')) return;
  const secret = process.env.E2E_SECRET;
  if (!secret) {
    throw new Error('[e2e/reset] process.env.E2E_SECRET unset — global-setup did not run.');
  }
  const res = await request.post(`${API_BASE}/api/__test__/reset`, {
    headers: { 'X-E2E-Secret': secret },
  });
  if (!res.ok()) {
    const body = await res.text().catch(() => '<unreadable>');
    throw new Error(`[e2e/reset] reset failed: HTTP ${res.status()}\n${body}`);
  }
});

export { expect } from './auth.js';
```

- [ ] **Step 2: Create `e2e/fixtures/mock-llm.ts`**

```ts
import type { Page } from '@playwright/test';
import type { MockScriptKey } from '@forge/shared';

/**
 * Type-safe wrapper around the X-Mock-Script header (foundation #44).
 * Each subsequent SPA → /api/ai/* request will use this script.
 */
export async function withMockScript(page: Page, key: MockScriptKey): Promise<void> {
  await page.setExtraHTTPHeaders({ 'X-Mock-Script': key });
}

/**
 * Clear the mock-script header (revert to the deterministic 'default' script
 * baked into the mock provider).
 */
export async function clearMockScript(page: Page): Promise<void> {
  await page.setExtraHTTPHeaders({});
}
```

> **Verify the import path works:** `MockScriptKey` is exported from `@forge/shared` via `packages/shared/src/types/index.ts`. If the type doesn't resolve in the e2e workspace, run `npm run build --workspace=@forge/shared` and confirm `packages/shared/dist/types/mock-script-keys.d.ts` exists. Foundation #44 ships with this re-export already in place.

- [ ] **Step 3: Create `e2e/fixtures/network-faults.ts`**

```ts
import type { Page } from '@playwright/test';

/**
 * Placeholder for opt-in route-mocked network failure injection. Specific
 * faults will be added in their feature PRs (issue #46+). All tests that
 * mock at the network layer MUST use helpers from this file so the project
 * has a single audit point.
 *
 * Example future helper signature (do NOT implement here):
 *   export async function withTransientFailure(page: Page, urlGlob: string, status: number): Promise<void>
 */
export async function __networkFaultsPlaceholder(_page: Page): Promise<void> {
  // intentionally empty
}
```

- [ ] **Step 4: Commit**

```bash
git add e2e/fixtures/reset.ts e2e/fixtures/mock-llm.ts e2e/fixtures/network-faults.ts
git commit -m "feat(e2e): reset, mock-llm, and network-faults fixtures"
```

---

## Task 6: Initial sharded selector registry (shell + auth)

**Files:**

- Create: `e2e/fixtures/selectors/shell.ts`
- Create: `e2e/fixtures/selectors/auth.ts`

These start minimal and grow only as the journey spec needs them. Each addition is paired with a `data-testid` somewhere in `packages/client/src/**/*.vue`.

Selector naming convention (per design, lines 350-353 of the design doc):

- Interactive: kebab-case + role suffix (`reply-btn`, `tag-input`)
- Content/state: bare kebab nouns (`error-message`, `post-title`)

- [ ] **Step 1: Create `e2e/fixtures/selectors/shell.ts`**

```ts
import type { Page, Locator } from '@playwright/test';

/**
 * Cross-cutting selectors used by the journey smoke. Each entry below has a
 * matching data-testid attribute somewhere in packages/client/src/**.
 *
 * Convention:
 *   - Interactive: kebab + role suffix (e.g. 'submit-btn').
 *   - Content/state: bare kebab nouns (e.g. 'error-message').
 *   - Selection always uses getByTestId; assertions on copy use toContainText.
 */
export const shell = {
  errorToast: (page: Page): Locator => page.getByTestId('error-toast'),
  // The TheTopBar.vue search-trigger already exists (foundation).
  searchTrigger: (page: Page): Locator => page.getByTestId('search-trigger'),
  // Generic forbidden / not-permitted page used by the permission phase.
  forbiddenPage: (page: Page): Locator => page.getByTestId('forbidden-page'),
};
```

- [ ] **Step 2: Create `e2e/fixtures/selectors/auth.ts`**

```ts
import type { Page, Locator } from '@playwright/test';

export const auth = {
  // Login page
  loginEmail: (page: Page): Locator => page.getByTestId('login-email-input'),
  loginPassword: (page: Page): Locator => page.getByTestId('login-password-input'),
  loginSubmit: (page: Page): Locator => page.getByTestId('login-submit-btn'),
  loginError: (page: Page): Locator => page.getByTestId('login-error-message'),

  // Register page
  registerEmail: (page: Page): Locator => page.getByTestId('register-email-input'),
  registerName: (page: Page): Locator => page.getByTestId('register-name-input'),
  registerPassword: (page: Page): Locator => page.getByTestId('register-password-input'),
  registerSubmit: (page: Page): Locator => page.getByTestId('register-submit-btn'),

  // Top bar (logged in)
  userMenuTrigger: (page: Page): Locator => page.getByTestId('user-menu-trigger'),
  logoutAction: (page: Page): Locator => page.getByTestId('logout-action'),
};
```

- [ ] **Step 3: Commit**

```bash
git add e2e/fixtures/selectors/shell.ts e2e/fixtures/selectors/auth.ts
git commit -m "feat(e2e): seed shell + auth selector registries (journey scope only)"
```

---

## Task 6.5: SPA boot-time session restore

**Why this task exists:** The SPA today never restores the auth session on cold start — `accessToken` lives only in memory (`packages/client/src/stores/auth.ts:6`), and `apiFetch` (`packages/client/src/lib/api.ts:66`) only refreshes on 401 responses that already had a token attached. Result: the journey's `testuser` / `alice` / `carol` fixtures restore the saved `refresh_token` cookie but the SPA boots with `isAuthenticated === false` and the router guard redirects every navigation to `/login`. This task adds a small boot-time `tryRestoreSession()` that hits `/api/auth/refresh` (browser auto-attaches the cookie) and `/api/auth/me`, then primes the Pinia auth store before `app.mount`. This is on the same footing as the `data-testid` additions in later tasks: a journey-touched client change. It is also a real UX bug fix — without it, page reload logs the user out.

**Files:**

- Create: `packages/client/src/lib/restore-session.ts`
- Modify: `packages/client/src/main.ts`
- Create: `packages/client/src/__tests__/lib/restore-session.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/client/src/__tests__/lib/restore-session.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { tryRestoreSession } from '../../lib/restore-session';
import { useAuthStore } from '../../stores/auth';

const fetchMock = vi.fn();

beforeEach(() => {
  setActivePinia(createPinia());
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('tryRestoreSession', () => {
  it('populates the auth store when refresh + me both succeed', async () => {
    // Match the actual @forge/shared User shape (camelCase displayName,
    // required avatarUrl/authProvider/timestamps). Verified against
    // packages/shared/src/types/index.ts.
    const mockUser = {
      id: 'u1',
      email: 'u@example.com',
      displayName: 'U',
      avatarUrl: null,
      authProvider: 'local' as const,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/auth/refresh') {
        return Promise.resolve(
          new Response(JSON.stringify({ accessToken: 'abc' }), { status: 200 }),
        );
      }
      if (url === '/api/auth/me') {
        return Promise.resolve(new Response(JSON.stringify(mockUser), { status: 200 }));
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    await tryRestoreSession();

    const store = useAuthStore();
    expect(store.accessToken).toBe('abc');
    expect(store.user).toEqual(mockUser);
  });

  it('leaves the auth store empty when refresh fails', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 401 }));

    await tryRestoreSession();

    const store = useAuthStore();
    expect(store.accessToken).toBeNull();
    expect(store.user).toBeNull();
  });

  it('leaves the auth store empty when me fetch fails', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/auth/refresh') {
        return Promise.resolve(
          new Response(JSON.stringify({ accessToken: 'abc' }), { status: 200 }),
        );
      }
      return Promise.resolve(new Response('', { status: 500 }));
    });

    await tryRestoreSession();

    const store = useAuthStore();
    expect(store.accessToken).toBeNull();
    expect(store.user).toBeNull();
  });

  it('does not throw if fetch rejects (network error)', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    await expect(tryRestoreSession()).resolves.toBeUndefined();
    const store = useAuthStore();
    expect(store.accessToken).toBeNull();
  });

  it('does not throw if refresh returns a non-JSON 200 (e.g. proxied HTML error page)', async () => {
    fetchMock.mockResolvedValue(
      new Response('<html>Bad Gateway</html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      }),
    );

    await expect(tryRestoreSession()).resolves.toBeUndefined();
    const store = useAuthStore();
    expect(store.accessToken).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test, expect it to fail**

```bash
cd packages/client && npx vitest run src/__tests__/lib/restore-session.test.ts 2>&1 | tail -10
```

Expected: import error — module `../../lib/restore-session` does not exist.

- [ ] **Step 3: Implement `packages/client/src/lib/restore-session.ts`**

```ts
import type { User } from '@forge/shared';
import { useAuthStore } from '@/stores/auth';

/**
 * Boot-time session restore. The browser auto-attaches the HttpOnly
 * `refresh_token` cookie scoped to /api/auth/refresh; if the cookie is valid
 * we get a fresh access token and populate the Pinia auth store before the
 * router guard runs.
 *
 * Best-effort: any failure (no cookie, expired cookie, server down) leaves
 * the store empty and the user lands on /login like a fresh visitor.
 */
export async function tryRestoreSession(): Promise<void> {
  let accessToken: string;
  try {
    const refreshRes = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    });
    if (!refreshRes.ok) return;
    const data = (await refreshRes.json()) as { accessToken: string };
    accessToken = data.accessToken;
  } catch {
    return;
  }

  let user: User;
  try {
    const meRes = await fetch('/api/auth/me', {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: 'include',
    });
    if (!meRes.ok) return;
    user = (await meRes.json()) as User;
  } catch {
    return;
  }

  useAuthStore().setAuth(accessToken, user);
}
```

- [ ] **Step 4: Re-run the test, expect it to pass**

```bash
cd packages/client && npx vitest run src/__tests__/lib/restore-session.test.ts 2>&1 | tail -10
```

Expected: 4 passing tests.

- [ ] **Step 5: Modify `packages/client/src/main.ts`**

Replace the file contents with:

```ts
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import PrimeVue from 'primevue/config';
import App from './App.vue';
import router from './plugins/router';
import { tryRestoreSession } from '@/lib/restore-session';
import './assets/main.css';

async function bootstrap(): Promise<void> {
  const app = createApp(App);

  // Pinia must be installed before tryRestoreSession runs (it reads the
  // auth store via useAuthStore()).
  app.use(createPinia());

  // Restore the session BEFORE wiring the router so the router guard sees
  // the correct `isAuthenticated` on the very first navigation.
  await tryRestoreSession();

  app.use(router);
  app.use(PrimeVue);

  app.mount('#app');
}

void bootstrap();
```

> Note: `main.ts` is excluded from coverage (`vitest.config.ts:13`), so the bootstrap wrapper itself doesn't need a unit test. The `tryRestoreSession` module IS in scope and is fully covered by the tests in Step 1.

- [ ] **Step 6: Run all client tests + coverage gate**

```bash
cd /Users/andrew/Code/forge && npm run test:coverage 2>&1 | tail -20
```

Expected: 100% across the four metrics. Pre-existing `App.test.ts` does not import `main.ts` and should continue to pass unchanged.

- [ ] **Step 7: Commit**

```bash
git add packages/client/src/lib/restore-session.ts \
        packages/client/src/main.ts \
        packages/client/src/__tests__/lib/restore-session.test.ts
git commit -m "feat(client): boot-time session restore via /api/auth/refresh + /api/auth/me"
```

---

## Task 7: Journey spec scaffold + Phase 1 (auth)

**Files:**

- Create: `e2e/specs/_journey.spec.ts`
- Modify (TDD-driven): `packages/client/src/pages/LoginPage.vue`, `packages/client/src/pages/RegisterPage.vue`, `packages/client/src/components/shell/TheTopBar.vue` (or wherever the user menu / logout lives) — add the missing `data-testid` attributes referenced by the auth selectors.

The TDD cycle for each phase: write the phase block, run it, fail because a `data-testid` is missing, add the attribute + the corresponding selector entry (if not already in Task 6's registry), re-run, watch pass, commit.

**Server pre-requisite for the run:** the server and Vite preview must be running with the right env. If they aren't running locally, Playwright's `webServer` block will start them. Verify locally:

```bash
docker compose up -d postgres minio
cd packages/server && set -a && source ../../.env && set +a && \
  ENABLE_TEST_ROUTES=1 LLM_PROVIDER=mock E2E_MODE=1 NODE_ENV=test npx tsx src/server.ts &
cd packages/client && npm run build && npm run preview -- --port 4173 --host 127.0.0.1 &
```

- [ ] **Step 1: Create `e2e/specs/_journey.spec.ts` with all 6 phase scaffolds (other phases skipped initially)**

```ts
import { test, expect } from '../fixtures/reset.js';
import { auth } from '../fixtures/selectors/auth.js';
import { shell } from '../fixtures/selectors/shell.js';
import { withMockScript } from '../fixtures/mock-llm.js';

const FRESH_USER = {
  email: 'journey+register@example.com',
  name: 'Journey Tester',
  password: 'password123',
};

test.describe.serial('Phase 1 — auth: register, login, logout, relogin', () => {
  test('register a fresh account', { tag: '@no-reset' }, async ({ browser }) => {
    // Pre-condition: page is anonymous (we drive a raw context, not the
    // testuser fixture). Tagged @no-reset so we don't wipe the user we just
    // created before the assertion runs in the next test in this describe block.
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto('/register');
    await auth.registerEmail(page).fill(FRESH_USER.email);
    await auth.registerName(page).fill(FRESH_USER.name);
    await auth.registerPassword(page).fill(FRESH_USER.password);
    await auth.registerSubmit(page).click();
    await expect(page).toHaveURL('/');
    await ctx.close();
  });

  test('logout from a logged-in session', async ({ testuser }) => {
    await testuser.goto('/');
    await auth.userMenuTrigger(testuser).click();
    await auth.logoutAction(testuser).click();
    await expect(testuser).toHaveURL(/\/login/);
  });

  test('relogin via the login form', async ({ browser }) => {
    const ctx = await browser.newContext(); // anonymous
    const page = await ctx.newPage();
    await page.goto('/login');
    await auth.loginEmail(page).fill('testuser@example.com');
    await auth.loginPassword(page).fill('password123');
    await auth.loginSubmit(page).click();
    await expect(page).toHaveURL('/');
    await ctx.close();
  });
});

test.describe.serial('Phase 2 — draft', () => {
  test.skip('TODO: create a draft post', () => {});
});

test.describe.serial('Phase 3 — publish (AI autocomplete + upload + publish)', () => {
  test.skip('TODO: AI autocomplete + upload + publish', () => {});
});

test.describe.serial('Phase 4 — social (search + vote + bookmark + comment)', () => {
  test.skip('TODO: social interactions', () => {});
});

test.describe.serial('Phase 5 — fork', () => {
  test.skip('TODO: fork + diff', () => {});
});

test.describe.serial('Phase 6 — permission', () => {
  test.skip('TODO: alice cannot edit testuser snippet', () => {});
});

// keep `withMockScript` referenced so unused-import lint doesn't trip on the
// scaffold; it's used in Phase 3 below.
void withMockScript;
```

- [ ] **Step 2: Run the journey spec, expect Phase 1 to fail with missing testids**

```bash
cd e2e && npx playwright test specs/_journey.spec.ts --grep "Phase 1" 2>&1 | tail -40
```

Expected: failures like `locator getByTestId('login-email-input') resolved to 0 elements` or similar. Note which testids are missing; they're the ones that need to land in the Vue components.

- [ ] **Step 3: Add `data-testid` attributes to LoginPage.vue, RegisterPage.vue, and the user-menu/logout component**

For each missing testid, find the matching element and add the attribute. Concrete additions expected:

In `packages/client/src/pages/LoginPage.vue`:

- email input → `data-testid="login-email-input"`
- password input → `data-testid="login-password-input"`
- submit button → `data-testid="login-submit-btn"`
- error message element (only rendered on failure; we don't assert it in Phase 1) → `data-testid="login-error-message"`

In `packages/client/src/pages/RegisterPage.vue`:

- email input → `data-testid="register-email-input"`
- name/display-name input → `data-testid="register-name-input"`
- password input → `data-testid="register-password-input"`
- submit button → `data-testid="register-submit-btn"`

In the shell component that renders the avatar / user-menu (likely `packages/client/src/components/shell/TheTopBar.vue` or `UserAvatar.vue`):

- the user-menu trigger element → `data-testid="user-menu-trigger"`
- the logout menu item → `data-testid="logout-action"`

> **Scope discipline:** if Phase 1 needs a testid that's NOT in the auth selector list, decide whether it's an auth selector or a shell selector and add it to the appropriate file in `e2e/fixtures/selectors/`. Do not modify components outside the auth/shell flow in this task.

- [ ] **Step 4: Re-run Phase 1, expect it to pass**

```bash
cd e2e && npx playwright test specs/_journey.spec.ts --grep "Phase 1" --reporter=list 2>&1 | tail -20
```

Expected: 3 passing tests in the Phase 1 describe block.

- [ ] **Step 5: Run client unit tests to verify no regressions**

```bash
cd /Users/andrew/Code/forge && npm run test:coverage 2>&1 | tail -30
```

Expected: 100% coverage maintained (testid additions don't alter coverage). Any failure here means a component test is asserting against a literal HTML structure that the testid attribute changed; fix the test to use `getByTestId` instead.

- [ ] **Step 6: Commit**

```bash
git add e2e/specs/_journey.spec.ts packages/client/src
git commit -m "test(e2e): journey phase 1 (auth) green; add login/register/logout testids"
```

---

## Task 8: Phase 2 — draft (create a draft post)

**Files:**

- Modify: `e2e/specs/_journey.spec.ts` (replace the Phase 2 `test.skip` with a real test).
- Create: `e2e/fixtures/selectors/posts.ts` (new shard).
- Modify (TDD-driven): `packages/client/src/pages/PostNewPage.vue` (testids on the new-post form).

- [ ] **Step 1: Create `e2e/fixtures/selectors/posts.ts`**

```ts
import type { Page, Locator } from '@playwright/test';

export const posts = {
  // New-post form
  newPostTitle: (page: Page): Locator => page.getByTestId('new-post-title-input'),
  newPostBody: (page: Page): Locator => page.getByTestId('new-post-body-editor'),
  newPostSaveDraft: (page: Page): Locator => page.getByTestId('new-post-save-draft-btn'),
  newPostPublish: (page: Page): Locator => page.getByTestId('new-post-publish-btn'),

  // Post-view
  postTitle: (page: Page): Locator => page.getByTestId('post-title'),
  draftBadge: (page: Page): Locator => page.getByTestId('draft-badge'),
};
```

- [ ] **Step 2: Replace the Phase 2 `test.skip` with a concrete test**

```ts
test.describe.serial('Phase 2 — draft', () => {
  test('create a draft post and land on its view page', async ({ testuser }) => {
    await testuser.goto('/posts/new');
    await posts.newPostTitle(testuser).fill('Journey draft');
    await posts.newPostBody(testuser).fill('Draft body content for the journey smoke.');
    await posts.newPostSaveDraft(testuser).click();
    await expect(testuser).toHaveURL(/\/posts\/[^/]+/);
    await expect(posts.postTitle(testuser)).toContainText('Journey draft');
    await expect(posts.draftBadge(testuser)).toBeVisible();
  });
});
```

(Add `import { posts } from '../fixtures/selectors/posts.js';` at the top of the spec.)

- [ ] **Step 3: Run Phase 2, expect failures for missing testids**

```bash
cd e2e && npx playwright test --grep "Phase 2" 2>&1 | tail -20
```

- [ ] **Step 4: Add the missing `data-testid` attributes**

In `packages/client/src/pages/PostNewPage.vue`:

- title input → `data-testid="new-post-title-input"`
- body editor wrapper (the CodeMirror or markdown editor outer div, since CodeMirror's contenteditable can be tricky to fill — Playwright's `fill()` works on `contenteditable` if we target the editor's outer container with `[contenteditable]`; if the test fails to type, switch the locator to `editor.locator('.cm-content')` or whatever the inner editable element is) → `data-testid="new-post-body-editor"`
- save-draft button → `data-testid="new-post-save-draft-btn"`
- publish button → `data-testid="new-post-publish-btn"` (Phase 3 needs this)

In whichever component renders the post detail (likely `PostViewPage.vue` or a child like `PostHeader.vue`):

- title heading → `data-testid="post-title"`
- the "Draft" badge element → `data-testid="draft-badge"` (only rendered when `is_draft=true`)

- [ ] **Step 5: Re-run Phase 2 and confirm pass**

```bash
cd e2e && npx playwright test --grep "Phase 2" --reporter=list
```

- [ ] **Step 6: Run unit tests + coverage**

```bash
cd /Users/andrew/Code/forge && npm run test:coverage 2>&1 | tail -10
```

Expected: 100% coverage held. If a `PostNewPage.test.ts` (or similar) breaks because of a testid-induced DOM shift, switch the assertion to `getByTestId`.

- [ ] **Step 7: Commit**

```bash
git add e2e/specs/_journey.spec.ts e2e/fixtures/selectors/posts.ts packages/client/src
git commit -m "test(e2e): journey phase 2 (draft) green; add new-post testids"
```

---

## Task 9: Phase 3 — publish (AI autocomplete + upload + publish)

**Files:**

- Modify: `e2e/specs/_journey.spec.ts` (Phase 3).
- Modify: `e2e/fixtures/selectors/posts.ts` (add upload + publish-related selectors).
- Create: `e2e/fixtures/selectors/ai.ts`.
- Modify (TDD-driven): the editor / AI-completion / file-upload components in `packages/client/src/components/{post,editor}/**`.

- [ ] **Step 1: Add a small fixture file for the journey**

Create `e2e/fixtures/journey-asset.txt`:

```
journey upload test asset
```

This is a tiny text file we attach in the upload phase. Fixture data is canonical per the design's test-author conventions (rule 6).

- [ ] **Step 2: Extend `e2e/fixtures/selectors/posts.ts`**

Append to the `posts` object:

```ts
  // Upload widget on the new-post / edit page
  fileUploadInput: (page: Page): Locator => page.getByTestId('file-upload-input'),
  fileUploadPreview: (page: Page): Locator => page.getByTestId('file-upload-preview'),
  publishedBadge: (page: Page): Locator => page.getByTestId('published-badge'),
```

- [ ] **Step 3: Create `e2e/fixtures/selectors/ai.ts`**

```ts
import type { Page, Locator } from '@playwright/test';

export const ai = {
  // The autocomplete suggestion popup that appears while typing in the editor
  autocompleteSuggestion: (page: Page): Locator => page.getByTestId('ai-autocomplete-suggestion'),
  acceptSuggestion: (page: Page): Locator => page.getByTestId('ai-autocomplete-accept-btn'),
};
```

- [ ] **Step 4: Replace the Phase 3 `test.skip`**

Add at top of spec:

```ts
import { ai } from '../fixtures/selectors/ai.js';
import { posts } from '../fixtures/selectors/posts.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// `e2e/package.json` declares `"type": "module"`, so __dirname is undefined.
// Derive it from import.meta.url for ESM compatibility.
const __dirname = dirname(fileURLToPath(import.meta.url));
```

Replace Phase 3:

```ts
test.describe.serial('Phase 3 — publish (AI autocomplete + upload + publish)', () => {
  test('AI autocomplete inserts a suggestion', async ({ testuser }) => {
    await withMockScript(testuser, 'autocomplete-typescript-react');
    await testuser.goto('/posts/new');
    await posts.newPostTitle(testuser).fill('Journey publish');
    // Type a trigger character into the editor; the SPA fires an AI request
    // and the deterministic mock script streams a known completion.
    await posts.newPostBody(testuser).fill('export const ');
    await expect(ai.autocompleteSuggestion(testuser)).toContainText('Button');
    await ai.acceptSuggestion(testuser).click();
  });

  test('upload a file and see its preview', async ({ testuser }) => {
    // Phase 3 uses the same draft as the previous test, so the URL is the
    // current post-edit page after navigation.
    await posts
      .fileUploadInput(testuser)
      .setInputFiles(join(__dirname, '..', 'fixtures', 'journey-asset.txt'));
    await expect(posts.fileUploadPreview(testuser)).toBeVisible();
  });

  test('publish the post', async ({ testuser }) => {
    await posts.newPostPublish(testuser).click();
    await expect(posts.publishedBadge(testuser)).toBeVisible();
  });
});
```

- [ ] **Step 5: Run Phase 3, expect missing-testid failures, add testids**

```bash
cd e2e && npx playwright test --grep "Phase 3" 2>&1 | tail -30
```

Expected components needing testids (best-effort guess; the implementing engineer should adjust based on actual failure messages):

- The AI completion suggestion overlay component (somewhere under `packages/client/src/components/post/` or `editor/`) → `ai-autocomplete-suggestion` and `ai-autocomplete-accept-btn`
- The file-upload component → `file-upload-input` (the `<input type="file">`) and `file-upload-preview` (the rendered preview tile)
- The "Published" badge in the post-view component → `published-badge`

> **Awkward UI flow escape hatch:** per the issue's agent instructions, "if a step is hard to write because the UI flow is awkward, file a follow-up issue rather than papering over it." If the AI-autocomplete path has no obvious testable element (e.g. the suggestion is rendered inside CodeMirror's shadow DOM), skip the autocomplete sub-test in this PR with `test.skip` and a `// TODO(#follow-up-issue)` reference, and open a tracked issue. Capture this in the PR description.

- [ ] **Step 6: Re-run Phase 3 and confirm pass**

```bash
cd e2e && npx playwright test --grep "Phase 3" --reporter=list
```

- [ ] **Step 7: Run unit tests**

```bash
npm run test:coverage 2>&1 | tail -20
```

Expected: 100% coverage held.

- [ ] **Step 8: Commit**

```bash
git add e2e/specs/_journey.spec.ts e2e/fixtures e2e/fixtures/selectors packages/client/src
git commit -m "test(e2e): journey phase 3 (publish) green; AI + upload + publish testids"
```

---

## Task 10: Phase 4 — social (search + vote + bookmark + comment)

**Files:**

- Modify: `e2e/specs/_journey.spec.ts` (Phase 4).
- Create: `e2e/fixtures/selectors/{search,voting,bookmarks,comments}.ts` as needed (one per feature touched).
- Modify (TDD-driven): components in `packages/client/src/components/{search,post}/**`.

- [ ] **Step 1: Decide selector shards for this phase**

The journey touches search, voting, bookmarks, and comments. Each gets its own shard file. Create the four selector files with only the entries the journey uses (don't pre-populate with the full feature surface — those land in their feature PRs).

`e2e/fixtures/selectors/search.ts`:

```ts
import type { Page, Locator } from '@playwright/test';

export const search = {
  searchInput: (page: Page): Locator => page.getByTestId('search-input'),
  searchResultItem: (page: Page): Locator => page.getByTestId('search-result-item').first(),
};
```

`e2e/fixtures/selectors/voting.ts`:

```ts
import type { Page, Locator } from '@playwright/test';

export const voting = {
  upvoteBtn: (page: Page): Locator => page.getByTestId('upvote-btn'),
  voteScore: (page: Page): Locator => page.getByTestId('vote-score'),
};
```

`e2e/fixtures/selectors/bookmarks.ts`:

```ts
import type { Page, Locator } from '@playwright/test';

export const bookmarks = {
  bookmarkToggle: (page: Page): Locator => page.getByTestId('bookmark-toggle-btn'),
  bookmarkOnIcon: (page: Page): Locator => page.getByTestId('bookmark-on-icon'),
};
```

`e2e/fixtures/selectors/comments.ts`:

```ts
import type { Page, Locator } from '@playwright/test';

export const comments = {
  commentInput: (page: Page): Locator => page.getByTestId('comment-input'),
  commentSubmit: (page: Page): Locator => page.getByTestId('comment-submit-btn'),
  commentBody: (page: Page): Locator => page.getByTestId('comment-body').first(),
};
```

> **Note:** `CommentInput.vue` and `CommentThread.vue` already have `cancel-btn`, `reply-btn`, `edit-btn`, `delete-btn` testids per the foundation. Add the new ones (`comment-input`, `comment-submit-btn`, `comment-body`) only if not already present.

- [ ] **Step 2: Replace the Phase 4 `test.skip`**

Phase 4 uses the seeded `postId` (`c0000000-...-99`) since the per-test reset re-seeds it; the tests can navigate directly to it.

```ts
import { search } from '../fixtures/selectors/search.js';
import { voting } from '../fixtures/selectors/voting.js';
import { bookmarks } from '../fixtures/selectors/bookmarks.js';
import { comments } from '../fixtures/selectors/comments.js';

const SEEDED_POST_ID = 'c0000000-0000-0000-0000-000000000099';
const SEEDED_POST_TITLE = /typescript|snippet/i; // assert against fixture-canonical text; loosen if seed.sql title differs

test.describe.serial('Phase 4 — social (search + vote + bookmark + comment)', () => {
  test('search finds the seeded snippet', async ({ testuser }) => {
    await testuser.goto('/');
    await shell.searchTrigger(testuser).click();
    await search.searchInput(testuser).fill('typescript');
    await search.searchResultItem(testuser).click();
    await expect(testuser).toHaveURL(new RegExp(`/posts/${SEEDED_POST_ID}`));
  });

  test('upvote increments the visible score', async ({ testuser }) => {
    await testuser.goto(`/posts/${SEEDED_POST_ID}`);
    const before = (await voting.voteScore(testuser).textContent())?.trim() ?? '0';
    await voting.upvoteBtn(testuser).click();
    // Wait for an explicit response or text change rather than waitForTimeout.
    await expect
      .poll(async () => (await voting.voteScore(testuser).textContent())?.trim())
      .not.toBe(before);
  });

  test('toggling bookmark on shows the on-state icon', async ({ testuser }) => {
    await testuser.goto(`/posts/${SEEDED_POST_ID}`);
    await bookmarks.bookmarkToggle(testuser).click();
    await expect(bookmarks.bookmarkOnIcon(testuser)).toBeVisible();
  });

  test('comment is posted and appears in the thread', async ({ testuser }) => {
    await testuser.goto(`/posts/${SEEDED_POST_ID}`);
    await comments.commentInput(testuser).fill('Journey comment.');
    await comments.commentSubmit(testuser).click();
    await expect(comments.commentBody(testuser)).toContainText('Journey comment.');
  });
});
```

- [ ] **Step 3: Verify the seeded post title regex matches**

Open `scripts/seed.sql` and find the row for `c0000000-...-99`. Tighten or loosen `SEEDED_POST_TITLE` to match the actual seed title (or remove the unused constant if no test asserts the title in this phase). The current Phase 4 tests don't reference `SEEDED_POST_TITLE`, so deleting it is fine.

- [ ] **Step 4: Run Phase 4, identify missing testids, add them**

```bash
cd e2e && npx playwright test --grep "Phase 4" 2>&1 | tail -30
```

Components to scope (best-effort):

- `packages/client/src/components/shell/TheSearchModal.vue` — `data-testid="search-input"` on the input
- `packages/client/src/components/search/SearchResultItem.vue` — `data-testid="search-result-item"` on the row root
- The post view's voting bar component — `upvote-btn`, `vote-score`
- The post view's bookmark button — `bookmark-toggle-btn`; the "filled" state icon → `bookmark-on-icon`
- `CommentInput.vue` — add `comment-input` to the textarea, `comment-submit-btn` to the submit button (cancel-btn already exists)
- `CommentThread.vue` — add `comment-body` to the body span (reply/edit/delete already have testids)

- [ ] **Step 5: Re-run Phase 4 + run unit tests**

```bash
cd e2e && npx playwright test --grep "Phase 4" --reporter=list
cd /Users/andrew/Code/forge && npm run test:coverage 2>&1 | tail -20
```

- [ ] **Step 6: Commit**

```bash
git add e2e/specs/_journey.spec.ts e2e/fixtures/selectors packages/client/src
git commit -m "test(e2e): journey phase 4 (social) green; search/vote/bookmark/comment testids"
```

---

## Task 11: Phase 5 — fork (fork creates linked copy)

**Files:**

- Modify: `e2e/specs/_journey.spec.ts` (Phase 5).
- Modify: `e2e/fixtures/selectors/posts.ts` (add fork-related entries).
- Modify (TDD-driven): the fork-action component.

- [ ] **Step 1: Extend `e2e/fixtures/selectors/posts.ts`**

```ts
  // Fork action (lives in the post-view header / actions bar)
  forkBtn: (page: Page): Locator => page.getByTestId('fork-btn'),
  forkAttribution: (page: Page): Locator => page.getByTestId('fork-attribution'), // already present in PostMetaHeader.vue
```

- [ ] **Step 2: Replace the Phase 5 `test.skip`**

```ts
test.describe.serial('Phase 5 — fork', () => {
  test('fork the seeded post and land on the new post-edit page with attribution', async ({
    testuser,
  }) => {
    await testuser.goto(`/posts/${SEEDED_POST_ID}`);
    await posts.forkBtn(testuser).click();
    // Forking should redirect to a NEW post (different id) in edit mode, with
    // a fork-attribution element pointing back to the source.
    await expect(testuser).toHaveURL(new RegExp(`/posts/(?!${SEEDED_POST_ID}\\b)[a-f0-9-]+`));
    await expect(posts.forkAttribution(testuser)).toBeVisible();
    await expect(posts.forkAttribution(testuser)).toContainText(SEEDED_POST_ID);
  });
});
```

> **Note on fork-attribution match:** `PostMetaHeader.vue:20` already uses `data-testid="fork-attribution"`. The text inside may be a username or the source post title rather than the source UUID. If `toContainText(SEEDED_POST_ID)` is too tight, replace with a broader assertion (e.g., assert the element renders + assert visiting the linked source navigates to `${SEEDED_POST_ID}`).

- [ ] **Step 3: Run Phase 5, add the `fork-btn` testid**

```bash
cd e2e && npx playwright test --grep "Phase 5" 2>&1 | tail -20
```

Add `data-testid="fork-btn"` to the Vue component that renders the Fork action (likely a child of the post-view header bar).

- [ ] **Step 4: Re-run Phase 5 + run unit tests + coverage gate**

```bash
cd e2e && npx playwright test --grep "Phase 5" --reporter=list
cd /Users/andrew/Code/forge && npm run test:coverage 2>&1 | tail -10
```

Expected: Phase 5 green; 100% coverage held.

> **Note on the design doc's "fork → diff" step:** the issue's DoD enumerates only 6 phases (auth, draft, publish, social, fork, permission) — there is no "diff" phase in the canonical DoD. Phase 5 satisfies "fork" by asserting the new post lands at a different ID with `fork-attribution` visible. Diff visualization (side-by-side, inline, etc.) lands in the future `revisions/` feature PR per the design's per-folder phasing — this plan does not cover it.

- [ ] **Step 5: Commit**

```bash
git add e2e/specs/_journey.spec.ts e2e/fixtures/selectors/posts.ts packages/client/src
git commit -m "test(e2e): journey phase 5 (fork) green; add fork-btn testid"
```

---

## Task 12: Phase 6 — permission (alice cannot edit testuser's snippet)

**Files:**

- Modify: `e2e/specs/_journey.spec.ts` (Phase 6).

- [ ] **Step 1: Replace the Phase 6 `test.skip`**

```ts
test.describe.serial('Phase 6 — permission', () => {
  test('alice cannot reach the edit page for a post she does not own', async ({ alice }) => {
    await alice.goto(`/posts/${SEEDED_POST_ID}/edit`);
    // Either a forbidden page renders, OR we get redirected away from /edit.
    // Both are acceptable client behaviors; the assertion accepts either.
    await Promise.race([
      expect(shell.forbiddenPage(alice)).toBeVisible({ timeout: 5_000 }),
      expect(alice).not.toHaveURL(new RegExp(`/posts/${SEEDED_POST_ID}/edit$`), { timeout: 5_000 }),
    ]);
  });
});
```

> **Why `Promise.race`:** the design doesn't pin which behavior the SPA implements — both are valid permission UX. The test passes if either holds. Pick the actual behavior in the implementation step and tighten the assertion to just that one.

- [ ] **Step 2: Run Phase 6, fix the assertion to match the actual behavior**

```bash
cd e2e && npx playwright test --grep "Phase 6" 2>&1 | tail -20
```

If the SPA redirects (no forbidden page rendered), simplify to:

```ts
await alice.goto(`/posts/${SEEDED_POST_ID}/edit`);
await expect(alice).not.toHaveURL(new RegExp(`/posts/${SEEDED_POST_ID}/edit$`));
```

If the SPA renders a forbidden page (and we need a `data-testid="forbidden-page"`), add the testid to the forbidden component and simplify to:

```ts
await alice.goto(`/posts/${SEEDED_POST_ID}/edit`);
await expect(shell.forbiddenPage(alice)).toBeVisible();
```

- [ ] **Step 3: Run the FULL journey spec end-to-end (all 6 phases) at workers=1**

```bash
cd e2e && npx playwright test specs/_journey.spec.ts --workers=1 --reporter=list 2>&1 | tail -30
```

Expected: all phases pass — verifies the journey works under strict serialization (the lower-bound condition of the issue's adversarial review checklist).

- [ ] **Step 4: Run the FULL journey spec at workers=4 (parity with CI)**

```bash
cd e2e && npx playwright test specs/_journey.spec.ts --workers=4 --reporter=list
```

Expected: all phases still pass — verifies the Postgres advisory lock in `/api/__test__/reset` (foundation #44) holds under parallel workers. Together with Step 3, this satisfies the issue's adversarial-review checklist item: "Journey spec passes with `workers: 1` AND `workers: 4`".

- [ ] **Step 5: Run unit tests + Bruno regression**

```bash
cd /Users/andrew/Code/forge && npm run test:coverage 2>&1 | tail -20
cd bruno && npx @usebruno/cli run -r --env local 2>&1 | tail -20
```

Expected: 100% coverage held; all Bruno requests pass.

- [ ] **Step 6: Commit**

```bash
git add e2e/specs/_journey.spec.ts packages/client/src
git commit -m "test(e2e): journey phase 6 (permission) green; full journey passes at workers=4"
```

---

## Task 13: `e2e/README.md` (conventions doc)

**Files:**

- Create: `e2e/README.md`

Mirror `bruno/README.md` style. The doc captures the conventions a contributor needs.

- [ ] **Step 1: Author the README**

````markdown
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
````

If your local `npm run dev` is already running the API + Vite, `webServer` will reuse them (`reuseExistingServer: !process.env.CI`).

## Required env vars (server-side)

The API server MUST be started with these for E2E to function:

```bash
ENABLE_TEST_ROUTES=1
LLM_PROVIDER=mock
E2E_MODE=1
NODE_ENV=test
```

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

````

- [ ] **Step 2: Commit**

```bash
git add e2e/README.md
git commit -m "docs(e2e): contributor README (conventions, env vars, selector rules)"
````

---

## Task 14: CI workflow `.github/workflows/e2e-playwright.yml`

**Files:**

- Create: `.github/workflows/e2e-playwright.yml`

- [ ] **Step 1: Author the workflow**

```yaml
# E2E Playwright workflow
#
# IMPORTANT: this workflow uses `pull_request` (NOT `pull_request_target`).
# `pull_request_target` would expose secrets to fork PRs and let a malicious
# fork PR exploit ENABLE_TEST_ROUTES against this repo's database. With
# `pull_request`, fork PRs run with a read-only GITHUB_TOKEN.
#
# Initial state: continue-on-error=true, NOT a required check.
# Promotion to required after 14 consecutive green main runs (tracked in #43).

name: E2E (Playwright)

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

env:
  ENABLE_TEST_ROUTES: '1'
  LLM_PROVIDER: 'mock'
  E2E_MODE: '1'
  NODE_ENV: 'test'
  CI: 'true'

jobs:
  e2e:
    name: Playwright journey smoke
    runs-on: ubuntu-latest
    continue-on-error: true
    timeout-minutes: 15

    # Pattern mirrors .github/workflows/bruno-regression.yml:
    #   - postgres user/password = forge/forge (NOT the docker-compose forge_dev value)
    #   - schema applied via `cd packages/server && npm run migrate:up`
    #   - seed applied via `psql -f scripts/seed.sql`
    # Migration 001 already runs `CREATE EXTENSION IF NOT EXISTS uuid-ossp/pg_trgm/unaccent`,
    # so we do NOT need to apply docker/init-db.sql separately.
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_DB: forge
          POSTGRES_USER: forge
          POSTGRES_PASSWORD: forge
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U forge"
          --health-interval 5s
          --health-timeout 3s
          --health-retries 10
      minio:
        image: minio/minio:latest
        env:
          MINIO_ROOT_USER: forge_minio
          MINIO_ROOT_PASSWORD: forge_minio_secret
        ports:
          - 9000:9000
        options: >-
          --health-cmd "curl -f http://localhost:9000/minio/health/live"
          --health-interval 5s
          --health-timeout 3s
          --health-retries 10

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build @forge/shared
        run: npm run build --workspace=@forge/shared

      - name: Run migrations
        env:
          DATABASE_URL: postgres://forge:forge@localhost:5432/forge
        run: cd packages/server && npm run migrate:up

      - name: Seed database
        env:
          DATABASE_URL: postgres://forge:forge@localhost:5432/forge
        run: psql "$DATABASE_URL" -f scripts/seed.sql

      - name: Build client (production)
        run: npm run build --workspace=@forge/client

      - name: Start API server
        env:
          DATABASE_URL: postgres://forge:forge@localhost:5432/forge
          MINIO_ENDPOINT: localhost
          MINIO_PORT: '9000'
          MINIO_ACCESS_KEY: forge_minio
          MINIO_SECRET_KEY: forge_minio_secret
          MINIO_BUCKET: forge-e2e
          JWT_SECRET: ci-test-secret
          JWT_REFRESH_SECRET: ci-test-refresh-secret
          PORT: '3001'
          # HOST=localhost so the API binds same-host as the preview server below.
          # This keeps the refresh_token cookie (sameSite: strict) attachable
          # when the SPA proxies /api/auth/refresh from localhost:4173.
          HOST: 'localhost'
        run: |
          mkdir -p "$RUNNER_TEMP"
          cd packages/server
          nohup npx tsx src/server.ts > "$RUNNER_TEMP/server.log" 2>&1 &
          echo $! > "$RUNNER_TEMP/server.pid"
          # Wait up to 60s for /api/health
          for i in {1..60}; do
            if curl -fsS http://localhost:3001/api/health >/dev/null 2>&1; then
              echo "API ready after ${i}s"
              break
            fi
            sleep 1
          done

      - name: Start Vite preview
        run: |
          cd packages/client
          # --host localhost (NOT 127.0.0.1) so the preview origin is same-site
          # with the API origin. See Task 3.5 / playwright.config.ts comments.
          nohup npm run preview -- --port 4173 --host localhost > "$RUNNER_TEMP/preview.log" 2>&1 &
          echo $! > "$RUNNER_TEMP/preview.pid"
          for i in {1..60}; do
            if curl -fsS http://localhost:4173/ >/dev/null 2>&1; then
              echo "Preview ready after ${i}s"
              break
            fi
            sleep 1
          done

      - name: Install Playwright Chromium
        run: |
          cd e2e
          npx playwright install --with-deps chromium

      - name: Run journey smoke
        env:
          API_URL: http://localhost:3001
          PREVIEW_URL: http://localhost:4173
          MINIO_HEALTH_URL: http://localhost:9000/minio/health/live
        run: npm run e2e -- --reporter=github,html,list

      - name: Upload Playwright report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: e2e/playwright-report/
          retention-days: 14

      - name: Upload server + preview logs (debug)
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: e2e-server-logs
          path: |
            ${{ runner.temp }}/server.log
            ${{ runner.temp }}/preview.log
          retention-days: 7

      - name: Comment on PR with artifact link
        if: failure() && github.event_name == 'pull_request'
        uses: actions/github-script@v7
        with:
          script: |
            const runUrl = `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`;
            const body = [
              ':red_circle: **E2E Playwright failed.**',
              '',
              `Report artifact: ${runUrl}#artifacts (look for \`playwright-report\`).`,
              `Server logs: \`e2e-server-logs\`.`,
              '',
              '_This check is currently `continue-on-error: true` and does not block merge._',
            ].join('\n');
            await github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body,
            });
```

> **Why we don't use `permissions:`-restricted PR comments here:** the default `GITHUB_TOKEN` write permission for `pull_request` is sufficient for `issues:write` (PR comments use the issues API). If repo-level branch protection has tightened this, add `permissions: { issues: write, pull-requests: write, contents: read }` at the job level.

> **Why no `MINIO_ROOT_USER` env on server step:** the server uses `MINIO_ACCESS_KEY` (which we set). Ensure foundation #44's `app.ts` reads `MINIO_ACCESS_KEY`. (Verified: `packages/server/src/app.ts:67` checks `process.env.MINIO_ACCESS_KEY`.)

> **MinIO bucket auto-creation:** the storage plugin's `ensureBucket()` is invoked on server startup (`packages/server/src/plugins/storage.ts:181`), which creates the `forge-e2e` bucket if it does not already exist. No `mc mb` step is required in the workflow. **Verify this assumption during T15 first-run debugging:** if Phase 3's upload sub-test fails with a "NoSuchBucket" error, the workflow needs an explicit bucket-creation step (e.g. `docker run --rm minio/mc alias set / http://localhost:9000 forge_minio forge_minio_secret && docker run --rm minio/mc mb /forge-e2e`). Capture this in the PR's "Failure modes encountered" notes if it triggers.

- [ ] **Step 2: Lint the workflow**

```bash
# actionlint is the standard linter; it's not in deps. Best-effort: download
# binary or skip and rely on GitHub's parser. If actionlint is on PATH, run it.
command -v actionlint && actionlint .github/workflows/e2e-playwright.yml || echo "actionlint not installed; skipping (GitHub will validate at push)"
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/e2e-playwright.yml
git commit -m "ci(e2e): add Playwright workflow (non-blocking, pull_request)"
```

---

## Task 15: Final verification + tracking-issue update + PR

**Files:**

- (PR description)
- (Comment on tracking issue #43)

This task is the close-out. The "3 consecutive green CI runs" item is verified after pushing — it's not something the engineer makes happen in a single shot.

- [ ] **Step 1: Run full local verification one more time**

```bash
cd /Users/andrew/Code/forge
docker compose up -d postgres minio

# Build shared first (CLAUDE.md memory: server typecheck sees stale exports otherwise)
npm run build --workspace=@forge/shared

# Vitest + coverage
npm run test:coverage 2>&1 | tail -10

# Bruno
cd bruno && npx @usebruno/cli run -r --env local 2>&1 | tail -10
cd ..

# Playwright journey at workers=4 (CI parity)
cd e2e && npx playwright test --workers=4 --reporter=list 2>&1 | tail -10
cd ..
```

Expected: 100% coverage; all Bruno requests pass; all 6 phases pass.

- [ ] **Step 2: Verify storage-state files were never staged**

```bash
git status -s | tee /tmp/git-status.txt
grep -E '\.auth\.json|forge-e2e-secret' /tmp/git-status.txt && {
  echo "FAIL: auth/secret files leaked into the index"
  exit 1
} || echo "Clean: no auth/secret files in the index"
```

- [ ] **Step 3: Confirm scope of `data-testid` changes**

```bash
git diff main..HEAD -- packages/client/src | grep '+ *data-testid' | sort -u
```

Take this list and capture it in the PR description ("`data-testid` attributes added to:" + path:line list). The DoD says reviewers must be able to verify scope at a glance.

- [ ] **Step 4: Push the branch + open the PR**

```bash
git push -u origin feat/e2e-scaffolding-journey-smoke
gh pr create --title "feat(e2e): scaffolding + journey smoke + new CI workflow (#45)" --body "$(cat <<'EOF'
## Summary

Implements GitHub issue #45 — the second phase (1b/9) of the E2E Playwright rollout.

- Scaffolds `e2e/` workspace with config, fixtures, support layer, sharded selector registry.
- Adds the journey smoke spec (`specs/_journey.spec.ts`) — 6 `test.describe.serial` phases: auth, draft, publish, social, fork, permission.
- Adds non-blocking `.github/workflows/e2e-playwright.yml` (uses `pull_request`, NOT `pull_request_target`).
- Adds `data-testid` attributes ONLY to components touched by the journey smoke.
- Husky pre-commit hook now refuses to stage `*.auth.json` and `forge-e2e-secret`.

## data-testid additions (scope check)

<!-- output of `git diff main..HEAD -- packages/client/src | grep '+ *data-testid' | sort -u` -->

(paste the list here)

## Verification

- [x] `npm run test:coverage` — 100% across the 4 metrics.
- [x] `cd bruno && npx @usebruno/cli run -r --env local` — all green.
- [x] `cd e2e && npx playwright test --workers=4` — all 6 phases pass locally.
- [ ] 3 consecutive green CI runs of the new `e2e-playwright.yml` workflow on this PR.

## Test plan

- [ ] CI's E2E job goes green on the first push of this PR.
- [ ] Push two empty commits (`git commit --allow-empty`) and confirm both subsequent runs are also green.
- [ ] The Vitest coverage gate, Bruno regression, and existing CI workflow all pass.

## Related

Tracking: #43 — bumps progress to 1b merged.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: After push, monitor the first CI run**

```bash
# When CI finishes, get the run id and check status:
gh pr checks --watch
```

If the first run is red, debug from the uploaded `playwright-report` artifact. Common causes:

- Server didn't start (check `e2e-server-logs` artifact).
- A testid that exists locally got renamed but not committed.
- Vite preview port collision (unlikely but possible).

- [ ] **Step 6: After 3 consecutive green CI runs, comment on tracking issue #43**

```bash
gh issue comment 43 --body "1b status update: PR #<NN> merged on $(date -u +%Y-%m-%d). E2E workflow now running non-blocking against main. Stability counter starts at 0/14. Spec count: +1 (\`_journey.spec.ts\`)."
```

> The "3 consecutive green runs" verification + tracking-issue comment is sequenced after merge in the typical workflow, but the DoD requires confirmation on the PR before close. Push two empty commits to bump the run count if needed:
>
> ```bash
> git commit --allow-empty -m "ci: bump run count for stability check"
> git push
> ```

- [ ] **Step 7: Final commit (if needed)**

If `/self-reflect` produces knowledge-base updates per CLAUDE.md, commit those before merge so they land atomically with the code:

```bash
# After running /self-reflect:
git add .beads/  # or wherever knowledge updates land
git commit -m "docs(beads): self-reflect after E2E scaffolding"
git push
```

---

## Self-Review Checklist

Run this before declaring the plan ready.

**1. Spec coverage** — every DoD item from issue #45 must map to at least one task:

| DoD item                                                                                                       | Task                                                                 |
| -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `e2e/` workspace at repo root + workspaces array                                                               | T1                                                                   |
| `e2e/package.json` (`@forge/e2e`) Playwright + types deps; not in vitest.workspace                             | T1                                                                   |
| `e2e/tsconfig.json` extends base                                                                               | T1                                                                   |
| `e2e/playwright.config.ts` workers/parallel/projects/reporters/webServer                                       | T3                                                                   |
| `e2e/.gitignore` + root .gitignore mirror                                                                      | T1                                                                   |
| Husky pre-commit refuses \*.auth.json + forge-e2e-secret                                                       | T2                                                                   |
| `e2e/fixtures/auth.ts` 3-user fixture, tmpdir default, in-repo opt-in                                          | T4                                                                   |
| `e2e/fixtures/reset.ts` auto beforeEach, @no-reset opt-out                                                     | T5                                                                   |
| `e2e/fixtures/mock-llm.ts` typed against shared MockScriptKey                                                  | T5                                                                   |
| `e2e/fixtures/network-faults.ts` placeholder                                                                   | T5                                                                   |
| `e2e/fixtures/selectors/{shell,auth}.ts` (only journey shards)                                                 | T6 (more shards added in T8-T11 as journey reaches them)             |
| `e2e/support/global-setup.ts` 3-user login + secret read                                                       | T4                                                                   |
| `e2e/support/server-lifecycle.ts` start with env + startup probe                                               | T3                                                                   |
| `e2e/support/wait-for-stack.ts` polls health endpoints                                                         | T3                                                                   |
| `e2e/support/global-teardown.ts` placeholder                                                                   | T3                                                                   |
| `e2e/specs/_journey.spec.ts` 6 phases                                                                          | T7-T12                                                               |
| Vite preview proxy (closes the `/api/*` routing gap that would break every API call from preview-mode browser) | T3.5                                                                 |
| SPA boot-time session restore (closes the cold-start auth gap that would break every logged-in fixture)        | T6.5                                                                 |
| `e2e/README.md` conventions doc                                                                                | T13                                                                  |
| Root scripts e2e/e2e:ui/e2e:debug                                                                              | T1                                                                   |
| `.github/workflows/e2e-playwright.yml` — pull_request, env, steps, retention                                   | T14                                                                  |
| data-testid only on journey-touched components, list in PR                                                     | T7-T12, captured in T15 step 3                                       |
| Vitest coverage gate still passes                                                                              | verified in T7 step 5, T9 step 7, T10 step 5, T12 step 5, T15 step 1 |
| Bruno gate still passes                                                                                        | T12 step 5, T15 step 1                                               |
| Journey smoke green for 3 consecutive CI runs                                                                  | T15 step 5-6                                                         |
| Tracking issue #43 updated                                                                                     | T15 step 6                                                           |

**Note on selector shards added in journey tasks:** the issue DoD says "selectors/shell.ts + selectors/auth.ts (only the shards needed for the journey smoke; other shards land in their feature PRs)." The journey actually touches more than auth+shell — it covers posts, search, voting, bookmarks, comments, ai. The plan adds these shards inside the corresponding journey-phase tasks. This is consistent with "only the shards needed for the journey smoke" — those shards are needed by the journey. Document this in the PR description so the reviewer doesn't flag it as scope creep.

**Rebuttal to a possible "out-of-scope" reading:** the issue's "Out of scope" line says "feature folders other than `auth` selectors+`shell` selectors". A literal reading would forbid `posts.ts`, `search.ts`, etc., even when the journey demonstrably needs them — but the same DoD also says the journey covers "auth, draft, publish, social, fork, permission" and rule 1 of the README requires `getByTestId` for ALL element selection. The two clauses can only be reconciled by reading "Out of scope: feature folders" as referring to per-feature _spec_ folders (e.g. `e2e/specs/posts/`, `e2e/specs/auth/login.spec.ts`), not to _selector shard_ files. The plan creates ZERO per-feature spec folders (only the single `_journey.spec.ts`); it adds selector shard files only as the journey reaches the corresponding feature. This is the consistent reading.

**Note on Task 6.5 (boot-time session restore):** strict reading of the issue file scope would say "no client-state changes beyond `data-testid`". The plan-review-gate's Feasibility reviewer correctly identified that without this change the saved storageState approach cannot work — the SPA boots stateless and the router redirects every test to `/login`. Two ways to handle the gap: (a) drive a UI login on every test (slow, ~3-5s × 12 tests = ~60s overhead); (b) add a small boot-time refresh that consumes the saved cookie. (b) is on the same footing as the `data-testid` additions: it's a minimal, journey-specific client modification needed to make the journey runnable. It also fixes a latent UX bug (page-refresh logs the user out) so it carries independent value. The plan picks (b) and surfaces it explicitly in Task 6.5 with a unit test for full coverage.

**Note on Task 3.5 (Vite preview proxy):** the issue file scope lists `packages/client/src/<components touched by journey smoke>` for testid edits but does not mention `packages/client/vite.config.ts`. This task modifies the config file because `vite preview` (used by the journey's web server) silently ignores `server.proxy`; the journey's relative `/api/*` calls need a `preview.proxy` block to work. The change is a copy-and-paste of the existing `server.proxy` into a new `preview.proxy` field — no behavioural change to dev (`npm run dev`), only an addition for preview. Same disclosure principle as Task 6.5: a minimal, journey-prerequisite change inside `packages/client/`.

**2. Placeholder scan** — checked: every code-changing step has actual code. The journey-phase tasks list specific testids by name. The component changes use phrases like "best-effort" only where the implementing engineer must inspect the component to find the right element — but the testid name and selector entry are exact.

**3. Type consistency** — checked:

- `MockScriptKey` is imported from `@forge/shared` consistently in `mock-llm.ts`.
- `AuthUser` type and `SEED_USERS` const are defined in `auth.ts` and consumed in `global-setup.ts` with matching keys.
- Selector shard names (`auth`, `shell`, `posts`, `search`, `voting`, `bookmarks`, `comments`, `ai`) are used consistently across imports.
- File path style: relative imports use `.js` extensions (per the `MockScriptKey` import convention) for ESM compatibility — verified across all selectors and fixtures.

If any inconsistency is found during execution, fix it inline; no need to re-review.
