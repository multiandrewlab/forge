import { describe, it, expect, beforeEach } from 'vitest';
import { AiRateLimiter } from '../../../plugins/langchain/rate-limiter.js';

describe('AiRateLimiter', () => {
  let now = 0;
  let limiter: AiRateLimiter;

  beforeEach(() => {
    now = 1_000_000;
    limiter = new AiRateLimiter({ timeoutMs: 60_000, now: () => now });
  });

  it('acquire() returns a controller for first request', () => {
    const slot = limiter.acquire('user-1');
    expect(slot).not.toBeNull();
    expect(slot?.controller).toBeInstanceOf(AbortController);
  });

  it('acquire() returns null when another request is in-flight', () => {
    limiter.acquire('user-1');
    expect(limiter.acquire('user-1')).toBeNull();
  });

  it('acquire() succeeds after release()', () => {
    const slot = limiter.acquire('user-1');
    slot?.release();
    expect(limiter.acquire('user-1')).not.toBeNull();
  });

  it('acquire() reclaims a timed-out slot and aborts the stale controller', () => {
    const stale = limiter.acquire('user-1');
    if (!stale) throw new Error('expected first acquire to succeed');
    now += 60_001;
    const fresh = limiter.acquire('user-1');
    expect(fresh).not.toBeNull();
    expect(stale.controller.signal.aborted).toBe(true);
  });

  it('acquire() rejects still-live slot under timeout boundary', () => {
    limiter.acquire('user-1');
    now += 59_999;
    expect(limiter.acquire('user-1')).toBeNull();
  });

  it('tracks users independently', () => {
    expect(limiter.acquire('user-1')).not.toBeNull();
    expect(limiter.acquire('user-2')).not.toBeNull();
  });

  it('release() is idempotent', () => {
    const slot = limiter.acquire('user-1');
    slot?.release();
    slot?.release(); // no throw
    expect(limiter.acquire('user-1')).not.toBeNull();
  });
});
