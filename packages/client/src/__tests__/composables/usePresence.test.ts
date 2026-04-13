import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ref, nextTick } from 'vue';
import { setActivePinia, createPinia } from 'pinia';
import type { ServerMessage, PresenceUpdateMessage, User } from '@forge/shared';

// ── Mock useWebSocket ─────────────────────────────────────────────────

const mockSend = vi.fn();
const mockSubscribe = vi.fn<[string, (event: ServerMessage) => void], () => void>();

vi.mock('@/composables/useWebSocket', () => ({
  useWebSocket: () => ({
    send: mockSend,
    subscribe: mockSubscribe,
    clientId: 'test-client-id',
    status: ref('connected'),
    connect: vi.fn(),
    disconnect: vi.fn(),
  }),
}));

import { usePresence } from '@/composables/usePresence';
import { useRealtimeStore } from '@/stores/realtime';

// ── Helpers ───────────────────────────────────────────────────────────

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'u1',
    email: 'alice@example.com',
    displayName: 'Alice Smith',
    avatarUrl: null,
    authProvider: 'local',
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
    ...overrides,
  };
}

// We need to run the composable inside a component lifecycle context
// to trigger onMounted/onUnmounted. Use a minimal approach with effectScope.
import { effectScope } from 'vue';

/**
 * Runs usePresence inside an effect scope, simulating component mount.
 * Call scope.stop() to simulate unmount (triggers onScopeDispose / onUnmounted).
 */
function mountComposable(postId: ReturnType<typeof ref<string | null | undefined>>) {
  const scope = effectScope();
  let result: ReturnType<typeof usePresence> | undefined;
  scope.run(() => {
    result = usePresence(postId);
  });
  // scope.run is synchronous, so result is always assigned
  const resolved = result as ReturnType<typeof usePresence>;
  return { result: resolved, scope };
}

describe('usePresence', () => {
  let unsubscribeFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    setActivePinia(createPinia());
    mockSend.mockClear();
    mockSubscribe.mockClear();

    // Each call to subscribe returns a unique cleanup function
    unsubscribeFn = vi.fn();
    mockSubscribe.mockReturnValue(unsubscribeFn);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('mount with valid postId', () => {
    it('should send an immediate heartbeat with the correct message shape', () => {
      const postId = ref<string | null>('abc-123');
      mountComposable(postId);

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend).toHaveBeenCalledWith({
        type: 'presence',
        channel: 'post:abc-123',
        status: 'viewing',
      });
    });

    it('should subscribe to presence:update on the correct channel', () => {
      const postId = ref<string | null>('abc-123');
      mountComposable(postId);

      expect(mockSubscribe).toHaveBeenCalledTimes(1);
      expect(mockSubscribe).toHaveBeenCalledWith('post:abc-123', expect.any(Function));
    });

    it('should send another heartbeat after 30 seconds', () => {
      const postId = ref<string | null>('abc-123');
      mountComposable(postId);

      mockSend.mockClear();
      vi.advanceTimersByTime(30_000);

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend).toHaveBeenCalledWith({
        type: 'presence',
        channel: 'post:abc-123',
        status: 'viewing',
      });
    });

    it('should send two more heartbeats after 60 seconds', () => {
      const postId = ref<string | null>('abc-123');
      mountComposable(postId);

      mockSend.mockClear();
      vi.advanceTimersByTime(60_000);

      expect(mockSend).toHaveBeenCalledTimes(2);
    });
  });

  describe('presence:update subscription handler', () => {
    it('should call setPresence on the store when a presence:update arrives', () => {
      const postId = ref<string | null>('abc-123');
      mountComposable(postId);

      // Get the handler that was passed to subscribe
      const handler = mockSubscribe.mock.calls[0][1];

      const users = [makeUser(), makeUser({ id: 'u2', displayName: 'Bob' })];
      const msg: PresenceUpdateMessage = {
        type: 'presence:update',
        channel: 'post:abc-123',
        data: { users },
      };
      handler(msg);

      const store = useRealtimeStore();
      expect(store.presenceByChannel['post:abc-123']).toEqual(users);
    });

    it('should ignore non-presence:update messages', () => {
      const postId = ref<string | null>('abc-123');
      mountComposable(postId);

      const handler = mockSubscribe.mock.calls[0][1];

      // Send a different message type
      handler({
        type: 'comment:new',
        channel: 'post:abc-123',
        data: {
          id: 'c1',
          postId: 'abc-123',
          author: null,
          parentId: null,
          lineNumber: null,
          revisionId: null,
          revisionNumber: null,
          body: 'Hello',
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
        },
      } as ServerMessage);

      const store = useRealtimeStore();
      expect(store.presenceByChannel['post:abc-123']).toBeUndefined();
    });
  });

  describe('viewers computed', () => {
    it('should reflect the stored users for the channel', () => {
      const postId = ref<string | null>('abc-123');
      const { result } = mountComposable(postId);

      // Initially empty
      expect(result.viewers.value).toEqual([]);

      // Simulate presence update
      const store = useRealtimeStore();
      const users = [makeUser()];
      store.setPresence('post:abc-123', users);

      expect(result.viewers.value).toEqual(users);
    });

    it('should default to empty array when channel has no presence data', () => {
      const postId = ref<string | null>('abc-123');
      const { result } = mountComposable(postId);

      expect(result.viewers.value).toEqual([]);
    });

    it('should reactively update viewers when postId changes to a channel with pre-seeded presence', async () => {
      // Start with null so no old-channel cleanup mutates the store
      const postId = ref<string | null>(null);
      const { result } = mountComposable(postId);

      const store = useRealtimeStore();
      const seededUsers = [makeUser({ id: 'u3', displayName: 'Charlie' })];

      // Seed presence for channel 'post:b' BEFORE changing postId
      store.setPresence('post:b', seededUsers);
      await nextTick();

      // Force the computed to evaluate and cache while activeChannel is still null.
      // This ensures the computed's dependency set is locked to the current state.
      expect(result.viewers.value).toEqual([]);

      // Now change postId from null to 'b'.
      // Because oldId is null/falsy, cleanup() is NOT called, so
      // there is no store mutation to indirectly trigger the computed.
      // The ONLY way viewers can pick up seededUsers is if the computed
      // tracks activeChannel reactively.
      postId.value = 'b';
      await nextTick();

      expect(result.viewers.value).toEqual(seededUsers);
    });
  });

  describe('postId changes', () => {
    it('should clean up old channel and set up new channel when postId changes', async () => {
      const postId = ref<string | null>('old-id');
      mountComposable(postId);

      // Verify initial setup
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSubscribe).toHaveBeenCalledTimes(1);

      // Set up presence on old channel
      const store = useRealtimeStore();
      store.setPresence('post:old-id', [makeUser()]);

      // Reset mocks and set up new unsubscribe fn
      mockSend.mockClear();
      mockSubscribe.mockClear();
      const newUnsubscribeFn = vi.fn();
      mockSubscribe.mockReturnValue(newUnsubscribeFn);

      // Change postId
      postId.value = 'new-id';
      await nextTick();

      // Old cleanup should have happened
      expect(unsubscribeFn).toHaveBeenCalledTimes(1);
      expect(store.presenceByChannel['post:old-id']).toBeUndefined();

      // New channel should be set up
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend).toHaveBeenCalledWith({
        type: 'presence',
        channel: 'post:new-id',
        status: 'viewing',
      });
      expect(mockSubscribe).toHaveBeenCalledTimes(1);
      expect(mockSubscribe).toHaveBeenCalledWith('post:new-id', expect.any(Function));
    });

    it('should stop the old interval and start a new one on postId change', async () => {
      const postId = ref<string | null>('old-id');
      mountComposable(postId);

      mockSend.mockClear();
      mockSubscribe.mockClear();
      mockSubscribe.mockReturnValue(vi.fn());

      postId.value = 'new-id';
      await nextTick();

      mockSend.mockClear();
      vi.advanceTimersByTime(30_000);

      // Should only send for the new channel
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend).toHaveBeenCalledWith({
        type: 'presence',
        channel: 'post:new-id',
        status: 'viewing',
      });
    });
  });

  describe('postId becomes null', () => {
    it('should clean up when postId becomes null', async () => {
      const postId = ref<string | null>('abc-123');
      mountComposable(postId);

      const store = useRealtimeStore();
      store.setPresence('post:abc-123', [makeUser()]);

      postId.value = null;
      await nextTick();

      expect(unsubscribeFn).toHaveBeenCalledTimes(1);
      expect(store.presenceByChannel['post:abc-123']).toBeUndefined();
    });

    it('should not send heartbeats after postId becomes null', async () => {
      const postId = ref<string | null>('abc-123');
      mountComposable(postId);

      postId.value = null;
      await nextTick();

      mockSend.mockClear();
      vi.advanceTimersByTime(60_000);

      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe('postId starts as null', () => {
    it('should not send or subscribe when postId is initially null', () => {
      const postId = ref<string | null>(null);
      mountComposable(postId);

      expect(mockSend).not.toHaveBeenCalled();
      expect(mockSubscribe).not.toHaveBeenCalled();
    });

    it('should return empty viewers when postId is null (activeChannel is null)', () => {
      const postId = ref<string | null>(null);
      const { result } = mountComposable(postId);

      expect(result.viewers.value).toEqual([]);
    });

    it('should not send or subscribe when postId is initially undefined', () => {
      const postId = ref<string | undefined>(undefined);
      mountComposable(postId);

      expect(mockSend).not.toHaveBeenCalled();
      expect(mockSubscribe).not.toHaveBeenCalled();
    });

    it('should activate when postId transitions from null to a value', async () => {
      const postId = ref<string | null>(null);
      mountComposable(postId);

      expect(mockSend).not.toHaveBeenCalled();

      postId.value = 'abc-123';
      await nextTick();

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend).toHaveBeenCalledWith({
        type: 'presence',
        channel: 'post:abc-123',
        status: 'viewing',
      });
      expect(mockSubscribe).toHaveBeenCalledTimes(1);
    });
  });

  describe('unmount cleanup', () => {
    it('should stop interval and unsubscribe on scope dispose (unmount)', () => {
      const postId = ref<string | null>('abc-123');
      const { scope } = mountComposable(postId);

      const store = useRealtimeStore();
      store.setPresence('post:abc-123', [makeUser()]);

      scope.stop();

      // Subscription cleanup called
      expect(unsubscribeFn).toHaveBeenCalledTimes(1);

      // Presence cleared
      expect(store.presenceByChannel['post:abc-123']).toBeUndefined();

      // No more heartbeats
      mockSend.mockClear();
      vi.advanceTimersByTime(60_000);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should be safe to unmount when postId was always null', () => {
      const postId = ref<string | null>(null);
      const { scope } = mountComposable(postId);

      expect(() => scope.stop()).not.toThrow();
    });
  });
});
