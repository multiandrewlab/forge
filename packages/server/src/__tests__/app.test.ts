import { describe, it, expect, afterEach, vi } from 'vitest';

// Set env var so app.ts registers the (mocked) storage plugin
process.env.MINIO_ACCESS_KEY = 'test-key';

const mockStorageDelete = vi.fn();

vi.mock('../plugins/storage.js', async () => {
  const fp = (await import('fastify-plugin')).default;
  return {
    storagePlugin: fp(async (fastify: { decorate: (name: string, value: unknown) => void }) => {
      fastify.decorate('storage', {
        upload: vi.fn(),
        copy: vi.fn(),
        getSignedUrl: vi.fn(),
        delete: mockStorageDelete,
        exists: vi.fn(),
      });
    }),
  };
});

vi.mock('../db/queries/post-files.js', () => ({
  findStaleStagedFiles: vi.fn().mockResolvedValue([]),
  deleteStagedFilesByIds: vi.fn().mockResolvedValue(0),
}));

import { buildApp } from '../app.js';

describe('buildApp', () => {
  let app: Awaited<ReturnType<typeof buildApp>> | undefined;

  afterEach(async () => {
    vi.clearAllMocks();
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
    it('calls findStaleStagedFiles on ready', async () => {
      const { findStaleStagedFiles } = await import('../db/queries/post-files.js');

      app = await buildApp();
      await app.ready();

      expect(findStaleStagedFiles).toHaveBeenCalled();
    });

    it('logs info and deletes DB rows when orphaned files are cleaned', async () => {
      const { findStaleStagedFiles, deleteStagedFilesByIds } =
        await import('../db/queries/post-files.js');
      const staleFile = {
        id: 'ff000000-0000-0000-0000-000000000001',
        post_id: 'pp000000-0000-0000-0000-000000000001',
        revision_id: null,
        filename: 'old.ts',
        content: null,
        storage_key: null,
        mime_type: 'text/plain',
        sort_order: 0,
        file_size: null,
        created_at: new Date('2025-01-01'),
      };
      vi.mocked(findStaleStagedFiles).mockResolvedValue([staleFile]);
      vi.mocked(deleteStagedFilesByIds).mockResolvedValue(1);

      app = await buildApp();
      const infoSpy = vi.spyOn(app.log, 'info');
      await app.ready();

      expect(findStaleStagedFiles).toHaveBeenCalled();
      expect(deleteStagedFilesByIds).toHaveBeenCalledWith([staleFile.id]);
      expect(infoSpy).toHaveBeenCalledWith({ count: 1 }, 'Cleaned up orphaned staged files');
    });

    it('deletes storage objects for stale files with storage_key', async () => {
      const { findStaleStagedFiles, deleteStagedFilesByIds } =
        await import('../db/queries/post-files.js');
      const staleFileWithStorage = {
        id: 'ff000000-0000-0000-0000-000000000002',
        post_id: 'pp000000-0000-0000-0000-000000000001',
        revision_id: null,
        filename: 'photo.png',
        content: null,
        storage_key: 'staging/user/file/photo.png',
        mime_type: 'image/png',
        sort_order: 0,
        file_size: 100000,
        created_at: new Date('2025-01-01'),
      };
      vi.mocked(findStaleStagedFiles).mockResolvedValue([staleFileWithStorage]);
      vi.mocked(deleteStagedFilesByIds).mockResolvedValue(1);
      mockStorageDelete.mockResolvedValueOnce(undefined);

      app = await buildApp();
      await app.ready();

      expect(mockStorageDelete).toHaveBeenCalledWith('staging/user/file/photo.png');
      expect(deleteStagedFilesByIds).toHaveBeenCalledWith([staleFileWithStorage.id]);
    });

    it('continues cleanup when storage.delete fails (best-effort)', async () => {
      const { findStaleStagedFiles, deleteStagedFilesByIds } =
        await import('../db/queries/post-files.js');
      const staleFileWithStorage = {
        id: 'ff000000-0000-0000-0000-000000000003',
        post_id: 'pp000000-0000-0000-0000-000000000001',
        revision_id: null,
        filename: 'big.bin',
        content: null,
        storage_key: 'staging/user/file/big.bin',
        mime_type: 'application/octet-stream',
        sort_order: 0,
        file_size: 200000,
        created_at: new Date('2025-01-01'),
      };
      vi.mocked(findStaleStagedFiles).mockResolvedValue([staleFileWithStorage]);
      vi.mocked(deleteStagedFilesByIds).mockResolvedValue(1);
      mockStorageDelete.mockRejectedValueOnce(new Error('Storage unavailable'));

      app = await buildApp();
      const warnSpy = vi.spyOn(app.log, 'warn');
      await app.ready();

      // storage.delete failed but DB rows still cleaned up
      expect(mockStorageDelete).toHaveBeenCalledWith('staging/user/file/big.bin');
      expect(deleteStagedFilesByIds).toHaveBeenCalledWith([staleFileWithStorage.id]);
      expect(warnSpy).toHaveBeenCalledWith(
        { storageKey: 'staging/user/file/big.bin' },
        'Failed to delete stale storage object',
      );
    });

    it('skips storage deletion for stale files without storage_key', async () => {
      const { findStaleStagedFiles, deleteStagedFilesByIds } =
        await import('../db/queries/post-files.js');
      const inlineStaleFile = {
        id: 'ff000000-0000-0000-0000-000000000004',
        post_id: 'pp000000-0000-0000-0000-000000000001',
        revision_id: null,
        filename: 'small.ts',
        content: 'const x = 1;',
        storage_key: null,
        mime_type: 'text/plain',
        sort_order: 0,
        file_size: 12,
        created_at: new Date('2025-01-01'),
      };
      vi.mocked(findStaleStagedFiles).mockResolvedValue([inlineStaleFile]);
      vi.mocked(deleteStagedFilesByIds).mockResolvedValue(1);

      app = await buildApp();
      await app.ready();

      // storage.delete should NOT be called for inline files
      expect(mockStorageDelete).not.toHaveBeenCalled();
      expect(deleteStagedFilesByIds).toHaveBeenCalledWith([inlineStaleFile.id]);
    });

    it('does not fail server startup if cleanup errors', async () => {
      const { findStaleStagedFiles } = await import('../db/queries/post-files.js');
      vi.mocked(findStaleStagedFiles).mockRejectedValue(new Error('DB down'));

      app = await buildApp();
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

describe('app — test routes', () => {
  let app: Awaited<ReturnType<typeof buildApp>> | undefined;
  const originalEnv = { ...process.env };

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it('registers /api/__test__/reset (returns 403 at secret gate) when ENABLE_TEST_ROUTES=1', async () => {
    process.env.ENABLE_TEST_ROUTES = '1';
    process.env.NODE_ENV = 'test';
    process.env.HOST = '127.0.0.1';
    process.env.E2E_SECRET = 'app-test-secret';

    const { buildApp: buildAppFresh } = await import('../app.js');
    app = await buildAppFresh();
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/__test__/reset',
    });

    expect(res.statusCode).toBe(403);
  });

  it('does NOT register /api/__test__/reset (returns 404) when ENABLE_TEST_ROUTES is unset', async () => {
    delete process.env.ENABLE_TEST_ROUTES;
    process.env.NODE_ENV = 'test';

    const { buildApp: buildAppFresh } = await import('../app.js');
    app = await buildAppFresh();
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/__test__/reset',
    });

    expect(res.statusCode).toBe(404);
  });

  it('registers /api/__test__/reset with default fallbacks when E2E_SECRET, HOST unset and CI=true', async () => {
    process.env.ENABLE_TEST_ROUTES = '1';
    process.env.NODE_ENV = 'test';
    process.env.CI = 'true';
    delete process.env.HOST;
    delete process.env.E2E_SECRET;

    const { buildApp: buildAppFresh } = await import('../app.js');
    app = await buildAppFresh();
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/__test__/reset',
    });

    expect(res.statusCode).toBe(403);
  });

  it('wires pgQuery through db/connection.query when reset succeeds', async () => {
    process.env.ENABLE_TEST_ROUTES = '1';
    process.env.NODE_ENV = 'test';
    process.env.HOST = '127.0.0.1';
    process.env.E2E_SECRET = 'app-test-secret';

    vi.doMock('../db/connection.js', () => ({
      query: vi.fn().mockResolvedValue({ rows: [] }),
      // app.ts imports withTransaction for the worker-scoped reset path; the
      // legacy pgQuery test below does not exercise the worker-scoped branch
      // but the import must still resolve, so a no-op mock is sufficient.
      withTransaction: vi.fn(),
    }));

    const { buildApp: buildAppFresh } = await import('../app.js');
    const { query: mockedQuery } = await import('../db/connection.js');
    app = await buildAppFresh();
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/__test__/reset',
      headers: { 'X-E2E-Secret': 'app-test-secret' },
    });

    expect(res.statusCode).toBe(204);
    // Lock + seed + unlock = 3 calls; proves the inline pgQuery callback ran.
    expect(mockedQuery).toHaveBeenCalledTimes(3);
    vi.doUnmock('../db/connection.js');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WU5b 5.14: video pipeline wiring + reconciler branch
// ─────────────────────────────────────────────────────────────────────────────

describe('buildApp — video pipeline wiring (WU5b)', () => {
  let app: Awaited<ReturnType<typeof buildApp>> | undefined;
  const originalEnv = { ...process.env };

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it('decorates cloudflareStream and videoPipeline on the Fastify instance', async () => {
    const { buildApp: buildAppFresh } = await import('../app.js');
    app = await buildAppFresh();
    await app.ready();

    expect(app.cloudflareStream).toBeDefined();
    expect(app.videoPipeline).toBeDefined();
    expect(typeof app.videoPipeline.flipVisibility).toBe('function');
  });

  it('starts and stops the reconciler when NODE_ENV !== "test"', async () => {
    process.env.NODE_ENV = 'development';
    process.env.JWT_SECRET = 'dev-secret-for-test';
    // Avoid hitting any real CF endpoints — mock service is used since no
    // CF_ACCOUNT_ID is set in dev fallback.

    const { buildApp: buildAppFresh } = await import('../app.js');
    app = await buildAppFresh();
    await app.ready();
    // The reconciler interval should be active; closing the app must clear it
    // via the onClose hook (otherwise vitest hangs on open handles).
    await app.close();
    app = undefined;
  });
});
