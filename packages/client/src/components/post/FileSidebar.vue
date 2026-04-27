<template>
  <div class="flex h-full w-48 flex-shrink-0 flex-col rounded-lg bg-gray-900 p-3">
    <div class="mb-2 text-xs font-medium uppercase tracking-wider text-gray-500">
      Files ({{ files.length }})
    </div>
    <div class="flex-1 space-y-1 overflow-y-auto">
      <button
        v-for="file in files"
        :key="file.id"
        class="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm transition-colors"
        :class="
          file.id === activeFileId
            ? 'border-l-2 border-purple-500 bg-purple-500/20 text-purple-300'
            : 'text-gray-400 hover:bg-gray-800'
        "
        @click="$emit('select', file.id)"
      >
        <span class="truncate">{{ file.filename }}</span>
        <span class="ml-2 flex-shrink-0 text-xs text-gray-600">{{
          formatSize(file.fileSize)
        }}</span>
      </button>
    </div>
    <div
      v-if="editable"
      class="mt-2 border-t border-gray-800 pt-2"
    >
      <slot name="upload" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PostFile } from '@forge/shared';

defineProps<{
  files: PostFile[];
  activeFileId: string | null;
  editable: boolean;
}>();

defineEmits<{
  select: [fileId: string];
}>();

function formatSize(bytes: number | null): string {
  if (bytes === null || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${i === 0 ? bytes : (bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}
</script>
