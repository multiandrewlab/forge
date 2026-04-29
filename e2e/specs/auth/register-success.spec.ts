import { randomUUID } from 'node:crypto';
import { test, expect } from '../../fixtures/reset.js';
import { auth } from '../../fixtures/selectors/auth.js';

test('registering a fresh account redirects to home', { tag: '@no-reset' }, async ({ browser }) => {
  // Anonymous context — drive a raw context so the testuser fixture's
  // logged-in storageState isn't applied; the /register route assumes an
  // unauthenticated viewer.
  //
  // The email is randomized per run because this spec carries @no-reset:
  // the auto-reset beforeEach is skipped, so the users table is NOT wiped
  // between runs. Hardcoding an email would collide on the second run
  // (server returns 409 'Email already in use'). A fresh UUID-derived
  // address guarantees a clean register every time.
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const email = `register-${randomUUID()}@example.com`;

  await page.goto('/register');
  await auth.registerEmail(page).fill(email);
  await auth.registerName(page).fill('Register Spec User');
  await auth.registerPassword(page).fill('password123');
  await auth.registerConfirmPassword(page).fill('password123');
  await auth.registerSubmit(page).click();
  await expect(page).toHaveURL('/');
  await ctx.close();
});
