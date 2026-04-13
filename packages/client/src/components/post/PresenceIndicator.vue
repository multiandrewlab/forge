<template>
  <div v-if="viewers.length > 0" class="inline-flex items-center" aria-label="Viewers of this post">
    <div
      v-for="(viewer, index) in displayedViewers"
      :key="viewer.id"
      data-testid="presence-avatar"
      class="relative flex h-8 w-8 items-center justify-center rounded-full ring-2 ring-white text-xs font-bold"
      :class="[index > 0 ? '-ml-2' : '', viewer.avatarUrl ? '' : 'bg-primary text-white']"
    >
      <img
        v-if="viewer.avatarUrl"
        :src="viewer.avatarUrl"
        :alt="viewer.displayName"
        class="h-8 w-8 rounded-full object-cover"
      />
      <span v-else>{{ getInitials(viewer.displayName) }}</span>
    </div>
    <div
      v-if="overflowCount > 0"
      data-testid="presence-overflow"
      class="-ml-2 relative flex h-8 w-8 items-center justify-center rounded-full bg-gray-600 text-xs font-bold text-white ring-2 ring-white"
    >
      +{{ overflowCount }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, toRef } from 'vue';
import { usePresence } from '../../composables/usePresence.js';

const props = defineProps<{
  postId: string;
}>();

const { viewers } = usePresence(toRef(props, 'postId'));

const MAX_VISIBLE = 5;

const displayedViewers = computed(() => viewers.value.slice(0, MAX_VISIBLE));

const overflowCount = computed(() =>
  viewers.value.length > MAX_VISIBLE ? viewers.value.length - MAX_VISIBLE : 0,
);

function getInitials(displayName: string): string {
  const parts = displayName.split(' ').filter(Boolean);
  const first = parts[0];
  const second = parts[1];
  if (first && second) {
    return (first.charAt(0) + second.charAt(0)).toUpperCase();
  }
  return displayName.slice(0, 2).toUpperCase();
}
</script>
