import { randomUUID } from 'node:crypto';
import { test, expect } from '../../fixtures/reset.js';
import { auth } from '../../fixtures/selectors/auth.js';

test('login with an unknown email shows the invalid-credentials error', async ({ browser }) => {
  // Anonymous context — exercise the unknown-email error path of /login.
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/login');
  // Random UUID guarantees the email is not seeded — server returns the same
  // 'Invalid email or password' literal for both wrong-password and
  // unknown-email 401 paths (packages/server/src/routes/auth.ts:143).
  await auth.loginEmail(page).fill(`unknown-${randomUUID()}@example.com`);
  await auth.loginPassword(page).fill('password123');
  await auth.loginSubmit(page).click();
  await expect(auth.loginError(page)).toContainText('Invalid email or password');
  await ctx.close();
});
