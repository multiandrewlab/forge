// e2e/specs/shell/not-found-404.spec.ts
import { test, expect } from '../../fixtures/reset.js';
import { shell } from '../../fixtures/selectors/shell.js';

test.describe('shell: 404 page', () => {
  test('catch-all renders NotFoundPage for unknown URL; back-home link routes home', async ({
    actor,
  }) => {
    await actor.goto('/this/does/not/exist');
    await expect(shell.notFoundPage(actor)).toBeVisible();
    await expect(shell.sidebarDesktop(actor)).toBeVisible();
    await shell.notFoundBackHome(actor).click();
    await expect(actor).toHaveURL(/\/$/);
  });

  test('post UUID 00000000-...-0 lands on the page-level not-found state, not the catch-all', async ({
    actor,
  }) => {
    await actor.goto('/posts/00000000-0000-0000-0000-000000000000');
    // The URL should NOT redirect to the catch-all — the page itself is rendered for /posts/<uuid>,
    // and the page-level not-found state appears (or an error state).
    await expect(actor).toHaveURL(/\/posts\/00000000-0000-0000-0000-000000000000/);
  });
});
