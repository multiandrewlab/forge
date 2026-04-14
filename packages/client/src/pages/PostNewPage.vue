<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import PostEditor from '@/components/editor/PostEditor.vue';
import { usePosts } from '@/composables/usePosts';
import { detectLanguage } from '@/lib/detectLanguage';
import type { ContentType, Visibility } from '@forge/shared';
import type { SaveStatus } from '@/stores/posts';

const router = useRouter();
const route = useRoute();
const { createPost, saveRevision, error } = usePosts();

const title = ref('');
const content = ref('');
const language = ref('');
const manualLanguage = ref(false);
const visibility = ref<Visibility>('public');
const contentType = ref<ContentType>('snippet');
const tags = ref<string[]>([]);
const saveStatus = ref<SaveStatus>('saved');

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
  });
  if (id) {
    if (content.value) {
      await saveRevision(id, content.value, null);
    }
    router.push({ name: 'post-edit', params: { id } });
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
      />
    </div>
  </div>
</template>
