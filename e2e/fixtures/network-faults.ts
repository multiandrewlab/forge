import type { Page } from '@playwright/test';

/**
 * Placeholder for opt-in route-mocked network failure injection. Specific
 * faults will be added in their feature PRs (issue #46+). All tests that
 * mock at the network layer MUST use helpers from this file so the project
 * has a single audit point.
 *
 * Example future helper signature (do NOT implement here):
 *   export async function withTransientFailure(page: Page, urlGlob: string, status: number): Promise<void>
 */
export async function __networkFaultsPlaceholder(_page: Page): Promise<void> {
  // intentionally empty
}
