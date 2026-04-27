import { describe, it, expect, afterEach, vi } from 'vitest';
import { buildApp } from '../app.js';

vi.mock('../db/queries/post-files.js', () => ({
  cleanupStagedFiles: vi.fn().mockResolvedValue(0),
}));

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

  describe('onReady staged file cleanup', () => {
    it('calls cleanupStagedFiles on ready', async () => {
      const { cleanupStagedFiles } = await import('../db/queries/post-files.js');

      app = await buildApp();
      await app.ready();

      expect(cleanupStagedFiles).toHaveBeenCalled();
    });

    it('logs info when orphaned files are cleaned', async () => {
      const { cleanupStagedFiles } = await import('../db/queries/post-files.js');
      vi.mocked(cleanupStagedFiles).mockResolvedValue(5);

      app = await buildApp();
      // Spy on the logger before ready triggers the hook
      const infoSpy = vi.spyOn(app.log, 'info');
      await app.ready();

      expect(cleanupStagedFiles).toHaveBeenCalled();
      expect(infoSpy).toHaveBeenCalledWith(
        { count: 5 },
        'Cleaned up orphaned staged files',
      );
    });

    it('does not fail server startup if cleanup errors', async () => {
      const { cleanupStagedFiles } = await import('../db/queries/post-files.js');
      vi.mocked(cleanupStagedFiles).mockRejectedValue(new Error('DB down'));

      app = await buildApp();
      // Spy on the logger before ready triggers the hook
      const warnSpy = vi.spyOn(app.log, 'warn');
      await app.ready();

      // Server should still be ready despite cleanup failure
      expect(app).toBeDefined();
      expect(warnSpy).toHaveBeenCalledWith(
        { err: expect.any(Error) },
        'Failed to clean up staged files',
      );
    });
  });
});
