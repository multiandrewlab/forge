import { describe, it, expect, afterEach } from 'vitest';
import { buildApp } from '../app.js';

describe('buildApp', () => {
  let app: Awaited<ReturnType<typeof buildApp>> | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it('registers playground routes under /api', async () => {
    app = await buildApp();
    await app.ready();

    // GET /api/posts/:id/variables should return 401 (not 404) without auth
    const varRes = await app.inject({
      method: 'GET',
      url: '/api/posts/00000000-0000-0000-0000-000000000001/variables',
    });
    expect(varRes.statusCode).not.toBe(404);

    // POST /api/playground/run should return 401 (not 404) without auth
    const runRes = await app.inject({
      method: 'POST',
      url: '/api/playground/run',
      payload: {},
    });
    expect(runRes.statusCode).not.toBe(404);
  });

  it('returns a Fastify app with the websocket decoration', async () => {
    app = await buildApp();
    await app.ready();

    expect(app.websocket).toBeDefined();
    expect(app.websocket.connections).toBeDefined();
    expect(app.websocket.channels).toBeDefined();
    expect(app.websocket.presence).toBeDefined();
  });
});
