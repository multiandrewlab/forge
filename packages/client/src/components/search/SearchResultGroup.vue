<template>
  <div v-if="items.length > 0">
    <h3
      class="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400"
    >
      {{ title }}
    </h3>
    <SearchResultItem
      v-for="(item, i) in items"
      :key="i"
      :variant="variant"
      :data="item"
      :active="activeGlobalIndex === startIndex + i"
      @select="$emit('select', startIndex + i)"
    />
  </div>
</template>

<script setup lang="ts">
import type { SearchSnippet, UserSummary, AiAction } from '@forge/shared';
import SearchResultItem from './SearchResultItem.vue';

defineProps<{
  title: string;
  items: ReadonlyArray<SearchSnippet | UserSummary | AiAction>;
  variant: 'snippet' | 'person' | 'aiAction';
  activeGlobalIndex: number;
  startIndex: number;
}>();

defineEmits<{ select: [globalIndex: number] }>();
</script>
