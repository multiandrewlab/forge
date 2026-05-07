<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import CodeViewer from '@/components/post/CodeViewer.vue';
import PresenceIndicator from '@/components/post/PresenceIndicator.vue';
import PostActions from '@/components/post/PostActions.vue';
import CommentSection from '@/components/post/CommentSection.vue';
import Breadcrumbs from '@/components/feedback/Breadcrumbs.vue';
import { usePosts } from '@/composables/usePosts';
import { useComments } from '@/composables/useComments';
import { useVotes } from '@/composables/useVotes';
import { storeToRefs } from 'pinia';
import { usePostsStore } from '@/stores/posts';
import { useFilesStore } from '@/stores/files';
import { useAuth } from '@/composables/useAuth';
import type { PostFile, PostWithRevision } from '@forge/shared';

const route = useRoute();
const router = useRouter();
const { fetchPost, deletePost, forkPost, error, errorStatus } = usePosts();
const store = usePostsStore();
const filesStore = useFilesStore();
const { currentPost } = storeToRefs(store);
const { user } = useAuth();
const loading = ref(true);
const isAuthor = ref(false);
// Files attached to the latest revision. Rendered as a small `post-file-list`
// surface so multi-file posts (uploaded through the new/edit flow) show their
// attachments on the read-only view. Empty for single-file posts — the testid
// is only emitted when files exist so existing single-file specs aren't
// affected by an incidental empty container.
const revisionFiles = ref<PostFile[]>([]);

const cleanupFns: Array<() => void> = [];

// Delete-confirm dialog (Task 4 of issue #47). The plain Delete button
// previously triggered an irreversible DELETE on click; the dialog gates the
// action behind an explicit confirmation step.
const showDeleteDialog = ref(false);

const latestRevision = computed(() => {
  if (!currentPost.value) return undefined;
  return currentPost.value.revisions[0];
});

// Adapter: PostActions expects PostWithAuthor, but the post-view store carries
// PostWithRevision. Both extend Post, so we synthesise the missing
// author/tags/forkCount fields from the revision metadata. PostActions only
// reads id / voteCount / authorId from this prop.
//
// We always return a non-null object — when currentPost is null, callers in
// the template are already guarded by `v-if="currentPost"`, so PostActions is
// not rendered. Returning a stable shape keeps the branch count down and
// avoids a second `v-if` on the consumer side.
function buildPostForActions(p: PostWithRevision) {
  const rev = p.revisions[0];
  return {
    ...p,
    author: {
      id: p.authorId,
      displayName: rev?.authorDisplayName ?? '',
      avatarUrl: rev?.authorAvatarUrl ?? null,
    },
    tags: [],
    forkCount: 0,
    forkedFromTitle: null,
  };
}

onMounted(async () => {
  const id = route.params.id as string;
  await fetchPost(id);
  if (currentPost.value && user.value) {
    isAuthor.value = currentPost.value.authorId === user.value.id;
  }
  // Eagerly load comments so the thread renders without a separate user click.
  await useComments().fetchComments(id);
  // Fetch files attached to the latest revision. Skipped silently when there
  // is no revision (e.g., 404 path) — `revisionFiles` stays empty and the
  // post-file-list block is not rendered.
  const rev = currentPost.value?.revisions?.[0];
  if (rev) {
    await filesStore.fetchFiles(id, rev.id);
    revisionFiles.value = filesStore.filesByRevision[rev.id] ?? [];
  }
  loading.value = false;

  // Subscribe to real-time comment and vote events for this post
  cleanupFns.push(useComments().subscribeRealtime(id));
  cleanupFns.push(useVotes().subscribeRealtime(id));
});

onUnmounted(() => {
  for (const cleanup of cleanupFns) {
    cleanup();
  }
});

async function confirmDelete(): Promise<void> {
  showDeleteDialog.value = false;
  const id = route.params.id as string;
  await deletePost(id);
  if (!error.value) {
    router.push('/');
  }
}

// Wire the Fork action emitted by PostActions. The composable POSTs to
// /api/posts/:id/fork and returns the new post id; we then redirect to the
// edit page so the viewer can immediately work on their copy.
async function handleFork(): Promise<void> {
  if (!currentPost.value) return;
  const newPostId = await forkPost(currentPost.value.id);
  if (newPostId) {
    router.push(`/posts/${newPostId}/edit`);
  }
}
</script>

<template>
  <div class="min-h-screen bg-surface p-4">
    <div class="max-w-5xl mx-auto">
      <router-link to="/" class="text-gray-400 hover:text-white text-sm mb-4 inline-block">
        &larr; Back to Workspace
      </router-link>

      <!-- WU8 of issue #62: dedicated forbidden surface for private/unshared
           posts. The server now returns 403 with a descriptive message; we
           branch on `errorStatus === 403` so the user sees "This post is
           private" instead of the generic red error banner that previously
           rendered for every non-OK response. -->
      <div
        v-if="errorStatus === 403"
        data-testid="forbidden-page"
        class="mb-4 p-4 bg-surface-700 border border-surface-500 rounded text-center"
      >
        <h2 class="text-xl font-semibold text-white">This post is private</h2>
        <p class="mt-2 text-sm text-gray-400">
          {{ error || 'The owner has not shared it with you.' }}
        </p>
      </div>

      <div
        v-else-if="error"
        class="mb-4 p-3 bg-red-900/30 border border-red-500 rounded text-red-400 text-sm"
      >
        {{ error }}
      </div>

      <div v-if="loading" class="text-gray-400 text-center py-12">Loading...</div>

      <template v-else-if="currentPost">
        <Breadcrumbs
          :items="[
            { label: 'Home', to: '/' },
            { label: currentPost.title, to: null },
          ]"
        />
        <div class="flex items-start justify-between mb-4">
          <div>
            <div class="flex items-center gap-3">
              <h1 data-testid="post-title" class="text-2xl font-bold text-white">
                {{ currentPost.title }}
              </h1>
              <span
                v-if="currentPost.isDraft"
                data-testid="draft-badge"
                class="rounded bg-yellow-600/20 px-2 py-1 text-xs text-yellow-400"
              >
                Draft
              </span>
              <span
                v-else
                data-testid="published-badge"
                class="rounded bg-green-600/20 px-2 py-1 text-xs text-green-400"
              >
                Published
              </span>
              <PresenceIndicator :post-id="currentPost.id" />
            </div>
            <div class="flex items-center gap-2 mt-1 text-sm text-gray-400">
              <span>{{ currentPost.contentType }}</span>
              <span v-if="currentPost.language">{{ currentPost.language }}</span>
              <span v-if="latestRevision">Rev {{ latestRevision.revisionNumber }}</span>
            </div>
            <div v-if="(currentPost.tags ?? []).length > 0" class="mt-2 flex flex-wrap gap-1">
              <RouterLink
                v-for="tag in currentPost.tags"
                :key="tag"
                :to="{ name: 'tag-view', params: { name: tag } }"
                :data-testid="`post-tag-chip-${tag}`"
                class="rounded bg-gray-700 px-2 py-0.5 text-xs text-gray-300 hover:bg-gray-600"
              >
                #{{ tag }}
              </RouterLink>
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
              data-testid="post-delete-btn"
              class="text-sm px-3 py-1 rounded border border-red-500 text-red-400 hover:bg-red-900/30"
              @click="showDeleteDialog = true"
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

        <ul
          v-if="revisionFiles.length > 0"
          data-testid="post-file-list"
          class="mt-3 flex flex-wrap gap-2"
        >
          <li
            v-for="file in revisionFiles"
            :key="file.id"
            class="rounded border border-surface-500 bg-surface-700 px-2 py-1 text-xs text-gray-300"
          >
            {{ file.filename }}
          </li>
        </ul>

        <PostActions class="mt-4" :post="buildPostForActions(currentPost)" @fork="handleFork" />

        <div class="mt-6">
          <CommentSection :post-id="currentPost.id" :current-user-id="user?.id" />
        </div>
      </template>

      <div v-else class="text-gray-400 text-center py-12">Post not found</div>

      <div
        v-if="showDeleteDialog"
        data-testid="post-delete-dialog"
        class="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      >
        <div class="bg-surface border border-gray-700 rounded p-6 max-w-md">
          <h2 class="text-lg font-semibold text-white mb-2">Delete this post?</h2>
          <p class="text-sm text-gray-400 mb-4">This action cannot be undone.</p>
          <div class="flex justify-end gap-2">
            <button
              data-testid="post-delete-cancel"
              class="px-3 py-1 rounded border border-gray-600 text-gray-300"
              @click="showDeleteDialog = false"
            >
              Cancel
            </button>
            <button
              data-testid="post-delete-confirm"
              class="px-3 py-1 rounded bg-red-600 text-white"
              @click="confirmDelete"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
