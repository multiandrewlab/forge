<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { ContentType, Visibility, AiCompleteRequest } from '@forge/shared';
import type { EditorView } from '@codemirror/view';
import type { SaveStatus } from '@/stores/posts';
import CodeEditor from '@/components/editor/CodeEditor.vue';
import EditorToolbar from '@/components/editor/EditorToolbar.vue';
import DraftStatus from '@/components/editor/DraftStatus.vue';
import AiSuggestion from '@/components/editor/AiSuggestion.vue';

const props = defineProps<{
  modelValue: string;
  title: string;
  language: string;
  visibility: Visibility;
  contentType: ContentType;
  tags: string[];
  saveStatus: SaveStatus;
  lastSavedAt: Date | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
  'update:title': [value: string];
  'update:language': [value: string];
  'update:visibility': [value: Visibility];
  'update:contentType': [value: ContentType];
  'update:tags': [value: string[]];
  publish: [];
}>();

const editorRef = ref<{ view: EditorView | null } | null>(null);
const editorView = computed(() => editorRef.value?.view ?? null);
const aiRef = ref<{ requestCompletion: (input: AiCompleteRequest) => void } | null>(null);

watch([() => props.modelValue, () => props.language, editorView], () => {
  const view = editorView.value;
  if (!view || !aiRef.value) return;
  const doc = view.state.doc.toString();
  const cursor = view.state.selection.main.head;
  aiRef.value.requestCompletion({
    before: doc.slice(0, cursor),
    after: doc.slice(cursor),
    language: props.language ?? 'plaintext',
  });
});

/* global Event */
function onTitleInput(event: Event): void {
  const target = event.target as unknown as { value: string };
  emit('update:title', target.value);
}
</script>

<template>
  <div class="flex h-full flex-col rounded-lg border border-surface-500 bg-surface">
    <div class="flex items-center gap-3 border-b border-surface-500 px-4 py-3">
      <input
        data-testid="title-input"
        :value="title"
        type="text"
        placeholder="Snippet title..."
        class="flex-1 bg-transparent text-lg text-gray-100 placeholder-gray-500 outline-none"
        @input="onTitleInput"
      />
      <DraftStatus :status="saveStatus" :last-saved-at="lastSavedAt" />
      <button
        data-testid="publish-button"
        class="rounded bg-primary px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-600"
        @click="emit('publish')"
      >
        Publish Snippet
      </button>
    </div>

    <div class="border-b border-surface-500 px-4 py-2">
      <EditorToolbar
        :language="language"
        :visibility="visibility"
        :content-type="contentType"
        :tags="tags"
        @update:language="(val) => emit('update:language', val)"
        @update:visibility="(val) => emit('update:visibility', val)"
        @update:content-type="(val) => emit('update:contentType', val)"
        @update:tags="(val) => emit('update:tags', val)"
      />
    </div>

    <div class="flex-1">
      <CodeEditor
        ref="editorRef"
        :model-value="modelValue"
        :language="language"
        @update:model-value="(val) => emit('update:modelValue', val)"
      />
      <AiSuggestion v-if="editorView" ref="aiRef" :editor-view="editorView as EditorView" />
    </div>
  </div>
</template>
