<script setup lang="ts">
/* global File */
import { ref, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import PostEditor from '@/components/editor/PostEditor.vue';
import { usePosts } from '@/composables/usePosts';
import { useFilesStore } from '@/stores/files';
import { detectLanguage } from '@/lib/detectLanguage';
import type { ContentType, Visibility } from '@forge/shared';
import type { SaveStatus } from '@/stores/posts';

const router = useRouter();
const route = useRoute();
const { createPost, saveRevision, publishPost, error } = usePosts();
const filesStore = useFilesStore();

const title = ref('');
const content = ref('');
const language = ref('');
const manualLanguage = ref(false);
const visibility = ref<Visibility>('public');
const contentType = ref<ContentType>('snippet');
const tags = ref<string[]>([]);
const saveStatus = ref<SaveStatus>('saved');
// Files picked before the post exists. PostEditor emits `local-file-staged`
// for each pre-create pick; we collect them here and flush to the server in
// handleSaveDraft / handlePublish once we have a postId.
const localStagedFiles = ref<File[]>([]);

function onLocalFileStaged(file: File): void {
  localStagedFiles.value.push(file);
}

/**
 * Upload accumulated local files to the newly-created post and return their
 * IDs as an ordered list — suitable for passing to saveRevision via
 * stagedFileIds so they get committed to the initial revision rather than
 * orphaned in staging.
 */
async function flushLocalFiles(postId: string): Promise<string[]> {
  const localFiles = localStagedFiles.value;
  localStagedFiles.value = [];
  if (localFiles.length === 0) return [];
  const ids: string[] = [];
  for (const file of localFiles) {
    const uploaded = await filesStore.uploadFile(postId, file);
    if (uploaded) ids.push(uploaded.id);
  }
  return ids;
}

// Pre-fill from AI Action query params
if (typeof route.query.description === 'string' && route.query.description) {
  title.value = route.query.description;
}
if (typeof route.query.contentType === 'string' && route.query.contentType) {
  contentType.value = route.query.contentType as ContentType;
}
if (typeof route.query.language === 'string' && route.query.language) {
  language.value = route.query.language;
  manualLanguage.value = true;
}

// Auto-detect language from content when not manually set
watch(content, (newContent) => {
  if (manualLanguage.value) return;
  const detected = detectLanguage(newContent);
  if (detected) language.value = detected;
});

function onLanguageChange(lang: string): void {
  language.value = lang;
  manualLanguage.value = lang !== '';
}

async function handlePublish(): Promise<void> {
  const id = await createPost({
    title: title.value || 'Untitled',
    contentType: contentType.value,
    language: language.value || null,
    visibility: visibility.value,
    // Server requires `content` for non-link posts at create time. The follow-up
    // saveRevision is what stores the editable revision history; createPost
    // creates the initial revision atomically.
    content: content.value || undefined,
  });
  if (id) {
    // Upload locally-staged files first so we can commit them to the next
    // revision; otherwise they remain orphaned in staging.
    const stagedFileIds = await flushLocalFiles(id);
    if (content.value || stagedFileIds.length > 0) {
      // Pass stagedFileIds only when non-empty — keeps the no-file path
      // signature-compatible with existing call sites and unit tests.
      if (stagedFileIds.length > 0) {
        await saveRevision(id, content.value, null, stagedFileIds);
      } else {
        await saveRevision(id, content.value, null);
      }
    }
    // The new-post create path persists the post as a draft (server default);
    // honour the user's "Publish" intent by flipping the draft flag before
    // routing to the read-only view (where the published-badge surfaces).
    await publishPost(id);
    router.push({ name: 'post-view', params: { id } });
  }
}

async function handleSaveDraft(): Promise<void> {
  // createPost defaults isDraft=true server-side, so this lands the user on
  // the read-only view of their fresh draft. The journey smoke uses this to
  // assert the draft badge renders before transitioning to publish.
  const id = await createPost({
    title: title.value || 'Untitled',
    contentType: contentType.value,
    language: language.value || null,
    visibility: visibility.value,
    content: content.value || undefined,
  });
  if (id) {
    const stagedFileIds = await flushLocalFiles(id);
    if (content.value || stagedFileIds.length > 0) {
      if (stagedFileIds.length > 0) {
        await saveRevision(id, content.value, null, stagedFileIds);
      } else {
        await saveRevision(id, content.value, null);
      }
    }
    router.push({ name: 'post-view', params: { id } });
  }
}
</script>

<template>
  <div data-testid="post-new-page" class="min-h-screen bg-surface p-4">
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

      <PostEditor
        v-model="content"
        v-model:title="title"
        v-model:visibility="visibility"
        v-model:content-type="contentType"
        v-model:tags="tags"
        :language="language"
        :save-status="saveStatus"
        :last-saved-at="null"
        @update:language="onLanguageChange"
        @publish="handlePublish"
        @save-draft="handleSaveDraft"
        @local-file-staged="onLocalFileStaged"
      />
    </div>
  </div>
</template>
