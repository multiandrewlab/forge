import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

vi.mock('pg', () => {
  const mockQuery = vi.fn();
  const mockEnd = vi.fn();
  const MockPool = vi.fn(() => ({
    query: mockQuery,
    end: mockEnd,
  }));
  return { default: { Pool: MockPool }, Pool: MockPool };
});

import pg from 'pg';
import { getPool, closePool, query } from '../../db/connection.js';

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
});
