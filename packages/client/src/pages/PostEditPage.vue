<script setup lang="ts">
/* global setTimeout, clearTimeout */
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PostEditor from '@/components/editor/PostEditor.vue';
import { usePosts } from '@/composables/usePosts';
import { usePostsStore } from '@/stores/posts';
import { storeToRefs } from 'pinia';
import type { ContentType, Visibility } from '@forge/shared';

const route = useRoute();
const router = useRouter();
const { fetchPost, saveRevision, updatePost, publishPost, error } = usePosts();
const store = usePostsStore();
const { currentPost, saveStatus, lastSavedAt } = storeToRefs(store);

const title = ref('');
const content = ref('');
const language = ref('');
const visibility = ref<Visibility>('public');
const contentType = ref<ContentType>('snippet');
const tags = ref<string[]>([]);
const loading = ref(true);
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

onMounted(async () => {
  const id = route.params.id as string;
  await fetchPost(id);
  if (currentPost.value) {
    title.value = currentPost.value.title;
    content.value = currentPost.value.revisions[0]?.content ?? '';
    language.value = currentPost.value.language ?? '';
    visibility.value = currentPost.value.visibility;
    contentType.value = currentPost.value.contentType;
  }
  loading.value = false;
});

onBeforeUnmount(() => {
  if (debounceTimer) clearTimeout(debounceTimer);
  store.clearPost();
});

// Auto-save: debounce 2s after content changes
watch(content, (newContent) => {
  if (loading.value) return;
  store.setDirty(true);
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    const id = route.params.id as string;
    saveRevision(id, newContent, null);
  }, 2000);
});

// Save metadata changes immediately
watch([title, visibility, language, contentType], () => {
  if (loading.value) return;
  const id = route.params.id as string;
  updatePost(id, {
    title: title.value,
    visibility: visibility.value,
    language: language.value || null,
    contentType: contentType.value,
  });
});

async function handlePublish(): Promise<void> {
  const id = route.params.id as string;
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    await saveRevision(id, content.value, null);
  }
  await publishPost(id);
  router.push({ name: 'post-view', params: { id } });
}
</script>

<template>
  <div class="min-h-screen bg-surface p-4">
    <div class="max-w-5xl mx-auto">
      <router-link to="/" class="text-gray-400 hover:text-white text-sm mb-4 inline-block">
        &larr; Back to Workspace
      </router-link>

      <div
        v-if="error"
        class="mb-4 p-3 bg-red-900/30 border border-red-500 rounded text-red-400 text-sm"
      >
        {{ error }}
      </div>

      <div v-if="loading" class="text-gray-400 text-center py-12">Loading...</div>

      <PostEditor
        v-else-if="currentPost"
        v-model="content"
        v-model:title="title"
        v-model:language="language"
        v-model:visibility="visibility"
        v-model:content-type="contentType"
        v-model:tags="tags"
        :save-status="saveStatus"
        :last-saved-at="lastSavedAt"
        @publish="handlePublish"
      />

      <div v-else class="text-gray-400 text-center py-12">
        Failed to load post.
        <router-link to="/" class="text-primary hover:underline ml-1"> Go back </router-link>
      </div>
    </div>
  </div>
</template>
