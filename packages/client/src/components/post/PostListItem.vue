<template>
  <div
    class="cursor-pointer border-b border-gray-700 p-4 transition-colors hover:bg-gray-800"
    :class="{ 'bg-gray-800': selected }"
    @click="handleClick"
  >
    <div class="mb-1 flex items-center gap-2">
      <div
        class="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-xs text-primary"
      >
        {{ post.author.displayName[0]?.toUpperCase() }}
      </div>
      <span class="text-xs text-gray-400">{{ post.author.displayName }}</span>
      <span class="text-xs text-gray-500">{{ timeAgo(post.createdAt) }}</span>
      <span
        v-if="post.isDraft"
        class="rounded bg-yellow-600/20 px-1.5 py-0.5 text-xs text-yellow-400"
      >
        Draft
      </span>
    </div>
    <h3 class="mb-1 text-sm font-medium text-gray-100">{{ post.title }}</h3>
    <div class="flex items-center gap-3 text-xs text-gray-500">
      <span class="flex items-center gap-1">
        <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" />
        </svg>
        {{ post.voteCount }}
      </span>
      <span v-if="post.forkCount > 0" data-testid="fork-count" class="flex items-center gap-1">
        <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2"
          />
        </svg>
        {{ post.forkCount }}
      </span>
      <span class="flex items-center gap-1 rounded bg-gray-700 px-1.5 py-0.5 text-xs">
        <svg
          v-if="post.contentType === 'link'"
          data-testid="link-icon"
          class="h-3 w-3"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
          />
        </svg>
        {{ post.contentType }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
// SAFETY: This component runs exclusively in the browser. The project tsconfig
// uses lib: ["ES2022"] without "DOM", so we declare the browser globals we need.
declare const window: { matchMedia: (query: string) => { matches: boolean } };

import { useRouter } from 'vue-router';
import type { PostWithAuthor } from '@forge/shared';

const props = defineProps<{ post: PostWithAuthor; selected: boolean }>();
const emit = defineEmits<{ select: [id: string] }>();
const router = useRouter();

function handleClick(): void {
  // On mobile (<768px), navigate to full-screen post view
  if (window.matchMedia('(max-width: 767px)').matches) {
    router.push(`/posts/${props.post.id}`);
  } else {
    emit('select', props.post.id);
  }
}

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
