// e2e/specs/shell/sidebar-nav.spec.ts
import { test, expect } from '../../fixtures/reset.js';
import { shell } from '../../fixtures/selectors/shell.js';

test.describe('shell: sidebar nav', () => {
  test('home / trending / my-snippets / bookmarks / following links route correctly', async ({
    actor,
  }) => {
    await actor.goto('/');

    await shell.trendingNavLink(actor).click();
    await expect(actor).toHaveURL(/\/trending$/);

    await shell.mySnippetsNavLink(actor).click();
    await expect(actor).toHaveURL(/\/my-snippets$/);

    await shell.bookmarksNavLink(actor).click();
    await expect(actor).toHaveURL(/\/bookmarks$/);

    await shell.followingNavLink(actor).click();
    await expect(actor).toHaveURL(/\/following$/);

    await shell.homeNavLink(actor).click();
    await expect(actor).toHaveURL(/\/$/);
  });
});
