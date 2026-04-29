import { test, expect } from '../../fixtures/reset.js';

test('auth callback with no access_token in hash redirects to /login', async ({ browser }) => {
  // Anonymous context — exercises the AuthCallbackPage redirect-on-missing-
  // token branch. With no URL hash the onMounted handler at
  // packages/client/src/pages/AuthCallbackPage.vue:18-22 parses an empty
  // string, fails to find an `access_token` param, and immediately calls
  // router.push({ name: 'login' }). The page mounts long enough to render
  // the `auth-callback-loading` testid (added by WU1) before the redirect
  // settles — this spec asserts only the post-redirect URL, which is the
  // observable contract.
  //
  // The URL regex tolerates query params on /login.
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/auth/callback');
  await expect(page).toHaveURL(/\/login/);
  await ctx.close();
});
