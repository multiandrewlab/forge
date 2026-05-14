import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify from 'fastify';

// Allow individual tests to override readFileSync via this mutable hook.
// When set, the route's readFileSync call will invoke this function and
// throw whatever it throws / return whatever it returns. When null, the
// real readFileSync is used.
let readFileSyncOverride: ((path: string, encoding: string) => string) | null = null;

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    readFileSync: ((path: string, encoding: string) => {
      if (readFileSyncOverride !== null) return readFileSyncOverride(path, encoding);
      return actual.readFileSync(path, encoding as BufferEncoding);
    }) as typeof actual.readFileSync,
  };
});

// Spy client used by the "real withTransaction" rollback test below. The pg
// module is mocked at module-load so `new Pool()` returns a Pool whose
// connect() yields this client; the rollback test mutates query.mockImpl.
const mockClientForRollback = {
  query: vi.fn(),
  release: vi.fn(),
};
vi.mock('pg', async () => {
  const actual = await vi.importActual<typeof import('pg')>('pg');
  class MockPool {
    connect = vi.fn().mockResolvedValue(mockClientForRollback);
    query = vi.fn();
    end = vi.fn();
  }
  return {
    ...actual,
    default: { ...actual.default, Pool: MockPool },
    Pool: MockPool,
  };
});

import { registerTestRoutes, E2E_RESET_LOCK_ID, WORKER_USER_IDS } from '../../routes/__test__.js';

describe('registerTestRoutes — gating', () => {
  it('exports E2E_RESET_LOCK_ID as a 64-bit BigInt constant', () => {
    expect(typeof E2E_RESET_LOCK_ID).toBe('bigint');
    expect(E2E_RESET_LOCK_ID).toBe(0xe2e5e70n);
  });

  it('does NOT register when ENABLE_TEST_ROUTES is unset', async () => {
    const app = Fastify();
    await registerTestRoutes(app, {
      env: {},
      secret: 'unused',
      isCI: false,
      host: '127.0.0.1',
      pgQuery: async () => undefined,
      pgTransaction: vi.fn(),
    });
    const res = await app.inject({ method: 'POST', url: '/api/__test__/reset' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('does NOT register when NODE_ENV=production', async () => {
    const app = Fastify();
    await registerTestRoutes(app, {
      env: { ENABLE_TEST_ROUTES: '1', NODE_ENV: 'production' },
      secret: 'abc',
      isCI: false,
      host: '127.0.0.1',
      pgQuery: async () => undefined,
      pgTransaction: vi.fn(),
    });
    const res = await app.inject({ method: 'POST', url: '/api/__test__/reset' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('does NOT register when host is non-loopback and not in CI', async () => {
    const app = Fastify();
    await registerTestRoutes(app, {
      env: { ENABLE_TEST_ROUTES: '1', NODE_ENV: 'test' },
      secret: 'abc',
      isCI: false,
      host: '0.0.0.0',
      pgQuery: async () => undefined,
      pgTransaction: vi.fn(),
    });
    const res = await app.inject({ method: 'POST', url: '/api/__test__/reset' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('POST /api/__test__/reset — auth', () => {
  let pgCalls: string[];

  beforeEach(() => {
    pgCalls = [];
  });

  async function makeApp() {
    const app = Fastify();
    await registerTestRoutes(app, {
      env: { ENABLE_TEST_ROUTES: '1', NODE_ENV: 'test' },
      secret: 'expected-secret-abc',
      isCI: false,
      host: '127.0.0.1',
      pgQuery: async (sql) => {
        pgCalls.push(sql);
      },
      pgTransaction: vi.fn(),
    });
    return app;
  }

  it('returns 403 when X-E2E-Secret header is missing', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'POST', url: '/api/__test__/reset' });
    expect(res.statusCode).toBe(403);
    expect(pgCalls).toEqual([]);
    await app.close();
  });

  it('returns 403 when X-E2E-Secret header is wrong', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/__test__/reset',
      headers: { 'X-E2E-Secret': 'wrong' },
    });
    expect(res.statusCode).toBe(403);
    expect(pgCalls).toEqual([]);
    await app.close();
  });

  it('returns 403 when an Origin header is present (browser CSRF defense)', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/__test__/reset',
      headers: { 'X-E2E-Secret': 'expected-secret-abc', Origin: 'http://evil.example' },
    });
    expect(res.statusCode).toBe(403);
    expect(pgCalls).toEqual([]);
    await app.close();
  });

  it('returns 204, runs seed.sql with advisory lock, and emits audit log when secret matches', async () => {
    const app = await makeApp();
    const logSpy = vi.spyOn(app.log, 'info');

    const res = await app.inject({
      method: 'POST',
      url: '/api/__test__/reset',
      headers: { 'X-E2E-Secret': 'expected-secret-abc' },
    });

    expect(res.statusCode).toBe(204);
    // Expected SQL trace: lock, seed, unlock.
    expect(pgCalls.length).toBe(3);
    expect(pgCalls[0]).toMatch(/pg_advisory_lock/);
    // seed.sql wraps statements in a BEGIN;/COMMIT; transaction (with leading
    // comment lines), so we assert the markers appear rather than anchoring
    // to start-of-string.
    expect(pgCalls[1]).toMatch(/BEGIN;/);
    expect(pgCalls[1]).toMatch(/COMMIT;\s*$/);
    expect(pgCalls[2]).toMatch(/pg_advisory_unlock/);

    // Audit log requirement (issue #44 adversarial-review checklist):
    // every successful reset MUST log workerId + timestamp.
    const auditCall = logSpy.mock.calls.find((args) =>
      /reset completed/i.test(String(args[1] ?? '')),
    );
    expect(auditCall, 'expected an "E2E reset completed" log line').toBeDefined();
    if (!auditCall) throw new Error('unreachable');
    const auditPayload = auditCall[0] as { workerId: unknown; ts: unknown };
    expect(auditPayload).toHaveProperty('workerId');
    expect(auditPayload).toHaveProperty('ts');
    expect(typeof auditPayload.ts).toBe('number');

    await app.close();
  });

  it('returns 500 when seed.sql cannot be read', async () => {
    const app = await makeApp();
    readFileSyncOverride = () => {
      throw new Error('ENOENT: no such file');
    };

    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/__test__/reset',
        headers: { 'X-E2E-Secret': 'expected-secret-abc' },
      });

      expect(res.statusCode).toBe(500);
      expect(pgCalls).toEqual([]); // no lock acquired if read fails
    } finally {
      readFileSyncOverride = null;
      await app.close();
    }
  });

  it('releases the advisory lock even when seed execution throws', async () => {
    const app = Fastify();
    const calls: string[] = [];
    await registerTestRoutes(app, {
      env: { ENABLE_TEST_ROUTES: '1', NODE_ENV: 'test' },
      secret: 'expected-secret-abc',
      isCI: false,
      host: '127.0.0.1',
      pgQuery: async (sql) => {
        calls.push(sql);
        // Throw on the second call (the seed exec, after the advisory lock).
        // This is deterministic regardless of seed.sql content.
        if (calls.length === 2) throw new Error('simulated DB failure');
      },
      pgTransaction: vi.fn(),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/__test__/reset',
      headers: { 'X-E2E-Secret': 'expected-secret-abc' },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(500);
    // Lock acquired, seed failed, but unlock was still called.
    expect(calls.some((s) => /pg_advisory_unlock/.test(s))).toBe(true);
    await app.close();
  });
});

describe('WORKER_USER_IDS contract', () => {
  it('pins the 4 worker user UUIDs (must match scripts/seed.sql)', () => {
    expect(WORKER_USER_IDS).toEqual({
      '0': 'a0000000-0000-0000-0000-000000000101',
      '1': 'a0000000-0000-0000-0000-000000000102',
      '2': 'a0000000-0000-0000-0000-000000000103',
      '3': 'a0000000-0000-0000-0000-000000000104',
    });
  });
});

describe('POST /api/__test__/reset — worker-scoped path', () => {
  async function buildAppWithTestRoutes(opts: {
    pgQuery: (sql: string) => Promise<unknown>;
    pgTransaction: <T>(
      fn: (client: { query: (sql: string, params?: unknown[]) => Promise<unknown> }) => Promise<T>,
    ) => Promise<T>;
    secret?: string;
    isCI?: boolean;
  }) {
    const app = Fastify();
    await registerTestRoutes(app, {
      env: { ENABLE_TEST_ROUTES: '1', NODE_ENV: 'test' },
      secret: opts.secret ?? 'test',
      isCI: opts.isCI ?? true,
      host: '127.0.0.1',
      pgQuery: opts.pgQuery,
      pgTransaction: opts.pgTransaction,
    });
    return app;
  }

  for (const workerId of ['0', '1', '2', '3'] as const) {
    it(`dispatches 5 user-scoped DELETEs for X-E2E-Worker-Id: '${workerId}'`, async () => {
      const mockClient = {
        query: vi.fn().mockResolvedValue({ rows: [] }),
      };
      const pgTransaction = vi.fn(
        async (
          fn: (client: {
            query: (sql: string, params?: unknown[]) => Promise<unknown>;
          }) => Promise<unknown>,
        ) => fn(mockClient),
      );
      const pgQuery = vi.fn(async () => undefined);
      const app = await buildAppWithTestRoutes({ pgQuery, pgTransaction });

      const res = await app.inject({
        method: 'POST',
        url: '/api/__test__/reset',
        headers: { 'X-E2E-Secret': 'test', 'X-E2E-Worker-Id': workerId },
      });

      expect(res.statusCode).toBe(204);
      expect(pgTransaction).toHaveBeenCalledOnce();
      expect(pgQuery).not.toHaveBeenCalled();
      const userId = WORKER_USER_IDS[workerId];
      expect(mockClient.query).toHaveBeenNthCalledWith(
        1,
        'DELETE FROM bookmarks              WHERE user_id   = $1',
        [userId],
      );
      expect(mockClient.query).toHaveBeenNthCalledWith(
        2,
        'DELETE FROM votes                  WHERE user_id   = $1',
        [userId],
      );
      expect(mockClient.query).toHaveBeenNthCalledWith(
        3,
        'DELETE FROM user_tag_subscriptions WHERE user_id   = $1',
        [userId],
      );
      expect(mockClient.query).toHaveBeenNthCalledWith(
        4,
        'DELETE FROM comments               WHERE author_id = $1',
        [userId],
      );
      // WU5b 5.12: cf_stream_webhook_events purge precedes posts so the
      // post_videos join still resolves.
      expect(mockClient.query).toHaveBeenNthCalledWith(
        5,
        expect.stringMatching(
          /DELETE FROM cf_stream_webhook_events[\s\S]*WHERE cf_uid IN[\s\S]*post_videos[\s\S]*SELECT id FROM posts WHERE author_id = \$1/,
        ),
        [userId],
      );
      expect(mockClient.query).toHaveBeenNthCalledWith(
        6,
        'DELETE FROM posts                  WHERE author_id = $1',
        [userId],
      );
      expect(mockClient.query).toHaveBeenCalledTimes(6);
      await app.close();
    });
  }

  it("emits audit log with route='worker-scoped' on success", async () => {
    const mockClient = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    const pgTransaction = vi.fn(
      async (
        fn: (client: {
          query: (sql: string, params?: unknown[]) => Promise<unknown>;
        }) => Promise<unknown>,
      ) => fn(mockClient),
    );
    const app = await buildAppWithTestRoutes({
      pgQuery: vi.fn(async () => undefined),
      pgTransaction,
    });
    const logSpy = vi.spyOn(app.log, 'info');

    const res = await app.inject({
      method: 'POST',
      url: '/api/__test__/reset',
      headers: { 'X-E2E-Secret': 'test', 'X-E2E-Worker-Id': '2' },
    });

    expect(res.statusCode).toBe(204);
    const auditCall = logSpy.mock.calls.find((args) =>
      /worker-scoped reset completed/i.test(String(args[1] ?? '')),
    );
    expect(auditCall, 'expected a "worker-scoped reset completed" log line').toBeDefined();
    if (!auditCall) throw new Error('unreachable');
    const payload = auditCall[0] as {
      route: unknown;
      workerId: unknown;
      userId: unknown;
      ts: unknown;
    };
    expect(payload.route).toBe('worker-scoped');
    expect(payload.workerId).toBe('2');
    expect(payload.userId).toBe(WORKER_USER_IDS['2']);
    expect(typeof payload.ts).toBe('number');
    await app.close();
  });

  const INVALID_HEADERS = [
    '4',
    '-1',
    'abc',
    '',
    '00',
    ' 0 ',
    '0\n',
    '０',
    '__proto__',
    'constructor',
    'toString',
  ];
  for (const value of INVALID_HEADERS) {
    it(`rejects X-E2E-Worker-Id: ${JSON.stringify(value)} with 400 INVALID_WORKER_ID`, async () => {
      const pgTransaction = vi.fn();
      const pgQuery = vi.fn(async () => undefined);
      const app = await buildAppWithTestRoutes({ pgQuery, pgTransaction });
      const logSpy = vi.spyOn(app.log, 'warn');

      const res = await app.inject({
        method: 'POST',
        url: '/api/__test__/reset',
        headers: { 'X-E2E-Secret': 'test', 'X-E2E-Worker-Id': value },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json() as { error: string; code: string; received: string };
      expect(body.code).toBe('INVALID_WORKER_ID');
      expect(body.error).toBe('X-E2E-Worker-Id must be one of "0", "1", "2", "3"');
      expect(body.received).toBe(value.slice(0, 16));
      expect(pgTransaction).not.toHaveBeenCalled();
      expect(pgQuery).not.toHaveBeenCalled();
      // warn-level audit log on rejection
      const rejectCall = logSpy.mock.calls.find((args) =>
        /worker-scoped reset rejected/i.test(String(args[1] ?? '')),
      );
      expect(rejectCall, 'expected a "worker-scoped reset rejected" log line').toBeDefined();
      if (!rejectCall) throw new Error('unreachable');
      const payload = rejectCall[0] as { route: unknown; received: unknown };
      expect(payload.route).toBe('worker-scoped-reject');
      expect(payload.received).toBe(value.slice(0, 16));
      await app.close();
    });
  }

  it('falls through to legacy path when X-E2E-Worker-Id is an array (duplicate header)', async () => {
    // Node's HTTP parser may surface duplicate header lines as an array on
    // request.headers. light-my-request joins arrays into a comma-separated
    // string, so we install a preHandler that forces the array shape to
    // exercise the `typeof raw === 'string'` defensive guard directly.
    const pgQuery = vi.fn(async () => undefined);
    const pgTransaction = vi.fn();
    const app = Fastify();
    app.addHook('preHandler', async (request) => {
      if (request.url === '/api/__test__/reset') {
        (request.headers as Record<string, string | string[]>)['x-e2e-worker-id'] = ['0', '1'];
      }
    });
    await registerTestRoutes(app, {
      env: { ENABLE_TEST_ROUTES: '1', NODE_ENV: 'test' },
      secret: 'test',
      isCI: true,
      host: '127.0.0.1',
      pgQuery,
      pgTransaction,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/__test__/reset',
      headers: { 'X-E2E-Secret': 'test' },
    });

    expect(res.statusCode).toBe(204);
    expect(pgTransaction).not.toHaveBeenCalled();
    // Legacy path: advisory lock + seed + unlock
    expect(pgQuery).toHaveBeenCalledWith(expect.stringContaining('pg_advisory_lock'));
    expect(pgQuery).toHaveBeenCalledWith(expect.stringContaining('pg_advisory_unlock'));
    await app.close();
  });

  it('returns 403 (Origin guard runs first) even with valid X-E2E-Worker-Id and Origin header', async () => {
    const pgTransaction = vi.fn();
    const pgQuery = vi.fn(async () => undefined);
    const app = await buildAppWithTestRoutes({ pgQuery, pgTransaction });

    const res = await app.inject({
      method: 'POST',
      url: '/api/__test__/reset',
      headers: {
        'X-E2E-Secret': 'test',
        'X-E2E-Worker-Id': '0',
        Origin: 'http://evil.example',
      },
    });

    expect(res.statusCode).toBe(403);
    expect(pgTransaction).not.toHaveBeenCalled();
    expect(pgQuery).not.toHaveBeenCalled();
    await app.close();
  });

  it('returns 403 (secret guard runs first) even with valid X-E2E-Worker-Id and bad secret', async () => {
    const pgTransaction = vi.fn();
    const pgQuery = vi.fn(async () => undefined);
    const app = await buildAppWithTestRoutes({ pgQuery, pgTransaction });

    const res = await app.inject({
      method: 'POST',
      url: '/api/__test__/reset',
      headers: { 'X-E2E-Secret': 'wrong', 'X-E2E-Worker-Id': '0' },
    });

    expect(res.statusCode).toBe(403);
    expect(pgTransaction).not.toHaveBeenCalled();
    expect(pgQuery).not.toHaveBeenCalled();
    await app.close();
  });

  it('runs ROLLBACK on the same client when a DELETE throws (real withTransaction)', async () => {
    // Use the REAL withTransaction helper from db/connection.ts — `pg` is
    // mocked at module-load time so getPool() returns a Pool whose connect()
    // yields our spied client. Asserts BEGIN, the failing DELETE, and
    // ROLLBACK all happen on the same client (no COMMIT).
    const { withTransaction, closePool } = await import('../../db/connection.js');
    // Reset between tests since the pool is a module-level singleton.
    await closePool();
    mockClientForRollback.query.mockReset();
    mockClientForRollback.release.mockReset();
    mockClientForRollback.query.mockImplementation(async (sql: string) => {
      if (sql.startsWith('DELETE FROM user_tag_subscriptions')) {
        throw new Error('boom');
      }
      return { rows: [] };
    });

    const app = await buildAppWithTestRoutes({
      pgQuery: vi.fn(async () => undefined),
      pgTransaction: withTransaction,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/__test__/reset',
      headers: { 'X-E2E-Secret': 'test', 'X-E2E-Worker-Id': '0' },
    });

    expect(res.statusCode).toBe(500);
    expect(mockClientForRollback.query).toHaveBeenCalledWith('BEGIN');
    expect(mockClientForRollback.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockClientForRollback.query).not.toHaveBeenCalledWith('COMMIT');
    expect(mockClientForRollback.release).toHaveBeenCalledTimes(1);
    await app.close();
    await closePool();
  });

  it('legacy path: no X-E2E-Worker-Id header → global TRUNCATE + advisory lock', async () => {
    const pgQuery = vi.fn(async () => undefined);
    const pgTransaction = vi.fn();
    const app = await buildAppWithTestRoutes({ pgQuery, pgTransaction });

    const res = await app.inject({
      method: 'POST',
      url: '/api/__test__/reset',
      headers: { 'X-E2E-Secret': 'test' },
    });

    expect(res.statusCode).toBe(204);
    expect(pgTransaction).not.toHaveBeenCalled();
    expect(pgQuery).toHaveBeenCalledWith(expect.stringContaining('pg_advisory_lock'));
    expect(pgQuery).toHaveBeenCalledWith(expect.stringContaining('pg_advisory_unlock'));
    await app.close();
  });

  it('clears cf_stream_webhook_events rows for the workers posts (WU5b 5.12)', async () => {
    const mockClient = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    const pgTransaction = vi.fn(
      async (
        fn: (client: {
          query: (sql: string, params?: unknown[]) => Promise<unknown>;
        }) => Promise<unknown>,
      ) => fn(mockClient),
    );
    const app = await buildAppWithTestRoutes({
      pgQuery: vi.fn(async () => undefined),
      pgTransaction,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/__test__/reset',
      headers: { 'X-E2E-Secret': 'test', 'X-E2E-Worker-Id': '0' },
    });

    expect(res.statusCode).toBe(204);
    const userId = WORKER_USER_IDS['0'];
    // Must run BEFORE posts so the join still resolves.
    const calls = mockClient.query.mock.calls.map((c) => c[0] as string);
    const idxWebhook = calls.findIndex((sql) => /cf_stream_webhook_events/.test(sql));
    const idxPosts = calls.findIndex((sql) => /DELETE FROM posts\s/.test(sql));
    expect(idxWebhook).toBeGreaterThanOrEqual(0);
    expect(idxPosts).toBeGreaterThanOrEqual(0);
    expect(idxWebhook).toBeLessThan(idxPosts);
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringMatching(/cf_stream_webhook_events/),
      [userId],
    );
    await app.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/__test__/cf-stream/advance (WU5b 5.11)
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/__test__/cf-stream/advance', () => {
  async function buildAdvanceApp(opts: {
    secret?: string;
    isCI?: boolean;
    nodeEnv?: string;
    enableTestRoutes?: string;
    host?: string;
    cf?: {
      simulateLifecycle: ReturnType<typeof vi.fn>;
    };
    pipeline?: object;
  }) {
    const app = Fastify();
    await registerTestRoutes(app, {
      env: {
        ENABLE_TEST_ROUTES: opts.enableTestRoutes ?? '1',
        NODE_ENV: opts.nodeEnv ?? 'test',
      },
      secret: opts.secret ?? 'test',
      isCI: opts.isCI ?? true,
      host: opts.host ?? '127.0.0.1',
      pgQuery: vi.fn(async () => undefined),
      pgTransaction: vi.fn(),
      cloudflareStream: (opts.cf ?? {
        simulateLifecycle: vi.fn(async () => undefined),
      }) as never,
      videoPipeline: (opts.pipeline ?? {
        handleWebhook: vi.fn(async () => undefined),
      }) as never,
    });
    return app;
  }

  it('happy path: 204 and invokes simulateLifecycle', async () => {
    const simulateLifecycle = vi.fn(async () => undefined);
    const pipeline = { handleWebhook: vi.fn(async () => undefined) };
    const app = await buildAdvanceApp({ cf: { simulateLifecycle }, pipeline });

    const res = await app.inject({
      method: 'POST',
      url: '/api/__test__/cf-stream/advance',
      headers: { 'X-E2E-Secret': 'test', 'content-type': 'application/json' },
      payload: { cfUid: 'cf-mock-1', toState: 'ready' },
    });

    expect(res.statusCode).toBe(204);
    expect(simulateLifecycle).toHaveBeenCalledWith('cf-mock-1', { handler: pipeline });
    await app.close();
  });

  it('returns 403 when X-E2E-Secret is missing', async () => {
    const app = await buildAdvanceApp({});
    const res = await app.inject({
      method: 'POST',
      url: '/api/__test__/cf-stream/advance',
      headers: { 'content-type': 'application/json' },
      payload: { cfUid: 'cf-mock-1', toState: 'ready' },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('returns 403 when X-E2E-Secret is wrong (timingSafeEqual)', async () => {
    const app = await buildAdvanceApp({});
    const res = await app.inject({
      method: 'POST',
      url: '/api/__test__/cf-stream/advance',
      headers: { 'X-E2E-Secret': 'wrong', 'content-type': 'application/json' },
      payload: { cfUid: 'cf-mock-1', toState: 'ready' },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('returns 403 when an Origin header is present', async () => {
    const app = await buildAdvanceApp({});
    const res = await app.inject({
      method: 'POST',
      url: '/api/__test__/cf-stream/advance',
      headers: {
        'X-E2E-Secret': 'test',
        Origin: 'http://evil.example',
        'content-type': 'application/json',
      },
      payload: { cfUid: 'cf-mock-1', toState: 'ready' },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('returns 400 when body is invalid', async () => {
    const simulateLifecycle = vi.fn(async () => undefined);
    const app = await buildAdvanceApp({ cf: { simulateLifecycle } });
    const res = await app.inject({
      method: 'POST',
      url: '/api/__test__/cf-stream/advance',
      headers: { 'X-E2E-Secret': 'test', 'content-type': 'application/json' },
      payload: { cfUid: 'cf-mock-1', toState: 'not-ready' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('INVALID_ADVANCE_BODY');
    expect(simulateLifecycle).not.toHaveBeenCalled();
    await app.close();
  });

  it('returns 400 when body is null (exercises ?? {} fallback)', async () => {
    const simulateLifecycle = vi.fn(async () => undefined);
    const app = await buildAdvanceApp({ cf: { simulateLifecycle } });
    const res = await app.inject({
      method: 'POST',
      url: '/api/__test__/cf-stream/advance',
      headers: { 'X-E2E-Secret': 'test' },
      // No body sent — Fastify gives `null` to request.body
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('INVALID_ADVANCE_BODY');
    expect(simulateLifecycle).not.toHaveBeenCalled();
    await app.close();
  });

  it('returns 503 when mock cf service or pipeline is not wired', async () => {
    // No cloudflareStream/videoPipeline passed → endpoint reports unavailable.
    const app = Fastify();
    await registerTestRoutes(app, {
      env: { ENABLE_TEST_ROUTES: '1', NODE_ENV: 'test' },
      secret: 'test',
      isCI: true,
      host: '127.0.0.1',
      pgQuery: vi.fn(async () => undefined),
      pgTransaction: vi.fn(),
      // omit cloudflareStream + videoPipeline
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/__test__/cf-stream/advance',
      headers: { 'X-E2E-Secret': 'test', 'content-type': 'application/json' },
      payload: { cfUid: 'cf-mock-1', toState: 'ready' },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().code).toBe('CF_STREAM_ADVANCE_UNAVAILABLE');
    await app.close();
  });

  it('does NOT register when ENABLE_TEST_ROUTES is unset (route is 404)', async () => {
    const app = Fastify();
    await registerTestRoutes(app, {
      env: {},
      secret: 'test',
      isCI: true,
      host: '127.0.0.1',
      pgQuery: vi.fn(async () => undefined),
      pgTransaction: vi.fn(),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/__test__/cf-stream/advance',
      headers: { 'X-E2E-Secret': 'test', 'content-type': 'application/json' },
      payload: { cfUid: 'cf-mock-1', toState: 'ready' },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('does NOT register when NODE_ENV=production (route is 404)', async () => {
    const app = Fastify();
    await registerTestRoutes(app, {
      env: { ENABLE_TEST_ROUTES: '1', NODE_ENV: 'production' },
      secret: 'test',
      isCI: true,
      host: '127.0.0.1',
      pgQuery: vi.fn(async () => undefined),
      pgTransaction: vi.fn(),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/__test__/cf-stream/advance',
      headers: { 'X-E2E-Secret': 'test', 'content-type': 'application/json' },
      payload: { cfUid: 'cf-mock-1', toState: 'ready' },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
