<template>
  <!-- TODO(#18): Wire vote/bookmark to stores -->
  <div class="flex items-center gap-4 border-b border-gray-700 py-3 opacity-50">
    <button disabled class="flex items-center gap-1 text-sm text-gray-500" aria-label="Upvote">
      <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" />
      </svg>
      {{ post.voteCount }}
    </button>
    <button disabled class="flex items-center gap-1 text-sm text-gray-500" aria-label="Bookmark">
      <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
        />
      </svg>
    </button>
    <button disabled class="flex items-center gap-1 text-sm text-gray-500" aria-label="Share">
      <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
        />
      </svg>
    </button>
  </div>
</template>

<script setup lang="ts">
import type { PostWithAuthor } from '@forge/shared';

defineProps<{ post: PostWithAuthor }>();
</script>
