// e2e/specs/shell/top-nav.spec.ts
import { test, expect } from '../../fixtures/reset.js';
import { shell } from '../../fixtures/selectors/shell.js';

test.describe('shell: top nav', () => {
  test('logo click navigates to home', async ({ actor }) => {
    await actor.goto('/trending');
    await expect(actor).toHaveURL(/\/trending$/);

    await shell.logoLink(actor).click();
    await expect(actor).toHaveURL(/\/$/);
    await expect(shell.appLayout(actor)).toBeVisible();
  });

  test('search-trigger button opens the search modal', async ({ actor }) => {
    await actor.goto('/');
    await expect(shell.searchDialog(actor)).toBeHidden();
    await shell.searchTrigger(actor).click();
    await expect(shell.searchDialog(actor)).toBeVisible();
    await shell.searchCloseBtn(actor).click();
    await expect(shell.searchDialog(actor)).toBeHidden();
  });

  test('user-menu opens and renders the documented action items', async ({ actor }) => {
    await actor.goto('/');
    await shell.userMenuTrigger(actor).click();
    await expect(shell.profileAction(actor)).toBeVisible();
    await expect(shell.mySnippetsAction(actor)).toBeVisible();
    await expect(shell.settingsAction(actor)).toBeVisible();
    await expect(shell.logoutAction(actor)).toBeVisible();
  });
});
