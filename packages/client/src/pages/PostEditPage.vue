<script setup lang="ts">
/* global setTimeout, clearTimeout */
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PostEditor from '@/components/editor/PostEditor.vue';
import VideoEditor from '@/components/editor/VideoEditor.vue';
import { useAuth } from '@/composables/useAuth';
import { usePosts } from '@/composables/usePosts';
import { usePostsStore } from '@/stores/posts';
import { storeToRefs } from 'pinia';
import type { ContentType, Visibility } from '@forge/shared';

const route = useRoute();
const router = useRouter();
const { fetchPost, saveRevision, updatePost, publishPost, error, errorStatus } = usePosts();
const store = usePostsStore();
const { currentPost, saveStatus, lastSavedAt } = storeToRefs(store);
const { user } = useAuth();

const title = ref('');
const content = ref('');
const language = ref('');
const visibility = ref<Visibility>('public');
const contentType = ref<ContentType>('snippet');
const tags = ref<string[]>([]);
const loading = ref(true);
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

// Snapshot of post metadata captured on mount, used to revert when the user
// clicks Cancel. Auto-save fires synchronously on title/visibility/language/
// contentType changes, so a Cancel that merely navigates away would still
// leave the in-flight edits committed server-side. Capturing the snapshot
// here lets handleCancel() PATCH the post back to its original state before
// navigating, restoring the "discard in-flight changes" semantics.
const originalTitle = ref('');
const originalLanguage = ref('');
const originalVisibility = ref<Visibility>('public');
const originalContentType = ref<ContentType>('snippet');

onMounted(async () => {
  const id = route.params.id as string;
  await fetchPost(id);
  if (currentPost.value) {
    title.value = currentPost.value.title;
    content.value = currentPost.value.revisions[0]?.content ?? '';
    language.value = currentPost.value.language ?? '';
    visibility.value = currentPost.value.visibility;
    contentType.value = currentPost.value.contentType;
    originalTitle.value = currentPost.value.title;
    originalLanguage.value = currentPost.value.language ?? '';
    originalVisibility.value = currentPost.value.visibility;
    originalContentType.value = currentPost.value.contentType;
  }
  loading.value = false;
});

onBeforeUnmount(() => {
  if (debounceTimer) clearTimeout(debounceTimer);
  store.clearPost();
});

// Auto-save: debounce 2s after content changes. The timer ref is cleared
// when the timeout fires so subsequent flush points (handleSaveDraft,
// handleSaveRevision, handlePublish) correctly observe "no pending work" via
// `if (debounceTimer)` guards instead of seeing a stale timeout id.
watch(content, (newContent) => {
  if (loading.value) return;
  store.setDirty(true);
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    const id = route.params.id as string;
    debounceTimer = null;
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

// Save Draft on the edit page: flush any pending content debounce timer so
// the in-flight body change lands as a new revision immediately. The metadata
// watcher already auto-saves title/visibility/language/contentType changes
// synchronously, so this handler only needs to deal with the body timer.
async function handleSaveDraft(): Promise<void> {
  const id = route.params.id as string;
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
    await saveRevision(id, content.value, null);
    return;
  }
  // No pending body change; still create a manual snapshot to honor the
  // user's explicit "Save Draft" intent. This mirrors the manual revision
  // path used by save-revision-btn but without a custom message.
  await saveRevision(id, content.value, null);
}

// Manual revision via save-revision-btn: POSTs the current body as a new
// revision with an explicit message. Unlike auto-save (debounced) and
// handleSaveDraft (untagged flush), this path always sends a message so the
// timeline distinguishes manual snapshots from automatic ones.
async function handleSaveRevision(): Promise<void> {
  const id = route.params.id as string;
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  await saveRevision(id, content.value, 'Manual revision');
}

// Cancel: discard in-flight changes and return to the view page.
//
// Title / visibility / language / contentType auto-save synchronously via the
// metadata watcher above, so by the time Cancel fires those changes already
// landed server-side. We undo them by PATCHing the post back to the snapshot
// captured on mount. Pending content debounce timers are cleared (no flush).
async function handleCancel(): Promise<void> {
  const id = route.params.id as string;
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  await updatePost(id, {
    title: originalTitle.value,
    visibility: originalVisibility.value,
    language: originalLanguage.value || null,
    contentType: originalContentType.value,
  });
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
        v-if="currentPost?.forkedFromId"
        data-testid="fork-attribution"
        class="mb-4 text-xs text-gray-500"
      >
        Forked from
        <router-link
          :to="{ name: 'post-view', params: { id: currentPost.forkedFromId } }"
          class="text-primary hover:underline"
        >
          source post
        </router-link>
      </div>

      <div
        v-if="error"
        :data-testid="errorStatus === 403 ? 'forbidden-page' : undefined"
        class="mb-4 p-3 bg-red-900/30 border border-red-500 rounded text-red-400 text-sm"
      >
        {{ error }}
      </div>

      <div v-if="loading" class="text-gray-400 text-center py-12">Loading...</div>

      <!--
        Video posts (#102 WU8b) route to VideoEditor; it composes the badge,
        player, AI-suggestion form, and recovery CTAs internally. The Publish
        button stays in the page chrome (out of scope of VideoEditor) and
        will be gated on post.video.status === 'ready' once WU5's GET shape
        is wired here. For now, mount VideoEditor for the author's edit view.
      -->
      <VideoEditor
        v-else-if="currentPost && currentPost.contentType === 'video'"
        :post-id="currentPost.id"
        :is-author="user?.id === currentPost.authorId"
      />

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
        :post-id="currentPost.id"
        @publish="handlePublish"
        @save-draft="handleSaveDraft"
        @save-revision="handleSaveRevision"
        @cancel="handleCancel"
      />

      <div v-else class="text-gray-400 text-center py-12">
        Failed to load post.
        <router-link to="/" class="text-primary hover:underline ml-1"> Go back </router-link>
      </div>
    </div>
  </div>
</template>
