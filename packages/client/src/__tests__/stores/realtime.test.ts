import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useRealtimeStore } from '@/stores/realtime';
import type { User } from '@forge/shared';
import { AuthProvider } from '@forge/shared';

function createMockUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'test@example.com',
    displayName: 'Test User',
    avatarUrl: null,
    authProvider: AuthProvider.Local,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

describe('useRealtimeStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  describe('initial state', () => {
    it('should have status idle by default', () => {
      const store = useRealtimeStore();
      expect(store.status).toBe('idle');
    });

    it('should have empty presenceByChannel by default', () => {
      const store = useRealtimeStore();
      expect(store.presenceByChannel).toEqual({});
    });
  });

  describe('setStatus', () => {
    it('should update status to connected', () => {
      const store = useRealtimeStore();
      store.setStatus('connected');
      expect(store.status).toBe('connected');
    });

    it('should update status to connecting', () => {
      const store = useRealtimeStore();
      store.setStatus('connecting');
      expect(store.status).toBe('connecting');
    });

    it('should update status to reconnecting', () => {
      const store = useRealtimeStore();
      store.setStatus('reconnecting');
      expect(store.status).toBe('reconnecting');
    });

    it('should update status to disconnected', () => {
      const store = useRealtimeStore();
      store.setStatus('disconnected');
      expect(store.status).toBe('disconnected');
    });

    it('should update status back to idle', () => {
      const store = useRealtimeStore();
      store.setStatus('connected');
      store.setStatus('idle');
      expect(store.status).toBe('idle');
    });
  });

  describe('setPresence', () => {
    it('should write users to presenceByChannel for a channel', () => {
      const store = useRealtimeStore();
      const users = [createMockUser(), createMockUser({ id: 'user-2', displayName: 'User 2' })];

      store.setPresence('post:abc', users);

      expect(store.presenceByChannel['post:abc']).toEqual(users);
    });

    it('should overwrite existing presence for a channel', () => {
      const store = useRealtimeStore();
      const users1 = [createMockUser()];
      const users2 = [createMockUser({ id: 'user-2', displayName: 'User 2' })];

      store.setPresence('post:abc', users1);
      store.setPresence('post:abc', users2);

      expect(store.presenceByChannel['post:abc']).toEqual(users2);
    });

    it('should maintain separate channels', () => {
      const store = useRealtimeStore();
      const users1 = [createMockUser()];
      const users2 = [createMockUser({ id: 'user-2', displayName: 'User 2' })];

      store.setPresence('post:abc', users1);
      store.setPresence('post:def', users2);

      expect(store.presenceByChannel['post:abc']).toEqual(users1);
      expect(store.presenceByChannel['post:def']).toEqual(users2);
    });
  });

  describe('clearPresence', () => {
    it('should delete the channel key from presenceByChannel', () => {
      const store = useRealtimeStore();
      const users = [createMockUser()];

      store.setPresence('post:abc', users);
      store.clearPresence('post:abc');

      expect(store.presenceByChannel['post:abc']).toBeUndefined();
    });

    it('should not throw when clearing a non-existent channel', () => {
      const store = useRealtimeStore();
      expect(() => store.clearPresence('post:xyz')).not.toThrow();
    });

    it('should not affect other channels', () => {
      const store = useRealtimeStore();
      const users = [createMockUser()];

      store.setPresence('post:abc', users);
      store.setPresence('post:def', users);
      store.clearPresence('post:abc');

      expect(store.presenceByChannel['post:abc']).toBeUndefined();
      expect(store.presenceByChannel['post:def']).toEqual(users);
    });
  });
});

describe('realtime store — subscribedChannels', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('starts with an empty subscribedChannels set', () => {
    const store = useRealtimeStore();
    expect(store.isChannelSubscribed('post:abc')).toBe(false);
  });

  it('markChannelSubscribed records the channel', () => {
    const store = useRealtimeStore();
    store.markChannelSubscribed('post:abc');
    expect(store.isChannelSubscribed('post:abc')).toBe(true);
  });

  it('markChannelUnsubscribed removes the channel', () => {
    const store = useRealtimeStore();
    store.markChannelSubscribed('post:abc');
    store.markChannelUnsubscribed('post:abc');
    expect(store.isChannelSubscribed('post:abc')).toBe(false);
  });

  it('markChannelUnsubscribed on an unknown channel is a no-op', () => {
    const store = useRealtimeStore();
    expect(() => store.markChannelUnsubscribed('post:never')).not.toThrow();
    expect(store.isChannelSubscribed('post:never')).toBe(false);
  });

  it('clearAllSubscriptions empties the set', () => {
    const store = useRealtimeStore();
    store.markChannelSubscribed('post:a');
    store.markChannelSubscribed('post:b');
    store.clearAllSubscriptions();
    expect(store.isChannelSubscribed('post:a')).toBe(false);
    expect(store.isChannelSubscribed('post:b')).toBe(false);
  });
});
