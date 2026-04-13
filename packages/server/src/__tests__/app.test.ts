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

  it('returns a Fastify app with the websocket decoration', async () => {
    app = await buildApp();
    await app.ready();

    expect(app.websocket).toBeDefined();
    expect(app.websocket.connections).toBeDefined();
    expect(app.websocket.channels).toBeDefined();
    expect(app.websocket.presence).toBeDefined();
  });
});
