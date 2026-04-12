<template>
  <div v-if="post" class="flex h-full flex-col overflow-y-auto p-6">
    <PostMetaHeader :post="post" />
    <PostActions :post="post" />
    <div class="mt-4 flex-1">
      <CodeViewer v-if="revision" :code="revision.content" :language="post.language ?? undefined" />
    </div>
    <!-- Comments placeholder — TODO(#19) -->
    <div class="mt-6 border-t border-gray-700 pt-4">
      <h3 class="text-sm font-medium text-gray-400">Comments</h3>
      <p class="mt-2 text-sm text-gray-500">Comments coming soon.</p>
    </div>
  </div>
  <div v-else class="flex h-full items-center justify-center">
    <p class="text-sm text-gray-500">Select a post to view</p>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { apiFetch } from '../../lib/api.js';
import type { PostWithAuthor, PostWithRevision } from '@forge/shared';
import CodeViewer from './CodeViewer.vue';
import PostMetaHeader from './PostMetaHeader.vue';
import PostActions from './PostActions.vue';

const props = defineProps<{ post: PostWithAuthor | null }>();

const fullPost = ref<PostWithRevision | null>(null);

const revision = computed(() => fullPost.value?.revisions?.[0] ?? null);

watch(
  () => props.post?.id,
  async (id) => {
    if (!id) {
      fullPost.value = null;
      return;
    }
    try {
      const response = await apiFetch(`/api/posts/${id}`);
      if (response.ok) {
        fullPost.value = (await response.json()) as PostWithRevision;
      }
    } catch {
      fullPost.value = null;
    }
  },
  { immediate: true },
);
</script>
