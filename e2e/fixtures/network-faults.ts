// e2e/fixtures/network-faults.ts
import type { Page } from '@playwright/test';

/**
 * Single-audit-point for opt-in route-mocked network failures used by E2E
 * specs. Each helper returns a Promise that resolves once the route is
 * registered. Specs SHOULD call `page.unroute(urlGlob)` in an afterEach to
 * avoid leaking handlers across tests, OR rely on a fresh `actor` per test
 * (default behavior in `e2e/fixtures/auth.ts:46-58`).
 */

/** Fail any matching request with HTTP 500 + JSON body. */
export async function api500(page: Page, urlGlob: string): Promise<void> {
  await page.route(urlGlob, async (route) => {
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Internal server error' }),
    });
  });
}

/** Return malformed JSON (HTTP 200 with an unparseable body). */
export async function apiInvalidJson(page: Page, urlGlob: string): Promise<void> {
  await page.route(urlGlob, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: 'not-json{',
    });
  });
}

/** Abort the request entirely, simulating an offline / DNS / connection-reset condition. */
export async function apiNetworkError(page: Page, urlGlob: string): Promise<void> {
  await page.route(urlGlob, (route) => route.abort('failed'));
}
