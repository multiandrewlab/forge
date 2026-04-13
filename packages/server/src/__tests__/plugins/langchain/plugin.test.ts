import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import fp from 'fastify-plugin';
import { langchainPlugin } from '../../../plugins/langchain/index.js';

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
