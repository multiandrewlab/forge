<template>
  <!-- With link preview data -->
  <div v-if="linkPreview">
    <a
      :href="linkUrl"
      target="_blank"
      rel="noopener noreferrer"
      class="flex overflow-hidden rounded-lg border border-gray-700 transition-colors hover:border-gray-500"
    >
      <!-- Thumbnail -->
      <div class="flex h-24 w-30 shrink-0 items-center justify-center bg-gray-800">
        <!-- eslint-disable-next-line vue/html-self-closing -->
        <img
          v-if="linkPreview.image && !imageError"
          :src="linkPreview.image"
          :alt="linkPreview.title"
          loading="lazy"
          class="h-full w-full object-cover"
          @error="imageError = true"
        />
        <div
          v-else
          data-testid="image-placeholder"
          class="h-full w-full bg-gradient-to-br from-gray-700 to-gray-800"
        />
      </div>

      <!-- Content -->
      <div class="flex min-w-0 flex-1 flex-col justify-center px-3 py-2">
        <p class="truncate text-sm font-semibold text-gray-100">
          {{ linkPreview.title }}
        </p>
        <p class="line-clamp-2 text-xs text-gray-400">
          {{ linkPreview.description }}
        </p>
        <p class="mt-1 text-xs text-gray-500">
          <span v-if="linkPreview.readingTime"
            >{{ linkPreview.readingTime }} min read &middot;
          </span>
          {{ domain }}
        </p>
      </div>
    </a>

    <!-- Refresh button (author only) -->
    <button
      v-if="isAuthor"
      data-testid="refresh-preview"
      class="mt-1 text-xs text-gray-500 hover:text-gray-300"
      @click="$emit('refresh')"
    >
      <svg class="mr-1 inline-block h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
        />
      </svg>
      Refresh preview
    </button>
  </div>

  <!-- Fallback: no link preview -->
  <div v-else class="flex items-center gap-2 rounded-lg border border-gray-700 px-3 py-2">
    <svg
      class="h-4 w-4 shrink-0 text-gray-500"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
      />
    </svg>
    <a
      :href="linkUrl"
      target="_blank"
      rel="noopener noreferrer"
      class="truncate text-sm text-primary hover:underline"
    >
      {{ linkUrl }}
    </a>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import type { LinkPreview } from '@forge/shared';

const props = defineProps<{
  linkUrl: string;
  linkPreview: LinkPreview | null;
  isAuthor: boolean;
}>();

defineEmits<{ refresh: [] }>();

const imageError = ref(false);

const domain = computed(() => {
  try {
    return new globalThis.URL(props.linkUrl).hostname;
  } catch {
    return props.linkUrl;
  }
});
</script>
