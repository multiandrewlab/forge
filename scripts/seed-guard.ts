/**
 * scripts/seed-guard.ts
 *
 * Production guard wrapper around `psql -f scripts/seed.sql`.
 *
 * Refuses to run against non-localhost databases unless
 * ALLOW_DESTRUCTIVE_SEED=1 is explicitly set in the environment.
 *
 * Exposes pure helpers (parseSeedTarget, assertSeedAllowed) for unit testing,
 * and an entry-point block at the bottom that runs when invoked directly
 * (e.g. via `npm run seed`, which sets SEED_GUARD_RUN=1).
 */

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const SAFE_HOSTS = new Set(['localhost', '127.0.0.1', '::1', 'host.docker.internal']);

/**
 * Parses DATABASE_URL and returns the hostname.
 *
 * - Throws if `url` is undefined / empty.
 * - Throws if `url` is not a valid URL.
 * - Strips IPv6 brackets, so `[::1]` returns `'::1'`.
 */
export function parseSeedTarget(url: string | undefined): string {
  if (url === undefined || url === '') {
    throw new Error('DATABASE_URL is not set');
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid DATABASE_URL: ${url}`);
  }

  const hostname = parsed.hostname;
  // URL parsing strips brackets for IPv6 addresses on most platforms,
  // but be defensive in case a runtime preserves them.
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    return hostname.slice(1, -1);
  }
  return hostname;
}

/**
 * Throws unless `host` is one of the safe local hostnames OR
 * `override` (typically `process.env.ALLOW_DESTRUCTIVE_SEED`) is exactly `'1'`
 * (after trimming).
 *
 * Other truthy strings (`'true'`, `'yes'`) do NOT enable the override —
 * we want a deliberate, explicit opt-in.
 */
export function assertSeedAllowed(host: string, override: string | undefined): void {
  if (SAFE_HOSTS.has(host)) {
    return;
  }
  if (override !== undefined && override.trim() === '1') {
    return;
  }
  throw new Error(
    `Refusing to seed non-local host "${host}". ` + `Set ALLOW_DESTRUCTIVE_SEED=1 to override.`,
  );
}

// ---------------------------------------------------------------------------
// Entry point — runs when executed directly (e.g. `npm run seed`).
//
// We trigger on either:
//   1. import.meta.url matches process.argv[1] (direct node/tsx invocation), OR
//   2. SEED_GUARD_RUN=1 is set in env (the canonical signal from package.json).
//
// Vitest does NOT set SEED_GUARD_RUN and import.meta.url won't match argv[1]
// when this module is imported as a dependency from a test, so the block
// stays dormant during test runs.
// ---------------------------------------------------------------------------
const isDirectInvocation =
  import.meta.url === `file://${process.argv[1]}` || process.env.SEED_GUARD_RUN === '1';

if (isDirectInvocation) {
  try {
    const databaseUrl = process.env.DATABASE_URL;
    // parseSeedTarget validates and throws on undefined/invalid.
    const host = parseSeedTarget(databaseUrl);
    assertSeedAllowed(host, process.env.ALLOW_DESTRUCTIVE_SEED);

    // After parseSeedTarget succeeded, databaseUrl is a non-empty string.
    // Re-narrow explicitly (no `!`) so TypeScript is happy when we pass it
    // to execFileSync.
    if (databaseUrl === undefined || databaseUrl === '') {
      // Defensive — unreachable because parseSeedTarget would have thrown.
      throw new Error('DATABASE_URL is not set');
    }

    const seedPath = resolve(process.cwd(), 'scripts/seed.sql');
    execFileSync('psql', [databaseUrl, '-f', seedPath], { stdio: 'inherit' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  }
}
