import { test, expect } from '../../fixtures/reset.js';

test('Google OAuth callback returns the 501 stub when credentials are unset', async ({
  browser,
}) => {
  // Anonymous context — exercises the OAuth stub path the issue calls for.
  //
  // Deviation from the issue's user-flow phrasing ("clicking Sign in with
  // Google → 501"): the start URL `/api/auth/google` is conditionally
  // registered only when GOOGLE_CLIENT_ID is set
  // (packages/server/src/app.ts:41). In E2E that env var is unset, so the
  // start URL 404s and the user-flow click cannot be observed end-to-end.
  // The 501 stub the issue points to lives on the *callback* route, which
  // is always registered inside the auth-route group; when `app.googleOAuth2`
  // is undefined the handler returns 501 with body
  // '{"error":"Google OAuth is not configured"}'
  // (packages/server/src/routes/auth.ts:259-260). Direct-navigating the
  // callback with a junk authorization code reaches the same handler and
  // proves the stub is wired.
  //
  // Convention exception: this spec asserts against `page.locator('body')`
  // rather than the `auth` selector shard. The 501 response is a JSON body
  // rendered by the browser as raw text — there is no Vue page, no testid,
  // and no DOM rendered by the client app. Body text-content is the only
  // surface available, and it is the same surface the issue specifies.
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/api/auth/google/callback?code=fake.code');
  await expect(page.locator('body')).toContainText('Google OAuth is not configured');
  await ctx.close();
});
