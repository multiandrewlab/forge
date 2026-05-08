// e2e/specs/shell/mobile-responsive.spec.ts
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '../../fixtures/reset.js';
import { shell } from '../../fixtures/selectors/shell.js';

test.describe('shell: mobile responsive smoke', () => {
  test('at 375x812 the desktop sidebar is hidden and the mobile-nav drawer is reachable', async ({
    actor,
  }) => {
    await actor.setViewportSize({ width: 375, height: 812 });
    await actor.goto('/');

    await expect(shell.sidebarDesktop(actor)).toBeHidden();
    await expect(shell.sidebarToggleBtn(actor)).toBeVisible();

    await shell.sidebarToggleBtn(actor).click();
    await expect(shell.mobileNavDrawer(actor)).toBeVisible();

    await expect(shell.homeNavLink(actor).last()).toBeVisible();

    // Accessibility scan at the mobile viewport — scoped to the shell.
    // Color-contrast disabled per established pattern (chrome-wide #ff6b1a
    // brand-color contrast tracked outside this issue).
    const axeResults = await new AxeBuilder({ page: actor })
      .include('[data-testid="app-layout"]')
      .withTags(['wcag2a', 'wcag2aa'])
      .disableRules(['color-contrast'])
      .analyze();
    expect(axeResults.violations).toEqual([]);
  });
});
