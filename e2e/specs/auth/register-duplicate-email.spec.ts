import { test, expect } from '../../fixtures/reset.js';
import { auth } from '../../fixtures/selectors/auth.js';

test(
  'registering with a seeded email surfaces the duplicate-email error',
  { tag: '@no-reset' },
  async ({ browser }, testInfo) => {
    // Anonymous context — the /register route assumes an unauthenticated
    // viewer, so we don't reuse the actor storageState fixture.
    //
    // e2e_w${N}@example.com is pinned in scripts/seed.sql per the per-worker
    // pool and therefore exists in the users table whether or not the DB was
    // reset. Submitting the current worker's email exercises the server's 409
    // path:
    //   packages/server/src/routes/auth.ts:80 →
    //     reply.status(409).send({ error: 'Email already in use' })
    // which the client surfaces via the `error` ref into the
    // data-testid="error-message" block (registerServerError selector).
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    await page.goto('/register');
    await auth.registerEmail(page).fill(`e2e_w${testInfo.parallelIndex}@example.com`);
    await auth.registerName(page).fill('Duplicate Email User');
    await auth.registerPassword(page).fill('password123');
    await auth.registerConfirmPassword(page).fill('password123');
    await auth.registerSubmit(page).click();
    await expect(auth.registerServerError(page)).toContainText('Email already in use');
    await ctx.close();
  },
);
