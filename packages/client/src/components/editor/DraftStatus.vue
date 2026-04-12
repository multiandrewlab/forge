<script setup lang="ts">
import { computed } from 'vue';
import type { SaveStatus } from '@/stores/posts';

const props = defineProps<{
  status: SaveStatus;
  lastSavedAt: Date | null;
}>();

const statusText = computed(() => {
  switch (props.status) {
    case 'saved':
      return props.lastSavedAt ? `Draft saved ${timeAgo(props.lastSavedAt)}` : 'Draft saved';
    case 'saving':
      return 'Saving...';
    case 'error':
      return 'Save failed';
    case 'unsaved':
      return 'Unsaved changes';
    default:
      return '';
  }
});

const statusColor = computed(() => {
  switch (props.status) {
    case 'saved':
      return 'text-green-400';
    case 'saving':
      return 'text-gray-400';
    case 'error':
      return 'text-red-400';
    case 'unsaved':
      return 'text-yellow-400';
    default:
      return 'text-gray-400';
  }
});

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ago`;
}
</script>

<template>
  <span :class="['text-xs', statusColor]">{{ statusText }}</span>
</template>
