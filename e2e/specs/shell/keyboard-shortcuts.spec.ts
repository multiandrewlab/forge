// e2e/specs/shell/keyboard-shortcuts.spec.ts
import { test, expect } from '../../fixtures/reset.js';
import { shell } from '../../fixtures/selectors/shell.js';

// The Playwright Chromium "desktop" project emulates navigator.platform = "Win32"
// regardless of host OS, so the in-app `isMac()` check (`navigator.platform`) always
// returns false in E2E and the mod+k handler matches on `event.ctrlKey`.
const SEARCH_OPEN_KEY = 'Control+K';

test.describe('shell: keyboard shortcuts', () => {
  test('Cmd/Ctrl+K opens the search modal', async ({ actor }) => {
    await actor.goto('/');
    await actor.waitForFunction(
      () => document.querySelector('[data-testid="search-trigger"]') !== null,
    );
    await expect(shell.searchDialog(actor)).toBeHidden();
    await actor.keyboard.press(SEARCH_OPEN_KEY);
    await expect(shell.searchDialog(actor)).toBeVisible();
    await expect(shell.searchInput(actor)).toBeFocused();
  });

  test('n navigates to /posts/new', async ({ actor }) => {
    await actor.goto('/');
    await actor.waitForFunction(
      () => document.querySelector('[data-testid="app-layout"]') !== null,
    );
    await actor.keyboard.press('n');
    await expect(actor).toHaveURL(/\/posts\/new$/);
  });

  test('/ opens the search modal and focuses the input', async ({ actor }) => {
    await actor.goto('/');
    await actor.waitForFunction(
      () => document.querySelector('[data-testid="search-trigger"]') !== null,
    );
    await expect(shell.searchDialog(actor)).toBeHidden();
    await actor.keyboard.press('/');
    await expect(shell.searchDialog(actor)).toBeVisible();
    await expect(shell.searchInput(actor)).toBeFocused();
  });

  test('? opens the keyboard-shortcuts help modal', async ({ actor }) => {
    await actor.goto('/');
    await actor.waitForFunction(
      () => document.querySelector('[data-testid="app-layout"]') !== null,
    );
    await expect(shell.keyboardShortcutsHelp(actor)).toBeHidden();
    await actor.keyboard.press('Shift+Slash');
    await expect(shell.keyboardShortcutsHelp(actor)).toBeVisible();

    await shell.keyboardShortcutsHelpClose(actor).click();
    await expect(shell.keyboardShortcutsHelp(actor)).toBeHidden();
  });
});
