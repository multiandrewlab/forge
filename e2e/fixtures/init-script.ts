import type { Page } from '@playwright/test';

/**
 * Attach an init script that sets `window.__E2E__ = true` before any page
 * navigation. The flag lets client code branch on E2E runs (e.g. mock LLM
 * wiring, deterministic clocks) without leaking into production builds.
 *
 * Playwright runs the init-script callback inside the page (browser) context,
 * so `window` is available there even though the e2e tsconfig does not include
 * the DOM lib. We type the global reference via a small interface to keep the
 * file lib-clean.
 */
interface E2EWindow {
  __E2E__?: boolean;
}

export async function attachE2EInitScript(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (globalThis as unknown as E2EWindow).__E2E__ = true;
  });
}
