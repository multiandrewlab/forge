<template>
  <div data-testid="stats-grid" class="grid grid-cols-1 gap-4 sm:grid-cols-3">
    <!-- Posts card -->
    <div data-testid="stat-posts" class="rounded-lg border border-gray-700 bg-gray-800 p-4">
      <div class="flex items-center gap-2 text-gray-400">
        <svg
          class="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
        <span class="text-sm">Posts</span>
      </div>
      <p class="mt-2 text-2xl font-bold text-white">
        {{ stats.postCount }}
      </p>
    </div>

    <!-- Votes Received card -->
    <div data-testid="stat-votes" class="rounded-lg border border-gray-700 bg-gray-800 p-4">
      <div class="flex items-center gap-2 text-gray-400">
        <svg
          class="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M12 19V5M5 12l7-7 7 7" />
        </svg>
        <span class="text-sm">Votes Received</span>
      </div>
      <p class="mt-2 text-2xl font-bold text-white">
        {{ stats.totalVotes }}
      </p>
    </div>

    <!-- Top Tags card -->
    <div data-testid="stat-tags" class="rounded-lg border border-gray-700 bg-gray-800 p-4">
      <div class="flex items-center gap-2 text-gray-400">
        <svg
          class="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" />
          <line x1="7" y1="7" x2="7.01" y2="7" />
        </svg>
        <span class="text-sm">Top Tags</span>
      </div>
      <div class="mt-2">
        <div v-if="stats.topTags.length === 0" class="text-sm text-gray-500">No tags yet</div>
        <div v-else class="flex flex-wrap gap-2">
          <span
            v-for="tag in stats.topTags"
            :key="tag.tagName"
            class="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary"
          >
            {{ tag.tagName }}
            <span class="text-gray-400">{{ tag.voteSum }}</span>
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { UserProfileStats } from '@forge/shared';

defineProps<{
  stats: UserProfileStats;
}>();
</script>
