import { test, expect } from '../../fixtures/reset.js';
import { auth } from '../../fixtures/selectors/auth.js';

test('login with wrong password shows the invalid-credentials error', async ({ browser }) => {
  // Anonymous context — exercise the error path of /login.
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/login');
  await auth.loginEmail(page).fill('testuser@example.com');
  await auth.loginPassword(page).fill('wrong-password');
  await auth.loginSubmit(page).click();
  // Server returns 401 with literal text 'Invalid email or password'
  // (packages/server/src/routes/auth.ts:153). The login form wires that into
  // the loginError testid. URL must not advance from /login.
  await expect(auth.loginError(page)).toContainText('Invalid email or password');
  await expect(page).toHaveURL(/\/login(?:$|\?)/);
  await ctx.close();
});
