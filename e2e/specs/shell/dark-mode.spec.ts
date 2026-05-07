// e2e/specs/shell/dark-mode.spec.ts
import { test, expect } from '../../fixtures/reset.js';
import { shell } from '../../fixtures/selectors/shell.js';

test.describe('shell: dark-mode', () => {
  test('toggle persists across navigation', async ({ actor }) => {
    await actor.goto('/');

    const initialDark = await actor.evaluate(() =>
      document.documentElement.classList.contains('dark'),
    );

    await shell.darkModeToggle(actor).click();
    const afterToggleDark = await actor.evaluate(() =>
      document.documentElement.classList.contains('dark'),
    );
    expect(afterToggleDark).toBe(!initialDark);

    await shell.trendingNavLink(actor).click();
    await expect(actor).toHaveURL(/\/trending$/);

    const navDark = await actor.evaluate(() => document.documentElement.classList.contains('dark'));
    expect(navDark).toBe(afterToggleDark);

    const stored = await actor.evaluate(() => localStorage.getItem('forge-theme'));
    expect(stored).toBe(afterToggleDark ? 'dark' : 'light');
  });

  test('toggle persists across reload', async ({ actor }) => {
    await actor.goto('/');

    const initialDark = await actor.evaluate(() =>
      document.documentElement.classList.contains('dark'),
    );
    await shell.darkModeToggle(actor).click();
    const afterToggleDark = await actor.evaluate(() =>
      document.documentElement.classList.contains('dark'),
    );
    expect(afterToggleDark).toBe(!initialDark);

    await actor.reload();
    await expect(shell.darkModeToggle(actor)).toBeVisible();
    await expect
      .poll(() => actor.evaluate(() => document.documentElement.classList.contains('dark')))
      .toBe(afterToggleDark);
  });
});
