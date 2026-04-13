import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  PresenceTracker,
  PRESENCE_EVICTION_THRESHOLD_MS,
  createPresenceEvictionInterval,
} from '../../../plugins/websocket/presence.js';
import type { User } from '@forge/shared';

function createUser(id: string): User {
  return {
    id,
    email: `${id}@example.com`,
    displayName: `User ${id}`,
    avatarUrl: null,
    authProvider: 'github' as const,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };
}

describe('PresenceTracker', () => {
  let tracker: PresenceTracker;

  beforeEach(() => {
    vi.useFakeTimers();
    tracker = new PresenceTracker();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('PRESENCE_EVICTION_THRESHOLD_MS', () => {
    it('equals 60000 (60 seconds)', () => {
      expect(PRESENCE_EVICTION_THRESHOLD_MS).toBe(60_000);
    });
  });

  describe('update and getViewers', () => {
    it('adds a user visible via getViewers', () => {
      const user = createUser('u1');
      tracker.update('post:1', 'u1', user);

      const viewers = tracker.getViewers('post:1');
      expect(viewers).toHaveLength(1);
      expect(viewers[0].id).toBe('u1');
    });

    it('returns an empty array for an unknown channel', () => {
      expect(tracker.getViewers('unknown')).toEqual([]);
    });

    it('updates lastSeen without creating duplicate entries on re-update', () => {
      const user = createUser('u1');
      tracker.update('post:1', 'u1', user, 1000);
      tracker.update('post:1', 'u1', user, 2000);

      const viewers = tracker.getViewers('post:1');
      expect(viewers).toHaveLength(1);
    });

    it('tracks multiple users in the same channel', () => {
      tracker.update('post:1', 'u1', createUser('u1'));
      tracker.update('post:1', 'u2', createUser('u2'));

      const viewers = tracker.getViewers('post:1');
      expect(viewers).toHaveLength(2);
      const ids = viewers.map((u) => u.id);
      expect(ids).toContain('u1');
      expect(ids).toContain('u2');
    });

    it('tracks users across separate channels independently', () => {
      tracker.update('post:1', 'u1', createUser('u1'));
      tracker.update('post:2', 'u2', createUser('u2'));

      expect(tracker.getViewers('post:1')).toHaveLength(1);
      expect(tracker.getViewers('post:2')).toHaveLength(1);
    });
  });

  describe('remove', () => {
    it('removes a user from a channel', () => {
      const user = createUser('u1');
      tracker.update('post:1', 'u1', user);
      tracker.remove('post:1', 'u1');

      expect(tracker.getViewers('post:1')).toEqual([]);
    });

    it('does nothing when removing from a non-existent channel', () => {
      // Should not throw
      tracker.remove('nonexistent', 'u1');
      expect(tracker.getViewers('nonexistent')).toEqual([]);
    });

    it('does nothing when removing a non-existent user from a channel', () => {
      tracker.update('post:1', 'u1', createUser('u1'));
      tracker.remove('post:1', 'u-unknown');

      expect(tracker.getViewers('post:1')).toHaveLength(1);
    });

    it('cleans up the channel entry when the last user is removed', () => {
      tracker.update('post:1', 'u1', createUser('u1'));
      tracker.remove('post:1', 'u1');

      // Evict should not return this channel since it was already cleaned up
      const evicted = tracker.evict(Date.now() + 999_999);
      expect(evicted).not.toContain('post:1');
    });
  });

  describe('evict', () => {
    it('evicts entries older than 60 seconds and returns affected channels', () => {
      const user = createUser('u1');
      const now = 100_000;
      tracker.update('post:1', 'u1', user, now);

      const evicted = tracker.evict(now + 60_001);

      expect(evicted).toEqual(['post:1']);
      expect(tracker.getViewers('post:1')).toEqual([]);
    });

    it('does not evict entries within the threshold', () => {
      const user = createUser('u1');
      const now = 100_000;
      tracker.update('post:1', 'u1', user, now);

      const evicted = tracker.evict(now + 30_000);

      expect(evicted).toEqual([]);
      expect(tracker.getViewers('post:1')).toHaveLength(1);
    });

    it('returns empty array when nothing to evict', () => {
      expect(tracker.evict()).toEqual([]);
    });

    it('only evicts stale entries in mixed channels', () => {
      const now = 100_000;
      tracker.update('post:1', 'u1', createUser('u1'), now - 70_000); // stale
      tracker.update('post:2', 'u2', createUser('u2'), now); // fresh

      const evicted = tracker.evict(now);

      expect(evicted).toEqual(['post:1']);
      expect(tracker.getViewers('post:1')).toEqual([]);
      expect(tracker.getViewers('post:2')).toHaveLength(1);
    });

    it('evicts only stale users within a channel, keeping fresh ones', () => {
      const now = 100_000;
      tracker.update('post:1', 'u-stale', createUser('u-stale'), now - 70_000);
      tracker.update('post:1', 'u-fresh', createUser('u-fresh'), now);

      const evicted = tracker.evict(now);

      expect(evicted).toEqual(['post:1']);
      const viewers = tracker.getViewers('post:1');
      expect(viewers).toHaveLength(1);
      expect(viewers[0].id).toBe('u-fresh');
    });

    it('uses Date.now() when no argument is passed', () => {
      vi.setSystemTime(100_000);
      tracker.update('post:1', 'u1', createUser('u1'));

      vi.setSystemTime(100_000 + 60_001);
      const evicted = tracker.evict();

      expect(evicted).toEqual(['post:1']);
    });

    it('does not evict entries at exactly the threshold boundary', () => {
      const now = 100_000;
      tracker.update('post:1', 'u1', createUser('u1'), now);

      // Exactly at threshold (now - lastSeen === 60_000, not > 60_000)
      const evicted = tracker.evict(now + 60_000);

      expect(evicted).toEqual([]);
      expect(tracker.getViewers('post:1')).toHaveLength(1);
    });
  });

  describe('createPresenceEvictionInterval', () => {
    it('calls evict and broadcasts presence:update for evicted channels on each tick', () => {
      vi.setSystemTime(100_000);
      tracker.update('post:1', 'u1', createUser('u1'));

      const broadcast = vi.fn();
      const channels = { broadcast };

      const interval = createPresenceEvictionInterval(tracker, channels);

      // Advance past eviction threshold + one interval tick
      vi.setSystemTime(100_000 + 60_001);
      vi.advanceTimersByTime(15_000);

      expect(broadcast).toHaveBeenCalledOnce();
      expect(broadcast).toHaveBeenCalledWith('post:1', {
        type: 'presence:update',
        channel: 'post:1',
        data: { users: [] },
      });

      clearInterval(interval);
    });

    it('broadcasts for each evicted channel', () => {
      vi.setSystemTime(100_000);
      tracker.update('post:1', 'u1', createUser('u1'));
      tracker.update('post:2', 'u2', createUser('u2'));

      const broadcast = vi.fn();
      const channels = { broadcast };

      const interval = createPresenceEvictionInterval(tracker, channels);

      vi.setSystemTime(100_000 + 60_001);
      vi.advanceTimersByTime(15_000);

      expect(broadcast).toHaveBeenCalledTimes(2);

      clearInterval(interval);
    });

    it('does not broadcast when nothing is evicted', () => {
      vi.setSystemTime(100_000);
      tracker.update('post:1', 'u1', createUser('u1'));

      const broadcast = vi.fn();
      const channels = { broadcast };

      const interval = createPresenceEvictionInterval(tracker, channels);

      // Only advance 10 seconds — not enough to evict
      vi.setSystemTime(100_000 + 10_000);
      vi.advanceTimersByTime(15_000);

      expect(broadcast).not.toHaveBeenCalled();

      clearInterval(interval);
    });

    it('uses a custom intervalMs when provided', () => {
      vi.setSystemTime(100_000);
      tracker.update('post:1', 'u1', createUser('u1'));

      const broadcast = vi.fn();
      const channels = { broadcast };

      const interval = createPresenceEvictionInterval(tracker, channels, 5_000);

      vi.setSystemTime(100_000 + 60_001);
      vi.advanceTimersByTime(5_000);

      expect(broadcast).toHaveBeenCalledOnce();

      clearInterval(interval);
    });

    it('stops firing after clearInterval', () => {
      vi.setSystemTime(100_000);

      const broadcast = vi.fn();
      const channels = { broadcast };

      const interval = createPresenceEvictionInterval(tracker, channels);

      clearInterval(interval);

      // Add a stale entry and advance time
      tracker.update('post:1', 'u1', createUser('u1'));
      vi.setSystemTime(100_000 + 60_001);
      vi.advanceTimersByTime(15_000);

      expect(broadcast).not.toHaveBeenCalled();
    });

    it('includes remaining viewers in the broadcast payload after partial eviction', () => {
      vi.setSystemTime(100_000);
      tracker.update('post:1', 'u-stale', createUser('u-stale'));

      vi.setSystemTime(100_000 + 50_000);
      const freshUser = createUser('u-fresh');
      tracker.update('post:1', 'u-fresh', freshUser);

      const broadcast = vi.fn();
      const channels = { broadcast };

      const interval = createPresenceEvictionInterval(tracker, channels);

      // Advance so u-stale is evicted but u-fresh is not
      vi.setSystemTime(100_000 + 60_001);
      vi.advanceTimersByTime(15_000);

      expect(broadcast).toHaveBeenCalledOnce();
      expect(broadcast).toHaveBeenCalledWith('post:1', {
        type: 'presence:update',
        channel: 'post:1',
        data: { users: [freshUser] },
      });

      clearInterval(interval);
    });
  });
});
