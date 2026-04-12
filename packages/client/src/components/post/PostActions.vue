<template>
  <div class="flex items-center gap-4 border-b border-gray-700 py-3">
    <!-- Upvote -->
    <button
      class="flex items-center gap-1 text-sm"
      :class="currentVote === 1 ? 'text-primary' : 'text-gray-400'"
      aria-label="Upvote"
      @click="handleUpvote"
    >
      <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" />
      </svg>
      {{ post.voteCount }}
    </button>

    <!-- Downvote -->
    <button
      class="flex items-center gap-1 text-sm"
      :class="currentVote === -1 ? 'text-red-400' : 'text-gray-400'"
      aria-label="Downvote"
      @click="handleDownvote"
    >
      <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
    </button>

    <!-- Bookmark -->
    <button
      class="flex items-center gap-1 text-sm"
      :class="isBookmarked ? 'text-yellow-400' : 'text-gray-400'"
      aria-label="Bookmark"
      @click="handleBookmark"
    >
      <svg
        class="h-4 w-4"
        viewBox="0 0 24 24"
        stroke="currentColor"
        :fill="isBookmarked ? 'currentColor' : 'none'"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
        />
      </svg>
    </button>

    <!-- Fork (placeholder) -->
    <button disabled class="flex items-center gap-1 text-sm text-gray-500" aria-label="Fork">
      <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2"
        />
      </svg>
    </button>

    <!-- History (placeholder) -->
    <button disabled class="flex items-center gap-1 text-sm text-gray-500" aria-label="History">
      <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useFeedStore } from '../../stores/feed.js';
import { useVotes } from '../../composables/useVotes.js';
import { useBookmarks } from '../../composables/useBookmarks.js';
import type { PostWithAuthor } from '@forge/shared';

const props = defineProps<{ post: PostWithAuthor }>();
const store = useFeedStore();
const { vote, removeVote } = useVotes();
const { toggleBookmark } = useBookmarks();

const currentVote = computed(() => store.userVotes[props.post.id] ?? null);
const isBookmarked = computed(() => store.userBookmarks[props.post.id] === true);

function handleUpvote(): void {
  if (currentVote.value === 1) {
    removeVote(props.post.id);
  } else {
    vote(props.post.id, 1);
  }
}

function handleDownvote(): void {
  if (currentVote.value === -1) {
    removeVote(props.post.id);
  } else {
    vote(props.post.id, -1);
  }
}

function handleBookmark(): void {
  toggleBookmark(props.post.id);
}
</script>
