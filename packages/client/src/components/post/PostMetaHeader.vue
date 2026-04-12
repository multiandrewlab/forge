<template>
  <div class="mb-4 border-b border-gray-700 pb-4">
    <h1 class="mb-2 text-xl font-bold text-white">{{ post.title }}</h1>
    <div class="flex items-center gap-3">
      <div
        class="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-sm font-bold text-primary"
      >
        {{ post.author.displayName[0]?.toUpperCase() }}
      </div>
      <div>
        <div class="text-sm font-medium text-gray-200">{{ post.author.displayName }}</div>
        <div class="text-xs text-gray-500">Updated {{ timeAgo(post.updatedAt) }}</div>
      </div>
    </div>
    <div v-if="post.isDraft" class="mt-2">
      <span class="rounded bg-yellow-600/20 px-2 py-1 text-xs text-yellow-400">Draft</span>
    </div>
    <div v-if="post.tags.length > 0" class="mt-2 flex flex-wrap gap-1">
      <span
        v-for="tag in post.tags"
        :key="tag"
        class="rounded bg-gray-700 px-2 py-0.5 text-xs text-gray-300"
      >
        #{{ tag }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PostWithAuthor } from '@forge/shared';

defineProps<{ post: PostWithAuthor }>();

function timeAgo(date: Date | string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
</script>
