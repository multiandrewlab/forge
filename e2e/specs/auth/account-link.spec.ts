import { test, expect } from '../../fixtures/reset.js';
import { auth } from '../../fixtures/selectors/auth.js';

test('account-link form surfaces the server 401 for an invalid link token', async ({ browser }) => {
  // Anonymous context — exercises the AccountLinkPage error path the issue
  // calls for. The URL hash carries a JWT-shaped but unsigned junk token;
  // the form posts it to /api/auth/link-google, which returns 401 with the
  // literal body '{"error":"Invalid or expired link token"}'
  // (packages/server/src/routes/auth.ts:333-334). The page renders that
  // server message into the `error-message` testid.
  //
  // This 401 path is reachable only because WU1 fixed the
  // snake_case/camelCase body-key bug in AccountLinkPage.vue — before that
  // fix the request body never matched the server's `linkToken` schema and
  // the JWT verify step was never attempted.
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/auth/link#link_token=eyJhbGciOiJIUzI1NiJ9.fake.signature');
  await expect(auth.accountLinkForm(page)).toBeVisible();
  await auth.accountLinkPasswordInput(page).fill('irrelevant-password');
  await auth.accountLinkSubmitBtn(page).click();
  await expect(auth.accountLinkError(page)).toContainText('Invalid or expired link token');
  await ctx.close();
});
