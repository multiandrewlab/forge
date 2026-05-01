import type { FastifyInstance } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isE2EFlagSet } from '../lib/env-guards.js';

export const E2E_RESET_LOCK_ID = 0xe2e5e70n;

// Closed map of allowed X-E2E-Worker-Id values to their per-worker user UUIDs.
// Defends against validation drift: only these literal keys can resolve to a UUID.
// Exported as the single source of truth — `scripts/seed.sql` (Task 3) and the
// test suite both reference these literal UUIDs via this export.
export const WORKER_USER_IDS = {
  '0': 'a0000000-0000-0000-0000-000000000101',
  '1': 'a0000000-0000-0000-0000-000000000102',
  '2': 'a0000000-0000-0000-0000-000000000103',
  '3': 'a0000000-0000-0000-0000-000000000104',
} as const;

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);
const DEV_OR_TEST = new Set(['development', 'test']);

// scripts/seed.sql lives at the repo root.
// From packages/server/src/routes/__test__.ts, that's four levels up.
const SEED_SQL_PATH = fileURLToPath(new URL('../../../../scripts/seed.sql', import.meta.url));

export type TestRoutesDeps = {
  env: { ENABLE_TEST_ROUTES?: string; NODE_ENV?: string };
  secret: string;
  isCI: boolean;
  host: string;
  pgQuery: (sql: string) => Promise<unknown>;
  pgTransaction: <T>(
    fn: (client: { query: (sql: string, params?: unknown[]) => Promise<unknown> }) => Promise<T>,
  ) => Promise<T>;
};

export async function registerTestRoutes(
  app: FastifyInstance,
  deps: TestRoutesDeps,
): Promise<void> {
  if (!isE2EFlagSet(deps.env.ENABLE_TEST_ROUTES)) return;
  const nodeEnv = deps.env.NODE_ENV?.trim();
  if (!nodeEnv || !DEV_OR_TEST.has(nodeEnv)) return;
  if (!LOOPBACK_HOSTS.has(deps.host) && !deps.isCI) return;

  app.log.info('mounting __test__ routes (E2E mode)');

  app.post('/api/__test__/reset', async (request, reply) => {
    if (request.headers.origin !== undefined) {
      return reply.code(403).send({ error: 'Origin header not allowed on test routes' });
    }
    const provided = request.headers['x-e2e-secret'];
    if (typeof provided !== 'string' || !secretsEqual(provided, deps.secret)) {
      return reply.code(403).send({ error: 'invalid X-E2E-Secret' });
    }

    // Worker-scoped branch: when X-E2E-Worker-Id is a single string header, run
    // 5 user-scoped DELETEs in a transaction instead of the global TRUNCATE.
    // - undefined (header missing) → fall through to legacy path
    // - array (duplicate header lines) → fall through to legacy path
    // - any other string → strict validation against the closed WORKER_USER_IDS map
    const raw = request.headers['x-e2e-worker-id'];
    if (typeof raw === 'string') {
      if (!Object.prototype.hasOwnProperty.call(WORKER_USER_IDS, raw)) {
        request.log.warn(
          { route: 'worker-scoped-reject', received: raw.slice(0, 16) },
          'E2E worker-scoped reset rejected: invalid X-E2E-Worker-Id',
        );
        return reply.code(400).send({
          error: 'X-E2E-Worker-Id must be one of "0", "1", "2", "3"',
          code: 'INVALID_WORKER_ID',
          received: raw.slice(0, 16),
        });
      }
      const userId = WORKER_USER_IDS[raw as keyof typeof WORKER_USER_IDS];
      await deps.pgTransaction(async (client) => {
        await client.query('DELETE FROM bookmarks              WHERE user_id   = $1', [userId]);
        await client.query('DELETE FROM votes                  WHERE user_id   = $1', [userId]);
        await client.query('DELETE FROM user_tag_subscriptions WHERE user_id   = $1', [userId]);
        await client.query('DELETE FROM comments               WHERE author_id = $1', [userId]);
        await client.query('DELETE FROM posts                  WHERE author_id = $1', [userId]);
      });
      request.log.info(
        { route: 'worker-scoped', workerId: raw, userId, ts: Date.now() },
        'E2E worker-scoped reset completed',
      );
      return reply.code(204).send();
    }
    // Fall through to legacy global-TRUNCATE path below.

    let seedSql: string;
    try {
      seedSql = readFileSync(SEED_SQL_PATH, 'utf8');
    } catch (err) {
      request.log.error({ err }, 'failed to read scripts/seed.sql');
      return reply.code(500).send({ error: 'failed to read seed file' });
    }

    await deps.pgQuery(`SELECT pg_advisory_lock(${E2E_RESET_LOCK_ID.toString()})`);
    try {
      await deps.pgQuery(seedSql);
    } finally {
      await deps.pgQuery(`SELECT pg_advisory_unlock(${E2E_RESET_LOCK_ID.toString()})`);
    }

    request.log.info(
      { workerId: process.env.TEST_WORKER_INDEX ?? 'unknown', ts: Date.now() },
      'E2E reset completed',
    );
    return reply.code(204).send();
  });
}

function secretsEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
