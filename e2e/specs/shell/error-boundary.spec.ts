// e2e/specs/shell/error-boundary.spec.ts
import { test, expect } from '../../fixtures/reset.js';
import { shell } from '../../fixtures/selectors/shell.js';

test.describe('shell: error boundary on render fail', () => {
  test('catches downstream render error and displays the fallback', async ({ actor }) => {
    // PostViewPage has an E2E-gated branch that throws synchronously during
    // <script setup> when both `window.__E2E__ === true` (set by the actor
    // fixture's init-script — Playwright-only, never set in production
    // traffic) AND the URL has `?errorBoundaryTest=1`. Vue 3's
    // onErrorCaptured (in ErrorBoundary.vue, which wraps <RouterView>)
    // catches the throw and renders the fallback. We intentionally *don't*
    // mock the network here — usePosts.fetchPost swallows malformed-JSON
    // errors and surfaces them via `error.value`, which never propagates to
    // the boundary, so the synthetic throw is the only deterministic way to
    // verify the catch. The branch uses a runtime check rather than
    // `import.meta.env.MODE` so the code path survives the production
    // bundle that Vite preview serves to E2E.
    await actor.goto('/posts/c0000000-0000-0000-0000-000000000099?errorBoundaryTest=1');

    await expect(shell.errorBoundaryFallback(actor)).toBeVisible();
    await expect(shell.errorBoundaryRetry(actor)).toBeVisible();
  });
});
