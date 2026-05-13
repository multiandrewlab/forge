import { defineConfig, devices } from '@playwright/test';

const API_BASE = process.env.API_URL ?? 'http://localhost:3001';
const PREVIEW_BASE = process.env.PREVIEW_URL ?? 'http://localhost:4173';

export default defineConfig({
  testDir: './specs',
  // Within a worker, specs run sequentially. Cross-worker isolation is held by
  // the Postgres advisory lock inside /api/__test__/reset (see foundation #44).
  fullyParallel: false,
  workers: 4,
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
    {
      name: 'chromium-mobile',
      use: { ...devices['Pixel 5'] },
      // Mobile is opt-in: only specs whose title contains @mobile run here.
      // Today: just _journey.spec.ts > 'register a fresh account'. Add tags
      // sparingly to keep the mobile suite under the 10-min runtime budget
      // tracked in #43.
      grep: /@mobile\b/,
    },
  ],
  webServer: [
    {
      // HOST=localhost is required for /api/__test__/* routes to register
      // outside CI. The server's loopback guard at
      // packages/server/src/routes/__test__.ts skips registration when HOST
      // is not in {localhost, 127.0.0.1, ::1} unless CI=true. Without this,
      // Playwright's globalSetup probe of /api/__test__/reset returns 404
      // with the misleading message "ENABLE_TEST_ROUTES is not set". See #84.
      command:
        'cd ../packages/server && HOST=localhost ENABLE_TEST_ROUTES=1 LLM_PROVIDER=mock E2E_MODE=1 NODE_ENV=test npx tsx src/server.ts',
      url: `${API_BASE}/api/health`,
      // Always reuse existing servers. CI's e2e workflow pre-starts the API
      // and preview manually (env-var control + curl health-check) before
      // invoking Playwright, so Playwright must reuse them — otherwise it
      // tries to bind port 3001/4173 a second time and crashes with "is
      // already used". Locally, reuse lets contributors keep `npm run dev`
      // running across e2e runs. The previous `!process.env.CI` polarity
      // was wrong for both cases.
      reuseExistingServer: true,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      // --host localhost (NOT a loopback IP) keeps the preview origin same-site
      // with the API origin so the refresh_token cookie (sameSite: strict)
      // attaches to /api/auth/refresh requests proxied through preview.
      command: 'cd ../packages/client && npm run preview -- --port 4173 --host localhost',
      url: PREVIEW_BASE,
      // Always reuse existing servers. CI's e2e workflow pre-starts the API
      // and preview manually (env-var control + curl health-check) before
      // invoking Playwright, so Playwright must reuse them — otherwise it
      // tries to bind port 3001/4173 a second time and crashes with "is
      // already used". Locally, reuse lets contributors keep `npm run dev`
      // running across e2e runs. The previous `!process.env.CI` polarity
      // was wrong for both cases.
      reuseExistingServer: true,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
