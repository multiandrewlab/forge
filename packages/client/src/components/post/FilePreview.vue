<template>
  <div class="h-full overflow-auto">
    <!-- Loading state -->
    <div
      v-if="loading"
      class="flex h-full items-center justify-center"
    >
      <p class="text-sm text-gray-500">Loading...</p>
    </div>

    <!-- Error state -->
    <div
      v-else-if="error"
      class="flex h-full items-center justify-center"
    >
      <p class="text-sm text-red-400">Failed to load file</p>
    </div>

    <!-- Image preview -->
    <div
      v-else-if="isImage"
      class="flex items-center justify-center p-4"
    >
      <img
        :src="imageUrl"
        :alt="file.filename"
        class="max-w-full rounded"
      >
    </div>

    <!-- Syntax-highlighted code (including JSON, YAML) -->
    <div
      v-else-if="highlightedHtml"
      class="rounded text-sm"
      v-html="highlightedHtml"
    />

    <!-- Markdown rendered -->
    <div
      v-else-if="renderedMarkdown"
      class="prose prose-invert max-w-none p-4"
      v-html="renderedMarkdown"
    />

    <!-- Plain text fallback -->
    <pre
      v-else
      class="whitespace-pre-wrap p-4 font-mono text-sm text-gray-300"
    >{{ content }}</pre>
  </div>
</template>

<script setup lang="ts">
/* global URL */
import { ref, watch, onUnmounted } from 'vue';
import { apiFetch } from '../../lib/api.js';
import { codeToHtml } from 'shiki';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import type { PostFile } from '@forge/shared';

const props = defineProps<{
  file: PostFile;
  postId: string;
}>();

const loading = ref(true);
const error = ref(false);
const content = ref('');
const highlightedHtml = ref('');
const renderedMarkdown = ref('');
const imageUrl = ref('');
const isImage = ref(false);

const CODE_EXTENSIONS: Record<string, string> = {
  ts: 'typescript',
  js: 'javascript',
  py: 'python',
  go: 'go',
  rs: 'rust',
  java: 'java',
  cpp: 'cpp',
  c: 'c',
  rb: 'ruby',
  php: 'php',
  html: 'html',
  css: 'css',
  sql: 'sql',
  sh: 'bash',
  bash: 'bash',
  yml: 'yaml',
  yaml: 'yaml',
};

function getExtension(filename: string): string {
  const parts = filename.split('.');
  if (parts.length < 2) return '';
  return parts[parts.length - 1].toLowerCase();
}

async function highlightCode(code: string, lang: string): Promise<string> {
  try {
    return await codeToHtml(code, { lang, theme: 'one-dark-pro' });
  } catch {
    return await codeToHtml(code, { lang: 'text', theme: 'one-dark-pro' });
  }
}

async function fetchAndRender(): Promise<void> {
  loading.value = true;
  error.value = false;
  content.value = '';
  highlightedHtml.value = '';
  renderedMarkdown.value = '';

  // Clean up previous image URL
  if (imageUrl.value) {
    URL.revokeObjectURL(imageUrl.value);
    imageUrl.value = '';
  }
  isImage.value = false;

  try {
    const response = await apiFetch(`/api/posts/${props.postId}/files/${props.file.id}`);

    if (!response.ok) {
      error.value = true;
      loading.value = false;
      return;
    }

    const mimeType = props.file.mimeType ?? '';
    const ext = getExtension(props.file.filename);

    // Image files
    if (mimeType.startsWith('image/')) {
      const blob = await response.blob();
      imageUrl.value = URL.createObjectURL(blob);
      isImage.value = true;
      loading.value = false;
      console.info('[analytics] file.view', { postId: props.postId, fileId: props.file.id, mimeType: props.file.mimeType });
      return;
    }

    const text = await response.text();
    content.value = text;
    console.info('[analytics] file.view', { postId: props.postId, fileId: props.file.id, mimeType: props.file.mimeType });

    // JSON files
    if (ext === 'json') {
      try {
        const parsed = JSON.parse(text);
        const formatted = JSON.stringify(parsed, null, 2);
        highlightedHtml.value = await highlightCode(formatted, 'json');
      } catch {
        // Invalid JSON: render as plain text (content.value is already set)
      }
      loading.value = false;
      return;
    }

    // Markdown files
    if (ext === 'md') {
      const rawHtml = marked.parse(text) as string;
      renderedMarkdown.value = DOMPurify.sanitize(rawHtml);
      loading.value = false;
      return;
    }

    // Code files (by extension)
    const lang = CODE_EXTENSIONS[ext];
    if (lang) {
      highlightedHtml.value = await highlightCode(text, lang);
      loading.value = false;
      return;
    }

    // Plain text fallback (content.value is already set)
    loading.value = false;
  } catch {
    error.value = true;
    loading.value = false;
  }
}

watch(
  () => props.file.id,
  () => {
    void fetchAndRender();
  },
  { immediate: true },
);

onUnmounted(() => {
  if (imageUrl.value) {
    URL.revokeObjectURL(imageUrl.value);
  }
});
</script>
