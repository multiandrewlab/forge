import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

const { mockClientQuery, mockClientRelease, mockClient } = vi.hoisted(() => {
  const mockClientQuery = vi.fn();
  const mockClientRelease = vi.fn();
  const mockClient = { query: mockClientQuery, release: mockClientRelease };
  return { mockClientQuery, mockClientRelease, mockClient };
});

vi.mock('pg', () => {
  const mockQuery = vi.fn();
  const mockEnd = vi.fn();
  const mockConnect = vi.fn().mockResolvedValue(mockClient);
  const MockPool = vi.fn(() => ({
    query: mockQuery,
    end: mockEnd,
    connect: mockConnect,
  }));
  return { default: { Pool: MockPool }, Pool: MockPool };
});

import pg from 'pg';
import { getPool, closePool, query, withTransaction } from '../../db/connection.js';

const MockPool = pg.Pool as unknown as Mock;

describe('connection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    closePool();
  });

  describe('getPool', () => {
    it('creates a pool with DATABASE_URL when set', () => {
      process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/testdb';
      const pool = getPool();
      expect(MockPool).toHaveBeenCalledWith({
        connectionString: 'postgresql://test:test@localhost:5432/testdb',
      });
      expect(pool).toBeDefined();
      delete process.env.DATABASE_URL;
    });

    it('creates a pool with default connection string when DATABASE_URL not set', () => {
      delete process.env.DATABASE_URL;
      const pool = getPool();
      expect(MockPool).toHaveBeenCalledWith({
        connectionString: 'postgresql://forge:forge_dev@localhost:5432/forge',
      });
      expect(pool).toBeDefined();
    });

    it('returns the same pool instance on subsequent calls', () => {
      const pool1 = getPool();
      const pool2 = getPool();
      expect(pool1).toBe(pool2);
      expect(MockPool).toHaveBeenCalledTimes(1);
    });
  });

  describe('closePool', () => {
    it('ends the pool and resets it', async () => {
      const pool = getPool();
      await closePool();
      expect(pool.end).toHaveBeenCalled();
    });

    it('does nothing when no pool exists', async () => {
      await closePool();
    });
  });

  describe('query', () => {
    it('delegates to pool.query with text and params', async () => {
      const pool = getPool();
      const mockResult = { rows: [{ id: '1' }], rowCount: 1 };
      (pool.query as Mock).mockResolvedValue(mockResult);

      const result = await query('SELECT * FROM users WHERE id = $1', ['1']);

      expect(pool.query).toHaveBeenCalledWith('SELECT * FROM users WHERE id = $1', ['1']);
      expect(result).toEqual(mockResult);
    });

    it('delegates to pool.query with text only', async () => {
      const pool = getPool();
      const mockResult = { rows: [], rowCount: 0 };
      (pool.query as Mock).mockResolvedValue(mockResult);

      const result = await query('SELECT 1');

      expect(pool.query).toHaveBeenCalledWith('SELECT 1', undefined);
      expect(result).toEqual(mockResult);
    });
  });

  describe('withTransaction', () => {
    beforeEach(() => {
      mockClientQuery.mockReset();
      mockClientRelease.mockReset();
    });

    it('calls BEGIN, runs fn, calls COMMIT, releases client, and returns result', async () => {
      const expectedResult = { id: '1', name: 'test' };
      const fn = vi.fn().mockResolvedValue(expectedResult);

      const result = await withTransaction(fn);

      expect(mockClientQuery).toHaveBeenCalledWith('BEGIN');
      expect(fn).toHaveBeenCalledWith(mockClient);
      expect(mockClientQuery).toHaveBeenCalledWith('COMMIT');
      expect(mockClientRelease).toHaveBeenCalled();
      expect(result).toEqual(expectedResult);
    });

    it('calls BEGIN before fn and COMMIT after fn in correct order', async () => {
      const callOrder: string[] = [];
      mockClientQuery.mockImplementation((sql: string) => {
        callOrder.push(sql);
        return Promise.resolve();
      });
      const fn = vi.fn().mockImplementation(() => {
        callOrder.push('fn');
        return Promise.resolve('done');
      });

      await withTransaction(fn);

      expect(callOrder).toEqual(['BEGIN', 'fn', 'COMMIT']);
    });

    it('calls ROLLBACK and rethrows when fn throws', async () => {
      const error = new Error('transaction failed');
      const fn = vi.fn().mockRejectedValue(error);

      await expect(withTransaction(fn)).rejects.toThrow('transaction failed');

      expect(mockClientQuery).toHaveBeenCalledWith('BEGIN');
      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClientQuery).not.toHaveBeenCalledWith('COMMIT');
      expect(mockClientRelease).toHaveBeenCalled();
    });

    it('releases client even when ROLLBACK fails', async () => {
      const fnError = new Error('fn failed');
      const fn = vi.fn().mockRejectedValue(fnError);
      mockClientQuery.mockImplementation((sql: string) => {
        if (sql === 'ROLLBACK') return Promise.reject(new Error('rollback failed'));
        return Promise.resolve();
      });

      await expect(withTransaction(fn)).rejects.toThrow('rollback failed');

      expect(mockClientRelease).toHaveBeenCalled();
    });

    it('releases client exactly once on success', async () => {
      const fn = vi.fn().mockResolvedValue('ok');

      await withTransaction(fn);

      expect(mockClientRelease).toHaveBeenCalledTimes(1);
    });

    it('releases client exactly once on error', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fail'));

      await expect(withTransaction(fn)).rejects.toThrow('fail');

      expect(mockClientRelease).toHaveBeenCalledTimes(1);
    });
  });
});
