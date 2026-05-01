import { test, expect } from '../../fixtures/reset.js';
import { auth } from '../../fixtures/selectors/auth.js';

test('login honours the ?redirect= query param after successful auth', async ({
  browser,
}, testInfo) => {
  // Anonymous context — visit a `requiresAuth` route; the global router guard
  // (packages/client/src/plugins/router.ts:118–119) redirects unauthenticated
  // users to /login?redirect=<original>. After successful login the page
  // navigates to the captured redirect target, NOT the default /.
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/posts/new');
  // Wait for the router guard to land us on the login page with the redirect
  // query param preserved — this is the load-bearing precondition.
  await expect(page).toHaveURL('/login?redirect=/posts/new');
  await auth.loginEmail(page).fill(`e2e_w${testInfo.workerIndex}@example.com`);
  await auth.loginPassword(page).fill('password123');
  await auth.loginSubmit(page).click();
  await expect(page).toHaveURL('/posts/new');
  await ctx.close();
});
