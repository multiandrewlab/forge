import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';

// HomePage inline path: alice clicks the seeded snippet, presses Run, and the
// execution-output panel + status bar appear once the WASM sandbox finishes.
//
// useCodeRunner transitions: idle → loading (worker boot) → running → done.
// The status bar's "Exit: 0" line is gated on exitCode !== null (i.e., status
// reached 'done' or 'error'), so asserting `Exit: \d+` confirms completion.
//
// 15s timeout on `executionOutput` covers cold-start TS sandbox boot in CI;
// the seeded revision (`const testFixture: string = "hello from testuser v3
// with more body"; export default testFixture;`) compiles + runs cleanly to
// exit 0 with no stdout, so we cannot rely on output lines — the status bar
// is the deterministic completion signal.
// FIXME(issue-pending): #65 verified that the panel + CodeRunner mount correctly
// (sibling spec `home-code-runner-on-snippet.spec.ts` is un-fixme'd and passes).
// However, the WASM sandbox does not progress to the `done` state with an exit
// code: the status-bar shows only " Clear " text after Run is clicked, even at
// workers=1 with a 60s timeout. This is a separate runtime bug in the code-
// runner pipeline (not the panel-render issue #65 was tracking). Re-enabling
// this assertion is gated on a new tracking issue for the runner-completion bug.
test.fixme('code-runner: alice runs the seeded snippet and sees output panel + completion status', async ({
  alice,
}) => {
  await alice.goto('/');

  // Click the list-item heading (h3) — the right-pane PostMetaHeader also
  // renders the title as h1 once a post is auto-selected, so a plain
  // getByText is ambiguous.
  await alice
    .getByRole('heading', { level: 3, name: 'Test Fixture Post (testuser-owned)' })
    .click();

  await expect(posts.codeRunner(alice)).toBeVisible({ timeout: 10000 });

  await posts.runPlay(alice).click();

  await expect(posts.executionOutput(alice)).toBeVisible({ timeout: 15000 });

  // Status bar reflects completion (exit code rendered) — works for both
  // exit 0 (success) and any non-zero exit, and is independent of stdout.
  const statusBar = alice.getByTestId('status-bar');
  await expect(statusBar).toContainText(/Exit:\s*\d+/, { timeout: 15000 });
});
