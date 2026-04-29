import { test, expect } from '../../fixtures/reset.js';

// Routes flagged `meta: { guest: true }` in
// `packages/client/src/plugins/router.ts:121-123` redirect already-authed
// users to `/`. These two specs lock in that behaviour for both the obvious
// case (/login) and the AccountLinkPage case the originating issue
// specifically called out (/auth/link).

test('navigating to /login while authenticated redirects to /', async ({ testuser }) => {
  await testuser.goto('/login');
  await expect(testuser).toHaveURL('/');
});

test('navigating to /auth/link while authenticated redirects to /', async ({ testuser }) => {
  await testuser.goto('/auth/link');
  await expect(testuser).toHaveURL('/');
});
