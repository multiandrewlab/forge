<template>
  <div class="flex border-b border-gray-700">
    <button
      v-for="tab in tabs"
      :key="tab.value"
      class="px-4 py-2 text-sm font-medium transition-colors"
      :class="
        modelValue === tab.value
          ? 'border-b-2 border-primary text-primary'
          : 'text-gray-400 hover:text-gray-200'
      "
      @click="$emit('update:modelValue', tab.value)"
    >
      {{ tab.label }}
    </button>
  </div>
</template>

<script setup lang="ts">
import type { FeedSort } from '@forge/shared';

defineProps<{ modelValue: FeedSort }>();
defineEmits<{ 'update:modelValue': [value: FeedSort] }>();

const tabs = [
  { label: 'Trending', value: 'trending' as const },
  { label: 'Recent', value: 'recent' as const },
  { label: 'Top', value: 'top' as const },
];
</script>
