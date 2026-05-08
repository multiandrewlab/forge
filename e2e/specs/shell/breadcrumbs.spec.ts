// e2e/specs/shell/breadcrumbs.spec.ts
import { test, expect } from '../../fixtures/reset.js';
import { shell } from '../../fixtures/selectors/shell.js';

test.describe('shell: breadcrumbs', () => {
  test('post detail page shows Home > [post title] with home as a working link', async ({
    actor,
  }) => {
    // Seeded post UUID from bruno/environments/local.bru — public, viewable by any actor
    const postId = 'c0000000-0000-0000-0000-000000000099';
    await actor.goto(`/posts/${postId}`);

    await expect(shell.breadcrumbs(actor)).toBeVisible();
    await expect(shell.breadcrumbs(actor)).toHaveAttribute('aria-label', 'Breadcrumb');

    const current = shell.breadcrumbCurrent(actor);
    await expect(current).toBeVisible();
    await expect(current).toHaveAttribute('aria-current', 'page');

    await shell.breadcrumbLink(actor, 0).click();
    await expect(actor).toHaveURL(/\/$/);
  });
});
