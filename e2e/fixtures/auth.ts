import { test as base, type Page } from '@playwright/test';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { attachE2EInitScript } from './init-script.js';

// `e2e/package.json` declares `"type": "module"`, so __dirname is undefined.
// Derive it from import.meta.url for ESM compatibility.
const __dirname = dirname(fileURLToPath(import.meta.url));

export type AuthUser = 'e2e_w0' | 'e2e_w1' | 'e2e_w2' | 'e2e_w3' | 'alice' | 'carol';

export const SEED_USERS = {
  e2e_w0: { email: 'e2e_w0@example.com', password: 'password123' },
  e2e_w1: { email: 'e2e_w1@example.com', password: 'password123' },
  e2e_w2: { email: 'e2e_w2@example.com', password: 'password123' },
  e2e_w3: { email: 'e2e_w3@example.com', password: 'password123' },
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
  actor: Page;
  secondActor: Page;
  alice: Page;
  carol: Page;
};

// Per-worker user pool used by both `actor` and `secondActor`. Kept LOCAL
// (not imported from packages/server) to avoid an e2e → server dependency.
// Must stay in lock-step with WORKER_USER_IDS in
// packages/server/src/routes/__test__.ts and the e2e_w seed users.
const E2E_WORKER_USERS: AuthUser[] = ['e2e_w0', 'e2e_w1', 'e2e_w2', 'e2e_w3'];

export const test = base.extend<AuthFixtures>({
  actor: async ({ browser }, use, testInfo) => {
    const idx = testInfo.parallelIndex;
    if (!Number.isInteger(idx) || idx < 0 || idx > 3) {
      throw new Error(
        `[actor fixture] testInfo.parallelIndex=${idx} is out of range [0,3]. ` +
          `If you need more parallelism, expand the e2e_w pool in scripts/seed.sql ` +
          `AND bump WORKER_USER_IDS in packages/server/src/routes/__test__.ts ` +
          `AND bump the workers: setting in e2e/playwright.config.ts.`,
      );
    }
    const user = `e2e_w${idx}` as 'e2e_w0' | 'e2e_w1' | 'e2e_w2' | 'e2e_w3';
    testInfo.annotations.push({ type: 'actor', description: user });
    const ctx = await browser.newContext({ storageState: storageStatePath(user) });
    const page = await ctx.newPage();
    await attachE2EInitScript(page);
    await use(page);
    await ctx.close();
  },
  /**
   * Second authenticated browser context, bound to a DIFFERENT e2e_wN user
   * than `actor`. Used by cross-user specs (e.g. private-post visibility,
   * non-author replace banner) where the second viewer must NOT be the
   * author of the resource under test.
   *
   * Cycles to the next worker user, wrapping around — so worker 3 pairs
   * with e2e_w0. Re-uses the storage state baked by global-setup; no
   * inline login.
   *
   * NOTE: The reset fixture targets the test's own worker, not the
   * secondActor's. Specs that need to assert cross-user-owned resources
   * should create them through `actor` (whose worker DOES get reset) and
   * read them through `secondActor` (whose worker state is irrelevant).
   */
  secondActor: async ({ browser }, use, testInfo) => {
    const total = E2E_WORKER_USERS.length;
    if (testInfo.parallelIndex >= total) {
      throw new Error(
        `[secondActor fixture] testInfo.parallelIndex=${testInfo.parallelIndex} ` +
          `out of pool size ${total}. Expand the e2e_w pool to add more workers.`,
      );
    }
    const otherIndex = (testInfo.parallelIndex + 1) % total;
    // `otherIndex` is bounded `[0, total)` by the modulo above + the
    // range check, so the lookup is provably defined. The cast satisfies
    // noUncheckedIndexedAccess without a runtime branch.
    const otherUser = E2E_WORKER_USERS[otherIndex] as AuthUser;
    testInfo.annotations.push({ type: 'secondActor', description: otherUser });
    const ctx = await browser.newContext({ storageState: storageStatePath(otherUser) });
    const page = await ctx.newPage();
    await attachE2EInitScript(page);
    await use(page);
    await ctx.close();
  },
  alice: async ({ browser }, use) => {
    const ctx = await browser.newContext({ storageState: storageStatePath('alice') });
    const page = await ctx.newPage();
    await attachE2EInitScript(page);
    await use(page);
    await ctx.close();
  },
  carol: async ({ browser }, use) => {
    const ctx = await browser.newContext({ storageState: storageStatePath('carol') });
    const page = await ctx.newPage();
    await attachE2EInitScript(page);
    await use(page);
    await ctx.close();
  },
});

export { expect } from '@playwright/test';
