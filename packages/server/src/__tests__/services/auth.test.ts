import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn(),
    compare: vi.fn(),
  },
}));

import bcrypt from 'bcryptjs';
import {
  BCRYPT_ROUNDS,
  hashPassword,
  verifyPassword,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from '../../services/auth.js';

function createMockFastify() {
  return {
    jwt: {
      sign: vi.fn(),
      verify: vi.fn(),
    },
  } as const;
}

type MockFastify = ReturnType<typeof createMockFastify>;

describe('auth service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('BCRYPT_ROUNDS', () => {
    it('should be 12', () => {
      expect(BCRYPT_ROUNDS).toBe(12);
    });

    it('should be at least 12 (security minimum)', () => {
      expect(BCRYPT_ROUNDS).toBeGreaterThanOrEqual(12);
    });
  });

  describe('hashPassword', () => {
    it('should call bcrypt.hash with password and BCRYPT_ROUNDS', async () => {
      const mockHash = bcrypt.hash as ReturnType<typeof vi.fn>;
      mockHash.mockResolvedValue('hashed_password');

      const result = await hashPassword('my-password');

      expect(mockHash).toHaveBeenCalledWith('my-password', BCRYPT_ROUNDS);
      expect(result).toBe('hashed_password');
    });

    it('should propagate bcrypt errors', async () => {
      const mockHash = bcrypt.hash as ReturnType<typeof vi.fn>;
      mockHash.mockRejectedValue(new Error('bcrypt failure'));

      await expect(hashPassword('password')).rejects.toThrow('bcrypt failure');
    });
  });

  describe('verifyPassword', () => {
    it('should return true when password matches hash', async () => {
      const mockCompare = bcrypt.compare as ReturnType<typeof vi.fn>;
      mockCompare.mockResolvedValue(true);

      const result = await verifyPassword('my-password', 'stored-hash');

      expect(mockCompare).toHaveBeenCalledWith('my-password', 'stored-hash');
      expect(result).toBe(true);
    });

    it('should return false when password does not match hash', async () => {
      const mockCompare = bcrypt.compare as ReturnType<typeof vi.fn>;
      mockCompare.mockResolvedValue(false);

      const result = await verifyPassword('wrong-password', 'stored-hash');

      expect(mockCompare).toHaveBeenCalledWith('wrong-password', 'stored-hash');
      expect(result).toBe(false);
    });

    it('should propagate bcrypt errors', async () => {
      const mockCompare = bcrypt.compare as ReturnType<typeof vi.fn>;
      mockCompare.mockRejectedValue(new Error('compare failure'));

      await expect(verifyPassword('password', 'hash')).rejects.toThrow('compare failure');
    });
  });

  describe('generateAccessToken', () => {
    let mockFastify: MockFastify;

    beforeEach(() => {
      mockFastify = createMockFastify();
    });

    it('should sign JWT with user payload and 15m expiry', () => {
      const mockSign = mockFastify.jwt.sign;
      mockSign.mockReturnValue('access-token-123');

      const user = {
        id: 'user-1',
        email: 'test@example.com',
        displayName: 'Test User',
      };

      const token = generateAccessToken(mockFastify as never, user);

      expect(mockSign).toHaveBeenCalledWith(
        { id: 'user-1', email: 'test@example.com', displayName: 'Test User' },
        { expiresIn: '15m' },
      );
      expect(token).toBe('access-token-123');
    });

    it('should include all user fields in the payload', () => {
      const mockSign = mockFastify.jwt.sign;
      mockSign.mockReturnValue('token');

      const user = {
        id: 'abc-123',
        email: 'alice@forge.dev',
        displayName: 'Alice',
      };

      generateAccessToken(mockFastify as never, user);

      const payload = mockSign.mock.calls[0][0] as Record<string, unknown>;
      expect(payload).toHaveProperty('id', 'abc-123');
      expect(payload).toHaveProperty('email', 'alice@forge.dev');
      expect(payload).toHaveProperty('displayName', 'Alice');
    });
  });

  describe('generateRefreshToken', () => {
    let mockFastify: MockFastify;
    const originalEnv = process.env.JWT_REFRESH_SECRET;

    beforeEach(() => {
      mockFastify = createMockFastify();
      process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
    });

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.JWT_REFRESH_SECRET;
      } else {
        process.env.JWT_REFRESH_SECRET = originalEnv;
      }
    });

    it('should sign JWT with user id, 7d expiry, and refresh secret key', () => {
      const mockSign = mockFastify.jwt.sign;
      mockSign.mockReturnValue('refresh-token-456');

      const user = { id: 'user-1' };

      const token = generateRefreshToken(mockFastify as never, user);

      expect(mockSign).toHaveBeenCalledWith(
        { id: 'user-1' },
        { expiresIn: '7d', key: 'test-refresh-secret' },
      );
      expect(token).toBe('refresh-token-456');
    });

    it('should only include id in the payload', () => {
      const mockSign = mockFastify.jwt.sign;
      mockSign.mockReturnValue('token');

      generateRefreshToken(mockFastify as never, { id: 'user-2' });

      const payload = mockSign.mock.calls[0][0] as Record<string, unknown>;
      expect(payload).toEqual({ id: 'user-2' });
    });

    it('should throw if JWT_REFRESH_SECRET is not set', () => {
      delete process.env.JWT_REFRESH_SECRET;

      expect(() => generateRefreshToken(mockFastify as never, { id: 'user-1' })).toThrow(
        'JWT_REFRESH_SECRET environment variable is not set',
      );
    });
  });

  describe('verifyRefreshToken', () => {
    let mockFastify: MockFastify;
    const originalEnv = process.env.JWT_REFRESH_SECRET;

    beforeEach(() => {
      mockFastify = createMockFastify();
      process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
    });

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.JWT_REFRESH_SECRET;
      } else {
        process.env.JWT_REFRESH_SECRET = originalEnv;
      }
    });

    it('should verify token with refresh secret and return decoded payload', () => {
      const mockVerify = mockFastify.jwt.verify;
      mockVerify.mockReturnValue({ id: 'user-1' });

      const result = verifyRefreshToken(mockFastify as never, 'valid-refresh-token');

      expect(mockVerify).toHaveBeenCalledWith('valid-refresh-token', {
        key: 'test-refresh-secret',
      });
      expect(result).toEqual({ id: 'user-1' });
    });

    it('should throw on invalid token', () => {
      const mockVerify = mockFastify.jwt.verify;
      mockVerify.mockImplementation(() => {
        throw new Error('invalid token');
      });

      expect(() => verifyRefreshToken(mockFastify as never, 'bad-token')).toThrow('invalid token');
    });

    it('should throw on expired token', () => {
      const mockVerify = mockFastify.jwt.verify;
      mockVerify.mockImplementation(() => {
        throw new Error('token expired');
      });

      expect(() => verifyRefreshToken(mockFastify as never, 'expired-token')).toThrow(
        'token expired',
      );
    });

    it('should throw if JWT_REFRESH_SECRET is not set', () => {
      delete process.env.JWT_REFRESH_SECRET;

      expect(() => verifyRefreshToken(mockFastify as never, 'some-token')).toThrow(
        'JWT_REFRESH_SECRET environment variable is not set',
      );
    });
  });
});
