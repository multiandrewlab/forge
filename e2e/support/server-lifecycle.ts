import { readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SECRET_FILENAME = 'forge-e2e-secret';

/**
 * Resolve the file path that the server's bootstrap (lib/bootstrap.ts) writes
 * the e2e secret to: RUNNER_TEMP in CI, os.tmpdir() locally.
 */
export function resolveSecretPath(env: NodeJS.ProcessEnv = process.env): string {
  const dir = env.RUNNER_TEMP ?? tmpdir();
  return join(dir, SECRET_FILENAME);
}

/**
 * Read the secret file written by the server bootstrap. Throws a clear error
 * if the file is missing — usually means the server was started without
 * ENABLE_TEST_ROUTES=1.
 */
export function readE2ESecret(env: NodeJS.ProcessEnv = process.env): string {
  const path = resolveSecretPath(env);
  if (!existsSync(path)) {
    throw new Error(
      `[e2e] secret file missing at ${path}. ` +
        `Did the server start with ENABLE_TEST_ROUTES=1? ` +
        `See e2e/README.md for the local-dev env vars.`,
    );
  }
  const secret = readFileSync(path, 'utf-8').trim();
  if (secret.length === 0) {
    throw new Error(`[e2e] secret file at ${path} is empty.`);
  }
  return secret;
}

/**
 * Hit /api/__test__/reset once at startup with the secret, to fail fast if
 * the server is missing ENABLE_TEST_ROUTES=1 (would 404) or the secret is
 * stale (would 403).
 */
export async function startupProbe(apiBase: string, secret: string): Promise<void> {
  const res = await fetch(`${apiBase}/api/__test__/reset`, {
    method: 'POST',
    headers: { 'X-E2E-Secret': secret },
  });
  if (res.status === 404) {
    throw new Error(
      `[e2e] startup probe: /api/__test__/reset returned 404. ` +
        `The server is running without ENABLE_TEST_ROUTES=1.`,
    );
  }
  if (res.status === 403) {
    throw new Error(
      `[e2e] startup probe: /api/__test__/reset returned 403. ` +
        `The X-E2E-Secret in ${resolveSecretPath()} does not match what the server has.`,
    );
  }
  if (!res.ok) {
    throw new Error(`[e2e] startup probe: /api/__test__/reset returned HTTP ${res.status}`);
  }
}
