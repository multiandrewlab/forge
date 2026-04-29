import { test, expect } from '../../fixtures/reset.js';
import { auth } from '../../fixtures/selectors/auth.js';

test('login with seeded credentials lands on home', async ({ browser }) => {
  // Anonymous context — the testuser fixture is already-logged-in, so we drive
  // a raw context to exercise the unauthenticated /login flow.
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/login');
  await auth.loginEmail(page).fill('testuser@example.com');
  await auth.loginPassword(page).fill('password123');
  await auth.loginSubmit(page).click();
  await expect(page).toHaveURL('/');
  await ctx.close();
});
