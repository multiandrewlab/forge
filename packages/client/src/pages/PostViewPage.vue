<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import CodeViewer from '@/components/post/CodeViewer.vue';
import { usePosts } from '@/composables/usePosts';
import { storeToRefs } from 'pinia';
import { usePostsStore } from '@/stores/posts';
import { useAuth } from '@/composables/useAuth';

const route = useRoute();
const router = useRouter();
const { fetchPost, deletePost, error } = usePosts();
const store = usePostsStore();
const { currentPost } = storeToRefs(store);
const { user } = useAuth();
const loading = ref(true);
const isAuthor = ref(false);

const latestRevision = computed(() => {
  if (!currentPost.value) return undefined;
  return currentPost.value.revisions[0];
});

onMounted(async () => {
  const id = route.params.id as string;
  await fetchPost(id);
  if (currentPost.value && user.value) {
    isAuthor.value = currentPost.value.authorId === user.value.id;
  }
  loading.value = false;
});

async function handleDelete(): Promise<void> {
  const id = route.params.id as string;
  await deletePost(id);
  if (!error.value) {
    router.push('/');
  }
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

      <template v-else-if="currentPost">
        <div class="flex items-start justify-between mb-4">
          <div>
            <h1 class="text-2xl font-bold text-white">{{ currentPost.title }}</h1>
            <div class="flex items-center gap-2 mt-1 text-sm text-gray-400">
              <span>{{ currentPost.contentType }}</span>
              <span v-if="currentPost.language">{{ currentPost.language }}</span>
              <span v-if="latestRevision">Rev {{ latestRevision.revisionNumber }}</span>
            </div>
          </div>

          <div v-if="isAuthor" class="flex gap-2">
            <router-link
              :to="{ name: 'post-edit', params: { id: currentPost.id } }"
              class="text-sm px-3 py-1 rounded border border-surface-500 text-gray-300 hover:text-white"
            >
              Edit
            </router-link>
            <button
              class="text-sm px-3 py-1 rounded border border-red-500 text-red-400 hover:bg-red-900/30"
              @click="handleDelete"
            >
              Delete
            </button>
          </div>
        </div>

        <CodeViewer
          v-if="latestRevision"
          :code="latestRevision.content"
          :language="currentPost.language ?? undefined"
        />
      </template>

      <div v-else class="text-gray-400 text-center py-12">Post not found</div>
    </div>
  </div>
</template>
