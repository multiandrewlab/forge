<script setup lang="ts">
/* global setTimeout, clearTimeout */
import { ref, watch, computed } from 'vue';
import { ContentType, Visibility } from '@forge/shared';
import type { Tag } from '@forge/shared';
import { useTags } from '@/composables/useTags.js';

const props = defineProps<{
  language: string;
  visibility: Visibility;
  contentType: ContentType;
  tags: string[];
}>();

const emit = defineEmits<{
  'update:language': [value: string];
  'update:visibility': [value: Visibility];
  'update:contentType': [value: ContentType];
  'update:tags': [value: string[]];
}>();

const { searchTags } = useTags();

const languages = [
  'javascript',
  'typescript',
  'python',
  'html',
  'css',
  'json',
  'markdown',
  'sql',
  'xml',
  'java',
  'cpp',
  'c',
  'rust',
  'php',
];

const contentTypes: { label: string; value: ContentType }[] = [
  { label: 'Snippet', value: ContentType.Snippet },
  { label: 'Prompt', value: ContentType.Prompt },
  { label: 'Document', value: ContentType.Document },
  { label: 'Link', value: ContentType.Link },
];

const tagInput = ref('');
const rawSuggestions = ref<Tag[]>([]);
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

const suggestions = computed(() =>
  rawSuggestions.value.filter((tag) => !props.tags.includes(tag.name)),
);

watch(tagInput, (value) => {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    rawSuggestions.value = [];
    return;
  }

  debounceTimer = setTimeout(() => {
    searchTags(trimmed, 10)
      .then((results) => {
        rawSuggestions.value = results;
      })
      .catch(() => {
        rawSuggestions.value = [];
      });
  }, 200);
});

/* global Event */
function onLanguageChange(event: Event): void {
  const target = event.target as unknown as { value: string };
  emit('update:language', target.value);
}

function onContentTypeChange(event: Event): void {
  const target = event.target as unknown as { value: string };
  emit('update:contentType', target.value as ContentType);
}

function toggleVisibility(): void {
  emit(
    'update:visibility',
    props.visibility === Visibility.Public ? Visibility.Private : Visibility.Public,
  );
}

function addTag(): void {
  const tag = tagInput.value.trim();
  if (!tag || props.tags.includes(tag)) {
    tagInput.value = '';
    rawSuggestions.value = [];
    return;
  }
  emit('update:tags', [...props.tags, tag]);
  tagInput.value = '';
  rawSuggestions.value = [];
}

function selectSuggestion(tag: Tag): void {
  if (props.tags.includes(tag.name)) return;
  emit('update:tags', [...props.tags, tag.name]);
  tagInput.value = '';
  rawSuggestions.value = [];
}

function removeTag(index: number): void {
  const updated = props.tags.filter((_, i) => i !== index);
  emit('update:tags', updated);
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-3">
    <select
      data-testid="language-select"
      :value="language"
      class="rounded border border-surface-500 bg-surface-700 px-2 py-1 text-sm text-gray-300"
      @change="onLanguageChange"
    >
      <option v-for="lang in languages" :key="lang" :value="lang">
        {{ lang }}
      </option>
    </select>

    <select
      data-testid="content-type-select"
      :value="contentType"
      class="rounded border border-surface-500 bg-surface-700 px-2 py-1 text-sm text-gray-300"
      @change="onContentTypeChange"
    >
      <option v-for="ct in contentTypes" :key="ct.value" :value="ct.value">
        {{ ct.label }}
      </option>
    </select>

    <button
      data-testid="visibility-toggle"
      :class="[
        'rounded border px-2 py-1 text-sm',
        visibility === 'public'
          ? 'border-green-500 text-green-400'
          : 'border-yellow-500 text-yellow-400',
      ]"
      @click="toggleVisibility"
    >
      {{ visibility === 'public' ? 'Public' : 'Private' }}
    </button>

    <div class="flex flex-wrap items-center gap-1">
      <span
        v-for="(tag, index) in tags"
        :key="tag"
        data-testid="tag-item"
        class="flex items-center gap-1 rounded bg-surface-700 px-2 py-0.5 text-xs text-gray-300"
      >
        {{ tag }}
        <button
          data-testid="tag-remove"
          class="text-gray-500 hover:text-red-400"
          @click="removeTag(index)"
        >
          x
        </button>
      </span>
      <div v-if="tags.length < 10" class="relative">
        <input
          v-model="tagInput"
          data-testid="tag-input"
          type="text"
          placeholder="Add tag..."
          class="rounded border border-surface-500 bg-surface-700 px-2 py-0.5 text-xs text-gray-300 placeholder-gray-500"
          @keydown.enter.prevent="addTag"
        />
        <div
          v-if="suggestions.length > 0"
          data-testid="tag-suggestions"
          class="absolute top-full left-0 z-10 mt-1 w-48 rounded border border-surface-500 bg-surface-700 py-1 shadow-lg"
        >
          <button
            v-for="suggestion in suggestions"
            :key="suggestion.id"
            data-testid="tag-suggestion-item"
            class="flex w-full items-center justify-between px-3 py-1 text-xs text-gray-300 hover:bg-surface-600"
            @click="selectSuggestion(suggestion)"
          >
            <span>{{ suggestion.name }}</span>
            <span class="text-gray-500">{{ suggestion.postCount }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
