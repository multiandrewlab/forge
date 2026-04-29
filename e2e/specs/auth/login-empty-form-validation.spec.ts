import { test, expect } from '../../fixtures/reset.js';
import { auth } from '../../fixtures/selectors/auth.js';

test('submitting an empty login form is blocked by client-side validity', async ({ browser }) => {
  // Anonymous context — empty-submit triggers the browser's native HTML5
  // validity check before any network call. Two corroborating checks of one
  // concept ("client-side validity blocks submission"): URL stays on /login,
  // and the email input reports validity.valid === false.
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/login');
  await auth.loginSubmit(page).click();
  await expect(page).toHaveURL(/\/login(?:$|\?)/);
  await expect(auth.loginEmail(page)).toHaveJSProperty('validity.valid', false);
  await ctx.close();
});
