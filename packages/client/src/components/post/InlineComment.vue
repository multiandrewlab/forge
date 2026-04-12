<template>
  <div class="border-l-2 border-primary bg-surface-800 px-3 py-2 my-1 rounded-r text-sm">
    <div class="flex items-center gap-2 text-xs text-gray-400">
      <span class="font-medium text-gray-300">
        {{ comment.author?.displayName ?? 'Deleted user' }}
      </span>
      <span v-if="comment.revisionNumber" class="text-gray-500">
        Left on revision {{ comment.revisionNumber }}
      </span>
    </div>
    <p class="mt-1 text-gray-200 whitespace-pre-wrap">{{ comment.body }}</p>
  </div>
</template>

<script setup lang="ts">
import type { Comment } from '@forge/shared';

defineProps<{ comment: Comment }>();
</script>
