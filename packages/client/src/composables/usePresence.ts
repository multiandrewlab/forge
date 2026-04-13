import { computed, ref, watch, onScopeDispose, type ComputedRef, type Ref } from 'vue';
import type { ServerMessage, User } from '@forge/shared';
import { useWebSocket } from '@/composables/useWebSocket';
import { useRealtimeStore } from '@/stores/realtime';

const HEARTBEAT_INTERVAL_MS = 30_000;

export function usePresence(postId: Ref<string | null | undefined>): {
  viewers: ComputedRef<User[]>;
} {
  const { send, subscribe } = useWebSocket();
  const store = useRealtimeStore();

  let intervalHandle: ReturnType<typeof setInterval> | null = null;
  let unsubscribeFn: (() => void) | null = null;
  const activeChannel = ref<string | null>(null);

  function cleanup(): void {
    if (intervalHandle !== null) {
      clearInterval(intervalHandle);
      intervalHandle = null;
    }

    if (unsubscribeFn !== null) {
      unsubscribeFn();
      unsubscribeFn = null;
    }

    if (activeChannel.value !== null) {
      store.clearPresence(activeChannel.value);
      activeChannel.value = null;
    }
  }

  function setup(id: string): void {
    const channel = `post:${id}`;
    activeChannel.value = channel;

    // Send initial heartbeat immediately
    send({ type: 'presence', channel, status: 'viewing' });

    // Schedule repeating heartbeats
    intervalHandle = setInterval(() => {
      send({ type: 'presence', channel, status: 'viewing' });
    }, HEARTBEAT_INTERVAL_MS);

    // Subscribe to presence:update events on this channel
    unsubscribeFn = subscribe(channel, (event: ServerMessage) => {
      if (event.type === 'presence:update') {
        store.setPresence(channel, event.data.users as User[]);
      }
    });
  }

  // Watch postId — handles initial value and changes
  watch(
    postId,
    (newId, oldId) => {
      // Clean up the old channel if there was one
      if (oldId) {
        cleanup();
      }

      // Set up the new channel if postId is truthy
      if (newId) {
        setup(newId);
      }
    },
    { immediate: true },
  );

  // Clean up on scope dispose (unmount)
  onScopeDispose(() => {
    cleanup();
  });

  const viewers = computed<User[]>(() => store.presenceByChannel[activeChannel.value ?? ''] ?? []);

  return { viewers };
}
