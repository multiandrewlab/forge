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
      const { findStaleStagedFiles, deleteStagedFilesByIds } = await import('../db/queries/post-files.js');
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
      expect(infoSpy).toHaveBeenCalledWith(
        { count: 1 },
        'Cleaned up orphaned staged files',
      );
    });

    it('deletes storage objects for stale files with storage_key', async () => {
      const { findStaleStagedFiles, deleteStagedFilesByIds } = await import('../db/queries/post-files.js');
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
      const { findStaleStagedFiles, deleteStagedFilesByIds } = await import('../db/queries/post-files.js');
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
      const { findStaleStagedFiles, deleteStagedFilesByIds } = await import('../db/queries/post-files.js');
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
