import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LockoutService } from '../../services/lockout.js';

describe('LockoutService', () => {
  let service: LockoutService;

  beforeEach(() => {
    service = new LockoutService();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('checkLockout', () => {
    it('returns locked=false for a fresh (unknown) account', () => {
      const result = service.checkLockout('fresh@example.com');
      expect(result).toEqual({ locked: false });
    });

    it('returns locked=false after 9 failures (below threshold)', () => {
      for (let i = 0; i < 9; i++) {
        service.recordFailure('user@example.com');
      }
      const result = service.checkLockout('user@example.com');
      expect(result).toEqual({ locked: false });
    });

    it('returns locked=true with remainingMs after 10 failures', () => {
      for (let i = 0; i < 10; i++) {
        service.recordFailure('user@example.com');
      }
      const result = service.checkLockout('user@example.com');
      expect(result.locked).toBe(true);
      expect(result.remainingMs).toBeDefined();
      expect(result.remainingMs).toBeGreaterThan(0);
      // Should be approximately 15 minutes (900000ms)
      expect(result.remainingMs).toBeLessThanOrEqual(15 * 60 * 1000);
    });

    it('returns remainingMs that decreases as time passes', () => {
      for (let i = 0; i < 10; i++) {
        service.recordFailure('user@example.com');
      }

      // Advance time by 5 minutes
      vi.advanceTimersByTime(5 * 60 * 1000);

      const result = service.checkLockout('user@example.com');
      expect(result.locked).toBe(true);
      // Should have approximately 10 minutes remaining
      expect(result.remainingMs).toBeLessThanOrEqual(10 * 60 * 1000);
      expect(result.remainingMs).toBeGreaterThan(9 * 60 * 1000);
    });

    it('returns locked=false after lock expires (15 minutes)', () => {
      for (let i = 0; i < 10; i++) {
        service.recordFailure('user@example.com');
      }

      // Advance time past 15 minutes
      vi.advanceTimersByTime(15 * 60 * 1000 + 1);

      const result = service.checkLockout('user@example.com');
      expect(result).toEqual({ locked: false });
    });
  });

  describe('recordFailure', () => {
    it('increments failure count', () => {
      service.recordFailure('user@example.com');
      // After 1 failure, should not be locked
      expect(service.checkLockout('user@example.com')).toEqual({ locked: false });
    });

    it('locks account on the 10th failure', () => {
      for (let i = 0; i < 9; i++) {
        service.recordFailure('user@example.com');
      }
      expect(service.checkLockout('user@example.com').locked).toBe(false);

      service.recordFailure('user@example.com');
      expect(service.checkLockout('user@example.com').locked).toBe(true);
    });

    it('tracks failures independently per email', () => {
      for (let i = 0; i < 10; i++) {
        service.recordFailure('alice@example.com');
      }

      // Alice should be locked, Bob should not
      expect(service.checkLockout('alice@example.com').locked).toBe(true);
      expect(service.checkLockout('bob@example.com').locked).toBe(false);
    });
  });

  describe('resetFailures', () => {
    it('clears failure count and lock', () => {
      for (let i = 0; i < 10; i++) {
        service.recordFailure('user@example.com');
      }
      expect(service.checkLockout('user@example.com').locked).toBe(true);

      service.resetFailures('user@example.com');
      expect(service.checkLockout('user@example.com')).toEqual({ locked: false });
    });

    it('is a no-op for unknown email', () => {
      // Should not throw
      service.resetFailures('unknown@example.com');
      expect(service.checkLockout('unknown@example.com')).toEqual({ locked: false });
    });

    it('allows new failures to accumulate after reset', () => {
      // Lock the account
      for (let i = 0; i < 10; i++) {
        service.recordFailure('user@example.com');
      }
      expect(service.checkLockout('user@example.com').locked).toBe(true);

      // Reset
      service.resetFailures('user@example.com');
      expect(service.checkLockout('user@example.com').locked).toBe(false);

      // Accumulate 10 more failures -> locked again
      for (let i = 0; i < 10; i++) {
        service.recordFailure('user@example.com');
      }
      expect(service.checkLockout('user@example.com').locked).toBe(true);
    });
  });
});
