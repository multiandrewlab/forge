import { test, expect } from '../../fixtures/reset.js';
import { auth } from '../../fixtures/selectors/auth.js';

test('logging out from the user menu lands on /login', async ({ actor }) => {
  // The `actor` fixture loads with a hydrated storageState so the TopBar
  // user menu is rendered. The single load-bearing observation is the URL
  // after the logout action — the router pushes to /login (potentially with
  // a `?redirect=` query when the current route is auth-gated), so we match
  // with a regex rather than an exact path.
  await actor.goto('/');
  await auth.userMenuTrigger(actor).click();
  await auth.logoutAction(actor).click();
  await expect(actor).toHaveURL(/\/login/);
});
