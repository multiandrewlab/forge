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
  // Retry once in CI to absorb workers=4 flakes from auth-rate-limit and
  // reset-window contention; specs pass deterministically at workers=1, so a
  // single retry on the second worker shakes out cross-test interference
  // without masking real spec failures.
  retries: process.env.CI ? 1 : 0,
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
