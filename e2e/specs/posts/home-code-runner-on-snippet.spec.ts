import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';

// HomePage selects the newest post on mount; alice → click the seeded
// testuser-owned snippet (c…0099, contentType=snippet, language=typescript)
// and assert the inline CodeRunner panel mounts in the right pane.
//
// CodeRunner gates on `fullPost?.contentType === 'snippet' && revision`, so the
// async `apiFetch(/api/posts/:id)` in PostDetail must complete before the
// element is visible. Bumping the visibility timeout to 10s absorbs the
// dev-server JIT cost without stalling on success.
// Re-enabled in #65 after PostDetail inline panel rendering verified.
test('code-runner: alice sees the inline run panel on a snippet post (HomePage)', async ({
  alice,
}) => {
  await alice.goto('/');

  // Click the list-item heading (h3) — the right-pane PostMetaHeader also
  // renders the title as h1 once a post is auto-selected, so a plain
  // getByText is ambiguous. Targeting the h3 keeps the click on the post
  // list independent of auto-selection state.
  await alice
    .getByRole('heading', { level: 3, name: 'Test Fixture Post (testuser-owned)' })
    .click();

  await expect(posts.codeRunner(alice)).toBeVisible({ timeout: 10000 });
  await expect(posts.runPlay(alice)).toBeVisible();
});
