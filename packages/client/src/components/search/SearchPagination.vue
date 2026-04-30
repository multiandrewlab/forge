<template>
  <nav v-if="totalPages > 1" data-testid="search-pagination" class="flex items-center gap-3 py-4">
    <button
      data-testid="prev-page-btn"
      :disabled="page <= 1"
      class="rounded border border-gray-700 px-3 py-1 text-sm disabled:opacity-40"
      @click="emit('change', page - 1)"
    >
      Prev
    </button>
    <span data-testid="page-indicator" class="text-sm text-gray-400">
      page {{ page }} of {{ totalPages }}
    </span>
    <button
      data-testid="next-page-btn"
      :disabled="page >= totalPages"
      class="rounded border border-gray-700 px-3 py-1 text-sm disabled:opacity-40"
      @click="emit('change', page + 1)"
    >
      Next
    </button>
  </nav>
</template>

<script setup lang="ts">
defineProps<{ page: number; totalPages: number }>();
const emit = defineEmits<{ change: [page: number] }>();
</script>
