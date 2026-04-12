<script setup lang="ts">
import { ref } from 'vue';
import { ContentType, Visibility } from '@forge/shared';

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

function onLanguageChange(event: { target: { value: string } }): void {
  emit('update:language', event.target.value);
}

function onContentTypeChange(event: { target: { value: string } }): void {
  emit('update:contentType', event.target.value as ContentType);
}

function toggleVisibility(): void {
  emit(
    'update:visibility',
    props.visibility === Visibility.Public ? Visibility.Private : Visibility.Public,
  );
}

function addTag(): void {
  const tag = tagInput.value.trim();
  if (!tag || props.tags.includes(tag)) return;
  emit('update:tags', [...props.tags, tag]);
  tagInput.value = '';
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
      <input
        v-if="tags.length < 10"
        v-model="tagInput"
        data-testid="tag-input"
        type="text"
        placeholder="Add tag..."
        class="rounded border border-surface-500 bg-surface-700 px-2 py-0.5 text-xs text-gray-300 placeholder-gray-500"
        @keydown.enter.prevent="addTag"
      />
    </div>
  </div>
</template>
