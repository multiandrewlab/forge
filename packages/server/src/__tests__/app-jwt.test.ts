import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';

// Set env var so app.ts registers the (mocked) storage plugin path is skipped
// (we don't need MINIO here; leave it unset so storage block is skipped).

vi.mock('../db/queries/post-files.js', () => ({
  findStaleStagedFiles: vi.fn().mockResolvedValue([]),
  deleteStagedFilesByIds: vi.fn().mockResolvedValue(0),
}));

describe('buildApp — JWT hardening', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it('throws when JWT_SECRET is unset and NODE_ENV is not "test"', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;

    const { buildApp } = await import('../app.js');

    await expect(buildApp()).rejects.toThrow(
      'JWT_SECRET environment variable is required outside test environments',
    );
  });

  it('builds successfully when NODE_ENV=test even without JWT_SECRET', async () => {
    process.env.NODE_ENV = 'test';
    delete process.env.JWT_SECRET;

    const { buildApp } = await import('../app.js');

    const app = await buildApp();
    try {
      await app.ready();
      expect(app).toBeDefined();
    } finally {
      await app.close();
    }
  });
});
