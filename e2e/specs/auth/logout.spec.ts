import { test, expect } from '../../fixtures/reset.js';
import { auth } from '../../fixtures/selectors/auth.js';

test('logging out from the user menu lands on /login', async ({ testuser }) => {
  // The `testuser` fixture loads with a hydrated storageState so the TopBar
  // user menu is rendered. The single load-bearing observation is the URL
  // after the logout action — the router pushes to /login (potentially with
  // a `?redirect=` query when the current route is auth-gated), so we match
  // with a regex rather than an exact path.
  await testuser.goto('/');
  await auth.userMenuTrigger(testuser).click();
  await auth.logoutAction(testuser).click();
  await expect(testuser).toHaveURL(/\/login/);
});
