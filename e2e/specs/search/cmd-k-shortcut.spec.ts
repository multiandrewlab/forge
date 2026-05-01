import { test, expect } from '../../fixtures/reset.js';
import { search } from '../../fixtures/selectors/search.js';

test('search: Cmd+K (or Ctrl+K) opens the search modal', async ({ actor }) => {
  await actor.goto('/');
  // useKeyboard.ts attaches its handler to window — focus must be inside the
  // page so the synthetic keypress dispatches. Focus the trigger button.
  await search.searchTrigger(actor).focus();
  // useKeyboard.ts's `mod+k` checks navigator.platform inside the browser:
  // metaKey on macOS, ctrlKey elsewhere. The browser's platform follows the
  // host OS. Read it from the page and dispatch the matching modifier.
  const isMac = await actor.evaluate(() => navigator.platform.toLowerCase().includes('mac'));
  await actor.keyboard.press(isMac ? 'Meta+K' : 'Control+K');
  await expect(search.searchInput(actor)).toBeVisible();
});
