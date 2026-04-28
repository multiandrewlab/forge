import type { FastifyInstance } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isE2EFlagSet } from '../lib/env-guards.js';

export const E2E_RESET_LOCK_ID = 0xe2e5e70n;

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

    let seedSql: string;
    try {
      seedSql = readFileSync(SEED_SQL_PATH, 'utf8');
    } catch (err) {
      app.log.error({ err }, 'failed to read scripts/seed.sql');
      return reply.code(500).send({ error: 'failed to read seed file' });
    }

    await deps.pgQuery(`SELECT pg_advisory_lock(${E2E_RESET_LOCK_ID.toString()})`);
    try {
      await deps.pgQuery(seedSql);
    } finally {
      await deps.pgQuery(`SELECT pg_advisory_unlock(${E2E_RESET_LOCK_ID.toString()})`);
    }

    app.log.info(
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
