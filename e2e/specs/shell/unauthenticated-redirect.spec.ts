// e2e/specs/shell/unauthenticated-redirect.spec.ts
import { test, expect } from '../../fixtures/reset.js';

test.describe('shell: 401 redirects to login', () => {
  test('clearing cookies + reload sends user to /login with redirect param', async ({ actor }) => {
    await actor.goto('/');
    await expect(actor).toHaveURL(/\/$/);

    await actor.context().clearCookies();
    await actor.evaluate(() => window.localStorage.clear());

    await actor.goto('/');

    await expect(actor).toHaveURL(/\/login(\?.*)?$/);
  });
});
