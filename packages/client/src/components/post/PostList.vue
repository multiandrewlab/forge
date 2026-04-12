<template>
  <div class="flex h-full w-full flex-col md:w-[360px] md:shrink-0 md:border-r md:border-gray-700">
    <PostListFilters v-model="sort" @update:model-value="onSortChange" />
    <div class="flex-1 overflow-y-auto">
      <!-- Loading skeleton -->
      <div v-if="loading && posts.length === 0" class="space-y-1">
        <div v-for="i in 5" :key="i" class="animate-pulse border-b border-gray-700 p-4">
          <div class="mb-2 h-3 w-24 rounded bg-gray-700" />
          <div class="mb-2 h-4 w-48 rounded bg-gray-700" />
          <div class="h-3 w-16 rounded bg-gray-700" />
        </div>
      </div>
      <!-- Empty state -->
      <div v-else-if="!loading && posts.length === 0" class="p-8 text-center">
        <p class="text-sm text-gray-400">{{ emptyMessage }}</p>
        <RouterLink
          v-if="showCreateCta"
          to="/posts/new"
          class="mt-3 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
        >
          Create New Post
        </RouterLink>
      </div>
      <!-- Error state -->
      <div v-else-if="error" class="p-8 text-center">
        <p class="mb-3 text-sm text-red-400">{{ error }}</p>
        <button
          class="rounded-lg border border-gray-600 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700"
          @click="$emit('retry')"
        >
          Retry
        </button>
      </div>
      <!-- Post list -->
      <template v-else>
        <PostListItem
          v-for="post in posts"
          :key="post.id"
          :post="post"
          :selected="post.id === selectedPostId"
          @select="$emit('selectPost', $event)"
        />
        <div v-if="hasMore" class="p-4">
          <button
            class="w-full rounded-lg border border-gray-600 py-2 text-sm text-gray-300 hover:bg-gray-700"
            :disabled="loading"
            @click="$emit('loadMore')"
          >
            {{ loading ? 'Loading...' : 'Load More' }}
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { RouterLink } from 'vue-router';
import type { PostWithAuthor, FeedSort } from '@forge/shared';
import PostListFilters from './PostListFilters.vue';
import PostListItem from './PostListItem.vue';

const props = defineProps<{
  posts: PostWithAuthor[];
  selectedPostId: string | null;
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  currentSort: FeedSort;
  currentFilter: string | null;
  currentTag: string | null;
}>();

defineEmits<{
  sortChange: [sort: FeedSort];
  selectPost: [id: string];
  loadMore: [];
  retry: [];
}>();

const sort = ref(props.currentSort);

function onSortChange(value: FeedSort): void {
  sort.value = value;
}

const emptyMessage = computed(() => {
  if (props.currentTag) return `No posts tagged #${props.currentTag}`;
  switch (props.currentFilter) {
    case 'mine':
      return "You haven't created any posts yet";
    case 'bookmarked':
      return 'No bookmarked posts yet';
    default:
      return 'No posts yet — be the first to share!';
  }
});

const showCreateCta = computed(() => props.currentFilter !== 'bookmarked');
</script>
