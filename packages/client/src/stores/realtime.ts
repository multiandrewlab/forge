import { ref } from 'vue';
import { defineStore } from 'pinia';
import type { User } from '@forge/shared';

export type RealtimeStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export const useRealtimeStore = defineStore('realtime', () => {
  const status = ref<RealtimeStatus>('idle');
  const presenceByChannel = ref<Record<string, User[]>>({});

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

  return {
    status,
    presenceByChannel,
    setStatus,
    setPresence,
    clearPresence,
  };
});
