import { describe, it, expect, afterEach } from 'vitest';
import Fastify from 'fastify';
import fp from 'fastify-plugin';
import { langchainPlugin } from '../../../plugins/langchain/index.js';
import { mockScriptStorage } from '../../../plugins/langchain/mock-provider.js';

// Dummy authenticate that attaches a fixed user
const fakeAuth = async (req: { user?: unknown }) => {
  (req as { user: { id: string } }).user = { id: 'u1' };
};

// Fake auth-plugin that satisfies the dependency requirement
const fakeAuthPlugin = fp(
  async (app) => {
    app.decorate('authenticate', fakeAuth as never);
  },
  { name: 'auth-plugin' },
);

function buildFake() {
  const app = Fastify();
  return app;
}

describe('langchainPlugin', () => {
  it('decorates app with aiProvider, aiRateLimit, aiGate', async () => {
    const app = buildFake();
    await app.register(fakeAuthPlugin);
    await app.register(langchainPlugin);
    await app.ready();
    expect(typeof (app as unknown as { aiProvider: unknown }).aiProvider).toBe('function');
    expect(typeof (app as unknown as { aiRateLimit: unknown }).aiRateLimit).toBe('function');
    expect(Array.isArray((app as unknown as { aiGate: unknown }).aiGate)).toBe(true);
    await app.close();
  });

  it('aiRateLimit returns 401 when request.user is not set (defensive guard)', async () => {
    const app = buildFake();
    await app.register(fakeAuthPlugin);
    await app.register(langchainPlugin);

    // Register a route that uses aiRateLimit DIRECTLY, bypassing authenticate,
    // so request.user stays undefined and the defensive 401 branch fires.
    const rateLimitOnly = (app as unknown as { aiRateLimit: never }).aiRateLimit;
    app.get('/unauth', { preHandler: rateLimitOnly }, async () => ({ ok: true }));

    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/unauth' });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body)).toEqual({ error: 'unauthorized' });
    await app.close();
  });

  it('onError hook releases the slot so a later request succeeds', async () => {
    const app = buildFake();
    await app.register(fakeAuthPlugin);
    await app.register(langchainPlugin);

    app.get('/boom', { preHandler: (app as unknown as { aiGate: never }).aiGate }, async () => {
      // Throw after aiGate has attached request.aiSlot, so onError releases it.
      throw new Error('kaboom');
    });

    await app.ready();
    const first = await app.inject({ method: 'GET', url: '/boom' });
    expect(first.statusCode).toBe(500);

    // If onError didn't release, a second request would 429. It should 500 again.
    const second = await app.inject({ method: 'GET', url: '/boom' });
    expect(second.statusCode).toBe(500);
    await app.close();
  });

  it('decorates app with aiAcquire function', async () => {
    const app = buildFake();
    await app.register(fakeAuthPlugin);
    await app.register(langchainPlugin);
    await app.ready();
    expect(typeof (app as unknown as { aiAcquire: unknown }).aiAcquire).toBe('function');
    await app.close();
  });

  it('aiAcquire returns a slot with release function for a user id', async () => {
    const app = buildFake();
    await app.register(fakeAuthPlugin);
    await app.register(langchainPlugin);
    await app.ready();
    const aiAcquire = (
      app as unknown as { aiAcquire: (userId: string) => { release: () => void } | null }
    ).aiAcquire;
    const slot = aiAcquire('user-abc');
    expect(slot).not.toBeNull();
    const acquired = slot as { release: () => void };
    expect(typeof acquired.release).toBe('function');
    acquired.release();
    await app.close();
  });

  it('aiAcquire returns null when a slot is already held for the same user', async () => {
    const app = buildFake();
    await app.register(fakeAuthPlugin);
    await app.register(langchainPlugin);
    await app.ready();
    const aiAcquire = (
      app as unknown as { aiAcquire: (userId: string) => { release: () => void } | null }
    ).aiAcquire;
    const slot1 = aiAcquire('user-xyz');
    expect(slot1).not.toBeNull();
    const slot2 = aiAcquire('user-xyz');
    expect(slot2).toBeNull();
    (slot1 as { release: () => void }).release();
    await app.close();
  });

  it('aiRateLimit attaches a slot on first call and rejects second concurrent', async () => {
    const app = buildFake();
    await app.register(fakeAuthPlugin);
    await app.register(langchainPlugin);

    // Stash slot references so we can release manually and prevent onResponse cleanup
    const stashedSlots: Array<{ release: () => void }> = [];

    app.get('/t', { preHandler: (app as unknown as { aiGate: never }).aiGate }, async (req) => {
      const typedReq = req as unknown as { aiSlot?: { release: () => void } };
      const slot = typedReq.aiSlot;
      expect(slot).toBeDefined();
      // Stash the slot and clear it from request so onResponse hook doesn't auto-release
      stashedSlots.push(slot as { release: () => void });
      typedReq.aiSlot = undefined;
      return { ok: true };
    });

    await app.ready();
    const first = await app.inject({ method: 'GET', url: '/t' });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({ method: 'GET', url: '/t' });
    expect(second.statusCode).toBe(429);
    expect(second.headers['retry-after']).toBe('5');

    // Release the stashed slot from the first request
    stashedSlots[0].release();

    // Now a third request should succeed since the slot was released
    const third = await app.inject({ method: 'GET', url: '/t' });
    expect(third.statusCode).toBe(200);

    // Clean up remaining stashed slots
    for (const s of stashedSlots) s.release();
    await app.close();
  });
});

describe('mockScriptHeaderHook', () => {
  const originalProvider = process.env.LLM_PROVIDER;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (originalProvider === undefined) {
      delete process.env.LLM_PROVIDER;
    } else {
      process.env.LLM_PROVIDER = originalProvider;
    }
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
    // Clear any AsyncLocalStorage state that leaked from enterWith() in test handlers
    mockScriptStorage.disable();
  });

  it('threads X-Mock-Script header through mockScriptStorage when LLM_PROVIDER=mock', async () => {
    process.env.LLM_PROVIDER = 'mock';
    process.env.NODE_ENV = 'test';

    const app = Fastify();
    await app.register(fakeAuthPlugin);
    await app.register(langchainPlugin);

    let observed: string | undefined;
    app.get('/__test_observe', async () => {
      observed = mockScriptStorage.getStore();
      return { ok: true };
    });

    await app.ready();
    const res = await app.inject({
      method: 'GET',
      url: '/__test_observe',
      headers: { 'x-mock-script': 'autocomplete-typescript-react' },
    });
    expect(res.statusCode).toBe(200);
    expect(observed).toBe('autocomplete-typescript-react');
    await app.close();
  });

  it('does not register the hook when LLM_PROVIDER is not mock', async () => {
    process.env.LLM_PROVIDER = 'openai';
    process.env.NODE_ENV = 'test';

    const app = Fastify();
    await app.register(fakeAuthPlugin);
    await app.register(langchainPlugin);

    let observed: string | undefined = 'sentinel';
    app.get('/__test_observe', async () => {
      observed = mockScriptStorage.getStore();
      return { ok: true };
    });

    await app.ready();
    const res = await app.inject({
      method: 'GET',
      url: '/__test_observe',
      headers: { 'x-mock-script': 'autocomplete-typescript-react' },
    });
    expect(res.statusCode).toBe(200);
    expect(observed).toBeUndefined();
    await app.close();
  });
});
