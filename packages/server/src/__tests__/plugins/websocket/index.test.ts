import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import { authPlugin } from '../../../plugins/auth.js';
import { websocketPlugin } from '../../../plugins/websocket/index.js';

describe('websocketPlugin', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('decorates the app with websocket.connections, websocket.channels, and websocket.presence', async () => {
    const app = Fastify({ logger: false });
    await app.register(cors);
    await app.register(cookie);
    await app.register(jwt, { secret: 'test-secret' });
    await app.register(authPlugin);
    await app.register(websocketPlugin);

    await app.ready();

    expect(app.websocket).toBeDefined();
    expect(app.websocket.connections).toBeDefined();
    expect(app.websocket.channels).toBeDefined();
    expect(app.websocket.presence).toBeDefined();

    await app.close();
  });

  it('registers a /ws WebSocket route accessible via injectWS', async () => {
    const app = Fastify({ logger: false });
    await app.register(cors);
    await app.register(cookie);
    await app.register(jwt, { secret: 'test-secret' });
    await app.register(authPlugin);
    await app.register(websocketPlugin);

    await app.ready();

    // injectWS is provided by @fastify/websocket for testing WebSocket routes
    // It returns a WebSocket connected to the /ws route
    const ws = await app.injectWS('/ws');

    expect(ws).toBeDefined();
    expect(ws.readyState).toBe(1); // OPEN

    ws.close();
    await app.close();
  });

  it('clears the presence eviction interval on app close', async () => {
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

    const app = Fastify({ logger: false });
    await app.register(cors);
    await app.register(cookie);
    await app.register(jwt, { secret: 'test-secret' });
    await app.register(authPlugin);
    await app.register(websocketPlugin);

    await app.ready();

    // clearInterval should not have been called yet
    const callsBefore = clearIntervalSpy.mock.calls.length;

    await app.close();

    // After close, clearInterval should have been called
    expect(clearIntervalSpy.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it('exposes the websocketServer decoration from @fastify/websocket', async () => {
    const app = Fastify({ logger: false });
    await app.register(cors);
    await app.register(cookie);
    await app.register(jwt, { secret: 'test-secret' });
    await app.register(authPlugin);
    await app.register(websocketPlugin);

    await app.ready();

    expect(app.websocketServer).toBeDefined();

    await app.close();
  });
});
