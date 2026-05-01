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

import { registerTestRoutes, E2E_RESET_LOCK_ID } from '../../routes/__test__.js';

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
