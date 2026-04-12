<template>
  <div class="flex h-full">
    <PostList
      :posts="posts"
      :selected-post-id="selectedPostId"
      :loading="loading"
      :error="error"
      :has-more="hasMore"
      :current-sort="currentSort"
      :current-filter="currentFilter"
      :current-tag="tag"
      @sort-change="setSort"
      @select-post="selectPost"
      @load-more="loadMore"
      @retry="loadPosts"
    />
    <div class="hidden flex-1 md:block">
      <PostDetail :post="selectedPost" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { watch, onMounted } from 'vue';
import type { FeedSort, FeedFilter } from '@forge/shared';
import { useFeed } from '../composables/useFeed.js';
import PostList from '../components/post/PostList.vue';
import PostDetail from '../components/post/PostDetail.vue';

const props = defineProps<{
  sort?: FeedSort;
  filter?: FeedFilter;
}>();

declare const window: { matchMedia: (query: string) => { matches: boolean } };

const {
  posts,
  sort: currentSort,
  filter: currentFilter,
  tag,
  selectedPostId,
  selectedPost,
  hasMore,
  loading,
  error,
  loadPosts,
  loadMore,
  setSort,
  setFilter,
  selectPost,
} = useFeed();

function autoSelectFirst(): void {
  if (posts.value.length > 0 && !selectedPostId.value) {
    if (window.matchMedia('(min-width: 768px)').matches) {
      selectPost(posts.value[0].id);
    }
  }
}

watch(
  () => props.sort,
  async (newSort) => {
    if (newSort !== undefined) {
      await setSort(newSort);
    }
  },
);

watch(
  () => props.filter,
  async (newFilter) => {
    await setFilter(newFilter ?? null);
  },
);

watch(posts, () => {
  autoSelectFirst();
});

onMounted(async () => {
  if (props.sort !== undefined) {
    await setSort(props.sort);
  } else if (props.filter !== undefined) {
    await setFilter(props.filter);
  } else {
    await loadPosts();
  }
  autoSelectFirst();
});
</script>
