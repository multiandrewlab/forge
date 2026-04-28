<template>
  <span
    data-testid="badge-pill"
    :title="tooltip"
    :class="pillClasses"
    class="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
  >
    <!-- Star icon for top_contributor -->
    <svg
      v-if="badge.type === 'top_contributor'"
      :class="iconColorClass"
      class="h-3.5 w-3.5"
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>

    <!-- Tag icon for tag_expert -->
    <svg
      v-if="badge.type === 'tag_expert'"
      class="h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" />
      <line
        x1="7"
        y1="7"
        x2="7.01"
        y2="7"
      />
    </svg>

    {{ badge.label }}
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { UserProfileBadge } from '@forge/shared';

const props = defineProps<{
  badge: UserProfileBadge;
}>();

const tooltip = computed(() => {
  if (props.badge.type === 'top_contributor') {
    return 'Top 3 contributor by total votes received';
  }
  return 'This user is the top contributor for this tag';
});

const rankColors: Record<number, string> = {
  1: 'text-yellow-400',
  2: 'text-gray-300',
  3: 'text-amber-600',
};

const iconColorClass = computed(() => rankColors[props.badge.rank ?? 1]);

const pillClasses = computed(() => {
  if (props.badge.type === 'top_contributor') {
    return 'bg-yellow-400/10 text-yellow-300';
  }
  return 'bg-primary/10 text-primary';
});
</script>
