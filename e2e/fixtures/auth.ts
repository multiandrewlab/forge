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
