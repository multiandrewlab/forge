import { ref } from 'vue';
import { defineStore } from 'pinia';
import type { User } from '@forge/shared';

export type RealtimeStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export const useRealtimeStore = defineStore('realtime', () => {
  const status = ref<RealtimeStatus>('idle');
  const presenceByChannel = ref<Record<string, User[]>>({});
  const subscribedChannels = ref<Set<string>>(new Set());

  function setStatus(newStatus: RealtimeStatus): void {
    status.value = newStatus;
  }

  function setPresence(channel: string, users: User[]): void {
    presenceByChannel.value[channel] = users;
  }

  function clearPresence(channel: string): void {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete presenceByChannel.value[channel];
  }

  function markChannelSubscribed(channel: string): void {
    // Replace the Set ref — Vue does NOT deep-track Set mutations, so
    // consumers (e.g. :data-channel-subscribed DOM bindings) only re-render
    // when the ref's identity changes.
    const next = new Set(subscribedChannels.value);
    next.add(channel);
    subscribedChannels.value = next;
  }

  function markChannelUnsubscribed(channel: string): void {
    if (!subscribedChannels.value.has(channel)) {
      return;
    }
    const next = new Set(subscribedChannels.value);
    next.delete(channel);
    subscribedChannels.value = next;
  }

  function clearAllSubscriptions(): void {
    subscribedChannels.value = new Set();
  }

  function isChannelSubscribed(channel: string): boolean {
    return subscribedChannels.value.has(channel);
  }

  return {
    status,
    presenceByChannel,
    subscribedChannels,
    setStatus,
    setPresence,
    clearPresence,
    markChannelSubscribed,
    markChannelUnsubscribed,
    clearAllSubscriptions,
    isChannelSubscribed,
  };
});
